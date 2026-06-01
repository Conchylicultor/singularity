import {
  defineSlot,
  type SealContributions,
} from "@plugins/framework/plugins/web-sdk/core";
import type { ComponentType } from "react";
import type { EditedFileStatus } from "@plugins/conversations/plugins/conversation-view/plugins/code/core";

export type RendererMatch = "native" | "contextual" | "fallback" | false;

export interface FileRendererTarget {
  path: string;
  status: EditedFileStatus;
}

export interface FileRendererContribution {
  id: string;
  label: string;
  supports(file: FileRendererTarget): RendererMatch;
  component: ComponentType<{ worktree: string; path: string; line?: number }>;
}

export const FilePane = {
  Renderer: defineSlot<FileRendererContribution>(
    "conversation.code.file-pane.renderer",
    { docLabel: (p) => p.label },
  ),
};

const TIER: Record<Exclude<RendererMatch, false>, number> = {
  native: 3,
  contextual: 2,
  fallback: 1,
};

/**
 * Sealed view of a renderer contribution as returned by `useContributions()`.
 * Its `component` is opaque (renderable only through `renderIsolated`); every
 * other field (`id`, `label`, `supports`) stays readable for tiering.
 */
export type SealedFileRendererContribution =
  SealContributions<FileRendererContribution>;

export interface ResolvedRenderer {
  contribution: SealedFileRendererContribution;
  tier: Exclude<RendererMatch, false>;
}

export function resolveRenderers(
  contributions: readonly SealedFileRendererContribution[],
  target: FileRendererTarget,
): ResolvedRenderer[] {
  const resolved: ResolvedRenderer[] = [];
  for (const c of contributions) {
    const tier = c.supports(target);
    if (tier === false) continue;
    resolved.push({ contribution: c, tier });
  }
  resolved.sort((a, b) => TIER[b.tier] - TIER[a.tier]);
  return resolved;
}
