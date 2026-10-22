#!/usr/bin/env python3
"""Beat times and strengths for a song excerpt, relative to its start.

python3 beats.py song.wav --start 27 --duration 30  ->  {"beats":[{"t":0.52,"s":0.81},...]}
Strength is the onset strength at the beat, scaled to 0..1 within the excerpt.
"""
import argparse, json
import librosa
import numpy as np

p = argparse.ArgumentParser()
p.add_argument("audio"); p.add_argument("--start", type=float, default=0); p.add_argument("--duration", type=float)
a = p.parse_args()
y, sr = librosa.load(a.audio, sr=22050, mono=True, offset=a.start, duration=a.duration)
env = librosa.onset.onset_strength(y=y, sr=sr)
_, frames = librosa.beat.beat_track(onset_envelope=env, sr=sr)
times = librosa.frames_to_time(frames, sr=sr)
strength = env[frames] if len(frames) else np.array([])
top = float(strength.max()) if len(strength) else 1.0
print(json.dumps({"beats": [{"t": round(float(t), 3), "s": round(float(s) / top, 3)} for t, s in zip(times, strength)]}))
