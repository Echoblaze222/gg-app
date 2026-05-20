/**
 * lib/hooks/gg.ts
 * Shared hooks + DB actions for God's Grace
 * Used by: app/dashboard/page.tsx  &  app/admin/page.tsx
 */

import { useEffect, useState, useCallback, useRef } from "react";
import type { RealtimePostgresInsertPayload } from "@supabase/realtime-js";
import { createBrowserClient } from "@supabase/ssr";

const sb = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ── TYPES ─────────────────────────────────────────────────────────────────────

export type Profile = {
  id: string; full_name: string; email: string; phone: string;
  is_admin: boolean; status: string; plan_type: string;
  fixed_amount: number; total_saved: number;
  trust_score: number; contribution_streak: number;
  last_contributed_at: string | null; created_at: string;
};

export type Contribution = {
  id: string; user_id: string; amount: number;
  status: string; reference: string | null;
  channel: string; created_at: string;
};

export type Payout = {
  id: string; user_id: string; amount: number;
  dest_bank: string; dest_account: string; dest_name: string | null;
  otp_verified: boolean; status: string;
  admin_note: string | null; requested_at: string; resolved_at: string | null;
  // joined
  user?: { full_name: string; email: string; phone: string };
};

export type Notification = {
  id: string; type: string; title: string;
  body: string | null; user_id: string | null;
  is_read: boolean; created_at: string;
};

export type AuditLog = {
  id: string; action: string; admin_id: string | null;
  user_id: string | null; target_description: string | null;
  meta: Record<string, any> | null; created_at: string;
};

export type AdminStats = {
  total_float: number; total_users: number; active_plans: number;
  defaulter_count: number; payouts_today: number; payouts_today_amount: number;
};

// ── BALANCE CHECK ─────────────────────────────────────────────────────────────
// Rules:
//   - User must be Active
//   - total_saved must cover the requested payout amount
//   - No pending payout already in queue
//   - Trust score must be >= 50 to request a payout

export async function checkBalance(userId: string, requestedAmount: number): Promise<{ ok: boolean; reason?: string; balance: number }> {
  const { data: profile, error } = await sb
    .from("profiles")
    .select("total_saved, status, trust_score")
    .eq("id", userId)
    .single();

  if (error || !profile) return { ok: false, reason: "Could not load your profile.", balance: 0 };
  if (profile.status !== "Active") return { ok: false, reason: "Your account is currently suspended.", balance: profile.total_saved };
  if (profile.trust_score < 50) return { ok: false, reason: `Trust score too low (${profile.trust_score}/100). Minimum is 50.`, balance: profile.total_saved };
  if (profile.total_saved < requestedAmount) return { ok: false, reason: `Insufficient balance. Available: ₦${(profile.total_saved / 100).toLocaleString("en-NG")}`, balance: profile.total_saved };

  // Check no pending payout already
  const { count } = await sb
    .from("payouts")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "Pending");

  if ((count ?? 0) > 0) return { ok: false, reason: "You already have a pending payout. Wait for it to be resolved.", balance: profile.total_saved };

  return { ok: true, balance: profile.total_saved };
}

// ── DB ACTIONS ────────────────────────────────────────────────────────────────

export async function dbMakeContribution(userId: string, amount: number, reference?: string) {
  const { data, error } = await sb
    .from("contributions")
    .insert({ user_id: userId, amount, status: "confirmed", reference: reference ?? null, channel: reference ? "paystack" : "manual" })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function dbRequestPayout(userId: string, payload: {
  amount: number; dest_bank: string; dest_account: string; dest_name?: string;
}) {
  const { data, error } = await sb
    .from("payouts")
    .insert({ user_id: userId, ...payload, otp_verified: false, status: "Pending" })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function dbVerifyOtp(payoutId: string, otp: string): Promise<{ ok: boolean; reason?: string }> {
  // In production: call a Supabase Edge Function that checks hashed OTP
  // Here we call a simple RPC
  const { data, error } = await sb.rpc("verify_payout_otp", { payout_id: payoutId, otp_input: otp });
  if (error) return { ok: false, reason: error.message };
  return { ok: !!data };
}

export async function dbSendOtp(payoutId: string, phone: string) {
  // Call Edge Function: /functions/v1/send-otp
  const { error } = await sb.functions.invoke("send-otp", { body: { payout_id: payoutId, phone } });
  if (error) throw error;
}

export async function dbApprovePayout(id: string, adminId: string) {
  const { error } = await sb.from("payouts").update({ status: "Approved" }).eq("id", id);
  if (error) throw error;
  await sb.from("audit_logs").insert({ action: "approve_payout", admin_id: adminId, target_description: `Payout ${id}` });
}

export async function dbExecutePayout(id: string, adminId: string) {
  const { error } = await sb.from("payouts").update({ status: "Completed", resolved_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
  await sb.from("audit_logs").insert({ action: "execute_transfer", admin_id: adminId, target_description: `Payout ${id}` });
}

export async function dbRejectPayout(id: string, adminId: string, note?: string) {
  const { error } = await sb.from("payouts").update({ status: "Rejected", admin_note: note ?? null, resolved_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
  await sb.from("audit_logs").insert({ action: "reject_payout", admin_id: adminId, target_description: `Payout ${id}` });
}

export async function dbSuspendUser(id: string, adminId: string) {
  const { error } = await sb.from("profiles").update({ status: "Suspended" }).eq("id", id);
  if (error) throw error;
  await sb.from("audit_logs").insert({ action: "suspend_user", admin_id: adminId, target_description: id });
}

export async function dbRestoreUser(id: string, adminId: string) {
  const { error } = await sb.from("profiles").update({ status: "Active" }).eq("id", id);
  if (error) throw error;
  await sb.from("audit_logs").insert({ action: "restore_user", admin_id: adminId, target_description: id });
}

export async function dbMarkNotificationsRead(ids: string[]) {
  await sb.from("notifications").update({ is_read: true }).in("id", ids);
}

// ── HOOK: Own Profile ─────────────────────────────────────────────────────────
export function useProfile(userId: string) {
  const [profile,  setProfile]  = useState<Profile | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState("");

  const fetch = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const { data, error } = await sb.from("profiles").select("*").eq("id", userId).single();
    if (error) setError(error.message);
    else setProfile(data);
    setLoading(false);
  }, [userId]);

  useEffect(() => { fetch(); }, [fetch]);
  return { profile, loading, error, refetch: fetch, setProfile };
}

// ── HOOK: Own Contributions ───────────────────────────────────────────────────
export function useMyContributions(userId: string) {
  const [items,   setItems]   = useState<Contribution[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const { data } = await sb
      .from("contributions")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);
    setItems(data ?? []);
    setLoading(false);
  }, [userId]);

  useEffect(() => { fetch(); }, [fetch]);

  const prepend = useCallback((item: Contribution) => setItems(p => [item, ...p]), []);
  return { items, loading, refetch: fetch, prepend };
}

// ── HOOK: Own Payouts ─────────────────────────────────────────────────────────
export function useMyPayouts(userId: string) {
  const [items,   setItems]   = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const { data } = await sb
      .from("payouts")
      .select("*")
      .eq("user_id", userId)
      .order("requested_at", { ascending: false })
      .limit(30);
    setItems(data ?? []);
    setLoading(false);
  }, [userId]);

  useEffect(() => { fetch(); }, [fetch]);
  const prepend = useCallback((item: Payout) => setItems(p => [item, ...p]), []);
  return { items, loading, refetch: fetch, prepend };
}

// ── HOOK: Admin — All Payouts ─────────────────────────────────────────────────
export function useAllPayouts() {
  const [items,   setItems]   = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    const { data } = await sb
      .from("payouts")
      .select(`*, profiles!payouts_user_id_fkey(full_name, email, phone)`)
      .order("requested_at", { ascending: false })
      .limit(100);

    const shaped = (data ?? []).map((p: any) => ({
      ...p,
      user: p.profiles ?? { full_name: "Unknown", email: "", phone: "" },
    }));
    setItems(shaped);
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const updateStatus = useCallback((id: string, status: string) => {
    setItems(p => p.map(x => x.id === id ? { ...x, status } : x));
  }, []);

  return { items, loading, refetch: fetch, updateStatus };
}

// ── HOOK: Admin — All Members ─────────────────────────────────────────────────
export function useAllMembers() {
  const [items,   setItems]   = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    const { data } = await sb
      .from("profiles")
      .select("*")
      .order("full_name")
      .limit(300);
    setItems(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);
  const updateStatus = useCallback((id: string, status: string) => {
    setItems(p => p.map(u => u.id === id ? { ...u, status } : u));
  }, []);
  return { items, loading, refetch: fetch, updateStatus };
}

// ── HOOK: Admin — Defaulters ──────────────────────────────────────────────────
export function useDefaulters() {
  const [items,   setItems]   = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    const { data } = await sb
      .from("profiles")
      .select("*")
      .lt("trust_score", 70)
      .neq("status", "Suspended")
      .order("trust_score")
      .limit(50);
    setItems(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);
  const remove = useCallback((id: string) => setItems(p => p.filter(x => x.id !== id)), []);
  return { items, loading, refetch: fetch, remove };
}

// ── HOOK: Admin — Stats ───────────────────────────────────────────────────────
export function useAdminStats() {
  const [stats,   setStats]   = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    const today = new Date(); today.setHours(0, 0, 0, 0);

    const [
      { count: total_users },
      { count: active_plans },
      { count: defaulter_count },
      { data: floatData },
      { data: todayPayouts },
    ] = await Promise.all([
      sb.from("profiles").select("*", { count: "exact", head: true }),
      sb.from("profiles").select("*", { count: "exact", head: true }).eq("status", "Active"),
      sb.from("profiles").select("*", { count: "exact", head: true }).lt("trust_score", 70).neq("status", "Suspended"),
      sb.from("contributions").select("amount").eq("status", "confirmed"),
      sb.from("payouts").select("amount").eq("status", "Completed").gte("requested_at", today.toISOString()),
    ]);

    setStats({
      total_float:          (floatData ?? []).reduce((s: number, c: any) => s + c.amount, 0),
      total_users:          total_users ?? 0,
      active_plans:         active_plans ?? 0,
      defaulter_count:      defaulter_count ?? 0,
      payouts_today:        (todayPayouts ?? []).length,
      payouts_today_amount: (todayPayouts ?? []).reduce((s: number, p: any) => s + p.amount, 0),
    });
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);
  return { stats, loading, refetch: fetch };
}

// ── HOOK: Admin — Notifications (Realtime) ────────────────────────────────────
export function useNotifications() {
  const [items,   setItems]   = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const channelRef            = useRef<any>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    const { data } = await sb
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(30);
    setItems(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetch();

    // Subscribe to real-time inserts on notifications table
    channelRef.current = sb
      .channel("admin-notifications")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications" }, (payload: RealtimePostgresInsertPayload<Record<string, unknown>>) => {
        setItems(p => [payload.new as Notification, ...p].slice(0, 50));
      })
      .subscribe();

    return () => {
      if (channelRef.current) sb.removeChannel(channelRef.current);
    };
  }, [fetch]);

  const markRead = useCallback(async (ids: string[]) => {
    setItems(p => p.map(n => ids.includes(n.id) ? { ...n, is_read: true } : n));
    await dbMarkNotificationsRead(ids);
  }, []);

  const unread = items.filter(n => !n.is_read).length;
  return { items, loading, unread, markRead, refetch: fetch };
}

// ── HOOK: Admin — Audit Log ───────────────────────────────────────────────────
export function useAuditLog() {
  const [items,   setItems]   = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    const { data } = await sb
      .from("audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    setItems(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);
  const prepend = useCallback((item: AuditLog) => setItems(p => [item, ...p]), []);
  return { items, loading, refetch: fetch, prepend };
}


// ── TYPES: Settings ───────────────────────────────────────────────────────────
export type CollectionAccount = {
  bank_name:    string;
  account_no:   string;
  account_name: string;
  bank_code:    string;
  payout_min_trust:    number;
  payout_min_balance:  number;
  app_name:     string;
};

// ── HOOK: App Settings (readable by all) ──────────────────────────────────────
export function useAppSettings() {
  const [settings, setSettings] = useState<CollectionAccount | null>(null);
  const [loading,  setLoading]  = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    const { data, error } = await sb.from("app_settings").select("key,value");
    if (!error && data) {
      const map: Record<string, string> = {};
      data.forEach((r: any) => { map[r.key] = r.value; });
      setSettings({
        bank_name:           map["collection_bank_name"]    ?? "",
        account_no:          map["collection_account_no"]   ?? "",
        account_name:        map["collection_account_name"] ?? "",
        bank_code:           map["collection_bank_code"]    ?? "",
        payout_min_trust:    parseInt(map["payout_min_trust"]   ?? "50"),
        payout_min_balance:  parseInt(map["payout_min_balance"] ?? "100000"),
        app_name:            map["app_name"]                ?? "God's Grace",
      });
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);
  return { settings, loading, refetch: fetch };
}

// ── DB ACTION: Save Settings ──────────────────────────────────────────────────
export async function dbSaveSettings(
  updates: Partial<Record<string, string>>,
  adminId: string
) {
  const rows = Object.entries(updates).map(([key, value]) => ({
    key, value,
    updated_by: adminId,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await sb
    .from("app_settings")
    .upsert(rows, { onConflict: "key" });

  if (error) throw error;

  // Audit it
  await sb.from("audit_logs").insert({
    action: "update_settings",
    admin_id: adminId,
    target_description: "Collection account / app settings updated",
    meta: updates,
  });
}
