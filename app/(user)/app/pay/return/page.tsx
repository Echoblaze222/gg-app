import { redirect } from "next/navigation";

type Search = Record<string, string | string[] | undefined>;

/**
 * The payment service sends the browser back from the provider to `${appUrl}/app/pay/return`. The screen that verifies the
 * payment with the server lives at /app/pay, so this route only forwards the two reference parameters there. It decides
 * nothing: the redirect proves nothing about the payment, /app/pay verifies the reference with the server.
 */
export default async function PayReturnPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const qs = new URLSearchParams();
  for (const key of ["reference", "trxref"]) {
    const value = sp[key];
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) qs.append(key, item);
  }
  const query = qs.toString();
  redirect(query ? `/app/pay?${query}` : "/app/pay");
}
