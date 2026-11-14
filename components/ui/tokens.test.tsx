import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const css = readFileSync(join(root, "styles/tokens.css"), "utf8");
const contract = readFileSync(join(root, "contracts/design-tokens.md"), "utf8");

const tokens = new Map<string, string>();
for (const m of css.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
  if (!tokens.has(m[1])) tokens.set(m[1], m[2].trim());
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
const color = (name: string) => {
  const v = tokens.get(`--color-${name}`);
  if (!v || !/^#[0-9a-f]{6}$/i.test(v)) throw new Error(`--color-${name} must be a 6 digit hex value`);
  return v;
};

describe("frozen token names (contracts/design-tokens.md)", () => {
  const frozen = [...new Set([...contract.matchAll(/`(--[a-z0-9-]+)`/g)].map((m) => m[1]))];

  it("reads a plausible number of names from the contract", () => {
    expect(frozen.length).toBeGreaterThan(60);
  });

  for (const name of frozen) {
    it(`defines ${name}`, () => {
      expect(tokens.has(name)).toBe(true);
    });
  }

  it("meets the 44 px touch target minimum", () => {
    expect(tokens.get("--target-min")).toBe("44px");
  });
});

describe("text contrast is at least 4.5 to 1", () => {
  const text: Array<[string, string]> = [
    ["ink", "canvas"],
    ["ink", "surface"],
    ["ink-muted", "canvas"],
    ["ink-muted", "surface"],
    ["ink-inverse", "ink"],
    ["accent-ink", "accent"],
    ["accent", "canvas"],
    ["accent", "surface"],
    ["success", "success-surface"],
    ["pending", "pending-surface"],
    ["error", "error-surface"],
    ["warning", "warning-surface"],
    ["success", "canvas"],
    ["pending", "canvas"],
    ["error", "canvas"],
    ["warning", "canvas"],
    ["ink-inverse", "success"],
    ["ink-inverse", "error"],
  ];
  for (const [fg, bg] of text) {
    it(`${fg} on ${bg}`, () => {
      expect(ratio(color(fg), color(bg))).toBeGreaterThanOrEqual(4.5);
    });
  }
});

describe("info alert tint (accent mixed into the surface)", () => {
  it("keeps accent text readable on the tint", () => {
    const hex = (c: number[]) => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
    const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const [a, s] = [rgb(color("accent")), rgb(color("surface"))];
    const tint = hex(a.map((v, i) => v * 0.1 + s[i] * 0.9));
    expect(ratio(color("accent"), tint)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(color("ink"), tint)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("interface component contrast is at least 3 to 1", () => {
  for (const bg of ["canvas", "surface"]) {
    it(`border on ${bg}`, () => expect(ratio(color("border"), color(bg))).toBeGreaterThanOrEqual(3));
    it(`focus ring on ${bg}`, () => expect(ratio(color("focus-ring"), color(bg))).toBeGreaterThanOrEqual(3));
  }
  it("focus ring on black surfaces", () => {
    const block = css.match(/\[data-surface="ink"\]\s*\{([^}]*)\}/);
    expect(block).not.toBeNull();
    const ring = block![1].match(/--color-focus-ring\s*:\s*(#[0-9a-f]{6})/i);
    expect(ring).not.toBeNull();
    expect(ratio(ring![1], color("ink"))).toBeGreaterThanOrEqual(4.5 - 1.5);
  });
});

describe("one accent hue only", () => {
  it("defines a single accent color", () => {
    const accents = [...tokens.keys()].filter((k) => /^--color-accent(-|$)/.test(k) && k !== "--color-accent-ink");
    expect(accents).toEqual(["--color-accent"]);
  });
});
