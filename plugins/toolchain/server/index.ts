import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { TaskCategory } from "@plugins/tasks/plugins/task-category/server";
import { TOOLCHAIN_CATEGORY_ID } from "@plugins/toolchain/core";

export default {
  description:
    "Registers the legacy Toolchain task category, so upgrade tasks filed before the toolchain loop moved onto infra/deps' updater runner still render under it. New upgrade tasks are filed by the Dependency upgrades automation under Dependencies.",
  contributions: [
    TaskCategory({ id: TOOLCHAIN_CATEGORY_ID, label: "Toolchain", order: 6 }),
  ],
} satisfies ServerPluginDefinition;
