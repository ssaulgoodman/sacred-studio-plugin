"""Offline builder contracts. Audio probing/encoding are faked; fonts and ASS are real."""
import json
import io
import subprocess
from pathlib import Path
import socket
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch

import build_ffmpeg as build
import render_style as rs

ASSET = "11111111-1111-4111-8111-111111111111"


class Builder(unittest.TestCase):
    def build_job(self, extra, language="tel"):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "song.srt").write_text("1\n00:01:23,000 --> 00:01:25,000\nతెలుగు పంక్తి\n\n2\n00:01:52,000 --> 00:01:55,000\nమరొక పంక్తి\n", encoding="utf-8")
            (root / "clip.mp4").write_bytes(b"fake clip")
            out = root / "job"
            argv = ["build_ffmpeg.py", "--srt", str(root / "song.srt"), "--lang", language,
                    "--audio", str(root / "song.wav"), "--out", str(out), "--tar", *extra]
            if "--clip-asset" not in argv:
                argv += ["--clip", str(root / "clip.mp4")]

            def encode(args, **kwargs):
                self.assertEqual(args[args.index("-ss") + 1], "83.0")
                self.assertEqual(args[args.index("-t") + 1], "30.0")
                Path(args[-1]).write_bytes(b"fake audio range")

            with patch.object(sys, "argv", argv), patch.object(build, "probe_duration", return_value=180), \
                    patch.object(build.subprocess, "run", side_effect=encode), patch.object(rs, "text_width", return_value=None), \
                    patch.object(sys, "stdout", io.StringIO()), patch.object(sys, "stderr", io.StringIO()):
                build.main()
            with tarfile.open(str(out) + ".tar.gz") as bundle:
                names = bundle.getnames()
            job = json.loads((out / "ffmpeg-job.json").read_text())
            # Exercise the exact runner validator on the generated graph and asset names.
            checked = subprocess.run(["node", str(build.HERE.parents[5] / "runners/hyperframes/ffmpeg.ts")],
                                     input=json.dumps({"job": {"args": job["args"], "output": job["output"]},
                                                       "assetNames": [a["as"] for a in job.get("assets", [])]}),
                                     text=True, capture_output=True, check=True)
            self.assertEqual(json.loads(checked.stdout)["args"], job["args"])
            return job, (out / "subtitles.ass").read_text(), names

    def test_short_fetches_full_video_and_seeks(self):
        job, ass, names = self.build_job(["--format", "short", "--clip-asset", ASSET, "--clip-start", "83", "--clip-duration", "30"])
        self.assertEqual(job["assets"], [{"assetId": ASSET, "as": "mv.mp4", "role": "source_clip"}])
        self.assertEqual(job["args"][:6], ["-ss", "83.000", "-t", "30.000", "-i", "mv.mp4"])
        self.assertNotIn("-stream_loop", job["args"])
        self.assertIn("PlayResX: 1080", ass)
        self.assertIn("PlayResY: 1920", ass)
        self.assertIn("Style: Default,Noto Serif Telugu,88,&H00A3D4FF", ass)
        self.assertIn(",3,5,2,100,100,430,1", ass)
        self.assertIn(r"\clip(100,0,100,1920)\t(0,800,\clip(100,0,980,1920))", ass)
        self.assertIn("Dialogue: 0,0:00:00.00,0:00:02.00", ass)
        self.assertIn("Dialogue: 0,0:00:29.00,0:00:30.00", ass)
        graph = job["args"][job["args"].index("-filter_complex") + 1]
        for expected in ("scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920", "boxblur=30:2,eq=brightness=-0.18",
                         "[picture]scale=1080:-2[fg]", "overlay=(W-w)/2:(H-h)/2-160", "ass=subtitles.ass:shaping=complex:fontsdir=fonts"):
            self.assertIn(expected, graph)
        self.assertFalse(any(name.endswith(".mp4") for name in names))
        self.assertEqual(set(names), {"composition.json", "ffmpeg-job.json", "fonts", "fonts/NotoSerifTelugu.ttf", "song.m4a", "subtitles.ass"})

    def test_language_sizes_and_local_short(self):
        for lang, size in build.DEFAULT_SIZE.items():
            with self.subTest(lang=lang):
                job, ass, names = self.build_job(["--format", "short", "--start", "83", "--duration", "30"], lang)
                expected = int(round(size * 88 / 120) * rs.SIZE_MULTIPLIER[lang])
                self.assertIn(f"Style: Default,{rs.FONTS[lang][0]},{expected},", ass)
                self.assertIn("clip.mp4", names)
                self.assertNotIn("assets", job)

    def test_landscape_defaults_preserved(self):
        job, ass, _ = self.build_job(["--start", "83", "--duration", "30"])
        self.assertIn("PlayResX: 1920", ass)
        self.assertIn("PlayResY: 1080", ass)
        self.assertIn("Style: Default,Noto Serif Telugu,120,", ass)
        self.assertIn(",3,5,5,920,150,50,1", ass)
        self.assertIn(r"\clip(920,0,920,1080)\t(0,800,\clip(920,0,1770,1080))", ass)
        self.assertEqual(job["args"][:4], ["-stream_loop", "-1", "-i", "clip.mp4"])
        self.assertEqual(rs.frame_filter(), "scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,fps=24,format=yuv420p")
        self.assertEqual(rs.wrap_lines("one two three four five six"), ["one two three four", "five six"])

    def test_audio_fades(self):
        short = ["--format", "short", "--clip-asset", ASSET, "--clip-start", "83", "--clip-duration", "30"]
        job, _, _ = self.build_job(short)
        self.assertEqual(job["args"][job["args"].index("-af") + 1],
                         "afade=t=in:st=0:d=0.300,afade=t=out:st=29.000:d=1.000")
        job, _, _ = self.build_job(short + ["--fade-in", "0", "--fade-out", "0"])
        self.assertNotIn("-af", job["args"])
        job, _, _ = self.build_job(short + ["--fade-in", "0.5", "--fade-out", "2"])
        self.assertIn("afade=t=in:st=0:d=0.500,afade=t=out:st=28.000:d=2.000", job["args"])
        job, _, _ = self.build_job(["--start", "83", "--duration", "30"])
        self.assertNotIn("-af", job["args"])
        for bad in ("nan", "-1", "inf"):
            with self.assertRaises(SystemExit):
                self.build_job(short + ["--fade-in", bad])

    @unittest.skipUnless(build.shutil.which("ffmpeg"), "local FFmpeg needed for preview smoke")
    def test_real_proxy_frames_use_output_timestamps(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            run = lambda args: subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *args], check=True)
            run(["-f", "lavfi", "-i", "color=c=blue:s=320x180", "-frames:v", "1", str(root / "still.jpg")])
            run(["-f", "lavfi", "-i", "anullsrc", "-t", "3", str(root / "song.wav")])
            (root / "song.srt").write_text("1\n00:00:00,000 --> 00:00:01,500\nसर्वसिद्धि विनायक\n", encoding="utf-8")
            argv = ["build_ffmpeg.py", "--format", "short", "--srt", str(root / "song.srt"), "--lang", "san",
                    "--audio", str(root / "song.wav"), "--out", str(root / "job"), "--clip-asset", ASSET,
                    "--preview", str(root / "still.jpg"), "1", "--preview", str(root / "still.jpg"), "2", "--tar"]
            with patch.object(sys, "argv", argv), patch.object(sys, "stdout", io.StringIO()):
                build.main()
            frames = sorted((root / "job-previews").glob("*.jpg"))
            self.assertEqual(len(frames), 2)
            self.assertNotEqual(frames[0].read_bytes(), frames[1].read_bytes(), "ASS must evaluate at each output timestamp")
            with tarfile.open(root / "job.tar.gz") as archive:
                self.assertFalse(any(name.endswith(".jpg") for name in archive.getnames()))

    def test_bad_ranges(self):
        for options in (["--clip-start", "-1"], ["--clip-start", "nan"], ["--clip-duration", "0"],
                        ["--clip-duration", "inf"], ["--clip-start", "180"], ["--clip-duration", "1", "--duration", "30"]):
            with self.subTest(options=options), self.assertRaises(SystemExit):
                self.build_job(["--clip-asset", ASSET, *options])


if __name__ == "__main__":
    with patch.object(socket.socket, "connect", side_effect=AssertionError("Network forbidden")):
        unittest.main()
