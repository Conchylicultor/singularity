/**
 * Stage-0 CRDT gate: the REAL inline page-link decorator node must round-trip
 * losslessly through the runs ↔ `Y.XmlText` bridge
 * (`research/2026-07-07-page-per-block-crdt-plan-b.md`).
 * Run with `bun test plugins/page/plugins/inline-page-link/web/internal/collab-roundtrip.test.ts`.
 *
 * Imports the production extension registration (side-effect module), so the
 * pattern/serializer under test are exactly what the live editor uses. Headless
 * under Bun — decorator `createDOM`/`decorate` are never invoked.
 */

import { describe, expect, test } from "bun:test";
import { getBlockTextExtensions } from "@plugins/page/plugins/editor/web";
import {
  coalesce,
  runsToXmlText,
  xmlTextToRuns,
  type RichText,
  type RunsXmlTextOptions,
} from "@plugins/page/plugins/editor/core";
import { readYDoc } from "@plugins/primitives/plugins/collab-doc/core";
import { pageLinkToken } from "../../core";
import "./register";

const extensions = getBlockTextExtensions();
const opts: RunsXmlTextOptions = {
  extensions,
  nodes: extensions.flatMap((e) => (e.node ? [e.node] : [])),
};

/** Ids of materialized decorator nodes of `type` in the doc's editor state. */
function decoratorFields(
  xmlText: ReturnType<typeof runsToXmlText>,
  type: string,
  field: string,
): unknown[] {
  return readYDoc(
    xmlText.doc!,
    (editor) => {
      const out: unknown[] = [];
      const walk = (n: Record<string, unknown>) => {
        if (n.type === type) out.push(n[field]);
        for (const c of (n.children as Record<string, unknown>[] | undefined) ?? []) {
          walk(c);
        }
      };
      walk(editor.getEditorState().toJSON().root as unknown as Record<string, unknown>);
      return out;
    },
    { nodes: opts.nodes ? [...opts.nodes] : [] },
  );
}

describe("page-link inline node ↔ Y.XmlText", () => {
  const pageId = "block-1718000000000-abc123";

  test("token round-trips losslessly through a materialized decorator node", () => {
    const runs: RichText = [
      { text: `see ${pageLinkToken(pageId)} for details` },
    ];
    const xmlText = runsToXmlText(runs, opts);

    // Materialized as a real PageLinkInlineNode (not left as plain text) with
    // its __pageId field intact after the Yjs property sync.
    expect(decoratorFields(xmlText, "page-link-inline", "pageId")).toEqual([pageId]);

    expect(xmlTextToRuns(xmlText, opts)).toEqual(coalesce(runs));
  });

  test("token between marked runs keeps surrounding marks and stays unmarked", () => {
    const runs: RichText = [
      { text: "bold ", marks: ["bold"] },
      { text: pageLinkToken(pageId) },
      { text: " tail", color: "blue" },
    ];
    const xmlText = runsToXmlText(runs, opts);
    expect(xmlTextToRuns(xmlText, opts)).toEqual(coalesce(runs));
  });
});
