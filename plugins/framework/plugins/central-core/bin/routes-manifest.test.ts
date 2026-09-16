import { expect, test } from "bun:test";
import { centralRoutePrefixes } from "./routes-manifest";

test("an HTTP route is cut at its first param, and the method is dropped", () => {
  expect(
    centralRoutePrefixes(
      [
        "POST /api/auth/sign-in/:provider",
        "GET /api/central-resources/:key",
        "GET /api/things/:id/children",
      ],
      [],
    ),
  ).toEqual(["/api/auth/sign-in/", "/api/central-resources/", "/api/things/"]);
});

test("a route with no param is kept whole", () => {
  expect(centralRoutePrefixes(["GET /api/auth/state"], [])).toEqual([
    "/api/auth/state",
  ]);
});

test("WebSocket paths are kept as-is, merged, de-duplicated and sorted", () => {
  expect(
    centralRoutePrefixes(
      ["GET /api/auth/start/:provider", "GET /api/auth/callback/:provider"],
      ["/ws/central-notifications", "/ws/central-notifications"],
    ),
  ).toEqual([
    "/api/auth/callback/",
    "/api/auth/start/",
    "/ws/central-notifications",
  ]);
});
