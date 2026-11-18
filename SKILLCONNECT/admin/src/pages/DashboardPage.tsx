import type { AdminDashboardDto } from "@skillconnect/shared";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { apiRequest } from "../lib/api";

export function DashboardPage() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin", "dashboard"],
    queryFn: async () => {
      const res = await apiRequest<{ dashboard: AdminDashboardDto }>(
        "/api/v1/admin/dashboard"
      );
      return res.dashboard;
    },
  });

  if (isLoading) {
    return <p className="text-sm text-muted">Loading dashboard...</p>;
  }

  if (isError || !data) {
    return (
      <div className="rounded-xl border border-hairline bg-surface p-6">
        <p className="text-sm text-danger">Failed to load dashboard.</p>
        <button
          type="button"
          onClick={() => void refetch()}
          className="mt-3 min-h-11 rounded-xl border border-hairline px-4 text-sm font-semibold text-ink"
        >
          Retry
        </button>
      </div>
    );
  }

  const cards = [
    {
      label: "Pending Verifications",
      value: data.pendingProviderVerifications,
      to: "/providers",
    },
    { label: "Open Disputes", value: data.openDisputes, to: "/disputes" },
    { label: "Bookings Today (PKT)", value: data.bookingsToday, to: null },
    {
      label: "Bookings This Week (PKT)",
      value: data.bookingsThisWeek,
      to: null,
    },
    {
      label: "Completed Bookings",
      value: data.completedBookingsTotal,
      to: null,
    },
    {
      label: "Active Providers",
      value: data.activeProvidersTotal,
      to: "/providers",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Admin Overview</h1>
        <p className="text-sm text-muted">
          Live operational metrics (Asia/Karachi business day).
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <div
            key={card.label}
            className="rounded-xl border border-hairline bg-surface p-5"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              {card.label}
            </p>
            <p className="mt-2 text-3xl font-bold text-ink">{card.value}</p>
            {card.to ? (
              <Link
                to={card.to}
                className="mt-2 inline-block text-xs font-semibold text-primary hover:underline"
              >
                View queue →
              </Link>
            ) : null}
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-hairline bg-surface p-5">
        <h2 className="text-lg font-semibold text-ink">
          Late Cancellations (Within 24h of Start)
        </h2>
        {data.lateCancellations.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            No late cancellations recorded.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-hairline text-xs uppercase text-muted">
                <tr>
                  <th className="py-2 pr-4">Service</th>
                  <th className="py-2 pr-4">Customer</th>
                  <th className="py-2 pr-4">Provider</th>
                  <th className="py-2 pr-4">Cancelled By</th>
                  <th className="py-2 pr-4">Reason</th>
                  <th className="py-2">Cancelled At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {data.lateCancellations.map((item) => (
                  <tr key={item.bookingId}>
                    <td className="py-2 pr-4 font-medium text-ink">
                      {item.serviceName}
                    </td>
                    <td className="py-2 pr-4 text-muted">
                      {item.customerName}
                    </td>
                    <td className="py-2 pr-4 text-muted">
                      {item.providerName}
                    </td>
                    <td className="py-2 pr-4 text-muted">
                      {item.cancelledByName ?? "—"}
                    </td>
                    <td className="py-2 pr-4 text-muted">
                      {item.cancelReason ?? "—"}
                    </td>
                    <td className="py-2 text-xs text-muted">
                      {new Date(item.cancelledAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
