import React, { useEffect, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { apiPost } from '../api'

export default function ScannerView() {
  const [result, setResult] = useState(null) // {ok,message,attendee} or error
  const [running, setRunning] = useState(false)
  const [cameraError, setCameraError] = useState('')
  const readerId = 'qr-reader'
  const qrRef = useRef(null)

  useEffect(() => {
    const qr = new Html5Qrcode(readerId)
    qrRef.current = qr

    const start = async () => {
      try {
        setCameraError('')
        setResult(null)

        // Prefer rear camera on mobile
        try {
          await qr.start(
            { facingMode: 'environment' },
            { fps: 12, qrbox: { width: 260, height: 260 } },
            async (decodedText) => {
              try {
                await qr.pause(true) // stop multiple reads
                setRunning(false)
                const res = await apiPost('/api/scan', { token: decodedText })
                setResult(res)
              } catch (e) {
                setResult({ ok: false, message: e.message })
              }
            },
            () => {}
          )
          setRunning(true)
          return
        } catch (e) {
          // If facingMode fails, fallback to selecting a "back" camera from the list
        }

        const cams = await Html5Qrcode.getCameras()
        if (!cams || cams.length === 0) throw new Error('No se detectó cámara')

        const backCam =
          cams.find((c) => /back|rear|environment/i.test(c.label || '')) || cams[0]

        await qr.start(
          backCam.id,
          { fps: 12, qrbox: { width: 260, height: 260 } },
          async (decodedText) => {
            try {
              await qr.pause(true)
              setRunning(false)
              const res = await apiPost('/api/scan', { token: decodedText })
              setResult(res)
            } catch (e) {
              setResult({ ok: false, message: e.message })
            }
          },
          () => {}
        )

        setRunning(true)
      } catch (e) {
        setCameraError(e.message || 'Error de cámara')
      }
    }

    start()

    return () => {
      ;(async () => {
        try {
          if (qrRef.current) {
            // stop() throws if not running; safe-guard
            try {
              await qrRef.current.stop()
            } catch {}
            try {
              await qrRef.current.clear()
            } catch {}
          }
        } catch {}
      })()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function resume() {
    try {
      setCameraError('')
      setResult(null)

      // html5-qrcode resume() may fail on some browsers after stop/pause.
      // Restart with rear camera to be safe.
      if (qrRef.current) {
        try {
          await qrRef.current.stop()
        } catch {}
        try {
          await qrRef.current.clear()
        } catch {}
      }

      const qr = new Html5Qrcode(readerId)
      qrRef.current = qr

      await qr.start(
        { facingMode: 'environment' },
        { fps: 12, qrbox: { width: 260, height: 260 } },
        async (decodedText) => {
          try {
            await qr.pause(true)
            setRunning(false)
            const res = await apiPost('/api/scan', { token: decodedText })
            setResult(res)
          } catch (e) {
            setResult({ ok: false, message: e.message })
          }
        },
        () => {}
      )

      setRunning(true)
    } catch (e) {
      setCameraError(e.message || 'No se pudo reanudar')
    }
  }

  async function stop() {
    try {
      if (qrRef.current) {
        await qrRef.current.stop()
        await qrRef.current.clear()
      }
      setRunning(false)
    } catch {}
  }

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>Escáner QR</div>
          <div className="small">Cada QR se acepta una sola vez.</div>
        </div>
        <div className="row">
          {running ? (
            <button className="btn" onClick={stop}>
              Detener
            </button>
          ) : (
            <button className="btn ok" onClick={resume}>
              Reanudar
            </button>
          )}
        </div>
      </div>

      <div className="hr" />

      {cameraError ? <div className="error">{cameraError}</div> : null}

      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 340px' }}>
          <div id={readerId} style={{ width: '100%' }} />
          <div className="small" style={{ marginTop: 10 }}>
            Tip: en móvil abre la cámara trasera (environment). En desktop usa la cámara disponible.
          </div>
        </div>

        <div style={{ flex: '1 1 340px' }}>
          <div className="card" style={{ background: '#0b1220' }}>
            <div style={{ fontWeight: 800 }}>Resultado</div>
            <div className="hr" />
            {!result ? (
              <div className="small">Escaneá un QR para ver el resultado.</div>
            ) : (
              <>
                <div
                  className={result.ok ? 'success' : 'error'}
                  style={{ fontWeight: 900, fontSize: 18 }}
                >
                  {result.message}
                </div>
                <div style={{ height: 10 }} />
                {result.attendee ? (
                  <div className="small">
                    <div>
                      <b>
                        {result.attendee.firstName} {result.attendee.lastName}
                      </b>
                    </div>
                    <div>Documento: {result.attendee.document || '-'}</div>
                    <div>Estado: {result.attendee.status}</div>
                    <div>Escaneado: {result.attendee.scannedAt || '-'}</div>
                  </div>
                ) : null}
                <div style={{ height: 12 }} />
                <button className="btn primary" onClick={resume}>
                  Escanear otro
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}