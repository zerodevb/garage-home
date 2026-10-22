#!/bin/zsh
# Shared by build-launcher.sh and build-player.sh: sign APP_DIR into dist/WGT, install it and open APP_ID.
# Needs: TV (ip:26101), CERT_DIR (author.p12 + distributor.p12), optional KEYCHAIN_SERVICE for the passwords.
set -e
ROOT="${0:A:h:h}"
: "${TV:?Set TV in garage.env, e.g. TV=192.168.1.50:26101}"
: "${CERT_DIR:=$HOME/SamsungCertificate/garage}"
: "${KEYCHAIN_SERVICE:=garage-signing}"
TIZEN=~/tizen-studio/tools/ide/bin/tizen
SDB=~/tizen-studio/tools/sdb

keychain() { security find-generic-password -s "$KEYCHAIN_SERVICE" -a "$1" -w 2>/dev/null; }
AUTHOR_PW=$(keychain author || true)
DIST_PW=$(keychain distributor || true)
if [[ -z "$AUTHOR_PW" || -z "$DIST_PW" ]]; then
  read -rs "AUTHOR_PW?Author certificate password: "; echo
  read -rs "DIST_PW?Distributor certificate password (Enter = same): "; echo
  [[ -z "$DIST_PW" ]] && DIST_PW="$AUTHOR_PW"
  read -q "SAVE?Save both in your Keychain so you are not asked again? [y/N] " || true; echo
  if [[ "$SAVE" == y ]]; then
    security add-generic-password -U -s "$KEYCHAIN_SERVICE" -a author -w "$AUTHOR_PW"
    security add-generic-password -U -s "$KEYCHAIN_SERVICE" -a distributor -w "$DIST_PW"
  fi
fi

cd "$ROOT/$APP_DIR"
# Per-TV settings baked into the package: the TV's own IP (phone QR codes), an optional weather place,
# and GARAGE_STANDALONE=1 for Garage Player without Vetro (no phone QR, playlists load directly).
print -r -- "window.GARAGE_CONFIG = {tvIp: '${TV%%:*}'${GARAGE_PLACE:+, place: $GARAGE_PLACE}${GARAGE_STANDALONE:+, standalone: true}};" > garage-config.js
CERT_DIR="$CERT_DIR" AUTHOR_PW="$AUTHOR_PW" DIST_PW="$DIST_PW" node build.cjs
$SDB start-server >/dev/null 2>&1
for i in {1..10}; do $SDB connect $TV >/dev/null 2>&1; $SDB devices | grep -q "$TV" && break; sleep 3; done
$TIZEN install -n "$PWD/dist/$WGT" -s $TV | tail -1
$TIZEN run -p $APP_ID -s $TV | tail -1
# The TV allows one developer connection; release ours so Vetro can use it for root.
# (Don't kill the sdb server: Tizen Studio restarts it in a mode that then refuses to connect.)
$SDB disconnect $TV >/dev/null
