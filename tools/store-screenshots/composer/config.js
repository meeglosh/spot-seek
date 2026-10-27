// Raw simulator captures live in ../raw/<outer|inner>/ at the exact display pixel size.
// outer = 1398x2034, inner = 2007x2853 (both portrait).
const slots = (d) => ({
  discover: [`../raw/${d}/01_discover_live.png`],   // slide 1
  map:      [`../raw/${d}/07_map.png`],             // slide 2
  rsvp:     [`../raw/${d}/04_rsvp_confirmed.png`],  // slide 3
  host:     [`../raw/${d}/08_host_dashboard.png`],  // slide 4
  notifs:   [`../raw/${d}/06_notifications.png`],   // slide 5
});
window.SHOTS = { outer: slots('outer'), inner: slots('inner') };
window.PHOTOS = { crowd: "photos/group-couch.jpg", smile: "photos/women-popcorn.jpg" };
