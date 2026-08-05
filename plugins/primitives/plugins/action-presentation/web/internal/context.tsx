import { createContext, useContext, type ReactNode } from "react";

/**
 * How a region wants the generic `{ icon, label, onClick }` actions inside it to
 * render. `inline` is the ghost icon button; `menu` is a labelled dropdown row.
 */
export type ActionPresentationMode = "inline" | "menu";

// Default `inline`: the overwhelming majority of action call sites are not
// inside a menu and must keep rendering exactly as they did before this
// primitive existed, with no provider anywhere above them.
const ActionPresentationContext = createContext<ActionPresentationMode>("inline");

/**
 * Declares what kind of surface the wrapped region is. An action component is
 * opaque to its host — the host cannot introspect it and swap its rendering —
 * so the region states its own nature and the action reads it, the same shape as
 * `ControlSizeProvider` deciding a button's density from its containing region.
 *
 * Mount this around content whose actions must render as menu rows (a dropdown's
 * content), never around ordinary chrome.
 */
export function ActionPresentation({
  mode,
  children,
}: {
  mode: ActionPresentationMode;
  children: ReactNode;
}) {
  // A bare string value — stable by identity, no memo needed.
  return (
    <ActionPresentationContext.Provider value={mode}>
      {children}
    </ActionPresentationContext.Provider>
  );
}

/** The presentation the surrounding region asked for. Defaults to `"inline"`. */
export function useActionPresentation(): ActionPresentationMode {
  return useContext(ActionPresentationContext);
}
