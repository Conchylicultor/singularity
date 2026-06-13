import { useMemo } from "react";
import type { SealContributions } from "@plugins/framework/plugins/web-sdk/core";
import type { NodeExtension } from "@plugins/primitives/plugins/text-editor/web";
import { ActiveData, type ActiveDataInlineContribution } from "../slots";
import {
  ActiveDataInlineNode,
  $createActiveDataInlineNode,
  $isActiveDataInlineNode,
} from "./active-data-inline-node";

// Mirrors active-data's inline-tag registry into the Lexical editor as a single
// generic node extension: a union of every inline pattern feeds one
// ActiveDataInlineNode. Registering a `display:"inline"` contribution thus
// renders the token identically while composing (editor chip) and on display
// (markdown / user-text linkify) — one registry, no per-surface wiring.
export function useActiveDataNodeExtensions(): readonly NodeExtension[] {
  const contributions = ActiveData.Tag.useContributions();
  return useMemo<NodeExtension[]>(() => {
    const inline = contributions.filter(
      (c): c is SealContributions<ActiveDataInlineContribution> =>
        c.display === "inline",
    );
    if (inline.length === 0) return [];
    // Each source wrapped non-capturing; we only ever read m[0], so inner
    // capture groups and per-pattern lookarounds are preserved.
    const union = new RegExp(
      inline.map((c) => `(?:${c.pattern.source})`).join("|"),
      "g",
    );
    return [
      {
        node: ActiveDataInlineNode,
        deserializePattern: union,
        createNodeFromMatch: (m) => $createActiveDataInlineNode(m[0]),
        serializeNode: (n) =>
          $isActiveDataInlineNode(n) ? n.getText() : null,
      },
    ];
  }, [contributions]);
}
