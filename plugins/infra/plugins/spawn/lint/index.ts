import noRawBunSpawn from "./no-raw-bun-spawn";

export default {
  name: "spawn-safety",
  rules: {
    "no-raw-bun-spawn": noRawBunSpawn,
  },
  /**
   * Globs where the rule is not enforced, keyed by rule id. The root eslint.config
   * reads this generically and flips the rule off for these paths — it never
   * names this rule or these files itself.
   *
   * - TEST files: a test spinning up a throwaway child (git fixtures, the
   *   rule's own RuleTester strings) is scaffolding, not a durable spawn site;
   *   production spawn code always lives outside tests, which the rule still
   *   guards. (Mirrors sink-safety's test exemption.)
   * - Plugin server trees: WAS one directory glob covering every plugin server
   *   tree, then an explicit file list of 31, now down to the 11 permanent ones
   *   below. The glob made "31 files are exempt because of where they live"
   *   invisible; the list says which files and why, one line each. It shrank by
   *   deletion as sites migrated, and the migratable half is now gone — what is
   *   left is only what temp-file capture structurally cannot do.
   * - `migrations-interactive.ts`: drizzle-kit's interactive create-vs-rename
   *   prompts must be parsed from live stdout while keystrokes are written back
   *   to stdin, which is impossible over after-exit temp files. Extracted into
   *   its own file so this ignore stays surgical.
   * - The research tree: the wedge repro deliberately exercises the bug.
   */
  ignores: {
    "no-raw-bun-spawn": [
      "**/*.test.ts",
      "**/*.test.tsx",
      "plugins/framework/plugins/cli/plugins/migrations/cli/migrations-interactive.ts",
      // The `bun-runtime` check's probe. It is the one file whose PURPOSE is an
      // extra stdio pipe: it proves the running Bun does not close a finished
      // child's extra fds a second time (oven-sh/bun#33828), which it cannot do
      // without handing a child one. Temp-file capture would remove the very
      // thing under test. It spawns `/bin/sh -c 'printf hi >&3'`, which exits
      // immediately, so the wedge this rule guards has no room to happen.
      "plugins/framework/plugins/tooling/plugins/checks/plugins/bun-runtime/check/internal/fd-double-close-probe.ts",
      "research/**",

      // --- PERMANENT: genuinely streaming or long-lived children. After-exit
      // temp-file capture is structurally impossible for these — the output must
      // be read (or the input written) while the child is still alive, or the
      // child is meant to outlive the call entirely.
      //
      // A pipe from one child INTO another is NOT such a case: write the first
      // child's output to a file and hand the path to the second. Bun relays
      // `stdin: other.stdout` through JS and drops the stream's tail when the
      // writer exits — the DB fork (`pg_dump | pg_restore`) lost it 6 runs in 15.
      // `spawnWait` reads "granted\n" off live stdout while holding stdin open as
      // the release channel: the whole protocol is the open pipe.
      "plugins/packages/plugins/host-semaphore/server/internal/host-semaphore.ts",
      // `pg_dump -Fc` writes straight into a caller-chosen output file sink;
      // spawnCaptured only ever captures into its own temp files.
      "plugins/database/plugins/admin/server/internal/backup.ts",
      // The supervised-run primitive, and the one place `detached: true` is
      // meant to be written. Every property that makes it exempt is the point
      // of it: the child outlives the call BY DESIGN (that is what surviving a
      // backend restart means), its stdout and stderr are a caller-owned file
      // descriptor rather than temp files read after exit, and its output is
      // published while it runs by tailing that file. As build, release and
      // deploy migrate onto it, their three entries below are deleted — the
      // exemption converges on this one line instead of spreading.
      "plugins/infra/plugins/jobs/plugins/supervised-job/server/internal/run/supervisor.ts",
      // Long-lived supervised child: the gateway process outlives the call.
      "plugins/infra/plugins/launcher/server/internal/boot.ts",
      // Long-lived preview server, started and left running.
      "plugins/release/server/internal/preview-manager.ts",
      // Long-lived probe children, supervised for the lifetime of the experiment.
      "plugins/debug/plugins/paging-probe/server/internal/probe-host.ts",
      // `tmux load-buffer -b … -` reads the buffer from stdin as a stream.
      "plugins/conversations/plugins/runtime-tmux/server/internal/tmux-runtime.ts",

      // The TEMPORARY Stage-2 backlog that used to sit here is EMPTY: all 20
      // plain-capture sites moved onto `spawnCaptured` and each took a bound
      // while it was being touched, which is what made `SpawnOptions`'s
      // mandatory-bound union expressible. Nothing belongs below this line
      // except a genuinely streaming or long-lived child, which goes in the
      // permanent group above WITH its written justification.
    ],
  },
};
