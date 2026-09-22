import { choiceHint, choiceLabel, type ModelChoice } from "../../core";

/**
 * A model choice's row label: "Opus" with the version it runs today as a muted
 * hint ("· 5.5"), or a pinned version's full name ("Opus 5"). The one rendering
 * every model menu uses, so the hint looks the same in all of them.
 */
export function ModelChoiceLabel({ choice }: { choice: ModelChoice }) {
  const hint = choiceHint(choice);
  return (
    <>
      {choiceLabel(choice)}
      {hint && <span className="text-muted-foreground"> · {hint}</span>}
    </>
  );
}
