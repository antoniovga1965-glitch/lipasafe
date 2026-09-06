"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { User, Banknote, Percent, Bell, Building2 } from "lucide-react";

// ── types ──────────────────────────────────────────────────────────────────
interface Settings {
  profile:       { name: string; email: string; phone: string };
  rates:         { gbp: string; usd: string; eur: string; aed: string; inr: string };
  cut:           string;
  notifications: { lowFloat: boolean; newConfirmation: boolean; disputeRaised: boolean; b2cSuccess: boolean };
  bank:          { name: string; accountName: string; accountNumber: string; swift: string; branch: string; currency: string };
}

// ── auth helper ────────────────────────────────────────────────────────────
function getToken(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("token") ?? "";
}

async function apiFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`,
      ...(options.headers ?? {}),
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message ?? "Request failed");
  return data;
}

// ── component ──────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const [settings, setSettings]     = useState<Settings | null>(null);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState<Record<string, boolean>>({});

  const isSaving = (key: string) => saving[key] === true;

  // ── fetch all settings on mount ─────────────────────────────────────────
  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiFetch("/api/secretary/settings");
      setSettings(data.data);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  // ── generic field updater ────────────────────────────────────────────────
  function update<K extends keyof Settings>(section: K, patch: Partial<Settings[K]>) {
    setSettings((prev) => prev ? { ...prev, [section]: { ...(prev[section] as object), ...patch } } : prev);
  }

  // ── save handlers ────────────────────────────────────────────────────────
  async function save(key: string, path: string, body: object, successMsg: string) {
    setSaving((p) => ({ ...p, [key]: true }));
    try {
      await apiFetch(path, { method: "PATCH", body: JSON.stringify(body) });
      toast.success(successMsg);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to save");
    } finally {
      setSaving((p) => ({ ...p, [key]: false }));
    }
  }

  const handleSaveProfile = () =>
    save("profile", "/api/secretary/profile", settings!.profile, "Profile updated");

  const handleSaveRates = () =>
    save("rates", "/api/secretary/rates", settings!.rates, "Currency rates updated");

  const handleSaveCut = () =>
    save("cut", "/api/secretary/cut", { cut: settings!.cut }, "Default cut updated");

  const handleSaveNotifications = () =>
    save("notifications", "/api/secretary/notifications", settings!.notifications, "Notification preferences saved");

  const handleSaveBank = () =>
    save("bank", "/api/secretary/bank-details", settings!.bank, "Bank details updated");

  // ── loading skeleton ─────────────────────────────────────────────────────
  if (loading || !settings) {
    return (
      <div className="space-y-6 max-w-3xl">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="border-0 shadow-sm">
            <CardContent className="pt-6 space-y-3">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const { profile, rates, cut, notifications, bank } = settings;

  return (
    <div className="space-y-6 max-w-3xl">

      {/* ── Profile ─────────────────────────────────────────────────────── */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="px-6 pt-6 pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <User className="h-5 w-5 text-[#16a34a]" />
            Secretary Profile
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Full Name</Label>
              <Input value={profile.name} onChange={(e) => update("profile", { name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={profile.email} disabled className="bg-gray-50 text-gray-400" />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Phone Number</Label>
              <Input value={profile.phone} onChange={(e) => update("profile", { phone: e.target.value })} />
            </div>
          </div>
          <Button className="bg-[#16a34a] hover:bg-[#15803d]" onClick={handleSaveProfile} disabled={isSaving("profile")}>
            {isSaving("profile") ? "Saving…" : "Save Profile"}
          </Button>
        </CardContent>
      </Card>

      {/* ── Currency Rates ───────────────────────────────────────────────── */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="px-6 pt-6 pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Banknote className="h-5 w-5 text-[#16a34a]" />
            Currency Rates (Reference)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 p-6">
          <div className="grid grid-cols-3 gap-4">
            {(["gbp", "usd", "eur", "aed", "inr"] as const).map((c) => (
              <div key={c} className="space-y-2">
                <Label>{c.toUpperCase()} → KES</Label>
                <Input
                  type="number"
                  value={rates[c]}
                  onChange={(e) => update("rates", { [c]: e.target.value })}
                />
              </div>
            ))}
          </div>
          <Button className="bg-[#16a34a] hover:bg-[#15803d]" onClick={handleSaveRates} disabled={isSaving("rates")}>
            {isSaving("rates") ? "Saving…" : "Update Rates"}
          </Button>
        </CardContent>
      </Card>

      {/* ── Platform Cut ─────────────────────────────────────────────────── */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="px-6 pt-6 pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Percent className="h-5 w-5 text-[#16a34a]" />
            LipaSafe Default Cut
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 p-6">
          <div className="flex items-center gap-4">
            <Input
              type="number"
              step="0.1"
              min="0"
              max="100"
              value={cut}
              onChange={(e) => setSettings((p) => p ? { ...p, cut: e.target.value } : p)}
              className="w-32"
            />
            <span className="text-gray-500">%</span>
          </div>
          <Button className="bg-[#16a34a] hover:bg-[#15803d]" onClick={handleSaveCut} disabled={isSaving("cut")}>
            {isSaving("cut") ? "Saving…" : "Update Cut"}
          </Button>
        </CardContent>
      </Card>

      {/* ── Notifications ────────────────────────────────────────────────── */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="px-6 pt-6 pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Bell className="h-5 w-5 text-[#16a34a]" />
            Notification Preferences
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 p-6">
          {([
            { key: "lowFloat",        label: "Low Float Alert",    desc: "Notify when float drops below KES 50,000" },
            { key: "newConfirmation", label: "New Confirmation",   desc: "Notify when a new payment proof is submitted" },
            { key: "disputeRaised",  label: "Dispute Raised",     desc: "Notify when a dispute is filed" },
            { key: "b2cSuccess",     label: "B2C Success",        desc: "Notify when B2C payout completes" },
          ] as const).map((item) => (
            <div key={item.key} className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">{item.label}</p>
                <p className="text-xs text-gray-500">{item.desc}</p>
              </div>
              <Switch
                checked={notifications[item.key]}
                onCheckedChange={(checked) => {
                  update("notifications", { [item.key]: checked });
                  // auto-save on toggle
                  save("notifications", "/api/secretary/notifications",
                    { ...notifications, [item.key]: checked },
                    `${item.label} ${checked ? "enabled" : "disabled"}`);
                }}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* ── Bank Details ─────────────────────────────────────────────────── */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="px-6 pt-6 pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Building2 className="h-5 w-5 text-[#16a34a]" />
            Bank Account Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {([
              { key: "name",          label: "Bank Name" },
              { key: "accountName",   label: "Account Name" },
              { key: "accountNumber", label: "Account Number" },
              { key: "swift",         label: "SWIFT Code" },
              { key: "branch",        label: "Branch" },
              { key: "currency",      label: "Currency" },
            ] as { key: keyof typeof bank; label: string }[]).map(({ key, label }) => (
              <div key={key} className="space-y-2">
                <Label>{label}</Label>
                <Input
                  value={bank[key]}
                  onChange={(e) => update("bank", { [key]: e.target.value })}
                />
              </div>
            ))}
          </div>
          <Button className="bg-[#16a34a] hover:bg-[#15803d]" onClick={handleSaveBank} disabled={isSaving("bank")}>
            {isSaving("bank") ? "Saving…" : "Update Bank Details"}
          </Button>
        </CardContent>
      </Card>

    </div>
  );
}
