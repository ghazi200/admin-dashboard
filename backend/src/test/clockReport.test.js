/**
 * Clock Report service tests.
 * Run with: npx jest src/test/clockReport.test.js --runInBand
 */

const clockReportService = require("../services/clockReport.service");

function mockSequelize(shiftRows = [], otRows = [], timeEntryRows = []) {
  const callCount = { query: 0 };
  const query = jest.fn().mockImplementation(async () => {
    callCount.query++;
    if (callCount.query === 1) return [shiftRows];
    if (callCount.query === 2) return [otRows];
    return [timeEntryRows];
  });
  return { query };
}

describe("clockReport.service", () => {
  describe("getWeekBounds", () => {
    test("returns weekStart and weekEnd as YYYY-MM-DD with Monday as start", () => {
      const { weekStart, weekEnd } = clockReportService.getWeekBounds("2026-02-05");
      expect(weekStart).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(weekEnd).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      const mon = new Date(weekStart + "T12:00:00");
      const end = new Date(weekEnd + "T12:00:00");
      expect(mon.getDay()).toBe(1); // Monday
      const daysDiff = Math.round((end - mon) / (24 * 60 * 60 * 1000));
      expect(daysDiff).toBeGreaterThanOrEqual(5);
      expect(daysDiff).toBeLessThanOrEqual(8);
      expect(weekStart <= weekEnd).toBe(true);
    });

    test("without date uses current date", () => {
      const { weekStart, weekEnd } = clockReportService.getWeekBounds(null);
      expect(weekStart).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(weekEnd).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe("formatTimeForReport", () => {
    test("formats 07:00 as 7am", () => {
      expect(clockReportService.formatTimeForReport("07:00")).toBe("7am");
    });
    test("formats 15:00 as 3pm", () => {
      expect(clockReportService.formatTimeForReport("15:00")).toBe("3pm");
    });
    test("formats 23:00 as 11pm", () => {
      expect(clockReportService.formatTimeForReport("23:00")).toBe("11pm");
    });
    test("returns — for empty", () => {
      expect(clockReportService.formatTimeForReport(null)).toBe("—");
      expect(clockReportService.formatTimeForReport("")).toBe("—");
    });
  });

  describe("shiftBandLabel", () => {
    test("returns 7am–3pm for 07:00 and 15:00", () => {
      expect(clockReportService.shiftBandLabel("07:00", "15:00")).toBe("7am–3pm");
    });
  });

  describe("buildClockReport", () => {
    test("returns error when tenantId is missing", async () => {
      const models = { sequelize: mockSequelize() };
      const result = await clockReportService.buildClockReport({}, models);
      expect(result.error).toBe("tenantId is required");
      expect(result.locations).toEqual([]);
    });

    test("returns empty locations and summary when no shifts", async () => {
      const models = { sequelize: mockSequelize([], [], []) };
      const result = await clockReportService.buildClockReport(
        { tenantId: "tenant-1", weekStart: "2026-02-03", weekEnd: "2026-02-09" },
        models
      );
      expect(result.error).toBeUndefined();
      expect(result.weekStart).toBe("2026-02-03");
      expect(result.weekEnd).toBe("2026-02-09");
      expect(result.locations).toEqual([]);
      expect(result.summary).toMatch(/no activity/i);
      expect(result.suggestions).toEqual([]);
    });

    test("returns missed_clock_in when shift has no time entry", async () => {
      const shiftId = "shift-1";
      const guardId = "guard-bob";
      const shifts = [
        {
          id: shiftId,
          shift_date: "2026-02-03",
          shift_start: "07:00:00",
          shift_end: "15:00:00",
          location: "Location A",
          scheduled_guard_id: guardId,
          scheduled_guard_name: "Bob",
        },
      ];
      const models = { sequelize: mockSequelize(shifts, [], []) };
      const result = await clockReportService.buildClockReport(
        { tenantId: "tenant-1", weekStart: "2026-02-03", weekEnd: "2026-02-09" },
        models
      );
      expect(result.locations).toHaveLength(1);
      expect(result.locations[0].location).toBe("Location A");
      expect(result.locations[0].narratives).toHaveLength(0);
      expect(result.locations[0].flags).toHaveLength(1);
      expect(result.locations[0].flags[0].type).toBe("missed_clock_in");
      expect(result.locations[0].flags[0].guardName).toBe("Bob");
      expect(result.locations[0].flags[0].message).toMatch(/did not clock in/i);
      expect(result.suggestions.length).toBeGreaterThan(0);
    });

    test("returns narrative when shift has complete time entry", async () => {
      const shiftId = "shift-1";
      const guardId = "guard-bob";
      const shifts = [
        {
          id: shiftId,
          shift_date: "2026-02-03",
          shift_start: "07:00:00",
          shift_end: "15:00:00",
          location: "Location A",
          scheduled_guard_id: guardId,
          scheduled_guard_name: "Bob",
        },
      ];
      const timeEntries = [
        {
          id: "te-1",
          shift_id: shiftId,
          actual_guard_id: guardId,
          actual_guard_name: "Bob",
          clock_in_at: new Date("2026-02-03T12:00:00Z"),
          clock_out_at: new Date("2026-02-03T20:00:00Z"),
          lunch_start_at: new Date("2026-02-03T16:00:00Z"),
          lunch_end_at: new Date("2026-02-03T16:30:00Z"),
        },
      ];
      const models = { sequelize: mockSequelize(shifts, [], timeEntries) };
      const result = await clockReportService.buildClockReport(
        { tenantId: "tenant-1", weekStart: "2026-02-03", weekEnd: "2026-02-09" },
        models
      );
      expect(result.locations[0].narratives).toHaveLength(1);
      expect(result.locations[0].narratives[0].guardName).toBe("Bob");
      expect(result.locations[0].narratives[0].text).toMatch(/Bob clocked in/i);
      expect(result.locations[0].narratives[0].text).toMatch(/clocked out/i);
      expect(result.locations[0].flags).toHaveLength(0);
    });

    test("returns wrong_person_clock_in when different guard clocked in", async () => {
      const shiftId = "shift-1";
      const scheduledGuardId = "guard-bob";
      const actualGuardId = "guard-ghazi";
      const shifts = [
        {
          id: shiftId,
          shift_date: "2026-02-03",
          shift_start: "07:00:00",
          shift_end: "15:00:00",
          location: "Location A",
          scheduled_guard_id: scheduledGuardId,
          scheduled_guard_name: "Bob",
        },
      ];
      const timeEntries = [
        {
          id: "te-1",
          shift_id: shiftId,
          actual_guard_id: actualGuardId,
          actual_guard_name: "Ghazi",
          clock_in_at: new Date("2026-02-03T12:00:00Z"),
          clock_out_at: new Date("2026-02-03T20:00:00Z"),
          lunch_start_at: null,
          lunch_end_at: null,
        },
      ];
      const models = { sequelize: mockSequelize(shifts, [], timeEntries) };
      const result = await clockReportService.buildClockReport(
        { tenantId: "tenant-1", weekStart: "2026-02-03", weekEnd: "2026-02-09" },
        models
      );
      const wrongPersonFlags = result.locations[0].flags.filter((f) => f.type === "wrong_person_clock_in");
      expect(wrongPersonFlags).toHaveLength(1);
      expect(wrongPersonFlags[0].scheduledGuardName).toBe("Bob");
      expect(wrongPersonFlags[0].actualGuardName).toBe("Ghazi");
      expect(wrongPersonFlags[0].message).toMatch(/Ghazi clocked in but Bob was scheduled/i);
    });

    test("returns missed_clock_out when clocked in but no clock out", async () => {
      const shiftId = "shift-1";
      const guardId = "guard-bob";
      const shifts = [
        {
          id: shiftId,
          shift_date: "2026-02-03",
          shift_start: "07:00:00",
          shift_end: "15:00:00",
          location: "Location A",
          scheduled_guard_id: guardId,
          scheduled_guard_name: "Bob",
        },
      ];
      const timeEntries = [
        {
          id: "te-1",
          shift_id: shiftId,
          actual_guard_id: guardId,
          actual_guard_name: "Bob",
          clock_in_at: new Date("2026-02-03T12:00:00Z"),
          clock_out_at: null,
          lunch_start_at: null,
          lunch_end_at: null,
        },
      ];
      const models = { sequelize: mockSequelize(shifts, [], timeEntries) };
      const result = await clockReportService.buildClockReport(
        { tenantId: "tenant-1", weekStart: "2026-02-03", weekEnd: "2026-02-09" },
        models
      );
      expect(result.locations[0].narratives).toHaveLength(0);
      const missedOut = result.locations[0].flags.filter((f) => f.type === "missed_clock_out");
      expect(missedOut).toHaveLength(1);
      expect(missedOut[0].message).toMatch(/did not clock out/i);
    });

    test("does not flag missed_clock_out when overtime accepted", async () => {
      const shiftId = "shift-1";
      const guardId = "guard-bob";
      const shifts = [
        {
          id: shiftId,
          shift_date: "2026-02-03",
          shift_start: "07:00:00",
          shift_end: "15:00:00",
          location: "Location A",
          scheduled_guard_id: guardId,
          scheduled_guard_name: "Bob",
        },
      ];
      const otRows = [{ shift_id: shiftId, guard_id: guardId }];
      const timeEntries = [
        {
          id: "te-1",
          shift_id: shiftId,
          actual_guard_id: guardId,
          actual_guard_name: "Bob",
          clock_in_at: new Date("2026-02-03T12:00:00Z"),
          clock_out_at: null,
          lunch_start_at: null,
          lunch_end_at: null,
        },
      ];
      const models = { sequelize: mockSequelize(shifts, otRows, timeEntries) };
      const result = await clockReportService.buildClockReport(
        { tenantId: "tenant-1", weekStart: "2026-02-03", weekEnd: "2026-02-09" },
        models
      );
      const missedOut = result.locations[0].flags.filter((f) => f.type === "missed_clock_out");
      expect(missedOut).toHaveLength(0);
      expect(result.locations[0].otNotes).toHaveLength(1);
      expect(result.locations[0].otNotes[0].message).toMatch(/overtime/i);
    });
  });
});
