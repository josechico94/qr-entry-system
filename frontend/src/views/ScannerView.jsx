import React, { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { apiPost } from "../api";

export default function ScannerView() {
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);
  const [cameraError, setCameraError] = useState("");

  const readerId = "qr-reader";
  const qrRef = useRef(null);

  function playSuccess() {
    if (navigator.vibrate) navigator.vibrate(120);

    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.value = 900;

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    setTimeout(() => {
      osc.stop();
    }, 120);
  }

  function playError() {
    if (navigator.vibrate) navigator.vibrate([80, 50, 80]);

    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "square";
    osc.frequency.value = 300;

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    setTimeout(() => {
      osc.stop();
    }, 200);
  }

  useEffect(() => {
    const qr = new Html5Qrcode(readerId);
    qrRef.current = qr;

    async function start() {
      try {
        setCameraError("");
        setResult(null);

        await qr.start(
          { facingMode: "environment" },
          { fps: 12, qrbox: { width: 260, height: 260 } },
          async (decodedText) => {
            try {
              await qr.pause(true);
              setRunning(false);

              const res = await apiPost("/api/scan", {
                token: decodedText,
              });

              setResult(res);

              if (res.ok) {
                playSuccess();
              } else {
                playError();
              }
            } catch (e) {
              playError();
              setResult({ ok: false, message: e.message });
            }
          }
        );

        setRunning(true);
      } catch (e) {
        setCameraError(e.message || "Errore della fotocamera");
      }
    }

    start();

    return () => {
      (async () => {
        try {
          if (qrRef.current) {
            await qrRef.current.stop();
            await qrRef.current.clear();
          }
        } catch {}
      })();
    };
  }, []);

  async function resume() {
    try {
      setResult(null);
      await qrRef.current.resume();
      setRunning(true);
    } catch (e) {
      setCameraError(e.message || "Impossibile riavviare la scansione");
    }
  }

  async function stop() {
    try {
      await qrRef.current.stop();
      setRunning(false);
    } catch {}
  }

  return (
    <div className="scanner-container">

      <div className="scanner-header">
        <h2>Scanner QR</h2>
        <p>Ogni QR può essere utilizzato una sola volta</p>
      </div>

      {cameraError && <div className="error">{cameraError}</div>}

      <div id={readerId} className="scanner-camera"></div>

      {result && (
        <div className={`scan-result ${result.ok ? "ok" : "error"}`}>
          <h3>{result.message}</h3>

          {result.attendee && (
            <>
              <p><b>{result.attendee.firstName} {result.attendee.lastName}</b></p>
              <p>Documento: {result.attendee.document || "-"}</p>
              <p>Stato: {result.attendee.status}</p>
            </>
          )}
        </div>
      )}

      <div className="scanner-buttons">
        {running ? (
          <button className="btn-stop" onClick={stop}>
            Ferma scansione
          </button>
        ) : (
          <button className="btn-start" onClick={resume}>
            Scansiona di nuovo
          </button>
        )}
      </div>
    </div>
  );
}