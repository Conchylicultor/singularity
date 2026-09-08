import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { prototypeDetailPane } from "../panes";
import type { PrototypeStageProps } from "../slots";
import { ScaledIframe } from "./scaled-iframe";

/**
 * The Compare stage: a horizontally-scrolling row of scaled live iframes, one
 * per prototype. Each is labeled and clickable — clicking swaps the pane to that
 * prototype, which lands the reader back on whichever stage they were on.
 *
 * Layout is inline styles for the dynamic scaling geometry (not banned className
 * layout utilities).
 */
export function CompareStage({ gallery, version }: PrototypeStageProps) {
  const openPane = useOpenPane();
  return (
    <div
      className="h-full w-full"
      style={{
        display: "flex",
        gap: "1rem",
        overflowX: "auto",
        padding: "1rem",
      }}
    >
      {gallery.map((meta) => (
        <div
          key={meta.name}
          style={{
            display: "flex",
            flexDirection: "column",
            flex: "0 0 360px",
            minWidth: 0,
            height: "100%",
          }}
        >
          <button
            type="button"
            onClick={() =>
              openPane(
                prototypeDetailPane,
                { name: meta.name },
                { mode: "swap" },
              )
            }
            className="rounded-md border text-left"
            style={{ flex: "1 1 auto", minHeight: 0, overflow: "hidden" }}
          >
            <ScaledIframe meta={meta} version={version} />
          </button>
          <Text as="div" variant="caption" tone="muted" className="pt-xs">
            {meta.title}
          </Text>
        </div>
      ))}
    </div>
  );
}
