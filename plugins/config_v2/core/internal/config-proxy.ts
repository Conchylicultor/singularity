import type { ConfigDescriptor, FieldsRecord } from "./types";
import type { JsonValue } from "./types";

export interface ConfigProxy {
  read(): { content: JsonValue; hash: string | null } | null;
  write(content: JsonValue, hash: string | null): void;
  exists(): boolean;
}

// Pure JS hash — not cryptographic, just for config change detection.
// Produces 12 hex chars (48 bits) from two independent multiply-xorshift accumulators.
export function computeHash(content: JsonValue): string {
  const str = JSON.stringify(content);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 0x9e3779b9);
    h2 = Math.imul(h2 ^ ch, 0x5f356495);
  }
  h1 ^= Math.imul(h1 ^ (h1 >>> 16), 0x85ebca6b);
  h2 ^= Math.imul(h2 ^ (h2 >>> 16), 0xc2b2ae35);
  return (
    (h1 >>> 0).toString(16).padStart(8, "0") +
    (h2 >>> 0).toString(16).padStart(8, "0")
  ).slice(0, 12);
}

export function codeConfigProxy<F extends FieldsRecord>(
  descriptor: ConfigDescriptor<F>,
): ConfigProxy {
  return {
    read() {
      return {
        content: descriptor.defaults as unknown as JsonValue,
        hash: null,
      };
    },
    write() {
      throw new Error("codeConfigProxy is read-only");
    },
    exists() {
      return true;
    },
  };
}

export function readonlyProxy(content: JsonValue): ConfigProxy {
  return {
    read() {
      return { content, hash: null };
    },
    write() {
      throw new Error("readonlyProxy is read-only");
    },
    exists() {
      return true;
    },
  };
}
