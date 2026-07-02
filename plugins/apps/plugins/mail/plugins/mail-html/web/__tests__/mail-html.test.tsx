import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, render, fireEvent } from "@testing-library/react";
import { MailHtml } from "../index";

// DOM-bound coverage of the sanitize → image-gate → cid-resolve → quote-collapse
// pipeline (DOMPurify needs a DOM, so this can't be a bun:test).

afterEach(cleanup);

describe("MailHtml sanitization", () => {
  it("strips <script> and inline event handlers", () => {
    const { container } = render(
      <MailHtml
        html={`<p onclick="steal()">hi</p><script>alert(1)</script>`}
        showRemoteImages={false}
      />,
    );
    expect(container.querySelector("script")).toBeNull();
    const p = container.querySelector("p")!;
    expect(p.getAttribute("onclick")).toBeNull();
    expect(p.textContent).toBe("hi");
  });

  it("forces links to open externally with a safe rel", () => {
    const { container } = render(
      <MailHtml html={`<a href="https://x.com">x</a>`} showRemoteImages={false} />,
    );
    const a = container.querySelector("a")!;
    expect(a.getAttribute("target")).toBe("_blank");
    expect(a.getAttribute("rel")).toBe("noopener noreferrer nofollow");
  });

  it("neutralizes javascript: hrefs", () => {
    const { container } = render(
      // eslint-disable-next-line no-script-url
      <MailHtml html={`<a href="javascript:evil()">x</a>`} showRemoteImages={false} />,
    );
    expect(container.querySelector("a")?.getAttribute("href")).toBeNull();
  });
});

describe("MailHtml remote-image gating", () => {
  it("blocks remote images and reports detection when opted out", () => {
    const onDetect = vi.fn();
    const { container } = render(
      <MailHtml
        html={`<img src="https://tracker.example/px.gif">`}
        showRemoteImages={false}
        onRemoteImagesDetected={onDetect}
      />,
    );
    const img = container.querySelector("img")!;
    expect(img.getAttribute("src")).toBeNull();
    expect(img.getAttribute("data-blocked-src")).toBe(
      "https://tracker.example/px.gif",
    );
    expect(onDetect).toHaveBeenCalledWith(true);
  });

  it("rewrites remote images to the same-origin proxy when opted in", () => {
    const { container } = render(
      <MailHtml
        html={`<img src="https://tracker.example/px.gif">`}
        showRemoteImages={true}
      />,
    );
    const src = container.querySelector("img")!.getAttribute("src")!;
    expect(src.startsWith("/api/mail/image?url=")).toBe(true);
    expect(src).toContain(encodeURIComponent("https://tracker.example/px.gif"));
  });

  it("reports no remote images for a purely local message", () => {
    const onDetect = vi.fn();
    render(
      <MailHtml html={`<p>plain text</p>`} showRemoteImages={false} onRemoteImagesDetected={onDetect} />,
    );
    expect(onDetect).toHaveBeenCalledWith(false);
  });

  it("blocks inline data: images regardless of the opt-in", () => {
    const { container } = render(
      <MailHtml
        html={`<img src="data:image/svg+xml,<svg onload=alert(1)>">`}
        showRemoteImages={true}
      />,
    );
    // Either the img was dropped outright, or its data: src was stripped —
    // both mean nothing loads.
    expect(container.querySelector("img")?.getAttribute("src") ?? null).toBeNull();
  });
});

describe("MailHtml cid resolution", () => {
  it("resolves cid: images through resolveCid", () => {
    const { container } = render(
      <MailHtml
        html={`<img src="cid:logo@x">`}
        showRemoteImages={false}
        resolveCid={(cid) => (cid === "logo@x" ? "/api/attachments/abc" : undefined)}
      />,
    );
    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "/api/attachments/abc",
    );
  });

  it("leaves a placeholder when the cid is not yet available", () => {
    const { container } = render(
      <MailHtml html={`<img src="cid:logo@x">`} showRemoteImages={false} resolveCid={() => undefined} />,
    );
    const img = container.querySelector("img")!;
    expect(img.getAttribute("src")).toBeNull();
    expect(img.getAttribute("data-cid")).toBe("logo@x");
  });
});

describe("MailHtml quoted-history collapse", () => {
  it("collapses a gmail_quote behind a toggle, revealing on click", () => {
    const { container, getByRole } = render(
      <MailHtml
        html={`<div>Reply body</div><div class="gmail_quote">On day, X wrote: quoted stuff</div>`}
        showRemoteImages={false}
      />,
    );
    // Main body visible; quoted hidden until toggled.
    expect(container.textContent).toContain("Reply body");
    expect(container.textContent).not.toContain("quoted stuff");

    fireEvent.click(getByRole("button"));
    expect(container.textContent).toContain("quoted stuff");
  });

  it("renders no toggle when there is no quoted history", () => {
    const { queryByRole } = render(
      <MailHtml html={`<p>just a note</p>`} showRemoteImages={false} />,
    );
    expect(queryByRole("button")).toBeNull();
  });
});
