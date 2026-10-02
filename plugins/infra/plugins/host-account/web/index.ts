import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { useHostAccount } from "./internal/use-host-account";

export default {
  description:
    "Host account, read: useHostAccount() — the OS account this backend runs as (login name and full name), loading until the value arrives.",
  contributions: [],
} satisfies PluginDefinition;
