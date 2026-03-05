import fs from "fs";
import path from "path";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import dotenv from "dotenv";
import http from "http";
import PDFDocument from "pdfkit";
import { Server as SocketIOServer } from "socket.io";
import { fileURLToPath } from "url";

import {
  createAttendee,
  deleteAttendee,
  exportCsv,
  exportXlsx,
  getAll,
  getCounts,
  importXlsxBuffer,
  resetScans,
  restoreJson,
  scanToken,
  updateAttendee,
} from "./store.js";

import { buildTicketPdf, drawTicket } from "./pdf.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: { origin: true, credentials: true },
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

// Import xlsx (base64)
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

// Export CSV
api.get("/export.csv", (req, res) => {
  const csv = exportCsv();
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=attendees.csv");
  res.send(csv);
});

// Export XLSX
api.get("/export.xlsx", (req, res) => {
  const buf = exportXlsx();
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", "attachment; filename=attendees.xlsx");
  res.send(buf);
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

/** ===== PDF ROUTES (PRO) ===== **/

// Ticket singolo
api.get("/ticket/:id.pdf", (req, res) => {
  try {
    const a = getAll().find((x) => x.id === req.params.id);
    if (!a) return res.status(404).json({ error: "Not found" });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="ticket-${a.ticketNumber || a.id}.pdf"`);

    const doc = buildTicketPdf(a, {
      eventName: "BOLOGNA RUGBY CLUB",
      eventSubtitle: "Festa fine sessione",
      eventTime: "22:00 – 04:00",
      eventPlace: "",
      watermark: "VALIDO SOLO 1 INGRESSO",
    });

    doc.pipe(res);
    doc.end();
  } catch (e) {
    res.status(500).json({ error: e.message || "PDF error" });
  }
});

// PDF multipagina (tutti i ticket)
api.get("/tickets.pdf", (req, res) => {
  try {
    const attendees = getAll();

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="tickets.pdf"`);

    const doc = new PDFDocument({ autoFirstPage: false });
    doc.pipe(res);

    for (const a of attendees) {
      doc.addPage({ size: "A6", margin: 22 });
      drawTicket(doc, a, {
        eventName: "BOLOGNA RUGBY CLUB",
        eventSubtitle: "Festa fine sessione",
        eventTime: "22:00 – 04:00",
        eventPlace: "",
        watermark: "VALIDO SOLO 1 INGRESSO",
      });
    }

    doc.end();
  } catch (e) {
    res.status(500).json({ error: e.message || "PDF error" });
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