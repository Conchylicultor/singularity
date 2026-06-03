import { ActionBar } from "../slots";

/**
 * Renders the shared action set as a flat horizontal row. Contributed as a
 * single `Shell.Toolbar` entry so the agent-manager toolbar reuses the
 * `ActionBar.Item` slot. Supplies its own `gap` so the buttons lay out flat
 * inside the toolbar header.
 */
export function ActionBarStrip() {
  return (
    <div className="flex items-center gap-2">
      <ActionBar.Item.Render />
    </div>
  );
}
