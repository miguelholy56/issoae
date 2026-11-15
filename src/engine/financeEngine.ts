import { LEAGUES_META } from '../data/leaguesMeta';
import {
  Club,
  ClubFinanceState,
  CupTournament,
  FinanceEntryCategory,
  Fixture,
  GameState,
  LeagueTableRow,
  Player,
} from '../types/game';

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function deterministicHash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

export function deriveStadiumCapacity(club: Club | undefined): number {
  if (!club) return 28000;
  const rep = club.reputation || 72;
  const divBase = club.division === 1 ? 16000 : 11000;
  const repBonus = Math.max(0, rep - 60) * (club.division === 1 ? 1950 : 900);
  const jitter = Math.round((deterministicHash(club.id) - 0.3) * 9000);
  const raw = clamp(divBase + repBonus + jitter, 14000, 84000);
  return Math.round(raw / 500) * 500;
}

export function ensureFinanceState(state: GameState): ClubFinanceState {
  const userClub = state.clubs[state.userClubId];
  const cap = state.financeState?.stadiumCapacity || deriveStadiumCapacity(userClub);
  if (!state.financeState) {
    state.financeState = {
      stadiumCapacity: cap,
      lastMatchAttendance: 0,
      lastMatchAttendancePct: 0,
      seasonMatchdayRevenue: 0,
      seasonMerchRevenue: 0,
      seasonPrizeRevenue: 0,
      seasonLoanRevenue: 0,
      midSeasonGrantApplied: false,
      seasonPrizesApplied: false,
      recentEntries: [],
    };
  } else {
    state.financeState.stadiumCapacity = cap;
    if (!Array.isArray(state.financeState.recentEntries)) {
      state.financeState.recentEntries = [];
    }
  }
  return state.financeState;
}

export function recordFinanceEntry(
  state: GameState,
  category: FinanceEntryCategory,
  label: string,
  amount: number,
  round: number
): void {
  if (!Number.isFinite(amount) || amount === 0) return;
  const fin = ensureFinanceState(state);
  if (category === 'BILHETERIA') fin.seasonMatchdayRevenue += amount;
  else if (category === 'CAMISAS') fin.seasonMerchRevenue += amount;
  else if (category === 'EMPRESTIMO') fin.seasonLoanRevenue += amount;
  else if (
    category === 'PREMIO_COPA' ||
    category === 'PREMIO_UCL' ||
    category === 'PREMIO_LIGA' ||
    category === 'MEIO_TEMPORADA'
  ) {
    fin.seasonPrizeRevenue += amount;
  }

  fin.recentEntries.unshift({
    id: `fin_${category}_${round}_${Math.random().toString(36).slice(2, 6)}`,
    round,
    category,
    label,
    amount: Math.round(amount),
  });
  if (fin.recentEntries.length > 24) {
    fin.recentEntries = fin.recentEntries.slice(0, 24);
  }
}

/**
 * Computes realistic matchday attendance & net ticket gate revenue when a user's club plays at home.
 * Good team form, star players in Boa/Ótima Fase, table contention, UCL/Cup importance, and big opponents
 * pull higher crowds!
 */
export function processHomeMatchAttendanceAndGate(
  fixture: Fixture,
  state: GameState
): void {
  if (fixture.homeClubId !== state.userClubId) return;
  const home = state.clubs[fixture.homeClubId];
  const away = state.clubs[fixture.awayClubId];
  if (!home || !away) return;

  const fin = ensureFinanceState(state);
  const cap = fin.stadiumCapacity;

  // Compute home club recent form directly from played league/cup matches
  const recentResults = Object.values(state.fixtures)
    .filter((f) => f.played && (f.homeClubId === home.id || f.awayClubId === home.id))
    .slice(-5);

  let recentWins = 0;
  let recentLosses = 0;
  for (const rf of recentResults) {
    if (rf.homeGoals === null || rf.awayGoals === null) continue;
    const isH = rf.homeClubId === home.id;
    const gf = isH ? rf.homeGoals : rf.awayGoals;
    const ga = isH ? rf.awayGoals : rf.homeGoals;
    if (gf > ga || rf.penaltiesWinnerId === home.id) recentWins++;
    else if (gf < ga) recentLosses++;
  }

  // Hot stars in user's XI boost hype & ticket demand
  let hotStarters = 0;
  for (const pid of home.starterIds) {
    const p = state.players[pid];
    if (p?.form === 'otima') hotStarters += 1.4;
    else if (p?.form === 'boa') hotStarters += 0.7;
  }

  let pct = 0.62 + clamp((home.reputation - 64) * 0.0055, -0.05, 0.18);
  pct += recentWins * 0.038 - recentLosses * 0.025;
  pct += Math.min(0.08, hotStarters * 0.018);

  if (fixture.competitionType === 'CHAMPIONS_LEAGUE') {
    pct += fixture.groupId ? 0.11 : 0.17;
  } else if (fixture.competitionType === 'EUROPA_LEAGUE') {
    pct += fixture.groupId ? 0.08 : 0.13;
  } else if (fixture.competitionType === 'CUP') {
    pct += fixture.round >= 3 ? 0.11 : 0.04;
  }

  if (away.reputation >= 82) {
    pct += 0.07;
  } else if (away.reputation >= 76) {
    pct += 0.03;
  }

  // Small natural variance
  pct += (Math.random() - 0.48) * 0.04;
  pct = clamp(pct, 0.48, 0.995);

  const attendance = Math.round((cap * pct) / 50) * 50;
  const pctRounded = Math.round(pct * 100);

  let hypeNote = 'Público padrão da temporada';
  if (pctRounded >= 93) hypeNote = 'Casa cheia! Grande momento atrai multidão ao estádio';
  else if (pctRounded >= 82) hypeNote = 'Boa fase e estrelas em alta empurram a torcida';
  else if (pctRounded < 62) hypeNote = 'Torcida cobrando reação após resultados irregulares';

  // Net matchday profit per ticket (after stadium operation/security costs)
  const baseTicketYield =
    home.division === 1
      ? 26 + Math.max(0, home.reputation - 70) * 0.9
      : 16 + Math.max(0, home.reputation - 64) * 0.5;
  const compMult =
    fixture.competitionType === 'CHAMPIONS_LEAGUE'
      ? 1.42
      : fixture.competitionType === 'EUROPA_LEAGUE'
        ? 1.24
        : fixture.competitionType === 'CUP'
          ? 1.15
          : 1.0;

  const netRevenue = Math.round((attendance * baseTicketYield * compMult) / 10000) * 10000;

  home.budget += netRevenue;
  fin.lastMatchAttendance = attendance;
  fin.lastMatchAttendancePct = pctRounded;
  fin.lastMatchHypeNote = hypeNote;

  const round = state.leagues[home.leagueId]?.currentRound || fixture.round || 1;
  recordFinanceEntry(
    state,
    'BILHETERIA',
    `Bilheteria vs ${away.shortName} (${pctRounded}% · ${attendance.toLocaleString('pt-BR')})`,
    netRevenue,
    round
  );
}

/**
 * Periodic jersey/merchandising sales scaled by club reputation, team winning momentum,
 * and stars in Boa/Ótima Fase or breakout youngsters!
 */
export function processPeriodicShirtSales(
  state: GameState,
  round: number,
  reasonLabel = 'Venda de Camisas & Merch'
): void {
  const clubHotScore: Record<string, { score: number; topStarName?: string; topStarScore: number }> = {};

  for (const p of Object.values(state.players)) {
    if (!p.clubId) continue;
    let pScore = 0;
    if (p.form === 'otima') pScore += 2.2;
    else if (p.form === 'boa') pScore += 1.0;
    if (p.stats.goals >= 5) pScore += 1.5;
    else if (p.stats.goals >= 2) pScore += 0.6;
    if (p.age <= 21 && (p.form === 'otima' || p.form === 'boa') && p.stats.appearances >= 3) {
      pScore += 1.3; // young breakout sells jerseys!
    }
    if (p.overall >= 85) pScore += 1.2;

    if (pScore > 0) {
      const entry = clubHotScore[p.clubId] || { score: 0, topStarScore: 0 };
      entry.score += pScore;
      if (pScore > entry.topStarScore) {
        entry.topStarScore = pScore;
        entry.topStarName = p.name;
      }
      clubHotScore[p.clubId] = entry;
    }
  }

  for (const club of Object.values(state.clubs)) {
    const repFactor = Math.max(0.4, (club.reputation - 56) / 28);
    const baseMerch = club.division === 1 ? 520000 * repFactor : 190000 * repFactor;
    const hot = clubHotScore[club.id];
    const hypeMult = 1 + clamp((hot?.score || 0) * 0.085, 0, 1.15);
    const amount = Math.round((baseMerch * hypeMult) / 25000) * 25000;

    club.budget += amount;

    if (club.id === state.userClubId) {
      const starNote = hot?.topStarName ? ` (destaque: ${hot.topStarName})` : '';
      recordFinanceEntry(state, 'CAMISAS', `${reasonLabel}${starNote}`, amount, round);
    }
  }
}

/**
 * Modest mid-season board & sponsor cash injection ("verba pequena no meio de temporada").
 */
export function applyMidSeasonBoardGrant(state: GameState): void {
  const fin = ensureFinanceState(state);
  if (fin.midSeasonGrantApplied) return;
  fin.midSeasonGrantApplied = true;

  const userClub = state.clubs[state.userClubId];
  const currentRound = userClub ? state.leagues[userClub.leagueId]?.currentRound || 19 : 19;

  // Build quick UCL knockout set for bonus check
  const uclQualified = new Set<string>();
  if (state.championsLeague.stage === 'MATA_MATA' && state.championsLeague.rounds[0]) {
    for (const fid of state.championsLeague.rounds[0].fixtureIds) {
      const f = state.fixtures[fid];
      if (f) {
        uclQualified.add(f.homeClubId);
        uclQualified.add(f.awayClubId);
      }
    }
  }

  for (const club of Object.values(state.clubs)) {
    const base = club.division === 1 ? 1_900_000 : 680_000;
    const repBonus = Math.max(0, club.reputation - 70) * (club.division === 1 ? 55_000 : 20_000);
    const uclBonus = uclQualified.has(club.id) ? 850_000 : 0;
    const grant = Math.round((base + repBonus + uclBonus) / 50_000) * 50_000;

    club.budget += grant;

    if (club.id === state.userClubId) {
      recordFinanceEntry(
        state,
        'MEIO_TEMPORADA',
        'Aporte de Meio de Temporada (Diretoria & TV)',
        grant,
        currentRound
      );
      state.newsFeed.unshift({
        id: `news_mid_grant_${Date.now()}`,
        round: currentRound,
        title: `Diretoria libera reforço de caixa: +€ ${(grant / 1_000_000).toFixed(2)}M`,
        detail: `Verba extra de meio de temporada creditada para ajudar em empréstimos ou oportunidades de janela.`,
        type: 'info',
      });
    }
  }
}

export function awardUclGroupMatchPrizes(fixture: Fixture, state: GameState): void {
  if (
    (fixture.competitionType !== 'CHAMPIONS_LEAGUE' && fixture.competitionType !== 'EUROPA_LEAGUE') ||
    !fixture.groupId
  ) {
    return;
  }
  if (fixture.homeGoals === null || fixture.awayGoals === null) return;

  const home = state.clubs[fixture.homeClubId];
  const away = state.clubs[fixture.awayClubId];
  if (!home || !away) return;

  const isUel = fixture.competitionType === 'EUROPA_LEAGUE';
  const compShort = isUel ? 'Europa League' : 'Champions';
  const winPrize = isUel ? 750_000 : 1_350_000;
  const drawPrize = isUel ? 250_000 : 450_000;

  if (fixture.homeGoals > fixture.awayGoals) {
    home.budget += winPrize;
    if (home.id === state.userClubId) {
      recordFinanceEntry(state, 'PREMIO_UCL', `Vitória na ${compShort} vs ${away.shortName}`, winPrize, fixture.calendarRound || fixture.round);
    }
  } else if (fixture.awayGoals > fixture.homeGoals) {
    away.budget += winPrize;
    if (away.id === state.userClubId) {
      recordFinanceEntry(state, 'PREMIO_UCL', `Vitória na ${compShort} vs ${home.shortName}`, winPrize, fixture.calendarRound || fixture.round);
    }
  } else {
    home.budget += drawPrize;
    away.budget += drawPrize;
    if (home.id === state.userClubId) {
      recordFinanceEntry(state, 'PREMIO_UCL', `Empate na ${compShort} vs ${away.shortName}`, drawPrize, fixture.calendarRound || fixture.round);
    } else if (away.id === state.userClubId) {
      recordFinanceEntry(state, 'PREMIO_UCL', `Empate na ${compShort} vs ${home.shortName}`, drawPrize, fixture.calendarRound || fixture.round);
    }
  }
}

export function awardKnockoutProgressionPrizes(
  kind: 'CUP' | 'CHAMPIONS_LEAGUE' | 'EUROPA_LEAGUE',
  compName: string,
  roundName: string,
  roundIndex: number,
  winners: string[],
  runnerUpId: string | null,
  championId: string | null,
  state: GameState
): void {
  const userClub = state.clubs[state.userClubId];
  const currentRound = userClub ? state.leagues[userClub.leagueId]?.currentRound || 1 : 1;

  if (kind === 'CHAMPIONS_LEAGUE' || kind === 'EUROPA_LEAGUE') {
    const isUel = kind === 'EUROPA_LEAGUE';
    if (championId) {
      const champ = state.clubs[championId];
      const championBonus = isUel ? 6_500_000 : 11_000_000;
      if (champ) {
        champ.budget += championBonus;
        if (champ.id === state.userClubId) {
          recordFinanceEntry(state, 'PREMIO_UCL', `Campeão da ${compName}!`, championBonus, currentRound);
        }
      }
      if (runnerUpId && state.clubs[runnerUpId]) {
        const viceBonus = isUel ? 3_400_000 : 5_800_000;
        state.clubs[runnerUpId].budget += viceBonus;
        if (runnerUpId === state.userClubId) {
          recordFinanceEntry(state, 'PREMIO_UCL', `Vice-campeão da ${compName}`, viceBonus, currentRound);
        }
      }
      return;
    }

    const tierBonus = isUel
      ? roundIndex === 0 ? 2_600_000 : roundIndex === 1 ? 3_400_000 : 4_200_000
      : roundIndex === 0 ? 5_200_000 : roundIndex === 1 ? 6_800_000 : 8_200_000;
    for (const wid of winners) {
      const club = state.clubs[wid];
      if (!club) continue;
      club.budget += tierBonus;
      if (club.id === state.userClubId) {
        recordFinanceEntry(
          state,
          'PREMIO_UCL',
          `Avanço na ${isUel ? 'Europa League' : 'Champions'} (${roundName})`,
          tierBonus,
          currentRound
        );
      }
    }
    return;
  }

  // Domestic Cups
  if (championId) {
    const champ = state.clubs[championId];
    const champPrize = 5_200_000;
    if (champ) {
      champ.budget += champPrize;
      if (champ.id === state.userClubId) {
        recordFinanceEntry(state, 'PREMIO_COPA', `Campeão da ${compName}!`, champPrize, currentRound);
      }
    }
    if (runnerUpId && state.clubs[runnerUpId]) {
      const vicePrize = 2_400_000;
      state.clubs[runnerUpId].budget += vicePrize;
      if (runnerUpId === state.userClubId) {
        recordFinanceEntry(state, 'PREMIO_COPA', `Vice-campeão da ${compName}`, vicePrize, currentRound);
      }
    }
    return;
  }

  const cupAdvPrize =
    roundIndex === 0
      ? 550_000
      : roundIndex === 1
        ? 950_000
        : roundIndex === 2
          ? 1_650_000
          : 2_600_000;

  for (const wid of winners) {
    const club = state.clubs[wid];
    if (!club) continue;
    club.budget += cupAdvPrize;
    if (club.id === state.userClubId) {
      recordFinanceEntry(
        state,
        'PREMIO_COPA',
        `Classificação na ${compName} (${roundName})`,
        cupAdvPrize,
        currentRound
      );
    }
  }
}

export function awardUclGroupQualificationPrizes(
  qualifiedClubIds: string[],
  state: GameState,
  compType: 'CHAMPIONS_LEAGUE' | 'EUROPA_LEAGUE' = 'CHAMPIONS_LEAGUE'
): void {
  const userClub = state.clubs[state.userClubId];
  const currentRound = userClub ? state.leagues[userClub.leagueId]?.currentRound || 18 : 18;
  const bonus = compType === 'EUROPA_LEAGUE' ? 2_200_000 : 4_800_000;
  for (const cid of qualifiedClubIds) {
    const club = state.clubs[cid];
    if (!club) continue;
    club.budget += bonus;
    if (club.id === state.userClubId) {
      recordFinanceEntry(
        state,
        'PREMIO_UCL',
        compType === 'EUROPA_LEAGUE'
          ? 'Classificação às Oitavas da Europa League'
          : 'Classificação às Oitavas da Champions',
        bonus,
        currentRound
      );
    }
  }
}

/**
 * Pays end-of-season merit prizes by final league table position for all 9 leagues.
 */
export function awardEndOfSeasonLeaguePrizes(
  state: GameState,
  computeTable: (leagueId: Club['leagueId'], st: GameState) => LeagueTableRow[]
): void {
  const fin = ensureFinanceState(state);
  if (fin.seasonPrizesApplied) return;
  fin.seasonPrizesApplied = true;

  for (const meta of LEAGUES_META) {
    const table = computeTable(meta.id, state);
    const n = Math.max(2, table.length);
    const isDiv1 = meta.division === 1;
    const leaguePrestige =
      meta.id === 'premier-league'
        ? 1.18
        : meta.id === 'la-liga' || meta.id === 'bundesliga' || meta.id === 'serie-a'
          ? 1.05
          : meta.id === 'ligue-1'
            ? 0.96
            : 0.84;

    const topPrize = (isDiv1 ? 22_000_000 : 8_200_000) * leaguePrestige;
    const minPrize = (isDiv1 ? 4_200_000 : 1_800_000) * leaguePrestige;

    table.forEach((row, idx) => {
      const club = state.clubs[row.clubId];
      if (!club) return;
      const ratio = 1 - idx / Math.max(1, n - 1);
      // Top positions curve slightly steeper so title/top-4/G6 rewards stand out
      const curved = Math.pow(ratio, 1.35);
      let prize = Math.round((minPrize + (topPrize - minPrize) * curved) / 50_000) * 50_000;

      // Promotion bonus for Div 2 top finishers
      const isPromoted = meta.promotionSpots > 0 && idx < meta.promotionSpots;
      if (isPromoted) prize += 4_500_000;

      club.budget += prize;

      if (club.id === state.userClubId) {
        const rank = idx + 1;
        const leagueObj = state.leagues[meta.id];
        recordFinanceEntry(
          state,
          'PREMIO_LIGA',
          `Premiação ${rank}º lugar · ${meta.name}${isPromoted ? ' (+Bônus Acesso)' : ''}`,
          prize,
          leagueObj?.totalRounds || 38
        );
        state.newsFeed.unshift({
          id: `news_league_prize_${state.season}`,
          round: leagueObj?.totalRounds || 38,
          title: `Premiação da Liga: +€ ${(prize / 1_000_000).toFixed(1)}M em caixa`,
          detail: `Pelo ${rank}º lugar na ${meta.name}${isPromoted ? ' com acesso garantido' : ''}, o ${club.name} recebeu bônus de posição.`,
          type: 'award',
        });
      }
    });
  }
}

export function resetFinanceStateForNewSeason(state: GameState): void {
  const fin = ensureFinanceState(state);
  fin.seasonMatchdayRevenue = 0;
  fin.seasonMerchRevenue = 0;
  fin.seasonPrizeRevenue = 0;
  fin.seasonLoanRevenue = 0;
  fin.midSeasonGrantApplied = false;
  fin.seasonPrizesApplied = false;
  fin.recentEntries = fin.recentEntries.slice(0, 6);
}
