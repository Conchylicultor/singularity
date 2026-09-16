import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { TaskCategory } from "@plugins/tasks/plugins/task-category/server";
import { TOOLCHAIN_CATEGORY_ID } from "@plugins/toolchain/core";
import { detectOutdatedToolchainJob } from "./internal/detect-job";

export default {
  description:
    "Daily toolchain.detect-outdated job: when main's toolchain has a newer release than mise.lock records, files one auto-started task (Toolchain category) whose agent runs `./singularity toolchain upgrade` and pushes on an `upgraded` verdict.",
  contributions: [
    TaskCategory({ id: TOOLCHAIN_CATEGORY_ID, label: "Toolchain", order: 6 }),
  ],
  register: [detectOutdatedToolchainJob],
} satisfies ServerPluginDefinition;
