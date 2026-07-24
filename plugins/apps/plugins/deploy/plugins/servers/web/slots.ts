import type { ComponentType } from "react";
import { defineRenderSlot } from "@plugins/primitives/plugins/slot-render/web";
import { defineFieldExtensions } from "@plugins/primitives/plugins/data-view/web";
import type { Server } from "../shared";

export const Servers = {
  /**
   * The SSH area of the server page. Its contributor owns the whole key flow
   * (there is no separate paste field beside it), which is why it renders
   * inline with the fields it concerns rather than as a card below the form
   * like `Deploy.Section`.
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
