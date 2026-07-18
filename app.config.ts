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
  android: {
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#0A0B10",
    },
    package: "com.warehousepro.agent",
  },
  plugins: [
    "expo-router",
    "expo-secure-store",
    "expo-local-authentication",
    "expo-location",
    "expo-camera",
    "expo-image-picker",
    "expo-notifications",
    "react-native-maps",
  ],
  extra: {
    eas: {
      projectId: process.env.EAS_PROJECT_ID ?? "6ae2aa12-a019-46d5-a6d8-99c9ac55620f",
    },
  },
});