import "./globals.css";
import Link from "next/link";

export const metadata = {
  title: "RoomIt - Meeting Room Booking",
  description: "Internal meeting room booking tool",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col">
        <header className="bg-white border-b" style={{ borderColor: "var(--border)" }}>
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
            <Link href="/" className="text-xl font-bold" style={{ color: "var(--primary)" }}>
              RoomIt
            </Link>
            <nav className="flex gap-4 text-sm font-medium">
              <Link href="/" className="hover:underline">Rooms</Link>
              <Link href="/bookings" className="hover:underline">My Bookings</Link>
            </nav>
          </div>
        </header>

        <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-6">{children}</main>

        <footer className="text-center text-xs py-4" style={{ color: "var(--muted)" }}>
          RoomIt - Internal Meeting Room Booking Tool
        </footer>
      </body>
    </html>
  );
}
