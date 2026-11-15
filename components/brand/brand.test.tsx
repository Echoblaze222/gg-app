import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BrandSymbol } from "./BrandSymbol";
import { Wordmark } from "./Wordmark";

const dir = join(process.cwd(), "public/brand");
const svgs = readdirSync(dir).filter((f) => f.endsWith(".svg"));

describe("brand files", () => {
  it("ships symbol and app icon variants for light, dark and monochrome", () => {
    for (const name of ["symbol-on-light", "symbol-on-dark", "symbol-mono-black", "symbol-mono-white", "app-icon-dark", "app-icon-light", "app-icon-mono"]) {
      expect(svgs).toContain(`${name}.svg`);
    }
  });

  for (const file of svgs) {
    it(`${file} is a labelled svg with no gradient and no em dash`, () => {
      const text = readFileSync(join(dir, file), "utf8");
      expect(text).toMatch(/^<svg /);
      expect(text).toContain("aria-label=");
      expect(text).not.toMatch(/gradient/i);
      expect(text.includes(String.fromCharCode(8212))).toBe(false);
    });
  }
});

describe("BrandSymbol", () => {
  it("is hidden from screen readers when it has no title", () => {
    const { container } = render(<BrandSymbol />);
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("gets a text name when a title is given", () => {
    render(<BrandSymbol title="GG Contribution" />);
    expect(screen.getByRole("img", { name: "GG Contribution" })).toBeTruthy();
  });

  it("uses a different clip id for each instance", () => {
    const { container } = render(
      <>
        <BrandSymbol />
        <BrandSymbol />
      </>,
    );
    const ids = [...container.querySelectorAll("clipPath")].map((c) => c.id);
    expect(new Set(ids).size).toBe(2);
  });
});

describe("Wordmark", () => {
  it("renders the product name as text", () => {
    render(<Wordmark />);
    expect(screen.getByText("GG Contribution")).toBeTruthy();
  });

  it("name layout has no symbol", () => {
    const { container } = render(<Wordmark layout="name" />);
    expect(container.querySelector("svg")).toBeNull();
  });
});
