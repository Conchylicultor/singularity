import type { PluginDefinition } from "@core";
import shellPlugin from "@plugins/shell/web";
import dummyButtonPlugin from "@plugins/dummy-button/web";
import dummyListPlugin from "@plugins/dummy-list/web";
import dummyDetailPlugin from "@plugins/dummy-detail/web";

export const plugins: PluginDefinition[] = [
  shellPlugin,
  dummyButtonPlugin,
  dummyListPlugin,
  dummyDetailPlugin,
];
