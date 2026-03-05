import fs from "fs";
import path from "path";
import QRCode from "qrcode";
import { v4 as uuidv4 } from "uuid";
import XLSX from "xlsx";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, "../data");
const DATA_FILE = path.join(DATA_DIR, "attendees.json");

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify({ attendees: [] }, null, 2), "utf8");
}
ensureDataFile();

function readData() {
  ensureDataFile();
  const raw = fs.readFileSync(DATA_FILE, "utf8");
  const parsed = JSON.parse(raw);
  if (!parsed.attendees) parsed.attendees = [];
  return parsed;
}

function atomicWrite(jsonStr) {
  ensureDataFile();
  const tmp = DATA_FILE + ".tmp";
  fs.writeFileSync(tmp, jsonStr, "utf8");
  fs.renameSync(tmp, DATA_FILE);
}

function writeData(data) {
  atomicWrite(JSON.stringify(data, null, 2));
}

export function getAll() {
  return readData().attendees;
}

export function getCounts() {
  const attendees = getAll();
  const counts = { total: attendees.length, pending: 0, scanned: 0, modified: 0 };
  for (const a of attendees) {
    if (a.status === "PENDING") counts.pending++;
    else if (a.status === "SCANNED") counts.scanned++;
    else if (a.status === "MODIFIED") counts.modified++;
  }
  return counts;
}

function normalizeString(v) {
  if (v == null) return "";
  return String(v).trim();
}

async function makeQrDataUrl(token) {
  const payload = JSON.stringify({ token });
  return await QRCode.toDataURL(payload, { errorCorrectionLevel: "M", margin: 2, scale: 6 });
}

function validateAttendeePayload(payload) {
  const nombre = normalizeString(payload.firstName);
  const apellido = normalizeString(payload.lastName);
  if (!nombre) throw new Error("firstName is required");
  if (!apellido) throw new Error("lastName is required");
  return {
    firstName: nombre,
    lastName: apellido,
    document: normalizeString(payload.document) || "",
    email: normalizeString(payload.email) || "",
    phone: normalizeString(payload.phone) || "",
    notes: normalizeString(payload.notes) || ""
  };
}

export async function createAttendee(payload) {
  const data = readData();
  const clean = validateAttendeePayload(payload);
  const all = getAll();
  const maxTicket = all.reduce((m, a) => Math.max(m, Number(a.ticketNumber || 0)), 0);
  const nextTicket = maxTicket + 1;

  const id = uuidv4();
  const token = uuidv4();
  const now = new Date().toISOString();

  const qrDataUrl = await makeQrDataUrl(token);

  const attendee = {
    id,
    firstName: clean.firstName,
    lastName: clean.lastName,
    document: clean.document,
    email: clean.email,
    phone: clean.phone,
    notes: clean.notes,
    qrToken: token,
    qrDataUrl,
    status: "PENDING",
    createdAt: now,
    updatedAt: now,
    scannedAt: null,
    ticketNumber: nextTicket,
    editedAfterScan: false
  };

  data.attendees.unshift(attendee);
  writeData(data);
  return attendee;
}

export async function updateAttendee(id, payload) {
  const data = readData();
  const idx = data.attendees.findIndex(a => a.id === id);
  if (idx === -1) throw new Error("Attendee not found");
  const clean = validateAttendeePayload(payload);

  const prev = data.attendees[idx];
  const now = new Date().toISOString();

  const next = { ...prev, ...clean, updatedAt: now };

  // Status rule:
  // - If not scanned yet -> becomes MODIFIED (unless it was already SCANNED)
  // - If scanned already -> remains SCANNED but mark editedAfterScan
  if (prev.scannedAt) {
    next.status = "SCANNED";
    next.editedAfterScan = true;
  } else {
    next.status = "MODIFIED";
  }

  data.attendees[idx] = next;
  writeData(data);
  return next;
}

export function deleteAttendee(id) {
  const data = readData();
  const idx = data.attendees.findIndex(a => a.id === id);
  if (idx === -1) throw new Error("Attendee not found");
  const [removed] = data.attendees.splice(idx, 1);
  writeData(data);
  return removed;
}

export function scanToken(token) {
  if (!token) throw new Error("token is required");

  let parsedToken = token;

  // token may come from QR payload JSON: {"token":"..."}
  try {
    const maybe = JSON.parse(token);
    if (maybe && typeof maybe === "object" && maybe.token) parsedToken = String(maybe.token);
  } catch {
    // ignore
  }

  const data = readData();
  const idx = data.attendees.findIndex(a => a.qrToken === parsedToken);
  if (idx === -1) throw new Error("QR inválido (token no encontrado)");

  const attendee = data.attendees[idx];

  if (attendee.status === "SCANNED") {
    return { ok: false, message: "QR YA UTILIZADO", attendee };
  }

  const now = new Date().toISOString();
  const updated = { ...attendee, status: "SCANNED", scannedAt: now, updatedAt: now };
  data.attendees[idx] = updated;
  writeData(data);
  return { ok: true, message: "Ingreso OK", attendee: updated };
}

export function resetScans() {
  const data = readData();
  const now = new Date().toISOString();
  data.attendees = data.attendees.map(a => ({
    ...a,
    status: "PENDING",
    scannedAt: null,
    updatedAt: now,
    editedAfterScan: false
  }));
  writeData(data);
  return { ok: true };
}

export async function importXlsxBuffer(buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) throw new Error("Excel sin hojas");
  const sheet = workbook.Sheets[firstSheet];

  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

  // Expected columns: nombre, apellido, documento, email, telefono, notas
  // We accept flexible keys too.
  const data = readData();
  const existing = data.attendees;

  let created = 0, updated = 0, skipped = 0, errors = 0;
  const errorRows = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] || {};
    try {
      const firstName = normalizeString(r.nombre ?? r.firstName ?? r.Nombre ?? r.NOMBRE ?? "");
      const lastName  = normalizeString(r.apellido ?? r.lastName ?? r.Apellido ?? r.APELLIDO ?? "");
      const document  = normalizeString(r.documento ?? r.document ?? r.DNI ?? r.Documento ?? "");
      const email     = normalizeString(r.email ?? r.Email ?? "");
      const phone     = normalizeString(r.telefono ?? r.phone ?? r.Telefono ?? r.Teléfono ?? "");
      const notes     = normalizeString(r.notas ?? r.notes ?? r.Notas ?? "");

      if (!firstName || !lastName) throw new Error("Faltan nombre/apellido");

      // Duplicate logic: if document OR email matches -> update existing and mark MODIFIED (or editedAfterScan for scanned)
      let dupIdx = -1;
      if (document) dupIdx = existing.findIndex(a => a.document && a.document === document);
      if (dupIdx === -1 && email) dupIdx = existing.findIndex(a => a.email && a.email.toLowerCase() === email.toLowerCase());

      if (dupIdx !== -1) {
        const prev = existing[dupIdx];
        const now = new Date().toISOString();
        const next = { ...prev, firstName, lastName, document, email, phone, notes, updatedAt: now };

        if (prev.scannedAt) {
          next.status = "SCANNED";
          next.editedAfterScan = true;
        } else {
          next.status = "MODIFIED";
        }
        existing[dupIdx] = next;
        updated++;
        continue;
      }

      const id = uuidv4();
      const token = uuidv4();
      const now = new Date().toISOString();
      const qrDataUrl = await makeQrDataUrl(token);

      existing.unshift({
        id, firstName, lastName, document, email, phone, notes,
        qrToken: token,
        qrDataUrl,
        status: "PENDING",
        createdAt: now,
        updatedAt: now,
        scannedAt: null,
        editedAfterScan: false
      });
      created++;
    } catch (e) {
      errors++;
      errorRows.push({ row: i + 2, error: e.message || "error", raw: r }); // +2 for header+1 indexing
    }
  }

  data.attendees = existing;
  writeData(data);

  return { ok: true, created, updated, skipped, errors, errorRows };
}

export function exportCsv() {
  const attendees = getAll();
  const headers = ["firstName","lastName","document","email","phone","notes","status","createdAt","updatedAt","scannedAt","qrToken"];
  const escape = (v) => {
    const s = (v ?? "").toString();
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g,'""')}"`;
    return s;
  };
  const lines = [headers.join(",")];
  for (const a of attendees) {
    lines.push(headers.map(h => escape(a[h])).join(","));
  }
  return lines.join("\n");
}

export function exportXlsx() {
  const attendees = getAll().map(a => ({
    nombre: a.firstName,
    apellido: a.lastName,
    documento: a.document,
    email: a.email,
    telefono: a.phone,
    notas: a.notes,
    estado: a.status,
    creado: a.createdAt,
    actualizado: a.updatedAt,
    escaneado: a.scannedAt,
    qrToken: a.qrToken
  }));
  const ws = XLSX.utils.json_to_sheet(attendees);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "asistentes");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

export function restoreJson(jsonText) {
  const parsed = JSON.parse(jsonText);
  if (!parsed.attendees || !Array.isArray(parsed.attendees)) throw new Error("JSON inválido (falta attendees[])");
  // Minimal validation
  for (const a of parsed.attendees) {
    if (!a.id || !a.qrToken) throw new Error("JSON inválido (faltan id/qrToken)");
  }
  writeData(parsed);
  return { count: parsed.attendees.length };
}
