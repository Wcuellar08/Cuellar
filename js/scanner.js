// Escáner de códigos QR con la cámara del iPad (usa jsQR).
import { closeModal, openModal } from './util.js';

/**
 * Abre la cámara y llama a onCode(texto) cada vez que lee un código.
 * onCode debe devolver {ok:boolean, msg:string} para mostrar el resultado.
 */
export async function openScanner(onCode) {
  let stream = null;
  let raf = 0;
  let stopped = false;
  let last = '';
  let lastT = 0;

  const m = openModal(
    `<div class="modal-head"><h2>Escanear etiqueta</h2><button class="btn" data-close>Listo</button></div>
     <div class="scanner">
       <video playsinline muted autoplay></video>
       <div class="scanner-frame"></div>
     </div>
     <p class="scanner-msg" id="scan-msg">Apunta la cámara al código QR de la etiqueta…</p>`,
    {
      wide: true,
      onClose: () => {
        stopped = true;
        cancelAnimationFrame(raf);
        stream?.getTracks().forEach((t) => t.stop());
      },
    }
  );
  const video = m.querySelector('video');
  const msg = m.querySelector('#scan-msg');
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
  } catch (e) {
    msg.textContent = 'No se pudo abrir la cámara. Revisa que Safari tenga permiso para usar la cámara (Ajustes › Safari › Cámara).';
    msg.className = 'scanner-msg err';
    return;
  }
  if (stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
  video.srcObject = stream;
  await video.play().catch(() => {});

  const tick = () => {
    if (stopped) return;
    if (video.readyState >= 2 && video.videoWidth) {
      const scale = Math.min(1, 640 / video.videoWidth);
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = window.jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
      const now = Date.now();
      if (code?.data && (code.data !== last || now - lastT > 2500)) {
        last = code.data;
        lastT = now;
        const r = onCode(code.data.trim());
        msg.textContent = r.msg;
        msg.className = `scanner-msg ${r.ok ? 'ok' : 'err'}`;
        if (navigator.vibrate) navigator.vibrate(r.ok ? 80 : [60, 60, 60]);
      }
    }
    raf = requestAnimationFrame(tick);
  };
  tick();
}

export { closeModal };
