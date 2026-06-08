import { MdChevronLeft, MdChevronRight } from "react-icons/md";
import { Sonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { useDraft } from "@plugins/primitives/plugins/persistent-draft/web";

/**
 * The right-hand panel column hosting the `Sonata.Section` contributions
 * (track mixer, chord readout, …). Collapsible to a thin rail so the active
 * display can take the full width; the choice persists across reloads.
 */
export function SectionPane() {
  const [collapsed, setCollapsed] = useDraft(
    "sonata.section-pane.collapsed",
    false,
  );

  if (collapsed) {
    return (
      <div className="flex w-8 shrink-0 flex-col items-center gap-2 border-l border-border bg-muted/40 py-2">
        <IconButton
          icon={MdChevronLeft}
          label="Expand panels"
          side="left"
          onClick={() => setCollapsed(false)}
        />
        <span
          style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
          className="text-2xs font-medium text-muted-foreground"
        >
          Panels
        </span>
      </div>
    );
  }

  return (
    <div className="flex w-80 shrink-0 flex-col border-l border-border">
      <div className="flex justify-end px-2 pt-2">
        <IconButton
          icon={MdChevronRight}
          label="Collapse panels"
          side="left"
          onClick={() => setCollapsed(true)}
        />
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-auto px-4 pb-4">
        <Sonata.Section.Render subId="editor">
          {(s) => (s.area === "editor" ? <s.component key={s.label} /> : null)}
        </Sonata.Section.Render>
        <Sonata.Section.Render subId="player">
          {(s) => (s.area !== "editor" ? <s.component key={s.label} /> : null)}
        </Sonata.Section.Render>
      </div>
    </div>
  );
}
