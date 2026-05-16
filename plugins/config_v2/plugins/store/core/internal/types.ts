export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface Disposable {
  dispose(): void;
}

export interface ConfigStore {
  read(path: string): Promise<JsonValue | undefined>;
  write(path: string, value: JsonValue): Promise<void>;
  watch(path: string, cb: (value: JsonValue | undefined) => void): Disposable;
  list(): Promise<string[]>;
}
