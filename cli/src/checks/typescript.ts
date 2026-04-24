import type { Check } from "./types";

async function getRoot(): Promise<string> {
  const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return (await new Response(proc.stdout).text()).trim();
}

async function runTsc(cwd: string, args: string[]): Promise<{ ok: true } | { ok: false; errors: string }> {
  const proc = Bun.spawn(["bunx", "tsc", "--noEmit", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    proc.exited,
  ]);
  if (exitCode === 0) return { ok: true };
  return { ok: false, errors: stdout.trim() };
}

export const typescript: Check = {
  id: "typescript",
  description: "Frontend and server pass tsc --noEmit (no type errors)",
  async run() {
    const root = await getRoot();

    const [web, server] = await Promise.all([
      runTsc(`${root}/web`, ["-p", "tsconfig.app.json"]),
      runTsc(`${root}/server`, []),
    ]);

    if (web.ok && server.ok) return { ok: true };

    const sections: string[] = [];
    if (!web.ok) sections.push(`web:\n    ${web.errors.split("\n").join("\n    ")}`);
    if (!server.ok) sections.push(`server:\n    ${server.errors.split("\n").join("\n    ")}`);

    const combined = `${web.ok ? "" : web.errors}\n${server.ok ? "" : server.errors}`;
    const hasMissingModule = /error TS2307: Cannot find module/.test(combined);
    const hint = hasMissingModule
      ? "A \"Cannot find module\" error for a dep you didn't touch is usually a missing workspace link — run ./singularity build first (it re-runs bun install) and re-push. Otherwise: fix type errors before pushing; if a cast is necessary, fix the type definition instead."
      : "Fix type errors before pushing. If a cast is necessary, fix the type definition instead.";

    return {
      ok: false,
      message: `TypeScript type errors:\n  ${sections.join("\n  ")}`,
      hint,
    };
  },
};
