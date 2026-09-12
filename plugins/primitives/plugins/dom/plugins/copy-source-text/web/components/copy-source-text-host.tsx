import { useEffect } from "react";
import { installCopySourceText } from "../internal/install-copy-source-text";
import { installSelectionUnits } from "../internal/selection-units";

/**
 * Invisible global controller. Mounted once via `Core.Root`, it installs the
 * document `copy` handler and the `selectionchange` ring for the lifetime of
 * the app and renders nothing.
 */
export function CopySourceTextHost(): null {
  useEffect(() => {
    const uninstallCopy = installCopySourceText();
    const uninstallSelection = installSelectionUnits();
    return () => {
      uninstallCopy();
      uninstallSelection();
    };
  }, []);
  return null;
}
