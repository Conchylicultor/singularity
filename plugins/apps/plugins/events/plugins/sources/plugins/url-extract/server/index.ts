import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { defineEventSourceType } from "@plugins/apps/plugins/events/plugins/events-core/server";
import { URL_SOURCE_TYPE_ID, urlSourceConfigFields } from "../core";
import { extractUrlEvents } from "./internal/extract";
import { probeUrlPage } from "./internal/probe";

export default {
  description:
    "Web-page event source type: probe reads the URL through one transport-blind pipeline (SSRF-guarded plain fetch, or a real browser when the source's Fetch mode says so or the site answers a bot challenge), refuses a page it cannot read whole or that has no readable text at all, and fingerprints its normalized visible text; extract turns that text into structured events with a one-shot Sonnet call, validated against ExtractedEventSchema.",
  register: [
    defineEventSourceType({
      id: URL_SOURCE_TYPE_ID,
      configFields: urlSourceConfigFields,
      probe: probeUrlPage,
      extract: extractUrlEvents,
    }),
  ],
} satisfies ServerPluginDefinition;
