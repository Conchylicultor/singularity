import { describe, expect, it } from "bun:test";
import type { FieldOption } from "../../core";
import { selectChoices } from "./select-choices";

const OPTIONS: FieldOption[] = [
  { value: "open", label: "Open" },
  { value: "done", label: "Done" },
];

describe("selectChoices", () => {
  it("draws the field's options in declared order when nothing is selected", () => {
    expect(selectChoices(OPTIONS, [])).toEqual([
      { option: OPTIONS[0]!, listed: true },
      { option: OPTIONS[1]!, listed: true },
    ]);
  });

  it("keeps a selected option listed", () => {
    expect(selectChoices(OPTIONS, ["done"]).map((c) => c.listed)).toEqual([
      true,
      true,
    ]);
  });

  it("gives a selected-but-unlisted value its own chip, first, labelled by its raw value", () => {
    const choices = selectChoices(OPTIONS, ["gone", "open"]);
    expect(choices[0]).toEqual({
      option: { value: "gone", label: "gone" },
      listed: false,
    });
    expect(choices.map((c) => c.option.value)).toEqual([
      "gone",
      "open",
      "done",
    ]);
  });

  it("never duplicates an option that is both listed and selected", () => {
    const choices = selectChoices(OPTIONS, ["open", "done"]);
    expect(choices).toHaveLength(2);
  });

  it("draws every unlisted value, not just the first", () => {
    const choices = selectChoices(OPTIONS, ["gone", "waiting"]);
    expect(choices.filter((c) => !c.listed).map((c) => c.option.value)).toEqual(
      ["gone", "waiting"],
    );
  });

  it("a field with no options at all is still fully editable", () => {
    expect(selectChoices([], ["gone"])).toEqual([
      { option: { value: "gone", label: "gone" }, listed: false },
    ]);
  });
});
