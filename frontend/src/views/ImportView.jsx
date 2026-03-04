import React, { useState } from 'react'
import { apiPost, download } from '../api'

export default function ImportView(){
  const [busy, setBusy] = useState(false)
  const [report, setReport] = useState(null)
  const [err, setErr] = useState('')

  async function handleFile(file){
    setErr('')
    setReport(null)
    setBusy(true)
    try{
      const buf = await file.arrayBuffer()
      const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)))
      const rep = await apiPost('/api/import-xlsx', { fileBase64: b64 })
      setReport(rep)
    }catch(e){
      setErr(e.message)
    }finally{
      setBusy(false)
    }
  }

  return (
    <div className="card">
      <div className="row" style={{justifyContent:'space-between'}}>
        <div>
          <div style={{fontSize:18, fontWeight:800}}>Importar Excel (.xlsx)</div>
          <div className="small">Columnas: nombre, apellido, documento, email, telefono, notas</div>
        </div>
        <div className="row">
          <button className="btn" onClick={()=>download('/api/export.xlsx')}>Exportar XLSX</button>
        </div>
      </div>

      <div className="hr" />

      <label className="btn primary" style={{display:'inline-flex', alignItems:'center', gap:8, cursor:'pointer'}}>
        {busy ? 'Importando...' : 'Seleccionar archivo .xlsx'}
        <input type="file" accept=".xlsx" style={{display:'none'}} disabled={busy}
          onChange={(e)=>{
            const f = e.target.files?.[0]
            if(f) handleFile(f)
            e.target.value = ''
          }}
        />
      </label>

      <div style={{height:12}} />

      {err ? <div className="error">{err}</div> : null}

      {report ? (
        <div className="card" style={{background:'#0b1220'}}>
          <div style={{fontWeight:800}}>Reporte</div>
          <div className="hr" />
          <div className="row">
            <span className="badge green">Creados: {report.created}</span>
            <span className="badge yellow">Actualizados: {report.updated}</span>
            <span className="badge red">Errores: {report.errors}</span>
          </div>
          {report.errorRows?.length ? (
            <>
              <div style={{height:12}} />
              <div className="small"><b>Errores:</b></div>
              <div className="table-wrap" style={{marginTop:8}}>
                <table style={{minWidth:600}}>
                  <thead>
                    <tr><th>Fila</th><th>Error</th></tr>
                  </thead>
                  <tbody>
                    {report.errorRows.map((e, idx)=>(
                      <tr key={idx}>
                        <td>{e.row}</td>
                        <td>{e.error}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      <div style={{height:14}} />
      <div className="small">
        Duplicados: si coincide <b>documento</b> o <b>email</b>, el sistema actualiza el registro existente (lo marca MODIFIED si no estaba escaneado).
      </div>
    </div>
  )
}
