# FoHK Viewer

A small static site for browsing the **Flora of Hong Kong** treatment text extracted from the Hong Kong Herbarium workbooks — no herbarium round-trip, instant search and immediate display.

Live (after publishing): `https://benjaminficusmicrocarpa.github.io/fohk-viewer/`

## What is in it

`data/fohk.json` is generated from three source workbooks:

| Rank | Source workbook | Sheet |
|------|-----------------|-------|
| Family (261) | `Family FoHK paragraphs rekeyed 20261102.xlsx` | `paragraphs` |
| Genus (1431) | `Genus list from HKHerbarium extracted 20240319.xlsx` | `Sheet1` |
| Species (3348) | `Species list from HKHerbarium with FOHK extracted 20240321.xlsx` | `species_a` |

Each record carries scientific name, Traditional/Simplified Chinese names, family and genus context, the herbarium ID, a link back to the herbarium record, and the FoHK text. Source HTML is reduced to a small formatting whitelist (`p`, `br`, `i`, `b`, `em`, `strong`, tables, lists) with all attributes stripped.

A record with no local treatment is still listed but marked `no text`; untick **Has text only** to see those too. Coverage in the current build is shown in the header stamp and in the README build output.

## Run locally

The data is fetched with `fetch()`, so open it over HTTP, not by double-clicking `index.html`:

```bash
cd /Users/benjaminlau/github-repo/fohk-viewer
python3 -m http.server 8771
# open http://127.0.0.1:8771/
```

Port 8771 is used to stay clear of 8765/8766 (other botany projects) and 8770 (macOS sharingd).

## Search and keyboard

- Type in the search box: scientific name, 中文名, simplified name, family, genus or numeric ID. Multiple words are ANDed; matches are scored (exact name > prefix > substring) and highlighted.
- `All / Family / Genus / Species` filters; `Has text only` toggle; `Random` jumps to a random treatment.
- `/` or `⌘/Ctrl+K` focuses search, `↑` / `↓` walks the result list, `Enter` opens the highlighted result, `Esc` clears the search.
- Clicking a family or genus in the breadcrumb jumps to that treatment.
- **Quick switch** in the detail pane: from a family you get clickable genera and species; from a genus its species; from a species its parent genus/family, other species in the genus, and infraspecific taxa (subsp./var./f.). Chips clear conflicting rank/text filters automatically, and the panel can be collapsed.
- Each selection updates the URL hash (`#species-5187`), so a treatment can be bookmarked or shared.
- `Copy plain text` copies the displayed treatment without the HTML markup.
- Theme toggle (light/dark) is remembered locally.

## Rebuild the data

After any of the three source workbooks changes:

```bash
cd /Users/benjaminlau/github-repo/fohk-viewer
/opt/anaconda3/bin/python scripts/build_data.py
```

This overwrites `data/fohk.json` and prints the record counts. Custom sources can be passed with `--source-dir /path/to/workbooks --out /path/to/fohk.json`.

## Deploy

GitHub Pages publishes `main` from the repository root; there is no build step and no runtime dependency. Commit `index.html`, `assets/`, `data/fohk.json`, `scripts/` and this README. Push only when asked.
