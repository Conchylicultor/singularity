import { declareRuntimeNamespace } from "@plugins/infra/plugins/runtime-identity/core";
import {
  REPO_ROOT,
  checkoutNamespace,
} from "@plugins/infra/plugins/paths/core";

// `bun test` preload (registered in the root bunfig.toml `[test]` section).
//
// Worktree-scoped server code — the `db` pool, the per-worktree log dir,
// config_v2, reports — asks `runtimeNamespace()` which namespace this process
// serves. A real backend is told by the gateway (`--namespace <ns>`); a bare
// `bun test` is told by nobody, so any suite that transitively touches that code
// would throw the moment it ran.
//
// The default belongs HERE, not at each read site: those must stay loud in
// production (a backend with no identity is a real bug), but a test run's
// sensible identity is simply the checkout it runs from.
//
// `checkoutNamespace` MINTS the namespace — it asks git which root owns `.git`
// and applies the elision rule — rather than casting the checkout's directory
// basename. The two agree for every agent worktree and for main, which is
// exactly why the shortcut is tempting and exactly why it is banned
// (`namespace-identity/no-laundered-checkout-namespace`): they stop agreeing the
// moment a composition is served from a non-main checkout.
//
// That mint is async, hence the top-level await. A preload is an ES module, so
// the whole preload is awaited before the first test file is imported — which
// is the property that matters: no suite can observe an undeclared namespace.
declareRuntimeNamespace(await checkoutNamespace(REPO_ROOT));
