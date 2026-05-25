# Auth

Centralized OAuth 2.0 / API key infrastructure for third-party services. Provider sub-plugins live in `plugins/auth/plugins/<id>/`.

## Topology

- **Auth runs on the central runtime.** The OAuth flow handlers, token store, refresh loop, provider registry, and `authStateResource` all live under `plugins/auth/central/`. There is one auth process for the user, shared across every worktree.
- **Tokens persist via the central secrets store.** Encrypted blob at `~/.singularity/secrets.json.enc`, keyed `{ namespace: "auth-tokens", key: "blob-v1" }`. Auth/central calls into secrets/central directly (same process; no HTTP round-trip). See [`plugins/infra/plugins/secrets/CLAUDE.md`](../infra/plugins/secrets/CLAUDE.md).
- **Browsers reach auth through the gateway's central-routes manifest.** `/api/auth/*` and the live-state WebSocket `/ws/central-notifications` are listed in `~/.singularity/central-routes.json` and forwarded to the central backend regardless of which subdomain the request arrived on. The OAuth redirect URI stays at bare `http://localhost:9000/api/auth/callback/<provider>` — the manifest covers it.
- **Cross-worktree sync is automatic.** When central mutates auth state (connect, disconnect, refresh) it calls `authStateResource.notify()` and central pushes updates to every browser tab subscribed to `/ws/central-notifications`. No fanout, no `~/.singularity/worktrees/*.json` enumeration.

## How a consumer plugin uses it

In-process (another central plugin):

```ts
import { getAccessToken, AuthNeedsConsentError } from "@plugins/auth/central";

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

A worktree backend that needs a token currently has no in-process helper — it would `fetch("http://localhost:9000/api/auth/token", …)` against central via the gateway. No such consumer exists yet; we add the helper when one does.

## How a provider sub-plugin is structured

```
plugins/auth/plugins/<id>/
├── package.json
├── shared/
│   ├── config.ts       # defineConfig("auth-<id>", { fields: { clientId: secretField(...), ... } })
│   └── index.ts        # export the descriptor + scopes
├── server/
│   └── index.ts        # ConfigV2.Register({ descriptor }) — surfaces fields in Settings UI
├── central/
│   ├── index.ts        # default-export plugin definition + side-effect import of register.ts
│   └── internal/
│       ├── descriptor.ts  # defineAuthProvider(...) — resolveCredentials uses readSecretConfig()
│       └── register.ts    # registerAuthProvider(descriptor) at module top-level
└── web/
    └── index.ts        # Auth.Provider({ id, name, icon }) + ConfigV2.WebRegister({ descriptor })
```

The provider's `central/internal/register.ts` runs at module init and calls `registerAuthProvider`. Module init order in `central/src/plugins.ts` puts the auth root plugin before its providers, so the registry is populated before any provider's first OAuth request. The worktree-side `server/index.ts` registers the config descriptor with config_v2 so the Settings UI renders the fields.

## Credentials

OAuth client credentials (`clientId`, `clientSecret`) are user-supplied via the Settings pane. Both use `secretField()` from config_v2, which stores values in the central secrets store under `{ namespace: "config-fields", key: "auth-<provider>.<field>" }`. Provider descriptors read them via `readSecretConfig()` from `@plugins/config_v2/plugins/fields/plugins/secret/central`.

Env-var overrides for developers:
- `SINGULARITY_AUTH_<PROVIDER>_CLIENT_ID`
- `SINGULARITY_AUTH_<PROVIDER>_CLIENT_SECRET` (where applicable)

Google uses Desktop-app + PKCE, but the token endpoint **still requires** `client_secret` (Google's implementation of RFC 8252 §8.6). Notion uses web-integration and also requires both. Shipping our own verified Google credentials is deferred — see [research/2026-04-24-global-auth-plugin.md](../../research/2026-04-24-global-auth-plugin.md) §I.

## Explicit deferrals

- **Multi-account per provider.** Schema keys accounts by `accountId`; code paths assume `"primary"` until we add an account picker.
- **Revoke on disconnect.** `descriptor.oauth.revoke` is a hook in the type but unused. MVP deletes locally only.
- **Rate-limited refresh retries.** Unconditional 60 s tick. Acceptable until something proves otherwise.
- **Scope-merging UI.** Incremental scope requests trigger full re-consent. Google's `include_granted_scopes=true` is already passed in `buildAuthorizeParams`, so providers should generally re-grant cleanly.
- **Keychain unlock UX.** If the secrets primitive cannot resolve its master key at boot, `authStateResource` returns providers with `credentialsConfigured: false` and the UI surfaces the configuration empty-state. No web UI to repair the keychain itself.

## Verification

See the Phase 3 plan in [research/2026-04-28-global-phase-3-auth-to-central.md](../../research/2026-04-28-global-phase-3-auth-to-central.md) for the manual smoke test.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Shared authentication infrastructure (OAuth 2.0, API keys). Surfaces an Accounts sidebar entry; provider sub-plugins extend the Auth.Provider slot. Worktree-side auth helpers. Provides getTokenFromCentral() for worktree plugins that need OAuth tokens. Centralized OAuth/API-key infrastructure for third-party services. Tokens persist via the central secrets store; auth runs on the central runtime so all worktrees share one connected state.
- Load-bearing: yes
- Web:
  - Slots: `Auth.Provider`
  - Contributes: `Pane.Register` "accounts", `Shell.Sidebar` "Accounts" → `component`
  - Uses: `notifications.toast`, `shell.Shell`
  - Exports: Types: `AuthProviderContribution`, `AuthProviderRowProps`, `ConnectArgs`, `ConnectButtonProps`, `ConnectResult`; Values: `accountsPane`, `Auth`, `ConnectButton`, `currentWorktreeName`, `disconnect`, `startConnectFlow`, `useAccountStatus`, `useAuthState`
- Cross-plugin:
  - Slot contributors: `google`, `notion`
  - Imported by: `google`, `google-drive`, `notion`, `setup-wizard`
  - Endpoint callers: `setup-wizard`
- Core:
  - Exports: Types: `ApiKeyConfig`, `AuthAccountState`, `AuthEnvAccessor`, `AuthIdentity`, `AuthProviderDescriptor`, `AuthProviderKind`, `AuthStateValue`, `DisconnectBody`, `GetAccessTokenArgs`, `GetTokenBody`, `OAuth2Config`, `ParsedTokenResponse`, `ResolvedCredentials`, `SetApiKeyBody`, `TokenFailure`, `TokenNeedsConsent`, `TokenResponse`, `TokenSuccess`; Values: `AuthCredentialsMissingError`, `AuthError`, `AuthKeychainLockedError`, `AuthNeedsConsentError`, `AuthProviderUnknownError`, `authStateResource`, `defineAuthProvider`, `disconnect`, `DisconnectBodySchema`, `getAuthState`, `getToken`, `GetTokenBodySchema`, `oauthCallback`, `oauthStart`, `setApiKey`, `SetApiKeyBodySchema`
- Server:
  - Exports: Types: `GetAccessTokenArgs`, `TokenFailure`, `TokenNeedsConsent`, `TokenResponse`, `TokenSuccess`; Values: `AuthCentralOfflineError`, `getTokenFromCentral`
- Central:
  - Exports: Types: `ApiKeyConfig`, `AuthAccountState`, `AuthEnvAccessor`, `AuthIdentity`, `AuthProviderDescriptor`, `AuthProviderKind`, `AuthStateValue`, `GetAccessTokenArgs`, `OAuth2Config`, `ParsedTokenResponse`, `ResolvedCredentials`, `TokenFailure`, `TokenNeedsConsent`, `TokenResponse`, `TokenSuccess`; Values: `AuthCredentialsMissingError`, `AuthError`, `AuthKeychainLockedError`, `AuthNeedsConsentError`, `AuthProviderUnknownError`, `authStateResource`, `defineAuthProvider`, `getAccessToken`, `getAccountIdentity`, `listProviders`, `registerAuthProvider`
  - Routes: `GET /api/auth/start/:provider`, `GET /api/auth/callback/:provider`, `POST /api/auth/disconnect/:provider`, `POST /api/auth/api-key/:provider`, `GET /api/auth/state`, `POST /api/auth/token`
- Sub-plugins:
  - **`google`** — Google OAuth provider — adds the Google row to the Accounts pane and a credentials section to Settings. Google OAuth 2.0 provider. Use with Drive, Gmail, Calendar consumer plugins via incremental scopes.
  - **`notion`** — Notion OAuth provider (scaffold). Adds the Notion row to the Accounts pane and a credentials section to Settings. Notion OAuth provider (scaffold). Surfaces in Accounts pane; end-to-end smoke not yet validated.

<!-- AUTOGENERATED:END -->
