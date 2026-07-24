import { z } from "zod";

// The registry record: user-authored identity, address, credentials. Liveness
// is deliberately NOT here — reachability is probe-written state with a
// different writer and lifecycle, owned by the `health` sub-plugin's
// `deploy_servers_ext_health` side-table. Keeping a `status` column here beside
// a probe that owns the real verdict would be two sources of truth.
export const ServerSchema = z.object({
  id: z.string(),
  name: z.string(),
  host: z.string(),
  port: z.number(),
  sshUser: z.string(),
  consoleUrl: z.string().nullable(),
  sshPublicKey: z.string().nullable(),
  sshKeyConfigured: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Server = z.infer<typeof ServerSchema>;
