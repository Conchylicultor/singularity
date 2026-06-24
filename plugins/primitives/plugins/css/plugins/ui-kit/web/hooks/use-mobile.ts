import * as React from "react"

const MOBILE_BREAKPOINT = 768

function subscribe(callback: () => void) {
  const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
  mql.addEventListener("change", callback)
  return () => mql.removeEventListener("change", callback)
}

function getSnapshot() {
  return window.innerWidth < MOBILE_BREAKPOINT
}

function getServerSnapshot() {
  return false
}

export function useIsMobile() {
  // External DOM store (matchMedia) read via useSyncExternalStore — the canonical
  // React pattern. Replaces the prior useState+useEffect subscription and removes
  // the initial `undefined` flicker the old `!!isMobile` cast masked.
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
