import { Sonata } from "../slots";

export function SonataLayout() {
  const sections = Sonata.Section.useContributions();
  const editorSections = sections.filter((s) => s.area === "editor");
  const playerSections = sections.filter((s) => s.area !== "editor");

  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
      <div className="min-h-0 flex-1 overflow-auto p-6">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-1">
            {editorSections.map((s) => (
              <s.component key={s.label} />
            ))}
          </div>
          <div className="space-y-6 lg:col-span-2">
            {playerSections.map((s) => (
              <s.component key={s.label} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
