import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EASING, MOTION_MS } from "./tokens";

const css = readFileSync(join(process.cwd(), "styles/tokens.css"), "utf8");

function cssValue(name: string): string {
  const match = css.match(new RegExp(`${name}\\s*:\\s*([^;]+);`));
  if (!match) throw new Error(`${name} is missing from styles/tokens.css`);
  return match[1].trim();
}

describe("motion tokens stay in sync between CSS and TypeScript", () => {
  for (const [key, ms] of Object.entries(MOTION_MS)) {
    it(`--motion-${key} equals ${ms} ms`, () => {
      expect(cssValue(`--motion-${key}`)).toBe(`${ms}ms`);
    });
  }
  for (const [key, curve] of Object.entries(EASING)) {
    it(`--ease-${key} matches`, () => {
      expect(cssValue(`--ease-${key}`)).toBe(curve);
    });
  }
  it("keeps durations inside the RESEARCH.md 4.6 budget", () => {
    expect(MOTION_MS.fast).toBeGreaterThanOrEqual(120);
    expect(MOTION_MS.base).toBeLessThanOrEqual(250);
    expect(MOTION_MS.slow).toBeGreaterThanOrEqual(300);
    expect(MOTION_MS.slow).toBeLessThanOrEqual(500);
    expect(MOTION_MS.deliberate).toBeGreaterThanOrEqual(1500);
    expect(MOTION_MS.deliberate).toBeLessThanOrEqual(3000);
  });
});
