import type { DispatchStatus } from "./types";

export interface TranscribeResult {
  status: DispatchStatus;
  transcript?: string;
  error?: string;
}

type Platform = "youtube" | "instagram" | "x" | "unknown";

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

function detectPlatform(url: string): Platform {
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
async function fetchXVideoUrl(tweetUrl: string): Promise<string> {
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
  return best.url;
}

/** Downloads the media at `mediaUrl` and sends it straight to Whisper —
 *  no local audio extraction (no ffmpeg available here): Whisper accepts
 *  video containers like mp4 directly and pulls the audio track itself. */
async function transcribeMediaUrlWithWhisper(mediaUrl: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY_MISSING");
  }

  const mediaRes = await fetch(mediaUrl);
  if (!mediaRes.ok) throw new Error(`Falha ao baixar o vídeo (HTTP ${mediaRes.status}).`);
  const bytes = await mediaRes.arrayBuffer();
  if (bytes.byteLength > WHISPER_MAX_BYTES) {
    throw new Error(
      `O vídeo tem ${(bytes.byteLength / (1024 * 1024)).toFixed(1)}MB — acima do limite de 25MB que a transcrição aceita.`
    );
  }

  const form = new FormData();
  form.append("file", new Blob([bytes], { type: "video/mp4" }), "video.mp4");
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

async function transcribeByPlatform(platform: Platform, url: string): Promise<TranscribeResult> {
  if (platform === "youtube") {
    return fetchYouTubeTranscript(url);
  }

  if (platform === "instagram") {
    // Deliberately not implemented: unlike X, there's no comparably stable
    // public endpoint for a post's video URL — every approach found relies
    // on scraping techniques that Instagram actively fights and that break
    // without warning. Rather than ship something unverified that could
    // silently produce wrong results, this stays a documented gap.
    return {
      status: "needs_setup",
      error:
        "Transcrição de vídeo do Instagram ainda não está disponível — não encontrei um jeito confiável de " +
        "baixar o vídeo sem risco de quebrar sem aviso. YouTube e X já funcionam.",
    };
  }

  if (platform === "x") {
    try {
      const videoUrl = await fetchXVideoUrl(url);
      const transcript = await transcribeMediaUrlWithWhisper(videoUrl);
      return { status: "success", transcript };
    } catch (err) {
      if (err instanceof Error && err.message === "OPENAI_API_KEY_MISSING") {
        return {
          status: "needs_setup",
          error: "OPENAI_API_KEY não está configurada — necessária pra transcrever vídeos do X.",
        };
      }
      return { status: "error", error: err instanceof Error ? err.message : "Falha ao transcrever o vídeo do X." };
    }
  }

  return {
    status: "error",
    error: "Esse link não parece ser do YouTube, Instagram ou X.",
  };
}
