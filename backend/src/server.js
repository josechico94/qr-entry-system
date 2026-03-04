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

    const buf = await buildTicketPdf(attendee);
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
    // Armamos un PDF con una página A6 por asistente
    // Reutilizamos buildTicketPdf por cada uno y concatenamos como páginas con PDFKit directo (simple y robusto)
    // Para mantenerlo simple: generamos uno por uno y los zippeamos sería ideal,
    // pero por ahora: devolvemos el primero si hay 1, y si hay >1 devolvemos un PDF multi-page.
    // -> implementación multi-page:
    const PDFDocument = (await import("pdfkit")).default;
    const fs = await import("fs");
    const path = await import("path");
    const { fileURLToPath } = await import("url");

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const logoPath = path.join(__dirname, "../assets/logo.png");
    const hasLogo = fs.existsSync(logoPath);

    const doc = new PDFDocument({ autoFirstPage: false });
    const chunks = [];
    doc.on("data", c => chunks.push(c));
    const done = new Promise(resolve => doc.on("end", () => resolve(Buffer.concat(chunks))));

    function dataUrlToBuffer(dataUrl) {
      const m = String(dataUrl || "").match(/^data:.*?;base64,(.*)$/);
      if (!m) return null;
      return Buffer.from(m[1], "base64");
    }

    for (const a of attendees) {
      doc.addPage({ size: "A6", margin: 24 });

      if (hasLogo) doc.image(logoPath, doc.page.margins.left, 18, { width: 120 });
      doc.fontSize(14).text("BOLOGNA RUGBY CLUB", 0, 22, { align: "right" });
      doc.fontSize(10).fillColor("#444444").text("Biglietto di ingresso • QR monouso", { align: "right" });
      doc.moveDown(1);

      doc.rect(boxX, boxY, boxW, boxH).fill("#F4F6F8");
      doc.fillColor("#111111").fontSize(13).text(`${a.firstName} ${a.lastName}`, doc.page.margins.left + 14, 104);
      doc.fillColor("#444444").fontSize(9).text(`Documento: ${a.document || "-"}`, doc.page.margins.left + 14, 126);

      const qrBuf = dataUrlToBuffer(a.qrDataUrl);
      if (qrBuf) {
        const qrSize = 160;
        doc.image(qrBuf, (doc.page.width - qrSize) / 2, 160, { width: qrSize, height: qrSize });
      } else {
        doc.fillColor("#AA0000").fontSize(10).text("QR non disponibile", { align: "center" });
      }

      doc.fillColor("#666666").fontSize(7.5).text(`Token: ${a.qrToken}`, doc.page.margins.left, 330, { align: "center" });
      doc.moveTo(doc.page.margins.left, 350).lineTo(doc.page.width - doc.page.margins.right, 350).strokeColor("#DDDDDD").stroke();
      doc.fillColor("#444444").fontSize(8).text("Mostra questo QR all’ingresso. Una volta scansionato non sarà valido.", doc.page.margins.left, 358, {
        align: "center",
        width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
      });
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
