import { useState, useEffect } from "react";
import { Image, type ImageStyle, type StyleProp } from "react-native";
import { SecureStore } from "../storage";
import { API_BASE } from "../api";

/**
 * Image component that appends a Bearer token for /api/photos URLs.
 * External (S3/http) URLs pass through untouched.
 */
export function SecureImage({ uri, style, resizeMode }: { uri?: string | null; style?: StyleProp<ImageStyle>; resizeMode?: "cover" | "contain" | "stretch" | "center" }) {
  /**
   * Внешние ссылки и пустая ссылка — это чистые производные от uri, состояние
   * им не нужно. Раньше их выставлял эффект, то есть уже ПОСЛЕ кадра: внешняя
   * картинка один кадр не показывалась вовсе (resolved ещё undefined, а при
   * undefined компонент возвращает null), и в списке товаров это читалось как
   * моргание. Состояние осталось только там, где без него нельзя — под
   * подписанную токеном внутреннюю ссылку.
   */
  const external = !!uri && (uri.startsWith("http://") || uri.startsWith("https://"));
  const [signed, setSigned] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!uri || external) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await SecureStore.getItemAsync("session_token");
        if (cancelled) return;
        const full = uri.startsWith("/") ? `${API_BASE}${uri}` : uri;
        setSigned(token ? (full.includes("?") ? `${full}&token=${token}` : `${full}?token=${token}`) : full);
      } catch {
        if (!cancelled) setSigned(uri.startsWith("/") ? `${API_BASE}${uri}` : uri);
      }
    })();
    return () => { cancelled = true; };
  }, [uri, external]);

  const resolved = !uri ? undefined : external ? uri : signed;

  if (!resolved) return null;
  return <Image source={{ uri: resolved }} style={style} resizeMode={resizeMode} />;
}
