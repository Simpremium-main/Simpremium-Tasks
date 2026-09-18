import type { DispatchStatus } from "./types";

export interface TranscribeResult {
  status: DispatchStatus;
  transcript?: string;
  error?: string;
}

export type Platform = "youtube" | "instagram" | "x" | "unknown";

interface MediaRef {
  url: string;
  filename: string;
  contentType: string;
}

// Bounds the whole download+transcribe attempt so a slow/hanging network
// call can't quietly eat the run's overall time budget (see lib/claude.ts's
// own CHUNK_TIMEOUT_MS/FILE_COLLECTION_TIMEOUT_MS for the same reasoning —
// this step runs *before* that budget even starts, so it needs its own).
const TRANSCRIBE_TIMEOUT_MS = 60_000;
// Whisper's own hard ceiling (platform.openai.com/docs) — enforced here so
// a video that's too big fails with a clear reason instead of a confusing
// error from the API.
const WHISPER_MAX_BYTES = 25 * 1024 * 1024;

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

export function detectPlatform(url: string): Platform {
  let host: string;
  try {
    host = new URL(url).hostname.replace(/^www\./, "").replace(/^m\./, "");
  } catch {
    return "unknown";
  }
  if (host === "youtube.com" || host === "youtu.be") return "youtube";
  if (host === "instagram.com") return "instagram";
  if (host === "x.com" || host === "twitter.com") return "x";
  return "unknown";
}

/**
 * YouTube's own caption track, fetched via its public (unofficial but
 * widely-relied-on, used by the `youtube-transcript` package under the
 * hood) timedtext endpoint — no download, no external service, free. Only
 * works when the video actually has captions (manual or auto-generated);
 * most do, but not all.
 */
async function fetchYouTubeTranscript(url: string): Promise<TranscribeResult> {
  try {
    // Lazy import: keeps this dependency out of every other code path that
    // imports this file but never touches a YouTube link.
    const { YoutubeTranscript } = await import("youtube-transcript");
    const items = await YoutubeTranscript.fetchTranscript(url);
    if (!items.length) {
      return { status: "error", error: "Esse vídeo do YouTube não tem legenda disponível pra extrair." };
    }
    const transcript = items
      .map((item) => item.text)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    return { status: "success", transcript };
  } catch (err) {
    return {
      status: "error",
      error:
        err instanceof Error
          ? `Falha ao buscar a legenda do YouTube: ${err.message}`
          : "Falha ao buscar a legenda do YouTube.",
    };
  }
}

/**
 * A public post's video variants via X's own syndication endpoint — the
 * same one X's own embed widgets use, so it doesn't need a logged-in
 * session or API key, but it's unofficial and undocumented: it could stop
 * working without notice if X changes it. Picks the highest-bitrate mp4
 * variant available.
 */
async function fetchXMedia(tweetUrl: string): Promise<MediaRef> {
  const match = tweetUrl.match(/status\/(\d+)/);
  if (!match) throw new Error("Não consegui identificar o ID do post nesse link do X.");
  const tweetId = match[1];

  const res = await fetch(`https://cdn.syndication.twimg.com/tweet-result?id=${tweetId}&token=a`);
  if (!res.ok) throw new Error(`Falha ao buscar dados do post no X (HTTP ${res.status}).`);
  const data = await res.json();

  const variants: { bitrate?: number; content_type: string; url: string }[] =
    data?.mediaDetails?.[0]?.video_info?.variants ?? data?.video?.variants ?? [];
  const mp4Variants = variants.filter((v) => v.content_type === "video/mp4");
  if (mp4Variants.length === 0) throw new Error("Esse post do X não parece ter um vídeo.");

  const best = mp4Variants.reduce((a, b) => ((b.bitrate ?? 0) > (a.bitrate ?? 0) ? b : a));
  return { url: best.url, filename: "video.mp4", contentType: "video/mp4" };
}

function getInstagramShortcode(postUrl: string): string {
  const match = postUrl.match(/instagram\.com\/(?:p|reel|reels|tv)\/([^/?#]+)/);
  if (!match) throw new Error("Não consegui identificar o post nesse link do Instagram.");
  return match[1];
}

const IG_PAGE_HEADERS = {
  accept: "*/*",
  referer: "https://www.instagram.com/",
  DNT: "1",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "same-origin",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/117.0",
};

/** Reads the post's own page and pulls the `og:video` meta tag — the most
 *  direct source, but Instagram often serves a login wall instead for this
 *  URL shape, so this frequently comes back empty and the caller falls
 *  back to the GraphQL approach below. */
async function fetchInstagramVideoFromPage(shortcode: string): Promise<string | null> {
  const res = await fetch(`https://www.instagram.com/p/${shortcode}/`, { headers: IG_PAGE_HEADERS });
  if (!res.ok) return null;
  const html = await res.text();
  const match = html.match(/<meta property="og:video" content="([^"]+)"/);
  if (!match) return null;
  return match[1].replace(/&amp;/g, "&");
}

// The fixed public app id / query doc id Instagram's own web client uses
// for its "load post" GraphQL query — works for a public post with no
// login/session, the same technique github.com/erickythierry/insta-download-api
// (itself based on github.com/riad-azz/instagram-video-downloader) uses.
// Entirely unofficial: Instagram can invalidate this doc id or start
// requiring a real session without notice, same "functional, not
// guaranteed reliable" caveat as the X syndication endpoint.
const IG_GRAPHQL_APP_ID = "1217981644879628";
const IG_GRAPHQL_DOC_ID = "10015901848480474";

async function fetchInstagramVideoFromGraphQL(shortcode: string): Promise<string | null> {
  const body = new URLSearchParams({
    variables: JSON.stringify({
      shortcode,
      fetch_comment_count: "null",
      fetch_related_profile_media_count: "null",
      parent_comment_count: "null",
      child_comment_count: "null",
      fetch_like_count: "null",
      fetch_tagged_user_count: "null",
      fetch_preview_comment_count: "null",
      has_threaded_comments: "false",
      hoisted_comment_id: "null",
      hoisted_reply_id: "null",
    }),
    doc_id: IG_GRAPHQL_DOC_ID,
  });

  const res = await fetch("https://www.instagram.com/api/graphql", {
    method: "POST",
    headers: {
      Accept: "*/*",
      "Content-Type": "application/x-www-form-urlencoded",
      "X-FB-Friendly-Name": "PolarisPostActionLoadPostQueryQuery",
      "X-IG-App-ID": IG_GRAPHQL_APP_ID,
      "X-ASBD-ID": "129477",
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-origin",
      "User-Agent":
        "Mozilla/5.0 (Linux; Android 11; SAMSUNG SM-G973U) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/14.2 Chrome/87.0.4280.141 Mobile Safari/537.36",
    },
    body: body.toString(),
  });
  if (!res.ok) return null;

  // Instagram doesn't always answer this with the expected JSON — a
  // suspected-bot request can get a 200 with an HTML login/challenge page
  // instead of a proper error status, which used to surface as a raw,
  // confusing "Unexpected token '<'..." JSON.parse exception. Checking the
  // content-type first, and falling back to null on a parse failure either
  // way, turns that into the same clean "no video found" outcome as every
  // other way this lookup can come up empty.
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("json") && !contentType.includes("javascript")) return null;

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    return null;
  }

  const media = (data as { data?: { xdt_shortcode_media?: { is_video?: boolean; video_url?: string } } })?.data
    ?.xdt_shortcode_media;
  if (!media?.is_video || !media?.video_url) return null;
  return media.video_url;
}

/**
 * A public post's direct video URL — no API key, adapted from
 * github.com/erickythierry/insta-download-api: tries the post's own page
 * for its `og:video` meta tag first, then falls back to the same
 * undocumented GraphQL endpoint Instagram's own web client uses. Either
 * step can fail without warning if Instagram changes something (login
 * wall, rotated doc id) — scoped as "functional, not guaranteed reliable"
 * like the rest of this file's platform-specific fetchers, not a
 * long-term-stable integration.
 */
async function fetchInstagramMedia(postUrl: string): Promise<MediaRef> {
  const shortcode = getInstagramShortcode(postUrl);

  const pageUrl = await fetchInstagramVideoFromPage(shortcode);
  const videoUrl = pageUrl ?? (await fetchInstagramVideoFromGraphQL(shortcode));

  if (!videoUrl) {
    throw new Error(
      "Não achei um vídeo público nesse post do Instagram — pode ser um carrossel de fotos, o post exigir login pra ver, ou o Instagram estar bloqueando o acesso automatizado no momento."
    );
  }

  return { url: videoUrl, filename: "video.mp4", contentType: "video/mp4" };
}

/** Downloads the media at `media.url` and sends it straight to Whisper —
 *  no local audio extraction (no ffmpeg available here): Whisper accepts
 *  containers like mp4/m4a directly and pulls the audio track itself. */
async function transcribeMediaWithWhisper(media: MediaRef): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY_MISSING");
  }

  const mediaRes = await fetch(media.url);
  if (!mediaRes.ok) throw new Error(`Falha ao baixar o vídeo (HTTP ${mediaRes.status}).`);
  const bytes = await mediaRes.arrayBuffer();
  if (bytes.byteLength > WHISPER_MAX_BYTES) {
    throw new Error(
      `O vídeo tem ${(bytes.byteLength / (1024 * 1024)).toFixed(1)}MB — acima do limite de 25MB que a transcrição aceita.`
    );
  }

  const form = new FormData();
  form.append("file", new Blob([bytes], { type: media.contentType }), media.filename);
  form.append("model", "whisper-1");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!res.ok) {
    throw new Error(`A transcrição falhou (HTTP ${res.status}): ${await res.text()}`);
  }
  const data = await res.json();
  return data.text as string;
}

/**
 * Turns a YouTube/Instagram/X video link into its transcript text — the
 * single entry point lib/runSkill.ts's resolveInputValues calls for every
 * "video"-typed input field. Never simulates a result: a platform or
 * missing-config gap comes back as "needs_setup" (surfaced in the
 * dashboard, same as a missing ANTHROPIC_API_KEY or Cowork webhook), never
 * a fake transcript.
 */
export async function transcribeVideoUrl(url: string): Promise<TranscribeResult> {
  const platform = detectPlatform(url);

  try {
    return await withTimeout(
      transcribeByPlatform(platform, url),
      TRANSCRIBE_TIMEOUT_MS,
      "A transcrição demorou demais e foi cancelada."
    );
  } catch (err) {
    return { status: "error", error: err instanceof Error ? err.message : "Falha ao transcrever o vídeo." };
  }
}

const MISSING_KEY_MESSAGES: Record<string, (platformLabel: string) => string> = {
  OPENAI_API_KEY_MISSING: (platformLabel) =>
    `OPENAI_API_KEY não está configurada — necessária pra transcrever vídeos do ${platformLabel}.`,
};

/** Shared by X and Instagram: find the media's direct URL, download it,
 *  send it to Whisper — the only difference between the two platforms is
 *  how the media URL itself gets found. */
async function downloadAndTranscribe(findMedia: () => Promise<MediaRef>, platformLabel: string): Promise<TranscribeResult> {
  try {
    const media = await findMedia();
    const transcript = await transcribeMediaWithWhisper(media);
    return { status: "success", transcript };
  } catch (err) {
    const key = err instanceof Error ? err.message : "";
    if (key in MISSING_KEY_MESSAGES) {
      return { status: "needs_setup", error: MISSING_KEY_MESSAGES[key](platformLabel) };
    }
    return {
      status: "error",
      error: err instanceof Error ? err.message : `Falha ao transcrever o vídeo do ${platformLabel}.`,
    };
  }
}

async function transcribeByPlatform(platform: Platform, url: string): Promise<TranscribeResult> {
  if (platform === "youtube") {
    return fetchYouTubeTranscript(url);
  }

  if (platform === "instagram") {
    return downloadAndTranscribe(() => fetchInstagramMedia(url), "Instagram");
  }

  if (platform === "x") {
    return downloadAndTranscribe(() => fetchXMedia(url), "X");
  }

  return {
    status: "error",
    error: "Esse link não parece ser do YouTube, Instagram ou X.",
  };
}
