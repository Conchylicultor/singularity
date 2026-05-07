import { ThemeEngine } from "../slots";

export function VariantSettings() {
  const groups = ThemeEngine.VariantGroup.useContributions();

  if (groups.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No pluggable components registered.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {groups.map((g) => (
        <div key={g.componentId}>
          <h4 className="text-sm font-medium mb-1">{g.componentLabel}</h4>
          <g.component />
        </div>
      ))}
    </div>
  );
}
