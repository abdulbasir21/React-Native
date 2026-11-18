import type { AdminUserDto } from "@skillconnect/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiRequest } from "../lib/api";

export function UsersPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "ACTIVE" | "SUSPENDED">(
    ""
  );
  const [actionError, setActionError] = useState<string | null>(null);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["admin", "users", search, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search.trim()) params.set("q", search.trim());
      if (statusFilter) params.set("status", statusFilter);
      const qs = params.toString();
      const res = await apiRequest<{ users: AdminUserDto[] }>(
        `/api/v1/admin/users${qs ? `?${qs}` : ""}`
      );
      return res.users;
    },
  });

  const actionMutation = useMutation({
    mutationFn: async ({
      id,
      action,
    }: {
      id: string;
      action: "suspend" | "reinstate";
    }) => {
      setActionError(null);
      return apiRequest(`/api/v1/admin/users/${id}/${action}`, {
        method: "POST",
        body: JSON.stringify({}),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : "Action failed");
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink">Users</h1>
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or email..."
            className="min-h-11 rounded-xl border border-hairline bg-surface px-3 text-sm text-ink"
          />
          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as "" | "ACTIVE" | "SUSPENDED")
            }
            className="min-h-11 rounded-xl border border-hairline bg-surface px-3 text-sm text-ink"
          >
            <option value="">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="SUSPENDED">Suspended</option>
          </select>
        </div>
      </div>

      {actionError ? (
        <div className="rounded-xl bg-danger-bg p-3 text-sm text-danger">
          {actionError}
        </div>
      ) : null}

      {isLoading ? (
        <p className="text-sm text-muted">Loading users...</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-hairline bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-hairline text-xs uppercase text-muted">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Roles</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {users.map((u) => {
                const isAdmin = u.roles.includes("ADMIN");
                return (
                  <tr key={u.id}>
                    <td className="px-4 py-3 font-medium text-ink">
                      {u.fullName}
                    </td>
                    <td className="px-4 py-3 text-muted">{u.email}</td>
                    <td className="px-4 py-3 text-xs text-muted">
                      {u.roles.join(", ")}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          u.status === "ACTIVE"
                            ? "bg-primary-tint text-primary"
                            : "bg-danger-bg text-danger"
                        }`}
                      >
                        {u.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {isAdmin ? (
                        <span className="text-xs text-muted">Protected</span>
                      ) : u.status === "ACTIVE" ? (
                        <button
                          type="button"
                          disabled={actionMutation.isPending}
                          onClick={() =>
                            actionMutation.mutate({
                              id: u.id,
                              action: "suspend",
                            })
                          }
                          className="min-h-11 rounded-xl border border-hairline px-3 text-xs font-semibold text-danger hover:bg-canvas"
                        >
                          Suspend
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={actionMutation.isPending}
                          onClick={() =>
                            actionMutation.mutate({
                              id: u.id,
                              action: "reinstate",
                            })
                          }
                          className="min-h-11 rounded-xl border border-hairline px-3 text-xs font-semibold text-primary hover:bg-canvas"
                        >
                          Reinstate
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
