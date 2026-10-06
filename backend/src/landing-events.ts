// Curated "big shared-watch moments" for the landing page calendar and ticker. See
// landing-calendar.ts for how they are filtered and ordered. Dates were checked against web sources
// on 2026-10-06; every entry records its `source`.
//
// Rules for editing this file:
//  - Dates are calendar days in America/New_York, "YYYY-MM-DD". `end` is for multi-day ranges.
//  - If the exact day is not announced, set `tentative: true` and use a month-level `start`
//    ("YYYY-MM"); the page renders it as "FEB 2028". Never invent a day.
//  - Keep at least 24 months of runway. The cron logs "[LANDING] calendar running low" when fewer
//    than LANDING_N entries remain in the next 12 months.
//  - No em dashes in copy. Copy is uppercase-styled by CSS where needed; write names in caps.

export type LandingKind = 'sports' | 'awards' | 'civic' | 'culture';

export interface LandingEvent {
  id: string;
  kind: LandingKind;
  name: string;
  /** Shorter name for the ticker (defaults to `name`). */
  tickerName?: string;
  note: string;
  start: string;
  end?: string;
  tentative?: boolean;
  source: string;
}

export interface LandingRecurring {
  id: string;
  name: string;
  ticker: string;
  note: string;
  dateLabel: string;
  /** "first" rows render before the dated rows, "last" rows after them. */
  slot: 'first' | 'last';
  /** If set, the row is shown only while today falls inside one of these windows (inclusive). */
  seasons?: { start: string; end: string; source: string }[];
}

export const LANDING_RECURRING: LandingRecurring[] = [
  {
    id: 'nfl-sundays',
    name: 'NFL SUNDAYS',
    ticker: 'NFL SUNDAYS',
    note: 'The weekly ritual.',
    dateLabel: 'EVERY SUNDAY',
    slot: 'first',
    // Kickoff to the Super Bowl. Hidden in the offseason (mid Feb to Aug).
    seasons: [
      { start: '2026-09-09', end: '2027-02-14', source: 'https://media.nfl.com/news-and-releases/2026-nfl-regular-season-to-kick-off-wednesday--sept--9-in-seattl' },
      { start: '2027-09-01', end: '2028-02-13', source: 'https://www.nbcsports.com/nfl/profootballtalk/rumor-mill/news/super-bowl-lxii-will-be-played-on-february-13-2028' },
      { start: '2028-09-01', end: '2029-02-14', source: 'https://www.nbcsports.com/fantasy/football/player-news/2026-07-24/nfl-schedules-17-game-season-for-2027-sblxii' },
    ],
  },
  {
    id: 'weekly-show',
    name: "YOUR SHOW'S NEW EPISODE",
    ticker: "EVERY WEEK: YOUR SHOW'S NEW EPISODE",
    note: 'Finales and premieres count.',
    dateLabel: 'EVERY WEEK',
    slot: 'last',
  },
];

export const LANDING_EVENTS: LandingEvent[] = [
  // 2026
  { id: 'nba-open-2026', kind: 'sports', name: 'NBA SEASON STARTS', note: 'Opening night.', start: '2026-10-20', source: 'https://www.nba.com/news/2026-27-nba-regular-season-schedule' },
  { id: 'world-series-2026', kind: 'sports', name: 'WORLD SERIES BEGINS', note: 'Game 1 of the fall classic.', start: '2026-10-23', source: 'https://www.cbssports.com/mlb/news/2026-mlb-playoff-schedule-bracket/' },
  { id: 'election-2026', kind: 'civic', name: 'US ELECTION NIGHT', tickerName: 'ELECTION NIGHT', note: 'Midterms. Results on every screen.', start: '2026-11-03', source: 'https://en.wikipedia.org/wiki/2026_United_States_elections' },
  { id: 'macys-parade-2026', kind: 'culture', name: "MACY'S THANKSGIVING PARADE", tickerName: "MACY'S PARADE", note: 'The 100th one.', start: '2026-11-26', source: 'https://www.macysinc.com/newsroom/news/news-details/2026/Macys-Kicks-Off-the-100-Day-Countdown-to-the-100th-Macys-Thanksgiving-Day-Parade/default.aspx' },
  // 2027
  { id: 'golden-globes-2027', kind: 'awards', name: 'GOLDEN GLOBES', note: 'Red carpet to final envelope.', start: '2027-01-10', source: 'https://goldenglobes.com/articles/nikki-glaser-to-host-jan-10-2027-golden-globes/' },
  { id: 'cfp-final-2027', kind: 'sports', name: 'COLLEGE FOOTBALL TITLE GAME', tickerName: 'CFP CHAMPIONSHIP', note: 'Las Vegas decides it.', start: '2027-01-25', source: 'https://collegefootballplayoff.com/news/2026/2/3/2627-2728-bowls' },
  { id: 'grammys-2027', kind: 'awards', name: 'THE GRAMMYS', note: 'Music night, live from Los Angeles.', start: '2027-02-07', source: 'https://abc.com/news/f055deb9-3d58-4ecf-bdf2-70536dff9549/category/1138628' },
  { id: 'super-bowl-2027', kind: 'sports', name: 'SUPER BOWL LXI', note: 'The big one.', start: '2027-02-14', source: 'https://en.wikipedia.org/wiki/Super_Bowl_LXI' },
  { id: 'oscars-2027', kind: 'awards', name: 'THE OSCARS', note: "Hosted by Conan O'Brien.", start: '2027-03-14', source: 'https://press.oscars.org/news/academy-and-abc-announce-show-dates-99th-and-100th-oscarsr' },
  { id: 'march-madness-2027', kind: 'sports', name: 'MARCH MADNESS', note: 'Three weeks of brackets.', start: '2027-03-14', end: '2027-04-05', source: 'https://ncaa.com/news/basketball-men/article/2026-05-07/2027-march-madness-mens-ncaa-tournament-schedule-dates' },
  { id: 'masters-2027', kind: 'sports', name: 'THE MASTERS', note: 'Sunday at Augusta.', start: '2027-04-08', end: '2027-04-11', source: 'https://www.roadtrips.com/professional-golf-packages/masters/schedule/' },
  { id: 'wrestlemania-2027', kind: 'culture', name: 'WRESTLEMANIA 43', note: 'Riyadh. Exact date not out yet.', start: '2027-04', tentative: true, source: 'https://corporate.wwe.com/about/news/2025/09-12-2025' },
  { id: 'kentucky-derby-2027', kind: 'sports', name: 'KENTUCKY DERBY', note: 'Two minutes, one big hat.', start: '2027-05-01', source: 'https://www.kentuckyderby.com/tickets/2027/' },
  { id: 'eurovision-2027', kind: 'culture', name: 'EUROVISION GRAND FINAL', tickerName: 'EUROVISION FINAL', note: 'Live from Burgas, Bulgaria.', start: '2027-05-15', source: 'https://www.ebu.ch/news/2026/08/burgas-to-host-eurovision-song-contest-2027' },
  { id: 'nba-finals-2027', kind: 'sports', name: 'NBA FINALS BEGIN', tickerName: 'NBA FINALS', note: 'Game 1 for the title.', start: '2027-06-03', source: 'https://www.nbcnewyork.com/nba/nba-key-dates-2026-27-opening-night-trade-deadline-finals/6535379/' },
  { id: 'champions-league-2027', kind: 'sports', name: 'CHAMPIONS LEAGUE FINAL', note: 'One night, one trophy.', start: '2027-06-05', source: 'https://www.uefa.com/uefachampionsleague/news/029d-1eb2d5faf53c-d67c9fed04fa-1000--2027-uefa-champions-league-final-estadio-metropolitano-m/' },
  { id: 'stanley-cup-2027', kind: 'sports', name: 'STANLEY CUP FINAL', note: 'Exact dates not out yet.', start: '2027-06', tentative: true, source: 'https://www.nhl.com/news/nhl-announces-2026-27-regular-season-schedule' },
  { id: 'tonys-2027', kind: 'awards', name: 'THE TONY AWARDS', note: 'Exact date not out yet.', start: '2027-06', tentative: true, source: 'https://www.tonyawards.com/' },
  { id: 'womens-world-cup-2027', kind: 'sports', name: "WOMEN'S WORLD CUP", note: 'Brazil hosts, Maracana final.', start: '2027-06-24', end: '2027-07-25', source: 'https://inside.fifa.com/media-releases/fifa-womens-world-cup-brazil-2027-dates-confirmed' },
  { id: 'wimbledon-final-2027', kind: 'sports', name: "WIMBLEDON MEN'S FINAL", tickerName: 'WIMBLEDON FINAL', note: 'Centre Court, Sunday.', start: '2027-07-11', source: 'https://toomanyrackets.com/wimbledon-championships-guide/' },
  { id: 'nfl-kickoff-2027', kind: 'sports', name: 'NFL SEASON KICKOFF', note: 'Exact date not out yet.', start: '2027-09', tentative: true, source: 'https://www.nbcsports.com/fantasy/football/player-news/2026-07-24/nfl-schedules-17-game-season-for-2027-sblxii' },
  { id: 'nba-open-2027', kind: 'sports', name: 'NBA SEASON STARTS', note: 'Exact date not out yet.', start: '2027-10', tentative: true, source: 'https://www.nba.com/' },
  { id: 'emmys-2027', kind: 'awards', name: 'THE EMMYS', note: 'Streaming free on Prime Video.', start: '2027-09', tentative: true, source: 'https://www.wsls.com/entertainment/2026/10/06/emmy-awards-to-move-to-prime-video-in-2027-in-6-year-deal-between-amazon-and-the-television-academy/' },
  { id: 'world-series-2027', kind: 'sports', name: 'WORLD SERIES BEGINS', note: 'Game 1 of the fall classic.', start: '2027-10-22', source: 'https://en.wikipedia.org/wiki/2027_Major_League_Baseball_season' },
  { id: 'rugby-world-cup-2027', kind: 'sports', name: 'RUGBY WORLD CUP', note: 'Australia hosts, Sydney final.', start: '2027-10-01', end: '2027-11-13', source: 'https://en.wikipedia.org/wiki/2027_Men%27s_Rugby_World_Cup' },
  // 2028
  { id: 'golden-globes-2028', kind: 'awards', name: 'GOLDEN GLOBES', note: 'Date to be announced.', start: '2028-01', tentative: true, source: 'https://goldenglobes.com/' },
  { id: 'grammys-2028', kind: 'awards', name: 'THE GRAMMYS', note: 'Date to be announced.', start: '2028-02', tentative: true, source: 'https://www.grammy.com/' },
  { id: 'super-bowl-2028', kind: 'sports', name: 'SUPER BOWL LXII', note: 'Live from Atlanta.', start: '2028-02-13', source: 'https://www.nbcsports.com/nfl/profootballtalk/rumor-mill/news/super-bowl-lxii-will-be-played-on-february-13-2028' },
  { id: 'oscars-2028', kind: 'awards', name: 'THE OSCARS', note: 'The 100th ceremony.', start: '2028-03-05', source: 'https://press.oscars.org/news/academy-and-abc-announce-show-dates-99th-and-100th-oscarsr' },
  { id: 'masters-2028', kind: 'sports', name: 'THE MASTERS', note: 'Exact dates not out yet.', start: '2028-04', tentative: true, source: 'https://www.masters.com/' },
  { id: 'kentucky-derby-2028', kind: 'sports', name: 'KENTUCKY DERBY', note: 'Exact date not out yet.', start: '2028-05', tentative: true, source: 'https://www.kentuckyderby.com/' },
  { id: 'champions-league-2028', kind: 'sports', name: 'CHAMPIONS LEAGUE FINAL', note: 'Live from Munich.', start: '2028-05-27', source: 'https://en.wikipedia.org/wiki/2028_UEFA_Champions_League_final' },
  { id: 'euro-2028', kind: 'sports', name: 'UEFA EURO 2028', tickerName: 'EURO 2028', note: 'Cardiff opener, Wembley final.', start: '2028-06-09', end: '2028-07-09', source: 'https://www.englandfootball.com/articles/2025/Nov/12/EURO-2028-match-schedule-released-20251211' },
  { id: 'nba-finals-2028', kind: 'sports', name: 'NBA FINALS', note: 'Exact dates not out yet.', start: '2028-06', tentative: true, source: 'https://www.nba.com/' },
  { id: 'stanley-cup-2028', kind: 'sports', name: 'STANLEY CUP FINAL', note: 'Exact dates not out yet.', start: '2028-06', tentative: true, source: 'https://www.nhl.com/' },
  { id: 'wimbledon-2028', kind: 'sports', name: 'WIMBLEDON', note: 'Exact dates not out yet.', start: '2028-07', tentative: true, source: 'https://tennisnow.com/2028-olympic-tennis-begins-three-days-after-wimbledon-mens-final-everything-you-need-to-know-about-the-schedule/' },
  { id: 'olympics-2028', kind: 'sports', name: 'LA 2028 OLYMPICS', tickerName: 'LA OLYMPICS', note: 'Opening ceremony to the closing one.', start: '2028-07-14', end: '2028-07-30', source: 'https://www.nbclosangeles.com/olympics/2028-los-angeles/2028-olympics-opening-closing-ceremony/3696463/' },
  { id: 'emmys-2028', kind: 'awards', name: 'THE EMMYS', note: 'Date to be announced.', start: '2028-09', tentative: true, source: 'https://www.wsls.com/entertainment/2026/10/06/emmy-awards-to-move-to-prime-video-in-2027-in-6-year-deal-between-amazon-and-the-television-academy/' },
  { id: 'nfl-kickoff-2028', kind: 'sports', name: 'NFL SEASON KICKOFF', note: 'Exact date not out yet.', start: '2028-09', tentative: true, source: 'https://www.nfl.com/schedules/' },
  { id: 'world-series-2028', kind: 'sports', name: 'WORLD SERIES', note: 'Exact dates not out yet.', start: '2028-10', tentative: true, source: 'https://www.mlb.com/postseason' },
  { id: 'nba-open-2028', kind: 'sports', name: 'NBA SEASON STARTS', note: 'Exact date not out yet.', start: '2028-10', tentative: true, source: 'https://www.nba.com/' },
  { id: 'election-2028', kind: 'civic', name: 'US ELECTION NIGHT', tickerName: 'ELECTION NIGHT', note: 'Presidential. Results on every screen.', start: '2028-11-07', source: 'https://en.wikipedia.org/wiki/2028_United_States_presidential_election' },
  { id: 'macys-parade-2028', kind: 'culture', name: "MACY'S THANKSGIVING PARADE", tickerName: "MACY'S PARADE", note: 'Exact date not out yet.', start: '2028-11', tentative: true, source: 'https://www.macys.com/social/parade/' },
];
