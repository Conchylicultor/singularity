import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { sshRun } from "@plugins/infra/plugins/ssh/server";
import {
  _deployServers,
  getServerSshPrivateKey,
} from "@plugins/apps/plugins/deploy/plugins/servers/server";
import { checkServerSsh } from "../../shared/endpoints";
import { serverHealth } from "./tables";

export const handleCheckSsh = implement(checkServerSsh, async ({ params }) => {
  const [row] = await db
    .select()
    .from(_deployServers)
    .where(eq(_deployServers.id, params.id));
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  if (!row) throw new HttpError(404, "Not found");

  // The private key is asked of `servers` by name; the `deploy-ssh` secret
  // namespace stays that plugin's own.
  const secret = await getServerSshPrivateKey(params.id);
  if (!secret.configured) {
    throw new HttpError(
      409,
      "No SSH key is configured for this server. Generate one first.",
    );
  }

  const existing = await serverHealth.get(params.id);
  const pinnedHostKey = existing?.hostKeyLine ?? null;

  const result = await sshRun(
    {
      host: row.host,
      port: row.port,
      user: row.sshUser,
      privateKey: secret.privateKey,
      // Trust-on-first-use: learn the host key on the first successful check,
      // then require an exact match forever after.
      hostKey: pinnedHostKey
        ? { mode: "pinned", knownHostsLine: pinnedHostKey }
        : { mode: "learn" },
    },
    // `true` is deliberate: it cannot fail on its own, so ANY non-zero exit is
    // an SSH-layer problem. That removes the exit-255 ambiguity between "ssh
    // itself failed" and "the remote command happened to exit 255".
    ["true"],
  );

  await serverHealth.upsert(params.id, {
    ok: result.ok,
    checkedAt: new Date(),
    failureKind: result.ok ? null : result.kind,
    failureMessage: result.ok ? null : result.message,
    // Stamped AS OF this check — this is what makes "verified" exact without
    // `servers` ever having to invalidate us. See `shared/schemas.ts`.
    checkedPublicKey: row.sshPublicKey,
    // A failed check never drops the pin: only a successful learn adds one, and
    // only the explicit forget-host-key action removes one.
    hostKeyLine: result.ok ? (result.learnedHostKey ?? pinnedHostKey) : pinnedHostKey,
  });
  // The upsert is what fires the DB change-feed and refreshes the live
  // resource — no explicit notify, same as the keypair handler.

  // Never returns the private key or the ssh argv; `stderr` is OpenSSH's own
  // diagnostic text, which the UI shows verbatim for the `unknown` kind.
  return result.ok
    ? { ok: true as const }
    : {
        ok: false as const,
        kind: result.kind,
        message: result.message,
        stderr: result.stderr,
      };
});
