"use client";
/**
 * components/PaymentDetails.tsx
 * Shown on the member dashboard when they click "Make Payment"
 *
 * Reads the collection account from app_settings (set by admin)
 * Member sees: bank, account number, account name, their reference
 * Member copies the details and makes the bank transfer manually
 * OR — wire up Paystack/Flutterwave for inline payment
 */

import { useState } from "react";
import { useAppSettings, dbMakeContribution, type CollectionAccount } from "@/lib/hooks/gg";

const G = {
  border: "rgba(255,255,255,0.07)",
  muted:  "rgba(255,255,255,0.38)",
  green:  "#00e676",
  red:    "#ff5252",
  blue:   "#60a5fa",
  amber:  "#ff9800",
};

const fmt = (n: number) => "₦" + (n / 100).toLocaleString("en-NG");

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <button onClick={copy} style={{ background: copied ? "rgba(0,230,118,0.12)" : "rgba(255,255,255,0.06)", border: `1px solid ${copied ? "rgba(0,230,118,0.3)" : G.border}`, borderRadius: 8, padding: "5px 12px", fontSize: 11, fontWeight: 700, color: copied ? G.green : G.muted, cursor: "pointer", fontFamily: "inherit", transition: "all 0.2s", flexShrink: 0 }}>
      {copied ? "✓ Copied" : "Copy"}
    </button>
  );
}

function Sk({ w = "100%", h = 18, r = 8 }: { w?: string | number; h?: number; r?: number }) {
  return <div style={{ width: w, height: h, borderRadius: r, background: "linear-gradient(90deg,rgba(255,255,255,0.04) 0%,rgba(255,255,255,0.09) 50%,rgba(255,255,255,0.04) 100%)", backgroundSize: "200% 100%", animation: "shimmer 1.6s linear infinite" }}/>;
}

function Row({ label, value, large, mono, copyable }: {
  label: string; value: string; large?: boolean; mono?: boolean; copyable?: boolean;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "13px 0", borderBottom: `1px solid ${G.border}`, gap: 12, flexWrap: "wrap" }}>
      <span style={{ fontSize: 12, color: G.muted, flexShrink: 0 }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: large ? 22 : 14, fontWeight: large ? 900 : 700, fontFamily: mono ? "'DM Mono',monospace" : large ? "'Syne',sans-serif" : "inherit", letterSpacing: mono ? "0.08em" : "normal", color: large ? G.green : "#fff" }}>
          {value}
        </span>
        {copyable && <CopyButton value={value}/>}
      </div>
    </div>
  );
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
export default function PaymentDetails({
  userId,
  fixedAmount,
  onClose,
  onSuccess,
}: {
  userId: string;
  fixedAmount: number;
  onClose: () => void;
  onSuccess: (contribution: any) => void;
}) {
  const { settings, loading } = useAppSettings();

  const [step,      setStep]      = useState<"details" | "confirm" | "done">("details");
  const [submitting,setSubmitting]= useState(false);
  const [error,     setError]     = useState("");

  // Reference members use when making the transfer.
  // MUST be unique per contribution — include a timestamp so the same user
  // can contribute multiple times without hitting the unique constraint on
  // contributions.reference. useState (not a plain const) means it is
  // generated exactly once when the modal mounts and never changes on re-render.
  const [reference] = useState(
    () => `GG-${userId.slice(0, 8).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`
  );

  async function confirmPayment() {
    setSubmitting(true); setError("");
    try {
      // Record the contribution manually (bank transfer flow)
      // In Paystack flow: call Paystack API first, then record with their reference
      const contribution = await dbMakeContribution(userId, fixedAmount, reference);
      setStep("done");
      setTimeout(() => onSuccess(contribution), 1800);
    } catch (e: any) {
      setError(e.message ?? "Could not record payment. Contact admin.");
    } finally { setSubmitting(false); }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.78)", backdropFilter: "blur(10px)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 460, background: "#0a1a0c", border: `1px solid ${G.border}`, borderRadius: 24, padding: 28, boxShadow: "0 20px 60px rgba(0,0,0,0.7)", maxHeight: "90vh", overflowY: "auto" }}>

        {/* ── STEP 1: Account Details ── */}
        {step === "details" && (
          <>
            <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "'Syne',sans-serif", marginBottom: 4 }}>Make Your Contribution</div>
            <div style={{ fontSize: 12, color: G.muted, marginBottom: 24 }}>
              Transfer your daily contribution to the account below, then tap "I&apos;ve Paid".
            </div>

            {loading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
                <Sk h={28}/><Sk h={44}/><Sk h={28}/><Sk h={28}/>
              </div>
            ) : !settings?.account_no || settings.account_no === "0000000000" ? (
              <div style={{ background: "rgba(255,152,0,0.08)", border: "1px solid rgba(255,152,0,0.2)", borderRadius: 14, padding: "16px 18px", marginBottom: 24, fontSize: 13, color: G.amber, lineHeight: 1.6 }}>
                ⚠️ The admin has not yet set up the collection account. Please contact your admin or check back later.
              </div>
            ) : (
              <>
                {/* Amount due */}
                <div style={{ background: "linear-gradient(135deg,rgba(0,230,118,0.1),rgba(0,230,118,0.03))", border: "1px solid rgba(0,230,118,0.2)", borderRadius: 16, padding: "16px 18px", marginBottom: 20, textAlign: "center" }}>
                  <div style={{ fontSize: 11, color: G.muted, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 6 }}>Amount to Transfer</div>
                  <div style={{ fontSize: 36, fontWeight: 900, fontFamily: "'Syne',sans-serif", color: G.green, lineHeight: 1 }}>{fmt(fixedAmount)}</div>
                  <div style={{ fontSize: 11, color: G.muted, marginTop: 6 }}>Your daily contribution amount</div>
                </div>

                {/* Account details */}
                <div style={{ marginBottom: 20 }}>
                  <Row label="Bank"           value={settings.bank_name}    copyable/>
                  <Row label="Account Number" value={settings.account_no}   large mono copyable/>
                  <Row label="Account Name"   value={settings.account_name} copyable/>
                  <Row label="Your Reference" value={reference}             mono copyable/>
                </div>

                {/* Warning */}
                <div style={{ background: "rgba(255,152,0,0.06)", border: "1px solid rgba(255,152,0,0.15)", borderRadius: 12, padding: "12px 16px", fontSize: 12, color: G.amber, marginBottom: 20, lineHeight: 1.7 }}>
                  ⚠️ Always use <strong style={{ fontFamily: "'DM Mono',monospace" }}>{reference}</strong> as your transfer narration so your payment is identified correctly.
                </div>

                {/* Copy all button */}
                <button
                  onClick={() => {
                    const text = `Bank: ${settings.bank_name}\nAccount No: ${settings.account_no}\nAccount Name: ${settings.account_name}\nAmount: ${fmt(fixedAmount)}\nReference: ${reference}`;
                    navigator.clipboard.writeText(text);
                  }}
                  style={{ width: "100%", background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.2)", borderRadius: 12, padding: "12px", fontSize: 13, fontWeight: 700, color: G.blue, cursor: "pointer", fontFamily: "inherit", marginBottom: 12 }}
                >
                  📋 Copy All Details
                </button>
              </>
            )}

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={onClose} style={{ flex: 1, background: "rgba(255,255,255,0.04)", border: `1px solid ${G.border}`, borderRadius: 12, padding: "12px", fontSize: 13, fontWeight: 700, color: G.muted, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
              {settings && settings.account_no !== "0000000000" && (
                <button onClick={() => setStep("confirm")} style={{ flex: 1, background: "rgba(0,230,118,0.1)", border: "1px solid rgba(0,230,118,0.25)", borderRadius: 12, padding: "12px", fontSize: 13, fontWeight: 700, color: G.green, cursor: "pointer", fontFamily: "inherit" }}>
                  I&apos;ve Paid →
                </button>
              )}
            </div>
          </>
        )}

        {/* ── STEP 2: Confirm ── */}
        {step === "confirm" && (
          <>
            <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "'Syne',sans-serif", marginBottom: 4 }}>Confirm Payment</div>
            <div style={{ fontSize: 12, color: G.muted, marginBottom: 24 }}>
              Only confirm if you have already completed the bank transfer.
            </div>

            <div style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${G.border}`, borderRadius: 16, padding: "18px", marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: G.muted, marginBottom: 12 }}>Confirming payment of</div>
              <div style={{ fontSize: 28, fontWeight: 900, fontFamily: "'Syne',sans-serif", color: G.green, marginBottom: 4 }}>{fmt(fixedAmount)}</div>
              <div style={{ fontSize: 12, color: G.muted }}>
                to {settings?.account_name} · Ref: <span style={{ fontFamily: "'DM Mono',monospace", color: G.blue }}>{reference}</span>
              </div>
            </div>

            <div style={{ background: "rgba(255,64,64,0.06)", border: "1px solid rgba(255,64,64,0.15)", borderRadius: 12, padding: "12px 16px", fontSize: 12, color: G.red, marginBottom: 20, lineHeight: 1.7 }}>
              ⚠️ Do not confirm if you have NOT made the transfer. False confirmations will reduce your trust score.
            </div>

            {error && (
              <div style={{ background: "rgba(255,64,64,0.08)", border: "1px solid rgba(255,64,64,0.2)", borderRadius: 11, padding: "12px 14px", fontSize: 13, color: G.red, marginBottom: 16 }}>{error}</div>
            )}

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setStep("details")} style={{ flex: 1, background: "rgba(255,255,255,0.04)", border: `1px solid ${G.border}`, borderRadius: 12, padding: "12px", fontSize: 13, fontWeight: 700, color: G.muted, cursor: "pointer", fontFamily: "inherit" }}>← Back</button>
              <button onClick={confirmPayment} disabled={submitting} style={{ flex: 1, background: "rgba(0,230,118,0.1)", border: "1px solid rgba(0,230,118,0.25)", borderRadius: 12, padding: "12px", fontSize: 13, fontWeight: 700, color: G.green, cursor: submitting ? "not-allowed" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: submitting ? 0.6 : 1 }}>
                {submitting ? <><span style={{ width: 13, height: 13, borderRadius: 99, border: `2px solid ${G.green}`, borderTopColor: "transparent", animation: "spin 0.7s linear infinite", display: "inline-block" }}/> Recording…</> : "✅ Yes, I Paid"}
              </button>
            </div>
          </>
        )}

        {/* ── STEP 3: Done ── */}
        {step === "done" && (
          <div style={{ textAlign: "center", padding: "10px 0" }}>
            <div style={{ fontSize: 52, marginBottom: 14 }}>🎉</div>
            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 900, marginBottom: 8 }}>Payment Recorded!</div>
            <div style={{ fontSize: 13, color: G.muted, lineHeight: 1.7 }}>
              Your contribution of <strong style={{ color: G.green }}>{fmt(fixedAmount)}</strong> has been recorded.<br/>
              Your trust score and streak have been updated.
            </div>
            <div style={{ marginTop: 12, fontSize: 12, color: "rgba(255,255,255,0.25)" }}>Closing…</div>
          </div>
        )}

      </div>
    </div>
  );
}