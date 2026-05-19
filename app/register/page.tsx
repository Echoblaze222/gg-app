"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
  const router = useRouter();
  const [step,      setStep]      = useState(1); // 1=details, 2=plan, 3=success
  const [fullName,  setFullName]  = useState("");
  const [email,     setEmail]     = useState("");
  const [phone,     setPhone]     = useState("");
  const [password,  setPassword]  = useState("");
  const [confirm,   setConfirm]   = useState("");
  const [planType,  setPlanType]  = useState("Daily");
  const [amount,    setAmount]    = useState("");
  const [error,     setError]     = useState("");
  const [loading,   setLoading]   = useState(false);
  const [showPass,  setShowPass]  = useState(false);

  const PLANS = [
    { type: "Daily",   icon: "📅", desc: "Save every day" },
    { type: "Weekly",  icon: "📆", desc: "Save every week" },
    { type: "Monthly", icon: "🗓", desc: "Save every month" },
  ];

  function validateStep1() {
    if (!fullName.trim()) { setError("Enter your full name"); return false; }
    if (!email.includes("@")) { setError("Enter a valid email address"); return false; }
    if (phone.length < 10) { setError("Enter a valid Nigerian phone number"); return false; }
    if (password.length < 6) { setError("Password must be at least 6 characters"); return false; }
    if (password !== confirm) { setError("Passwords do not match"); return false; }
    return true;
  }

  function handleStep1() {
    setError("");
    if (!validateStep1()) return;
    setStep(2);
  }

  function handleRegister() {
    setError("");
    if (!amount || Number(amount) < 500) { setError("Minimum daily amount is ₦500"); return; }

    setLoading(true);
    setTimeout(() => {
      // Save new user session
      const newUser = {
        email,
        full_name: fullName,
        phone,
        is_admin: false,
        plan_type: planType,
        fixed_amount: Number(amount) * 100,
        trust_score: 100,
        contribution_streak: 0,
        total_saved: 0,
      };
      localStorage.setItem("gg_user", JSON.stringify(newUser));
      setLoading(false);
      setStep(3);
    }, 1500);
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=Outfit:wght@400;500;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #000; }
        input::placeholder { color: rgba(255,255,255,0.2); }
        @keyframes fadeUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
      `}</style>

      <div style={{ minHeight: "100vh", background: "radial-gradient(ellipse 80% 70% at 50% -5%, #001d3d 0%, #000 65%)", fontFamily: "'Outfit', sans-serif", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
        <div style={{ width: "100%", maxWidth: 440, animation: "fadeUp 0.5s ease" }}>

          {/* Logo */}
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            <div style={{ width: 56, height: 56, borderRadius: 14, background: "linear-gradient(135deg,#007BFF,#0040ff)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, margin: "0 auto 14px", boxShadow: "0 0 40px #007BFF44" }}>✦</div>
            <div style={{ fontSize: 24, fontWeight: 800, fontFamily: "'Syne',sans-serif", color: "#fff" }}>God's Grace</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", letterSpacing: 2, textTransform: "uppercase", marginTop: 4 }}>Create Your Account</div>
          </div>

          {/* Progress indicator */}
          <div style={{ display: "flex", gap: 6, marginBottom: 24 }}>
            {[1, 2].map(s => (
              <div key={s} style={{ flex: 1, height: 4, borderRadius: 99, background: step >= s ? "#007BFF" : "rgba(255,255,255,0.08)", transition: "background 0.3s", boxShadow: step >= s ? "0 0 10px #007BFF66" : "none" }}/>
            ))}
          </div>

          {/* Card */}
          <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 24, padding: 32, backdropFilter: "blur(24px)", boxShadow: "0 24px 64px rgba(0,0,0,0.5)" }}>

            {error && (
              <div style={{ background: "rgba(255,82,82,0.1)", border: "1px solid rgba(255,82,82,0.3)", borderRadius: 10, padding: "12px 14px", marginBottom: 18, fontSize: 13, color: "#ff5252" }}>
                ⚠ {error}
              </div>
            )}

            {/* ── Step 1: Personal Details ── */}
            {step === 1 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "'Syne',sans-serif" }}>Personal Details</div>
                  <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginTop: 4, marginBottom: 20 }}>Step 1 of 2 — Tell us about yourself</div>
                </div>

                {[
                  { label: "Full Name",     value: fullName,  set: setFullName,  type: "text",     placeholder: "e.g. Adaeze Okonkwo" },
                  { label: "Email Address", value: email,     set: setEmail,     type: "email",    placeholder: "you@example.com" },
                  { label: "Phone Number",  value: phone,     set: setPhone,     type: "tel",      placeholder: "08012345678" },
                ].map(({ label, value, set, type, placeholder }) => (
                  <div key={label}>
                    <label style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", letterSpacing: 1, textTransform: "uppercase", display: "block", marginBottom: 8 }}>{label}</label>
                    <input type={type} value={value} onChange={e => set(e.target.value)} placeholder={placeholder}
                      style={{ width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: "13px 16px", color: "#fff", fontSize: 14, outline: "none", fontFamily: "inherit" }}/>
                  </div>
                ))}

                <div>
                  <label style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", letterSpacing: 1, textTransform: "uppercase", display: "block", marginBottom: 8 }}>Password</label>
                  <div style={{ position: "relative" }}>
                    <input type={showPass ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} placeholder="Min. 6 characters"
                      style={{ width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: "13px 48px 13px 16px", color: "#fff", fontSize: 14, outline: "none", fontFamily: "inherit" }}/>
                    <button onClick={() => setShowPass(!showPass)} style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "rgba(255,255,255,0.35)", cursor: "pointer", fontSize: 16 }}>
                      {showPass ? "🙈" : "👁"}
                    </button>
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", letterSpacing: 1, textTransform: "uppercase", display: "block", marginBottom: 8 }}>Confirm Password</label>
                  <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Re-enter password"
                    style={{ width: "100%", background: "rgba(255,255,255,0.06)", border: confirm && confirm !== password ? "1px solid rgba(255,82,82,0.5)" : "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: "13px 16px", color: "#fff", fontSize: 14, outline: "none", fontFamily: "inherit" }}/>
                </div>

                <button onClick={handleStep1}
                  style={{ background: "linear-gradient(135deg,#007BFF,#0040ff)", color: "#fff", border: "none", borderRadius: 12, padding: "14px", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", boxShadow: "0 4px 24px #007BFF44", marginTop: 4 }}>
                  Continue →
                </button>

                <div style={{ textAlign: "center", fontSize: 13, color: "rgba(255,255,255,0.4)" }}>
                  Already have an account?{" "}
                  <a href="/login" style={{ color: "#007BFF", fontWeight: 600, textDecoration: "none" }}>Sign in</a>
                </div>
              </div>
            )}

            {/* ── Step 2: Savings Plan ── */}
            {step === 2 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "'Syne',sans-serif" }}>Choose Your Plan</div>
                  <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginTop: 4, marginBottom: 20 }}>Step 2 of 2 — Set your savings frequency</div>
                </div>

                {/* Plan selector */}
                <div style={{ display: "flex", gap: 10 }}>
                  {PLANS.map(p => (
                    <button key={p.type} onClick={() => setPlanType(p.type)}
                      style={{ flex: 1, background: planType === p.type ? "rgba(0,123,255,0.15)" : "rgba(255,255,255,0.04)", border: planType === p.type ? "1px solid rgba(0,123,255,0.5)" : "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: "14px 8px", cursor: "pointer", color: planType === p.type ? "#007BFF" : "rgba(255,255,255,0.5)", textAlign: "center", fontFamily: "inherit", transition: "all 0.2s" }}>
                      <div style={{ fontSize: 22, marginBottom: 6 }}>{p.icon}</div>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{p.type}</div>
                      <div style={{ fontSize: 10, marginTop: 3, opacity: 0.7 }}>{p.desc}</div>
                    </button>
                  ))}
                </div>

                <div>
                  <label style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", letterSpacing: 1, textTransform: "uppercase", display: "block", marginBottom: 8 }}>
                    Amount per {planType} (₦)
                  </label>
                  <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="e.g. 5000"
                    style={{ width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: "13px 16px", color: "#fff", fontSize: 18, fontWeight: 700, outline: "none", fontFamily: "inherit" }}/>
                  {amount && Number(amount) >= 500 && (
                    <div style={{ fontSize: 12, color: "#00e676", marginTop: 8 }}>
                      Monthly target: ₦{(Number(amount) * (planType === "Daily" ? 30 : planType === "Weekly" ? 4 : 1)).toLocaleString("en-NG")}
                    </div>
                  )}
                </div>

                {/* Summary */}
                {amount && Number(amount) >= 500 && (
                  <div style={{ background: "rgba(0,123,255,0.07)", border: "1px solid rgba(0,123,255,0.2)", borderRadius: 12, padding: "14px 16px" }}>
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 8 }}>Your plan summary</div>
                    {[
                      ["Name",       fullName],
                      ["Plan",       `${planType} · ₦${Number(amount).toLocaleString("en-NG")} per ${planType.toLowerCase()}`],
                      ["Trust Score","100/100 (starts fresh)"],
                    ].map(([k, v]) => (
                      <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0" }}>
                        <span style={{ color: "rgba(255,255,255,0.4)" }}>{k}</span>
                        <span style={{ color: "#fff", fontWeight: 600 }}>{v}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={() => setStep(1)}
                    style={{ flex: 1, background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: "13px", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                    ← Back
                  </button>
                  <button onClick={handleRegister} disabled={loading}
                    style={{ flex: 2, background: loading ? "rgba(255,255,255,0.06)" : "linear-gradient(135deg,#007BFF,#0040ff)", color: loading ? "rgba(255,255,255,0.3)" : "#fff", border: "none", borderRadius: 12, padding: "13px", fontSize: 14, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit", boxShadow: loading ? "none" : "0 4px 20px #007BFF44" }}>
                    {loading ? "Creating account…" : "Create Account ✓"}
                  </button>
                </div>
              </div>
            )}

            {/* ── Step 3: Success ── */}
            {step === 3 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 20, textAlign: "center" }}>
                <div style={{ fontSize: 60 }}>🎉</div>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "'Syne',sans-serif", marginBottom: 8 }}>Welcome, {fullName.split(" ")[0]}!</div>
                  <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", lineHeight: 1.7 }}>
                    Your God's Grace savings account has been created. Your virtual account number will be assigned shortly.
                  </div>
                </div>
                <div style={{ background: "rgba(0,230,118,0.07)", border: "1px solid rgba(0,230,118,0.2)", borderRadius: 14, padding: 16 }}>
                  {[
                    ["Plan",   `${planType} · ₦${Number(amount).toLocaleString("en-NG")}`],
                    ["Status", "Active ✓"],
                    ["Trust",  "100/100"],
                  ].map(([k, v]) => (
                    <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "5px 0" }}>
                      <span style={{ color: "rgba(255,255,255,0.4)" }}>{k}</span>
                      <span style={{ color: "#fff", fontWeight: 700 }}>{v}</span>
                    </div>
                  ))}
                </div>
                <button onClick={() => router.push("/dashboard")}
                  style={{ background: "linear-gradient(135deg,#007BFF,#0040ff)", color: "#fff", border: "none", borderRadius: 12, padding: "14px", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", boxShadow: "0 4px 24px #007BFF44" }}>
                  Go to My Dashboard →
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
