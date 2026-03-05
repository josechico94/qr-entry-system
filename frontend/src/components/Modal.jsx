import React, { useEffect } from "react";

export default function Modal({ title, onClose, children }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose?.();
    }
    window.addEventListener("keydown", onKey);

    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="modalOverlay"
      onMouseDown={(e) => {
        if (e.target.classList.contains("modalOverlay")) onClose?.();
      }}
    >
      <div className="modalBox" role="dialog" aria-modal="true" aria-label={title || "Modal"}>
        <div className="modalHeader">
          <div className="modalTitle">{title}</div>
          <button className="modalClose" onClick={onClose} aria-label="Chiudi">
            ✕
          </button>
        </div>
        <div className="modalBody">{children}</div>
      </div>
    </div>
  );
}
