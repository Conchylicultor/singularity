import { defineFieldExtensions } from "@plugins/primitives/plugins/data-view/web";
import { defineDetailSections } from "@plugins/primitives/plugins/detail-sections/web";
import type { Server } from "../shared";

/**
 * The server detail pane: **one slot whose sections are contributions**, hosted
 * by `serverDetailPane`. The host owns every card, so the pane's regions are
 * uniform by construction.
 *
 * It is owned by `servers` rather than by the app shell because its props are a
 * `Server` — a pane about one row of this plugin's table was never an app-level
 * concern. The whole row is passed (not a `serverId`) because the pane already
 * has it in hand; re-deriving it per section would be a needless resource read
 * per card, and a section that only needs the id reads `server.id`.
 *
 * This replaced three slots (`Deploy.Section`, `Servers.SshSetup`,
 * `Servers.DetailHeader`) and a hardcoded form. Two of those were
 * single-contributor micro-slots that existed only because the identity form was
 * not itself a contribution; once it is, they collapse into peers of it.
 */
export const ServerDetail = defineDetailSections<{ server: Server }>();

export const Servers = {
  /**
   * Extra DataView `FieldDef<Server>[]` injected by other plugins. A field
   * extension is a *component* (not plain data) so its `value` closure can
   * capture hook-loaded data — e.g. `status` reads the health plugin's own
   * live resource and yields a `status` enum field. Mirrors `Tasks.Fields`.
   */
  Fields: defineFieldExtensions<Server>(),
};
