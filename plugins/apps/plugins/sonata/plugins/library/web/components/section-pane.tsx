import { MdChevronLeft, MdChevronRight } from "react-icons/md";
import { Sonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { useDraft } from "@plugins/primitives/plugins/persistent-draft/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";

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
      <Stack
        align="center"
        gap="sm"
        className="w-8 border-l border-border bg-muted/40 py-sm"
      >
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
      </Stack>
    );
  }

  return (
    <Stack gap="none" className="w-80 border-l border-border">
      <Stack direction="row" gap="none" justify="end" className="px-sm pt-sm">
        <IconButton
          icon={MdChevronRight}
          label="Collapse panels"
          side="left"
          onClick={() => setCollapsed(true)}
        />
      </Stack>
      <Scroll fill axis="both" className="px-lg pb-lg">
        <Stack gap="lg">
          <Sonata.Section.Render subId="editor">
            {(s) => (s.area === "editor" ? <s.component key={s.label} /> : null)}
          </Sonata.Section.Render>
          <Sonata.Section.Render subId="player">
            {(s) => (s.area !== "editor" ? <s.component key={s.label} /> : null)}
          </Sonata.Section.Render>
        </Stack>
      </Scroll>
    </Stack>
  );
}
