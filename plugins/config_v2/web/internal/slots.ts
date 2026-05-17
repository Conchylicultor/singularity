import { defineSlot } from "@plugins/framework/plugins/web-sdk/core";
import type { ConfigDescriptor } from "../../core";

export const ConfigV2 = {
  WebRegister: defineSlot<{ descriptor: ConfigDescriptor }>("config-v2.web-register"),
};
