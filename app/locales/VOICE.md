# SpotSeek voice

Reference: the landing page at spotseek.app. "Never watch alone." "Three moves.
One good night." "Not another stale listing." "You host. The room is optional."

SpotSeek is for anything worth watching with other people: games first, but
also award shows, season finales, election nights and movie nights. Copy never
assumes sport.

## Tone

Short, specific, a little cocky, warm. A friend who knows a good room, not a
startup pitching. Talk about the room, the people, the screen and the night.

## Rules

1. Say each thing once. A title, a body and a button should not repeat each other.
2. Name the action on buttons: "RSVP", "Host a party", "Get directions",
   "Place bid". Never "Submit", "OK", "Yes" or "No". Destructive buttons repeat
   the verb and the object ("Delete party").
3. Banned filler: "the experience", "the action", "the passion", "unlock",
   "leverage", "seamless", "high-yield", "targeting", "engagement", "journey".
4. Empty states say why it is empty and what to do next. One title, one line,
   one action.
5. Errors say what failed and how to recover: "Couldn't load parties. Check
   your connection and try again."
6. Labels persist; placeholders are examples ("e.g. The Red Lion"), never the label.
7. Destructive confirmations name the object and the consequence: "Delete this
   party? Its RSVPs go with it, and this can't be undone."
8. Sentence case everywhere ("Host a party", not "Host a Party"). Caps come
   only from the theme: every Anton title/display style (screen, section,
   event and sheet titles, "You're in.") applies `textTransform: uppercase`,
   and so does the `tag` style (LIVE, TONIGHT, GOING). Buttons, labels and body
   stay sentence case. Never write uppercase into a string, and never call
   `.toUpperCase()` on display text (dates, broadcast subjects, venue names).
9. No em dashes. Use a full stop, a comma or a middle dot.
10. No invented numbers. Only state a figure (the 15% fee) when the product
    really does it. Don't overpromise: "People can find it in Discover", not
    "Thousands will see it".
11. Words: say "party" for an event people attend, "host" for the owner,
    "venue" for the place (optional), "RSVP" as both noun and verb, "guests"
    for attendees, "bid" for a sponsorship offer.

## Sponsors

Plain and honest, written for a small business or a brand. Say what they pay,
who decides and when they're charged. No ad-tech vocabulary.

## Translations

FR, ES, DE and PT follow the same rules in natural, idiomatic phrasing, not
word for word. Keep key parity (`__tests__/locales.test.ts`). Native-speaker
review is still pending (see BLOCKED.md).
