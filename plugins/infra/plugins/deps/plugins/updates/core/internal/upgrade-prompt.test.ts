import { describe, expect, test } from "bun:test";
import {
  PUSH_POLICY_TEXT,
  renderPrompt,
} from "@plugins/tasks/plugins/automations/core";
import {
  DEPS_UPGRADE_PROMPT,
  outdatedSections,
  type OutdatedUpdater,
} from "./upgrade-prompt";

const batch: OutdatedUpdater[] = [
  {
    updaterId: "mise",
    outdated: [{ name: "bun", current: "1.3.12", latest: "1.3.13" }],
    holdsFile: "mise.holds.jsonc",
  },
];

describe("DEPS_UPGRADE_PROMPT", () => {
  test("fills from the batch and the push policy, with no hole left", () => {
    const rendered = renderPrompt(DEPS_UPGRADE_PROMPT, {
      outdated: outdatedSections(batch),
      pushPolicy: PUSH_POLICY_TEXT.checks,
    });
    expect(rendered.ok).toBe(true);
    if (!rendered.ok) return;
    expect(rendered.text).toContain("- bun 1.3.12 → 1.3.13");
    expect(rendered.text).toContain("`mise` (holds in `mise.holds.jsonc`)");
    expect(rendered.text).toContain("You are authorized to push");
    expect(rendered.text).not.toContain("{{");
  });

  test("push never: no authorization reaches the agent", () => {
    const rendered = renderPrompt(DEPS_UPGRADE_PROMPT, {
      outdated: outdatedSections(batch),
      pushPolicy: PUSH_POLICY_TEXT.never,
    });
    expect(rendered.ok).toBe(true);
    if (!rendered.ok) return;
    expect(rendered.text).not.toContain("authorized to push");
    expect(rendered.text).toContain("Do NOT push.");
  });
});
