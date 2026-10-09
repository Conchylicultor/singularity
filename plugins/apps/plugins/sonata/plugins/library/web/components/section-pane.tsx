import {
  Sonata,
  SonataSectionItem,
  SonataSectionStack,
} from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import { useSectionPaneCollapsed } from "./panels-toggle";

/**
 * The right-hand panel column hosting the `Sonata.Section` contributions
 * (track mixer, chord readout, …). Hidden ENTIRELY while collapsed, so the
 * active display takes the full width; the toggle is the header's Panels button
 * (`PanelsToggle`), and the choice persists across reloads
 * (`useSectionPaneCollapsed`).
 *
 * This owns ONLY the column: its width, the scroll body, and the two `area`
 * zones. Each section's chrome — the flat inspector section, its icon/actions
 * header, the `useAvailable` gate, and the per-section persisted open state —
 * belongs to the detail-sections primitive (`SonataSectionItem`), and the
 * rhythm between sections to its `SonataSectionStack`; both are shared with
 * every other detail pane in the app.
 *
 * The `area` split is a pure RENDER-TIME filter across the two zones: `subId`
 * does not partition reorder (the persisted layout is keyed by the base slot id
 * only), so both zones draw from one order. The `subId` values are kept so
 * reorder's per-zone measurement can still tell the two apart.
 */
export function SectionPane() {
  const [collapsed] = useSectionPaneCollapsed();
  if (collapsed) return null;

  return (
    // `w-92` = 23rem (368px): the inspector's width — room for a header's
    // title plus its actions, and a body's keyboards at a readable key size.
    <Stack gap="none" className="w-92 border-l border-border">
      <Scroll fill axis="both">
        <SonataSectionStack>
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
        </SonataSectionStack>
      </Scroll>
    </Stack>
  );
}
