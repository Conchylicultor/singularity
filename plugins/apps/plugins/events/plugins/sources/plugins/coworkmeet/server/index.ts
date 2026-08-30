import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { defineEventSourceType } from "@plugins/apps/plugins/events/plugins/events-core/server";
import {
  COWORKMEET_SOURCE_TYPE_ID,
  coworkmeetSourceConfigFields,
} from "../core";
import { extractCoworkmeetSessions } from "./internal/extract";
import { probeCoworkmeetSessions } from "./internal/probe";

export default {
  description:
    "CoworkMeet event source type: probe reads the association's own Supabase listing of free coworking sessions (SSRF-guarded) and fingerprints every column it maps; extract turns each session into an event with no model call, tagging it with the association's own venue vocabulary and filtering on the same words.",
  register: [
    defineEventSourceType({
      id: COWORKMEET_SOURCE_TYPE_ID,
      configFields: coworkmeetSourceConfigFields,
      probe: probeCoworkmeetSessions,
      extract: extractCoworkmeetSessions,
    }),
  ],
} satisfies ServerPluginDefinition;
