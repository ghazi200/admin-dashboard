/**
 * Unit tests for guard CSV parse (no DB).
 * Run: npx jest src/test/guardCsvImport.test.js --runInBand
 */
const { parseGuardCsv, TEMPLATE_CSV } = require("../services/guardCsvImport.service");

describe("parseGuardCsv", () => {
  test("parses template rows", () => {
    const { rows, errors } = parseGuardCsv(TEMPLATE_CSV);
    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(2);
    expect(rows[0].name).toBe("Jane Doe");
    expect(rows[0].communications_consent).toBe(true);
    expect(rows[0].contact_preferences.sms).toBe(true);
    expect(rows[1].communications_consent).toBe(false);
    expect(rows[1].contact_preferences.sms).toBe(false);
  });

  test("accepts consent alias and quoted commas", () => {
    const csv = `name,email,consent\n"Doe, Jane",a@b.com,yes\n`;
    const { rows, errors } = parseGuardCsv(csv);
    expect(errors).toHaveLength(0);
    expect(rows[0].name).toBe("Doe, Jane");
    expect(rows[0].communications_consent).toBe(true);
  });

  test("requires name column and name values", () => {
    expect(parseGuardCsv("email\nx@y.com\n").errors[0].message).toMatch(/name/i);
    const { errors } = parseGuardCsv("name,email\n,x@y.com\n");
    expect(errors.some((e) => /name is required/i.test(e.message))).toBe(true);
  });
});
