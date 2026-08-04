import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { defineEventSourceType } from "@plugins/apps/plugins/events/plugins/events-core/server";
import { URL_SOURCE_TYPE_ID, urlSourceConfigFields } from "../core";
import { extractUrlEvents } from "./internal/extract";
import { probeUrlPage } from "./internal/probe";

export default {
  description:
    "Web-page event source type: probe fetches the URL (SSRF-guarded) and fingerprints its normalized visible text; extract turns that text into structured events with a one-shot Sonnet call, validated against ExtractedEventSchema.",
  register: [
    defineEventSourceType({
      id: URL_SOURCE_TYPE_ID,
      configFields: urlSourceConfigFields,
      probe: probeUrlPage,
      extract: extractUrlEvents,
    }),
  ],
} satisfies ServerPluginDefinition;
