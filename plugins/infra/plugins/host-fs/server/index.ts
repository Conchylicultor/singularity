import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import {
  hostFsComplete,
  hostFsList,
  hostFsOpen,
  hostFsRaw,
  hostFsStat,
  hostFsText,
  hostFsVolume,
} from "../core";
import { handleComplete } from "./internal/complete";
import { handleList } from "./internal/list";
import { handleOpen } from "./internal/open";
import { handleRaw } from "./internal/raw";
import { handleStat } from "./internal/stat";
import { handleText } from "./internal/text";
import { handleVolume } from "./internal/volume";

export { decodeTextBytes, type TextBytesResult } from "./internal/decode";
export {
  defineArchiveFormat,
  type ArchiveFormat,
  type ArchiveIndexResult,
  type ArchiveMember,
  type MemberBytes,
} from "./internal/archive/registry";

export default {
  description:
    "The one host-filesystem API: list / stat / complete / text / raw / volume reads of any path the user account can read (filesystem permissions are the boundary; missing / denied / not-a-dir are typed results), and POST open (Open with default app, Reveal in Finder) refused unless the Origin is the app's own *.localhost.",
  httpRoutes: {
    [hostFsList.route]: handleList,
    [hostFsStat.route]: handleStat,
    [hostFsComplete.route]: handleComplete,
    [hostFsText.route]: handleText,
    [hostFsRaw.route]: handleRaw,
    [hostFsVolume.route]: handleVolume,
    [hostFsOpen.route]: handleOpen,
  },
} satisfies ServerPluginDefinition;
