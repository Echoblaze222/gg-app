"use client";
/**
 * components/AdminSettings.tsx
 * Drop this as a tab inside app/admin/page.tsx
 *
 * Admin can:
 *   - Set the God's Grace collection account (bank, account no, account name)
 *   - Set payout rules (minimum trust score, minimum balance)
 *   - Changes are saved to Supabase app_settings table
 *   - Members see the updated account instantly on their dashboard
 */

import { useState, useEffect } from "react";
import { useAppSettings, dbSaveSettings, type CollectionAccount } from "@/lib/hooks/gg";

const NIGERIAN_BANKS = [
  { name: "Access Bank",       code: "044" },
  { name: "Citibank",          code: "023" },
  { name: "EcoBank",           code: "050" },
  { name: "Fidelity Bank",     code: "070" },
  { name: "First Bank",        code: "011" },
  { name: "First City Monument Bank", code: "214" },
  { name: "Globus Bank",       code: "00103" },
  { name: "GTBank",            code: "058" },
  { name: "Heritage Bank",     code: "030" },
  { name: "Keystone Bank",     code: "082" },
  { name: "Kuda Bank",         code: "50211" },
  { name: "Opay",              code: "999992" },
  { name: "Palmpay",           code: "999991" },
  { name: "Polaris Bank",      code: "076" },
  { name: "Providus Bank",     code: "101" },
  { name: "Stanbic IBTC",      code: "221" },
  { name: "Standard Chartered",code: "068" },
  { name: "Sterling Bank",     code: "232" },
  { name: "UBA",               code: "033" },
  { name: "Union Bank",        code: "032" },
  { name: "Unity Bank",        code: "215" },
  { name: "VFD Microfinance",  code: "566" },
  { name: "Wema Bank",         code: "035" },
  { name: "Zenith Bank",       code: "057" },
];

const G = {
  card:   "rgba(255,255,255,0.035)",
  border: "rgba(255,255,255,0.07)",
  muted:  "rgba(255,255,255,0.38)",
  green:  "#00e676",
  red:    "#ff5252",
  blue:   "#60a5fa",
  amber:  "#ff9800",
};

function Sk({ w = "100%", h = 18, r = 8 }: { w?: string | number; h?: number; r?: number }) {
  return <div style={{ width: w, height: h, borderRadius: r, background: "linear-gradient(90deg,rgba(255,255,255,0.04) 0%,rgba(255,255,255,0.09) 50%,rgba(255,255,255,0.04) 100%)", backgroundSize: "200% 100%", animation: "shimmer 1.6s linear infinite" }}/>;
}

function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11, fontWeight: 700, color: G.muted, marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>{children}</div>;
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
      {hint && <div style={{ fontSize: 11, color: G.muted, marginTop: 5 }}>{hint}</div>}
    </div>
  );
}

function TextInput({ value, onChange, placeholder, type = "text", mono }: {
  value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; mono?: boolean;
}) {
  return (
    <input
      type={type} value={value} onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{ width: "100%", background: "rgba(255,255,255,0.05)", border: `1px solid ${G.border}`, borderRadius: 11, padding: "12px 14px", color: "#f0f0f0", fontSize: 14, outline: "none", fontFamily: mono ? "'DM Mono',monospace" : "inherit", transition: "border-color 0.2s", letterSpacing: mono ? "0.05em" : "normal" }}
    />
  );
}

function SectionCard({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div style={{ background: G.card, border: `1px solid ${G.border}`, borderRadius: 22, backdropFilter: "blur(20px)", padding: 22, boxShadow: "0 8px 40px rgba(0,0,0,0.35)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <div style={{ fontSize: 20 }}>{icon}</div>
        <div style={{ fontSize: 15, fontWeight: 700 }}>{title}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {children}
      </div>
    </div>
  );
}

function AccountPreview({ s }: { s: CollectionAccount }) {
  return (
    <div style={{ background: "linear-gradient(135deg,rgba(0,230,118,0.08),rgba(0,230,118,0.03))", border: "1px solid rgba(0,230,118,0.18)", borderRadius: 18, padding: "20px 22px" }}>
      <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 2, color: G.green, fontWeight: 700, marginBottom: 14 }}>Member Preview — What members will see</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <span style={{ fontSize: 12, color: G.muted }}>Bank</span>
          <span style={{ fontSize: 14, fontWeight: 700 }}>{s.bank_name || "—"}</span>
        </div>
        <div style={{ height: 1, background: G.border }}/>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <span style={{ fontSize: 12, color: G.muted }}>Account Number</span>
          <span style={{ fontSize: 18, fontWeight: 900, fontFamily: "'DM Mono',monospace", color: G.green, letterSpacing: "0.1em" }}>{s.account_no || "——————————"}</span>
        </div>
        <div style={{ height: 1, background: G.border }}/>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <span style={{ fontSize: 12, color: G.muted }}>Account Name</span>
          <span style={{ fontSize: 14, fontWeight: 700 }}>{s.account_name || "—"}</span>
        </div>
      </div>
    </div>
  );
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
export default function AdminSettings({ adminId, onToast }: {
  adminId: string;
  onToast: (msg: string, ok?: boolean) => void;
}) {
  const { settings, loading, refetch } = useAppSettings();

  // Local form state — mirrors DB
  const [bankName,    setBankName]    = useState("");
  const [bankCode,    setBankCode]    = useState("");
  const [accountNo,   setAccountNo]   = useState("");
  const [accountName, setAccountName] = useState("");
  const [minTrust,    setMinTrust]    = useState("50");
  const [minBalance,  setMinBalance]  = useState("1000");
  const [appName,     setAppName]     = useState("");
  const [saving,      setSaving]      = useState(false);
  const [dirty,       setDirty]       = useState(false);

  // Populate form when settings load
  useEffect(() => {
    if (!settings) return;
    setBankName(settings.bank_name);
    setBankCode(settings.bank_code);
    setAccountNo(settings.account_no);
    setAccountName(settings.account_name);
    setMinTrust(String(settings.payout_min_trust));
    setMinBalance(String(settings.payout_min_balance / 100)); // convert kobo → naira
    setAppName(settings.app_name);
  }, [settings]);

  // Mark dirty on any change
  function change(setter: (v: string) => void) {
    return (v: string) => { setter(v); setDirty(true); };
  }

  function handleBankSelect(name: string) {
    const bank = NIGERIAN_BANKS.find(b => b.name === name);
    setBankName(name);
    if (bank) setBankCode(bank.code);
    setDirty(true);
  }

  async function save() {
    if (!accountNo.match(/^\d{10}$/)) {
      onToast("Account number must be exactly 10 digits", false);
      return;
    }
    if (!accountName.trim()) {
      onToast("Account name is required", false);
      return;
    }
    const trustNum = parseInt(minTrust);
    if (isNaN(trustNum) || trustNum < 0 || trustNum > 100) {
      onToast("Min trust score must be 0–100", false);
      return;
    }
    const balanceNum = parseFloat(minBalance);
    if (isNaN(balanceNum) || balanceNum < 0) {
      onToast("Min payout balance must be a positive number", false);
      return;
    }

    setSaving(true);
    try {
      await dbSaveSettings({
        collection_bank_name:    bankName,
        collection_bank_code:    bankCode,
        collection_account_no:   accountNo,
        collection_account_name: accountName,
        payout_min_trust:        String(trustNum),
        payout_min_balance:      String(Math.round(balanceNum * 100)), // naira → kobo
        app_name:                appName,
      }, adminId);
      await refetch();
      setDirty(false);
      onToast("✅ Settings saved — members will see the updated account immediately");
    } catch (e: any) {
      onToast(`❌ Save failed: ${e.message}`, false);
    } finally {
      setSaving(false);
    }
  }

  // Live preview using form values (not yet saved)
  const preview: CollectionAccount = {
    bank_name:           bankName,
    account_no:          accountNo,
    account_name:        accountName,
    bank_code:           bankCode,
    payout_min_trust:    parseInt(minTrust) || 50,
    payout_min_balance:  Math.round(parseFloat(minBalance || "0") * 100),
    app_name:            appName,
  };

  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {[1,2,3].map(i => (
          <div key={i} style={{ background: G.card, border: `1px solid ${G.border}`, borderRadius: 22, padding: 22 }}>
            <Sk h={20} w={180}/>
            <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 14 }}>
              <Sk h={44}/><Sk h={44}/><Sk h={44}/>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>

      {/* Live preview */}
      <AccountPreview s={preview}/>

      {/* Collection account */}
      <SectionCard title="Collection Account" icon="🏦">
        <Field label="Bank" hint="Select the bank where members will send contributions">
          <select
            value={bankName}
            onChange={e => handleBankSelect(e.target.value)}
            style={{ width: "100%", background: "rgba(255,255,255,0.05)", border: `1px solid ${G.border}`, borderRadius: 11, padding: "12px 14px", color: "#f0f0f0", fontSize: 14, outline: "none", fontFamily: "inherit" }}
          >
            <option value="">Select bank…</option>
            {NIGERIAN_BANKS.map(b => (
              <option key={b.code} value={b.name}>{b.name}</option>
            ))}
          </select>
        </Field>

        <Field label="Account Number" hint="Must be exactly 10 digits">
          <TextInput
            value={accountNo}
            onChange={v => { if (v.length <= 10 && /^\d*$/.test(v)) change(setAccountNo)(v); }}
            placeholder="0123456789"
            mono
          />
          <div style={{ marginTop: 6, display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ width: "100%", height: 3, borderRadius: 99, background: G.border, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${(accountNo.length / 10) * 100}%`, background: accountNo.length === 10 ? G.green : G.amber, transition: "width 0.3s ease, background 0.3s ease", borderRadius: 99 }}/>
            </div>
            <span style={{ fontSize: 11, color: accountNo.length === 10 ? G.green : G.muted, fontFamily: "'DM Mono',monospace", flexShrink: 0 }}>{accountNo.length}/10</span>
          </div>
        </Field>

        <Field label="Account Name" hint="The registered name on the account — members will see this to verify">
          <TextInput value={accountName} onChange={change(setAccountName)} placeholder="God's Grace Cooperative"/>
        </Field>

        {bankCode && (
          <div style={{ fontSize: 12, color: G.muted, background: "rgba(255,255,255,0.03)", border: `1px solid ${G.border}`, borderRadius: 10, padding: "10px 14px" }}>
            Bank code: <span style={{ fontFamily: "'DM Mono',monospace", color: G.blue }}>{bankCode}</span> (used for Paystack/Flutterwave integrations)
          </div>
        )}
      </SectionCard>

      {/* Payout rules */}
      <SectionCard title="Payout Rules" icon="📋">
        <Field label="Minimum Trust Score to Request Payout" hint="Members below this score cannot request a payout (0–100)">
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <input
              type="range" min={0} max={100} value={minTrust}
              onChange={e => { setMinTrust(e.target.value); setDirty(true); }}
              style={{ flex: 1, accentColor: G.green }}
            />
            <div style={{ fontSize: 18, fontWeight: 900, fontFamily: "'Syne',sans-serif", color: parseInt(minTrust) >= 70 ? G.green : parseInt(minTrust) >= 40 ? G.amber : G.red, minWidth: 50, textAlign: "right" }}>
              {minTrust}
            </div>
          </div>
        </Field>

        <Field label="Minimum Balance for Payout (₦)" hint="Members must have at least this amount saved before requesting a withdrawal">
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: G.muted, fontSize: 14, fontWeight: 700 }}>₦</span>
            <input
              type="number" value={minBalance}
              onChange={e => { setMinBalance(e.target.value); setDirty(true); }}
              style={{ width: "100%", background: "rgba(255,255,255,0.05)", border: `1px solid ${G.border}`, borderRadius: 11, padding: "12px 14px 12px 28px", color: "#f0f0f0", fontSize: 14, outline: "none", fontFamily: "'DM Mono',monospace" }}
            />
          </div>
          <div style={{ fontSize: 11, color: G.muted, marginTop: 5 }}>
            = ₦{parseFloat(minBalance || "0").toLocaleString("en-NG")} — stored in kobo internally
          </div>
        </Field>
      </SectionCard>

      {/* App config */}
      <SectionCard title="App Configuration" icon="⚙️">
        <Field label="App / Cooperative Name" hint="Displayed in the header and on member screens">
          <TextInput value={appName} onChange={change(setAppName)} placeholder="God's Grace"/>
        </Field>
      </SectionCard>

      {/* Save button */}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, alignItems: "center" }}>
        {dirty && <span style={{ fontSize: 12, color: G.amber }}>⚠️ You have unsaved changes</span>}
        <button
          onClick={save} disabled={saving || !dirty}
          style={{ background: dirty ? "rgba(0,230,118,0.12)" : "rgba(255,255,255,0.04)", color: dirty ? G.green : G.muted, border: `1px solid ${dirty ? "rgba(0,230,118,0.28)" : G.border}`, borderRadius: 12, padding: "12px 28px", fontSize: 13, fontWeight: 700, cursor: saving || !dirty ? "not-allowed" : "pointer", fontFamily: "inherit", transition: "all 0.2s", display: "inline-flex", alignItems: "center", gap: 8 }}
        >
          {saving
            ? <><span style={{ width: 13, height: 13, borderRadius: 99, border: `2px solid ${G.green}`, borderTopColor: "transparent", animation: "spin 0.7s linear infinite", display: "inline-block" }}/> Saving…</>
            : "💾 Save Settings"
          }
        </button>
      </div>

    </div>
  );
}
