import { useState } from "react";
import type { FormEvent } from "react";
import { SearchInput } from "@plugins/primitives/plugins/search/web";
import { useBrowserNav } from "@plugins/apps/plugins/browser/plugins/shell/web";
import { normalizeInput } from "../normalize";

/**
 * The address bar. A controlled input seeded from the current URL; Enter
 * normalizes the input and navigates (or goes home on empty). Reuses the
 * SearchInput primitive for its leading search affordance + clear button.
 *
 * The input's draft state is owned by a self-keyed inner component
 * ({@link OmniboxInput}) keyed on `current`: whenever the active URL changes
 * (back/forward/home/link nav), the inner component remounts and re-seeds its
 * `useState` from the new URL — replacing the old "mirror prop into state via
 * effect" pattern. The remount discards any in-progress typed text, which is
 * the intended behavior (the address bar should reflect the live URL).
 */
export function Omnibox() {
  const { current, navigate, goHome } = useBrowserNav();
  return (
    <OmniboxInput
      key={current}
      current={current}
      navigate={navigate}
      goHome={goHome}
    />
  );
}

function OmniboxInput({
  current,
  navigate,
  goHome,
}: {
  current: string;
  navigate: (url: string) => void;
  goHome: () => void;
}) {
  const [value, setValue] = useState(current);

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
    // Rendered inside the chrome bar's flexible content cell, which already
    // supplies the `min-w-0` truncation context — the form + input just fill
    // that cell's width.
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
