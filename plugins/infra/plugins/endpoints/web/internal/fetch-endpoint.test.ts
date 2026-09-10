import { afterEach, describe, expect, mock, test } from "bun:test";
import { z } from "zod";
import { defineEndpoint } from "../../core/define-endpoint";
import { EndpointError, fetchEndpoint } from "./fetch-endpoint";

const ping = defineEndpoint({
  route: "POST /api/ping",
  body: z.object({ n: z.number() }),
  response: z.object({ ok: z.boolean() }),
});

// Backoff of 1 ms keeps the retried cases instant; the schedule itself is
// fetchWithRetry's, not what these tests are about.
const RETRY = { retries: 2, backoffMs: 1 };

const realFetch = globalThis.fetch;

/** Install a fetch that answers each call with the next step, in order. */
function stubFetch(steps: (() => Response)[]) {
  const fn = mock(() => {
    const step = steps.shift();
    if (!step) throw new Error("fetch called more times than stubbed");
    return Promise.resolve(step());
  });
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

const status = (code: number) => () => new Response("down", { status: code });
const ok = () => () => Response.json({ ok: true });
const networkError = () => () => {
  throw new TypeError("Failed to fetch");
};

/**
 * Await `p` and return what it rejected with; throw if it resolved.
 * `expect(p).rejects.…` is typed `void` under bun:test, so awaiting it is an
 * `await` of a non-Thenable (the inflight / host-semaphore suites use the same
 * helper) — this asserts the rejection for real.
 */
async function rejection(p: Promise<unknown>): Promise<unknown> {
  try {
    await p;
  } catch (err) {
    return err;
  }
  throw new Error("expected the promise to reject, but it resolved");
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("fetchEndpoint retry", () => {
  test("a 503 followed by a 200 succeeds", async () => {
    const fn = stubFetch([status(503), ok()]);
    const res = await fetchEndpoint(ping, {}, { body: { n: 1 }, retry: RETRY });
    expect(res).toEqual({ ok: true });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  test("a network error on every attempt throws after the last one", async () => {
    const fn = stubFetch([networkError(), networkError(), networkError()]);
    const call = fetchEndpoint(ping, {}, { body: { n: 1 }, retry: RETRY });
    expect(await rejection(call)).toMatchObject({ message: "Failed to fetch" });
    expect(fn).toHaveBeenCalledTimes(RETRY.retries + 1);
  });

  test("a 503 on every attempt ends as an EndpointError for that status", async () => {
    stubFetch([status(503), status(503), status(503)]);
    const call = fetchEndpoint(
      ping,
      {},
      { body: { n: 1 }, retry: RETRY, report: false },
    );
    const err = await rejection(call);
    expect(err).toBeInstanceOf(EndpointError);
    expect(err).toMatchObject({ status: 503, body: "down" });
  });

  test("a 400 is not retried", async () => {
    const fn = stubFetch([status(400), ok()]);
    const call = fetchEndpoint(
      ping,
      {},
      { body: { n: 1 }, retry: RETRY, report: false },
    );
    expect(await rejection(call)).toMatchObject({ status: 400 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test("without the retry option a 503 is a single attempt", async () => {
    const fn = stubFetch([status(503), ok()]);
    const call = fetchEndpoint(ping, {}, { body: { n: 1 }, report: false });
    expect(await rejection(call)).toMatchObject({ status: 503 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test("resends the same request on each attempt", async () => {
    const fn = stubFetch([status(502), ok()]);
    await fetchEndpoint(ping, {}, { body: { n: 7 }, retry: RETRY });
    const calls = fn.mock.calls as unknown as [string, RequestInit][];
    expect(calls.map(([url, init]) => [url, init.method, init.body])).toEqual([
      ["/api/ping", "POST", '{"n":7}'],
      ["/api/ping", "POST", '{"n":7}'],
    ]);
  });
});
