type BroadcastCommand = "build" | "push" | "check";

interface Broadcast {
  since?: string;
  until?: string;
  severity: "error" | "warning" | "info";
  message: string;
  commands?: BroadcastCommand[];
}

async function gitOutput(args: string[]): Promise<string | null> {
  try {
    const proc = Bun.spawn(["git", ...args], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const out = await new Response(proc.stdout).text();
    const code = await proc.exited;
    return code === 0 ? out.trim() : null;
  } catch {
    return null;
  }
}

async function isAncestor(
  ancestor: string,
  descendant: string,
): Promise<boolean> {
  try {
    const proc = Bun.spawn(
      ["git", "merge-base", "--is-ancestor", ancestor, descendant],
      { stdout: "pipe", stderr: "pipe" },
    );
    return (await proc.exited) === 0;
  } catch {
    return false;
  }
}

const SEPARATOR =
  "════════════════════════════════════════════════════════════════════════════════";

function printBroadcast(entry: Broadcast): void {
  const tag = entry.severity.toUpperCase();
  const line = `BROADCAST [${tag}]: ${entry.message}`;
  const block = [SEPARATOR, line, SEPARATOR].join("\n");

  if (entry.severity === "error") {
    console.error(block);
  } else if (entry.severity === "warning") {
    console.warn(block);
  } else {
    console.log(block);
  }
}

export async function checkBroadcasts(command: BroadcastCommand): Promise<void> {
  const branch = await gitOutput(["rev-parse", "--abbrev-ref", "HEAD"]);
  if (!branch || branch === "main") return;

  const raw = await gitOutput(["show", "origin/main:cli/broadcasts.json"]);
  if (!raw) return;

  let entries: Broadcast[];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;
    entries = parsed;
  } catch {
    return;
  }

  const mergeBase = await gitOutput(["merge-base", "HEAD", "origin/main"]);
  if (!mergeBase) return;

  const matching: Broadcast[] = [];
  for (const entry of entries) {
    if (entry.commands && !entry.commands.includes(command)) continue;
    const sinceOk = entry.since
      ? await isAncestor(mergeBase, entry.since)
      : true;
    const untilOk = entry.until
      ? await isAncestor(mergeBase, entry.until)
      : true;
    if (sinceOk && untilOk) matching.push(entry);
  }

  if (matching.length === 0) return;

  console.log();
  for (const entry of matching) {
    printBroadcast(entry);
  }
  console.log();

  if (matching.some((e) => e.severity === "error")) {
    process.exit(1);
  }
}
