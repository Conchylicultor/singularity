import { describe, expect, test } from "bun:test";
import { extractVisibleText } from "./page-text";
import { readCappedBody } from "./probe";

// The byte cap is the probe's only bound on a stranger's server: without it a
// mistyped URL pointing at a large file is an unbounded download every tick.

function stream(text: string, chunkSize = 16): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  let offset = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.byteLength) {
        controller.close();
        return;
      }
      controller.enqueue(bytes.subarray(offset, offset + chunkSize));
      offset += chunkSize;
    },
  });
}

describe("readCappedBody", () => {
  test("stops at the cap, mid-chunk", async () => {
    const body = await readCappedBody(stream("x".repeat(10_000)), 200);
    expect(body.byteLength).toBe(200);
  });

  test("returns the whole body when it fits", async () => {
    const body = await readCappedBody(stream("hello"), 200);
    expect(new TextDecoder().decode(body)).toBe("hello");
  });

  test("its output feeds the rewriter", async () => {
    // Regression pin: the capping used to be a piped `TransformStream`, which
    // Bun's `HTMLRewriter.transform()` refuses (`ERR_STREAM_CANNOT_PIPE`). A
    // truncated document must also parse rather than throw.
    const html = `<html><body><nav>Menu</nav>${"<p>Techno Night</p>".repeat(500)}`;
    const body = await readCappedBody(stream(html, 64), 256);
    const text = await extractVisibleText(
      new Response(body, { headers: { "content-type": "text/html" } }),
    );
    expect(text).toContain("Techno Night");
    expect(text).not.toContain("Menu");
  });
});
