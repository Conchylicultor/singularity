import { describe, expect, test } from "bun:test";
import { isNonRetryableError } from "@plugins/infra/plugins/jobs/server";
import {
  failureError,
  FetchOutputSchema,
  isYouTubeAudioError,
  YouTubeAccessError,
  YouTubeAudioDownloadError,
  YouTubeAudioUnavailableError,
} from "./fetch";

const ID = "liTfD88dbCo";

function failure(kind: "unavailable" | "refused" | "blocked" | "network") {
  return FetchOutputSchema.parse({
    ok: false,
    kind,
    message: `readable ${kind}`,
    detail: `yt-dlp ${kind}`,
    attempts: 1,
  });
}

function errorFor(kind: Parameters<typeof failure>[0]) {
  const out = failure(kind);
  if (out.ok) throw new Error("expected a failure document");
  return failureError(ID, out);
}

describe("failureError", () => {
  test("unavailable is this video's, and never retried", () => {
    const err = errorFor("unavailable");
    expect(err).toBeInstanceOf(YouTubeAudioUnavailableError);
    expect(isYouTubeAudioError(err)).toBe(true);
    expect(isNonRetryableError(err)).toBe(true);
    expect(err.reason).toBe("readable unavailable");
  });

  test("refused is this video's, and retryable", () => {
    const err = errorFor("refused");
    expect(err).toBeInstanceOf(YouTubeAudioDownloadError);
    expect(isYouTubeAudioError(err)).toBe(true);
    expect(isNonRetryableError(err)).toBe(false);
    expect(err.reason).toBe("readable refused");
    expect((err as YouTubeAudioDownloadError).detail).toBe("yt-dlp refused");
  });

  test.each(["blocked", "network"] as const)(
    "%s is the machine's, not the video's",
    (kind) => {
      const err = errorFor(kind);
      expect(err).toBeInstanceOf(YouTubeAccessError);
      expect((err as YouTubeAccessError).kind).toBe(kind);
      expect(isYouTubeAudioError(err)).toBe(false);
      expect(isNonRetryableError(err)).toBe(false);
      expect(err.message).toContain(`readable ${kind}`);
      expect(err.message).not.toContain("Traceback");
    },
  );
});

describe("FetchOutputSchema", () => {
  test("parses the audio document", () => {
    const out = FetchOutputSchema.parse({
      ok: true,
      file: `/cache/${ID}.webm`,
      format: "webm",
      durationSec: 231.4,
      title: "t",
      channel: "c",
      ytDlpVersion: "2026.08.19",
      attempts: 2,
    });
    expect(out.ok).toBe(true);
  });

  test("rejects an unknown failure kind", () => {
    expect(() =>
      FetchOutputSchema.parse({
        ok: false,
        kind: "mystery",
        message: "m",
        detail: "d",
        attempts: 1,
      }),
    ).toThrow();
  });

  test("rejects the old untagged document", () => {
    expect(() =>
      FetchOutputSchema.parse({
        file: "f",
        format: "webm",
        durationSec: 1,
        title: "t",
        channel: "c",
        ytDlpVersion: "v",
      }),
    ).toThrow();
  });
});
