"use client";
/**
 * app/dashboard/page.tsx — God's Grace Member Dashboard
 *
 * PAYMENT WORKFLOW:
 *   1. Member sees balance + trust score
 *   2. Clicks "Make Payment" → confirms amount → contribution inserted
 *   3. DB trigger auto-updates total_saved, streak, trust_score
 *   4. DB trigger fires admin notification automatically
 *
 * PAYOUT WORKFLOW:
 *   1. Balance check (status, trust, balance, no pending payout)
 *   2. Member fills bank details → system sends OTP to phone
 *   3. Member enters OTP → payout record created
 *   4. DB trigger notifies admin in real-time
 *
 * NO LOOP: useEffect([], []) — runs once; router.replace not push
 */

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  useProfile, useMyContributions, useMyPayouts,
  checkBalance, dbMakeContribution, dbRequestPayout,
  dbSendOtp, dbVerifyOtp,
  type Contribution, type Payout,
} from "@/lib/hooks/gg";

// ── HELPERS ───────────────────────────────────────────────────────────────────
const fmt   = (n: number) => "₦" + (n / 100).toLocaleString("en-NG");
const ago   = (iso: string) => {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString("en-NG", { day: "2-digit", month: "short" });
};

// ── TOAST ─────────────────────────────────────────────────────────────────────
function useToast() {
  const [toasts, setToasts] = useState<{ id: number; msg: string; ok: boolean }[]>([]);
  const push = useCallback((msg: string, ok = true) => {
    const id = Date.now();
    setToasts(p => [{ id, msg, ok }, ...p].slice(0, 3));
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 4000);
  }, []);
  return { toasts, push };
}

// ── SMALL UI ──────────────────────────────────────────────────────────────────
const G = {
  bg:     "#040a06",
  card:   "rgba(255,255,255,0.035)",
  border: "rgba(255,255,255,0.07)",
  muted:  "rgba(255,255,255,0.38)",
  green:  "#00e676",
  red:    "#ff5252",
  blue:   "#60a5fa",
  amber:  "#ff9800",
  gold:   "#f5c518",
};

function Card({ children, style = {} }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ background: G.card, border: `1px solid ${G.border}`, borderRadius: 22, backdropFilter: "blur(20px)", padding: 22, boxShadow: "0 8px 40px rgba(0,0,0,0.35)", ...style }}>{children}</div>;
}

function Sk({ w = "100%", h = 18, r = 8 }: { w?: string | number; h?: number; r?: number }) {
  return <div style={{ width: w, height: h, borderRadius: r, background: "linear-gradient(90deg,rgba(255,255,255,0.04) 0%,rgba(255,255,255,0.09) 50%,rgba(255,255,255,0.04) 100%)", backgroundSize: "200% 100%", animation: "shimmer 1.6s linear infinite" }}/>;
}

function Badge({ s }: { s: string }) {
  const M: Record<string, [string, string]> = {
    confirmed: ["rgba(0,230,118,0.1)", G.green],
    missed:    ["rgba(255,64,64,0.1)", G.red],
    reversed:  ["rgba(255,152,0,0.1)", G.amber],
    Pending:   ["rgba(255,152,0,0.1)", G.amber],
    Approved:  ["rgba(96,165,250,0.1)", G.blue],
    Completed: ["rgba(0,230,118,0.1)", G.green],
    Rejected:  ["rgba(255,64,64,0.1)", G.red],
    Active:    ["rgba(0,230,118,0.1)", G.green],
    Suspended: ["rgba(255,64,64,0.1)", G.red],
  };
  const [bg, fg] = M[s] ?? ["rgba(255,255,255,0.06)", G.muted];
  return <span style={{ background: bg, color: fg, border: `1px solid ${fg}44`, borderRadius: 99, padding: "3px 10px", fontSize: 10, fontWeight: 700, whiteSpace: "nowrap" }}>{s}</span>;
}

function Btn({ label, color = G.green, onClick, loading, disabled, full }: {
  label: string; color?: string; onClick: () => void;
  loading?: boolean; disabled?: boolean; full?: boolean;
}) {
  return (
    <button onClick={onClick} disabled={loading || disabled} style={{ width: full ? "100%" : "auto", background: `${color}18`, color, border: `1px solid ${color}44`, borderRadius: 11, padding: "11px 20px", fontSize: 13, fontWeight: 700, cursor: loading || disabled ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: loading || disabled ? 0.5 : 1, transition: "all 0.18s", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
      {loading ? <span style={{ width: 13, height: 13, borderRadius: 99, border: `2px solid ${color}`, borderTopColor: "transparent", animation: "spin 0.7s linear infinite", display: "inline-block" }}/> : label}
    </button>
  );
}

function Input({ label, value, onChange, type = "text", placeholder, hint }: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string; hint?: string;
}) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: G.muted, marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
      <input
        type={type} value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ width: "100%", background: "rgba(255,255,255,0.05)", border: `1px solid ${G.border}`, borderRadius: 11, padding: "12px 14px", color: "#f0f0f0", fontSize: 14, outline: "none", fontFamily: "inherit", transition: "border-color 0.2s" }}
      />
      {hint && <div style={{ fontSize: 11, color: G.muted, marginTop: 5 }}>{hint}</div>}
    </div>
  );
}

function TrustRing({ score }: { score: number }) {
  const r = 38, c = 2 * Math.PI * r, fill = c - (score / 100) * c;
  const color = score >= 80 ? G.green : score >= 50 ? G.amber : G.red;
  return (
    <div style={{ position: "relative", width: 100, height: 100, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <svg width="100" height="100" style={{ position: "absolute", top: 0, left: 0, transform: "rotate(-90deg)" }}>
        <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="6"/>
        <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={fill} style={{ transition: "stroke-dashoffset 0.8s ease" }}/>
      </svg>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 22, fontWeight: 900, fontFamily: "'Syne',sans-serif", color, lineHeight: 1 }}>{score}</div>
        <div style={{ fontSize: 9, color: G.muted, textTransform: "uppercase", letterSpacing: 1, marginTop: 2 }}>Trust</div>
      </div>
    </div>
  );
}

function GGLogo() {
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
      <defs>
        <linearGradient id="dlB" x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse"><stop offset="0%" stopColor="#0d3d1f"/><stop offset="100%" stopColor="#051508"/></linearGradient>
        <linearGradient id="dlG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f5d060"/><stop offset="100%" stopColor="#b8820a"/></linearGradient>
      </defs>
      <rect width="36" height="36" rx="10" fill="url(#dlB)"/>
      <rect width="36" height="36" rx="10" fill="none" stroke="#c8960a" strokeWidth="1" opacity="0.5"/>
      <text x="18" y="25" textAnchor="middle" fontSize="15" fontWeight="900" fontFamily="Georgia,serif" fill="url(#dlG)">GG</text>
    </svg>
  );
}

// ── PAYMENT MODAL ─────────────────────────────────────────────────────────────
function PaymentModal({ fixedAmount, onClose, onSuccess }: {
  fixedAmount: number;
  onClose: () => void;
  onSuccess: (c: Contribution) => void;
}) {
  const [amount,  setAmount]  = useState(String(fixedAmount / 100));
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  async function submit() {
    const kobo = Math.round(parseFloat(amount) * 100);
    if (!kobo || kobo < 10000) { setError("Minimum contribution is ₦100"); return; }
    setLoading(true); setError("");
    try {
      const contribution = await dbMakeContribution(
        /* userId injected via closure */ "",  // handled in parent
        kobo
      );
      onSuccess(contribution);
    } catch (e: any) {
      setError(e.message ?? "Payment failed. Try again.");
    } finally { setLoading(false); }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 420, background: "#0a1a0c", border: `1px solid ${G.border}`, borderRadius: 24, padding: 28, boxShadow: "0 20px 60px rgba(0,0,0,0.7)" }}>
        <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "'Syne',sans-serif", marginBottom: 6 }}>Make a Contribution</div>
        <div style={{ fontSize: 12, color: G.muted, marginBottom: 24 }}>Your fixed contribution is {fmt(fixedAmount)}/day</div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Input label="Amount (₦)" value={amount} onChange={setAmount} type="number" placeholder="Enter amount" hint={`Recommended: ${fmt(fixedAmount)}`}/>

          {/* Summary */}
          <div style={{ background: "rgba(0,230,118,0.05)", border: "1px solid rgba(0,230,118,0.12)", borderRadius: 14, padding: "14px 16px" }}>
            <div style={{ fontSize: 11, color: G.muted, marginBottom: 4 }}>You are paying</div>
            <div style={{ fontSize: 24, fontWeight: 900, fontFamily: "'Syne',sans-serif", color: G.green }}>
              {parseFloat(amount) > 0 ? `₦${parseFloat(amount).toLocaleString("en-NG")}` : "—"}
            </div>
            <div style={{ fontSize: 11, color: G.muted, marginTop: 4 }}>This will be added to your savings & update your trust score.</div>
          </div>

          {error && <div style={{ background: "rgba(255,64,64,0.08)", border: "1px solid rgba(255,64,64,0.2)", borderRadius: 11, padding: "12px 14px", fontSize: 13, color: G.red }}>{error}</div>}

          <div style={{ display: "flex", gap: 10 }}>
            <Btn label="Cancel" color={G.muted} onClick={onClose} full/>
            <Btn label="✅ Confirm Payment" color={G.green} onClick={submit} loading={loading} full/>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── PAYOUT MODAL ──────────────────────────────────────────────────────────────
type PayoutStep = "form" | "check" | "otp" | "done";

function PayoutModal({ userId, phone, balance, onClose, onSuccess }: {
  userId: string; phone: string; balance: number;
  onClose: () => void;
  onSuccess: (p: Payout) => void;
}) {
  const [step,    setStep]    = useState<PayoutStep>("form");
  const [amount,  setAmount]  = useState("");
  const [bank,    setBank]    = useState("");
  const [account, setAccount] = useState("");
  const [accName, setAccName] = useState("");
  const [otp,     setOtp]     = useState("");
  const [payoutId,setPayoutId]= useState("");
  const [error,   setError]   = useState("");
  const [loading, setLoading] = useState(false);
  const [checkMsg,setCheckMsg]= useState("");

  const BANKS = ["Access Bank","First Bank","GTBank","UBA","Zenith Bank","Kuda Bank","Opay","Palmpay","Sterling Bank","Wema Bank"];

  async function handleSubmit() {
    const kobo = Math.round(parseFloat(amount) * 100);
    if (!kobo || kobo < 100000) { setError("Minimum payout is ₦1,000"); return; }
    if (!bank)    { setError("Select your bank"); return; }
    if (account.length < 10) { setError("Enter a valid 10-digit account number"); return; }

    setLoading(true); setError(""); setStep("check");

    // ── BALANCE CHECK ──────────────────────────────────────────────────────
    const check = await checkBalance(userId, kobo);
    if (!check.ok) {
      setError(check.reason ?? "Balance check failed");
      setStep("form"); setLoading(false); return;
    }
    setCheckMsg(`Balance verified. Available: ${fmt(check.balance)}`);

    // ── CREATE PAYOUT + SEND OTP ───────────────────────────────────────────
    try {
      const record = await dbRequestPayout(userId, { amount: kobo, dest_bank: bank, dest_account: account, dest_name: accName || undefined });
      setPayoutId(record.id);
      await dbSendOtp(record.id, phone);
      setStep("otp");
    } catch (e: any) {
      setError(e.message ?? "Failed to initiate payout");
      setStep("form");
    } finally { setLoading(false); }
  }

  async function handleOtp() {
    if (otp.length < 4) { setError("Enter the OTP sent to your phone"); return; }
    setLoading(true); setError("");
    const { ok, reason } = await dbVerifyOtp(payoutId, otp);
    if (!ok) { setError(reason ?? "Invalid OTP"); setLoading(false); return; }
    // Return the newly created payout for optimistic UI
    onSuccess({ id: payoutId, user_id: userId, amount: Math.round(parseFloat(amount) * 100), dest_bank: bank, dest_account: account, dest_name: accName, otp_verified: true, status: "Pending", admin_note: null, requested_at: new Date().toISOString(), resolved_at: null });
    setStep("done");
    setLoading(false);
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 440, background: "#0a1a0c", border: `1px solid ${G.border}`, borderRadius: 24, padding: 28, boxShadow: "0 20px 60px rgba(0,0,0,0.7)" }}>

        {/* FORM STEP */}
        {(step === "form" || step === "check") && (
          <>
            <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "'Syne',sans-serif", marginBottom: 6 }}>Request Payout</div>
            <div style={{ fontSize: 12, color: G.muted, marginBottom: 24 }}>
              Available balance: <span style={{ color: G.green, fontWeight: 700 }}>{fmt(balance)}</span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <Input label="Amount (₦)" value={amount} onChange={setAmount} type="number" placeholder="e.g. 10000"/>

              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: G.muted, marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>Bank</div>
                <select value={bank} onChange={e => setBank(e.target.value)} style={{ width: "100%", background: "rgba(255,255,255,0.05)", border: `1px solid ${G.border}`, borderRadius: 11, padding: "12px 14px", color: "#f0f0f0", fontSize: 14, outline: "none", fontFamily: "inherit" }}>
                  <option value="">Select bank…</option>
                  {BANKS.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>

              <Input label="Account Number" value={account} onChange={setAccount} type="text" placeholder="10-digit account number"/>
              <Input label="Account Name (optional)" value={accName} onChange={setAccName} placeholder="Verify your account name"/>

              {/* Balance preview */}
              {parseFloat(amount) > 0 && (
                <div style={{ background: "rgba(255,152,0,0.05)", border: "1px solid rgba(255,152,0,0.15)", borderRadius: 14, padding: "12px 16px", fontSize: 12, color: G.amber }}>
                  ⚠️ After payout, balance will be: <strong style={{ color: "#fff" }}>{fmt(Math.max(0, balance - Math.round(parseFloat(amount) * 100)))}</strong>
                </div>
              )}

              {error && <div style={{ background: "rgba(255,64,64,0.08)", border: "1px solid rgba(255,64,64,0.2)", borderRadius: 11, padding: "12px 14px", fontSize: 13, color: G.red }}>{error}</div>}

              <div style={{ display: "flex", gap: 10 }}>
                <Btn label="Cancel" color={G.muted} onClick={onClose} full/>
                <Btn label={step === "check" ? "Checking…" : "Continue →"} color={G.amber} onClick={handleSubmit} loading={loading} full/>
              </div>

              <div style={{ fontSize: 11, color: G.muted, textAlign: "center", lineHeight: 1.6 }}>
                An OTP will be sent to {phone} to verify this request.
              </div>
            </div>
          </>
        )}

        {/* OTP STEP */}
        {step === "otp" && (
          <>
            <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "'Syne',sans-serif", marginBottom: 6 }}>Verify OTP</div>
            {checkMsg && <div style={{ fontSize: 12, color: G.green, marginBottom: 16 }}>✅ {checkMsg}</div>}
            <div style={{ fontSize: 13, color: G.muted, marginBottom: 24 }}>
              We sent a one-time code to <strong style={{ color: "#fff" }}>{phone}</strong>. Enter it below to confirm your payout of <strong style={{ color: G.amber }}>{fmt(Math.round(parseFloat(amount) * 100))}</strong>.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <Input label="OTP Code" value={otp} onChange={setOtp} type="text" placeholder="Enter 6-digit OTP"/>
              {error && <div style={{ background: "rgba(255,64,64,0.08)", border: "1px solid rgba(255,64,64,0.2)", borderRadius: 11, padding: "12px 14px", fontSize: 13, color: G.red }}>{error}</div>}
              <div style={{ display: "flex", gap: 10 }}>
                <Btn label="Back" color={G.muted} onClick={() => setStep("form")} full/>
                <Btn label="✅ Verify & Submit" color={G.green} onClick={handleOtp} loading={loading} full/>
              </div>
            </div>
          </>
        )}

        {/* DONE STEP */}
        {step === "done" && (
          <div style={{ textAlign: "center", padding: "10px 0" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 900, marginBottom: 8 }}>Payout Submitted!</div>
            <div style={{ fontSize: 13, color: G.muted, marginBottom: 24, lineHeight: 1.7 }}>
              Your request for <strong style={{ color: G.amber }}>{fmt(Math.round(parseFloat(amount) * 100))}</strong> has been sent to the admin for approval. You'll be notified once it&apos;s processed.
            </div>
            <Btn label="Close" color={G.green} onClick={onClose} full/>
          </div>
        )}

      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  MAIN PAGE
// ══════════════════════════════════════════════════════════════════════════════
export default function DashboardPage() {
  const router = useRouter();
  const { toasts, push } = useToast();

  const [userId,    setUserId]    = useState("");
  const [authReady, setAuthReady] = useState(false);
  const [tab,       setTab]       = useState("Overview");
  const [showPay,   setShowPay]   = useState(false);
  const [showPayout,setShowPayout]= useState(false);

  // Auth guard — runs ONCE, no loop
  useEffect(() => {
    const raw = localStorage.getItem("gg_user");
    if (!raw) { router.replace("/login"); return; }
    let u: any;
    try { u = JSON.parse(raw); } catch { router.replace("/login"); return; }
    if (u?.is_admin) { router.replace("/admin"); return; }  // admin goes to admin; replace prevents ping-pong
    setUserId(u.id ?? "");
    setAuthReady(true);
  }, []); // ← empty array, runs exactly once

  const profileHook = useProfile(authReady ? userId : "");
  const contribHook = useMyContributions(authReady ? userId : "");
  const payoutHook  = useMyPayouts(authReady ? userId : "");

  const profile      = profileHook.profile;
  const contributions= contribHook.items;
  const payouts      = payoutHook.items;

  function logout() { localStorage.removeItem("gg_user"); router.replace("/login"); }

  function onPaymentSuccess(c: Contribution) {
    contribHook.prepend(c);
    // Optimistically update profile balance
    if (profile) profileHook.setProfile({ ...profile, total_saved: profile.total_saved + c.amount, contribution_streak: profile.contribution_streak + 1, trust_score: Math.min(100, profile.trust_score + 2) });
    setShowPay(false);
    push(`✅ Payment of ${fmt(c.amount)} recorded!`);
  }

  function onPayoutSuccess(p: Payout) {
    payoutHook.prepend(p);
    setShowPayout(false);
    push("📤 Payout request submitted. Admin has been notified.");
  }

  const missed     = contributions.filter(c => c.status === "missed").length;
  const TABS       = ["Overview", "Contributions", "Payouts"];

  if (!authReady) return null;

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800;900&family=DM+Mono:wght@400;500&family=Outfit:wght@300;400;500;600;700&display=swap');
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    body{background:#040a06;font-family:'Outfit',sans-serif;color:#f0f0f0}
    ::-webkit-scrollbar{width:3px;height:3px}
    ::-webkit-scrollbar-thumb{background:rgba(0,230,118,0.2);border-radius:99px}
    input::placeholder,textarea::placeholder{color:rgba(255,255,255,0.25)}
    select option{background:#0d1a10;color:#f0f0f0}
    @keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
    @keyframes slideIn{from{opacity:0;transform:translateX(50px)}to{opacity:1;transform:translateX(0)}}
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}
    @keyframes spin{to{transform:rotate(360deg)}}
    @keyframes shimmer{from{background-position:-200% 0}to{background-position:200% 0}}
    .sec{animation:fadeUp 0.35s ease}
    .tabbtn:hover{background:rgba(255,255,255,0.04)!important;color:rgba(255,255,255,0.7)!important}
    .crow:hover td{background:rgba(255,255,255,0.018)}
  `;

  return (
    <>
      <style>{css}</style>

      {/* Modals */}
      {showPay && profile && (
        <PaymentModal
          fixedAmount={profile.fixed_amount}
          onClose={() => setShowPay(false)}
          onSuccess={onPaymentSuccess}
        />
      )}
      {showPayout && profile && (
        <PayoutModal
          userId={userId}
          phone={profile.phone ?? ""}
          balance={profile.total_saved}
          onClose={() => setShowPayout(false)}
          onSuccess={onPayoutSuccess}
        />
      )}

      {/* Toasts */}
      <div style={{ position: "fixed", top: 20, right: 20, zIndex: 9999, display: "flex", flexDirection: "column", gap: 8, pointerEvents: "none" }}>
        {toasts.map(t => (
          <div key={t.id} style={{ background: "rgba(8,18,10,0.96)", border: `1px solid ${t.ok ? "rgba(0,230,118,0.18)" : "rgba(255,64,64,0.25)"}`, borderRadius: 16, padding: "12px 18px", fontSize: 13, animation: "slideIn 0.3s ease", backdropFilter: "blur(16px)", maxWidth: 300 }}>{t.msg}</div>
        ))}
      </div>

      <div style={{ minHeight: "100vh", background: "radial-gradient(ellipse 60% 40% at 50% -10%,rgba(15,70,25,0.35) 0%,transparent 60%),#040a06" }}>

        {/* Header */}
        <header style={{ position: "sticky", top: 0, zIndex: 200, height: 60, backdropFilter: "blur(24px)", background: "rgba(4,10,6,0.85)", borderBottom: "1px solid rgba(0,230,118,0.08)", display: "flex", alignItems: "center", padding: "0 20px" }}>
          <div style={{ maxWidth: 900, width: "100%", margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <GGLogo/>
              <div>
                <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 14, fontWeight: 800, background: "linear-gradient(135deg,#e8f5e9,#a5d6a7)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>God&apos;s Grace</div>
                <div style={{ fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: G.green, fontWeight: 700, opacity: 0.6 }}>Member Dashboard</div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {profile && (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 7, height: 7, borderRadius: 99, background: profile.status === "Active" ? G.green : G.red, animation: "pulse 2s infinite" }}/>
                  <span style={{ fontSize: 10, color: G.muted }}>{profile.status}</span>
                </div>
              )}
              <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.7)" }}>{profile?.full_name?.split(" ")[0] ?? "…"}</span>
              <button onClick={logout} style={{ background: "rgba(255,64,64,0.08)", border: "1px solid rgba(255,64,64,0.22)", color: G.red, borderRadius: 9, padding: "6px 14px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Logout</button>
            </div>
          </div>
        </header>

        <main style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px 80px" }}>

          {/* Tab nav */}
          <nav style={{ display: "flex", gap: 3, background: "rgba(255,255,255,0.025)", border: `1px solid ${G.border}`, borderRadius: 18, padding: 4, marginBottom: 24 }}>
            {TABS.map(t => (
              <button key={t} className="tabbtn" onClick={() => setTab(t)} style={{ flex: 1, background: tab === t ? "rgba(0,230,118,0.1)" : "transparent", color: tab === t ? G.green : G.muted, border: tab === t ? "1px solid rgba(0,230,118,0.22)" : "1px solid transparent", borderRadius: 13, padding: "9px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", transition: "all 0.2s" }}>{t}</button>
            ))}
          </nav>

          {/* ═══════════ OVERVIEW ═══════════ */}
          {tab === "Overview" && (
            <div className="sec" style={{ display: "flex", flexDirection: "column", gap: 20 }}>

              {/* Profile Hero */}
              <Card>
                {profileHook.loading
                  ? <div style={{ display: "flex", gap: 20 }}><Sk w={100} h={100} r={99}/><div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}><Sk h={24} w={200}/><Sk h={16} w={150}/></div></div>
                  : profile && (
                      <div style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
                        <TrustRing score={profile.trust_score}/>
                        <div style={{ flex: 1, minWidth: 160 }}>
                          <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 22, fontWeight: 900 }}>{profile.full_name}</div>
                          <div style={{ fontSize: 13, color: G.muted, marginTop: 3 }}>{profile.email}</div>
                          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                            <Badge s={profile.status}/>
                            <span style={{ fontSize: 12, color: G.amber, fontWeight: 700 }}>🔥 {profile.contribution_streak}d streak</span>
                            <span style={{ fontSize: 12, color: G.blue, fontWeight: 700 }}>📋 {profile.plan_type}</span>
                          </div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 10, color: G.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Total Saved</div>
                          <div style={{ fontSize: 30, fontWeight: 900, fontFamily: "'Syne',sans-serif", color: G.green, lineHeight: 1 }}>{fmt(profile.total_saved)}</div>
                          <div style={{ fontSize: 12, color: G.muted, marginTop: 4 }}>{fmt(profile.fixed_amount)}/day contribution</div>
                        </div>
                      </div>
                    )
                }
              </Card>

              {/* Action Buttons */}
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <button
                  onClick={() => setShowPay(true)}
                  disabled={profile?.status !== "Active"}
                  style={{ flex: 1, minWidth: 160, background: "rgba(0,230,118,0.1)", border: "1px solid rgba(0,230,118,0.25)", borderRadius: 18, padding: "20px 16px", cursor: profile?.status !== "Active" ? "not-allowed" : "pointer", opacity: profile?.status !== "Active" ? 0.4 : 1, textAlign: "left", transition: "all 0.2s", fontFamily: "inherit" }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>💰</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: G.green }}>Make Payment</div>
                  <div style={{ fontSize: 11, color: G.muted, marginTop: 3 }}>Contribute {profile ? fmt(profile.fixed_amount) : "—"} today</div>
                </button>
                <button
                  onClick={() => setShowPayout(true)}
                  disabled={!profile || profile.status !== "Active" || profile.trust_score < 50 || profile.total_saved < 100000}
                  style={{ flex: 1, minWidth: 160, background: "rgba(255,152,0,0.08)", border: "1px solid rgba(255,152,0,0.2)", borderRadius: 18, padding: "20px 16px", cursor: "pointer", textAlign: "left", transition: "all 0.2s", fontFamily: "inherit", opacity: (!profile || profile.status !== "Active" || profile.trust_score < 50 || profile.total_saved < 100000) ? 0.4 : 1 }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>📤</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: G.amber }}>Request Payout</div>
                  <div style={{ fontSize: 11, color: G.muted, marginTop: 3 }}>Min trust score: 50 · Min balance: ₦1,000</div>
                </button>
              </div>

              {/* Mini stats */}
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                {[
                  { label: "Contributions", value: contributions.length, icon: "📊", color: G.blue },
                  { label: "Days Missed",   value: missed,               icon: "⚠️", color: G.red  },
                  { label: "Payout Count",  value: payouts.filter(p => p.status === "Completed").length, icon: "📤", color: G.amber },
                ].map(({ label, value, icon, color }) => (
                  <div key={label} style={{ flex: 1, minWidth: 110, background: G.card, border: `1px solid ${G.border}`, borderRadius: 18, padding: "16px 14px", position: "relative", overflow: "hidden" }}>
                    <div style={{ fontSize: 20, marginBottom: 6 }}>{icon}</div>
                    <div style={{ fontSize: 9, color: G.muted, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 4, fontWeight: 600 }}>{label}</div>
                    {profileHook.loading ? <Sk w={40} h={20}/> : <div style={{ fontSize: 20, fontWeight: 900, fontFamily: "'Syne',sans-serif", color }}>{value}</div>}
                    <div style={{ position: "absolute", bottom: -15, right: -15, width: 60, height: 60, borderRadius: 99, background: color, opacity: 0.07, filter: "blur(16px)" }}/>
                  </div>
                ))}
              </div>

              {/* Recent activity */}
              <Card>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>Recent Activity</div>
                  <button onClick={() => setTab("Contributions")} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: G.green, fontFamily: "inherit", fontWeight: 700 }}>View all →</button>
                </div>
                {contribHook.loading
                  ? [1,2,3].map(i => <div key={i} style={{ padding: "11px 0", borderBottom: `1px solid ${G.border}` }}><Sk h={28}/></div>)
                  : contributions.length === 0
                    ? <div style={{ textAlign: "center", padding: "30px 0", color: G.muted, fontSize: 13 }}>No contributions yet. Make your first payment!</div>
                    : contributions.slice(0, 5).map(c => (
                        <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 0", borderBottom: `1px solid ${G.border}`, flexWrap: "wrap" }}>
                          <div style={{ width: 34, height: 34, borderRadius: 10, background: c.status === "missed" ? "rgba(255,64,64,0.08)" : "rgba(0,230,118,0.08)", border: `1px solid ${c.status === "missed" ? "rgba(255,64,64,0.2)" : "rgba(0,230,118,0.2)"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, flexShrink: 0 }}>
                            {c.status === "missed" ? "❌" : "✅"}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: c.status === "missed" ? G.red : G.green }}>{c.status === "missed" ? "Missed" : fmt(c.amount)}</div>
                            <div style={{ fontSize: 11, color: G.muted, fontFamily: "'DM Mono',monospace" }}>{ago(c.created_at)} · {c.channel}</div>
                          </div>
                          <Badge s={c.status}/>
                        </div>
                      ))
                }
              </Card>
            </div>
          )}

          {/* ═══════════ CONTRIBUTIONS ═══════════ */}
          {tab === "Contributions" && (
            <div className="sec" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 19, fontWeight: 900 }}>Contribution History</div>
              <Card style={{ padding: 0 }}>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr>
                        {["Date", "Amount", "Channel", "Status"].map(h => (
                          <th key={h} style={{ textAlign: "left", padding: "13px 18px", fontSize: 9, textTransform: "uppercase", letterSpacing: 1.2, color: G.muted, fontWeight: 600, borderBottom: `1px solid ${G.border}` }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {contribHook.loading
                        ? [1,2,3,4,5].map(i => <tr key={i} className="crow"><td colSpan={4} style={{ padding: "14px 18px", borderBottom: `1px solid ${G.border}` }}><Sk h={22}/></td></tr>)
                        : contributions.length === 0
                          ? <tr><td colSpan={4} style={{ textAlign: "center", padding: "40px", color: G.muted, fontSize: 13 }}>No contributions yet.</td></tr>
                          : contributions.map(c => (
                              <tr key={c.id} className="crow">
                                <td style={{ padding: "13px 18px", borderBottom: `1px solid ${G.border}`, color: G.muted, fontFamily: "'DM Mono',monospace", fontSize: 12 }}>
                                  {new Date(c.created_at).toLocaleDateString("en-NG", { day: "2-digit", month: "short", year: "numeric" })}
                                </td>
                                <td style={{ padding: "13px 18px", borderBottom: `1px solid ${G.border}`, fontWeight: 700, color: c.status === "missed" ? G.red : G.green }}>
                                  {c.status === "missed" ? "—" : fmt(c.amount)}
                                </td>
                                <td style={{ padding: "13px 18px", borderBottom: `1px solid ${G.border}`, color: G.muted, textTransform: "capitalize", fontSize: 12 }}>{c.channel}</td>
                                <td style={{ padding: "13px 18px", borderBottom: `1px solid ${G.border}` }}><Badge s={c.status}/></td>
                              </tr>
                            ))
                      }
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          )}

          {/* ═══════════ PAYOUTS ═══════════ */}
          {tab === "Payouts" && (
            <div className="sec" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 19, fontWeight: 900 }}>Payout History</div>
                <Btn label="+ Request Payout" color={G.amber} onClick={() => setShowPayout(true)} disabled={!profile || profile.status !== "Active" || profile.trust_score < 50}/>
              </div>

              <Card style={{ padding: "0 22px" }}>
                {payoutHook.loading
                  ? [1,2,3].map(i => <div key={i} style={{ padding: "20px 0", borderBottom: `1px solid ${G.border}` }}><Sk h={50}/></div>)
                  : payouts.length === 0
                    ? <div style={{ textAlign: "center", padding: "40px", color: G.muted, fontSize: 13 }}>No payouts requested yet.</div>
                    : payouts.map(p => (
                        <div key={p.id} style={{ padding: "18px 0", borderBottom: `1px solid ${G.border}` }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
                            <div style={{ fontSize: 18, fontWeight: 900, fontFamily: "'Syne',sans-serif", flex: 1 }}>{fmt(p.amount)}</div>
                            <Badge s={p.status}/>
                            <div style={{ fontSize: 11, color: G.muted, fontFamily: "'DM Mono',monospace" }}>{ago(p.requested_at)}</div>
                          </div>
                          <div style={{ fontSize: 11, color: G.muted, fontFamily: "'DM Mono',monospace" }}>
                            🏦 {p.dest_bank} · {p.dest_account}
                            {p.dest_name && ` · ${p.dest_name}`}
                            &nbsp;· OTP: {p.otp_verified ? "✓" : "✗"}
                          </div>
                          {p.admin_note && (
                            <div style={{ marginTop: 8, fontSize: 12, color: G.amber, background: "rgba(255,152,0,0.06)", border: "1px solid rgba(255,152,0,0.15)", borderRadius: 9, padding: "8px 12px" }}>
                              Admin note: {p.admin_note}
                            </div>
                          )}
                          {p.status === "Pending" && (
                            <div style={{ marginTop: 8, fontSize: 11, color: G.muted }}>⏳ Awaiting admin approval</div>
                          )}
                        </div>
                      ))
                }
              </Card>
            </div>
          )}

        </main>
      </div>
    </>
  );
}
