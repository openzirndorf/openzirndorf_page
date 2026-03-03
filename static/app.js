/* ---- Year ---- */
document.getElementById('year').textContent = new Date().getFullYear();

/* ---- Sticky header shadow ---- */
const header = document.getElementById('header');
window.addEventListener('scroll', () => {
  header.classList.toggle('scrolled', window.scrollY > 10);
}, { passive: true });

/* ---- Hamburger / Mobile Nav ---- */
const hamburger = document.getElementById('hamburger');
const mobileNav = document.getElementById('mobile-nav');

hamburger.addEventListener('click', () => {
  const open = hamburger.classList.toggle('open');
  hamburger.setAttribute('aria-expanded', open);
  mobileNav.classList.toggle('open', open);
  mobileNav.setAttribute('aria-hidden', !open);
  document.body.style.overflow = open ? 'hidden' : '';
});

mobileNav.querySelectorAll('a').forEach(link => {
  link.addEventListener('click', () => {
    hamburger.classList.remove('open');
    hamburger.setAttribute('aria-expanded', 'false');
    mobileNav.classList.remove('open');
    mobileNav.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  });
});

/* ---- Fade-in on scroll ---- */
const observer = new IntersectionObserver(
  entries => entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.classList.add('visible');
      observer.unobserve(e.target);
    }
  }),
  { threshold: 0.1 }
);

function observeFadeIn() {
  document.querySelectorAll('.feature-card, .pillar-card, .einstieg-card, .event-item, .media-card, .mascot-card').forEach(el => {
    if (!el.classList.contains('fade-in')) {
      el.classList.add('fade-in');
    }
    observer.observe(el);
  });
}

observeFadeIn();

/* ---- Termin-Modal ---- */
let termineData = [];

const MONAT_ZAHL = {
  Januar:1, Februar:2, März:3, April:4, Mai:5, Juni:6,
  Juli:7, August:8, September:9, Oktober:10, November:11, Dezember:12
};
const TAG_LANG = {
  Mo:'Montag', Di:'Dienstag', Mi:'Mittwoch', Do:'Donnerstag',
  Fr:'Freitag', Sa:'Samstag', So:'Sonntag'
};

const modalOverlay = document.getElementById('termin-modal');
const modalClose  = document.getElementById('modal-close');

function openModal(idx) {
  const t = termineData[idx];
  if (!t) return;

  document.getElementById('modal-day').textContent   = t.datum + '.' + (t.monatZahl || '') + '.';
  document.getElementById('modal-month').textContent = t.wochentag;
  document.getElementById('modal-title').textContent = t.titel;

  const meta = [t.ort, t.uhrzeit].filter(Boolean).join(' · ');
  document.getElementById('modal-meta').textContent = meta;

  const textEl = document.getElementById('modal-text');
  textEl.textContent = t.text || '';
  textEl.hidden = !t.text;

  const actionsEl = document.getElementById('modal-actions');
  actionsEl.innerHTML = t.link
    ? `<a class="btn btn-primary" href="${t.link}" target="_blank" rel="noopener noreferrer">Mehr Infos →</a>`
    : '';

  modalOverlay.classList.add('open');
  modalOverlay.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  modalClose.focus();
}

function closeModal() {
  modalOverlay.classList.remove('open');
  modalOverlay.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

if (modalClose) modalClose.addEventListener('click', closeModal);
if (modalOverlay) {
  modalOverlay.addEventListener('click', e => {
    if (e.target === modalOverlay) closeModal();
  });
}
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && modalOverlay?.classList.contains('open')) closeModal();
});

/* ---- Termine aus data/termine.md laden ---- */
async function ladeTermine() {
  const container = document.getElementById('events-list');
  if (!container) return;

  try {
    const res = await fetch('data/termine.md');
    if (!res.ok) throw new Error('nicht gefunden');
    const text = await res.text();

    // Blöcke an ## aufteilen (Kommentarzeilen ignorieren)
    const blocks = text
      .split(/^## /m)
      .filter(b => b.trim() && !b.trim().startsWith('<!--'));

    if (blocks.length === 0) {
      container.innerHTML = '<p class="no-events">Aktuell sind keine Termine geplant.</p>';
      return;
    }

    termineData = blocks.map(block => {
      const lines = block.trim().split('\n').filter(l => l.trim() && !l.trim().startsWith('<!--'));
      const titel = lines[0].trim();
      const fields = {};
      for (const line of lines.slice(1)) {
        const m = line.match(/^(\w+):\s*(.+)$/);
        if (m) fields[m[1]] = m[2].trim();
      }
      // Datum parsen – zwei Formate werden unterstützt:
      //   numerisch: "Mi, 11.03.2026"  oder  "Mi, 11.3.2026"
      //   textuell:  "Mi, 11. März 2026"
      const datumStr  = fields.Datum || '';
      const tagMatch  = datumStr.match(/^(\w+),/);
      const tagKurz   = tagMatch ? tagMatch[1] : '';

      let datum = '?', monat = '', monatZahl = '';
      const numMatch  = datumStr.match(/(\d{1,2})\.(\d{1,2})\./);
      const textMatch = datumStr.match(/(\d{1,2})\.\s*([A-Za-z\u00C0-\u00FF]+)/);
      if (numMatch) {
        datum     = numMatch[1];
        monatZahl = parseInt(numMatch[2], 10);
        monat     = Object.keys(MONAT_ZAHL).find(k => MONAT_ZAHL[k] === monatZahl) || '';
      } else if (textMatch) {
        datum     = textMatch[1];
        monat     = textMatch[2];
        monatZahl = MONAT_ZAHL[monat] || '';
      }

      return {
        titel,
        tag:       tagKurz,
        wochentag: TAG_LANG[tagKurz] || tagKurz,
        datum,
        monat,
        monatZahl,
        uhrzeit:   fields.Zeit || '',
        ort:       fields.Ort  || '',
        link:      fields.Link || '',
        text:      fields.Text || ''
      };
    });

    container.innerHTML = termineData.map((t, i) => `
      <div class="event-item event-clickable" data-index="${i}" role="button" tabindex="0" aria-haspopup="dialog">
        <div class="event-date">
          <span class="event-day">${t.datum}.${t.monatZahl}.</span>
          <span class="event-month">${t.wochentag}</span>
        </div>
        <div class="event-info">
          <h3>${t.titel}</h3>
          <p>${[t.ort, t.uhrzeit].filter(Boolean).join(' · ')}</p>
        </div>
        <span class="event-details-hint">Details</span>
      </div>
    `).join('');

    container.querySelectorAll('.event-clickable').forEach(el => {
      el.addEventListener('click', () => openModal(+el.dataset.index));
      el.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openModal(+el.dataset.index);
        }
      });
    });

    observeFadeIn();
  } catch {
    container.innerHTML = '<p class="no-events">Aktuell sind keine Termine geplant.</p>';
  }
}

/* ---- Maskottchen aus data/maskottchen.json laden ---- */
async function ladeMaskottchen() {
  const container = document.getElementById('maskottchen-grid');
  if (!container) return;

  try {
    const res = await fetch('data/maskottchen.json');
    if (!res.ok) throw new Error('nicht gefunden');
    const liste = await res.json();

    if (!liste || liste.length === 0) {
      container.innerHTML = '<p class="media-hint">Noch keine Maskottchen hinterlegt.</p>';
      return;
    }

    container.innerHTML = liste.map(m => `
      <div class="media-card mascot-card">
        <div class="media-preview media-preview-mascot">
          <img src="static/media/maskottchen/${m.datei}" alt="${m.name}" class="media-thumb-lg" loading="lazy" />
        </div>
        <div class="media-info">
          <h4>${m.name}</h4>
          ${m.beschreibungstext ? `<p class="mascot-desc">${m.beschreibungstext}</p>` : ''}
        </div>
      </div>
    `).join('');

    observeFadeIn();
  } catch {
    container.innerHTML = '<p class="media-hint">Noch keine Maskottchen hinterlegt.</p>';
  }
}

ladeTermine();
ladeMaskottchen();
