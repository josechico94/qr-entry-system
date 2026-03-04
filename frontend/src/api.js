export async function apiGet(path){
  const r = await fetch(path);
  const j = await r.json();
  if(!r.ok) throw new Error(j.error || 'Error');
  return j;
}

export async function apiPost(path, body){
  const r = await fetch(path, {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify(body ?? {})
  });
  const j = await r.json();
  if(!r.ok) throw new Error(j.error || 'Error');
  return j;
}

export async function apiPut(path, body){
  const r = await fetch(path, {
    method:'PUT',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify(body ?? {})
  });
  const j = await r.json();
  if(!r.ok) throw new Error(j.error || 'Error');
  return j;
}

export async function apiDelete(path){
  const r = await fetch(path, { method:'DELETE' });
  const j = await r.json();
  if(!r.ok) throw new Error(j.error || 'Error');
  return j;
}

export function download(url){
  window.open(url, '_blank');
}
