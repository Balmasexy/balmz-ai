import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.balmz.ai",
  appName: "BALMZ AI",
  webDir: "www",
  server: {
    url: "https://balmz-ai.onrender.com",
    cleartext: false,
    allowNavigation: ["balmz-ai.onrender.com"],
    androidScheme: "https",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1800,
      launchAutoHide: true,
      backgroundColor: "#080D15",
      showSpinner: false,
      androidScaleType: "CENTER_INSIDE",
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#080D15",
    },    Keyboard: {
      resize: "native",
      resizeOnFullScreen: true,
    },
  },
};
export default config;
