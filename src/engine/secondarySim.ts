import { getPlayerAvgRating } from '../data/formations';
import { GameState, LeagueId, LeagueTableRow, Player, RawDataset } from '../types/game';
import { initializeGameState } from './dataLoader';
import { computeLeagueTable, simulateToEndSeason } from './seasonEngine';

export interface SecondarySimResult {
  state: GameState;
  tables: Record<LeagueId, LeagueTableRow[]>;
  topScorers: Player[];
  topAssisters: Player[];
  topRatings: Player[];
  topGrowth: Player[];
  topValue: Player[];
  leaguePower: { leagueId: LeagueId; name: string; avgOvr: number; totalGoals: number }[];
}

export function runSecondarySeasonSimulation(
  dataset: RawDataset,
  focusLeagueId: LeagueId | 'ALL'
): SecondarySimResult {
  const firstClub =
    dataset.clubs?.find((c) => focusLeagueId === 'ALL' || c.leagueId === focusLeagueId)?.id ||
    dataset.players[0]?.clubId ||
    'arsenal';

  const initial = initializeGameState(dataset, firstClub, 'sandbox', 'Simulação Rápida');
  const state = simulateToEndSeason(initial);

  const tables = {} as Record<LeagueId, LeagueTableRow[]>;
  for (const lid of Object.keys(state.leagues) as LeagueId[]) {
    tables[lid] = computeLeagueTable(lid, state);
  }

  const allPlayers = Object.values(state.players);
  const filteredPlayers =
    focusLeagueId === 'ALL'
      ? allPlayers
      : allPlayers.filter((p) => state.clubs[p.clubId]?.leagueId === focusLeagueId);

  const topScorers = [...filteredPlayers]
    .sort((a, b) => b.stats.goals - a.stats.goals || b.stats.assists - a.stats.assists)
    .slice(0, 20);

  const topAssisters = [...filteredPlayers]
    .sort((a, b) => b.stats.assists - a.stats.assists || b.stats.goals - a.stats.goals)
    .slice(0, 20);

  const topRatings = [...filteredPlayers]
    .filter((p) => p.stats.appearances >= 8)
    .sort((a, b) => getPlayerAvgRating(b) - getPlayerAvgRating(a) || b.overall - a.overall)
    .slice(0, 20);

  const topGrowth = [...filteredPlayers]
    .filter((p) => p.stats.ovrDelta > 0)
    .sort((a, b) => b.stats.ovrDelta - a.stats.ovrDelta || b.overall - a.overall)
    .slice(0, 20);

  const topValue = [...filteredPlayers].sort((a, b) => b.value - a.value).slice(0, 20);

  const leaguePower = (Object.keys(state.leagues) as LeagueId[]).map((lid) => {
    const lPlayers = allPlayers.filter((p) => state.clubs[p.clubId]?.leagueId === lid);
    const avgOvr =
      lPlayers.length > 0
        ? Number((lPlayers.reduce((s, p) => s + p.overall, 0) / lPlayers.length).toFixed(1))
        : 0;
    const totalGoals = tables[lid].reduce((s, r) => s + r.goalsFor, 0);
    return {
      leagueId: lid,
      name: state.leagues[lid].name,
      avgOvr,
      totalGoals,
    };
  });

  return {
    state,
    tables,
    topScorers,
    topAssisters,
    topRatings,
    topGrowth,
    topValue,
    leaguePower,
  };
}
