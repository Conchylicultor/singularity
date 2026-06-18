type FieldResolver = (val: unknown) => unknown;
const _registry = new Map<string, FieldResolver>();

export function registerFieldResolver(
  typeId: string,
  fn: FieldResolver,
): void {
  _registry.set(typeId, fn);
}

export function getFieldResolver(typeId: string): FieldResolver | undefined {
  return _registry.get(typeId);
}
