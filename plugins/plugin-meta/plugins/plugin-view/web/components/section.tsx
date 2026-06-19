import { SectionLabel } from "@plugins/primitives/plugins/css/plugins/section-label/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Frame } from "@plugins/primitives/plugins/css/plugins/frame/web";

interface SectionProps {
  title: string;
  count?: string;
  children: React.ReactNode;
}

export function Section({ title, count, children }: SectionProps) {
  return (
    <Stack as="section" gap="sm">
      <Frame
        align="baseline"
        content={
          <SectionLabel as="h2" className="text-2xs font-semibold tracking-wider text-muted-foreground/70">
            {title}
          </SectionLabel>
        }
        trailing={
          count && (
            <span className="text-2xs text-muted-foreground/60">{count}</span>
          )
        }
      />
      {children}
    </Stack>
  );
}
