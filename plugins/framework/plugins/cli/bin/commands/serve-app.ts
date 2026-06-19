import type { Command } from "commander";
import { join, resolve } from "path";
import { REPO_ROOT, SINGULARITY_DIR } from "@plugins/infra/plugins/paths/server";
import { bootSelfContainedApp } from "@plugins/infra/plugins/launcher/server";

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
    .option("--web <path>", "Absolute path to the built web dist")
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
        web?: string;
        logLevel: string;
      }) => {
        // The launcher is a release entry point: SINGULARITY_DIR must already be
        // set in the environment, because every path constant is frozen at
        // import time and re-roots the whole install. We never silently default
        // to the dev ~/.singularity — that would pollute the developer's data
        // root with a release cluster, spec, and registry.
        if (!process.env.SINGULARITY_DIR) {
          console.error(
            "serve-app requires SINGULARITY_DIR to be set in its environment.\n" +
              "Path constants are frozen at import time, so the data root cannot be\n" +
              "changed mid-process. Invoke the launcher with an isolated root, e.g.:\n" +
              "\n" +
              "  SINGULARITY_DIR=$(mktemp -d /tmp/sonata-release.XXXX) \\\n" +
              "    bun plugins/framework/plugins/cli/bin/index.ts serve-app --name sonata --port 9100\n",
          );
          process.exit(1);
        }

        const port = Number(opts.port);
        if (!Number.isInteger(port) || port <= 0) {
          console.error(`Invalid --port: ${opts.port}`);
          process.exit(1);
        }

        const repoRoot = opts.repoRoot;
        const server =
          opts.server ?? resolve(repoRoot, "plugins/framework/plugins/server-core");
        const web =
          opts.web ?? resolve(repoRoot, "plugins/framework/plugins/web-core/dist");

        await bootSelfContainedApp({
          name: opts.name,
          server,
          web,
          port,
          repoRoot,
          logLevel: opts.logLevel,
          log: console.log,
        });

        const pidFile = join(SINGULARITY_DIR, "gateway.pid");
        console.log("");
        console.log(`App "${opts.name}" is serving.`);
        console.log(`  URL:  http://${opts.name}.localhost:${port}`);
        console.log(`  Root: ${SINGULARITY_DIR}`);
        console.log(`  PID:  ${pidFile}`);
        console.log(`  Logs: ${join(SINGULARITY_DIR, "logs")}/`);
      },
    );
}
