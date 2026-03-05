import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";

function safeText(v){ return (v ?? "").toString(); }

function drawWatermark(doc, text){
  const { width, height } = doc.page;
  doc.save();
  doc.rotate(-25, { origin: [width/2, height/2] });
  doc.fillColor("#1E3A8A").opacity(0.07);
  doc.font("Helvetica-Bold").fontSize(34);
  doc.text(text, width * -0.15, height * 0.45, { width: width * 1.3, align: "center" });
  doc.opacity(1).restore();
}

function roundedRect(doc, x, y, w, h, r){
  const rr = Math.min(r, w/2, h/2);
  doc
    .moveTo(x + rr, y)
    .lineTo(x + w - rr, y)
    .quadraticCurveTo(x + w, y, x + w, y + rr)
    .lineTo(x + w, y + h - rr)
    .quadraticCurveTo(x + w, y + h, x + w - rr, y + h)
    .lineTo(x + rr, y + h)
    .quadraticCurveTo(x, y + h, x, y + h - rr)
    .lineTo(x, y + rr)
    .quadraticCurveTo(x, y, x + rr, y)
    .closePath();
}

export function buildTicketPdf(attendee, opts = {}){
  const {
    eventName = "BOLOGNA RUGBY CLUB",
    eventSubtitle = "Festa fine sessione",
    eventTime = "22:00 – 04:00",
    eventPlace = "", // opcional
    watermark = "VALIDO SOLO 1 INGRESSO",
  } = opts;

  const doc = new PDFDocument({
    size: "A6",
    margin: 22,
    info: {
      Title: `Ticket ${safeText(attendee?.ticketNumber ?? "")}`,
      Author: "QR Entry System",
    }
  });

  // Theme
  const BLUE = "#1D4ED8";     // azul principal
  const BLUE_D = "#1E3A8A";   // azul oscuro
  const INK = "#0B1220";
  const MUTED = "#334155";
  const BORDER = "#93C5FD";
  const BG = "#F8FAFC";

  // Background card
  const pageW = doc.page.width;
  const pageH = doc.page.height;

  doc.rect(0, 0, pageW, pageH).fill(BG);
  doc.fillColor(INK);

  // Outer border
  doc.save();
  doc.lineWidth(1.3).strokeColor(BLUE);
  roundedRect(doc, 10, 10, pageW - 20, pageH - 20, 18);
  doc.stroke();
  doc.restore();

  // Watermark
  drawWatermark(doc, watermark);

  // Header band
  const headerH = 62;
  doc.save();
  doc.fillColor(BLUE);
  roundedRect(doc, 16, 16, pageW - 32, headerH, 16);
  doc.fill();
  doc.restore();

  // Logo (optional)
  try{
    const logoPath = path.join(process.cwd(), "backend", "assets", "logo.png");
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, 26, 24, { width: 50 });
    }
  }catch{}

  // Header text
  doc.fillColor("#FFFFFF");
  doc.font("Helvetica-Bold").fontSize(12).text(eventName, 82, 24, { width: pageW - 110 });
  doc.font("Helvetica").fontSize(10).text(eventSubtitle, 82, 40, { width: pageW - 110 });

  // Time + Place row
  doc.fillColor("#EAF2FF");
  doc.font("Helvetica-Bold").fontSize(10).text(`Orario: ${eventTime}`, 26, 58, { width: pageW - 52 });
  if(eventPlace){
    doc.font("Helvetica").fontSize(9).text(eventPlace, 26, 72, { width: pageW - 52 });
  }

  // Participant card
  const cardY = 92;
  doc.save();
  doc.fillColor("#FFFFFF");
  roundedRect(doc, 16, cardY, pageW - 32, 58, 14);
  doc.fill();
  doc.lineWidth(1).strokeColor(BORDER);
  roundedRect(doc, 16, cardY, pageW - 32, 58, 14);
  doc.stroke();
  doc.restore();

  const fullName = `${safeText(attendee.firstName)} ${safeText(attendee.lastName)}`.trim() || "—";
  const docNum = safeText(attendee.document) || "—";
  const ticketNo = safeText(attendee.ticketNumber) || "—";

  doc.fillColor(INK);
  doc.font("Helvetica-Bold").fontSize(14).text(fullName, 26, cardY + 14, { width: pageW - 52, ellipsis: true });
  doc.fillColor(MUTED);
  doc.font("Helvetica").fontSize(10).text(`Documento: ${docNum}`, 26, cardY + 34, { width: pageW - 52 });
  doc.font("Helvetica-Bold").fillColor(BLUE_D).text(`Ticket #${ticketNo}`, 26, cardY + 34, { width: pageW - 52, align: "right" });

  // Divider
  doc.save();
  doc.strokeColor(BORDER).lineWidth(1);
  doc.moveTo(22, cardY + 72).lineTo(pageW - 22, cardY + 72).stroke();
  doc.restore();

  // QR box
  const qrY = cardY + 82;
  const qrSize = 165;
  const qrX = Math.round((pageW - qrSize) / 2);

  doc.save();
  doc.fillColor("#FFFFFF");
  roundedRect(doc, qrX - 10, qrY - 10, qrSize + 20, qrSize + 38, 16);
  doc.fill();
  doc.lineWidth(1.2).strokeColor(BLUE);
  roundedRect(doc, qrX - 10, qrY - 10, qrSize + 20, qrSize + 38, 16);
  doc.stroke();
  doc.restore();

  doc.fillColor(BLUE_D).font("Helvetica-Bold").fontSize(10)
    .text("SCAN PER INGRESSO", qrX - 10, qrY - 2, { width: qrSize + 20, align: "center" });

  // Insert QR image
  // attendee.qrDataUrl is expected: "data:image/png;base64,..."
  try{
    const b64 = (attendee.qrDataUrl || "").split(",")[1];
    if (b64) {
      const buf = Buffer.from(b64, "base64");
      doc.image(buf, qrX, qrY + 18, { width: qrSize, height: qrSize });
    }
  }catch{}

  // Token small (optional)
  doc.fillColor(MUTED).font("Helvetica").fontSize(7)
    .text(`Token: ${safeText(attendee.qrToken)}`, 26, qrY + qrSize + 30, { width: pageW - 52, align: "center" });

  // Footer note
  doc.fillColor(INK).font("Helvetica").fontSize(8)
    .text("Mostra questo QR all’ingresso. Dopo la scansione non sarà più valido.", 26, pageH - 42, {
      width: pageW - 52,
      align: "center"
    });

  return doc;
}