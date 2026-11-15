export type Position =
  | 'GOL'
  | 'ZAG'
  | 'LE'
  | 'LD'
  | 'VOL'
  | 'MC'
  | 'MEI'
  | 'PE'
  | 'PD'
  | 'ATA';

export type PositionGroup = 'GOL' | 'DEF' | 'MEI' | 'ATA';

export type SquadRole =
  | 'importantissimo'
  | 'titular'
  | 'rotacao'
  | 'reserva'
  | 'promessa';

export type Mentality = 'defensiva' | 'equilibrada' | 'ofensiva';
export type PassingStyle = 'curto' | 'misto' | 'direto';
export type PressingLevel = 'baixa' | 'media' | 'alta';
export type TempoLevel = 'lento' | 'normal' | 'rapido';

export interface FormationSlot {
  id: string;
  label: string;
  pos: Position;
  x: number; // 0 (left) to 100 (right)
  y: number; // 0 (attack top) to 100 (GK bottom)
}

export interface FormationTemplate {
  id: string;
  name: string;
  isCustom?: boolean;
  slots: FormationSlot[]; // 11 slots
}

export interface ClubTactics {
  formationId: string;
  customFormation?: FormationSlot[];
  mentality: Mentality;
  passing: PassingStyle;
  pressing: PressingLevel;
  tempo: TempoLevel;
}

export type PlayerFormPhase = 'ma' | 'normal' | 'boa' | 'otima';

export interface PlayerInjury {
  type: string;
  roundsRemaining: number;
  totalRounds: number;
}

export interface PlayerSeasonStats {
  appearances: number;
  minutes: number;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  ratingSum: number;
  ratingCount: number;
  ovrDelta: number;
  cleanSheets?: number;
  motm?: number;
  outsideBoxGoals?: number;
}

export interface PlayerAttributes {
  pace: number;
  shooting: number;
  passing: number;
  dribbling: number;
  defending: number;
  physicality: number;
  acceleration?: number;
  sprintSpeed?: number;
  positioning?: number;
  finishing?: number;
  shotPower?: number;
  longShots?: number;
  volleys?: number;
  penalties?: number;
  vision?: number;
  crossing?: number;
  fkAccuracy?: number;
  shortPassing?: number;
  longPassing?: number;
  curve?: number;
  agility?: number;
  balance?: number;
  reactions?: number;
  ballControl?: number;
  dribblingSkill?: number;
  composure?: number;
  interceptions?: number;
  headingAccuracy?: number;
  defAwareness?: number;
  standingTackle?: number;
  slidingTackle?: number;
  jumping?: number;
  stamina?: number;
  strength?: number;
  aggression?: number;
  gkDiving?: number;
  gkHandling?: number;
  gkKicking?: number;
  gkPositioning?: number;
  gkReflexes?: number;
}

export type GoalFinishType =
  | 'DIREITA'
  | 'ESQUERDA'
  | 'CABECEIO'
  | 'ACROBACIA'
  | 'PENALTI_D'
  | 'PENALTI_E'
  | 'FALTA_D'
  | 'FALTA_E';

export interface GoalShotDetail {
  originX: number; // 0 (left touchline) .. 100 (right touchline)
  originY: number; // 0 (goal line) .. 52 (midfield)
  targetX: number; // 44 .. 56 inside goal mouth
  targetY: number; // -2.4 .. 0.4 inside goal frame
  finishType: GoalFinishType;
  distanceMeters: number;
  xg: number;
  bodyPartLabel: string;
  playstyleUsed?: string;
  assistOriginX?: number;
  assistOriginY?: number;
  isOutsideBox?: boolean;
}

export interface PlayerLoanInfo {
  parentClubId: string;
  fromClubId: string;
  toClubId: string;
  loanFee: number;
  buyOptionPrice?: number;
  endSeason: number;
}

export interface Player {
  id: string;
  name: string;
  nationality: string;
  age: number;
  position: Position;
  alternatePositions?: Position[];
  preferredFoot?: 'Direito' | 'Esquerdo';
  skillMoves?: number;
  weakFoot?: number;
  playstyles?: string[];
  attributes?: PlayerAttributes;
  overall: number;
  potential: number;
  baseOverall: number;
  value: number; // in Euros
  wage: number; // weekly in Euros
  clubId: string;
  role: SquadRole;
  fitness: number; // 0-100
  form: PlayerFormPhase;
  recentRatings: number[]; // up to last 5 match ratings
  lastRating: number | null;
  injury: PlayerInjury | null;
  transferListed: boolean;
  loanListed?: boolean;
  askingPrice?: number;
  loan?: PlayerLoanInfo;
  stats: PlayerSeasonStats;
}

export interface Club {
  id: string; // matches CDN filename slug
  name: string;
  shortName: string;
  leagueId: LeagueId;
  division: 1 | 2;
  country: string;
  primaryColor: string;
  secondaryColor: string;
  budget: number; // transfer budget in Euros
  reputation: number; // 1-100
  autoRotate?: boolean;
  tactics: ClubTactics;
  starterIds: string[]; // 11 player IDs aligned with formation slots
  benchIds: string[]; // up to 7 bench player IDs
}

export type LeagueId =
  | 'premier-league'
  | 'championship'
  | 'la-liga'
  | 'ligue-1'
  | 'bundesliga'
  | 'bundesliga-2'
  | 'eredivisie'
  | 'liga-portugal'
  | 'serie-a';

export interface LeagueTableRow {
  clubId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
  form: ('V' | 'E' | 'D')[];
}

export interface League {
  id: LeagueId;
  name: string;
  country: string;
  division: 1 | 2;
  totalRounds: number;
  currentRound: number;
}

export type CompetitionType = 'LEAGUE' | 'CUP' | 'CHAMPIONS_LEAGUE' | 'EUROPA_LEAGUE';

export interface MatchEvent {
  minute: number;
  type: 'GOAL' | 'ASSIST' | 'YELLOW' | 'RED' | 'SUB' | 'SAVE' | 'MISS' | 'INJURY';
  clubId: string;
  playerId?: string;
  playerName?: string;
  assistPlayerId?: string;
  assistPlayerName?: string;
  description: string;
  shotDetail?: GoalShotDetail;
}

export interface MatchStats {
  homePossession: number;
  awayPossession: number;
  homeShots: number;
  awayShots: number;
  homeShotsOnTarget: number;
  awayShotsOnTarget: number;
  homeXG: number;
  awayXG: number;
  homeBigChances?: number;
  awayBigChances?: number;
  tacticalNote?: string;
}

export interface Fixture {
  id: string;
  competitionType: CompetitionType;
  competitionId: string;
  competitionName: string;
  round: number;
  calendarRound?: number;
  roundLabel: string;
  groupId?: string;
  homeClubId: string;
  awayClubId: string;
  played: boolean;
  homeGoals: number | null;
  awayGoals: number | null;
  penaltiesWinnerId?: string;
  scheduledWatch?: boolean;
  events?: MatchEvent[];
  stats?: MatchStats;
  playerRatings?: Record<string, number>;
}

export interface CupRound {
  roundIndex: number;
  name: string;
  fixtureIds: string[];
}

export interface CupTournament {
  id: string;
  name: string;
  country: string;
  leagueIds: LeagueId[];
  currentRoundIndex: number;
  rounds: CupRound[];
  championClubId: string | null;
  byeClubIds?: string[];
}

export interface ChampionsLeagueGroup {
  id: string; // 'A'..'H'
  name: string;
  clubIds: string[];
  fixtureIds: string[];
}

export interface ChampionsLeagueState {
  id: string;
  name: string;
  stage: 'GRUPOS' | 'MATA_MATA' | 'CONCLUIDA';
  groupRound: number; // 1..6
  groups: ChampionsLeagueGroup[];
  currentRoundIndex: number;
  rounds: CupRound[];
  championClubId: string | null;
}

export type SeasonPhase = 'INICIO_JANELA' | 'MEIO_JANELA' | 'FINAL_TEMPORADA';

export interface TransferOffer {
  id: string;
  playerId: string;
  fromClubId: string;
  toClubId: string;
  amount: number;
  type?: 'TRANSFER' | 'LOAN';
  buyOptionPrice?: number;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  createdRound: number;
}

export interface TransferRecord {
  id: string;
  playerId: string;
  playerName: string;
  fromClubId: string;
  toClubId: string;
  amount: number;
  type?: 'TRANSFER' | 'LOAN' | 'LOAN_RETURN';
  season: number;
  phase: SeasonPhase;
  reason?: string;
}

export interface SeasonSummary {
  season: number;
  leagueChampions: Record<LeagueId, string>;
  cupChampions: Record<string, string>;
  uclChampion: string | null;
  uelChampion?: string | null;
  promotions: { clubId: string; from: LeagueId; to: LeagueId }[];
  relegations: { clubId: string; from: LeagueId; to: LeagueId }[];
  topGrowthPlayers: { playerId: string; name: string; clubId: string; fromOvr: number; toOvr: number }[];
}

export type NewsCategory =
  | 'info'
  | 'transfer'
  | 'match'
  | 'award'
  | 'form'
  | 'breakout'
  | 'upset'
  | 'injury';

export interface NewsItem {
  id: string;
  round: number;
  title: string;
  detail: string;
  type: NewsCategory;
}

export type FinanceEntryCategory =
  | 'BILHETERIA'
  | 'CAMISAS'
  | 'PREMIO_COPA'
  | 'PREMIO_UCL'
  | 'PREMIO_LIGA'
  | 'MEIO_TEMPORADA'
  | 'EMPRESTIMO'
  | 'TRANSFERENCIA';

export interface FinanceLedgerEntry {
  id: string;
  round: number;
  category: FinanceEntryCategory;
  label: string;
  amount: number;
}

export interface ClubFinanceState {
  stadiumCapacity: number;
  lastMatchAttendance: number;
  lastMatchAttendancePct: number;
  lastMatchHypeNote?: string;
  seasonMatchdayRevenue: number;
  seasonMerchRevenue: number;
  seasonPrizeRevenue: number;
  seasonLoanRevenue: number;
  midSeasonGrantApplied?: boolean;
  seasonPrizesApplied?: boolean;
  recentEntries: FinanceLedgerEntry[];
}

export interface PhaseReport {
  id: string;
  phaseCompleted: SeasonPhase;
  title: string;
  subtitle: string;
  userFixtureIds: string[];
  highlightFixtureIds: string[];
  npcTransferCount: number;
  injuriesOccurred: { playerId: string; playerName: string; clubId: string; type: string; rounds: number }[];
  hotPlayers: { playerId: string; playerName: string; clubId: string; form: PlayerFormPhase; avgRating: number }[];
}

export type GameMode = 'CAREER' | 'DRAFT';

export type DraftClassTier = 'VETERANO' | 'AUGE' | 'PROMESSA';

export type DraftAttributeFocus =
  | 'FINALIZACAO'
  | 'ARMACAO'
  | 'VELOCIDADE_DRIBLE'
  | 'DEFESA'
  | 'FISICO'
  | 'GOLEIRO';

export interface DraftCandidate {
  playerId: string;
  tier: DraftClassTier;
  fromClubId: string;
  fromClubName: string;
  fromLeagueName: string;
  fromTableRank: number;
  fromLeagueClubCount: number;
  isUnderdogBuffed: boolean;
  originalOverall: number;
  buffedOverall: number;
  ovrBuffDelta: number;
  draftPrice: number;
  buffedNote?: string;
}

export interface DraftState {
  expectedLeaguePos: number;
  roulettePasses: number;
  midSeasonPassAwarded?: boolean;
  endSeasonPassAwarded?: boolean;
  soldOutCountThisWindow: number;
  soldPlayerNamesThisWindow: string[];
  pickedTiersThisWindow: DraftClassTier[];
  initialOfferings: Record<DraftClassTier, DraftCandidate[]>;
  midWindowPicksUsed: number;
  midWindowCandidate: DraftCandidate | null;
  midWindowSelectedPos: Position;
  midWindowSelectedTier: DraftClassTier;
  buffedPlayerIds: string[];
}

export interface TrophyCelebrationItem {
  id: string;
  kind: 'LEAGUE' | 'CUP' | 'CHAMPIONS_LEAGUE' | 'EUROPA_LEAGUE';
  competitionName: string;
  season: number;
  clubId: string;
  clubName: string;
  summaryLine: string;
  passesEarned?: number;
}

export interface GameState {
  version: number;
  gameMode?: GameMode;
  slotId: string;
  slotName: string;
  updatedAt: number;
  season: number;
  phase: SeasonPhase;
  userClubId: string;
  leagues: Record<LeagueId, League>;
  clubs: Record<string, Club>;
  players: Record<string, Player>;
  fixtures: Record<string, Fixture>;
  cups: Record<string, CupTournament>;
  championsLeague: ChampionsLeagueState;
  europaLeague?: ChampionsLeagueState;
  customFormations: FormationTemplate[];
  offers: TransferOffer[];
  transferHistory: TransferRecord[];
  pastSummaries: SeasonSummary[];
  newsFeed: NewsItem[];
  lastPhaseReport?: PhaseReport | null;
  npcWindowDone?: { inicio: boolean; meio: boolean };
  financeState?: ClubFinanceState;
  draftState?: DraftState;
  pendingTrophies?: TrophyCelebrationItem[];
  sandboxLockedTransferClubIds?: string[];
}

export interface SaveSlotMeta {
  slotId: string;
  slotName: string;
  gameMode?: GameMode;
  userClubId: string;
  userClubName: string;
  leagueName: string;
  season: number;
  phase: SeasonPhase;
  currentRound: number;
  budget: number;
  updatedAt: number;
}

export interface RawDatasetPlayer {
  id?: string;
  name: string;
  nationality: string;
  age: number;
  position: string;
  alternatePositions?: string[];
  preferredFoot?: 'Direito' | 'Esquerdo';
  skillMoves?: number;
  weakFoot?: number;
  playstyles?: string[];
  attributes?: PlayerAttributes;
  overall: number;
  potential: number;
  value?: number;
  wage?: number;
  clubId: string;
  clubName?: string;
  leagueId?: string;
  league?: string;
  division?: 1 | 2;
  country?: string;
  primaryColor?: string;
  secondaryColor?: string;
  budget?: number;
  providedFields?: string[];
}

export interface RawDatasetClub {
  id: string;
  name: string;
  shortName?: string;
  leagueId: LeagueId;
  division: 1 | 2;
  country: string;
  primaryColor?: string;
  secondaryColor?: string;
  budget?: number;
  reputation?: number;
}

export interface RawDataset {
  clubs?: RawDatasetClub[];
  players: RawDatasetPlayer[];
}
