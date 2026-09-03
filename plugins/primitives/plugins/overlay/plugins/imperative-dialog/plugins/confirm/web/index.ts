import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export {
  confirmDialog,
  type ConfirmDialogOptions,
} from "./internal/confirm-dialog";

export default {
  description:
    "confirmDialog(opts) → Promise<boolean>: a destructive-confirm helper over openDialog. Renders a sm panel (title + description + optional children + inline error + Cancel/Confirm), keeps the dialog open and shows getEndpointErrorMessage on failure, and resolves true iff onConfirm completed.",
  contributions: [],
} satisfies PluginDefinition;
