import mongoose from "mongoose";

const BookingSchema = new mongoose.Schema(
  {
    room: { type: mongoose.Schema.Types.ObjectId, ref: "Room", required: true },
    date: { type: String, required: true },        // "YYYY-MM-DD"
    slotStart: { type: String, required: true },   // "HH:MM"
    slotEnd: { type: String, required: true },     // "HH:MM"
    startTime: { type: String, required: true },   // overall booking start
    endTime: { type: String, required: true },     // overall booking end
    groupId: { type: String, required: true },     // groups multi-slot bookings
    bookedBy: {
      name: { type: String, required: true, trim: true },
      email: { type: String, required: true, lowercase: true, trim: true },
    },
    title: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ["confirmed", "cancelled-refundable", "cancelled-non-refundable"],
      default: "confirmed",
    },
    recurrenceId: { type: String, default: null },
    occurrenceIndex: { type: Number, default: null },
  },
  { timestamps: true }
);

// Unique partial index: only one confirmed booking per (room, date, slotStart).
// Cancelled bookings are excluded so cancelled slots become bookable again.
BookingSchema.index(
  { room: 1, date: 1, slotStart: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "confirmed" },
    name: "unique_confirmed_slot",
  }
);

export default mongoose.models.Booking || mongoose.model("Booking", BookingSchema);
