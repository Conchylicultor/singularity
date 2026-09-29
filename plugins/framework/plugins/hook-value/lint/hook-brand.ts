import type * as ts from "typescript";

/**
 * The brand `Hook<F>` (`@plugins/framework/plugins/hook-value/core`) adds to a
 * function type: an optional phantom property. Kept as a literal here rather
 * than imported — rule files are dual-loaded (jiti + Bun) and cannot resolve
 * `@plugins/*`; the name is part of the brand's contract, pinned by the tests.
 */
export const HOOK_BRAND = "__hook";

/** A hook's name, per the React Compiler and `rules-of-hooks`. */
export const HOOK_NAME = /^use[A-Z0-9]/;

/** The members a type stands for: a union's alternatives, or the type itself. */
export function typeMembers(type: ts.Type): readonly ts.Type[] {
  return type.isUnion() ? type.types : [type];
}

/**
 * Whether a single (non-union) type carries the hook brand. `getProperty`
 * resolves through an intersection, which is exactly `Hook<F>`'s shape
 * (`F & { readonly __hook?: true }`).
 */
export function isBranded(type: ts.Type): boolean {
  return type.getProperty(HOOK_BRAND) !== undefined;
}

/** Whether the type — or any union member of it — is a `Hook<…>`. */
export function holdsHook(type: ts.Type): boolean {
  return typeMembers(type).some(isBranded);
}

/**
 * The name a (non-computed) key declares, or undefined for a private or
 * non-string key. Typed structurally so this file needs no ESTree import.
 */
export function keyName(key: {
  type: string;
  name?: string;
  value?: unknown;
}): string | undefined {
  if (key.type === "Identifier") return key.name;
  if (key.type === "Literal" && typeof key.value === "string") return key.value;
  return undefined;
}
