import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { useRailGuard } from "@plugins/primitives/plugins/css/plugins/rail/web";
import {
  SectionLabel,
  Text,
} from "@plugins/primitives/plugins/css/plugins/text/web";
import type React from "react";

export interface ControlPanelProps {
  /**
   * Names the panel for assistive tech. `role="group"` carries no child
   * contract, so the rows below stay free to report their own
   * checkbox/radio/switch state.
   */
  "aria-label"?: string;
  className?: string;
  children: React.ReactNode;
}

/**
 * The panel BODY — and nothing else. It paints no background, no border, no
 * shadow, no radius, no scroll, no height clamp and NO WIDTH. All of that is the
 * surface's, which is always an `OverlayPanel` contributed by whatever contains
 * this body (`ControlPanelPopover`, a `DialogContent`, a pushed panel-stack
 * entry).
 *
 * Three things follow from that split, and they are the reason for it:
 *
 *  - No double elevation, so this primitive needs no `no-adhoc-surface`
 *    exemption to exist.
 *  - A panel inside a panel is really a popover opened from inside a popover,
 *    each with its own correctly-clamped surface — rather than a nested box
 *    re-deriving one.
 *  - Width can be a ROLE rather than a measurement: there is no width prop here
 *    to default, so the widest row cannot decide how wide the panel is.
 *
 * What it DOES own is the geometry: the content inset, the two rails, and the
 * hairline BETWEEN its direct children.
 *
 * The inset is the first inversion, and it has ONE owner: this box applies it as
 * padding, so content that does nothing at all — a raw `<Input>` inside a
 * Section, a contributed `FieldRenderer` — lands on the text rail next to every
 * row's label. A `Row` is not an exception to that, it is the CANCELLING case:
 * it bleeds the inset back out so its fill reaches the panel's inner edge, then
 * re-inserts its own padding, landing its label on the very inset it cancelled.
 * Nothing inherits AND pads.
 *
 * That is not a panel rule — it is the repo-wide rail contract, of which this
 * panel was the prototype: the model lives in
 * [`primitives/css/rail`](../../../rail/CLAUDE.md), the utilities that carry it
 * in `app.css`, and `cp-panel` is simply the region owner that publishes an
 * asymmetric pair. `useRailGuard` below is the same rule read back off the
 * rendered DOM in dev, so a child that pads on top of the panel's inset names
 * itself instead of merely looking a little indented.
 *
 * The hairline is the second — the container draws the separators, so an author
 * never places one.
 * A conditionally-null section therefore leaves no orphan rule, a footer is
 * separated because it is a BAND rather than because it opted in, and the rhythm
 * cannot go ragged one panel at a time.
 *
 * "Between its direct children" is what that used to say, and it was the bug: a
 * `cp-body > * + *` sibling rule saw only the `display: contents` lineage span
 * that `renderIsolated` wraps every contributed panel in — one span in the filter
 * panel, one per contribution in the settings panel — so not one panel in the app
 * drew a hairline. `display: contents` is transparent to LAYOUT and opaque to
 * SELECTORS, so the mechanism is now split along that line: `cp-body` is a flex
 * container, which lays the bands out at any wrapper depth, and each band carries
 * `cp-band`, which draws its own rule. See both utilities in `app.css`.
 */
export function ControlPanel({
  "aria-label": ariaLabel,
  className,
  children,
}: ControlPanelProps) {
  // The rail guard goes on THIS box because this is the publisher: `cp-panel`
  // declares the rail here, and a rail is measured from its publisher's padding
  // box. Attached one level down it would compare children against a rail whose
  // origin it could not see.
  const rootRef = useRailGuard<HTMLDivElement>("ControlPanel");
  return (
    <div
      ref={rootRef}
      role="group"
      aria-label={ariaLabel}
      className={cn("cp-panel cp-body", className)}
    >
      {children}
    </div>
  );
}

export interface ControlPanelSectionProps {
  /** Small-caps label hung on the ICON rail, one column left of the row labels. */
  label?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

/**
 * One band of the panel. It places NO divider of its own — see `ControlPanel`
 * above: it carries `cp-band`, which is a declaration that this box IS a band,
 * and the rule is drawn for it. So a section is still separated by virtue of
 * being one, and the call site still has no divider to forget or to double.
 *
 * It applies NO inset either, and that is the second half of the same
 * inversion. The PANEL owns the content inset, so whatever a caller drops in
 * here — a raw `<Input>`, a `FieldRenderer`, arbitrary JSX — inherits it and
 * lands on the text rail beside the row labels, with no wrapper here and no
 * opt-in at the call site.
 *
 * The label is the one thing that does not: it hangs BACK to the icon rail
 * (`cp-rail-icon` is a negative offset), so the eye reads one left edge down
 * the whole panel — label, icon, indicator and drag handle all start their
 * column at the same x.
 */
export function ControlPanelSection({
  label,
  className,
  children,
}: ControlPanelSectionProps) {
  return (
    <div className={cn("cp-band", className)}>
      {label != null ? (
        <SectionLabel className="flex control-min-xs items-center cp-rail-icon">
          {label}
        </SectionLabel>
      ) : null}
      {children}
    </div>
  );
}

export interface ControlPanelFooterProps {
  className?: string;
  children: React.ReactNode;
}

/**
 * The panel's closing band — Clear / Save as preset / Delete, as full-width ROWS
 * on the same rails, never ghost buttons pinned to opposite corners.
 *
 * It carries no chrome, and that is the point: its separating hairline comes from
 * being a BAND (`cp-band`), exactly like a section's. The component exists to say
 * what the band IS at the call site, and to give the footer treatment one home
 * should it ever need more than that.
 */
export function ControlPanelFooter({
  className,
  children,
}: ControlPanelFooterProps) {
  return (
    <div data-cp-footer className={cn("cp-band", className)}>
      {children}
    </div>
  );
}

export interface ControlPanelEmptyProps {
  className?: string;
  children: React.ReactNode;
}

/**
 * The "nothing here yet" line — on the TEXT rail so it reads as a row that has
 * no icon, rather than as loose prose floating in the panel.
 *
 * It carries NO rail class to get there. The panel's content box starts on the
 * text rail (the inset-ownership rule in `app.css`), so this lands there by
 * being ordinary content — the same way a consumer's own `<Input>` does.
 */
export function ControlPanelEmpty({
  className,
  children,
}: ControlPanelEmptyProps) {
  return (
    <Text
      as="div"
      variant="caption"
      tone="muted"
      className={cn("py-2xs", className)}
    >
      {children}
    </Text>
  );
}

export interface ControlPanelRuleListProps {
  className?: string;
  children: React.ReactNode;
}

/**
 * The vertical run of `RuleRow`s inside a builder. A plain stack — the rule rows
 * are not separated from each other, because a filter is ONE sentence read down
 * the page, not a list of unrelated settings.
 */
export function ControlPanelRuleList({
  className,
  children,
}: ControlPanelRuleListProps) {
  return <div className={cn("flex flex-col", className)}>{children}</div>;
}
