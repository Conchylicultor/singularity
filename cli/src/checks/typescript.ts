import type { Check } from "./types";

async function getRoot(): Promise<string> {
  const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return (await new Response(proc.stdout).text()).trim();
}

export const typescript: Check = {
  id: "typescript",
  description: "Frontend passes tsc --noEmit (no type errors)",
  async run() {
    const root = await getRoot();
    const webDir = `${root}/web`;

    const proc = Bun.spawn(
      ["bunx", "tsc", "--noEmit", "-p", "tsconfig.app.json"],
      { cwd: webDir, stdout: "pipe", stderr: "pipe" },
    );
    const [stdout, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      proc.exited,
    ]);

    if (exitCode === 0) return { ok: true };

    const errors = stdout.trim();
    return {
      ok: false,
      message: `TypeScript type errors:\n    ${errors.split("\n").join("\n    ")}`,
      hint: "Fix type errors before pushing. If a cast is necessary, fix the type definition instead.",
    };
  },
};
