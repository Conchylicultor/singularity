import { defineDataDir } from "@plugins/infra/plugins/paths/core";

/**
 * The secrets store: the AES-256-GCM blob (`secrets.json.enc`) holding every
 * namespace's secrets, and the `.key` file the store falls back to when the OS
 * keychain is unavailable (CI, headless Linux without libsecret).
 *
 * Blob and key in ONE directory on purpose. They were two entries at the root —
 * a loose `secrets.json.enc` file beside a `secrets/` dir — which is how a
 * backup or a sweep could take one without the other, and either half alone is
 * worthless.
 */
export const secretsDir = defineDataDir({
  kind: "state",
  name: "secrets",
  owner: "infra/secrets",
  description:
    "The encrypted secrets blob (secrets.json.enc) and the .key file used when the OS keychain is unavailable",
  // Every OAuth token and API key the user has connected. Nothing re-derives
  // them: losing the blob means reconnecting every provider by hand, and losing
  // the key means the blob can never be read again.
  reclaim: {
    kind: "never",
    reason:
      "the encrypted blob is the only copy of every connected token, and the fallback key is the only thing that can decrypt it",
  },
});

/**
 * The pre-secrets-store auth layout: `tokens.json.enc` with its own `.key`,
 * read once at boot by `migrateLegacyAuthTokens` and renamed aside on success.
 *
 * Declared rather than quarantined so the diff stays honest — deleting the
 * legacy-auth code path is separate work. In practice the blob is long gone and
 * only the 32-byte `.key` remains, so the migration can now only ever answer
 * `"noop"`.
 */
export const legacyAuthDir = defineDataDir({
  kind: "state",
  name: "auth",
  owner: "infra/secrets",
  description:
    "The pre-secrets-store auth layout (tokens.json.enc + its .key), read once by the one-shot migration into the secrets store",
  // A leftover, but a leftover holding key material: if a blob ever did survive
  // here, it is the only copy of those tokens and its key is the only way in.
  // Reclaiming it is the operator's call after reading it, never a sweeper's.
  reclaim: {
    kind: "never",
    reason:
      "holds legacy key material — any surviving blob here is the only copy of those tokens, so removal is a deliberate operator step, not a sweep",
  },
});

export default [secretsDir, legacyAuthDir];
