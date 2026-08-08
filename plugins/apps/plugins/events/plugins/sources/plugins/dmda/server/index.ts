import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { defineEventSourceType } from "@plugins/apps/plugins/events/plugins/events-core/server";
import { DMDA_SOURCE_TYPE_ID, dmdaSourceConfigFields } from "../core";
import { extractDmdaVisits } from "./internal/extract";
import { probeDmdaVisits } from "./internal/probe";

export default {
  description:
    "Des Mots et Des Arts event source type: probe reads the site's own paginated JSON listing (SSRF-guarded) and fingerprints its identity fields; extract maps the rows to events with no model call, resolving the year the site omits from the weekday it publishes.",
  register: [
    defineEventSourceType({
      id: DMDA_SOURCE_TYPE_ID,
      configFields: dmdaSourceConfigFields,
      probe: probeDmdaVisits,
      extract: extractDmdaVisits,
    }),
  ],
} satisfies ServerPluginDefinition;
