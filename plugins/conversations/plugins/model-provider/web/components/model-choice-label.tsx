import { choiceHint, choiceLabel, type ModelChoice } from "../../core";
import { useModelCatalog } from "../internal/catalog";

/**
 * A model choice's row label: "Opus" with the version it runs today as a muted
 * hint ("· 5.5"), or a pinned version's full name ("Opus 5"). The one rendering
 * every model menu uses, so the hint looks the same in all of them. The hint
 * reads the live catalog, so it moves the moment discovery moves the family.
 */
export function ModelChoiceLabel({ choice }: { choice: ModelChoice }) {
  const catalog = useModelCatalog();
  const hint =
    catalog.status === "ready" ? choiceHint(choice, catalog.data) : undefined;
  return (
    <>
      {choiceLabel(choice)}
      {hint && <span className="text-muted-foreground"> · {hint}</span>}
    </>
  );
}
