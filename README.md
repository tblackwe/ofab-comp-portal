# Judge Tape Portal

Parents pick a performance, watch the band video, and listen to any judge's commentary in sync.

- **Site + API:** a Cloudflare Worker that serves the React app (static assets) and `/media/*`.
- **Media:** private R2 bucket `judge-tape-media`, streamed through the Worker (supports seeking). The bucket has no public URL.
- **Access:** a shared passcode (interim until Login with BAND). Every page, asset and file is gated; the passcode lives in the `SITE_PASSCODE` Worker secret, never in the repo. Search engines are told not to index.
- **Metadata:** [src/data/performances.js](src/data/performances.js) is the source of truth. File names in the bucket can be anything.

## Run locally

```sh
npm install
npx wrangler login   # once; dev reads the real R2 bucket
echo 'SITE_PASSCODE=<passcode>' > .dev.vars   # once; gitignored
npm run dev
```

## Deploy

```sh
npm run deploy
```

To change the passcode (signs everyone out): `npx wrangler secret put SITE_PASSCODE`

## Adding a performance

1. Upload the video and judge tapes to R2 (any folder/names).
2. Add an entry to `src/data/performances.js` with the bucket keys.
3. Set each judge's `offset` (seconds into the tape when the video starts). Open the site with `?tune`, pick a judge, nudge until it lines up, and copy the values back into the file.

To get suggested offsets and gains automatically (needs `ffmpeg` and `numpy`):

```sh
python3 scripts/align_offsets.py BandVideo.mp4 *.m4a
```
