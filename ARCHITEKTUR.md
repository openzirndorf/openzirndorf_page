# OpenZirndorf – Architekturübersicht

Dieses Dokument erklärt, wie die OpenZirndorf-Repos zusammenhängen
und wie eine neue App ins bestehende System eingebunden wird.

---

## Überblick: Die drei Kern-Repos

```
┌─────────────────────────────────────────────────────────────┐
│              openzirndorf_page  (openzirndorf.de)            │
│                                                              │
│  • Hauptwebseite der Initiative                              │
│  • Quelle für Logo und Maskottchen-Bilder                    │
│  • Footer- und Impressum-Vorlage für alle anderen Repos      │
└──────────────────────┬──────────────────────────────────────┘
                       │  verlinkt auf ↓
┌──────────────────────▼──────────────────────────────────────┐
│           openzirndorf-portal  (portal.openzirndorf.de)      │
│                                                              │
│  • Verzeichnis aller digitalen Angebote (apps.json)          │
│  • Stellt gemeinsame Design-Tokens als CDN bereit            │
│  • Enthält das offizielle Impressum                          │
└──────────────────────┬──────────────────────────────────────┘
                       │  listet auf ↓
┌──────────────────────▼──────────────────────────────────────┐
│        Sub-Apps  (z.B. garagenflohmarkt, ideenbörse, …)      │
│                                                              │
│  • Eigenständige Apps mit eigener URL                        │
│  • Laden Ressourcen von page + portal                        │
│  • Verweisen für Impressum auf das Portal                    │
└─────────────────────────────────────────────────────────────┘
```

---

## Was jedes Repo bereitstellt

### openzirndorf_page
Das "Stamm-Repo". Andere Repos referenzieren Assets direkt von hier.

| Ressource | URL |
|-----------|-----|
| Logo | `https://openzirndorf.de/static/media/logo.png` |
| Maskottchen | `https://openzirndorf.de/static/media/maskottchen/<name>.png` |
| Favicon | lokal in jedem Repo |

### openzirndorf-portal
Das "Hub-Repo". Stellt Design-Tokens als CDN-Stylesheet bereit.

| Ressource | URL |
|-----------|-----|
| Design Tokens (CSS-Variablen) | `https://portal.openzirndorf.de/theme.css` |
| App-Verzeichnis | `https://portal.openzirndorf.de/` |
| Impressum | `https://portal.openzirndorf.de/#impressum` |

### Sub-Apps
Jede App ist ein eigenständiges Repo. Sie referenzieren:
- Logo von `openzirndorf.de`
- Design Tokens von `portal.openzirndorf.de/theme.css`
- Impressum-Link auf `portal.openzirndorf.de/#impressum`

---

## Geteilte Ressourcen im Detail

### Design Tokens (`theme.css`)
Alle `--oz-*` CSS-Variablen kommen aus dem Portal und gelten für alle Apps:

```css
/* In der style.css / index.html jeder Sub-App: */
@import url("https://portal.openzirndorf.de/theme.css");
```

Enthält: Farben (`--oz-green`, …), Schriften (`--oz-font-heading`, …),
Abstände, Schatten, Radien, Header-Höhe.

### Logo
```html
<!-- HTML -->
<img src="https://openzirndorf.de/static/media/logo.png" alt="OpenZirndorf" />
```
```tsx
// React
<img src="https://openzirndorf.de/static/media/logo.png" alt="OpenZirndorf" width={28} height={28} />
```

### Impressum
Keine eigene Impressum-Seite nötig – einfach auf das Portal verlinken:
```
https://portal.openzirndorf.de/#impressum
```

---

## Neue App einbinden – Schritt für Schritt

### Schritt 1 – App entwickeln

Entwickle die App in einem eigenen Repo. Binde von Anfang an die
geteilten Ressourcen ein:

**`index.html` (falls kein Build-Schritt):**
```html
<link rel="stylesheet" href="https://portal.openzirndorf.de/theme.css" />
```

**`style.css` (falls React/Vite):**
```css
@import url("https://portal.openzirndorf.de/theme.css");
```

**Logo im Header:**
```tsx
<img src="https://openzirndorf.de/static/media/logo.png" width={28} height={28} />
```

**Footer (minimale Variante):**
```tsx
<footer>
  <a href="https://portal.openzirndorf.de/">Ein OpenZirndorf-Projekt</a>
  ·
  <a href="https://portal.openzirndorf.de/#impressum">Impressum</a>
  <p>Entwickelt mit ❤️ in Zirndorf</p>
</footer>
```

**Verfügbare CSS-Variablen:**

| Variable | Wert | Verwendung |
|----------|------|------------|
| `--oz-green` | `#009a00` | Primärfarbe, Links, Buttons |
| `--oz-text` | `#1f2937` | Fließtext |
| `--oz-text-muted` | `#6b7280` | Sekundärtext |
| `--oz-bg-subtle` | `#e5e7eb` | Trennlinien, Hintergründe |
| `--oz-font-heading` | Montserrat | Überschriften |
| `--oz-font-body` | Inter | Fließtext |
| `--oz-header-height` | `64px` | Sticky-Header-Höhe |
| `--oz-radius` | `8px` | border-radius |
| `--oz-shadow` | … | Box-Shadow |

---

### Schritt 2 – App ins Portal eintragen

Eintrag in [`openzirndorf-portal/src/apps.json`](https://github.com/openzirndorf/openzirndorf-portal/blob/main/src/apps.json) hinzufügen:

```json
{
  "id": "meine-app",
  "name": "Meine App",
  "description": "Kurze Beschreibung was die App macht (1–2 Sätze).",
  "icon": "🗓️",
  "url": "https://meine-app.openzirndorf.de/",
  "repo": "openzirndorf/meine-app",
  "active": true,
  "featured": false
}
```

| Feld | Pflicht | Beschreibung |
|------|---------|--------------|
| `id` | ✅ | Eindeutiger Slug (kebab-case) |
| `name` | ✅ | Anzeigename im Portal |
| `description` | ✅ | Kurzbeschreibung |
| `icon` | ✅ | Emoji als Icon |
| `url` | ✅ | Öffentliche URL der App |
| `repo` | – | `org/repo` für GitHub-Link |
| `active` | ✅ | `false` = im Portal ausgeblendet |
| `featured` | – | `true` = prominent oben angezeigt |
| `status` | – | Statustext (z.B. `"Anmeldung läuft"`) |

Danach committen und pushen – das Portal deployt automatisch.

---

### Schritt 3 – Links in openzirndorf_page ergänzen

Im Footer von [`openzirndorf_page/index.html`](index.html) unter "Digitale Angebote" einen
Link zur neuen App eintragen:

```html
<a href="https://meine-app.openzirndorf.de/" target="_blank" rel="noopener noreferrer">
  Meine App
</a>
```

Den gleichen Link im Footer von `openzirndorf-portal/src/App.tsx` ergänzen.

---

### Schritt 4 – Custom Domain (optional)

Wenn die App eine eigene Subdomain (`meine-app.openzirndorf.de`) bekommen soll:

1. Im App-Repo eine `public/CNAME`-Datei anlegen:
   ```
   meine-app.openzirndorf.de
   ```
2. Beim DNS-Anbieter einen CNAME-Eintrag erstellen:
   ```
   meine-app.openzirndorf.de → openzirndorf.github.io
   ```
3. In den GitHub-Repository-Settings unter **Pages → Custom domain** eintragen.

---

## Checkliste für neue Apps

```
□ Design Tokens von portal.openzirndorf.de/theme.css laden
□ Logo von openzirndorf.de/static/media/logo.png einbinden
□ Footer enthält "Ein OpenZirndorf-Projekt"-Link auf das Portal
□ Impressum-Link zeigt auf portal.openzirndorf.de/#impressum
□ Eintrag in openzirndorf-portal/src/apps.json
□ Link im Footer von openzirndorf_page/index.html
□ Link im Footer von openzirndorf-portal/src/App.tsx
□ (optional) CNAME + DNS für Custom Domain
```
