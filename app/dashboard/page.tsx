"use client";
import { createClient } from "@/lib/supabase/client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

// ── HELPERS ───────────────────────────────────────────────────────────────────
const fmt  = (n: number) => "₦" + (n / 100).toLocaleString("en-NG");
const pct  = (a: number, b: number) => (b === 0 ? 0 : Math.round((a / b) * 100));

const NIGERIAN_BANKS = [
  { name: "GTBank",      code: "058"    },
  { name: "Zenith Bank", code: "057"    },
  { name: "First Bank",  code: "011"    },
  { name: "UBA",         code: "033"    },
  { name: "Access Bank", code: "044"    },
  { name: "Wema Bank",   code: "035"    },
  { name: "Kuda Bank",   code: "090267" },
  { name: "Opay",        code: "100004" },
  { name: "Palmpay",     code: "100033" },
  { name: "Moniepoint",  code: "50515"  },
];

// ── SHARED UI ─────────────────────────────────────────────────────────────────
function Card({ children, style = {}, glow }: any) {
  return (
    <div style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.09)", borderRadius:20, backdropFilter:"blur(24px)", padding:24, boxShadow: glow ? `0 0 40px ${glow}22,0 8px 32px rgba(0,0,0,0.4)` : "0 8px 32px rgba(0,0,0,0.4)", ...style }}>
      {children}
    </div>
  );
}

function StatCard({ label, value, sub, color="#007BFF", icon }: any) {
  return (
    <Card style={{ flex:1, minWidth:130 }} glow={color}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
        <div>
          <div style={{ fontSize:11, color:"rgba(255,255,255,0.4)", textTransform:"uppercase" as const, letterSpacing:1.2, marginBottom:8 }}>{label}</div>
          <div style={{ fontSize:24, fontWeight:800, color:"#fff", lineHeight:1 }}>{value}</div>
          {sub && <div style={{ fontSize:11, color, marginTop:5, fontWeight:600 }}>{sub}</div>}
        </div>
        <div style={{ fontSize:20 }}>{icon}</div>
      </div>
    </Card>
  );
}

function Badge({ status }: { status: string }) {
  const map: any = {
    Success:   { bg:"#00e67622", color:"#00e676" },
    Failed:    { bg:"#ff525222", color:"#ff5252" },
    Credit:    { bg:"#007BFF22", color:"#007BFF" },
    Debit:     { bg:"#ff980022", color:"#ff9800" },
    Pending:   { bg:"#ff980022", color:"#ff9800" },
    Completed: { bg:"#00e67622", color:"#00e676" },
    Active:    { bg:"#00e67622", color:"#00e676" },
    Approved:  { bg:"#007BFF22", color:"#007BFF" },
    Rejected:  { bg:"#ff525222", color:"#ff5252" },
  };
  const s = map[status] || { bg:"#ffffff11", color:"#ffffff88" };
  return <span style={{ background:s.bg, color:s.color, border:`1px solid ${s.color}44`, borderRadius:99, padding:"3px 10px", fontSize:11, fontWeight:700 }}>{status}</span>;
}

function TrustBar({ score }: { score: number }) {
  const [w, setW] = useState(0);
  useEffect(() => { const t = setTimeout(() => setW(score), 400); return () => clearTimeout(t); }, [score]);
  const color = score >= 80 ? "#00e676" : score >= 50 ? "#007BFF" : "#ff5252";
  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
        <span style={{ fontSize:11, color:"rgba(255,255,255,0.45)", textTransform:"uppercase" as const, letterSpacing:1 }}>Trust Score</span>
        <span style={{ fontSize:13, fontWeight:700, color }}>{score}/100</span>
      </div>
      <div style={{ height:6, borderRadius:99, background:"rgba(255,255,255,0.08)", overflow:"hidden" }}>
        <div style={{ height:"100%", width:`${w}%`, background:`linear-gradient(90deg,${color}88,${color})`, borderRadius:99, transition:"width 1.4s cubic-bezier(0.4,0,0.2,1)", boxShadow:`0 0 10px ${color}66` }}/>
      </div>
    </div>
  );
}

function CircularProgress({ value, max, size=140, stroke=10, label, sublabel, color="#007BFF" }: any) {
  const r    = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const [animated, setAnimated] = useState(circ);
  useEffect(() => { const t = setTimeout(() => setAnimated(max > 0 ? circ - (value / max) * circ : circ), 300); return () => clearTimeout(t); }, [value, max]);
  return (
    <div style={{ position:"relative", width:size, height:size, flexShrink:0 }}>
      <svg width={size} height={size} style={{ transform:"rotate(-90deg)" }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={stroke}/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeDasharray={circ} strokeDashoffset={animated} strokeLinecap="round" style={{ transition:"stroke-dashoffset 1.2s cubic-bezier(0.4,0,0.2,1)", filter:`drop-shadow(0 0 8px ${color}88)` }}/>
      </svg>
      <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center" }}>
        <span style={{ fontSize:24, fontWeight:800, color:"#fff", lineHeight:1 }}>{value}</span>
        <span style={{ fontSize:10, color:"rgba(255,255,255,0.5)", textTransform:"uppercase" as const, letterSpacing:1 }}>{label}</span>
        {sublabel && <span style={{ fontSize:10, color, fontWeight:600 }}>{sublabel}</span>}
      </div>
    </div>
  );
}

// ── WITHDRAWAL MODAL ──────────────────────────────────────────────────────────
function WithdrawalModal({ balance, userId, onClose, onSuccess }: any) {
  const supabase = createClient();
  const [step, setStep]             = useState(1);
  const [amount, setAmount]         = useState("");
  const [bankCode, setBankCode]     = useState("");
  const [acct, setAcct]             = useState("");
  const [otp, setOtp]               = useState("");
  const [resolvedName, setResolved] = useState("");
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState("");
  const bankName = NIGERIAN_BANKS.find(b => b.code === bankCode)?.name ?? "";

  async function handleResolve() {
    setError("");
    if (!amount || !bankCode || !acct) { setError("Fill all fields"); return; }
    if (Number(amount) < 1000)          { setError("Minimum withdrawal is ₦1,000"); return; }
    if (Number(amount) * 100 > balance) { setError("Insufficient balance"); return; }
    if (acct.length !== 10)             { setError("Account number must be 10 digits"); return; }
    setLoading(true);
    // TODO: call Paystack resolve account API here
    // For now we simulate — replace with real API call
    await new Promise(r => setTimeout(r, 1400));
    setResolved("Account Holder Name"); // replace with API response
    setLoading(false);
    setStep(2);
  }

  async function handleOtpVerify() {
    setError("");
    if (otp.length < 6) { setError("Enter the 6-digit OTP"); return; }
    setLoading(true);

    // Verify OTP against otp_codes table
    const { data: otpRow, error: otpError } = await supabase
      .from("otp_codes")
      .select("id, used, expires_at")
      .eq("user_id", userId)
      .eq("code", otp)
      .eq("purpose", "withdrawal")
      .eq("used", false)
      .gt("expires_at", new Date().toISOString())
      .single();

    if (otpError || !otpRow) {
      setError("Invalid or expired OTP. Please request a new one.");
      setLoading(false);
      return;
    }

    // Mark OTP used
    await supabase.from("otp_codes").update({ used: true }).eq("id", otpRow.id);

    // Insert withdrawal request
    const { error: insertError } = await supabase
      .from("withdrawal_requests")
      .insert({
        user_id:      userId,
        amount:       Number(amount) * 100,
        dest_bank:    bankName,
        dest_account: acct,
        dest_name:    resolvedName,
        otp_verified: true,
        status:       "Pending",
      });

    if (insertError) {
      setError("Failed to submit request. Please try again.");
      setLoading(false);
      return;
    }

    setLoading(false);
    setStep(3);
    onSuccess?.();
  }

  const inputStyle: React.CSSProperties = { width:"100%", background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:12, padding:"13px 16px", color:"#fff", fontSize:14, outline:"none", fontFamily:"inherit", boxSizing:"border-box" };
  const labelStyle: React.CSSProperties = { fontSize:11, color:"rgba(255,255,255,0.4)", letterSpacing:1, textTransform:"uppercase", display:"block", marginBottom:8 };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.8)", backdropFilter:"blur(8px)", zIndex:999, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
      <Card style={{ width:"100%", maxWidth:420 }} glow="#007BFF">
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:24 }}>
          <div>
            <div style={{ fontSize:18, fontWeight:800, color:"#fff" }}>Withdraw Funds</div>
            <div style={{ fontSize:12, color:"rgba(255,255,255,0.4)", marginTop:2 }}>Step {step === 3 ? "✓" : step} of 3</div>
          </div>
          <button onClick={onClose} style={{ background:"rgba(255,255,255,0.07)", border:"none", color:"#fff", borderRadius:99, width:32, height:32, cursor:"pointer", fontSize:16 }}>✕</button>
        </div>

        {error && <div style={{ background:"rgba(255,82,82,0.1)", border:"1px solid rgba(255,82,82,0.3)", borderRadius:10, padding:"10px 14px", marginBottom:14, fontSize:13, color:"#ff5252" }}>⚠ {error}</div>}

        {step === 1 && (
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            <div><label style={labelStyle}>Amount (₦)</label><input value={amount} onChange={e => setAmount(e.target.value)} type="number" placeholder="e.g. 20000" style={inputStyle}/></div>
            <div>
              <label style={labelStyle}>Bank</label>
              <select value={bankCode} onChange={e => setBankCode(e.target.value)} style={{ ...inputStyle, background:"#0a0a1a", cursor:"pointer" }}>
                <option value="">Select bank…</option>
                {NIGERIAN_BANKS.map(b => <option key={b.code} value={b.code}>{b.name}</option>)}
              </select>
            </div>
            <div><label style={labelStyle}>Account Number</label><input value={acct} onChange={e => setAcct(e.target.value)} placeholder="10-digit account number" maxLength={10} style={inputStyle}/></div>
            <button onClick={handleResolve} disabled={loading} style={{ background: loading ? "rgba(255,255,255,0.06)" : "linear-gradient(135deg,#007BFF,#0040ff)", color: loading ? "rgba(255,255,255,0.3)" : "#fff", border:"none", borderRadius:12, padding:13, fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>
              {loading ? "Resolving…" : "Verify Account →"}
            </button>
          </div>
        )}

        {step === 2 && (
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            <div style={{ background:"#00e67611", border:"1px solid #00e67644", borderRadius:12, padding:14 }}>
              <div style={{ fontSize:11, color:"rgba(255,255,255,0.5)", marginBottom:4 }}>Account Verified ✓</div>
              <div style={{ fontSize:16, fontWeight:700, color:"#00e676" }}>{resolvedName}</div>
              <div style={{ fontSize:11, color:"rgba(255,255,255,0.4)", marginTop:4 }}>{bankName} · {acct}</div>
            </div>
            <div style={{ fontSize:13, color:"rgba(255,255,255,0.5)", lineHeight:1.6 }}>
              Enter the OTP sent to your phone to confirm withdrawal of{" "}
              <strong style={{ color:"#fff" }}>₦{Number(amount).toLocaleString("en-NG")}</strong>.
            </div>
            <div><label style={labelStyle}>OTP Code</label><input value={otp} onChange={e => setOtp(e.target.value)} placeholder="6-digit OTP" maxLength={6} style={{ ...inputStyle, letterSpacing:6, textAlign:"center", fontSize:18 }}/></div>
            <button onClick={handleOtpVerify} disabled={loading || otp.length < 6} style={{ background: loading || otp.length < 6 ? "rgba(255,255,255,0.06)" : "linear-gradient(135deg,#007BFF,#0040ff)", color: loading || otp.length < 6 ? "rgba(255,255,255,0.3)" : "#fff", border:"none", borderRadius:12, padding:13, fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>
              {loading ? "Verifying…" : "Confirm Withdrawal →"}
            </button>
          </div>
        )}

        {step === 3 && (
          <div style={{ display:"flex", flexDirection:"column", gap:16, textAlign:"center" as const }}>
            <div style={{ fontSize:48, marginTop:8 }}>⏳</div>
            <div style={{ fontSize:16, fontWeight:800, color:"#fff" }}>Request Submitted!</div>
            <div style={{ fontSize:13, color:"rgba(255,255,255,0.45)", lineHeight:1.7 }}>
              Your ₦{Number(amount).toLocaleString("en-NG")} withdrawal is pending 24-hour admin review.
            </div>
            <button onClick={onClose} style={{ background:"linear-gradient(135deg,#00e676,#00b85a)", color:"#000", border:"none", borderRadius:12, padding:13, fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>Done ✓</button>
          </div>
        )}
      </Card>
    </div>
  );
}

// ── MAIN DASHBOARD ────────────────────────────────────────────────────────────
export default function UserDashboard() {
  const router   = useRouter();
  const supabase = createClient();

  const [tab,          setTab]          = useState("Dashboard");
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [loading,      setLoading]      = useState(true);

  // Data state
  const [profile,        setProfile]        = useState<any>(null);
  const [plan,           setPlan]           = useState<any>(null);
  const [virtualAccount, setVirtualAccount] = useState<any>(null);
  const [transactions,   setTransactions]   = useState<any[]>([]);
  const [payouts,        setPayouts]        = useState<any[]>([]);

  // ── Load all data on mount ──────────────────────────────────────────────────
  useEffect(() => {
    async function loadDashboard() {
      // 1. Check session
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }

      // 2. Load profile
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (profileError || !profileData) { router.push("/login"); return; }
      if (profileData.is_admin)         { router.push("/admin"); return; }
      setProfile(profileData);

      // 3. Load active savings plan
      const { data: planData } = await supabase
        .from("savings_plans")
        .select("*")
        .eq("user_id", user.id)
        .eq("status", "Active")
        .single();
      setPlan(planData ?? null);

      // 4. Load virtual account
      const { data: vaData } = await supabase
        .from("virtual_accounts")
        .select("*")
        .eq("user_id", user.id)
        .single();
      setVirtualAccount(vaData ?? null);

      // 5. Load last 30 transactions
      const { data: txData } = await supabase
        .from("transactions")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(30);
      setTransactions(txData ?? []);

      // 6. Load withdrawal requests
      const { data: payoutData } = await supabase
        .from("withdrawal_requests")
        .select("*")
        .eq("user_id", user.id)
        .order("requested_at", { ascending: false });
      setPayouts(payoutData ?? []);

      setLoading(false);
    }

    loadDashboard();
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  // Reload payouts after successful withdrawal submission
  async function handleWithdrawalSuccess() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("withdrawal_requests")
      .select("*")
      .eq("user_id", user.id)
      .order("requested_at", { ascending: false });
    setPayouts(data ?? []);
  }

  // ── Loading screen ──────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ minHeight:"100vh", background:"#000", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontFamily:"Outfit,sans-serif" }}>
      <div style={{ textAlign:"center" }}>
        <div style={{ fontSize:32, marginBottom:12 }}>✦</div>
        <div style={{ color:"rgba(255,255,255,0.4)" }}>Loading your dashboard…</div>
      </div>
    </div>
  );

  // ── Computed values ─────────────────────────────────────────────────────────
  const now          = new Date();
  const daysInMonth  = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const successCredits = transactions.filter((t: any) => t.type === "Credit" && t.status === "Success");
  const daysContributed = new Set(successCredits.map((t: any) => new Date(t.created_at).toDateString())).size;
  const dailyAmount     = plan?.fixed_amount ?? 0;
  const amountContributed = daysContributed * dailyAmount;
  const amountRemaining   = Math.max(0, (daysInMonth - daysContributed) * dailyAmount);
  const tabs = ["Dashboard", "Contributions", "Withdrawal"];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Mono:wght@400;500&family=Outfit:wght@400;500;600&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;} body{background:#000;}
        ::-webkit-scrollbar{width:4px;} ::-webkit-scrollbar-thumb{background:rgba(0,123,255,0.3);border-radius:99px;}
        input::placeholder,select option{color:rgba(255,255,255,0.2);} select option{background:#0a0a1a;color:#fff;}
        @keyframes fadeUp{from{opacity:0;transform:translateY(16px);}to{opacity:1;transform:translateY(0);}}
        @keyframes pulse{0%,100%{opacity:1;}50%{opacity:0.4;}}
      `}</style>

      <div style={{ minHeight:"100vh", background:"radial-gradient(ellipse 80% 60% at 50% -10%,#001d3d 0%,#000 60%)", fontFamily:"'Outfit',sans-serif", color:"#fff", paddingBottom:60 }}>

        {/* Header */}
        <div style={{ position:"sticky", top:0, zIndex:100, backdropFilter:"blur(20px)", background:"rgba(0,0,0,0.6)", borderBottom:"1px solid rgba(255,255,255,0.06)", padding:"0 24px" }}>
          <div style={{ maxWidth:900, margin:"0 auto", display:"flex", alignItems:"center", justifyContent:"space-between", height:64 }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ width:32, height:32, borderRadius:8, background:"linear-gradient(135deg,#007BFF,#0040ff)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, boxShadow:"0 0 16px #007BFF66" }}>✦</div>
              <div>
                <div style={{ fontSize:15, fontWeight:800, fontFamily:"'Syne',sans-serif", lineHeight:1 }}>God's Grace</div>
                <div style={{ fontSize:10, color:"rgba(255,255,255,0.35)", letterSpacing:1.5, textTransform:"uppercase" as const }}>My Savings</div>
              </div>
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:12 }}>
              <div style={{ width:8, height:8, borderRadius:99, background:"#00e676", animation:"pulse 2s infinite" }}/>
              <span style={{ fontSize:12, color:"rgba(255,255,255,0.5)" }}>Live</span>
              <button onClick={handleLogout} style={{ background:"rgba(255,82,82,0.1)", border:"1px solid rgba(255,82,82,0.2)", color:"#ff5252", borderRadius:8, padding:"6px 12px", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>
                Logout
              </button>
            </div>
          </div>
        </div>

        <div style={{ maxWidth:900, margin:"0 auto", padding:"24px 16px 0" }}>

          {/* Tabs */}
          <div style={{ display:"flex", gap:4, background:"rgba(255,255,255,0.04)", borderRadius:12, padding:4, border:"1px solid rgba(255,255,255,0.07)", marginBottom:28 }}>
            {tabs.map(t => (
              <button key={t} onClick={() => setTab(t)} style={{ flex:1, background: tab===t ? "rgba(0,123,255,0.2)" : "transparent", color: tab===t ? "#007BFF" : "rgba(255,255,255,0.4)", border: tab===t ? "1px solid rgba(0,123,255,0.35)" : "1px solid transparent", borderRadius:9, padding:"9px 14px", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"inherit", transition:"all 0.2s" }}>
                {t}
              </button>
            ))}
          </div>

          {/* ── DASHBOARD TAB ── */}
          {tab === "Dashboard" && (
            <div style={{ display:"flex", flexDirection:"column", gap:20, animation:"fadeUp 0.4s ease" }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap" as const, gap:12 }}>
                <div>
                  <div style={{ fontSize:22, fontWeight:800, fontFamily:"'Syne',sans-serif" }}>
                    Hello, {profile.full_name.split(" ")[0]} 👋
                  </div>
                  <div style={{ fontSize:13, color:"rgba(255,255,255,0.4)", marginTop:3 }}>
                    {now.toLocaleDateString("en-NG", { weekday:"long", month:"long", day:"numeric" })}
                    {plan ? ` · ${plan.plan_type} Contributor` : ""}
                  </div>
                </div>
                <button onClick={() => setShowWithdraw(true)} style={{ background:"linear-gradient(135deg,#007BFF,#0040ff)", color:"#fff", border:"none", borderRadius:12, padding:"11px 22px", fontSize:14, fontWeight:700, cursor:"pointer", boxShadow:"0 4px 20px #007BFF55", fontFamily:"inherit" }}>
                  ↑ Withdraw
                </button>
              </div>

              <div style={{ display:"flex", gap:14, flexWrap:"wrap" as const }}>
                <StatCard label="Total Saved"  value={fmt(profile.total_saved)}          sub={plan ? `+${fmt(dailyAmount)} per day` : "No active plan"} color="#007BFF" icon="💰"/>
                <StatCard label="Daily Target" value={plan ? fmt(dailyAmount) : "—"}     sub={plan?.status ?? "Set up a plan"}                          color="#00e676" icon="🎯"/>
                <StatCard label="Streak"       value={`${profile.contribution_streak}d`} sub="Keep it up!"                                              color="#ff9800" icon="🔥"/>
              </div>

              <div style={{ display:"flex", gap:14, flexWrap:"wrap" as const }}>
                <Card style={{ flex:2, minWidth:220 }} glow="#007BFF">
                  <div style={{ fontSize:13, fontWeight:700, marginBottom:18, color:"rgba(255,255,255,0.7)" }}>
                    {now.toLocaleString("default", { month:"long" })} Progress
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:20, flexWrap:"wrap" as const }}>
                    <CircularProgress value={daysContributed} max={daysInMonth} label="Days" sublabel={`${pct(daysContributed, daysInMonth)}%`}/>
                    <div style={{ flex:1, minWidth:130, display:"flex", flexDirection:"column", gap:14 }}>
                      <TrustBar score={profile.trust_score}/>
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                        {[
                          { label:"Contributed", val:fmt(amountContributed),  color:"#007BFF" },
                          { label:"Remaining",   val:fmt(amountRemaining),    color:"rgba(255,255,255,0.4)" },
                          { label:"Days Done",   val:`${daysContributed}/${daysInMonth}`, color:"#00e676" },
                          { label:"Next Bonus",  val:`Day ${7 - (profile.contribution_streak % 7)}`, color:"#ff9800" },
                        ].map(({ label, val, color }) => (
                          <div key={label} style={{ background:"rgba(255,255,255,0.04)", borderRadius:10, padding:"10px 12px" }}>
                            <div style={{ fontSize:10, color:"rgba(255,255,255,0.4)", textTransform:"uppercase" as const, letterSpacing:0.8 }}>{label}</div>
                            <div style={{ fontSize:13, fontWeight:700, color, marginTop:3 }}>{val}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </Card>

                <Card style={{ flex:1, minWidth:180 }} glow="#007BFF">
                  <div style={{ fontSize:13, fontWeight:700, color:"rgba(255,255,255,0.7)", marginBottom:14 }}>Virtual Account</div>
                  {virtualAccount ? (
                    <>
                      <div style={{ background:"linear-gradient(135deg,#007BFF18,#0040ff18)", border:"1px solid rgba(0,123,255,0.2)", borderRadius:14, padding:14, marginBottom:12 }}>
                        <div style={{ fontSize:10, color:"rgba(255,255,255,0.4)", letterSpacing:1, textTransform:"uppercase" as const }}>{virtualAccount.bank_name}</div>
                        <div style={{ fontSize:20, fontWeight:800, fontFamily:"'DM Mono',monospace", color:"#fff", letterSpacing:2, marginTop:6 }}>{virtualAccount.account_number}</div>
                        <div style={{ fontSize:11, color:"#007BFF", marginTop:4 }}>{virtualAccount.account_name}</div>
                      </div>
                      <div style={{ fontSize:11, color:"rgba(255,255,255,0.3)", lineHeight:1.7 }}>Transfer to this account to contribute. Reflects instantly.</div>
                    </>
                  ) : (
                    <div style={{ fontSize:13, color:"rgba(255,255,255,0.3)", textAlign:"center", padding:"16px 0" }}>No virtual account yet.<br/>Contact admin to set up.</div>
                  )}
                </Card>
              </div>

              {/* Recent Transactions */}
              <Card>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
                  <div style={{ fontSize:14, fontWeight:700, color:"rgba(255,255,255,0.8)" }}>Recent Transactions</div>
                  <button onClick={() => setTab("Contributions")} style={{ fontSize:12, color:"#007BFF", background:"none", border:"none", cursor:"pointer", fontFamily:"inherit" }}>View All →</button>
                </div>
                {transactions.length === 0 ? (
                  <div style={{ textAlign:"center", padding:"24px 0", color:"rgba(255,255,255,0.3)", fontSize:13 }}>No transactions yet.</div>
                ) : transactions.slice(0,5).map((tx: any) => (
                  <div key={tx.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"11px 0", borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
                    <div style={{ width:36, height:36, borderRadius:10, background: tx.type==="Credit" ? "rgba(0,123,255,0.12)" : "rgba(255,152,0,0.12)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, flexShrink:0 }}>
                      {tx.type === "Credit" ? "↓" : "↑"}
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, fontWeight:600 }}>{tx.type === "Credit" ? "Contribution" : "Withdrawal"}</div>
                      <div style={{ fontSize:11, color:"rgba(255,255,255,0.35)", fontFamily:"'DM Mono',monospace" }}>{tx.reference}</div>
                    </div>
                    <div style={{ textAlign:"right" as const }}>
                      <div style={{ fontSize:14, fontWeight:700, color: tx.type==="Credit" ? "#00e676" : "#ff9800" }}>
                        {tx.type==="Credit" ? "+" : "-"}{fmt(tx.amount)}
                      </div>
                      <div style={{ fontSize:10, color:"rgba(255,255,255,0.3)", marginTop:2 }}>
                        {new Date(tx.created_at).toLocaleDateString("en-NG", { day:"2-digit", month:"short" })}
                      </div>
                    </div>
                    <Badge status={tx.status}/>
                  </div>
                ))}
              </Card>
            </div>
          )}

          {/* ── CONTRIBUTIONS TAB ── */}
          {tab === "Contributions" && (
            <Card style={{ animation:"fadeUp 0.4s ease" }}>
              <div style={{ fontSize:18, fontWeight:800, fontFamily:"'Syne',sans-serif", marginBottom:4 }}>Contribution Log</div>
              <div style={{ fontSize:13, color:"rgba(255,255,255,0.4)", marginBottom:20 }}>Your full savings history</div>
              {plan && (
                <div style={{ display:"flex", gap:10, flexWrap:"wrap" as const, marginBottom:20 }}>
                  {[
                    { label:"Plan",    val:plan.plan_type,      color:"#007BFF" },
                    { label:"Per Day", val:fmt(dailyAmount),    color:"#fff"    },
                    { label:"Status",  val:plan.status,         color:"#00e676" },
                  ].map(({ label, val, color }) => (
                    <div key={label} style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:12, padding:"12px 16px", flex:1, minWidth:100 }}>
                      <div style={{ fontSize:10, color:"rgba(255,255,255,0.35)", textTransform:"uppercase" as const, letterSpacing:1 }}>{label}</div>
                      <div style={{ fontSize:14, fontWeight:700, color, marginTop:4 }}>{val}</div>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ overflowX:"auto" as const }}>
                <table style={{ width:"100%", borderCollapse:"collapse" as const, fontSize:13 }}>
                  <thead>
                    <tr style={{ color:"rgba(255,255,255,0.35)", fontSize:11, textTransform:"uppercase" as const }}>
                      {["Date","Type","Amount","Reference","Status"].map(h => (
                        <th key={h} style={{ textAlign:"left" as const, padding:"10px 12px", borderBottom:"1px solid rgba(255,255,255,0.06)", fontWeight:600 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.length === 0 ? (
                      <tr><td colSpan={5} style={{ textAlign:"center", padding:"24px 0", color:"rgba(255,255,255,0.3)" }}>No transactions yet.</td></tr>
                    ) : transactions.map((tx: any) => (
                      <tr key={tx.id} style={{ borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
                        <td style={{ padding:"13px 12px", color:"rgba(255,255,255,0.7)" }}>{new Date(tx.created_at).toLocaleDateString("en-NG", { day:"2-digit", month:"short", year:"numeric" })}</td>
                        <td style={{ padding:"13px 12px" }}><Badge status={tx.type}/></td>
                        <td style={{ padding:"13px 12px", fontWeight:700, color: tx.type==="Credit" ? "#00e676" : "#ff9800" }}>{tx.type==="Credit" ? "+" : "-"}{fmt(tx.amount)}</td>
                        <td style={{ padding:"13px 12px", fontFamily:"'DM Mono',monospace", color:"rgba(255,255,255,0.4)", fontSize:11 }}>{tx.reference}</td>
                        <td style={{ padding:"13px 12px" }}><Badge status={tx.status}/></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* ── WITHDRAWAL TAB ── */}
          {tab === "Withdrawal" && (
            <div style={{ display:"flex", flexDirection:"column", gap:18, animation:"fadeUp 0.4s ease" }}>
              <Card glow="#007BFF">
                <div style={{ fontSize:18, fontWeight:800, fontFamily:"'Syne',sans-serif", marginBottom:4 }}>Withdrawal Center</div>
                <div style={{ fontSize:13, color:"rgba(255,255,255,0.4)", marginBottom:20 }}>24-hr admin review + OTP on every request</div>
                <div style={{ display:"flex", gap:14, flexWrap:"wrap" as const, marginBottom:18 }}>
                  <StatCard label="Available"   value={fmt(profile.total_saved)}       color="#007BFF" icon="💳"/>
                  <StatCard label="Trust Score" value={`${profile.trust_score}/100`}   sub={profile.trust_score >= 80 ? "Excellent" : "Good"} color={profile.trust_score >= 80 ? "#00e676" : "#007BFF"} icon="⭐"/>
                </div>
                <div style={{ background:"rgba(255,152,0,0.07)", border:"1px solid rgba(255,152,0,0.2)", borderRadius:12, padding:"13px 16px", marginBottom:18, fontSize:13, color:"rgba(255,255,255,0.6)", lineHeight:1.7 }}>
                  ⚠️ <strong style={{ color:"#ff9800" }}>Safety Hold:</strong> Withdrawals are reviewed within 24 hours before payout.
                </div>
                <button onClick={() => setShowWithdraw(true)} style={{ background:"linear-gradient(135deg,#007BFF,#0040ff)", color:"#fff", border:"none", borderRadius:12, padding:"13px 24px", fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:"inherit", boxShadow:"0 4px 20px #007BFF44" }}>
                  ↑ Initiate Withdrawal
                </button>
              </Card>

              <Card>
                <div style={{ fontSize:14, fontWeight:700, marginBottom:16 }}>Your Payout Requests</div>
                {payouts.length === 0 ? (
                  <div style={{ textAlign:"center" as const, padding:"24px 0", color:"rgba(255,255,255,0.3)", fontSize:13 }}>No withdrawal requests yet.</div>
                ) : payouts.map((p: any) => (
                  <div key={p.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"13px 0", borderBottom:"1px solid rgba(255,255,255,0.04)", flexWrap:"wrap" as const }}>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:14, fontWeight:700 }}>{fmt(p.amount)}</div>
                      <div style={{ fontSize:11, color:"rgba(255,255,255,0.35)" }}>
                        {p.dest_bank} · {p.dest_account} · {new Date(p.requested_at).toLocaleDateString("en-NG")}
                      </div>
                    </div>
                    <Badge status={p.status}/>
                  </div>
                ))}
              </Card>
            </div>
          )}

        </div>
      </div>

      {showWithdraw && profile && (
        <WithdrawalModal
          balance={profile.total_saved}
          userId={profile.id}
          onClose={() => setShowWithdraw(false)}
          onSuccess={handleWithdrawalSuccess}
        />
      )}
    </>
  );
}
