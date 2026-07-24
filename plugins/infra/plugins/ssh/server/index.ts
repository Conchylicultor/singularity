import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";

export { sshRun } from "./internal/run";
export type { SshTarget, SshRunResult } from "./internal/types";

export default {
  description:
    "Hermetic SSH client primitive: sshRun opens a session to (host, port, user) with EXACTLY the private key it is given — IdentitiesOnly + IdentityAgent=none + -F /dev/null keep the machine's own agent, config and multiplexed sessions out, so a connection test proves the key it was handed works — and returns a discriminated result whose failures are classified from OpenSSH stderr (dns / unreachable / timeout / auth / host-key-mismatch / command-failed / unknown). Host-key policy is pinned-or-learn with no 'off'; the key is materialized 0600 into a mkdtemp dir removed in finally.",
} satisfies ServerPluginDefinition;
