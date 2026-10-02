import { z } from "zod";
import { fieldSample } from "@plugins/config_v2/plugins/fields/core";
import { jsonField } from "./json";

/** The json field's fixed gallery sample (see `FieldSample`). */
export const jsonSample = fieldSample(
  jsonField({
    label: "Column widths",
    description: "Saved width of each table column, in pixels.",
    schema: z.record(z.string(), z.number()),
    default: {},
  }),
  { title: 320, status: 120, updated: 160 },
);
