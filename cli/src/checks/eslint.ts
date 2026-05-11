import type { Check } from "./types";

async function getRoot(): Promise<string> {
  const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return (await new Response(proc.stdout).text()).trim();
}

export const eslintCheck: Check = {
  id: "eslint",
  description: "ESLint rules pass (global + plugin-contributed)",
  async run() {
    const root = await getRoot();
    const proc = Bun.spawn(["bunx", "eslint", "."], {
      cwd: root,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    if (exitCode === 0) return { ok: true };
    const combined = [stdout.trim(), stderr.trim()].filter(Boolean).join("\n").trim();
    return {
      ok: false,
      message: `ESLint reported violations:\n  ${combined.split("\n").join("\n  ")}`,
      hint: "Global rules live in cli/src/lint/; plugin rules in plugins/<name>/lint/index.ts.",
    };
  },
};
