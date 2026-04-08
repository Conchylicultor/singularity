# 2026-04-07 — Theia IDE Bootstrap

## Goal

Set up a minimal Eclipse Theia browser IDE in `v0/`.

## Final result

Theia 1.70.0 on Node 24 running at `http://localhost:3000` with: core, editor, Monaco, file navigator, terminal, preferences, markers, messages, workspace.

## Struggles & workarounds

### 1. No Node.js installed

The machine had no Node.js at all. Installed Node 20 via Homebrew as a first attempt.

### 2. Node 20 too old — `node-abi` requires Node >= 22.12.0

`yarn install` failed with:
```
error node-abi@4.28.0: The engine "node" is incompatible with this module.
Expected version ">=22.12.0". Got "20.20.2"
```

**Fix:** Installed Node 22 via `brew install node@22`, then later upgraded to Node 24 (Theia supports >= 22 and <= 24). Initially chose Node 22 out of LTS conservatism, but Node 24 works fine and is the better choice.

### 3. npm fails to install webpack in nested `node_modules`

First attempt used npm. The `@theia/application-manager` package expects a `webpack` binary in its own nested `node_modules/.bin/`, but npm's flat dependency resolution didn't put it there. Build failed with:

```
/bin/sh: node_modules/@theia/application-manager/node_modules/.bin/webpack: No such file or directory
Error: webpack exited with an unexpected code: 127.
```

Tried adding `webpack` + `webpack-cli` as explicit devDependencies — still broken.

**Fix:** Switched from npm to yarn (`npm install -g yarn`). Yarn's hoisting strategy correctly placed webpack where `@theia/application-manager` could find it. Theia projects have historically been yarn-first.

### 4. Unnecessary LTS conservatism — should have used Node 24 from the start

Theia supports Node >= 22 and <= 24. Initially installed Node 22 out of habit (LTS preference), but there was no reason not to use Node 24. Upgraded after user pointed this out — everything works identically.

**Lesson:** Check actual compatibility ranges instead of defaulting to LTS assumptions.

### 5. Theia 1.54.0 — inversify 6.x constructor mismatch

After a successful build with Theia 1.54.0, the server crashed on startup:

```
Error: The number of constructor arguments in the derived class NodeStopwatch
must be >= than the number of constructor arguments of its base class.
```

This is a known incompatibility between Theia 1.54.0 and inversify 6.2.x which shipped as a transitive dependency.

**Fix:** Upgraded all `@theia/*` packages from `1.54.0` to `1.70.0` (latest stable). Clean reinstall + rebuild resolved the issue.

## What worked without issues

- Yarn install with Theia 1.70.0 + Node 24
- Webpack build (frontend + backend) compiled successfully on first try
- `theia start` launched and responded HTTP 200 immediately

## Files created

- `v0/package.json` — Theia app manifest
- `v0/yarn.lock` — locked dependency tree
- `v0/plugins/` — empty directory for VS Code extension plugins
