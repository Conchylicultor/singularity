import { DEFAULT_THEME_ID, defineTheme } from "../core";

// Names no token group, so every group paints its schema defaults — the look
// every scope starts on, and what a scope whose selected theme no longer exists
// falls back to.
export const defaultTheme = defineTheme({
  id: DEFAULT_THEME_ID,
  label: "Default",
  fragments: [],
});
