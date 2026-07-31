import { useState, useEffect } from "react";
import { Image, type ImageStyle, type StyleProp, View } from "react-native";
import { SecureStore } from "../storage";
import { API_BASE } from "../api";

/**
 * Image component that appends a Bearer token for /api/photos URLs.
 * External (S3/http) URLs pass through untouched.
 */
export function SecureImage({ uri, style, resizeMode }: { uri?: string | null; style?: StyleProp<ImageStyle>; resizeMode?: "cover" | "contain" | "stretch" | "center" }) {
  const [resolved, setResolved] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!uri) { setResolved(undefined); return; }
    // External URLs don't need auth
    if (uri.startsWith("http://") || uri.startsWith("https://")) { setResolved(uri); return; }
    // Internal /api/photos URL — append token
    let cancelled = false;
    (async () => {
      try {
        const token = await SecureStore.getItemAsync("session_token");
        if (cancelled) return;
        const full = uri.startsWith("/") ? `${API_BASE}${uri}` : uri;
        setResolved(token ? (full.includes("?") ? `${full}&token=${token}` : `${full}?token=${token}`) : full);
      } catch {
        if (!cancelled) setResolved(uri.startsWith("/") ? `${API_BASE}${uri}` : uri);
      }
    })();
    return () => { cancelled = true; };
  }, [uri]);

  if (!resolved) return null;
  return <Image source={{ uri: resolved }} style={style} resizeMode={resizeMode} />;
}
