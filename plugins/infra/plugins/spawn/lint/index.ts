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
   *   tree, now an explicit file list (see below). The glob made "31 files are
   *   exempt because of where they live" invisible; the list says which files and
   *   why, one line each, and shrinks by deletion as sites migrate.
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
      "plugins/framework/plugins/cli/bin/migrations-interactive.ts",
      "research/**",

      // --- PERMANENT: genuinely streaming or long-lived children. After-exit
      // temp-file capture is structurally impossible for these — the output must
      // be read (or the input written) while the child is still alive, or the
      // child is meant to outlive the call entirely.
      // `spawnWait` reads "granted\n" off live stdout while holding stdin open as
      // the release channel: the whole protocol is the open pipe.
      "plugins/packages/plugins/host-semaphore/server/internal/host-semaphore.ts",
      // `pg_dump` → `pg_restore` stdin chaining: one child's stdout IS the other's stdin.
      "plugins/database/plugins/admin/server/internal/fork.ts",
      // `pg_dump -Fc` writes straight into a caller-chosen output file sink;
      // spawnCaptured only ever captures into its own temp files.
      "plugins/database/plugins/admin/server/internal/backup.ts",
      // Long-lived supervised child: the gateway process outlives the call.
      "plugins/infra/plugins/launcher/server/internal/boot.ts",
      // Long-lived preview server, started and left running.
      "plugins/release/server/internal/preview-manager.ts",
      // Release build: output is streamed to the live release log as it happens.
      "plugins/release/server/internal/run-release.ts",
      // Detached long-running `./singularity build`; the pid is recorded and the
      // child deliberately outlives the request that started it.
      "plugins/build/server/internal/run-build.ts",
      // Deploy runner: stdout/stderr are consumed line-by-line into the live
      // deploy log while the command runs.
      "plugins/apps/plugins/deploy/plugins/deployments/server/internal/run-deploy.ts",
      // Long-lived probe children, supervised for the lifetime of the experiment.
      "plugins/debug/plugins/paging-probe/server/internal/probe-host.ts",
      // `tmux load-buffer -b … -` reads the buffer from stdin as a stream.
      "plugins/conversations/plugins/runtime-tmux/server/internal/tmux-runtime.ts",
      // `git archive | tar -x`: a pipe chain between two live children.
      "plugins/review/plugins/plugin-changes/server/internal/handle-plugin-changes.ts",

      // --- TEMPORARY: plain capture sites with no streaming requirement. Each is
      // a mechanical `spawnCaptured` conversion; they are listed rather than
      // migrated only to keep this commit reviewable. Delete an entry as its file
      // migrates — the list is the Stage-2 backlog, and it is done when it is empty.
      "plugins/auth/plugins/apple-signing/server/internal/certificate-endpoint.ts", // openssl
      "plugins/backup/server/internal/assemble-archive.ts", // tar -czf
      "plugins/backup/server/internal/reconcile-backups.ts", // gzip -t
      "plugins/code-explorer/plugins/file-resolve/server/internal/resolve-handler.ts", // git ls-files
      "plugins/code-explorer/server/internal/get-file-content.ts", // git show
      "plugins/code-explorer/server/internal/image-handler.ts", // git show (image bytes)
      "plugins/code-explorer/server/internal/resolve-ref.ts", // git rev-parse
      "plugins/code-explorer/server/internal/tree-handler.ts", // git ls-tree
      "plugins/conversations/plugins/conversation-progress/server/internal/heuristic-job.ts", // git
      "plugins/conversations/plugins/runtime-tmux/server/internal/process-tree.ts", // ps
      "plugins/debug/plugins/health-monitor/server/internal/host-sampler.ts", // vm_stat
      "plugins/debug/plugins/sentinel/server/internal/worker/sample.ts", // ps
      "plugins/infra/plugins/git-watcher/server/internal/current-branch-ref.ts", // git symbolic-ref
      "plugins/infra/plugins/git-watcher/server/internal/git-common-dir.ts", // git rev-parse
      "plugins/plugin-meta/plugins/plugin-health/server/internal/staleness.ts", // git log
      "plugins/primitives/plugins/commit-list/server/internal/run-git.ts", // git log
      "plugins/review/plugins/plugin-changes/server/internal/main-plugins-dir.ts", // git
      "plugins/stats/plugins/commits/server/internal/commit-timestamps.ts", // git log
      "plugins/tasks/server/internal/handle-repo-info.ts", // git remote get-url
      "plugins/tasks/server/internal/push-watcher.ts", // git
    ],
  },
};
