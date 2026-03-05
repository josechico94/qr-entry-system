import React, { useEffect, useMemo, useState } from 'react'
import { io } from 'socket.io-client'
import { apiDelete, apiGet, apiPost, apiPut, download } from './api'
import StatusBadge from './components/StatusBadge'
import Modal from './components/Modal'
import ScannerView from './views/ScannerView'
import ImportView from './views/ImportView'

function formatDt(v){
  if(!v) return '-'
  try{ return new Date(v).toLocaleString() }catch{ return v }
}

export default function App(){

  const [tab, setTab] = useState('dashboard')
  const [attendees, setAttendees] = useState([])
  const [counts, setCounts] = useState({ total:0, pending:0, scanned:0, modified:0 })

  const [q, setQ] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')

  const [modal, setModal] = useState(null)
  const [msg, setMsg] = useState({ type:'', text:'' })

  useEffect(()=>{

    let mounted = true

    apiGet('/api/attendees')
      .then(({attendees, counts})=>{
        if(!mounted) return
        setAttendees(attendees)
        setCounts(counts)
      })

    const socket = io()

    socket.on('attendees:changed', (payload)=>{
      setAttendees(payload.attendees || [])
      setCounts(payload.counts || { total:0, pending:0, scanned:0, modified:0 })
    })

    return ()=>{
      mounted=false
      socket.close()
    }

  }, [])

  const filtered = useMemo(()=>{

    const qq = q.trim().toLowerCase()

    return attendees.filter(a=>{

      if(statusFilter !== 'ALL' && a.status !== statusFilter) return false

      if(!qq) return true

      const blob = [
        a.firstName,
        a.lastName,
        a.document,
        a.email,
        a.phone
      ].join(' ').toLowerCase()

      return blob.includes(qq)

    })

  }, [attendees, q, statusFilter])

  async function onCreate(values){
    await apiPost('/api/attendees', values)
    setModal(null)
  }

  async function onUpdate(id, values){
    await apiPut(`/api/attendees/${id}`, values)
    setModal(null)
  }

  async function onDelete(id){
    if(!confirm('Eliminare questo record?')) return
    await apiDelete(`/api/attendees/${id}`)
  }

  async function onReset(){
    if(!confirm('Reset di tutte le scansioni?')) return
    await apiPost('/api/reset', {})
  }

  return (

    <div className="container">

      {/* NAVBAR */}

      <div className="nav">

        <div className="left">
          <div className="brand">QR Entry System</div>
          <span className="badge">Realtime</span>
        </div>

        <div className="tabs">
          <a className={'tab '+(tab==='dashboard'?'active':'')} onClick={()=>setTab('dashboard')}>Dashboard</a>
          <a className={'tab '+(tab==='scanner'?'active':'')} onClick={()=>setTab('scanner')}>Scanner</a>
          <a className={'tab '+(tab==='import'?'active':'')} onClick={()=>setTab('import')}>Importa</a>
        </div>

      </div>

      <div style={{height:16}}/>

      {msg.text
        ? <div className={"card "+(msg.type==='error'?'error':'success')}>{msg.text}</div>
        : null}

      {msg.text ? <div style={{height:14}}/> : null}

      {/* SCANNER */}

      {tab === 'scanner'
        ? <ScannerView onBack={()=>setTab('dashboard')} />
        : tab === 'import'
        ? <ImportView />
        : (

        <>

          {/* HERO DASHBOARD */}

          <div className="hero">

            <div className="heroTop">

              <div>
                <div className="heroTitle">
                  Dashboard Evento
                </div>

                <div className="heroSub">
                  Monitoraggio accessi in tempo reale
                </div>
              </div>

              <div className="quickActions">

                <div
                  className="pill primary"
                  onClick={()=>setTab('scanner')}
                >
                  📷 Scanner
                </div>

                <div
                  className="pill ok"
                  onClick={()=>download('/api/tickets.pdf')}
                >
                  🎫 PDF Tickets
                </div>

                <div
                  className="pill"
                  onClick={()=>download('/api/export.xlsx')}
                >
                  📄 XLSX
                </div>

              </div>

            </div>

            {/* KPI */}

            <div className="kpiGrid">

              <div className="kpiPro blue">
                <div className="kpiRow">
                  <div>
                    <div className="kpiLabel">Totale</div>
                    <div className="kpiValue">{counts.total}</div>
                  </div>
                  <div className="kpiIcon">👥</div>
                </div>
              </div>

              <div className="kpiPro green">
                <div className="kpiRow">
                  <div>
                    <div className="kpiLabel">Pendenti</div>
                    <div className="kpiValue">{counts.pending}</div>
                  </div>
                  <div className="kpiIcon">🟢</div>
                </div>
              </div>

              <div className="kpiPro red">
                <div className="kpiRow">
                  <div>
                    <div className="kpiLabel">Scansionati</div>
                    <div className="kpiValue">{counts.scanned}</div>
                  </div>
                  <div className="kpiIcon">🔴</div>
                </div>
              </div>

              <div className="kpiPro yellow">
                <div className="kpiRow">
                  <div>
                    <div className="kpiLabel">Modificati</div>
                    <div className="kpiValue">{counts.modified}</div>
                  </div>
                  <div className="kpiIcon">🟡</div>
                </div>
              </div>

            </div>

          </div>

          <div style={{height:14}}/>

          {/* ACTION BAR */}

          <div className="actionBar">

            <div className="actionLeft">

              <div className="segment">

                <button
                  className={statusFilter==='ALL'?'active':''}
                  onClick={()=>setStatusFilter('ALL')}
                >
                  Tutti
                </button>

                <button
                  className={statusFilter==='PENDING'?'active':''}
                  onClick={()=>setStatusFilter('PENDING')}
                >
                  Pendenti
                </button>

                <button
                  className={statusFilter==='MODIFIED'?'active':''}
                  onClick={()=>setStatusFilter('MODIFIED')}
                >
                  Modificati
                </button>

                <button
                  className={statusFilter==='SCANNED'?'active':''}
                  onClick={()=>setStatusFilter('SCANNED')}
                >
                  Scansionati
                </button>

              </div>

              <div style={{minWidth:260}}>
                <input
                  placeholder="Cerca nome, documento..."
                  value={q}
                  onChange={e=>setQ(e.target.value)}
                />
              </div>

            </div>

            <div className="actionRight">

              <button className="btn warn" onClick={onReset}>
                Reset scansioni
              </button>

              <button
                className="btn primary"
                onClick={()=>setModal({mode:'create'})}
              >
                + Nuovo
              </button>

            </div>

          </div>

          <div style={{height:12}}/>

          {/* TABLE */}

          <div className="card">

            <div className="table-wrap">

              <table>

                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Documento</th>
                    <th>Stato</th>
                    <th>Aggiornato</th>
                    <th>Scansione</th>
                    <th>Azioni</th>
                  </tr>
                </thead>

                <tbody>

                  {filtered.map(a=>(
                    <tr key={a.id}>

                      <td>
                        <b>{a.firstName} {a.lastName}</b>
                        <div className="small">{a.email || '-'}</div>
                      </td>

                      <td>{a.document || '-'}</td>

                      <td>
                        <StatusBadge status={a.status} />
                      </td>

                      <td>{formatDt(a.updatedAt)}</td>

                      <td>{formatDt(a.scannedAt)}</td>

                      <td>

                        <div className="row">

                          <button
                            className="btn"
                            onClick={()=>setModal({mode:'qr', attendee:a})}
                          >
                            QR
                          </button>

                          <button
                            className="btn"
                            onClick={()=>setModal({mode:'edit', attendee:a})}
                          >
                            Edit
                          </button>

                          <button
                            className="btn danger"
                            onClick={()=>onDelete(a.id)}
                          >
                            Delete
                          </button>

                        </div>

                      </td>

                    </tr>
                  ))}

                </tbody>

              </table>

            </div>

          </div>

        </>
      )}

      {/* FAB MOBILE */}

      <div
        className="mobileFab"
        onClick={()=>setTab('scanner')}
      >
        📷 Scanner
      </div>

    </div>

  )

}