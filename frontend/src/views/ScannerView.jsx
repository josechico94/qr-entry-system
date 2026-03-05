import React, { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { apiPost } from "../api";

export default function ScannerView({ onBack }) {
  const [result, setResult] = useState(null); // {ok,message,attendee}
  const [running, setRunning] = useState(false);
  const [cameraError, setCameraError] = useState("");

  const [soundEnabled, setSoundEnabled] = useState(true);
  const [vibrationEnabled, setVibrationEnabled] = useState(true);

  const [showCard, setShowCard] = useState(false);
  const readerId = "qr-reader";

  const qrRef = useRef(null);
  const audioCtxRef = useRef(null);
  const lockRef = useRef(false);

  const PAUSE_MS = 1000; // ✅ pausa tra scansioni (1s)

  function ensureAudioContext() {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioCtxRef.current;
  }

  function beep(ok) {
    if (!soundEnabled) return;
    const ctx = ensureAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.value = ok ? 880 : 220;
    gain.gain.value = 0.08;

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    setTimeout(() => osc.stop(), ok ? 90 : 160);
  }

  function vibrate(ok) {
    if (!vibrationEnabled) return;
    if (!navigator.vibrate) return;
    navigator.vibrate(ok ? 90 : [80, 40, 80]);
  }

  async function startScanner() {
    const qr = new Html5Qrcode(readerId);
    qrRef.current = qr;

    // Prefer rear camera
    try {
      await qr.start(
        { facingMode: "environment" },
        { fps: 14, qrbox: { width: 270, height: 270 } },
        onDecoded,
        () => {}
      );
      setRunning(true);
      return;
    } catch {
      // fallback to list cameras
    }

    const cams = await Html5Qrcode.getCameras();
    if (!cams || cams.length === 0) throw new Error("Nessuna fotocamera rilevata");

    const backCam =
      cams.find((c) => /back|rear|environment/i.test(c.label || "")) || cams[0];

    await qr.start(
      backCam.id,
      { fps: 14, qrbox: { width: 270, height: 270 } },
      onDecoded,
      () => {}
    );
    setRunning(true);
  }

  async function onDecoded(decodedText) {
    if (lockRef.current) return;
    lockRef.current = true;

    try {
      try {
        await qrRef.current?.pause(true);
      } catch {}

      const res = await apiPost("/api/scan", { token: decodedText });

      setResult(res);
      beep(!!res.ok);
      vibrate(!!res.ok);
      setShowCard(true);
    } catch (e) {
      const res = { ok: false, message: e.message || "Errore scan" };
      setResult(res);
      beep(false);
      vibrate(false);
      setShowCard(true);
    }
  }

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        setCameraError("");
        setResult(null);
        await startScanner();
      } catch (e) {
        if (!mounted) return;
        setCameraError(e.message || "Errore della fotocamera");
      }
    })();

    return () => {
      mounted = false;
      (async () => {
        try {
          if (qrRef.current) {
            try { await qrRef.current.stop(); } catch {}
            try { await qrRef.current.clear(); } catch {}
          }
        } catch {}
      })();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function stop() {
    try {
      if (qrRef.current) {
        await qrRef.current.stop();
        await qrRef.current.clear();
      }
      setRunning(false);
    } catch {}
  }

  async function resumeFresh() {
    try {
      setCameraError("");
      setResult(null);
      await stop();
      await startScanner();
    } catch (e) {
      setCameraError(e.message || "Impossibile riavviare la scansione");
    }
  }

  async function closeCardAndContinue() {
    setShowCard(false);

    setTimeout(async () => {
      try {
        await qrRef.current?.resume();
        setRunning(true);
      } catch {
        await resumeFresh();
      } finally {
        lockRef.current = false;
      }
    }, PAUSE_MS);
  }

  return (
    <div className="scannerPage">
      <div className="scannerTop">
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <button className="btn btn-ghost" onClick={onBack}>← Dashboard</button>
          <div>
            <div className="scannerTitle">Check-in (Beta)</div>
            <div className="scannerSub">QR monouso • Risultato in scheda • Pausa {PAUSE_MS/1000}s</div>
          </div>
        </div>

        <div className="scannerToggles">
          <button
            className={"chip " + (soundEnabled ? "on" : "")}
            onClick={() => setSoundEnabled((s) => !s)}
          >
            🔊 {soundEnabled ? "Audio ON" : "Audio OFF"}
          </button>

          <button
            className={"chip " + (vibrationEnabled ? "on" : "")}
            onClick={() => setVibrationEnabled((s) => !s)}
          >
            📳 {vibrationEnabled ? "Vibrazione ON" : "Vibrazione OFF"}
          </button>
        </div>
      </div>

      {cameraError ? <div className="alert error">{cameraError}</div> : null}

      <div className="scannerGrid">
        <div className="scannerCard">
          <div className="scannerCardHeader">
            <div className="scannerCardTitle">Fotocamera</div>
            <div className="scannerCardActions">
              {running ? (
                <button className="btn btn-ghost" onClick={stop}>Pausa</button>
              ) : (
                <button className="btn btn-primary" onClick={resumeFresh}>Avvia</button>
              )}
            </div>
          </div>

          <div id={readerId} className="scannerReader" />

          <div className="hint">
            Dopo la scansione, si apre una scheda a schermo intero. Chiudi per continuare.
          </div>
        </div>

        <div className="scannerCard">
          <div className="scannerCardHeader">
            <div className="scannerCardTitle">Stato</div>
          </div>

          <div className="emptyState">
            <div className="dot" />
            <div>
              <div className="emptyTitle">Pronto a scansionare</div>
              <div className="emptySub">Il risultato apparirà come scheda (overlay).</div>
            </div>
          </div>
        </div>
      </div>

      {showCard && result ? (
        <div className="overlay" onClick={(e)=>{ if(e.target.classList.contains('overlay')) closeCardAndContinue(); }}>
          <div className={"overlayCard " + (result.ok ? "ok" : "ko")}>
            <div className="overlayTop">
              <div className="overlayTitle">
                {result.ok ? "✅ ACCESSO CONSENTITO" : "⛔ ACCESSO NEGATO"}
              </div>
              <button className="overlayClose" onClick={closeCardAndContinue}>Chiudi</button>
            </div>

            <div className="overlayMsg">{result.message}</div>

            {result.attendee ? (
              <div className="overlayBody">
                <div className="overlayName">
                  {result.attendee.firstName} {result.attendee.lastName}
                </div>

                <div className="overlayMeta">
                  <div><span>Documento</span><b>{result.attendee.document || "-"}</b></div>
                  <div><span>Stato</span><b>{result.attendee.status}</b></div>
                  <div><span>Scansionato</span><b>{result.attendee.scannedAt || "-"}</b></div>
                  <div><span>Ticket #</span><b>{String(result.attendee.ticketNumber || "-")}</b></div>
                </div>
              </div>
            ) : null}

            <div className="overlayHint">
              La scansione riparte automaticamente dopo {PAUSE_MS/1000} secondo/i.
            </div>

            <div className="overlayActions">
              <button className="btn btn-primary" onClick={closeCardAndContinue}>Continua</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}