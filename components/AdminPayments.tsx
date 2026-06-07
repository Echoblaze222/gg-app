"use client";
/**
 * components/AdminPayments.tsx
 * Tab inside admin dashboard — shows pending payment submissions
 * Admin confirms or rejects each one after checking their bank app
 */

import { useState } from "react";
import {
  usePendingContributions,
  dbConfirmContribution,
  dbRejectContribution,
  type PendingContribution,
} from "@/lib/hooks/gg";

const G = {
  card:   "rgba(255,255,255,0.035)",
  border: "rgba(255,255,255,0.07)",
  muted:  "rgba(255,255,255,0.38)",
  green:  "#00e676",
  red:    "#ff5252",
  blue:   "#60a5fa",
  amber:  "#ff9800",
};

const fmt = (n: number) => "₦" + (n / 100).toLocaleString("en-NG");
const ago = (iso: string) => {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return m + "m ago";
  const h = Math.floor(m / 60);
  if (h < 24) return h + "h ago";
  return new Date(iso).toLocaleDateString("en-NG", { day: "2-digit", month: "short" });
};

function Av({ name }: { name: string }) {
  const i = name.split(" ").map((w: string) => w[0] ?? "").join("").slice(0, 2).toUpperCase();
  return (
    <div style={{ width: 42, height: 42, borderRadius: 12, flexShrink: 0, background: "linear-gradient(135deg,rgba(0,230,118,0.15),rgba(0,230,118,0.04))", border: "1px solid rgba(0,230,118,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, color: G.green }}>
      {i}
    </div>
  );
}

function Sk() {
  return <div style={{ height: 80, borderRadius: 14, background: "linear-gradient(90deg,rgba(255,255,255,0.04) 0%,rgba(255,255,255,0.08) 50%,rgba(255,255,255,0.04) 100%)", backgroundSize: "200% 100%", animation: "shimmer 1.6s linear infinite" }}/>;
}

function RejectModal({ item, onClose, onConfirm }: {
  item: PendingContribution;
  onClose: () => void;
  onConfirm: (note: string) => void;
}) {
  const [note, setNote] = useState("");
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 420, background: "#0a1a0c", border: "1px solid rgba(255,64,64,0.2)", borderRadius: 24, padding: 28, boxShadow: "0 20px 60px rgba(0,0,0,0.7)" }}>
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4, color: G.red }}>Reject Payment</div>
        <div style={{ fontSize: 12, color: G.muted, marginBottom: 20 }}>
          {item.profile?.full_name} · {fmt(item.amount)} · Ref: {item.reference ?? "manual"}
        </div>
        <div style={{ fontSize: 11, fontWeight: 700, color: G.muted, marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>
          Reason (member will see this)
        </div>
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="e.g. Transfer not found in bank statement…"
          rows={3}
          style={{ width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 11, padding: "12px 14px", color: "#f0f0f0", fontSize: 13, outline: "none", fontFamily: "inherit", resize: "vertical" }}
        />
        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button onClick={onClose} style={{ flex: 1, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "11px", fontSize: 13, fontWeight: 700, color: G.muted, cursor: "pointer", fontFamily: "inherit" }}>
            Cancel
          </button>
          <button onClick={() => onConfirm(note)} style={{ flex: 1, background: "rgba(255,64,64,0.1)", border: "1px solid rgba(255,64,64,0.25)", borderRadius: 12, padding: "11px", fontSize: 13, fontWeight: 700, color: G.red, cursor: "pointer", fontFamily: "inherit" }}>
            ✗ Reject Payment
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminPayments({ adminId, onToast }: {
  adminId: string;
  onToast: (msg: string, ok?: boolean) => void;
}) {
  const { items, loading, refetch, remove } = usePendingContributions();
  const [busy,         setBusy]         = useState<Record<string, boolean>>({});
  const [rejectTarget, setRejectTarget] = useState<PendingContribution | null>(null);

  async function confirm(item: PendingContribution) {
    setBusy(p => ({ ...p, [item.id]: true }));
    try {
      await dbConfirmContribution(item.id, adminId);
      remove(item.id);
      onToast("✅ Payment confirmed — member balance updated");
    } catch (e: any) {
      onToast("❌ Failed: " + e.message, false);
    } finally {
      setBusy(p => ({ ...p, [item.id]: false }));
    }
  }

  async function reject(item: PendingContribution, note: string) {
    setBusy(p => ({ ...p, ["rj_" + item.id]: true }));
    try {
      await dbRejectContribution(item.id, adminId, note);
      remove(item.id);
      onToast("❌ Payment rejected — member notified");
    } catch (e: any) {
      onToast("❌ Failed: " + e.message, false);
    } finally {
      setBusy(p => ({ ...p, ["rj_" + item.id]: false }));
      setRejectTarget(null);
    }
  }

  return (
    <>
      {rejectTarget && (
        <RejectModal
          item={rejectTarget}
          onClose={() => setRejectTarget(null)}
          onConfirm={(note) => reject(rejectTarget, note)}
        />
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 19, fontWeight: 900 }}>
              Payment Verification
            </div>
            <div style={{ fontSize: 12, color: G.muted, marginTop: 3 }}>
              Check your bank app then confirm or reject each payment below.
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {items.length > 0 && (
              <div style={{ background: "rgba(255,152,0,0.1)", border: "1px solid rgba(255,152,0,0.25)", borderRadius: 99, padding: "4px 14px", fontSize: 12, color: G.amber, fontWeight: 700 }}>
                ⏳ {items.length} pending
              </div>
            )}
            <button
              onClick={refetch}
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "7px 14px", fontSize: 12, color: G.muted, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}
            >
              🔄 Refresh
            </button>
          </div>
        </div>

        {/* How it works */}
        <div style={{ background: "rgba(96,165,250,0.06)", border: "1px solid rgba(96,165,250,0.15)", borderRadius: 16, padding: "14px 18px", fontSize: 12, color: G.blue, lineHeight: 1.8 }}>
          <strong>How to verify:</strong> When a member submits a payment, check your bank account for a transfer matching the amount and reference. If the money is there → <strong>Confirm ✅</strong>. If not → <strong>Reject ✗</strong>.
        </div>

        {/* Payments list */}
        <div style={{ background: G.card, border: "1px solid " + G.border, borderRadius: 22, backdropFilter: "blur(20px)", padding: "0 22px", boxShadow: "0 8px 40px rgba(0,0,0,0.35)" }}>
          {loading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "20px 0" }}>
              {[1,2,3].map(i => <Sk key={i}/>)}
            </div>
          ) : items.length === 0 ? (
            <div style={{ textAlign: "center", padding: "50px 0" }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>🎉</div>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>All clear!</div>
              <div style={{ fontSize: 12, color: G.muted }}>No pending payments to verify.</div>
            </div>
          ) : (
            items.map((item, idx) => (
              <div
                key={item.id}
                style={{ padding: "20px 0", borderBottom: idx < items.length - 1 ? "1px solid " + G.border : "none" }}
              >
                {/* Member row */}
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
                  <Av name={item.profile?.full_name ?? "?"}/>
                  <div style={{ flex: 1, minWidth: 120 }}>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{item.profile?.full_name ?? "Unknown"}</div>
                    <div style={{ fontSize: 11, color: G.muted, marginTop: 2 }}>
                      {item.profile?.phone} · {item.profile?.email}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 22, fontWeight: 900, fontFamily: "'Syne',sans-serif", color: G.green }}>
                      {fmt(item.amount)}
                    </div>
                    <div style={{ fontSize: 11, color: G.muted, fontFamily: "'DM Mono',monospace", marginTop: 2 }}>
                      {ago(item.created_at)}
                    </div>
                  </div>
                </div>

                {/* Reference box — what to look for in the bank */}
                <div style={{ background: "rgba(255,255,255,0.025)", border: "1px solid " + G.border, borderRadius: 12, padding: "12px 16px", marginBottom: 14, display: "flex", gap: 24, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontSize: 10, color: G.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>
                      Reference / Narration
                    </div>
                    <div style={{ fontSize: 14, fontFamily: "'DM Mono',monospace", color: G.blue, fontWeight: 700 }}>
                      {item.reference ?? "No reference"}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: G.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>
                      Channel
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", textTransform: "capitalize" }}>
                      {item.channel}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: G.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>
                      Submitted
                    </div>
                    <div style={{ fontSize: 13, color: "#fff" }}>
                      {new Date(item.created_at).toLocaleString("en-NG", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                </div>

                {/* Action buttons */}
                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                  <button
                    onClick={() => setRejectTarget(item)}
                    disabled={busy["rj_" + item.id]}
                    style={{ background: "rgba(255,64,64,0.08)", border: "1px solid rgba(255,64,64,0.22)", color: G.red, borderRadius: 10, padding: "9px 18px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", opacity: busy["rj_" + item.id] ? 0.5 : 1 }}
                  >
                    ✗ Not Received
                  </button>
                  <button
                    onClick={() => confirm(item)}
                    disabled={busy[item.id]}
                    style={{ background: "rgba(0,230,118,0.1)", border: "1px solid rgba(0,230,118,0.25)", color: G.green, borderRadius: 10, padding: "9px 18px", fontSize: 12, fontWeight: 700, cursor: busy[item.id] ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: busy[item.id] ? 0.5 : 1, display: "inline-flex", alignItems: "center", gap: 6 }}
                  >
                    {busy[item.id]
                      ? <><span style={{ width: 11, height: 11, borderRadius: 99, border: "2px solid #00e676", borderTopColor: "transparent", animation: "spin 0.7s linear infinite", display: "inline-block" }}/> Confirming…</>
                      : "✅ Money Received"
                    }
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
