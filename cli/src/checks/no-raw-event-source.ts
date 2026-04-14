import type { Check } from "./types";

async function getRoot(): Promise<string> {
  const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return (await new Response(proc.stdout).text()).trim();
}

const ALLOWED_PATHS = ["plugin-core/"];

export const noRawEventSource: Check = {
  id: "no-raw-event-source",
  description:
    "SSE streams must go through the shared ReconnectingEventSource primitive (not raw `new EventSource`)",
  async run() {
    const root = await getRoot();
    const proc = Bun.spawn(
      [
        "git",
        "grep",
        "-n",
        "--",
        "new EventSource(",
        "*.ts",
        "*.tsx",
      ],
      { cwd: root, stdout: "pipe", stderr: "pipe" },
    );
    const out = (await new Response(proc.stdout).text()).trim();
    if (!out) return { ok: true };

    const offenders = out
      .split("\n")
      .filter((line) => {
        const path = line.split(":", 1)[0];
        if (ALLOWED_PATHS.some((p) => path.startsWith(p))) return false;
        if (path.startsWith("research/")) return false;
        return true;
      });

    if (offenders.length === 0) return { ok: true };

    return {
      ok: false,
      message: `raw \`new EventSource(\` found in ${offenders.length} place(s):\n    ${offenders.join("\n    ")}`,
      hint:
        "Use `new ReconnectingEventSource(...)` from `@core` instead. It handles reconnection and inter-tab sharing (leader election) so opening many tabs doesn't saturate the server.",
    };
  },
};
