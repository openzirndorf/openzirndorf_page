// Erzeugt die leere Beitrittserklärung zum Ausdrucken unter
// static/docs/beitrittserklaerung-zum-ausdrucken.pdf – mit demselben Code
// wie das Online-Formular (beitritt/js/pdf.js).
//
// Aufruf (Node ≥ 22): node scripts/erzeuge-blanko-pdf.mjs
// Nach jeder Änderung an Erklärungstexten, Beiträgen oder Vereinsdaten
// erneut ausführen und das PDF mit committen.

import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";

const require = createRequire(import.meta.url);
globalThis.window = { PDFLib: require("../beitritt/vendor/pdf-lib.min.js") };

const { erzeugeLeeresBeitrittsPdf } = await import("../beitritt/js/pdf.js");

const ziel = new URL("../static/docs/beitrittserklaerung-zum-ausdrucken.pdf", import.meta.url);
const logoPngBytes = await readFile(new URL("../beitritt/assets/logo.png", import.meta.url));
const bytes = await erzeugeLeeresBeitrittsPdf({ logoPngBytes });
await writeFile(ziel, bytes);
console.log(`geschrieben: ${ziel.pathname} (${bytes.length} Byte)`);
