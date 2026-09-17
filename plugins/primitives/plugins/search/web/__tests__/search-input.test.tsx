import { afterEach, describe, expect, it } from "vitest";
import { useState } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { SearchInput } from "../internal/search-input";

afterEach(cleanup);

function Controlled(props: { appearance?: "field" | "bare"; initial: string }) {
  const [value, setValue] = useState(props.initial);
  return (
    <SearchInput
      appearance={props.appearance}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      placeholder="Search"
    />
  );
}

describe("SearchInput appearance", () => {
  it("field (default) draws no key hint", () => {
    render(<Controlled initial="" />);
    expect(screen.queryByText("/")).toBeNull();
  });

  it("bare shows the / hint while empty and a clear button while not", () => {
    render(<Controlled appearance="bare" initial="" />);
    expect(screen.getByText("/")).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText("Search"), {
      target: { value: "abc" },
    });
    expect(screen.queryByText("/")).toBeNull();
    expect(screen.getByRole("button", { name: "Clear filter" })).toBeTruthy();
  });

  it("bare: Escape clears the query and leaves the field", () => {
    render(<Controlled appearance="bare" initial="abc" />);
    const input = screen.getByPlaceholderText("Search") as HTMLInputElement;
    act(() => input.focus());
    expect(document.activeElement).toBe(input);

    fireEvent.keyDown(input, { key: "Escape" });
    expect(input.value).toBe("");
    expect(document.activeElement).not.toBe(input);
  });

  it("field: Escape is left alone", () => {
    render(<Controlled initial="abc" />);
    const input = screen.getByPlaceholderText("Search") as HTMLInputElement;
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input.value).toBe("abc");
  });
});
