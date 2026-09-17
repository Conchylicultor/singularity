import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";

export { sentinelStatusDir } from "../data-dirs";
export {
  createStatusWriter,
  isPidAlive,
  readSentinelWatch,
  STATUS_FILENAME,
  statusFilePath,
} from "./internal/status-file";

export default {
  description:
    "The machine watcher's (cluster sentinel's) host-global status file: its schemas, the one writer main's watcher host uses, the reader every backend and the build CLI use, and duressGuard — whether the duress latch can go up right now. A leaf on purpose: module-eval depends only on zod, node:fs and infra/paths, so the CLI's build admission valve can import it.",
} satisfies ServerPluginDefinition;
