import { Input } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import {
  SegmentedControl,
  type SegmentedOption,
} from "@plugins/primitives/plugins/css/plugins/toggle-chip/web";

/**
 * Config form for the http-request step type. The executor interpolates `url`
 * and `body` against the previous step's output (`{{ path }}` tokens), parses
 * `headers` as one `Key: Value` per line, and performs an SSRF-safe outbound
 * call (see executor.ts). The response is emitted as this step's output so a
 * downstream branch can route on `status` / `body`.
 *
 * Raw `onChange` on every change — the step inspector owns the debounce.
 */
type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface HttpRequestConfigShape {
  method?: string;
  url?: string;
  headers?: string;
  body?: string;
}

const METHOD_OPTIONS: readonly SegmentedOption<HttpMethod>[] = [
  { id: "GET", label: "GET" },
  { id: "POST", label: "POST" },
  { id: "PUT", label: "PUT" },
  { id: "PATCH", label: "PATCH" },
  { id: "DELETE", label: "DELETE" },
];

export function HttpRequestConfig({
  config,
  onChange,
}: {
  config: unknown;
  onChange: (config: unknown) => void;
}) {
  const current = (config ?? {}) as HttpRequestConfigShape;
  const method = (current.method ?? "GET") as HttpMethod;

  return (
    <Stack gap="sm">
      <Stack gap="2xs">
        <Text variant="caption" tone="muted">Method</Text>
        <SegmentedControl
          options={METHOD_OPTIONS}
          value={method}
          onChange={(id) => onChange({ ...current, method: id })}
        />
      </Stack>
      <Stack gap="2xs">
        <Text variant="caption" tone="muted">URL</Text>
        <Input
          value={current.url ?? ""}
          placeholder="https://api.example.com/{{ id }}"
          onChange={(e) => onChange({ ...current, url: e.target.value })}
          aria-label="URL"
        />
      </Stack>
      <Stack gap="2xs">
        <Text variant="caption" tone="muted">Headers</Text>
        <textarea
          value={current.headers ?? ""}
          rows={3}
          placeholder="Content-Type: application/json"
          onChange={(e) => onChange({ ...current, headers: e.target.value })}
          aria-label="Headers"
          className="text-body w-full resize-none bg-transparent outline-none placeholder:text-muted-foreground focus:ring-0"
        />
      </Stack>
      <Stack gap="2xs">
        <Text variant="caption" tone="muted">Body</Text>
        <textarea
          value={current.body ?? ""}
          rows={4}
          placeholder={'{"key": "{{ value }}"}'}
          onChange={(e) => onChange({ ...current, body: e.target.value })}
          aria-label="Body"
          className="text-body w-full resize-none bg-transparent outline-none placeholder:text-muted-foreground focus:ring-0"
        />
      </Stack>
      <Text variant="caption" className="text-muted-foreground">
        One <code>Key: Value</code> per header line. <code>{"{{ path }}"}</code> in the URL or body
        interpolates from the previous step&apos;s output. The response (status, headers, body) is
        emitted as this step&apos;s output.
      </Text>
    </Stack>
  );
}
