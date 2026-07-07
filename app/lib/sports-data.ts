export type Sport = {
  id: string;
  name: string;
  emoji: string;
  leagues: League[];
};

export type League = {
  id: string;
  name: string;
  country: string;
  teams: Team[];
};

export type Team = {
  id: string;
  name: string;
  shortName: string;
  city?: string;
};

export const SPORTS: Sport[] = [
  // ─── American Football ────────────────────────────────────────────────────
  {
    id: 'american-football',
    name: 'American Football',
    emoji: '🏈',
    leagues: [
      {
        id: 'nfl',
        name: 'NFL',
        country: 'USA',
        teams: [
          { id: 'ari', name: 'Arizona Cardinals', shortName: 'Cardinals', city: 'Arizona' },
          { id: 'atl', name: 'Atlanta Falcons', shortName: 'Falcons', city: 'Atlanta' },
          { id: 'bal', name: 'Baltimore Ravens', shortName: 'Ravens', city: 'Baltimore' },
          { id: 'buf', name: 'Buffalo Bills', shortName: 'Bills', city: 'Buffalo' },
          { id: 'car', name: 'Carolina Panthers', shortName: 'Panthers', city: 'Carolina' },
          { id: 'chi', name: 'Chicago Bears', shortName: 'Bears', city: 'Chicago' },
          { id: 'cin', name: 'Cincinnati Bengals', shortName: 'Bengals', city: 'Cincinnati' },
          { id: 'cle', name: 'Cleveland Browns', shortName: 'Browns', city: 'Cleveland' },
          { id: 'dal', name: 'Dallas Cowboys', shortName: 'Cowboys', city: 'Dallas' },
          { id: 'den', name: 'Denver Broncos', shortName: 'Broncos', city: 'Denver' },
          { id: 'det', name: 'Detroit Lions', shortName: 'Lions', city: 'Detroit' },
          { id: 'gb', name: 'Green Bay Packers', shortName: 'Packers', city: 'Green Bay' },
          { id: 'hou', name: 'Houston Texans', shortName: 'Texans', city: 'Houston' },
          { id: 'ind', name: 'Indianapolis Colts', shortName: 'Colts', city: 'Indianapolis' },
          { id: 'jax', name: 'Jacksonville Jaguars', shortName: 'Jaguars', city: 'Jacksonville' },
          { id: 'kc', name: 'Kansas City Chiefs', shortName: 'Chiefs', city: 'Kansas City' },
          { id: 'lv', name: 'Las Vegas Raiders', shortName: 'Raiders', city: 'Las Vegas' },
          { id: 'lac', name: 'Los Angeles Chargers', shortName: 'Chargers', city: 'Los Angeles' },
          { id: 'lar', name: 'Los Angeles Rams', shortName: 'Rams', city: 'Los Angeles' },
          { id: 'mia', name: 'Miami Dolphins', shortName: 'Dolphins', city: 'Miami' },
          { id: 'min', name: 'Minnesota Vikings', shortName: 'Vikings', city: 'Minnesota' },
          { id: 'ne', name: 'New England Patriots', shortName: 'Patriots', city: 'New England' },
          { id: 'no', name: 'New Orleans Saints', shortName: 'Saints', city: 'New Orleans' },
          { id: 'nyg', name: 'New York Giants', shortName: 'Giants', city: 'New York' },
          { id: 'nyj', name: 'New York Jets', shortName: 'Jets', city: 'New York' },
          { id: 'phi', name: 'Philadelphia Eagles', shortName: 'Eagles', city: 'Philadelphia' },
          { id: 'pit', name: 'Pittsburgh Steelers', shortName: 'Steelers', city: 'Pittsburgh' },
          { id: 'sf', name: 'San Francisco 49ers', shortName: '49ers', city: 'San Francisco' },
          { id: 'sea', name: 'Seattle Seahawks', shortName: 'Seahawks', city: 'Seattle' },
          { id: 'tb', name: 'Tampa Bay Buccaneers', shortName: 'Buccaneers', city: 'Tampa Bay' },
          { id: 'ten', name: 'Tennessee Titans', shortName: 'Titans', city: 'Tennessee' },
          { id: 'was', name: 'Washington Commanders', shortName: 'Commanders', city: 'Washington' },
        ],
      },
    ],
  },

  // ─── Basketball ───────────────────────────────────────────────────────────
  {
    id: 'basketball',
    name: 'Basketball',
    emoji: '🏀',
    leagues: [
      {
        id: 'nba',
        name: 'NBA',
        country: 'USA',
        teams: [
          { id: 'atl-h', name: 'Atlanta Hawks', shortName: 'Hawks', city: 'Atlanta' },
          { id: 'bos', name: 'Boston Celtics', shortName: 'Celtics', city: 'Boston' },
          { id: 'bkn', name: 'Brooklyn Nets', shortName: 'Nets', city: 'Brooklyn' },
          { id: 'cha', name: 'Charlotte Hornets', shortName: 'Hornets', city: 'Charlotte' },
          { id: 'chi-b', name: 'Chicago Bulls', shortName: 'Bulls', city: 'Chicago' },
          { id: 'cle-c', name: 'Cleveland Cavaliers', shortName: 'Cavaliers', city: 'Cleveland' },
          { id: 'dal-m', name: 'Dallas Mavericks', shortName: 'Mavericks', city: 'Dallas' },
          { id: 'den-n', name: 'Denver Nuggets', shortName: 'Nuggets', city: 'Denver' },
          { id: 'det-p', name: 'Detroit Pistons', shortName: 'Pistons', city: 'Detroit' },
          { id: 'gs', name: 'Golden State Warriors', shortName: 'Warriors', city: 'Golden State' },
          { id: 'hou-r', name: 'Houston Rockets', shortName: 'Rockets', city: 'Houston' },
          { id: 'ind-p', name: 'Indiana Pacers', shortName: 'Pacers', city: 'Indiana' },
          { id: 'lac', name: 'LA Clippers', shortName: 'Clippers', city: 'Los Angeles' },
          { id: 'lal', name: 'Los Angeles Lakers', shortName: 'Lakers', city: 'Los Angeles' },
          { id: 'mem', name: 'Memphis Grizzlies', shortName: 'Grizzlies', city: 'Memphis' },
          { id: 'mia-h', name: 'Miami Heat', shortName: 'Heat', city: 'Miami' },
          { id: 'mil', name: 'Milwaukee Bucks', shortName: 'Bucks', city: 'Milwaukee' },
          { id: 'min-t', name: 'Minnesota Timberwolves', shortName: 'Timberwolves', city: 'Minnesota' },
          { id: 'no-p', name: 'New Orleans Pelicans', shortName: 'Pelicans', city: 'New Orleans' },
          { id: 'nyk', name: 'New York Knicks', shortName: 'Knicks', city: 'New York' },
          { id: 'okc', name: 'Oklahoma City Thunder', shortName: 'Thunder', city: 'Oklahoma City' },
          { id: 'orl', name: 'Orlando Magic', shortName: 'Magic', city: 'Orlando' },
          { id: 'phi-s', name: 'Philadelphia 76ers', shortName: '76ers', city: 'Philadelphia' },
          { id: 'phx', name: 'Phoenix Suns', shortName: 'Suns', city: 'Phoenix' },
          { id: 'por', name: 'Portland Trail Blazers', shortName: 'Trail Blazers', city: 'Portland' },
          { id: 'sac', name: 'Sacramento Kings', shortName: 'Kings', city: 'Sacramento' },
          { id: 'sa', name: 'San Antonio Spurs', shortName: 'Spurs', city: 'San Antonio' },
          { id: 'tor', name: 'Toronto Raptors', shortName: 'Raptors', city: 'Toronto' },
          { id: 'uta', name: 'Utah Jazz', shortName: 'Jazz', city: 'Utah' },
          { id: 'was-w', name: 'Washington Wizards', shortName: 'Wizards', city: 'Washington' },
        ],
      },
    ],
  },

  // ─── Baseball ─────────────────────────────────────────────────────────────
  {
    id: 'baseball',
    name: 'Baseball',
    emoji: '⚾',
    leagues: [
      {
        id: 'mlb',
        name: 'MLB',
        country: 'USA',
        teams: [
          { id: 'ari-d', name: 'Arizona Diamondbacks', shortName: 'D-backs', city: 'Arizona' },
          { id: 'atl-b', name: 'Atlanta Braves', shortName: 'Braves', city: 'Atlanta' },
          { id: 'bal-o', name: 'Baltimore Orioles', shortName: 'Orioles', city: 'Baltimore' },
          { id: 'bos-s', name: 'Boston Red Sox', shortName: 'Red Sox', city: 'Boston' },
          { id: 'chi-c', name: 'Chicago Cubs', shortName: 'Cubs', city: 'Chicago' },
          { id: 'chi-w', name: 'Chicago White Sox', shortName: 'White Sox', city: 'Chicago' },
          { id: 'cin-r', name: 'Cincinnati Reds', shortName: 'Reds', city: 'Cincinnati' },
          { id: 'cle-g', name: 'Cleveland Guardians', shortName: 'Guardians', city: 'Cleveland' },
          { id: 'col', name: 'Colorado Rockies', shortName: 'Rockies', city: 'Colorado' },
          { id: 'det-t', name: 'Detroit Tigers', shortName: 'Tigers', city: 'Detroit' },
          { id: 'hou-a', name: 'Houston Astros', shortName: 'Astros', city: 'Houston' },
          { id: 'kc-r', name: 'Kansas City Royals', shortName: 'Royals', city: 'Kansas City' },
          { id: 'la-d', name: 'Los Angeles Dodgers', shortName: 'Dodgers', city: 'Los Angeles' },
          { id: 'la-a', name: 'Los Angeles Angels', shortName: 'Angels', city: 'Los Angeles' },
          { id: 'mia-m', name: 'Miami Marlins', shortName: 'Marlins', city: 'Miami' },
          { id: 'mil-b', name: 'Milwaukee Brewers', shortName: 'Brewers', city: 'Milwaukee' },
          { id: 'min-t2', name: 'Minnesota Twins', shortName: 'Twins', city: 'Minnesota' },
          { id: 'nym', name: 'New York Mets', shortName: 'Mets', city: 'New York' },
          { id: 'nyy', name: 'New York Yankees', shortName: 'Yankees', city: 'New York' },
          { id: 'oak', name: 'Oakland Athletics', shortName: 'Athletics', city: 'Oakland' },
          { id: 'phi-p', name: 'Philadelphia Phillies', shortName: 'Phillies', city: 'Philadelphia' },
          { id: 'pit-p', name: 'Pittsburgh Pirates', shortName: 'Pirates', city: 'Pittsburgh' },
          { id: 'sd', name: 'San Diego Padres', shortName: 'Padres', city: 'San Diego' },
          { id: 'sf-g', name: 'San Francisco Giants', shortName: 'Giants', city: 'San Francisco' },
          { id: 'sea-m', name: 'Seattle Mariners', shortName: 'Mariners', city: 'Seattle' },
          { id: 'stl', name: 'St. Louis Cardinals', shortName: 'Cardinals', city: 'St. Louis' },
          { id: 'tb-r', name: 'Tampa Bay Rays', shortName: 'Rays', city: 'Tampa Bay' },
          { id: 'tex', name: 'Texas Rangers', shortName: 'Rangers', city: 'Texas' },
          { id: 'tor-b', name: 'Toronto Blue Jays', shortName: 'Blue Jays', city: 'Toronto' },
          { id: 'was-n', name: 'Washington Nationals', shortName: 'Nationals', city: 'Washington' },
        ],
      },
    ],
  },

  // ─── Ice Hockey ───────────────────────────────────────────────────────────
  {
    id: 'ice-hockey',
    name: 'Ice Hockey',
    emoji: '🏒',
    leagues: [
      {
        id: 'nhl',
        name: 'NHL',
        country: 'USA/Canada',
        teams: [
          { id: 'ana', name: 'Anaheim Ducks', shortName: 'Ducks', city: 'Anaheim' },
          { id: 'ari-c', name: 'Arizona Coyotes', shortName: 'Coyotes', city: 'Arizona' },
          { id: 'bos-b', name: 'Boston Bruins', shortName: 'Bruins', city: 'Boston' },
          { id: 'buf-s', name: 'Buffalo Sabres', shortName: 'Sabres', city: 'Buffalo' },
          { id: 'cal', name: 'Calgary Flames', shortName: 'Flames', city: 'Calgary' },
          { id: 'car-h', name: 'Carolina Hurricanes', shortName: 'Hurricanes', city: 'Carolina' },
          { id: 'chi-bh', name: 'Chicago Blackhawks', shortName: 'Blackhawks', city: 'Chicago' },
          { id: 'col-a', name: 'Colorado Avalanche', shortName: 'Avalanche', city: 'Colorado' },
          { id: 'cbj', name: 'Columbus Blue Jackets', shortName: 'Blue Jackets', city: 'Columbus' },
          { id: 'dal-s', name: 'Dallas Stars', shortName: 'Stars', city: 'Dallas' },
          { id: 'det-rw', name: 'Detroit Red Wings', shortName: 'Red Wings', city: 'Detroit' },
          { id: 'edm', name: 'Edmonton Oilers', shortName: 'Oilers', city: 'Edmonton' },
          { id: 'fla', name: 'Florida Panthers', shortName: 'Panthers', city: 'Florida' },
          { id: 'lak', name: 'Los Angeles Kings', shortName: 'Kings', city: 'Los Angeles' },
          { id: 'min-w', name: 'Minnesota Wild', shortName: 'Wild', city: 'Minnesota' },
          { id: 'mtl', name: 'Montreal Canadiens', shortName: 'Canadiens', city: 'Montreal' },
          { id: 'nsh', name: 'Nashville Predators', shortName: 'Predators', city: 'Nashville' },
          { id: 'njd', name: 'New Jersey Devils', shortName: 'Devils', city: 'New Jersey' },
          { id: 'nyi', name: 'New York Islanders', shortName: 'Islanders', city: 'New York' },
          { id: 'nyr', name: 'New York Rangers', shortName: 'Rangers', city: 'New York' },
          { id: 'ott', name: 'Ottawa Senators', shortName: 'Senators', city: 'Ottawa' },
          { id: 'phi-f', name: 'Philadelphia Flyers', shortName: 'Flyers', city: 'Philadelphia' },
          { id: 'pit-p2', name: 'Pittsburgh Penguins', shortName: 'Penguins', city: 'Pittsburgh' },
          { id: 'sjsh', name: 'San Jose Sharks', shortName: 'Sharks', city: 'San Jose' },
          { id: 'sea-k', name: 'Seattle Kraken', shortName: 'Kraken', city: 'Seattle' },
          { id: 'stl-b', name: 'St. Louis Blues', shortName: 'Blues', city: 'St. Louis' },
          { id: 'tbl', name: 'Tampa Bay Lightning', shortName: 'Lightning', city: 'Tampa Bay' },
          { id: 'tor-ml', name: 'Toronto Maple Leafs', shortName: 'Maple Leafs', city: 'Toronto' },
          { id: 'van', name: 'Vancouver Canucks', shortName: 'Canucks', city: 'Vancouver' },
          { id: 'vgk', name: 'Vegas Golden Knights', shortName: 'Golden Knights', city: 'Vegas' },
          { id: 'was-c', name: 'Washington Capitals', shortName: 'Capitals', city: 'Washington' },
          { id: 'wpg', name: 'Winnipeg Jets', shortName: 'Jets', city: 'Winnipeg' },
        ],
      },
    ],
  },

  // ─── Soccer / Football ────────────────────────────────────────────────────
  {
    id: 'soccer',
    name: 'Soccer',
    emoji: '⚽',
    leagues: [
      {
        id: 'premier-league',
        name: 'Premier League',
        country: 'England',
        teams: [
          { id: 'ars', name: 'Arsenal', shortName: 'Arsenal', city: 'London' },
          { id: 'avl', name: 'Aston Villa', shortName: 'Villa', city: 'Birmingham' },
          { id: 'bou', name: 'Bournemouth', shortName: 'Bournemouth', city: 'Bournemouth' },
          { id: 'bre', name: 'Brentford', shortName: 'Brentford', city: 'London' },
          { id: 'bha', name: 'Brighton', shortName: 'Brighton', city: 'Brighton' },
          { id: 'che', name: 'Chelsea', shortName: 'Chelsea', city: 'London' },
          { id: 'cry', name: 'Crystal Palace', shortName: 'Palace', city: 'London' },
          { id: 'eve', name: 'Everton', shortName: 'Everton', city: 'Liverpool' },
          { id: 'ful', name: 'Fulham', shortName: 'Fulham', city: 'London' },
          { id: 'ips', name: 'Ipswich Town', shortName: 'Ipswich', city: 'Ipswich' },
          { id: 'lei', name: 'Leicester City', shortName: 'Leicester', city: 'Leicester' },
          { id: 'liv', name: 'Liverpool', shortName: 'Liverpool', city: 'Liverpool' },
          { id: 'mci', name: 'Manchester City', shortName: 'Man City', city: 'Manchester' },
          { id: 'mun', name: 'Manchester United', shortName: 'Man Utd', city: 'Manchester' },
          { id: 'new', name: 'Newcastle United', shortName: 'Newcastle', city: 'Newcastle' },
          { id: 'nfo', name: 'Nottingham Forest', shortName: "Nott'm Forest", city: 'Nottingham' },
          { id: 'sou', name: 'Southampton', shortName: 'Southampton', city: 'Southampton' },
          { id: 'tot', name: 'Tottenham Hotspur', shortName: 'Spurs', city: 'London' },
          { id: 'whu', name: 'West Ham United', shortName: 'West Ham', city: 'London' },
          { id: 'wol', name: 'Wolverhampton Wanderers', shortName: 'Wolves', city: 'Wolverhampton' },
        ],
      },
      {
        id: 'la-liga',
        name: 'La Liga',
        country: 'Spain',
        teams: [
          { id: 'ath', name: 'Athletic Club', shortName: 'Athletic', city: 'Bilbao' },
          { id: 'atm', name: 'Atlético Madrid', shortName: 'Atleti', city: 'Madrid' },
          { id: 'bar', name: 'FC Barcelona', shortName: 'Barça', city: 'Barcelona' },
          { id: 'bet', name: 'Real Betis', shortName: 'Betis', city: 'Seville' },
          { id: 'cel', name: 'Celta Vigo', shortName: 'Celta', city: 'Vigo' },
          { id: 'esh', name: 'Espanyol', shortName: 'Espanyol', city: 'Barcelona' },
          { id: 'gir', name: 'Girona', shortName: 'Girona', city: 'Girona' },
          { id: 'get', name: 'Getafe', shortName: 'Getafe', city: 'Getafe' },
          { id: 'gra', name: 'Granada', shortName: 'Granada', city: 'Granada' },
          { id: 'las', name: 'Las Palmas', shortName: 'Las Palmas', city: 'Las Palmas' },
          { id: 'leg', name: 'Leganés', shortName: 'Leganés', city: 'Leganés' },
          { id: 'mal', name: 'Málaga', shortName: 'Málaga', city: 'Málaga' },
          { id: 'may', name: 'Mallorca', shortName: 'Mallorca', city: 'Palma' },
          { id: 'osa', name: 'Osasuna', shortName: 'Osasuna', city: 'Pamplona' },
          { id: 'rayo', name: 'Rayo Vallecano', shortName: 'Rayo', city: 'Madrid' },
          { id: 'rm', name: 'Real Madrid', shortName: 'Real Madrid', city: 'Madrid' },
          { id: 'rso', name: 'Real Sociedad', shortName: 'Sociedad', city: 'San Sebastián' },
          { id: 'rva', name: 'Real Valladolid', shortName: 'Valladolid', city: 'Valladolid' },
          { id: 'sev', name: 'Sevilla', shortName: 'Sevilla', city: 'Seville' },
          { id: 'val', name: 'Valencia', shortName: 'Valencia', city: 'Valencia' },
          { id: 'vil', name: 'Villarreal', shortName: 'Villarreal', city: 'Villarreal' },
        ],
      },
      {
        id: 'bundesliga',
        name: 'Bundesliga',
        country: 'Germany',
        teams: [
          { id: 'b04', name: 'Bayer Leverkusen', shortName: 'Leverkusen', city: 'Leverkusen' },
          { id: 'bay', name: 'Bayern Munich', shortName: 'Bayern', city: 'Munich' },
          { id: 'boc', name: 'VfL Bochum', shortName: 'Bochum', city: 'Bochum' },
          { id: 'bre-w', name: 'Werder Bremen', shortName: 'Bremen', city: 'Bremen' },
          { id: 'dor', name: 'Borussia Dortmund', shortName: 'Dortmund', city: 'Dortmund' },
          { id: 'ein', name: 'Eintracht Frankfurt', shortName: 'Frankfurt', city: 'Frankfurt' },
          { id: 'fcko', name: 'FC Köln', shortName: 'Köln', city: 'Cologne' },
          { id: 'fre', name: 'SC Freiburg', shortName: 'Freiburg', city: 'Freiburg' },
          { id: 'hei', name: 'TSG Hoffenheim', shortName: 'Hoffenheim', city: 'Hoffenheim' },
          { id: 'her', name: 'Hertha BSC', shortName: 'Hertha', city: 'Berlin' },
          { id: 'hol', name: 'Holstein Kiel', shortName: 'Kiel', city: 'Kiel' },
          { id: 'hsc', name: 'Hamburger SV', shortName: 'Hamburg', city: 'Hamburg' },
          { id: 'mgl', name: 'Borussia Mönchengladbach', shortName: 'Gladbach', city: 'Mönchengladbach' },
          { id: 'rb', name: 'RB Leipzig', shortName: 'Leipzig', city: 'Leipzig' },
          { id: 'sch', name: 'FC Schalke 04', shortName: 'Schalke', city: 'Gelsenkirchen' },
          { id: 'stut', name: 'VfB Stuttgart', shortName: 'Stuttgart', city: 'Stuttgart' },
          { id: 'ubs', name: 'Union Berlin', shortName: 'Union Berlin', city: 'Berlin' },
          { id: 'wol-vfl', name: 'VfL Wolfsburg', shortName: 'Wolfsburg', city: 'Wolfsburg' },
        ],
      },
      {
        id: 'serie-a',
        name: 'Serie A',
        country: 'Italy',
        teams: [
          { id: 'ata', name: 'Atalanta', shortName: 'Atalanta', city: 'Bergamo' },
          { id: 'bol', name: 'Bologna', shortName: 'Bologna', city: 'Bologna' },
          { id: 'cal', name: 'Cagliari', shortName: 'Cagliari', city: 'Cagliari' },
          { id: 'com', name: 'Como', shortName: 'Como', city: 'Como' },
          { id: 'emp', name: 'Empoli', shortName: 'Empoli', city: 'Empoli' },
          { id: 'fio', name: 'Fiorentina', shortName: 'Fiorentina', city: 'Florence' },
          { id: 'frosinone', name: 'Frosinone', shortName: 'Frosinone', city: 'Frosinone' },
          { id: 'gen', name: 'Genoa', shortName: 'Genoa', city: 'Genoa' },
          { id: 'hel', name: 'Hellas Verona', shortName: 'Verona', city: 'Verona' },
          { id: 'int', name: 'Inter Milan', shortName: 'Inter', city: 'Milan' },
          { id: 'juv', name: 'Juventus', shortName: 'Juve', city: 'Turin' },
          { id: 'laz', name: 'Lazio', shortName: 'Lazio', city: 'Rome' },
          { id: 'lec', name: 'Lecce', shortName: 'Lecce', city: 'Lecce' },
          { id: 'mil', name: 'AC Milan', shortName: 'Milan', city: 'Milan' },
          { id: 'mon', name: 'Monza', shortName: 'Monza', city: 'Monza' },
          { id: 'nap', name: 'Napoli', shortName: 'Napoli', city: 'Naples' },
          { id: 'par', name: 'Parma', shortName: 'Parma', city: 'Parma' },
          { id: 'rom', name: 'AS Roma', shortName: 'Roma', city: 'Rome' },
          { id: 'sas', name: 'Sassuolo', shortName: 'Sassuolo', city: 'Sassuolo' },
          { id: 'tor-fc', name: 'Torino', shortName: 'Torino', city: 'Turin' },
          { id: 'udi', name: 'Udinese', shortName: 'Udinese', city: 'Udine' },
          { id: 'ven', name: 'Venezia', shortName: 'Venezia', city: 'Venice' },
        ],
      },
      {
        id: 'ligue-1',
        name: 'Ligue 1',
        country: 'France',
        teams: [
          { id: 'aja', name: 'AJ Auxerre', shortName: 'Auxerre', city: 'Auxerre' },
          { id: 'ang', name: 'Angers SCO', shortName: 'Angers', city: 'Angers' },
          { id: 'asm', name: 'AS Monaco', shortName: 'Monaco', city: 'Monaco' },
          { id: 'ass', name: 'AS Saint-Étienne', shortName: "Saint-Étienne", city: "Saint-Étienne" },
          { id: 'aux', name: 'Auxerre', shortName: 'Auxerre', city: 'Auxerre' },
          { id: 'bor', name: 'Girondins de Bordeaux', shortName: 'Bordeaux', city: 'Bordeaux' },
          { id: 'bre-f', name: 'Stade Brestois', shortName: 'Brest', city: 'Brest' },
          { id: 'hac', name: 'Le Havre', shortName: 'Le Havre', city: 'Le Havre' },
          { id: 'lil', name: 'LOSC Lille', shortName: 'Lille', city: 'Lille' },
          { id: 'lyn', name: 'Olympique Lyonnais', shortName: 'Lyon', city: 'Lyon' },
          { id: 'mar', name: 'Olympique de Marseille', shortName: 'Marseille', city: 'Marseille' },
          { id: 'mtz', name: 'FC Metz', shortName: 'Metz', city: 'Metz' },
          { id: 'nan', name: 'FC Nantes', shortName: 'Nantes', city: 'Nantes' },
          { id: 'nic', name: 'OGC Nice', shortName: 'Nice', city: 'Nice' },
          { id: 'psg', name: 'Paris Saint-Germain', shortName: 'PSG', city: 'Paris' },
          { id: 'ren', name: 'Stade Rennais', shortName: 'Rennes', city: 'Rennes' },
          { id: 'str', name: 'RC Strasbourg', shortName: 'Strasbourg', city: 'Strasbourg' },
          { id: 'tou', name: 'Toulouse FC', shortName: 'Toulouse', city: 'Toulouse' },
        ],
      },
      {
        id: 'mls',
        name: 'MLS',
        country: 'USA/Canada',
        teams: [
          { id: 'atl-u', name: 'Atlanta United', shortName: 'Atlanta Utd', city: 'Atlanta' },
          { id: 'aus', name: 'Austin FC', shortName: 'Austin FC', city: 'Austin' },
          { id: 'chi-f', name: 'Chicago Fire', shortName: 'Chicago Fire', city: 'Chicago' },
          { id: 'cin-fc', name: 'FC Cincinnati', shortName: 'Cincinnati', city: 'Cincinnati' },
          { id: 'col-r', name: 'Colorado Rapids', shortName: 'Colorado', city: 'Colorado' },
          { id: 'col-c', name: 'Columbus Crew', shortName: 'Columbus', city: 'Columbus' },
          { id: 'dal-fc', name: 'FC Dallas', shortName: 'FC Dallas', city: 'Dallas' },
          { id: 'dc', name: 'D.C. United', shortName: 'DC United', city: 'Washington' },
          { id: 'hou-d', name: 'Houston Dynamo', shortName: 'Houston', city: 'Houston' },
          { id: 'int-mia', name: 'Inter Miami', shortName: 'Inter Miami', city: 'Miami' },
          { id: 'kc-s', name: 'Sporting Kansas City', shortName: 'Sporting KC', city: 'Kansas City' },
          { id: 'la-fc', name: 'LAFC', shortName: 'LAFC', city: 'Los Angeles' },
          { id: 'la-g', name: 'LA Galaxy', shortName: 'LA Galaxy', city: 'Los Angeles' },
          { id: 'min-u', name: 'Minnesota United', shortName: 'Minnesota', city: 'Minnesota' },
          { id: 'cf-mtl', name: 'CF Montréal', shortName: 'Montréal', city: 'Montreal' },
          { id: 'nas', name: 'Nashville SC', shortName: 'Nashville', city: 'Nashville' },
          { id: 'ne-r', name: 'New England Revolution', shortName: 'New England', city: 'Boston' },
          { id: 'nyc', name: 'New York City FC', shortName: 'NYCFC', city: 'New York' },
          { id: 'nyrb', name: 'New York Red Bulls', shortName: 'NY Red Bulls', city: 'New York' },
          { id: 'orl-c', name: 'Orlando City', shortName: 'Orlando', city: 'Orlando' },
          { id: 'phi-u', name: 'Philadelphia Union', shortName: 'Philadelphia', city: 'Philadelphia' },
          { id: 'por-t', name: 'Portland Timbers', shortName: 'Portland', city: 'Portland' },
          { id: 'rsl', name: 'Real Salt Lake', shortName: 'Salt Lake', city: 'Salt Lake City' },
          { id: 'sjea', name: 'San Jose Earthquakes', shortName: 'San Jose', city: 'San Jose' },
          { id: 'sea-s', name: 'Seattle Sounders', shortName: 'Seattle', city: 'Seattle' },
          { id: 'skc', name: 'Sporting Kansas City', shortName: 'Sporting KC', city: 'Kansas City' },
          { id: 'st-l', name: 'St. Louis City SC', shortName: 'St. Louis', city: 'St. Louis' },
          { id: 'tor-fc2', name: 'Toronto FC', shortName: 'Toronto', city: 'Toronto' },
          { id: 'van-wh', name: 'Vancouver Whitecaps', shortName: 'Vancouver', city: 'Vancouver' },
        ],
      },
      {
        id: 'ucl',
        name: 'UEFA Champions League',
        country: 'Europe',
        teams: [
          { id: 'ucl-ars', name: 'Arsenal', shortName: 'Arsenal', city: 'London' },
          { id: 'ucl-atm', name: 'Atlético Madrid', shortName: 'Atleti', city: 'Madrid' },
          { id: 'ucl-bar', name: 'FC Barcelona', shortName: 'Barça', city: 'Barcelona' },
          { id: 'ucl-bay', name: 'Bayern Munich', shortName: 'Bayern', city: 'Munich' },
          { id: 'ucl-bvb', name: 'Borussia Dortmund', shortName: 'Dortmund', city: 'Dortmund' },
          { id: 'ucl-che', name: 'Chelsea', shortName: 'Chelsea', city: 'London' },
          { id: 'ucl-int', name: 'Inter Milan', shortName: 'Inter', city: 'Milan' },
          { id: 'ucl-juv', name: 'Juventus', shortName: 'Juve', city: 'Turin' },
          { id: 'ucl-liv', name: 'Liverpool', shortName: 'Liverpool', city: 'Liverpool' },
          { id: 'ucl-mci', name: 'Manchester City', shortName: 'Man City', city: 'Manchester' },
          { id: 'ucl-mil', name: 'AC Milan', shortName: 'Milan', city: 'Milan' },
          { id: 'ucl-nap', name: 'Napoli', shortName: 'Napoli', city: 'Naples' },
          { id: 'ucl-par', name: 'Paris Saint-Germain', shortName: 'PSG', city: 'Paris' },
          { id: 'ucl-rb', name: 'RB Leipzig', shortName: 'Leipzig', city: 'Leipzig' },
          { id: 'ucl-rm', name: 'Real Madrid', shortName: 'Real Madrid', city: 'Madrid' },
        ],
      },
    ],
  },

  // ─── Formula 1 ───────────────────────────────────────────────────────────
  {
    id: 'f1',
    name: 'Formula 1',
    emoji: '🏎️',
    leagues: [
      {
        id: 'f1-2025',
        name: 'F1 Constructors',
        country: 'International',
        teams: [
          { id: 'f1-alp', name: 'Alpine', shortName: 'Alpine' },
          { id: 'f1-ast', name: 'Aston Martin', shortName: 'Aston Martin' },
          { id: 'f1-fer', name: 'Ferrari', shortName: 'Ferrari' },
          { id: 'f1-haa', name: 'Haas', shortName: 'Haas' },
          { id: 'f1-kick', name: 'Kick Sauber', shortName: 'Sauber' },
          { id: 'f1-mcl', name: 'McLaren', shortName: 'McLaren' },
          { id: 'f1-mer', name: 'Mercedes', shortName: 'Mercedes' },
          { id: 'f1-rb', name: 'Racing Bulls', shortName: 'Racing Bulls' },
          { id: 'f1-rbr', name: 'Red Bull Racing', shortName: 'Red Bull' },
          { id: 'f1-wil', name: 'Williams', shortName: 'Williams' },
        ],
      },
    ],
  },

  // ─── Rugby Union ─────────────────────────────────────────────────────────
  {
    id: 'rugby-union',
    name: 'Rugby Union',
    emoji: '🏉',
    leagues: [
      {
        id: 'six-nations',
        name: 'Six Nations',
        country: 'Europe',
        teams: [
          { id: 'eng-r', name: 'England', shortName: 'England' },
          { id: 'fra-r', name: 'France', shortName: 'France' },
          { id: 'ire-r', name: 'Ireland', shortName: 'Ireland' },
          { id: 'ita-r', name: 'Italy', shortName: 'Italy' },
          { id: 'sco-r', name: 'Scotland', shortName: 'Scotland' },
          { id: 'wal-r', name: 'Wales', shortName: 'Wales' },
        ],
      },
      {
        id: 'rugby-wc',
        name: 'Rugby World Cup',
        country: 'International',
        teams: [
          { id: 'arg-r', name: 'Argentina', shortName: 'Pumas' },
          { id: 'aus-r', name: 'Australia', shortName: 'Wallabies' },
          { id: 'nzl-r', name: 'New Zealand', shortName: 'All Blacks' },
          { id: 'rsa-r', name: 'South Africa', shortName: 'Springboks' },
          { id: 'sam-r', name: 'Samoa', shortName: 'Samoa' },
          { id: 'fij-r', name: 'Fiji', shortName: 'Fiji' },
          { id: 'jpn-r', name: 'Japan', shortName: 'Brave Blossoms' },
        ],
      },
      {
        id: 'premiership-rugby',
        name: 'Premiership Rugby',
        country: 'England',
        teams: [
          { id: 'bath-r', name: 'Bath Rugby', shortName: 'Bath' },
          { id: 'bri-r', name: 'Bristol Bears', shortName: 'Bristol' },
          { id: 'exe-r', name: 'Exeter Chiefs', shortName: 'Exeter' },
          { id: 'glo-r', name: 'Gloucester Rugby', shortName: 'Gloucester' },
          { id: 'har-r', name: 'Harlequins', shortName: 'Harlequins' },
          { id: 'lei-t', name: 'Leicester Tigers', shortName: 'Leicester' },
          { id: 'lon-i', name: 'London Irish', shortName: 'London Irish' },
          { id: 'new-f', name: 'Newcastle Falcons', shortName: 'Newcastle' },
          { id: 'nor-s', name: 'Northampton Saints', shortName: 'Northampton' },
          { id: 'sal-r', name: 'Sale Sharks', shortName: 'Sale' },
          { id: 'was-r', name: 'Wasps', shortName: 'Wasps' },
          { id: 'wor-r', name: 'Worcester Warriors', shortName: 'Worcester' },
        ],
      },
    ],
  },

  // ─── Cricket ─────────────────────────────────────────────────────────────
  {
    id: 'cricket',
    name: 'Cricket',
    emoji: '🏏',
    leagues: [
      {
        id: 'test-nations',
        name: 'Test Nations',
        country: 'International',
        teams: [
          { id: 'aus-c', name: 'Australia', shortName: 'Australia' },
          { id: 'ban-c', name: 'Bangladesh', shortName: 'Bangladesh' },
          { id: 'eng-c', name: 'England', shortName: 'England' },
          { id: 'ind-c', name: 'India', shortName: 'India' },
          { id: 'nzl-c', name: 'New Zealand', shortName: 'New Zealand' },
          { id: 'pak-c', name: 'Pakistan', shortName: 'Pakistan' },
          { id: 'rsa-c', name: 'South Africa', shortName: 'South Africa' },
          { id: 'lka-c', name: 'Sri Lanka', shortName: 'Sri Lanka' },
          { id: 'win-c', name: 'West Indies', shortName: 'West Indies' },
          { id: 'zim-c', name: 'Zimbabwe', shortName: 'Zimbabwe' },
          { id: 'ire-c', name: 'Ireland', shortName: 'Ireland' },
          { id: 'afg-c', name: 'Afghanistan', shortName: 'Afghanistan' },
        ],
      },
      {
        id: 'ipl',
        name: 'IPL',
        country: 'India',
        teams: [
          { id: 'csk', name: 'Chennai Super Kings', shortName: 'CSK', city: 'Chennai' },
          { id: 'dc-ipl', name: 'Delhi Capitals', shortName: 'DC', city: 'Delhi' },
          { id: 'gt-ipl', name: 'Gujarat Titans', shortName: 'GT', city: 'Gujarat' },
          { id: 'kkr', name: 'Kolkata Knight Riders', shortName: 'KKR', city: 'Kolkata' },
          { id: 'lsg', name: 'Lucknow Super Giants', shortName: 'LSG', city: 'Lucknow' },
          { id: 'mi-ipl', name: 'Mumbai Indians', shortName: 'MI', city: 'Mumbai' },
          { id: 'pbks', name: 'Punjab Kings', shortName: 'PBKS', city: 'Punjab' },
          { id: 'rr-ipl', name: 'Rajasthan Royals', shortName: 'RR', city: 'Rajasthan' },
          { id: 'rcb', name: 'Royal Challengers Bengaluru', shortName: 'RCB', city: 'Bengaluru' },
          { id: 'srh', name: 'Sunrisers Hyderabad', shortName: 'SRH', city: 'Hyderabad' },
        ],
      },
    ],
  },

  // ─── Tennis ───────────────────────────────────────────────────────────────
  {
    id: 'tennis',
    name: 'Tennis',
    emoji: '🎾',
    leagues: [
      {
        id: 'grand-slams',
        name: 'Grand Slams',
        country: 'International',
        teams: [
          { id: 'ao', name: 'Australian Open', shortName: 'Aus Open' },
          { id: 'rg', name: 'Roland Garros', shortName: 'French Open' },
          { id: 'wimb', name: 'Wimbledon', shortName: 'Wimbledon' },
          { id: 'uso', name: 'US Open', shortName: 'US Open' },
        ],
      },
    ],
  },

  // ─── Golf ─────────────────────────────────────────────────────────────────
  {
    id: 'golf',
    name: 'Golf',
    emoji: '⛳',
    leagues: [
      {
        id: 'majors',
        name: 'Majors',
        country: 'International',
        teams: [
          { id: 'masters', name: 'The Masters', shortName: 'Masters' },
          { id: 'pga-c', name: 'PGA Championship', shortName: 'PGA' },
          { id: 'us-open-g', name: 'US Open', shortName: 'US Open' },
          { id: 'the-open', name: 'The Open Championship', shortName: 'The Open' },
          { id: 'ryder', name: 'Ryder Cup', shortName: 'Ryder Cup' },
        ],
      },
    ],
  },

  // ─── Boxing / MMA ─────────────────────────────────────────────────────────
  {
    id: 'combat',
    name: 'Boxing & MMA',
    emoji: '🥊',
    leagues: [
      {
        id: 'ufc',
        name: 'UFC',
        country: 'USA',
        teams: [
          { id: 'ufc-hw', name: 'UFC Heavyweight', shortName: 'HW' },
          { id: 'ufc-lhw', name: 'UFC Light Heavyweight', shortName: 'LHW' },
          { id: 'ufc-mw', name: 'UFC Middleweight', shortName: 'MW' },
          { id: 'ufc-ww', name: 'UFC Welterweight', shortName: 'WW' },
          { id: 'ufc-lw', name: 'UFC Lightweight', shortName: 'LW' },
          { id: 'ufc-fw', name: 'UFC Featherweight', shortName: 'FW' },
        ],
      },
    ],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getAllTeams(): Team[] {
  return SPORTS.flatMap((s) => s.leagues.flatMap((l) => l.teams));
}

export function searchTeams(query: string): Array<Team & { sportName: string; leagueName: string }> {
  if (!query.trim()) return [];
  const q = query.toLowerCase();
  const results: Array<Team & { sportName: string; leagueName: string }> = [];
  for (const sport of SPORTS) {
    for (const league of sport.leagues) {
      for (const team of league.teams) {
        if (team.name.toLowerCase().includes(q) || team.shortName.toLowerCase().includes(q)) {
          results.push({ ...team, sportName: sport.name, leagueName: league.name });
        }
      }
    }
  }
  return results.slice(0, 50);
}

export function getSportById(id: string): Sport | undefined {
  return SPORTS.find((s) => s.id === id);
}

export function getTeamById(id: string): (Team & { sport: Sport; league: League }) | undefined {
  for (const sport of SPORTS) {
    for (const league of sport.leagues) {
      const team = league.teams.find((t) => t.id === id);
      if (team) return { ...team, sport, league };
    }
  }
  return undefined;
}
