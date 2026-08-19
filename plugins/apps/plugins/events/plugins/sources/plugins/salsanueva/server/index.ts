import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { defineEventSourceType } from "@plugins/apps/plugins/events/plugins/events-core/server";
import {
  SALSANUEVA_SOURCE_TYPE_ID,
  salsanuevaSourceConfigFields,
} from "../core";
import { extractSalsanuevaCourses } from "./internal/extract";
import { probeSalsanuevaCourses } from "./internal/probe";

export default {
  description:
    "SalsaNueva event source type: probe reads the school's own courses API (SSRF-guarded) for the published term and groups the dated occurrences back into weekly courses; extract filters them by the source's own dance / level / school selection and publishes each course as ONE recurring event, with no model call.",
  register: [
    defineEventSourceType({
      id: SALSANUEVA_SOURCE_TYPE_ID,
      configFields: salsanuevaSourceConfigFields,
      probe: probeSalsanuevaCourses,
      extract: extractSalsanuevaCourses,
    }),
  ],
} satisfies ServerPluginDefinition;
