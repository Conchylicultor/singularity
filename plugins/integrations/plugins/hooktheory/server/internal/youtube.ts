/** A YouTube video id: 11 characters of URL-safe base64. */
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/** Hosts that serve the same video ids as youtube.com. */
const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);

/**
 * The video id behind whatever a transcriber pasted into Hookpad's YouTube
 * field. Real sections hold all three spellings: a bare id (`CGj85pVzRJs`), a
 * share link (`https://youtu.be/CGj85pVzRJs?si=…`) and a watch URL
 * (`https://www.youtube.com/watch?v=hTWKbfoikeg&ab_channel=NirvanaVEVO`).
 *
 * `null` when the value is none of those — there is no video to play, which the
 * caller has to show as such.
 */
export function youtubeVideoId(raw: string): string | null {
  const value = raw.trim();
  if (VIDEO_ID.test(value)) return value;
  if (!URL.canParse(value)) return null;

  const url = new URL(value);
  let candidate: string | null = null;
  if (url.hostname === "youtu.be") {
    candidate = url.pathname.split("/")[1] ?? null;
  } else if (YOUTUBE_HOSTS.has(url.hostname)) {
    candidate =
      url.pathname === "/watch"
        ? url.searchParams.get("v")
        : (/^\/(?:embed|shorts|live|v)\/([^/]+)/.exec(url.pathname)?.[1] ??
          null);
  }
  return candidate !== null && VIDEO_ID.test(candidate) ? candidate : null;
}
