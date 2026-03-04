import React from 'react'

export default function Modal({ title, children, onClose }){
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e)=>e.stopPropagation()}>
        <div className="row" style={{justifyContent:'space-between'}}>
          <div style={{fontWeight:800}}>{title}</div>
          <button className="btn" onClick={onClose}>Cerrar</button>
        </div>
        <div className="hr" />
        {children}
      </div>
    </div>
  )
}
