import fs from "fs";
import path from "path";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import dotenv from "dotenv";
import http from "http";
import { buildTicketPdf } from "./pdf.js";
import { Server as SocketIOServer } from "socket.io";
import { fileURLToPath } from "url";

import { createAttendee, deleteAttendee, exportCsv, exportXlsx, getAll, getCounts, importXlsxBuffer, resetScans, restoreJson, scanToken, updateAttendee } from "./store.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: { origin: true, credentials: true }
});

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;

// Toggle basic auth if you want
const enableBasicAuth = false;

function basicAuth(req, res, next) {
  const user = process.env.BASIC_AUTH_USER;
  const pass = process.env.BASIC_AUTH_PASS;
  if (!user || !pass) return res.status(500).json({ error: "Basic auth enabled but env vars missing." });

  const header = req.headers.authorization || "";
  const [scheme, encoded] = header.split(" ");
  if (scheme !== "Basic" || !encoded) {
    res.setHeader("WWW-Authenticate", 'Basic realm="Dashboard"');
    return res.status(401).end();
  }
  const decoded = Buffer.from(encoded, "base64").toString("utf8");
  const idx = decoded.indexOf(":");
  const u = decoded.slice(0, idx);
  const p = decoded.slice(idx + 1);
  if (u === user && p === pass) return next();
  res.setHeader("WWW-Authenticate", 'Basic realm="Dashboard"');
  return res.status(401).end();
}

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(morgan("dev"));

// API routes
const api = express.Router();
if (enableBasicAuth) api.use(basicAuth);

// Health
api.get("/health", (req, res) => res.json({ ok: true }));

// Get attendees
api.get("/attendees", (req, res) => {
  res.json({ attendees: getAll(), counts: getCounts() });
});

// Create attendee
api.post("/attendees", async (req, res) => {
  try {
    const created = await createAttendee(req.body);
    io.emit("attendees:changed", { attendees: getAll(), counts: getCounts() });
    res.status(201).json({ attendee: created });
  } catch (e) {
    res.status(400).json({ error: e.message || "Create failed" });
  }
});

// Update attendee
api.put("/attendees/:id", async (req, res) => {
  try {
    const updated = await updateAttendee(req.params.id, req.body);
    io.emit("attendees:changed", { attendees: getAll(), counts: getCounts() });
    res.json({ attendee: updated });
  } catch (e) {
    res.status(400).json({ error: e.message || "Update failed" });
  }
});

// Delete attendee
api.delete("/attendees/:id", (req, res) => {
  try {
    const removed = deleteAttendee(req.params.id);
    io.emit("attendees:changed", { attendees: getAll(), counts: getCounts() });
    res.json({ attendee: removed });
  } catch (e) {
    res.status(400).json({ error: e.message || "Delete failed" });
  }
});

// Scan token
api.post("/scan", (req, res) => {
  try {
    const { token } = req.body || {};
    const result = scanToken(token);
    io.emit("attendees:changed", { attendees: getAll(), counts: getCounts() });
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message || "Scan failed" });
  }
});

// Reset scans
api.post("/reset", (req, res) => {
  try {
    const result = resetScans();
    io.emit("attendees:changed", { attendees: getAll(), counts: getCounts() });
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message || "Reset failed" });
  }
});

// Import xlsx (multipart not used - we accept base64 or raw buffer via fetch)
api.post("/import-xlsx", async (req, res) => {
  try {
    const { fileBase64 } = req.body || {};
    if (!fileBase64) throw new Error("fileBase64 is required");
    const buf = Buffer.from(fileBase64, "base64");
    const report = await importXlsxBuffer(buf);
    io.emit("attendees:changed", { attendees: getAll(), counts: getCounts() });
    res.json(report);
  } catch (e) {
    res.status(400).json({ error: e.message || "Import failed" });
  }
});

// Export
api.get("/export.csv", (req, res) => {
  const csv = exportCsv();
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=attendees.csv");
  res.send(csv);
});

api.get("/export.xlsx", (req, res) => {
  const buf = exportXlsx();
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", "attachment; filename=attendees.xlsx");
  res.send(buf);
});

// Ticket PDF individual
api.get("/ticket/:id.pdf", async (req, res) => {
  try {
    const attendee = getAll().find(a => a.id === req.params.id);
    if (!attendee) return res.status(404).json({ error: "Attendee not found" });

    const buf = await buildTicketPdf(attendee, {
    date: process.env.EVENT_DATE || "Sabato 15 Giugno 2026",
    time: process.env.EVENT_TIME || "Ore 20:30",
    place: process.env.EVENT_PLACE || "Campo Rugby • Bologna",
    });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=ticket-${attendee.firstName}-${attendee.lastName}.pdf`);
    res.send(buf);
  } catch (e) {
    res.status(500).json({ error: e.message || "PDF failed" });
  }
});

// PDF masivo (todos)
api.get("/tickets.pdf", async (req, res) => {
  try {
    const attendees = getAll();

    const eventInfo = {
      date: process.env.EVENT_DATE || "Sabato 15 Giugno 2026",
      time: process.env.EVENT_TIME || "Ore 20:30",
      place: process.env.EVENT_PLACE || "Campo Rugby • Bologna",
    };

    // Multi-page PDF (A6 per attendee) usando PDFKit con el mismo estilo de pdf.js
    const PDFDocument = (await import("pdfkit")).default;
    const fs = await import("fs");
    const path = await import("path");
    const { fileURLToPath } = await import("url");

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

      doc.fillColor("#CFE0FF").font("Helvetica").fontSize(8);
      doc.text(eventMetaLeft, textX, headerY + 46, { width: textW * 0.62 });
      doc.text(eventMetaRight, textX + textW * 0.62, headerY + 46, { width: textW * 0.38, align: "right" });

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

    const logoPath = path.join(__dirname, "../assets/logo.png");

    const doc = new PDFDocument({ autoFirstPage: false });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    const done = new Promise((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

    // Ordenar por ticketNumber para imprimir en orden
    const sorted = [...attendees].sort((a, b) => Number(a.ticketNumber || 0) - Number(b.ticketNumber || 0));

    for (const a of sorted) {
      doc.addPage({ size: "A6", margin: 22 });

      // background
      doc.save();
      doc.rect(0, 0, doc.page.width, doc.page.height).fill("#FFFFFF");
      doc.restore();

      // watermark
      drawWatermark(doc, "VALIDO SOLO 1 INGRESSO");

      drawHeader(doc, {
        logoPath,
        clubTitle: "BOLOGNA RUGBY CLUB",
        eventTitle: "Festa di fine stagione",
        eventMetaLeft: `${eventInfo.date} • ${eventInfo.time}`,
        eventMetaRight: eventInfo.place,
        ticketNumber: a.ticketNumber || 0,
      });

      drawAttendeeCard(doc, a);
      drawQr(doc, a);
      drawFooter(doc);
    }

    doc.end();
    const buf = await done;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=tickets.pdf");
    res.send(buf);
  } catch (e) {
    res.status(500).json({ error: e.message || "PDF bulk failed" });
  }
});

// Backup / restore JSON
api.get("/backup.json", (req, res) => {
  const filePath = path.join(__dirname, "../data/attendees.json");
  res.download(filePath, "attendees-backup.json");
});

api.post("/restore.json", (req, res) => {
  try {
    const { jsonBase64 } = req.body || {};
    if (!jsonBase64) throw new Error("jsonBase64 is required");
    const buf = Buffer.from(jsonBase64, "base64");
    const restored = restoreJson(buf.toString("utf8"));
    io.emit("attendees:changed", { attendees: getAll(), counts: getCounts() });
    res.json({ ok: true, restored });
  } catch (e) {
    res.status(400).json({ error: e.message || "Restore failed" });
  }
});

app.use("/api", api);

// Serve frontend build in production
const frontendDist = path.join(__dirname, "../../frontend/dist");
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get("*", (req, res) => {
    res.sendFile(path.join(frontendDist, "index.html"));
  });
} else {
  app.get("/", (req, res) => res.send("Backend running. Build frontend with `npm run build` then `npm start`."));
}

// Socket.IO
io.on("connection", (socket) => {
  socket.emit("attendees:changed", { attendees: getAll(), counts: getCounts() });
});

server.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
});
