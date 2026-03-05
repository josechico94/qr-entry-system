import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function safe(v) {
  return (v ?? "").toString();
}

function dataUrlToBuffer(dataUrl) {
  if (!dataUrl) return null;
  const m = String(dataUrl).match(/^data:(.+);base64,(.*)$/);
  if (!m) return null;
  return Buffer.from(m[2], "base64");
}

function drawWatermark(doc, text) {
  const cx = doc.page.width / 2;
  const cy = doc.page.height / 2;
  doc.save();
  doc.rotate(-18, { origin: [cx, cy] });
  doc.fontSize(28).fillColor("#111111").opacity(0.08);
  doc.text(text, 0, cy - 24, { align: "center" });
  doc.opacity(1);
  doc.restore();
}

export function buildTicketPdf(doc, attendee, opts = {}) {
  const {
    eventName = "BOLOGNA RUGBY CLUB",
    eventDate = "",
    eventTime = "",
    eventLocation = "",
    watermark = "VALIDO SOLO 1 INGRESSO",
    logoPath = path.join(__dirname, "../assets/logo.png")
  } = opts;

  const hasLogo = fs.existsSync(logoPath);
  const pageW = doc.page.width;
  const left = doc.page.margins.left;
  const right = pageW - doc.page.margins.right;

  // Subtle watermark
  if (watermark) drawWatermark(doc, watermark);

  // Header
  if (hasLogo) {
    doc.image(logoPath, left, 18, { width: 110 });
  }
  doc
    .font("Helvetica-Bold")
    .fontSize(13)
    .fillColor("#0B1220")
    .text(eventName, 0, 18, { align: "right" });

  const metaLine = [eventDate, eventTime, eventLocation].filter(Boolean).join(" • ");
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor("#334155")
    .text(metaLine || "Biglietto di ingresso • QR monouso", 0, 36, { align: "right" });

  // Divider
  doc
    .moveTo(left, 56)
    .lineTo(right, 56)
    .lineWidth(1)
    .strokeColor("#E2E8F0")
    .stroke();

  // Attendee card
  const cardX = left;
  const cardY = 70;
  const cardW = right - left;
  const cardH = 56;

  doc
    .roundedRect(cardX, cardY, cardW, cardH, 14)
    .fillColor("#F8FAFC")
    .fill();

  doc
    .font("Helvetica-Bold")
    .fontSize(14)
    .fillColor("#0B1220")
    .text(`${safe(attendee.firstName)} ${safe(attendee.lastName)}`.trim(), cardX + 16, cardY + 14, {
      width: cardW - 32
    });

  const docLine = attendee.document ? `Documento: ${safe(attendee.document)}` : "Documento: -";
  const ticketLine = attendee.ticketNumber ? `Ticket #${safe(attendee.ticketNumber)}` : "Ticket #-";

  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor("#334155")
    .text(`${docLine}  •  ${ticketLine}`, cardX + 16, cardY + 36, { width: cardW - 32 });

  // QR
  const qrBuf = dataUrlToBuffer(attendee.qrDataUrl);
  const qrSize = 220;
  const qrX = (pageW - qrSize) / 2;
  const qrY = cardY + cardH + 18;
  if (qrBuf) {
    doc.image(qrBuf, qrX, qrY, { width: qrSize, height: qrSize });
  } else {
    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor("#EF4444")
      .text("QR non disponibile", 0, qrY + 90, { align: "center" });
  }

  // Token small
  doc
    .font("Helvetica")
    .fontSize(7.5)
    .fillColor("#64748B")
    .text(`Token: ${safe(attendee.qrToken)}`, left, qrY + qrSize + 10, { align: "center" });

  // Footer
  doc
    .moveTo(left, doc.page.height - 64)
    .lineTo(right, doc.page.height - 64)
    .lineWidth(1)
    .strokeColor("#E2E8F0")
    .stroke();

  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor("#0F172A")
    .text("Mostra questo QR all’ingresso.", left, doc.page.height - 54, { align: "center" });
  doc
    .fontSize(8)
    .fillColor("#64748B")
    .text("Una volta scansionato non sarà più valido.", left, doc.page.height - 40, { align: "center" });
}

export function getPdfOptionsFromEnv() {
  return {
    eventName: process.env.EVENT_NAME || "BOLOGNA RUGBY CLUB",
    eventDate: process.env.EVENT_DATE || "",
    eventTime: process.env.EVENT_TIME || "",
    eventLocation: process.env.EVENT_LOCATION || "",
    watermark: process.env.TICKET_WATERMARK || "VALIDO SOLO 1 INGRESSO"
  };
}

export function createTicketDoc() {
  // A6 portrait is great for printing
  return new PDFDocument({ size: "A6", margin: 24 });
}
