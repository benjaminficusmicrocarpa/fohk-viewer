#!/usr/bin/env python3
"""Build data/fohk.json from the three HKHerbarium source workbooks.

Sources (default paths, overridable with --source-dir):
  Family FoHK paragraphs rekeyed 20261102.xlsx       -> sheet: paragraphs
  Genus list from HKHerbarium extracted 20240319.xlsx -> sheet: Sheet1
  Species list from HKHerbarium with FOHK extracted 20240321.xlsx -> sheet: species_a

The output is a single self-contained JSON file so the static site can load
every record once and then search/select with zero network round-trips.
"""

from __future__ import annotations

import argparse
import html
import json
import re
from datetime import datetime, timedelta, timezone
from html.parser import HTMLParser
from pathlib import Path

import openpyxl

DEFAULT_SOURCE_DIR = Path(
    "/Users/benjaminlau/Library/CloudStorage/OneDrive-TheUniversityofHongKong-Connect"
    "/My Resources/Excel Table/VariousFloraDatabase/HKHerbarium"
)
FAMILY_FILE = "Family FoHK paragraphs rekeyed 20261102.xlsx"
GENUS_FILE = "Genus list from HKHerbarium extracted 20240319.xlsx"
SPECIES_FILE = "Species list from HKHerbarium with FOHK extracted 20240321.xlsx"

HERBARIUM = "https://www.herbarium.gov.hk/plantdb"

# Tags we keep from the source HTML. Everything else is unwrapped to plain
# text; all attributes (id, style, onclick, ...) are dropped.
ALLOWED_TAGS = {
    "p", "br", "i", "b", "em", "strong", "div", "span", "sup", "sub", "u",
    "ul", "ol", "li", "table", "thead", "tbody", "tr", "td", "th",
}
DROP_TAGS = {"script", "style", "iframe", "object", "embed", "form", "input"}


class Sanitiser(HTMLParser):
    """Keep a small formatting subset, drop attributes and dangerous tags."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.skip_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag = tag.lower()
        if tag in DROP_TAGS:
            self.skip_depth += 1
            return
        if self.skip_depth:
            return
        if tag in ALLOWED_TAGS:
            self.parts.append(f"<{tag}>")

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if self.skip_depth:
            return
        if tag.lower() == "br":
            self.parts.append("<br>")

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag in DROP_TAGS:
            self.skip_depth = max(0, self.skip_depth - 1)
            return
        if self.skip_depth:
            return
        if tag in ALLOWED_TAGS:
            self.parts.append(f"</{tag}>")

    def handle_data(self, data: str) -> None:
        if not self.skip_depth:
            self.parts.append(html.escape(data, quote=False))


def clean_html(raw: str | None) -> str:
    if not raw or not str(raw).strip():
        return ""
    parser = Sanitiser()
    parser.feed(str(raw))
    parser.close()
    out = "".join(parser.parts)
    out = re.sub(r"<p>\s*</p>", "", out)
    out = re.sub(r"(?:<br>\s*){3,}", "<br><br>", out)
    return out.strip()


def plain_to_html(raw: str | None) -> str:
    """Family paragraphs are plain text, one logical paragraph per line."""
    if not raw or not str(raw).strip():
        return ""
    paras = [html.escape(p.strip()) for p in str(raw).splitlines() if p.strip()]
    return "".join(f"<p>{p}</p>" for p in paras)


def genus_fohk_text(raw: str | None) -> str:
    """Genus FoHK JSON: {"eng":[{"type":...,"content":"<div>..."}],...}."""
    if not raw or not str(raw).strip():
        return ""
    try:
        data = json.loads(str(raw))
    except (ValueError, TypeError):
        return clean_html(raw)
    blocks: list[str] = []
    for key in ("eng", "chi", "sc"):
        for item in data.get(key) or []:
            content = item.get("content", "") if isinstance(item, dict) else str(item)
            cleaned = clean_html(content)
            if cleaned:
                blocks.append(cleaned)
    return "<br><br>".join(blocks)


def rows(path: Path, sheet: str) -> list[tuple]:
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb[sheet]
    result = list(ws.iter_rows(min_row=2, values_only=True))
    wb.close()
    return result


def as_id(value) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()


def build(source_dir: Path, out_path: Path) -> dict:
    family_rows = rows(source_dir / FAMILY_FILE, "paragraphs")
    genus_rows = rows(source_dir / GENUS_FILE, "Sheet1")
    species_rows = rows(source_dir / SPECIES_FILE, "species_a")

    # id -> name lookups used to attach family/genus context to every record
    family_name_by_id = {as_id(r[0]): r[1] for r in family_rows if r[0] is not None}
    genus_info_by_id = {
        as_id(r[0]): {"name": r[2], "family_id": as_id(r[1])} for r in genus_rows if r[0] is not None
    }

    records: list[dict] = []

    for r in family_rows:
        fid = as_id(r[0])
        records.append({
            "rank": "family",
            "id": fid,
            "sci": str(r[1] or "").strip(),
            "chi": str(r[2] or "").strip(),
            "sc": str(r[3] or "").strip(),
            "authority": "",
            "family": "",
            "genus": "",
            "group": str(r[4] or ""),
            "n_species": r[8] if isinstance(r[8], int) else None,
            "status": str(r[7] or ""),
            "source": str(r[10] or "") or f"{HERBARIUM}/GetFloraOfHk.php?parent_type=family&id={fid}",
            "text": plain_to_html(r[11]),
            "uses": "",
            "food": "",
        })

    for r in genus_rows:
        gid = as_id(r[0])
        fam_id = genus_info_by_id.get(gid, {}).get("family_id", as_id(r[1]))
        records.append({
            "rank": "genus",
            "id": gid,
            "sci": str(r[2] or "").strip(),
            "chi": str(r[3] or "").strip(),
            "sc": str(r[4] or "").strip(),
            "authority": str(r[5] or "").strip(),
            "family": family_name_by_id.get(fam_id, ""),
            "genus": "",
            "group": "",
            "n_species": None,
            "status": "",
            "source": f"{HERBARIUM}/GetGenus.php?id={gid}",
            "text": genus_fohk_text(r[9]),
            "uses": "",
            "food": "",
        })

    for r in species_rows:
        sid = as_id(r[1])
        gid = as_id(r[0])
        ginfo = genus_info_by_id.get(gid, {})
        fam_id = ginfo.get("family_id", "")
        records.append({
            "rank": "species",
            "id": sid,
            "sci": str(r[5] or "").strip(),
            "chi": str(r[3] or "").strip(),
            "sc": str(r[4] or "").strip(),
            "authority": "",
            "family": family_name_by_id.get(fam_id, ""),
            "genus": str(ginfo.get("name") or ""),
            "group": "",
            "n_species": None,
            "status": "",
            "source": f"{HERBARIUM}/GetSpecies.php?id={sid}",
            "text": clean_html(r[7]),
            "uses": str(r[8] or "").strip(),
            "food": str(r[9] or "").strip(),
        })

    order = {"family": 0, "genus": 1, "species": 2}
    records.sort(key=lambda x: (order[x["rank"]], x["sci"].casefold(), x["id"]))

    hkt = datetime.now(timezone(timedelta(hours=8)))
    payload = {
        "meta": {
            "title": "Flora of Hong Kong — searchable text",
            "generated": hkt.strftime("%Y-%m-%d %H:%M HKT"),
            "source_dir": str(source_dir),
            "sources": [FAMILY_FILE, GENUS_FILE, SPECIES_FILE],
            "counts": {
                "total": len(records),
                "family": sum(1 for x in records if x["rank"] == "family"),
                "genus": sum(1 for x in records if x["rank"] == "genus"),
                "species": sum(1 for x in records if x["rank"] == "species"),
                "with_text": sum(1 for x in records if x["text"]),
            },
        },
        "records": records,
    }

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    return payload["meta"]["counts"]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", type=Path, default=DEFAULT_SOURCE_DIR)
    parser.add_argument("--out", type=Path, default=Path(__file__).resolve().parents[1] / "data" / "fohk.json")
    args = parser.parse_args()
    counts = build(args.source_dir, args.out)
    size_mb = args.out.stat().st_size / 1_000_000
    print(f"Wrote {args.out} ({size_mb:.2f} MB)")
    print("Records:", counts)


if __name__ == "__main__":
    main()
