export function base32ToBuffer(input: string): Buffer;
export function totpCode(secretBase32: string, timeMs: number, opts?: { digits?: number; step?: number }): string;
export function stepOf(timeMs: number, step?: number): number;
export function secondsUntilNextStep(timeMs: number, step?: number): number;
export function decodeClaims(jwt: string): Record<string, unknown>;
export function makeEmail(base: string, runId: string, tag: string): string;
export function randomPassword(): string;
export function utf8Length(s: string): number;
export function errSummary(e: { status?: number; code?: string; name?: string } | null | undefined): string;
