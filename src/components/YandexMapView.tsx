import React, { useEffect, useRef, useCallback } from "react";
import { Platform } from "react-native";
import { WebView } from "react-native-webview";

const YANDEX_API_KEY = "dd072e98-24e7-4b2e-b328-2989bd981fa5";

export interface MapMarker {
  id: number;
  lat: number;
  lng: number;
  label: string;
  color: string;
}

interface YandexMapViewProps {
  markers: MapMarker[];
  center?: { lat: number; lng: number };
  zoom?: number;
  onMarkerPress?: (id: number) => void;
  style?: object;
}

function buildHtml(markers: MapMarker[], center: { lat: number; lng: number }, zoom: number): string {
  const markersJson = JSON.stringify(markers);
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
          hintContent: m.label,
        }, {
          iconLayout: "default#imageWithContent",
          iconImageHref: "data:image/svg+xml," + encodeURIComponent(
            '<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36">' +
            '<circle cx="18" cy="18" r="16" fill="' + m.color + '" stroke="white" stroke-width="3"/>' +
            '<text x="18" y="23" text-anchor="middle" fill="white" font-family="sans-serif" font-weight="700" font-size="14">' +
            m.label.charAt(0).toUpperCase() + '</text></svg>'
          ),
          iconImageSize: [36, 36],
          iconImageOffset: [-18, -18],
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

export default function YandexMapView({ markers, center, zoom = 11, onMarkerPress, style }: YandexMapViewProps) {
  const webRef = useRef<WebView>(null);
  const centerRef = useRef(center);

  useEffect(() => {
    centerRef.current = center;
  }, [center]);

  const handleMessage = useCallback((event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === "markerClick" && onMarkerPress) {
        onMarkerPress(data.id);
      }
    } catch { /* ignore */ }
  }, [onMarkerPress]);

  const html = React.useMemo(() => {
    const c = center || (markers.length > 0
      ? { lat: markers.reduce((s, m) => s + m.lat, 0) / markers.length, lng: markers.reduce((s, m) => s + m.lng, 0) / markers.length }
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
}

export function centerOnAgent(webRef: React.RefObject<WebView | null>, lat: number, lng: number) {
  webRef.current?.injectJavaScript(`centerOn(${lat}, ${lng}, 15);`);
}

export function fitAllMarkers(webRef: React.RefObject<WebView | null>) {
  webRef.current?.injectJavaScript(`fitAll();`);
}
