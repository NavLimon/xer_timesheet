function toISODate(date) {
  return date.toISOString().slice(0, 10);
}

function parseLocalDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function addDays(value, days) {
  const date = typeof value === "string" ? parseLocalDate(value) : new Date(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date;
}

function weekDates(weekStart) {
  return Array.from({ length: 7 }, (_, index) => toISODate(addDays(weekStart, index)));
}

function todayMonday() {
  const now = new Date();
  const utc = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const day = utc.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  utc.setUTCDate(utc.getUTCDate() + diff);
  return toISODate(utc);
}

module.exports = { addDays, parseLocalDate, todayMonday, toISODate, weekDates };
