/** Parse a URL's hostname; returns the raw input for unparseable URLs. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch (err) {
    if (err instanceof TypeError) return url; // invalid URL — expected
    throw err;
  }
}
