import { Stack } from "@plugins/primitives/plugins/spacing/web";
import { ActionBar } from "../slots";

/**
 * Renders the shared action set as a flat horizontal row. Contributed as a
 * single `Shell.Toolbar` entry so the agent-manager toolbar reuses the
 * `ActionBar.Item` slot. Supplies its own `gap` so the buttons lay out flat
 * inside the toolbar header.
 */
export function ActionBarStrip() {
  return (
    <Stack direction="row" align="center" gap="sm">
      <ActionBar.Item.Render />
    </Stack>
  );
}
