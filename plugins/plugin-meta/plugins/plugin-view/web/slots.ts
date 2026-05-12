import { defineDetailSections } from "@plugins/primitives/plugins/detail-sections/web";
import type { PluginNode } from "../core/types";

export const PluginView = defineDetailSections<{ node: PluginNode }>("plugin-view");
