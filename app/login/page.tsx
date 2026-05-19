"use client";
import { createClient } from "@/lib/supabase/client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  async function handleGoogleLogin() {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: "https://gg-app-3h69.vercel.app/dashboard",
      },
    });
  }

  async function handleLogin() {
    setError("");

    if (!email || !password) {
      setError("Please enter your email and password");
      return;
    }

    setLoading(true);

    const { data: authData, error: authError } =
      await supabase.auth.signInWithPassword({
        email,
        password,
      });

    if (authError || !authData.user) {
      setError(authError?.message ?? "Incorrect email or password.");
      setLoading(false);
      return;
    }

   let { data: profile } = await supabase
  .from("profiles")
  .select("*")
  .eq("id", authData.user.id)
  .single();

if (!profile) {
  const { error: insertError } = await supabase
    .from("profiles")
    .insert({
      id: authData.user.id,
      full_name:
        authData.user.user_metadata?.full_name ||
        authData.user.user_metadata?.name ||
        "Google User",
      email: authData.user.email,
      phone: "",
      is_admin: false,
      plan_type: "Daily",
      fixed_amount: 0,
      trust_score: 100,
      contribution_streak: 0,
      total_saved: 0,
    });

  if (insertError) {
    setError(insertError.message);
    setLoading(false);
    return;
  }

  profile = { is_admin: false };
}
    router.push(profile.is_admin ? "/admin" : "/dashboard");
    router.refresh();
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
            "radial-gradient(ellipse 80% 70% at 50% -5%,#001d3d 0%,#000 65%)",
          fontFamily: "'Outfit',sans-serif",
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
            maxWidth: 420,
            animation: "fadeUp 0.5s ease",
          }}
        >
          {/* Logo */}
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <div
              style={{
                width: 60,
                height: 60,
                borderRadius: 16,
                background: "linear-gradient(135deg,#007BFF,#0040ff)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 28,
                margin: "0 auto 16px",
                boxShadow: "0 0 40px #007BFF44",
              }}
            >
              ✦
            </div>

            <div
              style={{
                fontSize: 26,
                fontWeight: 800,
                fontFamily: "'Syne',sans-serif",
                color: "#fff",
              }}
            >
              God's Grace
            </div>

            <div
              style={{
                fontSize: 12,
                color: "rgba(255,255,255,0.35)",
                letterSpacing: 2,
                textTransform: "uppercase",
                marginTop: 4,
              }}
            >
              Fintech · Thrift & Ajo
            </div>
          </div>

          {/* Card */}
          <div
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.09)",
              borderRadius: 24,
              padding: 32,
              backdropFilter: "blur(24px)",
              boxShadow:
                "0 0 60px rgba(0,123,255,0.1),0 24px 64px rgba(0,0,0,0.5)",
            }}
          >
            <div
              style={{
                fontSize: 20,
                fontWeight: 800,
                fontFamily: "'Syne',sans-serif",
                marginBottom: 6,
                color: "#fff",
              }}
            >
              Welcome back
            </div>

            <div
              style={{
                fontSize: 13,
                color: "rgba(255,255,255,0.4)",
                marginBottom: 28,
              }}
            >
              Sign in to your savings account
            </div>

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

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 16,
              }}
            >
              {/* Email */}
              <div>
                <label
                  style={{
                    fontSize: 11,
                    color: "rgba(255,255,255,0.4)",
                    letterSpacing: 1,
                    textTransform: "uppercase",
                    display: "block",
                    marginBottom: 8,
                  }}
                >
                  Email Address
                </label>

                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  onKeyDown={(e) =>
                    e.key === "Enter" && handleLogin()
                  }
                  style={inputStyle}
                />
              </div>

              {/* Password */}
              <div>
                <label
                  style={{
                    fontSize: 11,
                    color: "rgba(255,255,255,0.4)",
                    letterSpacing: 1,
                    textTransform: "uppercase",
                    display: "block",
                    marginBottom: 8,
                  }}
                >
                  Password
                </label>

                <div style={{ position: "relative" }}>
                  <input
                    type={showPass ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    onKeyDown={(e) =>
                      e.key === "Enter" && handleLogin()
                    }
                    style={{
                      ...inputStyle,
                      padding: "13px 48px 13px 16px",
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
                      background: "none",
                      border: "none",
                      color: "rgba(255,255,255,0.35)",
                      cursor: "pointer",
                      fontSize: 16,
                    }}
                  >
                    {showPass ? "🙈" : "👁"}
                  </button>
                </div>
              </div>

              {/* Login Button */}
              <button
                type="button"
                onClick={handleLogin}
                disabled={loading}
                style={{
                  background: loading
                    ? "rgba(255,255,255,0.06)"
                    : "linear-gradient(135deg,#007BFF,#0040ff)",
                  color: loading
                    ? "rgba(255,255,255,0.3)"
                    : "#fff",
                  border: "none",
                  borderRadius: 12,
                  padding: 14,
                  fontSize: 15,
                  fontWeight: 700,
                  cursor: loading ? "not-allowed" : "pointer",
                  fontFamily: "inherit",
                  boxShadow: loading
                    ? "none"
                    : "0 4px 24px #007BFF44",
                  marginTop: 4,
                  transition: "all 0.2s",
                  width: "100%",
                  touchAction: "manipulation",
                  WebkitTapHighlightColor: "transparent",
                }}
              >
                {loading ? "Signing in…" : "Sign In →"}
              </button>

              {/* Google Button */}
              <button
                type="button"
                onClick={handleGoogleLogin}
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
                  marginTop: 4,
                }}
              >
                Continue with Google
              </button>

              <div
                style={{
                  textAlign: "center",
                  fontSize: 13,
                  color: "rgba(255,255,255,0.4)",
                  paddingTop: 4,
                }}
              >
                Don't have an account?{" "}
                <a
                  href="/register"
                  style={{
                    color: "#007BFF",
                    fontWeight: 600,
                    textDecoration: "none",
                  }}
                >
                  Register here
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}