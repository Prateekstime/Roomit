# RoomIt - Meeting Room Booking

## Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Configure environment**
   ```bash
   cp .env.local.example .env.local
   # Edit .env.local and set your MongoDB URI
   ```

3. **Seed the database**
   ```bash
   npm run seed
   ```

4. **Run development server**
   ```bash
   npm run dev
   ```

Open [http://localhost:3000](http://localhost:3000)

## Features

- Browse available meeting rooms
- View 30-minute slot availability grid per room per day
- Book single or multi-slot time blocks
- Recurring weekly bookings (partial or all-or-nothing conflict mode)
- Cancel bookings with refundable/non-refundable logic (2-hour window)
- Concurrency-safe via MongoDB unique partial index + transactions

## Requirements

- Node.js 18+
- MongoDB 6+ (replica set required for transactions)
