import { useState } from "react";
import type { FormEvent } from "react";
import { MdPublic } from "react-icons/md";
import { SearchInput } from "@plugins/primitives/plugins/search/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { useBrowserNav } from "@plugins/apps/plugins/browser/plugins/shell/web";
import { normalizeInput } from "@plugins/apps/plugins/browser/plugins/omnibox/web";

/**
 * The start-page hero: the app wordmark, a tagline, and a prominent
 * search/URL input. Enter applies the SAME normalization the omnibox uses
 * (imported from the omnibox barrel — single source of truth) then navigates,
 * or goes home on empty input.
 */
export function Hero() {
  const { navigate, goHome } = useBrowserNav();
  const [value, setValue] = useState("");

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
    <Stack gap="lg" align="center">
      <Stack gap="2xs" align="center">
        <Stack direction="row" gap="sm" align="center">
          <MdPublic style={{ width: 28, height: 28 }} />
          <Text as="h1" variant="title" className="tracking-tight">
            Browser
          </Text>
        </Stack>
        <Text variant="body" tone="muted">
          Search the web or jump straight to a site.
        </Text>
      </Stack>
      <form onSubmit={submit} className="w-full">
        <SearchInput
          wrapperClassName="w-full"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Search or enter address"
          aria-label="Search or enter address"
          autoComplete="off"
          spellCheck={false}
        />
      </form>
    </Stack>
  );
}
