"""How subtitles look in the rendered lyric videos: the one source of truth for the
preview frame and the render (both in modal_worker.py).

The dashboard's live preview mirrors these rules in
dashboard/app/produce/[songId]/_lib/ass.ts. Change both together.

Frame dimensions and placement presets are parameters with the original defaults.
Echo's copy needs the same parameter change; all other rendering logic stays verbatim.

Pure Python (no Modal), so it can be unit-tested locally: cloud/tests/test_render_style.py.
"""
from __future__ import annotations

import os
import re
from dataclasses import dataclass
from functools import lru_cache

FRAME_W, FRAME_H = 1920, 1080  # ASS PlayResX / PlayResY

# Placement presets. Alignment 5 = centred in the frame vertically (libass ignores MarginV
# for it, so vertical offsets use \pos); 2 = bottom-centre, lifted by MarginV.
POSITIONS = {
    "left-third": {"alignment": 5, "margin_l": 80, "margin_r": 1000, "margin_v": 50},
    "right-third": {"alignment": 5, "margin_l": 920, "margin_r": 150, "margin_v": 50},
    "bottom-third": {"alignment": 2, "margin_l": 100, "margin_r": 100, "margin_v": 100},
    "bottom-center": {"alignment": 2, "margin_l": 100, "margin_r": 100, "margin_v": 80},
}
DEFAULT_POSITION = "right-third"

FONT_DIR = os.environ.get("RENDER_FONT_DIR", "/usr/share/fonts/truetype")  # overridable for local tests
# Per language: font family (as libass/fontconfig sees it) and the file installed in the image.
FONTS = {
    "san": ("Rozha One", f"{FONT_DIR}/rozha/RozhaOne-Regular.ttf"),
    "kan": ("Noto Serif Kannada", f"{FONT_DIR}/noto-serif-indic/NotoSerifKannada.ttf"),
    "tam": ("Noto Serif Tamil", f"{FONT_DIR}/noto-serif-indic/NotoSerifTamil.ttf"),
    "tel": ("Noto Serif Telugu", f"{FONT_DIR}/noto-serif-indic/NotoSerifTelugu.ttf"),
    "mal": ("Noto Serif Malayalam", f"{FONT_DIR}/noto-serif-indic/NotoSerifMalayalam.ttf"),
}

# Scripts whose fonts carry large vertical metrics are drawn smaller than the chosen size.
SIZE_MULTIPLIER = {"san": 1.0, "kan": 1.0, "tam": 0.6, "tel": 1.0, "mal": 0.75}

# libass sizes a font so that usWinAscent + usWinDescent equals the ASS size (not the em).
# unitsPerEm / (winAscent + winDescent) for the files above; used to measure text widths.
EM_PER_ASS_SIZE = {"san": 0.7042, "kan": 0.5921, "tam": 0.6406, "tel": 0.684, "mal": 0.8019}

DEFAULT_COLOR = "#FFD4A3"
OUTLINE_PX = 3
SHADOW_PX = 5  # hard 50% shadow: the house look (Bharat compared softer/none and kept this, 2026-09-28)
REVEAL_MS = 800   # left-to-right unveil across the line
FADE_OUT_MS = 300
MAX_LINE_CHARS = 20
REVEAL_PAD_PX = 24  # outline + faux-bold + measurement slack either side of the text


@dataclass(frozen=True)
class Style:
    language: str = "san"
    position: str = DEFAULT_POSITION
    font_size: int = 120  # as chosen in the dashboard, before the script multiplier
    color: str = DEFAULT_COLOR
    offset_x: int = 0
    offset_y: int = 0  # positive raises the text

    frame_w: int = FRAME_W
    frame_h: int = FRAME_H
    placement_presets: dict | None = None

    @property
    def preset(self) -> dict:
        presets = self.placement_presets if self.placement_presets is not None else POSITIONS
        return presets.get(self.position, presets[DEFAULT_POSITION])

    @property
    def ass_size(self) -> int:
        return int(self.font_size * SIZE_MULTIPLIER.get(self.language, 1.0))

    @property
    def font(self) -> str:
        return FONTS.get(self.language, FONTS["san"])[0]

    @property
    def margins(self) -> tuple[int, int, int]:
        p = self.preset
        return (max(0, p["margin_l"] + self.offset_x),
                max(0, p["margin_r"] - self.offset_x),
                max(0, p["margin_v"] + self.offset_y))

    @property
    def middle(self) -> bool:
        return self.preset["alignment"] == 5

    @property
    def center_x(self) -> float:
        l, r, _ = self.margins
        return (l + self.frame_w - r) / 2


def ass_color(hex_color: str) -> str:
    """#RRGGBB -> &H00BBGGRR"""
    h = hex_color.lstrip("#")
    if len(h) != 6:
        h = DEFAULT_COLOR.lstrip("#")
    return f"&H00{h[4:6]}{h[2:4]}{h[0:2]}".upper()


def outline_color(hex_color: str) -> str:
    """Black outline for light text, dark grey for dark text."""
    h = hex_color.lstrip("#")
    if len(h) == 6:
        r, g, b = (int(h[i:i + 2], 16) for i in (0, 2, 4))
        if (r * 299 + g * 587 + b * 114) / 1000 > 128:
            return "&H00000000"
    return "&H00303030"


def wrap_lines(text: str, max_chars: int = MAX_LINE_CHARS) -> list[str]:
    """Break a subtitle into screen lines: at ॥ / । / commas first, then at spaces so no line
    runs past `max_chars`. A single word longer than that stays whole: words are never split
    (an Indic word cut mid-akshara with a hyphen is unreadable)."""
    full = " ".join(l.strip() for l in text.split("\n") if l.strip())
    if not full:
        return []

    lines: list[str] = []
    for part in re.split(r"(॥)", full):
        part = part.strip()
        if not part:
            continue
        if part == "॥":
            if lines:
                lines[-1] += "॥"
            continue
        for sub in re.split(r"(।)", part):
            sub = sub.strip()
            if not sub:
                continue
            if sub == "।":
                if lines:
                    lines[-1] += "।"
                continue
            commas = [c.strip() for c in sub.split(",") if c.strip()]
            lines += [c + "," if i < len(commas) - 1 else c for i, c in enumerate(commas)]
    if len(lines) <= 1:
        lines = [full]

    wrapped: list[str] = []
    for line in lines:
        current = ""
        for word in line.split(" "):
            if not word:
                continue
            candidate = f"{current} {word}" if current else word
            if current and len(candidate) > max_chars:
                wrapped.append(current)
                current = word
            else:
                current = candidate
        if current:
            wrapped.append(current)
    return wrapped


def ass_text(lines: list[str]) -> str:
    """Lines joined with \\N; four or more get a blank line between the first pair and the rest."""
    if len(lines) >= 4:
        return "\\N".join(lines[:2]) + "\\N\\N" + "\\N".join(lines[2:])
    return "\\N".join(lines)


@lru_cache(maxsize=8)
def _shaper(language: str):
    """(hb.Font, unitsPerEm) for the language's font, or None if unavailable."""
    try:
        import uharfbuzz as hb
        with open(FONTS[language][1], "rb") as f:
            face = hb.Face(f.read())
        font = hb.Font(face)
        if language != "san":  # variable Noto fonts: the Bold instance libass picks
            font.set_variations({"wght": 700})
        return font, face.upem
    except Exception:
        return None


def text_width(line: str, style: Style) -> float | None:
    """Advance width of a shaped line in frame pixels (HarfBuzz, the same shaper as libass)."""
    shaper = _shaper(style.language)
    if shaper is None or not line:
        return None
    import uharfbuzz as hb
    font, upem = shaper
    buf = hb.Buffer()
    buf.add_str(line)
    buf.guess_segment_properties()
    hb.shape(font, buf)
    units = sum(p.x_advance for p in buf.glyph_positions)
    em_px = style.ass_size * EM_PER_ASS_SIZE.get(style.language, 0.7)
    return units / (upem or 1000) * em_px


def reveal_tags(lines: list[str], style: Style) -> str:
    """Left-to-right unveil across the text itself over REVEAL_MS, then the full frame, plus the
    fade-out. (Wiping across the whole 1920 px frame made right-side lyrics appear ~0.5 s late.)"""
    widths = [text_width(l, style) for l in lines if l]
    if widths and all(w is not None for w in widths):
        half = max(widths) / 2 + REVEAL_PAD_PX
        x0 = max(0, round(style.center_x - half))
        x1 = min(style.frame_w, round(style.center_x + half))
    else:  # can't measure: sweep the placement box instead
        l, r, _ = style.margins
        x0, x1 = l, style.frame_w - r
    return (f"\\clip({x0},0,{x0},{style.frame_h})"
            f"\\t(0,{REVEAL_MS},\\clip({x0},0,{x1},{style.frame_h}))"
            f"\\t({REVEAL_MS},{REVEAL_MS + 1},\\clip(0,0,{style.frame_w},{style.frame_h}))"
            f"\\fad(0,{FADE_OUT_MS})")


def position_tag(style: Style) -> str:
    """Vertical offset for left/right text, which libass would otherwise always centre."""
    if style.middle and style.offset_y:
        return f"\\pos({round(style.center_x)},{style.frame_h // 2 - style.offset_y})"
    return ""


_GARBLED = re.compile(r"à¤|à¥|à²|à³|à®|à¯|à°|à±|à´|àµ|Ã[\x80-\xbf]|Â[\xa0-\xbf]")


def looks_garbled(text: str) -> bool:
    """UTF-8 lyrics that were decoded as Windows-1252 and saved again ("à¤¹à¤°à¥‡" instead of
    "हरे"). 119 Sanskrit SRTs were damaged this way by an old upload step; rendering or
    transliterating one spreads the garbage, so callers refuse them."""
    return len(_GARBLED.findall(text)) > 3


def frame_filter(fps: int | None = 24, frame_w: int = FRAME_W, frame_h: int = FRAME_H) -> str:
    """FFmpeg filters that fit any clip to the 1920x1080 frame the subtitles are laid out for
    (scale to cover, centre-crop). Preview and render must both use it, or a clip that isn't
    exactly 1080p gets letterboxed in one and not the other."""
    chain = f"scale={frame_w}:{frame_h}:force_original_aspect_ratio=increase,crop={frame_w}:{frame_h}"
    return chain + (f",fps={fps},format=yuv420p" if fps else "")


def ass_time(seconds: float) -> str:
    cs = int(round(seconds * 1000)) // 10  # centiseconds, truncated like the old ms[:2]
    h, rem = divmod(cs, 360000)
    m, rem = divmod(rem, 6000)
    s, cs = divmod(rem, 100)
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"


_TS = re.compile(r"(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})")


def parse_srt(content: str) -> list[tuple[float, float, str]]:
    """(start_s, end_s, text) per cue. Tolerates BOM, CRLF and missing index lines."""
    cues = []
    for block in re.split(r"\n\s*\n", content.lstrip("﻿").replace("\r\n", "\n").strip()):
        lines = block.strip().split("\n")
        for i, line in enumerate(lines):
            m = _TS.search(line)
            if not m:
                continue
            g = [int(x) for x in m.groups()[:3]] + [int(m.group(4).ljust(3, "0"))]
            h = [int(x) for x in m.groups()[4:7]] + [int(m.group(8).ljust(3, "0"))]
            start = g[0] * 3600 + g[1] * 60 + g[2] + g[3] / 1000
            end = h[0] * 3600 + h[1] * 60 + h[2] + h[3] / 1000
            text = "\n".join(lines[i + 1:]).strip()
            if text and end > start:
                cues.append((start, end, text))
            break
    return cues


_INDEX_LINE = re.compile(r"^\s*\d{1,5}\s*$")
_LOOSE_TIMING = re.compile(r"-->|^\s*\d{1,2}:\d{2}(:\d{2})?[,.]\d{1,3}\b")


def cue_texts(content: str) -> list[str]:
    """The text of each cue, read leniently: any index-looking or timing-looking line (even a
    malformed one, or one run into the previous cue with no blank line) starts a new cue, so
    SRT structure never ends up inside the lyrics."""
    texts: list[str] = []
    current: list[str] | None = None
    for line in content.replace("\r\n", "\n").lstrip("﻿").split("\n"):
        if _LOOSE_TIMING.search(line):
            if current is not None and any(current):
                texts.append("\n".join(l for l in current if l).strip())
            current = []
        elif current is None or _INDEX_LINE.match(line) or not line.strip():
            continue  # before the first cue, an index line, or a blank separator
        else:
            current.append(line.strip())
    if current is not None and any(current):
        texts.append("\n".join(l for l in current if l).strip())
    return texts


def timing_lines(content: str) -> list[str]:
    """The source's cue timings, verbatim, for cues that have text."""
    out, pending = [], None
    for line in content.replace("\r\n", "\n").lstrip("﻿").split("\n"):
        if _TS.search(line):
            pending = line.strip()
        elif pending and line.strip() and not _INDEX_LINE.match(line):
            out.append(pending)
            pending = None
    return out


def restamp(translated: str, source: str) -> tuple[str | None, str]:
    """Rebuild a transliterated SRT on the source's exact indexes and timings, so every language
    shares one timing. Returns (srt, "") or (None, reason) when the cues don't line up."""
    texts, timings = cue_texts(translated), timing_lines(source)
    if not timings:
        return None, "source has no readable timings"
    if len(texts) != len(timings):
        return None, f"{len(texts)} lines vs {len(timings)} in the source"
    blocks = [f"{i}\n{t}\n{x}" for i, (t, x) in enumerate(zip(timings, texts), 1)]
    return "\n\n".join(blocks) + "\n", ""


def longest_cue(cues: list[tuple[float, float, str]]) -> str:
    """The longest line: what the preview frame shows."""
    return max((c[2] for c in cues), key=lambda t: len(" ".join(t.split("\n"))), default="")


def build_ass(style: Style, cues: list[tuple[float, float, str]], animate: bool = True) -> str:
    """A complete ASS document for these cues."""
    ml, mr, mv = style.margins
    header = f"""[Script Info]
Title: Lahari lyric video
ScriptType: v4.00+
WrapStyle: 2
PlayResX: {style.frame_w}
PlayResY: {style.frame_h}
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,{style.font},{style.ass_size},{ass_color(style.color)},&H000000FF,{outline_color(style.color)},&H80000000,-1,0,0,0,100,100,0,0,1,{OUTLINE_PX},{SHADOW_PX},{style.preset['alignment']},{ml},{mr},{mv},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    pos = position_tag(style)
    events = []
    for start, end, text in cues:
        lines = wrap_lines(text)
        if not lines:
            continue
        tags = pos + (reveal_tags(lines, style) if animate else "")
        body = ("{" + tags + "}" if tags else "") + ass_text(lines)
        events.append(f"Dialogue: 0,{ass_time(start)},{ass_time(end)},Default,,0,0,0,,{body}")
    return header + "\n".join(events) + "\n"
