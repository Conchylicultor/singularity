import type { PluginDefinition } from "@core";
import shellPlugin from "@plugins/shell/web";
import dummyButtonPlugin from "@plugins/dummy-button/web";

export const plugins: PluginDefinition[] = [shellPlugin, dummyButtonPlugin];
