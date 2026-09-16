/**
 * The provider id, named once. The central descriptor, the Accounts row and
 * the Hooktheory integration all read it from here so they cannot drift onto
 * different spellings of the same account.
 */
export const HOOKTHEORY_PROVIDER_ID = "hooktheory";

/**
 * Root of Hooktheory's REST API. The sign-in exchange (`/users/auth`) and every
 * data call (`/trends/*`, `/songs/public/*`) hang off it.
 */
export const HOOKTHEORY_API_BASE = "https://api.hooktheory.com/v1";

/** Where a user without an account creates one. The sign-in dialog links to it. */
export const HOOKTHEORY_SIGN_UP_URL = "https://www.hooktheory.com/signup";
