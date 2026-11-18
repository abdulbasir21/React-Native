import {
  FINAL_BOOKING_STATUSES,
  type DisputeDto,
  type FinalBookingStatus,
  type MessageDto,
} from "@skillconnect/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ApiError, apiRequest } from "../lib/api";

export function DisputeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [outcome, setOutcome] = useState<FinalBookingStatus>("COMPLETED");
  const [resolutionNote, setResolutionNote] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { data: dispute, isLoading } = useQuery({
    queryKey: ["admin", "dispute", id],
    queryFn: async () => {
      const res = await apiRequest<{ dispute: DisputeDto }>(
        `/api/v1/admin/disputes/${id}`
      );
      return res.dispute;
    },
    enabled: Boolean(id),
  });

  const isActive =
    dispute?.status === "OPEN" ||
    dispute?.status === "AWAITING_RESPONSE" ||
    dispute?.status === "IN_REVIEW";

  const { data: messages = [] } = useQuery({
    queryKey: ["admin", "dispute", id, "conversation"],
    queryFn: async () => {
      const res = await apiRequest<{ messages: MessageDto[] }>(
        `/api/v1/admin/disputes/${id}/conversation`
      );
      return res.messages;
    },
    enabled: Boolean(id && isActive),
  });

  const resolveMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/api/v1/admin/disputes/${id}/resolve`, {
        method: "POST",
        body: JSON.stringify({ outcome, resolutionNote }),
      }),
    onSuccess: () => {
      setErrorMsg(null);
      setResolutionNote("");
      void queryClient.invalidateQueries({ queryKey: ["admin", "dispute", id] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "disputes"] });
    },
    onError: (err) => {
      setErrorMsg(err instanceof ApiError ? err.message : "Resolution failed");
    },
  });

  if (isLoading) return <p className="text-sm text-muted">Loading dispute...</p>;
  if (!dispute) return <p className="text-sm text-error">Dispute not found.</p>;

  return (
    <div className="space-y-6">
      <div>
        <button
          type="button"
          onClick={() => navigate("/disputes")}
          className="text-xs font-semibold text-primary hover:underline"
        >
          ← Back to Disputes
        </button>
        <h1 className="mt-1 text-xl font-semibold text-ink">
          {dispute.type} Dispute · {dispute.status}
        </h1>
      </div>

      {errorMsg && (
        <div className="rounded-xl bg-error-bg px-4 py-3 text-sm text-error">
          {errorMsg}
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-2 rounded-xl border border-hairline bg-surface p-5">
          <h2 className="text-sm font-semibold text-ink">Booking & Claim</h2>
          <p className="text-sm text-ink">
            Service: {dispute.booking?.serviceName} (Rs. {dispute.booking?.pricePkr})
          </p>
          <p className="text-xs text-muted">
            Customer: {dispute.booking?.customerFullName} · Provider:{" "}
            {dispute.booking?.providerDisplayName}
          </p>
          {dispute.booking?.serviceAddress && (
            <p className="text-xs text-muted">
              Address: {dispute.booking.serviceAddress}
            </p>
          )}
          <p className="mt-2 text-sm text-ink">Reason: {dispute.reason}</p>
          {dispute.response && (
            <p className="text-sm text-muted">Response: {dispute.response}</p>
          )}
        </div>

        <div className="space-y-2 rounded-xl border border-hairline bg-surface p-5">
          <h2 className="text-sm font-semibold text-ink">
            Conversation Context (ADM-3)
          </h2>
          {!isActive ? (
            <p className="text-xs text-muted">
              Conversation access closed after dispute resolution.
            </p>
          ) : messages.length === 0 ? (
            <p className="text-xs text-muted">No messages in conversation.</p>
          ) : (
            <div className="max-h-64 space-y-2 overflow-y-auto">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className="rounded-lg border border-hairline bg-canvas p-2.5 text-xs"
                >
                  <span className="font-semibold text-ink">{m.type}: </span>
                  <span className="text-muted">
                    {m.body ?? m.imageUrl ?? ""}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {dispute.booking?.status === "DISPUTED" && isActive && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            resolveMutation.mutate();
          }}
          className="space-y-3 rounded-xl border border-hairline bg-surface p-5"
        >
          <h2 className="text-sm font-semibold text-ink">Resolve Dispute</h2>
          <select
            value={outcome}
            onChange={(e) => setOutcome(e.target.value as FinalBookingStatus)}
            className="min-h-11 rounded-xl border border-hairline bg-surface px-3 text-sm"
          >
            {FINAL_BOOKING_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <textarea
            value={resolutionNote}
            onChange={(e) => setResolutionNote(e.target.value)}
            rows={2}
            placeholder="Resolution note (min 10 chars)"
            required
            className="w-full rounded-xl border border-hairline p-3 text-sm"
          />
          <button
            type="submit"
            disabled={resolveMutation.isPending}
            className="min-h-11 cursor-pointer rounded-xl bg-primary px-5 text-sm font-semibold text-white hover:bg-primary-dark"
          >
            {resolveMutation.isPending ? "Resolving..." : "Resolve Dispute"}
          </button>
        </form>
      )}
    </div>
  );
}
