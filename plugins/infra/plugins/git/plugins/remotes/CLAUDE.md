# remotes

Two questions about this checkout's remotes, answered the same way by the CLI
and by the server:

| You want | Use |
|---|---|
| May this checkout publish its work, and to which remote? | `resolvePublishTarget(root)` |
| Which remote does it receive changes FROM? | `resolveUpstreamRemote(root)` |

It sits under the `git` umbrella — "has git state moved, and must I read it
again?" — because that is the shape of the answer: a measurement, taken once and
re-taken when the thing it measured moves.

## Publishing is a capability, not a mode

There is no author/user flag, and nothing to set when you clone. Only the remote
can say whether you may write to it, so we **ask it** — once — and write down
what it said.

The question is asked as `git push --dry-run --force <remote> HEAD:refs/heads/singularity-write-probe`.
`--dry-run` does everything except send the update, and "everything" includes
opening the session and requesting `receive-pack`, which is where every hosted
forge decides whether this identity may write. Three details are load-bearing:

- **The ref is not `main`.** Pushing `main` asks two questions at once, and git
  answers the second one — "is my main a fast-forward of yours?" — locally,
  before permissions ever come up. An author whose local `main` sat one commit
  behind would fail that check and be filed as read-only, switching their own
  publishing off. A ref nobody has raises no such question.
- **`--force` is inert here.** Under `--dry-run` there is no update to force; it
  is present only to drop the remaining client-side checks, so the probe can
  only fail for reasons that come from the remote.
- **`GIT_TERMINAL_PROMPT=0`** (and `BatchMode=yes`, when the user has not set
  their own `GIT_SSH_COMMAND`) is the difference between a probe and a hang: git
  would otherwise ask for a username on the terminal, with this child's output
  going to a capture file where nobody would see the question.

## "No" is four different facts

A failed probe is classified, not collapsed, and only **one** of the four is
recorded:

| outcome | what it means | recorded? |
|---|---|---|
| `read-only` | the remote recognised us and refused the write | **yes** |
| `no-credentials` | the remote never learned who we are (a key it does not accept, a prompt we suppressed) | no |
| `unreachable` | nobody answered — DNS, the network, or our own deadline | no |
| `probe-failed` | git failed for a fourth reason; we print its words rather than pick the nearest label | no |

Recording an unreachable remote would write down something nobody said, and
every later push would tell the user they may not publish because their wifi was
off once. Recording a rejected ssh key would turn a fixable credential into a
permanent verdict. Both stay local **for that run only**, and say so.

The classification order is the whole design, because git prints the specific
cause and the generic consequence together, and the generic line is identical
for causes that mean opposite things:

```
ssh: Could not resolve hostname github.com: …      <- unreachable
fatal: Could not read from remote repository.

git@github.com: Permission denied (publickey).     <- no credentials
fatal: Could not read from remote repository.
```

So the specific causes are tested first, `unreachable` before `no-credentials`
before `denied`, and the shared line is matched by nothing. The samples in
`classify.test.ts` are verbatim git output, including that tail.

**`classifyRemoteFailure(capture)` is exported**, because a failed `fetch` asks
the same question a failed push probe does — `upstream status` reads it to tell
an offline laptop from a real error. It answers only about a FAILURE and throws
on a capture that succeeded: "you may publish" is a publish-only conclusion and
is drawn by the prober, not by the shared table. `denied` therefore means "the
remote refused the operation" — write access for a probe, read access for a
fetch.

## Why the answer lives in `.git/config`

```
singularity.publish.remote = origin | none
singularity.publish.url    = <the URL that answer was probed for>
```

Same tier and the same shape as `core.hooksPath` (which `build` self-heals) and
the merge drivers: one file per clone, untracked, shared by every worktree of
it, readable with no server running. `git config --local` from a linked worktree
reads the clone's config, not a per-worktree one, which is exactly the scope
wanted.

**It is a cache of a measurement, not a setting** — that is why it is not a
`config_v2` value. A user-editable "may I publish" field would be a claim the
remote can contradict, and does, every time it refuses a push.

It is re-probed when:

- the recorded URL is not the remote's current URL, character for character. A
  user who re-points origin from https to ssh has changed how they authenticate
  to it, which is the input to the recorded answer — so the cheap thing is to
  ask again. (This exact-text rule is deliberately *not* the normalised repo
  identity used against `CANONICAL_REPO_URL`.)
- a **real** push is rejected — `recordPushRejection(root)`. That rejection is
  newer evidence than the cache: it is the remote answering the exact question
  the cache holds a guess at. A checkout that loses its write access therefore
  heals itself into local mode on the next push instead of failing forever.
- the user asks: `git config --local --unset singularity.publish.remote`, which
  the printed local-only line names.

## Upstream falls out of the same facts

1. a remote literally named `upstream` — the user has already said so;
2. else we cannot publish, so the remote we cannot write to **is** upstream (the
   ordinary clone: one remote, read-only);
3. else we publish somewhere that is not `CANONICAL_REPO_URL`, which is a fork —
   add `upstream` pointing at the canonical repo and use it;
4. else we publish to the canonical repo, so this is the author's checkout and
   there is nothing above it (`{ kind: "none", reason: "is-publisher" }`).

Step 2 deliberately includes `unreachable`: a remote we could not reach today is
still the remote this checkout came from. That failure belongs to whoever
fetches, not to a claim that there is no upstream at all.

`CANONICAL_REPO_URL` is also in `CITATION.cff`; deduplicating the two belongs to
whoever adds the README that reads both.

## Boundaries

`core/` here means **runtime-neutral Node, not web-safe** — every module behind
the barrel spawns `git` through `infra/spawn`. Never import this from `web/`.
It is a pure library: a `core/` barrel with no plugin definition and no
contributions, like `plugin-id`.

`gitConfigGet` / `gitConfigSet` / `gitConfigUnset` live here as the one spelling
of a `--local` config read or write; `git-artifacts`' merge-driver registration
imports them rather than keeping its own copy.

## What it cannot tell you

A **local filesystem** remote answers the probe from a `git receive-pack` that
never writes an object under `--dry-run`, so a read-only directory may well
accept the probe and refuse the real push. That path is covered by
`recordPushRejection`, not by the probe: the first real push fails loudly with
git's own error, and the re-probe it triggers is what records the answer. Hosted
forges (GitHub, GitLab, Gitea) decide at the service request, which the probe
does reach, so for them the probe is the answer.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: May this checkout publish, and where does it receive from? — the write-access probe (`git push --dry-run`, classified into denied / no-credentials / unreachable rather than one 'no'), its `.git/config` cache of that measurement, and the upstream resolution built from the same facts.
- Core:
  - Uses:
    - `infra/spawn.spawnCaptured`
    - `infra/spawn.spawnExpectOk`
  - Exports (types):
    - `LocalReason`
    - `PublishTarget`
    - `RemoteCapture`
    - `RemoteFailure`
    - `UpstreamRemote`
  - Exports (values):
    - `CANONICAL_REPO_URL`
    - `classifyRemoteFailure`
    - `describePublishTarget`
    - `gitConfigGet`
    - `gitConfigSet`
    - `gitConfigUnset`
    - `PUBLISH_REMOTE`
    - `recordPushRejection`
    - `remoteUrl`
    - `resolvePublishTarget`
    - `resolveUpstreamRemote`
    - `sameRepoUrl`
- Cross-plugin:
  - Imported by: `upstream`

<!-- AUTOGENERATED:END -->
