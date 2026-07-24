import { z } from "zod";

/**
 * The SSH key this app holds for a server, carrying its own evidence.
 *
 * A non-null `sshKey` means exactly one thing: *we hold a private key AND know
 * which public key it corresponds to*. It deliberately does NOT claim the key
 * works — proving that is the `health` sub-plugin's job, and its verdict lives
 * in its own side-table. Because a status cannot be rendered without a
 * fingerprint, the "a secret row exists but we have no idea which key it is"
 * state is unrepresentable rather than merely unrendered.
 */
export const SshKeySchema = z.object({
  /** e.g. "ssh-ed25519" — read back out of the key blob, not assumed. */
  algorithm: z.string(),
  /** "SHA256:…" — byte-identical to what `ssh-keygen -lf` prints. */
  fingerprint: z.string(),
  comment: z.string(),
  /** The trimmed `authorized_keys` line, verbatim. */
  publicKey: z.string(),
});
export type SshKey = z.infer<typeof SshKeySchema>;

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
  sshKey: SshKeySchema.nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Server = z.infer<typeof ServerSchema>;
