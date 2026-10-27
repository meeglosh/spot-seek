#!/bin/bash
# usage: shoot.sh inner|outer   -> raw/<disp>/{01_discover_live,06_notifications,07_map,04_rsvp_confirmed,08_host_dashboard}.png
D="$(cd "$(dirname "$0")" && pwd)"; DISP=$1; O="$D/../raw/$DISP"; mkdir -p "$O"
EV="$D/events.json"; id(){ node -pe "require('$EV').$1"; }
G="$D/go.sh"
echo '{}' > $D/ctl.json
$G none login casey.morgan@spotseek.test 10 $DISP
$G "$O/01_discover_live.png" replace "/(tabs)/discover" 8 $DISP
$G "$O/06_notifications.png" replace "/notifications" 7 $DISP
$G none replace "/(tabs)/parties" 5 $DISP
$G "$O/07_map.png" replace "/(tabs)/discover?map=1" 10 $DISP
$G none replace "/(tabs)/discover" 5 $DISP
$G "$O/04_rsvp_confirmed.png" push "/(tabs)/discover/$(id rooftop)?devRsvp=1" 10 $DISP
$G none replace "/(tabs)/discover" 4 $DISP
$G none login maya.alvarez@spotseek.test 10 $DISP
$G "$O/08_host_dashboard.png" replace "/(tabs)/parties/dashboard" 8 $DISP
echo ALLDONE
