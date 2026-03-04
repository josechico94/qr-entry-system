import React, { useEffect, useMemo, useState } from 'react'
import { io } from 'socket.io-client'
import { apiDelete, apiGet, apiPost, apiPut, download } from './api'
import StatusBadge from './components/StatusBadge'
import Modal from './components/Modal'
import ScannerView from './views/ScannerView'
import ImportView from './views/ImportView'

function formatDt(v) {
  if (!v) return '-'
  try { return new Date(v).toLocaleString('it-IT') } catch { return v }
}

function kpi(label, value) {
  return (
    <div className="kpi">
      <div>
        <div className="n">{value}</div>
        <div className="l">{label}</div>
      </div>
    </div>
  )
}

export default function App() {
  const [tab, setTab] = useState('dashboard')
  const [attendees, setAttendees] = useState([])
  const [counts, setCounts] = useState({ total: 0, pending: 0, scanned: 0, modified: 0 })
  const [q, setQ] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')

  const [modal, setModal] = useState(null) // {mode:'create'|'edit'|'qr', attendee?}
  const [msg, setMsg] = useState({ type: '', text: '' })

  useEffect(() => {
    let mounted = true
    apiGet('/api/attendees').then(({ attendees, counts }) => {
      if (!mounted) return
      setAttendees(attendees)
      setCounts(counts)
    }).catch(e => setMsg({ type: 'error', text: e.message }))

    const socket = io()
    socket.on('attendees:changed', (payload) => {
      setAttendees(payload.attendees || [])
      setCounts(payload.counts || { total: 0, pending: 0, scanned: 0, modified: 0 })
    })
    return () => { mounted = false; socket.close() }
  }, [])

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase()
    return attendees.filter(a => {
      if (statusFilter !== 'ALL' && a.status !== statusFilter) return false
      if (!qq) return true
      const blob = [a.firstName, a.lastName, a.document, a.email, a.phone].join(' ').toLowerCase()
      return blob.includes(qq)
    })
  }, [attendees, q, statusFilter])

  async function onCreate(values) {
    setMsg({ type: '', text: '' })
    try {
      await apiPost('/api/attendees', values)
      setModal(null)
      setMsg({ type: 'success', text: 'Creato con successo.' })
    } catch (e) {
      setMsg({ type: 'error', text: e.message })
    }
  }

  async function onUpdate(id, values) {
    setMsg({ type: '', text: '' })
    try {
      await apiPut(`/api/attendees/${id}`, values)
      setModal(null)
      setMsg({ type: 'success', text: 'Aggiornato con successo.' })
    } catch (e) {
      setMsg({ type: 'error', text: e.message })
    }
  }

  async function onDelete(id) {
    if (!confirm('Eliminare questo record?')) return
    setMsg({ type: '', text: '' })
    try {
      await apiDelete(`/api/attendees/${id}`)
      setMsg({ type: 'success', text: 'Eliminato.' })
    } catch (e) {
      setMsg({ type: 'error', text: e.message })
    }
  }

  async function onReset() {
    if (!confirm('Questo metterà TUTTI su “In attesa” (azzera le scansioni). Continuare?')) return
    setMsg({ type: '', text: '' })
    try {
      await apiPost('/api/reset', {})
      setMsg({ type: 'success', text: 'Scansioni azzerate.' })
    } catch (e) {
      setMsg({ type: 'error', text: e.message })
    }
  }

  return (
    <div className="container">
      <div className="nav">
        <div className="left">
          <div className="brand">QR Entry · Beta</div>
          <span className="badge">Realtime</span>
        </div>
        <div className="tabs">
          <a className={'tab ' + (tab === 'dashboard' ? 'active' : '')} onClick={() => setTab('dashboard')}>Dashboard</a>
          <a className={'tab ' + (tab === 'scanner' ? 'active' : '')} onClick={() => setTab('scanner')}>Scanner</a>
          <a className={'tab ' + (tab === 'import' ? 'active' : '')} onClick={() => setTab('import')}>Importa</a>
        </div>
      </div>

      <div style={{ height: 14 }} />

      {msg.text ? <div className={'card ' + (msg.type === 'error' ? 'error' : 'success')}>{msg.text}</div> : null}
      {msg.text ? <div style={{ height: 14 }} /> : null}

      {tab === 'scanner' ? (
        <ScannerView onBack={() => setTab('dashboard')} />
      ) : tab === 'import' ? (
        <ImportView />
      ) : (
        <>
          <div className="grid cols-3">
            {kpi('Totale', counts.total)}
            {kpi('In attesa', counts.pending)}
            {kpi('Scansionati', counts.scanned)}
          </div>

          <div style={{ height: 12 }} />

          <div className="grid cols-3">
            {kpi('Modificati', counts.modified)}

            <div className="kpi">
              <div>
                <div className="l">Esporta</div>
                <div className="row" style={{ marginTop: 10 }}>
                  <button className="btn" onClick={() => download('/api/export.csv')}>CSV</button>
                  <button className="btn" onClick={() => download('/api/export.xlsx')}>XLSX</button>
                  <button className="btn" onClick={() => download('/api/tickets.pdf')}>PDF (tutti)</button>
                </div>
              </div>
            </div>

            <div className="kpi">
              <div>
                <div className="l">Backup / Ripristino</div>
                <div className="row" style={{ marginTop: 10 }}>
                  <button className="btn" onClick={() => download('/api/backup.json')}>Backup JSON</button>
                  <RestoreButton setMsg={setMsg} />
                </div>
              </div>
            </div>
          </div>

          <div style={{ height: 12 }} />

          <div className="card">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800 }}>Partecipanti</div>
                <div className="small">Verde=In attesa · Giallo=Modificato · Rosso=Scansionato (monouso)</div>
              </div>
              <div className="row">
                <button className="btn warn" onClick={onReset}>Azzera scansioni</button>
                <button className="btn primary" onClick={() => setModal({ mode: 'create' })}>+ Nuovo</button>
              </div>
            </div>

            <div className="hr" />

            <div className="row">
              <div style={{ flex: '1 1 260px' }}>
                <input
                  placeholder="Cerca per nome, doc, email..."
                  value={q}
                  onChange={e => setQ(e.target.value)}
                />
              </div>
              <div style={{ width: 220 }}>
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                  <option value="ALL">Tutti</option>
                  <option value="PENDING">In attesa</option>
                  <option value="MODIFIED">Modificato</option>
                  <option value="SCANNED">Scansionato</option>
                </select>
              </div>
            </div>

            <div style={{ height: 12 }} />

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Documento</th>
                    <th>Stato</th>
                    <th>Aggiornato</th>
                    <th>Scansionato</th>
                    <th>Azioni</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(a => (
                    <tr key={a.id}>
                      <td>
                        <div style={{ fontWeight: 700 }}>{a.firstName} {a.lastName}</div>
                        <div className="small">{a.email || '-'} · {a.phone || '-'}</div>
                      </td>
                      <td>{a.document || '-'}</td>
                      <td><StatusBadge status={a.status} /></td>
                      <td>{formatDt(a.updatedAt)}</td>
                      <td>{formatDt(a.scannedAt)}</td>
                      <td>
                        <div className="row">
                          <button className="btn" onClick={() => download(`/api/ticket/${a.id}.pdf`)}>Ticket PDF</button>
                          <button className="btn" onClick={() => setModal({ mode: 'qr', attendee: a })}>Vedi QR</button>
                          <button className="btn" onClick={() => setModal({ mode: 'edit', attendee: a })}>Modifica</button>
                          <button className="btn danger" onClick={() => onDelete(a.id)}>Elimina</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 ? (
                    <tr><td colSpan="6" className="small">Nessun risultato.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {modal?.mode === 'create' ? (
        <Modal title="Crea partecipante" onClose={() => setModal(null)}>
          <AttendeeForm
            initial={{ firstName: '', lastName: '', document: '', email: '', phone: '', notes: '' }}
            submitLabel="Crea"
            onSubmit={onCreate}
          />
        </Modal>
      ) : null}

      {modal?.mode === 'edit' ? (
        <Modal title="Modifica partecipante" onClose={() => setModal(null)}>
          <AttendeeForm
            initial={modal.attendee}
            submitLabel="Salva modifiche"
            onSubmit={(values) => onUpdate(modal.attendee.id, values)}
          />
          {modal.attendee?.status === 'SCANNED' && modal.attendee?.editedAfterScan ? (
            <div className="small" style={{ marginTop: 10 }}>
              Nota: questo record è stato modificato dopo la scansione (rimane SCANSIONATO per bloccare il re-ingresso).
            </div>
          ) : null}
        </Modal>
      ) : null}

      {modal?.mode === 'qr' ? (
        <Modal title="QR del partecipante" onClose={() => setModal(null)}>
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <div style={{ flex: '1 1 280px' }}>
              <div style={{ fontWeight: 800 }}>{modal.attendee.firstName} {modal.attendee.lastName}</div>
              <div className="small">Token: {modal.attendee.qrToken}</div>
              <div className="small">Stato: {modal.attendee.status}</div>

              <div style={{ height: 10 }} />
              <div className="row">
                <button className="btn" onClick={() => download(`/api/ticket/${modal.attendee.id}.pdf`)}>Ticket PDF</button>
                <button className="btn" onClick={() => {
                  const a = document.createElement('a')
                  a.href = modal.attendee.qrDataUrl
                  a.download = `qr-${modal.attendee.firstName}-${modal.attendee.lastName}.png`
                  a.click()
                }}>Scarica PNG</button>
              </div>
            </div>

            <div style={{ flex: '0 0 280px' }}>
              <img
                src={modal.attendee.qrDataUrl}
                alt="qr"
                style={{ width: '100%', borderRadius: 16, border: '1px solid rgba(36,50,68,.7)' }}
              />
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  )
}

function AttendeeForm({ initial, submitLabel, onSubmit }) {
  const [v, setV] = useState({
    firstName: initial.firstName || '',
    lastName: initial.lastName || '',
    document: initial.document || '',
    email: initial.email || '',
    phone: initial.phone || '',
    notes: initial.notes || ''
  })
  const [busy, setBusy] = useState(false)

  function set(k, val) { setV(prev => ({ ...prev, [k]: val })) }

  return (
    <form onSubmit={async (e) => {
      e.preventDefault()
      setBusy(true)
      try { await onSubmit(v) } finally { setBusy(false) }
    }}>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0,1fr))' }}>
        <div>
          <div className="small">Nome *</div>
          <input value={v.firstName} onChange={e => set('firstName', e.target.value)} />
        </div>
        <div>
          <div className="small">Cognome *</div>
          <input value={v.lastName} onChange={e => set('lastName', e.target.value)} />
        </div>
        <div>
          <div className="small">Documento</div>
          <input value={v.document} onChange={e => set('document', e.target.value)} />
        </div>
        <div>
          <div className="small">Email</div>
          <input value={v.email} onChange={e => set('email', e.target.value)} />
        </div>
        <div>
          <div className="small">Telefono</div>
          <input value={v.phone} onChange={e => set('phone', e.target.value)} />
        </div>
        <div>
          <div className="small">Note</div>
          <input value={v.notes} onChange={e => set('notes', e.target.value)} />
        </div>
      </div>
      <div style={{ height: 12 }} />
      <button className="btn primary" disabled={busy}>{busy ? 'Salvataggio…' : submitLabel}</button>
    </form>
  )
}

function RestoreButton({ setMsg }) {
  const [busy, setBusy] = useState(false)

  return (
    <label className="btn" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
      {busy ? 'Ripristino…' : 'Ripristina JSON'}
      <input
        type="file"
        accept="application/json"
        style={{ display: 'none' }}
        disabled={busy}
        onChange={async (e) => {
          const file = e.target.files?.[0]
          if (!file) return
          setBusy(true)
          setMsg({ type: '', text: '' })
          try {
            const buf = await file.arrayBuffer()
            const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)))
            await apiPost('/api/restore.json', { jsonBase64: b64 })
            setMsg({ type: 'success', text: 'Ripristino completato.' })
          } catch (err) {
            setMsg({ type: 'error', text: err.message })
          } finally {
            setBusy(false)
            e.target.value = ''
          }
        }}
      />
    </label>
  )
}