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
  const [showPass, setShowPass] = useState(false);

  const PLANS = [
    { type: "Daily", icon: "📅" },
    { type: "Weekly", icon: "📆" },
    { type: "Monthly", icon: "🗓" },
  ];

  
    async function handleGoogleRegister() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: "https://gg-app-3h69.vercel.app/dashboard",
    },
  });

  if (error) {
    setError(error.message);
  }
}

  function validateStep1() {
    if (!fullName.trim()) {
      setError("Enter your full name");
      return false;
    }

    if (!email.includes("@")) {
      setError("Enter a valid email address");
      return false;
    }

    if (phone.length < 10) {
      setError("Enter a valid Nigerian phone number");
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

    if (!amount || Number(amount) < 500) {
      setError("Minimum amount is ₦500");
      return;
    }

    setLoading(true);

    const { data, error: authError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (authError || !data.user) {
      console.log(authError);

      setError(
        authError?.message || "Registration failed"
      );

      setLoading(false);
      return;
    }

    const { error: profileError } = await supabase
      .from("profiles")
      .insert({
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
              God's Grace
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
                    style={{
                      ...inputStyle,
                      paddingRight: 50,
                    }}
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
                    background:
                      "linear-gradient(135deg,#007BFF,#0040ff)",
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

                <button
                  type="button"
                  onClick={handleGoogleRegister}
                  style={{
                    width: "100%",
                    background: "#fff",
                    color: "#000",
                    border: "none",
                    borderRadius: 12,
                    padding: 14,
                    fontSize: 15,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Continue with Google
                </button>
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
                  placeholder="Amount"
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
                      border:
                        "1px solid rgba(255,255,255,0.1)",
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
                      cursor: "pointer",
                    }}
                  >
                    {loading
                      ? "Creating..."
                      : "Create Account ✓"}
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
                  Registration Successful
                </div>

                <button
                  type="button"
                  onClick={() => router.push("/login")}
                  style={{
                    background:
                      "linear-gradient(135deg,#007BFF,#0040ff)",
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