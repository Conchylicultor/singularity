import { grepCode } from "@plugins/framework/plugins/tooling/plugins/checks/core";

type CheckResult = { ok: true } | { ok: false; message: string; hint?: string };
type Check = { id: string; description: string; run(): Promise<CheckResult> };

async function getRoot(): Promise<string> {
  const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return (await new Response(proc.stdout).text()).trim();
}

// Legacy raw fetch("/api/...") call sites. Each entry records the file path
// and the number of violations present when the allowlist was created.
// Migrating a call DECREASES the count (always passes); adding a new raw
// fetch INCREASES it past the limit (fails the check).
const ALLOWED = new Map<string, number>([
  // Binary / special transport — cannot use fetchEndpoint
  ["plugins/crashes/web/report.ts", 1], // keepalive: true
  ["plugins/infra/plugins/attachments/web/internal/list.ts", 1], // polymorphic URL pattern
  ["plugins/infra/plugins/attachments/web/internal/upload.ts", 1], // FormData (multipart)
  ["plugins/screenshot/web/components/prompt-form.tsx", 1], // binary image/png
  ["plugins/screenshot/web/components/screenshot-button.tsx", 1], // binary image/png
  ["plugins/screenshot/web/components/screenshot-view.tsx", 1], // binary blob response
]);

const check: Check = {
  id: "endpoints:typed-web-fetches",
  description:
    'Web code must use fetchEndpoint/useEndpoint instead of raw fetch("/api/..."); legacy call sites are allowlisted with a per-file cap',
  async run() {
    const root = await getRoot();

    // Match direct fetch() calls and local wrappers (jsonFetch, postJson)
    // with a literal /api/ URL. The (<[^>]*>)? handles TS generic params
    // like jsonFetch<T>("/api/...").
    const matches = await grepCode({
      root,
      pattern: /(fetch|jsonFetch|postJson)(<[^>]*>)?\(["'`]\/api\//,
      grepArg: '(fetch|jsonFetch|postJson)(<[^>]*>)?\\(["\'`]/api/',
      maskStrings: false,
    });

    // Reproduce `git grep -c`: count matching lines per file.
    const counts = new Map<string, number>();
    for (const m of matches) {
      counts.set(m.path, (counts.get(m.path) ?? 0) + 1);
    }

    const offenders: string[] = [];

    for (const [path, count] of counts) {
      if (!path.includes("/web/")) continue;

      const allowed = ALLOWED.get(path) ?? 0;
      if (count > allowed) {
        offenders.push(
          `${path}: ${count} raw fetch call(s) (allowed: ${allowed})`,
        );
      }
    }

    if (offenders.length === 0) return { ok: true };

    return {
      ok: false,
      message: `${offenders.length} file(s) with raw fetch("/api/...") calls exceeding the allowlist:\n    ${offenders.join("\n    ")}`,
      hint: 'Use fetchEndpoint() / useEndpoint() / useEndpointMutation() from @plugins/infra/plugins/endpoints/web instead of raw fetch("/api/..."). See the endpoints plugin CLAUDE.md for the pattern.',
    };
  },
};

export default check;
