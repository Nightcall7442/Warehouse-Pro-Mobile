import { useState, useEffect } from "react";
import { Image, type ImageStyle, type StyleProp } from "react-native";
import { SecureStore } from "../storage";
import { API_BASE } from "../api";

/**
 * Картинка из защищённой части приложения.
 *
 * Внешние ссылки (S3, http) отдаются как есть — они и так открыты.
 *
 * ── Почему токен идёт заголовком, а не в адресе ────────────────────────────
 *
 * Раньше к каждой внутренней ссылке приклеивался `?token=<весь JWT>`. Приём
 * рабочий, сервер его принимает, но у него есть цена, которую видно не сразу:
 * адрес — не секретное место.
 *
 * Адреса целиком попадают в журналы обращений на каждом узле по дороге: сам
 * сервер, обратный прокси, сеть доставки содержимого, кэш. Они хранятся
 * дольше сессии, их читает больше людей, чем базу, и регулярно уезжают в
 * системы разбора журналов. А токен здесь не узкий ключ на одну картинку —
 * это полный сессионный токен: с ним делают что угодно от имени человека.
 *
 * На экране каталога агент открывает сотни картинок за смену, и каждая
 * оставляла его токен ещё в одном журнале.
 *
 * Заголовок в такие журналы не попадает. React Native передаёт заголовки
 * источника картинки и на iOS, и на Android.
 */
export function SecureImage({ uri, style, resizeMode }: { uri?: string | null; style?: StyleProp<ImageStyle>; resizeMode?: "cover" | "contain" | "stretch" | "center" }) {
  /**
   * Внешние ссылки и пустая ссылка — чистые производные от uri, состояние им
   * не нужно. Раньше их выставлял эффект, то есть уже ПОСЛЕ кадра: внешняя
   * картинка один кадр не показывалась вовсе, и в списке товаров это читалось
   * как моргание. Состояние осталось только там, где без него нельзя — под
   * токен, который лежит в защищённом хранилище и читается не сразу.
   */
  const external = !!uri && (uri.startsWith("http://") || uri.startsWith("https://"));
  const [token, setToken] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (!uri || external) return;
    let cancelled = false;
    (async () => {
      try {
        const t = await SecureStore.getItemAsync("session_token");
        if (!cancelled) setToken(t ?? null);
      } catch {
        // Без токена сервер ответит 401 и картинка не покажется. Это лучше,
        // чем ронять экран из-за неудачного чтения хранилища.
        if (!cancelled) setToken(null);
      }
    })();
    return () => { cancelled = true; };
  }, [uri, external]);

  if (!uri) return null;

  if (external) {
    return <Image source={{ uri }} style={style} resizeMode={resizeMode} />;
  }

  // Токен ещё читается — рисовать нечего: без заголовка запрос вернёт 401, и
  // неудача осядет в кэше картинок.
  if (token === undefined) return null;

  const full = uri.startsWith("/") ? `${API_BASE}${uri}` : uri;

  return (
    <Image
      source={token ? { uri: full, headers: { Authorization: `Bearer ${token}` } } : { uri: full }}
      style={style}
      resizeMode={resizeMode}
    />
  );
}
