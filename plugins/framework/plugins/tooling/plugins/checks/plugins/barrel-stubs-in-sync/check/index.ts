import { existsSync, readFileSync } from "fs";
import { relative } from "path";
import {
  barrelStubsPath,
  renderBarrelStubs,
} from "@plugins/framework/plugins/tooling/plugins/codegen/core";

type CheckResult = { ok: true } | { ok: false; message: string; hint?: string };
type Check = { id: string; description: string; run(): Promise<CheckResult> };

async function getRoot(): Promise<string> {
  const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return (await new Response(proc.stdout).text()).trim();
}

const check: Check = {
  id: "barrel-stubs-in-sync",
  description:
    "auto-stubs.generated.ts matches auto-stub-packages.ts and current .d.ts files",
  async run() {
    const root = await getRoot();
    const file = barrelStubsPath(root);
    const rel = relative(root, file);
    if (!existsSync(file)) {
      return {
        ok: false,
        message: `${rel} is missing`,
        hint: "Run `./singularity build` to generate it.",
      };
    }
    let expected: string;
    try {
      expected = renderBarrelStubs({ root });
    } catch (e) {
      return {
        ok: false,
        message: `barrel-stubs-gen failed: ${e instanceof Error ? e.message : String(e)}`,
        hint: "Fix the error in auto-stub-packages.ts or stubs.ts.",
      };
    }
    if (readFileSync(file, "utf8") !== expected) {
      return {
        ok: false,
        message: `${rel} is out of sync with auto-stub-packages.ts or node_modules .d.ts files`,
        hint: "Run `./singularity build` and commit the regenerated file.",
      };
    }
    return { ok: true };
  },
};

export default check;
