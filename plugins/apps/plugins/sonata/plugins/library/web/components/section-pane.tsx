import { MdChevronLeft, MdChevronRight } from "react-icons/md";
import {
  Sonata,
  type SonataSection,
} from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { useDraft } from "@plugins/primitives/plugins/persistent-draft/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import { SectionCard } from "@plugins/primitives/plugins/section-card/web";

/** A `Sonata.Section` contribution as the render slot hands it back. */
type SectionItem = SonataSection & { id: string };

/**
 * One section, painted as the column's uniform collapsible card. The chrome
 * lives HERE, not in the contributed component: every section is a `SectionCard`
 * by construction, so no two can drift on padding, radius, or title typography.
 *
 * Collapsed by default; the open/closed choice persists per section, per device.
 * The body is unmounted while collapsed — a section whose work must outlive its
 * panel puts that work in a headless `Sonata.Effect`.
 */
function SectionCardHost({ section }: { section: SectionItem }) {
  const [open, setOpen] = useDraft(`sonata.section.${section.id}.open`, false);
  const Body = section.component;
  const Actions = section.actions;
  const Icon = section.icon;

  return (
    <SectionCard
      title={section.label}
      icon={Icon ? <Icon /> : undefined}
      actions={Actions ? <Actions /> : undefined}
      open={open}
      onOpenChange={setOpen}
    >
      <Body />
    </SectionCard>
  );
}

/**
 * Applies the contribution's `useAvailable` gate before anything is painted, so
 * an inapplicable section renders no card and no title rather than an empty one.
 * The hook's presence is stable per contribution, so branching on it up here
 * keeps both leaves rules-of-hooks clean (mirrors `auth`'s `useEnabled` gate).
 */
function GatedSection({
  useAvailable,
  section,
}: {
  useAvailable: () => boolean;
  section: SectionItem;
}) {
  return useAvailable() ? <SectionCardHost section={section} /> : null;
}

function Section({ section }: { section: SectionItem }) {
  if (section.useAvailable) {
    return <GatedSection useAvailable={section.useAvailable} section={section} />;
  }
  return <SectionCardHost section={section} />;
}

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
        {/* Collapsed cards are single rows, so the column reads as a list of
            titles and sits tighter than the old always-expanded panels. */}
        <Stack gap="sm">
          <Sonata.Section.Render subId="editor">
            {(s) => (s.area === "editor" ? <Section section={s} /> : null)}
          </Sonata.Section.Render>
          <Sonata.Section.Render subId="player">
            {(s) => (s.area !== "editor" ? <Section section={s} /> : null)}
          </Sonata.Section.Render>
        </Stack>
      </Scroll>
    </Stack>
  );
}
