import type { Command } from "commander";
import { resolve } from "path";
import { dataRoot, REPO_ROOT } from "@plugins/infra/plugins/paths/server";
import {
  bootSelfContainedApp,
  gatewayPidFile,
} from "@plugins/infra/plugins/launcher/server";
import { gatewayLogs } from "@plugins/infra/plugins/launcher/data-dirs";
import {
  asNamespace,
  namespaceUrl,
} from "@plugins/infra/plugins/namespace/core";

const DEFAULT_PORT = 9100;

export function registerServeApp(program: Command) {
  program
    .command("serve-app")
    .description(
      "Boot a packaged app's full runtime (gateway + embedded PG + app DB) under an isolated data root",
    )
    .option("--name <name>", "App namespace (subdomain)", "sonata")
    .option("--port <port>", "Gateway listen port", String(DEFAULT_PORT))
    .option(
      "--repo-root <path>",
      "Root of the code/bundle tree (gateway + server-core + web dist)",
      REPO_ROOT,
    )
    .option("--server <path>", "Absolute path to the backend working dir")
    // Which app the backend boots. Defaults to `--name`, which is what the
    // namespace meant back when the backend picked its registry by looking for
    // a `server.composition.<name>.generated.ts` on disk; naming it explicitly
    // is what replaced that guess. Separate from `--name` because a namespace is
    // `<composition>.<checkout>` and only a single-label one is also an id.
    .option(
      "--composition <id>",
      "Composition whose filtered server registry the backend boots (default: --name)",
    )
    // REQUIRED, with no default. `serve-app` boots under an isolated
    // SINGULARITY_DIR (see the action), and every derivable dist path
    // (`worktreeArtifacts.webDist(...)`) resolves inside THAT root — which holds
    // no dist, because nothing ever built into it. A checkout-relative default
    // is equally wrong: no checkout carries a dist any more. There is no correct
    // default, so demand the path rather than invent one.
    .requiredOption("--web <path>", "Absolute path to the built web dist")
    .option(
      "--log-level <level>",
      "Gateway log level: debug|info|warn|error",
      "info",
    )
    .action(
      async (opts: {
        name: string;
        port: string;
        repoRoot: string;
        server?: string;
        composition?: string;
        web: string;
        logLevel: string;
      }) => {
        // The launcher is a release entry point: SINGULARITY_DIR must already
        // be set in the environment, because it re-roots the whole install. The
        // check is on the ENV rather than on `dataRoot()` precisely because
        // `dataRoot()` cannot express "explicitly set" — unset, it answers with
        // the dev ~/.singularity, and silently defaulting to that would pollute
        // the developer's data root with a release cluster, spec, and registry.
        if (!process.env.SINGULARITY_DIR) {
          console.error(
            "serve-app requires SINGULARITY_DIR to be set in its environment.\n" +
              "Invoke the launcher with an isolated root, e.g.:\n" +
              "\n" +
              "  SINGULARITY_DIR=$(mktemp -d /tmp/sonata-release.XXXX) \\\n" +
              "    bun plugins/framework/plugins/cli/bin/index.ts serve-app \\\n" +
              "      --name sonata --port 9100 --web <bundle>/web\n",
          );
          process.exit(1);
        }

        const port = Number(opts.port);
        if (!Number.isInteger(port) || port <= 0) {
          console.error(`Invalid --port: ${opts.port}`);
          process.exit(1);
        }

        // `--name` is operator input: validate before it becomes a subdomain, a
        // spec dir and a database name.
        const name = asNamespace(opts.name);

        const repoRoot = opts.repoRoot;
        const server =
          opts.server ??
          resolve(repoRoot, "plugins/framework/plugins/server-core");

        await bootSelfContainedApp({
          name,
          server,
          web: opts.web,
          composition: opts.composition ?? opts.name,
          port,
          repoRoot,
          logLevel: opts.logLevel,
          log: console.log,
        });

        // One of `dataRoot()`'s two sanctioned uses: naming the root itself,
        // here to report it and to reach a pidfile under it. Never to join a
        // path under it — that is what `defineDataDir` is for.
        const root = dataRoot();
        const pidFile = gatewayPidFile(root);
        console.log("");
        console.log(`App "${opts.name}" is serving.`);
        // A packaged app listens on its own port, not the dev gateway's.
        console.log(`  URL:  ${namespaceUrl(name, "", port)}`);
        console.log(`  Root: ${root}`);
        console.log(`  PID:  ${pidFile}`);
        console.log(`  Logs: ${gatewayLogs.path}/`);
      },
    );
}
