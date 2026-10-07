import type { Exemptions } from "@plugins/framework/plugins/tooling/plugins/exempt/core";

export default [
  {
    rule: "apps-core/no-raw-history-nav",
    paths: ["web/components/apps-layout.tsx"],
    kind: "sanctioned",
    reason:
      "URL canonicalization (`/`→`/home`, unmatched path → fallback namespace). It is legitimately URL-driven (`matchAppForPath`), correcting the address bar itself rather than expressing a user navigation, so it must NOT route through navigate() — that would mint a history entry for a correction that should never be independently reachable.  It does NOT run before TabsProvider mounts, despite what this comment used to claim. `bootTabs` runs in TabsProvider's render-phase useState initializer, and AppsLayout is TabsProvider's PARENT — React flushes effects children-first, so this redirect fires AFTER the boot entry has already been stamped. That is why `redirectTo` preserves `history.state` instead of blanking it: on a bare-root boot it lands on a stamped entry, and wiping the stamp there would strand the entry (see `primitives/scope/app-instance`, \"Why two signals\" — the earlier wrong premise here is what made a single-signal design look safe).",
  },
] satisfies Exemptions;
