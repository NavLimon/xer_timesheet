const positions = [
  "Support Worker Level 1",
  "Support Worker Level 2",
  "Senior Support Worker",
  "Team Leader",
  "Administration",
  "Support Coordinator"
];

const earningCategories = [
  { key: "ordinary", label: "Ordinary Hours", required: true },
  { key: "weekdayEvening", label: "Weekday Evening", required: true },
  { key: "saturday", label: "Saturday", required: true },
  { key: "sunday", label: "Sunday", required: true },
  { key: "publicHoliday", label: "Public Holiday", required: true },
  { key: "nightSleepover", label: "Night Time Sleepover", required: true },
  { key: "activeNight", label: "Active Night", required: true },
  { key: "travel", label: "Travel", required: true },
  { key: "nonBillable", label: "Non-Billable", required: false }
];

function categoryForDate(date) {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  if (day === 0) return "sunday";
  if (day === 6) return "saturday";
  return "ordinary";
}

function categoryLabel(key) {
  const category = earningCategories.find((item) => item.key === key);
  return category ? category.label : key;
}

module.exports = {
  categoryForDate,
  categoryLabel,
  earningCategories,
  positions
};
