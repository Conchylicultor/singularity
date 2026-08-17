# Worktree removal monitor — who deletes `.claude/worktrees/<name>`?

A root LaunchDaemon that streams Apple's Endpoint Security events (`eslogger`) and
records **every process that deletes a file inside an agent worktree**, or that
execs a command naming one.

Output: `~/.singularity/logs/worktree-removal-monitor.jsonl` (one JSON per line).

## Why

Agent worktrees have been disappearing while their conversation was still open —
22 attempts currently have an unclosed conversation and no checkout. The app has
its own audit for this (`plugins/infra/plugins/worktree/plugins/removal-audit`),
and for the 2026-08-16 loss of `att-1786846099-ld96` it produced **nothing**: no
line on its channel, no `worktree-removed-externally` report.

That audit cannot be made to answer this on its own, for a structural reason: its
baseline is the in-memory `readdir` snapshot it takes when the main backend boots,
and it diffs against that on filesystem events. Main restarts on every push to
main — 16 times in the window that lost that worktree. Anything that vanishes
while main is between processes is simply absent from the next seed, so the diff
has nothing to notice, forever.

This monitor sits *underneath* the app instead, which buys three things the
in-app audit structurally cannot have:

- it sees the deletion **whoever does it** — a subprocess (`git worktree remove`,
  `rm -rf`) *or* an in-process delete from a Node/Bun app, which an exec-only
  trace would miss entirely;
- it **survives the app restarting**, which is the exact blind spot above;
- it names the **responsible process**, so "the Singularity server did this" is
  distinguishable from "something else did".

## How it works

Endpoint Security has **no `rmdir` event**. So the monitor keys on the file
`unlink` burst that any tree removal must produce — a worktree checkout is ~8000
files, and the *first* unlink already names the actor. The rest are collapsed.

```
eslogger exec unlink          # raw ES stream, one JSON event per line
  | grep -F  /.claude/worktrees/    # cheap pre-filter: jq never sees the firehose
  | grep -vE /(node_modules|dist|.git|.cache|coverage|.turbo)/   # volume only
  | jq        # project to attribution fields + emit "<key>\t<epoch>\t<json>"
  | awk       # collapse the burst per (worktree,pid,kind); capture live ancestry
```

Two notes on that pipeline:

- **The second `grep` is a volume filter, not a correctness one.** A real tree
  removal also deletes `plugins/`, `docs/`, `research/` — it cannot hide behind
  the excluded build dirs. It exists so a routine `./singularity build` clearing
  `dist/` doesn't push thousands of lines/sec through `jq`.
- **`jq` supplies the clock** (`now`), because macOS `awk` is BWK awk and has no
  `systime`/`strftime`.

## What a record looks like

```json
{"t":"...","kind":"unlink","worktree":"att-1786846099-ld96",
 "path":".../att-1786846099-ld96/plugins/x.ts",
 "argv":null,"newexe":null,
 "pid":4242,"ppid":99,"oppid":99,
 "exe":"/usr/bin/git","signid":"com.apple.git","team":null,"resp":77,
 "wallclock":"2026-08-17T09:00:00Z",
 "ancestry":"4242 99 epot git -C /... worktree remove --force /..."}
```

| field | what it answers |
|---|---|
| `exe` / `signid` / `team` | which binary, and whose signature — `com.apple.git` vs a bun/Node app |
| `pid` / `ppid` / `oppid` | the acting process and its parent (`oppid` survives reparenting) |
| `resp` | the **responsible** process — the app that ultimately owns this work |
| `argv` (exec only) | the literal command, e.g. `git worktree remove --force <path>` |
| `ancestry` | live `ps` line for the actor, captured at the moment of the delete |

`ancestry` can be empty when the process exits before `ps` runs; `signid` and
`resp` still identify it.

### Baseline traffic is not silence

A healthy log is not empty. Anything that rewrites files inside a checkout shows
up — a `./singularity push` rebase, a build clearing a non-excluded path. Those
records are the point of comparison, not noise to suppress: what matters is a
record whose actor is not the app, arriving when a checkout goes missing.

### Isolated events lag; bursts do not

`awk` block-buffers its input from a pipe, so ONE stray unlink can sit unwritten
until more traffic arrives (~20s observed). Harmless for the case this exists to
catch: removing a checkout is ~8000 unlinks, which flushes instantly. Do not
"fix" this by reaching for `stdbuf` — macOS does not ship it.

The monitor also records Singularity's **own** legitimate reaps
(`plugins/debug/plugins/worktree-cleanup` → `reapAttempt`). That is deliberate —
it is the control group. A disappearance whose actor is not the server settles
the question.

## Install

Root-only, so this is a **LaunchDaemon** (`/Library/LaunchDaemons`), not a
LaunchAgent like the other monitors here.

```sh
# 0. does Endpoint Security work for you at all? (prints 2 JSON lines, then stops)
sudo eslogger exec | head -2
```

ES clients need root *and* TCC, and the two failures are distinguishable — this
step is the whole uncertainty, so do it first:

- `ES_NEW_CLIENT_RESULT_ERR_NOT_PRIVILEGED` — not root. You dropped the `sudo`.
- `ES_NEW_CLIENT_RESULT_ERR_NOT_PERMITTED` — root, but TCC says no. Grant **Full
  Disk Access** to your terminal (System Settings → Privacy & Security) and retry.

```sh
# 1. install + start
chmod +x sidequests/monitors/worktree-removal/worktree-removal-monitor.sh
sudo cp sidequests/monitors/worktree-removal/com.epot.worktree-removal-monitor.plist /Library/LaunchDaemons/
sudo chown root:wheel /Library/LaunchDaemons/com.epot.worktree-removal-monitor.plist
sudo launchctl load /Library/LaunchDaemons/com.epot.worktree-removal-monitor.plist
```

```sh
# 2. verify — expect a pid and a monitor-start line
sudo launchctl list | grep worktree-removal-monitor
tail -2 ~/.singularity/logs/worktree-removal-monitor.jsonl
cat /tmp/worktree-removal-monitor.err          # should be empty
```

```sh
# 3. prove it CAPTURES — a clean monitor-start proves nothing. Every failure
#    this monitor has had was silent: it ran, logged, errored not at all, and
#    saw zero events. So always end-to-end test with a canary.
C=/Users/epot/__A__/dev/singularity/.claude/worktrees/<any-live-worktree>/.monitor-canary
echo hi > "$C" && rm -f "$C"
sleep 25 && grep monitor-canary ~/.singularity/logs/worktree-removal-monitor.jsonl
```

A plain FILE, deliberately: the app's own removal audit diffs *directories*
directly under `.claude/worktrees/`, so a canary directory would make it file a
spurious `worktree-removed-externally` report. A file is invisible to it.

If the daemon starts but `…-monitor.err` shows an ES client error, TCC is
denying the daemon rather than your terminal. The daemon's TCC subject is its
`ProgramArguments[0]` (`/bin/bash`), so either add `/bin/bash` to Full Disk
Access (System Settings → the `+` → ⌘⇧G → `/bin/bash`), or fall back to running
it in the foreground from a terminal that already has FDA:

```sh
sudo nohup sidequests/monitors/worktree-removal/worktree-removal-monitor.sh >/dev/null 2>&1 &
```

The foreground form does not survive a reboot — fine for a first catch, not for
a long hunt.

## Read it

```sh
# every recorded touch of a worktree, newest last
jq -c 'select(.worktree)' ~/.singularity/logs/worktree-removal-monitor.jsonl

# just the actors, deduped — the answer to "who"
jq -r 'select(.worktree) | "\(.wallclock) \(.worktree) \(.signid // .exe) pid=\(.pid) resp=\(.resp)"' \
  ~/.singularity/logs/worktree-removal-monitor.jsonl | sort -u
```

Cross-check a hit against the app's own view: if `reapAttempt` ran, the fork DB
`att-<id>` and `~/.singularity/config/att-<id>` are gone too. If those survive
while the checkout does not, it was **not** the app.

## Update

The plist points at the script's path in the **main checkout**, so edits take
effect on the next daemon restart — and only once merged to main:

```sh
sudo launchctl kickstart -k system/com.epot.worktree-removal-monitor
```

## Uninstall

```sh
sudo launchctl unload /Library/LaunchDaemons/com.epot.worktree-removal-monitor.plist
sudo rm /Library/LaunchDaemons/com.epot.worktree-removal-monitor.plist
```

## Cost

Steady state is one `eslogger`, one `grep`, one `jq`, one `awk` — all idle until
something touches a worktree path. The pre-filter is a fixed-string `grep`, so
the system-wide unlink firehose is discarded before any JSON parsing. The log is
deduped per (worktree, pid, kind) per 5 minutes, so it stays kilobytes.

## Complementary in-app fix (not done)

Independent of this monitor, the app should reconcile `.claude/worktrees` against
the `attempts` table **at boot** and report any retained attempt whose checkout
is missing. That would not tell us *who*, but it would always tell us *when*,
within one restart — instead of the loss being undetectable after the fact.
