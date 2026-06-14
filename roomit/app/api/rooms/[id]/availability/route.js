import { NextResponse } from "next/server";
import { connectDB } from "@/../../lib/db";
import Room from "@/models/Room";
import Booking from "@/models/Booking";
import { generateDaySlots, addThirtyMinutes, isValidDateString } from "@/lib/slots";

export async function GET(request, { params }) {
  try {
    await connectDB();
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date");

    if (!date || !isValidDateString(date)) {
      return NextResponse.json({ error: "Query param 'date' is required and must be YYYY-MM-DD" }, { status: 400 });
    }

    const room = await Room.findById(id).lean();
    if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 });

    const confirmedBookings = await Booking.find({ room: id, date, status: "confirmed" })
      .select("slotStart slotEnd bookedBy title groupId").lean();

    const bookedMap = new Map();
    for (const b of confirmedBookings) bookedMap.set(b.slotStart, b);

    const daySlots = generateDaySlots();
    const slots = daySlots.map((slotStart) => {
      const slotEnd = addThirtyMinutes(slotStart);
      const booking = bookedMap.get(slotStart);
      return {
        slotStart, slotEnd,
        available: !booking,
        bookedByName: booking ? booking.bookedBy?.name : null,
        title: booking ? booking.title : null,
      };
    });

    return NextResponse.json({
      room: { _id: room._id, name: room.name, location: room.location, capacity: room.capacity },
      date, slots,
    }, { status: 200 });
  } catch (err) {
    console.error("GET /api/rooms/[id]/availability error:", err);
    return NextResponse.json({ error: "Failed to fetch availability" }, { status: 500 });
  }
}
