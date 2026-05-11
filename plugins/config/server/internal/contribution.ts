import { defineServerContribution } from "@server/contributions";
import type { ConfigDescriptor } from "@plugins/config/shared";

export const Config = {
  Field: defineServerContribution<ConfigDescriptor>("config.field"),
};
