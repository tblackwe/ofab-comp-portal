# OFAB Marching Band Competition Portal

Parents watch a competition performance and pick any judge to hear that judge's recorded commentary, kept in sync with the video.

**Live:** https://ofab-comp-portal.tblackwe.workers.dev (passcode-protected)

## How it works

| Piece | What it does |
| --- | --- |
| **Cloudflare Worker** ([worker/](worker)) | Serves the React app and streams media from R2 at `/media/*` (Range requests, so seeking works). Every request goes through it, so access is checked in one place. |
| **R2 bucket `judge-tape-media`** | Private storage for the video and judge tapes. It has no public URL; files are reachable only through the Worker. |
| **Passcode gate** ([worker/passcode.js](worker/passcode.js)) | Interim access control until Login with BAND. The passcode is stored in the `SITE_PASSCODE` Worker secret, never in the repo. A signed cookie keeps people signed in for 90 days. Pages are marked `noindex`. |
| **Metadata** ([src/data/performances.js](src/data/performances.js)) | The source of truth for what the site shows: performances, bucket keys, and each judge's `offset` and `gainDb`. Bucket file names can be anything. |
| **Synced player** ([src/useSyncedAudio.js](src/useSyncedAudio.js)) | The video is the clock; the judge `<audio>` follows it (`tapeTime = videoTime + offset`) across play, pause, seek, buffering and speed changes. |
| **Volume** ([src/judgeAudio.js](src/judgeAudio.js)) | Web Audio gain per tape (`gainDb`) evens out loudness, a limiter catches peaks, and a slider saves each parent's level. Web Audio is needed because iOS ignores `audio.volume`. |

## Prerequisites

- Node 22+
- A Cloudflare account with access to the `judge-tape-media` bucket (`npx wrangler login`)
- For [scripts/align_offsets.py](scripts/align_offsets.py): Python 3, `numpy`, and `ffmpeg` on PATH

## Run locally

```sh
npm install
npx wrangler login                          # once; dev reads the real R2 bucket
echo 'SITE_PASSCODE=<passcode>' > .dev.vars # once; gitignored
npm run dev
```

`npm run lint` runs oxlint. `npm run build` builds into `dist/`.

## Deploy

```sh
npm run deploy
```

Deploys are manual from your machine. Pushing to GitHub does not deploy.

To change the passcode (this signs everyone out):

```sh
npx wrangler secret put SITE_PASSCODE
```

To watch live traffic: `npx wrangler tail`, or the dashboard under Workers & Pages → ofab-comp-portal → Metrics.

## Adding a performance

1. Upload the video and judge tapes to the `judge-tape-media` R2 bucket. Any folder and file names work.
   - Use MP4 (H.264/AAC) for the video and M4A or MP3 for the tapes; they play in every browser.
2. Get suggested offsets and gains:

   ```sh
   python3 scripts/align_offsets.py BandVideo.mp4 *.m4a
   ```

   This works by matching each tape against the band audio the judge's recorder picked up. It reports how many segments agreed; low agreement means check that judge by ear.
3. Add an entry to [src/data/performances.js](src/data/performances.js) with the bucket keys and the suggested `offset` and `gainDb` values.
4. Run `npm run dev`, open the site with `?tune` in the URL, and check each judge:
   - Offset buttons (±1 s, ±0.1 s) shift the tape until the commentary lines up with the video.
   - Gain buttons (±1 dB) adjust loudness.
   - Copy the JSON from the tune panel back into `performances.js`.
5. `npm run deploy`.

When there is more than one performance, a picker appears automatically.

## Known gaps

- **Access:** one shared passcode, no per-user accounts or revocation, and no login rate limiting. Login with BAND will replace it.
- **No automated tests or CI.** Changes are checked by hand in a browser.
- **Adding a performance needs a code change and deploy,** because the metadata lives in the app bundle.
- **Not yet verified on a real iPhone.**
- The favicon is only 16/32 px, so home-screen icons look poor.
