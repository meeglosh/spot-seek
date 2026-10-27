#!/bin/bash
# usage: go.sh <outfile|none> <action> <arg> [wait] [display]   actions: login(arg=email) | replace|push(arg=route) | back | none
# Drives the temporary DevNav component in the sim via the local ctl server, then screenshots a display.
D="$(cd "$(dirname "$0")" && pwd)"; U=8F5422A0-8B2A-4560-9D60-FA3F39AF2F3B
O=$1; A=$2; R=$3; W=${4:-7}; DISP=${5:-inner}
if [ "$A" = login ]; then echo "{\"n\":$(python3 -c 'import time;print(int(time.time()*1000))'),\"action\":\"login\",\"email\":\"$R\",\"password\":\"Throwaway-pass-1\"}" > $D/ctl.json
elif [ "$A" != none ]; then echo "{\"n\":$(python3 -c 'import time;print(int(time.time()*1000))'),\"action\":\"$A\",\"route\":\"$R\"}" > $D/ctl.json; fi
sleep $W
if [ "$O" != none ]; then
  if [ "$DISP" = inner ]; then ID=11C0E7E1-B988-4D1C-888D-CE4EB2ED706F; else ID=574220EB-C1A9-43B1-9814-17B59B43A812; fi
  xcrun simctl io $U screenshot --display $ID "$O" >/dev/null 2>&1
fi
echo done $A $R
