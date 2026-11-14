import type { Metadata } from "next";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "GG Contribution",
  description: "Save on your own schedule and request your money when you need it.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
