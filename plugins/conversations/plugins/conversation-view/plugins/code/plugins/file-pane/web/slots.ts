import { defineSlot } from "@core";
import type { ComponentType } from "react";
import type { EditedFileStatus } from "@plugins/conversations/plugins/conversation-view/plugins/code/shared";

export type RendererMatch = "native" | "contextual" | "fallback" | false;

export interface FileRendererTarget {
  path: string;
  status: EditedFileStatus;
}

export interface FileRendererContribution {
  id: string;
  label: string;
  supports(file: FileRendererTarget): RendererMatch;
  component: ComponentType<{ worktree: string; path: string }>;
}

export const FilePane = {
  Renderer: defineSlot<FileRendererContribution>(
    "conversation.code.file-pane.renderer",
  ),
};

const TIER: Record<Exclude<RendererMatch, false>, number> = {
  native: 3,
  contextual: 2,
  fallback: 1,
};

export interface ResolvedRenderer {
  contribution: FileRendererContribution;
  tier: Exclude<RendererMatch, false>;
}

export function resolveRenderers(
  contributions: readonly FileRendererContribution[],
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
