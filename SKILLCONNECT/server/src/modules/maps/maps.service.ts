import type {
  PlaceDetailsDto,
  PlaceSuggestionDto,
  TravelEstimateDto,
} from "@skillconnect/shared";
import type { AppConfig } from "../../config/env.js";
import type { PrismaClient } from "../../generated/prisma/index.js";
import { formatDistanceLabel } from "../../domain/discovery.js";

export type FetchLike = (
  url: string,
  init?: RequestInit
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

const CACHE_TTL_MS = 15 * 60 * 1000;

function formatDurationLabel(seconds: number): string {
  const mins = Math.max(1, Math.round(seconds / 60));
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem === 0 ? `${hrs} hr` : `${hrs} hr ${rem} min`;
}

export function createMapsService(
  prisma: PrismaClient,
  config: AppConfig,
  fetchFn: FetchLike = fetch
) {
  const routeCache = new Map<
    string,
    { expiresAt: number; value: TravelEstimateDto }
  >();

  /**
   * R2-4: Places API (New) autocomplete biased to supported area.
   * Never uses Geocoding API; falls back cleanly to manual locality picker if key/API unavailable.
   */
  const autocompletePlaces = async (
    q: string,
    lat?: number,
    lng?: number
  ): Promise<{ suggestions: PlaceSuggestionDto[]; fallbackToManual: boolean }> => {
    const apiKey = config.GOOGLE_MAPS_SERVER_KEY;
    if (!apiKey) {
      return { suggestions: [], fallbackToManual: true };
    }

    try {
      let biasLat = lat;
      let biasLng = lng;
      if (biasLat === undefined || biasLng === undefined) {
        const rows = await prisma.$queryRaw<{ lat: number; lng: number }[]>`
          SELECT ST_Y(center::geometry) AS lat, ST_X(center::geometry) AS lng
          FROM localities
          WHERE is_serviceable = true
          ORDER BY level ASC
          LIMIT 1
        `;
        biasLat = rows[0]?.lat;
        biasLng = rows[0]?.lng;
      }

      const body: Record<string, unknown> = {
        input: q,
        includedRegionCodes: ["pk"],
      };
      if (biasLat !== undefined && biasLng !== undefined) {
        body.locationBias = {
          circle: {
            center: { latitude: biasLat, longitude: biasLng },
            radius: config.LOCATION_MATCH_RADIUS_KM * 1000,
          },
        };
      }

      const res = await fetchFn(
        "https://places.googleapis.com/v1/places:autocomplete",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": apiKey,
          },
          body: JSON.stringify(body),
        }
      );

      if (!res.ok) {
        return { suggestions: [], fallbackToManual: true };
      }

      const data = (await res.json()) as {
        suggestions?: Array<{
          placePrediction?: {
            placeId?: string;
            structuredFormat?: {
              mainText?: { text?: string };
              secondaryText?: { text?: string };
            };
          };
        }>;
      };

      const suggestions: PlaceSuggestionDto[] = (data.suggestions ?? [])
        .map((s) => s.placePrediction)
        .filter((p): p is NonNullable<typeof p> => Boolean(p?.placeId))
        .map((p) => ({
          placeId: p.placeId!,
          mainText: p.structuredFormat?.mainText?.text ?? "",
          secondaryText: p.structuredFormat?.secondaryText?.text ?? "",
        }))
        .filter((s) => s.mainText.length > 0);

      return { suggestions, fallbackToManual: false };
    } catch {
      return { suggestions: [], fallbackToManual: true };
    }
  };

  /**
   * R2-4: Places API (New) place details (returns coordinates without Geocoding API).
   */
  const getPlaceDetails = async (
    placeId: string
  ): Promise<{ place: PlaceDetailsDto | null; fallbackToManual: boolean }> => {
    const apiKey = config.GOOGLE_MAPS_SERVER_KEY;
    if (!apiKey) {
      return { place: null, fallbackToManual: true };
    }

    try {
      const res = await fetchFn(
        `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
        {
          method: "GET",
          headers: {
            "X-Goog-Api-Key": apiKey,
            "X-Goog-FieldMask": "id,displayName,formattedAddress,location",
          },
        }
      );
      if (!res.ok) {
        return { place: null, fallbackToManual: true };
      }

      const data = (await res.json()) as {
        id?: string;
        displayName?: { text?: string };
        formattedAddress?: string;
        location?: { latitude?: number; longitude?: number };
      };

      if (
        typeof data.location?.latitude !== "number" ||
        typeof data.location?.longitude !== "number"
      ) {
        return { place: null, fallbackToManual: true };
      }

      return {
        place: {
          placeId: data.id ?? placeId,
          name: data.displayName?.text ?? data.formattedAddress ?? "Selected place",
          formattedAddress: data.formattedAddress ?? "",
          lat: data.location.latitude,
          lng: data.location.longitude,
        },
        fallbackToManual: false,
      };
    } catch {
      return { place: null, fallbackToManual: true };
    }
  };

  /**
   * R2-5: Routes API travel distance and duration estimate.
   * Server-side only; never exposes provider center coordinates; caches & fails gracefully.
   */
  const getTravelEstimate = async (
    providerProfileId: string,
    originLat: number,
    originLng: number
  ): Promise<TravelEstimateDto | null> => {
    const apiKey = config.GOOGLE_MAPS_SERVER_KEY;
    if (!apiKey) {
      return null;
    }

    const cacheKey = `${providerProfileId}:${originLat.toFixed(3)}:${originLng.toFixed(3)}`;
    const cached = routeCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    try {
      const areaRows = await prisma.$queryRaw<{ lat: number; lng: number }[]>`
        SELECT ST_Y(sa.center::geometry) AS lat, ST_X(sa.center::geometry) AS lng
        FROM service_areas sa
        JOIN provider_profiles pp ON pp.id = sa.provider_profile_id
        JOIN users u ON u.id = pp.user_id
        WHERE sa.provider_profile_id = ${providerProfileId}::uuid
          AND pp.status = 'APPROVED'
          AND u.status = 'ACTIVE'
        LIMIT 1
      `;
      const dest = areaRows[0];
      if (!dest) {
        return null;
      }

      const res = await fetchFn(
        "https://routes.googleapis.com/directions/v2:computeRoutes",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": apiKey,
            "X-Goog-FieldMask": "routes.distanceMeters,routes.duration",
          },
          body: JSON.stringify({
            origin: {
              location: {
                latLng: { latitude: originLat, longitude: originLng },
              },
            },
            destination: {
              location: {
                latLng: { latitude: dest.lat, longitude: dest.lng },
              },
            },
            travelMode: "DRIVE",
          }),
        }
      );

      if (!res.ok) {
        return null;
      }

      const data = (await res.json()) as {
        routes?: Array<{ distanceMeters?: number; duration?: string }>;
      };
      const route = data.routes?.[0];
      if (!route || typeof route.distanceMeters !== "number" || !route.duration) {
        return null;
      }

      const durationSeconds = parseInt(route.duration.replace(/s$/, ""), 10);
      if (!Number.isFinite(durationSeconds) || durationSeconds < 0) {
        return null;
      }

      const estimate: TravelEstimateDto = {
        distanceMeters: route.distanceMeters,
        distanceLabel: formatDistanceLabel(route.distanceMeters),
        durationSeconds,
        durationLabel: formatDurationLabel(durationSeconds),
      };

      routeCache.set(cacheKey, {
        expiresAt: Date.now() + CACHE_TTL_MS,
        value: estimate,
      });

      return estimate;
    } catch {
      return null;
    }
  };

  return {
    autocompletePlaces,
    getPlaceDetails,
    getTravelEstimate,
  };
}
