// Fotos de prendas: se achican en el iPad antes de guardarlas.
// - "thumb": miniatura (~160 px) que va dentro de la prenda, para las listas.
// - "full": foto mediana (~1000 px) que se guarda aparte y se carga solo al abrirla.

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la foto.')); };
    img.src = url;
  });
}

function resize(img, max, quality) {
  const w = img.naturalWidth, h = img.naturalHeight;
  const s = Math.min(1, max / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * s));
  c.height = Math.max(1, Math.round(h * s));
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', quality);
}

export async function fileToPhotos(file) {
  if (!file || !file.type.startsWith('image/')) throw new Error('El archivo no es una foto.');
  const img = await loadImage(file);
  return { full: resize(img, 1000, 0.72), thumb: resize(img, 160, 0.6) };
}

/** Muestra una foto en grande encima de todo (no cierra la ventana que esté abierta). */
export function openPhotoViewer(src, caption = '') {
  let v = document.getElementById('photo-viewer');
  if (!v) {
    v = document.createElement('div');
    v.id = 'photo-viewer';
    document.body.appendChild(v);
    v.addEventListener('click', () => v.classList.remove('open'));
  }
  v.innerHTML = `<img alt=""><div class="pv-cap"></div><button class="pv-close" aria-label="Cerrar">✕</button>`;
  v.querySelector('img').src = src;
  v.querySelector('.pv-cap').textContent = caption;
  v.classList.add('open');
}
