import { useState, useEffect, useMemo } from "react";
import { Image, type ImageStyle, type StyleProp } from "react-native";
import { SecureStore } from "../storage";
import { API_BASE } from "../api";

/**
 * Image component that appends a Bearer token for /api/photos URLs.
 * External (S3/http) URLs pass through untouched.
 */
export function SecureImage({ uri, style, resizeMode }: { uri?: string | null; style?: StyleProp<ImageStyle>; resizeMode?: "cover" | "contain" | "stretch" | "center" }) {
  // External URLs resolve synchronously — no token needed
  const syncUrl = useMemo(() => {
    if (!uri) return null;
    if (uri.startsWith("http://") || uri.startsWith("https://")) return uri;
    return null;
  }, [uri]);

  // Internal /api/photos URLs need an async token append
  const [tokenUrl, setTokenUrl] = useState<string | undefined>(undefined);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clear stale token URL when uri changes
    if (!uri || syncUrl) { setTokenUrl(undefined); return; }
    let cancelled = false;
    (async () => {
      try {
        const token = await SecureStore.getItemAsync("session_token");
        if (cancelled) return;
        const full = uri.startsWith("/") ? `${API_BASE}${uri}` : uri;
        setTokenUrl(token ? (full.includes("?") ? `${full}&token=${token}` : `${full}?token=${token}`) : full);
      } catch {
        if (!cancelled) setTokenUrl(uri.startsWith("/") ? `${API_BASE}${uri}` : uri);
      }
    })();
    return () => { cancelled = true; };
  }, [uri, syncUrl]);

  const resolved = syncUrl || tokenUrl;
  if (!resolved) return null;
  return <Image source={{ uri: resolved }} style={style} resizeMode={resizeMode} />;
}
