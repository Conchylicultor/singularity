# Auth

Centralized OAuth 2.0 / API key infrastructure for third-party services. Provider sub-plugins live in `plugins/auth/plugins/<id>/`.

## Topology

- **Tokens persist via the secrets primitive.** The `auth-tokens` namespace holds a JSON-encoded `TokenStoreBlob` keyed `blob-v1`. Actual storage (AES-256-GCM at `~/.singularity/secrets.json.enc`, OS-keychain master key, worktree RPC) lives in `plugins/secrets/` — see [`plugins/secrets/CLAUDE.md`](../secrets/CLAUDE.md).
- **Auth's own unix socket handles `getAccessToken`.** `~/.singularity/auth.sock` serves `/token`, `/status`, `/disconnect`, `/api-key` — the application-level RPC that includes refresh logic, consent errors, and in-flight-refresh dedup. Plain secret-store ops (`get`/`set`) use `secrets.sock` instead.
- **Main detection.** `process.env.SINGULARITY_WORKTREE === "singularity"`. Set by the gateway when it spawns the backend.
- **OAuth redirect URI.** `http://localhost:9000/api/auth/callback/<provider>` — bare `localhost`, not `singularity.localhost`. Google's Cloud Console rejects subdomains of localhost. The gateway has a scoped routing rule that forwards bare-`localhost` `/api/auth/{start,callback}/*` to the `singularity` backend.
- **Cross-worktree sync.** Main mutates → calls `notify()` locally + fans out `POST /api/auth/invalidate` to every worktree from `~/.singularity/worktrees/*.json`. Each worktree's handler calls its local `authStateResource.notify()`.

## How a consumer plugin uses it

```ts
import { getAccessToken, AuthNeedsConsentError } from "@plugins/auth/server";

try {
  const { accessToken } = await getAccessToken({
    providerId: "google",
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });
  // call provider API with Authorization: Bearer accessToken
} catch (err) {
  if (err instanceof AuthNeedsConsentError) {
    // tell the user to visit Accounts and reconnect
  }
}
```

The call routes via the unix socket on a worktree, or executes locally on main. Either way, on success it returns a fresh access token.

## How a provider sub-plugin is structured

```
plugins/auth/plugins/<id>/
├── package.json
├── shared/
│   ├── config.ts       # defineConfig({ clientId, clientSecret? { secret: true }? })
│   └── index.ts        # export the descriptor + scopes
├── server/
│   ├── index.ts        # registerAuthProvider(descriptor) at top-level
│   └── internal/descriptor.ts
└── web/
    └── index.ts        # Auth.Provider({ id, name, icon }) + Config.Spec(authConfig)
```

Server `index.ts` calls `registerAuthProvider(descriptor)` at module top-level. JS module init order guarantees this runs before the auth plugin's `onReady`.

## Credentials

Per-provider OAuth client credentials are user-supplied via the Settings pane. `clientId` is a plain string field; `clientSecret` is declared with `secret: true` in `defineConfig`, which stores it in the secrets primitive (encrypted on main; never broadcast to the browser).

Env-var overrides for developers:
- `SINGULARITY_AUTH_<PROVIDER>_CLIENT_ID`
- `SINGULARITY_AUTH_<PROVIDER>_CLIENT_SECRET` (where applicable)

Google uses Desktop-app + PKCE, but the token endpoint **still requires** `client_secret` (Google's implementation of RFC 8252 §8.6). Notion uses web-integration and also requires both. Shipping our own verified Google credentials is deferred — see [research/2026-04-24-global-auth-plugin.md](../../research/2026-04-24-global-auth-plugin.md) §I.

## Explicit deferrals

- **Multi-account per provider.** Schema keys accounts by `accountId`; code paths assume `"primary"` until we add an account picker.
- **Revoke on disconnect.** `descriptor.oauth.revoke` is a hook in the type but unused. MVP deletes locally only.
- **Rate-limited refresh retries.** Unconditional 60 s tick. Acceptable until something proves otherwise.
- **Scope-merging UI.** Incremental scope requests trigger full re-consent. Google's `include_granted_scopes=true` is already passed in `buildAuthorizeParams`, so providers should generally re-grant cleanly.
- **Keychain unlock UX.** If the secrets primitive cannot resolve its master key at boot, `authStateResource` returns `mainOffline: true` after the unix socket times out. No web UI to repair.

## Verification

See [research/2026-04-24-global-auth-plugin.md](../../research/2026-04-24-global-auth-plugin.md) §Verification for the manual smoke test.
