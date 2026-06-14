import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import Room from "@/models/Room";

export async function GET() {
  try {
    await connectDB();
    const rooms = await Room.find({}).sort({ name: 1 }).lean();
    return NextResponse.json({ rooms }, { status: 200 });
  } catch (err) {
    console.error("GET /api/rooms error:", err);
    return NextResponse.json({ error: "Failed to fetch rooms" }, { status: 500 });
  }
}
