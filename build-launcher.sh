#!/bin/zsh
# Signs Garage Home with your Samsung certificate, then installs and opens it on the TV.
# Settings come from garage.env next to this script (TV, CERT_DIR, KEYCHAIN_SERVICE); see garage.env.example.
set -e
ROOT="${0:A:h}"
[ -f "$ROOT/garage.env" ] && { set -a; source "$ROOT/garage.env"; set +a; }
APP_DIR=launcher APP_ID=GarageHome.launcher WGT=GarageHome.wgt exec zsh "$ROOT/tools/build-install.sh"
