# OFAB Marching Band Competition Portal

Parents watch a competition performance and pick any judge to hear that judge's recorded commentary, kept in sync with the video.

**Live:** https://ofab-comp-portal.tblackwe.workers.dev (passcode-protected)

## How it works

| Piece | What it does |
| --- | --- |
| **Cloudflare Worker** ([worker/](worker)) | Serves the React app and streams media from R2 at `/media/*` (Range requests, so seeking works). Every request goes through it, so access is checked in one place. |
| **R2 bucket `judge-tape-media`** | Private storage for the video and judge tapes. It has no public URL; files are reachable only through the Worker. |
| **Passcode gate** ([worker/passcode.js](worker/passcode.js)) | Interim access control until Login with BAND. The passcode is stored in the `SITE_PASSCODE` Worker secret, never in the repo. A signed cookie keeps people signed in for 90 days. Pages are marked `noindex`. |
| **Performance list** (`performances.json` in the bucket) | The source of truth for what the site shows: performances, bucket keys, and each judge's `offset` and `gainDb`. The Worker serves published ones at `/api/performances` and refuses a broken file ([shared/manifest.js](shared/manifest.js) checks it). Editing it needs no deploy. |
| **Admin page** (`/admin`, [src/admin/](src/admin), [worker/admin.js](worker/admin.js)) | Behind a separate `ADMIN_PASSCODE` (7-day session). Uploads files to R2 through the Worker in 10 MiB parts, suggests offsets and gains in the browser ([src/lib/align.js](src/lib/align.js)), previews with nudge buttons, and saves drafts or publishes. Writes to the list are checked and retried if two saves collide. |
| **Synced player** ([src/useSyncedAudio.js](src/useSyncedAudio.js)) | The video is the clock; the judge `<audio>` follows it (`tapeTime = videoTime + offset`) across play, pause, seek, buffering and speed changes. |
| **Volume** ([src/judgeAudio.js](src/judgeAudio.js)) | Web Audio gain per tape (`gainDb`) evens out loudness, a limiter catches peaks, and a slider saves each parent's level. Web Audio is needed because iOS ignores `audio.volume`. |

## Prerequisites

- Node 22+
- A Cloudflare account with access to the `judge-tape-media` bucket (`npx wrangler login`)
- Optional, for [scripts/align_offsets.py](scripts/align_offsets.py): Python 3, `numpy`, and `ffmpeg` on PATH

## Run locally

```sh
npm install
npx wrangler login                          # once; dev reads the real R2 bucket
printf 'SITE_PASSCODE=<passcode>\nADMIN_PASSCODE=<admin password>\n' > .dev.vars # once; gitignored
npm run dev
```

`npm run dev` uses the **real** bucket, so uploads and publishes on the local admin page are live. To try the admin page safely, run `E2E=1 npx vite` instead (offline bucket in `.wrangler/e2e`).

`npm run lint` runs oxlint. `npm run build` builds into `dist/`.

## Tests

```sh
npm test           # Worker tests (gates, media, list, admin API) and unit tests (alignment, judge helpers)
npm run test:e2e   # Browser tests in Google Chrome: login, sync, volume, tune mode, admin upload → publish → delete
```

- Worker tests run inside the Workers runtime against an in-memory bucket ([test/worker/](test/worker)).
- Browser tests start the site fully offline (`E2E=1`) with a local bucket seeded from [test/e2e/fixtures/](test/e2e/fixtures). They need Google Chrome installed, because Playwright's bundled Chromium can't play H.264/AAC.
- GitHub Actions runs lint, build and both test suites on every push and pull request.

## Deploy

```sh
npm run deploy
```

Deploys are manual from your machine. Pushing to GitHub does not deploy.

To change a password (this signs everyone using it out):

```sh
npx wrangler secret put SITE_PASSCODE   # parents
npx wrangler secret put ADMIN_PASSCODE  # admin page; until it is set, /admin returns 404
```

To watch live traffic: `npx wrangler tail`, or the dashboard under Workers & Pages → ofab-comp-portal → Metrics.

## Adding a performance

Use the admin page: https://ofab-comp-portal.tblackwe.workers.dev/admin

1. **New performance** → enter the title and date (they set the folder: `<year>/<date-title>/`).
2. **Choose video**, then **Add judge tapes** (pick them all at once). Uploads start immediately; keep the tab open until they finish.
   - Use MP4 (H.264/AAC) for the video and M4A or MP3 for the tapes; they play in every browser.
   - The judge code is guessed from the end of each file name (`…-GEM.m4a` → GEM, General Effect – Music). Fix any that are wrong.
3. **Auto-align** suggests each tape's offset and gain by matching it against the band audio the judge's recorder picked up (about a minute for a full show). "Weak match" means check that judge by ear.
4. In the preview, pick a judge, play, and use the ±1 s / ±0.1 s / ±1 dB buttons until it lines up. You can also type values.
5. **Save draft** (only admins see it) or **Publish** (parents see it right away). Published performances can be edited, unpublished, or deleted (optionally with their files).

`offset` is seconds into the tape when the video starts; `gainDb` evens out loudness.

### Without the admin page

The list can still be edited by hand: `npm run manifest -- pull`, edit `performances.json` (gitignored), then `npm run manifest -- push` (checks it, then uploads). Upload media with the Cloudflare dashboard or `wrangler r2 object put`. [scripts/align_offsets.py](scripts/align_offsets.py) (Python 3, `numpy`, `ffmpeg`) is the command-line version of auto-align, and `?tune` on the parent site shows nudge buttons and a paste-ready entry. A performance with `"published": false` is a draft.

## Known gaps

- **Access:** one shared passcode, no per-user accounts or revocation, and no login rate limiting. Login with BAND will replace it.
- **Hand-pushed `performances.json` isn't checked for missing files** (the admin page does check). A typo in a key shows up as a video or tape that won't play.
- **Files replaced or removed on the admin page stay in the bucket** unless the performance is deleted with its files.
- **Not yet verified on a real iPhone.**
- The favicon is only 16/32 px, so home-screen icons look poor.
