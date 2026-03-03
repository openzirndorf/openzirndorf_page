# OpenZirndorf – Webseite

Statische Webseite der [OpenZirndorf](https://openzirndorf.de/)-Initiative.
Entwickelt mit purem HTML, CSS und JavaScript – kein Build-Schritt, kein Framework.

---

## Lokal starten

```bash
python -m http.server 8000
```

Dann im Browser: `http://localhost:8000`

---

## Inhalte pflegen

### Termine

Termine werden aus [`data/termine.md`](data/termine.md) geladen. Neuen Termin einfach hinzufügen:

```markdown
## Titel des Termins
Datum: Mi, 25. März 2026
Zeit: 19:30 Uhr
Ort: Veranstaltungsort, Zirndorf
Link: https://... (optional)
```

### Maskottchen

Maskottchen-Einträge stehen in [`data/maskottchen.json`](data/maskottchen.json).
Bilddateien ablegen unter: `static/media/maskottchen/<dateiname>.png`

```json
[
  {
    "datei": "name.png",
    "name": "Anzeigename",
    "beschreibungstext": "Kurze Beschreibung des Maskottchens."
  }
]
```

### Logo

| Datei | Pfad |
|-------|------|
| Logo (Vektor) | `static/media/logo.svg` |
| Logo (Bitmap) | `static/media/logo.png` |

---

## Lizenz

Der **Quellcode** (HTML, CSS, JavaScript, Datendateien) steht unter der [MIT-Lizenz](LICENSE).
**Bilder, Logos und Maskottchen** sind urheberrechtlich geschützt – alle Rechte vorbehalten.
Details: [LICENSE](LICENSE)
