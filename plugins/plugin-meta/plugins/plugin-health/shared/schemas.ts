import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";
import { z } from "zod";
import {
  PluginHealthReviewSchema,
  type PluginHealthReview,
} from "../core";

export const pluginHealthReviewsDescriptor = resourceDescriptor<
  PluginHealthReview[]
>("plugin-health-reviews", z.array(PluginHealthReviewSchema), []);
