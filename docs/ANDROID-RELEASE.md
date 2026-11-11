# BALMZ AI Android application

## Native application identity

- Display name: BALMZ AI
- Android application ID: `com.balmz.ai`
- Production web origin: `https://balmz-ai.onrender.com`
- Native wrapper: Capacitor 8
- Brand asset: `assets/logo.svg` (shield with the BALMZ W mark; orange #F97316 palette)
- Minimum supported Android API: 24 (Android 7+)
- CI target SDK: Android API 36

The Android shell opens the same Render-hosted BALMZ AI application used by the web client. Authentication, server sessions, account data, subscriptions and admin authorization remain server-side and use the existing BALMZ AI Neon database. The app does not embed database credentials, AI keys, Paystack secrets or other server secrets.

## Build

The GitHub Actions workflow `.github/workflows/android-build.yml` builds on pull requests to `main`, pushes to `main`, and manual workflow dispatch.

It performs these steps:
1. Install the pinned project dependencies.
2. Generate the Capacitor Android project.
3. Generate launcher and splash resources from the BALMZ logo.
4. Sync Capacitor configuration and native plugins.
5. Build `assembleDebug`, `bundleDebug`, `assembleRelease` and `bundleRelease`.
6. Upload APK/AAB outputs as a GitHub Actions artifact.

The debug APK is signed with Android's automatically generated debug key and can be installed for testing. The debug AAB is also debug-signed and is not a Play Store upload.

Without an upload keystore, release APK/AAB outputs are unsigned. That is expected and must not be described as Play Store-ready.

## Configure Play Store release signing

Keep the Android upload keystore under the owner's control. Never commit the keystore, its passwords, or private signing material to the repository.

Add these repository Actions secrets:
- `ANDROID_UPLOAD_KEYSTORE_BASE64`: Base64-encoded JKS/PKCS12 upload keystore.
- `ANDROID_UPLOAD_KEYSTORE_PASSWORD`: keystore password.
- `ANDROID_UPLOAD_KEY_ALIAS`: upload key alias.
- `ANDROID_UPLOAD_KEY_PASSWORD`: upload key password.

When all four secrets are present, the Android workflow signs the release AAB and APK and verifies their signatures. Otherwise it still publishes the debug APK/AAB and clearly labels release files unsigned.

## Build artifacts

Open the repository's Actions tab, select the latest **BALMZ AI Android APK and AAB** run, and download its `BALMZ-AI-Android-...` artifact. The artifact includes `BUILD-INFO.txt`, which identifies the signing status of each output.

## Runtime and connectivity

The application is a thin native wrapper around the Render production web app. It requires an internet connection. It does not contain a local copy of the server-rendered Next.js application or work offline. Web updates deployed to Render become available to the Android app without rebuilding the native shell, while launcher/splash branding and native changes require another Android build.

## Release checks

Before publishing a store release:
- Configure the upload key secrets.
- Build a signed release AAB.
- Verify the application ID and version code.
- Test sign-up, sign-in, PIN setup/login, recovery, dashboard, and the Super Admin route on a physical Android device.
- Confirm external links, keyboard behavior, safe-area layout, back navigation and network-loss recovery.
- Complete Play Console policy, privacy, data safety, content rating and signing setup.


## Device validation record

The CI job verifies that the Android project, launcher assets, debug APK, debug AAB, and release bundle compile. It does not replace an on-device smoke test. Before public distribution, install the debug APK on a physical Android phone and test the authentication and responsive workspace routes listed in the release checklist above.
