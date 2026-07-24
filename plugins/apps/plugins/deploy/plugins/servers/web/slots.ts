import type { ComponentType } from "react";
import { defineRenderSlot } from "@plugins/primitives/plugins/slot-render/web";
import { defineFieldExtensions } from "@plugins/primitives/plugins/data-view/web";
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

  /**
   * Leading zone of the server page's header row (the Delete action sits at the
   * far end). The registry owns a server's identity, not its liveness — so a
   * status indicator is *contributed* here by the plugin that owns that fact
   * rather than read off the row.
   */
  DetailHeader: defineRenderSlot<{
    order: number;
    component: ComponentType<{ server: Server }>;
  }>("deploy.servers.detail-header", { docLabel: (p) => p.id }),

  /**
   * Extra DataView `FieldDef<Server>[]` injected by other plugins. A field
   * extension is a *component* (not plain data) so its `value` closure can
   * capture hook-loaded data — e.g. `status` reads the health plugin's own
   * live resource and yields a `status` enum field. Mirrors `Tasks.Fields`.
   */
  Fields: defineFieldExtensions<Server>("deploy.servers.fields"),
};
