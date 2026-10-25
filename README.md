# OFAB Marching Band Competition Portal

Parents watch a competition performance and pick any judge to hear that judge's recorded commentary, kept in sync with the video.

**Live:** https://ofab-comp-portal.tblackwe.workers.dev (passcode-protected)

## How it works

| Piece | What it does |
| --- | --- |
| **Cloudflare Worker** ([worker/](worker)) | Serves the React app and streams media from R2 at `/media/*` (Range requests, so seeking works). Every request goes through it, so access is checked in one place. |
| **R2 bucket `judge-tape-media`** | Private storage for the video and judge tapes. It has no public URL; files are reachable only through the Worker. |
| **Passcode gate** ([worker/passcode.js](worker/passcode.js)) | Interim access control until Login with BAND. The passcode is stored in the `SITE_PASSCODE` Worker secret, never in the repo. A signed cookie keeps people signed in for 90 days. Pages are marked `noindex`. |
| **Performance list** (`performances.json` in the bucket) | The source of truth for what the site shows: performances, bucket keys, and each judge's `offset` and `gainDb`. The Worker serves it at `/api/performances` and refuses a broken file ([shared/manifest.js](shared/manifest.js) checks it). Bucket file names can be anything. Editing it needs no deploy. |
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

## Tests

```sh
npm test           # Worker tests: passcode gate, media streaming, performance list
npm run test:e2e   # Browser tests in Google Chrome: login, sync, volume, tune mode
```

- Worker tests run inside the Workers runtime against an in-memory bucket ([test/worker/](test/worker)).
- Browser tests start the site fully offline (`E2E=1`) with a local bucket seeded from [test/e2e/fixtures/](test/e2e/fixtures). They need Google Chrome installed, because Playwright's bundled Chromium can't play H.264/AAC.
- GitHub Actions runs lint, build and both test suites on every push and pull request.

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

No deploy is needed; the site reads the list from the bucket.

1. Upload the video and judge tapes to the `judge-tape-media` R2 bucket. Any folder and file names work.
   - Use MP4 (H.264/AAC) for the video and M4A or MP3 for the tapes; they play in every browser.
2. Get suggested offsets and gains:

   ```sh
   python3 scripts/align_offsets.py BandVideo.mp4 *.m4a
   ```

   This works by matching each tape against the band audio the judge's recorder picked up. It reports how many segments agreed; low agreement means check that judge by ear.
3. Download the current list, add an entry, and upload it:

   ```sh
   npm run manifest -- pull    # saves ./performances.json (gitignored)
   # edit performances.json
   npm run manifest -- push    # checks it, then uploads; live immediately
   ```

   An entry looks like this. `offset` is seconds into the tape when the video starts; `gainDb` evens out loudness (optional).

   ```json
   {
     "id": "2026-region-championship",
     "title": "Region Championship",
     "ensemble": "Odessa HS Band",
     "date": "2026-10-24",
     "video": { "key": "2026/Region Championship/BandVideo.mp4" },
     "judges": [
       { "id": "gem", "code": "GEM", "name": "General Effect – Music", "key": "2026/Region Championship/GEM.m4a", "offset": 38.82, "gainDb": -9.1 }
     ]
   }
   ```

4. Check each judge on the live site with `?tune` at the end of the URL:
   - Offset buttons (±1 s, ±0.1 s) shift the tape until the commentary lines up with the video.
   - Gain buttons (±1 dB) adjust loudness.
   - The box at the bottom shows the whole entry with your changes; paste it over the old entry in `performances.json` and push again.

Performances are listed newest first. When there is more than one, a picker appears automatically.

## Known gaps

- **Access:** one shared passcode, no per-user accounts or revocation, and no login rate limiting. Login with BAND will replace it.
- **Pushing `performances.json` doesn't check that the files exist in the bucket.** A typo in a key shows up as a video or tape that won't play.
- **Not yet verified on a real iPhone.**
- The favicon is only 16/32 px, so home-screen icons look poor.
