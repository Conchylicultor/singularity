import type { ReactNode } from "react";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { SectionLabel } from "@plugins/primitives/plugins/css/plugins/text/web";

/**
 * One kind's block in the popover: its heading, then whatever the kind drew.
 *
 * The host wraps every kind in this, so the headings are uniform and a kind
 * never has to render its own label — it owns what goes *under* the heading.
 */
export function ArtifactSection({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <Stack gap="2xs">
      {/*
        `px-sm` is the inline half of the `p-row` padding an `ArtifactRow` puts
        on itself, so the heading starts where the rows' glyphs do instead of
        four pixels to their left. Re-spelled as a spacing step because there is
        no `px-row` utility to name it directly — the two are the same 0.5rem
        today, and a density preset that moved `--pad-row-x` alone would be what
        separates them.
      */}
      <SectionLabel className="px-sm">{label}</SectionLabel>
      {children}
    </Stack>
  );
}
