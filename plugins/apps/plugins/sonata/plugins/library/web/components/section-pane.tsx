import { MdChevronLeft, MdChevronRight } from "react-icons/md";
import {
  Sonata,
  SonataSectionItem,
} from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { useDraft } from "@plugins/primitives/plugins/persistent-draft/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";

/**
 * The right-hand panel column hosting the `Sonata.Section` contributions
 * (track mixer, chord readout, …). Collapsible to a thin rail so the active
 * display can take the full width; the choice persists across reloads.
 *
 * This owns ONLY the column: the rail toggle, the scroll body, and the two
 * `area` zones. Each section's chrome — the collapsible `SectionCard`, its
 * icon/actions header, the `useAvailable` gate, and the per-section persisted
 * open state — belongs to the detail-sections primitive
 * (`SonataSectionItem`), shared with every other detail pane in the app.
 *
 * The `area` split is a pure RENDER-TIME filter across the two zones: `subId`
 * does not partition reorder (the persisted layout is keyed by the base slot id
 * only), so both zones draw from one order. The `subId` values are kept so
 * reorder's per-zone measurement can still tell the two apart.
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
        {/* Collapsed cards are single rows, so the column reads as a list of
            titles and sits tighter than the old always-expanded panels. */}
        <Stack gap="sm">
          <Sonata.Section.Render subId="editor">
            {(s) =>
              s.area === "editor" ? (
                <SonataSectionItem section={s} entityProps={{}} />
              ) : null
            }
          </Sonata.Section.Render>
          <Sonata.Section.Render subId="player">
            {(s) =>
              s.area !== "editor" ? (
                <SonataSectionItem section={s} entityProps={{}} />
              ) : null
            }
          </Sonata.Section.Render>
        </Stack>
      </Scroll>
    </Stack>
  );
}
