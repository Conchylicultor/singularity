import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  asNamespace,
  type Namespace,
} from "@plugins/infra/plugins/namespace/core";
import { namespaceArgv, readNamespaceArgv } from "./namespace-argv";
import {
  declareRuntimeNamespace,
  resetRuntimeNamespaceForTest,
  runtimeNamespace,
} from "./runtime-identity";

const argv = (...rest: string[]) => ["bun", "entry.ts", ...rest];

describe("readNamespaceArgv", () => {
  test("reads the value after --namespace", () => {
    expect(readNamespaceArgv(argv("--namespace", "att-1"))).toBe(
      asNamespace("att-1"),
    );
  });

  test("absent flag → undefined, so the entry point names its own spawner", () => {
    expect(readNamespaceArgv(argv("--socket", "/s.sock"))).toBeUndefined();
  });

  test("a flag with no value throws", () => {
    expect(() => readNamespaceArgv(argv("--namespace"))).toThrow(/no value/);
    expect(() =>
      readNamespaceArgv(argv("--namespace", "--socket", "/s.sock")),
    ).toThrow(/no value/);
  });
});

describe("namespaceArgv", () => {
  let original: Namespace;
  beforeEach(() => {
    original = runtimeNamespace();
    resetRuntimeNamespaceForTest();
  });
  afterEach(() => {
    resetRuntimeNamespaceForTest();
    declareRuntimeNamespace(original);
  });

  test("round-trips through readNamespaceArgv", () => {
    declareRuntimeNamespace(asNamespace("sonata.att-9"));
    expect(readNamespaceArgv(argv(...namespaceArgv()))).toBe(
      asNamespace("sonata.att-9"),
    );
  });

  test("throws in a process that declared nothing", () => {
    expect(() => namespaceArgv()).toThrow(/has not declared/);
  });
});
