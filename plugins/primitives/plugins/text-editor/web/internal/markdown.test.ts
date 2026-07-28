import { describe, it, expect } from "bun:test";
import { hasNodeExtensionToken } from "./markdown";
import type { NodeExtension } from "./node-extensions";

// Only the pattern matters to the gate; the node side is never touched.
function ext(pattern: RegExp): NodeExtension {
  return {
    node: null as unknown as NodeExtension["node"],
    deserializePattern: pattern,
    createNodeFromMatch: () => null,
    serializeNode: () => null,
  };
}

const UI_CONTEXT = ext(
  /<ui-context(?:\s+[\w-]+="[^"]*")*\s*>[\s\S]*?<\/ui-context>/g,
);
const IMAGE = ext(/!\[[^\]]*\]\(\/api\/attachments\/[\w-]+\)/g);

describe("hasNodeExtensionToken", () => {
  it("detects a token anywhere in the pasted text", () => {
    const tag = '<ui-context url="http://x" plugin="improve"><hint>h</hint></ui-context>';
    expect(hasNodeExtensionToken(tag, [UI_CONTEXT])).toBe(true);
    expect(hasNodeExtensionToken(`fix ${tag} please`, [UI_CONTEXT])).toBe(true);
    expect(hasNodeExtensionToken(tag, [IMAGE, UI_CONTEXT])).toBe(true);
  });

  it("leaves ordinary text to the default paste", () => {
    expect(hasNodeExtensionToken("just some text", [UI_CONTEXT, IMAGE])).toBe(false);
    expect(hasNodeExtensionToken("<ui-context unclosed", [UI_CONTEXT])).toBe(false);
    expect(hasNodeExtensionToken("anything", [])).toBe(false);
  });

  it("is not stateful across calls for a /g pattern", () => {
    const tag = "<ui-context><hint>h</hint></ui-context>";
    // A shared /g regex would alternate true/false on `lastIndex`.
    expect(hasNodeExtensionToken(tag, [UI_CONTEXT])).toBe(true);
    expect(hasNodeExtensionToken(tag, [UI_CONTEXT])).toBe(true);
    expect(hasNodeExtensionToken(tag, [UI_CONTEXT])).toBe(true);
  });
});
