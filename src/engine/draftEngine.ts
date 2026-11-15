import { autoPickLineup, getActiveSlots } from '../data/formations';
import { LEAGUES_META, normalizeLeagueId } from '../data/leaguesMeta';
import {
  Club,
  DraftAttributeFocus,
  DraftCandidate,
  DraftClassTier,
  DraftState,
  GameState,
  LeagueId,
  Player,
  PlayerAttributes,
  Position,
  RawDataset,
  TrophyCelebrationItem,
} from '../types/game';
import { recordFinanceEntry } from './financeEngine';

export interface UnderdogClubOption {
  id: string;
  name: string;
  shortName: string;
  leagueId: LeagueId;
  division: 1 | 2;
  primaryColor: string;
  reputation: number;
  squadCount: number;
  avgOvr: number;
  expectedPos: number;
  leagueClubCount: number;
  baseBudget: number;
  draftBudget: number;
}

export const DRAFT_TIER_LABEL: Record<DraftClassTier, string> = {
  VETERANO: 'Veteranos',
  AUGE: 'No Auge',
  PROMESSA: 'Promessas',
};

export const DRAFT_TIER_DESC: Record<DraftClassTier, string> = {
  VETERANO: '29+ anos · Experiência imediata e frieza',
  AUGE: '23 a 28 anos · Rendimento máximo imediato',
  PROMESSA: 'Até 22 anos · Alto potencial e evolução rápida',
};

export const ATTRIBUTE_FOCUS_INFO: Record<
  DraftAttributeFocus,
  { label: string; desc: string; keys: (keyof PlayerAttributes)[]; summaryKey: keyof PlayerAttributes }
> = {
  FINALIZACAO: {
    label: 'Finalização & Força do Chute',
    desc: '+8 Finalização, Força do Chute, Chute de Longe, Voleios, Pênaltis e Frieza',
    keys: ['finishing', 'shotPower', 'longShots', 'volleys', 'penalties', 'composure', 'positioning'],
    summaryKey: 'shooting',
  },
  ARMACAO: {
    label: 'Passe, Visão & Bola Parada',
    desc: '+8 Passe Curto, Passe Longo, Visão, Cruzamento, Curva e Falta',
    keys: ['shortPassing', 'longPassing', 'vision', 'crossing', 'curve', 'fkAccuracy'],
    summaryKey: 'passing',
  },
  VELOCIDADE_DRIBLE: {
    label: 'Velocidade & Drible',
    desc: '+8 Aceleração, Pique, Agilidade, Controle de Bola e Drible',
    keys: ['acceleration', 'sprintSpeed', 'agility', 'ballControl', 'dribblingSkill', 'balance'],
    summaryKey: 'dribbling',
  },
  DEFESA: {
    label: 'Defesa & Interceptação',
    desc: '+8 Interceptação, Noção Defensiva, Desarme em Pé, Carrinho e Cabeceio',
    keys: ['interceptions', 'defAwareness', 'standingTackle', 'slidingTackle', 'headingAccuracy'],
    summaryKey: 'defending',
  },
  FISICO: {
    label: 'Físico, Impulsão & Fôlego',
    desc: '+8 Fôlego, Força, Impulsão, Agressividade e Reações',
    keys: ['stamina', 'strength', 'jumping', 'aggression', 'reactions'],
    summaryKey: 'physicality',
  },
  GOLEIRO: {
    label: 'Goleiro & Reflexos',
    desc: '+8 Reflexos, Elasticidade, Manejo, Posicionamento e Chute GOL',
    keys: ['gkDiving', 'gkHandling', 'gkKicking', 'gkPositioning', 'gkReflexes'],
    summaryKey: 'gkReflexes',
  },
};

function shuffleArray<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function getLeagueStandingsOrder(leagueId: LeagueId, state: GameState): string[] {
  const clubs = Object.values(state.clubs).filter((c) => c.leagueId === leagueId);
  const leagueFixtures = Object.values(state.fixtures).filter(
    (f) => f.competitionType === 'LEAGUE' && f.competitionId === leagueId && f.played
  );

  if (leagueFixtures.length === 0) {
    return clubs
      .slice()
      .sort((a, b) => b.reputation - a.reputation || b.budget - a.budget)
      .map((c) => c.id);
  }

  const pts = new Map<string, { pts: number; gd: number; gf: number; rep: number }>();
  for (const c of clubs) {
    pts.set(c.id, { pts: 0, gd: 0, gf: 0, rep: c.reputation });
  }
  for (const f of leagueFixtures) {
    if (f.homeGoals === null || f.awayGoals === null) continue;
    const h = pts.get(f.homeClubId);
    const a = pts.get(f.awayClubId);
    if (!h || !a) continue;
    h.gf += f.homeGoals;
    a.gf += f.awayGoals;
    h.gd += f.homeGoals - f.awayGoals;
    a.gd += f.awayGoals - f.homeGoals;
    if (f.homeGoals > f.awayGoals) h.pts += 3;
    else if (f.awayGoals > f.homeGoals) a.pts += 3;
    else {
      h.pts += 1;
      a.pts += 1;
    }
  }
  return Array.from(pts.entries())
    .sort((x, y) => y[1].pts - x[1].pts || y[1].gd - x[1].gd || y[1].gf - x[1].gf || y[1].rep - x[1].rep)
    .map((e) => e[0]);
}

export function getClubCurrentLeagueRank(clubId: string, state: GameState): { rank: number; total: number } {
  const club = state.clubs[clubId];
  if (!club) return { rank: 10, total: 20 };
  const order = getLeagueStandingsOrder(club.leagueId, state);
  const idx = order.indexOf(clubId);
  return {
    rank: idx >= 0 ? idx + 1 : Math.ceil(order.length / 2),
    total: order.length || 20,
  };
}

export function computeDraftStartingBudget(division: 1 | 2, baseBudget: number): number {
  if (division === 1) {
    return Math.max(baseBudget + 36_000_000, 56_000_000);
  }
  return Math.max(baseBudget + 16_000_000, 24_000_000);
}

export function drawThreeUnderdogClubs(dataset: RawDataset, leagueId: LeagueId): UnderdogClubOption[] {
  const leagueMeta = LEAGUES_META.find((l) => l.id === leagueId) || LEAGUES_META[0];
  const byClub = new Map<
    string,
    { id: string; name: string; shortName: string; c1: string; rep: number; budget: number; ovrs: number[] }
  >();

  for (const rc of dataset.clubs || []) {
    if (normalizeLeagueId(rc.leagueId) !== leagueId) continue;
    byClub.set(rc.id, {
      id: rc.id,
      name: rc.name,
      shortName: rc.shortName || rc.name.slice(0, 3).toUpperCase(),
      c1: rc.primaryColor || '#10B981',
      rep: rc.reputation || (leagueMeta.division === 1 ? 75 : 68),
      budget: rc.budget || (leagueMeta.division === 1 ? 24_000_000 : 8_000_000),
      ovrs: [],
    });
  }

  for (const rp of dataset.players) {
    const lid = normalizeLeagueId(rp.leagueId || rp.league);
    const entry = byClub.get(rp.clubId);
    if (entry) {
      entry.ovrs.push(rp.overall || 70);
    } else if (lid === leagueId) {
      byClub.set(rp.clubId, {
        id: rp.clubId,
        name: rp.clubName || rp.clubId,
        shortName: (rp.clubName || rp.clubId).slice(0, 3).toUpperCase(),
        c1: '#10B981',
        rep: leagueMeta.division === 1 ? 74 : 67,
        budget: rp.budget || (leagueMeta.division === 1 ? 18_000_000 : 7_000_000),
        ovrs: [rp.overall || 70],
      });
    }
  }

  const ranked = Array.from(byClub.values())
    .map((c) => {
      const topOvrs = c.ovrs.slice().sort((a, b) => b - a).slice(0, 16);
      const avgOvr = topOvrs.length
        ? Math.round(topOvrs.reduce((s, n) => s + n, 0) / topOvrs.length)
        : c.rep;
      return {
        ...c,
        avgOvr,
        power: c.rep * 0.6 + avgOvr * 0.4,
      };
    })
    .sort((a, b) => b.power - a.power);

  const total = ranked.length;
  // Exclude top giants (~top 40%, min 2 clubs excluded if league has >= 6 clubs)
  const excludeTop = total >= 6 ? Math.max(2, Math.floor(total * 0.4)) : 0;
  const underdogPool = ranked.slice(excludeTop);
  const pool = underdogPool.length >= 3 ? underdogPool : ranked.slice(-Math.min(3, total));
  const picked = shuffleArray(pool).slice(0, 3);

  return picked.map((c) => {
    const expectedPos = ranked.findIndex((r) => r.id === c.id) + 1;
    return {
      id: c.id,
      name: c.name,
      shortName: c.shortName,
      leagueId,
      division: leagueMeta.division,
      primaryColor: c.c1,
      reputation: c.rep,
      squadCount: c.ovrs.length,
      avgOvr: c.avgOvr,
      expectedPos,
      leagueClubCount: total,
      baseBudget: c.budget,
      draftBudget: computeDraftStartingBudget(leagueMeta.division, c.budget),
    };
  });
}

export function computeExpectedLeaguePosition(clubId: string, state: GameState): number {
  const club = state.clubs[clubId];
  if (!club) return 12;
  const ranked = Object.values(state.clubs)
    .filter((c) => c.leagueId === club.leagueId)
    .map((c) => {
      const top = Object.values(state.players)
        .filter((p) => p.clubId === c.id)
        .sort((a, b) => b.overall - a.overall)
        .slice(0, 16);
      const avg = top.length ? top.reduce((s, p) => s + p.overall, 0) / top.length : c.reputation;
      return { id: c.id, score: c.reputation * 0.6 + avg * 0.4 };
    })
    .sort((a, b) => b.score - a.score);
  const idx = ranked.findIndex((r) => r.id === clubId);
  return idx >= 0 ? idx + 1 : Math.ceil(ranked.length / 2);
}

function getTierMatch(p: Player, tier: DraftClassTier): boolean {
  if (tier === 'VETERANO') return p.age >= 29 && p.overall >= 71;
  if (tier === 'AUGE') return p.age >= 23 && p.age <= 28 && p.overall >= 71;
  return p.age <= 22 && p.potential >= 75;
}

function buildDraftCandidate(
  player: Player,
  tier: DraftClassTier,
  state: GameState,
  rankCache: Map<string, { rank: number; total: number }>
): DraftCandidate {
  const club = state.clubs[player.clubId];
  const league = club ? state.leagues[club.leagueId] : undefined;
  let rankInfo = rankCache.get(player.clubId);
  if (!rankInfo) {
    rankInfo = getClubCurrentLeagueRank(player.clubId, state);
    rankCache.set(player.clubId, rankInfo);
  }

  // Buff rule: ONLY players rolled from clubs in mid-to-bottom half of table get the Draft buff!
  const isUnderdogBuffed = rankInfo.rank >= Math.ceil(rankInfo.total / 2);
  let ovrBuffDelta = 0;
  let buffedOverall = player.overall;
  let buffedNote: string | undefined;

  if (isUnderdogBuffed) {
    const rawDelta = rankInfo.rank >= Math.ceil(rankInfo.total * 0.72) ? 4 : 3;
    buffedOverall = Math.min(91, player.overall + rawDelta);
    ovrBuffDelta = Math.max(1, buffedOverall - player.overall);
    buffedNote = `Buff Draft (${rankInfo.rank}º/${rankInfo.total} da liga): +${ovrBuffDelta} OVR`;
  }

  const userClub = state.clubs[state.userClubId];
  const divCapPrice =
    userClub?.division === 1 ? Math.max(24_000_000, userClub.budget * 0.55) : Math.max(9_000_000, userClub.budget * 0.55);

  const rawPrice = isUnderdogBuffed
    ? Math.max(1_400_000, Math.round(player.value * 0.85))
    : Math.max(1_800_000, Math.round(player.value * 1.05));
  const draftPrice = Math.min(Math.round(divCapPrice), rawPrice);

  return {
    playerId: player.id,
    tier,
    fromClubId: player.clubId,
    fromClubName: club?.name || player.clubId,
    fromLeagueName: league?.name || '',
    fromTableRank: rankInfo.rank,
    fromLeagueClubCount: rankInfo.total,
    isUnderdogBuffed,
    originalOverall: player.overall,
    buffedOverall,
    ovrBuffDelta,
    draftPrice,
    buffedNote,
  };
}

export function generateDraftCandidatesForTier(
  state: GameState,
  tier: DraftClassTier,
  count = 3,
  excludeIds = new Set<string>(),
  preferredPosition?: Position
): DraftCandidate[] {
  const userClub = state.clubs[state.userClubId];
  if (!userClub) return [];

  const maxOvrCap = userClub.division === 1 ? 87 : 81;
  const minOvrFloor = userClub.division === 1 ? 72 : 66;
  const maxValCap = Math.max(18_000_000, userClub.budget * 0.78);

  const pool = Object.values(state.players).filter((p) => {
    if (p.clubId === state.userClubId) return false;
    if (excludeIds.has(p.id)) return false;
    if (p.injury) return false;
    if (preferredPosition && p.position !== preferredPosition && !p.alternatePositions?.includes(preferredPosition)) {
      return false;
    }
    if (p.overall < minOvrFloor || p.overall > maxOvrCap) return false;
    if (p.value > maxValCap * 1.35) return false;
    return getTierMatch(p, tier);
  });

  const fallbackPool =
    pool.length >= count
      ? pool
      : Object.values(state.players).filter((p) => {
          if (p.clubId === state.userClubId || excludeIds.has(p.id)) return false;
          if (preferredPosition && p.position !== preferredPosition) return false;
          return getTierMatch(p, tier);
        });

  const rankCache = new Map<string, { rank: number; total: number }>();
  const shuffled = shuffleArray(fallbackPool);

  // Aim for natural mix that lets underdog clubs appear noticeably (~60% lower half, ~40% upper half)
  const underdogList: Player[] = [];
  const topHalfList: Player[] = [];

  for (const p of shuffled) {
    let r = rankCache.get(p.clubId);
    if (!r) {
      r = getClubCurrentLeagueRank(p.clubId, state);
      rankCache.set(p.clubId, r);
    }
    if (r.rank >= Math.ceil(r.total / 2)) underdogList.push(p);
    else topHalfList.push(p);
    if (underdogList.length >= count * 2 && topHalfList.length >= count) break;
  }

  const chosen: Player[] = [];
  const wantUnderdog = Math.max(1, Math.min(count, Math.round(count * 0.65)));
  chosen.push(...underdogList.slice(0, wantUnderdog));
  const rem = count - chosen.length;
  if (rem > 0) {
    chosen.push(...topHalfList.slice(0, rem));
  }
  while (chosen.length < count && shuffled.length > chosen.length) {
    const next = shuffled.find((x) => !chosen.some((c) => c.id === x.id));
    if (!next) break;
    chosen.push(next);
  }

  return shuffleArray(chosen).map((p) => buildDraftCandidate(p, tier, state, rankCache));
}

export function generateAllInitialDraftOfferings(
  state: GameState
): Record<DraftClassTier, DraftCandidate[]> {
  const used = new Set<string>();
  const tiers: DraftClassTier[] = ['VETERANO', 'AUGE', 'PROMESSA'];
  const offerings = {} as Record<DraftClassTier, DraftCandidate[]>;
  for (const t of tiers) {
    const cands = generateDraftCandidatesForTier(state, t, 3, used);
    for (const c of cands) used.add(c.playerId);
    offerings[t] = cands;
  }
  return offerings;
}

export function initializeDraftState(state: GameState): void {
  const expectedLeaguePos = computeExpectedLeaguePosition(state.userClubId, state);
  state.gameMode = 'DRAFT';
  state.draftState = {
    expectedLeaguePos,
    roulettePasses: 1, // 1 starter pass so player can test a reroll or directed buff early, then earn via trophies/table
    midSeasonPassAwarded: false,
    endSeasonPassAwarded: false,
    soldOutCountThisWindow: 0,
    soldPlayerNamesThisWindow: [],
    pickedTiersThisWindow: [],
    initialOfferings: generateAllInitialDraftOfferings(state),
    midWindowPicksUsed: 0,
    midWindowCandidate: null,
    midWindowSelectedPos: 'MC',
    midWindowSelectedTier: 'PROMESSA',
    buffedPlayerIds: [],
  };
}

export function resetDraftForNewSeason(state: GameState): void {
  if (state.gameMode !== 'DRAFT' || !state.draftState) return;
  const userClub = state.clubs[state.userClubId];
  if (userClub) {
    userClub.budget += userClub.division === 1 ? 14_000_000 : 6_000_000;
  }
  state.draftState.expectedLeaguePos = computeExpectedLeaguePosition(state.userClubId, state);
  state.draftState.midSeasonPassAwarded = false;
  state.draftState.endSeasonPassAwarded = false;
  state.draftState.soldOutCountThisWindow = 0;
  state.draftState.soldPlayerNamesThisWindow = [];
  state.draftState.pickedTiersThisWindow = [];
  state.draftState.initialOfferings = generateAllInitialDraftOfferings(state);
  state.draftState.midWindowPicksUsed = 0;
  state.draftState.midWindowCandidate = null;
}

export function buildFallbackPlayerAttributes(player: Player): PlayerAttributes {
  const base = Math.max(48, Math.min(92, player.overall));
  const isGk = player.position === 'GOL';
  const isAtt = player.position === 'ATA' || player.position === 'PE' || player.position === 'PD';
  const isMid = player.position === 'MC' || player.position === 'MEI' || player.position === 'VOL';
  const isDef = player.position === 'ZAG' || player.position === 'LE' || player.position === 'LD';
  const prev = player.attributes;

  return {
    pace: prev?.pace ?? base,
    shooting: prev?.shooting ?? (isAtt ? base : isMid ? base - 4 : base - 16),
    passing: prev?.passing ?? (isMid ? base : base - 6),
    dribbling: prev?.dribbling ?? (isAtt || isMid ? base : base - 8),
    defending: prev?.defending ?? (isDef ? base : isMid ? base - 6 : 42),
    physicality: prev?.physicality ?? base - 2,
    acceleration: prev?.acceleration ?? base,
    sprintSpeed: prev?.sprintSpeed ?? base,
    positioning: prev?.positioning ?? (isAtt ? base : base - 8),
    finishing: prev?.finishing ?? (isAtt ? base + 1 : isMid ? base - 4 : base - 18),
    shotPower: prev?.shotPower ?? (isAtt || isMid ? base : base - 8),
    longShots: prev?.longShots ?? (isMid || isAtt ? base - 1 : base - 14),
    volleys: prev?.volleys ?? (isAtt ? base - 2 : base - 14),
    penalties: prev?.penalties ?? base - 4,
    vision: prev?.vision ?? (isMid ? base + 1 : base - 6),
    crossing: prev?.crossing ?? base - 5,
    fkAccuracy: prev?.fkAccuracy ?? base - 8,
    shortPassing: prev?.shortPassing ?? (isMid ? base + 1 : base - 4),
    longPassing: prev?.longPassing ?? (isMid ? base : base - 6),
    curve: prev?.curve ?? base - 6,
    agility: prev?.agility ?? base - 2,
    balance: prev?.balance ?? base - 2,
    reactions: prev?.reactions ?? base,
    ballControl: prev?.ballControl ?? base,
    dribblingSkill: prev?.dribblingSkill ?? base - 1,
    composure: prev?.composure ?? base,
    interceptions: prev?.interceptions ?? (isDef ? base : isMid ? base - 4 : 44),
    headingAccuracy: prev?.headingAccuracy ?? (player.position === 'ZAG' || player.position === 'ATA' ? base : base - 10),
    defAwareness: prev?.defAwareness ?? (isDef ? base : 46),
    standingTackle: prev?.standingTackle ?? (isDef ? base : 46),
    slidingTackle: prev?.slidingTackle ?? (isDef ? base - 1 : 44),
    jumping: prev?.jumping ?? base - 2,
    stamina: prev?.stamina ?? base + 1,
    strength: prev?.strength ?? base - 2,
    aggression: prev?.aggression ?? base - 4,
    gkDiving: prev?.gkDiving ?? (isGk ? base : 18),
    gkHandling: prev?.gkHandling ?? (isGk ? base - 1 : 18),
    gkKicking: prev?.gkKicking ?? (isGk ? base - 2 : 20),
    gkPositioning: prev?.gkPositioning ?? (isGk ? base : 18),
    gkReflexes: prev?.gkReflexes ?? (isGk ? base + 1 : 18),
  };
}

function applyCandidateBuffToPlayer(player: Player, candidate: DraftCandidate): void {
  if (!candidate.isUnderdogBuffed || candidate.ovrBuffDelta <= 0) return;
  const attrs = buildFallbackPlayerAttributes(player);
  const boost = candidate.ovrBuffDelta + 2;

  const cap = (v: number) => Math.min(97, v + boost);
  if (player.position === 'GOL') {
    attrs.gkReflexes = cap(attrs.gkReflexes || player.overall);
    attrs.gkDiving = cap(attrs.gkDiving || player.overall);
    attrs.gkPositioning = cap(attrs.gkPositioning || player.overall);
    attrs.gkHandling = cap(attrs.gkHandling || player.overall);
  } else if (player.position === 'ZAG' || player.position === 'LE' || player.position === 'LD' || player.position === 'VOL') {
    attrs.defending = cap(attrs.defending);
    attrs.defAwareness = cap(attrs.defAwareness || player.overall);
    attrs.interceptions = cap(attrs.interceptions || player.overall);
    attrs.standingTackle = cap(attrs.standingTackle || player.overall);
    attrs.stamina = cap(attrs.stamina || player.overall);
    attrs.pace = cap(attrs.pace);
  } else if (player.position === 'MC' || player.position === 'MEI') {
    attrs.passing = cap(attrs.passing);
    attrs.vision = cap(attrs.vision || player.overall);
    attrs.shortPassing = cap(attrs.shortPassing || player.overall);
    attrs.longShots = cap(attrs.longShots || player.overall);
    attrs.shotPower = cap(attrs.shotPower || player.overall);
    attrs.dribbling = cap(attrs.dribbling);
  } else {
    attrs.shooting = cap(attrs.shooting);
    attrs.finishing = cap(attrs.finishing || player.overall);
    attrs.shotPower = cap(attrs.shotPower || player.overall);
    attrs.pace = cap(attrs.pace);
    attrs.dribbling = cap(attrs.dribbling);
    attrs.composure = cap(attrs.composure || player.overall);
  }

  player.attributes = attrs;
  player.overall = candidate.buffedOverall;
  player.potential = Math.max(player.potential, candidate.buffedOverall + (player.age <= 22 ? 3 : 1));
  player.stats.ovrDelta += candidate.ovrBuffDelta;
}

export function sellDraftSquadPlayer(
  state: GameState,
  playerId: string
): { error?: string } {
  if (state.gameMode !== 'DRAFT' || !state.draftState) {
    return { error: 'Recurso exclusivo do Modo Draft.' };
  }
  if (state.phase !== 'INICIO_JANELA') {
    return { error: 'A dispensa de 3 jogadores ocorre apenas na Janela Inicial.' };
  }
  if (state.draftState.soldOutCountThisWindow >= 3) {
    return { error: 'Você já vendeu os 3 jogadores obrigatórios desta janela.' };
  }

  const player = state.players[playerId];
  const userClub = state.clubs[state.userClubId];
  if (!player || !userClub || player.clubId !== userClub.id) {
    return { error: 'Jogador inválido para venda.' };
  }

  const squad = Object.values(state.players).filter((p) => p.clubId === userClub.id);
  if (squad.length <= 15) {
    return { error: 'Mínimo de 15 atletas no elenco para evitar ficar sem time completo.' };
  }

  // Pick a random compatible AI club
  const candidateClubs = Object.values(state.clubs).filter(
    (c) => c.id !== userClub.id && c.division === userClub.division
  );
  const fallbackClubs = candidateClubs.length > 0
    ? candidateClubs
    : Object.values(state.clubs).filter((c) => c.id !== userClub.id);
  const buyer = fallbackClubs[Math.floor(Math.random() * fallbackClubs.length)];
  if (!buyer) return { error: 'Nenhum clube comprador disponível.' };

  const salePrice = Math.max(650_000, Math.round(player.value * 0.95));
  userClub.budget += salePrice;
  userClub.starterIds = userClub.starterIds.filter((id) => id !== player.id);
  userClub.benchIds = userClub.benchIds.filter((id) => id !== player.id);

  if (userClub.starterIds.length < 11) {
    const remaining = Object.values(state.players).filter(
      (p) => p.clubId === userClub.id && p.id !== player.id
    );
    const slots = getActiveSlots(userClub.tactics, state.customFormations);
    const picked = autoPickLineup(remaining, slots);
    userClub.starterIds = picked.starterIds;
    userClub.benchIds = picked.benchIds;
  }

  player.clubId = buyer.id;
  player.transferListed = false;
  player.loanListed = false;

  state.draftState.soldOutCountThisWindow += 1;
  state.draftState.soldPlayerNamesThisWindow.push(player.name);

  const round = state.leagues[userClub.leagueId]?.currentRound || 1;
  recordFinanceEntry(state, 'TRANSFERENCIA', `Saída Draft: ${player.name} (${buyer.shortName})`, salePrice, round);

  state.transferHistory.unshift({
    id: `tr_draft_sell_${Date.now()}_${player.id}`,
    playerId: player.id,
    playerName: player.name,
    fromClubId: userClub.id,
    toClubId: buyer.id,
    amount: salePrice,
    type: 'TRANSFER',
    season: state.season,
    phase: state.phase,
    reason: `Venda Draft (${buyer.name})`,
  });

  return {};
}

export function buyDraftCandidateFromInitialWindow(
  state: GameState,
  tier: DraftClassTier,
  playerId: string
): { error?: string } {
  if (state.gameMode !== 'DRAFT' || !state.draftState) {
    return { error: 'Recurso exclusivo do Modo Draft.' };
  }
  if (state.phase !== 'INICIO_JANELA') {
    return { error: 'As escolhas das 3 classes ocorrem na Fase Inicial.' };
  }
  if (state.draftState.soldOutCountThisWindow < 3) {
    return { error: 'Primeiro venda 3 jogadores do seu elenco antes de comprar no Draft.' };
  }
  if (state.draftState.pickedTiersThisWindow.includes(tier)) {
    return { error: `Você já escolheu um jogador da classe ${DRAFT_TIER_LABEL[tier]}.` };
  }

  const list = state.draftState.initialOfferings[tier] || [];
  const candidate = list.find((c) => c.playerId === playerId);
  const player = state.players[playerId];
  const userClub = state.clubs[state.userClubId];
  if (!candidate || !player || !userClub) {
    return { error: 'Carta do Draft não encontrada.' };
  }
  const canAffordAnyInTier = list.some((c) => userClub.budget >= c.draftPrice);
  const effectivePrice = canAffordAnyInTier ? candidate.draftPrice : Math.min(userClub.budget, candidate.draftPrice);
  if (canAffordAnyInTier && userClub.budget < candidate.draftPrice) {
    return { error: 'Verba insuficiente para contratar esta opção do Draft.' };
  }

  const originClub = state.clubs[player.clubId];
  userClub.budget -= effectivePrice;

  if (originClub) {
    originClub.budget += effectivePrice;
    originClub.starterIds = originClub.starterIds.filter((id) => id !== player.id);
    originClub.benchIds = originClub.benchIds.filter((id) => id !== player.id);
    const originPlayers = Object.values(state.players).filter(
      (p) => p.clubId === originClub.id && p.id !== player.id
    );
    const slots = getActiveSlots(originClub.tactics, state.customFormations);
    const picked = autoPickLineup(originPlayers, slots);
    originClub.starterIds = picked.starterIds;
    originClub.benchIds = picked.benchIds;
  }

  player.clubId = userClub.id;
  player.transferListed = false;
  player.loanListed = false;
  player.role = 'titular';

  if (candidate.isUnderdogBuffed) {
    applyCandidateBuffToPlayer(player, candidate);
    if (!state.draftState.buffedPlayerIds.includes(player.id)) {
      state.draftState.buffedPlayerIds.push(player.id);
    }
  }

  if (userClub.benchIds.length < 7 && !player.injury) {
    userClub.benchIds.push(player.id);
  }

  state.draftState.pickedTiersThisWindow.push(tier);

  const round = state.leagues[userClub.leagueId]?.currentRound || 1;
  recordFinanceEntry(
    state,
    'TRANSFERENCIA',
    `Draft ${DRAFT_TIER_LABEL[tier]}: ${player.name}`,
    -effectivePrice,
    round
  );

  state.transferHistory.unshift({
    id: `tr_draft_buy_${Date.now()}_${player.id}`,
    playerId: player.id,
    playerName: player.name,
    fromClubId: candidate.fromClubId,
    toClubId: userClub.id,
    amount: effectivePrice,
    type: 'TRANSFER',
    season: state.season,
    phase: state.phase,
    reason: candidate.isUnderdogBuffed
      ? `Draft ${DRAFT_TIER_LABEL[tier]} (+${candidate.ovrBuffDelta} OVR Buff)`
      : `Draft ${DRAFT_TIER_LABEL[tier]}`,
  });

  return {};
}

export function rerollInitialDraftWindow(
  state: GameState,
  tier?: DraftClassTier
): { error?: string } {
  if (state.gameMode !== 'DRAFT' || !state.draftState) {
    return { error: 'Modo Draft não ativo.' };
  }
  if (state.phase !== 'INICIO_JANELA') {
    return { error: 'Só é possível re-rolar as classes na Janela Inicial.' };
  }
  if (state.draftState.roulettePasses < 1) {
    return { error: 'Sem Passes de Roleta disponíveis.' };
  }

  state.draftState.roulettePasses -= 1;
  const used = new Set<string>();
  const tiers: DraftClassTier[] = ['VETERANO', 'AUGE', 'PROMESSA'];

  for (const t of tiers) {
    if (tier && t !== tier) {
      for (const c of state.draftState.initialOfferings[t] || []) used.add(c.playerId);
    }
  }

  for (const t of tiers) {
    if (state.draftState.pickedTiersThisWindow.includes(t)) continue;
    if (!tier || t === tier) {
      const next = generateDraftCandidatesForTier(state, t, 3, used);
      for (const c of next) used.add(c.playerId);
      state.draftState.initialOfferings[t] = next;
    }
  }

  return {};
}

export function rollMidWindowDraft(
  state: GameState,
  position: Position,
  tier: DraftClassTier
): { error?: string } {
  if (state.gameMode !== 'DRAFT' || !state.draftState) {
    return { error: 'Modo Draft não ativo.' };
  }
  if (state.phase !== 'MEIO_JANELA') {
    return { error: 'A roleta de reforço por posição abre apenas no Meio de Temporada.' };
  }

  const isFreeOpeningRoll =
    state.draftState.midWindowPicksUsed === 0 && !state.draftState.midWindowCandidate;

  if (!isFreeOpeningRoll) {
    if (state.draftState.roulettePasses < 1) {
      return { error: 'Sem Passes de Roleta extras. Conquiste passes por posição ou títulos.' };
    }
    state.draftState.roulettePasses -= 1;
  }

  const exclude = new Set<string>();
  if (state.draftState.midWindowCandidate) {
    exclude.add(state.draftState.midWindowCandidate.playerId);
  }

  let candidates = generateDraftCandidatesForTier(state, tier, 1, exclude, position);
  if (candidates.length === 0) {
    // Fallback without strict position if rare combo
    candidates = generateDraftCandidatesForTier(state, tier, 1, exclude);
  }
  if (candidates.length === 0) {
    if (!isFreeOpeningRoll) state.draftState.roulettePasses += 1;
    return { error: 'Nenhum atleta disponível nesta combinação agora.' };
  }

  state.draftState.midWindowSelectedPos = position;
  state.draftState.midWindowSelectedTier = tier;
  state.draftState.midWindowCandidate = candidates[0];
  return {};
}

export function signMidWindowDraftCandidate(state: GameState): { error?: string } {
  if (state.gameMode !== 'DRAFT' || !state.draftState) {
    return { error: 'Modo Draft não ativo.' };
  }
  const cand = state.draftState.midWindowCandidate;
  if (!cand) return { error: 'Nenhum jogador sorteado na roleta atual.' };

  const player = state.players[cand.playerId];
  const userClub = state.clubs[state.userClubId];
  if (!player || !userClub) return { error: 'Jogador inválido.' };

  const finalPrice = Math.min(userClub.budget, cand.draftPrice);
  const originClub = state.clubs[player.clubId];

  userClub.budget -= finalPrice;
  if (originClub) {
    originClub.budget += finalPrice;
    originClub.starterIds = originClub.starterIds.filter((id) => id !== player.id);
    originClub.benchIds = originClub.benchIds.filter((id) => id !== player.id);
    const originPlayers = Object.values(state.players).filter(
      (p) => p.clubId === originClub.id && p.id !== player.id
    );
    const slots = getActiveSlots(originClub.tactics, state.customFormations);
    const picked = autoPickLineup(originPlayers, slots);
    originClub.starterIds = picked.starterIds;
    originClub.benchIds = picked.benchIds;
  }

  player.clubId = userClub.id;
  player.transferListed = false;
  player.loanListed = false;
  player.role = 'titular';

  if (cand.isUnderdogBuffed) {
    applyCandidateBuffToPlayer(player, cand);
    if (!state.draftState.buffedPlayerIds.includes(player.id)) {
      state.draftState.buffedPlayerIds.push(player.id);
    }
  }

  if (userClub.benchIds.length < 7 && !player.injury) {
    userClub.benchIds.push(player.id);
  }

  state.draftState.midWindowCandidate = null;
  state.draftState.midWindowPicksUsed += 1;

  const round = state.leagues[userClub.leagueId]?.currentRound || 1;
  recordFinanceEntry(
    state,
    'TRANSFERENCIA',
    `Roleta Draft: ${player.name} (${player.position})`,
    -finalPrice,
    round
  );

  state.transferHistory.unshift({
    id: `tr_draft_mid_${Date.now()}_${player.id}`,
    playerId: player.id,
    playerName: player.name,
    fromClubId: cand.fromClubId,
    toClubId: userClub.id,
    amount: finalPrice,
    type: 'TRANSFER',
    season: state.season,
    phase: state.phase,
    reason: cand.isUnderdogBuffed
      ? `Roleta Meio Draft (+${cand.ovrBuffDelta} OVR Buff)`
      : `Roleta Meio Draft`,
  });

  return {};
}

export function applyDirectedAttributeBuff(
  state: GameState,
  playerId: string,
  focus: DraftAttributeFocus
): { error?: string; ovrGain?: number } {
  if (state.gameMode !== 'DRAFT' || !state.draftState) {
    return { error: 'Disponível apenas no Modo Draft.' };
  }
  if (state.draftState.roulettePasses < 1) {
    return { error: 'Você precisa de pelo menos 1 Passe de Roleta para aplicar este buff.' };
  }

  const player = state.players[playerId];
  const userClub = state.clubs[state.userClubId];
  if (!player || !userClub || player.clubId !== userClub.id) {
    return { error: 'Jogador não pertence ao seu elenco.' };
  }
  if (focus === 'GOLEIRO' && player.position !== 'GOL') {
    return { error: 'Atributos de Goleiro só podem ser direcionados para goleiros.' };
  }

  state.draftState.roulettePasses -= 1;
  const attrs = buildFallbackPlayerAttributes(player);
  const spec = ATTRIBUTE_FOCUS_INFO[focus];

  for (const key of spec.keys) {
    const cur = attrs[key] ?? player.overall;
    attrs[key] = Math.min(99, cur + 8);
  }
  const summaryVal = attrs[spec.summaryKey] ?? player.overall;
  attrs[spec.summaryKey] = Math.min(98, summaryVal + 6);
  player.attributes = attrs;

  const ovrGain = player.overall < 86 ? 3 : 2;
  const nextOvr = Math.min(96, player.overall + ovrGain);
  const actualGain = Math.max(1, nextOvr - player.overall);
  player.overall = nextOvr;
  player.potential = Math.max(player.potential, nextOvr);
  player.stats.ovrDelta += actualGain;
  player.value = Math.round(player.value * 1.12);

  if (!state.draftState.buffedPlayerIds.includes(player.id)) {
    state.draftState.buffedPlayerIds.push(player.id);
  }

  const round = state.leagues[userClub.leagueId]?.currentRound || 1;
  state.newsFeed.unshift({
    id: `news_draft_buff_${Date.now()}_${player.id}`,
    round,
    title: `Buff Direcionado Draft: ${player.name} (+${actualGain} OVR)`,
    detail: `Foco em ${spec.label} elevou os atributos-chave para ${player.overall} OVR.`,
    type: 'breakout',
  });

  return { ovrGain: actualGain };
}

export function evaluateDraftTableOverperformance(
  state: GameState,
  trigger: 'MID' | 'END'
): number {
  if (state.gameMode !== 'DRAFT' || !state.draftState) return 0;
  const { rank } = getClubCurrentLeagueRank(state.userClubId, state);
  const expected = state.draftState.expectedLeaguePos;
  const diff = expected - rank; // positive means doing better than expected

  if (trigger === 'MID') {
    if (state.draftState.midSeasonPassAwarded) return 0;
    state.draftState.midSeasonPassAwarded = true;
    const earned = diff >= 6 ? 2 : diff >= 3 ? 1 : 0;
    if (earned > 0) {
      state.draftState.roulettePasses += earned;
      state.newsFeed.unshift({
        id: `news_draft_midpass_${Date.now()}`,
        round: state.leagues[state.clubs[state.userClubId].leagueId]?.currentRound || 19,
        title: `+${earned} Passe(s) de Roleta por campanha na Liga!`,
        detail: `Expectativa era ${expected}º lugar, clube está em ${rank}º no meio da temporada.`,
        type: 'award',
      });
    }
    return earned;
  }

  if (state.draftState.endSeasonPassAwarded) return 0;
  state.draftState.endSeasonPassAwarded = true;
  const earned = diff >= 5 ? 2 : diff >= 2 ? 1 : 0;
  if (earned > 0) {
    state.draftState.roulettePasses += earned;
    state.newsFeed.unshift({
      id: `news_draft_endpass_${Date.now()}`,
      round: state.leagues[state.clubs[state.userClubId].leagueId]?.totalRounds || 38,
      title: `+${earned} Passe(s) de Roleta por posição acima do esperado!`,
      detail: `Finalizou em ${rank}º lugar na liga (projeção inicial: ${expected}º).`,
      type: 'award',
    });
  }
  return earned;
}

export function enqueueUserTrophyCelebration(
  state: GameState,
  kind: TrophyCelebrationItem['kind'],
  competitionName: string,
  summaryLine: string
): void {
  const userClub = state.clubs[state.userClubId];
  if (!userClub) return;

  if (!state.pendingTrophies) state.pendingTrophies = [];
  const exists = state.pendingTrophies.some(
    (t) => t.kind === kind && t.season === state.season && t.competitionName === competitionName
  );
  if (exists) return;

  let passesEarned: number | undefined;
  if (state.gameMode === 'DRAFT' && state.draftState) {
    passesEarned = kind === 'CHAMPIONS_LEAGUE' ? 3 : 2;
    state.draftState.roulettePasses += passesEarned;
  }

  state.pendingTrophies.push({
    id: `trophy_${kind}_${state.season}_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
    kind,
    competitionName,
    season: state.season,
    clubId: userClub.id,
    clubName: userClub.name,
    summaryLine,
    passesEarned,
  });
}

export function isDraftWindowMandatoryPending(state: GameState): boolean {
  if (state.gameMode !== 'DRAFT' || !state.draftState) return false;
  if (state.phase === 'INICIO_JANELA') {
    return (
      state.draftState.soldOutCountThisWindow < 3 ||
      state.draftState.pickedTiersThisWindow.length < 3
    );
  }
  if (state.phase === 'MEIO_JANELA') {
    return state.draftState.midWindowPicksUsed < 1;
  }
  return false;
}

export function getPendingDraftStepLabel(state: GameState): string | null {
  if (!isDraftWindowMandatoryPending(state) || !state.draftState) return null;
  if (state.phase === 'INICIO_JANELA') {
    if (state.draftState.soldOutCountThisWindow < 3) {
      return `Passo obrigatório: venda ${3 - state.draftState.soldOutCountThisWindow} atleta(s) do seu elenco no Draft antes de simular.`;
    }
    const nextTier = (['VETERANO', 'AUGE', 'PROMESSA'] as DraftClassTier[]).find(
      (t) => !state.draftState!.pickedTiersThisWindow.includes(t)
    );
    if (nextTier) {
      return `Passo obrigatório: escolha 1 atleta da classe ${DRAFT_TIER_LABEL[nextTier]} no Draft antes de simular.`;
    }
  }
  if (state.phase === 'MEIO_JANELA') {
    return 'Passo obrigatório: gire a Roleta de Meio de Temporada e contrate seu reforço no Draft antes de simular.';
  }
  return null;
}
