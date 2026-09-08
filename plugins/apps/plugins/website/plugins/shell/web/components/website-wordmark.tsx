import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { landingPane } from "../panes";

/**
 * The brand wordmark in the shared site header's leading zone. Always navigates
 * home (the landing pane) — the one nav entry the shell owns itself.
 *
 * The full stop is the mark: it is the only place on the site where the brand
 * colour appears as identity rather than as an affordance, which is what lets
 * every other accent (a link, a button, the hero's gradient) read as something
 * you can act on.
 */
export function WebsiteWordmark() {
  const openPane = useOpenPane();
  return (
    <Button
      variant="ghost"
      onClick={() => openPane(landingPane, {}, { mode: "root" })}
    >
      <WordmarkText />
    </Button>
  );
}

/**
 * The wordmark as plain type — no navigation. The header's version is a button
 * that goes home; the footer's is the signature at the end of the document,
 * where there is nowhere left to go.
 */
export function WordmarkText() {
  return (
    <Text variant="label" className="font-semibold tracking-tight">
      equin
      <Text tone="primary">.</Text>
    </Text>
  );
}
