#!/bin/bash
# Rebuilds out/iphone/*.png (1320x2868), out/ipad/*.png (2064x2752), out/contact.png
set -e
cd "$(dirname "$0")"; D="$PWD"
CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
mkdir -p out/iphone out/ipad
shot(){ # dev n W H file
  "$CH" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 --window-size=$3,$4 \
    --virtual-time-budget=4000 --allow-file-access-from-files --screenshot="$5" "file://$D/slides.html?d=$1&s=$2" >/dev/null 2>&1
  # flatten: PNG -> JPEG -> PNG guarantees no alpha channel
  sips -s format jpeg -s formatOptions 100 "$5" --out "$5.jpg" >/dev/null; sips -s format png "$5.jpg" --out "$5" >/dev/null; rm "$5.jpg"
}
names=(x never-watch-alone find-your-crowd one-tap host-the-party never-miss free-to-join)
rm -f out/iphone/*.png out/ipad/*.png
for n in 1 2 3 4 5 6; do
  shot iphone $n 1320 2868 "out/iphone/0$n-${names[$n]}.png"
  shot ipad $n 2064 2752 "out/ipad/0$n-${names[$n]}.png"
done
"$CH" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 --window-size=2400,760 --virtual-time-budget=3000 --allow-file-access-from-files --screenshot="out/contact.png" "file://$D/contact.html" >/dev/null 2>&1
"$CH" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 --window-size=2400,760 --virtual-time-budget=3000 --allow-file-access-from-files --screenshot="out/ipad-contact.png" "file://$D/ipad-contact.html" >/dev/null 2>&1
for f in out/iphone/*.png out/ipad/*.png out/contact.png out/ipad-contact.png; do echo "$f $(sips -g pixelWidth -g pixelHeight -g hasAlpha "$f" | awk '/pixel|hasAlpha/{printf $2" "}')"; done
