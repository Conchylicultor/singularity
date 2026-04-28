import {
  deleteLocal,
  getLocal,
  getMetadataLocal,
  hasLocal,
  listKeysLocal,
  setLocal,
} from "./store";

interface RefBody {
  namespace?: unknown;
  key?: unknown;
}

interface SetBody extends RefBody {
  value?: unknown;
}

interface ListBody {
  namespace?: unknown;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function parseRef(body: RefBody): { namespace: string; key: string } | Response {
  if (typeof body.namespace !== "string" || typeof body.key !== "string") {
    return json({ error: "invalid-ref" }, 400);
  }
  return { namespace: body.namespace, key: body.key };
}

async function readBody<T>(req: Request): Promise<T | Response> {
  try {
    return (await req.json()) as T;
  } catch {
    return json({ error: "invalid-json" }, 400);
  }
}

export async function handleGet(req: Request): Promise<Response> {
  const body = await readBody<RefBody>(req);
  if (body instanceof Response) return body;
  const ref = parseRef(body);
  if (ref instanceof Response) return ref;
  const value = getLocal(ref.namespace, ref.key);
  return json({ value: value ?? null });
}

export async function handleSet(req: Request): Promise<Response> {
  const body = await readBody<SetBody>(req);
  if (body instanceof Response) return body;
  const ref = parseRef(body);
  if (ref instanceof Response) return ref;
  if (typeof body.value !== "string") {
    return json({ error: "invalid-value" }, 400);
  }
  await setLocal(ref.namespace, ref.key, body.value);
  return json({ ok: true });
}

export async function handleDelete(req: Request): Promise<Response> {
  const body = await readBody<RefBody>(req);
  if (body instanceof Response) return body;
  const ref = parseRef(body);
  if (ref instanceof Response) return ref;
  await deleteLocal(ref.namespace, ref.key);
  return json({ ok: true });
}

export async function handleHas(req: Request): Promise<Response> {
  const body = await readBody<RefBody>(req);
  if (body instanceof Response) return body;
  const ref = parseRef(body);
  if (ref instanceof Response) return ref;
  return json({ has: hasLocal(ref.namespace, ref.key) });
}

export async function handleMeta(req: Request): Promise<Response> {
  const body = await readBody<RefBody>(req);
  if (body instanceof Response) return body;
  const ref = parseRef(body);
  if (ref instanceof Response) return ref;
  return json(getMetadataLocal(ref.namespace, ref.key));
}

export async function handleList(req: Request): Promise<Response> {
  const body = await readBody<ListBody>(req);
  if (body instanceof Response) return body;
  if (typeof body.namespace !== "string") {
    return json({ error: "invalid-namespace" }, 400);
  }
  return json({ keys: listKeysLocal(body.namespace) });
}
