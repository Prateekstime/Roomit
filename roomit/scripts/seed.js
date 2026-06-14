// scripts/seed.js
// Run with: npm run seed
// Requires MONGODB_URI in .env.local

import mongoose from "mongoose";
import * as dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readFileSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = dotenv.parse(readFileSync(join(__dirname, "../.env.local"), "utf8"));
const MONGODB_URI = env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error("MONGODB_URI not found in .env.local");
  process.exit(1);
}

const RoomSchema = new mongoose.Schema({
  name: String, location: String, capacity: Number,
}, { timestamps: true });

const Room = mongoose.models.Room || mongoose.model("Room", RoomSchema);

const rooms = [
  { name: "Boardroom A", location: "Floor 1", capacity: 12 },
  { name: "Meeting Room B", location: "Floor 2", capacity: 6 },
  { name: "Huddle Space C", location: "Floor 2", capacity: 4 },
  { name: "Conference Hall D", location: "Floor 3", capacity: 30 },
];

async function seed() {
  await mongoose.connect(MONGODB_URI);
  await Room.deleteMany({});
  const inserted = await Room.insertMany(rooms);
  console.log(`Seeded ${inserted.length} rooms:`);
  inserted.forEach((r) => console.log(`  - ${r.name} (${r._id})`));
  await mongoose.disconnect();
}

seed().catch((err) => { console.error(err); process.exit(1); });
