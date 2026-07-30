import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";

export { sshRun } from "./internal/run";
export { sshUpload } from "./internal/upload";
export type { SshTarget, SshRunResult, SshUploadResult, SshFailure } from "./internal/types";

export default {
  description:
    "Hermetic SSH client primitive: sshRun (one remote command) and sshUpload (one file, over scp) open a session to (host, port, user) with EXACTLY the private key they are given — IdentitiesOnly + IdentityAgent=none + -F /dev/null keep the machine's own agent, config and multiplexed sessions out, so a connection test proves the key it was handed works — and return a discriminated result whose failures are classified from OpenSSH stderr (dns / unreachable / timeout / auth / host-key-mismatch / command-failed / unknown). Both are built from one shared hermetic invocation, so the isolation flags cannot drift between them. Host-key policy is pinned-or-learn with no 'off'; the key is materialized 0600 into a mkdtemp dir removed in finally.",
} satisfies ServerPluginDefinition;
