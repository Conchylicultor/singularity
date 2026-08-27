import { describe, it, expect } from "bun:test";
import { tokenExtension } from "@plugins/primitives/plugins/text-editor/plugins/token-extension/core";
import { defineInlineTokenNode } from "@plugins/primitives/plugins/text-editor/plugins/token-extension/plugins/node/core";
import { hasNodeExtensionToken } from "./markdown";
import type { NodeExtension } from "./node-extensions";

// Only the pattern matters to the gate, but there is no way to build an
// extension without a real node declaration — which is the point: a pattern
// that nothing can materialize is no longer expressible.
const testNode = defineInlineTokenNode<{ raw: string }>({
  type: "markdown-test-token",
  fields: ["raw"],
  token: ({ raw }) => raw,
  fieldsOf: (m) => ({ raw: m[0] }),
  textContent: "token",
});

function ext(pattern: RegExp): NodeExtension {
  return tokenExtension({ id: pattern.source, pattern, node: testNode });
}

const UI_CONTEXT = ext(
  /<ui-context(?:\s+[\w-]+="[^"]*")*\s*>[\s\S]*?<\/ui-context>/g,
);
const IMAGE = ext(/!\[[^\]]*\]\(\/api\/attachments\/[\w-]+\)/g);

describe("hasNodeExtensionToken", () => {
  it("detects a token anywhere in the pasted text", () => {
    const tag =
      '<ui-context url="http://x" plugin="improve"><hint>h</hint></ui-context>';
    expect(hasNodeExtensionToken(tag, [UI_CONTEXT])).toBe(true);
    expect(hasNodeExtensionToken(`fix ${tag} please`, [UI_CONTEXT])).toBe(true);
    expect(hasNodeExtensionToken(tag, [IMAGE, UI_CONTEXT])).toBe(true);
  });

  it("leaves ordinary text to the default paste", () => {
    expect(hasNodeExtensionToken("just some text", [UI_CONTEXT, IMAGE])).toBe(
      false,
    );
    expect(hasNodeExtensionToken("<ui-context unclosed", [UI_CONTEXT])).toBe(
      false,
    );
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
