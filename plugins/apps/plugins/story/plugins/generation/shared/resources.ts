import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";
import {
  StoryGeneratedUnitRowSchema,
  type StoryGeneratedUnitRow,
} from "../core/schemas";

// Browser-safe client descriptor for the story-generated-units live resource.
// The row schema + type live in `core/` (single source of truth, shared with the
// server entity), so the wire shape can't drift from the table.
export const storyGeneratedUnitsResource = resourceDescriptor<
  StoryGeneratedUnitRow[]
>("story-generated-units", z.array(StoryGeneratedUnitRowSchema), []);
