// app/layout.tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "God's Grace Fintech",
  description: "Thrift & Ajo savings platform",
  icons: { icon: "/logo.svg" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0, background: "#000", color: "#fff" }}>
        {children}
      </body>
    </html>
  );
}
