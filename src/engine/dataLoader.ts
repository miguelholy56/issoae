import { autoPickLineup, normalizePosition, PRESET_FORMATIONS } from '../data/formations';
import { DOMESTIC_CUPS_META, LEAGUES_META, normalizeLeagueId } from '../data/leaguesMeta';
import {
  ChampionsLeagueGroup,
  ChampionsLeagueState,
  Club,
  CupTournament,
  Fixture,
  GameMode,
  GameState,
  League,
  LeagueId,
  Player,
  PlayerAttributes,
  Position,
  RawDataset,
  RawDatasetClub,
  RawDatasetPlayer,
  SquadRole,
} from '../types/game';
import { manageNpcSquadsAndRoles, runGlobalNpcTransfers } from './transferMarketEngine';
import { ensureFinanceState } from './financeEngine';
import { computeDraftStartingBudget, initializeDraftState } from './draftEngine';

function computeAgeFromBirthdate(birthdate: string, refYear = 2026, refMonth = 9, refDay = 12): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(birthdate.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  let age = refYear - y;
  if (mo > refMonth || (mo === refMonth && d > refDay)) age--;
  return age >= 15 && age <= 48 ? age : null;
}

function estimatePotential(overall: number, age: number): number {
  if (age <= 19) return Math.min(95, overall + Math.max(4, Math.min(14, Math.round((86 - overall) * 0.55) + 5)));
  if (age <= 21) return Math.min(94, overall + Math.max(2, Math.min(10, Math.round((86 - overall) * 0.4) + 3)));
  if (age <= 24) return Math.min(93, overall + Math.max(1, Math.min(6, Math.round((88 - overall) * 0.25) + 1)));
  if (age <= 27) return Math.min(93, overall + (overall < 84 ? 2 : 1));
  return overall;
}

const CLUB_COLOR_PALETTE = [
  '#10B981', '#3B82F6', '#EF4444', '#F59E0B', '#8B5CF6',
  '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1',
];

function deriveClubShortName(clubName: string): string {
  const cleaned = clubName
    .replace(/^(FC|CF|AC|AS|SC|SV|VfB|VfL|RB|SS|US|UD|CD|RC|SD|CA|TSG|1\.\s*FC|1\.\s*FSV)\s+/i, '')
    .trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length >= 2 && words[0].length <= 2) {
    return `${words[0]}${words[1].slice(0, 3 - words[0].length)}`.toUpperCase().slice(0, 3);
  }
  return (cleaned || clubName).replace(/[^a-zA-Z0-9]/g, '').slice(0, 3).toUpperCase() || 'CLB';
}

function deriveClubColor(clubId: string): string {
  let hash = 0;
  for (let i = 0; i < clubId.length; i++) {
    hash = (hash * 31 + clubId.charCodeAt(i)) >>> 0;
  }
  return CLUB_COLOR_PALETTE[hash % CLUB_COLOR_PALETTE.length];
}

export function buildClubMetadataFromPlayers(players: RawDatasetPlayer[]): RawDatasetClub[] {
  const byClub = new Map<string, { name: string; leagueId: LeagueId; ovrs: number[]; explicitBudget?: number }>();

  for (const p of players) {
    const lid = normalizeLeagueId(p.leagueId || p.league) || 'premier-league';
    const existing = byClub.get(p.clubId);
    if (existing) {
      existing.ovrs.push(p.overall);
      if (!existing.explicitBudget && p.budget) existing.explicitBudget = p.budget;
    } else {
      byClub.set(p.clubId, {
        name: p.clubName || p.clubId,
        leagueId: lid,
        ovrs: [p.overall],
        explicitBudget: p.budget,
      });
    }
  }

  const clubs: RawDatasetClub[] = [];
  for (const [clubId, info] of byClub.entries()) {
    const leagueMeta = LEAGUES_META.find((l) => l.id === info.leagueId) || LEAGUES_META[0];
    const topOvrs = [...info.ovrs].sort((a, b) => b - a).slice(0, 14);
    const avgTop = topOvrs.length > 0 ? topOvrs.reduce((s, v) => s + v, 0) / topOvrs.length : 72;
    const reputation = Math.max(60, Math.min(92, Math.round(avgTop)));

    let budget = info.explicitBudget;
    if (!budget) {
      if (leagueMeta.division === 1) {
        const tierFactor = Math.max(0, reputation - 68);
        budget = Math.round((12 + Math.pow(tierFactor, 1.52) * 1.45) * 1000000);
      } else {
        const tierFactor = Math.max(0, reputation - 62);
        budget = Math.round((4 + Math.pow(tierFactor, 1.3) * 0.65) * 1000000);
      }
    }

    clubs.push({
      id: clubId,
      name: info.name,
      shortName: deriveClubShortName(info.name),
      leagueId: leagueMeta.id,
      division: leagueMeta.division,
      country: leagueMeta.country,
      primaryColor: deriveClubColor(clubId),
      secondaryColor: '#FFFFFF',
      budget,
      reputation,
    });
  }

  return clubs;
}

function normalizeJsonPlayer(
  raw: Record<string, unknown>,
  idx: number,
  inheritedContext?: { clubId?: string; clubName?: string; leagueId?: string }
): RawDatasetPlayer {
  const hasAny = (keys: string[]): boolean =>
    keys.some((k) => {
      const v = raw[k];
      if (v === undefined || v === null) return false;
      if (typeof v === 'string') return v.trim().length > 0;
      if (typeof v === 'number') return Number.isFinite(v) && v > 0;
      if (Array.isArray(v)) return v.length > 0;
      return true;
    });

  const str = (keys: string[], fallback = ''): string => {
    for (const k of keys) {
      const v = raw[k];
      if (typeof v === 'string' && v.trim()) return v.trim();
      if (typeof v === 'number' && Number.isFinite(v)) return String(v);
    }
    return fallback;
  };
  const num = (keys: string[], fallback: number): number => {
    for (const k of keys) {
      const v = Number(raw[k]);
      if (Number.isFinite(v) && v > 0) return v;
    }
    return fallback;
  };

  const clubName =
    str(['transfer_to', 'novo_clube', 'clubName', 'club_name', 'club', 'team', 'clube']) ||
    inheritedContext?.clubName ||
    '';
  const rawClubId =
    str(['clubId', 'club_id', 'club_logo_id', 'team_id', 'clube_id']) ||
    inheritedContext?.clubId ||
    '';
  const clubId = (rawClubId || clubName || 'free-agent')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]/g, '');

  const commonName = str(['common_name']);
  const fullName = [str(['first_name']), str(['last_name'])].filter(Boolean).join(' ').trim();
  const resolvedName =
    commonName ||
    str(['name', 'player_name', 'nome', 'short_name', 'long_name']) ||
    fullName ||
    `Jogador ${idx + 1}`;

  const rawBirthdate = str(['birthdate', 'birth_date', 'dob']);
  const explicitAge = num(['age', 'idade'], 0);
  const age = explicitAge > 0 ? explicitAge : (rawBirthdate ? computeAgeFromBirthdate(rawBirthdate) : null) || 24;

  const overall = num(['overall', 'overall_rating', 'ovr', 'rating', 'nota'], 70);
  const explicitPot = num(['potential', 'pot', 'potencial'], 0);
  const potential = explicitPot > 0 ? Math.max(overall, explicitPot) : estimatePotential(overall, age);
  const rawPos = str(['position', 'pos', 'player_positions', 'posicao'], 'MC');

  const rawLeagueStr =
    str(['leagueId', 'league_id', 'liga_logo', 'league', 'league_name', 'liga']) ||
    inheritedContext?.leagueId ||
    '';
  const normalizedLeague = normalizeLeagueId(rawLeagueStr) || undefined;

  const rawAlt = str(['alternate_positions', 'alternatePositions', 'alt_positions']);
  const alternatePositions = rawAlt
    ? rawAlt.split(/[,/| ]+/).map((s) => s.trim()).filter(Boolean)
    : undefined;

  const rawFoot = str(['preferred_foot', 'preferredFoot', 'foot']);
  const preferredFoot: 'Direito' | 'Esquerdo' | undefined = rawFoot
    ? rawFoot.toLowerCase().startsWith('l') || rawFoot.toLowerCase().startsWith('e')
      ? 'Esquerdo'
      : 'Direito'
    : undefined;

  const skillMoves = num(['skill_moves', 'skillMoves'], 0) || undefined;
  const weakFoot = num(['weak_foot', 'weakFoot'], 0) || undefined;

  const rawPlaystyles = raw['playstyles'];
  const playstyles = Array.isArray(rawPlaystyles)
    ? rawPlaystyles.map((x) => String(x).trim()).filter(Boolean)
    : typeof rawPlaystyles === 'string' && rawPlaystyles.trim()
      ? rawPlaystyles.split(',').map((s) => s.trim()).filter(Boolean)
      : undefined;

  const optNum = (key: string): number | undefined => {
    const v = Number(raw[key]);
    return Number.isFinite(v) && v > 0 ? Math.round(v) : undefined;
  };

  const pace = optNum('pace');
  const shooting = optNum('shooting');
  const passing = optNum('passing');
  const dribbling = optNum('dribbling');
  const defending = optNum('defending');
  const physicality = optNum('physicality');
  const gkDiving = optNum('goalkeeping_diving');
  const gkHandling = optNum('goalkeeping_handling');
  const gkKicking = optNum('goalkeeping_kicking');
  const gkPositioning = optNum('goalkeeping_positioning');
  const gkReflexes = optNum('goalkeeping_reflexes');

  const hasOutfieldCore = Boolean(pace && shooting && passing && dribbling && defending && physicality);
  const hasGkCore = Boolean(gkDiving || gkHandling || gkKicking || gkPositioning || gkReflexes);

  const attributes: PlayerAttributes | undefined =
    hasOutfieldCore || hasGkCore
      ? {
          pace: pace ?? gkPositioning ?? Math.max(40, overall - 25),
          shooting: shooting ?? gkKicking ?? Math.max(40, overall - 20),
          passing: passing ?? gkKicking ?? Math.max(45, overall - 15),
          dribbling: dribbling ?? gkHandling ?? Math.max(45, overall - 15),
          defending: defending ?? gkDiving ?? Math.max(40, overall - 20),
          physicality: physicality ?? optNum('power_strength') ?? Math.max(50, overall - 12),
          acceleration: optNum('movement_acceleration'),
          sprintSpeed: optNum('movement_sprint_speed'),
          positioning: optNum('mentality_positioning'),
          finishing: optNum('attacking_finishing'),
          shotPower: optNum('power_shot_power'),
          longShots: optNum('power_long_shots'),
          volleys: optNum('attacking_volleys'),
          penalties: optNum('mentality_penalties'),
          vision: optNum('mentality_vision'),
          crossing: optNum('attacking_crossing'),
          fkAccuracy: optNum('skill_fk_accuracy'),
          shortPassing: optNum('attacking_short_passing'),
          longPassing: optNum('skill_long_passing'),
          curve: optNum('skill_curve'),
          agility: optNum('movement_agility'),
          balance: optNum('movement_balance'),
          reactions: optNum('movement_reactions'),
          ballControl: optNum('skill_ball_control'),
          dribblingSkill: optNum('skill_dribbling'),
          composure: optNum('mentality_composure'),
          interceptions: optNum('mentality_interceptions'),
          headingAccuracy: optNum('attacking_heading_accuracy'),
          defAwareness: optNum('defending_awareness'),
          standingTackle: optNum('defending_standing_tackle'),
          slidingTackle: optNum('defending_sliding_tackle'),
          jumping: optNum('power_jumping'),
          stamina: optNum('power_stamina'),
          strength: optNum('power_strength'),
          aggression: optNum('mentality_aggression'),
          gkDiving,
          gkHandling,
          gkKicking,
          gkPositioning,
          gkReflexes,
        }
      : undefined;

  const providedFields: string[] = [];
  if (hasAny(['id', 'player_id'])) providedFields.push('id');
  if (hasAny(['common_name', 'first_name', 'last_name', 'name', 'player_name', 'nome', 'short_name', 'long_name'])) {
    providedFields.push('name');
  }
  if (hasAny(['nationality', 'nation', 'country', 'nacionalidade'])) providedFields.push('nationality');
  if (explicitAge > 0 || Boolean(rawBirthdate)) providedFields.push('age');
  if (hasAny(['position', 'pos', 'player_positions', 'posicao'])) providedFields.push('position');
  if (hasAny(['alternate_positions', 'alternatePositions', 'alt_positions'])) providedFields.push('alternatePositions');
  if (hasAny(['preferred_foot', 'preferredFoot', 'foot'])) providedFields.push('preferredFoot');
  if (hasAny(['skill_moves', 'skillMoves'])) providedFields.push('skillMoves');
  if (hasAny(['weak_foot', 'weakFoot'])) providedFields.push('weakFoot');
  if (hasAny(['playstyles'])) providedFields.push('playstyles');
  if (attributes) providedFields.push('attributes');
  if (hasAny(['overall', 'overall_rating', 'ovr', 'rating', 'nota'])) providedFields.push('overall');
  if (explicitPot > 0) providedFields.push('potential');
  if (hasAny(['value', 'value_eur', 'valor'])) providedFields.push('value');
  if (hasAny(['wage', 'wage_eur', 'salario'])) providedFields.push('wage');
  if (
    hasAny(['transfer_to', 'novo_clube', 'clubName', 'club_name', 'club', 'team', 'clube', 'clubId', 'club_id', 'club_logo_id', 'team_id', 'clube_id']) ||
    Boolean(inheritedContext?.clubId || inheritedContext?.clubName)
  ) {
    providedFields.push('club');
  }
  if (normalizedLeague) providedFields.push('league');

  return {
    id: str(['id', 'player_id'], `pl_${idx + 1}`),
    name: resolvedName,
    nationality: str(['nationality', 'nation', 'country', 'nacionalidade'], 'England'),
    age,
    position: rawPos.split(/[,/| ]/)[0] || 'MC',
    alternatePositions,
    preferredFoot,
    skillMoves,
    weakFoot,
    playstyles,
    attributes,
    overall,
    potential,
    value: num(['value', 'value_eur', 'valor'], 0) || undefined,
    wage: num(['wage', 'wage_eur', 'salario'], 0) || undefined,
    clubId,
    clubName: clubName || clubId,
    leagueId: normalizedLeague,
    league: str(['league', 'league_name', 'liga', 'liga_logo']) || inheritedContext?.leagueId || undefined,
    division: raw['division'] === 2 ? 2 : raw['division'] === 1 ? 1 : undefined,
    country: str(['country']) || undefined,
    budget: num(['budget'], 0) || undefined,
    providedFields,
  };
}

function normalizeJsonDataset(parsed: unknown): RawDataset {
  if (Array.isArray(parsed)) {
    const players = parsed.map((item, idx) =>
      normalizeJsonPlayer((item || {}) as Record<string, unknown>, idx)
    );
    return {
      clubs: buildClubMetadataFromPlayers(players),
      players,
    };
  }
  if (parsed && typeof parsed === 'object') {
    const record = parsed as Record<string, unknown>;
    if (Array.isArray(record.colunas) && Array.isArray(record.linhas)) {
      const cols = record.colunas.map((c) => String(c));
      const players = record.linhas.map((row, idx) => {
        const obj: Record<string, unknown> = {};
        if (Array.isArray(row)) {
          for (let c = 0; c < cols.length; c++) {
            obj[cols[c]] = row[c];
          }
        }
        return normalizeJsonPlayer(obj, idx);
      });
      return {
        clubs: buildClubMetadataFromPlayers(players),
        players,
      };
    }

    const parentClubId =
      typeof record.clubId === 'string'
        ? record.clubId
        : typeof record.club_id === 'string'
          ? record.club_id
          : undefined;
    const parentClubName =
      typeof record.club === 'string'
        ? record.club
        : typeof record.clubName === 'string'
          ? record.clubName
          : typeof record.clube === 'string'
            ? record.clube
            : undefined;
    const parentLeague =
      typeof record.leagueId === 'string'
        ? record.leagueId
        : typeof record.league === 'string'
          ? record.league
          : typeof record.liga === 'string'
            ? record.liga
            : undefined;
    const inherited =
      parentClubId || parentClubName || parentLeague
        ? { clubId: parentClubId, clubName: parentClubName, leagueId: parentLeague }
        : undefined;

    const listKey = ['players', 'jogadores', 'elenco', 'squad', 'data'].find((k) =>
      Array.isArray(record[k])
    );
    if (listKey) {
      const rawList = record[listKey] as unknown[];
      const explicitClubs = Array.isArray(record.clubs) ? (record.clubs as RawDatasetClub[]) : undefined;
      const players = rawList.map((item, idx) =>
        normalizeJsonPlayer(((item || {}) as Record<string, unknown>), idx, inherited)
      );
      return {
        clubs: explicitClubs && explicitClubs.length > 0 ? explicitClubs : buildClubMetadataFromPlayers(players),
        players,
      };
    }

    // Club-keyed map: { "real-madrid": [...], "Arsenal": [...] }
    const entries = Object.entries(record).filter(([, v]) => Array.isArray(v));
    if (entries.length > 0) {
      const players: RawDatasetPlayer[] = [];
      let counter = 0;
      for (const [clubKey, arr] of entries) {
        if (!Array.isArray(arr)) continue;
        for (const item of arr) {
          if (item && typeof item === 'object') {
            players.push(
              normalizeJsonPlayer(item as Record<string, unknown>, counter++, {
                clubName: clubKey,
                clubId: clubKey,
              })
            );
          }
        }
      }
      if (players.length > 0) {
        return {
          clubs: buildClubMetadataFromPlayers(players),
          players,
        };
      }
    }
  }
  throw new Error(
    'Formato JSON inválido: envie um array de jogadores, objeto { players / elenco / jogadores: [...] }, formato compacto { colunas, linhas } ou mapa por clube { "Arsenal": [...] }.'
  );
}

export async function loadDefaultDataset(): Promise<RawDataset> {
  const res = await fetch('/players_compacto_a0acbfef.json');
  if (!res.ok) {
    throw new Error('Falha ao carregar o elenco oficial do jogo.');
  }
  const json = await res.json();
  return normalizeJsonDataset(json);
}

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

export function parseCustomDataset(content: string, fileName: string): RawDataset {
  const trimmed = content.replace(/^\uFEFF/, '').trim();
  if (!trimmed) {
    throw new Error('O conteúdo enviado está vazio.');
  }
  if (fileName.toLowerCase().endsWith('.json') || trimmed.startsWith('{') || trimmed.startsWith('[')) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch (err) {
      throw new Error(
        `Erro de sintaxe no JSON: ${err instanceof Error ? err.message : 'verifique vírgulas e aspas.'}`
      );
    }
    return normalizeJsonDataset(parsed);
  }

  // Parse CSV
  const lines = trimmed.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) throw new Error('Arquivo CSV vazio ou sem dados.');

  const headers = splitCsvLine(lines[0]).map((h) => h.toLowerCase().replace(/[^a-z0-9_]/g, ''));
  const idx = (names: string[]) => headers.findIndex((h) => names.includes(h));

  const nameI = idx(['name', 'player_name', 'nome', 'short_name', 'long_name']);
  const natI = idx(['nationality', 'nation', 'country', 'nacionalidade']);
  const ageI = idx(['age', 'idade']);
  const posI = idx(['position', 'pos', 'player_positions', 'posicao']);
  const ovrI = idx(['overall', 'ovr', 'rating']);
  const potI = idx(['potential', 'pot', 'potencial']);
  const valI = idx(['value', 'value_eur', 'valor']);
  const wageI = idx(['wage', 'wage_eur', 'salario']);
  const clubIdI = idx(['clubid', 'club_id', 'team_id', 'clube_id']);
  const clubNameI = idx(['clubname', 'club_name', 'club', 'team', 'clube']);
  const leagueI = idx(['leagueid', 'league_id', 'league', 'league_name', 'liga']);

  if (nameI === -1 || (clubIdI === -1 && clubNameI === -1)) {
    throw new Error('CSV precisa conter ao menos colunas de nome do jogador e ID/nome do clube.');
  }

  const players: RawDatasetPlayer[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    if (cols.length < 2) continue;
    const rawClubName = clubNameI !== -1 ? cols[clubNameI] : cols[clubIdI];
    const rawClubId =
      clubIdI !== -1 && cols[clubIdI]
        ? cols[clubIdI].toLowerCase().replace(/\s+/g, '-')
        : rawClubName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    const ovr = Number(cols[ovrI]) || 70;
    const pot = Number(cols[potI]) || Math.max(ovr, ovr + 3);
    const age = Number(cols[ageI]) || 24;

    players.push({
      id: `csv_${i}`,
      name: cols[nameI] || `Jogador ${i}`,
      nationality: natI !== -1 ? cols[natI] : 'England',
      age,
      position: posI !== -1 ? cols[posI].split(/[,/| ]/)[0] : 'MC',
      overall: ovr,
      potential: pot,
      value: valI !== -1 && Number(cols[valI]) > 0 ? Number(cols[valI]) : undefined,
      wage: wageI !== -1 && Number(cols[wageI]) > 0 ? Number(cols[wageI]) : undefined,
      clubId: rawClubId,
      clubName: rawClubName || rawClubId,
      league: leagueI !== -1 ? cols[leagueI] : undefined,
    });
  }

  return { players };
}

export function estimateValue(ovr: number, pot: number, age: number): number {
  const base = Math.pow(Math.max(1, ovr - 52), 2.85) * 1800;
  const ageFactor = age <= 21 ? 1.45 : age <= 25 ? 1.25 : age <= 28 ? 1.0 : age <= 31 ? 0.65 : 0.35;
  const potBonus = Math.max(0, pot - ovr) * 750000;
  return Math.max(250000, Math.round((base * ageFactor + potBonus) / 50000) * 50000);
}

export function estimateWage(ovr: number): number {
  return Math.max(2000, Math.round((Math.pow(Math.max(1, ovr - 55), 2.15) * 95) / 500) * 500);
}

export function generateRoundRobinFixtures(
  leagueId: LeagueId,
  leagueName: string,
  clubIds: string[]
): Fixture[] {
  const list = [...clubIds];
  if (list.length % 2 !== 0) list.push('__BYE__');
  const n = list.length;
  const roundsCount = n - 1;
  const fixtures: Fixture[] = [];

  const rotating = list.slice(1);
  for (let r = 0; r < roundsCount; r++) {
    const roundClubs = [list[0], ...rotating];
    for (let i = 0; i < n / 2; i++) {
      const a = roundClubs[i];
      const b = roundClubs[n - 1 - i];
      if (a === '__BYE__' || b === '__BYE__') continue;
      const homeFirst = (r + i) % 2 === 0;
      const home1 = homeFirst ? a : b;
      const away1 = homeFirst ? b : a;

      fixtures.push({
        id: `fix_${leagueId}_r${r + 1}_${home1}_${away1}`,
        competitionType: 'LEAGUE',
        competitionId: leagueId,
        competitionName: leagueName,
        round: r + 1,
        roundLabel: `Rodada ${r + 1}`,
        homeClubId: home1,
        awayClubId: away1,
        played: false,
        homeGoals: null,
        awayGoals: null,
      });

      // Return leg
      fixtures.push({
        id: `fix_${leagueId}_r${r + 1 + roundsCount}_${away1}_${home1}`,
        competitionType: 'LEAGUE',
        competitionId: leagueId,
        competitionName: leagueName,
        round: r + 1 + roundsCount,
        roundLabel: `Rodada ${r + 1 + roundsCount}`,
        homeClubId: away1,
        awayClubId: home1,
        played: false,
        homeGoals: null,
        awayGoals: null,
      });
    }
    const last = rotating.pop()!;
    rotating.unshift(last);
  }

  return fixtures;
}

function getKnockoutRoundName(teamCount: number): string {
  if (teamCount <= 2) return 'Final';
  if (teamCount <= 4) return 'Semifinal';
  if (teamCount <= 8) return 'Quartas de Final';
  if (teamCount <= 16) return 'Oitavas de Final';
  if (teamCount <= 32) return '16-avos de Final';
  return `Fase Preliminar (${teamCount})`;
}

export function getUclGroupCalendarRound(matchday: number, totalLeagueRounds = 38): number {
  const halfRound = Math.floor(totalLeagueRounds / 2) + 1;
  const maxFirstHalf = Math.max(6, halfRound - 1);
  const span = Math.max(5, maxFirstHalf - 3);
  const raw = Math.round(((matchday - 1) / 5) * span) + 3;
  return Math.max(matchday, Math.min(maxFirstHalf, raw));
}

export function getUclKnockoutCalendarRound(roundIndex: number, totalLeagueRounds = 38): number {
  const halfRound = Math.floor(totalLeagueRounds / 2) + 1;
  const secondSpan = Math.max(8, totalLeagueRounds - halfRound);
  if (roundIndex <= 0) return Math.min(totalLeagueRounds - 3, halfRound + Math.max(1, Math.round(secondSpan * 0.16)));
  if (roundIndex === 1) return Math.min(totalLeagueRounds - 2, halfRound + Math.max(3, Math.round(secondSpan * 0.44)));
  if (roundIndex === 2) return Math.min(totalLeagueRounds - 1, halfRound + Math.max(5, Math.round(secondSpan * 0.72)));
  return Math.max(halfRound + 7, totalLeagueRounds - 1);
}

export function getTotalCupRoundsForClubCount(clubCount: number): number {
  if (clubCount < 2) return 1;
  let pow2 = 2;
  let k = 1;
  while (pow2 * 2 <= clubCount) {
    pow2 *= 2;
    k += 1;
  }
  return clubCount > pow2 ? k + 1 : k;
}

export function getCupCalendarRound(
  roundIndex: number,
  totalCupRounds: number,
  totalLeagueRounds = 38
): number {
  const halfRound = Math.floor(totalLeagueRounds / 2) + 1;
  const secondSpan = Math.max(8, totalLeagueRounds - halfRound);
  const lateCount = Math.min(3, Math.max(1, totalCupRounds));
  const earlyCount = Math.max(0, totalCupRounds - lateCount);

  if (roundIndex < earlyCount) {
    const maxFirstHalf = Math.max(4, halfRound - 2);
    const t = (roundIndex + 1) / (earlyCount + 1);
    const raw = Math.round(2 + t * (maxFirstHalf - 2));
    return Math.max(2, Math.min(halfRound - 1, raw));
  }

  const lateIdx = roundIndex - earlyCount;
  // Map late rounds to Quartas / Semi / Final (or Semi / Final if fewer)
  const effectiveSlot = lateIdx + (3 - lateCount);
  if (effectiveSlot === 0) {
    return Math.min(totalLeagueRounds - 3, halfRound + Math.max(2, Math.round(secondSpan * 0.28)));
  }
  if (effectiveSlot === 1) {
    return Math.min(totalLeagueRounds - 2, halfRound + Math.max(4, Math.round(secondSpan * 0.58)));
  }
  return Math.max(halfRound + 6, totalLeagueRounds - 2);
}

export function buildInitialKnockoutRound(
  compId: string,
  compName: string,
  compType: 'CUP' | 'CHAMPIONS_LEAGUE' | 'EUROPA_LEAGUE',
  clubIds: string[],
  roundIndex: number,
  calendarRound?: number
): { fixtures: Fixture[]; roundName: string; byeClubIds: string[] } {
  // Shuffle with deterministic-ish or Math.random
  const shuffled = [...clubIds].sort(() => Math.random() - 0.5);
  // Nearest power of 2 down for clean bracket if odd/non-pow2
  let pow2 = 2;
  while (pow2 * 2 <= shuffled.length) pow2 *= 2;

  const excess = shuffled.length - pow2;
  const playInCount = excess > 0 ? excess * 2 : shuffled.length;
  const playing = shuffled.slice(0, playInCount);
  const byes = shuffled.slice(playInCount);
  const roundName = excess > 0 ? `Preliminar (${playing.length} clubes)` : getKnockoutRoundName(pow2);

  const fixtures: Fixture[] = [];
  for (let i = 0; i < playing.length; i += 2) {
    const home = playing[i];
    const away = playing[i + 1];
    if (!home || !away) continue;
    fixtures.push({
      id: `ko_${compId}_r${roundIndex}_${i / 2}_${home}_${away}`,
      competitionType: compType,
      competitionId: compId,
      competitionName: compName,
      round: roundIndex + 1,
      calendarRound,
      roundLabel: roundName,
      homeClubId: home,
      awayClubId: away,
      played: false,
      homeGoals: null,
      awayGoals: null,
    });
  }

  return { fixtures, roundName, byeClubIds: byes };
}

function buildContinentalGroupStage(
  compType: 'CHAMPIONS_LEAGUE' | 'EUROPA_LEAGUE',
  compId: string,
  compName: string,
  idPrefix: string,
  clubs: Record<string, Club>,
  fixtures: Record<string, Fixture>,
  poolIds: string[],
  totalLeagueRounds = 38
): ChampionsLeagueState {
  const sortedByRep = [...poolIds]
    .slice(0, 32)
    .sort((a, b) => (clubs[b]?.reputation || 75) - (clubs[a]?.reputation || 75));

  const pot1 = sortedByRep.slice(0, 8).sort(() => Math.random() - 0.5);
  const pot2 = sortedByRep.slice(8, 16).sort(() => Math.random() - 0.5);
  const pot3 = sortedByRep.slice(16, 24).sort(() => Math.random() - 0.5);
  const pot4 = sortedByRep.slice(24, 32).sort(() => Math.random() - 0.5);

  const groupLetters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  const groups: ChampionsLeagueGroup[] = [];

  for (let g = 0; g < 8; g++) {
    const groupClubs = [pot1[g], pot2[g], pot3[g], pot4[g]].filter(Boolean);
    const groupId = groupLetters[g];
    const groupName = `Grupo ${groupId}`;
    const groupFixtures: Fixture[] = [];

    if (groupClubs.length === 4) {
      const [c0, c1, c2, c3] = groupClubs;
      const schedule: [string, string][][] = [
        [[c0, c1], [c2, c3]],
        [[c0, c2], [c3, c1]],
        [[c0, c3], [c1, c2]],
        [[c1, c0], [c3, c2]],
        [[c2, c0], [c1, c3]],
        [[c3, c0], [c2, c1]],
      ];
      schedule.forEach((pairs, rIdx) => {
        const round = rIdx + 1;
        pairs.forEach(([home, away], mIdx) => {
          const fix: Fixture = {
            id: `${idPrefix}_g${groupId}_r${round}_${mIdx}_${home}_${away}`,
            competitionType: compType,
            competitionId: compId,
            competitionName: compName,
            round,
            calendarRound: getUclGroupCalendarRound(round, totalLeagueRounds),
            roundLabel: `Grupo ${groupId} · Rodada ${round}`,
            groupId,
            homeClubId: home,
            awayClubId: away,
            played: false,
            homeGoals: null,
            awayGoals: null,
          };
          fixtures[fix.id] = fix;
          groupFixtures.push(fix);
        });
      });
    }

    groups.push({
      id: groupId,
      name: groupName,
      clubIds: groupClubs,
      fixtureIds: groupFixtures.map((f) => f.id),
    });
  }

  return {
    id: compId,
    name: compName,
    stage: 'GRUPOS',
    groupRound: 1,
    groups,
    currentRoundIndex: 0,
    rounds: [],
    championClubId: null,
  };
}

export function buildChampionsLeagueGroupStage(
  clubs: Record<string, Club>,
  fixtures: Record<string, Fixture>,
  qualifiedIds?: string[],
  totalLeagueRounds = 38
): ChampionsLeagueState {
  let poolIds: string[] = [];
  if (qualifiedIds && qualifiedIds.length >= 32) {
    poolIds = qualifiedIds.slice(0, 32);
  } else {
    for (const meta of LEAGUES_META) {
      if (meta.uclSpots <= 0) continue;
      const top = Object.values(clubs)
        .filter((c) => c.leagueId === meta.id)
        .sort((a, b) => b.reputation - a.reputation)
        .slice(0, meta.uclSpots)
        .map((c) => c.id);
      poolIds.push(...top);
    }
  }

  if (poolIds.length < 32) {
    const used = new Set(poolIds);
    const extras = Object.values(clubs)
      .filter((c) => c.division === 1 && !used.has(c.id))
      .sort((a, b) => b.reputation - a.reputation)
      .slice(0, 32 - poolIds.length)
      .map((c) => c.id);
    poolIds.push(...extras);
  }

  return buildContinentalGroupStage(
    'CHAMPIONS_LEAGUE',
    'champions-league-beta',
    'Champions League (Beta)',
    'ucl',
    clubs,
    fixtures,
    poolIds,
    totalLeagueRounds
  );
}

export function buildEuropaLeagueGroupStage(
  clubs: Record<string, Club>,
  fixtures: Record<string, Fixture>,
  uclClubIds: string[] = [],
  qualifiedIds?: string[],
  totalLeagueRounds = 38
): ChampionsLeagueState {
  const uclSet = new Set(uclClubIds);
  let poolIds: string[] = [];

  if (qualifiedIds && qualifiedIds.length >= 32) {
    poolIds = qualifiedIds.filter((id) => !uclSet.has(id)).slice(0, 32);
  } else {
    for (const meta of LEAGUES_META) {
      if (meta.uelSpots <= 0) continue;
      const nextSlice = Object.values(clubs)
        .filter((c) => c.leagueId === meta.id && !uclSet.has(c.id))
        .sort((a, b) => b.reputation - a.reputation)
        .slice(0, meta.uelSpots)
        .map((c) => c.id);
      poolIds.push(...nextSlice);
    }
  }

  if (poolIds.length < 32) {
    const used = new Set([...uclSet, ...poolIds]);
    const extras = Object.values(clubs)
      .filter((c) => c.division === 1 && !used.has(c.id))
      .sort((a, b) => b.reputation - a.reputation)
      .slice(0, 32 - poolIds.length)
      .map((c) => c.id);
    poolIds.push(...extras);
  }

  return buildContinentalGroupStage(
    'EUROPA_LEAGUE',
    'europa-league-beta',
    'Europa League (Beta)',
    'uel',
    clubs,
    fixtures,
    poolIds,
    totalLeagueRounds
  );
}

function assignInitialRoles(clubPlayers: Player[], starterIds: string[]): void {
  const starterSet = new Set(starterIds);
  const sorted = [...clubPlayers].sort((a, b) => b.overall - a.overall);
  const top3 = new Set(sorted.slice(0, 3).map((p) => p.id));

  for (const p of clubPlayers) {
    let role: SquadRole = 'reserva';
    if (top3.has(p.id) && p.overall >= 76) {
      role = 'importantissimo';
    } else if (starterSet.has(p.id)) {
      role = 'titular';
    } else if (p.age <= 21 && p.potential - p.overall >= 6) {
      role = 'promessa';
    } else if (p.overall >= (sorted[10]?.overall || 70) - 3) {
      role = 'rotacao';
    }
    p.role = role;
  }
}

export function initializeGameState(
  dataset: RawDataset,
  userClubId: string,
  slotId: string,
  slotName: string,
  season = 2026,
  gameMode: GameMode = 'CAREER',
  options?: { skipInitialNpcTransfers?: boolean }
): GameState {
  const leagues: Record<LeagueId, League> = {} as Record<LeagueId, League>;
  for (const meta of LEAGUES_META) {
    leagues[meta.id] = {
      id: meta.id,
      name: meta.name,
      country: meta.country,
      division: meta.division,
      totalRounds: 0,
      currentRound: 1,
    };
  }

  const clubMap: Record<string, Club> = {};
  const rawClubMeta = new Map<string, RawDatasetClub>();
  for (const rc of dataset.clubs || []) {
    const normL = normalizeLeagueId(rc.leagueId);
    if (!normL) continue;
    rawClubMeta.set(rc.id, { ...rc, leagueId: normL });
  }

  const players: Record<string, Player> = {};
  const playersByClub: Record<string, Player[]> = {};

  for (let i = 0; i < dataset.players.length; i++) {
    const rp = dataset.players[i];
    const rc = rawClubMeta.get(rp.clubId);
    const leagueId = normalizeLeagueId(rc?.leagueId || rp.leagueId || rp.league) || 'premier-league';
    const metaLeague = LEAGUES_META.find((l) => l.id === leagueId)!;

    if (!clubMap[rp.clubId]) {
      clubMap[rp.clubId] = {
        id: rp.clubId,
        name: rc?.name || rp.clubName || rp.clubId,
        shortName: rc?.shortName || (rc?.name || rp.clubId).slice(0, 3).toUpperCase(),
        leagueId,
        division: rc?.division || metaLeague.division,
        country: rc?.country || metaLeague.country,
        primaryColor: rc?.primaryColor || '#10B981',
        secondaryColor: rc?.secondaryColor || '#FFFFFF',
        budget: rc?.budget || rp.budget || (metaLeague.division === 1 ? 35000000 : 10000000),
        reputation: rc?.reputation || (metaLeague.division === 1 ? 76 : 68),
        autoRotate: true,
        tactics: {
          formationId: '4-3-3',
          mentality: 'equilibrada',
          passing: 'misto',
          pressing: 'media',
          tempo: 'normal',
        },
        starterIds: [],
        benchIds: [],
      };
    }

    const pos = normalizePosition(rp.position);
    const ovr = Math.max(50, Math.min(96, Math.round(rp.overall || 70)));
    const pot = Math.max(ovr, Math.min(98, Math.round(rp.potential || ovr)));
    const age = Math.max(16, Math.min(43, Math.round(rp.age || 24)));
    const id = rp.id || `pl_${i + 1}`;
    const altPositions: Position[] | undefined = rp.alternatePositions
      ? Array.from(
          new Set(
            rp.alternatePositions
              .map((rawAlt) => normalizePosition(rawAlt))
              .filter((pNorm) => pNorm !== pos)
          )
        )
      : undefined;

    const player: Player = {
      id,
      name: rp.name,
      nationality: rp.nationality || metaLeague.country,
      age,
      position: pos,
      alternatePositions: altPositions && altPositions.length > 0 ? altPositions : undefined,
      preferredFoot: rp.preferredFoot || 'Direito',
      skillMoves: rp.skillMoves || (pos === 'GOL' ? 1 : 3),
      weakFoot: rp.weakFoot || 3,
      playstyles: rp.playstyles,
      attributes: rp.attributes,
      overall: ovr,
      potential: pot,
      baseOverall: ovr,
      value: rp.value || estimateValue(ovr, pot, age),
      wage: rp.wage || estimateWage(ovr),
      clubId: rp.clubId,
      role: 'rotacao',
      fitness: 100,
      form: 'normal',
      recentRatings: [],
      lastRating: null,
      injury: null,
      transferListed: false,
      stats: {
        appearances: 0,
        minutes: 0,
        goals: 0,
        assists: 0,
        yellowCards: 0,
        redCards: 0,
        ratingSum: 0,
        ratingCount: 0,
        ovrDelta: 0,
        cleanSheets: 0,
        motm: 0,
        outsideBoxGoals: 0,
      },
    };

    players[id] = player;
    if (!playersByClub[rp.clubId]) playersByClub[rp.clubId] = [];
    playersByClub[rp.clubId].push(player);
  }

  // Build lineups & assign roles
  const defaultSlots = PRESET_FORMATIONS[0].slots;
  for (const club of Object.values(clubMap)) {
    const cPlayers = playersByClub[club.id] || [];
    const { starterIds, benchIds } = autoPickLineup(cPlayers, defaultSlots);
    club.starterIds = starterIds;
    club.benchIds = benchIds;
    assignInitialRoles(cPlayers, starterIds);
  }

  // Build league fixtures
  const fixtures: Record<string, Fixture> = {};
  for (const meta of LEAGUES_META) {
    const leagueClubIds = Object.values(clubMap)
      .filter((c) => c.leagueId === meta.id)
      .map((c) => c.id);
    const lFixtures = generateRoundRobinFixtures(meta.id, meta.name, leagueClubIds);
    for (const f of lFixtures) {
      fixtures[f.id] = f;
    }
    const maxR = lFixtures.reduce((acc, f) => Math.max(acc, f.round), 0);
    leagues[meta.id].totalRounds = maxR;
  }

  const resolvedUserClub = clubMap[userClubId] ? userClubId : Object.keys(clubMap)[0];
  const userTotalRounds = leagues[clubMap[resolvedUserClub]?.leagueId || 'premier-league']?.totalRounds || 38;

  // Build Domestic Cups (1st + 2nd division where available)
  const cups: Record<string, CupTournament> = {};
  for (const cupMeta of DOMESTIC_CUPS_META) {
    const cupClubIds = Object.values(clubMap)
      .filter((c) => cupMeta.leagueIds.includes(c.leagueId))
      .map((c) => c.id);
    if (cupClubIds.length < 2) continue;
    const totalCupRounds = getTotalCupRoundsForClubCount(cupClubIds.length);
    const calRound = getCupCalendarRound(0, totalCupRounds, userTotalRounds);
    const { fixtures: cupFixtures, roundName, byeClubIds } = buildInitialKnockoutRound(
      cupMeta.id,
      cupMeta.name,
      'CUP',
      cupClubIds,
      0,
      calRound
    );
    for (const f of cupFixtures) {
      fixtures[f.id] = f;
    }
    cups[cupMeta.id] = {
      id: cupMeta.id,
      name: cupMeta.name,
      country: cupMeta.country,
      leagueIds: cupMeta.leagueIds,
      currentRoundIndex: 0,
      rounds: [
        {
          roundIndex: 0,
          name: roundName,
          fixtureIds: cupFixtures.map((f) => f.id),
        },
      ],
      championClubId: null,
      byeClubIds: byeClubIds.length > 0 ? byeClubIds : undefined,
    };
  }

  // Build Champions League Beta & Europa League Beta (32 clubs each, disjoint)
  const championsLeague = buildChampionsLeagueGroupStage(
    clubMap,
    fixtures,
    undefined,
    userTotalRounds
  );
  const uclClubIds = championsLeague.groups.flatMap((g) => g.clubIds);
  const europaLeague = buildEuropaLeagueGroupStage(
    clubMap,
    fixtures,
    uclClubIds,
    undefined,
    userTotalRounds
  );

  if (gameMode === 'DRAFT' && clubMap[resolvedUserClub]) {
    clubMap[resolvedUserClub].budget = computeDraftStartingBudget(
      clubMap[resolvedUserClub].division,
      clubMap[resolvedUserClub].budget
    );
  }

  const initialState: GameState = {
    version: 2,
    gameMode,
    slotId,
    slotName,
    updatedAt: Date.now(),
    season,
    phase: 'INICIO_JANELA',
    userClubId: resolvedUserClub,
    leagues,
    clubs: clubMap,
    players,
    fixtures,
    cups,
    championsLeague,
    europaLeague,
    customFormations: [],
    offers: [],
    transferHistory: [],
    pastSummaries: [],
    lastPhaseReport: null,
    npcWindowDone: { inicio: false, meio: false },
    pendingTrophies: [],
    newsFeed: [
      {
        id: `news_init_${Date.now()}`,
        round: 1,
        title:
          gameMode === 'DRAFT'
            ? `Modo Draft Aberto — Temporada ${season}`
            : `Janela de Início Aberta — Temporada ${season}`,
        detail:
          gameMode === 'DRAFT'
            ? `${clubMap[resolvedUserClub]?.name} recebeu verba reforçada! Venda 3 atletas do elenco e escolha 1 Veterano, 1 Auge e 1 Promessa na aba Draft.`
            : `${clubMap[resolvedUserClub]?.name} iniciou a preparação. Ajuste suas táticas, observe lesões/fases e negocie antes de simular até o Meio da Temporada.`,
        type: 'info',
      },
    ],
  };

  ensureFinanceState(initialState);
  if (gameMode === 'DRAFT') {
    initializeDraftState(initialState);
  }
  manageNpcSquadsAndRoles(initialState);
  if (!options?.skipInitialNpcTransfers) {
    runGlobalNpcTransfers(initialState, 'INICIO', 24);
  }

  return initialState;
}
