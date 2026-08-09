# Warehouse Pro — Mobile App

React Native / Expo mobile application for field agents and supervisors. Connects to the Warehouse Pro backend via tRPC API.

---

## Features

- **Authentication** — Login with email/password, secure token storage
- **Shop Management** — View, create, and edit assigned shops
- **Order Creation** — Create orders with barcode scanning and offline support
- **GPS Tracking** — Background location updates for supervisor visibility
- **Daily Plans** — View and update visit plan status
- **Barcode Scanning** — Camera-based product lookup
- **Photo Capture** — Take shop/product photos and visit proof images
- **Supervisor Features** — Agent tracking map, plan assignment
- **Offline Support** — Create orders without connectivity, sync when online
- **White-Label** — Displays tenant branding (logo, company name, colors)

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | React Native 0.81 / Expo SDK 54 |
| Navigation | Expo Router 6 |
| State | Zustand 5, TanStack React Query 5 |
| HTTP | Axios 1.7 with tRPC adapter |
| Auth | expo-secure-store |
| Maps | react-native-maps |
| Camera | expo-camera |
| Location | expo-location |
| Fonts | DM Sans (expo-google-fonts) |
| Animations | react-native-reanimated 4 |

---

## Prerequisites

- **Node.js 20+**
- **npm 10+**
- **Expo CLI** (`npm install -g expo-cli`)
- **EAS CLI** (`npm install -g eas-cli`) — for builds
- **Xcode** (macOS only) — for iOS development
- **Android Studio** — for Android development
- **Physical device or emulator** — for testing

---

## Quick Start

### 1. Install dependencies

```bash
cd warehouse-pro-mobile/mobile
npm install
```

### 2. Configure environment

Create or edit `.env`:

```bash
# Backend URL — your local network IP or ngrok URL
EXPO_PUBLIC_API_URL=http://192.168.1.5:3000

# Google Maps API keys (for supervisor tracking screen)
GOOGLE_MAPS_ANDROID_API_KEY=your-key
GOOGLE_MAPS_IOS_API_KEY=your-key
```

**Finding your IP:**
- Windows: `ipconfig` → IPv4 Address
- Mac/Linux: `ifconfig | grep inet`

**Using ngrok (recommended for remote devices):**
```bash
# Install ngrok
npm install -g ngrok

# Expose local server
ngrok http 3000

# Copy the HTTPS URL to .env
EXPO_PUBLIC_API_URL=https://your-id.ngrok-free.dev
```

### 3. Start development server

```bash
npm run start
```

Or with cleared cache:
```bash
npm run start -- --clear
```

### 4. Run on device/emulator

Press:
- **a** — Run on Android emulator/device
- **i** — Run on iOS simulator/device
- **w** — Run on web browser

---

## Development Commands

```bash
# Development
npm run start              # Start Expo dev server
npm run start:tunnel       # Start with tunnel (for remote devices)
npm run start -- --clear   # Start with cleared cache
npm run android            # Run on Android
npm run ios                # Run on iOS
npm run web                # Run on web

# Building
npm run build:android      # Build for Android (EAS)
npm run build:ios          # Build for iOS (EAS)
npm run prebuild           # Regenerate native projects

# Type checking
npx tsc --noEmit           # TypeScript type check
```

---

## Project Structure

```
warehouse-pro-mobile/mobile/
├── app/                        # Expo Router screens
│   ├── _layout.tsx             # Root layout (providers, splash screen)
│   ├── (auth)/                 # Authentication screens
│   │   ├── _layout.tsx         # Auth layout (stack navigator)
│   │   └── login.tsx           # Login screen
│   ├── (tabs)/                 # Main tab screens
│   │   ├── _layout.tsx         # Tab navigator configuration
│   │   ├── index.tsx           # Home screen (role-based)
│   │   ├── shops.tsx           # Shop list screen
│   │   ├── orders.tsx          # Order list screen
│   │   ├── plans.tsx           # Daily plans screen
│   │   ├── gps.tsx             # GPS tracking controls
│   │   ├── tracking.tsx        # Agent tracking map (supervisor)
│   │   ├── barcode.tsx         # Barcode scanner screen
│   │   └── profile.tsx         # User profile screen
│   ├── order/                  # Order detail screens
│   │   ├── new.tsx             # Create new order (3-step wizard)
│   │   └── [id].tsx            # Order detail view
│   └── shop/                   # Shop detail screens
│       └── [id].tsx            # Shop detail with edit
├── src/                        # Shared source code
│   ├── api.ts                  # API client (tRPC over axios)
│   ├── storage.ts              # SecureStore wrapper for tokens
│   ├── theme.ts                # Theme constants and colors
│   ├── components/             # Shared UI components
│   │   ├── ui.tsx              # Base UI components (Button, Card, etc.)
│   │   ├── Animated.tsx        # Animation components
│   │   ├── ErrorBoundary.tsx   # Error boundary component
│   │   └── Toast.tsx           # Toast notification component
│   └── store/                  # Zustand state stores
│       ├── auth.ts             # Authentication state
│       ├── offline.ts          # Offline order queue
│       ├── branding.ts         # Tenant branding cache
│       ├── theme.ts            # Theme state
│       └── toast.ts            # Toast notification state
├── assets/                     # Static assets (icons, splash screens)
├── app.config.ts               # Expo configuration
├── babel.config.js             # Babel configuration
├── metro.config.js             # Metro bundler configuration
├── tsconfig.json               # TypeScript configuration
└── package.json
```

---

## Architecture

### Authentication Flow

```
Login Screen → API Login → SecureStore (token) → Zustand Auth Store → Tab Navigation
                                    ↓
App Launch → SecureStore (read token) → API GET /auth.me → Zustand Auth Store
```

### API Client

The mobile app communicates with the backend via a tRPC-over-HTTP adapter:

```typescript
// src/api.ts
const api = axios.create({
  baseURL: `${API_BASE}/api/trpc`,
  timeout: 15_000,
});

// Automatically attaches JWT token to all requests
api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync("session_token");
  if (token) config.headers["Authorization"] = `Bearer ${token}`;
  return config;
});
```

### Offline Support

Orders created offline are stored in AsyncStorage and synced when connectivity returns:

```typescript
// Create offline order
await useOfflineStore.getState().addOrder({
  id: uuid(),
  input: { shopId: 1, items: [...] },
  shopName: "Shop Name",
  createdAt: new Date().toISOString(),
  synced: false,
});

// Sync when online
const result = await useOfflineStore.getState().syncAll();
// { synced: 3, failed: 0 }
```

### State Management

| Store | Purpose |
|-------|---------|
| `auth.ts` | User authentication state, login/logout/hydrate |
| `offline.ts` | Offline order queue with sync |
| `branding.ts` | Tenant branding cache |
| `theme.ts` | Dark/light theme preference |
| `toast.ts` | Toast notification queue |

---

## Screens Overview

### Tab Navigation

| Tab | Screen | Role | Description |
|-----|--------|------|-------------|
| Home | `index.tsx` | All | Role-based dashboard (agent KPIs or supervisor overview) |
| Shops | `shops.tsx` | Agent | List of assigned shops with search/filter |
| Orders | `orders.tsx` | Agent | List of orders with status filters |
| Plans | `plans.tsx` | Agent/Supervisor | Daily visit plans |
| Profile | `profile.tsx` | All | User settings, password change |

### Additional Screens

| Screen | Role | Description |
|--------|------|-------------|
| `tracking.tsx` | Supervisor | Real-time agent location map |
| `gps.tsx` | Agent | GPS tracking controls (auto/manual) |
| `barcode.tsx` | Agent | Barcode scanner for product lookup |
| `order/new.tsx` | Agent | 3-step order creation wizard |
| `order/[id].tsx` | Agent | Order detail with items |
| `shop/[id].tsx` | Agent | Shop detail with edit/photo upload |

---

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `EXPO_PUBLIC_API_URL` | Yes | Backend API URL |
| `GOOGLE_MAPS_ANDROID_API_KEY` | For tracking | Google Maps API key for Android |
| `GOOGLE_MAPS_IOS_API_KEY` | For tracking | Google Maps API key for iOS |

### Expo Config (`app.config.ts`)

Key configuration:
- **Bundle ID:** `com.warehousepro.agent`
- **Scheme:** `warehousepro` (for deep linking)
- **Orientation:** Portrait
- **Splash:** Dark background (#0A0B10)
- **Plugins:** expo-router, expo-secure-store, expo-location, expo-camera, expo-image-picker, expo-notifications

---

## Building for Production

### EAS Build (Recommended)

```bash
# Install EAS CLI
npm install -g eas-cli

# Login to Expo
eas login

# Configure EAS
eas build:configure

# Build for Android
eas build --platform android

# Build for iOS
eas build --platform ios
```

### Local Build (Android)

```bash
# Generate native project
npx expo prebuild --clean

# Build APK
cd android && ./gradlew assembleRelease
```

### App Store Deployment

1. Build with EAS: `eas build --platform ios --profile production`
2. Submit to App Store: `eas submit --platform ios`
3. For Android: Build AAB and upload to Google Play Console

---

## Google Maps Setup

The tracking screen (`tracking.tsx`) requires Google Maps API keys:

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a project (or use existing)
3. Enable "Maps SDK for Android" and "Maps SDK for iOS"
4. Create API keys for each platform
5. Add keys to `.env`:
   ```
   GOOGLE_MAPS_ANDROID_API_KEY=your-android-key
   GOOGLE_MAPS_IOS_API_KEY=your-ios-key
   ```

Without keys, the tracking screen shows a gray empty map without errors.

---

## Troubleshooting

### `EXPO_PUBLIC_API_URL` warnings

Set the variable in `.env` before starting:
```bash
EXPO_PUBLIC_API_URL=http://your-local-ip:3000
```

### App can't connect to backend

1. Ensure the backend server is running (`npm run dev` in web project)
2. Ensure your device/emulator can reach the server IP
3. For physical devices, use your machine's local network IP (not `localhost`)
4. Consider using ngrok for remote access

### Camera/Location permissions not working

Ensure you granted permissions on first launch. To reset:
- iOS: Settings → Warehouse Pro → Reset Location/Privacy
- Android: Settings → Apps → Warehouse Pro → Permissions

### TypeScript errors

```bash
npx tsc --noEmit
```

If errors persist after installing dependencies:
```bash
rm -rf node_modules
npm install
```

### Build fails on EAS

Check the build logs. Common issues:
- Missing `EXPO_PUBLIC_API_URL` in EAS environment
- Node version mismatch (use Node 20+)
- Outdated dependencies (run `npm install` to update)

### Barcode scanner not working

- Ensure camera permission is granted
- Test on a physical device (emulators may not have cameras)
- Check lighting conditions

---

## Related Documentation

- [Web App README](../../warehouse-pro-web/web/README.md)
- [API Reference](../../warehouse-pro-web/web/docs/api/README.md)
- [Architecture Overview](../../warehouse-pro-web/web/docs/architecture/README.md)
- [Changelog](../../CHANGELOG.md)
