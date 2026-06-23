import { Core, type PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ImperativeDialogHost } from "./components/imperative-dialog-host";

export { openDialog } from "./internal/store";

export default {
  description:
    "Imperative dialog primitive: openDialog(render) mounts a modal Dialog from any callback (create affordances, confirms) via a single Core.Root host — the toaster pattern for dialogs. Returns a promise that resolves when the dialog closes.",
  contributions: [Core.Root({ component: ImperativeDialogHost })],
} satisfies PluginDefinition;
