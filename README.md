# QR Entry Web Local (React + Node + JSON)
App web local para gestionar entradas con QR de uso único.  
- Frontend: React (Vite)
- Backend: Node.js + Express + Socket.IO
- Persistencia: JSON local (data/attendees.json)
- Importación Excel: .xlsx (xlsx)
- QR: qrcode
- Escaneo: html5-qrcode

## Requisitos
- Node.js 18+ (recomendado 20+)

## Instalación
Desde la raíz del proyecto:

```bash
npm install
```

## Ejecutar en desarrollo (frontend + backend juntos)
```bash
npm run dev
```

- Frontend: http://localhost:5173
- Backend:   http://localhost:4000

## Build + "deploy" local (modo producción en tu PC/servidor)
1) Construir frontend:
```bash
npm run build
```

2) Ejecutar servidor (sirve API + frontend build):
```bash
npm start
```

Abrí: http://localhost:4000

## Datos
Se guardan en:
- `backend/data/attendees.json`

Backups:
- Descargar JSON desde Dashboard -> Backup
- Restaurar JSON desde Dashboard -> Restore

## Excel de plantilla
Usá `sample/plantilla.xlsx` (también podés exportar desde la app).

## Seguridad
Por defecto NO hay login. Si querés activarlo:
1) Crear `backend/.env` con:
```
BASIC_AUTH_USER=admin
BASIC_AUTH_PASS=1234
```
2) En `backend/src/server.js` activar `enableBasicAuth = true;`

---

Hecho para funcionar 100% en local.
