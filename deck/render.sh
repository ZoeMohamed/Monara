#!/usr/bin/env bash
# Render every HTML in deck/src to a PNG in deck/png using headless Chrome.
# Usage: deck/render.sh [name ...]   (names without .html; default is all)
set -euo pipefail
cd "$(dirname "$0")"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
# name width height scale
SPECS="
arch 1728 762 2
attack 1728 724 2
bg-plain 1920 1080 1
capital 851 349 2
card1 420 417 2
card2 420 417 2
card3 420 417 2
card4 420 417 2
chart 975 363 2
competitor 1792 584 2
conn 322 94 2
cover-bg 1920 1080 1
cover-top 1920 160 1
flows 1728 749 2
gap 825 507 2
hero 940 820 1
hub 1800 680 2
icon 512 494 1
icons 600 260 1
ph-panel 960 780 1
revenue 852 325 2
risk 1728 724 2
team 1696 610 2
thanks-icons 200 100 2
tiers 1728 595 2
waves 768 507 2
"
want=" $* "
while read -r name w h scale; do
  [ -z "${name:-}" ] && continue
  if [ "$#" -gt 0 ] && [[ "$want" != *" $name "* ]]; then continue; fi
  "$CHROME" --headless=new --disable-gpu --default-background-color=00000000 \
    --force-device-scale-factor="$scale" --virtual-time-budget=5000 \
    --window-size="$w,$h" --screenshot="png/$name.png" "file://$PWD/src/$name.html" >/dev/null 2>&1
  echo "rendered png/$name.png (${w}x${h} @${scale}x)"
done <<< "$SPECS"
