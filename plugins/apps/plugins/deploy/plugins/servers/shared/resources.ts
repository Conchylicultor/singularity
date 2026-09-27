import { z } from "zod";
import { liveValue } from "@plugins/network/plugins/live/core";
import { ServerSchema } from "./schemas";

/**
 * The server registry, as ONE value: every registered server, oldest first,
 * pushed whole on every change to `deploy_servers`.
 *
 * A value rather than a collection because each row carries a DERIVED field —
 * `sshKey` is built from `ssh_public_key` AND a central secrets lookup — which a
 * column projection cannot express. The server states that bound
 * (`unbounded: { reason }` in `server/internal/resources.ts`). No placeholder:
 * before the first value lands the read is `pending`, never "no servers".
 */
export const servers = liveValue("deploy.servers", {
  schema: z.array(ServerSchema),
});
