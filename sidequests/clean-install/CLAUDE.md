# Clean install — a from-scratch install run, without a second Mac

Host tooling, not part of the app (same spirit as
[`sidequests/monitors`](../monitors/CLAUDE.md)). Answers: if someone with no
Homebrew/Bun/Go/Postgres/`~/.singularity` follows `docs/setup.md` exactly as
written, where do they get stuck, and how long does each step take?

## Why a VM

This Mac already runs a real Singularity instance: gateway on the hardcoded
port 9000, embedded Postgres, state under `~/.singularity`. A second macOS
user account would still see this Mac's Homebrew and would collide on port
9000, so it isn't clean. Instead this runs inside a throwaway VM via
[Tart](https://github.com/cirruslabs/tart) (`~/.local/bin/tart`), cloned
fresh each time from `ghcr.io/cirruslabs/macos-tahoe-vanilla` (no
Homebrew/Xcode CLT/Bun/Go/Postgres/Claude Code — just an `admin` user with
remote login on). The VM has its own network/disk and a capped 6 core /
12 GB, so its port 9000, `~/.singularity` and Postgres are its own; nothing
under this Mac's `~/.singularity` is ever touched.

## Running it

```bash
sidequests/clean-install/run.sh
```

Clones a VM named `si-clean-<timestamp>`, sizes it, boots it headless, runs
each `steps.sh` step inside it in order (logging the exact command, output,
exit code, duration). Success: prints a summary table, deletes the VM.
Failure: stops immediately, leaves the VM running, and prints the exact
command to get a shell inside it.

Flags: `--gui` (window instead of headless — needed once, for the
interactive Claude Code login), `--keep` (don't delete on success), `--from
N` (resume a kept VM at step N instead of reinstalling from scratch),
`--name`/`--out`/`--cpu`/`--memory` (see `run.sh --help`).

`run.sh` refuses to run if its output dir would land under `~/.singularity`,
or if the VM name doesn't start with `si-clean` — both so a mistake here
can't reach the real instance.

## `steps.sh`

`docs/setup.md` turned into runnable steps, in the order a brand-new reader
hits them — including trying the prerequisite table's `brew install`
commands before Homebrew exists (expected to fail; that failure is the
finding, not a bug to route around). Each step is tagged `from-docs`,
`documented-elsewhere`, or `undocumented-knowledge` so the summary reads as
a diff against the docs. Nothing in the repo gets fixed as part of a run.
New steps get appended as later runs discover more gaps — see the comment
at the top of `steps.sh`.

## Gaps

- Apple Silicon + macOS 26 only. Not Intel, older macOS, or Linux.
- The guest's `admin` user has passwordless `sudo`; a real user types one.
  Still worth noting `sudo` use as friction even though the guest won't
  prompt.
- Claude Code login needs a person and `--gui --keep`, then resume with
  `--from`.
- The vanilla image has no Tart Guest Agent, so `tart exec` doesn't work
  against it at all — every guest command goes over ssh. `run.sh` generates
  a throwaway ed25519 key per run, types the guest's default password
  (`admin`) into it exactly once via `expect` (ships with macOS, nothing to
  install) to authorize that key, then uses key auth for every step after.
  A `--keep --from` resume reuses the same key from the output dir instead
  of prompting again.

Two tags beyond the three above appear in `steps.sh`. `harness-only` marks a
step no user could take, there so one run can also show what breaks past a
blocker. `<fn>_EXPECT_FAIL=1` marks a failure already written down in the
findings: the run records it and carries on, instead of stopping. Everything
else stops the run with the guest left running.

## Results

A run's findings go on the "Installable by others" track's wiki page as
agent sub-pages, not under `research/`. See
`research/2026-09-17-global-clean-install-baseline.md` for the full plan and
the checkpoints a baseline run is scored against.
