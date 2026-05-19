"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body style={{ margin: 0, background: "#000", fontFamily: "Outfit, sans-serif" }}>
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ textAlign: "center", maxWidth: 400 }}>

            <div style={{ width: 60, height: 60, borderRadius: 16, background: "linear-gradient(135deg,#ff5252,#c62828)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, margin: "0 auto 20px" }}>
              ⚠
            </div>

            <div style={{ fontSize: 22, fontWeight: 800, color: "#fff", marginBottom: 10 }}>
              Something went wrong
            </div>

            <div style={{ fontSize: 14, color: "rgba(255,255,255,0.45)", lineHeight: 1.7, marginBottom: 28 }}>
              An unexpected error occurred. Please try again — if the problem persists, contact support.
            </div>

            <button
              onClick={reset}
              style={{ background: "linear-gradient(135deg,#007BFF,#0040ff)", color: "#fff", border: "none", borderRadius: 12, padding: "13px 28px", fontSize: 14, fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 20px #007BFF44" }}
            >
              Try again
            </button>

            <div style={{ marginTop: 16 }}>
              <a href="/" style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", textDecoration: "none" }}>
                ← Back to home
              </a>
            </div>

          </div>
        </div>
      </body>
    </html>
  );
}
