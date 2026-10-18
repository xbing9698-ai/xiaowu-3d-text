"""Convert five CJK glyph outlines from a TTF into Three.js typeface JSON.

The output contains only the glyphs used by the artwork, so the web page never
needs to load or rasterize a full Chinese font at runtime.
"""
from __future__ import annotations

import argparse
import json
import os
from xml.sax.saxutils import escape

from fontTools.pens.qu2cuPen import Qu2CuPen
from fontTools.pens.recordingPen import RecordingPen
from fontTools.ttLib import TTFont


def fmt(value: float) -> float | int:
    value = round(float(value), 2)
    if value == int(value):
        return int(value)
    return value


def glyph_to_path(glyph, glyph_set, upem: int) -> tuple[str, dict]:
    recording = RecordingPen()
    cubic = Qu2CuPen(recording, max_err=max(0.5, upem / 2000), all_cubic=True)
    glyph.draw(cubic)

    commands: list[str] = []
    min_x = min_y = float("inf")
    max_x = max_y = float("-inf")

    def note(point):
        nonlocal min_x, min_y, max_x, max_y
        x, y = point
        min_x = min(min_x, x)
        min_y = min(min_y, y)
        max_x = max(max_x, x)
        max_y = max(max_y, y)

    for op, args in recording.value:
        if op == "moveTo":
            (pt,) = args
            note(pt)
            commands.append(f"m {fmt(pt[0])} {fmt(pt[1])}")
        elif op == "lineTo":
            (pt,) = args
            note(pt)
            commands.append(f"l {fmt(pt[0])} {fmt(pt[1])}")
        elif op == "curveTo":
            # SegmentPen curveTo may carry several cubic segments in one call.
            points = list(args)
            for i in range(0, len(points) - 2, 3):
                note(points[i])
                note(points[i + 1])
                note(points[i + 2])
                commands.append(
                    "b "
                    + " ".join(
                        f"{fmt(points[i + j][0])} {fmt(points[i + j][1])}"
                        for j in range(3)
                    )
                )
        elif op in ("qCurveTo", "endPath"):
            raise RuntimeError(f"unexpected pen command: {op}")
        elif op == "closePath":
            commands.append("z")
        else:
            raise RuntimeError(f"unsupported pen command: {op}")

    if min_x == float("inf"):
        min_x = min_y = max_x = max_y = 0
    return " ".join(commands), {
        "x_min": fmt(min_x),
        "x_max": fmt(max_x),
        "y_min": fmt(min_y),
        "y_max": fmt(max_y),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("font", help="input TTF")
    parser.add_argument("chars", help="characters to extract")
    parser.add_argument("out", help="output JSON")
    parser.add_argument("--family", default="ZCOOL QingKe HuangYou")
    parser.add_argument("--svg", help="optional SVG debug preview")
    args = parser.parse_args()

    font = TTFont(args.font)
    upem = font["head"].unitsPerEm
    cmap = font.getBestCmap()
    glyph_set = font.getGlyphSet()

    glyphs = {}
    missing = []
    for char in args.chars:
        codepoint = ord(char)
        glyph_name = cmap.get(codepoint)
        if not glyph_name:
            missing.append(char)
            continue
        glyph = glyph_set[glyph_name]
        path, bounds = glyph_to_path(glyph, glyph_set, upem)
        glyphs[char] = {
            "ha": fmt(glyph.width),
            "x_min": bounds["x_min"],
            "x_max": bounds["x_max"],
            "y_min": bounds["y_min"],
            "y_max": bounds["y_max"],
            "o": path,
        }
    if missing:
        raise SystemExit(f"missing glyphs: {''.join(missing)}")

    hhea = font["hhea"]
    data = {
        "glyphs": glyphs,
        "familyName": args.family,
        "ascender": fmt(hhea.ascent),
        "descender": fmt(hhea.descent),
        "underlinePosition": fmt(font["post"].underlinePosition),
        "underlineThickness": fmt(font["post"].underlineThickness),
        "boundingBox": {
            "yMin": fmt(hhea.descent),
            "xMin": 0,
            "yMax": fmt(hhea.ascent),
            "xMax": fmt(upem),
        },
        "resolution": fmt(upem),
        "original_font_information": {
            "font_family_name": args.family,
            "font_subfamily_name": "Regular",
            "license": "SIL Open Font License 1.1",
            "source": "Google Fonts",
        },
    }

    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as handle:
        json.dump(data, handle, ensure_ascii=False, separators=(",", ":"))

    print(f"wrote {args.out}")
    print(f"upem={upem} glyphs={len(glyphs)} chars={''.join(glyphs)}")
    for char, glyph in glyphs.items():
        print(f"  {char}: ha={glyph['ha']} path_chars={len(glyph['o'])}")

    if args.svg:
        width = 180 * len(args.chars)
        items = []
        x_cursor = 20
        for char in args.chars:
            glyph = glyphs[char]
            # SVG y axis is down. Translate each glyph by its advance.
            items.append(
                f'<g transform="translate({x_cursor},210) scale(1,-1)">'
                f'<path d="{glyph["o"]}" fill="none" stroke="#74e8ff" stroke-width="4"/>'
                f'<text x="0" y="-150" transform="scale(1,-1)" font-size="50" fill="#fff">{escape(char)}</text>'
                f"</g>"
            )
            x_cursor += glyph["ha"]
        svg = (
            f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="260" '
            f'viewBox="0 0 {width} 260" style="background:#070b14">'
            + "".join(items)
            + "</svg>"
        )
        with open(args.svg, "w", encoding="utf-8") as handle:
            handle.write(svg)
        print(f"wrote {args.svg}")


if __name__ == "__main__":
    main()
