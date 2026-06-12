# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Příkazy

```bash
npm run build    # TypeScript check + produkční build (main.js)
npm run dev      # Vývojový režim – sleduje změny
npm run deploy   # build + zkopíruje do Obsidianu
npm test         # Spustí Jest testy
```

Po každém buildu je nutné plugin v Obsidianu **vypnout a znovu zapnout**.

## Kontext repozitáře

Toto je **fork** původního pluginu [`olvidalo/obsidian-chord-sheets`](https://github.com/olvidalo/obsidian-chord-sheets).
- `origin` → `pavdi7/obsidian-chord-sheets` (náš fork)
- `upstream` → `olvidalo/obsidian-chord-sheets` (originál)

Aktivní vývojová větev: `Autoscroll_visibility`.

## Architektura

Plugin renderuje **akordy nad textem** (formát ```` ```chords ```` blok nebo inline závorky) v Obsidianu. Klíčový aspekt: rendering v editačním/live preview módu je implementován jako **CodeMirror 6 editor extension** (ne jako Markdown post-processor), což umožňuje editaci bez přepínání do source view.

### Tok renderingu

```
Obsidian editor (CodeMirror 6)
  └─► chordSheetsEditorExtension   – registrace CM extension
        └─► chordSheetsViewPlugin  – ViewPlugin: sleduje změny dokumentu
              └─► chordBlocksStateField – StateField: parsuje chord bloky
                    └─► sheet-parsing/tokenizeLine  – tokenizace řádků na akordy/texty
              └─► chordBlockToolsWidget  – UI: transpose, nástroj, autoscroll
              └─► chordOverviewWidget    – přehled diagramů nad blokem
              └─► chordTooltip          – tooltip s diagramem při hover

Obsidian reading mode
  └─► chordBlockPostProcessorView   – Markdown post-processor (čtecí mód)
```

### Klíčové soubory v `src/`

| Soubor / složka | Účel |
|---|---|
| `main.ts` | Hlavní plugin: registrace extension, příkazů, settings |
| `editor-extension/` | Vše pro CodeMirror 6 live preview mód |
| `sheet-parsing/tokenizeLine.ts` | Parsování řádku na tokeny (akord vs. text vs. sekce) |
| `sheet-parsing/tokens.ts` | Typy tokenů |
| `chordProcessing.ts` | Logika detekce, transpozice a normalizace akordů (využívá `tonal`) |
| `chordDiagrams.ts` | Rendering diagramů (využívá `vexchords` a `chords-db`) |
| `chordSheetsSettings.ts` | Datová struktura nastavení |
| `chordSheetsSettingTab.ts` | UI nastavení pluginu |
| `autoscrollControl.ts` | Logika autoscrollu a ukládání rychlosti do frontmatter |
| `customChordTypes.ts` | Parsování vlastních tvarů akordů ve formátu `Bbadd13[x13333]` |

### Klíčové závislosti

- **`tonal`** — parsování a transpozice akordů
- **`@chordbook/charts`** (vexchords) — SVG rendering diagramů
- **`@tombatossals/chords-db`** — databáze prstokladů pro kytaru/ukulele/mandolínu
- **`tippy.js`** — tooltip pro hover diagramy
