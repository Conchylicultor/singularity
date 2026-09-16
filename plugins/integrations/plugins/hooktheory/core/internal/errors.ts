/**
 * A Hooktheory call that did not return 2xx. Carries Hooktheory's own error
 * text (its JSON envelope's `message`, e.g. "There are no accounts with this
 * username.") so the reason survives to whoever has to act on it.
 *
 * A runtime value (a class), but it lives in `core` so any caller can narrow on
 * it in a `catch` — the same placement as places-api's `PlacesApiError`.
 */
export class HooktheoryApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "HooktheoryApiError";
    this.status = status;
  }
}

/**
 * Hooktheory answered that the TheoryTab section id does not exist. It says so
 * with a 400 ("The provided hash … could not be decoded") for every unknown id
 * — never a 404 — so the client names the case instead of leaving each caller
 * to pattern-match Hooktheory's wording.
 */
export class HooktheorySectionNotFoundError extends HooktheoryApiError {
  readonly sectionId: string;

  constructor(sectionId: string, status: number, message: string) {
    super(status, message);
    this.name = "HooktheorySectionNotFoundError";
    this.sectionId = sectionId;
  }
}

/**
 * Central does not know the Hooktheory provider at all, so no account can
 * exist yet. Normal on a branch: central runs main's code, and learns the
 * provider only once the auth change declaring it is merged. Distinct from
 * "not signed in", because signing in is not the way out of it.
 */
export class HooktheoryProviderUnavailableError extends Error {
  constructor(centralMessage: string) {
    super(
      `Hooktheory sign-in is not available on this deploy yet (${centralMessage}). ` +
        "Accounts live in the shared auth runtime, which runs main's code — it knows Hooktheory once this branch is merged.",
    );
    this.name = "HooktheoryProviderUnavailableError";
  }
}

/**
 * A signed-in call was attempted with no usable Hooktheory account: never
 * signed in, or central marked the account as needing a fresh sign-in. The
 * message is the sentence to show the user.
 */
export class HooktheoryNotSignedInError extends Error {
  readonly reason: "not-signed-in" | "sign-in-expired";

  constructor(reason: "not-signed-in" | "sign-in-expired") {
    super(
      reason === "sign-in-expired"
        ? "Sign in to Hooktheory again in Settings → Accounts"
        : "Sign in to Hooktheory in Settings → Accounts",
    );
    this.name = "HooktheoryNotSignedInError";
    this.reason = reason;
  }
}
