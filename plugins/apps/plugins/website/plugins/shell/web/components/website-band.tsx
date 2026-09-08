import type { ReactNode } from "react";
import { Inset } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import type { SpaceStep } from "@plugins/primitives/plugins/css/plugins/space-ramp/core";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";

/** The site's one reading measure — see {@link WebsiteBand}. */
const MEASURE = "mx-auto w-full max-w-5xl";

export interface WebsiteBandProps {
  /** Host element. Defaults to `section` — pass `footer` for the site footer. */
  as?: "section" | "footer" | "header";
  /** Hairline above this band, separating it from the one before. */
  divider?: boolean;
  /** Block padding, from the spacing ramp. Defaults to `2xl`. */
  y?: SpaceStep;
  /**
   * Lands on the measure box. Reserved for the hero, which narrows and centres
   * itself; a band that narrows any other way stops starting on the site's shared
   * left edge (`mx-auto` centres whatever cap you give it), and a heading that no
   * longer lines up with the cards below it reads as a mistake.
   */
  className?: string;
  children: ReactNode;
}

/**
 * One horizontal band of the site.
 *
 * Every website section is a full-width strip whose content sits on ONE shared
 * reading measure, centred in the viewport — so the wordmark, the hero, the two
 * question cards and the footer all line up on the same left and right edges no
 * matter which plugin drew them. That measure is declared here and nowhere else;
 * a section that sets its own `max-w-*` is a section that will drift.
 *
 * `divider` paints the hairline ABOVE the band. The site separates its bands
 * with a rule rather than with more air, which is what keeps a long page reading
 * as one document rather than a stack of unrelated cards.
 */
export function WebsiteBand({
  as: As = "section",
  divider = false,
  y = "2xl",
  className,
  children,
}: WebsiteBandProps) {
  return (
    <As className={divider ? "border-border border-t" : undefined}>
      <Inset x="xl" y={y}>
        <div className={cn(MEASURE, className)}>{children}</div>
      </Inset>
    </As>
  );
}
