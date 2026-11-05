"""Set the footer "Last updated <Month YYYY>" on every page of the website to the current month.

Run by push_profile.bat whenever the website has changes to publish.
Usage: python stamp_last_updated.py <website_folder>
"""
import re
import sys
from datetime import date
from pathlib import Path

MONTHS = ["January", "February", "March", "April", "May", "June", "July",
          "August", "September", "October", "November", "December"]


def main(folder):
    today = date.today()
    stamp = f"Last updated {MONTHS[today.month - 1]} {today.year}"
    pat = re.compile(r"Last updated [A-Z][a-z]+ \d{4}")
    changed = 0
    for page in sorted(Path(folder).glob("*.html")):
        raw = page.read_bytes().decode("utf-8")
        new = pat.sub(stamp, raw)
        if new != raw:
            page.write_bytes(new.encode("utf-8"))
            changed += 1
    print(f'"{stamp}" set on {changed} page(s)')


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else ".")
