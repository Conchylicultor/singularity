import { describe, expect, test } from "bun:test";
import {
  promptKey,
  resolveAnswer,
  type DetectedPrompt,
  type MigrationAnswer,
} from "./migrations";

function tablePrompt(name: string, fromName?: string): DetectedPrompt {
  const options: DetectedPrompt["options"] = [
    { index: 0, action: "create", label: `+ ${name} create` },
  ];
  if (fromName) {
    options.push({
      index: 1,
      action: "rename",
      label: `~ ${fromName} › ${name} rename`,
      fromName,
    });
  }
  return {
    index: 0,
    entityType: "table",
    entityName: name,
    context: null,
    question: `Is ${name} table created or renamed from another table?`,
    options,
  };
}

function columnPrompt(table: string, col: string, fromName?: string): DetectedPrompt {
  const options: DetectedPrompt["options"] = [
    { index: 0, action: "create", label: `+ ${col} create` },
  ];
  if (fromName) {
    options.push({
      index: 1,
      action: "rename",
      label: `~ ${fromName} › ${col} rename`,
      fromName,
    });
  }
  return {
    index: 0,
    entityType: "column",
    entityName: col,
    context: table,
    question: `Is ${col} column in ${table} table created or renamed from another column?`,
    options,
  };
}

function enumPrompt(name: string): DetectedPrompt {
  return {
    index: 0,
    entityType: "enum",
    entityName: name,
    context: null,
    question: `Is ${name} enum created or renamed from another enum?`,
    options: [{ index: 0, action: "create", label: `+ ${name} create` }],
  };
}

describe("promptKey", () => {
  test("table prompt → table:<name>", () => {
    expect(promptKey(tablePrompt("staged_config_default"))).toBe(
      "table:staged_config_default",
    );
  });

  test("column prompt → column:<table>.<name>", () => {
    expect(promptKey(columnPrompt("tasks", "priority"))).toBe(
      "column:tasks.priority",
    );
  });

  test("enum prompt → enum:<name>", () => {
    expect(promptKey(enumPrompt("task_status"))).toBe("enum:task_status");
  });
});

describe("resolveAnswer (keyed replay)", () => {
  test("create resolves to option index 0", () => {
    const prompt = tablePrompt("staged_config_default", "reorder_staged_default");
    const answer: MigrationAnswer = { action: "create" };
    expect(resolveAnswer(prompt, answer)).toBe(0);
  });

  test("rename resolves to the matching option index", () => {
    const prompt = tablePrompt("staged_config_default", "reorder_staged_default");
    const answer: MigrationAnswer = {
      action: "rename",
      from: "reorder_staged_default",
    };
    expect(resolveAnswer(prompt, answer)).toBe(1);
  });

  test("keyed map lookup → resolveAnswer returns the right index", () => {
    const prompt = tablePrompt("b", "a");
    const keyed = new Map<string, MigrationAnswer>([
      [promptKey(prompt), { action: "rename", from: "a" }],
    ]);
    const a = keyed.get(promptKey(prompt));
    expect(a).toBeDefined();
    expect(resolveAnswer(prompt, a!)).toBe(1);
  });

  test("stale rename source not in options → throws (keyed path catches → unanswered)", () => {
    // The branch authored a rename from "old_a", but after rebase the prompt no
    // longer offers that source. resolveAnswer must throw so the keyed path can
    // mark it unanswered rather than silently picking a wrong option.
    const prompt = tablePrompt("b", "different_source");
    const answer: MigrationAnswer = { action: "rename", from: "old_a" };
    expect(() => resolveAnswer(prompt, answer)).toThrow(/rename from "old_a"/);
  });
});
