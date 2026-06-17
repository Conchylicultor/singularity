import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { SearchInput } from "@plugins/primitives/plugins/search/web";
import { useBrowserNav } from "@plugins/apps/plugins/browser/plugins/shell/web";
import { normalizeInput } from "../normalize";

/**
 * The address bar. A controlled input synced to the current URL; Enter
 * normalizes the input and navigates (or goes home on empty). Reuses the
 * SearchInput primitive for its leading search affordance + clear button.
 */
export function Omnibox() {
  const { current, navigate, goHome } = useBrowserNav();
  const [value, setValue] = useState(current);

  // Reflect the active URL whenever it changes (back/forward/home/link nav).
  useEffect(() => {
    setValue(current);
  }, [current]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const result = normalizeInput(value);
    if (result.kind === "home") {
      goHome();
    } else {
      navigate(result.url);
    }
  };

  return (
    // Rendered inside the chrome `<Frame>`'s flexible `content` track, which
    // already supplies the `min-w-0` truncation context — the form + input just
    // fill that track's width.
    <form onSubmit={submit} className="w-full">
      <SearchInput
        wrapperClassName="w-full"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search or enter address"
        aria-label="Address bar"
        autoComplete="off"
        spellCheck={false}
      />
    </form>
  );
}
