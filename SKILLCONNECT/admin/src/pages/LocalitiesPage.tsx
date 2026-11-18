import type { LocalityDto, LocalityLevel } from "@skillconnect/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ApiError, apiRequest } from "../lib/api";

export function LocalitiesPage() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [level, setLevel] = useState<LocalityLevel>("LOCALITY");
  const [parentId, setParentId] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [isServiceable, setIsServiceable] = useState(true);
  const [bulkJson, setBulkJson] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const { data: localities = [], isLoading } = useQuery({
    queryKey: ["admin", "localities"],
    queryFn: async () => {
      const res = await apiRequest<{ localities: LocalityDto[] }>(
        "/api/v1/admin/localities"
      );
      return res.localities;
    },
  });

  const createMutation = useMutation({
    mutationFn: () =>
      apiRequest<{ locality: LocalityDto }>("/api/v1/admin/localities", {
        method: "POST",
        body: JSON.stringify({
          name,
          slug,
          level,
          parentId: parentId || null,
          lat: Number(lat),
          lng: Number(lng),
          isServiceable,
        }),
      }),
    onSuccess: () => {
      setName("");
      setSlug("");
      setLat("");
      setLng("");
      setErrorMsg(null);
      setStatusMsg("Locality saved.");
      void queryClient.invalidateQueries({ queryKey: ["admin", "localities"] });
    },
    onError: (err) => {
      setStatusMsg(null);
      setErrorMsg(err instanceof ApiError ? err.message : "Failed to add locality");
    },
  });

  const bulkMutation = useMutation({
    mutationFn: (items: unknown[]) =>
      apiRequest<{ localities: LocalityDto[] }>("/api/v1/admin/localities/bulk", {
        method: "POST",
        body: JSON.stringify({ localities: items }),
      }),
    onSuccess: (res) => {
      setBulkJson("");
      setErrorMsg(null);
      setStatusMsg(`Imported ${res.localities.length} localities.`);
      void queryClient.invalidateQueries({ queryKey: ["admin", "localities"] });
    },
    onError: (err) => {
      setStatusMsg(null);
      setErrorMsg(err instanceof ApiError ? err.message : "Bulk import failed");
    },
  });

  const toggleServiceable = useMutation({
    mutationFn: (loc: LocalityDto) =>
      apiRequest<{ locality: LocalityDto }>(`/api/v1/admin/localities/${loc.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isServiceable: !loc.isServiceable }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "localities"] });
    },
  });

  const parentOptions = localities.filter((l) =>
    level === "DISTRICT"
      ? l.level === "PROVINCE"
      : level === "LOCALITY"
        ? l.level === "DISTRICT"
        : false
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">Localities</h1>
        <p className="mt-1 text-sm text-muted">
          Manage province, district, and locality hierarchy and coordinates.
        </p>
      </div>

      {errorMsg && (
        <div className="rounded-xl bg-error-bg px-4 py-3 text-sm text-error">
          {errorMsg}
        </div>
      )}
      {statusMsg && (
        <div className="rounded-xl bg-primary-tint px-4 py-3 text-sm text-primary">
          {statusMsg}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          createMutation.mutate();
        }}
        className="grid gap-3 rounded-xl border border-hairline bg-surface p-5 md:grid-cols-4"
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name"
          required
          className="min-h-11 rounded-xl border border-hairline px-3 text-sm"
        />
        <input
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="slug"
          required
          className="min-h-11 rounded-xl border border-hairline px-3 text-sm"
        />
        <select
          value={level}
          onChange={(e) => {
            setLevel(e.target.value as LocalityLevel);
            setParentId("");
          }}
          className="min-h-11 rounded-xl border border-hairline bg-surface px-3 text-sm"
        >
          <option value="PROVINCE">PROVINCE</option>
          <option value="DISTRICT">DISTRICT</option>
          <option value="LOCALITY">LOCALITY</option>
        </select>
        <select
          value={parentId}
          onChange={(e) => setParentId(e.target.value)}
          disabled={level === "PROVINCE"}
          className="min-h-11 rounded-xl border border-hairline bg-surface px-3 text-sm disabled:opacity-50"
        >
          <option value="">No parent</option>
          {parentOptions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.level})
            </option>
          ))}
        </select>
        <input
          value={lat}
          onChange={(e) => setLat(e.target.value)}
          placeholder="Latitude"
          type="number"
          step="any"
          required
          className="min-h-11 rounded-xl border border-hairline px-3 text-sm"
        />
        <input
          value={lng}
          onChange={(e) => setLng(e.target.value)}
          placeholder="Longitude"
          type="number"
          step="any"
          required
          className="min-h-11 rounded-xl border border-hairline px-3 text-sm"
        />
        <label className="flex min-h-11 items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={isServiceable}
            onChange={(e) => setIsServiceable(e.target.checked)}
          />
          Serviceable
        </label>
        <button
          type="submit"
          disabled={createMutation.isPending}
          className="min-h-11 cursor-pointer rounded-xl bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-dark"
        >
          {createMutation.isPending ? "Saving..." : "Add Locality"}
        </button>
      </form>

      <div className="rounded-xl border border-hairline bg-surface p-5">
        <h2 className="text-sm font-semibold text-ink">Bulk JSON Import</h2>
        <p className="mt-1 text-xs text-muted">
          Paste a JSON array of localities (with parentSlug, lat, lng) to upsert in bulk.
        </p>
        <textarea
          value={bulkJson}
          onChange={(e) => setBulkJson(e.target.value)}
          rows={3}
          placeholder='[{"name":"...","slug":"...","level":"LOCALITY","parentSlug":"...","lat":34.5,"lng":72.4,"isServiceable":true}]'
          className="mt-3 w-full rounded-xl border border-hairline p-3 font-mono text-xs"
        />
        <button
          type="button"
          disabled={!bulkJson.trim() || bulkMutation.isPending}
          onClick={() => {
            try {
              const parsed = JSON.parse(bulkJson);
              if (!Array.isArray(parsed)) throw new Error("Expected JSON array");
              bulkMutation.mutate(parsed);
            } catch {
              setErrorMsg("Invalid JSON array");
            }
          }}
          className="mt-2 min-h-10 cursor-pointer rounded-xl border border-primary px-4 text-xs font-semibold text-primary hover:bg-primary-tint disabled:opacity-50"
        >
          {bulkMutation.isPending ? "Importing..." : "Import Bulk JSON"}
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-hairline bg-surface">
        {isLoading ? (
          <p className="p-6 text-sm text-muted">Loading localities...</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-hairline bg-canvas text-xs uppercase text-muted">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Level</th>
                <th className="px-4 py-3">Coordinates</th>
                <th className="px-4 py-3">Serviceable</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {localities.map((loc) => (
                <tr key={loc.id}>
                  <td className="px-4 py-3 font-medium text-ink">{loc.name}</td>
                  <td className="px-4 py-3 text-muted">{loc.level}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted">
                    {loc.lat.toFixed(4)}, {loc.lng.toFixed(4)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        loc.isServiceable
                          ? "bg-primary-tint text-primary"
                          : "bg-canvas text-muted"
                      }`}
                    >
                      {loc.isServiceable ? "Yes" : "No"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => toggleServiceable.mutate(loc)}
                      className="min-h-9 cursor-pointer rounded-lg border border-hairline px-3 text-xs font-semibold text-ink hover:bg-canvas"
                    >
                      Toggle
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
