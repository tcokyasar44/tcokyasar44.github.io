"""Build the publication lists on publications.html from the CV's four .bib files.

Replaces the content between <!-- PUBS:<key> --> and <!-- /PUBS:<key> --> markers.
No third-party packages; runs with any Python 3.8+.

Usage: python build_publications.py <bib_dir> <publications.html>
"""
import html
import re
import sys
from pathlib import Path

SECTIONS = {  # marker key -> bib file
    "journal": "journal_articles.bib",
    "wip": "work_in_progress.bib",
    "conf": "conference_articles.bib",
    "pres": "conference_presentations.bib",
}
ME = "Cokyasar"
UNDATED = "One day"


# ---------------------------------------------------------------- bib parsing
def parse_bib(text):
    """Return a list of entries: dict(type, key, fields, raw)."""
    entries, i = [], 0
    while True:
        m = re.compile(r"@(\w+)\s*\{\s*([^,\s]+)\s*,").search(text, i)
        if not m:
            break
        depth, j = 1, m.end()
        start_body = j
        while j < len(text) and depth:
            if text[j] == "{":
                depth += 1
            elif text[j] == "}":
                depth -= 1
            j += 1
        body = text[start_body:j - 1]
        entries.append({"type": m.group(1).lower(), "key": m.group(2),
                        "fields": parse_fields(body), "raw": text[m.start():j]})
        i = j
    return entries


def parse_fields(body):
    fields, i, n = {}, 0, len(body)
    while i < n:
        m = re.compile(r"\s*,?\s*([A-Za-z_]+)\s*=\s*").match(body, i)
        if not m:
            break
        name, i = m.group(1).lower(), m.end()
        if i < n and body[i] == "{":
            depth, j = 1, i + 1
            while j < n and depth:
                depth += {"{": 1, "}": -1}.get(body[j], 0)
                j += 1
            val, i = body[i + 1:j - 1], j
        elif i < n and body[i] == '"':
            j = body.index('"', i + 1)
            val, i = body[i + 1:j], j + 1
        else:
            m2 = re.compile(r"[^,\s]+").match(body, i)
            val, i = (m2.group(0), m2.end()) if m2 else ("", i + 1)
        fields[name] = re.sub(r"\s+", " ", val).strip()
    return fields


# ---------------------------------------------------------------- LaTeX -> HTML
ACCENTS = {"'": "\u0301", "`": "\u0300", "^": "\u0302", '"': "\u0308", "~": "\u0303", "c": "\u0327", ".": "\u0307", "u": "\u0306", "v": "\u030c"}


def latex_to_html(s):
    s = html.escape(s, quote=False)
    s = s.replace("\\&amp;", "&amp;").replace("\\%", "%").replace("\\$", "$").replace("\\_", "_")
    s = re.sub(r"\\nth\{(\d+)\}", lambda m: m.group(1) + ordinal(int(m.group(1))), s)
    s = re.sub(r"\\(['`^\"~.cuv])\s*\{?([A-Za-z])\}?", lambda m: m.group(2) + ACCENTS[m.group(1)], s)
    s = s.replace("\\bibnamedelima", " ").replace("\\bibnamedelimi", " ")
    for _ in range(3):  # nested \textit{\textbf{..}}
        s = re.sub(r"\\(textit|emph)\{([^{}]*)\}", r"<em>\2</em>", s)
        s = re.sub(r"\\textbf\{([^{}]*)\}", r"<strong>\1</strong>", s)
        s = re.sub(r"\\textsuperscript\{([^{}]*)\}", r"<sup>\1</sup>", s)
        s = re.sub(r"\\(url|href)\{([^{}]*)\}", r"\2", s)
    s = re.sub(r"\\[A-Za-z]+\*?", "", s)          # drop any remaining macros
    s = s.replace("{", "").replace("}", "")
    s = s.replace("---", "\u2014").replace("--", "\u2013").replace("~", "\u00a0")
    return re.sub(r"\s+", " ", s).strip()


def ordinal(n):
    return "th" if 10 <= n % 100 <= 20 else {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")


def fmt_author(name, corresp):
    name = name.strip()
    if "," in name:
        family, given = name.split(",", 1)
    else:
        parts = name.split()
        family, given = parts[-1], " ".join(parts[:-1])
    family = latex_to_html(family)
    initials = " ".join(p[0] + "." for p in re.split(r"[\s.\-]+", latex_to_html(given)) if p and p[0].isalpha())
    txt = f"{family}, {initials}".strip().rstrip(",")
    if ME.lower() in family.lower():
        txt = f"<strong>{txt}{'*' if corresp else ''}</strong>"
    return txt


def fmt_authors(field, corresp):
    names = [a for a in re.split(r"\s+and\s+", field or "") if a.strip()]
    names = [fmt_author(a, corresp) for a in names]
    if len(names) <= 1:
        return "".join(names)
    return ", ".join(names[:-1]) + ", &amp; " + names[-1]


def clean_title(t):
    t = latex_to_html(t)
    return t.rstrip(". ")


def entry_html(e, section):
    f = e["fields"]
    corresp = f.get("usera", "") == "corresp"
    year = f.get("year", "")
    authors = fmt_authors(f.get("author", ""), corresp)
    title = clean_title(f.get("title", ""))
    parts = [f'<span class="bibbase_paper_author">{authors}</span>']
    if year:
        parts.append(f" ({html.escape(year)}).")
    elif not re.sub(r"<[^>]+>", "", authors).rstrip("*").endswith("."):
        parts.append(".")
    parts.append(f' <span class="bibbase_paper_title">{title}.</span>')
    t = e["type"]
    if t == "article":
        venue = f"<em>{latex_to_html(f.get('journal', ''))}</em>"
        vol = f.get("volume", "")
        iss = f.get("number") or f.get("issue") or ""
        pages = latex_to_html(f.get("pages", ""))
        if not pages and iss.isdigit() and len(iss) >= 5:  # Elsevier article number stored as number
            pages, iss = iss, ""
        if vol:
            venue += f", <em>{html.escape(vol)}</em>" + (f"({html.escape(iss)})" if iss else "")
        if pages:
            venue += f", {pages}"
        parts.append(f" {venue}.")
        if f.get("note"):
            parts.append(f' <span class="bibbase_note">{latex_to_html(f["note"])}</span>')
    elif t == "manual":
        pub = latex_to_html(f.get("publisher", ""))
        if pub:
            parts.append(f" {pub}.")
        if f.get("note"):
            parts.append(f' <span class="bibbase_note">{latex_to_html(f["note"])}</span>')
    else:  # unpublished, misc, others
        note = f.get("note") or f.get("howpublished") or f.get("publisher") or ""
        if note:
            nh = latex_to_html(note)
            parts.append(f' <span class="bibbase_note">{nh}{"" if nh.endswith(".") else "."}</span>')
    if "invited" in f.get("keywords", ""):
        parts.append(' <span class="bibbase_note">(Invited)</span>')
    links = []
    if f.get("doi"):
        d = re.sub(r"^https?://(dx\.)?doi\.org/", "", f["doi"])
        links.append(f'<a class="link" href="https://doi.org/{html.escape(d)}" target="_blank" rel="noopener">doi</a>')
    if f.get("url"):
        u = latex_to_html(f["url"]).replace("&amp;", "&")
        label = "preprint" if "arxiv" in u.lower() else "link"
        links.append(f'<a class="link" href="{html.escape(u)}" target="_blank" rel="noopener">{label}</a>')
    raw = html.escape(e["raw"].replace("\r\n", "\n"))
    links.append(f'<details class="bibtex"><summary>bibtex</summary><pre class="well">{raw}</pre></details>')
    return ('<div class="bibbase_paper"><div class="bibbase_paper_content">'
            + "".join(parts) + '<div class="bibbase_paper_links">' + " ".join(links) + "</div></div></div>")


def sort_key(e):
    f = e["fields"]
    y = f.get("year", "")
    return (-(int(y) if y.isdigit() else 9999), f.get("author", "").lower(), f.get("title", "").lower())


def section_html(entries, section):
    groups, order = {}, []
    for e in sorted(entries, key=sort_key):
        y = e["fields"].get("year", "") or UNDATED
        if y not in groups:
            groups[y] = []
            order.append(y)
        groups[y].append(e)
    # Collapsible year groups (like BibBase). Presentations: only the 3 most recent years start open.
    out = ['<div class="bibbase-local">']
    for idx, y in enumerate(order):
        is_open = section != "pres" or idx < 3
        out.append(f'<details class="pub-year"{" open" if is_open else ""}>'
                   f'<summary class="bibbase_group"><span>{html.escape(y)}</span> '
                   f'<span class="bibbase_group_count">({len(groups[y])})</span></summary>')
        out.extend(entry_html(e, section) for e in groups[y])
        out.append("</details>")
    out.append("</div>")
    return "\n".join(out)


def main(bib_dir, page):
    bib_dir, page = Path(bib_dir), Path(page)
    doc = page.read_text(encoding="utf-8")
    total = 0
    for key, fname in SECTIONS.items():
        text = (bib_dir / fname).read_text(encoding="utf-8")
        text = "\n".join(l for l in text.splitlines() if not l.lstrip().startswith("%"))
        entries = parse_bib(text)
        if key == "pres":
            pass  # invited talks are shown inline with an "(Invited)" tag
        block = section_html(entries, key)
        pat = re.compile(r"(<!-- PUBS:%s -->).*?(<!-- /PUBS:%s -->)" % (key, key), re.S)
        if not pat.search(doc):
            sys.exit(f"Marker <!-- PUBS:{key} --> not found in {page}")
        doc = pat.sub(lambda m: m.group(1) + "\n" + block + "\n" + m.group(2), doc)
        total += len(entries)
        print(f"{key}: {len(entries)} entries")
    page.write_text(doc, encoding="utf-8", newline="")
    print(f"publications.html updated ({total} entries)")


if __name__ == "__main__":
    main(*sys.argv[1:3])
