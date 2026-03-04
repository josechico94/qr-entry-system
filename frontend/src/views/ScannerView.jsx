import React, { useEffect, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { apiPost } from '../api'

export default function ScannerView(){
  const [result, setResult] = useState(null) // {ok,message,attendee} or error
  const [running, setRunning] = useState(false)
  const [cameraError, setCameraError] = useState('')
  const readerId = 'qr-reader'
  const qrRef = useRef(null)

  useEffect(()=>{
    const qr = new Html5Qrcode(readerId)
    qrRef.current = qr

    async function start(){
      try{
        setCameraError('')
        setResult(null)
        const cams = await Html5Qrcode.getCameras()
        if(!cams || cams.length === 0) throw new Error('No se detectó cámara')
        const camId = cams[0].id
        await qr.start(
          camId,
          { fps: 12, qrbox: { width: 260, height: 260 } },
          async (decodedText) => {
            // pause quickly to avoid multiple reads
            try{
              await qr.pause(true)
              setRunning(false)
              const res = await apiPost('/api/scan', { token: decodedText })
              setResult(res)
            }catch(e){
              setResult({ ok:false, message: e.message })
            }
          },
          () => {}
        )
        setRunning(true)
      }catch(e){
        setCameraError(e.message || 'Error de cámara')
      }
    }

    start()

    return ()=>{
      (async ()=>{
        try{
          if(qrRef.current){
            if(running) await qrRef.current.stop()
            await qrRef.current.clear()
          }
        }catch{}
      })()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function resume(){
    try{
      setResult(null)
      await qrRef.current.resume()
      setRunning(true)
    }catch(e){
      setCameraError(e.message || 'No se pudo reanudar')
    }
  }

  async function stop(){
    try{
      await qrRef.current.stop()
      setRunning(false)
    }catch{}
  }

  return (
    <div className="card">
      <div className="row" style={{justifyContent:'space-between'}}>
        <div>
          <div style={{fontSize:18, fontWeight:800}}>Escáner QR</div>
          <div className="small">Cada QR se acepta una sola vez.</div>
        </div>
        <div className="row">
          {running ? <button className="btn" onClick={stop}>Detener</button> : <button className="btn ok" onClick={resume}>Reanudar</button>}
        </div>
      </div>

      <div className="hr" />

      {cameraError ? <div className="error">{cameraError}</div> : null}

      <div className="row" style={{alignItems:'flex-start'}}>
        <div style={{flex:'1 1 340px'}}>
          <div id={readerId} style={{width:'100%'}} />
          <div className="small" style={{marginTop:10}}>
            Tip: si usás un lector USB, también podés implementar entrada por teclado; esta versión usa cámara.
          </div>
        </div>

        <div style={{flex:'1 1 340px'}}>
          <div className="card" style={{background:'#0b1220'}}>
            <div style={{fontWeight:800}}>Resultado</div>
            <div className="hr" />
            {!result ? <div className="small">Escaneá un QR para ver el resultado.</div> : (
              <>
                <div className={result.ok ? 'success' : 'error'} style={{fontWeight:900, fontSize:18}}>
                  {result.message}
                </div>
                <div style={{height:10}} />
                {result.attendee ? (
                  <div className="small">
                    <div><b>{result.attendee.firstName} {result.attendee.lastName}</b></div>
                    <div>Documento: {result.attendee.document || '-'}</div>
                    <div>Estado: {result.attendee.status}</div>
                    <div>Escaneado: {result.attendee.scannedAt || '-'}</div>
                  </div>
                ) : null}
                <div style={{height:12}} />
                <button className="btn primary" onClick={resume}>Escanear otro</button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
