import React, { useEffect, useMemo, useState } from 'react'
import { io } from 'socket.io-client'
import { apiDelete, apiGet, apiPost, apiPut, download } from './api'
import StatusBadge from './components/StatusBadge'
import Modal from './components/Modal'
import ScannerView from './views/ScannerView'
import ImportView from './views/ImportView'

function formatDt(v){
  if(!v) return '-'
  try{ return new Date(v).toLocaleString('it-IT') }catch{ return v }
}

function cx(...arr){ return arr.filter(Boolean).join(' ') }

function StatCard({ tone='blue', icon, label, value, sub }){
  return (
    <div className={cx('stat', `stat-${tone}`)}>
      <div className="stat-top">
        <div className="stat-icon">{icon}</div>
        <div className="stat-label">{label}</div>
      </div>
      <div className="stat-value">{value}</div>
      {sub ? <div className="stat-sub">{sub}</div> : null}
      <div className="stat-glow" />
    </div>
  )
}

function EmptyState({ title, subtitle, actionLabel, onAction }){
  return (
    <div className="empty">
      <div className="empty-icon">✨</div>
      <div className="empty-title">{title}</div>
      <div className="empty-sub">{subtitle}</div>
      {actionLabel ? (
        <button className="btn btn-primary" onClick={onAction}>{actionLabel}</button>
      ) : null}
    </div>
  )
}

export default function App(){
  const [tab, setTab] = useState('dashboard')

  const [attendees, setAttendees] = useState([])
  const [counts, setCounts] = useState({ total:0, pending:0, scanned:0, modified:0 })

  const [q, setQ] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')

  const [modal, setModal] = useState(null) // {mode:'create'|'edit'|'qr', attendee?}
  const [toast, setToast] = useState(null) // {type,text}

  useEffect(()=>{
    let mounted = true

    apiGet('/api/attendees')
      .then(({attendees, counts})=>{
        if(!mounted) return
        setAttendees(attendees || [])
        setCounts(counts || { total:0, pending:0, scanned:0, modified:0 })
      })
      .catch(e=> setToast({type:'error', text: e.message}))

    const socket = io()
    socket.on('attendees:changed', (payload)=>{
      setAttendees(payload.attendees || [])
      setCounts(payload.counts || { total:0, pending:0, scanned:0, modified:0 })
    })

    return ()=>{ mounted=false; socket.close() }
  }, [])

  // auto hide toast
  useEffect(()=>{
    if(!toast) return
    const t = setTimeout(()=>setToast(null), 3200)
    return ()=>clearTimeout(t)
  }, [toast])

  const filtered = useMemo(()=>{
    const qq = q.trim().toLowerCase()
    return attendees.filter(a=>{
      if(statusFilter !== 'ALL' && a.status !== statusFilter) return false
      if(!qq) return true
      const blob = [a.firstName,a.lastName,a.document,a.email,a.phone].join(' ').toLowerCase()
      return blob.includes(qq)
    })
  }, [attendees, q, statusFilter])

  async function onCreate(values){
    try{
      await apiPost('/api/attendees', values)
      setModal(null)
      setToast({type:'success', text:'Creato con successo.'})
    }catch(e){
      setToast({type:'error', text:e.message})
    }
  }

  async function onUpdate(id, values){
    try{
      await apiPut(`/api/attendees/${id}`, values)
      setModal(null)
      setToast({type:'success', text:'Aggiornato con successo.'})
    }catch(e){
      setToast({type:'error', text:e.message})
    }
  }

  async function onDelete(id){
    if(!confirm('Eliminare questo record?')) return
    try{
      await apiDelete(`/api/attendees/${id}`)
      setToast({type:'success', text:'Eliminato.'})
    }catch(e){
      setToast({type:'error', text:e.message})
    }
  }

  async function onReset(){
    if(!confirm('Azzera TUTTE le scansioni e rimetti “In attesa”?')) return
    try{
      await apiPost('/api/reset', {})
      setToast({type:'success', text:'Scansioni azzerate.'})
    }catch(e){
      setToast({type:'error', text:e.message})
    }
  }

  function openQrModal(a){
    setModal({mode:'qr', attendee:a})
  }

  function openEditModal(a){
    setModal({mode:'edit', attendee:a})
  }

  return (
    <div className="app">
      {/* TOP NAV */}
      <div className="topbar">
        <div className="brand">
          <div className="brand-mark">QR</div>
          <div className="brand-text">
            <div className="brand-title">QR Entry System</div>
            <div className="brand-sub">Control Panel · Realtime</div>
          </div>
        </div>

        <div className="tabs">
          <button className={cx('tab', tab==='dashboard' && 'active')} onClick={()=>setTab('dashboard')}>Dashboard</button>
          <button className={cx('tab', tab==='scanner' && 'active')} onClick={()=>setTab('scanner')}>Scanner</button>
          <button className={cx('tab', tab==='import' && 'active')} onClick={()=>setTab('import')}>Importa</button>
        </div>

        <div className="top-actions">
          <button className="btn btn-ghost" onClick={()=>download('/api/tickets.pdf')}>🎫 PDF</button>
          <button className="btn btn-ghost" onClick={()=>download('/api/export.xlsx')}>📄 XLSX</button>
          <button className="btn btn-primary" onClick={()=>setTab('scanner')}>📷 Check-in</button>
        </div>
      </div>

      {/* TOAST */}
      {toast ? (
        <div className={cx('toast', toast.type === 'error' ? 'toast-error' : 'toast-ok')}>
          <div className="toast-dot" />
          <div className="toast-text">{toast.text}</div>
          <button className="toast-x" onClick={()=>setToast(null)}>✕</button>
        </div>
      ) : null}

      {/* CONTENT */}
      <div className="container">
        {tab === 'scanner' ? (
          <ScannerView onBack={()=>setTab('dashboard')} />
        ) : tab === 'import' ? (
          <ImportView />
        ) : (
          <>
            {/* HERO */}
            <div className="hero">
              <div className="hero-left">
                <div className="hero-kicker">Event Dashboard</div>
                <div className="hero-title">Monitoraggio accessi</div>
                <div className="hero-sub">
                  Stato ingressi in tempo reale · QR monouso · Operatività ottimizzata per staff
                </div>

                <div className="hero-cta">
                  <button className="btn btn-primary" onClick={()=>setTab('scanner')}>📷 Avvia Check-in</button>
                  <button className="btn btn-ghost" onClick={()=>download('/api/tickets.pdf')}>🎫 Scarica PDF (tutti)</button>
                  <button className="btn btn-ghost" onClick={()=>download('/api/backup.json')}>🧠 Backup JSON</button>
                </div>
              </div>

              <div className="hero-right">
                <div className="hero-card">
                  <div className="hero-card-title">Quick actions</div>
                  <div className="hero-card-actions">
                    <button className="btn btn-ghost" onClick={()=>download('/api/export.csv')}>CSV</button>
                    <button className="btn btn-ghost" onClick={()=>download('/api/export.xlsx')}>XLSX</button>
                    <button className="btn btn-warn" onClick={onReset}>Reset scansioni</button>
                    <button className="btn btn-primary" onClick={()=>setModal({mode:'create'})}>+ Nuovo</button>
                  </div>
                  <div className="hero-card-note">
                    Suggerimento: usa <b>Check-in</b> per una scansione rapida e continua.
                  </div>
                </div>
              </div>

              <div className="hero-glow" />
            </div>

            {/* STATS */}
            <div className="stats">
              <StatCard tone="blue" icon="👥" label="Totale" value={counts.total} sub="Registrazioni" />
              <StatCard tone="green" icon="🟢" label="In attesa" value={counts.pending} sub="Non ancora scansionati" />
              <StatCard tone="red" icon="🔴" label="Scansionati" value={counts.scanned} sub="Ingresso effettuato" />
              <StatCard tone="yellow" icon="🟡" label="Modificati" value={counts.modified} sub="Aggiornati manualmente" />
            </div>

            {/* TOOLBAR */}
            <div className="toolbar">
              <div className="toolbar-left">
                <div className="seg">
                  <button className={cx('seg-btn', statusFilter==='ALL' && 'active')} onClick={()=>setStatusFilter('ALL')}>Tutti</button>
                  <button className={cx('seg-btn', statusFilter==='PENDING' && 'active')} onClick={()=>setStatusFilter('PENDING')}>In attesa</button>
                  <button className={cx('seg-btn', statusFilter==='MODIFIED' && 'active')} onClick={()=>setStatusFilter('MODIFIED')}>Modificati</button>
                  <button className={cx('seg-btn', statusFilter==='SCANNED' && 'active')} onClick={()=>setStatusFilter('SCANNED')}>Scansionati</button>
                </div>

                <div className="search">
                  <span className="search-ic">⌕</span>
                  <input
                    placeholder="Cerca: nome, documento, email…"
                    value={q}
                    onChange={e=>setQ(e.target.value)}
                  />
                </div>
              </div>

              <div className="toolbar-right">
                <button className="btn btn-ghost" onClick={()=>download('/api/tickets.pdf')}>🎫 PDF</button>
                <button className="btn btn-ghost" onClick={()=>download('/api/export.xlsx')}>📄 XLSX</button>
                <button className="btn btn-primary" onClick={()=>setModal({mode:'create'})}>+ Nuovo</button>
              </div>
            </div>

            {/* TABLE */}
            <div className="panel">
              <div className="panel-head">
                <div>
                  <div className="panel-title">Partecipanti</div>
                  <div className="panel-sub">Verde = In attesa · Giallo = Modificato · Rosso = Scansionato (monouso)</div>
                </div>
                <div className="panel-actions">
                  <button className="btn btn-ghost" onClick={()=>setTab('import')}>⬆️ Importa</button>
                  <button className="btn btn-ghost" onClick={()=>download('/api/backup.json')}>Backup</button>
                </div>
              </div>

              {filtered.length === 0 ? (
                <EmptyState
                  title="Nessun partecipante trovato"
                  subtitle="Prova a cambiare filtro o importa un file Excel."
                  actionLabel="Vai a Importa"
                  onAction={()=>setTab('import')}
                />
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Nome</th>
                        <th>Documento</th>
                        <th>Stato</th>
                        <th>Aggiornato</th>
                        <th>Scansione</th>
                        <th className="th-right">Azioni</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(a=>(
                        <tr key={a.id}>
                          <td className="td-name">
                            <div className="name-line">
                              <div className="name">{a.firstName} {a.lastName}</div>
                              <div className="meta">Ticket #{a.ticketNumber || '-'} · ID {(a.qrToken || '').slice(-8)}</div>
                            </div>
                            <div className="meta">
                              {a.email || '-'} {a.phone ? ` · ${a.phone}` : ''}
                            </div>
                          </td>
                          <td>{a.document || '-'}</td>
                          <td><StatusBadge status={a.status} /></td>
                          <td>{formatDt(a.updatedAt)}</td>
                          <td>{formatDt(a.scannedAt)}</td>
                          <td className="td-actions">
                            <div className="actions">
                              <button className="btn btn-ghost" onClick={()=>download(`/api/ticket/${a.id}.pdf`)}>Ticket</button>
                              <button className="btn btn-ghost" onClick={()=>openQrModal(a)}>QR</button>
                              <button className="btn btn-ghost" onClick={()=>openEditModal(a)}>Modifica</button>
                              <button className="btn btn-danger" onClick={()=>onDelete(a.id)}>Elimina</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* MOBILE FAB */}
            <button className="fab" onClick={()=>setTab('scanner')}>
              <span className="fab-ic">📷</span>
              <span className="fab-tx">Check-in</span>
            </button>
          </>
        )}
      </div>

      {/* MOBILE BOTTOM NAV */}
      <div className="bottom-nav">
        <button className={cx('bn', tab==='dashboard' && 'active')} onClick={()=>setTab('dashboard')}>
          <div className="bn-ic">🏠</div><div className="bn-tx">Dashboard</div>
        </button>
        <button className={cx('bn', tab==='scanner' && 'active')} onClick={()=>setTab('scanner')}>
          <div className="bn-ic">📷</div><div className="bn-tx">Scanner</div>
        </button>
        <button className={cx('bn', tab==='import' && 'active')} onClick={()=>setTab('import')}>
          <div className="bn-ic">⬆️</div><div className="bn-tx">Importa</div>
        </button>
      </div>

      {/* MODALS */}
      {modal?.mode === 'create' ? (
        <Modal title="Crea partecipante" onClose={()=>setModal(null)}>
          <AttendeeForm
            initial={{ firstName:'', lastName:'', document:'', email:'', phone:'', notes:'' }}
            submitLabel="Crea"
            onSubmit={onCreate}
          />
        </Modal>
      ) : null}

      {modal?.mode === 'edit' ? (
        <Modal title="Modifica partecipante" onClose={()=>setModal(null)}>
          <AttendeeForm
            initial={modal.attendee}
            submitLabel="Salva"
            onSubmit={(values)=>onUpdate(modal.attendee.id, values)}
          />
          {modal.attendee?.status === 'SCANNED' && modal.attendee?.editedAfterScan ? (
            <div className="hintline">
              Nota: record modificato dopo la scansione (rimane SCANSIONATO per bloccare il re-ingresso).
            </div>
          ) : null}
        </Modal>
      ) : null}

      {modal?.mode === 'qr' ? (
        <Modal title="QR del partecipante" onClose={()=>setModal(null)}>
          <div className="qr-modal">
            <div className="qr-left">
              <div className="qr-title">{modal.attendee.firstName} {modal.attendee.lastName}</div>
              <div className="qr-sub">Ticket #{modal.attendee.ticketNumber || '-'} · Stato: {modal.attendee.status}</div>
              <div className="qr-sub">Token: {modal.attendee.qrToken}</div>
              <div style={{height:10}} />
              <div className="actions">
                <button className="btn btn-primary" onClick={()=>download(`/api/ticket/${modal.attendee.id}.pdf`)}>Ticket PDF</button>
                <button className="btn btn-ghost" onClick={()=>{
                  const a = document.createElement('a')
                  a.href = modal.attendee.qrDataUrl
                  a.download = `qr-${modal.attendee.firstName}-${modal.attendee.lastName}.png`
                  a.click()
                }}>Scarica PNG</button>
              </div>
            </div>
            <div className="qr-right">
              <img className="qr-img" src={modal.attendee.qrDataUrl} alt="qr" />
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  )
}

function AttendeeForm({ initial, submitLabel, onSubmit }){
  const [v, setV] = useState({
    firstName: initial.firstName || '',
    lastName: initial.lastName || '',
    document: initial.document || '',
    email: initial.email || '',
    phone: initial.phone || '',
    notes: initial.notes || ''
  })
  const [busy, setBusy] = useState(false)

  function set(k,val){ setV(prev=>({ ...prev, [k]: val })) }

  return (
    <form onSubmit={async (e)=>{
      e.preventDefault()
      setBusy(true)
      try{ await onSubmit(v) } finally{ setBusy(false) }
    }}>
      <div className="form-grid">
        <div>
          <div className="lbl">Nome *</div>
          <input value={v.firstName} onChange={e=>set('firstName', e.target.value)} />
        </div>
        <div>
          <div className="lbl">Cognome *</div>
          <input value={v.lastName} onChange={e=>set('lastName', e.target.value)} />
        </div>
        <div>
          <div className="lbl">Documento</div>
          <input value={v.document} onChange={e=>set('document', e.target.value)} />
        </div>
        <div>
          <div className="lbl">Email</div>
          <input value={v.email} onChange={e=>set('email', e.target.value)} />
        </div>
        <div>
          <div className="lbl">Telefono</div>
          <input value={v.phone} onChange={e=>set('phone', e.target.value)} />
        </div>
        <div>
          <div className="lbl">Note</div>
          <input value={v.notes} onChange={e=>set('notes', e.target.value)} />
        </div>
      </div>

      <div style={{height:12}} />
      <button className="btn btn-primary" disabled={busy}>{busy ? 'Salvataggio…' : submitLabel}</button>
    </form>
  )
}