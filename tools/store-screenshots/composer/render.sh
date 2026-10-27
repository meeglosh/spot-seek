#!/bin/bash
# Rebuilds final/outer-0N.png (1398x2034), final/inner-0N.png (2007x2853) and the contact sheets.
# Reads raw captures from ../raw/outer and ../raw/inner. Output is flattened (PNG -> JPEG -> PNG) so there is no alpha channel.
set -e
cd "$(dirname "$0")"; D="$PWD"
CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
mkdir -p ../final
shot(){ # dev n W H file
  "$CH" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 --window-size=$3,$4 \
    --virtual-time-budget=4000 --allow-file-access-from-files --screenshot="$5" "file://$D/slides.html?d=$1&s=$2" >/dev/null 2>&1
  sips -s format jpeg -s formatOptions 100 "$5" --out "$5.jpg" >/dev/null; sips -s format png "$5.jpg" --out "$5" >/dev/null; rm "$5.jpg"
}
for n in 1 2 3 4 5 6; do
  shot outer $n 1398 2034 "../final/outer-0$n.png"
  shot inner $n 2007 2853 "../final/inner-0$n.png"
done
for d in outer inner; do
  "$CH" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 --window-size=2400,700 --virtual-time-budget=3000 --allow-file-access-from-files --screenshot="../final/contact-$d.png" "file://$D/contact.html?d=$d" >/dev/null 2>&1
done
for f in ../final/*.png; do echo "$f $(sips -g pixelWidth -g pixelHeight -g hasAlpha "$f" | awk '/pixel|hasAlpha/{printf $2" "}')"; done
