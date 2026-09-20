// Feldprüfungen für das Beitrittsformular: IBAN-Algorithmus, Datumslogik,
// einfache Formatprüfungen und Hilfsfunktionen für den Dateinamen.

// Offizielle IBAN-Längen je Länderkürzel (Auswahl der in Europa gängigen
// Länder – reicht für den erwarteten Nutzerkreis dieses Formulars aus).
const IBAN_LAENGEN = {
  AD: 24, AT: 20, BA: 20, BE: 16, BG: 22, CH: 21, CY: 28, CZ: 24, DE: 22,
  DK: 18, EE: 20, ES: 24, FI: 18, FR: 27, GB: 22, GI: 23, GR: 27, HR: 21,
  HU: 28, IE: 22, IS: 26, IT: 27, LI: 21, LT: 20, LU: 20, LV: 21, MC: 27,
  ME: 22, MK: 19, MT: 31, NL: 18, NO: 15, PL: 28, PT: 25, RO: 24, RS: 22,
  SE: 24, SI: 19, SK: 24, SM: 27, VA: 22, XK: 20
};

// EWR-Mitgliedstaaten (EU-27 + Island, Liechtenstein, Norwegen). Außerhalb
// dieser Liste ist die BIC nach Art. 5 (SEPA-Verordnung / Beitragsordnung)
// zusätzlich zur IBAN erforderlich.
const EWR_LAENDER = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR",
  "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK",
  "SI", "ES", "SE", "IS", "LI", "NO"
]);

export function normalizeIban(raw) {
  return (raw || "").toUpperCase().replace(/\s+/g, "");
}

export function formatIban(raw) {
  const iban = normalizeIban(raw);
  return iban.replace(/(.{4})/g, "$1 ").trim();
}

/**
 * Vollständige IBAN-Prüfung nach ISO 7064 (Modulo 97-10). Die Zahl, deren
 * Rest gebildet wird, hat je nach IBAN bis zu 30 Ziffern und passt nicht in
 * eine normale JS-Zahl – deshalb BigInt.
 */
export function validateIban(raw) {
  const iban = normalizeIban(raw);

  if (!iban) {
    return { valid: false, reason: "leer" };
  }
  if (!/^[A-Z0-9]+$/.test(iban)) {
    return { valid: false, reason: "ungueltige_zeichen" };
  }
  const land = iban.slice(0, 2);
  if (!/^[A-Z]{2}$/.test(land)) {
    return { valid: false, reason: "kein_laendercode" };
  }
  const erwarteteLaenge = IBAN_LAENGEN[land];
  if (!erwarteteLaenge) {
    return { valid: false, reason: "unbekanntes_land", land };
  }
  if (iban.length !== erwarteteLaenge) {
    return { valid: false, reason: "falsche_laenge", land };
  }

  const umgestellt = iban.slice(4) + iban.slice(0, 4);
  let numerisch = "";
  for (const zeichen of umgestellt) {
    if (zeichen >= "0" && zeichen <= "9") {
      numerisch += zeichen;
    } else {
      numerisch += (zeichen.charCodeAt(0) - 55).toString(); // A=10 … Z=35
    }
  }

  const rest = BigInt(numerisch) % 97n;
  const gueltig = rest === 1n;

  return {
    valid: gueltig,
    reason: gueltig ? null : "pruefsumme",
    land,
    formatted: formatIban(iban),
    brauchtBic: !EWR_LAENDER.has(land)
  };
}

export function validatePlz(v) {
  return /^\d{5}$/.test((v || "").trim());
}

export function validateEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((v || "").trim());
}

export function validateNichtLeer(v) {
  return (v || "").trim().length > 0;
}

export function parseDatumInput(v) {
  // v stammt aus einem <input type="date">, Format JJJJ-MM-TT.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v || "")) return null;
  const d = new Date(`${v}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function heuteOhneUhrzeit() {
  const heute = new Date();
  heute.setHours(0, 0, 0, 0);
  return heute;
}

export function validateGeburtsdatum(v) {
  const d = parseDatumInput(v);
  if (!d) return false;
  const heute = heuteOhneUhrzeit();
  if (d >= heute) return false;
  const minDatum = new Date(heute);
  minDatum.setFullYear(minDatum.getFullYear() - 120);
  return d >= minDatum;
}

export function validateEintrittsdatum(v) {
  const d = parseDatumInput(v);
  if (!d) return false;
  return d >= heuteOhneUhrzeit();
}

export function berechneAlterAm(geburtsdatumStr, stichtagStr) {
  const g = parseDatumInput(geburtsdatumStr);
  const s = parseDatumInput(stichtagStr);
  if (!g || !s) return null;
  let alter = s.getFullYear() - g.getFullYear();
  const vorGeburtstag =
    s.getMonth() < g.getMonth() ||
    (s.getMonth() === g.getMonth() && s.getDate() < g.getDate());
  if (vorGeburtstag) alter -= 1;
  return alter;
}

export function istMinderjaehrig(geburtsdatumStr, eintrittsdatumStr) {
  const alter = berechneAlterAm(geburtsdatumStr, eintrittsdatumStr);
  return alter !== null && alter < 18;
}

/**
 * Unverbindliche Anzeige des anteiligen Erstbeitrags nach § 3 Abs. 2 der
 * Beitragsordnung: Es zählen nur volle verbleibende Monate bis zum nächsten
 * Fälligkeitstermin. Der Eintrittsmonat zählt nur dann mit, wenn der
 * Eintritt auf den Ersten des Monats fällt.
 */
export function berechneAnteiligenBeitrag(jahresbeitrag, eintrittsdatumStr, faelligkeitMonat) {
  const eintritt = parseDatumInput(eintrittsdatumStr);
  if (!eintritt || !(jahresbeitrag > 0)) return null;

  const tag = eintritt.getDate();
  const monat = eintritt.getMonth() + 1; // 1–12
  const jahr = eintritt.getFullYear();

  let startMonat = tag === 1 ? monat : monat + 1;
  let startJahr = jahr;
  if (startMonat > 12) {
    startMonat = 1;
    startJahr += 1;
  }

  let faelligkeitJahr = jahr;
  if (monat >= faelligkeitMonat) faelligkeitJahr += 1;

  let monate = (faelligkeitJahr - startJahr) * 12 + (faelligkeitMonat - startMonat);
  if (monate < 0) monate = 0;
  if (monate > 12) monate = 12;

  const betrag = Math.round((jahresbeitrag / 12) * monate * 100) / 100;
  return { monate, betrag };
}

const UMLAUT_MAP = { ä: "ae", ö: "oe", ü: "ue", Ä: "Ae", Ö: "Oe", Ü: "Ue", ß: "ss" };

export function transliterieren(text) {
  return (text || "")
    .split("")
    .map((zeichen) => UMLAUT_MAP[zeichen] || zeichen)
    .join("")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function baueDateinamen(nachname, vorname, datumIso) {
  const n = transliterieren(nachname) || "Mitglied";
  const v = transliterieren(vorname) || "";
  const teile = [n, v].filter(Boolean);
  return `Beitritt_${teile.join("_")}_${datumIso}.pdf`;
}

export function heutigesDatumIso() {
  const d = new Date();
  const monat = String(d.getMonth() + 1).padStart(2, "0");
  const tag = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${monat}-${tag}`;
}
