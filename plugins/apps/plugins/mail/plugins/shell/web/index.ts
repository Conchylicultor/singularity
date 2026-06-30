import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdMail } from "react-icons/md";
import { mdAppIcon } from "@plugins/apps-core/plugins/app-icon/web";
import { Apps } from "@plugins/apps-core/web";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { mailApp } from "../core";
import { MailLayout } from "./components/mail-layout";
import { mailRootPane } from "./panes";

export { Mail, MAIL_APP_PATH } from "./slots";

export default {
  description:
    "App shell for Mail. Registers the /mail app entry, defines the Mail.Sidebar slot, and renders the capability-driven landing pane.",
  contributions: [
    Apps.App({
      id: mailApp.id,
      icon: mdAppIcon(MdMail),
      tooltip: "Mail",
      component: MailLayout,
      path: mailApp.basePath,
    }),
    Pane.Register({ pane: mailRootPane }),
  ],
} satisfies PluginDefinition;
