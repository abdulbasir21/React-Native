import type { DisputeDto, DisputeStatus } from "@skillconnect/shared";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { apiRequest } from "../lib/api";

const STATUS_FILTERS: (DisputeStatus | "ALL")[] = [
  "OPEN",
  "IN_REVIEW",
  "AWAITING_RESPONSE",
  "RESOLVED",
  "ALL",
];

export function DisputesPage() {
  const [statusFilter, setStatusFilter] = useState<DisputeStatus | "ALL">("OPEN");

  const { data: disputes = [], isLoading } = useQuery({
    queryKey: ["admin", "disputes", statusFilter],
    queryFn: async () => {
      const qs = statusFilter === "ALL" ? "" : `?status=${statusFilter}`;
      const res = await apiRequest<{ disputes: DisputeDto[] }>(
        `/api/v1/admin/disputes${qs}`
      );
      return res.disputes;
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">Disputes</h1>
        <p className="mt-1 text-sm text-muted">
          Review reported booking issues and no-show disputes.
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
          <p className="p-6 text-sm text-muted">Loading disputes...</p>
        ) : disputes.length === 0 ? (
          <p className="p-6 text-sm text-muted">No disputes in this queue.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-hairline bg-canvas text-xs uppercase text-muted">
              <tr>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Service</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {disputes.map((d) => (
                <tr key={d.id}>
                  <td className="px-4 py-3 font-medium text-ink">{d.type}</td>
                  <td className="px-4 py-3 text-muted">
                    {d.booking?.serviceName ?? d.bookingId}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-block rounded-full bg-primary-tint px-2.5 py-0.5 text-xs font-semibold text-primary">
                      {d.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      to={`/disputes/${d.id}`}
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
