import { SectionLabel } from "@plugins/primitives/plugins/section-label/web";
import { Stack } from "@plugins/primitives/plugins/spacing/web";

interface SectionProps {
  title: string;
  count?: string;
  children: React.ReactNode;
}

export function Section({ title, count, children }: SectionProps) {
  return (
    <Stack as="section" gap="sm">
      <div className="flex items-baseline justify-between">
        <SectionLabel as="h2" className="text-2xs font-semibold tracking-wider text-muted-foreground/70">
          {title}
        </SectionLabel>
        {count && (
          <span className="text-2xs text-muted-foreground/60">{count}</span>
        )}
      </div>
      {children}
    </Stack>
  );
}
