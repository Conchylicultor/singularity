import type { ComponentType } from "react";
import { defineRenderSlot } from "@plugins/primitives/plugins/slot-render/web";
import type { Server } from "../shared";

export const Servers = {
  /**
   * Inline extension point in the SSH area of the server page, rendered just
   * above the private-key paste field — for setup assistance that must sit
   * next to the fields it concerns (unlike `Deploy.Section`, which renders as
   * separate cards below the whole form).
   */
  SshSetup: defineRenderSlot<{
    order: number;
    component: ComponentType<{ server: Server }>;
  }>("deploy.servers.ssh-setup", { docLabel: () => "ssh-setup" }),
};
