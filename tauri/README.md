# tauri — desktop release shell

The generic Tauri (Rust) shell that turns a staged self-contained app bundle into
a host-platform desktop app. Driven by `./singularity release --composition <name>
--target tauri` (see `plugins/framework/plugins/cli/bin/commands/release.ts`).

It is **app-agnostic**: it reads the composition name + port from the bundled
`RELEASE.json` at runtime, brings up the stack via the bundled `launch` binary,
points its webview at the local gateway (`http://localhost:<port>/` — reachable
without a `.localhost` subdomain thanks to the gateway's `-default-namespace`
route), and runs the bundled `teardown` binary on exit. No Sonata- or
composition-specific code lives here.

## How `release --target tauri` uses this project

1. Stages the same self-contained bundle as the web target (compiled `server` /
   `launch` / `pg` / `pgbouncer` + vendored natives + web `dist` + `RELEASE.json`)
   and additionally compiles `teardown`.
2. Copies that staged tree into `src-tauri/resources/bundle/` (gitignored).
3. Writes `src-tauri/tauri.conf.override.json` (gitignored) with the composition's
   `productName` / `identifier` / window title, merged over `tauri.conf.json` via
   `--config`.
4. Runs `bun x @tauri-apps/cli@2 build` (or `dev` with `--dev`).

## Layout

```
src-tauri/
├── Cargo.toml
├── build.rs
├── tauri.conf.json          # base config (committed)
├── tauri.conf.override.json # per-release overrides (GITIGNORED, generated)
├── capabilities/default.json
├── frontend/index.html      # placeholder shown until the window navigates to the gateway
├── icons/                   # app icons (GITIGNORED — generate, see below)
├── resources/bundle/        # the staged app bundle (GITIGNORED, copied per build)
└── src/{main.rs, lib.rs}
```

## Build prerequisites (build host only — NOT the end user)

- **Rust toolchain** (`cargo` / `rustc`). Managed via `mise` — it's declared in
  the repo `mise.toml` (`rust = "stable"`), so `mise install` provisions it
  alongside `bun`/`go`. The end-user machine needs none of this — the produced
  `.app`/`.dmg`/`.deb` ships compiled binaries + uses the system webview.
- **Platform webview SDK**: macOS — Xcode Command Line Tools (system WKWebView);
  Linux — `libwebkit2gtk-4.1-dev` + `libgtk-3-dev`.
- **App icons** must exist under `src-tauri/icons/` before `tauri build`
  (referenced by `tauri.conf.json → bundle.icon`). Generate the full set once from
  a single ≥512×512 source PNG:

  ```sh
  bun x @tauri-apps/cli@2 icon path/to/app-icon.png
  ```

  Icons are gitignored (generated artifacts); commit a source `app-icon.png` per
  app if you want reproducible regeneration.

## Status

**Compiled and stack-verified on a Rust host (Tauri 2.11.3, Rust 1.96.0,
macOS arm64).** `./singularity release --composition sonata --target tauri`
produces `Sonata.app` (identifier `ai.equin.sonata`, embedded bundle + RELEASE.json).
The Tauri-v2 API names in `lib.rs` all check out on 2.11.x — notably
`WebviewWindow::navigate(&self, Url)` compiles with an immutable binding,
`PathResolver::{resource_dir,app_data_dir}` resolve, and the
`resources → bundle` mapping lands at `<resource_dir>/bundle`.

The self-contained stack was verified by driving the `.app`'s embedded
`launch`/`teardown` binaries with the exact env the shell sets: bare
`http://localhost:<port>/` serves the composition SPA single-origin (gateway
`-default-namespace` route), a row written to the app-data DB survives a full
teardown + relaunch, the PG socket sits at `/tmp/equin-<app>/.s.PGSQL.<port>`
(31 bytes, well under the 104-byte limit), and teardown leaves no orphaned
gateway/postgres/pgbouncer processes.

Not yet verified (needs a human on an interactive desktop session): the live
WKWebView **window render** and **audio playback** — both require an Aqua GUI
session, which a headless/automation shell lacks.

### Known caveats

- **`.dmg` bundling needs a GUI session.** `bundle_dmg.sh` drives Finder via
  AppleScript to style the disk-image window; in a non-interactive shell that
  AppleEvent times out (`-1712`) and the dmg step fails *after* `Sonata.app` is
  already built. The `.app` is unaffected. Build the dmg from a logged-in
  desktop session (with Automation/TCC permission), or restrict
  `bundle.targets` to `["app"]` for headless builds.
- **Embedded PG port is picked per launch.** The embedded Postgres opens a
  loopback TCP listener (`listen_addresses=127.0.0.1`, present for Zero), which
  would default to 5433 and collide with a dev cluster or another desktop
  instance. The shell now picks a free port at setup and passes it as
  `SINGULARITY_PG_PORT` to both `launch` and `teardown` (mirroring the web
  preview path, `plugins/release/server/internal/preview-manager.ts`), so the
  desktop app coexists with a running dev cluster and other instances.
