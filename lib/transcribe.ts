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

// Every step of the video lookup/transcription pipeline can fail in ways
// that are indistinguishable from the outside (a platform blocking the
// request looks the same as a post with no video) — these show up in
// Vercel's function logs so a real failure can actually be diagnosed
// (which step, what HTTP status, what the response looked like) instead of
// only ever seeing the same generic user-facing message. Never logs full
// media URLs (can carry signed/expiring tokens) or request bodies/keys.
function log(...args: unknown[]) {
  console.log("[transcribe]", ...args);
}

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
    log("youtube: caption fetch ok, segments =", items.length);
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
    log("youtube: caption fetch failed:", err instanceof Error ? err.message : err);
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
  log("x: tweetId =", tweetId);

  const res = await fetch(`https://cdn.syndication.twimg.com/tweet-result?id=${tweetId}&token=a`);
  log("x: syndication fetch status =", res.status);
  if (!res.ok) throw new Error(`Falha ao buscar dados do post no X (HTTP ${res.status}).`);
  const data = await res.json();

  const variants: { bitrate?: number; content_type: string; url: string }[] =
    data?.mediaDetails?.[0]?.video_info?.variants ?? data?.video?.variants ?? [];
  const mp4Variants = variants.filter((v) => v.content_type === "video/mp4");
  log("x: variants total =", variants.length, "mp4 variants =", mp4Variants.length);
  if (mp4Variants.length === 0) throw new Error("Esse post do X não parece ter um vídeo.");

  const best = mp4Variants.reduce((a, b) => ((b.bitrate ?? 0) > (a.bitrate ?? 0) ? b : a));
  return { url: best.url, filename: "video.mp4", contentType: "video/mp4" };
}

// Automatic Instagram video lookup was tried two ways — scraping the
// post's own page for its `og:video` meta tag, and Instagram's own
// undocumented GraphQL endpoint (adapted from
// github.com/erickythierry/insta-download-api) — and both were confirmed
// dead from this app's actual hosting: real production logs showed
// Instagram serving its standard login-wall HTML page (status 200) for
// *both* methods, identically, on repeated tries. That's Instagram
// blocking the request by the server's IP itself (Vercel's serverless
// ranges are widely blocked as datacenter traffic), not a header/scraping
// detail either approach got wrong — no amount of tweaking headers or
// retrying fixes an IP-level block. Fixing this for real would mean
// paying for a proxy-backed download API; at the user's direction, that's
// deferred for now and Instagram is left unsupported (YouTube and X don't
// depend on instagram.com and are unaffected) — see the message below and
// README's "Transcribing a video link" section.
const INSTAGRAM_UNSUPPORTED_MESSAGE =
  "A transcrição automática de vídeos do Instagram não está disponível: o Instagram bloqueia o acesso automatizado a partir da infraestrutura onde esse app roda (confirmado em produção — a página do post e o endpoint alternativo testado voltam com a mesma tela de login do Instagram). Cole o texto da legenda/post ou uma transcrição manual do vídeo em vez do link.";

/** Downloads the media at `media.url` and sends it straight to Whisper —
 *  no local audio extraction (no ffmpeg available here): Whisper accepts
 *  containers like mp4/m4a directly and pulls the audio track itself. */
async function transcribeMediaWithWhisper(media: MediaRef): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY_MISSING");
  }

  const mediaRes = await fetch(media.url);
  log("whisper: media download status =", mediaRes.status);
  if (!mediaRes.ok) throw new Error(`Falha ao baixar o vídeo (HTTP ${mediaRes.status}).`);
  const bytes = await mediaRes.arrayBuffer();
  log("whisper: media size =", (bytes.byteLength / (1024 * 1024)).toFixed(2), "MB");
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
  log("whisper: transcription request status =", res.status);
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
  const startedAt = Date.now();
  log("start:", platform, url);

  try {
    const result = await withTimeout(
      transcribeByPlatform(platform, url),
      TRANSCRIBE_TIMEOUT_MS,
      "A transcrição demorou demais e foi cancelada."
    );
    log("done:", platform, result.status, `${Date.now() - startedAt}ms`);
    return result;
  } catch (err) {
    log("done:", platform, "error", `${Date.now() - startedAt}ms`, "-", err instanceof Error ? err.message : err);
    return { status: "error", error: err instanceof Error ? err.message : "Falha ao transcrever o vídeo." };
  }
}

const MISSING_KEY_MESSAGES: Record<string, (platformLabel: string) => string> = {
  OPENAI_API_KEY_MISSING: (platformLabel) =>
    `OPENAI_API_KEY não está configurada — necessária pra transcrever vídeos do ${platformLabel}.`,
};

/** Finds a platform's media direct URL, downloads it, sends it to Whisper
 *  — currently only used for X, but kept generic (a `findMedia` callback)
 *  in case another platform besides YouTube's own-caption path needs the
 *  same download+transcribe shape later. */
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
    log("instagram: skipping automatic lookup — confirmed unsupported from this infra, see comment above");
    return { status: "error", error: INSTAGRAM_UNSUPPORTED_MESSAGE };
  }

  if (platform === "x") {
    return downloadAndTranscribe(() => fetchXMedia(url), "X");
  }

  return {
    status: "error",
    error: "Esse link não parece ser do YouTube, Instagram ou X.",
  };
}
