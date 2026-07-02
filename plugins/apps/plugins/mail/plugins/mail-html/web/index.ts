import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { MailHtml } from "./components/mail-html";
export type { MailHtmlProps } from "./components/mail-html";

export default {
  description:
    "Privacy-safe email HTML renderer: <MailHtml> runs a DOMPurify sanitize → remote-image gating (proxied only after opt-in) → cid: inline-image resolution → quoted-history collapse pipeline, injected inside a style-scoped container.",
  contributions: [],
} satisfies PluginDefinition;
