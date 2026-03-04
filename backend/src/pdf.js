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

function roundedRectPath(doc, x, y, w, h, r) {
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

function drawHeader(doc, { logoPath, clubTitle, eventTitle }) {
  const pageW = doc.page.width;
  const mL = doc.page.margins.left;
  const mR = doc.page.margins.right;
  const contentW = pageW - mL - mR;

  // Header bar
  const headerY = 18;
  const headerH = 54;
  doc.save();
  roundedRectPath(doc, mL, headerY, contentW, headerH, 14)
    .fill("#0B1A3A"); // dark navy
  doc.restore();

  // Logo in circle (left)
  const circleX = mL + 14;
  const circleY = headerY + 10;
  const circleSize = 34;

  if (logoPath && fs.existsSync(logoPath)) {
    doc.save();
    doc.circle(circleX + circleSize / 2, circleY + circleSize / 2, circleSize / 2).clip();
    doc.image(logoPath, circleX, circleY, { width: circleSize, height: circleSize });
    doc.restore();

    // subtle ring
    doc.save();
    doc.circle(circleX + circleSize / 2, circleY + circleSize / 2, circleSize / 2)
      .lineWidth(1)
      .strokeColor("#FFFFFF")
      .stroke();
    doc.restore();
  }

  // Title text (right side of logo)
  const textX = circleX + circleSize + 12;
  const textW = contentW - (textX - mL) - 12;

  doc.fillColor("#FFFFFF");
  doc.font("Helvetica-Bold").fontSize(12).text(clubTitle, textX, headerY + 12, { width: textW });
  doc.font("Helvetica").fontSize(9).fillColor("#D7E3FF")
    .text(eventTitle, textX, headerY + 30, { width: textW });
}

function drawAttendeeCard(doc, attendee) {
  const pageW = doc.page.width;
  const mL = doc.page.margins.left;
  const mR = doc.page.margins.right;
  const contentW = pageW - mL - mR;

  const cardY = 82;
  const cardH = 64;

  doc.save();
  roundedRectPath(doc, mL, cardY, contentW, cardH, 16).fill("#F3F6FB");
  doc.restore();

  doc.fillColor("#0F172A");
  doc.font("Helvetica-Bold").fontSize(13)
    .text(`${attendee.firstName} ${attendee.lastName}`, mL + 14, cardY + 14, { width: contentW - 28 });

  doc.fillColor("#334155");
  doc.font("Helvetica").fontSize(9)
    .text(`Documento: ${attendee.document || "-"}`, mL + 14, cardY + 36);

  // Short ID (for staff)
  const shortId = (attendee.qrToken || "").split("-").pop()?.slice(-8) || "--------";
  doc.fillColor("#64748B");
  doc.font("Helvetica").fontSize(8)
    .text(`ID: ${shortId}`, mL + 14, cardY + 50);
}

function drawQr(doc, attendee) {
  const pageW = doc.page.width;
  const mL = doc.page.margins.left;
  const mR = doc.page.margins.right;
  const contentW = pageW - mL - mR;

  const qrBuf = dataUrlToBuffer(attendee.qrDataUrl);
  const boxSize = 190;
  const boxX = (pageW - boxSize) / 2;
  const boxY = 162;

  // Label
  doc.fillColor("#0F172A").font("Helvetica-Bold").fontSize(9)
    .text("SCAN ME", mL, boxY - 16, { align: "center", width: contentW });

  // QR frame
  doc.save();
  roundedRectPath(doc, boxX, boxY, boxSize, boxSize, 18).fill("#FFFFFF");
  doc.restore();

  doc.save();
  roundedRectPath(doc, boxX, boxY, boxSize, boxSize, 18)
    .lineWidth(1)
    .strokeColor("#D6DEE8")
    .stroke();
  doc.restore();

  if (qrBuf) {
    const qrSize = 160;
    const qx = (pageW - qrSize) / 2;
    const qy = boxY + (boxSize - qrSize) / 2;
    doc.image(qrBuf, qx, qy, { width: qrSize, height: qrSize });
  } else {
    doc.fillColor("#B91C1C").font("Helvetica-Bold").fontSize(10)
      .text("QR non disponibile", mL, boxY + 80, { align: "center", width: contentW });
  }

  // Token small (optional but useful)
  doc.fillColor("#94A3B8").font("Helvetica").fontSize(7.5)
    .text(`Token: ${attendee.qrToken}`, mL, boxY + boxSize + 10, { align: "center", width: contentW });
}

function drawFooter(doc) {
  const pageW = doc.page.width;
  const mL = doc.page.margins.left;
  const mR = doc.page.margins.right;
  const contentW = pageW - mL - mR;

  const y = 390;
  doc.save();
  doc.moveTo(mL, y).lineTo(pageW - mR, y).strokeColor("#E5EAF2").lineWidth(1).stroke();
  doc.restore();

  doc.fillColor("#475569").font("Helvetica").fontSize(8)
    .text("Mostra questo QR all’ingresso. Una volta scansionato non sarà valido.", mL, y + 8, {
      align: "center",
      width: contentW,
    });
}

export function buildTicketPdf(attendee) {
  const doc = new PDFDocument({ size: "A6", margin: 22 });
  const chunks = [];
  doc.on("data", (c) => chunks.push(c));
  const done = new Promise((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  // Background
  doc.save();
  doc.rect(0, 0, doc.page.width, doc.page.height).fill("#FFFFFF");
  doc.restore();

  const logoPath = path.join(__dirname, "../assets/logo.png");

  drawHeader(doc, {
    logoPath,
    clubTitle: "BOLOGNA RUGBY CLUB",
    eventTitle: "Festa di fine sessione",
  });

  drawAttendeeCard(doc, attendee);
  drawQr(doc, attendee);
  drawFooter(doc);

  doc.end();
  return done;
}