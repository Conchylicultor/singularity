import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { Button, cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import {
  Text,
  type TextVariant,
} from "@plugins/primitives/plugins/css/plugins/text/web";
import { landingPane } from "../panes";

/**
 * The brand wordmark in the shared site header's leading zone. Always navigates
 * home (the landing pane) — the one nav entry the shell owns itself.
 *
 * It is the `inline` aspect of a button — the text IS the control, with no
 * padded box around it — so the wordmark starts on the header's left edge, the
 * same edge every band below starts on. A padded button would indent it.
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
      aspect="inline"
      onClick={() => openPane(landingPane, {}, { mode: "root" })}
    >
      <WordmarkText />
    </Button>
  );
}

/**
 * The wordmark as plain type — no navigation. The header's version is a button
 * that goes home, set at the heading size; the footer's is the signature at the
 * end of the document, smaller and greyer, where there is nowhere left to go.
 */
export function WordmarkText({
  variant = "heading",
  className,
}: {
  variant?: TextVariant;
  className?: string;
}) {
  return (
    <Text
      variant={variant}
      className={cn("font-bold tracking-tight", className)}
    >
      equin
      <Text tone="primary">.</Text>
    </Text>
  );
}
