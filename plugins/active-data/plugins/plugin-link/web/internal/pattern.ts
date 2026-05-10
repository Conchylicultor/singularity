import { inlineBoundary } from "@plugins/active-data/shared";

// Matches plugin hierarchy IDs: kebab-case segments optionally joined by dots
// (e.g. `tasks`, `active-data`, `active-data.conv`).
// Validation against the real plugin tree happens in the component.
export const PLUGIN_NAME_RE = inlineBoundary(
  /[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)*/,
);
