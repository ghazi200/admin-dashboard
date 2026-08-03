/**
 * Email candidates for login lookup.
 * Gmail ignores dots in the local-part; older rows may be stored with dots stripped
 * (sethcousins@gmail.com) while users type seth.cousins@gmail.com.
 */
function emailLookupCandidates(email) {
  const e = String(email || "")
    .trim()
    .toLowerCase();
  if (!e) return [];

  const out = new Set([e]);
  const at = e.lastIndexOf("@");
  if (at <= 0) return [...out];

  const local = e.slice(0, at);
  const domain = e.slice(at + 1);
  if (domain === "gmail.com" || domain === "googlemail.com") {
    out.add(`${local.replace(/\./g, "")}@gmail.com`);
    out.add(`${local.replace(/\./g, "")}@googlemail.com`);
  }
  return [...out];
}

module.exports = { emailLookupCandidates };
