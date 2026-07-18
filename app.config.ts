import { ExpoConfig, ConfigContext } from "expo/config";
import { version } from "./package.json";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "Warehouse Pro",
  slug: "warehouse-pro-agent",
  version,
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "automatic",
  splash: {
    image: "./assets/splash.png",
    resizeMode: "contain",
    backgroundColor: "#0A0B10",
  },
  ios: {
    supportsTablet: false,
    bundleIdentifier: "com.warehousepro.agent",
    config: {
      googleMapsApiKey: process.env.GOOGLE_MAPS_IOS_API_KEY,
    },
    infoPlist: {
      NSLocationWhenInUseUsageDescription:
        "Warehouse Pro uses your location to track your visits and share with your supervisor.",
      NSLocationAlwaysAndWhenInUseUsageDescription:
        "Warehouse Pro uses background location for auto-tracking during work hours.",
      NSCameraUsageDescription:
        "Warehouse Pro uses the camera to scan product barcodes and take shop/product photos.",
      NSPhotoLibraryUsageDescription:
        "Warehouse Pro needs access to your photos to add shop and product images.",
    },
  },
  android: {
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#0A0B10",
    },
    package: "com.warehousepro.agent",
    config: {
      googleMaps: {
        apiKey: process.env.GOOGLE_MAPS_ANDROID_API_KEY,
      },
    },
    permissions: [
      "ACCESS_FINE_LOCATION",
      "ACCESS_COARSE_LOCATION",
      "ACCESS_BACKGROUND_LOCATION",
      "CAMERA",
      "READ_MEDIA_IMAGES",
    ],
  },
  plugins: [
    "expo-router",
    "expo-secure-store",
    "expo-location",
    "expo-camera",
    "expo-image-picker",
    "expo-notifications",
  ],
  experiments: {
    typedRoutes: true,
  },
  scheme: "warehousepro",
  extra: {
    router: {
      origin: false,
    },
    eas: {
      projectId: process.env.EAS_PROJECT_ID ?? "6ae2aa12-a019-46d5-a6d8-99c9ac55620f",
    },
  },
});