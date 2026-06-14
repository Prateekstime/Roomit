# RoomIt - Meeting Room Booking System

An internal tool for booking meeting rooms, built with **Next.js (App Router)**,
**Node.js API routes**, **MongoDB (Mongoose)**, and **Tailwind CSS**.

The core focus of this project is **correctness under concurrency**:
two people can never end up with overlapping bookings for the same room,
even if they click "Book" at the exact same instant.

---

## 1. Tech Stack

- **Next.js 16 (App Router)** - JavaScript (no TypeScript)
- **MongoDB + Mongoose** - data layer
- **Tailwind CSS** - styling (flat solid colors only, no gradients)
- API routes live under `app/api/*`
- Pages live under `app/*`

---

## 2. Project Structure

```
roomit/
├── app/
│   ├── api/
│   │   ├── rooms/
│   │   │   ├── route.js                  # GET /api/rooms
│   │   │   └── [id]/availability/route.js# GET /api/rooms/:id/availability
│   │   └── bookings/
│   │       ├── route.js                  # GET/POST /api/bookings
│   │       └── [id]/cancel/route.js      # PATCH /api/bookings/:id/cancel
│   ├── rooms/[id]/page.js                # Slot grid + booking form (client)
│   ├── bookings/page.js                  # My Bookings (lookup + cancel)
│   ├── page.js                           # Home: room list
│   ├── layout.js                         # Shared layout/nav
│   └── globals.css                       # Theme (flat colors, no gradients)
├── lib/
│   ├── db.js                             # Cached MongoDB connection
│   └── slots.js                          # Shared 30-min slot utilities
├── models/
│   ├── Room.js
│   └── Booking.js                        # Unique index -> no double-booking
├── scripts/
│   ├── seed.js                           # Seeds 4 rooms + sample bookings
│   └── concurrency-demo.js               # Fires 2 simultaneous bookings
├── .env.example                          # Copy to .env.local
└── README.md
```

---

## 3. Setup

### 3.1 Install dependencies

```bash
npm install
```

### 3.2 Configure environment variables

Copy `.env.example` to `.env.local` and fill in your values:

```bash
cp .env.example .env.local
```

```env
MONGODB_URI=mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/roomit?retryWrites=true&w=majority
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

> **IMPORTANT - Replica Set Required**
> The double-booking prevention mechanism uses MongoDB **transactions**
> (`mongoose.startSession()` + `withTransaction`), which **require MongoDB
> to be running as a replica set**. This is automatic with **MongoDB
> Atlas** (even the free M0 tier is a replica set), so the easiest path
> is to create a free Atlas cluster and paste its connection string into
> `MONGODB_URI`.
>
> If you must run MongoDB locally, start it as a single-node replica set:
> ```bash
> mongod --replSet rs0 --dbpath /path/to/data
> # then, once, in a mongo shell:
> rs.initiate()
> ```

### 3.3 Seed the database

```bash
npm run seed
```

This will:
- Clear any existing `rooms`/`bookings` collections
- Insert **4 rooms**: Falcon, Eagle, Phoenix, Sparrow
- Insert a realistic mix of bookings, including:
  - Two bookings starting **within the next 2 hours** (today) - cancelling
    these should result in **`cancelled-non-refundable`**
  - Two bookings **tomorrow** (more than 2 hours away) - cancelling these
    should result in **`cancelled-refundable`**
  - A booking that has already ended today (for testing "past bookings
    can't be cancelled")

### 3.4 Run the dev server

```bash
npm run dev
```

Visit `http://localhost:3000`.

---

## 4. Data Model

### Room
| Field      | Type   | Notes                  |
|------------|--------|------------------------|
| name       | String | e.g. "Falcon"          |
| location   | String | e.g. "1st Floor, North Wing" |
| capacity   | Number | max people             |

### Booking

Each **30-minute slot** of a booking is stored as its **own document**.
A 1-hour booking (2 slots) becomes 2 documents sharing a `groupId`.

| Field            | Type   | Notes |
|------------------|--------|-------|
| room             | ObjectId (ref Room) | |
| date             | String "YYYY-MM-DD" | |
| slotStart        | String "HH:MM" | this slot's start (e.g. "10:00") |
| slotEnd          | String "HH:MM" | this slot's end (e.g. "10:30") |
| groupId          | String | groups all slot-documents of one booking |
| startTime/endTime| String | overall booking start/end (for display) |
| bookedBy.name    | String | |
| bookedBy.email   | String | lowercased |
| title            | String | meeting title |
| status           | String | `confirmed` \| `cancelled-refundable` \| `cancelled-non-refundable` |
| recurrenceId     | String/null | groups all occurrences of a recurring series |
| occurrenceIndex  | Number/null | 1-based occurrence number |
| createdAt        | Date | auto |

**The critical index** (`models/Booking.js`):

```js
BookingSchema.index(
  { room: 1, date: 1, slotStart: 1 },
  { unique: true, partialFilterExpression: { status: "confirmed" } }
);
```

This is a **partial unique index**: it only applies to documents where
`status === "confirmed"`. So:
- Two `confirmed` documents for the same `(room, date, slotStart)` is
  **impossible** - the second insert throws a MongoDB duplicate-key
  error (`E11000`).
- Once a booking is cancelled (`status` changes to `cancelled-*`), it no
  longer counts toward the index, so the slot becomes bookable again
  **immediately**.

---

## 5. API Reference

### `GET /api/rooms`
Returns `{ rooms: [...] }`.

### `GET /api/rooms/:id/availability?date=YYYY-MM-DD`
Returns the full 48-slot grid (00:00 → 23:30, 30-min steps) for that
room/date:

```json
{
  "room": { "_id": "...", "name": "Falcon", "location": "...", "capacity": 4 },
  "date": "2026-06-15",
  "slots": [
    { "slotStart": "00:00", "slotEnd": "00:30", "available": true,  "bookedByName": null, "title": null },
    { "slotStart": "10:00", "slotEnd": "10:30", "available": false, "bookedByName": "Asha Mehta", "title": "Standup" },
    ...
  ]
}
```

This endpoint and the booking-creation endpoint both key off the exact
same `(room, date, slotStart, status="confirmed")` condition - so a slot
shown as "available" here is guaranteed bookable, and vice versa
(Requirement 3.3).

### `POST /api/bookings`
Creates a booking for one or more **consecutive** 30-min slots.

```json
{
  "roomId": "<room ObjectId>",
  "date": "2026-06-15",
  "startTime": "10:00",
  "endTime": "11:00",
  "bookedBy": { "name": "Asha Mehta", "email": "asha@example.com" },
  "title": "Sprint Planning"
}
```

- `endTime` is **exclusive** (10:00 → 11:00 = two 30-min slots: 10:00 and 10:30).
- Validates all requested slots are free **inside a MongoDB transaction**.
  If ANY slot is already booked, the **entire request fails** with `409`
  and **no slots are reserved** (no partial bookings).
- Success → `201 { message, date, startTime, endTime, slots: [...] }`
- Conflict → `409 { error: "One or more of the requested slots are already booked..." }`

#### Recurring bookings (optional, extended requirement 4.1)

Add a `recurrence` object to book the same weekday/time for N weeks:

```json
{
  "roomId": "...",
  "date": "2026-06-15",
  "startTime": "10:00",
  "endTime": "11:00",
  "bookedBy": { "name": "...", "email": "..." },
  "title": "Weekly Sync",
  "recurrence": { "weeks": 6 },
  "recurrenceMode": "partial"
}
```

- `recurrenceMode: "partial"` (default) - books every free occurrence,
  **skips** (does not book) any occurrence that conflicts, and reports
  exactly which occurrences were booked vs skipped:
  ```json
  {
    "message": "Recurring booking processed: 5/6 occurrence(s) booked.",
    "recurrenceId": "...",
    "occurrences": [
      { "date": "2026-06-15", "occurrenceIndex": 1, "status": "booked" },
      { "date": "2026-06-22", "occurrenceIndex": 2, "status": "skipped-conflict" },
      ...
    ]
  }
  ```
- `recurrenceMode: "all-or-nothing"` - checks **all** occurrences upfront;
  if **any** conflict exists, **nothing** is booked and a `409` with the
  list of conflicting dates is returned.

### `GET /api/bookings?email=...`
Returns all bookings (grouped by `groupId`, i.e. one entry per logical
booking - including multi-slot and each recurring occurrence) for that
email, newest first, with room details populated.

### `PATCH /api/bookings/:id/cancel`
Cancels the booking that the given slot-document `:id` belongs to (all
slots sharing its `groupId`).

- Computes refund eligibility using the **server clock**:
  - `>= 2 hours` before `startTime` → `status = "cancelled-refundable"`
  - `< 2 hours` before `startTime` (or already started) →
    `status = "cancelled-non-refundable"`
- Already-cancelled bookings return `400` (cannot cancel twice).
- Cancelling immediately frees the slot(s) - they leave the partial
  unique index and become bookable again.

Response:
```json
{ "message": "Booking cancelled", "status": "cancelled-refundable", "slotsAffected": 2, "refundable": true }
```

---

## 6. Concurrency Demo (Requirement 3.1)

With the dev server running (`npm run dev`), in another terminal run:

```bash
npm run concurrency-demo
```

This script (`scripts/concurrency-demo.js`):
1. Picks a room (first room from `/api/rooms`) and a date 7 days out.
2. Fires **two `POST /api/bookings` requests at the exact same time**
   (`Promise.all`) for the **same room/date/slot** but two different users.
3. Prints both responses.

**Expected result:** exactly one request returns `201 Created`, the other
returns `409 Conflict` with a clean error message - proving the unique
index + transaction prevents the race condition at the database layer.

You can also reproduce this manually with `curl`:

```bash
curl -X POST http://localhost:3000/api/bookings -H "Content-Type: application/json" \
  -d '{"roomId":"<id>","date":"2026-06-22","startTime":"09:00","endTime":"09:30","bookedBy":{"name":"A","email":"a@x.com"},"title":"Test A"}' &
curl -X POST http://localhost:3000/api/bookings -H "Content-Type: application/json" \
  -d '{"roomId":"<id>","date":"2026-06-22","startTime":"09:00","endTime":"09:30","bookedBy":{"name":"B","email":"b@x.com"},"title":"Test B"}' &
wait
```

---

## 7. Frontend Pages

- **`/`** - List of all rooms (links to each room's page).
- **`/rooms/[id]`** - Date picker + 30-min slot grid for the selected
  room/date. Click consecutive available slots to select a range, fill
  in name/email/title, and book. Unavailable (booked) slots are visually
  marked and **cannot be clicked**. After booking (success or conflict),
  the grid **re-fetches automatically** (no full page reload). Includes an
  optional "recurring weekly booking" toggle.
- **`/bookings`** - Enter an email to look up your bookings. Each booking
  shows its status (`Confirmed` / `Cancelled (Refundable)` /
  `Cancelled (Non-refundable)`). "Cancel" is shown only for `confirmed`,
  non-past bookings, with a confirmation dialog before cancelling.

---

## 8. Extended Requirements Implemented

This project implements **Section 4.1 - Recurring bookings with
partial-conflict handling**:

- A recurring booking (`recurrence: { weeks: N }`) checks **all N
  occurrences upfront**.
- `recurrenceMode: "partial"` books every free occurrence and explicitly
  reports which occurrences were skipped due to conflict (never silently
  skipped).
- `recurrenceMode: "all-or-nothing"` rejects the entire series if any
  occurrence conflicts (lets the user "cancel the whole series").

---

## 9. Notes on Design Decisions

- **Per-slot documents** (one document per 30-min slot, linked by
  `groupId`) rather than one document per booking with a time range. This
  is what allows a simple, DB-enforced **unique compound index** on
  `(room, date, slotStart)` to guarantee no double-booking, instead of
  relying on application-level overlap checks.
- **Partial index** (`partialFilterExpression: { status: "confirmed" }`)
  so cancelled slots don't permanently "use up" the unique key - the same
  slot can be rebooked after cancellation.
- **Transactions** (`mongoose.startSession()` + `withTransaction`) ensure
  multi-slot bookings are all-or-nothing: if slot 2 of a 2-slot booking
  conflicts, slot 1's insert is rolled back too.
- **Server-side refund computation** - `PATCH /.../cancel` never trusts
  any client-supplied timestamp; it always uses `new Date()` on the
  server.
- **No gradients** anywhere in the UI - all colors are flat/solid,
  defined as CSS variables in `app/globals.css`.
- **No authentication** - users are identified purely by the email they
  type into the booking form / lookup page, per the assignment scope.

---

## 10. Deployment

1. Push this repo to GitHub.
2. Deploy to [Vercel](https://vercel.com) (or any Node host).
3. Set environment variables in the host's dashboard:
   - `MONGODB_URI` - your MongoDB Atlas connection string
   - `NEXT_PUBLIC_BASE_URL` - your deployed URL (e.g. `https://roomit.vercel.app`)
4. Run `npm run seed` once against your production database (e.g. via
   `MONGODB_URI=<prod-uri> npm run seed` locally, pointed at the Atlas
   cluster).
