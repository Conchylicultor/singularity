import { defineServerContribution } from "@plugins/framework/plugins/server-core/core";
import type { ConfigDescriptor } from "@plugins/config/core";

export const Config = {
  Field: defineServerContribution<ConfigDescriptor>("config.field"),
};
