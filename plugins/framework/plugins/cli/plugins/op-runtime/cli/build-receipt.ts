// The receipt moved to `core/internal/` so a reader OUTSIDE the CLI can have
// it. Writing it is a CLI act; reading it is not — an e2e script has to know
// whether the deploy answering its target is the build this checkout published,
// and the `e2e` runtime may reach a plugin's `core` barrel but never its `cli`
// one. This shim keeps `./build-receipt`, the path this plugin's `cli` barrel
// names the receipt by, resolving unchanged.
export * from "../core/internal/build-receipt";
