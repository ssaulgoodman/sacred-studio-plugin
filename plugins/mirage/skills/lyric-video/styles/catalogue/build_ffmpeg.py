#!/usr/bin/env python3
"""Build a catalogue lyric video as an FFmpeg job: the clip looped under the song with the
subtitles burned in by libass. This is the render path. build.mjs makes the matching
HyperFrames composition for the live preview; both follow render_style.py.

render_style.py keeps Echo's rendering logic (echo-live-wallpapers cloud/render_style.py,
commit 1f444ed), with frame and placement parameters. Mirror those parameters in Echo.

python3 build_ffmpeg.py --srt song_kan.srt --lang kan --clip loop.mp4 --audio song.wav --out ./job
  [--start 27 --duration 33] [--position right-third] [--size 100] [--color '#FFD4A3']
  [--offset-x 0] [--offset-y 0] [--tar]
For a Short use --format short --clip-asset <UUID> --clip-start 83 --clip-duration 30
instead of --clip. The range defaults to the same audio/SRT range.

Writes the bundle folder (clip, audio, fonts/, subtitles.ass, ffmpeg-job.json) and, with --tar,
the .tar.gz to upload with purpose composition_bundle for render_media. Measuring line widths for the
reveal uses HarfBuzz (`pip install uharfbuzz`); without it the reveal sweeps the placement box.
"""
from __future__ import annotations

import argparse
import json
import math
import uuid
import shutil
import subprocess
import sys
import tarfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import render_style as rs  # noqa: E402

FONT_FILES = {"san": "RozhaOne-Regular.ttf", "kan": "NotoSerifKannada.ttf", "tam": "NotoSerifTamil.ttf",
              "tel": "NotoSerifTelugu.ttf", "mal": "NotoSerifMalayalam.ttf"}
DEFAULT_SIZE = {"san": 120, "kan": 100, "tam": 120, "tel": 120, "mal": 120}


def probe_duration(path: Path) -> float:
    out = subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                                   "-of", "default=nw=1:nk=1", str(path)])
    return float(out.decode().strip())


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    for name in ("srt", "lang", "audio", "out"):
        p.add_argument(f"--{name}", required=True)
    clips = p.add_mutually_exclusive_group(required=True)
    clips.add_argument("--clip")
    clips.add_argument("--clip-asset")
    p.add_argument("--format", choices=("landscape", "short"), default="landscape")
    p.add_argument("--clip-start", type=float)
    p.add_argument("--clip-duration", type=float)
    p.add_argument("--start", type=float)
    p.add_argument("--duration", type=float)
    p.add_argument("--position", choices=sorted(rs.POSITIONS))
    p.add_argument("--size", type=int)
    p.add_argument("--color", default=rs.DEFAULT_COLOR)
    p.add_argument("--offset-x", type=int, default=0)
    p.add_argument("--offset-y", type=int, default=0)
    p.add_argument("--fade-in", type=float, help="Audio fade seconds; Short default 0.3, landscape 0; 0 disables")
    p.add_argument("--fade-out", type=float, help="Audio fade seconds; Short default 1.0, landscape 0; 0 disables")
    p.add_argument("--preview", nargs=2, action="append", metavar=("STILL", "SECONDS"),
                   help="Local still and time relative to the output; repeat for several proxy JPGs")
    p.add_argument("--tar", action="store_true")
    a = p.parse_args()
    if a.lang not in FONT_FILES:
        sys.exit(f"Unknown language {a.lang}; one of {', '.join(FONT_FILES)}")

    if a.clip_asset:
        try:
            a.clip_asset = str(uuid.UUID(a.clip_asset))
        except ValueError:
            p.error("--clip-asset must be a UUID")
    if not a.clip_asset and (a.clip_start is not None or a.clip_duration is not None):
        p.error("--clip-start and --clip-duration require --clip-asset")
    a.start = a.start if a.start is not None else (a.clip_start or 0.0)
    requested_duration = a.duration if a.duration is not None else a.clip_duration
    song = probe_duration(Path(a.audio))
    if not math.isfinite(song) or song <= 0 or not math.isfinite(a.start) or not 0 <= a.start < song:
        p.error("Audio start must be inside its duration")
    if requested_duration is not None and (not math.isfinite(requested_duration) or requested_duration <= 0):
        p.error("Duration must be positive and finite")
    dur = min(requested_duration if requested_duration is not None else song - a.start, song - a.start)
    clip_start = a.clip_start if a.clip_start is not None else a.start
    clip_duration = a.clip_duration if a.clip_duration is not None else dur
    if not math.isfinite(clip_start) or clip_start < 0 or not math.isfinite(clip_duration) or clip_duration < dur:
        p.error("Clip start must be nonnegative and clip duration must cover the audio range")
    short = a.format == "short"
    fades = [a.fade_in if a.fade_in is not None else (0.3 if short else 0),
             a.fade_out if a.fade_out is not None else (1.0 if short else 0)]
    if any(not math.isfinite(value) or value < 0 for value in fades):
        p.error("Audio fades must be finite and nonnegative; use 0 to disable")
    fade_in, fade_out = [min(value, dur) for value in fades]
    previews = []
    for still, timestamp in a.preview or []:
        try:
            at = float(timestamp)
        except ValueError:
            p.error("Preview time must be seconds relative to the output")
        if not math.isfinite(at) or not 0 <= at < dur or not Path(still).is_file():
            p.error("Preview needs an existing still and a time inside the output")
        previews.append((Path(still).resolve(), at))
    a.position = a.position or ("bottom-center" if short else rs.DEFAULT_POSITION)
    if short and a.position != "bottom-center":
        p.error("Short format uses bottom-center placement")
    out = Path(a.out).resolve()
    if out.exists() and any(out.iterdir()):
        p.error("Use an empty output folder so stale media cannot enter the bundle")
    (out / "fonts").mkdir(parents=True, exist_ok=True)
    # Measure with the exact files that will ship in the bundle.
    for code, name in FONT_FILES.items():
        rs.FONTS[code] = (rs.FONTS[code][0], str(HERE / "fonts" / name))
    shutil.copyfile(HERE / "fonts" / FONT_FILES[a.lang], out / "fonts" / FONT_FILES[a.lang])

    text = Path(a.srt).read_text(encoding="utf-8")
    if rs.looks_garbled(text):
        sys.exit("These lyrics are garbled (encoding damage); fix the SRT before rendering.")
    cues = [(max(0.0, s - a.start), min(dur, e - a.start), t) for s, e, t in rs.parse_srt(text)
            if e > a.start and s < a.start + dur]
    if not cues:
        sys.exit("No subtitle lines fall inside this range.")
    style = rs.Style(language=a.lang, position=a.position,
                     font_size=a.size or (round(DEFAULT_SIZE[a.lang] * 88 / 120) if short else DEFAULT_SIZE[a.lang]),
                     color=a.color, offset_x=a.offset_x, offset_y=a.offset_y,
                     frame_w=1080 if short else rs.FRAME_W, frame_h=1920 if short else rs.FRAME_H,
                     placement_presets={**rs.POSITIONS, "bottom-center": {
                         "alignment": 2, "margin_l": 100, "margin_r": 100, "margin_v": 430,
                     }} if short else None)
    (out / "subtitles.ass").write_text(rs.build_ass(style, cues), encoding="utf-8")

    clip = "mv.mp4" if a.clip_asset else "clip" + (Path(a.clip).suffix or ".mp4")
    if not a.clip_asset:
        shutil.copyfile(a.clip, out / clip)
    # The bundle carries only the range it renders, as AAC, so the job stays small and simple.
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", str(a.start), "-t", str(dur), "-i", a.audio,
                    "-vn", "-c:a", "aac", "-b:a", "192k", str(out / "song.m4a")], check=True)

    # The runner appends the output file; args stop at the last output option.
    input_args = (["-ss", f"{clip_start:.3f}", "-t", f"{clip_duration:.3f}", "-i", clip] if a.clip_asset
                  else ["-stream_loop", "-1", "-i", clip])
    if short:
        picture = ("[0:v]split=2[fill][picture];"
                   "[fill]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,"
                   "boxblur=30:2,eq=brightness=-0.18[bg];"
                   "[picture]scale=1080:-2[fg];"
                   "[bg][fg]overlay=(W-w)/2:(H-h)/2-160,setsar=1,fps=24,format=yuv420p,"
                   "ass=subtitles.ass:shaping=complex:fontsdir=fonts[v]")
        filter_args = ["-filter_complex", picture, "-map", "[v]", "-map", "1:a"]
    else:
        filter_args = ["-map", "0:v", "-map", "1:a", "-vf",
                       f"{rs.frame_filter()},ass=subtitles.ass:shaping=complex:fontsdir=fonts"]
    audio_filters = []
    if fade_in:
        audio_filters.append(f"afade=t=in:st=0:d={fade_in:.3f}")
    if fade_out:
        audio_filters.append(f"afade=t=out:st={dur - fade_out:.3f}:d={fade_out:.3f}")
    job = {
        **({"assets": [{"assetId": a.clip_asset, "as": clip, "role": "source_clip"}]} if a.clip_asset else {}),
        "args": [*input_args, "-i", "song.m4a", *filter_args,
                 "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-g", "48", "-pix_fmt", "yuv420p",
                 "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
                 *(["-af", ",".join(audio_filters)] if audio_filters else []),
                 "-c:a", "aac", "-b:a", "192k", "-t", f"{dur:.3f}", "-movflags", "+faststart"],
        "output": "output.mp4",
    }
    (out / "ffmpeg-job.json").write_text(json.dumps(job, indent=2) + "\n", encoding="utf-8")
    (out / "composition.json").write_text(json.dumps({
        "style": "catalogue", "engine": "ffmpeg", "format": a.format,
        "width": style.frame_w, "height": style.frame_h, "language": a.lang, "position": a.position,
        "size": style.font_size, "color": style.color, "offsetX": a.offset_x, "offsetY": a.offset_y,
        "range": {"start": a.start, "duration": dur}, "cues": len(cues),
        "audioFades": {"in": fade_in, "out": fade_out},
        "sources": {"srt": Path(a.srt).name, "clip": {"assetId": a.clip_asset, "start": clip_start, "duration": clip_duration} if a.clip_asset else Path(a.clip).name, "audio": Path(a.audio).name},
    }, indent=2) + "\n", encoding="utf-8")
    # Proxies use the exact render graph and ASS at the requested output time.
    # Keep them outside the bundle so they cannot become accidental render inputs.
    for index, (still, at) in enumerate(previews, 1):
        preview_dir = out.with_name(out.name + "-previews")
        preview_dir.mkdir(exist_ok=True)
        timestamp_filter = f"setpts=PTS+{at:.6f}/TB,ass="
        if short:
            graph = picture.replace("ass=", timestamp_filter).replace("[v]", ",scale=360:640[v]")
            filters = ["-filter_complex", graph, "-map", "[v]"]
        else:
            graph = filter_args[-1].replace("ass=", timestamp_filter) + ",scale=640:360"
            filters = ["-vf", graph]
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-loop", "1", "-i", str(still),
                        *filters, "-frames:v", "1", "-q:v", "2",
                        str(preview_dir / f"preview-{index:02d}.jpg")], cwd=out, check=True)
    if a.tar:
        with tarfile.open(f"{out}.tar.gz", "w:gz", format=tarfile.PAX_FORMAT) as tar:
            for item in sorted(out.rglob("*")):
                tar.add(item, arcname=str(item.relative_to(out)), recursive=False)
    print(f"{len(cues)} lines, {dur:.1f} s, {style.font} {style.ass_size}, {a.position} -> {out}")


if __name__ == "__main__":
    main()
