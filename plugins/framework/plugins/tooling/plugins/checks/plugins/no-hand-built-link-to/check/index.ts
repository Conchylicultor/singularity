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

const check: Check = {
  id: "no-hand-built-link-to",
  description:
    "Notification/toast `linkTo` must be built from a route (`<route>.link(app, params)`), never a hand-written app-rooted path literal",
  async run() {
    const root = await getRoot();
    // Flags a hand-built app-rooted link literal: `linkTo: "/…"` or
    // `` linkTo: `/…` ``. A `.link(...)` call, `null`, or a variable does not
    // match (it isn't a string literal opening with `/`). `maskStrings: false`
    // because the `/` we look for legitimately lives inside the string literal.
    const matches = await grepCode({
      root,
      pattern: /linkTo:\s*['"`]\//,
      grepArg: "linkTo:",
      fixed: false,
      maskStrings: false,
    });

    const offenders = matches
      .filter((m) => !m.path.startsWith("research/"))
      .map((m) => `${m.path}:${m.line}:${m.text}`);

    if (offenders.length === 0) return { ok: true };

    return {
      ok: false,
      message: `hand-built \`linkTo\` path literal found in ${offenders.length} place(s):\n    ${offenders.join("\n    ")}`,
      hint:
        "Build the link from its route descriptor instead: `<route>.link(app, params)` using `defineRoute`/`defineApp` from `@plugins/primitives/plugins/pane/core`. " +
        "E.g. `linkTo: conversationRoute.link(agentManagerApp, { convId })` rather than a hand-written `/agents/c/<id>` string. " +
        "This keeps the app base path and segment in one source of truth so a route rename can never silently break a notification deep link.",
    };
  },
};

export default check;
