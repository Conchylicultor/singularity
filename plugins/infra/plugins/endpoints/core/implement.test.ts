import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { defineEndpoint } from "./define-endpoint";
import { implement } from "./implement";

const req = () => new Request("http://localhost/api/thing");

describe("implement", () => {
  test("a null result of a nullable response is JSON null, not a 204", async () => {
    const ep = defineEndpoint({
      route: "GET /api/thing",
      response: z.object({ a: z.string() }).nullable(),
    });
    const res = await implement(ep, () => null)(req(), {});
    expect(res.status).toBe(200);
    expect(await ep.responseCodec!.decodeResponse(res)).toBeNull();
  });

  test("an undefined result is a 204", async () => {
    const ep = defineEndpoint({ route: "POST /api/thing" });
    const res = await implement(ep, () => undefined)(req(), {});
    expect(res.status).toBe(204);
  });
});
