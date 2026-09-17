import { asPluginId } from "@plugins/framework/plugins/plugin-id/core";

/**
 * The plugin whose presence in a composition means the deployed site records
 * visits. Named by id because membership is a question about the plugin graph;
 * `collect-plugin-id.test.ts` pins that the id still names that plugin's folder,
 * so a move or rename fails a test instead of hiding the section.
 */
export const COLLECT_PLUGIN_ID = asPluginId("apps.deploy.analytics.collect");
