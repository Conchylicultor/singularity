export interface FieldStorageProvider {
  load(descriptorName: string, fieldKey: string): Promise<{ value: string; set: boolean }>;
  save(descriptorName: string, fieldKey: string, value: string): Promise<void>;
  clear(descriptorName: string, fieldKey: string): Promise<void>;
}

const _registry = new Map<string, FieldStorageProvider>();

export function registerFieldStorageProvider(typeId: string, provider: FieldStorageProvider): void {
  _registry.set(typeId, provider);
}

export function getFieldStorageProvider(typeId: string): FieldStorageProvider | undefined {
  return _registry.get(typeId);
}

export function hasFieldStorageProvider(typeId: string): boolean {
  return _registry.has(typeId);
}
