"use client";

import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { AppLauncher } from "@capacitor/app-launcher";
import { Browser } from "@capacitor/browser";
import { Camera } from "@capacitor/camera";
import { Clipboard } from "@capacitor/clipboard";
import { Device } from "@capacitor/device";
import { Dialog } from "@capacitor/dialog";
import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";
import { Keyboard } from "@capacitor/keyboard";
import { LocalNotifications } from "@capacitor/local-notifications";
import { Network } from "@capacitor/network";
import { Preferences } from "@capacitor/preferences";
import { PushNotifications } from "@capacitor/push-notifications";
import { ScreenOrientation } from "@capacitor/screen-orientation";
import { ScreenReader } from "@capacitor/screen-reader";
import { Share } from "@capacitor/share";
import { Style, StatusBar } from "@capacitor/status-bar";
import { Toast } from "@capacitor/toast";

export type NativeNetworkState = { connected: boolean; connectionType: string };
export type NativeImageSelection = { uri?: string; webPath?: string; name: string };

/** 1. Detect whether this session runs inside a real Capacitor native shell. */
export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

/** 2. Identify the current web/iOS/Android runtime without exposing device IDs. */
export function getRuntimePlatform(): string {
  return Capacitor.getPlatform();
}

/** 3. Return non-identifying device details for diagnostics and support. */
export async function getDeviceDetails() {
  return Device.getInfo();
}

/** 4. Read current connectivity before starting a native upload or chat request. */
export async function getNetworkState(): Promise<NativeNetworkState> {
  const result = await Network.getStatus();
  return { connected: result.connected, connectionType: result.connectionType };
}

/** 5. Subscribe to online/offline changes; callers should remove the listener on unmount. */
export async function listenToNetworkChanges(
  callback: (state: NativeNetworkState) => void,
) {
  return Network.addListener("networkStatusChange", (state) => {
    callback({ connected: state.connected, connectionType: state.connectionType });
  });
}

/** 6. Give short tactile feedback for actions such as Send and Copy on supported devices. */
export async function hapticTap(): Promise<void> {
  if (isNativeApp()) await Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined);
}

/** 7. Give success/error feedback without blocking the user's flow. */
export async function hapticNotice(success = true): Promise<void> {
  if (isNativeApp()) {
    await Haptics.notification({
      type: success ? NotificationType.Success : NotificationType.Error,
    }).catch(() => undefined);
  }
}

/** 8. Copy text with a native clipboard and a browser fallback. */
export async function copyNativeText(value: string): Promise<void> {
  if (isNativeApp()) {
    await Clipboard.write({ string: value });
    return;
  }
  await navigator.clipboard.writeText(value);
}

/** 9. Read clipboard text with the same native/web behavior. */
export async function readNativeText(): Promise<string> {
  if (isNativeApp()) {
    const result = await Clipboard.read();
    return result.value ?? "";
  }
  return navigator.clipboard.readText();
}

/** 10. Share text through Android/iOS share sheets or the Web Share API. */
export async function shareNativeContent(input: {
  title: string;
  text: string;
  url?: string;
}): Promise<void> {
  if (isNativeApp()) {
    await Share.share({ title: input.title, text: input.text, url: input.url });
    return;
  }
  if (navigator.share) {
    await navigator.share(input);
    return;
  }
  await copyNativeText([input.title, input.text, input.url].filter(Boolean).join("\n"));
}

/** 11. Open a trusted HTTPS destination in the native in-app browser. */
export async function openNativeBrowser(value: string): Promise<void> {
  const url = new URL(value);
  if (!["https:", "http:"].includes(url.protocol)) throw new Error("UNSAFE_EXTERNAL_URL");
  if (isNativeApp()) {
    await Browser.open({ url: url.toString(), toolbarColor: "#FF6900" });
  } else {
    window.open(url.toString(), "_blank", "noopener,noreferrer");
  }
}

/** 12. Pick a photo from the gallery only when the user explicitly requests it. */
export async function chooseImageFromGallery(): Promise<NativeImageSelection | null> {
  const result = await Camera.chooseFromGallery({ quality: 88 });
  const image = result.results[0];
  if (!image) return null;
  return { uri: image.uri, webPath: image.webPath, name: "BALMZ-image" };
}

/** 13. Export text to the app cache; the caller may then share the returned file URI. */
export async function saveTextExport(fileName: string, content: string): Promise<string> {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 100) || "balmz-export.txt";
  const result = await Filesystem.writeFile({
    path: safeName,
    data: content,
    directory: Directory.Cache,
    encoding: Encoding.UTF8,
    recursive: true,
  });
  return result.uri;
}

/** 14. Persist a small, non-secret user preference using native Preferences. */
export async function getNativePreference(key: string): Promise<string | null> {
  const result = await Preferences.get({ key });
  return result.value;
}

/** 15. Store a small, non-secret user preference. Do not use this for API keys or passwords. */
export async function setNativePreference(key: string, value: string): Promise<void> {
  await Preferences.set({ key, value });
}

/** 16. Remove a saved native preference. */
export async function removeNativePreference(key: string): Promise<void> {
  await Preferences.remove({ key });
}

/** 17. Hide the native keyboard after a message is queued or a modal closes. */
export async function hideNativeKeyboard(): Promise<void> {
  if (isNativeApp()) await Keyboard.hide().catch(() => undefined);
}

/** 18. Set the BALMZ dark status bar style and brand background on native devices. */
export async function setBalmzStatusBar(): Promise<void> {
  if (!isNativeApp()) return;
  await StatusBar.setStyle({ style: Style.Dark }).catch(() => undefined);
  await StatusBar.setBackgroundColor({ color: "#080D15" }).catch(() => undefined);
}

/** 19. Lock portrait orientation only after an explicit user action. */
export async function lockPortraitOrientation(): Promise<void> {
  if (isNativeApp()) await ScreenOrientation.lock({ orientation: "portrait" });
}

/** 20. Restore adaptive orientation. */
export async function unlockScreenOrientation(): Promise<void> {
  if (isNativeApp()) await ScreenOrientation.unlock();
}

/** 21. Read whether a system screen reader is active. */
export async function isScreenReaderActive(): Promise<boolean> {
  if (!isNativeApp()) return false;
  const result = await ScreenReader.isEnabled();
  return result.value;
}

/** 22. Speak an optional accessibility announcement through supported screen readers. */
export async function announceForAccessibility(value: string): Promise<void> {
  if (!value.trim()) return;
  if (isNativeApp()) {
    await ScreenReader.speak({ value });
  } else if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(value));
  }
}

/** 23. Display a native confirmation dialog with a browser fallback. */
export async function confirmNativeAction(title: string, message: string): Promise<boolean> {
  if (isNativeApp()) {
    const result = await Dialog.confirm({ title, message, okButtonTitle: "Continue", cancelButtonTitle: "Cancel" });
    return result.value;
  }
  return window.confirm(message);
}

/** 24. Display a short native toast or an accessible browser fallback. */
export async function showNativeToast(message: string): Promise<void> {
  if (!message.trim()) return;
  if (isNativeApp()) {
    await Toast.show({ text: message, duration: "short", position: "bottom" });
  } else {
    window.dispatchEvent(new CustomEvent("balmz:toast", { detail: { message } }));
  }
}

/** 25. Schedule a local reminder; this method may trigger the OS permission prompt. */
export async function scheduleLocalReminder(input: {
  id: number;
  title: string;
  body: string;
  at: Date;
}): Promise<void> {
  if (!isNativeApp()) return;
  if (input.at.getTime() <= Date.now()) throw new Error("REMINDER_TIME_MUST_BE_FUTURE");
  await LocalNotifications.schedule({
    notifications: [{
      id: input.id,
      title: input.title,
      body: input.body,
      schedule: { at: input.at },
    }],
  });
}

/** 26. Check push permission without asking the user or registering the device. */
export async function checkPushPermission() {
  if (!isNativeApp()) return { receive: "denied" as const };
  return PushNotifications.checkPermissions();
}

/** 27. Register push notifications only after the user explicitly enables notifications. */
export async function enablePushNotificationsAfterConsent(): Promise<string> {
  if (!isNativeApp()) throw new Error("PUSH_NOTIFICATIONS_REQUIRE_NATIVE_APP");
  const permission = await PushNotifications.requestPermissions();
  if (permission.receive !== "granted") throw new Error("PUSH_PERMISSION_NOT_GRANTED");

  let registrationListener: { remove: () => Promise<void> } | undefined;
  let errorListener: { remove: () => Promise<void> } | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const tokenPromise = new Promise<string>((resolve, reject) => {
      void PushNotifications.addListener("registration", (token) => resolve(token.value))
        .then((listener) => { registrationListener = listener; })
        .catch(reject);
      void PushNotifications.addListener("registrationError", (error) => {
        reject(new Error(error.error || "PUSH_REGISTRATION_FAILED"));
      }).then((listener) => { errorListener = listener; }).catch(reject);
      timeout = setTimeout(() => reject(new Error("PUSH_REGISTRATION_TIMEOUT")), 15000);
    });
    await PushNotifications.register();
    return await tokenPromise;
  } finally {
    if (timeout) clearTimeout(timeout);
    if (registrationListener) await registrationListener.remove().catch(() => undefined);
    if (errorListener) await errorListener.remove().catch(() => undefined);
  }
}

/** 28. Ask the OS whether another application can handle a deep link. */
export async function canOpenNativeApp(url: string): Promise<boolean> {
  if (!isNativeApp()) return false;
  const result = await AppLauncher.canOpenUrl({ url });
  return result.value;
}

/** 29. Open an installed application only after checking that the scheme is supported. */
export async function openNativeApp(url: string): Promise<boolean> {
  if (!isNativeApp()) return false;
  const canOpen = await canOpenNativeApp(url);
  if (!canOpen) return false;
  const result = await AppLauncher.openUrl({ url });
  return result.completed;
}

/** 30. Expose native app info without using the device's persistent unique identifier. */
export async function getNativeAppInfo() {
  if (!isNativeApp()) return null;
  return App.getInfo();
}

/** 31. Listen for app foreground/background lifecycle changes. */
export async function listenToAppState(callback: (active: boolean) => void) {
  return App.addListener("appStateChange", ({ isActive }) => callback(isActive));
}
