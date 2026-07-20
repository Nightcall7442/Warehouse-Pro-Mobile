import React, { useEffect, useRef, useCallback, useImperativeHandle } from "react";
import { WebView } from "react-native-webview";

const YANDEX_API_KEY = "dd072e98-24e7-4b2e-b328-2989bd981fa5";

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

function buildHtml(
  markers: MapMarker[],
  center: { lat: number; lng: number },
  zoom: number
): string {
  const markersJson = JSON.stringify(markers.map(m => ({ ...m, svg: buildMarkerSvg(m) })));
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
    var markers = ${markersJson};
    var map;

    ymaps.ready(function() {
      map = new ymaps.Map("map", {
        center: [${center.lat}, ${center.lng}],
        zoom: ${zoom},
        controls: ["zoomControl", "geolocationControl"]
      });

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

      if (markers.length > 1) {
        map.setBounds(map.geoObjects.getBounds(), { checkZoomRange: true, zoomMargin: 40 });
      } else if (markers.length === 1) {
        map.setCenter([markers[0].lat, markers[0].lng], 14);
      }
    });

    function centerOn(lat, lng, zoom) {
      if (map) map.setCenter([lat, lng], zoom || 15);
    }

    function fitAll() {
      if (map && markers.length > 0) {
        map.setBounds(map.geoObjects.getBounds(), { checkZoomRange: true, zoomMargin: 40 });
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

  const centerRef = useRef(center);
  useEffect(() => {
    centerRef.current = center;
  }, [center]);

  const handleMessage = useCallback(
    (event: any) => {
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

  const html = React.useMemo(() => {
    const c =
      center ||
      (markers.length > 0
        ? {
            lat: markers.reduce((s, m) => s + m.lat, 0) / markers.length,
            lng: markers.reduce((s, m) => s + m.lng, 0) / markers.length,
          }
        : { lat: 41.2995, lng: 69.2401 });
    return buildHtml(markers, c, zoom);
  }, [markers, center, zoom]);

  return (
    <WebView
      ref={webRef}
      source={{ html }}
      style={[{ flex: 1 }, style]}
      javaScriptEnabled
      allowsInlineMediaPlayback
      scrollEnabled={false}
      onMessage={handleMessage}
      originWhitelist={["*"]}
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
