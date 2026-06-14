import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import Room from "@/models/Room";
import Booking from "@/models/Booking";
import { isValidDateString, isValidSlotTime, slotToIndex, indexToSlot, addThirtyMinutes } from "@/lib/slots";

export async function GET(request) {
  try {
    await connectDB();
    const { searchParams } = new URL(request.url);
    const email = searchParams.get("email");
    if (!email) return NextResponse.json({ error: "Query param 'email' is required" }, { status: 400 });

    const bookings = await Booking.find({ "bookedBy.email": email.toLowerCase() })
      .populate("room", "name location capacity")
      .sort({ date: 1, startTime: 1, createdAt: -1 }).lean();

    const grouped = new Map();
    for (const b of bookings) {
      if (!grouped.has(b.groupId)) {
        grouped.set(b.groupId, {
          groupId: b.groupId, room: b.room, date: b.date,
          startTime: b.startTime, endTime: b.endTime,
          bookedBy: b.bookedBy, title: b.title, status: b.status,
          createdAt: b.createdAt, recurrenceId: b.recurrenceId,
          occurrenceIndex: b.occurrenceIndex, slotIds: [b._id],
        });
      } else {
        grouped.get(b.groupId).slotIds.push(b._id);
      }
    }

    return NextResponse.json({ bookings: Array.from(grouped.values()) }, { status: 200 });
  } catch (err) {
    console.error("GET /api/bookings error:", err);
    return NextResponse.json({ error: "Failed to fetch bookings" }, { status: 500 });
  }
}

function buildSlotList(startTime, endTime) {
  const startIdx = slotToIndex(startTime);
  const endIdx = slotToIndex(endTime === "24:00" ? "23:30" : endTime) + (endTime === "24:00" ? 1 : 0);
  if (endIdx <= startIdx || endIdx > 48) return null;
  const slots = [];
  for (let i = startIdx; i < endIdx; i++) slots.push(indexToSlot(i));
  return slots;
}

async function insertOccurrence({ session, roomId, date, slotList, groupId, startTime, endTime, bookedBy, title, recurrenceId, occurrenceIndex }) {
  const docs = slotList.map((slotStart) => ({
    room: roomId, date, slotStart, slotEnd: addThirtyMinutes(slotStart),
    groupId, startTime, endTime, bookedBy, title, status: "confirmed",
    recurrenceId, occurrenceIndex,
  }));
  try {
    await Booking.insertMany(docs, { session, ordered: true });
    return { ok: true };
  } catch (err) {
    if (err?.code === 11000) return { ok: false, reason: "conflict" };
    throw err;
  }
}

export async function POST(request) {
  try {
    await connectDB();
    const body = await request.json();
    const { roomId, date, startTime, endTime, bookedBy, title, recurrence, recurrenceMode } = body || {};

    if (!roomId || !mongoose.Types.ObjectId.isValid(roomId))
      return NextResponse.json({ error: "Valid 'roomId' is required" }, { status: 400 });
    if (!date || !isValidDateString(date))
      return NextResponse.json({ error: "'date' must be YYYY-MM-DD" }, { status: 400 });
    if (!startTime || !isValidSlotTime(startTime))
      return NextResponse.json({ error: "'startTime' must be HH:MM on a 30-min boundary" }, { status: 400 });
    const endTimeValid = endTime === "24:00" || /^([01]\d|2[0-3]):(00|30)$/.test(endTime);
    if (!endTime || !endTimeValid)
      return NextResponse.json({ error: "'endTime' must be HH:MM on a 30-min boundary (or 24:00)" }, { status: 400 });
    if (!bookedBy?.name || !bookedBy?.email)
      return NextResponse.json({ error: "'bookedBy.name' and 'bookedBy.email' are required" }, { status: 400 });
    if (!title?.trim())
      return NextResponse.json({ error: "'title' is required" }, { status: 400 });

    const slotList = buildSlotList(startTime, endTime);
    if (!slotList) return NextResponse.json({ error: "'endTime' must be after 'startTime'" }, { status: 400 });

    const room = await Room.findById(roomId).lean();
    if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 });

    const normalizedBookedBy = { name: bookedBy.name.trim(), email: bookedBy.email.trim().toLowerCase() };

    // Single booking
    if (!recurrence || !recurrence.weeks || recurrence.weeks <= 1) {
      const session = await mongoose.startSession();
      try {
        let result;
        await session.withTransaction(async () => {
          const groupId = new mongoose.Types.ObjectId().toString();
          result = await insertOccurrence({ session, roomId, date, slotList, groupId, startTime, endTime, bookedBy: normalizedBookedBy, title: title.trim(), recurrenceId: null, occurrenceIndex: null });
          if (!result.ok) throw new Error("CONFLICT");
        });
        return NextResponse.json({ message: "Booking confirmed", date, startTime, endTime, slots: slotList }, { status: 201 });
      } catch (err) {
        if (err.message === "CONFLICT")
          return NextResponse.json({ error: "One or more of the requested slots are already booked." }, { status: 409 });
        throw err;
      } finally {
        await session.endSession();
      }
    }

    // Recurring booking
    const totalOccurrences = Math.min(Math.max(recurrence.weeks, 1), 52);
    const mode = recurrenceMode === "all-or-nothing" ? "all-or-nothing" : "partial";
    const recurrenceId = new mongoose.Types.ObjectId().toString();
    const baseDate = new Date(`${date}T00:00:00.000Z`);
    const occurrenceDates = Array.from({ length: totalOccurrences }, (_, i) => {
      const d = new Date(baseDate);
      d.setUTCDate(d.getUTCDate() + i * 7);
      return d.toISOString().slice(0, 10);
    });

    if (mode === "all-or-nothing") {
      const existing = await Booking.find({ room: roomId, date: { $in: occurrenceDates }, slotStart: { $in: slotList }, status: "confirmed" }).lean();
      if (existing.length > 0) {
        return NextResponse.json({
          error: "Some occurrences conflict. Whole series NOT booked (all-or-nothing mode).",
          conflictingDates: [...new Set(existing.map((e) => e.date))],
        }, { status: 409 });
      }
      const insertedGroupIds = [];
      try {
        for (let i = 0; i < occurrenceDates.length; i++) {
          const session = await mongoose.startSession();
          const groupId = new mongoose.Types.ObjectId().toString();
          try {
            await session.withTransaction(async () => {
              const result = await insertOccurrence({ session, roomId, date: occurrenceDates[i], slotList, groupId, startTime, endTime, bookedBy: normalizedBookedBy, title: title.trim(), recurrenceId, occurrenceIndex: i + 1 });
              if (!result.ok) throw new Error("CONFLICT");
            });
            insertedGroupIds.push(groupId);
          } finally { await session.endSession(); }
        }
      } catch {
        await Booking.deleteMany({ groupId: { $in: insertedGroupIds } });
        return NextResponse.json({ error: "Conflict during series booking. Whole series rolled back." }, { status: 409 });
      }
      return NextResponse.json({ message: `Recurring booking confirmed for all ${totalOccurrences} occurrence(s).`, recurrenceId, occurrences: occurrenceDates.map((d, i) => ({ date: d, occurrenceIndex: i + 1, status: "booked" })) }, { status: 201 });
    }

    // Partial mode
    const occurrenceResults = [];
    for (let i = 0; i < occurrenceDates.length; i++) {
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          const groupId = new mongoose.Types.ObjectId().toString();
          const result = await insertOccurrence({ session, roomId, date: occurrenceDates[i], slotList, groupId, startTime, endTime, bookedBy: normalizedBookedBy, title: title.trim(), recurrenceId, occurrenceIndex: i + 1 });
          if (!result.ok) throw new Error("CONFLICT");
        });
        occurrenceResults.push({ date: occurrenceDates[i], occurrenceIndex: i + 1, status: "booked" });
      } catch (err) {
        if (err.message === "CONFLICT") occurrenceResults.push({ date: occurrenceDates[i], occurrenceIndex: i + 1, status: "skipped-conflict" });
        else throw err;
      } finally { await session.endSession(); }
    }

    const bookedCount = occurrenceResults.filter((o) => o.status === "booked").length;
    return NextResponse.json({ message: `Recurring booking processed: ${bookedCount}/${totalOccurrences} occurrence(s) booked.`, recurrenceId, occurrences: occurrenceResults }, { status: bookedCount > 0 ? 201 : 409 });
  } catch (err) {
    console.error("POST /api/bookings error:", err);
    return NextResponse.json({ error: "Failed to create booking" }, { status: 500 });
  }
}
