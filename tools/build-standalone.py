#!/usr/bin/env python3
"""Собирает cow-skate-standalone.html из backend/app/static (index.html + game/*.js).

ES-модули по file:// не грузятся, поэтому модули подставляются инлайном в один
<script> в порядке исполнения ES-модулей (обход импортов в глубину от main.js),
а Telegram-подключения (блок telegram:begin/end) вырезаются.

    python tools/build-standalone.py          # перегенерировать
    python tools/build-standalone.py --check  # код 1, если standalone устарел
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STATIC = ROOT / "backend" / "app" / "static"
TARGET = ROOT / "cow-skate-standalone.html"

ENTRY_TAG = '<script type="module" src="game/main.js"></script>'
TELEGRAM_RE = re.compile(r"<!-- telegram:begin -->\n.*?<!-- telegram:end -->\n", re.S)
IMPORT_RE = re.compile(
    r"^import\s*\{[^}]*\}\s*from\s*'((?:\.{1,2}/)[\w./-]+\.js)';\n", re.M
)
EXPORT_RE = re.compile(r"^export (?=(?:const|let|function|async function) )", re.M)
NOTICE = "<!-- Сгенерировано tools/build-standalone.py из backend/app/static — не править руками. -->\n"


def module_order(entry: Path) -> list[Path]:
    """Пост-порядок обхода импортов — ровно так браузер исполняет модули."""
    order: list[Path] = []
    seen: set[Path] = set()

    def visit(path: Path) -> None:
        if path in seen:
            return
        seen.add(path)
        for spec in IMPORT_RE.findall(path.read_text(encoding="utf-8")):
            visit((path.parent / spec).resolve())
        order.append(path)

    visit(entry.resolve())
    return order


def strip_module(path: Path) -> str:
    src = IMPORT_RE.sub("", path.read_text(encoding="utf-8"))
    src = EXPORT_RE.sub("", src)
    leftovers = re.findall(r"^\s*(?:import|export)\b.*", src, re.M)
    if leftovers:
        raise SystemExit(f"{path}: неподдерживаемый import/export: {leftovers[0]!r}")
    return src.strip("\n")


def build() -> str:
    html = (STATIC / "index.html").read_text(encoding="utf-8")
    html, n = TELEGRAM_RE.subn("", html)
    if n != 1 or html.count(ENTRY_TAG) != 1:
        raise SystemExit(
            "index.html: не найден блок telegram:begin/end или тег game/main.js"
        )
    game = STATIC / "game"
    parts = [
        f"// ---- game/{p.relative_to(game.resolve())}\n{strip_module(p)}"
        for p in module_order(game / "main.js")
    ]
    script = (
        "<script>\n(() => {\n'use strict';\n\n"
        + "\n\n".join(parts)
        + "\n})();\n</script>"
    )
    html = html.replace(ENTRY_TAG, script)
    doctype, rest = html.split("\n", 1)
    return f"{doctype}\n{NOTICE}{rest}"


def main() -> int:
    out = build()
    if "--check" in sys.argv[1:]:
        if TARGET.read_text(encoding="utf-8") != out:
            print(f"{TARGET.name} устарел: запусти make standalone", file=sys.stderr)
            return 1
        return 0
    TARGET.write_text(out, encoding="utf-8")
    print(f"{TARGET.relative_to(ROOT)}: {len(out)} байт")
    return 0


if __name__ == "__main__":
    sys.exit(main())
