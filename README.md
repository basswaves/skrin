<p align="center">
  <img src="src-tauri/icons/icon.svg" width="112" alt="Skrin's icon">
</p>

<h1 align="center">Skrin</h1>

<p align="center">
  <b>Your films. Set up right, by itself.</b><br>
  A free, Netflix-style library and player for the movies and shows already on
  your disk or NAS — with no server, no account and no settings maze.
</p>

<p align="center">
  <a href="https://github.com/basswaves/skrin/releases/latest"><img src="https://img.shields.io/github/v/release/basswaves/skrin?style=flat&color=ff5a00" alt="Latest release"></a>
  <a href="https://github.com/basswaves/skrin/actions/workflows/ci.yml"><img src="https://github.com/basswaves/skrin/actions/workflows/ci.yml/badge.svg" alt="Build"></a>
  <a href="docs/PLATFORMS.md"><img src="https://img.shields.io/badge/runs_on-Windows_11_%7C_Linux_%7C_Android_TV-16171D?style=flat" alt="Runs on Windows 11, Linux and Android TV"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/basswaves/skrin?style=flat&color=16171D" alt="Licence: MIT"></a>
</p>

<p align="center">
  <a href="https://github.com/basswaves/skrin/releases/latest"><b>Download</b></a> ·
  <a href="#install">Install</a> ·
  <a href="docs/FEATURES.md">Everything it does</a> ·
  <a href="docs/TROUBLESHOOTING.md#testing-it-and-giving-feedback">Give feedback</a> ·
  <a href="https://skrin.org/">skrin.org</a>
</p>

<!-- Three wide shots (docs/images/README.md). A fourth wide one (the player
     with the playback details panel open) could make this a 2x2 grid. -->
<p align="center">
  <img src="docs/images/home.jpg" width="100%" alt="Home: a full-width backdrop for a title from the library, with rails of posters beneath it">
</p>
<p align="center">
  <img src="docs/images/detail.jpg" width="49%" alt="A 4K HDR film's page: poster, description, scores, and badges for the picture, sound and file">
  <img src="docs/images/player.jpg" width="49%" alt="The player: the film's title and end time at the top, the seek bar and controls beneath the picture">
</p>

*Skrin was called Kinema until version 0.17.0. Installing Skrin over Kinema
keeps your library and settings.*

## Plays it right

- **The screen matches the film.** Its refresh rate for smooth 24p, and HDR
  switched on for an HDR film.
- **Atmos, DTS:X and TrueHD reach the receiver untouched**, when the receiver
  takes them.
- **It asks your equipment first.** A few plain questions on the first run, each
  with what it gives and what it costs, and each skippable.
- **Press `i` and it shows its working.** The display's real refresh rate, the
  frame cadence, which scaler ran and why, and the colour pipeline end to end.

  <img src="docs/images/stats.png" width="300" alt="The playback details panel: what the screen can show, the source, the display and the cadence">

- **Nothing invented.** No machine-learning upscaling, no frame interpolation,
  and no quality presets: what is in the film is what is shown.
- **Plays through mpv** on Windows and Linux, and through Android's own player
  (Media3) on Android TV.

## Browses like a streaming app

- **Posters, backdrops, cast and episode stills** arrive by themselves and are
  kept locally, so browsing works offline.
- **Or nothing online at all**: *Keep everything on this computer* (at the
  first run, or Settings → Privacy) matches names on your device against a
  list IMDb publishes for everyone, and sends nothing about your library
  anywhere. Settings → Privacy lists every service Skrin can contact, what it
  sends and what stops it.
- **Continue watching and the next episode**, remembered per file.
- **Skips intros, recaps and credits**, from two community databases, chapter
  markers, or the episodes' own audio.
- **Badges say what the file really holds**: resolution, Dolby Vision profile,
  HDR format, the exact sound format and the aspect ratio measured from the picture.
- **Subtitles in your language** when the sound is in another, and none when it
  is not; one press finds more on OpenSubtitles.
- **Mouse, keyboard or remote**, with a TV layout that fills the screen for the sofa.

## Your files, left alone

- **No server.** One program; close it and nothing is left running.
- **A NAS or a USB drive** works as easily as a local disk; a share that is
  switched off is left alone, not treated as empty.
- **It refuses to guess.** A match it is not sure of goes to a review queue
  with the reason, instead of the wrong film on your file.
- **Nothing is moved, renamed or written** to your media, unless you press the
  optional `.nfo` export yourself.
- **Home videos and clips** get a place of their own, never matched; playlists
  play films, episodes and videos in your order.
- **SIMKL and Trakt**, if you connect them, are told what you finish.

The full list, and why Skrin exists between VLC, Kodi and Plex, is in
[What Skrin does](docs/FEATURES.md).

## Is it for you?

**Yes, if** you keep your own films and shows as files — on a PC, a laptop
plugged into the TV, a Linux PC or an Android TV box — and want them to look and
sound right without it becoming a project.

**Probably not, if you want:**

- **Your library on every screen in the house, or on the road.** With no
  server, a film plays on the device Skrin runs on.
- **Streaming-service apps or an add-on store.** Skrin plays the files you own.
- **A tuning bench** of upscalers and shader chains. Skrin makes those choices
  on purpose.
- **Apple TV, iPhone or iPad.** Not planned; a Mac version maybe one day, with
  no promise attached.

## Install

- **Windows 11:** [the installer](https://github.com/basswaves/skrin/releases/latest)
  (or the ZIP). Windows asks once whether to run it: **More info → Run anyway**.
- **Linux:** a `.deb`, `.rpm` or folder, x86-64 and ARM —
  `sudo apt install ./skrin-linux-amd64.deb` or `sudo dnf install ./skrin-linux-x86_64.rpm`.
- **Android TV** (early version): copy `skrin-android.apk` to the device and open it.

<details>
<summary>Checksums, removing Skrin, Linux HDR, the Android certificate, and the first run</summary>

<br>

- [Installing Skrin](docs/INSTALL.md) — each platform in full: the installer
  and the ZIP, why Windows asks, checking a download's checksum, updates,
  removing Skrin, what HDR needs on Linux, and the certificate every Android
  release is signed with.
- [Setting Skrin up](docs/SETUP.md) — the first run, the optional extras
  (ffmpeg, Skiptro, OMDb, TheIntroDB, IntroDB, SIMKL, Trakt, OpenSubtitles),
  and how Skrin reads file names. The file-name guide is also at
  [skrin.org/file-names.html](https://skrin.org/file-names.html).
- [Platform support](docs/PLATFORMS.md) — what works where, what has been
  tested, and what the Android version is still missing.
- [Building from source](CONTRIBUTING.md#building).

</details>

Then answer two questions — where you will watch, and where your films are —
and press **Scan my library**. Skrin asks GitHub for the latest version number
and says in Settings when one is out; it never downloads or installs anything
by itself.

## Built by one person, with Claude

Skrin is built by one person together with Claude, Anthropic's AI coding
assistant, which writes the code under the author's direction; the author
decides what Skrin is, and what it deliberately is not. So the checking is out
in the open:

- **Automated tests on every change**, on Windows and Linux (x86-64 and ARM).
- **Scripts run the real app and the real player** through scripted sessions,
  not just the parts in isolation.
- **Every decision is written down with its reasons** ([HISTORY](docs/HISTORY.md)),
  and so is every trap found along the way ([GOTCHAS](docs/GOTCHAS.md)).
- **MIT-licensed**, and all of it is here to read.

It is an early project, tested on a small number of setups. Reports from
yours — working or not — are what shapes it.

## Feedback

- **Something wrong?** [When something goes wrong](docs/TROUBLESHOOTING.md)
  says where the logs are; attach them to a
  [bug report](https://github.com/basswaves/skrin/issues/new?template=bug_report.yml).
- **Tried it on your equipment?** A [device report](https://github.com/basswaves/skrin/issues/new?template=device_report.yml)
  that says "works" is as useful as one that says "broken".
- **An idea?** A [feature request](https://github.com/basswaves/skrin/issues/new?template=feature_request.yml);
  read the settled decisions in [CONTRIBUTING.md](CONTRIBUTING.md) first.
- **A question or a story** goes in [Discussions](https://github.com/basswaves/skrin/discussions);
  anything exploitable goes to [SECURITY.md](SECURITY.md).

## Documentation

| | |
|---|---|
| [docs/FEATURES.md](docs/FEATURES.md) | What Skrin does, in full, and who it is for |
| [docs/INSTALL.md](docs/INSTALL.md) · [docs/SETUP.md](docs/SETUP.md) | Installing, the first run, optional extras, file names |
| [docs/PLATFORMS.md](docs/PLATFORMS.md) | What works where, and known limitations |
| [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | Logs, bug reports and feedback |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How to build, verify and submit a change |
| [docs/DESIGN.md](docs/DESIGN.md) · [docs/HISTORY.md](docs/HISTORY.md) | Architecture, and why each decision went the way it did |
| [docs/GOTCHAS.md](docs/GOTCHAS.md) | Traps in libmpv, Tauri, SQLite and spatial navigation |
| [docs/ROADMAP.md](docs/ROADMAP.md) | What is next, what is not planned, and where help is wanted |
| [NOTICE.md](NOTICE.md) · [SECURITY.md](SECURITY.md) | Third-party licences; how to report a security problem |

## Licence

[MIT](LICENSE). Skrin links against libmpv, which is LGPL, and the Windows
release bundles an unmodified LGPL build of it that you are free to replace.
The Android version uses Google's Media3 player (Apache-2.0) instead. It uses
data from TMDB, TVmaze, Wikidata, Wikipedia, TheIntroDB and IntroDB, each under
their own terms. [NOTICE.md](NOTICE.md) has the detail.

<img src="public/tmdb.svg" alt="TMDB" height="20"><br>
This product uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB.
