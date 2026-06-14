"use client";

import { useState } from "react";

function isPastBooking(booking) {
  const end = new Date(`${booking.date}T${booking.endTime === "24:00" ? "23:59:59" : booking.endTime + ":00"}.000Z`);
  return end.getTime() < Date.now();
}

function statusLabel(status) {
  switch (status) {
    case "confirmed":
      return { text: "Confirmed", color: "var(--success)" };
    case "cancelled-refundable":
      return { text: "Cancelled (Refundable)", color: "var(--primary)" };
    case "cancelled-non-refundable":
      return { text: "Cancelled (Non-refundable)", color: "var(--danger)" };
    default:
      return { text: status, color: "var(--muted)" };
  }
}

export default function BookingsPage() {
  const [email, setEmail] = useState("");
  const [bookings, setBookings] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [cancellingId, setCancellingId] = useState(null);
  const [feedback, setFeedback] = useState(null);

  async function fetchBookings(e) {
    if (e) e.preventDefault();
    if (!email.trim()) { setError("Please enter an email address."); return; }
    setLoading(true); setError(""); setFeedback(null);
    try {
      const res = await fetch(`/api/bookings?email=${encodeURIComponent(email.trim())}`);
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed to fetch bookings"); setBookings([]); }
      else setBookings(data.bookings || []);
    } catch {
      setError("Network error while fetching bookings."); setBookings([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleCancel(booking) {
    if (!window.confirm(`Cancel "${booking.title}" on ${booking.date} (${booking.startTime}-${booking.endTime})?`)) return;
    setCancellingId(booking.groupId); setFeedback(null);
    try {
      const res = await fetch(`/api/bookings/${booking.slotIds[0]}/cancel`, { method: "PATCH" });
      const data = await res.json();
      if (!res.ok) {
        setFeedback({ type: "error", message: data.error || "Cancel failed." });
      } else {
        setFeedback({
          type: "success",
          message: data.refundable
            ? "Booking cancelled and marked REFUNDABLE (>= 2 hours before start)."
            : "Booking cancelled but marked NON-REFUNDABLE (< 2 hours before start).",
        });
        await fetchBookings();
      }
    } catch {
      setFeedback({ type: "error", message: "Network error while cancelling." });
    } finally {
      setCancellingId(null);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">My Bookings</h1>
      <p className="text-sm mb-4" style={{ color: "var(--muted)" }}>
        Look up your bookings by the email address you used when booking.
      </p>

      <form onSubmit={fetchBookings} className="flex gap-2 mb-4">
        <input
          type="email" placeholder="you@company.com" value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="border rounded px-3 py-2 text-sm flex-1"
          style={{ borderColor: "var(--border)" }}
        />
        <button type="submit" disabled={loading}
          className="px-4 py-2 rounded text-sm font-medium text-white disabled:opacity-50"
          style={{ backgroundColor: "var(--primary)" }}>
          {loading ? "Searching…" : "Search"}
        </button>
      </form>

      {error && <p className="mb-4 text-sm" style={{ color: "var(--danger)" }}>{error}</p>}
      {feedback && (
        <p className="mb-4 text-sm" style={{ color: feedback.type === "success" ? "var(--success)" : "var(--danger)" }}>
          {feedback.message}
        </p>
      )}

      {bookings !== null && (
        bookings.length === 0
          ? <p style={{ color: "var(--muted)" }}>No bookings found for this email.</p>
          : (
            <div className="space-y-3">
              {bookings.map((b) => {
                const status = statusLabel(b.status);
                const past = isPastBooking(b);
                const canCancel = b.status === "confirmed" && !past;
                return (
                  <div key={b.groupId}
                    className="border rounded-lg p-4 bg-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
                    style={{ borderColor: "var(--border)" }}>
                    <div>
                      <p className="font-semibold">{b.title}</p>
                      <p className="text-sm" style={{ color: "var(--muted)" }}>
                        {b.room?.name} ({b.room?.location}) · {b.date} · {b.startTime}-{b.endTime}
                      </p>
                      {b.recurrenceId && (
                        <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                          Part of a recurring series (occurrence #{b.occurrenceIndex})
                        </p>
                      )}
                      <p className="text-sm mt-1 font-medium" style={{ color: status.color }}>
                        {status.text}{past && b.status === "confirmed" ? " · Past" : ""}
                      </p>
                    </div>
                    <div>
                      {canCancel ? (
                        <button onClick={() => handleCancel(b)} disabled={cancellingId === b.groupId}
                          className="px-3 py-1.5 rounded text-sm font-medium text-white disabled:opacity-50"
                          style={{ backgroundColor: "var(--danger)" }}>
                          {cancellingId === b.groupId ? "Cancelling…" : "Cancel"}
                        </button>
                      ) : (
                        <span className="text-xs" style={{ color: "var(--muted)" }}>
                          {b.status !== "confirmed" ? "Already cancelled" : "Cannot cancel past booking"}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )
      )}
    </div>
  );
}
