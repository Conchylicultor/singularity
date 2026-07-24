import { z } from "zod";
import { SshFailureKindSchema } from "@plugins/infra/plugins/ssh/core";

/**
 * One reachability verdict per server — the row of the
 * `deploy_servers_ext_health` side-table, minus `hostKeyLine` (the pinned
 * known_hosts line stays server-side: no client surface needs it).
 *
 * `checkedPublicKey` is `deploy_servers.ssh_public_key` **as of the check**, and
 * it is what makes "verified" exact without any cross-plugin write: the setup
 * step is done iff `ok && checkedPublicKey === server.sshKey?.publicKey`.
 * Replace the key and that line changes, the comparison fails, and the verify
 * step drops back to `active` on its own — `health` never has to be told, and
 * `servers` never has to import `health` to invalidate it.
 *
 * The column is the same string `servers` projects into `sshKey.publicKey`, so
 * the two sides are comparable by construction. A pasted key is no longer an
 * exception: `servers` derives its public half at the door, so it too carries a
 * real line here rather than a `null` that compares equal to everything.
 */
export const ServerHealthRowSchema = z.object({
  parentId: z.string(),
  ok: z.boolean(),
  /** Coerced Date on the wire (the DB column is a timestamp). */
  checkedAt: z.coerce.date(),
  /** Null when `ok` — the classified reason otherwise. */
  failureKind: SshFailureKindSchema.nullable(),
  failureMessage: z.string().nullable(),
  checkedPublicKey: z.string().nullable(),
});
export type ServerHealthRow = z.infer<typeof ServerHealthRowSchema>;

/**
 * The probe's answer. A failure is a *variant*, never an absorbable value: the
 * UI keys its remediation copy off `kind`, and `unknown` carries OpenSSH's own
 * `stderr` so an unclassified failure is shown verbatim rather than guessed at.
 *
 * `stderr` is OpenSSH diagnostic text only — the endpoint never returns private
 * key material or the ssh argv.
 */
export const SshCheckResultSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true) }),
  z.object({
    ok: z.literal(false),
    kind: SshFailureKindSchema,
    message: z.string(),
    stderr: z.string(),
  }),
]);
export type SshCheckResult = z.infer<typeof SshCheckResultSchema>;
