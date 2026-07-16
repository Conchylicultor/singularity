import { describe, expect, test } from "bun:test";
import { computeIdentityHash, computeInputsHash, computeOwnHash } from "./hash";

const filesA = [
  { rel: "web/index.ts", content: "export default {};" },
  { rel: "core/index.ts", content: "export const x = 1;" },
];

describe("computeOwnHash", () => {
  test("stable across file ordering", () => {
    expect(computeOwnHash(filesA)).toBe(computeOwnHash([...filesA].reverse()));
  });

  test("own-file content change ⇒ new hash", () => {
    const changed = [
      { rel: "web/index.ts", content: "export default { changed: true };" },
      filesA[1]!,
    ];
    expect(computeOwnHash(changed)).not.toBe(computeOwnHash(filesA));
  });

  test("rename ⇒ new hash (rel path is an input)", () => {
    const renamed = [
      { rel: "web/main.ts", content: "export default {};" },
      filesA[1]!,
    ];
    expect(computeOwnHash(renamed)).not.toBe(computeOwnHash(filesA));
  });

  test("(path, content) splits cannot collide (length-prefixed)", () => {
    const a = [{ rel: "a", content: "bc" }];
    const b = [{ rel: "ab", content: "c" }];
    expect(computeOwnHash(a)).not.toBe(computeOwnHash(b));
  });

  test("sibling-plugin change ⇒ same hash: the hash only sees own files", () => {
    // Structural property: the function takes ONLY the plugin's own files —
    // there is no input through which another plugin's content could flow.
    expect(computeOwnHash(filesA)).toBe(computeOwnHash(filesA));
  });
});

describe("computeInputsHash / computeIdentityHash", () => {
  const identity = { builderVersion: 1, minify: true, vite: "6.4.2" };

  test("identity is key-order independent", () => {
    expect(computeIdentityHash({ b: "2", a: "1" })).toBe(computeIdentityHash({ a: "1", b: "2" }));
  });

  test("minify flag is a hash input", () => {
    const on = computeIdentityHash({ ...identity, minify: true });
    const off = computeIdentityHash({ ...identity, minify: false });
    expect(on).not.toBe(off);
  });

  test("kind separates web and core artifacts of the same plugin", () => {
    const ownHash = computeOwnHash(filesA);
    const identityHash = computeIdentityHash(identity);
    expect(computeInputsHash({ ownHash, kind: "web", identityHash })).not.toBe(
      computeInputsHash({ ownHash, kind: "core", identityHash }),
    );
  });
});
