import { Home } from "../slots";

export function HomeLayout() {
  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="mx-auto max-w-5xl px-8 py-10">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">Apps</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Open an app to get started.
          </p>
        </header>
        <Home.Section.Render />
      </div>
    </div>
  );
}
