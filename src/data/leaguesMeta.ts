import { LeagueId } from '../types/game';

export interface LeagueMeta {
  id: LeagueId;
  name: string;
  country: string;
  division: 1 | 2;
  uclSpots: number;
  uelSpots: number;
  relegationSpots: number;
  promotionSpots: number;
}

export const LEAGUES_META: LeagueMeta[] = [
  {
    id: 'premier-league',
    name: 'Premier League',
    country: 'England',
    division: 1,
    uclSpots: 5,
    uelSpots: 5,
    relegationSpots: 3,
    promotionSpots: 0,
  },
  {
    id: 'championship',
    name: 'Championship',
    country: 'England',
    division: 2,
    uclSpots: 0,
    uelSpots: 0,
    relegationSpots: 0,
    promotionSpots: 3,
  },
  {
    id: 'la-liga',
    name: 'La Liga',
    country: 'Spain',
    division: 1,
    uclSpots: 5,
    uelSpots: 5,
    relegationSpots: 0,
    promotionSpots: 0,
  },
  {
    id: 'ligue-1',
    name: 'Ligue 1',
    country: 'France',
    division: 1,
    uclSpots: 4,
    uelSpots: 4,
    relegationSpots: 0,
    promotionSpots: 0,
  },
  {
    id: 'bundesliga',
    name: 'Bundesliga',
    country: 'Germany',
    division: 1,
    uclSpots: 5,
    uelSpots: 5,
    relegationSpots: 2,
    promotionSpots: 0,
  },
  {
    id: 'bundesliga-2',
    name: 'Bundesliga 2',
    country: 'Germany',
    division: 2,
    uclSpots: 0,
    uelSpots: 0,
    relegationSpots: 0,
    promotionSpots: 2,
  },
  {
    id: 'eredivisie',
    name: 'Eredivisie',
    country: 'Holland',
    division: 1,
    uclSpots: 4,
    uelSpots: 4,
    relegationSpots: 0,
    promotionSpots: 0,
  },
  {
    id: 'liga-portugal',
    name: 'Liga Portugal',
    country: 'Portugal',
    division: 1,
    uclSpots: 4,
    uelSpots: 4,
    relegationSpots: 0,
    promotionSpots: 0,
  },
  {
    id: 'serie-a',
    name: 'Serie A',
    country: 'Italy',
    division: 1,
    uclSpots: 5,
    uelSpots: 5,
    relegationSpots: 0,
    promotionSpots: 0,
  },
];

export interface DomesticCupMeta {
  id: string;
  name: string;
  country: string;
  leagueIds: LeagueId[];
}

export const DOMESTIC_CUPS_META: DomesticCupMeta[] = [
  {
    id: 'copa-inglaterra',
    name: 'FA Cup (1ª & 2ª Div)',
    country: 'England',
    leagueIds: ['premier-league', 'championship'],
  },
  {
    id: 'copa-espanha',
    name: 'Copa del Rey',
    country: 'Spain',
    leagueIds: ['la-liga'],
  },
  {
    id: 'copa-franca',
    name: 'Coupe de France',
    country: 'France',
    leagueIds: ['ligue-1'],
  },
  {
    id: 'copa-alemanha',
    name: 'DFB-Pokal (1ª & 2ª Div)',
    country: 'Germany',
    leagueIds: ['bundesliga', 'bundesliga-2'],
  },
  {
    id: 'copa-holanda',
    name: 'KNVB Cup',
    country: 'Holland',
    leagueIds: ['eredivisie'],
  },
  {
    id: 'copa-portugal',
    name: 'Taça de Portugal',
    country: 'Portugal',
    leagueIds: ['liga-portugal'],
  },
  {
    id: 'copa-italia',
    name: 'Coppa Italia',
    country: 'Italy',
    leagueIds: ['serie-a'],
  },
];

export function normalizeLeagueId(raw?: string): LeagueId | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  if (s === 'premier-league' || s === 'premier league' || s === 'premier') return 'premier-league';
  if (s === 'championship' || s === 'efl championship' || s === 'efl-championship') return 'championship';
  if (s === 'la-liga' || s === 'la liga' || s === 'laliga' || s === 'laliga ea sports') return 'la-liga';
  if (s === 'ligue-1' || s === 'ligue 1' || s === 'ligue one' || s === "ligue 1 mcdonald's" || s === 'ligue 1 mcdonalds') return 'ligue-1';
  if (s === 'bundesliga-2' || s === 'bundesliga 2' || s === '2. bundesliga' || s === '2 bundesliga') return 'bundesliga-2';
  if (s === 'bundesliga' || s === '1. bundesliga') return 'bundesliga';
  if (s === 'eredivisie') return 'eredivisie';
  if (s === 'liga-portugal' || s === 'liga portugal' || s === 'primeira liga') return 'liga-portugal';
  if (s === 'serie-a' || s === 'serie a' || s === 'serie a enilive') return 'serie-a';
  return null;
}

export const RIVAL_PAIRS: [string, string][] = [
  // Spain
  ['real-madrid', 'fc-barcelona'],
  ['real-madrid', 'atletico-madrid'],
  ['fc-barcelona', 'atletico-madrid'],
  ['fc-barcelona', 'rcd-espanyol-barcelona'],
  ['real-betis-balompie', 'sevilla-fc'],
  ['athletic-club-bilbao', 'real-sociedad'],
  ['valencia-cf', 'villarreal-cf'],
  ['valencia-cf', 'levante-ud'],
  ['deportivo-la-coruna', 'celta-vigo'],
  // England
  ['arsenal', 'tottenham-hotspur'],
  ['arsenal', 'chelsea'],
  ['chelsea', 'tottenham-hotspur'],
  ['liverpool-fc', 'manchester-united'],
  ['liverpool-fc', 'everton'],
  ['manchester-city', 'manchester-united'],
  ['manchester-united', 'leeds-united'],
  ['newcastle-united', 'sunderland'],
  ['west-ham-united', 'millwall'],
  ['aston-villa', 'birmingham-city'],
  ['southampton', 'portsmouth'],
  ['ipswich-town', 'norwich-city'],
  // Germany
  ['bayern-munich', 'borussia-dortmund'],
  ['borussia-dortmund', 'schalke-04'],
  ['bayern-munich', 'rb-leipzig'],
  ['1-fc-koln', 'borussia-monchengladbach'],
  ['bayer-leverkusen', '1-fc-koln'],
  ['hamburger-sv', 'werder-bremen'],
  ['hamburger-sv', 'fc-st-pauli'],
  ['hannover-96', 'eintracht-braunschweig'],
  ['union-berlin', 'hertha-bsc'],
  // Italy
  ['inter-milan', 'ac-milan'],
  ['inter-milan', 'juventus'],
  ['ac-milan', 'juventus'],
  ['roma', 'lazio'],
  ['juventus', 'torino'],
  ['napoli', 'juventus'],
  ['napoli', 'roma'],
  ['fiorentina', 'juventus'],
  // France
  ['paris-saint-germain-psg', 'olympique-de-marseille-om'],
  ['olympique-lyonnais', 'olympique-de-marseille-om'],
  ['rc-lens', 'losc-lille'],
  ['as-monaco', 'ogc-nice'],
  ['paris-saint-germain-psg', 'paris-fc'],
  // Portugal
  ['sl-benfica', 'fc-porto'],
  ['sl-benfica', 'sporting-cp'],
  ['fc-porto', 'sporting-cp'],
  ['sc-braga', 'vitoria-sc'],
  // Holland
  ['ajax', 'feyenoord'],
  ['ajax', 'psv-eindhoven'],
  ['feyenoord', 'psv-eindhoven'],
  ['feyenoord', 'sparta-rotterdam'],
  ['ajax', 'az-alkmaar'],
];

const RIVAL_SET = new Set<string>(
  RIVAL_PAIRS.flatMap(([a, b]) => [`${a}::${b}`, `${b}::${a}`])
);

export function areClubsRivals(clubAId: string, clubBId: string): boolean {
  if (!clubAId || !clubBId || clubAId === clubBId) return false;
  return RIVAL_SET.has(`${clubAId}::${clubBId}`);
}

