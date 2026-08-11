import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { AttendanceRecord } from "@/lib/hr/attendance-core";

// Default icon fix for bundlers
const icon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

interface Props {
  records: AttendanceRecord[];
  officeLat?: number | null;
  officeLng?: number | null;
  radiusM?: number;
}

type GeoRec = AttendanceRecord & {
  check_in_lat: number;
  check_in_lng: number;
  check_in_distance_m?: number | null;
};

export function LiveAttendanceMap({ records, officeLat, officeLng, radiusM }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMap = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  const points = useMemo<GeoRec[]>(
    () =>
      records.filter((r) => {
        const x = r as unknown as GeoRec;
        return x.check_in_lat != null && x.check_in_lng != null;
      }) as GeoRec[],
    [records],
  );


  useEffect(() => {
    if (!mapRef.current || leafletMap.current) return;
    const center: [number, number] =
      officeLat != null && officeLng != null
        ? [Number(officeLat), Number(officeLng)]
        : points[0]
          ? [points[0].check_in_lat, points[0].check_in_lng]
          : [24.7136, 46.6753]; // Riyadh default
    const map = L.map(mapRef.current).setView(center, 14);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap",
      maxZoom: 19,
    }).addTo(map);
    leafletMap.current = map;
    layerRef.current = L.layerGroup().addTo(map);
    return () => {
      map.remove();
      leafletMap.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = leafletMap.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();

    if (officeLat != null && officeLng != null) {
      L.circle([Number(officeLat), Number(officeLng)], {
        radius: radiusM || 100,
        color: "hsl(var(--primary))",
        fillColor: "hsl(var(--primary))",
        fillOpacity: 0.1,
        weight: 2,
      }).addTo(layer);
      L.marker([Number(officeLat), Number(officeLng)], { icon }).addTo(layer)
        .bindPopup("<b>المكتب</b>");
    }

    const bounds: [number, number][] = [];
    for (const r of points) {
      const color =
        r.status === "late" ? "#f59e0b" :
        r.status === "absent" ? "#ef4444" :
        r.status === "half_day" ? "#a855f7" : "#10b981";
      L.circleMarker([r.check_in_lat, r.check_in_lng], {
        radius: 8, color, fillColor: color, fillOpacity: 0.8, weight: 2,
      }).addTo(layer).bindPopup(
        `<b>${r.employee_name || "—"}</b><br/>الحالة: ${r.status}<br/>التاريخ: ${r.work_date}` +
        (r.check_in_distance_m != null ? `<br/>المسافة: ${r.check_in_distance_m}م` : ""),
      );
      bounds.push([r.check_in_lat, r.check_in_lng]);
    }
    if (officeLat != null && officeLng != null) bounds.push([Number(officeLat), Number(officeLng)]);
    if (bounds.length > 1) {
      map.fitBounds(L.latLngBounds(bounds).pad(0.2));
    }
  }, [points, officeLat, officeLng, radiusM]);

  return (
    <div
      ref={mapRef}
      className="w-full h-[500px] rounded-lg border overflow-hidden z-0"
      style={{ position: "relative" }}
    />
  );
}
