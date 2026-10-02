import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ChartState } from "../components/chart-state";
import { Sparkline } from "../components/sparkline";

afterEach(cleanup);

describe("ChartState", () => {
  it("holds the chart's height in every state", () => {
    for (const el of [
      <ChartState key="l" state="loading" height={180} />,
      <ChartState key="e" state="empty" height={180} />,
      <ChartState key="x" state="error" height={180} message="boom" />,
    ]) {
      const { container, unmount } = render(el);
      expect((container.firstChild as HTMLElement).style.height).toBe("180px");
      unmount();
    }
  });

  it("says loading, empty, or the error with a retry", () => {
    const onRetry = vi.fn();
    render(<ChartState state="loading" height={100} />);
    expect(screen.getByRole("status")).not.toBeNull();
    cleanup();
    render(<ChartState state="empty" height={100} message="Nothing yet" />);
    expect(screen.getByText("Nothing yet")).not.toBeNull();
    cleanup();
    render(
      <ChartState
        state="error"
        height={100}
        message="Query failed"
        onRetry={onRetry}
      />,
    );
    expect(screen.getByRole("alert").textContent).toContain("Query failed");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalled();
  });
});

describe("Sparkline", () => {
  it("draws the trend and a dot on the last present value", () => {
    const { container } = render(<Sparkline values={[1, 3, 2, null]} />);
    expect(container.querySelector("path")!.getAttribute("d")).toMatch(/^M/);
    expect(container.querySelectorAll("circle")).toHaveLength(1);
  });

  it("draws nothing for all-null values and a dot for one value", () => {
    const empty = render(<Sparkline values={[null, null]} />);
    expect(empty.container.querySelector("circle")).toBeNull();
    empty.unmount();
    const one = render(<Sparkline values={[4]} />);
    expect(one.container.querySelectorAll("circle")).toHaveLength(1);
  });
});
