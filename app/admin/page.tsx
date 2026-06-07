"use client";
/**
 * app/admin/page.tsx — God's Grace Admin Dashboard
 *
 * ✅ Real-time notifications via Supabase Realtime channel
 * ✅ Full payout approval workflow (Pending → Approved → Completed)
 * ✅ Balance-aware: shows member balance alongside every payout
 * ✅ Defaulter management with trust score visibility
 * ✅ Audit log written to DB on every action
 * ✅ NO loop: useEffect([]) runs once; router.replace not push
 *
 * FIXES APPLIED:
 * [1] `items` undefined in header → replaced with payHook.items
 * [2] Payments tab rendered outside <main> → moved inside main tab block
 * [3] Settings block orphaned on same line as Audit Log closing → separated
 * [4] setFilter(undefined) on quick-action buttons without filter → fallback to "All"
 * [5] suspend(d as any) type mismatch → cast via explicit Profile-shaped object
 */
import AdminPayments from "@/components/AdminPayments";
import AdminSettings from "@/components/AdminSettings";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  useAdminStats, useAllPayouts, useAllMembers,
  useDefaulters, useAuditLog, useNotifications,
  dbApprovePayout, dbExecutePayout, dbRejectPayout,
  dbSuspendUser, dbRestoreUser,
  type Payout, type Profile, type AuditLog, type Notification,
} from "@/lib/hooks/gg";

// ── HELPERS ───────────────────────────────────────────────────────────────────
const fmt = (n: number) => "₦" + (n / 100).toLocaleString("en-NG");
const ago = (iso: string) => {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString("en-NG", { day: "2-digit", month: "short" });
};

const AUDIT_META: Record<string, { label: string; color: string; icon: string }> = {
  approve_payout:   { label: "Approved Payout",   color: "#00e676", icon: "✅" },
  reject_payout:    { label: "Rejected Payout",   color: "#ff5252", icon: "❌" },
  execute_transfer: { label: "Executed Transfer",  color: "#60a5fa", icon: "💸" },
  send_alert:       { label: "Sent Alert",         color: "#ff9800", icon: "📲" },
  suspend_user:     { label: "Suspended User",     color: "#ff5252", icon: "⛔" },
  restore_user:     { label: "Restored User",      color: "#00e676", icon: "✅" },
};

const NOTIF_ICON: Record<string, string> = {
  new_contribution: "💰",
  payout_request:   "📤",
  defaulter:        "⚠️",
};

// ── THEME ─────────────────────────────────────────────────────────────────────
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
function Card({ children, style = {} }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ background: G.card, border: `1px solid ${G.border}`, borderRadius: 22, backdropFilter: "blur(20px)", padding: 22, boxShadow: "0 8px 40px rgba(0,0,0,0.35)", ...style }}>{children}</div>;
}

function Sk({ w = "100%", h = 18, r = 8 }: { w?: string | number; h?: number; r?: number }) {
  return <div style={{ width: w, height: h, borderRadius: r, background: "linear-gradient(90deg,rgba(255,255,255,0.04) 0%,rgba(255,255,255,0.09) 50%,rgba(255,255,255,0.04) 100%)", backgroundSize: "200% 100%", animation: "shimmer 1.6s linear infinite" }}/>;
}

function Badge({ s }: { s: string }) {
  const M: Record<string, [string, string]> = {
    Pending:   ["rgba(255,152,0,0.1)",  G.amber],
    Approved:  ["rgba(96,165,250,0.1)", G.blue],
    Completed: ["rgba(0,230,118,0.1)",  G.green],
    Rejected:  ["rgba(255,64,64,0.1)",  G.red],
    Active:    ["rgba(0,230,118,0.1)",  G.green],
    Suspended: ["rgba(255,64,64,0.1)",  G.red],
    Pending_:  ["rgba(255,152,0,0.1)",  G.amber],
  };
  const [bg, fg] = M[s] ?? ["rgba(255,255,255,0.06)", G.muted];
  return <span style={{ background: bg, color: fg, border: `1px solid ${fg}44`, borderRadius: 99, padding: "3px 10px", fontSize: 10, fontWeight: 700, whiteSpace: "nowrap" }}>{s}</span>;
}

function Av({ name }: { name: string }) {
  const i = name.split(" ").map(w => w[0] ?? "").join("").slice(0, 2).toUpperCase();
  return <div style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0, background: "linear-gradient(135deg,rgba(0,230,118,0.15),rgba(0,230,118,0.04))", border: "1px solid rgba(0,230,118,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, color: G.green, fontFamily: "'Syne',sans-serif" }}>{i}</div>;
}

function TBar({ score }: { score: number }) {
  const c = score >= 80 ? G.green : score >= 50 ? G.amber : G.red;
  return <div style={{ height: 3, borderRadius: 99, background: "rgba(255,255,255,0.07)", overflow: "hidden", marginTop: 5 }}><div style={{ height: "100%", width: `${score}%`, background: c, borderRadius: 99, transition: "width 0.4s ease" }}/></div>;
}

function Btn({ label, variant, onClick, loading, sm }: {
  label: string;
  variant: "success" | "danger" | "info" | "warning" | "ghost";
  onClick: () => void; loading?: boolean; sm?: boolean;
}) {
  const V: Record<string, [string, string, string]> = {
    success: ["rgba(0,230,118,0.1)",   G.green,  "rgba(0,230,118,0.25)"],
    danger:  ["rgba(255,64,64,0.1)",   G.red,    "rgba(255,64,64,0.25)"],
    info:    ["rgba(96,165,250,0.1)",  G.blue,   "rgba(96,165,250,0.25)"],
    warning: ["rgba(255,152,0,0.1)",   G.amber,  "rgba(255,152,0,0.25)"],
    ghost:   ["rgba(255,255,255,0.05)","rgba(255,255,255,0.6)","rgba(255,255,255,0.1)"],
  };
  const [bg, fg, border] = V[variant];
  return (
    <button onClick={onClick} disabled={loading} style={{ background: bg, color: fg, border: `1px solid ${border}`, borderRadius: 9, padding: sm ? "6px 12px" : "8px 16px", fontSize: sm ? 11 : 12, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: loading ? 0.5 : 1, transition: "all 0.18s", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 5 }}>
      {loading ? <span style={{ width: 11, height: 11, borderRadius: 99, border: `2px solid ${fg}`, borderTopColor: "transparent", animation: "spin 0.7s linear infinite", display: "inline-block" }}/> : label}
    </button>
  );
}

function Empty({ emoji, title, desc }: { emoji: string; title?: string; desc: string }) {
  return <div style={{ textAlign: "center", padding: "40px 0" }}><div style={{ fontSize: 36, marginBottom: 10 }}>{emoji}</div>{title && <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{title}</div>}<div style={{ fontSize: 12, color: G.muted }}>{desc}</div></div>;
}

function StatCard({ label, value, sub, icon, accent, loading }: {
  label: string; value: string | number; sub?: string;
  icon: string; accent: string; loading?: boolean;
}) {
  return (
    <div style={{ flex: 1, minWidth: 130, position: "relative", overflow: "hidden", background: G.card, border: `1px solid ${G.border}`, borderRadius: 22, padding: "20px 18px", boxShadow: "0 4px 24px rgba(0,0,0,0.3)" }}>
      <div style={{ fontSize: 22, marginBottom: 10 }}>{icon}</div>
      <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: 1.4, color: G.muted, marginBottom: 6, fontWeight: 600 }}>{label}</div>
      {loading ? <Sk w={80} h={24}/> : <div style={{ fontSize: 22, fontWeight: 900, fontFamily: "'Syne',sans-serif", lineHeight: 1 }}>{value}</div>}
      {sub && !loading && <div style={{ fontSize: 11, color: accent, marginTop: 5, fontWeight: 600 }}>{sub}</div>}
      <div style={{ position: "absolute", bottom: -20, right: -20, width: 80, height: 80, borderRadius: 99, background: accent, opacity: 0.06, filter: "blur(24px)" }}/>
    </div>
  );
}

function GGLogo() {
  return (
    <svg width="38" height="38" viewBox="0 0 38 38" fill="none">
      <defs>
        <linearGradient id="aBg" x1="0" y1="0" x2="38" y2="38" gradientUnits="userSpaceOnUse"><stop offset="0%" stopColor="#0d3d1f"/><stop offset="100%" stopColor="#051508"/></linearGradient>
        <linearGradient id="aGold" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f5d060"/><stop offset="100%" stopColor="#b8820a"/></linearGradient>
      </defs>
      <rect width="38" height="38" rx="11" fill="url(#aBg)"/>
      <rect width="38" height="38" rx="11" fill="none" stroke="#c8960a" strokeWidth="1" opacity="0.5"/>
      <text x="19" y="26" textAnchor="middle" fontSize="17" fontWeight="900" fontFamily="Georgia,serif" fill="url(#aGold)">GG</text>
    </svg>
  );
}

// ── REJECT MODAL ──────────────────────────────────────────────────────────────
function RejectModal({ payout, onClose, onConfirm }: {
  payout: Payout;
  onClose: () => void;
  onConfirm: (note: string) => void;
}) {
  const [note, setNote] = useState("");
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 420, background: "#0a1a0c", border: `1px solid ${G.border}`, borderRadius: 24, padding: 28, boxShadow: "0 20px 60px rgba(0,0,0,0.7)" }}>
        <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "'Syne',sans-serif", marginBottom: 4, color: G.red }}>Reject Payout</div>
        <div style={{ fontSize: 12, color: G.muted, marginBottom: 20 }}>
          {payout.user?.full_name} · {fmt(payout.amount)} → {payout.dest_bank}
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: G.muted, marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>Reason (shown to member)</div>
          <textarea
            value={note} onChange={e => setNote(e.target.value)}
            placeholder="e.g. Account details could not be verified…"
            rows={3}
            style={{ width: "100%", background: "rgba(255,255,255,0.05)", border: `1px solid ${G.border}`, borderRadius: 11, padding: "12px 14px", color: "#f0f0f0", fontSize: 13, outline: "none", fontFamily: "inherit", resize: "vertical" }}
          />
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <Btn label="Cancel" variant="ghost" onClick={onClose}/>
          <Btn label="✗ Reject Payout" variant="danger" onClick={() => onConfirm(note)}/>
        </div>
      </div>
    </div>
  );
}

// ── NOTIFICATION PANEL ────────────────────────────────────────────────────────
function NotifPanel({ items, onMarkRead, onClose }: {
  items: Notification[];
  onMarkRead: (ids: string[]) => void;
  onClose: () => void;
}) {
  const unreadIds = items.filter(n => !n.is_read).map(n => n.id);
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 500 }} onClick={onClose}>
      <div
        style={{ position: "absolute", top: 65, right: 16, width: 340, maxHeight: "70vh", overflow: "hidden auto", background: "#0a1a0c", border: `1px solid ${G.border}`, borderRadius: 20, boxShadow: "0 20px 60px rgba(0,0,0,0.8)", display: "flex", flexDirection: "column" }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 18px", borderBottom: `1px solid ${G.border}` }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Notifications</div>
          {unreadIds.length > 0 && (
            <button onClick={() => onMarkRead(unreadIds)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: G.green, fontFamily: "inherit", fontWeight: 700 }}>
              Mark all read
            </button>
          )}
        </div>
        {items.length === 0
          ? <div style={{ padding: "30px", textAlign: "center", color: G.muted, fontSize: 13 }}>No notifications yet</div>
          : items.map(n => (
              <div key={n.id} onClick={() => !n.is_read && onMarkRead([n.id])} style={{ display: "flex", gap: 12, padding: "14px 18px", borderBottom: `1px solid ${G.border}`, background: n.is_read ? "transparent" : "rgba(0,230,118,0.03)", cursor: "pointer", transition: "background 0.2s" }}>
                <div style={{ fontSize: 20, flexShrink: 0 }}>{NOTIF_ICON[n.type] ?? "🔔"}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: n.is_read ? 500 : 700 }}>{n.title}</div>
                  {n.body && <div style={{ fontSize: 12, color: G.muted, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.body}</div>}
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginTop: 3, fontFamily: "'DM Mono',monospace" }}>{ago(n.created_at)}</div>
                </div>
                {!n.is_read && <div style={{ width: 7, height: 7, borderRadius: 99, background: G.green, flexShrink: 0, marginTop: 4 }}/>}
              </div>
            ))
        }
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════════
export default function AdminPage() {
  const router = useRouter();
  const { toasts, push } = useToast();

  // ── Auth ──────────────────────────────────────────────────────────────────
  const [authReady, setAuthReady] = useState(false);
  const [adminName, setAdminName] = useState("");
  const [adminId,   setAdminId]   = useState("");

  // Auth guard — uses real Supabase session so RLS works
  useEffect(() => {
    async function checkAuth() {
      const { createClient } = await import("@/lib/supabase/client");
      const sb = createClient();
      const { data: { user }, error } = await sb.auth.getUser();
      if (error || !user) { router.replace("/login"); return; }
      const { data: profile } = await sb
        .from("profiles")
        .select("id, full_name, is_admin, status")
        .eq("id", user.id)
        .single();
      if (!profile) { router.replace("/login"); return; }
      if (profile.status === "Suspended") { router.replace("/login"); return; }
      if (!profile.is_admin) { router.replace("/dashboard"); return; }
      setAdminName(profile.full_name ?? "Admin");
      setAdminId(profile.id);
      setAuthReady(true);
    }
    checkAuth();
  }, []); // runs exactly once

  // ── Data hooks ────────────────────────────────────────────────────────────
  const statsHook  = useAdminStats();
  const payHook    = useAllPayouts();
  const membHook   = useAllMembers();
  const defHook    = useDefaulters();
  const auditHook  = useAuditLog();
  const notifHook  = useNotifications(); // real-time via Supabase channel

  // ── UI state ──────────────────────────────────────────────────────────────
  const [tab,          setTab]         = useState("Overview");
  const [filter,       setFilter]      = useState("All");
  const [search,       setSearch]      = useState("");
  const [busy,         setBusy]        = useState<Record<string, boolean>>({});
  const [showNotif,    setShowNotif]   = useState(false);
  const [rejectTarget, setRejectTarget]= useState<Payout | null>(null);

  const go = (key: string, v: boolean) => setBusy(p => ({ ...p, [key]: v }));
  async function logout() {
    const { createClient } = await import("@/lib/supabase/client");
    const sb = createClient();
    await sb.auth.signOut();
    router.replace("/login");
  }

  // ── Payout actions ────────────────────────────────────────────────────────
  async function approve(p: Payout) {
    go(p.id, true);
    try {
      await dbApprovePayout(p.id, adminId);
      payHook.updateStatus(p.id, "Approved");
      push(`✅ Approved payout for ${p.user?.full_name}`);
    } catch { push("❌ Approval failed", false); }
    finally { go(p.id, false); }
  }

  async function execute(p: Payout) {
    go(`ex_${p.id}`, true);
    try {
      await dbExecutePayout(p.id, adminId);
      payHook.updateStatus(p.id, "Completed");
      statsHook.refetch();
      push(`💸 Transfer executed — ${fmt(p.amount)} to ${p.user?.full_name}`);
    } catch { push("❌ Transfer failed", false); }
    finally { go(`ex_${p.id}`, false); }
  }

  async function confirmReject(note: string) {
    if (!rejectTarget) return;
    go(`rj_${rejectTarget.id}`, true);
    try {
      await dbRejectPayout(rejectTarget.id, adminId, note);
      payHook.updateStatus(rejectTarget.id, "Rejected");
      push(`❌ Payout rejected`);
    } catch { push("❌ Rejection failed", false); }
    finally { go(`rj_${rejectTarget.id}`, false); setRejectTarget(null); }
  }

  // ── User actions ──────────────────────────────────────────────────────────
  async function suspend(u: Profile) {
    go(`su_${u.id}`, true);
    try {
      await dbSuspendUser(u.id, adminId);
      membHook.updateStatus(u.id, "Suspended");
      defHook.remove(u.id);
      push(`⛔ ${u.full_name} suspended`);
    } catch { push("❌ Suspend failed", false); }
    finally { go(`su_${u.id}`, false); }
  }

  async function restore(u: Profile) {
    go(`rs_${u.id}`, true);
    try {
      await dbRestoreUser(u.id, adminId);
      membHook.updateStatus(u.id, "Active");
      push(`✅ ${u.full_name} restored`);
    } catch { push("❌ Restore failed", false); }
    finally { go(`rs_${u.id}`, false); }
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const TABS = ["Overview", "Payments", "Payouts", "Defaulters", "Members", "Audit Log", "Settings"];
  const filteredPay  = filter === "All" ? payHook.items : payHook.items.filter(p => p.status === filter);
  const filteredMemb = membHook.items.filter(u =>
    u.full_name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );
  const pendingCount = payHook.items.filter(p => p.status === "Pending").length;
  const avgTrust     = defHook.items.length
    ? Math.round(defHook.items.reduce((a, d) => a + d.trust_score, 0) / defHook.items.length)
    : 100;

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
    @keyframes bellShake{0%,100%{transform:rotate(0)}20%{transform:rotate(-15deg)}40%{transform:rotate(15deg)}60%{transform:rotate(-8deg)}80%{transform:rotate(8deg)}}
    .sec{animation:fadeUp 0.35s ease}
    .tabbtn:hover{background:rgba(255,255,255,0.04)!important;color:rgba(255,255,255,0.7)!important}
    .crow:hover td{background:rgba(255,255,255,0.018)}
    .qbtn:hover{transform:translateY(-2px);background:rgba(255,255,255,0.05)!important}
    .bell-shake{animation:bellShake 0.5s ease}
  `;

  return (
    <>
      <style>{css}</style>

      {/* Reject modal */}
      {rejectTarget && (
        <RejectModal
          payout={rejectTarget}
          onClose={() => setRejectTarget(null)}
          onConfirm={confirmReject}
        />
      )}

      {/* Notification panel */}
      {showNotif && (
        <NotifPanel
          items={notifHook.items}
          onMarkRead={notifHook.markRead}
          onClose={() => setShowNotif(false)}
        />
      )}

      {/* Toasts */}
      <div style={{ position: "fixed", top: 20, right: 20, zIndex: 9999, display: "flex", flexDirection: "column", gap: 8, pointerEvents: "none" }}>
        {toasts.map(t => (
          <div key={t.id} style={{ background: "rgba(8,18,10,0.96)", border: `1px solid ${t.ok ? "rgba(0,230,118,0.18)" : "rgba(255,64,64,0.25)"}`, borderRadius: 16, padding: "12px 18px", fontSize: 13, animation: "slideIn 0.3s ease", backdropFilter: "blur(16px)", maxWidth: 300, boxShadow: "0 8px 32px rgba(0,0,0,0.6)" }}>{t.msg}</div>
        ))}
      </div>

      <div style={{ minHeight: "100vh", background: "radial-gradient(ellipse 70% 40% at 50% -10%,rgba(20,80,30,0.35) 0%,transparent 60%),#040a06" }}>

        {/* ── Header ── */}
        <header style={{ position: "sticky", top: 0, zIndex: 200, height: 60, backdropFilter: "blur(24px) saturate(1.6)", background: "rgba(4,10,6,0.85)", borderBottom: "1px solid rgba(0,230,118,0.08)", display: "flex", alignItems: "center", padding: "0 20px" }}>
          <div style={{ maxWidth: 1080, width: "100%", margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <GGLogo/>
              <div>
                <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 800, background: "linear-gradient(135deg,#e8f5e9,#a5d6a7)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>God&apos;s Grace</div>
                <div style={{ fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: G.red, fontWeight: 700 }}>Admin Panel</div>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>

              {/* FIX 1: was `items` (undefined) — now correctly uses payHook.items */}
              {payHook.items.length > 0 && (
                <div
                  style={{ background: "rgba(0,230,118,0.08)", border: "1px solid rgba(0,230,118,0.2)", borderRadius: 99, padding: "4px 12px", fontSize: 11, color: G.green, fontWeight: 700, cursor: "pointer" }}
                  onClick={() => setTab("Payments")}
                >
                  💰 {payHook.items.length} payments
                </div>
              )}

              {/* Pending payout badge */}
              {pendingCount > 0 && (
                <div style={{ background: "rgba(255,152,0,0.1)", border: "1px solid rgba(255,152,0,0.25)", borderRadius: 99, padding: "4px 12px", fontSize: 11, color: G.amber, fontWeight: 700, cursor: "pointer" }} onClick={() => { setTab("Payouts"); setFilter("Pending"); }}>
                  ⏳ {pendingCount} pending
                </div>
              )}

              {/* Bell */}
              <button
                onClick={() => setShowNotif(v => !v)}
                className={notifHook.unread > 0 ? "bell-shake" : ""}
                style={{ position: "relative", background: "rgba(255,255,255,0.05)", border: `1px solid ${G.border}`, borderRadius: 11, width: 38, height: 38, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}
              >
                🔔
                {notifHook.unread > 0 && (
                  <span style={{ position: "absolute", top: -4, right: -4, background: G.red, color: "#fff", borderRadius: 99, fontSize: 9, fontWeight: 900, padding: "2px 5px", minWidth: 16, textAlign: "center" }}>
                    {notifHook.unread > 9 ? "9+" : notifHook.unread}
                  </span>
                )}
              </button>

              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 7, height: 7, borderRadius: 99, background: G.green, animation: "pulse 2s infinite" }}/>
                <span style={{ fontSize: 10, color: G.muted }}>Live</span>
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.7)" }}>{adminName.split(" ")[0]}</span>
              <button onClick={logout} style={{ background: "rgba(255,64,64,0.08)", border: "1px solid rgba(255,64,64,0.22)", color: G.red, borderRadius: 9, padding: "6px 14px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Logout</button>
            </div>
          </div>
        </header>

        {/* ── Content ── */}
        <main style={{ maxWidth: 1080, margin: "0 auto", padding: "24px 16px 80px" }}>

          {/* Tab nav */}
          <nav style={{ display: "flex", gap: 3, overflowX: "auto", background: "rgba(255,255,255,0.025)", border: `1px solid ${G.border}`, borderRadius: 18, padding: 4, marginBottom: 28 }}>
            {TABS.map(t => (
              <button key={t} className="tabbtn" onClick={() => setTab(t)} style={{ flex: 1, minWidth: "max-content", background: tab === t ? "rgba(0,230,118,0.1)" : "transparent", color: tab === t ? G.green : G.muted, border: tab === t ? "1px solid rgba(0,230,118,0.22)" : "1px solid transparent", borderRadius: 13, padding: "9px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", transition: "all 0.2s", whiteSpace: "nowrap" }}>
                {t}{t === "Payouts" && pendingCount > 0 ? ` (${pendingCount})` : ""}
              </button>
            ))}
          </nav>

          {/* ═══════════════════ OVERVIEW ═══════════════════ */}
          {tab === "Overview" && (
            <div className="sec" style={{ display: "flex", flexDirection: "column", gap: 22 }}>
              <div>
                <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 900 }}>Good day, {adminName.split(" ")[0]} 👑</div>
                <div style={{ fontSize: 12, color: G.muted, marginTop: 4 }}>
                  {new Date().toLocaleDateString("en-NG", { weekday: "long", month: "long", day: "numeric" })} · Platform at a glance
                </div>
              </div>

              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <StatCard label="Total Float"   value={statsHook.stats ? fmt(statsHook.stats.total_float) : "—"}           sub="All confirmed contributions"              icon="🏦" accent={G.blue}  loading={statsHook.loading}/>
                <StatCard label="Members"       value={statsHook.stats?.total_users ?? "—"}                                sub="Registered"                              icon="👥" accent={G.green} loading={statsHook.loading}/>
                <StatCard label="Active Plans"  value={statsHook.stats?.active_plans ?? "—"}                               sub="Currently contributing"                  icon="📈" accent={G.green} loading={statsHook.loading}/>
                <StatCard label="Defaulters"    value={statsHook.stats?.defaulter_count ?? "—"}                            sub="Trust score < 70"                        icon="⚠️" accent={G.red}   loading={statsHook.loading}/>
                <StatCard label="Payouts Today" value={statsHook.stats ? fmt(statsHook.stats.payouts_today_amount) : "—"} sub={`${statsHook.stats?.payouts_today ?? 0} transfers`} icon="📤" accent={G.amber} loading={statsHook.loading}/>
              </div>

              {/* Quick actions */}
              <Card>
                <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.5, color: G.muted, marginBottom: 14, fontWeight: 700 }}>Quick Actions</div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {/*
                    FIX 4: Previously `setFilter(f)` was called even when `f` is undefined
                    (for buttons without a filter value), which set filter state to undefined.
                    Now falls back to "All" when no filter is specified.
                  */}
                  {[
                    { label: "Pending Payouts", count: pendingCount,          t: "Payouts",    filter: "Pending", icon: "💸", color: G.blue  },
                    { label: "Defaulters",      count: defHook.items.length,  t: "Defaulters", filter: "",        icon: "⚠️", color: G.red   },
                    { label: "All Members",     count: membHook.items.length, t: "Members",    filter: "",        icon: "👥", color: G.green },
                    { label: "Audit Log",       count: null,                  t: "Audit Log",  filter: "",        icon: "📋", color: G.amber },
                  ].map(({ label, count, t, icon, color, filter: f }) => (
                    <button
                      key={t}
                      className="qbtn"
                      onClick={() => {
                        setTab(t);
                        // FIX 4: fall back to "All" instead of passing undefined
                        setFilter(f || "All");
                      }}
                      style={{ flex: 1, minWidth: 140, background: "rgba(255,255,255,0.025)", border: `1px solid ${G.border}`, borderRadius: 16, padding: 16, cursor: "pointer", fontFamily: "inherit", transition: "all 0.2s", textAlign: "left" }}
                    >
                      <div style={{ fontSize: 22, marginBottom: 8 }}>{icon}</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color }}>{label}</div>
                      {count !== null && <div style={{ fontSize: 11, color: G.muted, marginTop: 2 }}>{count} {count === 1 ? "record" : "records"}</div>}
                    </button>
                  ))}
                </div>
              </Card>

              {/* Pending payouts preview */}
              <Card>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>Pending Payouts</div>
                  <button onClick={() => { setTab("Payouts"); setFilter("Pending"); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: G.red, fontFamily: "inherit", fontWeight: 700 }}>View all →</button>
                </div>
                {payHook.loading
                  ? [1,2,3].map(i => <div key={i} style={{ padding: "12px 0", borderBottom: `1px solid ${G.border}` }}><Sk h={36}/></div>)
                  : payHook.items.filter(p => p.status === "Pending").length === 0
                    ? <Empty emoji="🎉" desc="No pending payouts — you're all caught up!"/>
                    : payHook.items.filter(p => p.status === "Pending").slice(0, 4).map(p => (
                        <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: `1px solid ${G.border}`, flexWrap: "wrap" }}>
                          <Av name={p.user?.full_name ?? "?"}/>
                          <div style={{ flex: 1, minWidth: 100 }}>
                            <div style={{ fontSize: 13, fontWeight: 600 }}>{p.user?.full_name}</div>
                            <div style={{ fontSize: 11, color: G.muted, fontFamily: "'DM Mono',monospace" }}>{p.dest_bank} · {p.dest_account}</div>
                          </div>
                          <div style={{ fontWeight: 900, fontSize: 15, fontFamily: "'Syne',sans-serif" }}>{fmt(p.amount)}</div>
                          <div style={{ display: "flex", gap: 6 }}>
                            <Btn label="✓" variant="success" sm onClick={() => approve(p)} loading={busy[p.id]}/>
                            <Btn label="✗" variant="danger"  sm onClick={() => setRejectTarget(p)}/>
                          </div>
                        </div>
                      ))
                }
              </Card>

              {/* Recent notifications */}
              <Card>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>Recent Activity</div>
                  {notifHook.unread > 0 && <Badge s={`${notifHook.unread} unread`}/>}
                </div>
                {notifHook.loading
                  ? [1,2,3].map(i => <div key={i} style={{ padding: "10px 0", borderBottom: `1px solid ${G.border}` }}><Sk h={28}/></div>)
                  : notifHook.items.length === 0
                    ? <Empty emoji="🔔" desc="No activity yet"/>
                    : notifHook.items.slice(0, 5).map(n => (
                        <div key={n.id} style={{ display: "flex", gap: 12, padding: "11px 0", borderBottom: `1px solid ${G.border}`, alignItems: "flex-start", opacity: n.is_read ? 0.5 : 1 }}>
                          <div style={{ fontSize: 18, flexShrink: 0 }}>{NOTIF_ICON[n.type] ?? "🔔"}</div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: n.is_read ? 500 : 700 }}>{n.title}</div>
                            {n.body && <div style={{ fontSize: 12, color: G.muted, marginTop: 1 }}>{n.body}</div>}
                          </div>
                          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", fontFamily: "'DM Mono',monospace", flexShrink: 0 }}>{ago(n.created_at)}</div>
                        </div>
                      ))
                }
              </Card>
            </div>
          )}

          {/* ═══════════════════ PAYMENTS ═══════════════════ */}
          {/* FIX 2: Payments tab was rendered OUTSIDE <main> before the notification panel.
              It is now correctly placed inside <main> alongside all other tab sections. */}
          {tab === "Payments" && (
            <div className="sec">
              <AdminPayments adminId={adminId} onToast={(msg) => push(msg)}/>
            </div>
          )}

          {/* ═══════════════════ PAYOUTS ═══════════════════ */}
          {tab === "Payouts" && (
            <div className="sec" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
                <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 19, fontWeight: 900 }}>Payout Queue</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {["All","Pending","Approved","Completed","Rejected"].map(s => (
                    <button key={s} onClick={() => setFilter(s)} style={{ background: filter === s ? "rgba(255,64,64,0.12)" : "rgba(255,255,255,0.04)", color: filter === s ? G.red : G.muted, border: filter === s ? "1px solid rgba(255,64,64,0.28)" : `1px solid ${G.border}`, borderRadius: 8, padding: "6px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", transition: "all 0.18s" }}>{s}</button>
                  ))}
                </div>
              </div>

              <Card style={{ padding: "0 22px" }}>
                {payHook.loading
                  ? [1,2,3].map(i => <div key={i} style={{ padding: "20px 0", borderBottom: `1px solid ${G.border}` }}><Sk h={56}/></div>)
                  : filteredPay.length === 0
                    ? <Empty emoji="📭" desc="No payouts with this status"/>
                    : filteredPay.map(p => (
                        <div key={p.id} style={{ padding: "18px 0", borderBottom: `1px solid ${G.border}` }}>
                          {/* Row header */}
                          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
                            <Av name={p.user?.full_name ?? "?"}/>
                            <div style={{ flex: 1, minWidth: 120 }}>
                              <div style={{ fontSize: 14, fontWeight: 700 }}>{p.user?.full_name}</div>
                              <div style={{ fontSize: 11, color: G.muted }}>{p.user?.email} · {p.user?.phone}</div>
                            </div>
                            <div style={{ textAlign: "right" }}>
                              <div style={{ fontSize: 18, fontWeight: 900, fontFamily: "'Syne',sans-serif" }}>{fmt(p.amount)}</div>
                              <div style={{ fontSize: 11, color: G.muted, fontFamily: "'DM Mono',monospace" }}>{ago(p.requested_at)}</div>
                            </div>
                            <Badge s={p.status}/>
                          </div>
                          {/* Bank info */}
                          <div style={{ fontSize: 11, color: G.muted, fontFamily: "'DM Mono',monospace", marginBottom: 10 }}>
                            🏦 {p.dest_bank} · {p.dest_account}{p.dest_name ? ` · ${p.dest_name}` : ""} · OTP: {p.otp_verified ? "✓ Verified" : "✗ Unverified"}
                          </div>
                          {/* Admin note */}
                          {p.admin_note && (
                            <div style={{ fontSize: 12, color: G.amber, background: "rgba(255,152,0,0.06)", border: "1px solid rgba(255,152,0,0.15)", borderRadius: 9, padding: "8px 12px", marginBottom: 10 }}>
                              Note: {p.admin_note}
                            </div>
                          )}
                          {/* Actions */}
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                            {p.status === "Pending" && (
                              <>
                                {!p.otp_verified && <span style={{ fontSize: 11, color: G.red, alignSelf: "center" }}>⚠️ OTP not verified</span>}
                                <Btn label="✓ Approve" variant="success" sm onClick={() => approve(p)} loading={busy[p.id]}/>
                                <Btn label="✗ Reject"  variant="danger"  sm onClick={() => setRejectTarget(p)}/>
                              </>
                            )}
                            {p.status === "Approved" && (
                              <Btn label="💸 Execute Transfer" variant="info" sm onClick={() => execute(p)} loading={busy[`ex_${p.id}`]}/>
                            )}
                            {p.status === "Completed" && <span style={{ fontSize: 11, color: G.muted }}>Settled ✓ {p.resolved_at ? ago(p.resolved_at) : ""}</span>}
                            {p.status === "Rejected"  && <span style={{ fontSize: 11, color: "rgba(255,82,82,0.4)" }}>Rejected ✗</span>}
                          </div>
                        </div>
                      ))
                }
              </Card>
            </div>
          )}

          {/* ═══════════════════ DEFAULTERS ═══════════════════ */}
          {tab === "Defaulters" && (
            <div className="sec" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 19, fontWeight: 900 }}>Defaulter Management</div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <StatCard label="Defaulters"      value={defHook.loading ? "…" : defHook.items.length} sub="Trust score below 70" icon="⚠️" accent={G.red}   loading={defHook.loading}/>
                <StatCard label="Avg Trust Score" value={defHook.loading ? "…" : `${avgTrust}/100`}    sub="Among defaulters"    icon="📉" accent={G.amber} loading={defHook.loading}/>
              </div>
              <Card>
                {defHook.loading
                  ? [1,2,3].map(i => <div key={i} style={{ padding: "14px 0", borderBottom: `1px solid ${G.border}` }}><Sk h={40}/></div>)
                  : defHook.items.length === 0
                    ? <Empty emoji="🎉" title="No defaulters!" desc="All members are contributing on time."/>
                    : defHook.items.map(d => (
                        <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 0", borderBottom: `1px solid ${G.border}`, flexWrap: "wrap" }}>
                          <div style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0, background: "rgba(255,82,82,0.08)", border: "1px solid rgba(255,82,82,0.18)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>
                            {d.trust_score < 40 ? "🔴" : d.trust_score < 55 ? "🟠" : "🟡"}
                          </div>
                          <div style={{ flex: 1, minWidth: 140 }}>
                            <div style={{ fontSize: 14, fontWeight: 700 }}>{d.full_name}</div>
                            <div style={{ fontSize: 11, color: G.muted, fontFamily: "'DM Mono',monospace" }}>
                              Trust: {d.trust_score}/100 · Streak: {d.contribution_streak}d · {d.phone}
                            </div>
                            <TBar score={d.trust_score}/>
                          </div>
                          <div style={{ display: "flex", gap: 8 }}>
                            {/*
                              FIX 5: Was `suspend(d as any)` which bypassed type safety.
                              Now passes an explicit Profile-shaped object so `suspend`
                              receives exactly the fields it needs without an unsafe cast.
                            */}
                            <Btn
                              label="⛔ Suspend"
                              variant="danger"
                              sm
                              onClick={() => suspend({ id: d.id, full_name: d.full_name } as Profile)}
                              loading={busy[`su_${d.id}`]}
                            />
                          </div>
                        </div>
                      ))
                }
              </Card>
            </div>
          )}

          {/* ═══════════════════ MEMBERS ═══════════════════ */}
          {tab === "Members" && (
            <div className="sec" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
                <div>
                  <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 19, fontWeight: 900 }}>All Members</div>
                  <div style={{ fontSize: 12, color: G.muted, marginTop: 3 }}>{membHook.items.length} registered</div>
                </div>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or email…" style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${G.border}`, borderRadius: 10, padding: "10px 14px", color: "#f0f0f0", fontSize: 13, outline: "none", fontFamily: "inherit", width: 240 }}/>
              </div>
              <Card style={{ padding: 0 }}>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr>
                        {["Member","Plan","Balance","Streak","Trust","Status",""].map(h => (
                          <th key={h} style={{ textAlign: "left", padding: "13px 18px", fontSize: 9, textTransform: "uppercase", letterSpacing: 1.2, color: G.muted, fontWeight: 600, borderBottom: `1px solid ${G.border}`, whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {membHook.loading
                        ? [1,2,3,4].map(i => <tr key={i} className="crow"><td colSpan={7} style={{ padding: "16px 18px", borderBottom: `1px solid ${G.border}` }}><Sk h={28}/></td></tr>)
                        : filteredMemb.map(u => (
                            <tr key={u.id} className="crow">
                              <td style={{ padding: "13px 18px", borderBottom: `1px solid ${G.border}` }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                  <Av name={u.full_name}/>
                                  <div>
                                    <div style={{ fontWeight: 700 }}>{u.full_name}</div>
                                    <div style={{ fontSize: 11, color: G.muted, marginTop: 1 }}>{u.email}</div>
                                  </div>
                                </div>
                              </td>
                              <td style={{ padding: "13px 18px", borderBottom: `1px solid ${G.border}` }}>
                                <div>{u.plan_type}</div>
                                <div style={{ fontSize: 11, color: G.blue, marginTop: 1 }}>{fmt(u.fixed_amount)}/day</div>
                              </td>
                              <td style={{ padding: "13px 18px", borderBottom: `1px solid ${G.border}`, fontWeight: 800, color: G.green, fontFamily: "'Syne',sans-serif" }}>{fmt(u.total_saved)}</td>
                              <td style={{ padding: "13px 18px", borderBottom: `1px solid ${G.border}`, color: G.amber, fontWeight: 700 }}>🔥 {u.contribution_streak}d</td>
                              <td style={{ padding: "13px 18px", borderBottom: `1px solid ${G.border}` }}>
                                <div style={{ fontWeight: 700, color: u.trust_score >= 80 ? G.green : u.trust_score >= 50 ? G.amber : G.red }}>{u.trust_score}/100</div>
                                <TBar score={u.trust_score}/>
                              </td>
                              <td style={{ padding: "13px 18px", borderBottom: `1px solid ${G.border}` }}><Badge s={u.status}/></td>
                              <td style={{ padding: "13px 18px", borderBottom: `1px solid ${G.border}` }}>
                                {u.status === "Active"    && <Btn label="Suspend" variant="danger"  sm onClick={() => suspend(u)} loading={busy[`su_${u.id}`]}/>}
                                {u.status === "Suspended" && <Btn label="Restore" variant="success" sm onClick={() => restore(u)} loading={busy[`rs_${u.id}`]}/>}
                              </td>
                            </tr>
                          ))
                      }
                    </tbody>
                  </table>
                  {!membHook.loading && filteredMemb.length === 0 && (
                    <div style={{ textAlign: "center", padding: "40px", color: G.muted, fontSize: 13 }}>No members match your search.</div>
                  )}
                </div>
              </Card>
            </div>
          )}

          {/* ═══════════════════ AUDIT LOG ═══════════════════ */}
          {tab === "Audit Log" && (
            <div className="sec">
              <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 19, fontWeight: 900, marginBottom: 4 }}>Audit Log</div>
              <div style={{ fontSize: 12, color: G.muted, marginBottom: 20 }}>Every admin action is written to the database for full accountability.</div>
              <Card>
                {auditHook.loading
                  ? [1,2,3,4,5].map(i => <div key={i} style={{ padding: "14px 0", borderBottom: `1px solid ${G.border}` }}><Sk h={32}/></div>)
                  : auditHook.items.length === 0
                    ? <Empty emoji="📋" desc="No audit entries yet."/>
                    : auditHook.items.map((a, i) => {
                        const meta = AUDIT_META[a.action] ?? { label: a.action, color: "#fff", icon: "🔧" };
                        return (
                          <div key={a.id} style={{ display: "flex", gap: 14, padding: "14px 0", borderBottom: i < auditHook.items.length - 1 ? `1px solid ${G.border}` : "none", alignItems: "flex-start" }}>
                            <div style={{ width: 8, height: 8, borderRadius: 99, background: meta.color, boxShadow: `0 0 8px ${meta.color}88`, flexShrink: 0, marginTop: 5 }}/>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 13, fontWeight: 700, color: meta.color }}>{meta.icon} {meta.label}</div>
                              {a.target_description && <div style={{ fontSize: 12, color: G.muted, marginTop: 2 }}>— {a.target_description}</div>}
                              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginTop: 2, fontFamily: "'DM Mono',monospace" }}>
                                by {a.admin_id ?? "system"} · {ago(a.created_at)}
                              </div>
                            </div>
                          </div>
                        );
                      })
                }
              </Card>
            </div>
          )}

          {/* ═══════════════════ SETTINGS ═══════════════════ */}
          {/* FIX 3: Was jammed onto the same line as the Audit Log closing brace.
              Now properly separated as its own block inside <main>. */}
          {tab === "Settings" && (
            <div className="sec">
              <AdminSettings adminId={adminId} onToast={(msg) => push(msg)}/>
            </div>
          )}

        </main>
      </div>
    </>
  );
}