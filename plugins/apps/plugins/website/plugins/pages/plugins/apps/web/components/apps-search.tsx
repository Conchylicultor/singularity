import { useCallback, useMemo, useRef } from "react";
import { SearchInput } from "@plugins/primitives/plugins/search/web";
import { Surface } from "@plugins/primitives/plugins/css/plugins/surface/web";
import { useSurfaceShortcuts } from "@plugins/primitives/plugins/shortcuts/web";

/**
 * The gallery's search: one pill under the heading, focused by `/`. It filters
 * by an app's name and what it does.
 */
export function AppsSearch({
  query,
  onQueryChange,
}: {
  query: string;
  onQueryChange: (query: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const focusSearch = useCallback(() => inputRef.current?.focus(), []);
  // Surface-scoped, and a plain key, so it yields to any focused text field
  // (the `/` is typed there).
  const shortcuts = useMemo(
    () => [
      {
        id: "website.apps.focus-search",
        keys: "/",
        label: "Search apps",
        handler: focusSearch,
      },
    ],
    [focusSearch],
  );
  useSurfaceShortcuts(shortcuts);

  return (
    <Surface
      level="raised"
      className="focus-within:border-input h-12 w-[min(35rem,100%)] rounded-2xl text-left shadow-none transition-colors"
    >
      <SearchInput
        ref={inputRef}
        appearance="bare"
        placeholder="Search apps"
        aria-label="Search apps"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
      />
    </Surface>
  );
}
