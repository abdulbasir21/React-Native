import type { LocalityDto, LocationCheckDto } from "@skillconnect/shared";
import { useQuery } from "@tanstack/react-query";
import * as Location from "expo-location";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { apiRequest } from "../../api/client";

export type LocationSource = "gps" | "manual" | "fallback";

export interface SelectedLocation {
  label: string;
  lat: number;
  lng: number;
  localityId: string | null;
  outsideServiceArea: boolean;
}

interface LocationContextValue {
  location: SelectedLocation | null;
  localities: LocalityDto[];
  isLoadingLocalities: boolean;
  isDetectingGps: boolean;
  locationSource: LocationSource;
  serviceableDistrictLabel: string;
  selectCoordinates: (
    lat: number,
    lng: number,
    label?: string,
    source?: LocationSource
  ) => Promise<void>;
  selectLocality: (loc: LocalityDto) => Promise<void>;
  detectPhoneLocation: () => Promise<boolean>;
  useServiceableDistrict: () => void;
}

const LocationContext = createContext<LocationContextValue | null>(null);

const PLUS_CODE_REGEX = /^[A-Z0-9]{4,8}\+[A-Z0-9]{2,4}$/i;

function cleanPlacePart(value?: string | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed || PLUS_CODE_REGEX.test(trimmed)) return null;
  return trimmed;
}

async function reverseGeocodeLabel(
  lat: number,
  lng: number,
  fallbackName?: string | null
): Promise<string> {
  try {
    const places = await Location.reverseGeocodeAsync({
      latitude: lat,
      longitude: lng,
    });
    const first = places[0];
    if (first) {
      const primary =
        cleanPlacePart(first.district) ??
        cleanPlacePart(first.subregion) ??
        cleanPlacePart(first.name) ??
        cleanPlacePart(first.street);
      const secondary =
        cleanPlacePart(first.city) ?? cleanPlacePart(first.region);

      const rawParts = [primary, secondary].filter((part): part is string =>
        Boolean(part)
      );
      const parts = rawParts.filter(
        (part, idx, arr) =>
          arr.findIndex((x) => x.toLowerCase() === part.toLowerCase()) === idx
      );
      if (parts.length > 0) {
        return parts.join(", ");
      }
    }
  } catch {
    // Fall back cleanly if OS geocoder is unavailable
  }
  return fallbackName ?? `${lat.toFixed(3)}, ${lng.toFixed(3)}`;
}

export function LocationProvider({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useState<SelectedLocation | null>(null);
  const [locationSource, setLocationSource] =
    useState<LocationSource>("fallback");
  const [isDetectingGps, setIsDetectingGps] = useState(false);
  const autoDetectedRef = useRef(false);

  const { data: localities = [], isLoading: isLoadingLocalities } = useQuery({
    queryKey: ["catalog", "localities"],
    queryFn: async () => {
      const res = await apiRequest<{ localities: LocalityDto[] }>(
        "/api/v1/localities"
      );
      return res.localities;
    },
  });

  const serviceableDistrict = localities.find(
    (l) => l.level === "DISTRICT" && l.isServiceable
  );
  const serviceableDistrictLabel =
    serviceableDistrict?.name ?? "supported regions";

  const activeLocation: SelectedLocation | null =
    selected ??
    (serviceableDistrict
      ? {
          label: serviceableDistrict.name,
          lat: serviceableDistrict.lat,
          lng: serviceableDistrict.lng,
          localityId: serviceableDistrict.id,
          outsideServiceArea: false,
        }
      : null);

  const selectCoordinates = useCallback(
    async (
      lat: number,
      lng: number,
      label?: string,
      source: LocationSource = "manual"
    ) => {
      const check = await apiRequest<LocationCheckDto>(
        `/api/v1/localities/check?lat=${lat}&lng=${lng}`
      );
      setSelected({
        label:
          label ??
          check.nearestLocality?.name ??
          `${lat.toFixed(3)}, ${lng.toFixed(3)}`,
        lat,
        lng,
        localityId: check.nearestLocality?.id ?? null,
        outsideServiceArea: check.outsideServiceArea,
      });
      setLocationSource(source);
    },
    []
  );

  const selectLocality = useCallback(
    async (loc: LocalityDto) => {
      await selectCoordinates(loc.lat, loc.lng, loc.name, "manual");
    },
    [selectCoordinates]
  );

  const detectPhoneLocation = useCallback(async (): Promise<boolean> => {
    setIsDetectingGps(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        return false;
      }

      let pos: Location.LocationObject | null = null;
      try {
        pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
      } catch {
        pos = await Location.getLastKnownPositionAsync();
      }
      if (!pos) return false;

      const { latitude, longitude } = pos.coords;
      const check = await apiRequest<LocationCheckDto>(
        `/api/v1/localities/check?lat=${latitude}&lng=${longitude}`
      );
      const gpsLabel = await reverseGeocodeLabel(
        latitude,
        longitude,
        check.nearestLocality?.name ?? "Current GPS Location"
      );

      setSelected({
        label: gpsLabel,
        lat: latitude,
        lng: longitude,
        localityId: check.nearestLocality?.id ?? null,
        outsideServiceArea: check.outsideServiceArea,
      });
      setLocationSource("gps");
      return true;
    } catch {
      return false;
    } finally {
      setIsDetectingGps(false);
    }
  }, []);

  const useServiceableDistrict = useCallback(() => {
    if (!serviceableDistrict) return;
    setSelected({
      label: serviceableDistrict.name,
      lat: serviceableDistrict.lat,
      lng: serviceableDistrict.lng,
      localityId: serviceableDistrict.id,
      outsideServiceArea: false,
    });
    setLocationSource("manual");
  }, [serviceableDistrict]);

  useEffect(() => {
    if (autoDetectedRef.current) return;
    autoDetectedRef.current = true;
    void detectPhoneLocation();
  }, [detectPhoneLocation]);

  return (
    <LocationContext.Provider
      value={{
        location: activeLocation,
        localities,
        isLoadingLocalities,
        isDetectingGps,
        locationSource,
        serviceableDistrictLabel,
        selectCoordinates,
        selectLocality,
        detectPhoneLocation,
        useServiceableDistrict,
      }}
    >
      {children}
    </LocationContext.Provider>
  );
}

export function useLocationSelection() {
  const ctx = useContext(LocationContext);
  if (!ctx) {
    throw new Error(
      "useLocationSelection must be used inside LocationProvider"
    );
  }
  return ctx;
}
