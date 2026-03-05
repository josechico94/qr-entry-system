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

function drawWatermark(doc, text) {
  doc.save();
  doc.fillColor("#0B1A3A");
  doc.opacity(0.06);
  doc.rotate(-20, { origin: [doc.page.width / 2, doc.page.height / 2] });
  doc.font("Helvetica-Bold").fontSize(32);
  doc.text(text, 0, doc.page.height / 2 - 30, { align: "center", width: doc.page.width });
  doc.rotate(20, { origin: [doc.page.width / 2, doc.page.height / 2] });
  doc.opacity(1);
  doc.restore();
}

function drawHeader(doc, { logoPath, clubTitle, eventTitle, eventMetaLeft, eventMetaRight, ticketNumber }) {
  const pageW = doc.page.width;
  const mL = doc.page.margins.left;
  const mR = doc.page.margins.right;
  const contentW = pageW - mL - mR;

  const headerY = 18;
  const headerH = 70;

  doc.save();
  roundedRectPath(doc, mL, headerY, contentW, headerH, 14).fill("#0B1A3A");
  doc.restore();

  // Logo in circle (left)
  const circleX = mL + 14;
  const circleY = headerY + 14;
  const circleSize = 40;

  if (logoPath && fs.existsSync(logoPath)) {
    doc.save();
    doc.circle(circleX + circleSize / 2, circleY + circleSize / 2, circleSize / 2).clip();
    doc.image(logoPath, circleX, circleY, { width: circleSize, height: circleSize });
    doc.restore();

    doc.save();
    doc.circle(circleX + circleSize / 2, circleY + circleSize / 2, circleSize / 2)
      .lineWidth(1)
      .strokeColor("#FFFFFF")
      .stroke();
    doc.restore();
  }

  const textX = circleX + circleSize + 12;
  const textW = contentW - (textX - mL) - 12;

  doc.fillColor("#FFFFFF");
  doc.font("Helvetica-Bold").fontSize(12).text(clubTitle, textX, headerY + 12, { width: textW });

  doc.font("Helvetica").fontSize(9).fillColor("#D7E3FF")
    .text(eventTitle, textX, headerY + 28, { width: textW });

  // Event meta row (date/time/place)
  doc.fillColor("#CFE0FF").font("Helvetica").fontSize(8);

  doc.text(eventMetaLeft, textX, headerY + 46, { width: textW * 0.62 });
  doc.text(eventMetaRight, textX + textW * 0.62, headerY + 46, { width: textW * 0.38, align: "right" });

  // Ticket number pill (top-right)
  const pillText = `TICKET #${String(ticketNumber || 0).padStart(4, "0")}`;
  const pillW = 88;
  const pillH = 18;
  const pillX = pageW - mR - pillW;
  const pillY = headerY + 10;

  doc.save();
  roundedRectPath(doc, pillX, pillY, pillW, pillH, 9).fill("rgba(255,255,255,0.14)");
  doc.restore();

  doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(8)
    .text(pillText, pillX, pillY + 5, { width: pillW, align: "center" });
}

function drawAttendeeCard(doc, attendee) {
  const pageW = doc.page.width;
  const mL = doc.page.margins.left;
  const mR = doc.page.margins.right;
  const contentW = pageW - mL - mR;

  const cardY = 98;
  const cardH = 68;

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
    .text(`ID: ${shortId}`, mL + 14, cardY + 52);
}

function drawQr(doc, attendee) {
  const pageW = doc.page.width;
  const mL = doc.page.margins.left;
  const mR = doc.page.margins.right;
  const contentW = pageW - mL - mR;

  const qrBuf = dataUrlToBuffer(attendee.qrDataUrl);
  const boxSize = 188;
  const boxX = (pageW - boxSize) / 2;
  const boxY = 176;

  doc.fillColor("#0F172A").font("Helvetica-Bold").fontSize(9)
    .text("SCAN ME", mL, boxY - 16, { align: "center", width: contentW });

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
    const qrSize = 158;
    const qx = (pageW - qrSize) / 2;
    const qy = boxY + (boxSize - qrSize) / 2;
    doc.image(qrBuf, qx, qy, { width: qrSize, height: qrSize });
  } else {
    doc.fillColor("#B91C1C").font("Helvetica-Bold").fontSize(10)
      .text("QR non disponibile", mL, boxY + 80, { align: "center", width: contentW });
  }

  doc.fillColor("#94A3B8").font("Helvetica").fontSize(7.3)
    .text(`Token: ${attendee.qrToken}`, mL, boxY + boxSize + 10, { align: "center", width: contentW });
}

function drawFooter(doc) {
  const pageW = doc.page.width;
  const mL = doc.page.margins.left;
  const mR = doc.page.margins.right;
  const contentW = pageW - mL - mR;

  const y = 392;
  doc.save();
  doc.moveTo(mL, y).lineTo(pageW - mR, y).strokeColor("#E5EAF2").lineWidth(1).stroke();
  doc.restore();

  doc.fillColor("#475569").font("Helvetica").fontSize(8)
    .text("Mostra questo QR all’ingresso. Una volta scansionato non sarà valido.", mL, y + 8, {
      align: "center",
      width: contentW,
    });
}

export function buildTicketPdf(attendee, eventInfo = {}) {
  const doc = new PDFDocument({ size: "A6", margin: 22 });
  const chunks = [];
  doc.on("data", (c) => chunks.push(c));
  const done = new Promise((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  doc.save();
  doc.rect(0, 0, doc.page.width, doc.page.height).fill("#FFFFFF");
  doc.restore();

  // watermark
  drawWatermark(doc, "VALIDO SOLO 1 INGRESSO");

  const logoPath = path.join(__dirname, "../assets/logo.png");

  // Event info (set defaults)
  const dateStr = eventInfo.date || "Sabato 15 Giugno 2026";
  const timeStr = eventInfo.time || "Ore 20:30";
  const placeStr = eventInfo.place || "Campo Rugby • Bologna";

  drawHeader(doc, {
    logoPath,
    clubTitle: "BOLOGNA RUGBY CLUB",
    eventTitle: "Festa di fine sessione",
    eventMetaLeft: `${dateStr} • ${timeStr}`,
    eventMetaRight: placeStr,
    ticketNumber: attendee.ticketNumber || 0,
  });

  drawAttendeeCard(doc, attendee);
  drawQr(doc, attendee);
  drawFooter(doc);

  doc.end();
  return done;
}