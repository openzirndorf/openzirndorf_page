// Erzeugt die Beitrittserklärung (und ggf. das SEPA-Mandat) als PDF, komplett
// im Browser mit pdf-lib. Keine Template-Datei – der gesamte Aufbau steht
// hier im Code und liegt damit versioniert im Repo.
//
// pdf-lib liegt lokal unter vendor/pdf-lib.min.js und wird als normales
// <script> vor diesem Modul geladen; es stellt sich selbst als globales
// window.PDFLib bereit.

import { CONFIG } from "./config.js";
import { formatIban, baueDateinamen } from "./validate.js";

const MM = 2.8346456693; // 1 mm in PDF-Punkten
const RAND = 20 * MM;
const SEITENBREITE = 595.28; // A4 hoch, Punkte
const SEITENHOEHE = 841.89;
const MAX_BREITE = SEITENBREITE - RAND * 2;

const GRUEN = rgbFarbe(0, 154, 0);
const DUNKEL = rgbFarbe(31, 41, 55);
const GRAU = rgbFarbe(107, 114, 128);
const LINIENGRAU = rgbFarbe(209, 213, 219);

function rgbFarbe(r, g, b) {
  return { r: r / 255, g: g / 255, b: b / 255 };
}

function toRgb(f) {
  return window.PDFLib.rgb(f.r, f.g, f.b);
}

function formatEuro(betrag) {
  return (
    betrag.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €"
  );
}

function formatDatumDe(iso) {
  if (!iso) return "";
  const [j, m, t] = iso.split("-");
  return `${t}.${m}.${j}`;
}

export function dataUrlZuBytes(dataUrl) {
  const base64 = dataUrl.split(",")[1];
  const binaer = atob(base64);
  const bytes = new Uint8Array(binaer.length);
  for (let i = 0; i < binaer.length; i++) bytes[i] = binaer.charCodeAt(i);
  return bytes;
}

function zeileUmbrechen(text, font, groesse, maxBreite) {
  const woerter = String(text).split(/\s+/).filter(Boolean);
  const zeilen = [];
  let aktuelle = "";
  for (const wort of woerter) {
    const kandidat = aktuelle ? `${aktuelle} ${wort}` : wort;
    if (font.widthOfTextAtSize(kandidat, groesse) > maxBreite && aktuelle) {
      zeilen.push(aktuelle);
      aktuelle = wort;
    } else {
      aktuelle = kandidat;
    }
  }
  if (aktuelle) zeilen.push(aktuelle);
  return zeilen;
}

/** Kleiner Textfluss-Helfer, der sich den aktuellen y-Wert auf einer Seite merkt. */
function erstelleSchreiber(page, schriften) {
  let y = SEITENHOEHE - RAND;
  return {
    aktuellesY() {
      return y;
    },
    kopfzeile(logoImage) {
      if (logoImage) {
        const groesse = 26;
        page.drawImage(logoImage, { x: RAND, y: y - groesse, width: groesse, height: groesse });
        page.drawText("OpenZirndorf", {
          x: RAND + groesse + 10,
          y: y - groesse / 2 - 5,
          size: 15,
          font: schriften.bold,
          color: toRgb(DUNKEL)
        });
        page.drawText("Verein in Gründung · Zirndorf", {
          x: RAND + groesse + 10,
          y: y - groesse / 2 - 18,
          size: 8.5,
          font: schriften.normal,
          color: toRgb(GRAU)
        });
        y -= groesse + 16;
      } else {
        page.drawText("OpenZirndorf", { x: RAND, y: y - 15, size: 15, font: schriften.bold, color: toRgb(DUNKEL) });
        page.drawText("Verein in Gründung · Zirndorf", {
          x: RAND,
          y: y - 28,
          size: 8.5,
          font: schriften.normal,
          color: toRgb(GRAU)
        });
        y -= 42;
      }
    },
    titel(text) {
      page.drawText(text, { x: RAND, y: y - 20, size: 18, font: schriften.bold, color: toRgb(DUNKEL) });
      y -= 34;
    },
    blockTitel(text) {
      y -= 4;
      page.drawText(text, { x: RAND, y: y - 12, size: 11.5, font: schriften.bold, color: toRgb(GRUEN) });
      y -= 18;
    },
    feld(label, wert) {
      if (!wert) return;
      const labelBreite = 150;
      page.drawText(label, { x: RAND, y: y - 10.5, size: 9.5, font: schriften.normal, color: toRgb(GRAU) });
      const zeilen = zeileUmbrechen(wert, schriften.normal, 10.5, MAX_BREITE - labelBreite);
      zeilen.forEach((zeile, i) => {
        page.drawText(zeile, {
          x: RAND + labelBreite,
          y: y - 10.5 - i * 13,
          size: 10.5,
          font: schriften.normal,
          color: toRgb(DUNKEL)
        });
      });
      y -= Math.max(15, zeilen.length * 13 + 2);
    },
    absatz(text, groesse = 9.3, zeilenabstand = 12.5) {
      const zeilen = zeileUmbrechen(text, schriften.normal, groesse, MAX_BREITE);
      for (const zeile of zeilen) {
        page.drawText(zeile, { x: RAND, y: y - groesse, size: groesse, font: schriften.normal, color: toRgb(DUNKEL) });
        y -= zeilenabstand;
      }
    },
    nummerierterAbsatz(nummer, text, groesse = 9.3, zeilenabstand = 12.5) {
      const einzug = 16;
      page.drawText(`${nummer}.`, { x: RAND, y: y - groesse, size: groesse, font: schriften.bold, color: toRgb(DUNKEL) });
      const zeilen = zeileUmbrechen(text, schriften.normal, groesse, MAX_BREITE - einzug);
      zeilen.forEach((zeile, i) => {
        page.drawText(zeile, {
          x: RAND + einzug,
          y: y - groesse - i * zeilenabstand,
          size: groesse,
          font: schriften.normal,
          color: toRgb(DUNKEL)
        });
      });
      y -= zeilen.length * zeilenabstand + 4;
    },
    abstand(px) {
      y -= px;
    },
    linie() {
      page.drawLine({
        start: { x: RAND, y },
        end: { x: SEITENBREITE - RAND, y },
        thickness: 0.75,
        color: toRgb(LINIENGRAU)
      });
      y -= 14;
    },
    async unterschriftsblock({ ortWert, datumWert, unterschriftBild, zweiLeereZeilen }) {
      const hoeheBlock = 130;
      if (y < RAND + hoeheBlock) {
        y = RAND + hoeheBlock; // sollte im Normalfall nicht eintreten
      }
      y -= 10;

      if (zweiLeereZeilen) {
        page.drawLine({ start: { x: RAND, y }, end: { x: RAND + 220, y }, thickness: 0.75, color: toRgb(DUNKEL) });
        page.drawText("Unterschrift des Mitglieds", { x: RAND, y: y - 12, size: 8, font: schriften.normal, color: toRgb(GRAU) });

        page.drawLine({
          start: { x: SEITENBREITE - RAND - 220, y },
          end: { x: SEITENBREITE - RAND, y },
          thickness: 0.75,
          color: toRgb(DUNKEL)
        });
        page.drawText("Unterschrift des/der gesetzlichen Vertreter:in", {
          x: SEITENBREITE - RAND - 220,
          y: y - 12,
          size: 8,
          font: schriften.normal,
          color: toRgb(GRAU)
        });
        y -= 30;
      } else if (unterschriftBild) {
        const maxBreiteBild = 200;
        const maxHoeheBild = 60;
        const skala = Math.min(maxBreiteBild / unterschriftBild.width, maxHoeheBild / unterschriftBild.height, 1);
        const breite = unterschriftBild.width * skala;
        const hoehe = unterschriftBild.height * skala;
        // drawImage zeichnet von der Unterkante nach oben – den Platz dafür
        // erst reservieren, sonst ragt das Bild in den Text darüber hinein.
        y -= hoehe;
        page.drawImage(unterschriftBild, { x: RAND, y, width: breite, height: hoehe });
        page.drawLine({ start: { x: RAND, y }, end: { x: RAND + 220, y }, thickness: 0.75, color: toRgb(DUNKEL) });
        page.drawText("Unterschrift", { x: RAND, y: y - 12, size: 8, font: schriften.normal, color: toRgb(GRAU) });
        y -= 30;
      } else {
        page.drawLine({ start: { x: RAND, y }, end: { x: RAND + 220, y }, thickness: 0.75, color: toRgb(DUNKEL) });
        page.drawText("Unterschrift", { x: RAND, y: y - 12, size: 8, font: schriften.normal, color: toRgb(GRAU) });
        y -= 30;
      }

      page.drawText(`${ortWert}, ${formatDatumDe(datumWert)}`, {
        x: RAND,
        y,
        size: 9.5,
        font: schriften.normal,
        color: toRgb(DUNKEL)
      });
      page.drawText("Ort, Datum", { x: RAND, y: y - 12, size: 8, font: schriften.normal, color: toRgb(GRAU) });
    }
  };
}

const ERKLAERUNGEN_TEXTE = [
  "Ich beantrage die Aufnahme in OpenZirndorf i. G. und erkenne die Satzung sowie die Beitragsordnung des Vereins in ihrer jeweils gültigen Fassung an.",
  "Mir ist bekannt, dass der Verein nicht im Vereinsregister eingetragen ist und über die Anerkennung als gemeinnützig noch nicht entschieden wurde. Beiträge sind derzeit steuerlich nicht als Spende abziehbar; Zuwendungsbestätigungen können nicht ausgestellt werden.",
  "Bei einem Austritt im laufenden Jahr erfolgt keine Erstattung bereits gezahlter Beiträge. Kosten einer selbst verschuldeten Rücklastschrift trage ich.",
  "Ich habe die Datenschutzhinweise auf Seite 3 dieser Erklärung zur Kenntnis genommen."
];

const SEPA_AUTORISIERUNG_1 =
  `Ich ermächtige ${CONFIG.vereinsname}, Zahlungen von meinem Konto mittels Lastschrift einzuziehen. ` +
  `Zugleich weise ich mein Kreditinstitut an, die von ${CONFIG.vereinsname} auf mein Konto gezogenen Lastschriften einzulösen.`;

const SEPA_AUTORISIERUNG_2 =
  "Hinweis: Ich kann innerhalb von acht Wochen, beginnend mit dem Belastungsdatum, die Erstattung des belasteten Betrages verlangen. Es gelten dabei die mit meinem Kreditinstitut vereinbarten Bedingungen.";

export function datenschutzAbsaetze() {
  return [
    { titel: "Verantwortlicher", text: `${CONFIG.vereinsname}, ${CONFIG.anschrift}, erreichbar unter ${CONFIG.email}.` },
    {
      titel: "Verarbeitung auf dieser Seite",
      text:
        "Die Eingaben in dieses Formular verarbeitet ausschließlich Ihr eigenes Gerät. Es werden keine Daten an den Verein oder an Dritte übertragen. Das erzeugte PDF entsteht in Ihrem Browser. Der Verein erhält Ihre Daten erst, wenn Sie das PDF selbst übermitteln."
    },
    {
      titel: "Verarbeitung nach dem Beitritt",
      text:
        "Wir verarbeiten die angegebenen Daten zur Begründung und Verwaltung der Mitgliedschaft sowie zum Beitragseinzug. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO, für steuer- und handelsrechtliche Aufbewahrungspflichten Art. 6 Abs. 1 lit. c DSGVO."
    },
    {
      titel: "Empfänger",
      text:
        "Kontodaten werden ausschließlich zur Durchführung des Lastschriftverfahrens an unser Kreditinstitut übermittelt. Eingereichte Beitrittserklärungen und SEPA-Mandate legen wir in unserer eigenen Datenverwaltung ab, für die wir auf den Anbieter Hetzner zurückgreifen (Auftragsverarbeiter mit Vertrag nach Art. 28 DSGVO). Eine weitergehende Weitergabe findet nicht statt."
    },
    {
      titel: "Speicherdauer",
      text:
        "Für die Dauer der Mitgliedschaft. Danach Löschung, soweit keine gesetzlichen Aufbewahrungsfristen entgegenstehen. SEPA-Mandate werden nach dem letzten Einzug mindestens vierzehn Monate aufbewahrt, beitragsbezogene Unterlagen nach den steuerlichen Fristen."
    },
    {
      titel: "Ihre Rechte",
      text:
        "Auskunft (Art. 15), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung (Art. 18), Datenübertragbarkeit (Art. 20) sowie Beschwerde bei der Aufsichtsbehörde: Bayerisches Landesamt für Datenschutzaufsicht, Ansbach."
    }
  ];
}

async function seiteEins(pdfDoc, schriften, logoImage, daten) {
  const page = pdfDoc.addPage([SEITENBREITE, SEITENHOEHE]);
  const s = erstelleSchreiber(page, schriften);

  s.kopfzeile(logoImage);
  s.titel("Beitrittserklärung");

  s.blockTitel("Angaben zur Person");
  s.feld("Name:", `${daten.person.vorname} ${daten.person.nachname}`);
  s.feld(
    daten.organisation ? "Geburtsdatum Ansprechperson:" : "Geburtsdatum:",
    formatDatumDe(daten.person.geburtsdatum)
  );
  s.feld("Anschrift:", `${daten.person.strasse}, ${daten.person.plz} ${daten.person.ort}`);
  s.feld("E-Mail:", daten.person.email);
  if (daten.person.telefon) s.feld("Telefon:", daten.person.telefon);
  if (daten.organisation) s.feld("Organisation/Unternehmen:", daten.organisation);
  s.feld("Gewünschtes Eintrittsdatum:", formatDatumDe(daten.person.eintrittsdatum));
  if (daten.minderjaehrig && daten.vertreterName) {
    s.feld("Gesetzliche:r Vertreter:in:", daten.vertreterName);
  }
  s.abstand(6);

  s.blockTitel("Art der Mitgliedschaft und Beitrag");
  s.feld("Mitgliedschaft:", daten.mitgliedschaft.label);
  s.feld("Jährlicher Beitrag:", formatEuro(daten.mitgliedschaft.betrag));
  s.feld("Fälligkeit:", `jährlich zum ${CONFIG.faelligkeitText}`);
  s.absatz(
    "Der Beitrag für das erste Jahr wird anteilig nach den vollen verbleibenden Monaten ab dem Eintrittsdatum berechnet (§ 3 Abs. 2 der Beitragsordnung). Der Verein teilt den genauen Betrag gesondert mit."
  );
  s.abstand(6);

  s.blockTitel("Zahlungsweise");
  if (daten.zahlung.art === "lastschrift") {
    s.absatz("SEPA-Lastschrift. Das zugehörige Mandat befindet sich auf der nächsten Seite dieser Erklärung.");
  } else {
    s.absatz(
      `Überweisung. Bitte noch nicht überweisen: Der Beitrag wird erst fällig, nachdem der Verein die Mitgliedschaft bestätigt hat – spätestens zum Fälligkeitstag (${CONFIG.faelligkeitText}) dann ohne weitere Aufforderung auf das Konto des Vereins. Verwendungszweck: „${daten.zahlung.verwendungszweck}“.`
    );
  }
  s.abstand(6);

  s.blockTitel("Erklärungen");
  ERKLAERUNGEN_TEXTE.forEach((text, i) => s.nummerierterAbsatz(i + 1, text));

  await s.unterschriftsblock({
    ortWert: daten.person.ort,
    datumWert: daten.erstellungsdatumIso,
    unterschriftBild: daten.unterschrift.modus === "digital" ? daten.unterschrift.eingebettetesBild : null,
    zweiLeereZeilen: daten.unterschrift.modus === "handschriftlich"
  });

  return page;
}

async function seiteZweiSepa(pdfDoc, schriften, daten) {
  const page = pdfDoc.addPage([SEITENBREITE, SEITENHOEHE]);
  const s = erstelleSchreiber(page, schriften);

  s.titel("SEPA-Lastschriftmandat");

  s.blockTitel("Zahlungsempfänger");
  s.feld("Name:", CONFIG.vereinsname);
  s.feld("Anschrift:", CONFIG.anschrift);
  s.feld("Gläubiger-ID:", CONFIG.glaeubigerId);
  s.feld("Mandatsreferenz:", "wird gesondert mitgeteilt");
  s.feld("Zahlungsart:", "Wiederkehrende Zahlung");
  s.abstand(6);

  s.absatz(SEPA_AUTORISIERUNG_1);
  s.abstand(4);
  s.absatz(SEPA_AUTORISIERUNG_2);
  s.abstand(10);

  s.blockTitel("Kontodaten");
  s.feld("Kontoinhaber:in:", daten.zahlung.kontoinhaber);
  if (daten.zahlung.abweichendeAnschrift) {
    s.feld("Anschrift Kontoinhaber:in:", daten.zahlung.abweichendeAnschrift);
  }
  s.feld("IBAN:", formatIban(daten.zahlung.iban));
  if (daten.zahlung.bic) s.feld("BIC:", daten.zahlung.bic);
  if (daten.zahlung.kreditinstitut) s.feld("Kreditinstitut:", daten.zahlung.kreditinstitut);
  s.abstand(10);

  s.absatz(
    `Der Einzug erfolgt jährlich zum ${CONFIG.faelligkeitText}. Ich werde über den Einzug spätestens fünf Kalendertage vor Fälligkeit informiert (Vorabankündigung), auch per E-Mail. Bei gleichbleibendem Betrag gilt diese Vorabankündigung auch für alle künftigen Einzüge.`
  );

  await s.unterschriftsblock({
    ortWert: daten.person.ort,
    datumWert: daten.erstellungsdatumIso,
    unterschriftBild: daten.unterschrift.modus === "digital" ? daten.unterschrift.eingebettetesBild : null,
    zweiLeereZeilen: daten.unterschrift.modus === "handschriftlich"
  });

  return page;
}

async function seiteDatenschutzUndIntern(pdfDoc, schriften) {
  const page = pdfDoc.addPage([SEITENBREITE, SEITENHOEHE]);
  const s = erstelleSchreiber(page, schriften);

  s.titel("Datenschutzhinweise");

  for (const absatz of datenschutzAbsaetze()) {
    s.blockTitel(absatz.titel);
    s.absatz(absatz.text);
    s.abstand(4);
  }

  s.abstand(14);
  s.linie();
  s.blockTitel("Nur vom Verein auszufüllen");

  const felder = ["Mitgliedsnummer", "Mandatsreferenz", "Datum des Vorstandsbeschlusses", "Anteiliger Beitrag"];
  const font = schriften.normal;
  let y = s.aktuellesY();
  for (const label of felder) {
    page.drawText(`${label}:`, { x: RAND, y: y - 10, size: 9.5, font, color: toRgb(GRAU) });
    page.drawLine({
      start: { x: RAND + 170, y: y - 10 },
      end: { x: SEITENBREITE - RAND, y: y - 10 },
      thickness: 0.75,
      color: toRgb(LINIENGRAU)
    });
    y -= 26;
  }

  return page;
}

/**
 * Baut das vollständige Beitritts-PDF aus den gesammelten Formulardaten.
 *
 * @param {object} daten – siehe app.js für die genaue Form. Enthält u. a.
 *   person, mitgliedschaft, organisation, minderjaehrig, vertreterName,
 *   zahlung, unterschrift ({ modus: 'digital'|'handschriftlich', dataUrl }),
 *   erstellungsdatumIso, logoPngBytes (optional, Uint8Array).
 */
export async function erzeugeBeitrittsPdf(daten) {
  const { PDFDocument, StandardFonts } = window.PDFLib;
  const pdfDoc = await PDFDocument.create();

  pdfDoc.setTitle(`Beitrittserklärung ${daten.person.vorname} ${daten.person.nachname}`);
  pdfDoc.setAuthor(CONFIG.vereinsname);
  pdfDoc.setSubject("Beitrittserklärung und ggf. SEPA-Lastschriftmandat");
  pdfDoc.setCreator(CONFIG.vereinsname);
  pdfDoc.setProducer(CONFIG.vereinsname);

  const schriften = {
    normal: await pdfDoc.embedFont(StandardFonts.Helvetica),
    bold: await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  };

  const logoImage = daten.logoPngBytes ? await pdfDoc.embedPng(daten.logoPngBytes) : null;

  const unterschrift = { ...daten.unterschrift };
  if (unterschrift.modus === "digital" && unterschrift.dataUrl) {
    const bytes = dataUrlZuBytes(unterschrift.dataUrl);
    unterschrift.eingebettetesBild = await pdfDoc.embedPng(bytes);
  }

  const vollstaendigeDaten = { ...daten, unterschrift };

  await seiteEins(pdfDoc, schriften, logoImage, vollstaendigeDaten);
  if (daten.zahlung.art === "lastschrift") {
    await seiteZweiSepa(pdfDoc, schriften, vollstaendigeDaten);
  }
  await seiteDatenschutzUndIntern(pdfDoc, schriften);

  const bytes = await pdfDoc.save();
  const dateiname = baueDateinamen(daten.person.nachname, daten.person.vorname, daten.erstellungsdatumIso);

  return { bytes, dateiname };
}
