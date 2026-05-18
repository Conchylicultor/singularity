import { defineServerContribution } from "@plugins/framework/plugins/server-core/core";
import type { ConfigDescriptor } from "../../core";

interface ConfigRegistration {
  descriptor: ConfigDescriptor;
}

export const ConfigV2 = {
  Register: defineServerContribution<ConfigRegistration>("ConfigV2.Register"),
};
