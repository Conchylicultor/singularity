import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdRocketLaunch } from "react-icons/md";
import { Pane, openPane } from "@plugins/primitives/plugins/pane/web";
import { sidebarNavItem } from "@plugins/primitives/plugins/app-shell/web";
import { Studio } from "@plugins/apps/plugins/studio/plugins/shell/web";
import { releasePane, releaseDetailPane } from "./panes";

export { ReleaseDetail } from "./slots";

export default {
  description:
    "Studio Release pane: pick a composition + target, run a local release, watch live progress, and preview the artifact.",
  contributions: [
    Pane.Register({ pane: releasePane }),
    Pane.Register({ pane: releaseDetailPane }),
    Studio.Sidebar({
      id: "release",
      ...sidebarNavItem({
        title: "Release",
        icon: MdRocketLaunch,
        onClick: () => openPane(releasePane, {}, { mode: "root" }),
      }),
    }),
  ],
} satisfies PluginDefinition;
