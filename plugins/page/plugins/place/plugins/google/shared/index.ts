/**
 * Registry key for the Google half of the place block, shared by this plugin's
 * two halves — the server `definePlaceProvider({ id })` and the web
 * `Place.Provider({ id })` contribution.
 *
 * The two registries are joined ONLY by this string (there is no cross-runtime
 * slot bridge), so naming it once is what makes them impossible to drift apart.
 * It is also stored in every block's `data.providerId`, so it must never change.
 */
export const GOOGLE_PLACE_PROVIDER_ID = "google";
