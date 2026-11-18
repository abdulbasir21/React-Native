import type { ProviderStatus } from "@skillconnect/shared";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { apiRequest } from "../lib/api";

interface AdminProviderListItem {
  id: string;
  userId: string;
  displayName: string;
  status: ProviderStatus;
  submittedAt: string | null;
  userEmail: string;
  userFullName: string;
  userStatus: string;
  serviceCount: number;
  categories: string[];
}

const STATUS_FILTERS: (ProviderStatus | "ALL")[] = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "SUSPENDED",
  "DRAFT",
  "ALL",
];

export function ProvidersQueuePage() {
  const [statusFilter, setStatusFilter] = useState<ProviderStatus | "ALL">("PENDING");

  const { data: providers = [], isLoading } = useQuery({
    queryKey: ["admin", "providers", statusFilter],
    queryFn: async () => {
      const qs = statusFilter === "ALL" ? "" : `?status=${statusFilter}`;
      const res = await apiRequest<{ providers: AdminProviderListItem[] }>(
        `/api/v1/admin/providers${qs}`
      );
      return res.providers;
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">Provider Approvals</h1>
        <p className="mt-1 text-sm text-muted">
          Review technician onboarding submissions and manage provider status.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(s)}
            className={`min-h-9 cursor-pointer rounded-full border px-3.5 text-xs font-semibold ${
              statusFilter === s
                ? "border-primary bg-primary-tint text-primary"
                : "border-hairline bg-surface text-muted"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-hairline bg-surface">
        {isLoading ? (
          <p className="p-6 text-sm text-muted">Loading providers...</p>
        ) : providers.length === 0 ? (
          <p className="p-6 text-sm text-muted">No providers in this queue.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-hairline bg-canvas text-xs uppercase text-muted">
              <tr>
                <th className="px-4 py-3">Display Name</th>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Categories</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Review</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {providers.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-3 font-medium text-ink">{p.displayName}</td>
                  <td className="px-4 py-3 text-muted">{p.userEmail}</td>
                  <td className="px-4 py-3 text-muted">
                    {p.categories.join(", ") || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-block rounded-full bg-primary-tint px-2.5 py-0.5 text-xs font-semibold text-primary">
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      to={`/providers/${p.id}`}
                      className="inline-flex min-h-9 items-center rounded-lg border border-primary px-3 text-xs font-semibold text-primary hover:bg-primary-tint"
                    >
                      Inspect
                    </Link>
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
