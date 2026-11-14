/** Appends a page to a list without duplicates and without reordering what is already shown. */
export function appendPage<T extends { readonly id: string }>(existing: readonly T[], incoming: readonly T[]): T[] {
  const known = new Set(existing.map((item) => item.id));
  const added: T[] = [];
  for (const item of incoming) {
    if (!known.has(item.id)) {
      known.add(item.id);
      added.push(item);
    }
  }
  return [...existing, ...added];
}
