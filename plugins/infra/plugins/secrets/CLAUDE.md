# Secrets

Encrypted-at-rest key-value primitive. Consumers: `auth` (OAuth tokens / API keys) and `config` (fields declared with `secret: true`).

## Topology

- **Main-only storage.** `~/.singularity/secrets.json.enc` (AES-256-GCM). Worktrees never touch the file.
- **OS keychain for the master key, file fallback.** Primary: `@napi-rs/keyring` (macOS Keychain / libsecret / Windows Credential Manager). Fallback: `~/.singularity/secrets/.key` mode 0600, when the native module is missing or fails at runtime. Either way the key is cached in-memory after first read.
- **Worktrees RPC via `~/.singularity/secrets.sock`.** `get`/`set`/`delete`/`has`/`meta`/`list` by `(namespace, key)`. Mode 0600.
- **Ready coordination.** `onReady` runs in parallel across plugins (see `server/src/index.ts`). Consumers `await ready` from `@plugins/infra/plugins/secrets/server` before issuing API calls on main.

## Namespaces

Secrets are addressed by `{ namespace, key }`. Conventions:

- `auth-tokens` — one entry keyed `blob-v1`, holding the JSON-encoded `TokenStoreBlob` (all providers/accounts).
- `config-fields` — one entry per config full-key (e.g. `google.clientSecret`), holding the plaintext string.

Add new namespaces freely; the store doesn't care. Keep namespaces short and lowercase-hyphen.

## Using it

```ts
import { getSecret, setSecret, ready } from "@plugins/infra/plugins/secrets/server";

// In your onReady hook, before any call:
await ready;

await setSecret({ namespace: "my-plugin", key: "api-key" }, "sk-…");
const v = await getSecret({ namespace: "my-plugin", key: "api-key" }); // "sk-…"
```

All four of `get` / `set` / `has` / `delete` execute locally on main and route via the unix socket on worktrees. `getSecretMetadata` returns `{ set: boolean, updatedAt?: number }` without ever exposing the value — use it when all you need is a "configured?" bit.

## No `web/`

The secrets plugin has no frontend. Plaintext secret values must never flow to a browser. UIs that need to show "is this secret set?" consume the `config-fields` metadata through the config plugin's `configSecretsResource`, which only broadcasts `{ set: boolean }`.

## Migration from pre-secrets auth

On first boot after upgrade, `migrateLegacyAuthTokens` decrypts `~/.singularity/auth/tokens.json.enc` with its own `.key`, writes the blob under `auth-tokens/blob-v1`, and renames both legacy files to `.migrated-<timestamp>`. Idempotent — subsequent boots see the secret already present and no-op.

## Explicit deferrals

- **Hardware-backed keys** (Secure Enclave / TPM). Overkill for a dev tool.
- **Key rotation.** No `rotateKey()` yet; the blob version byte in `crypto.ts` gives us a hook if we need it.
- **Per-secret ACLs.** Socket access is gated by 0600 file permissions — same threat model as every other dev tool.
