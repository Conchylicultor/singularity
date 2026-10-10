/**
 * Tests for the `no-endpoint-read` lint rule. The rule module alone flags
 * every web file; the substrate and burndown exemptions are `exempt/index.ts`
 * manifests, checked by `exempt:manifests-valid` and the unused-exemption
 * report.
 */

import { RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import rule from "./no-endpoint-read";

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tsParser,
    parserOptions: { ecmaVersion: "latest", sourceType: "module" },
  },
});

const ENDPOINTS_WEB = "@plugins/infra/plugins/endpoints/web";
const LIVE_STATE_WEB = "@plugins/primitives/plugins/live-state/web";
const REACT_QUERY = "@tanstack/react-query";

/** A browser-runtime file — the rule's scope. */
const WEB = "plugins/shell/plugins/toast/web/internal/view.tsx";

const hook = (name: string) => ({ messageId: "readHook", data: { name } });
const queryFnFetch = { messageId: "queryFnFetch" };

// `RuleTester.run` drives the test harness itself (it calls the ambient
// describe/it that bun:test provides), so it must run at module top level.
ruleTester.run(
  "no-endpoint-read",
  // The eslint flat-config RuleTester is typed against the legacy Rule shape;
  // the typescript-eslint createRule object is compatible at runtime.
  rule as unknown as Parameters<RuleTester["run"]>[1],
  {
    valid: [
      // The live read.
      {
        filename: WEB,
        code: `import { useLive } from "@plugins/network/plugins/live/web";`,
      },
      // Writes stay on endpoints.
      {
        filename: WEB,
        code: `
          import { fetchEndpoint } from "${ENDPOINTS_WEB}";
          import { useMutation } from "${REACT_QUERY}";
          useMutation({ mutationFn: (b) => fetchEndpoint(save, { body: b }) });
          async function onClick() { await fetchEndpoint(save, {}); }
        `,
      },
      // A name the read-hook barrels export that is not a read hook.
      {
        filename: WEB,
        code: `import { useQueryClient, useMutation } from "${REACT_QUERY}";`,
      },
      // The same imports outside a web/ folder are out of scope.
      {
        filename: "plugins/shell/plugins/toast/server/internal/read.ts",
        code: `import { useQuery } from "${REACT_QUERY}";`,
      },
      {
        filename: "plugins/shell/plugins/toast/core/read.ts",
        code: `
          import { fetchEndpoint } from "${ENDPOINTS_WEB}";
          const o = { queryFn: () => fetchEndpoint(read, {}) };
        `,
      },
      // A hook name from a barrel that does not export it as a read hook.
      {
        filename: WEB,
        code: `import { useQuery } from "./local-query";`,
      },
      // A queryFn that reads something other than an endpoint.
      {
        filename: WEB,
        code: `const o = { queryFn: () => fetch("/x") };`,
      },
      // A local `fetchEndpoint` that is not the endpoints barrel's.
      {
        filename: WEB,
        code: `
          function fetchEndpoint() {}
          const o = { queryFn: () => fetchEndpoint() };
        `,
      },
      // A local shadowing the imported fetchEndpoint.
      {
        filename: WEB,
        code: `
          import { fetchEndpoint } from "${ENDPOINTS_WEB}";
          const o = { queryFn: (fetchEndpoint) => fetchEndpoint() };
        `,
      },
      // fetchEndpoint as a queryFn property's KEY side, or in a sibling.
      {
        filename: WEB,
        code: `
          import { fetchEndpoint } from "${ENDPOINTS_WEB}";
          const o = { queryFn: read, onSuccess: () => fetchEndpoint(ack, {}) };
        `,
      },
      // A namespace read of a non-hook name; a shadowing local.
      {
        filename: WEB,
        code: `
          import * as rq from "${REACT_QUERY}";
          rq.useQueryClient();
          function f(rq: { useQuery: () => void }) { rq.useQuery(); }
        `,
      },
      // A type position calls nothing.
      {
        filename: WEB,
        code: `
          import type * as rq from "${REACT_QUERY}";
          type R = ReturnType<typeof rq.useQuery>;
        `,
      },
    ],
    invalid: [
      {
        filename: WEB,
        code: `import { useEndpoint } from "${ENDPOINTS_WEB}";`,
        errors: [hook("useEndpoint")],
      },
      {
        filename: WEB,
        code: `import { useEndpointResource } from "${LIVE_STATE_WEB}";`,
        errors: [hook("useEndpointResource")],
      },
      {
        filename: WEB,
        code: `import { useQuery, useInfiniteQuery, useSuspenseQuery, useQueries } from "${REACT_QUERY}";`,
        errors: [
          hook("useQuery"),
          hook("useInfiniteQuery"),
          hook("useSuspenseQuery"),
          hook("useQueries"),
        ],
      },
      // Aliased: flagged by its imported name.
      {
        filename: WEB,
        code: `import { useQuery as read } from "${REACT_QUERY}";`,
        errors: [hook("useQuery")],
      },
      // Re-exported.
      {
        filename: WEB,
        code: `export { useEndpoint } from "${ENDPOINTS_WEB}";`,
        errors: [hook("useEndpoint")],
      },
      // A namespace import, by member (dot and string).
      {
        filename: WEB,
        code: `
          import * as rq from "${REACT_QUERY}";
          rq.useQuery({});
          rq["useInfiniteQuery"]({});
        `,
        errors: [hook("useQuery"), hook("useInfiniteQuery")],
      },
      // Destructured off a namespace import / an awaited dynamic import.
      {
        filename: WEB,
        code: `
          import * as endpoints from "${ENDPOINTS_WEB}";
          const { useEndpoint } = endpoints;
          const { useQuery: q } = await import("${REACT_QUERY}");
        `,
        errors: [hook("useEndpoint"), hook("useQuery")],
      },
      // A bound awaited dynamic import, read by member.
      {
        filename: WEB,
        code: `
          const ls = await import("${LIVE_STATE_WEB}");
          ls.useEndpointResource(e);
        `,
        errors: [hook("useEndpointResource")],
      },
      // fetchEndpoint inside a queryFn — arrow, function, method, nested.
      {
        filename: WEB,
        code: `
          import { fetchEndpoint } from "${ENDPOINTS_WEB}";
          useQueryResource({ queryKey: ["x"], queryFn: () => fetchEndpoint(read, {}) });
          const a = { queryFn: async function () { return await fetchEndpoint(read, {}); } };
          const b = { "queryFn": async ({ pageParam }) => {
            const page = await fetchEndpoint(read, { query: { cursor: pageParam } });
            return page;
          } };
        `,
        errors: [queryFnFetch, queryFnFetch, queryFnFetch],
      },
      // Aliased, off a namespace, or destructured off the module object.
      {
        filename: WEB,
        code: `
          import { fetchEndpoint as get } from "${ENDPOINTS_WEB}";
          import * as endpoints from "${ENDPOINTS_WEB}";
          const { fetchEndpoint: f } = endpoints;
          const o = { queryFn: () => get(read, {}) };
          const p = { queryFn: () => endpoints.fetchEndpoint(read, {}) };
          const q = { queryFn: () => f(read, {}) };
        `,
        errors: [queryFnFetch, queryFnFetch, queryFnFetch],
      },
    ],
  },
);
