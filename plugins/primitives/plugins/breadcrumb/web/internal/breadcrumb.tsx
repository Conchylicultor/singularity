import { Fragment, useRef, type ReactNode } from "react";
import { MdMoreHoriz } from "react-icons/md";
import { RowActions } from "@plugins/primitives/plugins/row-actions/web";
import { rigidClass } from "@plugins/primitives/plugins/css/plugins/rigid/web";
import { fillClasses } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  cn,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { TrailSeparator } from "./trail-separator";
import { useAncestorCollapse } from "./use-ancestor-collapse";

export interface BreadcrumbSegment {
  key: string;
  label: ReactNode;
}

export interface BreadcrumbProps {
  segments: BreadcrumbSegment[];
  onNavigate?: (index: number, segment: BreadcrumbSegment) => void;
  actions?: ReactNode;
}

/**
 * One ancestor: quiet at rest, a soft filled box under the pointer.
 *
 * Muted and normal-weight so the trail reads as one background line and the
 * page's own name is the only thing with weight. The hover mark is a fill
 * rather than an underline — at the size chrome text runs at, an underline on a
 * muted label reads as a defect rather than as a link.
 *
 * A trail with no `onNavigate` is a path, not a set of links, so it renders
 * plain text: a button that goes nowhere is worse than no button.
 */
function Crumb({
  label,
  onSelect,
}: {
  label: ReactNode;
  onSelect?: () => void;
}) {
  if (!onSelect) {
    return <span className="font-normal text-muted-foreground">{label}</span>;
  }
  return (
    <Button
      variant="ghost"
      aspect="inline"
      onClick={onSelect}
      className="px-2xs font-normal text-muted-foreground hover:text-foreground"
    >
      {label}
    </Button>
  );
}

/**
 * The ancestors, folded: one overflow crumb that gives them all back as a menu.
 *
 * Folding is what a breadcrumb does INSTEAD of taking letters off the page's
 * name — the ancestors are one click from being read in full, the name is not.
 */
function FoldedCrumbs({
  segments,
  onNavigate,
}: {
  segments: BreadcrumbSegment[];
  onNavigate?: (index: number, segment: BreadcrumbSegment) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            aspect="inline"
            aria-label={`Show the ${segments.length} levels above this one`}
            className="px-2xs text-muted-foreground hover:text-foreground"
          >
            <MdMoreHoriz />
          </Button>
        }
      />
      <DropdownMenuContent align="start">
        {segments.map((seg, i) => (
          <DropdownMenuItem
            key={seg.key}
            // `i` is the segment's index in the WHOLE trail — the folded run is
            // its leading slice, so the two coincide. Consumers derive their
            // target from that index (a file path's directory prefix), so it
            // must never become an index into some folded subset.
            disabled={onNavigate === undefined}
            onClick={() => onNavigate?.(i, seg)}
          >
            {seg.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The trail: where you are, said quietly, with the page you are on as the one
 * thing that reads first.
 *
 * Three decisions make it that, and they hold together:
 *
 * - **The ancestors are secondary and look it** — muted, normal weight, each
 *   its own hover target; the leaf carries the weight.
 * - **The separator has air on both sides** and comes from the theme
 *   (`BreadcrumbSlots.Separator`: chevron or slash), so it is a mark between
 *   crumbs rather than punctuation glued to the words.
 * - **The leaf never pays for the row.** The ancestor run is rigid and folds
 *   whole into an overflow crumb when the room runs out (see
 *   `useAncestorCollapse`), so the page's own name loses letters only once
 *   there is nothing left to fold.
 *
 * The trail takes the row's slack (`fillClasses`) because it has to know how
 * much room it has to answer that last question at all — a box that shrink-wraps
 * its own content cannot see the space around it. Its content stays left-packed,
 * so the slack lands after the trailing actions and nothing moves.
 */
export function Breadcrumb({ segments, onNavigate, actions }: BreadcrumbProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const prefixRef = useRef<HTMLDivElement>(null);
  const leafRef = useRef<HTMLSpanElement>(null);

  const lastIndex = segments.length - 1;
  const prefix = segments.slice(0, Math.max(lastIndex, 0));
  const active = segments[lastIndex];

  const folded = useAncestorCollapse({
    rootRef,
    prefixRef,
    leafRef,
    trailKey: segments.map((seg) => seg.key).join(" "),
    foldable: prefix.length > 0,
  });

  if (active === undefined) return null;

  return (
    <Stack
      as={Line}
      ref={rootRef}
      direction="row"
      align="center"
      gap="2xs"
      className={cn(
        fillClasses("x"),
        "[&_svg:not([class*='size-'])]:icon-auto",
      )}
    >
      {prefix.length > 0 && (
        // ONE box for the ancestors in both states, so what folds and what the
        // fit measures are the same element. Rigid: it never gives room back by
        // shrinking — it either stands whole or folds — which is what makes the
        // leaf's own truncation a reliable report that the row is over-full.
        <Stack
          ref={prefixRef}
          direction="row"
          align="center"
          gap="2xs"
          className={rigidClass()}
        >
          {folded ? (
            <>
              <FoldedCrumbs segments={prefix} onNavigate={onNavigate} />
              <TrailSeparator />
            </>
          ) : (
            prefix.map((seg, i) => (
              <Fragment key={seg.key}>
                <Crumb
                  label={seg.label}
                  onSelect={onNavigate ? () => onNavigate(i, seg) : undefined}
                />
                <TrailSeparator />
              </Fragment>
            ))
          )}
        </Stack>
      )}
      <span ref={leafRef} className="truncate font-medium">
        {active.label}
      </span>
      {actions && (
        // A trailing action cluster on a row-shaped strip is the `row-actions`
        // primitive, never raw JSX — one implementation owns the sizing, the
        // click/pointerdown guards and the popup-hold. `pin={null}` + always
        // visible is what a breadcrumb's trailing slot is: it sits in flow right
        // after the active segment, and it is never hover-revealed because the
        // trail is chrome, not a row in a list. Rigid keeps it out of the
        // truncation the leaf absorbs.
        <RowActions pin={null} alwaysVisible className={rigidClass()}>
          {actions}
        </RowActions>
      )}
    </Stack>
  );
}
