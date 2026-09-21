# JTrader — session handoff (2026-09-21 → 22)

Where things stand, so tomorrow's session can pick up without re-reading the whole chat.

## Branch state

Working on `home-full-platform`, **not** `main`. Commits this session, newest first:

```
2b0058e Raise video upload limit to 5GB, R2's actual single-PUT ceiling
0359011 Make the watermark drift continuously instead of jumping between points
e35c2d4 Simplify video watermark, fix it disappearing in fullscreen
e82b531 Upload videos directly to R2, bypassing the platform's 100KiB body cap
00f3106 Upload lesson videos to R2 in chunks, with a progress bar   (superseded by e82b531)
0159a3e Merge origin/main, keeping the local implementation
a94b5d8 Harden OTP generation, drop stale route files, rotate admin password
964a056 Full JTrader course platform: admin, courses, payments, auth
```

`origin/main` on GitHub is 3 commits behind and holds an **older, insecure parallel
implementation** of Razorpay checkout (no signature verification). The merge in
`0159a3e` recorded those commits as ancestors without taking any of their content —
confirmed byte-identical tree before/after. Fast-forwarding `main` to this branch is
safe whenever you're ready to push.

**Nothing has been pushed to GitHub yet.** The repo `github.com/Jeya150/jtrader` is
still **public**, and the initial commit already contains an old admin password hash
(migration `0004`). See "Still open" below before pushing.

## What was fixed tonight

1. **Video upload was failing with 413.** Root cause took two attempts to find:
   - First attempt: assumed it was Cloudflare's request body limit, built chunked
     multipart upload through the Worker. Still failed.
   - Real cause (found by binary-searching the live endpoint): `jtrader.in` sits
     behind a platform gateway that hard-caps **every** request body at exactly
     **102,400 bytes (100 KiB)** — confirmed empirically, not documented anywhere.
     That's 50x below R2's 5 MiB multipart-part minimum, so no chunk size posted
     through the Worker could ever work.
   - **Fix:** the browser now uploads directly to R2 using a presigned S3-compatible
     URL (`/api/upload?action=presign` in `src/routes/api/upload.ts`), which never
     touches jtrader.in's gateway. Verified end-to-end against the live site.
   - Upload limit raised to **5GB** (R2's actual single-PUT ceiling). Presigned URL
     valid for 12 hours to survive slow connections.

2. **Video seeking was broken.** `src/routes/api/video.ts` didn't support HTTP
   `Range` requests, so scrubbing a long lesson restarted playback from 0. Fixed —
   now returns 206 Partial Content and honors `Range`.

3. **Watermark overlay simplified** (`src/components/watermarked-video.tsx`):
   - Removed the "Protected Content" click-through gate and the fake
     "Recording Detected" popup (Page Visibility firing on tab-switch, no actual
     detection behind it).
   - Removed the persistent footer disclaimer bar.
   - Collapsed 5 watermark elements into 1, shows name + email + phone.
   - Fixed: native fullscreen only fullscreens `<video>` itself, and the watermark
     is a sibling, not a descendant — so it vanished in fullscreen. Now fullscreens
     the wrapping container instead (custom ⛶ button), and intercepts native
     fullscreen if it fires anyway.
   - Motion: was snapping between 8 fixed points every 3s (looked like it
     disappeared/reappeared). Now moves continuously every frame along a
     Lissajous-style curve with a per-viewer random phase.

4. **Security cleanup:**
   - OTP generation was using `Math.random()` (predictable) — switched to
     `crypto.getRandomValues`.
   - Deleted `index-before-*.tsx` files that TanStack's router had silently
     registered as **live public routes** serving stale homepage copies.
   - Admin password **rotated** (migration `0017`, applied to remote D1). New
     password: given to you directly in chat, not stored in any file — make sure
     it's in your password manager.

## Infra changes made outside git (won't show in `git diff`)

- **R2 API token created** (Cloudflare dashboard → R2 → Manage API Tokens →
  `jtrader-upload`, Object Read & Write, scoped to `jtrader-storage`). Access Key ID
  and Secret are stored as **Worker secrets** (`R2_ACCESS_KEY_ID`,
  `R2_SECRET_ACCESS_KEY`, `R2_ACCOUNT_ID`) via `wrangler secret put` — not in any
  file, not in `.dev.vars`, not in the repo. If you ever need to rotate them,
  regenerate in the dashboard and re-run `wrangler secret put <NAME>`.
- **CORS rule added** to the `jtrader-storage` R2 bucket allowing `PUT` from
  `jtrader.in`, `www.jtrader.in`, and local dev origins — needed for the browser to
  PUT directly to R2's S3 endpoint.
- **Deployed to production 4 times** tonight via `bunx wrangler deploy`. Current
  live version: `4f0cd337` (5GB limit). All of the above fixes are live now, not
  just committed.

## Still open — needs your decision

1. **GitHub repo is still public.** The old admin password hash is permanently in
   its history (migration `0004`, first commit). Rotating fixed the *live* risk;
   making the repo private (Settings → Danger Zone) only stops *new* exposure —
   anything already cloned/indexed is out regardless.
2. **This branch isn't pushed anywhere.** It only exists on this machine (and
   inside tonight's zip). If this laptop has an issue before you push, the work is
   gone. Consider pushing to a branch (not `main`) even before deciding on repo
   privacy.
3. Local `wrangler dev` had a login hang unrelated to any of tonight's fixes
   (reproduced twice, gave up debugging it per your call to move fast). Worth a
   fresh look sometime if local dev matters to you — for now, all verification has
   been done against the live production site directly.

## Quick start tomorrow

```
bun install
bun run typecheck   # should be clean
bunx vite build     # should be clean
```

To deploy again: `bunx wrangler deploy` (you're already authenticated on this
machine; a new machine needs `wrangler login` first).

`.dev.vars` in this zip has your local Razorpay test keys — keep the zip itself
somewhere private, don't upload it anywhere public.
