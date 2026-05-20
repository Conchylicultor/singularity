import ts from "typescript";
import { readFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { discoverAllowDefaultProject } from "@plugins/framework/plugins/tooling/plugins/lint/core";

type CheckResult = { ok: true } | { ok: false; message: string; hint?: string };
type Check = { id: string; description: string; run(): Promise<CheckResult> };

async function getRoot(): Promise<string> {
  const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return (await new Response(proc.stdout).text()).trim();
}

function collectLeafTsconfigs(startPath: string): string[] {
  const leaves: string[] = [];
  const visited = new Set<string>();

  function walk(configPath: string) {
    const abs = resolve(configPath);
    if (visited.has(abs)) return;
    visited.add(abs);

    let raw: string;
    try {
      raw = readFileSync(abs, "utf-8");
    } catch {
      return;
    }
    const config = JSON.parse(raw);

    if (config.include && config.include.length > 0) {
      leaves.push(abs);
    }

    if (config.references) {
      for (const ref of config.references as { path: string }[]) {
        let refPath = resolve(dirname(abs), ref.path);
        if (!refPath.endsWith(".json")) {
          refPath = join(refPath, "tsconfig.json");
        }
        walk(refPath);
      }
    }
  }

  walk(startPath);
  return leaves;
}

function getProjectFiles(tsconfigPath: string): string[] {
  const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
  if (configFile.error) return [];
  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    dirname(tsconfigPath),
  );
  return parsed.fileNames.map((f) => resolve(f));
}

const check: Check = {
  id: "allow-default-project-in-sync",
  description:
    "allowDefaultProject entries don't overlap with tsconfig-covered files",

  async run() {
    const root = await getRoot();

    const leafTsconfigs = collectLeafTsconfigs(join(root, "tsconfig.json"));
    for (const standalone of ["plugins/framework/plugins/tooling/tsconfig.json", "cli/tsconfig.json"]) {
      const abs = resolve(root, standalone);
      if (!leafTsconfigs.includes(abs)) {
        leafTsconfigs.push(...collectLeafTsconfigs(abs));
      }
    }

    const projectFiles = new Set<string>();
    for (const tc of leafTsconfigs) {
      for (const f of getProjectFiles(tc)) {
        projectFiles.add(f);
      }
    }

    const adpFiles = discoverAllowDefaultProject(root);

    const conflicts: string[] = [];
    for (const relPath of adpFiles) {
      const abs = resolve(root, relPath);
      if (projectFiles.has(abs)) {
        conflicts.push(relPath);
      }
    }

    if (conflicts.length > 0) {
      return {
        ok: false,
        message: `Files discovered for allowDefaultProject that are already covered by a tsconfig project:\n${conflicts.map((f) => `  ${f}`).join("\n")}`,
        hint: "Either exclude the file from the tsconfig's include, or add it to isInLocalTsconfigInclude() in plugins/framework/plugins/tooling/plugins/lint/core/allow-default-project.ts.",
      };
    }

    return { ok: true };
  },
};

export default check;
