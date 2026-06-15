import { describe, expect, test } from "bun:test";
import { toEmbedUrl } from "./providers";

describe("toEmbedUrl", () => {
  test("YouTube watch?v=ID", () => {
    expect(toEmbedUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
      "https://www.youtube.com/embed/dQw4w9WgXcQ",
    );
    // extra params alongside v are ignored
    expect(toEmbedUrl("https://youtube.com/watch?v=abc123&t=42s")).toBe(
      "https://www.youtube.com/embed/abc123",
    );
  });

  test("YouTube youtu.be/ID", () => {
    expect(toEmbedUrl("https://youtu.be/dQw4w9WgXcQ")).toBe(
      "https://www.youtube.com/embed/dQw4w9WgXcQ",
    );
    expect(toEmbedUrl("https://youtu.be/abc123?t=10")).toBe(
      "https://www.youtube.com/embed/abc123",
    );
  });

  test("YouTube shorts/ID", () => {
    expect(toEmbedUrl("https://www.youtube.com/shorts/xyz789")).toBe(
      "https://www.youtube.com/embed/xyz789",
    );
  });

  test("Vimeo vimeo.com/ID", () => {
    expect(toEmbedUrl("https://vimeo.com/123456789")).toBe(
      "https://player.vimeo.com/video/123456789",
    );
    // non-numeric path is not a video id → fall back
    expect(toEmbedUrl("https://vimeo.com/channels/staffpicks")).toBe(
      "https://vimeo.com/channels/staffpicks",
    );
  });

  test("Spotify open.spotify.com/<type>/<id>", () => {
    expect(toEmbedUrl("https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT")).toBe(
      "https://open.spotify.com/embed/track/4cOdK2wGLETKBW3PvgPWqT",
    );
    expect(toEmbedUrl("https://open.spotify.com/playlist/37i9dQ?si=abc")).toBe(
      "https://open.spotify.com/embed/playlist/37i9dQ",
    );
  });

  test("unknown host falls back to the raw URL", () => {
    expect(toEmbedUrl("https://example.com/some/page")).toBe(
      "https://example.com/some/page",
    );
  });

  test("unparseable input falls back to the raw string", () => {
    expect(toEmbedUrl("not a url")).toBe("not a url");
    expect(toEmbedUrl("")).toBe("");
  });
});
