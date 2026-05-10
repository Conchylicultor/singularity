interface SectionProps {
  title: string;
  count?: string;
  children: React.ReactNode;
}

export function Section({ title, count, children }: SectionProps) {
  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
          {title}
        </h2>
        {count && (
          <span className="text-[11px] text-muted-foreground/60">{count}</span>
        )}
      </div>
      {children}
    </section>
  );
}
