// The two timestamps every extension carries. The primitive defines them, so a
// plugin field of either name is refused (see `assertNoReservedKeys`), and they
// stay off the wire unless the plugin lists them in `wireTimestamps`.
export const EXTENSION_TIMESTAMPS = ["createdAt", "updatedAt"] as const;
export type ExtensionTimestamp = (typeof EXTENSION_TIMESTAMPS)[number];

// The three field names the primitive owns: the chosen parent key and the two
// timestamps. A plugin field of the same name would be silently overwritten by
// the primitive's own field (or would overwrite it, depending on spread order),
// so the declared shape and the actual DDL would disagree. Refuse instead.
//
// Deliberately import-free, so it stays unit-testable on its own.
export function assertNoReservedKeys(
  key: string,
  fields: Record<string, unknown>,
): void {
  if ((EXTENSION_TIMESTAMPS as readonly string[]).includes(key)) {
    throw new Error(
      `defineExtensionShape({ key: "${key}" }): the key cannot be named ` +
        `"${key}" — the primitive defines createdAt and updatedAt itself. ` +
        `Name the parent key after the parent (e.g. "songId").`,
    );
  }
  for (const reserved of [key, ...EXTENSION_TIMESTAMPS]) {
    if (reserved in fields) {
      throw new Error(
        `defineExtensionShape({ key: "${key}" }): field "${reserved}" is ` +
          `reserved — the primitive defines ${key}, createdAt and updatedAt ` +
          `itself. Rename the field.`,
      );
    }
  }
}
