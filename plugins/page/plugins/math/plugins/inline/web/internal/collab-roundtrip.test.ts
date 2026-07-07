/**
 * Stage-0 CRDT gate: the REAL inline-math decorator node must round-trip
 * losslessly through the runs ↔ `Y.XmlText` bridge
 * (`research/2026-07-07-page-per-block-crdt-plan-b.md`).
 * Run with `bun test plugins/page/plugins/math/plugins/inline/web/internal/collab-roundtrip.test.ts`.
 *
 * Imports the production extension registration (side-effect module), so the
 * pattern/serializer under test are exactly what the live editor uses. The
 * KaTeX renderer is lazy-loaded (`lazyComponent`), so nothing DOM/CSS-bound
 * executes headless.
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
import { inlineMathToken } from "../../core";
import "./register";

const extensions = getBlockTextExtensions();
const opts: RunsXmlTextOptions = {
  extensions,
  nodes: extensions.flatMap((e) => (e.node ? [e.node] : [])),
};

/** `field` values of materialized decorator nodes of `type` in the doc. */
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

describe("inline-math node ↔ Y.XmlText", () => {
  test("token round-trips through a materialized node", () => {
    const latex = "e^{i\\pi}+1=0";
    const runs: RichText = [
      { text: `Euler: ${inlineMathToken(latex)} is beautiful.` },
    ];
    const xmlText = runsToXmlText(runs, opts);

    // Materialized as a real InlineMathNode with its LaTeX source intact
    // (backslashes and braces survive the Yjs property sync).
    expect(decoratorFields(xmlText, "inline-math", "expression")).toEqual([latex]);

    expect(xmlTextToRuns(xmlText, opts)).toEqual(coalesce(runs));
  });

  test("math token inside marked/colored context round-trips", () => {
    const runs: RichText = [
      { text: "so ", marks: ["italic"] },
      { text: inlineMathToken("a^2+b^2=c^2") },
      { text: " holds", color: "green" },
    ];
    const xmlText = runsToXmlText(runs, opts);
    expect(xmlTextToRuns(xmlText, opts)).toEqual(coalesce(runs));
  });
});
