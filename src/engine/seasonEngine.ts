import {
  autoPickLineup,
  FORM_LABELS,
  getActiveSlots,
  getFormOvrBonus,
  getPlayerAvgRating,
  getSlotCompatibility,
  PRESET_FORMATIONS,
  ROLE_TARGET_SHARE,
} from '../data/formations';
import {
  analyzeClubTactics,
  computeTacticalMatchup,
  getSlotTacticalInfo,
  pickTacticalAssister,
  pickTacticalScorer,
} from './tacticsEngine';
import { LEAGUES_META } from '../data/leaguesMeta';
import {
  ChampionsLeagueState,
  Club,
  CupTournament,
  DraftAttributeFocus,
  DraftClassTier,
  Fixture,
  GameState,
  LeagueId,
  LeagueTableRow,
  MatchEvent,
  MatchStats,
  PhaseReport,
  Player,
  PlayerFormPhase,
  Position,
  SeasonSummary,
  TransferOffer,
} from '../types/game';
import {
  buildChampionsLeagueGroupStage,
  buildEuropaLeagueGroupStage,
  buildInitialKnockoutRound,
  generateRoundRobinFixtures,
  getCupCalendarRound,
  getTotalCupRoundsForClubCount,
  getUclGroupCalendarRound,
  getUclKnockoutCalendarRound,
} from './dataLoader';
import {
  evaluateLoanAttempt,
  evaluateTransferAttempt,
  manageNpcSquadsAndRoles,
  runGlobalNpcTransfers,
} from './transferMarketEngine';
import {
  computeClubMatchAttrModifiers,
  describeShotSuffix,
  generateGoalShotDetail,
  getPlayerStaminaDrainMult,
} from './goalShotEngine';
import {
  applyMidSeasonBoardGrant,
  awardEndOfSeasonLeaguePrizes,
  awardKnockoutProgressionPrizes,
  awardUclGroupMatchPrizes,
  awardUclGroupQualificationPrizes,
  ensureFinanceState,
  processHomeMatchAttendanceAndGate,
  processPeriodicShirtSales,
  recordFinanceEntry,
  resetFinanceStateForNewSeason,
} from './financeEngine';
import {
  applyDirectedAttributeBuff,
  buyDraftCandidateFromInitialWindow,
  enqueueUserTrophyCelebration,
  evaluateDraftTableOverperformance,
  rerollInitialDraftWindow,
  resetDraftForNewSeason,
  rollMidWindowDraft,
  sellDraftSquadPlayer,
  signMidWindowDraftCandidate,
} from './draftEngine';

export function computeLeagueTable(leagueId: LeagueId, state: GameState): LeagueTableRow[] {
  const rows: Record<string, LeagueTableRow> = {};
  for (const club of Object.values(state.clubs)) {
    if (club.leagueId === leagueId) {
      rows[club.id] = {
        clubId: club.id,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        points: 0,
        form: [],
      };
    }
  }

  const leagueFixtures = Object.values(state.fixtures)
    .filter((f) => f.competitionType === 'LEAGUE' && f.competitionId === leagueId && f.played)
    .sort((a, b) => a.round - b.round);

  for (const f of leagueFixtures) {
    const h = rows[f.homeClubId];
    const a = rows[f.awayClubId];
    if (!h || !a || f.homeGoals === null || f.awayGoals === null) continue;

    h.played++;
    a.played++;
    h.goalsFor += f.homeGoals;
    h.goalsAgainst += f.awayGoals;
    a.goalsFor += f.awayGoals;
    a.goalsAgainst += f.homeGoals;

    if (f.homeGoals > f.awayGoals) {
      h.won++;
      h.points += 3;
      h.form.push('V');
      a.lost++;
      a.form.push('D');
    } else if (f.homeGoals < f.awayGoals) {
      a.won++;
      a.points += 3;
      a.form.push('V');
      h.lost++;
      h.form.push('D');
    } else {
      h.drawn++;
      a.drawn++;
      h.points += 1;
      a.points += 1;
      h.form.push('E');
      a.form.push('E');
    }
  }

  return Object.values(rows)
    .map((r) => ({ ...r, form: r.form.slice(-5) }))
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      const gdA = a.goalsFor - a.goalsAgainst;
      const gdB = b.goalsFor - b.goalsAgainst;
      if (gdB !== gdA) return gdB - gdA;
      if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
      return (state.clubs[a.clubId]?.name || '').localeCompare(state.clubs[b.clubId]?.name || '');
    });
}

export function computeChampionsGroupTable(
  groupId: string,
  state: GameState,
  compType: 'CHAMPIONS_LEAGUE' | 'EUROPA_LEAGUE' = 'CHAMPIONS_LEAGUE'
): LeagueTableRow[] {
  const comp = compType === 'EUROPA_LEAGUE' ? state.europaLeague : state.championsLeague;
  const group = comp?.groups.find((g) => g.id === groupId);
  if (!group) return [];

  const rows: Record<string, LeagueTableRow> = {};
  for (const cid of group.clubIds) {
    rows[cid] = {
      clubId: cid,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      points: 0,
      form: [],
    };
  }

  const groupFixtures = group.fixtureIds
    .map((fid) => state.fixtures[fid])
    .filter((f) => f && f.played)
    .sort((a, b) => a.round - b.round);

  for (const f of groupFixtures) {
    const h = rows[f.homeClubId];
    const a = rows[f.awayClubId];
    if (!h || !a || f.homeGoals === null || f.awayGoals === null) continue;

    h.played++;
    a.played++;
    h.goalsFor += f.homeGoals;
    h.goalsAgainst += f.awayGoals;
    a.goalsFor += f.awayGoals;
    a.goalsAgainst += f.homeGoals;

    if (f.homeGoals > f.awayGoals) {
      h.won++;
      h.points += 3;
      h.form.push('V');
      a.lost++;
      a.form.push('D');
    } else if (f.homeGoals < f.awayGoals) {
      a.won++;
      a.points += 3;
      a.form.push('V');
      h.lost++;
      h.form.push('D');
    } else {
      h.drawn++;
      a.drawn++;
      h.points += 1;
      a.points += 1;
      h.form.push('E');
      a.form.push('E');
    }
  }

  return Object.values(rows)
    .map((r) => ({ ...r, form: r.form.slice(-5) }))
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      const gdA = a.goalsFor - a.goalsAgainst;
      const gdB = b.goalsFor - b.goalsAgainst;
      if (gdB !== gdA) return gdB - gdA;
      if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
      return (state.clubs[a.clubId]?.name || '').localeCompare(state.clubs[b.clubId]?.name || '');
    });
}

export function getClubPlayers(clubId: string, players: Record<string, Player>): Player[] {
  return Object.values(players).filter((p) => p.clubId === clubId);
}

export function evaluateClubMatchPower(
  club: Club,
  players: Record<string, Player>,
  customFormations: GameState['customFormations']
): { attack: number; midfield: number; defense: number; gk: number; overall: number } {
  const slots = getActiveSlots(club.tactics, customFormations);
  const analysis = analyzeClubTactics(slots, club.tactics);
  let attSum = 0, attW = 0;
  let midSum = 0, midW = 0;
  let defSum = 0, defW = 0;
  let gkVal = 68;

  club.starterIds.forEach((pid, idx) => {
    const p = players[pid];
    const slot = slots[idx];
    if (!p) return;
    const compat = slot ? getSlotCompatibility(p.position, slot.pos, p.alternatePositions) : 0.9;
    const fatiguePenalty = p.fitness >= 70 ? 1.0 : 0.72 + (p.fitness / 100) * 0.4;
    const injuryFactor = p.injury && p.injury.roundsRemaining > 0 ? 0.45 : 1.0;
    const formBonus = getFormOvrBonus(p.form || 'normal');
    const eff = (p.overall + formBonus) * compat * fatiguePenalty * injuryFactor;

    const info = slot ? getSlotTacticalInfo(slot, idx) : null;

    if (p.position === 'GOL' || slot?.pos === 'GOL') {
      gkVal = eff;
    } else if (info?.isWingback) {
      // Advanced wingbacks split contribution across flank defense, midfield progression, and attack
      defSum += eff * 0.4;
      defW += 0.4;
      midSum += eff * 0.35;
      midW += 0.35;
      attSum += eff * 0.4;
      attW += 0.4;
    } else if (info?.isDeepAnchor) {
      defSum += eff * 0.3;
      defW += 0.3;
      midSum += eff * 0.7;
      midW += 0.7;
    } else if (info?.isAttackingMid) {
      midSum += eff * 0.65;
      midW += 0.65;
      attSum += eff * 0.35;
      attW += 0.35;
    } else if (slot && ['ZAG', 'LE', 'LD'].includes(slot.pos)) {
      defSum += eff;
      defW += 1;
    } else if (slot && ['VOL', 'MC', 'MEI'].includes(slot.pos)) {
      midSum += eff;
      midW += 1;
    } else {
      attSum += eff;
      attW += 1;
    }
  });

  const mentalityBonus =
    club.tactics.mentality === 'ofensiva'
      ? { att: 3.5, def: -2.5 }
      : club.tactics.mentality === 'defensiva'
        ? { att: -2.5, def: 3.5 }
        : { att: 0, def: 0 };

  const pressingBonus = club.tactics.pressing === 'alta' ? 1.5 : club.tactics.pressing === 'baixa' ? -1 : 0;

  const attack = (attW > 0 ? attSum / attW : 66) + mentalityBonus.att + pressingBonus + analysis.attackAdj;
  const midfield = (midW > 0 ? midSum / midW : 66) + pressingBonus * 0.5 + analysis.midfieldAdj;
  const defense = (defW > 0 ? defSum / defW : 65) + mentalityBonus.def + analysis.defenseAdj;
  const overall = attack * 0.3 + midfield * 0.3 + defense * 0.25 + gkVal * 0.15;

  return { attack, midfield, defense, gk: gkVal, overall };
}

function poissonRandom(lambda: number): number {
  const L = Math.exp(-Math.max(0.05, lambda));
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= Math.random();
  } while (p > L);
  return Math.min(7, k - 1);
}

function ensureClubHasHealthyLineup(
  club: Club,
  state: GameState,
  importance: 'league' | 'cup' | 'ucl',
  skipUserManual = false
) {
  const cPlayers = getClubPlayers(club.id, state.players);
  const hasInjuredStarter = club.starterIds.some((id) => state.players[id]?.injury);
  const isUser = club.id === state.userClubId;
  const shouldAutoRotate = !isUser || (club.autoRotate !== false && !skipUserManual);

  if (shouldAutoRotate || club.starterIds.length < 11 || hasInjuredStarter) {
    const slots = getActiveSlots(club.tactics, state.customFormations);
    const picked = autoPickLineup(cPlayers, slots, importance);
    club.starterIds = picked.starterIds;
    club.benchIds = picked.benchIds;
  }
}

function updatePlayerFormPhase(p: Player, currentRound: number, state: GameState, matchGoals: number): void {
  const recent = p.recentRatings || [];
  if (recent.length < 2) {
    p.form = 'normal';
    return;
  }
  const windowRatings = recent.slice(-4);
  const avg = windowRatings.reduce((s, v) => s + v, 0) / windowRatings.length;
  const prevForm = p.form || 'normal';

  let nextForm: PlayerFormPhase = 'normal';
  if (avg >= 7.75 || (avg >= 7.45 && matchGoals >= 2)) {
    nextForm = 'otima';
  } else if (avg >= 7.12) {
    nextForm = 'boa';
  } else if (avg <= 6.05) {
    nextForm = 'ma';
  }

  p.form = nextForm;

  const isNotable = p.clubId === state.userClubId || p.overall >= 80;
  if (nextForm === 'otima' && prevForm !== 'otima' && isNotable && Math.random() < 0.35) {
    const clubName = state.clubs[p.clubId]?.name || '';
    state.newsFeed.unshift({
      id: `news_form_${p.id}_${currentRound}_${Math.random().toString(36).slice(2, 5)}`,
      round: currentRound,
      title: `Em estado de graça: ${p.name} entra em Fase Ótima`,
      detail: `Com média ${avg.toFixed(1)} nos últimos jogos pelo ${clubName}, ${p.name} vive momento iluminado no mercado.`,
      type: 'form',
    });
  }

  // Young breakthrough ("jogador novo dando a festa e surpreendendo")
  if (
    p.age <= 22 &&
    p.overall <= 79 &&
    (p.lastRating || 0) >= 8.2 &&
    (nextForm === 'otima' || nextForm === 'boa') &&
    Math.random() < 0.25
  ) {
    const clubName = state.clubs[p.clubId]?.name || '';
    state.newsFeed.unshift({
      id: `news_brk_${p.id}_${currentRound}_${Math.random().toString(36).slice(2, 5)}`,
      round: currentRound,
      title: `Revelação dando a festa: ${p.name} (${p.age}a) surpreende!`,
      detail: `O jovem do ${clubName} somou nota ${(p.lastRating || 8.2).toFixed(1)} e vem roubando a cena nesta temporada.`,
      type: 'breakout',
    });
  }
}

const INJURY_CATALOG: { type: string; min: number; max: number; weight: number }[] = [
  { type: 'Fadiga muscular', min: 1, max: 2, weight: 22 },
  { type: 'Contusão no tornozelo', min: 1, max: 2, weight: 20 },
  { type: 'Pancada no joelho', min: 1, max: 2, weight: 15 },
  { type: 'Estiramento na coxa', min: 3, max: 4, weight: 18 },
  { type: 'Entorse ligamentar', min: 3, max: 4, weight: 12 },
  { type: 'Lesão na panturrilha', min: 2, max: 4, weight: 10 },
  { type: 'Lesão muscular grau 2', min: 4, max: 6, weight: 8 },
  { type: 'Fratura por estresse', min: 5, max: 6, weight: 4 },
];

function rollBalancedInjury(): { type: string; roundsRemaining: number; totalRounds: number } {
  const totalWeight = INJURY_CATALOG.reduce((s, item) => s + item.weight, 0);
  let r = Math.random() * totalWeight;
  for (const item of INJURY_CATALOG) {
    r -= item.weight;
    if (r <= 0) {
      const rounds = item.min + Math.floor(Math.random() * (item.max - item.min + 1));
      return { type: item.type, roundsRemaining: rounds, totalRounds: rounds };
    }
  }
  return { type: 'Contusão leve', roundsRemaining: 2, totalRounds: 2 };
}

function applyMatchPerformanceAndInjuries(
  club: Club,
  goalsScored: number,
  goalsConceded: number,
  fixture: Fixture,
  state: GameState,
  goalCounts: Record<string, number>,
  assistCounts: Record<string, number>,
  customMinutes?: Record<string, number>
): void {
  const activeSlots = getActiveSlots(club.tactics, state.customFormations);
  const tacticalAnalysis = analyzeClubTactics(activeSlots, club.tactics);
  const pressDrain = club.tactics.pressing === 'alta' ? 4 : club.tactics.pressing === 'baixa' ? -2 : 0;
  const tempoDrain = club.tactics.tempo === 'rapido' ? 2 : club.tactics.tempo === 'lento' ? -1.5 : 0;
  const starterIndexMap: Record<string, number> = {};
  club.starterIds.forEach((id, idx) => {
    starterIndexMap[id] = idx;
  });
  const starterSet = new Set(club.starterIds);
  const benchList = club.benchIds.map((id) => state.players[id]).filter(Boolean);

  const allClubPlayers = getClubPlayers(club.id, state.players);
  const maxApps = allClubPlayers.reduce((m, p) => Math.max(m, p.stats.appearances), 0);

  const subbedInMinutes: Record<string, number> = {};
  const subbedOutMinutes: Record<string, number> = {};

  if (!customMinutes) {
    const scoreMargin = goalsScored - goalsConceded;
    const isCup = fixture.competitionType === 'CUP';
    const subWindows = isCup
      ? [55, 62, 68, 74, 80]
      : scoreMargin >= 2
        ? [58, 65, 72, 78, 83]
        : [62, 70, 77, 83];

    const fieldStarters = club.starterIds
      .map((id) => state.players[id])
      .filter((p) => p && p.position !== 'GOL')
      .sort((a, b) => {
        const protectKey = (p: Player) =>
          scoreMargin >= 2 && (p.role === 'importantissimo' || p.role === 'titular') ? -10 : 0;
        const keepScorer = (p: Player) => (p.stats.goals >= 3 && p.fitness >= 66 ? 12 : 0);
        return (a.fitness + protectKey(a) + keepScorer(a)) - (b.fitness + protectKey(b) + keepScorer(b));
      });

    const candidateSubs = benchList
      .filter((p) => p.position !== 'GOL' && !p.injury)
      .sort((a, b) => {
        const subPriority = (p: Player) => {
          let score = p.overall;
          if (p.role === 'promessa') score += isCup ? 11 : 7;
          else if (p.role === 'rotacao') score += isCup ? 9 : 6;
          else if (p.role === 'titular') score += 3;

          if (p.form === 'otima') score += 5;
          else if (p.form === 'boa') score += 2.5;
          if (getPlayerAvgRating(p) >= 7.1) score += 3;
          if (p.stats.goals >= 2) score += 2.5;

          if (maxApps >= 3) {
            const actualShare = p.stats.minutes / Math.max(180, maxApps * 90);
            const deficit = ROLE_TARGET_SHARE[p.role] - actualShare;
            score += Math.max(-4, Math.min(8, deficit * 15));
          }
          return score;
        };
        return subPriority(b) - subPriority(a);
      });

    const numSubs = Math.min(subWindows.length, fieldStarters.length, candidateSubs.length);
    for (let i = 0; i < numSubs; i++) {
      const outP = fieldStarters[i];
      const inP = candidateSubs[i];
      const subMinute = subWindows[i];
      subbedOutMinutes[outP.id] = subMinute;
      subbedInMinutes[inP.id] = Math.max(7, 90 - subMinute);
    }
  }

  const healthyCount = allClubPlayers.filter((p) => !p.injury).length;
  let injuriesThisMatch = 0;
  if (!fixture.playerRatings) fixture.playerRatings = {};

  for (const p of allClubPlayers) {
    let mins = 0;
    if (customMinutes) {
      mins = customMinutes[p.id] || 0;
    } else if (starterSet.has(p.id)) {
      mins = subbedOutMinutes[p.id] ?? 90;
    } else if (subbedInMinutes[p.id]) {
      mins = subbedInMinutes[p.id];
    }

    if (mins > 0) {
      p.stats.appearances += 1;
      p.stats.minutes += mins;
      const ageFatigue = p.age >= 32 ? 3 : p.age <= 21 ? -1 : 0;
      const rawDrain = (mins / 90) * (14 + pressDrain + tempoDrain + ageFatigue + Math.random() * 4);
      const drain = Math.round(rawDrain * tacticalAnalysis.fatigueMult * getPlayerStaminaDrainMult(p));
      p.fitness = Math.max(25, p.fitness - drain);

      const pGoals = goalCounts[p.id] || 0;
      const pAssists = assistCounts[p.id] || 0;
      const sIdx = starterIndexMap[p.id];
      const slot = sIdx !== undefined ? activeSlots[sIdx] : undefined;
      const slotInfo = slot ? getSlotTacticalInfo(slot, sIdx) : null;
      const isDefensive = slotInfo
        ? slotInfo.isGK || slotInfo.isCenterBack || slotInfo.isDeepFullback || slotInfo.isDeepAnchor
        : p.position === 'GOL' || p.position === 'ZAG' || p.position === 'LE' || p.position === 'LD';
      const isWingback = Boolean(slotInfo?.isWingback);
      const cleanSheetBonus = goalsConceded === 0 ? (isDefensive ? 0.55 : isWingback ? 0.35 : 0) : 0;
      const concededPenalty =
        goalsConceded >= 3 ? (isDefensive ? -0.22 * (goalsConceded - 2) : isWingback ? -0.15 * (goalsConceded - 2) : 0) : 0;
      const wingbackCreateBonus = isWingback && pAssists > 0 ? 0.15 : 0;
      const formBump = p.form === 'otima' ? 0.22 : p.form === 'boa' ? 0.1 : p.form === 'ma' ? -0.15 : 0;

      const rawRating =
        6.45 +
        (goalsScored - goalsConceded) * 0.26 +
        (p.overall - 73) * 0.018 +
        pGoals * 0.92 +
        pAssists * 0.52 +
        cleanSheetBonus +
        concededPenalty +
        wingbackCreateBonus +
        formBump +
        (Math.random() - 0.46) * 1.1;

      const rating = Number(Math.max(4.5, Math.min(10.0, rawRating)).toFixed(1));
      fixture.playerRatings[p.id] = rating;
      p.lastRating = rating;
      if (!p.recentRatings) p.recentRatings = [];
      p.recentRatings = [...p.recentRatings, rating].slice(-5);
      p.stats.ratingSum += rating;
      p.stats.ratingCount += 1;

      if (goalsConceded === 0 && mins >= 60 && isDefensive) {
        p.stats.cleanSheets = (p.stats.cleanSheets || 0) + 1;
      }
      if (rating >= 8.2) {
        p.stats.motm = (p.stats.motm || 0) + 1;
      }
      if (p.position !== 'GOL') {
        if (Math.random() < (p.role === 'importantissimo' || isDefensive ? 0.055 : 0.038)) {
          p.stats.yellowCards += 1;
        }
        if (Math.random() < 0.003) {
          p.stats.redCards += 1;
        }
      }

      updatePlayerFormPhase(p, fixture.round, state, pGoals);

      // Balanced injury check (max 1 injury per club per match, keep at least 14 healthy)
      if (!p.injury && injuriesThisMatch === 0 && healthyCount > 14) {
        let injChance = 0.0075;
        if (p.fitness < 62) injChance += 0.006;
        if (club.tactics.pressing === 'alta') injChance += 0.003;
        if (p.age >= 32) injChance += 0.003;

        if (Math.random() < injChance) {
          const inj = rollBalancedInjury();
          p.injury = inj;
          injuriesThisMatch++;
          if (fixture.events) {
            fixture.events.push({
              minute: Math.floor(Math.random() * 75) + 10,
              type: 'INJURY',
              clubId: club.id,
              playerId: p.id,
              playerName: p.name,
              description: `Lesão: ${p.name} sofreu ${inj.type} (${inj.roundsRemaining} rod.).`,
            });
          }
          if (club.id === state.userClubId || p.overall >= 80) {
            state.newsFeed.unshift({
              id: `news_inj_${p.id}_${fixture.round}_${Date.now()}`,
              round: fixture.round,
              title: `Departamento Médico: ${p.name} lesionado`,
              detail: `${p.name} (${club.name}) sofreu ${inj.type} e ficará fora por ${inj.roundsRemaining} rodada(s).`,
              type: 'injury',
            });
          }
        }
      }
    } else if (!p.injury) {
      p.fitness = Math.min(100, p.fitness + 14);
    }
  }

  // If any starter got injured, auto-replace from healthy squad immediately
  if (injuriesThisMatch > 0) {
    const slots = getActiveSlots(club.tactics, state.customFormations);
    const picked = autoPickLineup(allClubPlayers, slots);
    club.starterIds = picked.starterIds;
    club.benchIds = picked.benchIds;
  }
}

export interface LiveMatchOverride {
  homeGoals: number;
  awayGoals: number;
  events: MatchEvent[];
  stats: MatchStats;
  minutesPlayed: Record<string, number>;
  penaltiesWinnerId?: string;
}

export function simulateFixtureInPlace(
  fixture: Fixture,
  state: GameState,
  override?: LiveMatchOverride
): void {
  if (fixture.played) return;
  const home = state.clubs[fixture.homeClubId];
  const away = state.clubs[fixture.awayClubId];
  if (!home || !away) return;

  const importance =
    fixture.competitionType === 'CHAMPIONS_LEAGUE' || fixture.competitionType === 'EUROPA_LEAGUE'
      ? 'ucl'
      : fixture.competitionType === 'CUP'
        ? 'cup'
        : 'league';

  ensureClubHasHealthyLineup(home, state, importance, Boolean(override));
  ensureClubHasHealthyLineup(away, state, importance, Boolean(override));

  const hPow = evaluateClubMatchPower(home, state.players, state.customFormations);
  const aPow = evaluateClubMatchPower(away, state.players, state.customFormations);

  if (override) {
    fixture.homeGoals = override.homeGoals;
    fixture.awayGoals = override.awayGoals;
    fixture.events = [...override.events];
    fixture.stats = override.stats;
    fixture.penaltiesWinnerId = override.penaltiesWinnerId;
    fixture.played = true;

    const goalCounts: Record<string, number> = {};
    const assistCounts: Record<string, number> = {};

    for (const ev of override.events) {
      if (ev.type === 'GOAL' && ev.playerId && state.players[ev.playerId]) {
        state.players[ev.playerId].stats.goals += 1;
        goalCounts[ev.playerId] = (goalCounts[ev.playerId] || 0) + 1;
      }
      if (ev.assistPlayerId && state.players[ev.assistPlayerId]) {
        state.players[ev.assistPlayerId].stats.assists += 1;
        assistCounts[ev.assistPlayerId] = (assistCounts[ev.assistPlayerId] || 0) + 1;
      }
      if (ev.type === 'YELLOW' && ev.playerId && state.players[ev.playerId]) {
        state.players[ev.playerId].stats.yellowCards += 1;
      }
    }

    applyMatchPerformanceAndInjuries(home, override.homeGoals, override.awayGoals, fixture, state, goalCounts, assistCounts, override.minutesPlayed);
    applyMatchPerformanceAndInjuries(away, override.awayGoals, override.homeGoals, fixture, state, goalCounts, assistCounts, override.minutesPlayed);

    if (fixture.homeClubId === state.userClubId) {
      processHomeMatchAttendanceAndGate(fixture, state);
    }
    if (
      (fixture.competitionType === 'CHAMPIONS_LEAGUE' || fixture.competitionType === 'EUROPA_LEAGUE') &&
      fixture.groupId
    ) {
      awardUclGroupMatchPrizes(fixture, state);
    }
    return;
  }

  const homeSlots = getActiveSlots(home.tactics, state.customFormations);
  const awaySlots = getActiveSlots(away.tactics, state.customFormations);
  const matchup = computeTacticalMatchup(home, away, homeSlots, awaySlots, state.players);
  const homeAttrMods = computeClubMatchAttrModifiers(home, state.players, homeSlots);
  const awayAttrMods = computeClubMatchAttrModifiers(away, state.players, awaySlots);

  const homeEffOverall =
    hPow.overall + matchup.homeAttackBonus - matchup.homeDefensePenalty + homeAttrMods.attackEdge * 0.55 - awayAttrMods.defenseEdge * 0.35 - awayAttrMods.gkEdge * 0.35;
  const awayEffOverall =
    aPow.overall + matchup.awayAttackBonus - matchup.awayDefensePenalty + awayAttrMods.attackEdge * 0.55 - homeAttrMods.defenseEdge * 0.35 - homeAttrMods.gkEdge * 0.35;

  const diff = homeEffOverall + 2.5 - awayEffOverall; // home advantage + tactical & attribute edge
  const homeExpected = Math.max(0.32, 1.29 + diff * 0.064 + matchup.homeXGBoost + homeAttrMods.xgLongShotBonus);
  const awayExpected = Math.max(0.28, 1.11 - diff * 0.054 + matchup.awayXGBoost + awayAttrMods.xgLongShotBonus);

  const homeGoals = poissonRandom(homeExpected);
  const awayGoals = poissonRandom(awayExpected);

  const events: MatchEvent[] = [];
  const goalCounts: Record<string, number> = {};
  const assistCounts: Record<string, number> = {};

  for (let i = 0; i < homeGoals; i++) {
    const scorer = pickTacticalScorer(home.starterIds, homeSlots, state.players);
    const assister =
      Math.random() < 0.74
        ? pickTacticalAssister(home.starterIds, homeSlots, state.players, scorer?.id)
        : undefined;
    const min = Math.floor(Math.random() * 89) + 1;
    const scorerIdx = scorer ? home.starterIds.indexOf(scorer.id) : -1;
    const assisterIdx = assister ? home.starterIds.indexOf(assister.id) : -1;
    const shotDetail = generateGoalShotDetail({
      scorer,
      assister,
      scorerSlot: scorerIdx >= 0 ? homeSlots[scorerIdx] : undefined,
      assisterSlot: assisterIdx >= 0 ? homeSlots[assisterIdx] : undefined,
    });
    const suffix = describeShotSuffix(shotDetail);

    if (scorer) {
      scorer.stats.goals += 1;
      if (shotDetail.isOutsideBox) {
        scorer.stats.outsideBoxGoals = (scorer.stats.outsideBoxGoals || 0) + 1;
      }
      goalCounts[scorer.id] = (goalCounts[scorer.id] || 0) + 1;
    }
    if (assister) {
      assister.stats.assists += 1;
      assistCounts[assister.id] = (assistCounts[assister.id] || 0) + 1;
    }
    events.push({
      minute: min,
      type: 'GOAL',
      clubId: home.id,
      playerId: scorer?.id,
      playerName: scorer?.name,
      assistPlayerId: assister?.id,
      assistPlayerName: assister?.name,
      description: `Gol de ${scorer?.name || home.shortName}${suffix}${assister ? ` (assist. ${assister.name})` : ''}`,
      shotDetail,
    });
  }

  for (let i = 0; i < awayGoals; i++) {
    const scorer = pickTacticalScorer(away.starterIds, awaySlots, state.players);
    const assister =
      Math.random() < 0.74
        ? pickTacticalAssister(away.starterIds, awaySlots, state.players, scorer?.id)
        : undefined;
    const min = Math.floor(Math.random() * 89) + 1;
    const scorerIdx = scorer ? away.starterIds.indexOf(scorer.id) : -1;
    const assisterIdx = assister ? away.starterIds.indexOf(assister.id) : -1;
    const shotDetail = generateGoalShotDetail({
      scorer,
      assister,
      scorerSlot: scorerIdx >= 0 ? awaySlots[scorerIdx] : undefined,
      assisterSlot: assisterIdx >= 0 ? awaySlots[assisterIdx] : undefined,
    });
    const suffix = describeShotSuffix(shotDetail);

    if (scorer) {
      scorer.stats.goals += 1;
      if (shotDetail.isOutsideBox) {
        scorer.stats.outsideBoxGoals = (scorer.stats.outsideBoxGoals || 0) + 1;
      }
      goalCounts[scorer.id] = (goalCounts[scorer.id] || 0) + 1;
    }
    if (assister) {
      assister.stats.assists += 1;
      assistCounts[assister.id] = (assistCounts[assister.id] || 0) + 1;
    }
    events.push({
      minute: min,
      type: 'GOAL',
      clubId: away.id,
      playerId: scorer?.id,
      playerName: scorer?.name,
      assistPlayerId: assister?.id,
      assistPlayerName: assister?.name,
      description: `Gol de ${scorer?.name || away.shortName}${suffix}${assister ? ` (assist. ${assister.name})` : ''}`,
      shotDetail,
    });
  }

  const homePoss = Math.max(
    26,
    Math.min(74, Math.round(50 + (hPow.midfield - aPow.midfield) * 1.35 + matchup.homePossessionBonus))
  );
  const homeShots = Math.max(
    homeGoals + 2,
    Math.round((homeExpected * 5.0 + Math.random() * 3.8) * matchup.homeShotsMult)
  );
  const awayShots = Math.max(
    awayGoals + 2,
    Math.round((awayExpected * 4.8 + Math.random() * 3.8) * matchup.awayShotsMult)
  );

  const homeOnTargetRatio = Math.min(0.6, 0.4 + matchup.homeOnTargetAdj);
  const awayOnTargetRatio = Math.min(0.6, 0.4 + matchup.awayOnTargetAdj);

  fixture.homeGoals = homeGoals;
  fixture.awayGoals = awayGoals;
  fixture.events = events;
  fixture.stats = {
    homePossession: homePoss,
    awayPossession: 100 - homePoss,
    homeShots,
    awayShots,
    homeShotsOnTarget: Math.max(homeGoals, Math.round(homeShots * homeOnTargetRatio)),
    awayShotsOnTarget: Math.max(awayGoals, Math.round(awayShots * awayOnTargetRatio)),
    homeXG: Number((homeExpected * 0.92 + homeGoals * 0.15 + matchup.homeXGBoost * 0.3).toFixed(2)),
    awayXG: Number((awayExpected * 0.92 + awayGoals * 0.15 + matchup.awayXGBoost * 0.3).toFixed(2)),
    homeBigChances: Math.max(homeGoals, Math.round(homeExpected * 1.1 + matchup.homeBigChancesBonus)),
    awayBigChances: Math.max(awayGoals, Math.round(awayExpected * 1.1 + matchup.awayBigChancesBonus)),
    tacticalNote: matchup.summaryNote || undefined,
  };

  const isKnockout =
    fixture.competitionType === 'CUP' ||
    ((fixture.competitionType === 'CHAMPIONS_LEAGUE' || fixture.competitionType === 'EUROPA_LEAGUE') &&
      !fixture.groupId);

  if (isKnockout && homeGoals === awayGoals) {
    const winHome = Math.random() < 0.5 + (hPow.overall - aPow.overall) * 0.015;
    fixture.penaltiesWinnerId = winHome ? home.id : away.id;
  }

  fixture.played = true;

  if (fixture.homeClubId === state.userClubId) {
    processHomeMatchAttendanceAndGate(fixture, state);
  }
  if (
    (fixture.competitionType === 'CHAMPIONS_LEAGUE' || fixture.competitionType === 'EUROPA_LEAGUE') &&
    fixture.groupId
  ) {
    awardUclGroupMatchPrizes(fixture, state);
  }

  applyMatchPerformanceAndInjuries(home, homeGoals, awayGoals, fixture, state, goalCounts, assistCounts);
  applyMatchPerformanceAndInjuries(away, awayGoals, homeGoals, fixture, state, goalCounts, assistCounts);

  events.sort((a, b) => a.minute - b.minute);

  // Check for Zebra (Upset) news
  const homeWon = homeGoals > awayGoals || fixture.penaltiesWinnerId === home.id;
  const awayWon = awayGoals > homeGoals || fixture.penaltiesWinnerId === away.id;
  if (homeWon && aPow.overall - hPow.overall >= 5.5 && Math.random() < 0.45) {
    state.newsFeed.unshift({
      id: `news_upset_${fixture.id}`,
      round: fixture.round,
      title: `Zebra na ${fixture.competitionName}: ${home.name} derruba ${away.name}!`,
      detail: `Mesmo como azarão, ${home.name} venceu por ${homeGoals} x ${awayGoals}${fixture.penaltiesWinnerId ? ' nos pênaltis' : ''}.`,
      type: 'upset',
    });
  } else if (awayWon && hPow.overall - aPow.overall >= 5.0 && Math.random() < 0.5) {
    state.newsFeed.unshift({
      id: `news_upset_${fixture.id}`,
      round: fixture.round,
      title: `Zebra histórica: ${away.name} vence ${home.name} fora!`,
      detail: `Pela ${fixture.competitionName}, ${away.name} surpreendeu o favorito por ${awayGoals} x ${homeGoals}.`,
      type: 'upset',
    });
  }
}

export function recoverBetweenRoundsFitness(state: GameState): void {
  for (const p of Object.values(state.players)) {
    if (p.injury) {
      p.injury.roundsRemaining -= 1;
      if (p.injury.roundsRemaining <= 0) {
        p.injury = null;
        p.fitness = Math.max(p.fitness, 84);
      }
    } else {
      p.fitness = Math.min(100, p.fitness + 10);
    }
  }
}

export function applyGlobalPotentialProgression(state: GameState): {
  topGrowthPlayers: { playerId: string; name: string; clubId: string; fromOvr: number; toOvr: number }[];
} {
  const risers: { playerId: string; name: string; clubId: string; fromOvr: number; toOvr: number; delta: number }[] = [];

  for (const p of Object.values(state.players)) {
    const prevOvr = p.overall;
    const avgRating = p.stats.ratingCount > 0 ? p.stats.ratingSum / p.stats.ratingCount : 6.5;
    const mins = p.stats.minutes;

    let delta = 0;

    if (p.age <= 23 && p.overall < p.potential) {
      const gap = p.potential - p.overall;
      const playFactor = Math.min(1.45, mins / 1350);
      const perfFactor = avgRating >= 7.2 ? 1.3 : avgRating >= 6.8 ? 1.05 : 0.65;
      const formBonus = p.form === 'otima' ? 1.2 : p.form === 'boa' ? 1.1 : 1.0;
      const roleFactor = p.role === 'promessa' && mins >= 500 ? 1.15 : 1.0;
      const growth = Math.round(Math.min(gap, (1 + gap * 0.28) * playFactor * perfFactor * formBonus * roleFactor));
      delta = Math.max(mins >= 450 ? 1 : 0, Math.min(5, growth));
    } else if (p.age >= 24 && p.age <= 27 && p.overall < p.potential) {
      if (mins >= 1100 && avgRating >= 6.95) delta = Math.min(p.potential - p.overall, 2);
      else if (mins >= 750) delta = Math.min(p.potential - p.overall, 1);
    } else if (p.age >= 32) {
      const declineChance = (p.age - 31) * 0.25 + (mins < 500 ? 0.25 : 0);
      if (Math.random() < declineChance) {
        delta = p.age >= 35 ? -2 : -1;
      }
    }

    if (delta !== 0) {
      p.overall = Math.max(52, Math.min(97, p.overall + delta));
      p.stats.ovrDelta += delta;
      const base = Math.pow(Math.max(1, p.overall - 52), 2.85) * 1800;
      const ageFactor = p.age <= 21 ? 1.45 : p.age <= 25 ? 1.25 : p.age <= 28 ? 1.0 : p.age <= 31 ? 0.65 : 0.35;
      const potBonus = Math.max(0, p.potential - p.overall) * 750000;
      p.value = Math.max(250000, Math.round((base * ageFactor + potBonus) / 50000) * 50000);
      if (delta > 0) {
        risers.push({ playerId: p.id, name: p.name, clubId: p.clubId, fromOvr: prevOvr, toOvr: p.overall, delta });
      }
    }
  }

  risers.sort((a, b) => b.delta - a.delta || b.toOvr - a.toOvr);
  return {
    topGrowthPlayers: risers.slice(0, 12).map(({ playerId, name, clubId, fromOvr, toOvr }) => ({
      playerId,
      name,
      clubId,
      fromOvr,
      toOvr,
    })),
  };
}

export function generateIncomingOffersForListed(state: GameState): void {
  if (state.gameMode === 'DRAFT' || state.phase === 'FINAL_TEMPORADA') return;

  const userClub = state.clubs[state.userClubId];
  const userLeague = userClub ? state.leagues[userClub.leagueId] : undefined;
  const round = userLeague?.currentRound || 1;

  const listed = Object.values(state.players).filter(
    (p) => p.clubId === state.userClubId && !p.loan && (p.transferListed || p.loanListed)
  );

  for (const p of listed) {
    const alreadyPending = state.offers.some(
      (o) => o.playerId === p.id && o.status === 'PENDING'
    );
    if (alreadyPending) continue;
    if (Math.random() > 0.68) continue;

    if (p.loanListed && (!p.transferListed || Math.random() < 0.65)) {
      const loanFee = Math.max(100_000, Math.round((p.value * 0.085) / 50_000) * 50_000);
      const buyOptionPrice = Math.max(300_000, Math.round((p.value * 1.05) / 50_000) * 50_000);
      const borrowers = Object.values(state.clubs).filter(
        (c) => c.id !== state.userClubId && c.budget >= loanFee
      );
      if (borrowers.length === 0) continue;

      const borrower = borrowers[Math.floor(Math.random() * borrowers.length)];
      const includeBuyOption = Math.random() < 0.5;

      const offer: TransferOffer = {
        id: `off_loan_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        playerId: p.id,
        fromClubId: borrower.id,
        toClubId: state.userClubId,
        amount: loanFee,
        type: 'LOAN',
        buyOptionPrice: includeBuyOption ? buyOptionPrice : undefined,
        status: 'PENDING',
        createdRound: round,
      };
      state.offers.unshift(offer);
      state.newsFeed.unshift({
        id: `news_off_${offer.id}`,
        round,
        title: `Proposta de empréstimo por ${p.name}`,
        detail: `${borrower.name} oferece € ${(loanFee / 1_000_000).toFixed(2)}M pelo empréstimo de ${p.name}${includeBuyOption ? ` (opção € ${(buyOptionPrice / 1_000_000).toFixed(1)}M)` : ''}.`,
        type: 'transfer',
      });
      continue;
    }

    const buyers = Object.values(state.clubs).filter(
      (c) => c.id !== state.userClubId && c.budget >= (p.askingPrice || p.value) * 0.8
    );
    if (buyers.length === 0) continue;

    const buyer = buyers[Math.floor(Math.random() * buyers.length)];
    const target = p.askingPrice || p.value;
    const multiplier = p.form === 'otima' ? 1.05 + Math.random() * 0.25 : 0.85 + Math.random() * 0.25;
    const amount = Math.max(200000, Math.round((target * multiplier) / 50000) * 50000);

    const offer: TransferOffer = {
      id: `off_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      playerId: p.id,
      fromClubId: buyer.id,
      toClubId: state.userClubId,
      amount,
      type: 'TRANSFER',
      status: 'PENDING',
      createdRound: round,
    };
    state.offers.unshift(offer);
    state.newsFeed.unshift({
      id: `news_off_${offer.id}`,
      round,
      title: `Proposta recebida por ${p.name}`,
      detail: `${buyer.name} ofereceu € ${(amount / 1_000_000).toFixed(1)}M por ${p.name}.`,
      type: 'transfer',
    });
  }
}

export function cloneState(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state)) as GameState;
}

export function getFixtureCalendarRound(f: Fixture, state: GameState): number {
  if (f.competitionType === 'LEAGUE') return f.round;
  if (typeof f.calendarRound === 'number' && f.calendarRound > 0) return f.calendarRound;

  const userClub = state.clubs[state.userClubId];
  const totalLeagueRounds = (userClub && state.leagues[userClub.leagueId]?.totalRounds) || 38;

  if (f.competitionType === 'CHAMPIONS_LEAGUE' || f.competitionType === 'EUROPA_LEAGUE') {
    if (f.groupId) return getUclGroupCalendarRound(f.round, totalLeagueRounds);
    return getUclKnockoutCalendarRound(Math.max(0, f.round - 1), totalLeagueRounds);
  }

  const cup = state.cups[f.competitionId];
  const clubCount = cup
    ? Object.values(state.clubs).filter((c) => cup.leagueIds.includes(c.leagueId)).length
    : 20;
  return getCupCalendarRound(
    Math.max(0, f.round - 1),
    getTotalCupRoundsForClubCount(clubCount),
    totalLeagueRounds
  );
}

export function findNextCupOrUclFixture(
  state: GameState
): { fixture: Fixture; calendarRound: number } | null {
  const candidates = Object.values(state.fixtures)
    .filter(
      (f) =>
        !f.played &&
        (f.competitionType === 'CUP' ||
          f.competitionType === 'CHAMPIONS_LEAGUE' ||
          f.competitionType === 'EUROPA_LEAGUE') &&
        (f.homeClubId === state.userClubId || f.awayClubId === state.userClubId)
    )
    .map((fixture) => ({
      fixture,
      calendarRound: getFixtureCalendarRound(fixture, state),
    }))
    .sort((a, b) => {
      if (a.calendarRound !== b.calendarRound) return a.calendarRound - b.calendarRound;
      if (a.fixture.competitionType !== b.fixture.competitionType) {
        if (a.fixture.competitionType === 'CHAMPIONS_LEAGUE') return -1;
        if (b.fixture.competitionType === 'CHAMPIONS_LEAGUE') return 1;
        if (a.fixture.competitionType === 'EUROPA_LEAGUE') return -1;
        return 1;
      }
      return a.fixture.round - b.fixture.round;
    });

  return candidates[0] || null;
}

export function hasActiveCupOrUclForUser(state: GameState): boolean {
  if (findNextCupOrUclFixture(state)) return true;
  for (const cup of Object.values(state.cups)) {
    if (!cup.championClubId && cup.byeClubIds?.includes(state.userClubId)) {
      return true;
    }
  }
  return false;
}

function advanceKnockoutRoundInPlace(
  state: GameState,
  kind: 'CUP' | 'CHAMPIONS_LEAGUE' | 'EUROPA_LEAGUE',
  comp: CupTournament | ChampionsLeagueState
): void {
  if (comp.championClubId) return;
  const round = comp.rounds[comp.currentRoundIndex];
  if (!round) return;

  for (const fid of round.fixtureIds) {
    const fix = state.fixtures[fid];
    if (fix && !fix.played) {
      simulateFixtureInPlace(fix, state);
    }
  }

  const allPlayed = round.fixtureIds.every((fid) => state.fixtures[fid]?.played);
  if (!allPlayed) return;

  const winners: string[] = [];
  const losers: string[] = [];
  for (const fid of round.fixtureIds) {
    const f = state.fixtures[fid];
    if (!f || f.homeGoals === null || f.awayGoals === null) continue;
    let w: string;
    if (f.homeGoals > f.awayGoals) w = f.homeClubId;
    else if (f.awayGoals > f.homeGoals) w = f.awayClubId;
    else w = f.penaltiesWinnerId || f.homeClubId;
    winners.push(w);
    losers.push(w === f.homeClubId ? f.awayClubId : f.homeClubId);
  }

  const cupObj = comp as CupTournament;
  if (comp.currentRoundIndex === 0 && cupObj.byeClubIds?.length) {
    winners.push(...cupObj.byeClubIds);
    cupObj.byeClubIds = [];
  }

  const userClub = state.clubs[state.userClubId];
  const userTotalRounds = (userClub && state.leagues[userClub.leagueId]?.totalRounds) || 38;

  if (winners.length === 1) {
    comp.championClubId = winners[0];
    if (kind === 'CHAMPIONS_LEAGUE' || kind === 'EUROPA_LEAGUE') {
      (comp as ChampionsLeagueState).stage = 'CONCLUIDA';
    }
    const runnerUpId = losers[0] || null;
    awardKnockoutProgressionPrizes(
      kind,
      comp.name,
      round.name,
      comp.currentRoundIndex,
      winners,
      runnerUpId,
      winners[0],
      state
    );
    if (winners[0] === state.userClubId) {
      const finalFixId = round.fixtureIds[0];
      const finalFix = finalFixId ? state.fixtures[finalFixId] : undefined;
      const summary =
        finalFix && finalFix.homeGoals !== null && finalFix.awayGoals !== null
          ? `Final: ${state.clubs[finalFix.homeClubId]?.shortName || ''} ${finalFix.homeGoals} × ${finalFix.awayGoals} ${state.clubs[finalFix.awayClubId]?.shortName || ''}`
          : `Título conquistado na temporada ${state.season}`;
      enqueueUserTrophyCelebration(
        state,
        kind,
        comp.name,
        summary
      );
    }
    const champName = state.clubs[winners[0]]?.name || winners[0];
    state.newsFeed.unshift({
      id: `news_champ_${comp.id}_${Date.now()}`,
      round: userClub ? state.leagues[userClub.leagueId]?.currentRound || 0 : 0,
      title: `${champName} campeão da ${comp.name}!`,
      detail: `Conquista confirmada após campanha emocionante no mata-mata.`,
      type: 'award',
    });
  } else if (winners.length >= 2) {
    awardKnockoutProgressionPrizes(
      kind,
      comp.name,
      round.name,
      comp.currentRoundIndex,
      winners,
      null,
      null,
      state
    );
    const nextIdx = comp.currentRoundIndex + 1;
    let calRound: number;
    if (kind === 'CHAMPIONS_LEAGUE' || kind === 'EUROPA_LEAGUE') {
      calRound = getUclKnockoutCalendarRound(nextIdx, userTotalRounds);
    } else {
      const clubCount = Object.values(state.clubs).filter((c) =>
        cupObj.leagueIds.includes(c.leagueId)
      ).length;
      calRound = getCupCalendarRound(nextIdx, getTotalCupRoundsForClubCount(clubCount), userTotalRounds);
    }
    const nextRound = buildInitialKnockoutRound(comp.id, comp.name, kind, winners, nextIdx, calRound);
    for (const nf of nextRound.fixtures) {
      state.fixtures[nf.id] = nf;
    }
    if (nextRound.byeClubIds.length > 0) {
      cupObj.byeClubIds = nextRound.byeClubIds;
    }
    comp.rounds.push({
      roundIndex: nextIdx,
      name: nextRound.roundName,
      fixtureIds: nextRound.fixtures.map((f) => f.id),
    });
    comp.currentRoundIndex = nextIdx;
  }
}

export function advanceContinentalGroupMatchdayInPlace(
  state: GameState,
  compType: 'CHAMPIONS_LEAGUE' | 'EUROPA_LEAGUE' = 'CHAMPIONS_LEAGUE',
  specificRound?: number
): void {
  const comp = compType === 'EUROPA_LEAGUE' ? state.europaLeague : state.championsLeague;
  if (!comp || comp.stage !== 'GRUPOS') return;

  const roundNum = specificRound ?? comp.groupRound;
  for (const group of comp.groups) {
    for (const fid of group.fixtureIds) {
      const f = state.fixtures[fid];
      if (f && f.round === roundNum && !f.played) {
        simulateFixtureInPlace(f, state);
      }
    }
  }

  if (roundNum !== comp.groupRound) return;

  const allCurrentRoundPlayed = comp.groups.every((g) =>
    g.fixtureIds
      .map((id) => state.fixtures[id])
      .filter((f) => f && f.round === roundNum)
      .every((f) => f.played)
  );
  if (!allCurrentRoundPlayed) return;

  if (comp.groupRound < 6) {
    comp.groupRound += 1;
    return;
  }

  const firstPlaces: string[] = [];
  const secondPlaces: string[] = [];
  for (const group of comp.groups) {
    const tbl = computeChampionsGroupTable(group.id, state, compType);
    if (tbl[0]) firstPlaces.push(tbl[0].clubId);
    if (tbl[1]) secondPlaces.push(tbl[1].clubId);
  }

  const userClub = state.clubs[state.userClubId];
  const userTotalRounds = (userClub && state.leagues[userClub.leagueId]?.totalRounds) || 38;
  const r16CalRound = getUclKnockoutCalendarRound(0, userTotalRounds);
  const idPrefix = compType === 'EUROPA_LEAGUE' ? 'uel' : 'ucl';

  const r16Fixtures: Fixture[] = [];
  for (let i = 0; i < firstPlaces.length; i++) {
    const pairIdx = i % 2 === 0 ? Math.min(secondPlaces.length - 1, i + 1) : i - 1;
    const away = firstPlaces[i];
    const home = secondPlaces[pairIdx] || secondPlaces[i];
    if (!home || !away) continue;
    const fix: Fixture = {
      id: `ko_${idPrefix}_r0_${i}_${away}_${home}`,
      competitionType: compType,
      competitionId: comp.id,
      competitionName: comp.name,
      round: 1,
      calendarRound: r16CalRound,
      roundLabel: 'Oitavas de Final',
      homeClubId: away,
      awayClubId: home,
      played: false,
      homeGoals: null,
      awayGoals: null,
    };
    state.fixtures[fix.id] = fix;
    r16Fixtures.push(fix);
  }

  comp.stage = 'MATA_MATA';
  comp.currentRoundIndex = 0;
  comp.rounds = [
    {
      roundIndex: 0,
      name: 'Oitavas de Final',
      fixtureIds: r16Fixtures.map((f) => f.id),
    },
  ];
  awardUclGroupQualificationPrizes([...firstPlaces, ...secondPlaces], state, compType);

  state.newsFeed.unshift({
    id: `news_${idPrefix}_ko_${Date.now()}`,
    round: userClub ? state.leagues[userClub.leagueId]?.currentRound || 0 : 0,
    title: `${comp.name}: Oitavas de Final definidas!`,
    detail: `Fase de grupos encerrada com os 16 classificados para o mata-mata continental.`,
    type: 'award',
  });
}

export function advanceChampionsGroupMatchdayInPlace(
  state: GameState,
  specificRound?: number
): void {
  advanceContinentalGroupMatchdayInPlace(state, 'CHAMPIONS_LEAGUE', specificRound);
}

function buildPhaseReport(
  state: GameState,
  phaseCompleted: GameState['phase'],
  newlyPlayedIds: string[],
  npcTransferCount: number
): PhaseReport {
  const userFixtures = newlyPlayedIds
    .map((id) => state.fixtures[id])
    .filter((f) => f && (f.homeClubId === state.userClubId || f.awayClubId === state.userClubId))
    .sort((a, b) => a.round - b.round);

  const highlightFixtures = newlyPlayedIds
    .map((id) => state.fixtures[id])
    .filter(
      (f) =>
        f &&
        f.homeClubId !== state.userClubId &&
        f.awayClubId !== state.userClubId &&
        (f.competitionType !== 'LEAGUE' ||
          Math.abs((f.homeGoals || 0) - (f.awayGoals || 0)) >= 3)
    )
    .slice(0, 12);

  const injuriesOccurred: PhaseReport['injuriesOccurred'] = [];
  for (const p of Object.values(state.players)) {
    if (p.injury && (p.clubId === state.userClubId || p.overall >= 81)) {
      injuriesOccurred.push({
        playerId: p.id,
        playerName: p.name,
        clubId: p.clubId,
        type: p.injury.type,
        rounds: p.injury.roundsRemaining,
      });
    }
  }

  const hotPlayers = Object.values(state.players)
    .filter((p) => p.form === 'otima' || p.form === 'boa')
    .sort((a, b) => {
      const fScore = (b.form === 'otima' ? 2 : 1) - (a.form === 'otima' ? 2 : 1);
      return fScore || getPlayerAvgRating(b) - getPlayerAvgRating(a) || b.overall - a.overall;
    })
    .slice(0, 8)
    .map((p) => ({
      playerId: p.id,
      playerName: p.name,
      clubId: p.clubId,
      form: p.form,
      avgRating: Number(getPlayerAvgRating(p).toFixed(1)),
    }));

  return {
    id: `rep_${phaseCompleted}_${Date.now()}`,
    phaseCompleted,
    title:
      phaseCompleted === 'MEIO_JANELA'
        ? `Meio da Temporada ${state.season} — Resumo & Placares`
        : `Final da Temporada ${state.season} — Balanço Completo`,
    subtitle:
      phaseCompleted === 'MEIO_JANELA'
        ? `Primeiro turno das ligas, Fase de Grupos da Champions e rodadas iniciais das Copas concluídas.`
        : `Todas as ligas, finais das Copas Locais, Champions League Beta e evoluções encerradas.`,
    userFixtureIds: userFixtures.map((f) => f.id),
    highlightFixtureIds: highlightFixtures.map((f) => f.id),
    npcTransferCount,
    injuriesOccurred: injuriesOccurred.slice(0, 10),
    hotPlayers,
  };
}

function advanceSingleRoundInPlace(state: GameState): number {
  const userClub = state.clubs[state.userClubId];
  const userLeague = state.leagues[userClub.leagueId];
  const roundBefore = userLeague.currentRound;
  const userTotalRounds = userLeague.totalRounds || 38;
  const halfRound = Math.floor(userTotalRounds / 2) + 1;

  if (state.phase === 'INICIO_JANELA' && !state.npcWindowDone?.inicio) {
    runGlobalNpcTransfers(state, 'INICIO', 24);
    state.npcWindowDone = { inicio: true, meio: state.npcWindowDone?.meio ?? false };
  }

  // 1. Simulate Champions League, Europa League & Cup rounds scheduled at or before roundBefore
  while (
    state.championsLeague.stage === 'GRUPOS' &&
    getUclGroupCalendarRound(state.championsLeague.groupRound, userTotalRounds) <= roundBefore
  ) {
    advanceContinentalGroupMatchdayInPlace(state, 'CHAMPIONS_LEAGUE');
  }

  if (
    state.championsLeague.stage === 'MATA_MATA' &&
    !state.championsLeague.championClubId &&
    getUclKnockoutCalendarRound(state.championsLeague.currentRoundIndex, userTotalRounds) <= roundBefore
  ) {
    advanceKnockoutRoundInPlace(state, 'CHAMPIONS_LEAGUE', state.championsLeague);
  }

  if (state.europaLeague) {
    while (
      state.europaLeague.stage === 'GRUPOS' &&
      getUclGroupCalendarRound(state.europaLeague.groupRound, userTotalRounds) <= roundBefore
    ) {
      advanceContinentalGroupMatchdayInPlace(state, 'EUROPA_LEAGUE');
    }

    if (
      state.europaLeague.stage === 'MATA_MATA' &&
      !state.europaLeague.championClubId &&
      getUclKnockoutCalendarRound(state.europaLeague.currentRoundIndex, userTotalRounds) <= roundBefore
    ) {
      advanceKnockoutRoundInPlace(state, 'EUROPA_LEAGUE', state.europaLeague);
    }
  }

  for (const cup of Object.values(state.cups)) {
    if (cup.championClubId) continue;
    const cupClubCount = Object.values(state.clubs).filter((c) =>
      cup.leagueIds.includes(c.leagueId)
    ).length;
    const totalCupRounds = getTotalCupRoundsForClubCount(cupClubCount);
    let guard = 0;
    while (
      !cup.championClubId &&
      guard < 3 &&
      getCupCalendarRound(cup.currentRoundIndex, totalCupRounds, userTotalRounds) <= roundBefore
    ) {
      advanceKnockoutRoundInPlace(state, 'CUP', cup);
      guard++;
    }
  }

  // 2. Simulate this round across all leagues
  for (const league of Object.values(state.leagues)) {
    if (league.currentRound <= league.totalRounds) {
      const roundFixtures = Object.values(state.fixtures).filter(
        (f) =>
          f.competitionType === 'LEAGUE' &&
          f.competitionId === league.id &&
          f.round === league.currentRound &&
          !f.played
      );
      for (const f of roundFixtures) {
        simulateFixtureInPlace(f, state);
      }
      league.currentRound += 1;
    }
  }

  recoverBetweenRoundsFitness(state);
  if (state.gameMode !== 'DRAFT') {
    generateIncomingOffersForListed(state);
  }

  if (roundBefore > 0 && roundBefore % 6 === 0) {
    processPeriodicShirtSales(state, roundBefore, 'Venda de Camisas (Desempenho)');
  }

  let npcMoves = 0;

  // 3. Check Mid-Season transition (ensuring UCL & UEL Group Stages & early Cups are complete for Oitavas draw!)
  if (state.phase === 'INICIO_JANELA' && userLeague.currentRound >= halfRound) {
    while (state.championsLeague.stage === 'GRUPOS') {
      advanceContinentalGroupMatchdayInPlace(state, 'CHAMPIONS_LEAGUE');
    }
    if (state.europaLeague) {
      while (state.europaLeague.stage === 'GRUPOS') {
        advanceContinentalGroupMatchdayInPlace(state, 'EUROPA_LEAGUE');
      }
    }
    for (const cup of Object.values(state.cups)) {
      const cupClubCount = Object.values(state.clubs).filter((c) =>
        cup.leagueIds.includes(c.leagueId)
      ).length;
      const totalCupRounds = getTotalCupRoundsForClubCount(cupClubCount);
      let guard = 0;
      while (
        !cup.championClubId &&
        guard < 4 &&
        getCupCalendarRound(cup.currentRoundIndex, totalCupRounds, userTotalRounds) < halfRound
      ) {
        advanceKnockoutRoundInPlace(state, 'CUP', cup);
        guard++;
      }
    }

    state.phase = 'MEIO_JANELA';
    applyMidSeasonBoardGrant(state);
    processPeriodicShirtSales(state, userLeague.currentRound, 'Camisas · Virada de Turno');
    evaluateDraftTableOverperformance(state, 'MID');
    if (!state.npcWindowDone?.meio) {
      npcMoves += runGlobalNpcTransfers(state, 'MEIO', 28);
      state.npcWindowDone = { inicio: true, meio: true };
    }
    state.newsFeed.unshift({
      id: `news_mid_${Date.now()}`,
      round: userLeague.currentRound,
      title: `Meio de Temporada & Janela Aberta`,
      detail: `Fases de grupos da Champions e Europa League concluídas, mata-matas sorteados, verba liberada e ${npcMoves} movimentações no mercado.`,
      type: 'info',
    });
  } else if (userLeague.currentRound > userLeague.totalRounds) {
    // 4. Finish any remaining rounds of longer leagues (e.g. Championship) + Cups, UCL & UEL Finals
    for (const league of Object.values(state.leagues)) {
      while (league.currentRound <= league.totalRounds) {
        const rem = Object.values(state.fixtures).filter(
          (f) =>
            f.competitionType === 'LEAGUE' &&
            f.competitionId === league.id &&
            f.round === league.currentRound &&
            !f.played
        );
        for (const f of rem) simulateFixtureInPlace(f, state);
        league.currentRound += 1;
      }
    }
    while (state.championsLeague.stage === 'GRUPOS') {
      advanceContinentalGroupMatchdayInPlace(state, 'CHAMPIONS_LEAGUE');
    }
    let uclGuard = 0;
    while (!state.championsLeague.championClubId && uclGuard < 8) {
      advanceKnockoutRoundInPlace(state, 'CHAMPIONS_LEAGUE', state.championsLeague);
      uclGuard++;
    }
    if (state.europaLeague) {
      while (state.europaLeague.stage === 'GRUPOS') {
        advanceContinentalGroupMatchdayInPlace(state, 'EUROPA_LEAGUE');
      }
      let uelGuard = 0;
      while (!state.europaLeague.championClubId && uelGuard < 8) {
        advanceKnockoutRoundInPlace(state, 'EUROPA_LEAGUE', state.europaLeague);
        uelGuard++;
      }
    }
    for (const cup of Object.values(state.cups)) {
      let cGuard = 0;
      while (!cup.championClubId && cGuard < 10) {
        advanceKnockoutRoundInPlace(state, 'CUP', cup);
        cGuard++;
      }
    }

    state.phase = 'FINAL_TEMPORADA';
    const growth = applyGlobalPotentialProgression(state);
    awardEndOfSeasonLeaguePrizes(state, computeLeagueTable);
    processPeriodicShirtSales(state, userLeague.totalRounds, 'Camisas · Fechamento de Temporada');
    const userFinalTable = computeLeagueTable(userLeague.id, state);
    if (userFinalTable[0]?.clubId === state.userClubId) {
      const champRow = userFinalTable[0];
      enqueueUserTrophyCelebration(
        state,
        'LEAGUE',
        userLeague.name,
        `${champRow.points} pts · ${champRow.won}V ${champRow.drawn}E ${champRow.lost}D`
      );
    }
    evaluateDraftTableOverperformance(state, 'END');
    state.newsFeed.unshift({
      id: `news_end_${Date.now()}`,
      round: userLeague.totalRounds,
      title: `Fim da Temporada ${state.season}`,
      detail: `Ligas, Copas, Champions e premiações encerradas! Destaques: ${growth.topGrowthPlayers[0]?.name || 'atletas'} e elencos avaliados.`,
      type: 'award',
    });
  }

  return npcMoves;
}

export function simulateToMidSeason(prevState: GameState): GameState {
  if (prevState.phase !== 'INICIO_JANELA') return prevState;
  const state = cloneState(prevState);

  const alreadyPlayed = new Set(
    Object.values(state.fixtures)
      .filter((f) => f.played)
      .map((f) => f.id)
  );

  let npcMoves = 0;
  if (!state.npcWindowDone?.inicio) {
    npcMoves += runGlobalNpcTransfers(state, 'INICIO', 36);
    state.npcWindowDone = { inicio: true, meio: false };
  }

  let guard = 0;
  while (state.phase === 'INICIO_JANELA' && guard < 40) {
    npcMoves += advanceSingleRoundInPlace(state);
    guard++;
  }

  const newlyPlayed = Object.values(state.fixtures)
    .filter((f) => f.played && !alreadyPlayed.has(f.id))
    .map((f) => f.id);

  state.lastPhaseReport = buildPhaseReport(state, 'MEIO_JANELA', newlyPlayed, npcMoves);
  return state;
}

export function simulateToEndSeason(prevState: GameState): GameState {
  if (prevState.phase === 'FINAL_TEMPORADA') return prevState;
  const state = prevState.phase === 'INICIO_JANELA' ? simulateToMidSeason(prevState) : cloneState(prevState);

  const alreadyPlayed = new Set(
    Object.values(state.fixtures)
      .filter((f) => f.played)
      .map((f) => f.id)
  );

  let npcMoves = 0;
  if (!state.npcWindowDone?.meio) {
    npcMoves += runGlobalNpcTransfers(state, 'MEIO', 32);
    state.npcWindowDone = { inicio: true, meio: true };
  }

  let guard = 0;
  while (state.phase !== 'FINAL_TEMPORADA' && guard < 60) {
    npcMoves += advanceSingleRoundInPlace(state);
    guard++;
  }

  const newlyPlayed = Object.values(state.fixtures)
    .filter((f) => f.played && !alreadyPlayed.has(f.id))
    .map((f) => f.id);

  state.lastPhaseReport = buildPhaseReport(state, 'FINAL_TEMPORADA', newlyPlayed, npcMoves);
  return state;
}

export function advanceSeasonRound(prevState: GameState): GameState {
  if (prevState.phase === 'FINAL_TEMPORADA') return prevState;
  const state = cloneState(prevState);
  const phaseBefore = state.phase;
  const alreadyPlayed = new Set(
    Object.values(state.fixtures)
      .filter((f) => f.played)
      .map((f) => f.id)
  );

  const npcMoves = advanceSingleRoundInPlace(state);

  if (state.phase !== phaseBefore) {
    const newlyPlayed = Object.values(state.fixtures)
      .filter((f) => f.played && !alreadyPlayed.has(f.id))
      .map((f) => f.id);
    state.lastPhaseReport = buildPhaseReport(state, state.phase, newlyPlayed, npcMoves);
  }
  return state;
}

export function simulateUntilNextCupOrUclMatch(prevState: GameState): GameState {
  if (prevState.phase === 'FINAL_TEMPORADA') return prevState;
  const state = cloneState(prevState);
  const userClub = state.clubs[state.userClubId];
  const userLeague = userClub ? state.leagues[userClub.leagueId] : undefined;
  if (!userLeague) return state;

  let guard = 0;
  while (state.phase !== 'FINAL_TEMPORADA' && guard < 55) {
    const target = findNextCupOrUclFixture(state);
    if (target && target.calendarRound <= userLeague.currentRound) {
      break;
    }
    if (!target && !hasActiveCupOrUclForUser(state)) {
      break;
    }
    advanceSingleRoundInPlace(state);
    guard++;
  }

  return state;
}

export function resolveCupOrUclFixtureAndRound(
  prevState: GameState,
  fixtureId: string,
  liveOverride?: LiveMatchOverride
): GameState {
  const state = cloneState(prevState);
  const target = state.fixtures[fixtureId];
  if (!target) return state;

  target.scheduledWatch = false;
  if (!target.played) {
    simulateFixtureInPlace(target, state, liveOverride);
  }

  if (
    (target.competitionType === 'CHAMPIONS_LEAGUE' || target.competitionType === 'EUROPA_LEAGUE') &&
    target.groupId
  ) {
    advanceContinentalGroupMatchdayInPlace(state, target.competitionType, target.round);
    recoverBetweenRoundsFitness(state);
    return state;
  }

  if (target.competitionType === 'CUP') {
    const cup = state.cups[target.competitionId];
    if (cup) advanceKnockoutRoundInPlace(state, 'CUP', cup);
    recoverBetweenRoundsFitness(state);
    return state;
  }

  if (target.competitionType === 'CHAMPIONS_LEAGUE') {
    advanceKnockoutRoundInPlace(state, 'CHAMPIONS_LEAGUE', state.championsLeague);
    recoverBetweenRoundsFitness(state);
    return state;
  }

  if (target.competitionType === 'EUROPA_LEAGUE' && state.europaLeague) {
    advanceKnockoutRoundInPlace(state, 'EUROPA_LEAGUE', state.europaLeague);
    recoverBetweenRoundsFitness(state);
    return state;
  }

  return state;
}

export function simulateNextKnockoutMatch(
  prevState: GameState,
  kind: 'CUP' | 'CHAMPIONS_LEAGUE' | 'EUROPA_LEAGUE',
  compId: string,
  specificFixtureId?: string,
  liveOverride?: LiveMatchOverride
): GameState {
  const state = cloneState(prevState);
  const comp: CupTournament | ChampionsLeagueState | undefined =
    kind === 'CUP'
      ? state.cups[compId]
      : kind === 'EUROPA_LEAGUE'
        ? state.europaLeague
        : state.championsLeague;
  if (!comp || comp.championClubId) return state;

  const round = comp.rounds[comp.currentRoundIndex];
  if (!round) return state;

  const targetId =
    specificFixtureId ||
    round.fixtureIds.find((fid) => state.fixtures[fid] && !state.fixtures[fid].played);

  if (!targetId || !state.fixtures[targetId]) return state;

  simulateFixtureInPlace(state.fixtures[targetId], state, liveOverride);

  const allPlayed = round.fixtureIds.every((fid) => state.fixtures[fid]?.played);
  if (allPlayed) {
    advanceKnockoutRoundInPlace(state, kind, comp);
  }

  return state;
}

export function startNewSeason(prevState: GameState): GameState {
  const state = cloneState(prevState);

  // Ensure all cups, UCL & UEL finished
  for (const cup of Object.values(state.cups)) {
    let guard = 0;
    while (!cup.championClubId && guard < 10) {
      advanceKnockoutRoundInPlace(state, 'CUP', cup);
      guard++;
    }
  }
  while (state.championsLeague.stage === 'GRUPOS') {
    advanceContinentalGroupMatchdayInPlace(state, 'CHAMPIONS_LEAGUE');
  }
  let uclGuard = 0;
  while (!state.championsLeague.championClubId && uclGuard < 8) {
    advanceKnockoutRoundInPlace(state, 'CHAMPIONS_LEAGUE', state.championsLeague);
    uclGuard++;
  }
  if (state.europaLeague) {
    while (state.europaLeague.stage === 'GRUPOS') {
      advanceContinentalGroupMatchdayInPlace(state, 'EUROPA_LEAGUE');
    }
    let uelGuard = 0;
    while (!state.europaLeague.championClubId && uelGuard < 8) {
      advanceKnockoutRoundInPlace(state, 'EUROPA_LEAGUE', state.europaLeague);
      uelGuard++;
    }
  }

  // Record season summary & compute next season UCL + UEL qualifiers from current league tables
  const leagueChampions = {} as Record<LeagueId, string>;
  const nextUclQualifiers: string[] = [];
  const nextUelQualifiers: string[] = [];
  for (const meta of LEAGUES_META) {
    const tbl = computeLeagueTable(meta.id, state);
    leagueChampions[meta.id] = tbl[0]?.clubId || '';
    if (meta.uclSpots > 0) {
      nextUclQualifiers.push(...tbl.slice(0, meta.uclSpots).map((r) => r.clubId));
    }
    if (meta.uelSpots > 0) {
      nextUelQualifiers.push(
        ...tbl.slice(meta.uclSpots, meta.uclSpots + meta.uelSpots).map((r) => r.clubId)
      );
    }
  }

  const promotions: SeasonSummary['promotions'] = [];
  const relegations: SeasonSummary['relegations'] = [];

  // England: Premier League <-> Championship (3)
  const premTable = computeLeagueTable('premier-league', state);
  const champTable = computeLeagueTable('championship', state);
  const engRelegated = premTable.slice(-3).map((r) => r.clubId);
  const engPromoted = champTable.slice(0, 3).map((r) => r.clubId);
  for (const cid of engRelegated) {
    if (state.clubs[cid]) {
      state.clubs[cid].leagueId = 'championship';
      state.clubs[cid].division = 2;
      relegations.push({ clubId: cid, from: 'premier-league', to: 'championship' });
    }
  }
  for (const cid of engPromoted) {
    if (state.clubs[cid]) {
      state.clubs[cid].leagueId = 'premier-league';
      state.clubs[cid].division = 1;
      promotions.push({ clubId: cid, from: 'championship', to: 'premier-league' });
    }
  }

  // Germany: Bundesliga <-> Bundesliga 2 (2)
  const bunTable = computeLeagueTable('bundesliga', state);
  const bun2Table = computeLeagueTable('bundesliga-2', state);
  const gerRelegated = bunTable.slice(-2).map((r) => r.clubId);
  const gerPromoted = bun2Table.slice(0, 2).map((r) => r.clubId);
  for (const cid of gerRelegated) {
    if (state.clubs[cid]) {
      state.clubs[cid].leagueId = 'bundesliga-2';
      state.clubs[cid].division = 2;
      relegations.push({ clubId: cid, from: 'bundesliga', to: 'bundesliga-2' });
    }
  }
  for (const cid of gerPromoted) {
    if (state.clubs[cid]) {
      state.clubs[cid].leagueId = 'bundesliga';
      state.clubs[cid].division = 1;
      promotions.push({ clubId: cid, from: 'bundesliga-2', to: 'bundesliga' });
    }
  }

  const cupChampions: Record<string, string> = {};
  for (const cup of Object.values(state.cups)) {
    if (cup.championClubId) cupChampions[cup.id] = cup.championClubId;
  }

  const risers = Object.values(state.players)
    .filter((p) => p.stats.ovrDelta > 0)
    .sort((a, b) => b.stats.ovrDelta - a.stats.ovrDelta)
    .slice(0, 10)
    .map((p) => ({
      playerId: p.id,
      name: p.name,
      clubId: p.clubId,
      fromOvr: p.overall - p.stats.ovrDelta,
      toOvr: p.overall,
    }));

  state.pastSummaries.unshift({
    season: state.season,
    leagueChampions,
    cupChampions,
    uclChampion: state.championsLeague.championClubId,
    uelChampion: state.europaLeague?.championClubId || null,
    promotions,
    relegations,
    topGrowthPlayers: risers,
  });

  // Ensure end-of-season merit prizes applied before resetting season
  awardEndOfSeasonLeaguePrizes(state, computeLeagueTable);

  // Return expired loans to parent clubs before starting the new season
  const returnedLoanNames: string[] = [];
  for (const p of Object.values(state.players)) {
    if (p.loan && p.loan.endSeason <= state.season) {
      const borrower = state.clubs[p.clubId];
      const parent = state.clubs[p.loan.parentClubId];
      if (borrower) {
        borrower.starterIds = borrower.starterIds.filter((id) => id !== p.id);
        borrower.benchIds = borrower.benchIds.filter((id) => id !== p.id);
      }
      if (parent) {
        p.clubId = parent.id;
        if (parent.id === state.userClubId || borrower?.id === state.userClubId) {
          returnedLoanNames.push(p.name);
        }
        state.transferHistory.unshift({
          id: `tr_loan_ret_${p.id}_${state.season}`,
          playerId: p.id,
          playerName: p.name,
          fromClubId: borrower?.id || '',
          toClubId: parent.id,
          amount: 0,
          type: 'LOAN_RETURN',
          season: state.season,
          phase: 'FINAL_TEMPORADA',
          reason: 'Fim de empréstimo (retorno)',
        });
      }
      p.loan = undefined;
      p.loanListed = false;
    }
  }

  // Modest pre-season TV & sponsor advance (merit prizes already paid per table position & cup rounds!)
  for (const club of Object.values(state.clubs)) {
    club.budget += club.division === 1 ? 4_500_000 : 1_500_000;
  }

  for (const p of Object.values(state.players)) {
    p.age += 1;
    p.fitness = 100;
    p.form = 'normal';
    p.recentRatings = [];
    p.lastRating = null;
    p.injury = null;
    p.stats = {
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
    };
  }

  // Rebuild next season fixtures & cups & UCL Groups
  state.season += 1;
  state.phase = 'INICIO_JANELA';
  state.fixtures = {};
  state.offers = [];
  state.lastPhaseReport = null;
  state.npcWindowDone = { inicio: false, meio: false };
  resetFinanceStateForNewSeason(state);
  ensureFinanceState(state);
  resetDraftForNewSeason(state);

  if (returnedLoanNames.length > 0) {
    state.newsFeed.unshift({
      id: `news_loan_ret_${state.season}`,
      round: 1,
      title: `Retornos de empréstimo concluídos`,
      detail: `Atletas que encerraram empréstimo na virada da temporada: ${returnedLoanNames.slice(0, 5).join(', ')}.`,
      type: 'transfer',
    });
  }

  // Refresh user lineup in case loaned starters left
  const uClubPost = state.clubs[state.userClubId];
  if (uClubPost && uClubPost.starterIds.length < 11) {
    const uPlayers = getClubPlayers(uClubPost.id, state.players);
    const uSlots = getActiveSlots(uClubPost.tactics, state.customFormations);
    const picked = autoPickLineup(uPlayers, uSlots);
    uClubPost.starterIds = picked.starterIds;
    uClubPost.benchIds = picked.benchIds;
  }

  for (const meta of LEAGUES_META) {
    const clubIds = Object.values(state.clubs)
      .filter((c) => c.leagueId === meta.id)
      .map((c) => c.id);
    const lFixtures = generateRoundRobinFixtures(meta.id, meta.name, clubIds);
    for (const f of lFixtures) state.fixtures[f.id] = f;
    state.leagues[meta.id].currentRound = 1;
    state.leagues[meta.id].totalRounds = lFixtures.reduce((m, f) => Math.max(m, f.round), 0);
  }

  const userClub = state.clubs[state.userClubId];
  const userTotalRounds = (userClub && state.leagues[userClub.leagueId]?.totalRounds) || 38;

  for (const cup of Object.values(state.cups)) {
    const clubIds = Object.values(state.clubs)
      .filter((c) => cup.leagueIds.includes(c.leagueId))
      .map((c) => c.id);
    const totalCupRounds = getTotalCupRoundsForClubCount(clubIds.length);
    const calRound = getCupCalendarRound(0, totalCupRounds, userTotalRounds);
    const init = buildInitialKnockoutRound(cup.id, cup.name, 'CUP', clubIds, 0, calRound);
    for (const f of init.fixtures) state.fixtures[f.id] = f;
    cup.currentRoundIndex = 0;
    cup.championClubId = null;
    cup.rounds = [{ roundIndex: 0, name: init.roundName, fixtureIds: init.fixtures.map((f) => f.id) }];
    cup.byeClubIds = init.byeClubIds;
  }

  state.championsLeague = buildChampionsLeagueGroupStage(
    state.clubs,
    state.fixtures,
    nextUclQualifiers,
    userTotalRounds
  );
  state.europaLeague = buildEuropaLeagueGroupStage(
    state.clubs,
    state.fixtures,
    state.championsLeague.groups.flatMap((g) => g.clubIds),
    nextUelQualifiers,
    userTotalRounds
  );

  state.newsFeed.unshift({
    id: `news_newseason_${state.season}`,
    round: 1,
    title: `Temporada ${state.season} Iniciada`,
    detail: `Novos calendários, fases de grupos da Champions e Europa League sorteadas e janela inicial aberta.`,
    type: 'info',
  });

  manageNpcSquadsAndRoles(state);
  runGlobalNpcTransfers(state, 'INICIO', 24);

  return state;
}

export function buyPlayerFromMarket(
  prevState: GameState,
  playerId: string,
  agreedAmount: number
): { state: GameState; error?: string } {
  const evalRes = evaluateTransferAttempt(prevState, playerId, prevState.userClubId);
  if (!evalRes.allowed) {
    return { state: prevState, error: evalRes.reason || 'O clube recusou negociar este jogador.' };
  }

  const state = cloneState(prevState);
  const player = state.players[playerId];
  const userClub = state.clubs[state.userClubId];
  if (!player || !userClub) return { state: prevState, error: 'Jogador ou clube inválido.' };
  if (player.clubId === userClub.id) return { state: prevState, error: 'Jogador já pertence ao seu clube.' };

  if (agreedAmount < evalRes.askingPrice) {
    const sellerName = state.clubs[player.clubId]?.name || 'O clube';
    return {
      state: prevState,
      error: `${sellerName} recusou a oferta e exige pelo menos € ${(evalRes.askingPrice / 1_000_000).toFixed(1)}M por ${player.name}.`,
    };
  }

  if (userClub.budget < agreedAmount) {
    return { state: prevState, error: 'Orçamento insuficiente para concluir esta contratação.' };
  }

  const sellerClub = state.clubs[player.clubId];
  userClub.budget -= agreedAmount;
  if (sellerClub) {
    sellerClub.budget += agreedAmount;
    sellerClub.starterIds = sellerClub.starterIds.filter((id) => id !== playerId);
    sellerClub.benchIds = sellerClub.benchIds.filter((id) => id !== playerId);
  }

  player.clubId = userClub.id;
  player.transferListed = false;
  player.askingPrice = undefined;
  player.role = player.overall >= 80 ? 'titular' : 'rotacao';

  if (userClub.benchIds.length < 7 && !player.injury) {
    userClub.benchIds.push(player.id);
  }

  if (sellerClub) {
    const sellerPlayers = getClubPlayers(sellerClub.id, state.players);
    const slots = getActiveSlots(sellerClub.tactics, state.customFormations);
    const picked = autoPickLineup(sellerPlayers, slots);
    sellerClub.starterIds = picked.starterIds;
    sellerClub.benchIds = picked.benchIds;
  }

  state.transferHistory.unshift({
    id: `tr_${Date.now()}`,
    playerId: player.id,
    playerName: player.name,
    fromClubId: sellerClub?.id || '',
    toClubId: userClub.id,
    amount: agreedAmount,
    type: 'TRANSFER',
    season: state.season,
    phase: state.phase,
    reason: 'Contratação do usuário',
  });

  state.newsFeed.unshift({
    id: `news_buy_${Date.now()}`,
    round: state.leagues[userClub.leagueId].currentRound,
    title: `${player.name} contratado!`,
    detail: `${userClub.name} fechou a contratação por € ${(agreedAmount / 1_000_000).toFixed(1)}M junto ao ${sellerClub?.name || 'clube anterior'}.`,
    type: 'transfer',
  });

  return { state };
}

export function loanPlayerFromMarket(
  prevState: GameState,
  playerId: string,
  withBuyOption = true
): { state: GameState; error?: string } {
  const evalRes = evaluateLoanAttempt(prevState, playerId, prevState.userClubId);
  if (!evalRes.allowed) {
    return { state: prevState, error: evalRes.reason || 'O clube recusou emprestar este jogador.' };
  }

  const state = cloneState(prevState);
  const player = state.players[playerId];
  const userClub = state.clubs[state.userClubId];
  if (!player || !userClub) return { state: prevState, error: 'Jogador ou clube inválido.' };
  if (player.clubId === userClub.id) return { state: prevState, error: 'Jogador já pertence ao seu clube.' };

  if (userClub.budget < evalRes.loanFee) {
    return { state: prevState, error: 'Verba insuficiente para pagar a taxa de empréstimo.' };
  }

  const parentClub = state.clubs[player.clubId];
  userClub.budget -= evalRes.loanFee;
  if (parentClub) {
    parentClub.budget += evalRes.loanFee;
    parentClub.starterIds = parentClub.starterIds.filter((id) => id !== playerId);
    parentClub.benchIds = parentClub.benchIds.filter((id) => id !== playerId);
  }

  player.clubId = userClub.id;
  player.transferListed = false;
  player.loanListed = false;
  player.askingPrice = undefined;
  player.role = player.overall >= userClub.reputation - 2 ? 'titular' : 'rotacao';
  player.loan = {
    parentClubId: parentClub?.id || '',
    fromClubId: parentClub?.id || '',
    toClubId: userClub.id,
    loanFee: evalRes.loanFee,
    buyOptionPrice: withBuyOption ? evalRes.buyOptionPrice : undefined,
    endSeason: state.season,
  };

  if (userClub.benchIds.length < 7 && !player.injury) {
    userClub.benchIds.push(player.id);
  }

  if (parentClub) {
    const parentPlayers = getClubPlayers(parentClub.id, state.players);
    const slots = getActiveSlots(parentClub.tactics, state.customFormations);
    const picked = autoPickLineup(parentPlayers, slots);
    parentClub.starterIds = picked.starterIds;
    parentClub.benchIds = picked.benchIds;
  }

  const round = state.leagues[userClub.leagueId].currentRound;
  state.transferHistory.unshift({
    id: `tr_loan_${Date.now()}`,
    playerId: player.id,
    playerName: player.name,
    fromClubId: parentClub?.id || '',
    toClubId: userClub.id,
    amount: evalRes.loanFee,
    type: 'LOAN',
    season: state.season,
    phase: state.phase,
    reason: withBuyOption
      ? `Empréstimo (opção € ${(evalRes.buyOptionPrice / 1_000_000).toFixed(1)}M)`
      : 'Empréstimo até fim da temporada',
  });

  state.newsFeed.unshift({
    id: `news_loan_in_${Date.now()}`,
    round,
    title: `${player.name} chega por empréstimo!`,
    detail: `${userClub.name} fechou empréstimo de ${player.name} junto ao ${parentClub?.name || 'clube anterior'} por € ${(evalRes.loanFee / 1_000_000).toFixed(2)}M.`,
    type: 'transfer',
  });

  return { state };
}

export function exerciseLoanBuyOption(
  prevState: GameState,
  playerId: string
): { state: GameState; error?: string } {
  const state = cloneState(prevState);
  const player = state.players[playerId];
  const userClub = state.clubs[state.userClubId];
  if (!player || !userClub || !player.loan || player.clubId !== userClub.id) {
    return { state: prevState, error: 'Atleta não possui empréstimo ativo com opção de compra.' };
  }
  const price = player.loan.buyOptionPrice;
  if (!price) {
    return { state: prevState, error: 'Este empréstimo não possui cláusula de opção de compra.' };
  }
  if (userClub.budget < price) {
    return { state: prevState, error: 'Verba insuficiente para exercer a opção de compra.' };
  }

  const parentClub = state.clubs[player.loan.parentClubId];
  userClub.budget -= price;
  if (parentClub) parentClub.budget += price;

  player.loan = undefined;
  player.transferListed = false;
  player.loanListed = false;

  const round = state.leagues[userClub.leagueId].currentRound;
  state.transferHistory.unshift({
    id: `tr_buyopt_${Date.now()}`,
    playerId: player.id,
    playerName: player.name,
    fromClubId: parentClub?.id || '',
    toClubId: userClub.id,
    amount: price,
    type: 'TRANSFER',
    season: state.season,
    phase: state.phase,
    reason: 'Opção de compra exercida',
  });

  state.newsFeed.unshift({
    id: `news_buyopt_${Date.now()}`,
    round,
    title: `${player.name} comprado em definitivo!`,
    detail: `${userClub.name} exerceu a opção de compra de € ${(price / 1_000_000).toFixed(1)}M junto ao ${parentClub?.name || 'clube de origem'}.`,
    type: 'transfer',
  });

  return { state };
}

export function respondToTransferOffer(
  prevState: GameState,
  offerId: string,
  decision: 'ACCEPT' | 'REJECT' | 'COUNTER',
  counterAmount?: number
): GameState {
  const state = cloneState(prevState);
  const offer = state.offers.find((o) => o.id === offerId);
  if (!offer || offer.status !== 'PENDING') return prevState;

  const player = state.players[offer.playerId];
  const userClub = state.clubs[state.userClubId];
  const buyerClub = state.clubs[offer.fromClubId];
  if (!player || !userClub || !buyerClub) return prevState;

  if (decision === 'REJECT') {
    offer.status = 'REJECTED';
    return state;
  }

  if (decision === 'COUNTER' && counterAmount) {
    const isLoan = offer.type === 'LOAN';
    const formMult = player.form === 'otima' ? 1.45 : player.form === 'boa' ? 1.3 : 1.2;
    const baseCap = isLoan ? Math.max(250_000, player.value * 0.16) : player.value * formMult;
    const maxWilling = Math.min(buyerClub.budget, baseCap);
    if (counterAmount <= maxWilling) {
      offer.amount = counterAmount;
      decision = 'ACCEPT';
    } else {
      offer.status = 'REJECTED';
      state.newsFeed.unshift({
        id: `news_cnt_rej_${Date.now()}`,
        round: state.leagues[userClub.leagueId].currentRound,
        title: `Contraproposta recusada por ${buyerClub.name}`,
        detail: `${buyerClub.name} encerrou as negociações por ${player.name}.`,
        type: 'transfer',
      });
      return state;
    }
  }

  if (decision === 'ACCEPT') {
    if (buyerClub.budget < offer.amount) {
      offer.status = 'REJECTED';
      return state;
    }
    offer.status = 'ACCEPTED';
    for (const o of state.offers) {
      if (o.id !== offer.id && o.playerId === player.id && o.status === 'PENDING') {
        o.status = 'REJECTED';
      }
    }

    const round = state.leagues[userClub.leagueId].currentRound;
    userClub.budget += offer.amount;
    buyerClub.budget -= offer.amount;
    userClub.starterIds = userClub.starterIds.filter((id) => id !== player.id);
    userClub.benchIds = userClub.benchIds.filter((id) => id !== player.id);

    if (userClub.starterIds.length < 11) {
      const remaining = getClubPlayers(userClub.id, state.players).filter((p) => p.id !== player.id);
      const slots = getActiveSlots(userClub.tactics, state.customFormations);
      const picked = autoPickLineup(remaining, slots);
      userClub.starterIds = picked.starterIds;
      userClub.benchIds = picked.benchIds;
    }

    player.clubId = buyerClub.id;
    player.transferListed = false;
    player.loanListed = false;
    player.askingPrice = undefined;

    if (offer.type === 'LOAN') {
      player.loan = {
        parentClubId: userClub.id,
        fromClubId: userClub.id,
        toClubId: buyerClub.id,
        loanFee: offer.amount,
        buyOptionPrice: offer.buyOptionPrice,
        endSeason: state.season,
      };
      recordFinanceEntry(state, 'EMPRESTIMO', `Taxa empréstimo ${player.name} (${buyerClub.shortName})`, offer.amount, round);

      state.transferHistory.unshift({
        id: `tr_loan_out_${Date.now()}`,
        playerId: player.id,
        playerName: player.name,
        fromClubId: userClub.id,
        toClubId: buyerClub.id,
        amount: offer.amount,
        type: 'LOAN',
        season: state.season,
        phase: state.phase,
        reason: 'Empréstimo cedido pelo usuário',
      });

      state.newsFeed.unshift({
        id: `news_loan_out_${Date.now()}`,
        round,
        title: `${player.name} emprestado para ${buyerClub.name}`,
        detail: `Empréstimo até o fim da temporada com taxa de € ${(offer.amount / 1_000_000).toFixed(2)}M.`,
        type: 'transfer',
      });
    } else {
      state.transferHistory.unshift({
        id: `tr_sell_${Date.now()}`,
        playerId: player.id,
        playerName: player.name,
        fromClubId: userClub.id,
        toClubId: buyerClub.id,
        amount: offer.amount,
        type: 'TRANSFER',
        season: state.season,
        phase: state.phase,
        reason: 'Venda do usuário',
      });

      state.newsFeed.unshift({
        id: `news_sell_${Date.now()}`,
        round,
        title: `${player.name} vendido para ${buyerClub.name}`,
        detail: `Venda concluída por € ${(offer.amount / 1_000_000).toFixed(1)}M (${FORM_LABELS[player.form]}).`,
        type: 'transfer',
      });
    }
  }

  return state;
}

export function getPresetOrCustomFormationName(
  club: Club,
  customFormations: GameState['customFormations']
): string {
  if (club.tactics.customFormation) return 'Personalizada';
  const all = [...PRESET_FORMATIONS, ...customFormations];
  return all.find((f) => f.id === club.tactics.formationId)?.name || club.tactics.formationId;
}

export function executeDraftSellPlayer(
  prevState: GameState,
  playerId: string
): { state: GameState; error?: string } {
  const state = cloneState(prevState);
  const res = sellDraftSquadPlayer(state, playerId);
  if (res.error) return { state: prevState, error: res.error };
  return { state };
}

export function executeDraftBuyCandidate(
  prevState: GameState,
  tier: DraftClassTier,
  playerId: string
): { state: GameState; error?: string } {
  const state = cloneState(prevState);
  const res = buyDraftCandidateFromInitialWindow(state, tier, playerId);
  if (res.error) return { state: prevState, error: res.error };
  return { state };
}

export function executeDraftReroll(
  prevState: GameState,
  tier?: DraftClassTier
): { state: GameState; error?: string } {
  const state = cloneState(prevState);
  const res = rerollInitialDraftWindow(state, tier);
  if (res.error) return { state: prevState, error: res.error };
  return { state };
}

export function executeDraftRollMid(
  prevState: GameState,
  position: Position,
  tier: DraftClassTier
): { state: GameState; error?: string } {
  const state = cloneState(prevState);
  const res = rollMidWindowDraft(state, position, tier);
  if (res.error) return { state: prevState, error: res.error };
  return { state };
}

export function executeDraftSignMid(
  prevState: GameState
): { state: GameState; error?: string } {
  const state = cloneState(prevState);
  const res = signMidWindowDraftCandidate(state);
  if (res.error) return { state: prevState, error: res.error };
  return { state };
}

export function executeDraftAttributeBuff(
  prevState: GameState,
  playerId: string,
  focus: DraftAttributeFocus
): { state: GameState; error?: string; ovrGain?: number } {
  const state = cloneState(prevState);
  const res = applyDirectedAttributeBuff(state, playerId, focus);
  if (res.error) return { state: prevState, error: res.error };
  return { state, ovrGain: res.ovrGain };
}

