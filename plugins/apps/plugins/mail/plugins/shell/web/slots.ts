import type { AppShellSidebarItem } from "@plugins/primitives/plugins/app-shell/web";
import { defineRenderSlot } from "@plugins/primitives/plugins/slot-render/web";
import { mailApp } from "../core";

/** The Mail app's base URL path and its index pane's `appPath`. */
export const MAIL_APP_PATH = mailApp.basePath;

export const Mail = {
  /** Left-rail entries — one per mail surface (mailboxes, labels, …). */
  Sidebar: defineRenderSlot<AppShellSidebarItem>("mail.sidebar", {
    docLabel: (p) => p.title,
  }),
};
