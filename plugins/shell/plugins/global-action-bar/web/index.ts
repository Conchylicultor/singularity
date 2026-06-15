import { Core, type PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Apps } from "@plugins/apps/web";
import { ConfigV2 } from "@plugins/config_v2/web";
import {
  FloatingActionBarHost,
  DockedActionBarHost,
} from "./components/global-action-bar";
import { actionBarConfig } from "../shared/config";

export default {
  description:
    "Global action bar rendering the shared ActionBar.Item set on every app, with two mutually-exclusive mount points keyed on the persisted pin: a floating top-right overlay (Core.Root) when unpinned — visible in every placement mode including solo — and a docked right-aligned strip in the tab bar (Apps.TabBarActions) when pinned.",
  contributions: [
    Core.Root({ component: FloatingActionBarHost }),
    Apps.TabBarActions({
      id: "global-action-bar",
      component: DockedActionBarHost,
    }),
    ConfigV2.WebRegister({ descriptor: actionBarConfig }),
  ],
} satisfies PluginDefinition;
