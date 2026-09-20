// Ablaufsteuerung des Beitrittsformulars: Schrittwechsel, Feldprüfung,
// Minderjährigen- und Zahlungslogik, Auslösen der PDF-Erzeugung.
//
// Alle Eingaben bleiben ausschließlich im DOM bzw. in den unten stehenden
// JS-Variablen dieses Moduls. Es wird nichts in localStorage/sessionStorage
// geschrieben und nichts an einen Server gesendet.

import { CONFIG } from "./config.js";
import * as validate from "./validate.js";
import { erstelleUnterschriftenfeld } from "./signature.js";
import { erzeugeBeitrittsPdf, dataUrlZuBytes, datenschutzAbsaetze } from "./pdf.js";

const formular = document.getElementById("beitritts-formular");

const state = {
  step: 1,
  minderjaehrig: false,
  unterschriftModus: "digital", // 'digital' | 'handschriftlich'
  unterschriftErzwungen: false,
  pdfUrl: null
};

let signaturPad = null;
let formBeruehrt = false;

function wert(id) {
  const el = document.getElementById(id);
  return el ? el.value : "";
}

function setFehler(id, nachricht) {
  const fehlerEl = document.getElementById(`fehler-${id}`);
  const feldEl = document.getElementById(id);
  if (fehlerEl) {
    fehlerEl.textContent = nachricht;
    fehlerEl.hidden = false;
  }
  if (feldEl) feldEl.setAttribute("aria-invalid", "true");
}

function clearFehler(id) {
  const fehlerEl = document.getElementById(`fehler-${id}`);
  const feldEl = document.getElementById(id);
  if (fehlerEl) {
    fehlerEl.textContent = "";
    fehlerEl.hidden = true;
  }
  if (feldEl) feldEl.removeAttribute("aria-invalid");
}

/* ---------------------------------------------------------------------- */
/* Schritt 1 – Art der Mitgliedschaft                                     */
/* ---------------------------------------------------------------------- */

function rendereMitgliedschaftOptionen() {
  const container = document.getElementById("mitgliedschaft-optionen");

  CONFIG.mitgliedschaftsarten.forEach((art) => {
    const karte = document.createElement("label");
    karte.className = "options-karte";

    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "mitgliedschaft";
    radio.value = art.id;
    radio.id = `mitgliedschaft-${art.id}`;

    const inhalt = document.createElement("span");
    inhalt.className = "options-karte-inhalt";

    const titel = document.createElement("span");
    titel.className = "options-karte-titel";
    titel.textContent = art.label;

    const kurztext = document.createElement("span");
    kurztext.className = "options-karte-kurztext";
    kurztext.textContent = art.kurztext;

    const betragWrap = document.createElement("span");
    betragWrap.className = "options-karte-betrag-wrap";

    const betragLabel = document.createElement("label");
    betragLabel.className = "sr-only";
    betragLabel.setAttribute("for", `betrag-${art.id}`);
    betragLabel.textContent = `Jährlicher Beitrag für ${art.label} in Euro`;

    const betragInput = document.createElement("input");
    betragInput.type = "number";
    betragInput.id = `betrag-${art.id}`;
    betragInput.className = "betrag-eingabe";
    betragInput.min = String(art.mindestbetrag);
    betragInput.step = "1";
    betragInput.value = String(art.mindestbetrag);
    betragInput.disabled = true;
    betragInput.inputMode = "decimal";

    const betragSuffix = document.createElement("span");
    betragSuffix.className = "options-karte-betrag-suffix";
    betragSuffix.textContent = "€ / Jahr";

    betragWrap.append(betragLabel, betragInput, betragSuffix);
    inhalt.append(titel, kurztext, betragWrap);
    karte.append(radio, inhalt);
    container.appendChild(karte);

    radio.addEventListener("change", aufMitgliedschaftAuswahlReagieren);
    betragInput.addEventListener("input", () => {
      clearFehler("mitgliedschaft");
      aktualisiereAnteiligenBeitrag();
    });
  });
}

function ausgewaehlteMitgliedschaftsart() {
  return CONFIG.mitgliedschaftsarten.find((art) => {
    const radio = document.getElementById(`mitgliedschaft-${art.id}`);
    return radio && radio.checked;
  });
}

function aufMitgliedschaftAuswahlReagieren() {
  const ausgewaehlt = ausgewaehlteMitgliedschaftsart();

  CONFIG.mitgliedschaftsarten.forEach((art) => {
    const betragInput = document.getElementById(`betrag-${art.id}`);
    const istAusgewaehlt = ausgewaehlt && ausgewaehlt.id === art.id;
    betragInput.disabled = !istAusgewaehlt;
    betragInput.required = !!istAusgewaehlt;
  });

  const brauchtOrganisation = !!(ausgewaehlt && ausgewaehlt.brauchtOrganisation);
  document.getElementById("organisation-gruppe").hidden = !brauchtOrganisation;
  document.getElementById("organisation").required = brauchtOrganisation;
  if (!brauchtOrganisation) clearFehler("organisation");

  // Ein Verein oder Unternehmen selbst hat kein Geburtsdatum – nur die
  // Person, die hier als Ansprechpartner:in unterschreibt, ggf. schon, ist
  // dafür aber nicht verpflichtet (und wird auch nicht auf Minderjährigkeit
  // geprüft, siehe aktualisiereMinderjaehrigkeit()).
  const geburtsdatumInput = document.getElementById("geburtsdatum");
  geburtsdatumInput.required = !brauchtOrganisation;
  document.getElementById("geburtsdatum-pflicht-stern").hidden = brauchtOrganisation;
  document.getElementById("geburtsdatum-optional-hinweis").hidden = !brauchtOrganisation;
  document.getElementById("geburtsdatum-label-text").textContent = brauchtOrganisation
    ? "Geburtsdatum der Ansprechperson"
    : "Geburtsdatum";
  if (brauchtOrganisation) clearFehler("geburtsdatum");
  aktualisiereMinderjaehrigkeit();

  clearFehler("mitgliedschaft");
  aktualisiereAnteiligenBeitrag();
}

function sammleMitgliedschaft() {
  const art = ausgewaehlteMitgliedschaftsart();
  const betragInput = document.getElementById(`betrag-${art.id}`);
  return {
    id: art.id,
    label: art.label,
    brauchtOrganisation: art.brauchtOrganisation,
    betrag: parseFloat(String(betragInput.value).replace(",", "."))
  };
}

function validiereSchritt1() {
  const ausgewaehlt = ausgewaehlteMitgliedschaftsart();
  if (!ausgewaehlt) {
    setFehler("mitgliedschaft", "Bitte wähle eine Art der Mitgliedschaft aus.");
    return false;
  }
  const betragInput = document.getElementById(`betrag-${ausgewaehlt.id}`);
  const betrag = parseFloat(String(betragInput.value).replace(",", "."));
  if (!(betrag >= ausgewaehlt.mindestbetrag)) {
    setFehler("mitgliedschaft", `Der Beitrag muss mindestens ${ausgewaehlt.mindestbetrag} € betragen.`);
    betragInput.setAttribute("aria-invalid", "true");
    betragInput.focus();
    return false;
  }
  clearFehler("mitgliedschaft");
  return true;
}

/* ---------------------------------------------------------------------- */
/* Schritt 2 – Angaben zur Person                                         */
/* ---------------------------------------------------------------------- */

const FELD_VALIDIERUNG = {
  vorname: { pruefen: () => validate.validateNichtLeer(wert("vorname")), nachricht: "Bitte gib deinen Vornamen ein." },
  nachname: { pruefen: () => validate.validateNichtLeer(wert("nachname")), nachricht: "Bitte gib deinen Nachnamen ein." },
  geburtsdatum: {
    pruefen: () => {
      const eingabe = wert("geburtsdatum");
      if (!eingabe && !document.getElementById("geburtsdatum").required) return true;
      return validate.validateGeburtsdatum(eingabe);
    },
    nachricht: "Bitte gib ein gültiges Geburtsdatum in der Vergangenheit ein."
  },
  strasse: { pruefen: () => validate.validateNichtLeer(wert("strasse")), nachricht: "Bitte gib Straße und Hausnummer ein." },
  plz: { pruefen: () => validate.validatePlz(wert("plz")), nachricht: "Die PLZ muss aus 5 Ziffern bestehen." },
  ort: { pruefen: () => validate.validateNichtLeer(wert("ort")), nachricht: "Bitte gib deinen Ort ein." },
  email: { pruefen: () => validate.validateEmail(wert("email")), nachricht: "Bitte gib eine gültige E-Mail-Adresse ein." },
  eintrittsdatum: {
    pruefen: () => validate.validateEintrittsdatum(wert("eintrittsdatum")),
    nachricht: "Das Eintrittsdatum muss heute oder in der Zukunft liegen."
  },
  organisation: {
    pruefen: () => validate.validateNichtLeer(wert("organisation")),
    nachricht: "Bitte gib den Namen der Organisation bzw. des Unternehmens ein."
  },
  "vertreter-name": {
    pruefen: () => validate.validateNichtLeer(wert("vertreter-name")),
    nachricht: "Bitte gib den Namen der gesetzlichen Vertretung ein."
  },
  kontoinhaber: {
    pruefen: () => validate.validateNichtLeer(wert("kontoinhaber")),
    nachricht: "Bitte gib den Namen der Kontoinhaberin/des Kontoinhabers ein."
  },
  bic: { pruefen: () => validate.validateNichtLeer(wert("bic")), nachricht: "Für dieses Land wird die BIC zusätzlich benötigt." }
};

function pruefeFeld(id) {
  const eintrag = FELD_VALIDIERUNG[id];
  if (!eintrag) return true;
  if (eintrag.pruefen()) {
    clearFehler(id);
    return true;
  }
  setFehler(id, eintrag.nachricht);
  return false;
}

function aktualisiereMinderjaehrigkeit() {
  const ausgewaehlt = ausgewaehlteMitgliedschaftsart();
  if (ausgewaehlt && ausgewaehlt.brauchtOrganisation) {
    // Mitglied ist der Verein/das Unternehmen, nicht die unterschreibende
    // Person – die Minderjährigen-/Vertretungslogik nach § 10 Abs. 2 der
    // Satzung betrifft nur natürliche Personen als Mitglied.
    state.minderjaehrig = false;
    document.getElementById("minderjaehrig-hinweis").hidden = true;
    document.getElementById("vertreter-name").required = false;
    clearFehler("vertreter-name");
    return;
  }

  const geburtsdatum = wert("geburtsdatum");
  if (!validate.parseDatumInput(geburtsdatum)) {
    state.minderjaehrig = false;
    document.getElementById("minderjaehrig-hinweis").hidden = true;
    document.getElementById("vertreter-name").required = false;
    clearFehler("vertreter-name");
    return;
  }

  // Vor Eingabe des Eintrittsdatums (Pflichtfeld erst in Schritt 2 weiter
  // unten) schon gegen heute prüfen, damit der Hinweis direkt beim
  // Geburtsdatum erscheint statt erst nach dem Eintrittsdatum. Da das
  // Eintrittsdatum nie in der Vergangenheit liegen darf, ist "heute" hier
  // die konservative Annahme – sie zeigt Minderjährigkeit nie zu spät an,
  // höchstens kurz zu früh, falls der 18. Geburtstag dazwischen liegt.
  const eintrittsdatum = wert("eintrittsdatum");
  const stichtag = validate.parseDatumInput(eintrittsdatum) ? eintrittsdatum : validate.heutigesDatumIso();
  const istMj = validate.istMinderjaehrig(geburtsdatum, stichtag);

  state.minderjaehrig = istMj;
  document.getElementById("minderjaehrig-hinweis").hidden = !istMj;
  document.getElementById("vertreter-name").required = istMj;
  if (!istMj) clearFehler("vertreter-name");
}

function aktualisiereAnteiligenBeitrag() {
  const hinweis = document.getElementById("anteiliger-beitrag-hinweis");
  const eintrittsdatum = wert("eintrittsdatum");
  const ausgewaehlt = ausgewaehlteMitgliedschaftsart();

  if (!ausgewaehlt || !validate.parseDatumInput(eintrittsdatum)) {
    hinweis.hidden = true;
    return;
  }

  const betragInput = document.getElementById(`betrag-${ausgewaehlt.id}`);
  const jahresbeitrag = parseFloat(String(betragInput.value).replace(",", "."));
  const ergebnis = validate.berechneAnteiligenBeitrag(jahresbeitrag, eintrittsdatum, CONFIG.faelligkeitMonat);

  if (!ergebnis) {
    hinweis.hidden = true;
    return;
  }

  const betragText = ergebnis.betrag.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  hinweis.textContent = `Voraussichtlicher anteiliger Erstbeitrag: ca. ${betragText} € für ${ergebnis.monate} volle Monate bis zur nächsten Fälligkeit. Unverbindlich – der Verein rechnet verbindlich ab.`;
  hinweis.hidden = false;
}

function validiereSchritt2() {
  let gueltig = true;
  for (const id of ["vorname", "nachname", "geburtsdatum", "strasse", "plz", "ort", "email", "eintrittsdatum"]) {
    if (!pruefeFeld(id)) gueltig = false;
  }

  if (!document.getElementById("organisation-gruppe").hidden) {
    if (!pruefeFeld("organisation")) gueltig = false;
  }

  aktualisiereMinderjaehrigkeit();
  if (state.minderjaehrig) {
    if (!pruefeFeld("vertreter-name")) gueltig = false;
  }

  return gueltig;
}

/* ---------------------------------------------------------------------- */
/* Schritt 3 – Zahlungsweise                                              */
/* ---------------------------------------------------------------------- */

function ibanFehlertext(reason) {
  switch (reason) {
    case "leer":
      return "Bitte gib eine IBAN ein.";
    case "ungueltige_zeichen":
      return "Die IBAN darf nur Buchstaben und Ziffern enthalten.";
    case "kein_laendercode":
      return "Die IBAN muss mit einem zweistelligen Länderkürzel beginnen.";
    case "unbekanntes_land":
      return "Dieses Länderkürzel wird nicht erkannt. Bitte die IBAN prüfen.";
    case "falsche_laenge":
      return "Die IBAN hat für dieses Land nicht die richtige Länge.";
    case "pruefsumme":
      return "Diese IBAN ist ungültig (Prüfsumme stimmt nicht). Bitte die Ziffern kontrollieren.";
    default:
      return "Diese IBAN ist ungültig.";
  }
}

function aufIbanPruefenReagieren() {
  const roh = wert("iban");
  if (!roh) return;
  const ergebnis = validate.validateIban(roh);
  if (ergebnis.valid) {
    document.getElementById("iban").value = ergebnis.formatted;
    clearFehler("iban");
    document.getElementById("bic-gruppe").hidden = !ergebnis.brauchtBic;
    document.getElementById("bic").required = ergebnis.brauchtBic;
    if (!ergebnis.brauchtBic) clearFehler("bic");
  } else {
    setFehler("iban", ibanFehlertext(ergebnis.reason));
  }
}

/**
 * Verwendungszweck für die Überweisung: Mitglied ist bei einer Förder-
 * mitgliedschaft für Vereine/Unternehmen die Organisation selbst, nicht die
 * unterschreibende Ansprechperson – die muss also im Verwendungszweck
 * stehen, sonst lässt sich die Zahlung auf dem Vereinskonto nicht zuordnen.
 */
function baueVerwendungszweck() {
  const ausgewaehlt = ausgewaehlteMitgliedschaftsart();
  if (ausgewaehlt && ausgewaehlt.brauchtOrganisation) {
    return `Aufnahme ${wert("organisation")}`.trim();
  }
  return `Aufnahme ${wert("vorname")} ${wert("nachname")}`.trim();
}

function aufZahlungsartAuswahlReagieren() {
  const lastschrift = document.getElementById("zahlungsart-lastschrift").checked;
  const ueberweisung = document.getElementById("zahlungsart-ueberweisung").checked;

  document.getElementById("lastschrift-felder").hidden = !lastschrift;
  document.getElementById("ueberweisung-hinweis").hidden = !ueberweisung;

  document.getElementById("kontoinhaber").required = lastschrift;
  document.getElementById("iban").required = lastschrift;
  if (!lastschrift) {
    clearFehler("kontoinhaber");
    clearFehler("iban");
    clearFehler("bic");
  }

  if (ueberweisung) {
    const text = document.getElementById("ueberweisung-text");
    const verwendungszweck = baueVerwendungszweck();
    if (CONFIG.vereinsIban) {
      text.textContent = `Bitte noch nicht überweisen: Wir müssen deinen Beitritt erst prüfen und die Mitgliedschaft bestätigen. Überweise den Beitrag danach – spätestens zum Fälligkeitstag (${CONFIG.faelligkeitText}) – an: ${CONFIG.vereinsname}, IBAN ${validate.formatIban(CONFIG.vereinsIban)}. Verwendungszweck: „${verwendungszweck}“ – ohne diese Angabe können wir die Zahlung nicht zuordnen.`;
    } else {
      text.textContent = `Die Vereins-IBAN wird hier ergänzt, sobald das Vereinskonto eingerichtet ist. Bitte noch nichts überweisen: Wir informieren dich nach Bestätigung deiner Mitgliedschaft rechtzeitig vor der ersten Fälligkeit (${CONFIG.faelligkeitText}). Verwendungszweck dann bitte: „${verwendungszweck}“.`;
    }
  }

  clearFehler("zahlungsart");
}

function validiereSchritt3() {
  const lastschrift = document.getElementById("zahlungsart-lastschrift").checked;
  const ueberweisung = document.getElementById("zahlungsart-ueberweisung").checked;

  if (!lastschrift && !ueberweisung) {
    setFehler("zahlungsart", "Bitte wähle eine Zahlungsweise aus.");
    return false;
  }
  clearFehler("zahlungsart");

  if (!lastschrift) return true;

  let gueltig = true;
  if (!pruefeFeld("kontoinhaber")) gueltig = false;

  const ibanErgebnis = validate.validateIban(wert("iban"));
  if (ibanErgebnis.valid) {
    document.getElementById("iban").value = ibanErgebnis.formatted;
    clearFehler("iban");
    document.getElementById("bic-gruppe").hidden = !ibanErgebnis.brauchtBic;
    document.getElementById("bic").required = ibanErgebnis.brauchtBic;
    if (ibanErgebnis.brauchtBic && !pruefeFeld("bic")) gueltig = false;
  } else {
    setFehler("iban", ibanFehlertext(ibanErgebnis.reason));
    gueltig = false;
  }

  return gueltig;
}

/* ---------------------------------------------------------------------- */
/* Schritt 4 – Erklärungen und Unterschrift                               */
/* ---------------------------------------------------------------------- */

const CHECKBOX_IDS = ["erklaerung-1", "erklaerung-2", "erklaerung-3", "erklaerung-4"];

function befuelleDatenschutzInhalt() {
  const container = document.getElementById("datenschutz-inhalt");
  for (const absatz of datenschutzAbsaetze()) {
    const h4 = document.createElement("h4");
    h4.textContent = absatz.titel;
    const p = document.createElement("p");
    p.textContent = absatz.text;
    container.append(h4, p);
  }
}

function initialisiereSignaturPadFallsNoetig() {
  const canvas = document.getElementById("unterschrift-canvas");
  if (!signaturPad) {
    signaturPad = erstelleUnterschriftenfeld(canvas, {
      onChange: (hatInhalt) => {
        if (hatInhalt) clearFehler("unterschrift");
      }
    });
  }
  requestAnimationFrame(() => signaturPad.ensureSized());
}

function bereiteSchritt4Vor() {
  document.getElementById("link-satzung").href = CONFIG.satzungUrl;
  document.getElementById("link-beitragsordnung").href = CONFIG.beitragsordnungUrl;

  const minderjaehrigHinweis = document.getElementById("unterschrift-hinweis-minderjaehrig");
  const digitalBereich = document.getElementById("unterschrift-digital-bereich");
  const verzichtHinweis = document.getElementById("unterschrift-verzicht-hinweis");

  if (state.minderjaehrig) {
    state.unterschriftModus = "handschriftlich";
    state.unterschriftErzwungen = true;
    minderjaehrigHinweis.hidden = false;
    digitalBereich.hidden = true;
    verzichtHinweis.hidden = true;
    clearFehler("unterschrift");
    return;
  }

  state.unterschriftErzwungen = false;
  minderjaehrigHinweis.hidden = true;

  if (state.unterschriftModus === "handschriftlich") {
    digitalBereich.hidden = true;
    verzichtHinweis.hidden = false;
  } else {
    digitalBereich.hidden = false;
    verzichtHinweis.hidden = true;
    initialisiereSignaturPadFallsNoetig();
  }

  document.getElementById("unterschrift-quer-hinweis").hidden = window.innerWidth >= 500;
}

function validiereSchritt4() {
  let gueltig = true;

  const alleAngehakt = CHECKBOX_IDS.every((id) => document.getElementById(id).checked);
  if (alleAngehakt) {
    clearFehler("erklaerungen");
  } else {
    setFehler("erklaerungen", "Bitte bestätige alle vier Punkte.");
    gueltig = false;
  }

  if (!state.minderjaehrig) {
    const hatUnterschrift =
      state.unterschriftModus === "handschriftlich" || (signaturPad && signaturPad.hasContent());
    if (hatUnterschrift) {
      clearFehler("unterschrift");
    } else {
      setFehler("unterschrift", "Bitte unterschreibe im Feld oder wähle die handschriftliche Alternative.");
      gueltig = false;
    }
  }

  return gueltig;
}

/* ---------------------------------------------------------------------- */
/* PDF erzeugen und Ergebnis anzeigen                                     */
/* ---------------------------------------------------------------------- */

function holeLogoPngBytes() {
  return new Promise((resolve) => {
    const img = document.getElementById("logo-bild");

    function zeichnen() {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        const dataUrl = canvas.toDataURL("image/png");
        resolve(dataUrlZuBytes(dataUrl));
      } catch {
        resolve(null);
      }
    }

    if (img.complete && img.naturalWidth > 0) {
      zeichnen();
    } else {
      img.addEventListener("load", zeichnen, { once: true });
      img.addEventListener("error", () => resolve(null), { once: true });
    }
  });
}

async function pdfErzeugenUndAnzeigen() {
  if (!validiereSchritt4()) {
    const erstesFehlerhafte =
      document.querySelector("#schritt-4 [aria-invalid='true']") ||
      document.getElementById("fehler-erklaerungen");
    if (erstesFehlerhafte && typeof erstesFehlerhafte.focus === "function") erstesFehlerhafte.focus();
    return;
  }

  const button = document.getElementById("pdf-erzeugen-button");
  const urspruenglicherText = button.textContent;
  button.disabled = true;
  button.textContent = "PDF wird erzeugt …";

  try {
    const mitgliedschaft = sammleMitgliedschaft();
    const lastschrift = document.getElementById("zahlungsart-lastschrift").checked;
    const erstellungsdatumIso = validate.heutigesDatumIso();

    const daten = {
      mitgliedschaft: { id: mitgliedschaft.id, label: mitgliedschaft.label, betrag: mitgliedschaft.betrag },
      organisation: mitgliedschaft.brauchtOrganisation ? wert("organisation") : null,
      person: {
        vorname: wert("vorname"),
        nachname: wert("nachname"),
        geburtsdatum: wert("geburtsdatum"),
        strasse: wert("strasse"),
        plz: wert("plz"),
        ort: wert("ort"),
        email: wert("email"),
        telefon: wert("telefon"),
        eintrittsdatum: wert("eintrittsdatum")
      },
      minderjaehrig: state.minderjaehrig,
      vertreterName: state.minderjaehrig ? wert("vertreter-name") : null,
      zahlung: lastschrift
        ? {
            art: "lastschrift",
            kontoinhaber: wert("kontoinhaber"),
            abweichendeAnschrift: wert("abweichende-anschrift"),
            iban: wert("iban"),
            bic: wert("bic"),
            kreditinstitut: wert("kreditinstitut")
          }
        : { art: "ueberweisung", verwendungszweck: baueVerwendungszweck() },
      unterschrift: {
        modus: state.unterschriftModus,
        dataUrl: state.unterschriftModus === "digital" && signaturPad ? signaturPad.toDataUrl() : null
      },
      erstellungsdatumIso,
      logoPngBytes: await holeLogoPngBytes()
    };

    const { bytes, dateiname } = await erzeugeBeitrittsPdf(daten);
    zeigeErgebnis(bytes, dateiname, daten);
  } catch (fehler) {
    console.error(fehler);
    setFehler("unterschrift", "Beim Erzeugen des PDF ist ein Fehler aufgetreten. Bitte versuche es erneut.");
  } finally {
    button.disabled = false;
    button.textContent = urspruenglicherText;
  }
}

/**
 * Web-Share-API mit Datei-Unterstützung (Level 2): Auf Geräten, die es
 * anbieten (v. a. Smartphones), übergibt das direkt an die App-Auswahl des
 * Betriebssystems – inklusive PDF als fertigem Anhang, kein manuelles
 * Herunterladen und wieder-Anhängen nötig. Der Empfänger lässt sich darüber
 * nicht vorbelegen (die Web-Share-API kennt kein Empfängerfeld), deshalb
 * bleibt die Adresse zusätzlich im Hinweistext daneben stehen. Auf Desktop-
 * Browsern i. d. R. nicht verfügbar – dort bleibt es beim Download+Anhängen.
 */
function teilenVorbereiten(bytes, dateiname) {
  const button = document.getElementById("teilen-button");
  const hinweis = document.getElementById("teilen-hinweis");

  let datei = null;
  try {
    datei = new File([bytes], dateiname, { type: "application/pdf" });
  } catch {
    datei = null;
  }

  const kannTeilen = !!(datei && navigator.canShare && navigator.canShare({ files: [datei] }));
  button.hidden = !kannTeilen;
  hinweis.hidden = !kannTeilen;
  if (!kannTeilen) return;

  button.onclick = async () => {
    try {
      await navigator.share({
        files: [datei],
        title: "Beitrittserklärung OpenZirndorf",
        text: `Beitrittserklärung – bitte an ${CONFIG.antragEmail} senden.`
      });
    } catch (fehler) {
      if (fehler && fehler.name !== "AbortError") console.error(fehler);
    }
  };
}

function zeigeErgebnis(bytes, dateiname, daten) {
  if (state.pdfUrl) URL.revokeObjectURL(state.pdfUrl);
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  state.pdfUrl = url;

  const downloadLink = document.getElementById("pdf-download-link");
  downloadLink.href = url;
  downloadLink.download = dateiname;

  const oeffnenLink = document.getElementById("pdf-oeffnen-link");
  oeffnenLink.href = url;

  teilenVorbereiten(bytes, dateiname);

  document.getElementById("ergebnis-status").textContent = `Deine Beitrittserklärung wurde erstellt: ${dateiname}`;

  document.getElementById("ergebnis-unterschrift-hinweis").textContent =
    daten.unterschrift.modus !== "handschriftlich"
      ? "PDF ausdrucken oder digital archivieren – die Unterschrift ist bereits enthalten."
      : daten.minderjaehrig
        ? "Ausdrucken und handschriftlich unterschreiben – von Mitglied und gesetzlicher Vertretung."
        : "Ausdrucken und handschriftlich unterschreiben.";

  zeigeSchritt("ergebnis");
}

function formularZuruecksetzen() {
  if (state.pdfUrl) {
    URL.revokeObjectURL(state.pdfUrl);
    state.pdfUrl = null;
  }
  formular.reset();
  if (signaturPad) signaturPad.clear();

  state.unterschriftModus = "digital";
  state.unterschriftErzwungen = false;
  state.minderjaehrig = false;
  formBeruehrt = false;

  document.querySelectorAll(".feld-fehler").forEach((el) => {
    el.hidden = true;
    el.textContent = "";
  });
  document.querySelectorAll("[aria-invalid]").forEach((el) => el.removeAttribute("aria-invalid"));

  document.getElementById("minderjaehrig-hinweis").hidden = true;
  document.getElementById("lastschrift-felder").hidden = true;
  document.getElementById("ueberweisung-hinweis").hidden = true;
  document.getElementById("bic-gruppe").hidden = true;
  document.getElementById("anteiliger-beitrag-hinweis").hidden = true;

  aufMitgliedschaftAuswahlReagieren();
  zeigeSchritt(1);
}

/* ---------------------------------------------------------------------- */
/* Schrittwechsel                                                         */
/* ---------------------------------------------------------------------- */

const SCHRITT_LABELS = {
  1: "Schritt 1 von 4 – Art der Mitgliedschaft",
  2: "Schritt 2 von 4 – Angaben zur Person",
  3: "Schritt 3 von 4 – Zahlungsweise",
  4: "Schritt 4 von 4 – Erklärungen und Unterschrift",
  ergebnis: "Erledigt"
};

function zeigeSchritt(ziel) {
  document.querySelectorAll(".schritt").forEach((el) => {
    el.hidden = true;
  });
  const zielEl = document.getElementById(ziel === "ergebnis" ? "schritt-ergebnis" : `schritt-${ziel}`);
  zielEl.hidden = false;
  state.step = ziel;

  document.getElementById("fortschritt-balken").value = ziel === "ergebnis" ? 4 : ziel;
  document.getElementById("fortschritt-text").textContent = SCHRITT_LABELS[ziel];

  if (ziel === 4) bereiteSchritt4Vor();

  const ueberschrift = zielEl.querySelector("h2");
  if (ueberschrift) {
    requestAnimationFrame(() => {
      ueberschrift.focus();
      ueberschrift.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }
}

const SCHRITT_VALIDIERER = { 1: validiereSchritt1, 2: validiereSchritt2, 3: validiereSchritt3 };

function aufWeiterKlickReagieren(schrittNr) {
  const validierer = SCHRITT_VALIDIERER[schrittNr];
  if (validierer && !validierer()) {
    const erstesFehlerhafte = document.querySelector(`#schritt-${schrittNr} [aria-invalid="true"]`);
    if (erstesFehlerhafte) erstesFehlerhafte.focus();
    return;
  }
  zeigeSchritt(schrittNr + 1);
}

/* ---------------------------------------------------------------------- */
/* Initialisierung                                                        */
/* ---------------------------------------------------------------------- */

function init() {
  rendereMitgliedschaftOptionen();
  aufMitgliedschaftAuswahlReagieren();

  document.getElementById("eintrittsdatum").min = validate.heutigesDatumIso();
  document.getElementById("postanschrift").textContent = CONFIG.postanschrift;
  const emailLink = document.getElementById("antrag-email-link");
  emailLink.href = `mailto:${CONFIG.antragEmail}`;
  emailLink.textContent = CONFIG.antragEmail;
  document.getElementById("teilen-hinweis-email").textContent = CONFIG.antragEmail;
  befuelleDatenschutzInhalt();

  Object.keys(FELD_VALIDIERUNG).forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("blur", () => pruefeFeld(id));
  });

  document.getElementById("geburtsdatum").addEventListener("change", aktualisiereMinderjaehrigkeit);
  document.getElementById("eintrittsdatum").addEventListener("change", () => {
    aktualisiereMinderjaehrigkeit();
    aktualisiereAnteiligenBeitrag();
  });

  document.getElementById("zahlungsart-lastschrift").addEventListener("change", aufZahlungsartAuswahlReagieren);
  document.getElementById("zahlungsart-ueberweisung").addEventListener("change", aufZahlungsartAuswahlReagieren);
  document.getElementById("iban").addEventListener("blur", aufIbanPruefenReagieren);

  document.getElementById("unterschrift-loeschen").addEventListener("click", () => {
    if (signaturPad) signaturPad.clear();
  });

  document.getElementById("unterschrift-verzicht").addEventListener("click", () => {
    state.unterschriftModus = "handschriftlich";
    document.getElementById("unterschrift-digital-bereich").hidden = true;
    document.getElementById("unterschrift-verzicht-hinweis").hidden = false;
    clearFehler("unterschrift");
  });

  document.getElementById("unterschrift-zurueck-zu-digital").addEventListener("click", () => {
    state.unterschriftModus = "digital";
    document.getElementById("unterschrift-verzicht-hinweis").hidden = true;
    document.getElementById("unterschrift-digital-bereich").hidden = false;
    initialisiereSignaturPadFallsNoetig();
  });

  document.getElementById("datenschutz-oeffnen-button").addEventListener("click", () => {
    const details = document.getElementById("datenschutz-details");
    details.open = true;
    details.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  document.getElementById("pdf-erzeugen-button").addEventListener("click", pdfErzeugenUndAnzeigen);
  document.getElementById("neue-erklaerung-button").addEventListener("click", formularZuruecksetzen);

  formular.addEventListener("click", (evt) => {
    const weiterBtn = evt.target.closest("[data-weiter]");
    if (weiterBtn) {
      evt.preventDefault();
      aufWeiterKlickReagieren(state.step);
      return;
    }
    const zurueckBtn = evt.target.closest("[data-zurueck]");
    if (zurueckBtn) {
      evt.preventDefault();
      zeigeSchritt(state.step - 1);
    }
  });

  // Sicherheitsnetz: Es darf nie zu einer echten Formularübermittlung kommen.
  formular.addEventListener("submit", (evt) => evt.preventDefault());

  formular.addEventListener("input", () => {
    formBeruehrt = true;
  });
  formular.addEventListener("change", () => {
    formBeruehrt = true;
  });
  window.addEventListener("beforeunload", (evt) => {
    if (formBeruehrt) {
      evt.preventDefault();
      evt.returnValue = "";
    }
  });

  zeigeSchritt(1);
}

document.addEventListener("DOMContentLoaded", init);
