import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ComponentGallery } from "../ComponentGallery";

export const metadata: Metadata = { title: "Design gallery: layout components", robots: { index: false, follow: false } };

export default function ComponentGalleryPage() {
  // Dev only (ADR-008). Production builds return a 404.
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <main className="mx-auto grid max-w-3xl gap-10 px-4 py-10">
      <header className="grid gap-2">
        <h1 className="font-display text-4xl leading-tight">Layout components</h1>
        <p className="text-ink-muted">
          States, modal and sheet, navigation, timeline pills, progress ring and data table. The first gallery page has the form controls and feedback.
        </p>
      </header>
      <ComponentGallery />
    </main>
  );
}
