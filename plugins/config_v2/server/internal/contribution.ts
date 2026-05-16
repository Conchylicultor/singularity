import { defineServerContribution } from "@server/contributions";
import type { ConfigDescriptor } from "../../core";

interface ConfigRegistration {
  descriptor: ConfigDescriptor;
}

export const ConfigV2 = {
  Register: defineServerContribution<ConfigRegistration>("ConfigV2.Register"),
};
