import { describe, expect, test } from "bun:test";
import { parseImportClause } from "./import-clause";

// Each case is the real `src.slice(imp.ss, imp.s)` shape: the statement text up
// to the specifier's first character, i.e. including the trailing `from "`.
const clause = (text: string) => parseImportClause(text);

describe("parseImportClause (import side)", () => {
  test("side-effect import binds nothing", () => {
    expect(clause(`import "`)).toEqual({
      isReexport: false,
      namespace: false,
      star: false,
      hasDefault: false,
      names: [],
    });
  });

  test("named imports record the IMPORTED name, spaced and minified alike", () => {
    expect(clause(`import { ActiveData as h } from "`).names).toEqual(["ActiveData"]);
    expect(clause(`import{a as s}from"`).names).toEqual(["a"]);
    expect(clause(`import { A, B as c, D } from "`).names).toEqual(["A", "B", "D"]);
    expect(clause(`import{a,b as c}from"`).hasDefault).toBe(false);
  });

  test("empty named list binds nothing", () => {
    expect(clause(`import {} from "`).names).toEqual([]);
    expect(clause(`import{}from"`).hasDefault).toBe(false);
  });

  test("default import", () => {
    expect(clause(`import React from "`)).toEqual({
      isReexport: false,
      namespace: false,
      star: false,
      hasDefault: true,
      names: [],
    });
    expect(clause(`import R from"`).hasDefault).toBe(true);
  });

  test("default + named", () => {
    const c = clause(`import React, { useState as u, useRef } from "`);
    expect(c.hasDefault).toBe(true);
    expect(c.names).toEqual(["useState", "useRef"]);
    const min = clause(`import e,{useState as t}from"`);
    expect(min.hasDefault).toBe(true);
    expect(min.names).toEqual(["useState"]);
  });

  test("`{ default as X }` is a default requirement, never a name", () => {
    const c = clause(`import { default as D, A } from "`);
    expect(c.hasDefault).toBe(true);
    expect(c.names).toEqual(["A"]);
    expect(clause(`import{default as e}from"`)).toEqual({
      isReexport: false,
      namespace: false,
      star: false,
      hasDefault: true,
      names: [],
    });
  });

  test("namespace import binds nothing checkable", () => {
    expect(clause(`import * as ns from "`)).toEqual({
      isReexport: false,
      namespace: true,
      star: false,
      hasDefault: false,
      names: [],
    });
    expect(clause(`import*as n from"`).namespace).toBe(true);
  });

  test("default + namespace", () => {
    const c = clause(`import X, * as ns from "`);
    expect(c.hasDefault).toBe(true);
    expect(c.namespace).toBe(true);
    expect(c.names).toEqual([]);
  });

  test("a default binding whose name ends in `from` survives the `from` strip", () => {
    expect(clause(`import xfrom from "`)).toMatchObject({ hasDefault: true, names: [] });
  });

  test("block comments are stripped", () => {
    expect(clause(`import /* c */ { A } from "`).names).toEqual(["A"]);
  });

  test("string-literal binding names are unquoted", () => {
    expect(clause(`import { "a-b" as c } from "`).names).toEqual(["a-b"]);
  });
});

describe("parseImportClause (export side — the phantom-default trap)", () => {
  // es-module-lexer reports `export {…} from "x"` in the IMPORTS array with
  // d === -1, indistinguishable from a real import. Reading the leading
  // identifier as a default binding would read the keyword `export` itself —
  // inventing a `default` requirement the target need not satisfy.
  test("`export {…} from` never yields a phantom default", () => {
    const c = clause(`export { A } from "`);
    expect(c).toEqual({
      isReexport: true,
      namespace: false,
      star: false,
      hasDefault: false,
      names: ["A"],
    });
    expect(clause(`export{a,b as c}from"`)).toEqual({
      isReexport: true,
      namespace: false,
      star: false,
      hasDefault: false,
      names: ["a", "b"],
    });
  });

  test("`export { default as D } from` requires default exactly once", () => {
    const c = clause(`export { default as D, A } from "`);
    expect(c.isReexport).toBe(true);
    expect(c.hasDefault).toBe(true);
    expect(c.names).toEqual(["A"]);
  });

  test("`export * from` is a star re-export (makes the importer opaque)", () => {
    expect(clause(`export * from "`)).toEqual({
      isReexport: true,
      namespace: false,
      star: true,
      hasDefault: false,
      names: [],
    });
    expect(clause(`export*from"`).star).toBe(true);
  });

  test("`export * as ns from` binds a namespace, not a star re-export", () => {
    expect(clause(`export * as ns from "`)).toEqual({
      isReexport: true,
      namespace: true,
      star: false,
      hasDefault: false,
      names: [],
    });
  });
});

describe("parseImportClause (degrades toward verifying nothing)", () => {
  test("a dynamic import's clause binds nothing", () => {
    expect(clause(`import("`)).toMatchObject({ hasDefault: false, names: [] });
  });

  test("unrecognized text binds nothing", () => {
    expect(clause(`require("`)).toEqual({
      isReexport: false,
      namespace: false,
      star: false,
      hasDefault: false,
      names: [],
    });
  });
});
