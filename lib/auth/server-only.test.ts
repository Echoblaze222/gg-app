// @vitest-environment node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|js|jsx)$/.test(name)) out.push(p);
  }
  return out;
}

describe("B18 the service role key stays on the server", () => {
  const admin = join(ROOT, "lib/auth/supabase-admin.ts");

  it("the admin client module exists and is marked server-only", () => {
    expect(existsSync(admin)).toBe(true);
    expect(readFileSync(admin, "utf8")).toMatch(/^\s*import\s+["']server-only["'];?/m);
  });
  it("no client component imports the admin module or reads the service role key", () => {
    const files = [...walk(join(ROOT, "app")), ...walk(join(ROOT, "components"))];
    const offenders = files.filter((f) => {
      const src = readFileSync(f, "utf8");
      const isClient = /^\s*["']use client["']/m.test(src.slice(0, 300));
      return isClient && (/supabase-admin/.test(src) || /SUPABASE_SERVICE_ROLE/.test(src));
    });
    expect(offenders).toEqual([]);
  });
  it("the service role key is never exposed under a public env name", () => {
    const offenders = [...walk(join(ROOT, "lib")), ...walk(join(ROOT, "app"))].filter((f) => /NEXT_PUBLIC_[A-Z_]*SERVICE_ROLE/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});
