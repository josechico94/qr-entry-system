import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function dataUrlToBuffer(dataUrl) {
  const m = String(dataUrl || "").match(/^data:.*?;base64,(.*)$/);
  if (!m) return null;
  return Buffer.from(m[1], "base64");
}

// Rounded rectangle helper for PDFKit
function roundedRect(doc, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  doc
    .moveTo(x + radius, y)
    .lineTo(x + w - radius, y)
    .quadraticCurveTo(x + w, y, x + w, y + radius)
    .lineTo(x + w, y + h - radius)
    .quadraticCurveTo(x + w, y + h, x + w - radius, y + h)
    .lineTo(x + radius, y + h)
    .quadraticCurveTo(x, y + h, x, y + h - radius)
    .lineTo(x, y + radius)
    .quadraticCurveTo(x, y, x + radius, y)
    .closePath();
  return doc;
}

export function buildTicketPdf(attendee) {
  const doc = new PDFDocument({ size: "A6", margin: 24 });
  const chunks = [];
  doc.on("data", (c) => chunks.push(c));
  const done = new Promise((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  const logoPath = path.join(__dirname, "../assets/logo.png");
  const hasLogo = fs.existsSync(logoPath);

  // Header
  if (hasLogo) {
    doc.image(logoPath, doc.page.margins.left, 18, { width: 120 });
  }
  doc.fontSize(14).fillColor("#111111").text("BOLOGNA RUGBY CLUB", 0, 22, { align: "right" });
  doc.fontSize(10).fillColor("#444444").text("Biglietto di ingresso • QR monouso", { align: "right" });

  // Attendee box (rounded)
  const boxX = doc.page.margins.left;
  const boxY = 90;
  const boxW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const boxH = 52;

  doc.save();
  roundedRect(doc, boxX, boxY, boxW, boxH, 10).fill("#F4F6F8");
  doc.restore();

  doc.fillColor("#111111").fontSize(13).text(
    `${attendee.firstName} ${attendee.lastName}`,
    boxX + 14,
    boxY + 14,
    { width: boxW - 28 }
  );

  doc.fillColor("#444444").fontSize(9).text(
    `Documento: ${attendee.document || "-"}`,
    boxX + 14,
    boxY + 36,
    { width: boxW - 28 }
  );

  // QR
  const qrBuf = dataUrlToBuffer(attendee.qrDataUrl);
  if (qrBuf) {
    const qrSize = 160;
    const x = (doc.page.width - qrSize) / 2;
    const y = 160;
    doc.image(qrBuf, x, y, { width: qrSize, height: qrSize });
  } else {
    doc.fillColor("#AA0000").fontSize(10).text("QR non disponibile", { align: "center" });
  }

  // Token
  doc.fillColor("#666666").fontSize(7.5).text(`Token: ${attendee.qrToken}`, boxX, 330, { align: "center" });

  // Footer line + text
  doc
    .moveTo(boxX, 350)
    .lineTo(doc.page.width - doc.page.margins.right, 350)
    .strokeColor("#DDDDDD")
    .stroke();

  doc.fillColor("#444444").fontSize(8).text(
    "Mostra questo QR all’ingresso. Una volta scansionato non sarà valido.",
    boxX,
    358,
    { align: "center", width: boxW }
  );

  doc.end();
  return done;
}