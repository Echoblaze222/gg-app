import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Role = "admin" | "member";

export function useAuthGuard(requiredRole: Role) {
  const router = useRouter();
  const [userId,      setUserId]      = useState("");
  const [displayName, setDisplayName] = useState("");
  const [ready,       setReady]       = useState(false);

  useEffect(() => {
    async function check() {
      const sb = createClient();

      // Get real Supabase session — same client as login uses
      const { data: { user }, error } = await sb.auth.getUser();

      if (error || !user) {
        router.replace("/login");
        return;
      }

      const { data: profile } = await sb
        .from("profiles")
        .select("id, full_name, is_admin, status")
        .eq("id", user.id)
        .single();

      if (!profile) { router.replace("/login"); return; }
      if (profile.status === "Suspended") { router.replace("/login"); return; }

      // Role check — replace not push to prevent ping-pong loop
      if (requiredRole === "admin" && !profile.is_admin) {
        router.replace("/dashboard"); return;
      }
      if (requiredRole === "member" && profile.is_admin) {
        router.replace("/admin"); return;
      }

      setUserId(profile.id);
      setDisplayName(profile.full_name);
      setReady(true);
    }

    check();
  }, []); // runs once — no loop

  async function logout() {
    const sb = createClient();
    await sb.auth.signOut();
    router.replace("/login");
  }

  return { userId, displayName, ready, logout };
}
