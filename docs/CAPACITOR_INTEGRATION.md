# BALMZ AI Capacitor integration map

BALMZ AI uses Capacitor 8. The native bridge is mounted from `app/layout.tsx`, so its lifecycle, back-navigation, connectivity and keyboard behavior applies across the complete workplace. Web/PWA sessions keep browser-native fallbacks.

## Installed native integrations

| Capacitor package | BALMZ AI use |
|---|---|
| `@capacitor/app` | App metadata, foreground/background and Android hardware-back handling |
| `@capacitor/app-launcher` | Optional hand-off to installed companion applications |
| `@capacitor/browser` | Provider documentation and trusted external URLs from Plugins |
| `@capacitor/camera` | Explicit gallery image selection helper; not auto-opened |
| `@capacitor/clipboard` | Copy/read chat and diagnostics |
| `@capacitor/device` | Non-identifying device/OS diagnostics in Settings |
| `@capacitor/dialog` | Confirm family access grants and revocations |
| `@capacitor/filesystem` | Export conversations into the app cache before sharing |
| `@capacitor/haptics` | Send, copy and successful-response feedback |
| `@capacitor/keyboard` | Chat composer keyboard hide/resize lifecycle |
| `@capacitor/local-notifications` | User-triggered local reminder test |
| `@capacitor/network` | Offline state, chat send pause and queued-request resume |
| `@capacitor/preferences` | Persist selected AI model preference |
| `@capacitor/push-notifications` | Explicit-consent registration helper and permission check |
| `@capacitor/screen-orientation` | User-controlled portrait lock and adaptive restore |
| `@capacitor/screen-reader` | Accessibility state and response announcements |
| `@capacitor/share` | Share conversations and safe device diagnostics |
| `@capacitor/toast` | Native copy/export feedback |

`@capacitor/core`, `@capacitor/android`, `@capacitor/splash-screen` and `@capacitor/status-bar` remain the runtime/platform foundation. This is 18 additional Capacitor plugins on top of those foundation packages.

## Shared helper API

`lib/capacitor/native-helpers.ts` exports 31 reusable helpers:

1. `isNativeApp`
2. `getRuntimePlatform`
3. `getDeviceDetails`
4. `getNetworkState`
5. `listenToNetworkChanges`
6. `hapticTap`
7. `hapticNotice`
8. `copyNativeText`
9. `readNativeText`
10. `shareNativeContent`
11. `openNativeBrowser`
12. `chooseImageFromGallery`
13. `saveTextExport`
14. `getNativePreference`
15. `setNativePreference`
16. `removeNativePreference`
17. `hideNativeKeyboard`
18. `setBalmzStatusBar`
19. `lockPortraitOrientation`
20. `unlockScreenOrientation`
21. `isScreenReaderActive`
22. `announceForAccessibility`
23. `confirmNativeAction`
24. `showNativeToast`
25. `scheduleLocalReminder`
26. `checkPushPermission`
27. `enablePushNotificationsAfterConsent`
28. `canOpenNativeApp`
29. `openNativeApp`
30. `getNativeAppInfo`
31. `listenToAppState`

## Key UI wiring

- App shell: hardware back, app lifecycle, network broadcast, keyboard resize and orange/dark status bar.
- Chat: sequential send queue, offline pause/resume, haptics, screen-reader response announcement, native clipboard, share sheet, filesystem export and persisted selected model.
- Settings: safe device diagnostics, connectivity, haptic test, accessibility announcement, local notification test and orientation controls.
- Plugins: open official provider documentation inside the native browser.
- Super Admin Family Access: native/browser confirmation before bulk grant and revoke.

## Permission and service safeguards

- Camera/gallery, local notification and push permission flows are invoked only after an explicit user action.
- Push registration does not run automatically. A server-side push delivery provider and authenticated device-token storage endpoint must be configured before production push delivery can be enabled.
- Device diagnostics do not read or persist a hardware-unique device ID.
- Filesystem exports are written to the temporary app cache and shared by user action.
- Geolocation, contacts, microphone and other unrelated sensitive permissions are not requested.
- All provider API keys remain server-side; Capacitor Preferences are only used for non-secret preferences such as the selected model.

## Native build

After dependency installation or plugin changes, run `npx cap sync android`. The Android CI workflow already performs Capacitor sync before Gradle APK/AAB builds.