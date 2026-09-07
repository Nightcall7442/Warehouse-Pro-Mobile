import { useState, useEffect } from "react";
import { Image, View, type ImageStyle, type ViewStyle, type StyleProp } from "react-native";
import { Feather } from "@expo/vector-icons";
import { SecureStore } from "../storage";
import { API_BASE } from "../api";
import { useThemeColors } from "../store/theme";

/*
  Картинка из защищённой части сервера.

  ── Токен уходит заголовком, а не в адресе ──────────────────────────────────

  Раньше он дописывался к ссылке: `…/api/photos/shop/12?token=…`. Адреса
  оседают в журналах веб-сервера, обратных прокси и в заголовке Referer —
  сессия агента утекала туда целиком и жила там столько, сколько хранятся
  журналы. Заголовок в такие журналы не попадает. React Native передаёт
  заголовки источника картинки и на iOS, и на Android.

  ── Одно чтение хранилища на все картинки ───────────────────────────────────

  Защищённое хранилище — не переменная в памяти: прокрутка сетки товаров
  дёргала связку ключей на каждую плитку, и на дешёвом телефоне это видно по
  рывкам. Здесь хранится ОБЕЩАНИЕ, а не строка: одновременно смонтированные
  картинки ждут одно и то же чтение вместо десяти параллельных.

  Сбрасывается оно там же, где картинка не открылась: если сессия сменилась,
  следующая попытка возьмёт свежий токен.

  ── Внешние ссылки хранилища не трогают ─────────────────────────────────────

  Ссылка на чужой сервер и строка data: токена не требуют — читать ради них
  связку ключей незачем, и это заодно убирает лишний кадр ожидания.
*/
let tokenPromise: Promise<string | null> | null = null;

function sessionToken(): Promise<string | null> {
  const reading: Promise<string | null> =
    tokenPromise ?? SecureStore.getItemAsync("session_token").catch(() => null);
  tokenPromise = reading;
  return reading;
}

/** Забыть прочитанный токен: следующая картинка возьмёт свежий. */
function forgetToken(): void {
  tokenPromise = null;
}

export function SecureImage({ uri, style, resizeMode }: {
  uri?: string | null;
  style?: StyleProp<ImageStyle>;
  resizeMode?: "cover" | "contain" | "stretch" | "center";
}) {
  /*
    Внешняя ссылка и пустая — чистые производные от uri, состояние им не нужно.
    Раньше их выставлял эффект, то есть уже ПОСЛЕ кадра: внешняя картинка один
    кадр не показывалась вовсе, и в списке товаров это читалось как моргание.
  */
  const direct = !!uri && (uri.startsWith("http://") || uri.startsWith("https://") || uri.startsWith("data:"));

  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const colors = useThemeColors();

  useEffect(() => {
    if (!uri || direct) return;
    let cancelled = false;
    (async () => {
      // Токена нет — пробуем открыть без него: сервер ответит 401, и место
      // займёт заглушка. Это лучше, чем ронять экран из-за чтения хранилища.
      const t = await sessionToken();
      if (!cancelled) setToken(t);
    })();
    return () => { cancelled = true; };
  }, [uri, direct]);

  if (!uri) return null;

  if (failedUri === uri) {
    return (
      <View style={[style as StyleProp<ViewStyle>, { alignItems: "center", justifyContent: "center" }]}>
        <Feather name="image" size={22} color={colors.text.muted} />
      </View>
    );
  }

  if (direct) {
    return (
      <Image
        source={{ uri }}
        style={style}
        resizeMode={resizeMode}
        onError={() => setFailedUri(uri)}
      />
    );
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
      onError={() => {
        // Токен мог протухнуть вместе с сессией — пусть следующая картинка
        // перечитает хранилище, а на месте этой встанет заглушка.
        forgetToken();
        setFailedUri(uri);
      }}
    />
  );
}
