import type { OwnProviderProfileDto, VerificationDecision } from "@skillconnect/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ApiError, apiRequest } from "../lib/api";

export function ProviderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { data: profile, isLoading } = useQuery({
    queryKey: ["admin", "provider", id],
    queryFn: async () => {
      const res = await apiRequest<{ profile: OwnProviderProfileDto }>(
        `/api/v1/admin/providers/${id}`
      );
      return res.profile;
    },
    enabled: Boolean(id),
  });

  const decisionMutation = useMutation({
    mutationFn: (decision: VerificationDecision) =>
      apiRequest(`/api/v1/admin/providers/${id}/decision`, {
        method: "POST",
        body: JSON.stringify({
          decision,
          ...(reason.trim() ? { reason: reason.trim() } : {}),
        }),
      }),
    onSuccess: () => {
      setErrorMsg(null);
      setReason("");
      void queryClient.invalidateQueries({ queryKey: ["admin", "provider", id] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "providers"] });
    },
    onError: (err) => {
      setErrorMsg(err instanceof ApiError ? err.message : "Action failed");
    },
  });

  if (isLoading) return <p className="text-sm text-muted">Loading provider...</p>;
  if (!profile) return <p className="text-sm text-error">Provider not found.</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <button
            type="button"
            onClick={() => navigate("/providers")}
            className="text-xs font-semibold text-primary hover:underline"
          >
            ← Back to Providers
          </button>
          <h1 className="mt-1 text-xl font-semibold text-ink">
            {profile.displayName}
          </h1>
        </div>
        <span className="rounded-full bg-primary-tint px-3 py-1 text-xs font-semibold text-primary">
          {profile.status}
        </span>
      </div>

      {errorMsg && (
        <div className="rounded-xl bg-error-bg px-4 py-3 text-sm text-error">
          {errorMsg}
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-3 rounded-xl border border-hairline bg-surface p-5">
          <h2 className="text-sm font-semibold text-ink">Profile Details</h2>
          {profile.photoUrl && (
            <img
              src={profile.photoUrl}
              alt={profile.displayName}
              className="h-24 w-24 rounded-xl object-cover"
            />
          )}
          <p className="text-sm text-muted">
            Experience: {profile.experienceYears ?? 0} years
          </p>
          <p className="text-sm text-ink">{profile.description || "No bio yet."}</p>
          <p className="text-sm text-muted">
            Service Area:{" "}
            {profile.serviceArea
              ? `${profile.serviceArea.localityName} (${profile.serviceArea.radiusKm} km radius)`
              : "Not configured"}
          </p>
        </div>

        <div className="space-y-3 rounded-xl border border-hairline bg-surface p-5">
          <h2 className="text-sm font-semibold text-ink">Services</h2>
          {profile.services.length === 0 ? (
            <p className="text-sm text-muted">No services listed.</p>
          ) : (
            <ul className="space-y-2">
              {profile.services.map((s) => (
                <li key={s.id} className="rounded-lg border border-hairline p-3">
                  <p className="text-xs font-semibold text-primary">
                    {s.categoryName}
                  </p>
                  <p className="text-sm font-medium text-ink">{s.title}</p>
                  <p className="text-xs text-muted">{s.description}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="space-y-3 rounded-xl border border-hairline bg-surface p-5">
        <h2 className="text-sm font-semibold text-ink">Verification Action</h2>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          placeholder="Reason (required for rejection, min 10 characters)"
          className="w-full rounded-xl border border-hairline p-3 text-sm"
        />
        <div className="flex flex-wrap gap-3">
          {profile.status === "PENDING" && (
            <>
              <button
                type="button"
                onClick={() => decisionMutation.mutate("APPROVED")}
                className="min-h-11 cursor-pointer rounded-xl bg-primary px-5 text-sm font-semibold text-white hover:bg-primary-dark"
              >
                Approve
              </button>
              <button
                type="button"
                onClick={() => decisionMutation.mutate("REJECTED")}
                className="min-h-11 cursor-pointer rounded-xl border border-error px-5 text-sm font-semibold text-error hover:bg-error-bg"
              >
                Reject
              </button>
            </>
          )}
          {profile.status === "APPROVED" && (
            <button
              type="button"
              onClick={() => decisionMutation.mutate("SUSPENDED")}
              className="min-h-11 cursor-pointer rounded-xl border border-error px-5 text-sm font-semibold text-error hover:bg-error-bg"
            >
              Suspend Provider
            </button>
          )}
          {profile.status === "SUSPENDED" && (
            <button
              type="button"
              onClick={() => decisionMutation.mutate("REINSTATED")}
              className="min-h-11 cursor-pointer rounded-xl bg-primary px-5 text-sm font-semibold text-white hover:bg-primary-dark"
            >
              Reinstate Provider
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
