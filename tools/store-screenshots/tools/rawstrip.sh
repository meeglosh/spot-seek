#!/bin/bash
# usage: rawstrip.sh <rawdir> <out.png> : quick look at the raw captures
cd "$1"; { echo '<body style="margin:0;background:#555;display:flex;gap:6px">'; for f in 01_discover_live 07_map 04_rsvp_confirmed 08_host_dashboard 06_notifications; do echo "<img src=\"$f.png\" style=\"height:1000px\">"; done; } > strip.html
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --screenshot="$2" --window-size=3700,1000 --hide-scrollbars --allow-file-access-from-files "file://$PWD/strip.html" 2>/dev/null; rm strip.html
