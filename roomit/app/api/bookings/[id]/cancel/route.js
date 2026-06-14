import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import Booking from "@/models/Booking";
import { dateTimeToDate } from "@/lib/slots";

export async function PATCH(request, { params }) {
  try {
    await connectDB();
    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id))
      return NextResponse.json({ error: "Invalid booking id" }, { status: 400 });

    const refDoc = await Booking.findById(id).lean();
    if (!refDoc) return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    if (refDoc.status !== "confirmed")
      return NextResponse.json({ error: `Booking is already ${refDoc.status} and cannot be cancelled again.` }, { status: 400 });

    const bookingStart = dateTimeToDate(refDoc.date, refDoc.startTime);
    const msUntilStart = bookingStart.getTime() - Date.now();
    const newStatus = msUntilStart >= 2 * 60 * 60 * 1000 ? "cancelled-refundable" : "cancelled-non-refundable";

    const updateResult = await Booking.updateMany(
      { groupId: refDoc.groupId, status: "confirmed" },
      { $set: { status: newStatus } }
    );

    return NextResponse.json({
      message: "Booking cancelled", status: newStatus,
      slotsAffected: updateResult.modifiedCount,
      refundable: newStatus === "cancelled-refundable",
    }, { status: 200 });
  } catch (err) {
    console.error("PATCH /api/bookings/[id]/cancel error:", err);
    return NextResponse.json({ error: "Failed to cancel booking" }, { status: 500 });
  }
}
