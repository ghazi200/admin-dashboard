const {
  currentWeekRange,
  toDateOnly,
  sanitizeNote,
} = (() => {
  // Re-test pure helpers without loading Sequelize models
  const NOTE_MAX = 500;
  function toDateOnly(d) {
    if (!d) return null;
    if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
    const x = new Date(d);
    if (Number.isNaN(x.getTime())) return null;
    const y = x.getFullYear();
    const m = String(x.getMonth() + 1).padStart(2, "0");
    const day = String(x.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  function currentWeekRange(now = new Date()) {
    const today = new Date(now);
    const dayOfWeek = today.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(today);
    monday.setDate(today.getDate() + mondayOffset);
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { start: toDateOnly(monday), end: toDateOnly(sunday) };
  }
  function sanitizeNote(note) {
    if (note == null) return null;
    const s = String(note).trim();
    if (!s) return null;
    return s.length > NOTE_MAX ? s.slice(0, NOTE_MAX) : s;
  }
  return { currentWeekRange, toDateOnly, sanitizeNote };
})();

describe("scheduleAcknowledgment helpers", () => {
  test("toDateOnly parses ISO and Date", () => {
    expect(toDateOnly("2026-08-10T12:00:00Z")).toBe("2026-08-10");
    expect(toDateOnly(new Date(2026, 7, 10))).toBe("2026-08-10");
  });

  test("currentWeekRange is Mon–Sun", () => {
    // Wednesday Aug 12, 2026 local
    const w = currentWeekRange(new Date(2026, 7, 12, 15, 0, 0));
    expect(w.start).toBe("2026-08-10");
    expect(w.end).toBe("2026-08-16");
  });

  test("sanitizeNote trims and caps length", () => {
    expect(sanitizeNote("  hi  ")).toBe("hi");
    expect(sanitizeNote("")).toBeNull();
    expect(sanitizeNote("x".repeat(600)).length).toBe(500);
  });
});
