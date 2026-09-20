// Unterschriftenfeld: Canvas-basiertes Unterschreiben per Maus, Finger oder
// Stift. Reine Pointer-Events, damit ein Eingabegerät genügt.

const MIN_WEGLAENGE_PX = 40; // ein einzelner Tipp/Klick zählt nicht als Unterschrift

export function erstelleUnterschriftenfeld(canvas, { onChange } = {}) {
  const ctx = canvas.getContext("2d");
  let zeichnet = false;
  let letzterPunkt = null;
  let gesamtWeglaenge = 0;
  let hatInhalt = false;
  let bereitsSkaliert = false;

  function stiftEinstellen() {
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1F2937";
  }

  function skalieren() {
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    stiftEinstellen();
    return true;
  }

  function benachrichtigen() {
    if (typeof onChange === "function") onChange(hatInhalt);
  }

  function relativePosition(evt) {
    const rect = canvas.getBoundingClientRect();
    return { x: evt.clientX - rect.left, y: evt.clientY - rect.top };
  }

  function zeigerRunter(evt) {
    if (evt.pointerType === "mouse" && evt.button !== 0) return;
    zeichnet = true;
    try {
      canvas.setPointerCapture(evt.pointerId);
    } catch {
      // Manche Browser erlauben das für bestimmte Pointer-Typen nicht – unkritisch.
    }
    const p = relativePosition(evt);
    letzterPunkt = p;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    evt.preventDefault();
  }

  function zeigerBewegt(evt) {
    if (!zeichnet) return;
    const p = relativePosition(evt);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    if (letzterPunkt) {
      const dx = p.x - letzterPunkt.x;
      const dy = p.y - letzterPunkt.y;
      gesamtWeglaenge += Math.sqrt(dx * dx + dy * dy);
      if (!hatInhalt && gesamtWeglaenge > MIN_WEGLAENGE_PX) {
        hatInhalt = true;
        benachrichtigen();
      }
    }
    letzterPunkt = p;
    evt.preventDefault();
  }

  function zeigerHoch(evt) {
    if (!zeichnet) return;
    zeichnet = false;
    try {
      canvas.releasePointerCapture(evt.pointerId);
    } catch {
      // siehe oben
    }
  }

  canvas.addEventListener("pointerdown", zeigerRunter);
  canvas.addEventListener("pointermove", zeigerBewegt);
  canvas.addEventListener("pointerup", zeigerHoch);
  canvas.addEventListener("pointercancel", zeigerHoch);
  canvas.addEventListener("pointerleave", zeigerHoch);

  return {
    /** Muss aufgerufen werden, sobald das Canvas sichtbar ist (Breite > 0). */
    ensureSized() {
      if (bereitsSkaliert) return;
      bereitsSkaliert = skalieren();
    },
    clear() {
      if (canvas.width && canvas.height) {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
      }
      gesamtWeglaenge = 0;
      letzterPunkt = null;
      hatInhalt = false;
      benachrichtigen();
    },
    hasContent() {
      return hatInhalt;
    },
    toDataUrl() {
      return hatInhalt ? canvas.toDataURL("image/png") : null;
    },
    destroy() {
      canvas.removeEventListener("pointerdown", zeigerRunter);
      canvas.removeEventListener("pointermove", zeigerBewegt);
      canvas.removeEventListener("pointerup", zeigerHoch);
      canvas.removeEventListener("pointercancel", zeigerHoch);
      canvas.removeEventListener("pointerleave", zeigerHoch);
    }
  };
}
