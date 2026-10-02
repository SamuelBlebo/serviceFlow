import type { ConfigContext, ExpoConfig } from "expo/config";

/**
 * ServiceFlow mobile app config.
 *
 * Identifiers are DEVELOPMENT PLACEHOLDERS (Decision D6): `dev.serviceflow.app`.
 * Replace them — and the Firebase native config files — before any store
 * release. Changing a published package id later means a brand-new app listing.
 *
 * React Native Firebase reads its Firebase config from native files at build
 * time. By default we point at demo files (project `demo-serviceflow`), which
 * are enough to run a development build against the local emulators. For a
 * real project, set GOOGLE_SERVICES_JSON / GOOGLE_SERVICE_INFO_PLIST to the
 * files downloaded from the Firebase console (never committed).
 */
const APP_ID = "dev.serviceflow.app";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "ServiceFlow",
  slug: "service-flow",
  scheme: "serviceflow",
  version: "0.1.0",
  orientation: "portrait",
  userInterfaceStyle: "light",
  platforms: ["android", "ios"],
  android: {
    package: APP_ID,
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? "./firebase/google-services.demo.json",
    adaptiveIcon: { backgroundColor: "#0E6B4C" },
  },
  ios: {
    bundleIdentifier: APP_ID,
    googleServicesFile: process.env.GOOGLE_SERVICE_INFO_PLIST ?? "./firebase/GoogleService-Info.demo.plist",
    supportsTablet: false,
  },
  plugins: [
    "expo-router",
    "@react-native-firebase/app",
    [
      "expo-image-picker",
      {
        cameraPermission: "ServiceFlow uses your camera to photograph your ID and take a selfie for provider verification.",
        photosPermission: "ServiceFlow lets you choose a photo of your ID from your gallery for provider verification.",
        microphonePermission: false,
      },
    ],
    [
      "expo-location",
      {
        // Asked once when a technician sets off for a job; never tracked in the background.
        locationWhenInUsePermission: "ServiceFlow records where you set off from when you start travelling to a job.",
        isAndroidBackgroundLocationEnabled: false,
      },
    ],
    [
      "expo-build-properties",
      {
        // Required by React Native Firebase on iOS.
        ios: { useFrameworks: "static" },
      },
    ],
  ],
  experiments: { typedRoutes: true },
});
