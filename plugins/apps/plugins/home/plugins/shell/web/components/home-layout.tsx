import { Home } from "../slots";

export function HomeLayout() {
  return (
    <div className="flex h-full flex-col bg-background">
      <div className="mx-auto flex h-full w-full max-w-5xl flex-col px-8 py-10">
        <header className="mb-8 shrink-0">
          <h1 className="text-2xl font-semibold tracking-tight">Apps</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Open an app to get started.
          </p>
        </header>
        {/* The section area owns bounded height so a full-surface section (e.g.
            the app-cards DataView) can fill it and scroll internally. */}
        <div className="flex min-h-0 flex-1 flex-col">
          <Home.Section.Render />
        </div>
      </div>
    </div>
  );
}
