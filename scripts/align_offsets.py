#!/usr/bin/env python3
"""Suggest offset and gainDb for each judge tape.

offset: cross-correlates each tape with the video's audio (judge recorders pick up the band).
        Seconds into the tape when the video starts (tapeTime = videoTime + offset).
gainDb: loudness correction so every tape plays at TARGET_LUFS.

Usage: python3 scripts/align_offsets.py BandVideo.mp4 tape1.m4a tape2.m4a ...
Requires: ffmpeg on PATH, numpy.
"""
import os
import subprocess
import sys

import numpy as np

SR = 8000
HOP = 160
FPS = SR / HOP
SEGMENT_SECONDS = 60
TARGET_LUFS = -16.0


def load(path):
    raw = subprocess.run(
        ['ffmpeg', '-v', 'error', '-i', path, '-ac', '1', '-ar', str(SR),
         '-af', 'highpass=f=60,lowpass=f=1500', '-f', 'f32le', '-'],
        capture_output=True, check=True,
    ).stdout
    return np.frombuffer(raw, dtype=np.float32)


def loudness(path):
    out = subprocess.run(
        ['ffmpeg', '-nostats', '-hide_banner', '-i', path, '-af', 'ebur128', '-f', 'null', '-'],
        capture_output=True, text=True, check=True,
    ).stderr
    summary = out[out.rindex('Summary:'):]
    return float(summary.split('I:')[1].split()[0])


def spectral_flux(x, nfft=1024):
    n = (len(x) - nfft) // HOP
    idx = np.arange(nfft)[None, :] + HOP * np.arange(n)[:, None]
    spec = np.abs(np.fft.rfft(x[idx] * np.hanning(nfft), axis=1))
    edges = np.unique(np.geomspace(4, spec.shape[1] - 1, 33).astype(int))
    bands = np.log1p(np.stack([spec[:, a:b].sum(1) for a, b in zip(edges[:-1], edges[1:])], 1) * 10)
    flux = np.maximum(np.diff(bands, axis=0), 0)
    return (flux - flux.mean(0)) / (flux.std(0) + 1e-9)


def xcorr(a, b):
    n = 1 << int(np.ceil(np.log2(len(a) + len(b))))
    total = sum(np.fft.irfft(np.fft.rfft(a[:, k], n) * np.conj(np.fft.rfft(b[:, k], n)), n) for k in range(a.shape[1]))
    lags = np.arange(n)
    lags[lags > n // 2] -= n
    return total, lags


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    video = spectral_flux(load(sys.argv[1]))
    seg = int(SEGMENT_SECONDS * FPS)
    for tape_path in sys.argv[2:]:
        tape = spectral_flux(load(tape_path))
        corr, lags = xcorr(tape, video)
        offset = lags[np.argmax(corr)] / FPS
        # Confidence: how many 60s video segments independently agree (within 0.5s).
        votes = []
        for start in range(0, len(video) - seg, seg):
            chunk = np.vstack([np.zeros((start, video.shape[1])), video[start:start + seg]])
            c, l = xcorr(tape, chunk)
            votes.append(abs(l[np.argmax(c)] / FPS - offset) < 0.5)
        gain_db = round(TARGET_LUFS - loudness(tape_path), 1)
        print(f'{os.path.basename(tape_path):40s} offset: {offset:6.2f}, gainDb: {gain_db:5.1f}'
              f'   (segments agreeing {sum(votes)}/{len(votes)})')


if __name__ == '__main__':
    main()
