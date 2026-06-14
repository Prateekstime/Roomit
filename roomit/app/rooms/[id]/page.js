"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function RoomPage() {
  const { id: roomId } = useParams();

  const [date, setDate] = useState(todayStr());
  const [room, setRoom] = useState(null);
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState([]);
  const [form, setForm] = useState({ name: "", email: "", title: "" });
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [recurringEnabled, setRecurringEnabled] = useState(false);
  const [recurWeeks, setRecurWeeks] = useState(6);
  const [recurMode, setRecurMode] = useState("partial");

  const fetchAvailability = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/rooms/${roomId}/availability?date=${date}`);
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed to load availability"); setSlots([]); setRoom(null); }
      else { setSlots(data.slots); setRoom(data.room); }
    } catch { setError("Network error while loading availability"); }
    finally { setLoading(false); }
  }, [roomId, date]);

  useEffect(() => { fetchAvailability(); }, [fetchAvailability]);

  function handleDateChange(newDate) { setDate(newDate); setSelected([]); setFeedback(null); }

  function toggleSlot(slot) {
    if (!slot.available) return;
    setFeedback(null);
    setSelected((prev) => {
      if (prev.includes(slot.slotStart)) {
        if (slot.slotStart === prev[0]) return prev.slice(1);
        if (slot.slotStart === prev[prev.length - 1]) return prev.slice(0, -1);
        return prev;
      }
      if (prev.length === 0) return [slot.slotStart];
      const allStarts = slots.map((s) => s.slotStart);
      const idx = allStarts.indexOf(slot.slotStart);
      const firstIdx = allStarts.indexOf(prev[0]);
      const lastIdx = allStarts.indexOf(prev[prev.length - 1]);
      if (idx === lastIdx + 1) return [...prev, slot.slotStart];
      if (idx === firstIdx - 1) return [slot.slotStart, ...prev];
      return [slot.slotStart];
    });
  }

  function getSelectionRange() {
    if (selected.length === 0) return null;
    const sorted = [...selected].sort();
    const lastSlot = slots.find((s) => s.slotStart === sorted[sorted.length - 1]);
    return { startTime: sorted[0], endTime: lastSlot.slotEnd };
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const range = getSelectionRange();
    if (!range) { setFeedback({ type: "error", message: "Please select at least one available slot." }); return; }
    if (!form.name.trim() || !form.email.trim() || !form.title.trim()) {
      setFeedback({ type: "error", message: "Please fill in name, email and title." }); return;
    }
    setSubmitting(true); setFeedback(null);

    const payload = {
      roomId, date, startTime: range.startTime, endTime: range.endTime,
      bookedBy: { name: form.name.trim(), email: form.email.trim() },
      title: form.title.trim(),
    };
    if (recurringEnabled) { payload.recurrence = { weeks: Number(recurWeeks) }; payload.recurrenceMode = recurMode; }

    try {
      const res = await fetch("/api/bookings", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedback({ type: "error", message: data.error || "Booking failed." });
      } else if (data.occurrences) {
        const booked = data.occurrences.filter((o) => o.status === "booked");
        const skipped = data.occurrences.filter((o) => o.status === "skipped-conflict");
        let msg = `${booked.length} of ${data.occurrences.length} occurrence(s) booked.`;
        if (skipped.length > 0) msg += ` Skipped (conflict): ${skipped.map((s) => s.date).join(", ")}.`;
        setFeedback({ type: "success", message: msg });
        setSelected([]);
      } else {
        setFeedback({ type: "success", message: "Booking confirmed!" });
        setSelected([]);
      }
      fetchAvailability();
    } catch { setFeedback({ type: "error", message: "Network error while booking." }); }
    finally { setSubmitting(false); }
  }

  const range = getSelectionRange();

  return (
    <div>
      {room && (
        <div className="mb-4">
          <h1 className="text-2xl font-bold">{room.name}</h1>
          <p className="text-sm" style={{ color: "var(--muted)" }}>{room.location} · Capacity {room.capacity}</p>
        </div>
      )}

      <div className="mb-4 flex items-center gap-2">
        <label className="text-sm font-medium" htmlFor="date-picker">Date:</label>
        <input id="date-picker" type="date" value={date} onChange={(e) => handleDateChange(e.target.value)}
          className="border rounded px-2 py-1 text-sm" style={{ borderColor: "var(--border)" }} />
      </div>

      {error && <p className="mb-4 text-sm" style={{ color: "var(--danger)" }}>{error}</p>}

      {loading ? (
        <p style={{ color: "var(--muted)" }}>Loading availability…</p>
      ) : (
        <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 mb-6">
          {slots.map((slot) => {
            const isSelected = selected.includes(slot.slotStart);
            let style = { borderColor: "var(--border)" };
            if (!slot.available) {
              style = { backgroundColor: "#fbe9e7", color: "var(--danger)", borderColor: "var(--danger)", cursor: "not-allowed" };
            } else if (isSelected) {
              style = { backgroundColor: "var(--primary)", color: "#ffffff", borderColor: "var(--primary)" };
            } else {
              style = { backgroundColor: "#eaf6ee", color: "var(--success)", borderColor: "var(--success)" };
            }
            return (
              <div key={slot.slotStart}
                className="rounded border text-xs py-2 px-1 text-center cursor-pointer select-none"
                style={style} onClick={() => toggleSlot(slot)}
                title={!slot.available ? `Booked: ${slot.title || ""}` : "Available"}>
                {slot.slotStart}
              </div>
            );
          })}
        </div>
      )}

      <div className="flex gap-4 text-xs mb-6" style={{ color: "var(--muted)" }}>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded" style={{ backgroundColor: "#eaf6ee", border: "1px solid var(--success)" }} /> Available
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded" style={{ backgroundColor: "#fbe9e7", border: "1px solid var(--danger)" }} /> Booked
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded" style={{ backgroundColor: "var(--primary)" }} /> Selected
        </span>
      </div>

      <div className="border rounded-lg p-4 bg-white" style={{ borderColor: "var(--border)" }}>
        <h2 className="font-semibold mb-2">Book this room</h2>
        {range ? (
          <p className="text-sm mb-3">Selected: <span className="font-medium">{range.startTime} - {range.endTime}</span> on {date}</p>
        ) : (
          <p className="text-sm mb-3" style={{ color: "var(--muted)" }}>Click one or more consecutive available slots above to select a time range.</p>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Your Name</label>
              <input type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full border rounded px-2 py-1 text-sm" style={{ borderColor: "var(--border)" }} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Your Email</label>
              <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full border rounded px-2 py-1 text-sm" style={{ borderColor: "var(--border)" }} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Meeting Title</label>
            <input type="text" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full border rounded px-2 py-1 text-sm" style={{ borderColor: "var(--border)" }} />
          </div>

          <div className="border-t pt-3" style={{ borderColor: "var(--border)" }}>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={recurringEnabled} onChange={(e) => setRecurringEnabled(e.target.checked)} />
              Make this a recurring weekly booking
            </label>
            {recurringEnabled && (
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Number of weeks (including this one)</label>
                  <input type="number" min={2} max={52} value={recurWeeks}
                    onChange={(e) => setRecurWeeks(e.target.value)}
                    className="w-full border rounded px-2 py-1 text-sm" style={{ borderColor: "var(--border)" }} />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">If some weeks conflict</label>
                  <select value={recurMode} onChange={(e) => setRecurMode(e.target.value)}
                    className="w-full border rounded px-2 py-1 text-sm" style={{ borderColor: "var(--border)" }}>
                    <option value="partial">Book the free weeks only</option>
                    <option value="all-or-nothing">Cancel the whole series</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          {feedback && (
            <p className="text-sm" style={{ color: feedback.type === "success" ? "var(--success)" : "var(--danger)" }}>
              {feedback.message}
            </p>
          )}

          <button type="submit" disabled={submitting || !range}
            className="px-4 py-2 rounded text-sm font-medium text-white disabled:opacity-50"
            style={{ backgroundColor: "var(--primary)" }}>
            {submitting ? "Booking…" : "Book Room"}
          </button>
        </form>
      </div>
    </div>
  );
}
