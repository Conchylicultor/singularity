import { describe, expect, test } from "bun:test";
import { isolateHtml } from "./isolate";

describe("isolateHtml", () => {
  test("puts the policy right after the doctype", () => {
    const out = isolateHtml("<!DOCTYPE html><html><script>x</script></html>");
    expect(
      out.startsWith(
        '<!DOCTYPE html><meta http-equiv="Content-Security-Policy"',
      ),
    ).toBe(true);
    expect(out.indexOf("Content-Security-Policy")).toBeLessThan(
      out.indexOf("<script>"),
    );
  });

  test("leads a document with no doctype", () => {
    expect(isolateHtml("<p>hi</p>").startsWith("<meta http-equiv=")).toBe(true);
  });
});
