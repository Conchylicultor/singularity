import { defineDetailSections } from "@plugins/primitives/plugins/detail-sections/web";
import type { PluginNode } from "../core";

export const PluginView = defineDetailSections<{ node: PluginNode }>();
