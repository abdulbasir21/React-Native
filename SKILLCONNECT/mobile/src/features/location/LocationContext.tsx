import type { LocalityDto, LocationCheckDto } from "@skillconnect/shared";
import { useQuery } from "@tanstack/react-query";
import { createContext, useContext, useState, type ReactNode } from "react";
import { apiRequest } from "../../api/client";

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
  serviceableDistrictLabel: string;
  selectCoordinates: (lat: number, lng: number, label?: string) => Promise<void>;
  selectLocality: (loc: LocalityDto) => Promise<void>;
}

const LocationContext = createContext<LocationContextValue | null>(null);

export function LocationProvider({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useState<SelectedLocation | null>(null);

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
  const serviceableDistrictLabel = serviceableDistrict?.name ?? "supported regions";

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

  const selectCoordinates = async (lat: number, lng: number, label?: string) => {
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
  };

  const selectLocality = async (loc: LocalityDto) => {
    await selectCoordinates(loc.lat, loc.lng, loc.name);
  };

  return (
    <LocationContext.Provider
      value={{
        location: activeLocation,
        localities,
        isLoadingLocalities,
        serviceableDistrictLabel,
        selectCoordinates,
        selectLocality,
      }}
    >
      {children}
    </LocationContext.Provider>
  );
}

export function useLocationSelection() {
  const ctx = useContext(LocationContext);
  if (!ctx) throw new Error("useLocationSelection must be used inside LocationProvider");
  return ctx;
}
