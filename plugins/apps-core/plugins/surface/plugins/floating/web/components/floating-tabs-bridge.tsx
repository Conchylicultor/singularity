import { useEffect } from "react";
import { useTabs } from "@plugins/apps-core/plugins/tabs/web";
import { setFloatingTabsBridge } from "../window-commands";

/**
 * Headless publisher: mirrors the live floating tab order + focus/close
 * callbacks to the module-level command channel ({@link setFloatingTabsBridge})
 * so the statically-registered window-management shortcuts (cycle / close) can
 * act on windows without the load-bearing `apps` plugin exposing imperative tab
 * handles. Mounted inside the floating Foreground, so it exists exactly while
 * there is >= 1 floating window (and the shortcuts' `when` guard can pass).
 */
export function FloatingTabsBridge({ tabIds }: { tabIds: string[] }) {
  const { focusTab, closeTab } = useTabs();
  const tabKey = tabIds.join(",");
  useEffect(() => {
    setFloatingTabsBridge({ tabIds, focusTab, closeTab });
    return () => setFloatingTabsBridge(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the id set, not the array identity (mirrors FloatingChrome's prune effect)
  }, [tabKey, focusTab, closeTab]);
  return null;
}
