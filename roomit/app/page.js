import Link from "next/link";

export const dynamic = "force-dynamic";

async function getRooms() {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const res = await fetch(`${baseUrl}/api/rooms`, { cache: "no-store" });
  if (!res.ok) return [];
  const data = await res.json();
  return data.rooms || [];
}

export default async function HomePage() {
  const rooms = await getRooms();

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Meeting Rooms</h1>
      <p className="text-sm mb-6" style={{ color: "var(--muted)" }}>
        Select a room to view its availability and make a booking.
      </p>

      {rooms.length === 0 ? (
        <p style={{ color: "var(--muted)" }}>No rooms found. Did you run the seed script?</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {rooms.map((room) => (
            <Link
              key={room._id}
              href={`/rooms/${room._id}`}
              className="block rounded-lg border p-4 bg-white hover:shadow transition-shadow"
              style={{ borderColor: "var(--border)" }}
            >
              <h2 className="text-lg font-semibold">{room.name}</h2>
              <p className="text-sm" style={{ color: "var(--muted)" }}>{room.location}</p>
              <p className="text-sm mt-2">
                Capacity: <span className="font-medium">{room.capacity}</span> people
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
