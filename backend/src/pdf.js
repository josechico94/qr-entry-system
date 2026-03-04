import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function dataUrlToBuffer(dataUrl) {
  // data:image/png;base64,....
  const m = String(dataUrl || "").match(/^data:.*?;base64,(.*)$/);
  if (!m) return null;
  return Buffer.from(m[1], "base64");
}

export function buildTicketPdf(attendee) {
  const doc = new PDFDocument({ size: "A6", margin: 24 }); // ticket compacto
  const chunks = [];
  doc.on("data", (c) => chunks.push(c));
  const done = new Promise((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  const logoPath = path.join(__dirname, "../assets/logo.png");
  const hasLogo = fs.existsSync(logoPath);

  // Header
  if (hasLogo) {
    doc.image(logoPath, doc.page.margins.left, 18, { width: 120 });
  }
  doc
    .fontSize(14)
    .text("BOLOGNA RUGBY CLUB", 0, 22, { align: "right" })
    .moveDown(0.5);

  doc
    .fontSize(10)
    .fillColor("#444444")
    .text("Biglietto di ingresso • QR monouso", { align: "right" });

  doc.moveDown(1);

  // Attendee box
  doc
    .roundRect(doc.page.margins.left, 90, doc.page.width - doc.page.margins.left - doc.page.margins.right, 52, 10)
    .fill("#F4F6F8");

  doc.fillColor("#111111").fontSize(13).text(
    `${attendee.firstName} ${attendee.lastName}`,
    doc.page.margins.left + 14,
    104,
    { width: doc.page.width - 72 }
  );

  doc.fillColor("#444444").fontSize(9).text(
    `Documento: ${attendee.document || "-"}`,
    doc.page.margins.left + 14,
    126
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

  // Token small
  doc
    .fillColor("#666666")
    .fontSize(7.5)
    .text(`Token: ${attendee.qrToken}`, doc.page.margins.left, 330, { align: "center" });

  // Footer
  doc
    .moveTo(doc.page.margins.left, 350)
    .lineTo(doc.page.width - doc.page.margins.right, 350)
    .strokeColor("#DDDDDD")
    .stroke();

  doc
    .fillColor("#444444")
    .fontSize(8)
    .text("Mostra questo QR all’ingresso. Una volta scansionato non sarà valido.", doc.page.margins.left, 358, {
      align: "center",
      width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
    });

  doc.end();
  return done;
}