/**
 * A link as DATA: where a plain click goes (`open`) and the URL a ⌘/Ctrl- or
 * middle-click opens in a new browser tab instead (`href`). The web barrel's
 * `linkProps(target)` turns it into a control's gesture handlers.
 *
 * Data rather than handlers because not every activation is a mouse click: a
 * focused row's Enter, or a list activating a row it just created, has no
 * gesture to read and simply runs `open()`. `href` is a thunk, evaluated only
 * for an "elsewhere" gesture and synchronously inside it (so `window.open` is
 * still a user gesture); it returns an app path (`/agents/c/42`).
 */
export interface LinkTarget {
  open(): void;
  href(): string;
}

/**
 * What activating something does: a plain action, or a {@link LinkTarget}
 * whose "elsewhere" gestures open a browser tab. Switched on in one place —
 * the web barrel's `activationProps` / `runActivation`.
 */
export type Activation = (() => void) | LinkTarget;

/** Run an activation the way a plain click (or Enter) does. */
export function runActivation(activation: Activation): void {
  if (typeof activation === "function") activation();
  else activation.open();
}

/** The URL an "elsewhere" gesture opens, or `undefined` for a plain action. */
export function activationHref(
  activation: Activation | undefined,
): (() => string) | undefined {
  if (activation === undefined || typeof activation === "function") {
    return undefined;
  }
  return () => activation.href();
}

/**
 * The same activation with `effect` run after its plain open (closing the
 * popover a pick was made in). A link stays a link with the same `href`: an
 * "elsewhere" gesture leaves this tab — and so its popover — where it is.
 */
export function afterOpen(
  activation: Activation,
  effect: () => void,
): Activation {
  if (typeof activation === "function") {
    return () => {
      activation();
      effect();
    };
  }
  return {
    open: () => {
      activation.open();
      effect();
    },
    href: () => activation.href(),
  };
}
