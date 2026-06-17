import type { RegisteredView } from "./registry";

// Returns the views in dependency order: a view appears AFTER every view it
// `dependsOn`. Throws loudly on an unknown dependency name or a dependency
// cycle — both are authoring errors that must fail the boot, not silently
// produce a broken view layer.
export function topoSortViews(views: RegisteredView[]): RegisteredView[] {
  const byName = new Map<string, RegisteredView>();
  for (const v of views) {
    if (byName.has(v.name)) {
      throw new Error(`[derived-views] duplicate view name "${v.name}"`);
    }
    byName.set(v.name, v);
  }

  for (const v of views) {
    for (const dep of v.dependsOn) {
      if (!byName.has(dep)) {
        throw new Error(
          `[derived-views] view "${v.name}" dependsOn "${dep}", which is not a registered view`,
        );
      }
    }
  }

  const ordered: RegisteredView[] = [];
  // 0 = unvisited, 1 = on the current DFS stack, 2 = finished.
  const state = new Map<string, 0 | 1 | 2>();
  for (const v of views) state.set(v.name, 0);

  const visit = (name: string, trail: string[]): void => {
    const s = state.get(name);
    if (s === 2) return;
    if (s === 1) {
      throw new Error(
        `[derived-views] dependency cycle: ${[...trail, name].join(" -> ")}`,
      );
    }
    state.set(name, 1);
    const v = byName.get(name)!;
    for (const dep of v.dependsOn) visit(dep, [...trail, name]);
    state.set(name, 2);
    ordered.push(v);
  };

  for (const v of views) visit(v.name, []);
  return ordered;
}
