"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { App } from "@capacitor/app";
import { Keyboard } from "@capacitor/keyboard";
import { isNativeApp, listenToAppState, listenToNetworkChanges, setBalmzStatusBar, showNativeToast } from "@/lib/capacitor/native-helpers";

export function CapacitorRuntimeBridge() {
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (!isNativeApp()) return;
    let active = true;
    const removers: Array<() => Promise<void>> = [];
    void setBalmzStatusBar();
    void listenToAppState((isActive) => {
      if (active) window.dispatchEvent(new CustomEvent("balmz:app-state", { detail: { active: isActive } }));
    }).then((listener) => { if (active) removers.push(() => listener.remove()); else void listener.remove(); });
    void listenToNetworkChanges((state) => {
      if (active) window.dispatchEvent(new CustomEvent("balmz:network", { detail: state }));
    }).then((listener) => { if (active) removers.push(() => listener.remove()); else void listener.remove(); });
    void App.addListener("backButton", ({ canGoBack }) => {
      if (canGoBack) router.back();
      else if (pathname !== "/dashboard") router.replace("/dashboard");
      else void showNativeToast("You are at your BALMZ AI home.");
    }).then((listener) => { if (active) removers.push(() => listener.remove()); else void listener.remove(); });
    void Keyboard.addListener("keyboardDidShow", (event) => {
      document.documentElement.style.setProperty("--balmz-native-keyboard-height", event.keyboardHeight + "px");
    }).then((listener) => { if (active) removers.push(() => listener.remove()); else void listener.remove(); });
    void Keyboard.addListener("keyboardDidHide", () => {
      document.documentElement.style.setProperty("--balmz-native-keyboard-height", "0px");
    }).then((listener) => { if (active) removers.push(() => listener.remove()); else void listener.remove(); });
    return () => {
      active = false;
      for (const remove of removers) void remove();
      document.documentElement.style.setProperty("--balmz-native-keyboard-height", "0px");
    };
  }, [pathname, router]);
  return null;
}