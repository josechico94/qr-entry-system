import React, { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { apiPost } from "../api";

export default function ScannerView() {
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [vibrationEnabled, setVibrationEnabled] = useState(true);

  const readerId = "qr-reader";
  const qrRef = useRef(null);
  const audioCtxRef = useRef(null);
  const lockRef = useRef(false); // evita dobles lecturas

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

    // Rear camera first
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
      // fallback: pick a "back" camera
    }

    const cams = await Html5Qrcode.getCameras();
    if (!cams || cams.length === 0) throw new Error("Nessuna fotocamera rilevata");

    const backCam = cams.find((c) => /back|rear|environment/i.test(c.label || "")) || cams[0];
    await qr.start(backCam.id, { fps: 14, qrbox: { width: 270, height: 270 } }, onDecoded, () => {});
    setRunning(true);
  }

  async function onDecoded(decodedText) {
    if (lockRef.current) return;
    lockRef.current = true;

    try {
      const res = await apiPost("/api/scan", { token: decodedText });
      setResult(res);
      beep(!!res.ok);
      vibrate(!!res.ok);
    } catch (e) {
      setResult({ ok: false, message: e.message });
      beep(false);
      vibrate(false);
    } finally {
      // Escaneo continuo: reanudamos rápido para el próximo QR
      setTimeout(async () => {
        try {
          await qrRef.current?.resume();
        } catch {}
        lockRef.current = false;
      }, 450);
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

  async function resume() {
    try {
      setCameraError("");
      setResult(null);

      // Algunos móviles fallan con resume() tras pause/stop, reiniciamos seguro.
      await stop();
      await startScanner();
    } catch (e) {
      setCameraError(e.message || "Impossibile riavviare la scansione");
    }
  }

  return (
    <div className="scannerPage">
      <div className="scannerTop">
        <div>
          <div className="scannerTitle">Check-in (Beta)</div>
          <div className="scannerSub">QR monouso • Scansione continua</div>
        </div>

        <div className="scannerToggles">
          <button className={"chip " + (soundEnabled ? "on" : "")} onClick={() => setSoundEnabled((s) => !s)}>
            🔊 {soundEnabled ? "Audio ON" : "Audio OFF"}
          </button>
          <button className={"chip " + (vibrationEnabled ? "on" : "")} onClick={() => setVibrationEnabled((s) => !s)}>
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
                <button className="btn ghost" onClick={stop}>Pausa</button>
              ) : (
                <button className="btn primary" onClick={resume}>Avvia</button>
              )}
            </div>
          </div>

          <div id={readerId} className="scannerReader" />
          <div className="hint">
            Consiglio: usa la fotocamera posteriore. L’app vibra e fa beep su OK/KO.
          </div>
        </div>

        <div className="scannerCard">
          <div className="scannerCardHeader">
            <div className="scannerCardTitle">Risultato</div>
          </div>

          {!result ? (
            <div className="emptyState">
              <div className="dot" />
              <div>
                <div className="emptyTitle">In attesa di un QR…</div>
                <div className="emptySub">Punta la camera e scansiona.</div>
              </div>
            </div>
          ) : (
            <div className={"resultBox " + (result.ok ? "ok" : "ko")}>
              <div className="resultMsg">{result.message}</div>
              {result.attendee ? (
                <div className="resultMeta">
                  <div className="name">{result.attendee.firstName} {result.attendee.lastName}</div>
                  <div className="metaRow">Documento: <b>{result.attendee.document || "-"}</b></div>
                  <div className="metaRow">Stato: <b>{result.attendee.status}</b></div>
                  <div className="metaRow">Scansionato: <b>{result.attendee.scannedAt || "-"}</b></div>
                </div>
              ) : null}
              <div className="resultHint">Scansione continua attiva: pronto per il prossimo QR.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}