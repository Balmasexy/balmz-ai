"use client";

import { useEffect, useState } from "react";
import {
  announceForAccessibility, checkPushPermission, getDeviceDetails, getNativeAppInfo, getNetworkState, getRuntimePlatform, hapticTap, isNativeApp, lockPortraitOrientation, scheduleLocalReminder, setBalmzStatusBar, shareNativeContent, unlockScreenOrientation, copyNativeText, isScreenReaderActive, removeNativePreference
} from "@/lib/capacitor/native-helpers";

type Notice = { kind: "success" | "error"; text: string };

export function NativeCapabilitiesSection() {
  const [device, setDevice] = useState<Awaited<ReturnType<typeof getDeviceDetails>> | null>(null);
  const [appInfo, setAppInfo] = useState<Awaited<ReturnType<typeof getNativeAppInfo>>>(null);
  const [online, setOnline] = useState<boolean | null>(null);
  const [pushStatus, setPushStatus] = useState("Not checked");
  const [screenReaderActive, setScreenReaderActive] = useState(false);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const native = isNativeApp();

  useEffect(() => {
    let active = true;
    void Promise.all([getDeviceDetails(), getNativeAppInfo(), getNetworkState(), checkPushPermission(), isScreenReaderActive()])
      .then(([info, app, network, push, screenReader]) => {
        if (!active) return;
        setDevice(info); setAppInfo(app); setOnline(network.connected); setPushStatus(push.receive); setScreenReaderActive(screenReader);
      })
      .catch(() => { if (active) setNotice({ kind: "error", text: "Some device capabilities could not be read." }); });
    void setBalmzStatusBar();
    return () => { active = false; };
  }, []);

  async function run(action: string, work: () => Promise<void>) {
    setBusy(action); setNotice(null);
    try { await work(); setNotice({ kind: "success", text: action + " completed." }); }
    catch (error) { setNotice({ kind: "error", text: error instanceof Error ? error.message : "The native action failed." }); }
    finally { setBusy(""); }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3 px-1 pt-5">
        <div><p className="text-sm text-white/75">Mobile device capabilities</p><p className="mt-1 text-[11px] text-white/35">Native features are used only when supported and only after you choose an action.</p></div>
        <span className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] text-white/55">{native ? "Capacitor " + getRuntimePlatform() : "Browser"}</span>
      </div>
      <div className="rounded-2xl border border-white/[0.09] bg-[#202a38] p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div><p className="text-[10px] uppercase tracking-wider text-white/35">Device</p><p className="mt-1 text-sm text-white">{device ? [device.manufacturer, device.model].filter(Boolean).join(" ") || device.platform : "Checking…"}</p></div>
          <div><p className="text-[10px] uppercase tracking-wider text-white/35">Operating system</p><p className="mt-1 text-sm text-white">{device ? device.operatingSystem + " " + device.osVersion : "Checking…"}</p></div>
          <div><p className="text-[10px] uppercase tracking-wider text-white/35">Connection</p><p className="mt-1 text-sm text-white">{online === null ? "Checking…" : online ? "Online" : "Offline"}</p></div>
          <div><p className="text-[10px] uppercase tracking-wider text-white/35">App version</p><p className="mt-1 text-sm text-white">{appInfo?.version ?? "Web / unavailable"}</p></div>
          <div><p className="text-[10px] uppercase tracking-wider text-white/35">Push permission</p><p className="mt-1 text-sm text-white">{native ? pushStatus : "Not applicable in browser"}</p></div>
          <div><p className="text-[10px] uppercase tracking-wider text-white/35">Screen reader</p><p className="mt-1 text-sm text-white">{screenReaderActive ? "Active" : "Not detected"}</p></div>
          <div><p className="text-[10px] uppercase tracking-wider text-white/35">Persistent device ID</p><p className="mt-1 text-sm text-white">Not collected by BALMZ AI diagnostics</p></div>
        </div>
      </div>
      {notice ? <p role="status" className={"rounded-xl border px-3 py-2 text-xs " + (notice.kind === "success" ? "border-emerald-400/20 text-emerald-200" : "border-rose-400/20 text-rose-200")}>{notice.text}</p> : null}
      <div className="grid gap-2 sm:grid-cols-2">
        <button type="button" disabled={Boolean(busy)} onClick={() => void run("Haptic test", async () => { await hapticTap(); })} className="min-h-11 rounded-xl border border-white/10 px-3 text-left text-xs text-white/80 disabled:opacity-40">{busy === "Haptic test" ? "Running…" : "Test vibration / haptics"}</button>
        <button type="button" disabled={Boolean(busy)} onClick={() => void run("Accessibility announcement", () => announceForAccessibility("BALMZ AI accessibility is ready."))} className="min-h-11 rounded-xl border border-white/10 px-3 text-left text-xs text-white/80 disabled:opacity-40">Test screen-reader announcement</button>
        <button type="button" disabled={Boolean(busy)} onClick={() => void run("Diagnostic copy", () => copyNativeText(["BALMZ AI diagnostics", "Platform: " + getRuntimePlatform(), "Device: " + (device?.model ?? "unknown"), "OS: " + (device?.operatingSystem ?? "unknown"), "Connection: " + (online ? "online" : "offline")].join("\n")))} className="min-h-11 rounded-xl border border-white/10 px-3 text-left text-xs text-white/80 disabled:opacity-40">Copy safe device diagnostics</button>
        <button type="button" disabled={Boolean(busy)} onClick={() => void run("Local reminder", () => scheduleLocalReminder({ id: Math.trunc(Date.now() / 1000), title: "BALMZ AI reminder", body: "Your BALMZ AI workplace is ready when you are.", at: new Date(Date.now() + 15000) }))} className="min-h-11 rounded-xl border border-white/10 px-3 text-left text-xs text-white/80 disabled:opacity-40">Send a test local notification</button>
        <button type="button" disabled={Boolean(busy)} onClick={() => void run("Portrait lock", lockPortraitOrientation)} className="min-h-11 rounded-xl border border-white/10 px-3 text-left text-xs text-white/80 disabled:opacity-40">Lock portrait orientation</button>
        <button type="button" disabled={Boolean(busy)} onClick={() => void run("Adaptive orientation", unlockScreenOrientation)} className="min-h-11 rounded-xl border border-white/10 px-3 text-left text-xs text-white/80 disabled:opacity-40">Restore adaptive orientation</button>
        <button type="button" disabled={Boolean(busy)} onClick={() => void run("Reset saved model preference", () => removeNativePreference("balmz-ai-preferred-model"))} className="min-h-11 rounded-xl border border-white/10 px-3 text-left text-xs text-white/80 disabled:opacity-40">Reset saved AI model preference</button>
        <button type="button" disabled={Boolean(busy)} onClick={() => void run("Share diagnostics", () => shareNativeContent({ title: "BALMZ AI device diagnostics", text: ["Platform: " + getRuntimePlatform(), "Model: " + (device?.model ?? "unknown"), "OS: " + (device?.operatingSystem ?? "unknown"), "Connection: " + (online ? "online" : "offline")].join("\n") }))} className="min-h-11 rounded-xl border border-white/10 px-3 text-left text-xs text-white/80 disabled:opacity-40">Share safe device diagnostics</button>
      </div>
      <p className="px-1 text-[10px] leading-5 text-white/35">Push registration is not activated because a server-side delivery provider/token endpoint has not been configured. No notification permission is requested automatically. The local reminder test requests OS permission only when you press its button.</p>
    </section>
  );
}