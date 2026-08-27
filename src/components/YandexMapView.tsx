import React, { useEffect, useRef, useCallback, useImperativeHandle } from "react";
import { View, Text } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import Constants from "expo-constants";

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
const YANDEX_API_KEY = /^(YOUR_|CHANGE|<|xxx)/i.test(configuredKey) ? "" : configuredKey;

export interface MapMarker {
  id: number;
  lat: number;
  lng: number;
  label: string;
  color: string;
  online?: boolean;
  batteryLevel?: number | null;
  /**
   * Кто это на карте.
   *
   * Агент и магазин рисуются по-разному намеренно: одинаковые кружки разного
   * цвета супервайзер прочитал бы как «агент онлайн» и «агент офлайн», а не
   * как две разные сущности. Круг — человек, квадрат — точка на местности.
   */
  kind?: "agent" | "shop";
  /** Строка под названием: чем магазин заслужил свой цвет. */
  note?: string;
  /** Плавает ли булавка. Ставится вызывающим по числу меток на карте. */
  animated?: boolean;
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

/** Размер картинки булавки и точка привязки — остриё, а не центр. */
export const SHOP_PIN_SIZE: [number, number] = [30, 40];
export const SHOP_PIN_ANCHOR: [number, number] = [-15, -38];

/**
 * Выше этого числа меток анимация выключается: каждая метка — отдельная
 * картинка, и её SMIL считает сам движок. Два десятка плавающих булавок
 * выглядят живо, три сотни съедают кадры и батарею ради эффекта, которого на
 * такой плотности всё равно не видно.
 */
export const SHOP_PIN_ANIMATION_LIMIT = 60;

/**
 * Булавка магазина.
 *
 * Разметка совпадает с веб-версией (src/lib/shop-tier.ts в репозитории
 * сервера) до пикселя — намеренно: супервайзер за компьютером и агент в поле
 * должны видеть одну и ту же метку, иначе разговор о «красных» превращается в
 * выяснение, кто что видит.
 *
 * Раньше здесь был плоский квадрат 20×20. На карте Яндекса он терялся среди её
 * собственных значков — метро, аптек, банкоматов — и читался как артефакт
 * отрисовки, а не как объект приложения.
 *
 * Что делает форму меткой, а не пятном: силуэт булавки с остриём (и привязка
 * именно к острию — метка стоит на адресе, а не парит центром над ним), тень
 * на земле, белая обводка (карта под меткой бывает любого цвета) и значок
 * лавки внутри — цвет говорит «как платит», форма должна говорить «магазин».
 */
function shopPinSvg(color: string, animated: boolean): string {
  const float = animated
    ? `<animateTransform attributeName="transform" type="translate"
         values="0 0; 0 -2.2; 0 0" keyTimes="0;0.5;1" dur="3s"
         calcMode="spline" keySplines="0.4 0 0.6 1; 0.4 0 0.6 1"
         repeatCount="indefinite"/>`
    : "";
  // Тень дышит вместе с булавкой: когда та поднимается, пятно чуть меньше и
  // светлее. Без этого «полёт» читается как дрожание.
  const shadowPulse = animated
    ? `<animate attributeName="rx" values="5;3.8;5" keyTimes="0;0.5;1" dur="3s"
         calcMode="spline" keySplines="0.4 0 0.6 1; 0.4 0 0.6 1" repeatCount="indefinite"/>
       <animate attributeName="opacity" values="0.22;0.13;0.22" keyTimes="0;0.5;1" dur="3s"
         calcMode="spline" keySplines="0.4 0 0.6 1; 0.4 0 0.6 1" repeatCount="indefinite"/>`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="40" viewBox="0 0 30 40">
  <ellipse cx="15" cy="37" rx="5" ry="1.7" fill="#000" opacity="0.22">${shadowPulse}</ellipse>
  <g>${float}
    <path d="M15 1.6c-5.3 0-9.6 4.2-9.6 9.4 0 6.8 8.4 14.9 8.7 15.3.5.5 1.3.5 1.8 0 .3-.4 8.7-8.5 8.7-15.3 0-5.2-4.3-9.4-9.6-9.4z"
          fill="${color}" stroke="#ffffff" stroke-width="2"/>
    <path d="M9.6 7.4h10.8l.9 2.5H8.7z" fill="#ffffff"/>
    <path d="M10.3 10.6h9.4v5.1h-9.4z" fill="#ffffff"/>
    <rect x="13.3" y="12.1" width="3.4" height="3.6" rx="0.4" fill="${color}"/>
  </g>
</svg>`;
}

function buildMarkerSvg(m: MapMarker): string {
  if (m.kind === "shop") return shopPinSvg(m.color, m.animated === true);

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
  <script src="https://api-maps.yandex.ru/2.1/?apikey=${YANDEX_API_KEY}&lang=ru_RU"></script>
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
          balloonContentBody: m.note ? m.note : (m.batteryLevel != null ? ('🔋 ' + m.batteryLevel + '%') : ''),
          hintContent: m.label,
        }, {
          iconLayout: "default#imageWithContent",
          iconImageHref: "data:image/svg+xml," + encodeURIComponent(m.svg),
          // Размер и привязка приходят с самой меткой: у булавки магазина
          // якорь на острие, у круга агента — по центру.
          iconImageSize: m.iconSize || [40, 40],
          iconImageOffset: m.iconAnchor || [-20, -20],
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

    function updateMarkers(list) {
      markers = list || [];
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
  useImperativeHandle(ref, () => webRef.current as WebView);

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const data = JSON.parse(event.nativeEvent.data);
        if (data.type === "markerClick" && onMarkerPress) {
          onMarkerPress(data.id);
        }
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
    const json = JSON.stringify(markers.map(m => ({
      ...m,
      svg: buildMarkerSvg(m),
      iconSize: m.kind === "shop" ? SHOP_PIN_SIZE : [40, 40],
      iconAnchor: m.kind === "shop" ? SHOP_PIN_ANCHOR : [-20, -20],
    })));
    if (json === markersJsRef.current) return;
    markersJsRef.current = json;
    if (loadedRef.current) {
      webRef.current?.injectJavaScript(`updateMarkers(${json}); true;`);
    }
  }, [markers]);

  const handleLoadEnd = useCallback(() => {
    loadedRef.current = true;
    if (markersJsRef.current) {
      webRef.current?.injectJavaScript(`updateMarkers(${markersJsRef.current}); true;`);
    }
  }, []);

  // A map with no key renders as a blank rectangle, which reads as a broken
  // screen rather than as a missing setting. Say which it is.
  if (!YANDEX_API_KEY) {
    return (
      <View style={[{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }, style]}>
        <Text style={{ textAlign: "center", fontSize: 13, opacity: 0.7 }}>
          Карта недоступна: не задан ключ Яндекс.Карт. Его нужно передать сборке как EXPO_PUBLIC_YANDEX_MAPS_API_KEY.
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
