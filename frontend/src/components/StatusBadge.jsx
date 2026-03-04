import React from 'react'

export default function StatusBadge({ status }){
  if(status === 'PENDING') return <span className="badge green">● Pendiente</span>
  if(status === 'SCANNED') return <span className="badge red">● Escaneado</span>
  if(status === 'MODIFIED') return <span className="badge yellow">● Modificado</span>
  return <span className="badge">● {status}</span>
}
