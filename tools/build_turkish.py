"""Build the Turkish version of tanercokyasar.com (the tr/ folder) from the English pages.

How it works
  * Every English page (*.html in the site root, except 404.html) is copied to tr/<page>.
  * Text is translated with the dictionary tools/tr_strings.json  {"English": "Türkçe", ...}.
    A "unit" is one run of text with its inline markup (a paragraph, list item, heading, button, ...).
    Inline tags are written as placeholders so the Turkish can reorder them:
        English key   "Read the {0}paper{/0} here."      {0} = the first inline tag, {/0} = its end tag,
        Turkish value "{0}Makaleyi{/0} buradan okuyun."   {1/} = an icon/<br>/<img> kept as is.
    Attributes title, aria-label, alt, placeholder and the meta description/og tags are translated too.
  * Publication lists (between <!-- PUBS:x --> markers), <script>, <style>, <svg>, <pre>, <code> and
    anything marked translate="no" stay as they are (papers stay in English).
  * Links are rewritten for the tr/ folder, <html lang="tr">, canonical/og:url point to /tr/,
    hreflang alternates are added, and an EN/TR switch is put in the header of BOTH versions.
  * Anything without a translation stays in English and is listed in tools/tr_missing.json
    (exit code 3). Add the Turkish to tr_strings.json and run again.

No third-party packages. Usage:  python tools/build_turkish.py [site_folder]
"""
import html
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

SITE = "https://tanercokyasar.com"
SKIP_PAGES = {"404.html"}
VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"}
INLINE = {"a", "abbr", "b", "bdi", "cite", "code", "data", "em", "i", "kbd", "mark", "q", "s", "small",
          "span", "strong", "sub", "sup", "time", "u", "br", "img", "wbr", "svg", "label"}
ATOMIC = {"svg", "img", "br", "wbr", "input"}          # kept whole inside a unit, never translated
SKIP = {"script", "style", "svg", "pre", "code", "textarea", "template", "math", "noscript", "canvas"}
SKIP_CLASSES = {"notranslate", "pubs", "bibbase-local"}   # paper lists stay in English
ATTRS = ("title", "aria-label", "alt", "placeholder")
META = {"description", "og:title", "og:description", "twitter:title", "twitter:description"}
MONTHS = {"January": "Ocak", "February": "Şubat", "March": "Mart", "April": "Nisan", "May": "Mayıs",
          "June": "Haziran", "July": "Temmuz", "August": "Ağustos", "September": "Eylül",
          "October": "Ekim", "November": "Kasım", "December": "Aralık"}
LETTER = re.compile(r"[A-Za-z]")


# ------------------------------------------------------------------ tiny lossless DOM
class Node:
    __slots__ = ("tag", "start", "end", "kids", "text")

    def __init__(self, tag=None, start="", text=None):
        self.tag, self.start, self.end, self.kids, self.text = tag, start, "", [], text

    def raw(self):
        if self.tag is None:
            return self.text
        return self.start + "".join(k.raw() for k in self.kids) + self.end


class Builder(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=False)
        self.root = Node("#root")
        self.stack = [self.root]

    def _add(self, n):
        self.stack[-1].kids.append(n)

    def handle_starttag(self, tag, attrs):
        n = Node(tag, self.get_starttag_text())
        self._add(n)
        if tag not in VOID:
            self.stack.append(n)

    def handle_startendtag(self, tag, attrs):
        self._add(Node(tag, self.get_starttag_text()))

    def handle_endtag(self, tag):
        for i in range(len(self.stack) - 1, 0, -1):
            if self.stack[i].tag == tag:
                self.stack[i].end = "</%s>" % tag
                del self.stack[i:]
                return
        self._add(Node(text="</%s>" % tag))         # stray end tag: keep it

    def handle_data(self, d):
        self._add(Node(text=d))

    def handle_entityref(self, name):
        self._add(Node(text="&%s;" % name))

    def handle_charref(self, name):
        self._add(Node(text="&#%s;" % name))

    def handle_comment(self, d):
        self._add(Node(text="<!--%s-->" % d))

    def handle_decl(self, d):
        self._add(Node(text="<!%s>" % d))

    def handle_pi(self, d):
        self._add(Node(text="<?%s>" % d))

    def unknown_decl(self, d):
        self._add(Node(text="<![%s]>" % d))


def parse(text):
    b = Builder()
    b.feed(text)
    b.close()
    return b.root


# ------------------------------------------------------------------ helpers
def attr(start, name):
    m = re.search(r'\s%s\s*=\s*("([^"]*)"|\'([^\']*)\')' % re.escape(name), start, re.I)
    return None if not m else (m.group(2) if m.group(2) is not None else m.group(3))


def set_attr(start, name, value):
    return re.sub(r'(\s%s\s*=\s*)("[^"]*"|\'[^\']*\')' % re.escape(name),
                  lambda m: m.group(1) + '"' + value.replace('"', "&quot;") + '"', start, count=1, flags=re.I)


def norm(s):
    return re.sub(r"\s+", " ", s).strip()


def is_skipped(n):
    if n.tag in SKIP:
        return True
    if n.tag and n.start:
        if (attr(n.start, "translate") or "").lower() == "no":
            return True
        cls = attr(n.start, "class") or ""
        if set(cls.split()) & SKIP_CLASSES:
            return True
    return False


def inline_only(n):
    if n.tag is None:
        return not n.text.startswith("<!")
    if n.tag not in INLINE:
        return False
    if n.tag in ATOMIC:
        return True
    return all(inline_only(k) for k in n.kids)


class Translator:
    def __init__(self, strings):
        self.d = strings
        self.missing = {}           # key -> set(pages)
        self.used = set()
        self.page = ""

    def look(self, key):
        if not LETTER.search(re.sub(r"\{/?\d+/?\}|&\w+;", "", key)):
            return key              # numbers/punctuation only
        stamp = re.compile(r"Last updated (%s) (\d{4})" % "|".join(MONTHS))
        if stamp.search(key) and not LETTER.search(re.sub(r"\{/?\d+/?\}", "", stamp.sub("", key))):
            return stamp.sub(lambda m: "Son güncelleme: %s %s" % (MONTHS[m.group(1)], m.group(2)), key)
        if key in self.d:
            self.used.add(key)
            return self.d[key]
        self.missing.setdefault(key, set()).add(self.page)
        return None

    # ---- attributes (whole tree, except skipped parts)
    def attrs(self, n):
        if n.tag is None or is_skipped(n) and n.tag != "svg":
            return
        if n.start:
            for a in ATTRS:
                v = attr(n.start, a)
                if v and LETTER.search(v):
                    t = self.look(norm(v))
                    if t is not None:
                        n.start = set_attr(n.start, a, t)
            if n.tag == "meta":
                key = (attr(n.start, "name") or attr(n.start, "property") or "").lower()
                v = attr(n.start, "content")
                if key in META and v:
                    t = self.look(norm(v))
                    if t is not None:
                        n.start = set_attr(n.start, "content", t)
        if n.tag == "svg":
            return
        for k in n.kids:
            self.attrs(k)

    # ---- text units
    def walk(self, n):
        if n.tag is None or is_skipped(n):
            return
        kids, out, run, in_pubs = n.kids, [], [], False

        def flush():
            if run:
                out.extend(self.unit(run))
                run.clear()

        for k in kids:
            if k.tag is None and k.text.startswith("<!--"):
                c = k.text.strip()
                if re.match(r"<!--\s*PUBS:", c):
                    flush(); in_pubs = True
                elif re.match(r"<!--\s*/PUBS:", c):
                    in_pubs = False
                out.append(k)
                continue
            if in_pubs:
                out.append(k)
                continue
            if inline_only(k) and not (k.tag is None and "\n" in k.text and not k.text.strip()):
                run.append(k)
            else:
                flush()
                out.append(k)
                if k.tag is not None:
                    self.walk(k)
        flush()
        n.kids = out

    def unit(self, run):
        # keep surrounding whitespace outside the unit
        lead, trail = [], []
        while run and run[0].tag is None and not run[0].text.strip():
            lead.append(run.pop(0))
        while run and run[-1].tag is None and not run[-1].text.strip():
            trail.insert(0, run.pop())
        if not run:
            return lead + trail
        elems, parts = [], []

        def enc(n):
            if n.tag is None:
                parts.append(n.text.replace("{", "{{").replace("}", "}}"))
                return
            i = len(elems)
            elems.append(n)
            if n.tag in ATOMIC or n.tag in VOID or is_skipped(n):
                parts.append("{%d/}" % i)
                return
            parts.append("{%d}" % i)
            for c in n.kids:
                enc(c)
            parts.append("{/%d}" % i)

        for n in run:
            enc(n)
        raw = "".join(parts)
        lw = raw[:len(raw) - len(raw.lstrip())]
        tw = raw[len(raw.rstrip()):]
        key = norm(raw)
        t = self.look(key)
        if t is None or t == key:
            return lead + run + trail
        try:
            text = decode(t, elems)
        except (KeyError, ValueError, IndexError) as e:
            print("  ! bad placeholders in translation of: %s (%s)" % (key[:70], e))
            return lead + run + trail
        return lead + [Node(text=lw + text + tw)] + trail


def decode(t, elems):
    out, i = [], 0
    for m in re.finditer(r"\{\{|\}\}|\{(/?)(\d+)(/?)\}", t):
        out.append(t[i:m.start()])
        i = m.end()
        tok = m.group(0)
        if tok == "{{":
            out.append("{")
        elif tok == "}}":
            out.append("}")
        else:
            e = elems[int(m.group(2))]
            if m.group(3):
                out.append(e.raw())
            elif m.group(1):
                out.append(e.end)
            else:
                out.append(e.start)
    out.append(t[i:])
    return "".join(out)


# ------------------------------------------------------------------ page-level edits
def page_url(page, tr=False):
    p = "" if page == "index.html" else page
    return SITE + ("/tr/" if tr else "/") + p


def hreflang_block(page):
    return ("<!-- hreflang -->\n"
            '  <link rel="alternate" hreflang="en" href="%s">\n'
            '  <link rel="alternate" hreflang="tr" href="%s">\n'
            '  <link rel="alternate" hreflang="x-default" href="%s">\n'
            "  <!-- /hreflang -->") % (page_url(page), page_url(page, True), page_url(page))


def switch(page, to_tr):
    if to_tr:
        href = "tr/" + ("" if page == "index.html" else page)
        return ('<a class="lang-btn" href="%s" hreflang="tr" lang="tr" title="Türkçe" '
                'aria-label="Türkçe sürüm">TR</a>') % href
    href = "../" + ("" if page == "index.html" else page)
    return ('<a class="lang-btn" href="%s" hreflang="en" lang="en" title="English" '
            'aria-label="English version">EN</a>') % href


def add_chrome(doc, page, tr):
    """Insert/refresh the hreflang links and the EN/TR switch (idempotent)."""
    doc = re.sub(r"\s*<!-- hreflang -->.*?<!-- /hreflang -->", "", doc, flags=re.S)
    doc = re.sub(r'(<link rel="canonical"[^>]*>)', lambda m: m.group(1) + "\n  " + hreflang_block(page), doc, count=1)
    doc = re.sub(r'<a class="lang-btn"[^>]*>[^<]*</a>\s*', "", doc)
    doc = re.sub(r'(<button class="icon-btn theme-btn")', lambda m: switch(page, not tr) + "\n        " + m.group(1), doc, count=1)
    return doc


URLATTR = re.compile(r'(\s(?:href|src|srcset|poster|data-src)\s*=\s*")([^"]*)(")', re.I)


def relink(doc, pages):
    def fix(v):
        if not v or re.match(r"^([a-z][a-z0-9+.-]*:|//|/|#|\.\./)", v, re.I):
            return v
        base = re.split(r"[#?]", v)[0]
        if base in pages or base == "":
            return v
        return "../" + v

    def one(m):
        v = m.group(2)
        if "," in v and "srcset" in m.group(1).lower():
            v = ", ".join(fix(p.strip()) for p in v.split(","))
        else:
            v = fix(v)
        return m.group(1) + v + m.group(3)
    doc = URLATTR.sub(one, doc)
    return re.sub(r'url\((["\']?)(?![a-z]+:|/|#|\.\./)([^)"\']+)\1\)', r"url(\1../\2\1)", doc)


def build(site):
    site = Path(site)
    tools = site / "tools"
    strings = json.loads((tools / "tr_strings.json").read_text(encoding="utf-8"))
    strings = {k: v for k, v in strings.items() if not k.startswith("__")}
    tr = Translator(strings)
    out_dir = site / "tr"
    out_dir.mkdir(exist_ok=True)
    pages = sorted(p.name for p in site.glob("*.html") if p.name not in SKIP_PAGES)
    for name in pages:
        src = site / name
        raw = src.read_bytes().decode("utf-8")
        nl = "\r\n" if "\r\n" in raw else "\n"
        en = add_chrome(raw.replace("\r\n", "\n"), name, tr=False)
        if en != raw.replace("\r\n", "\n"):
            src.write_bytes(en.replace("\n", nl).encode("utf-8"))
        tr.page = name
        root = parse(en)
        tr.attrs(root)
        tr.walk(root)
        doc = root.raw()
        doc = re.sub(r'<html lang="en"', '<html lang="tr"', doc, count=1)
        doc = relink(doc, set(pages))
        doc = doc.replace('href="%s"' % page_url(name), 'href="%s"' % page_url(name, True))
        doc = doc.replace('content="%s"' % page_url(name), 'content="%s"' % page_url(name, True))
        doc = re.sub(r'(<link rel="alternate" hreflang="(?:en|x-default)" href=")%s/tr/' % re.escape(SITE),
                     r"\1%s/" % SITE, doc)
        doc = add_chrome(doc, name, tr=True)
        if 'property="og:locale"' not in doc:
            doc = doc.replace('<meta property="og:type"', '<meta property="og:locale" content="tr_TR">\n  <meta property="og:type"', 1)
        (out_dir / name).write_bytes(doc.encode("utf-8"))
    # sitemap: add the tr/ pages
    sm = site / "sitemap.xml"
    if sm.exists():
        s = sm.read_text(encoding="utf-8")
        for name in pages:
            u = page_url(name, True)
            if "<loc>%s</loc>" % u not in s:
                s = s.replace("</urlset>", "  <url><loc>%s</loc></url>\n</urlset>" % u)
        sm.write_text(s, encoding="utf-8", newline="\n")
    miss = tools / "tr_missing.json"
    if tr.missing:
        miss.write_text(json.dumps({k: sorted(v) for k, v in tr.missing.items()},
                                   ensure_ascii=False, indent=1), encoding="utf-8", newline="\n")
        print("Turkish site: %d page(s) built; %d text(s) have no Turkish yet (shown in English)."
              % (len(pages), len(tr.missing)))
        print("  Add them to tools/tr_strings.json - the list is in tools/tr_missing.json")
        for k in list(tr.missing)[:15]:
            print("   -", k[:110])
        return 3
    if miss.exists():
        miss.unlink()
    unused = [k for k in strings if k not in tr.used]
    print("Turkish site: %d page(s) built, all text translated (%d unused dictionary entries)."
          % (len(pages), len(unused)))
    return 0


if __name__ == "__main__":
    sys.exit(build(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent))
