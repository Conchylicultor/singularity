import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { landingPane } from "../panes";

/**
 * The brand wordmark in the shared site header's Start zone. Always navigates
 * home (the landing pane) — the one nav entry the shell owns itself.
 */
export function WebsiteWordmark() {
  const openPane = useOpenPane();
  return (
    <Button
      variant="ghost"
      onClick={() => openPane(landingPane, {}, { mode: "root" })}
    >
      <Text variant="label" className="font-semibold tracking-tight">
        equin
      </Text>
    </Button>
  );
}
