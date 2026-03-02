// backend/src/services/pdfExtract.service.js
const fs = require("fs");
const pdfParse = require("pdf-parse");

async function extractTextFromPdf(filePath) {
  const buf = fs.readFileSync(filePath);
  const data = await pdfParse(buf);
  return (data?.text || "").trim();
}

module.exports = { extractTextFromPdf };
