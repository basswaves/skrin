# Proofs the release re-runs (round 10)

Everything uses **made-up files** (no titles, no personal paths). Make them
first, once:

    py scripts/make-timing-clip.py <scratch>/film 2.5 12       # film with a built-in subtitle + a shifted .srt
    # beside it, a library folder:  <scratch>/lib/Movies/Proof Film (2001)/
    #   Proof Film (2001).mkv (the clip) + Proof Film (2001).shifted.srt + theme.mp3 (any tune)
    #   + Extras/Making of.mkv (any short video)        (ffmpeg makes all of them)

| Proof | How | Pass |
|---|---|---|
| Fix timing, built-in subtitle reference | CI: `scripts/smoke.sh` (second case) · Windows: `windows-details-and-timing.kinema-run.json` step "built-in ref" · Linux: `linux-proof.sh` | outcome `fixed`, delay −2.5 s ±0.1, reference `subtitles` |
| Extras play, Back returns | `windows-details-and-timing.kinema-run.json` | extra's label in the player, page heading after Esc |
| Theme music on / off / stops | same plan (needs the page `Audio` hook it installs) | no audio off; time advances on; paused after leaving |
| Seek preview by mouse (hover) | `windows-seek-preview.kinema-run.json` (hover events inside the page) · Linux: `linux-proof.sh` (mpv `mouse` commands) | 320 px picture, nearest-ten-seconds time, memory flat |

Windows: `npm run app:build:test`, `kinema_app start fresh`, paste the plan's
`steps` into one `kinema_run` (replace `{CLIPS}` with the scratch folder).
**Silent and closed:** mute before any `play` (volume 0, check `ao-mute`), keep
runs short, `kinema_app stop` when done (the owner's rule on this PC).
Linux test PC: `scp` the RPM, the clip and `linux-proof.sh`, then run it
(it uses its own data dir under ~/kinema-test/p10).
