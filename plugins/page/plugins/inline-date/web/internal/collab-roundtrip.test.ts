/**
 * Stage-0 CRDT gate: the REAL inline date-mention decorator node must
 * round-trip losslessly through the runs ↔ `Y.XmlText` bridge
 * (`research/2026-07-07-page-per-block-crdt-plan-b.md`) — both the `[[date:…]]`
 * and `[[reminder:…]]` token kinds (the latter carries a `null`-able field).
 * Run with `bun test plugins/page/plugins/inline-date/web/internal/collab-roundtrip.test.ts`.
 *
 * Imports the production extension registration (side-effect module), so the
 * pattern/serializer under test are exactly what the live editor uses.
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
import { dateToken, reminderToken } from "../../core";
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

describe("date-mention inline node ↔ Y.XmlText", () => {
  const iso = "2026-06-17T09:00:00.000Z";
  const reminderId = "0f8b2c4d-1e2f-4a5b-8c7d-9e0f1a2b3c4d";

  test("[[date:…]] token round-trips through a materialized node", () => {
    const runs: RichText = [{ text: `due ${dateToken(iso)} sharp` }];
    const xmlText = runsToXmlText(runs, opts);

    expect(decoratorFields(xmlText, "date-mention", "iso")).toEqual([iso]);
    // A plain date mention carries reminderId = null — the null field must
    // survive the Yjs property sync (not become undefined/"").
    expect(decoratorFields(xmlText, "date-mention", "reminderId")).toEqual([null]);

    expect(xmlTextToRuns(xmlText, opts)).toEqual(coalesce(runs));
  });

  test("[[reminder:…]] token round-trips with id and iso intact", () => {
    const runs: RichText = [
      { text: `ping me ${reminderToken(reminderId, iso)}` },
    ];
    const xmlText = runsToXmlText(runs, opts);

    expect(decoratorFields(xmlText, "date-mention", "reminderId")).toEqual([
      reminderId,
    ]);
    expect(decoratorFields(xmlText, "date-mention", "iso")).toEqual([iso]);

    expect(xmlTextToRuns(xmlText, opts)).toEqual(coalesce(runs));
  });

  test("both kinds in one run round-trip together", () => {
    const runs: RichText = [
      { text: `${dateToken(iso)} and ${reminderToken(reminderId, iso)}` },
    ];
    const xmlText = runsToXmlText(runs, opts);
    expect(xmlTextToRuns(xmlText, opts)).toEqual(coalesce(runs));
  });
});
