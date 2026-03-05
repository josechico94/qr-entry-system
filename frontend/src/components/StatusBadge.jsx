import React from 'react'

export default function StatusBadge({ status }){
  if(status === 'PENDING') return <span className="badge green">● In attesa</span>
  if(status === 'SCANNED') return <span className="badge red">● Scansionato</span>
  if(status === 'MODIFIED') return <span className="badge yellow">● Modificato</span>
  return <span className="badge">● {status}</span>
}
