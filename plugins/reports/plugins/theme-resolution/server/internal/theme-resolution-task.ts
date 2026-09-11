import type { ReportRow } from "@plugins/reports/server";
import { ThemeResolutionPayloadSchema } from "../../core";
import type { ThemeResolutionPayload } from "../../core";

// Notification re-arm window: the stored data that causes the fault is still
// there on every load, so the bell resurfaces it every 6h rather than
// collapsing forever onto the first sighting — same policy as viewport-escape.
export const THEME_RESOLUTION_NOTIF_COOLDOWN_MS = 6 * 60 * 60 * 1000;

function payloadOf(row: ReportRow): ThemeResolutionPayload {
  // Validated by ThemeResolutionPayloadSchema at ingest, so this is a total
  // parse; failure would be a corrupted row (surfaced loudly).
  return ThemeResolutionPayloadSchema.parse(row.data);
}

export function renderThemeResolutionTask(row: ReportRow): {
  title: string;
  description: string;
} {
  return { title: renderTitle(row), description: renderDescription(row) };
}

function scopeName(scopeId: string | undefined): string {
  return scopeId ?? "the desktop";
}

function headline(data: ThemeResolutionPayload): string {
  switch (data.fault) {
    case "missing-theme":
      return `${scopeName(data.scopeId)} selects theme "${data.themeId}", which does not exist`;
    case "unregistered-group":
      return `theme "${data.themeId}" has values for unregistered token group "${data.groupId}"`;
    case "unknown-tokens":
      return `theme "${data.themeId}" has unknown ${data.groupId} tokens (${data.tokens.join(", ")})`;
  }
}

function renderTitle(row: ReportRow): string {
  const noisePrefix = row.noise ? "[noise] " : "";
  const raw = `${noisePrefix}[theme-resolution] ${headline(payloadOf(row))}`;
  return raw.length > 120 ? `${raw.slice(0, 117)}...` : raw;
}

function whatHappened(data: ThemeResolutionPayload): string[] {
  switch (data.fault) {
    case "missing-theme":
      return [
        `**${scopeName(data.scopeId)} is painted with the Default theme instead of the one it selects.** Its theme selection (the \`theme\` config of \`ui/theme-engine\`, ${data.scopeId === undefined ? "the base document" : `scope \`${data.scopeId}\``}) names \`${data.themeId}\`, and no code theme or saved theme has that id.`,
        `The saved-themes delete endpoint moves every scope off a theme before deleting it, so this normally takes a config file edited by hand, or a saved theme removed outside the app.`,
      ];
    case "unregistered-group":
      return [
        `**Theme \`${data.themeId}\` stores values for token group \`${data.groupId}\`, which no plugin registers.** They were skipped; the rest of the theme paints normally.`,
        `A stored theme outlives the code that reads it: the group was probably deleted or renamed.`,
      ];
    case "unknown-tokens":
      return [
        `**Theme \`${data.themeId}\` stores ${data.tokens.length} token(s) that the \`${data.groupId}\` group's schema no longer declares:** ${data.tokens.map((t) => `\`${t}\``).join(", ")}. They were ignored; the rest of the theme paints normally.`,
        `A stored theme outlives the code that reads it: the tokens were probably renamed or dropped from the group.`,
      ];
  }
}

function howToFix(data: ThemeResolutionPayload): string[] {
  switch (data.fault) {
    case "missing-theme":
      return [
        `Pick a theme for ${scopeName(data.scopeId)} in the theme customizer, or correct the \`theme\` value in its config file.`,
      ];
    case "unregistered-group":
    case "unknown-tokens":
      return [
        `If the values were renamed, move them in the stored theme (\`saved_themes.fragments\`) to their new names; if they are obsolete, edit the theme once in the customizer or remove them from the row. A code theme carrying them is a source edit.`,
      ];
  }
}

function renderDescription(row: ReportRow): string {
  const data = payloadOf(row);
  const lines: string[] = [];
  lines.push(...whatHappened(data));
  lines.push("");
  lines.push(`**How to fix**`);
  lines.push(...howToFix(data));
  lines.push("");
  lines.push(`**Report**`);
  lines.push(`- **Source:** ${row.source}`);
  lines.push(`- **Worktree:** ${row.worktree}`);
  lines.push(`- **Fingerprint:** ${row.fingerprint}`);
  lines.push(`- **Count:** ${row.count}`);
  lines.push(`- **First seen:** ${row.firstSeenAt.toISOString()}`);
  lines.push(`- **Last seen:** ${row.lastSeenAt.toISOString()}`);
  if (row.url) lines.push(`- **URL:** ${row.url}`);
  return lines.join("\n");
}
