export const SLOTS_PER_DAY = 48;

export function generateDaySlots() {
  const slots = [];
  for (let i = 0; i < SLOTS_PER_DAY; i++) {
    const totalMinutes = i * 30;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    slots.push(`${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`);
  }
  return slots;
}

export function slotToIndex(slot) {
  const [h, m] = slot.split(":").map(Number);
  return h * 2 + (m === 30 ? 1 : 0);
}

export function indexToSlot(index) {
  const totalMinutes = index * 30;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function addThirtyMinutes(time) {
  const [h, m] = time.split(":").map(Number);
  const totalMinutes = h * 60 + m + 30;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function isValidDateString(date) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date);
}

export function isValidSlotTime(time) {
  return /^([01]\d|2[0-3]):(00|30)$/.test(time);
}

export function dateTimeToDate(date, time) {
  if (time === "24:00") {
    const d = new Date(`${date}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    return d;
  }
  return new Date(`${date}T${time}:00.000Z`);
}
