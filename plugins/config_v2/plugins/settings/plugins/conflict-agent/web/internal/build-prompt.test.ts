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
    expect(prompt).toContain('- `mode` — mine: `"fast"`, upstream: `"safe"`');
    expect(prompt).toContain("Fields upstream changed that I had not touched:");
    expect(prompt).toContain(
      "- `retries` — mine: `3`, upstream: `5` — How many times to retry",
    );
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

  test("tells the agent the config layer is forked per worktree", () => {
    const prompt = buildConflictPrompt(ctx());
    expect(prompt).toContain(
      `\`${USER_CONFIG_DIR_DISPLAY}/<worktree>/conversations/preprompts/config.jsonc\``,
    );
    expect(prompt).toContain("forked per worktree");
  });

  test("asks for the descriptor's own history, and a source-level fix", () => {
    const prompt = buildConflictPrompt(ctx());
    expect(prompt).toContain("`defineConfig`");
    expect(prompt).toContain("`git log`");
  });
});

describe("invalid documents", () => {
  test("lists the schema issues and the stored values", () => {
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
    expect(prompt).toContain("- `items` — mine: `[1,2]`, upstream: `[]`");
    expect(prompt).toContain("no longer validates against the current schema");
  });

  test("omits the issues section when the entry carried none", () => {
    const prompt = buildConflictPrompt(ctx({ kind: "invalid" }));
    expect(prompt).not.toContain("Schema issues:");
  });
});

describe("value formatting", () => {
  test("truncates a single long serialized value", () => {
    const long = "x".repeat(500);
    const prompt = buildConflictPrompt(
      ctx({ fields: [field({ key: "blob", mine: long, upstream: "short" })] }),
    );

    expect(prompt).toContain("…");
    expect(prompt).not.toContain(long);
    // Clipped at the cap (plus the ellipsis), not merely shortened.
    const line = prompt.split("\n").find((l) => l.startsWith("- `blob`"))!;
    const mine = line.slice(
      line.indexOf("mine: `") + 7,
      line.indexOf("`, upstream"),
    );
    expect(mine).toHaveLength(201);
    expect(mine.endsWith("…")).toBe(true);
  });

  test("spells an absent value instead of printing `undefined`", () => {
    const prompt = buildConflictPrompt(
      ctx({
        fields: [field({ key: "gone", mine: undefined, upstream: "new" })],
      }),
    );

    expect(prompt).toContain('- `gone` — mine: `(not set)`, upstream: `"new"`');
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
