import React, { useEffect, useRef, useState, useCallback, useImperativeHandle } from "react";
import { View, Text } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import Constants from "expo-constants";
import { useT } from "../i18n";

/**
 * The map key, from whichever source actually has one.
 *
 * `??` only falls through on null and undefined, so the placeholder that used to
 * sit in app.json — the literal string "YOUR_YANDEX_MAPS_API_KEY_HERE" — always
 * won, and every build asked Yandex to load the map with a key it would refuse.
 * The tracking screen showed an empty box and nothing said why. Anything that
 * looks like a placeholder is treated here as no key at all, so the same shape
 * of mistake cannot come back silently through a config file.
 */
const configuredKey = String(
  Constants.expoConfig?.extra?.yandexMapsApiKey ?? process.env.EXPO_PUBLIC_YANDEX_MAPS_API_KEY ?? "",
).trim();
/*
  Запасной ключ — тот же, что уходит в веб-сборку.

  На вебе карта супервайзера работала, в APK её не видели: eas.json не
  передавал EXPO_PUBLIC_YANDEX_MAPS_API_KEY ни одному профилю сборки, в
  app.json ключа тоже нет, и приложение уезжало к людям вообще без него.
  Переменная окружения по-прежнему главнее — это правильное место для
  собственного ключа; запасной нужен, чтобы карта не пропадала из-за
  незаполненной настройки сборки.
*/
const FALLBACK_KEY = "dd072e98-24e7-4b2e-b328-2989bd981fa5";
const looksLikePlaceholder = /^(YOUR_|CHANGE|<|xxx)/i.test(configuredKey);
const YANDEX_API_KEY = !configuredKey || looksLikePlaceholder ? FALLBACK_KEY : configuredKey;

export interface MapMarker {
  id: number;
  lat: number;
  lng: number;
  label: string;
  color: string;
  online?: boolean;
  batteryLevel?: number | null;
}

interface YandexMapViewProps {
  markers: MapMarker[];
  center?: { lat: number; lng: number };
  zoom?: number;
  onMarkerPress?: (id: number) => void;
  style?: object;
}

function batteryDotColor(level: number): string {
  if (level < 20) return "#d45050";
  if (level < 50) return "#d4973a";
  return "#34c473";
}

function buildMarkerSvg(m: MapMarker): string {
  const initial = m.label.charAt(0).toUpperCase();
  const pulse = m.online
    ? `<circle cx="20" cy="20" r="16" fill="none" stroke="${m.color}" stroke-width="1.5" opacity="0.5">
         <animate attributeName="r" from="16" to="23" dur="1.8s" repeatCount="indefinite"/>
         <animate attributeName="opacity" from="0.5" to="0" dur="1.8s" repeatCount="indefinite"/>
       </circle>`
    : "";
  const batteryBadge =
    m.batteryLevel != null && m.batteryLevel < 20
      ? `<circle cx="32" cy="8" r="6" fill="${batteryDotColor(m.batteryLevel)}" stroke="white" stroke-width="1.5"/>`
      : "";

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">` +
    pulse +
    `<circle cx="20" cy="20" r="16" fill="${m.color}" stroke="white" stroke-width="3"/>` +
    `<text x="20" y="25" text-anchor="middle" fill="white" font-family="sans-serif" font-weight="700" font-size="15">${initial}</text>` +
    batteryBadge +
    `</svg>`
  );
}

/**
 * Страница карты. Строится ОДИН раз, без меток.
 *
 * Раньше html пересобирался на каждую новую выдачу getAgentLocations — то есть
 * каждые несколько секунд, стоило хоть одному агенту сдвинуться, — и WebView
 * получал новый source и перезагружался: заново тянул api-maps.yandex.ru,
 * заново создавал плейсмарки, заново звал setBounds. Супервайзер, приблизивший
 * карту к нужному кварталу, терял и масштаб, и позицию, и открытый балун.
 * Теперь метки приезжают через updateMarkers() поверх живой карты.
 */
function buildHtml(center: { lat: number; lng: number }, zoom: number): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <style>
    html, body, #map { margin: 0; padding: 0; width: 100%; height: 100%; }
  </style>
  <script src="https://api-maps.yandex.ru/2.1/?apikey=${YANDEX_API_KEY}&lang=ru_RU"
          onerror="report('script')"></script>
  <script>
    // Скрипт карт не загрузился (нет сети или ключ отклонён) — экран должен
    // сказать это словами, а не остаться белым прямоугольником.
    function report(reason) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: "mapError", reason: reason }));
      }
    }
    var readyFired = false;
    setTimeout(function () { if (!readyFired) report("timeout"); }, 12000);
  </script>
  <script>
    var markers = [];
    var map;
    var pendingMarkers = null;
    var didFit = false;

    function renderMarkers() {
      map.geoObjects.removeAll();

      markers.forEach(function(m) {
        var placemark = new ymaps.Placemark([m.lat, m.lng], {
          balloonContentHeader: '<b>' + m.label + '</b>',
          balloonContentBody: m.batteryLevel != null ? ('🔋 ' + m.batteryLevel + '%') : '',
          hintContent: m.label,
        }, {
          iconLayout: "default#imageWithContent",
          iconImageHref: "data:image/svg+xml," + encodeURIComponent(m.svg),
          iconImageSize: [40, 40],
          iconImageOffset: [-20, -20],
          balloonPanelMaxMapArea: 0,
        });

        placemark.events.add("click", function() {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: "markerClick", id: m.id }));
        });

        map.geoObjects.add(placemark);
      });

      // Подгон вида — только когда метки пришли впервые. Делать это на каждой
      // выдаче значило бы отменять любое приближение супервайзера примерно
      // раз в несколько секунд; дальше вид меняет он сам или кнопка «Все».
      if (!didFit && markers.length > 0) {
        didFit = true;
        fitAll();
      }
    }

    function updateMarkers(json) {
      // Разбор здесь, а не вклейка снаружи: имя агента — чужой текст, и
      // разделители строк U+2028/U+2029 в нём ломали бы инъекцию целиком.
      markers = JSON.parse(json) || [];
      if (!map) { pendingMarkers = markers; return; }
      renderMarkers();
    }

    ymaps.ready(function() {
      map = new ymaps.Map("map", {
        center: [${center.lat}, ${center.lng}],
        zoom: ${zoom},
        controls: ["zoomControl", "geolocationControl"]
      });

      if (pendingMarkers) { pendingMarkers = null; renderMarkers(); }
    });

    function centerOn(lat, lng, zoom) {
      if (map) map.setCenter([lat, lng], zoom || 15);
    }

    function fitAll() {
      if (map && markers.length > 1) {
        map.setBounds(map.geoObjects.getBounds(), { checkZoomRange: true, zoomMargin: 40 });
      } else if (map && markers.length === 1) {
        map.setCenter([markers[0].lat, markers[0].lng], 14);
      }
    }
  </script>
</head>
<body>
  <div id="map"></div>
</body>
</html>`;
}

const YandexMapView = React.forwardRef<WebView, YandexMapViewProps>(function YandexMapView(
  { markers, center, zoom = 11, onMarkerPress, style },
  ref
) {
  const webRef = useRef<WebView>(null);
  const t = useT();
  useImperativeHandle(ref, () => webRef.current as WebView);

  const [loadError, setLoadError] = useState<string | null>(null);

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const data = JSON.parse(event.nativeEvent.data);
        if (data.type === "markerClick" && onMarkerPress) {
          onMarkerPress(data.id);
        }
        if (data.type === "mapError") setLoadError(String(data.reason ?? "unknown"));
      } catch {
        /* ignore */
      }
    },
    [onMarkerPress]
  );

  // Страница собирается один раз, по первому известному виду: и center, и zoom
  // на экране трекинга пересчитываются из выдачи локаций, поэтому реагировать на
  // их изменение — это и есть та самая перезагрузка карты под руками у человека.
  const htmlRef = useRef<string | null>(null);
  if (htmlRef.current === null) {
    const c =
      center ||
      (markers.length > 0
        ? {
            lat: markers.reduce((s, m) => s + m.lat, 0) / markers.length,
            lng: markers.reduce((s, m) => s + m.lng, 0) / markers.length,
          }
        : { lat: 41.2995, lng: 69.2401 });
    htmlRef.current = buildHtml(c, zoom);
  }
  // Объект source тоже должен быть стабильным: новый объект с тем же html
  // на Android всё равно считается новым источником и перезагружает страницу.
  const source = React.useMemo(() => ({ html: htmlRef.current as string }), []);

  // Метки доезжают до уже загруженной страницы инъекцией. Пока страница не
  // готова, последняя выдача лежит здесь и уйдёт в onLoadEnd — иначе первая
  // порция агентов терялась бы при холодном открытии экрана.
  const markersJsRef = useRef<string | null>(null);
  const loadedRef = useRef(false);

  useEffect(() => {
    const json = JSON.stringify(markers.map(m => ({ ...m, svg: buildMarkerSvg(m) })));
    if (json === markersJsRef.current) return;
    markersJsRef.current = json;
    if (loadedRef.current) {
      webRef.current?.injectJavaScript(`updateMarkers(${JSON.stringify(json)}); true;`);
    }
  }, [markers]);

  const handleLoadEnd = useCallback(() => {
    loadedRef.current = true;
    if (markersJsRef.current) {
      webRef.current?.injectJavaScript(`updateMarkers(${JSON.stringify(markersJsRef.current)}); true;`);
    }
  }, []);

  // A map with no key renders as a blank rectangle, which reads as a broken
  // screen rather than as a missing setting. Say which it is.
  if (!YANDEX_API_KEY) {
    return (
      <View style={[{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }, style]}>
        <Text style={{ textAlign: "center", fontSize: 13, opacity: 0.7 }}>
          {t("Карта недоступна: не задан ключ Яндекс.Карт. Его нужно передать сборке как EXPO_PUBLIC_YANDEX_MAPS_API_KEY.", "Xarita mavjud emas: Yandex.Xarita kaliti berilmagan. Uni yig'ishga EXPO_PUBLIC_YANDEX_MAPS_API_KEY sifatida berish kerak.")}
        </Text>
      </View>
    );
  }

  // Не загрузившаяся карта — белый прямоугольник, и по нему не отличить
  // отклонённый ключ от пропавшей сети. Говорим словами, что случилось.
  if (loadError) {
    return (
      <View style={[{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }, style]}>
        <Text style={{ textAlign: "center", fontSize: 13, opacity: 0.7 }}>
          {loadError === "timeout"
            ? t("Карта не открылась: нет связи с Яндекс.Картами. Проверьте интернет и потяните экран вниз.", "Xarita ochilmadi: Yandex.Xarita bilan aloqa yo'q. Internetni tekshiring va ekranni pastga torting.")
            : t("Карта не открылась: ключ Яндекс.Карт отклонён. Задайте свой ключ переменной EXPO_PUBLIC_YANDEX_MAPS_API_KEY при сборке.", "Xarita ochilmadi: Yandex.Xarita kaliti rad etildi. Yig'ishda EXPO_PUBLIC_YANDEX_MAPS_API_KEY o'zgaruvchisi bilan o'z kalitingizni bering.")}
        </Text>
      </View>
    );
  }

  return (
    <WebView
      ref={webRef}
      source={source}
      style={[{ flex: 1 }, style]}
      javaScriptEnabled
      allowsInlineMediaPlayback
      scrollEnabled={false}
      onMessage={handleMessage}
      onLoadEnd={handleLoadEnd}
      originWhitelist={["about:srcdoc", "https://yandex.ru", "https://*.yandex.ru", "https://yastatic.net"]}
    />
  );
});

export default YandexMapView;

export function centerOnAgent(webRef: React.RefObject<WebView | null>, lat: number, lng: number) {
  webRef.current?.injectJavaScript(`centerOn(${lat}, ${lng}, 15);`);
}

export function fitAllMarkers(webRef: React.RefObject<WebView | null>) {
  webRef.current?.injectJavaScript(`fitAll();`);
}
