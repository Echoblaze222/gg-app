"use client";

import { createClient } from "@/lib/supabase/client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
  const router = useRouter();
  const supabase = createClient();

  const [step, setStep] = useState(1);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [planType, setPlanType] = useState("Daily");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  const PLANS = [
    { type: "Daily", icon: "📅" },
    { type: "Weekly", icon: "📆" },
    { type: "Monthly", icon: "🗓" },
  ];

  // ✅ FIX 1: Added googleLoading state, prompt: "select_account" to force
  // account picker, and proper error handling.
  // ACTION REQUIRED: Make sure this exact URL is added to your Supabase dashboard:
  //   Auth → URL Configuration → Redirect URLs → https://gg-app-3h69.vercel.app/dashboard
  async function handleGoogleRegister() {
    setError("");
    setGoogleLoading(true);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: "https://gg-app-3h69.vercel.app/dashboard",
        queryParams: {
          access_type: "offline",
          prompt: "select_account", // Forces Google account picker every time
        },
      },
    });

    if (error) {
      setError(error.message);
      setGoogleLoading(false);
    }
    // Note: if successful, the browser redirects — no need to setGoogleLoading(false)
  }

  function validateStep1() {
    if (!fullName.trim()) {
      setError("Enter your full name");
      return false;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError("Enter a valid email address");
      return false;
    }

    const cleanPhone = phone.replace(/\D/g, "");
    if (cleanPhone.length < 10 || cleanPhone.length > 14) {
      setError("Enter a valid phone number");
      return false;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return false;
    }

    if (password !== confirm) {
      setError("Passwords do not match");
      return false;
    }

    return true;
  }

  function handleStep1() {
    setError("");
    if (!validateStep1()) return;
    setStep(2);
  }

  async function handleRegister() {
    setError("");

    if (!amount || Number(amount) < 200) {
      setError("Minimum amount is ₦200");
      return;
    }

    setLoading(true);

    // ✅ FIX 2: Pass full_name in user metadata so auth user has a display name
    const { data, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
      },
    });

    if (authError || !data.user) {
      setError(authError?.message || "Registration failed");
      setLoading(false);
      return;
    }

    const { error: profileError } = await supabase
      .from("profiles")
      .upsert({
        id: data.user.id,
        full_name: fullName,
        email,
        phone,
        is_admin: false,
        plan_type: planType,
        fixed_amount: Number(amount) * 100,
        trust_score: 100,
        contribution_streak: 0,
        total_saved: 0,
      });

    if (profileError) {
      setError(profileError.message);
      setLoading(false);
      return;
    }

    setLoading(false);
    setStep(3);
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 12,
    padding: "13px 16px",
    color: "#fff",
    fontSize: 14,
    outline: "none",
    fontFamily: "inherit",
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=Outfit:wght@400;500;600&display=swap');

        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }

        body {
          background: #000;
        }

        input::placeholder {
          color: rgba(255,255,255,0.2);
        }

        @keyframes fadeUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>

      <div
        style={{
          minHeight: "100vh",
          background:
            "radial-gradient(ellipse 80% 70% at 50% -5%, #001d3d 0%, #000 65%)",
          fontFamily: "'Outfit', sans-serif",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 16,
          touchAction: "manipulation",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 440,
            animation: "fadeUp 0.5s ease",
          }}
        >
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 14,
                background: "linear-gradient(135deg,#007BFF,#0040ff)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 26,
                margin: "0 auto 14px",
                boxShadow: "0 0 40px #007BFF44",
              }}
            >
              ✦
            </div>

            <div
              style={{
                fontSize: 24,
                fontWeight: 800,
                fontFamily: "'Syne',sans-serif",
                color: "#fff",
              }}
            >
              God&apos;s Grace
            </div>

            <div
              style={{
                fontSize: 11,
                color: "rgba(255,255,255,0.35)",
                letterSpacing: 2,
                textTransform: "uppercase",
                marginTop: 4,
              }}
            >
              Create Your Account
            </div>
          </div>

          <div
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.09)",
              borderRadius: 24,
              padding: 32,
              backdropFilter: "blur(24px)",
              boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
            }}
          >
            {error && (
              <div
                style={{
                  background: "rgba(255,82,82,0.1)",
                  border: "1px solid rgba(255,82,82,0.3)",
                  borderRadius: 10,
                  padding: "12px 14px",
                  marginBottom: 18,
                  fontSize: 13,
                  color: "#ff5252",
                }}
              >
                ⚠ {error}
              </div>
            )}

            {step === 1 && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 16,
                }}
              >
                <input
                  type="text"
                  placeholder="Full Name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  style={inputStyle}
                />

                <input
                  type="email"
                  placeholder="Email Address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={inputStyle}
                />

                <input
                  type="tel"
                  placeholder="Phone Number"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  style={inputStyle}
                />

                <div style={{ position: "relative" }}>
                  <input
                    type={showPass ? "text" : "password"}
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    style={{ ...inputStyle, paddingRight: 50 }}
                  />

                  <button
                    type="button"
                    onClick={() => setShowPass(!showPass)}
                    style={{
                      position: "absolute",
                      right: 14,
                      top: "50%",
                      transform: "translateY(-50%)",
                      background: "transparent",
                      border: "none",
                      color: "#999",
                      cursor: "pointer",
                      fontSize: 16,
                    }}
                  >
                    {showPass ? "🙈" : "👁"}
                  </button>
                </div>

                <input
                  type="password"
                  placeholder="Confirm Password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  style={inputStyle}
                />

                <button
                  type="button"
                  onClick={handleStep1}
                  style={{
                    background: "linear-gradient(135deg,#007BFF,#0040ff)",
                    color: "#fff",
                    border: "none",
                    borderRadius: 12,
                    padding: 14,
                    fontSize: 15,
                    fontWeight: 700,
                    cursor: "pointer",
                    width: "100%",
                    touchAction: "manipulation",
                  }}
                >
                  Continue →
                </button>

                {/* ✅ FIX 3: Google button with proper icon, loading state, and branding */}
                <button
                  type="button"
                  onClick={handleGoogleRegister}
                  disabled={googleLoading}
                  style={{
                    width: "100%",
                    background: googleLoading ? "#e8e8e8" : "#fff",
                    color: "#3c4043",
                    border: "1px solid #dadce0",
                    borderRadius: 12,
                    padding: 14,
                    fontSize: 15,
                    fontWeight: 600,
                    cursor: googleLoading ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 10,
                    transition: "background 0.2s",
                  }}
                >
                  {googleLoading ? (
                    <span style={{ opacity: 0.6 }}>Redirecting...</span>
                  ) : (
                    <>
                      {/* Google "G" SVG icon */}
                      <svg width="18" height="18" viewBox="0 0 48 48">
                        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.29-8.16 2.29-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                        <path fill="none" d="M0 0h48v48H0z"/>
                      </svg>
                      Continue with Google
                    </>
                  )}
                </button>

                <div
                  style={{
                    textAlign: "center",
                    fontSize: 13,
                    color: "rgba(255,255,255,0.4)",
                    marginTop: 4,
                  }}
                >
                  Already have an account?{" "}
                  <span
                    onClick={() => router.push("/login")}
                    style={{
                      color: "#007BFF",
                      cursor: "pointer",
                      textDecoration: "underline",
                    }}
                  >
                    Sign in
                  </span>
                </div>
              </div>
            )}

            {step === 2 && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 16,
                }}
              >
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginBottom: 4 }}>
                  Choose your savings plan and set your fixed contribution amount.
                </div>

                <select
                  value={planType}
                  onChange={(e) => setPlanType(e.target.value)}
                  style={inputStyle}
                >
                  {PLANS.map((plan) => (
                    <option
                      key={plan.type}
                      value={plan.type}
                      style={{ background: "#111" }}
                    >
                      {plan.icon} {plan.type}
                    </option>
                  ))}
                </select>

                <input
                  type="number"
                  placeholder="Amount (min ₦200)"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  style={inputStyle}
                />

                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    style={{
                      flex: 1,
                      background: "rgba(255,255,255,0.05)",
                      color: "#fff",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: 12,
                      padding: 14,
                      cursor: "pointer",
                    }}
                  >
                    Back
                  </button>

                  <button
                    type="button"
                    onClick={handleRegister}
                    disabled={loading}
                    style={{
                      flex: 2,
                      background: loading
                        ? "rgba(255,255,255,0.06)"
                        : "linear-gradient(135deg,#007BFF,#0040ff)",
                      color: "#fff",
                      border: "none",
                      borderRadius: 12,
                      padding: 14,
                      fontSize: 15,
                      fontWeight: 700,
                      cursor: loading ? "not-allowed" : "pointer",
                    }}
                  >
                    {loading ? "Creating..." : "Create Account ✓"}
                  </button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 20,
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: 60 }}>🎉</div>

                <div
                  style={{
                    fontSize: 22,
                    fontWeight: 800,
                    color: "#fff",
                  }}
                >
                  Registration Successful!
                </div>

                {/* ✅ FIX 4: Email confirmation notice */}
                <div
                  style={{
                    background: "rgba(0,123,255,0.1)",
                    border: "1px solid rgba(0,123,255,0.3)",
                    borderRadius: 12,
                    padding: "14px 16px",
                    fontSize: 13,
                    color: "rgba(255,255,255,0.75)",
                    lineHeight: 1.6,
                  }}
                >
                  📧 A confirmation email has been sent to <strong style={{ color: "#fff" }}>{email}</strong>.
                  Please check your inbox and click the link to verify your account before logging in.
                </div>

                <button
                  type="button"
                  onClick={() => router.push("/login")}
                  style={{
                    background: "linear-gradient(135deg,#007BFF,#0040ff)",
                    color: "#fff",
                    border: "none",
                    borderRadius: 12,
                    padding: 14,
                    fontSize: 15,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Go To Login →
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
