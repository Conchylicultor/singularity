import { describe, expect, test } from "bun:test";
import type {
  ConfigConflictContext,
  ConfigConflictField,
} from "@plugins/config_v2/plugins/settings/web";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { USER_CONFIG_DIR_DISPLAY } from "@plugins/infra/plugins/paths/plugins/display/core";
import { buildConflictPrompt, describeConflict } from "./build-prompt";

function field(over: Partial<ConfigConflictField> = {}): ConfigConflictField {
  return {
    key: "enabled",
    mine: true,
    upstream: false,
    status: "conflict",
    ...over,
  };
}

function ctx(over: Partial<ConfigConflictContext> = {}): ConfigConflictContext {
  return {
    storePath: "conversations/preprompts/config.jsonc",
    name: "preprompts",
    kind: "hash",
    fields: [field()],
    actionClassName: cn("bg-warning/20 hover:bg-warning/30"),
    ...over,
  };
}

describe("hash conflicts", () => {
  test("separates true conflicts from upstream-only changes", () => {
    const prompt = buildConflictPrompt(
      ctx({
        fields: [
          field({ key: "mode", mine: "fast", upstream: "safe" }),
          field({
            key: "retries",
            mine: 3,
            upstream: 5,
            status: "upstream-changed",
            description: "How many times to retry",
          }),
          field({
            key: "untouched",
            mine: 1,
            upstream: 1,
            status: "unchanged",
          }),
        ],
      }),
    );

    expect(prompt).toContain(
      "Resolve the config conflict on the **preprompts** config (`conversations/preprompts/config.jsonc`).",
    );
    expect(prompt).toContain("Fields we both changed (these need a decision):");
    expect(prompt).toContain("- `mode`");
    expect(prompt).toContain("Fields upstream changed that I had not touched:");
    expect(prompt).toContain("- `retries` — How many times to retry");
    // "unchanged" fields carry no decision, so they are omitted entirely.
    expect(prompt).not.toContain("untouched");
  });

  test("omits a section rather than printing an empty bullet list", () => {
    const prompt = buildConflictPrompt(
      ctx({ fields: [field({ status: "upstream-changed" })] }),
    );

    expect(prompt).not.toContain("Fields we both changed");
    expect(prompt).toContain("Fields upstream changed that I had not touched:");
  });

  test("names the scope when the conflict is on a scoped config", () => {
    const prompt = buildConflictPrompt(ctx({ scopeId: "app:sonata" }));
    expect(prompt).toContain(
      "(`conversations/preprompts/config.jsonc`, scope `app:sonata`)",
    );
  });
});

// The whole point of the prompt: not a summary of the two documents, but where
// to read them.
describe("the conflicting paths", () => {
  test("names the override and the origin it went stale against", () => {
    const prompt = buildConflictPrompt(ctx());
    const base = `${USER_CONFIG_DIR_DISPLAY}/<worktree>/conversations/preprompts`;

    expect(prompt).toContain(`- my values: \`${base}/config.jsonc\``);
    expect(prompt).toContain(
      `- the new upstream default: \`${base}/config.origin.jsonc\``,
    );
  });

  test("names the repo file the upstream default is propagated from", () => {
    expect(buildConflictPrompt(ctx())).toContain(
      "`config/conversations/preprompts/config.jsonc`",
    );
  });

  test("splices the scope's own @app segment into the stored paths", () => {
    const prompt = buildConflictPrompt(ctx({ scopeId: "app:sonata" }));
    const base = `${USER_CONFIG_DIR_DISPLAY}/<worktree>/conversations/preprompts`;

    expect(prompt).toContain(
      `- my values: \`${base}/@app/sonata/config.jsonc\``,
    );
    expect(prompt).toContain(`${base}/@app/sonata/config.origin.jsonc`);
    // The repo pointer stays the BASE path — no scoped origin is ever committed.
    expect(prompt).toContain("`config/conversations/preprompts/config.jsonc`");
  });

  test("tells the agent the config layer is forked per worktree", () => {
    expect(buildConflictPrompt(ctx())).toContain("forked per worktree");
  });

  test("prints no values at all — the files carry them", () => {
    const prompt = buildConflictPrompt(
      ctx({
        fields: [
          field({ key: "mode", mine: "my-secret-value", upstream: "theirs" }),
        ],
      }),
    );

    expect(prompt).not.toContain("my-secret-value");
    expect(prompt).not.toContain("theirs");
    expect(prompt).not.toContain("mine:");
    expect(prompt).not.toContain("upstream:");
  });
});

// The rule that exists because an agent, told to "fix any code-level cause",
// rewrote the config engine's merge for a task that was a two-file merge.
describe("the resolve-by-hand rule", () => {
  test("is on both variants", () => {
    for (const kind of ["hash", "invalid"] as const) {
      expect(buildConflictPrompt(ctx({ kind }))).toContain(
        "**Resolve this by hand, and change no code.**",
      );
    }
  });

  // Not just "does not ASK for a fix" — the prompt must not put a code change on
  // the table at all, in any phrasing. An agent offered the option takes it.
  test("no variant raises a code change as an option", () => {
    for (const kind of ["hash", "invalid"] as const) {
      const prompt = buildConflictPrompt(ctx({ kind }));
      expect(prompt).not.toContain("fix that at the source");
      expect(prompt).not.toContain("fix any code-level cause");
      expect(prompt).not.toContain("code fix");
      expect(prompt).not.toContain("code-level");
      expect(prompt).not.toContain("defineConfig");
    }
  });
});

// What the user typed in the popover is the specific instruction for THIS
// conflict; everything the builder emits is boilerplate on every conflict.
describe("the user's own context", () => {
  test("points at the heading the popover appends it under, and gives it priority", () => {
    for (const kind of ["hash", "invalid"] as const) {
      const prompt = buildConflictPrompt(ctx({ kind }));
      expect(prompt).toContain("`## Context`");
      expect(prompt).toContain("override anything above");
    }
  });

  test("is the last thing said, so nothing above it reads as a correction", () => {
    for (const kind of ["hash", "invalid"] as const) {
      const prompt = buildConflictPrompt(ctx({ kind }));
      expect(prompt.trimEnd().endsWith("override anything above.")).toBe(true);
    }
  });
});

describe("invalid documents", () => {
  test("lists the schema issues and points at the files", () => {
    const prompt = buildConflictPrompt(
      ctx({
        kind: "invalid",
        issues: [
          { path: "items.6", message: "Expected string, received number" },
          { path: "(root)", message: "Expected object" },
        ],
        fields: [
          field({
            key: "items",
            mine: [1, 2],
            upstream: [],
            status: "conflict",
          }),
        ],
      }),
    );

    expect(prompt).toContain("Resolve the invalid stored config on");
    expect(prompt).toContain("- `items.6` — Expected string, received number");
    expect(prompt).toContain("- `(root)` — Expected object");
    expect(prompt).toContain("no longer validates against the current schema");
    expect(prompt).toContain("The two files that disagree — read both:");
    expect(prompt).toContain(
      "Reconcile my stored document against the current one by hand",
    );
  });

  test("omits the issues section when the entry carried none", () => {
    const prompt = buildConflictPrompt(ctx({ kind: "invalid" }));
    expect(prompt).not.toContain("Schema issues:");
  });
});

describe("the popover's summary line", () => {
  test("counts the fields carrying a decision, not the ones that differ", () => {
    expect(
      describeConflict(
        ctx({
          fields: [
            field({ key: "mode", status: "conflict" }),
            field({ key: "cadence", status: "upstream-changed" }),
            field({ key: "quiet", status: "unchanged" }),
          ],
        }),
      ),
    ).toBe(
      "Upstream defaults for conversations/preprompts/config.jsonc moved — 1 field needs a decision.",
    );
  });

  test("says so plainly when nothing needs a decision", () => {
    expect(
      describeConflict(
        ctx({
          fields: [field({ key: "cadence", status: "upstream-changed" })],
        }),
      ),
    ).toBe(
      "Upstream defaults for conversations/preprompts/config.jsonc moved under my overrides.",
    );
  });

  test("counts the schema issues for an invalid document", () => {
    expect(
      describeConflict(
        ctx({
          kind: "invalid",
          issues: [
            { path: "items.6", message: "Expected string" },
            { path: "(root)", message: "Unrecognized key" },
          ],
        }),
      ),
    ).toBe(
      "conversations/preprompts/config.jsonc no longer validates against its schema (2 issues).",
    );
  });
});
