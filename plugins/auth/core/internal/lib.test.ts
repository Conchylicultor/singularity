import { test, expect } from "bun:test";
import { defineAuthProvider, type PasswordConfig } from "./lib";

const password: PasswordConfig = {
  exchange: async ({ username }) => ({
    token: "tok",
    identity: { accountId: "primary", displayName: username },
  }),
};

test("defineAuthProvider: password kind with .password is accepted as-is", () => {
  const descriptor = {
    id: "example",
    name: "Example",
    kind: "password" as const,
    password,
  };
  expect(defineAuthProvider(descriptor)).toBe(descriptor);
});

test("defineAuthProvider: password kind without .password throws", () => {
  expect(() =>
    defineAuthProvider({ id: "example", name: "Example", kind: "password" }),
  ).toThrow(
    'defineAuthProvider("example"): kind="password" requires .password',
  );
});

test("defineAuthProvider: password kind is not satisfied by another kind's config", () => {
  expect(() =>
    defineAuthProvider({
      id: "example",
      name: "Example",
      kind: "password",
      apiKey: {},
    }),
  ).toThrow('kind="password" requires .password');
});

test("defineAuthProvider: the existing kinds still require their own config", () => {
  expect(() =>
    defineAuthProvider({ id: "example", name: "Example", kind: "apikey" }),
  ).toThrow('kind="apikey" requires .apiKey');
  expect(() =>
    defineAuthProvider({ id: "example", name: "Example", kind: "oauth2" }),
  ).toThrow('kind="oauth2" requires .oauth');
});

test("defineAuthProvider: a password provider still has its id validated", () => {
  expect(() =>
    defineAuthProvider({
      id: "Bad Id",
      name: "Example",
      kind: "password",
      password,
    }),
  ).toThrow("id must match");
});
