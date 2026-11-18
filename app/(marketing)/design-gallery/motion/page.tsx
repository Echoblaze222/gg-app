import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ReceiptPrinterDemo } from "../MotionDemos";

export const metadata: Metadata = { title: "Design gallery: motion", robots: { index: false, follow: false } };

export default function MotionGalleryPage() {
  // Dev only (ADR-008). Production builds return a 404.
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <main className="mx-auto grid max-w-3xl gap-10 px-4 py-10">
      <header className="grid gap-2">
        <h1 className="font-display text-4xl leading-tight">Motion</h1>
        <p className="text-ink-muted">
          Every animation follows a real state from the server and has a text status and a reduced motion version.
        </p>
      </header>
      <section className="grid gap-6" aria-labelledby="gallery-printer">
        <h2 id="gallery-printer" className="text-2xl">
          Receipt printer
        </h2>
        <p className="text-sm text-ink-muted">
          Plays when the receipt is printing. The Verified stamp lands only when the payment is verified. With reduced motion the finished receipt shows at once.
        </p>
        <ReceiptPrinterDemo />
      </section>
    </main>
  );
}
