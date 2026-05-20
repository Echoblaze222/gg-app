"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import AdminSettings from "@/components/AdminSettings";

// ── HELPERS ───────────────────────────────────────────────────────────────────
const fmt = (n: number) => "₦" + (n / 100).toLocaleString("en-NG");

// ── MOCK DATA ─────────────────────────────────────────────────────────────────
const MOCK_ADMIN_STATS = {
  total_float:          487200000,
  active_plans:         134,
  defaulter_count:      8,
  payouts_today:        3,
  total_users:          142,
  payouts_today_amount: 15500000,
};

const MOCK_ALL_USERS = [
  { id: "u1", full_name: "Adaeze Okonkwo", email: "adaeze@example.com", phone: "08123456789", trust_score: 87, contribution_streak: 14, total_saved: 18450000, plan_type: "Daily", fixed_amount: 500000,  status: "Active"    },
  { id: "u2", full_name: "Emeka Nwosu",    email: "emeka@example.com",  phone: "08098765432", trust_score: 72, contribution_streak: 6,  total_saved: 7200000,  plan_type: "Daily", fixed_amount: 300000,  status: "Active"    },
  { id: "u3", full_name: "Ngozi Eze",      email: "ngozi@example.com",  phone: "08055512345", trust_score: 95, contribution_streak: 22, total_saved: 32100000, plan_type: "Daily", fixed_amount: 1000000, status: "Active"    },
  { id: "u4", full_name: "Bola Adeyemi",   email: "bola@example.com",   phone: "08011122233", trust_score: 62, contribution_streak: 2,  total_saved: 4500000,  plan_type: "Daily", fixed_amount: 200000,  status: "Active"    },
  { id: "u5", full_name: "Tunde Fashola",  email: "tunde@example.com",  phone: "08033344455", trust_score: 55, contribution_streak: 1,  total_saved: 2100000,  plan_type: "Daily", fixed_amount: 150000,  status: "Active"    },
  { id: "u6", full_name: "Kemi Williams",  email: "kemi@example.com",   phone: "08077788899", trust_score: 40, contribution_streak: 0,  total_saved: 900000,   plan_type: "Daily", fixed_amount: 100000,  status: "Suspended" },
];

const INITIAL_PAYOUTS = [
  { id: "pay4", amount: 8000000, dest_bank: "First Bank",  dest_account: "3344556677", status: "Pending",   otp_verified: true, user: { full_name: "Ngozi Eze",      email: "ngozi@example.com",  phone: "08055512345" }, requested_at: "2025-04-29T08:00:00" },
  { id: "pay3", amount: 5000000, dest_bank: "GTBank",      dest_account: "0123456789", status: "Pending",   otp_verified: true, user: { full_name: "Emeka Nwosu",    email: "emeka@example.com",  phone: "08098765432" }, requested_at: "2025-04-28T14:00:00" },
  { id: "pay2", amount: 3000000, dest_bank: "Zenith Bank", dest_account: "9876543210", status: "Approved",  otp_verified: true, user: { full_name: "Adaeze Okonkwo", email: "adaeze@example.com", phone: "08123456789" }, requested_at: "2025-04-27T10:00:00" },
  { id: "pay1", amount: 7500000, dest_bank: "UBA",         dest_account: "1122334455", status: "Completed", otp_verified: true, user: { full_name: "Bola Adeyemi",   email: "bola@example.com",   phone: "08011122233" }, requested_at: "2025-04-25T09:00:00" },
];

const INITIAL_DEFAULTERS = [
  { id: "d1", full_name: "Bola Adeyemi",  days_missed: 5, trust_score: 62, phone: "08011122233" },
  { id: "d2", full_name: "Tunde Fashola", days_missed: 4, trust_score: 55, phone: "08033344455" },
  { id: "d3", full_name: "Kemi Williams", days_missed: 3, trust_score: 40, phone: "08077788899" },
];

// ── LOGO ─────────────────────────────────────────────────────────────────────
function GGLogo({ size = 38 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 38 38" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="lgBg" x1="0" y1="0" x2="38" y2="38" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#0d3d1f"/>
          <stop offset="100%" stopColor="#051508"/>
        </linearGradient>
        <linearGradient id="lgGold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f5d060"/>
          <stop offset="100%" stopColor="#b8820a"/>
        </linearGradient>
      </defs>
      <rect width="38" height="38" rx="11" fill="url(#lgBg)"/>
      <rect width="38" height="38" rx="11" fill="none" stroke="#c8960a" strokeWidth="1" opacity="0.5"/>
      <text x="19" y="25" textAnchor="middle" fontSize="17" fontWeight="900" fontFamily="Georgia,serif" fill="url(#lgGold)">GG</text>
    </svg>
  );
}

// ── TOAST HOOK ────────────────────────────────────────────────────────────────
function useToast() {
  const [toasts, setToasts] = useState<{ id: number; msg: string }[]>([]);
  const push = useCallback((msg: string) => {
    const id = Date.now();
    setToasts(p => [{ id, msg }, ...p].slice(0, 3));
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3500);
  }, []);
  return { toasts, push };
}

// ── REUSABLE UI ───────────────────────────────────────────────────────────────
function Card({ children, className = "", style = {} }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={`gg-card ${className}`} style={style}>
      {children}
    </div>
  );
}

function Badge({ status }: { status: string }) {
  const map: Record<string, string> = {
    Pending:   "badge-warning",
    Approved:  "badge-info",
    Completed: "badge-success",
    Active:    "badge-success",
    Suspended: "badge-danger",
    Rejected:  "badge-danger",
  };
  return <span className={`badge ${map[status] ?? "badge-neutral"}`}>{status}</span>;
}

function Btn({ label, variant, onClick, loading, size = "md" }: {
  label: string; variant: "success" | "danger" | "info" | "warning" | "ghost";
  onClick: () => void; loading?: boolean; size?: "sm" | "md";
}) {
  return (
    <button className={`btn btn-${variant} btn-${size}`} onClick={onClick} disabled={loading}>
      {loading ? <span className="spinner"/> : label}
    </button>
  );
}

function StatCard({ label, value, sub, icon, accent }: {
  label: string; value: string | number; sub?: string; icon: string; accent: string;
}) {
  return (
    <div className="stat-card" style={{ "--accent": accent } as React.CSSProperties}>
      <div className="stat-icon">{icon}</div>
      <div className="stat-body">
        <div className="stat-label">{label}</div>
        <div className="stat-value">{value}</div>
        {sub && <div className="stat-sub">{sub}</div>}
      </div>
      <div className="stat-glow"/>
    </div>
  );
}

function Avatar({ name }: { name: string }) {
  const initials = name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  return <div className="avatar">{initials}</div>;
}

function TrustBar({ score }: { score: number }) {
  const color = score >= 80 ? "#00e676" : score >= 50 ? "#ff9800" : "#ff5252";
  return (
    <div className="trust-bar-wrap">
      <div className="trust-bar-fill" style={{ width: `${score}%`, background: color }}/>
    </div>
  );
}

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const router = useRouter();
  const { toasts, push } = useToast();

  const [tab,          setTab]          = useState("Overview");
  const [payouts,      setPayouts]      = useState(INITIAL_PAYOUTS);
  const [defaulters,   setDefaulters]   = useState(INITIAL_DEFAULTERS);
  const [users,        setUsers]        = useState(MOCK_ALL_USERS);
  const [adminName,    setAdminName]    = useState("Admin");
  const [adminId,      setAdminId]      = useState("");
  const [loading,      setLoading]      = useState<Record<string, boolean>>({});
  const [search,       setSearch]       = useState("");
  const [filterStatus, setFilterStatus] = useState("All");
  const [sidebarOpen,  setSidebarOpen]  = useState(false);

  // ── Auth guard — stable deps, runs once ──────────────────────────────────
  useEffect(() => {
    const stored = localStorage.getItem("gg_user");
    if (!stored) { router.push("/login"); return; }
    const user = JSON.parse(stored);
    if (!user.is_admin) { router.push("/dashboard"); return; }
    setAdminName(user.full_name ?? "Admin");
    setAdminId(user.id ?? "");
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Helpers ──────────────────────────────────────────────────────────────
  const setLoad = (id: string, val: boolean) => setLoading(p => ({ ...p, [id]: val }));

  function handleLogout() {
    localStorage.removeItem("gg_user");
    router.push("/login");
  }

  function approvePayout(id: string) {
    setLoad(id, true);
    setTimeout(() => {
      setPayouts(p => p.map(x => x.id === id ? { ...x, status: "Approved" } : x));
      push("✅ Payout approved");
      setLoad(id, false);
    }, 1000);
  }

  function executePayout(id: string) {
    setLoad(`exec_${id}`, true);
    setTimeout(() => {
      setPayouts(p => p.map(x => x.id === id ? { ...x, status: "Completed" } : x));
      push("💸 Transfer executed");
      setLoad(`exec_${id}`, false);
    }, 1500);
  }

  function rejectPayout(id: string) {
    setLoad(`rej_${id}`, true);
    setTimeout(() => {
      setPayouts(p => p.map(x => x.id === id ? { ...x, status: "Rejected" } : x));
      push("❌ Payout rejected");
      setLoad(`rej_${id}`, false);
    }, 800);
  }

  function sendAlert(id: string, name: string) {
    setLoad(`alert_${id}`, true);
    setTimeout(() => {
      push(`📲 Alert sent to ${name}`);
      setLoad(`alert_${id}`, false);
    }, 900);
  }

  function suspendUser(id: string) {
    setLoad(`sus_${id}`, true);
    setTimeout(() => {
      setDefaulters(p => p.filter(d => d.id !== id));
      setUsers(p => p.map(u => u.id === id ? { ...u, status: "Suspended" } : u));
      push("⛔ Plan suspended");
      setLoad(`sus_${id}`, false);
    }, 1000);
  }

  function restoreUser(id: string) {
    setLoad(`res_${id}`, true);
    setTimeout(() => {
      setUsers(p => p.map(u => u.id === id ? { ...u, status: "Active" } : u));
      push("✅ User restored");
      setLoad(`res_${id}`, false);
    }, 800);
  }

  // ── Derived state ─────────────────────────────────────────────────────────
  const TABS = ["Overview", "Payouts", "Defaulters", "Members", "Audit Log", "Settings"];

  const filteredPayouts = filterStatus === "All"
    ? payouts
    : payouts.filter(p => p.status === filterStatus);

  const filteredUsers = users.filter(u =>
    u.full_name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  const auditLog = [
    { action: "approve_payout",   admin: adminName, target: "Adaeze Okonkwo — ₦30,000", time: "Today 14:32"     },
    { action: "execute_transfer", admin: adminName, target: "Bola Adeyemi — ₦75,000",   time: "Today 12:10"     },
    { action: "send_alert",       admin: adminName, target: "Tunde Fashola",             time: "Today 09:45"     },
    { action: "suspend_plan",     admin: adminName, target: "Kemi Williams",             time: "Yesterday 16:20" },
    { action: "approve_payout",   admin: adminName, target: "Emeka Nwosu — ₦50,000",    time: "Yesterday 11:05" },
  ];

  const auditMeta: Record<string, { label: string; color: string }> = {
    approve_payout:   { label: "Approved Payout",    color: "#00e676" },
    execute_transfer: { label: "Executed Transfer",   color: "#60a5fa" },
    send_alert:       { label: "Sent Alert",          color: "#ff9800" },
    suspend_plan:     { label: "Suspended Plan",      color: "#ff5252" },
  };

  const pendingPayouts = payouts.filter(p => p.status === "Pending");
  const avgTrust = defaulters.length
    ? Math.round(defaulters.reduce((a, d) => a + d.trust_score, 0) / defaulters.length)
    : 100;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800;900&family=DM+Mono:wght@400;500&family=Outfit:wght@300;400;500;600;700&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --bg:        #040a06;
          --surface:   rgba(255,255,255,0.035);
          --border:    rgba(255,255,255,0.07);
          --red:       #ff4040;
          --green:     #00e676;
          --blue:      #60a5fa;
          --gold:      #f5c518;
          --amber:     #ff9800;
          --text:      #f0f0f0;
          --muted:     rgba(255,255,255,0.38);
          --radius-sm: 10px;
          --radius-md: 16px;
          --radius-lg: 22px;
          --font-ui:   'Outfit', sans-serif;
          --font-head: 'Syne', sans-serif;
          --font-mono: 'DM Mono', monospace;
          --header-h:  60px;
        }

        body { background: var(--bg); color: var(--text); font-family: var(--font-ui); }

        ::-webkit-scrollbar { width: 3px; height: 3px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,64,64,0.25); border-radius: 99px; }

        input::placeholder { color: var(--muted); }
        select option { background: #0d1a10; color: var(--text); }

        /* ── Animations ─────────────────────────────────── */
        @keyframes fadeUp   { from { opacity:0; transform:translateY(14px); } to { opacity:1; transform:translateY(0); } }
        @keyframes slideIn  { from { opacity:0; transform:translateX(50px); } to { opacity:1; transform:translateX(0); } }
        @keyframes pulse    { 0%,100% { opacity:1; } 50% { opacity:0.3; } }
        @keyframes spin     { to { transform: rotate(360deg); } }
        @keyframes shimmer  { from { background-position: -200% 0; } to { background-position: 200% 0; } }

        /* ── Layout ─────────────────────────────────────── */
        .admin-layout {
          min-height: 100vh;
          background:
            radial-gradient(ellipse 70% 40% at 50% -10%, rgba(20,80,30,0.35) 0%, transparent 60%),
            radial-gradient(ellipse 40% 30% at 90% 80%,  rgba(255,64,64,0.06) 0%, transparent 55%),
            var(--bg);
        }

        /* ── Header ─────────────────────────────────────── */
        .header {
          position: sticky; top: 0; z-index: 200;
          height: var(--header-h);
          backdrop-filter: blur(24px) saturate(1.6);
          background: rgba(4,10,6,0.82);
          border-bottom: 1px solid rgba(0,230,118,0.08);
          display: flex; align-items: center;
          padding: 0 24px;
        }
        .header-inner {
          max-width: 1080px; width: 100%; margin: 0 auto;
          display: flex; align-items: center; justify-content: space-between; gap: 16px;
        }
        .header-brand { display: flex; align-items: center; gap: 10px; }
        .header-brand-text { line-height: 1.15; }
        .header-brand-name {
          font-family: var(--font-head); font-size: 15px; font-weight: 800;
          background: linear-gradient(135deg, #e8f5e9, #a5d6a7);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent;
        }
        .header-brand-sub {
          font-size: 9px; letter-spacing: 2px; text-transform: uppercase;
          color: var(--red); font-weight: 700;
        }
        .header-right { display: flex; align-items: center; gap: 14px; }
        .header-status { display: flex; align-items: center; gap: 6px; }
        .status-dot {
          width: 7px; height: 7px; border-radius: 99px;
          background: var(--red); animation: pulse 2s infinite;
        }
        .status-label { font-size: 10px; color: var(--muted); letter-spacing: 0.5px; }
        .header-admin-name { font-size: 13px; font-weight: 600; color: rgba(255,255,255,0.7); }
        .logout-btn {
          background: rgba(255,64,64,0.08); border: 1px solid rgba(255,64,64,0.22);
          color: var(--red); border-radius: var(--radius-sm);
          padding: 6px 14px; font-size: 11px; font-weight: 700;
          cursor: pointer; font-family: var(--font-ui); transition: all 0.2s;
        }
        .logout-btn:hover { background: rgba(255,64,64,0.15); }

        /* ── Content ─────────────────────────────────────── */
        .content { max-width: 1080px; margin: 0 auto; padding: 24px 16px 80px; }

        /* ── Tab Nav ─────────────────────────────────────── */
        .tab-nav {
          display: flex; gap: 3px; overflow-x: auto;
          background: rgba(255,255,255,0.025);
          border: 1px solid var(--border); border-radius: var(--radius-md);
          padding: 4px; margin-bottom: 28px;
        }
        .tab-nav::-webkit-scrollbar { height: 0; }
        .tab-btn {
          flex: 1; min-width: max-content;
          background: transparent; border: 1px solid transparent;
          color: var(--muted); border-radius: 12px;
          padding: 9px 16px; font-size: 12px; font-weight: 700;
          cursor: pointer; font-family: var(--font-ui); transition: all 0.2s;
          white-space: nowrap;
        }
        .tab-btn:hover { color: rgba(255,255,255,0.6); background: rgba(255,255,255,0.04); }
        .tab-btn.active {
          background: rgba(0,230,118,0.1); color: var(--green);
          border-color: rgba(0,230,118,0.22);
        }

        /* ── Section animation ───────────────────────────── */
        .section { animation: fadeUp 0.35s ease; }

        /* ── Card ────────────────────────────────────────── */
        .gg-card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          backdrop-filter: blur(20px);
          padding: 22px;
          box-shadow: 0 8px 40px rgba(0,0,0,0.35);
        }

        /* ── Stat Card ───────────────────────────────────── */
        .stat-card {
          flex: 1; min-width: 130px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          padding: 20px 18px 18px;
          position: relative; overflow: hidden;
          display: flex; gap: 14px; align-items: flex-start;
          box-shadow: 0 4px 24px rgba(0,0,0,0.3);
          transition: border-color 0.2s, transform 0.2s;
        }
        .stat-card:hover { transform: translateY(-2px); border-color: color-mix(in srgb, var(--accent) 30%, transparent); }
        .stat-glow {
          position: absolute; bottom: -20px; right: -20px;
          width: 80px; height: 80px; border-radius: 99px;
          background: var(--accent, #fff);
          opacity: 0.06; filter: blur(24px); pointer-events: none;
        }
        .stat-icon { font-size: 22px; line-height: 1; margin-top: 2px; }
        .stat-label {
          font-size: 9px; text-transform: uppercase; letter-spacing: 1.4px;
          color: var(--muted); margin-bottom: 6px; font-weight: 600;
        }
        .stat-value { font-size: 22px; font-weight: 800; color: #fff; line-height: 1; font-family: var(--font-head); }
        .stat-sub { font-size: 11px; color: var(--accent, var(--muted)); margin-top: 4px; font-weight: 600; }

        /* ── Badge ───────────────────────────────────────── */
        .badge {
          display: inline-block; border-radius: 99px;
          padding: 3px 10px; font-size: 10px; font-weight: 700;
          white-space: nowrap; border: 1px solid;
        }
        .badge-success { background: rgba(0,230,118,0.1);  color: #00e676; border-color: rgba(0,230,118,0.25); }
        .badge-danger  { background: rgba(255,64,64,0.1);  color: #ff5252; border-color: rgba(255,64,64,0.25); }
        .badge-warning { background: rgba(255,152,0,0.1);  color: #ff9800; border-color: rgba(255,152,0,0.25); }
        .badge-info    { background: rgba(96,165,250,0.1); color: #60a5fa; border-color: rgba(96,165,250,0.25); }
        .badge-neutral { background: rgba(255,255,255,0.06); color: var(--muted); border-color: var(--border); }

        /* ── Avatar ──────────────────────────────────────── */
        .avatar {
          width: 40px; height: 40px; border-radius: 12px; flex-shrink: 0;
          background: linear-gradient(135deg, rgba(0,230,118,0.15), rgba(0,230,118,0.05));
          border: 1px solid rgba(0,230,118,0.2);
          display: flex; align-items: center; justify-content: center;
          font-size: 13px; font-weight: 800; color: var(--green);
          font-family: var(--font-head);
        }

        /* ── Buttons ─────────────────────────────────────── */
        .btn {
          display: inline-flex; align-items: center; justify-content: center; gap: 6px;
          border-radius: var(--radius-sm); font-weight: 700; cursor: pointer;
          font-family: var(--font-ui); transition: all 0.18s; white-space: nowrap;
          border: 1px solid;
        }
        .btn:disabled { opacity: 0.45; cursor: not-allowed; }
        .btn-sm  { padding: 6px 12px; font-size: 11px; }
        .btn-md  { padding: 8px 16px; font-size: 12px; }

        .btn-success { background: rgba(0,230,118,0.1);  color: #00e676; border-color: rgba(0,230,118,0.25); }
        .btn-success:hover:not(:disabled) { background: rgba(0,230,118,0.18); }
        .btn-danger  { background: rgba(255,64,64,0.1);  color: #ff5252; border-color: rgba(255,64,64,0.25); }
        .btn-danger:hover:not(:disabled)  { background: rgba(255,64,64,0.18); }
        .btn-info    { background: rgba(96,165,250,0.1); color: #60a5fa; border-color: rgba(96,165,250,0.25); }
        .btn-info:hover:not(:disabled)    { background: rgba(96,165,250,0.18); }
        .btn-warning { background: rgba(255,152,0,0.1);  color: #ff9800; border-color: rgba(255,152,0,0.25); }
        .btn-warning:hover:not(:disabled) { background: rgba(255,152,0,0.18); }
        .btn-ghost   { background: rgba(255,255,255,0.05); color: rgba(255,255,255,0.6); border-color: var(--border); }
        .btn-ghost:hover:not(:disabled)   { background: rgba(255,255,255,0.09); }

        /* ── Spinner ─────────────────────────────────────── */
        .spinner {
          width: 12px; height: 12px; border-radius: 99px;
          border: 2px solid currentColor; border-top-color: transparent;
          animation: spin 0.7s linear infinite; display: inline-block;
        }

        /* ── Trust bar ───────────────────────────────────── */
        .trust-bar-wrap {
          height: 3px; border-radius: 99px; background: rgba(255,255,255,0.07);
          overflow: hidden; margin-top: 6px;
        }
        .trust-bar-fill { height: 100%; border-radius: 99px; transition: width 0.4s ease; }

        /* ── Divider rows ────────────────────────────────── */
        .row-divider { border-bottom: 1px solid rgba(255,255,255,0.04); }

        /* ── Input ───────────────────────────────────────── */
        .gg-input {
          background: rgba(255,255,255,0.05); border: 1px solid var(--border);
          border-radius: var(--radius-sm); padding: 10px 14px;
          color: var(--text); font-size: 13px; outline: none;
          font-family: var(--font-ui); transition: border-color 0.2s;
        }
        .gg-input:focus { border-color: rgba(0,230,118,0.3); }

        /* ── Table ───────────────────────────────────────── */
        .gg-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .gg-table th {
          text-align: left; padding: 12px 16px;
          font-size: 9px; text-transform: uppercase; letter-spacing: 1.2px;
          color: var(--muted); font-weight: 600;
          border-bottom: 1px solid rgba(255,255,255,0.06); white-space: nowrap;
        }
        .gg-table td {
          padding: 13px 16px; border-bottom: 1px solid rgba(255,255,255,0.04);
          vertical-align: middle;
        }
        .gg-table tr:last-child td { border-bottom: none; }
        .gg-table tr:hover td { background: rgba(255,255,255,0.018); }

        /* ── Toast ───────────────────────────────────────── */
        .toast-wrap {
          position: fixed; top: 20px; right: 20px; z-index: 9999;
          display: flex; flex-direction: column; gap: 8px; pointer-events: none;
        }
        .toast {
          background: rgba(8,18,10,0.96); border: 1px solid rgba(0,230,118,0.15);
          border-radius: var(--radius-md); padding: 12px 18px;
          font-size: 13px; animation: slideIn 0.3s ease;
          backdrop-filter: blur(16px); max-width: 280px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.6);
        }

        /* ── Quick action cards ──────────────────────────── */
        .quick-action {
          flex: 1; min-width: 140px;
          background: rgba(255,255,255,0.025); border: 1px solid var(--border);
          border-radius: var(--radius-md); padding: 16px; cursor: pointer;
          font-family: var(--font-ui); transition: all 0.2s; text-align: left;
        }
        .quick-action:hover { transform: translateY(-2px); border-color: var(--qa-color, var(--border)); background: rgba(255,255,255,0.045); }
        .quick-action-icon { font-size: 22px; margin-bottom: 8px; }
        .quick-action-label { font-size: 12px; font-weight: 700; }

        /* ── Section header ──────────────────────────────── */
        .section-title { font-family: var(--font-head); font-size: 19px; font-weight: 800; }
        .section-desc  { font-size: 12px; color: var(--muted); margin-top: 4px; line-height: 1.6; }

        /* ── Filter pills ────────────────────────────────── */
        .filter-pill {
          background: rgba(255,255,255,0.04); border: 1px solid var(--border);
          color: var(--muted); border-radius: 8px; padding: 6px 12px;
          font-size: 11px; font-weight: 700; cursor: pointer; font-family: var(--font-ui);
          transition: all 0.18s;
        }
        .filter-pill.active {
          background: rgba(255,64,64,0.12); color: var(--red);
          border-color: rgba(255,64,64,0.28);
        }

        /* ── Payout card ─────────────────────────────────── */
        .payout-row { padding: 18px 0; }
        .payout-row:not(:last-child) { border-bottom: 1px solid rgba(255,255,255,0.05); }
        .payout-meta { font-size: 11px; color: var(--muted); margin-top: 4px; font-family: var(--font-mono); }

        /* ── Audit log ───────────────────────────────────── */
        .audit-dot {
          width: 8px; height: 8px; border-radius: 99px; flex-shrink: 0;
          margin-top: 4px;
        }
        .audit-action { font-size: 13px; font-weight: 700; }
        .audit-target { font-size: 12px; color: var(--muted); margin-top: 2px; }
        .audit-time   { font-size: 11px; color: rgba(255,255,255,0.25); margin-top: 2px; font-family: var(--font-mono); }

        /* ── Empty state ─────────────────────────────────── */
        .empty-state { text-align: center; padding: 40px 0; }
        .empty-state-emoji { font-size: 36px; margin-bottom: 10px; }
        .empty-state-title { font-size: 15px; font-weight: 700; margin-bottom: 4px; }
        .empty-state-desc  { font-size: 12px; color: var(--muted); }

        /* ── Responsive ──────────────────────────────────── */
        @media (max-width: 600px) {
          .stat-value { font-size: 18px; }
          .header { padding: 0 14px; }
          .content { padding: 16px 12px 80px; }
          .gg-card { padding: 16px; border-radius: var(--radius-md); }
        }
      `}</style>

      <div className="admin-layout">

        {/* ── Toasts ── */}
        <div className="toast-wrap">
          {toasts.map(t => (
            <div key={t.id} className="toast">{t.msg}</div>
          ))}
        </div>

        {/* ── Header ── */}
        <header className="header">
          <div className="header-inner">
            <div className="header-brand">
              <GGLogo size={38}/>
              <div className="header-brand-text">
                <div className="header-brand-name">God's Grace</div>
                <div className="header-brand-sub">Admin Control Panel</div>
              </div>
            </div>
            <div className="header-right">
              <div className="header-status">
                <div className="status-dot"/>
                <span className="status-label">Live</span>
              </div>
              <span className="header-admin-name">{adminName.split(" ")[0]}</span>
              <button className="logout-btn" onClick={handleLogout}>Logout</button>
            </div>
          </div>
        </header>

        {/* ── Main ── */}
        <main className="content">

          {/* Tab nav */}
          <nav className="tab-nav">
            {TABS.map(t => (
              <button key={t} className={`tab-btn${tab === t ? " active" : ""}`} onClick={() => setTab(t)}>
                {t}
              </button>
            ))}
          </nav>

          {/* ══════════════════ OVERVIEW ══════════════════ */}
          {tab === "Overview" && (
            <div className="section" style={{ display: "flex", flexDirection: "column", gap: 22 }}>
              <div>
                <div className="section-title">Good day, {adminName.split(" ")[0]} 👑</div>
                <div className="section-desc">
                  {new Date().toLocaleDateString("en-NG", { weekday: "long", month: "long", day: "numeric" })}
                  &nbsp;· Platform at a glance
                </div>
              </div>

              {/* Stats */}
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <StatCard label="Total Float"    value={fmt(MOCK_ADMIN_STATS.total_float)}             sub="In escrow"          icon="🏦" accent="#60a5fa"/>
                <StatCard label="Members"        value={MOCK_ADMIN_STATS.total_users}                  sub="Registered"         icon="👥" accent="#00e676"/>
                <StatCard label="Active Plans"   value={MOCK_ADMIN_STATS.active_plans}                 sub="Contributing"       icon="📈" accent="#00e676"/>
                <StatCard label="Defaulters"     value={MOCK_ADMIN_STATS.defaulter_count}              sub="3+ days missed"     icon="⚠️" accent="#ff5252"/>
                <StatCard label="Payouts Today"  value={fmt(MOCK_ADMIN_STATS.payouts_today_amount)}    sub={`${MOCK_ADMIN_STATS.payouts_today} transfers`} icon="📤" accent="#ff9800"/>
              </div>

              {/* Quick actions */}
              <Card>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)", marginBottom: 14, textTransform: "uppercase", letterSpacing: 1 }}>Quick Actions</div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {[
                    { label: "Pending Payouts", t: "Payouts",    icon: "💸", color: "#60a5fa" },
                    { label: "Defaulters",      t: "Defaulters", icon: "⚠️", color: "#ff5252" },
                    { label: "All Members",     t: "All Members",icon: "👥", color: "#00e676" },
                    { label: "Audit Log",       t: "Audit Log",  icon: "📋", color: "#ff9800" },
                  ].map(({ label, t, icon, color }) => (
                    <button
                      key={t} className="quick-action"
                      style={{ "--qa-color": color } as React.CSSProperties}
                      onClick={() => setTab(t)}
                    >
                      <div className="quick-action-icon">{icon}</div>
                      <div className="quick-action-label" style={{ color }}>{label}</div>
                    </button>
                  ))}
                </div>
              </Card>

              {/* Pending payouts preview */}
              <Card>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>Pending Payouts</div>
                  <button onClick={() => setTab("Payouts")} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "var(--red)", fontFamily: "var(--font-ui)", fontWeight: 700 }}>
                    View all →
                  </button>
                </div>
                {pendingPayouts.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-state-emoji">🎉</div>
                    <div className="empty-state-desc">No pending payouts</div>
                  </div>
                ) : pendingPayouts.slice(0, 3).map(p => (
                  <div key={p.id} className="row-divider" style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", flexWrap: "wrap" }}>
                    <Avatar name={p.user.full_name}/>
                    <div style={{ flex: 1, minWidth: 100 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{p.user.full_name}</div>
                      <div className="payout-meta">{p.dest_bank} · {p.dest_account}</div>
                    </div>
                    <div style={{ fontWeight: 800, color: "#fff", fontSize: 15, fontFamily: "var(--font-head)" }}>{fmt(p.amount)}</div>
                    <Badge status={p.status}/>
                  </div>
                ))}
              </Card>
            </div>
          )}

          {/* ══════════════════ PAYOUTS ══════════════════ */}
          {tab === "Payouts" && (
            <div className="section" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
                <div className="section-title">Payout Queue</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {["All", "Pending", "Approved", "Completed", "Rejected"].map(s => (
                    <button key={s} className={`filter-pill${filterStatus === s ? " active" : ""}`} onClick={() => setFilterStatus(s)}>{s}</button>
                  ))}
                </div>
              </div>

              <Card style={{ padding: 0 }}>
                <div style={{ padding: "0 22px" }}>
                  {filteredPayouts.length === 0 ? (
                    <div className="empty-state">
                      <div className="empty-state-emoji">📭</div>
                      <div className="empty-state-desc">No payouts with this status</div>
                    </div>
                  ) : filteredPayouts.map(p => (
                    <div key={p.id} className="payout-row">
                      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
                        <Avatar name={p.user.full_name}/>
                        <div style={{ flex: 1, minWidth: 120 }}>
                          <div style={{ fontSize: 14, fontWeight: 700 }}>{p.user.full_name}</div>
                          <div className="payout-meta">{p.user.email} · {p.user.phone}</div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 17, fontWeight: 800, fontFamily: "var(--font-head)" }}>{fmt(p.amount)}</div>
                          <div className="payout-meta" style={{ textAlign: "right" }}>
                            {new Date(p.requested_at).toLocaleDateString("en-NG", { day: "2-digit", month: "short" })}
                          </div>
                        </div>
                        <Badge status={p.status}/>
                      </div>
                      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                        <div className="payout-meta">
                          🏦 {p.dest_bank} · <span style={{ fontFamily: "var(--font-mono)" }}>{p.dest_account}</span>
                          &nbsp;· OTP: {p.otp_verified ? "✓ Verified" : "✗ Unverified"}
                        </div>
                        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                          {p.status === "Pending" && (
                            <>
                              <Btn label="✓ Approve"  variant="success" size="sm" onClick={() => approvePayout(p.id)}      loading={loading[p.id]}/>
                              <Btn label="✗ Reject"   variant="danger"  size="sm" onClick={() => rejectPayout(p.id)}       loading={loading[`rej_${p.id}`]}/>
                            </>
                          )}
                          {p.status === "Approved" && (
                            <Btn label="💸 Execute Transfer" variant="info" size="sm" onClick={() => executePayout(p.id)} loading={loading[`exec_${p.id}`]}/>
                          )}
                          {p.status === "Completed" && <span style={{ fontSize: 12, color: "var(--muted)" }}>Settled ✓</span>}
                          {p.status === "Rejected"  && <span style={{ fontSize: 12, color: "rgba(255,82,82,0.5)" }}>Rejected ✗</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          )}

          {/* ══════════════════ DEFAULTERS ══════════════════ */}
          {tab === "Defaulters" && (
            <div className="section" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <div className="section-title">Defaulter Management</div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <StatCard label="Total Defaulters" value={defaulters.length}  sub="3+ days missed"   icon="⚠️" accent="#ff5252"/>
                <StatCard label="Avg Trust Score"  value={`${avgTrust}/100`}  sub="Among defaulters" icon="📉" accent="#ff9800"/>
              </div>
              <Card>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>Active Defaulters</div>
                  <Badge status={`${defaulters.length} member${defaulters.length !== 1 ? "s" : ""}`}/>
                </div>
                {defaulters.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-state-emoji">🎉</div>
                    <div className="empty-state-title">No defaulters!</div>
                    <div className="empty-state-desc">All members are contributing on time.</div>
                  </div>
                ) : defaulters.map(d => (
                  <div key={d.id} className="row-divider" style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 0", flexWrap: "wrap" }}>
                    <div style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0, background: "rgba(255,82,82,0.08)", border: "1px solid rgba(255,82,82,0.18)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>
                      {d.days_missed >= 5 ? "🔴" : d.days_missed >= 4 ? "🟠" : "🟡"}
                    </div>
                    <div style={{ flex: 1, minWidth: 120 }}>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>{d.full_name}</div>
                      <div className="payout-meta">{d.days_missed} days missed · Trust: {d.trust_score}/100 · {d.phone}</div>
                      <TrustBar score={d.trust_score}/>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <Btn label="📲 Alert"   variant="warning" size="sm" onClick={() => sendAlert(d.id, d.full_name)} loading={loading[`alert_${d.id}`]}/>
                      <Btn label="⛔ Suspend" variant="danger"  size="sm" onClick={() => suspendUser(d.id)}            loading={loading[`sus_${d.id}`]}/>
                    </div>
                  </div>
                ))}
              </Card>
            </div>
          )}

          {/* ══════════════════ ALL MEMBERS ══════════════════ */}
          {tab === "All Members" && (
            <div className="section" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
                <div>
                  <div className="section-title">All Members</div>
                  <div className="section-desc">{users.length} registered</div>
                </div>
                <input
                  className="gg-input"
                  style={{ width: 240 }}
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search name or email…"
                />
              </div>

              <Card style={{ padding: 0 }}>
                <div style={{ overflowX: "auto" }}>
                  <table className="gg-table">
                    <thead>
                      <tr>
                        {["Member", "Plan", "Saved", "Streak", "Trust", "Status", ""].map(h => (
                          <th key={h}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUsers.map(u => (
                        <tr key={u.id}>
                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <Avatar name={u.full_name}/>
                              <div>
                                <div style={{ fontWeight: 700, fontSize: 13 }}>{u.full_name}</div>
                                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 1 }}>{u.email}</div>
                              </div>
                            </div>
                          </td>
                          <td>
                            <div style={{ fontSize: 13 }}>{u.plan_type}</div>
                            <div style={{ fontSize: 11, color: "var(--blue)", marginTop: 1 }}>{fmt(u.fixed_amount)}/day</div>
                          </td>
                          <td style={{ fontWeight: 700, color: "var(--green)", fontFamily: "var(--font-head)" }}>{fmt(u.total_saved)}</td>
                          <td style={{ color: "var(--amber)", fontWeight: 700 }}>🔥 {u.contribution_streak}d</td>
                          <td>
                            <div style={{ fontSize: 13, fontWeight: 700, color: u.trust_score >= 80 ? "var(--green)" : u.trust_score >= 50 ? "var(--amber)" : "var(--red)" }}>
                              {u.trust_score}/100
                            </div>
                            <TrustBar score={u.trust_score}/>
                          </td>
                          <td><Badge status={u.status}/></td>
                          <td>
                            {u.status === "Active"    && <Btn label="Suspend" variant="danger"  size="sm" onClick={() => suspendUser(u.id)} loading={loading[`sus_${u.id}`]}/>}
                            {u.status === "Suspended" && <Btn label="Restore" variant="success" size="sm" onClick={() => restoreUser(u.id)} loading={loading[`res_${u.id}`]}/>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filteredUsers.length === 0 && (
                    <div className="empty-state"><div className="empty-state-desc">No members match your search.</div></div>
                  )}
                </div>
              </Card>
            </div>
          )}

          {/* ══════════════════ AUDIT LOG ══════════════════ */}
          {tab === "Audit Log" && (
            <div className="section">
              <div className="section-title" style={{ marginBottom: 4 }}>Audit Log</div>
              <div className="section-desc" style={{ marginBottom: 20 }}>All admin actions are recorded here for transparency.</div>
              <Card>
                {auditLog.map((a, i) => {
                  const meta = auditMeta[a.action] ?? { label: a.action, color: "#fff" };
                  return (
                    <div key={i} style={{ display: "flex", gap: 14, padding: "14px 0", borderBottom: i < auditLog.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none", alignItems: "flex-start" }}>
                      <div className="audit-dot" style={{ background: meta.color, boxShadow: `0 0 8px ${meta.color}88` }}/>
                      <div style={{ flex: 1 }}>
                        <div className="audit-action" style={{ color: meta.color }}>{meta.label}</div>
                        <div className="audit-target">— {a.target}</div>
                        <div className="audit-time">by {a.admin} · {a.time}</div>
                      </div>
                    </div>
                  );
                })}
              </Card>
            </div>
          )} {tab === "Settings" && (
  <div className="sec">
    <AdminSettings adminId={adminId} onToast={(msg) => push(msg)}/>
  </div>
)}

        </main>
      </div>
    </>
  );
}