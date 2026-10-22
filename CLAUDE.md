# CLAUDE.md

Guidance for Claude Code when helping someone install, configure or change **Garage Home** (and the bundled **Garage Player**) on a Samsung Tizen TV. Powered by TheGarageDevs.com.

## What this repo is

- `launcher/` — Garage Home, a Tizen web app (`GarageHome.launcher`): home screen, widgets, quick controls, task manager, kids lock.
- `player/` — Garage Player, an IPTV web app (`GaragePlay.player`). Also published alone as `zerodevb/garage-player`.
- `tools/build-install.sh` — signs an app with the user's Samsung certificate, installs it over SDB and opens it. Called by `build-launcher.sh` / `build-player.sh`.
- `tools/signing/` — Node signing dependencies (from Vetro).
- `tools/garage-debloat.mjs` — turns off unused Samsung services through Vetro's API; dry run by default.
- Root-powered features (Home button, power-on launch, quick controls, task manager, phone QR inbox, playlist proxy) come from **Vetro with the Garage additions**: `https://github.com/zerodevb/vetro`, branch `garage`, based on upstream `andrearicci93/vetro` commit `e8553f2` (tag `upstream-e8553f2`). Use that branch, not upstream `main`, unless the user asks to update.

## Install walkthrough

Go one step at a time, and check each step before the next. Many steps happen on the TV, so ask the user to do them and to tell you what the screen shows.

1. **Computer.** macOS (scripts use zsh and the Keychain); Node 18+. Install **Tizen Studio** with *TV Extensions* and *Samsung Certificate Extension* from the Package Manager. The scripts expect `~/tizen-studio`.
2. **TV Developer Mode.** Apps → type `12345` with the remote → Developer Mode **On** → Host PC IP = this computer's LAN IP → restart the TV. Find the computer's IP with `ipconfig getifaddr en0`, and the TV's IP in TV Settings → General → Network → Network Status.
3. **Certificate.** In Tizen Studio Certificate Manager, create a **Samsung** certificate profile (TV, signed in with a Samsung account; add the TV's DUID if asked). Note the folder holding `author.p12` and `distributor.p12`, usually `~/SamsungCertificate/<profile>`.
4. **Configure.** `cp garage.env.example garage.env`, then set `TV=<tv-ip>:26101` and `CERT_DIR`. Optionally set `GARAGE_PLACE` for weather. `garage.env` is git-ignored; never commit it.
5. **Signing tools.** `(cd tools/signing && npm ci --ignore-scripts)`.
6. **Vetro.** Clone `zerodevb/vetro`, check out `garage`, and follow its `app/docs/INSTALLATION.md`. Its root setup needs the TV's Host PC IP set to `127.0.0.1` afterwards; follow that guide exactly and let the user make each change on the TV.
7. **Install the apps.** `./build-launcher.sh` and `./build-player.sh`. The script prompts for the certificate passwords and offers to save them in the Keychain. Let the user type them in their own terminal; never ask for passwords in chat, put them in files or pass them on a command line.
8. **Check.** Ask the user to press Home on the remote: Garage Home should open. Vetro's API answers on `http://<tv-ip>:8099/status`.

## Connection rules (learned the hard way)

- Installing needs the TV's **Host PC IP = this computer**. Vetro's root needs **Host PC IP = 127.0.0.1**. After installing, remind the user to switch it back to `127.0.0.1`, or Home button and quick controls stop working. Changing it sometimes only takes effect after a TV restart.
- The TV allows **one developer connection at a time**. `build-install.sh` disconnects when done; do not leave `sdb` connected.
- **Never run `sdb kill-server`** while Tizen Studio is open; it comes back in a state that refuses to connect.
- A short press of the remote's power button is Instant On (apps stay in memory). A real cold boot takes about 1.5–2 minutes before start-at-boot apps run; that is the TV, not a bug.

## Debloat

```bash
TV=<tv-ip> node tools/garage-debloat.mjs              # dry run: show the plan
TV=<tv-ip> node tools/garage-debloat.mjs --extras     # dry run including extras
TV=<tv-ip> node tools/garage-debloat.mjs --apply      # apply (saves tools/debloat-restore-<time>.json first)
TV=<tv-ip> node tools/garage-debloat.mjs --restore tools/debloat-restore-<time>.json
```

Always show the dry run first and get the user's OK before `--apply`. Tell them where the restore file is. Needs Vetro running.

## Changing the code

- The TV runs **Chromium 76**. Write ES5-style JavaScript (`var`, `function`); no optional chaining, nullish coalescing, flex `gap` or `inset`. Do not add frameworks or a bundler.
- Files that get packaged are listed in `FILES` in each `build.cjs`; add new files there.
- Preview in a desktop browser by opening `launcher/index.html` or `player/index.html`. `launcher/preview-apps.js` fakes the TV app list; `#keys=40,40,13` in the URL presses keys after load.
- Per-TV settings come from `garage-config.js`, generated at build time from `garage.env` (`tvIp`, optional `place`). Don't hard-code IPs or locations.
- Keep the look: petrol/teal palette and the **garage**home wordmark (bold "garage", light second word).

## Safety

- Don't edit Samsung system files, boot scripts or firmware on the TV, and don't try to get around Samsung's signature checks. Garage Home works within Vetro's API and normal app installs.
- Ask before anything that changes the TV: installing, uninstalling, debloat `--apply`, Vetro actions that disable or stop components.
- Vetro's dashboard is plain HTTP with no login. Keep the TV on a trusted home network.

## License

PolyForm Noncommercial 1.0.0. Noncommercial use, modification and sharing are fine; selling or commercial use is not. Vetro and bundled libraries (qrcode-generator, pako) are MIT.
