import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdSearch } from "react-icons/md";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { Mail } from "@plugins/apps/plugins/mail/plugins/shell/web";
import { MailSearchSidebar } from "./components/mail-search-sidebar";
import { mailSearchPane, mailMessagePane } from "./panes";

export default {
  description:
    "Mail on-demand search: a Search sidebar entry opening a query surface over GET /api/mail/search (Gmail relevance order, reaching mail older than the sync window), plus a lazily-hydrated reader pane for a selected message.",
  contributions: [
    Mail.Sidebar({
      id: "search",
      title: "Search",
      icon: MdSearch,
      component: MailSearchSidebar,
    }),
    Pane.Register({ pane: mailSearchPane }),
    Pane.Register({ pane: mailMessagePane }),
  ],
} satisfies PluginDefinition;
