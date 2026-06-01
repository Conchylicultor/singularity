import { Sonata } from "../slots";

export function SonataLayout() {
  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
      <div className="min-h-0 flex-1 overflow-auto p-6">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-1">
            <Sonata.Section.Render subId="editor">
              {(s) =>
                s.area === "editor" ? <s.component key={s.label} /> : null
              }
            </Sonata.Section.Render>
          </div>
          <div className="space-y-6 lg:col-span-2">
            <Sonata.Section.Render subId="player">
              {(s) =>
                s.area !== "editor" ? <s.component key={s.label} /> : null
              }
            </Sonata.Section.Render>
          </div>
        </div>
      </div>
    </div>
  );
}
