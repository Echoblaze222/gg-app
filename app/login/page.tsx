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
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  // ✅ FIX 1: Proper Google OAuth with loading state, error handling, and account picker
  async function handleGoogleLogin() {
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
    // On success: browser redirects — no need to reset loading state
  }

  // ✅ FIX 5: Forgot password handler
  async function handleForgotPassword() {
    if (!email) {
      setError("Enter your email address above, then click Forgot Password.");
      return;
    }
    setError("");
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: "https://gg-app-3h69.vercel.app/reset-password",
    });
    if (error) {
      setError(error.message);
    } else {
      setResetSent(true);
    }
  }

  async function handleLogin() {
    setError("");

    if (!email || !password) {
      setError("Please enter your email and password");
      return;
    }

    setLoading(true);

    const { data: authData, error: authError } =
      await supabase.auth.signInWithPassword({ email, password });

    if (authError || !authData.user) {
      setError(authError?.message ?? "Incorrect email or password.");
      setLoading(false);
      return;
    }

    // ✅ FIX 2: Fetch profile — do NOT auto-insert on email/password login.
    // If profile is missing, show a clear error instead of inserting blank data.
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", authData.user.id)
      .single();

    if (profileError || !profile) {
      setError(
        "Your profile could not be found. Please contact support or re-register."
      );
      // Sign them back out so they're not stuck in a half-authenticated state
      await supabase.auth.signOut();
      setLoading(false);
      return;
    }

    // ✅ FIX 3 & 4: Only push after all checks pass; removed redundant router.refresh()
    router.push(profile.is_admin ? "/admin" : "/dashboard");
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
              God&apos;s Grace
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
              Fintech · Thrift &amp; Ajo
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

            {/* Error Banner */}
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

            {/* Password Reset Confirmation */}
            {resetSent && (
              <div
                style={{
                  background: "rgba(0,200,100,0.1)",
                  border: "1px solid rgba(0,200,100,0.3)",
                  borderRadius: 10,
                  padding: "12px 14px",
                  marginBottom: 18,
                  fontSize: 13,
                  color: "#00c864",
                }}
              >
                ✅ Password reset email sent — check your inbox.
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
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
                  onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                  style={inputStyle}
                />
              </div>

              {/* Password */}
              <div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 8,
                  }}
                >
                  <label
                    style={{
                      fontSize: 11,
                      color: "rgba(255,255,255,0.4)",
                      letterSpacing: 1,
                      textTransform: "uppercase",
                    }}
                  >
                    Password
                  </label>

                  {/* ✅ FIX 5: Forgot password link */}
                  <span
                    onClick={handleForgotPassword}
                    style={{
                      fontSize: 12,
                      color: "#007BFF",
                      cursor: "pointer",
                      textDecoration: "underline",
                    }}
                  >
                    Forgot password?
                  </span>
                </div>

                <div style={{ position: "relative" }}>
                  <input
                    type={showPass ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                    style={{ ...inputStyle, padding: "13px 48px 13px 16px" }}
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

              {/* Sign In Button */}
              <button
                type="button"
                onClick={handleLogin}
                disabled={loading}
                style={{
                  background: loading
                    ? "rgba(255,255,255,0.06)"
                    : "linear-gradient(135deg,#007BFF,#0040ff)",
                  color: loading ? "rgba(255,255,255,0.3)" : "#fff",
                  border: "none",
                  borderRadius: 12,
                  padding: 14,
                  fontSize: 15,
                  fontWeight: 700,
                  cursor: loading ? "not-allowed" : "pointer",
                  fontFamily: "inherit",
                  boxShadow: loading ? "none" : "0 4px 24px #007BFF44",
                  marginTop: 4,
                  transition: "all 0.2s",
                  width: "100%",
                  touchAction: "manipulation",
                  WebkitTapHighlightColor: "transparent",
                }}
              >
                {loading ? "Signing in…" : "Sign In →"}
              </button>

              {/* ✅ FIX 1: Google Button with icon, loading state, proper branding */}
              <button
                type="button"
                onClick={handleGoogleLogin}
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
                  marginTop: 4,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                  transition: "background 0.2s",
                  touchAction: "manipulation",
                }}
              >
                {googleLoading ? (
                  <span style={{ opacity: 0.6 }}>Redirecting…</span>
                ) : (
                  <>
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
                  paddingTop: 4,
                }}
              >
                Don&apos;t have an account?{" "}
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
