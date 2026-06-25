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

- **Rust toolchain** (`rustup` / `cargo`). The end-user machine needs none of
  this — the produced `.app`/`.dmg`/`.deb` ships compiled binaries + uses the
  system webview.
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

The Rust shell + config are scaffolded but **not yet compiled/verified** — the
repo's CI/dev host that produced this had no Rust toolchain. First build on a
Rust-equipped host should: generate icons, `cargo`/`tauri` compile, and confirm
the Tauri v2 webview API names used in `lib.rs` (`WebviewWindow::navigate`,
`PathResolver::{resource_dir,app_data_dir}`, the `resources` → `bundle` mapping).
Adjust those call sites if the installed Tauri 2.x revision differs.
