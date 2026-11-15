import React, { useEffect, useMemo, useState } from 'react';
import { Trophy, Play, StepForward, Search, ArrowRightLeft, Crosshair } from 'lucide-react';
import { FORM_LABELS, getPlayerAvgRating } from '../data/formations';
import { DOMESTIC_CUPS_META, LEAGUES_META } from '../data/leaguesMeta';
import { computeChampionsGroupTable, computeLeagueTable } from '../engine/seasonEngine';
import { Fixture, GameState, LeagueId, MatchEvent } from '../types/game';
import { formatCurrency } from '../utils/format';
import { ClubCrest } from './ClubCrest';
import { NationFlag } from './NationFlag';
import { PlayerStatsHub } from './PlayerStatsHub';

interface MundoViewProps {
  state: GameState;
  onSimulateOneKnockout: (
    kind: 'CUP' | 'CHAMPIONS_LEAGUE' | 'EUROPA_LEAGUE',
    compId: string,
    fixtureId?: string
  ) => void;
  onWatchLive: (fixtureId: string) => void;
  onInspectPlayer: (playerId: string) => void;
  onInspectGoal?: (event: MatchEvent, fixture?: Fixture) => void;
}

const PHASE_LABEL: Record<string, string> = {
  INICIO_JANELA: 'Janela Inicial',
  MEIO_JANELA: 'Janela de Meio',
  FINAL_TEMPORADA: 'Fim de Temporada',
};

export const MundoView: React.FC<MundoViewProps> = ({
  state,
  onSimulateOneKnockout,
  onWatchLive,
  onInspectPlayer,
  onInspectGoal,
}) => {
  const userClub = state.clubs[state.userClubId];
  const [subTab, setSubTab] = useState<'ligas' | 'estatisticas' | 'transferencias' | 'ucl' | 'uel' | 'copas'>('ligas');
  const [selectedLeague, setSelectedLeague] = useState<LeagueId>(userClub.leagueId);
  const [leagueSideView, setLeagueSideView] = useState<'scorers' | 'ratings'>('scorers');

  const [transferSearch, setTransferSearch] = useState('');
  const [transferOriginFilter, setTransferOriginFilter] = useState<'ALL' | 'NPC' | 'USER'>('ALL');
  const [transferLeagueFilter, setTransferLeagueFilter] = useState<LeagueId | 'ALL'>('ALL');

  const [uclTab, setUclTab] = useState<'grupos' | 'matamata'>(
    state.championsLeague.stage === 'GRUPOS' ? 'grupos' : 'matamata'
  );
  const [uclGroupRound, setUclGroupRound] = useState<number>(
    Math.min(6, Math.max(1, state.championsLeague.groupRound))
  );

  const [uelTab, setUelTab] = useState<'grupos' | 'matamata'>(
    state.europaLeague?.stage === 'GRUPOS' ? 'grupos' : 'matamata'
  );
  const [uelGroupRound, setUelGroupRound] = useState<number>(
    Math.min(6, Math.max(1, state.europaLeague?.groupRound || 1))
  );

  useEffect(() => {
    if (state.championsLeague.stage !== 'GRUPOS') {
      setUclTab('matamata');
    } else {
      setUclTab('grupos');
    }
  }, [state.championsLeague.stage]);

  useEffect(() => {
    if (!state.europaLeague) return;
    if (state.europaLeague.stage !== 'GRUPOS') {
      setUelTab('matamata');
    } else {
      setUelTab('grupos');
    }
  }, [state.europaLeague?.stage]);

  const [selectedCupId, setSelectedCupId] = useState<string>(
    DOMESTIC_CUPS_META.find((c) => c.leagueIds.includes(userClub.leagueId))?.id || DOMESTIC_CUPS_META[0].id
  );

  const table = computeLeagueTable(selectedLeague, state);
  const leagueMeta = LEAGUES_META.find((l) => l.id === selectedLeague)!;

  const leagueScorers = useMemo(
    () =>
      Object.values(state.players)
        .filter((p) => state.clubs[p.clubId]?.leagueId === selectedLeague && p.stats.goals > 0)
        .sort((a, b) => b.stats.goals - a.stats.goals || b.stats.assists - a.stats.assists)
        .slice(0, 10),
    [state.players, state.clubs, selectedLeague]
  );

  const leagueTopRatings = useMemo(
    () =>
      Object.values(state.players)
        .filter((p) => state.clubs[p.clubId]?.leagueId === selectedLeague && p.stats.ratingCount > 0)
        .sort((a, b) => getPlayerAvgRating(b) - getPlayerAvgRating(a) || b.overall - a.overall)
        .slice(0, 10),
    [state.players, state.clubs, selectedLeague]
  );

  const filteredTransfers = useMemo(() => {
    const q = transferSearch.trim().toLowerCase();
    return state.transferHistory.filter((tr) => {
      const fromClub = state.clubs[tr.fromClubId];
      const toClub = state.clubs[tr.toClubId];
      const involvesUser = tr.fromClubId === state.userClubId || tr.toClubId === state.userClubId;

      if (transferOriginFilter === 'USER' && !involvesUser) return false;
      if (transferOriginFilter === 'NPC' && involvesUser) return false;
      if (
        transferLeagueFilter !== 'ALL' &&
        fromClub?.leagueId !== transferLeagueFilter &&
        toClub?.leagueId !== transferLeagueFilter
      ) {
        return false;
      }
      if (q) {
        const hay = `${tr.playerName} ${fromClub?.name || ''} ${toClub?.name || ''} ${tr.reason || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [
    state.transferHistory,
    state.clubs,
    state.userClubId,
    transferSearch,
    transferOriginFilter,
    transferLeagueFilter,
  ]);

  const transferStats = useMemo(() => {
    const count = state.transferHistory.length;
    const totalVolume = state.transferHistory.reduce((s, t) => s + t.amount, 0);
    const maxDeal = state.transferHistory.reduce((max, t) => (t.amount > max ? t.amount : max), 0);
    return { count, totalVolume, maxDeal };
  }, [state.transferHistory]);

  const uclRoundFixtures = useMemo(() => {
    const list: { groupName: string; fixture: Fixture }[] = [];
    for (const g of state.championsLeague.groups) {
      for (const fid of g.fixtureIds) {
        const f = state.fixtures[fid];
        if (f && f.round === uclGroupRound) {
          list.push({ groupName: g.name, fixture: f });
        }
      }
    }
    return list;
  }, [state.championsLeague.groups, state.fixtures, uclGroupRound]);

  const uelRoundFixtures = useMemo(() => {
    const list: { groupName: string; fixture: Fixture }[] = [];
    if (!state.europaLeague) return list;
    for (const g of state.europaLeague.groups) {
      for (const fid of g.fixtureIds) {
        const f = state.fixtures[fid];
        if (f && f.round === uelGroupRound) {
          list.push({ groupName: g.name, fixture: f });
        }
      }
    }
    return list;
  }, [state.europaLeague, state.fixtures, uelGroupRound]);

  const activeCup = state.cups[selectedCupId];

  const renderKnockoutPanel = (
    kind: 'CUP' | 'CHAMPIONS_LEAGUE' | 'EUROPA_LEAGUE',
    compId: string,
    title: string,
    championClubId: string | null,
    rounds: GameState['championsLeague']['rounds'],
    currentRoundIndex: number
  ) => {
    const currentRound = rounds[currentRoundIndex];
    const nextUnplayedId = currentRound?.fixtureIds.find((fid) => !state.fixtures[fid]?.played);

    return (
      <div className="space-y-5">
        <div className="p-5 bg-[#111114] border border-zinc-800/90 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="text-xs font-mono text-emerald-400">
              Mata-Mata · Progresso Automático nas Fases (2D Opcional)
            </div>
            <h2 className="font-display text-xl font-bold text-white mt-0.5">{title}</h2>
            <p className="text-xs text-zinc-400 mt-1">
              {championClubId
                ? `Campeão definido: ${state.clubs[championClubId]?.name}`
                : rounds.length === 0
                  ? 'Aguardando conclusão da Fase de Grupos para sortear as Oitavas.'
                  : `Fase atual: ${currentRound?.name || 'Encerrada'}`}
            </p>
          </div>

          {championClubId ? (
            <div className="flex items-center gap-3 px-4 py-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
              <Trophy className="w-4 h-4 text-emerald-400" />
              <ClubCrest clubId={championClubId} clubName={state.clubs[championClubId]?.name || ''} size="sm" />
              <span className="text-sm font-semibold text-white">
                {state.clubs[championClubId]?.name}
              </span>
            </div>
          ) : nextUnplayedId ? (
            <div className="flex items-center gap-2.5">
              <button
                onClick={() => onWatchLive(nextUnplayedId)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Play className="w-3.5 h-3.5" />
                Assistir Próximo 2D
              </button>
              <button
                onClick={() => onSimulateOneKnockout(kind, compId, nextUnplayedId)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-zinc-950 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <StepForward className="w-3.5 h-3.5" />
                Simular 1 Jogo
              </button>
            </div>
          ) : null}
        </div>

        <div className="space-y-4">
          {rounds
            .slice()
            .reverse()
            .map((r) => (
              <div
                key={r.roundIndex}
                className="p-4 bg-[#111114] border border-zinc-800/90 rounded-xl space-y-3"
              >
                <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                  <h3 className="font-display text-sm font-semibold text-white">{r.name}</h3>
                  <span className="text-[11px] font-mono tabular-nums text-zinc-500">
                    {r.fixtureIds.filter((id) => state.fixtures[id]?.played).length}/{r.fixtureIds.length} jogos
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {r.fixtureIds.map((fid) => {
                    const f = state.fixtures[fid];
                    if (!f) return null;
                    const home = state.clubs[f.homeClubId];
                    const away = state.clubs[f.awayClubId];
                    const isUserMatch =
                      f.homeClubId === state.userClubId || f.awayClubId === state.userClubId;

                    const goalEvents = (f.events || [])
                      .filter((e) => e.type === 'GOAL' && e.playerName)
                      .slice(0, 4);

                    return (
                      <div
                        key={fid}
                        className={`p-3 rounded-lg border flex items-center justify-between gap-3 text-xs ${
                          isUserMatch
                            ? 'bg-emerald-500/5 border-emerald-500/40'
                            : 'bg-[#09090B] border-zinc-800/80'
                        }`}
                      >
                        <div className="flex-1 min-w-0 space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <ClubCrest clubId={f.homeClubId} clubName={home?.name || ''} size="xs" />
                              <span
                                className={`truncate ${
                                  f.played && (f.homeGoals! > f.awayGoals! || f.penaltiesWinnerId === f.homeClubId)
                                    ? 'font-semibold text-white'
                                    : 'text-zinc-300'
                                }`}
                              >
                                {home?.name}
                              </span>
                            </div>
                            <span className="font-mono font-bold tabular-nums text-white">
                              {f.played ? f.homeGoals : '—'}
                            </span>
                          </div>

                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <ClubCrest clubId={f.awayClubId} clubName={away?.name || ''} size="xs" />
                              <span
                                className={`truncate ${
                                  f.played && (f.awayGoals! > f.homeGoals! || f.penaltiesWinnerId === f.awayClubId)
                                    ? 'font-semibold text-white'
                                    : 'text-zinc-300'
                                }`}
                              >
                                {away?.name}
                              </span>
                            </div>
                            <span className="font-mono font-bold tabular-nums text-white">
                              {f.played ? f.awayGoals : '—'}
                            </span>
                          </div>

                          {f.played && f.penaltiesWinnerId && (
                            <div className="text-[10px] font-mono text-amber-400">
                              Pênaltis: {state.clubs[f.penaltiesWinnerId]?.shortName} avançou
                            </div>
                          )}
                          {f.played && goalEvents.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                              {goalEvents.map((e, gi) => (
                                <button
                                  key={gi}
                                  type="button"
                                  onClick={() => onInspectGoal?.(e, f)}
                                  title="Ver mapa do chute"
                                  className="inline-flex items-center gap-1 text-[10px] text-zinc-400 hover:text-emerald-400 cursor-pointer"
                                >
                                  <Crosshair className="w-2.5 h-2.5 text-emerald-500/80" />
                                  <span>{e.playerName} {e.minute}&apos;</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        {!f.played && (
                          <div className="flex flex-col gap-1.5 shrink-0">
                            <button
                              onClick={() => onWatchLive(f.id)}
                              className="px-2.5 py-1 text-[11px] font-semibold bg-emerald-500 hover:bg-emerald-400 text-zinc-950 rounded cursor-pointer"
                            >
                              2D
                            </button>
                            <button
                              onClick={() => onSimulateOneKnockout(kind, compId, f.id)}
                              className="px-2.5 py-1 text-[11px] font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded cursor-pointer"
                            >
                              Sim
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* Main Sub-Tabs */}
      <div className="flex items-center gap-1 p-1 bg-[#111114] border border-zinc-800 rounded-lg w-fit overflow-x-auto max-w-full">
        <button
          onClick={() => setSubTab('ligas')}
          className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            subTab === 'ligas' ? 'bg-emerald-500 text-zinc-950 font-semibold' : 'text-zinc-400 hover:text-white'
          }`}
        >
          Ligas Nacionais (9)
        </button>
        <button
          onClick={() => setSubTab('estatisticas')}
          className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            subTab === 'estatisticas' ? 'bg-emerald-500 text-zinc-950 font-semibold' : 'text-zinc-400 hover:text-white'
          }`}
        >
          Estatísticas da Temporada
        </button>
        <button
          onClick={() => setSubTab('transferencias')}
          className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            subTab === 'transferencias' ? 'bg-emerald-500 text-zinc-950 font-semibold' : 'text-zinc-400 hover:text-white'
          }`}
        >
          Transferências Globais ({state.transferHistory.length})
        </button>
        <button
          onClick={() => setSubTab('ucl')}
          className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            subTab === 'ucl' ? 'bg-emerald-500 text-zinc-950 font-semibold' : 'text-zinc-400 hover:text-white'
          }`}
        >
          Champions League (Beta)
        </button>
        <button
          onClick={() => setSubTab('uel')}
          className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            subTab === 'uel' ? 'bg-amber-400 text-zinc-950 font-semibold' : 'text-zinc-400 hover:text-white'
          }`}
        >
          Europa League (Beta)
        </button>
        <button
          onClick={() => setSubTab('copas')}
          className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            subTab === 'copas' ? 'bg-emerald-500 text-zinc-950 font-semibold' : 'text-zinc-400 hover:text-white'
          }`}
        >
          Copas Locais (7)
        </button>
      </div>

      {/* 1. LIGAS NACIONAIS */}
      {subTab === 'ligas' && (
        <div className="space-y-5">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {LEAGUES_META.map((l) => (
              <button
                key={l.id}
                onClick={() => setSelectedLeague(l.id)}
                className={`px-3.5 py-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  selectedLeague === l.id
                    ? 'bg-zinc-100 text-zinc-950 font-semibold'
                    : 'bg-[#111114] text-zinc-400 hover:text-white border border-zinc-800'
                }`}
              >
                {l.name}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-8 bg-[#111114] border border-zinc-800/90 rounded-xl overflow-x-auto">
              <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between gap-4">
                <h3 className="font-display text-base font-semibold text-white">
                  {leagueMeta.name} · Classificação (3 pontos)
                </h3>
                <span className="text-xs font-mono tabular-nums text-zinc-400 shrink-0">
                  Rodada {Math.min(state.leagues[selectedLeague].currentRound, state.leagues[selectedLeague].totalRounds)}/{state.leagues[selectedLeague].totalRounds}
                </span>
              </div>
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="text-[11px] text-zinc-500 border-b border-zinc-800 bg-[#0d0d10]">
                    <th className="py-2.5 pl-3 pr-2 w-8">#</th>
                    <th className="py-2.5 pr-3">Clube</th>
                    <th className="py-2.5 px-2 text-right">J</th>
                    <th className="py-2.5 px-2 text-right">V</th>
                    <th className="py-2.5 px-2 text-right">E</th>
                    <th className="py-2.5 px-2 text-right">D</th>
                    <th className="py-2.5 px-2 text-right">GP</th>
                    <th className="py-2.5 px-2 text-right">GC</th>
                    <th className="py-2.5 px-2 text-right">SG</th>
                    <th className="py-2.5 px-2 text-right hidden sm:table-cell">Forma</th>
                    <th className="py-2.5 px-3 text-right">Pts</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50">
                  {table.map((row, idx) => {
                    const club = state.clubs[row.clubId];
                    const isUser = row.clubId === state.userClubId;
                    const gd = row.goalsFor - row.goalsAgainst;
                    const isPromo = leagueMeta.promotionSpots > 0 && idx < leagueMeta.promotionSpots;
                    const isUcl = leagueMeta.uclSpots > 0 && idx < leagueMeta.uclSpots;
                    const isUel =
                      leagueMeta.uelSpots > 0 &&
                      idx >= leagueMeta.uclSpots &&
                      idx < leagueMeta.uclSpots + leagueMeta.uelSpots;
                    const isRel =
                      leagueMeta.relegationSpots > 0 &&
                      idx >= table.length - leagueMeta.relegationSpots;

                    return (
                      <tr
                        key={row.clubId}
                        className={isUser ? 'bg-emerald-500/10 text-white font-semibold' : 'text-zinc-300 hover:bg-zinc-900/50'}
                      >
                        <td className="py-2 pl-3 pr-2 font-mono tabular-nums">
                          <span
                            className={
                              isUcl || isPromo
                                ? 'text-emerald-400'
                                : isUel
                                  ? 'text-amber-400'
                                  : isRel
                                    ? 'text-red-400'
                                    : 'text-zinc-500'
                            }
                          >
                            {idx + 1}
                          </span>
                        </td>
                        <td className="py-2 pr-3">
                          <div className="flex items-center gap-2">
                            <ClubCrest clubId={row.clubId} clubName={club?.name || ''} size="xs" />
                            <span>{club?.name}</span>
                          </div>
                        </td>
                        <td className="py-2 px-2 text-right font-mono tabular-nums text-zinc-400">{row.played}</td>
                        <td className="py-2 px-2 text-right font-mono tabular-nums text-zinc-400">{row.won}</td>
                        <td className="py-2 px-2 text-right font-mono tabular-nums text-zinc-400">{row.drawn}</td>
                        <td className="py-2 px-2 text-right font-mono tabular-nums text-zinc-400">{row.lost}</td>
                        <td className="py-2 px-2 text-right font-mono tabular-nums text-zinc-400">{row.goalsFor}</td>
                        <td className="py-2 px-2 text-right font-mono tabular-nums text-zinc-400">{row.goalsAgainst}</td>
                        <td className="py-2 px-2 text-right font-mono tabular-nums text-zinc-400">
                          {gd > 0 ? `+${gd}` : gd}
                        </td>
                        <td className="py-2 px-2 text-right hidden sm:table-cell">
                          <div className="inline-flex items-center gap-1 font-mono text-[10px]">
                            {row.form.map((res, fIdx) => (
                              <span
                                key={fIdx}
                                className={
                                  res === 'V'
                                    ? 'text-emerald-400 font-semibold'
                                    : res === 'D'
                                      ? 'text-red-400'
                                      : 'text-zinc-400'
                                }
                              >
                                {res}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="py-2 px-3 text-right font-mono tabular-nums font-bold text-white">
                          {row.points}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="lg:col-span-4 bg-[#111114] border border-zinc-800/90 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between gap-2 border-b border-zinc-800 pb-2.5">
                <h3 className="font-display text-sm font-semibold text-white">
                  Destaques · {leagueMeta.name}
                </h3>
                <div className="flex items-center gap-1 bg-[#09090B] border border-zinc-800 rounded p-0.5">
                  <button
                    onClick={() => setLeagueSideView('scorers')}
                    className={`px-2 py-1 text-[11px] rounded cursor-pointer ${
                      leagueSideView === 'scorers' ? 'bg-emerald-500 text-zinc-950 font-semibold' : 'text-zinc-400'
                    }`}
                  >
                    Artilharia
                  </button>
                  <button
                    onClick={() => setLeagueSideView('ratings')}
                    className={`px-2 py-1 text-[11px] rounded cursor-pointer ${
                      leagueSideView === 'ratings' ? 'bg-emerald-500 text-zinc-950 font-semibold' : 'text-zinc-400'
                    }`}
                  >
                    Notas
                  </button>
                </div>
              </div>

              {leagueSideView === 'scorers' ? (
                leagueScorers.length === 0 ? (
                  <p className="text-xs text-zinc-500">
                    Os artilheiros aparecerão conforme as rodadas forem disputadas.
                  </p>
                ) : (
                  <div className="divide-y divide-zinc-800/60">
                    {leagueScorers.map((p, idx) => (
                      <div key={p.id} className="py-2 flex items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-mono text-zinc-500 w-4">{idx + 1}</span>
                          <NationFlag nationality={p.nationality} size="xs" />
                          <div className="min-w-0">
                            <button
                              type="button"
                              onClick={() => onInspectPlayer(p.id)}
                              className="text-zinc-100 hover:text-emerald-400 font-medium truncate block text-left cursor-pointer"
                            >
                              {p.name}
                            </button>
                            <div className="text-[11px] text-zinc-500 truncate">
                              {state.clubs[p.clubId]?.name}
                            </div>
                          </div>
                        </div>
                        <span className="font-mono font-bold tabular-nums text-emerald-400 shrink-0">
                          {p.stats.goals}G · {p.stats.assists}A
                        </span>
                      </div>
                    ))}
                  </div>
                )
              ) : leagueTopRatings.length === 0 ? (
                <p className="text-xs text-zinc-500">
                  As notas médias aparecerão após os primeiros jogos da liga.
                </p>
              ) : (
                <div className="divide-y divide-zinc-800/60">
                  {leagueTopRatings.map((p, idx) => {
                    const avg = getPlayerAvgRating(p);
                    return (
                      <div key={p.id} className="py-2 flex items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-mono text-zinc-500 w-4">{idx + 1}</span>
                          <NationFlag nationality={p.nationality} size="xs" />
                          <div className="min-w-0">
                            <button
                              type="button"
                              onClick={() => onInspectPlayer(p.id)}
                              className="text-zinc-100 hover:text-emerald-400 font-medium truncate block text-left cursor-pointer"
                            >
                              {p.name}
                            </button>
                            <div className="text-[11px] text-zinc-500 truncate">
                              {state.clubs[p.clubId]?.name} ·{' '}
                              <span className={p.form === 'otima' || p.form === 'boa' ? 'text-emerald-400' : 'text-zinc-500'}>
                                {FORM_LABELS[p.form]}
                              </span>
                            </div>
                          </div>
                        </div>
                        <span className="font-mono font-bold tabular-nums text-emerald-400 shrink-0">
                          {avg.toFixed(1)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 1B. ESTATÍSTICAS DE JOGADORES NA TEMPORADA */}
      {subTab === 'estatisticas' && (
        <PlayerStatsHub
          state={state}
          defaultScope={selectedLeague}
          onInspectPlayer={onInspectPlayer}
        />
      )}

      {/* 2. TRANSFERÊNCIAS GLOBAIS */}
      {subTab === 'transferencias' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 bg-[#111114] border border-zinc-800/90 rounded-xl">
              <div className="text-xs text-zinc-400">Negociações Globais</div>
              <div className="font-mono text-2xl font-bold tabular-nums text-white mt-1">
                {transferStats.count}
              </div>
              <div className="text-[11px] text-zinc-500 mt-1">Clubes NPC e Usuário</div>
            </div>
            <div className="p-4 bg-[#111114] border border-zinc-800/90 rounded-xl">
              <div className="text-xs text-zinc-400">Volume Movimentado</div>
              <div className="font-mono text-2xl font-bold tabular-nums text-emerald-400 mt-1">
                {formatCurrency(transferStats.totalVolume)}
              </div>
              <div className="text-[11px] text-zinc-500 mt-1">Dentro do orçamento real</div>
            </div>
            <div className="p-4 bg-[#111114] border border-zinc-800/90 rounded-xl">
              <div className="text-xs text-zinc-400">Maior Transferência</div>
              <div className="font-mono text-2xl font-bold tabular-nums text-white mt-1">
                {formatCurrency(transferStats.maxDeal)}
              </div>
              <div className="text-[11px] text-zinc-500 mt-1">Sem acordos entre rivais</div>
            </div>
          </div>

          {/* Filters */}
          <div className="p-4 bg-[#111114] border border-zinc-800/90 rounded-xl flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={transferSearch}
                onChange={(e) => setTransferSearch(e.target.value)}
                placeholder="Buscar jogador, clube ou motivo..."
                className="w-full pl-9 pr-3 py-2 bg-[#09090B] border border-zinc-800 rounded-lg text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <select
              value={transferOriginFilter}
              onChange={(e) => setTransferOriginFilter(e.target.value as 'ALL' | 'NPC' | 'USER')}
              className="px-3 py-2 bg-[#09090B] border border-zinc-800 rounded-lg text-xs text-zinc-200"
            >
              <option value="ALL">Todas Origens</option>
              <option value="NPC">Apenas NPCs</option>
              <option value="USER">Meu Clube</option>
            </select>

            <select
              value={transferLeagueFilter}
              onChange={(e) => setTransferLeagueFilter(e.target.value as LeagueId | 'ALL')}
              className="px-3 py-2 bg-[#09090B] border border-zinc-800 rounded-lg text-xs text-zinc-200"
            >
              <option value="ALL">Todas as 9 Ligas</option>
              {LEAGUES_META.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>

          {/* Global Feed Table */}
          <div className="bg-[#111114] border border-zinc-800/90 rounded-xl overflow-x-auto">
            {filteredTransfers.length === 0 ? (
              <div className="p-8 text-center text-xs text-zinc-500">
                Nenhuma transferência encontrada para os filtros selecionados.
              </div>
            ) : (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="text-[11px] text-zinc-500 border-b border-zinc-800 bg-[#0d0d10]">
                    <th className="py-2.5 pl-4 pr-3">Jogador</th>
                    <th className="py-2.5 px-3">Origem</th>
                    <th className="py-2.5 px-3">Destino</th>
                    <th className="py-2.5 px-3 text-right">Valor</th>
                    <th className="py-2.5 px-3">Janela</th>
                    <th className="py-2.5 pr-4 pl-3">Motivo da Negociação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50">
                  {filteredTransfers.slice(0, 100).map((tr) => {
                    const p = state.players[tr.playerId];
                    const fromClub = state.clubs[tr.fromClubId];
                    const toClub = state.clubs[tr.toClubId];
                    const involvesUser =
                      tr.fromClubId === state.userClubId || tr.toClubId === state.userClubId;

                    return (
                      <tr
                        key={tr.id}
                        className={involvesUser ? 'bg-emerald-500/5 hover:bg-emerald-500/10' : 'hover:bg-zinc-900/50'}
                      >
                        <td className="py-2.5 pl-4 pr-3">
                          <div className="flex items-center gap-2">
                            {p && <NationFlag nationality={p.nationality} size="xs" />}
                            <div>
                              {p ? (
                                <button
                                  type="button"
                                  onClick={() => onInspectPlayer(p.id)}
                                  className="font-semibold text-white hover:text-emerald-400 text-left cursor-pointer"
                                >
                                  {tr.playerName}
                                </button>
                              ) : (
                                <div className="font-semibold text-white">{tr.playerName}</div>
                              )}
                              {p && (
                                <div className="text-[10px] font-mono text-zinc-500">
                                  {p.position} · {p.overall} OVR · {p.age}a
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-2 text-zinc-300">
                            <ClubCrest clubId={tr.fromClubId} clubName={fromClub?.name || ''} size="xs" />
                            <span>{fromClub?.name || tr.fromClubId}</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-2 text-white font-medium">
                            <ArrowRightLeft className="w-3 h-3 text-emerald-400 shrink-0" />
                            <ClubCrest clubId={tr.toClubId} clubName={toClub?.name || ''} size="xs" />
                            <span>{toClub?.name || tr.toClubId}</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold tabular-nums text-emerald-400">
                          {tr.type === 'LOAN_RETURN'
                            ? 'Retorno'
                            : tr.type === 'LOAN'
                              ? `Emp. ${formatCurrency(tr.amount)}`
                              : formatCurrency(tr.amount)}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[11px] text-zinc-400 whitespace-nowrap">
                          T{tr.season} · {PHASE_LABEL[tr.phase] || tr.phase}
                        </td>
                        <td className="py-2.5 pr-4 pl-3 text-zinc-400">
                          {tr.reason || 'Ajuste de elenco e minutagem'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* 3. CHAMPIONS LEAGUE BETA (GRUPOS + MATA-MATA) */}
      {subTab === 'ucl' && (
        <div className="space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-[#111114] border border-zinc-800/90 rounded-xl">
            <div>
              <div className="text-xs font-mono text-emerald-400">
                Champions League Beta · 32 Clubes das 7 Primeiras Divisões
              </div>
              <h2 className="font-display text-lg font-bold text-white mt-0.5">
                {state.championsLeague.stage === 'GRUPOS'
                  ? `Fase de Grupos · Rodada ${state.championsLeague.groupRound} de 6`
                  : state.championsLeague.championClubId
                    ? `Campeão: ${state.clubs[state.championsLeague.championClubId]?.name}`
                    : `Mata-Mata · ${state.championsLeague.rounds[state.championsLeague.currentRoundIndex]?.name || 'Em andamento'}`}
              </h2>
            </div>

            <div className="flex items-center gap-1 p-1 bg-[#09090B] border border-zinc-800 rounded-lg self-start">
              <button
                onClick={() => setUclTab('grupos')}
                className={`px-3.5 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 cursor-pointer ${
                  uclTab === 'grupos' ? 'bg-emerald-500 text-zinc-950 font-semibold' : 'text-zinc-400 hover:text-white'
                }`}
              >
                Fase de Grupos (8)
              </button>
              <button
                onClick={() => setUclTab('matamata')}
                className={`px-3.5 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 cursor-pointer ${
                  uclTab === 'matamata' ? 'bg-emerald-500 text-zinc-950 font-semibold' : 'text-zinc-400 hover:text-white'
                }`}
              >
                Mata-Mata
              </button>
            </div>
          </div>

          {uclTab === 'grupos' ? (
            <div className="space-y-6">
              {/* 8 Groups Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {state.championsLeague.groups.map((group) => {
                  const gTable = computeChampionsGroupTable(group.id, state);
                  return (
                    <div
                      key={group.id}
                      className="bg-[#111114] border border-zinc-800/90 rounded-xl overflow-hidden"
                    >
                      <div className="px-4 py-2.5 border-b border-zinc-800 bg-[#0d0d10] flex items-center justify-between">
                        <span className="font-display text-xs font-semibold text-white">
                          {group.name}
                        </span>
                        <span className="text-[10px] font-mono text-zinc-500">
                          Top 2 avançam às Oitavas
                        </span>
                      </div>
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="text-[10px] text-zinc-500 border-b border-zinc-800/70">
                            <th className="py-2 pl-3 pr-2 w-6">#</th>
                            <th className="py-2 pr-2">Clube</th>
                            <th className="py-2 px-2 text-right">J</th>
                            <th className="py-2 px-2 text-right">V</th>
                            <th className="py-2 px-2 text-right">E</th>
                            <th className="py-2 px-2 text-right">D</th>
                            <th className="py-2 px-2 text-right">SG</th>
                            <th className="py-2 pr-3 pl-2 text-right">Pts</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800/40">
                          {gTable.map((row, idx) => {
                            const club = state.clubs[row.clubId];
                            const gd = row.goalsFor - row.goalsAgainst;
                            const isUser = row.clubId === state.userClubId;
                            return (
                              <tr
                                key={row.clubId}
                                className={isUser ? 'bg-emerald-500/10 text-white font-semibold' : 'text-zinc-300'}
                              >
                                <td className="py-2 pl-3 pr-2 font-mono tabular-nums">
                                  <span className={idx < 2 ? 'text-emerald-400' : 'text-zinc-500'}>
                                    {idx + 1}
                                  </span>
                                </td>
                                <td className="py-2 pr-2">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <ClubCrest clubId={row.clubId} clubName={club?.name || ''} size="xs" />
                                    <span className="truncate">{club?.name}</span>
                                  </div>
                                </td>
                                <td className="py-2 px-2 text-right font-mono tabular-nums text-zinc-400">{row.played}</td>
                                <td className="py-2 px-2 text-right font-mono tabular-nums text-zinc-400">{row.won}</td>
                                <td className="py-2 px-2 text-right font-mono tabular-nums text-zinc-400">{row.drawn}</td>
                                <td className="py-2 px-2 text-right font-mono tabular-nums text-zinc-400">{row.lost}</td>
                                <td className="py-2 px-2 text-right font-mono tabular-nums text-zinc-400">
                                  {gd > 0 ? `+${gd}` : gd}
                                </td>
                                <td className="py-2 pr-3 pl-2 text-right font-mono font-bold tabular-nums text-white">
                                  {row.points}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  );
                })}
              </div>

              {/* Group Matchdays Results & Optional 2D */}
              <div className="bg-[#111114] border border-zinc-800/90 rounded-xl p-4 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-3">
                  <h3 className="font-display text-sm font-semibold text-white">
                    Jogos da Fase de Grupos
                  </h3>
                  <div className="flex items-center gap-1 overflow-x-auto">
                    {[1, 2, 3, 4, 5, 6].map((r) => (
                      <button
                        key={r}
                        onClick={() => setUclGroupRound(r)}
                        className={`px-3 py-1 text-xs font-mono rounded cursor-pointer ${
                          uclGroupRound === r
                            ? 'bg-emerald-500 text-zinc-950 font-semibold'
                            : 'bg-[#09090B] text-zinc-400 border border-zinc-800 hover:text-white'
                        }`}
                      >
                        R{r}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {uclRoundFixtures.map(({ groupName, fixture: f }) => {
                    const home = state.clubs[f.homeClubId];
                    const away = state.clubs[f.awayClubId];
                    const isUserMatch =
                      f.homeClubId === state.userClubId || f.awayClubId === state.userClubId;
                    const goalEvents = (f.events || [])
                      .filter((e) => e.type === 'GOAL' && e.playerName)
                      .slice(0, 4);

                    return (
                      <div
                        key={f.id}
                        className={`p-3 rounded-lg border flex items-center justify-between gap-3 text-xs ${
                          isUserMatch
                            ? 'bg-emerald-500/5 border-emerald-500/40'
                            : 'bg-[#09090B] border-zinc-800/80'
                        }`}
                      >
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="text-[10px] font-mono text-zinc-500">{groupName}</div>
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <ClubCrest clubId={f.homeClubId} clubName={home?.name || ''} size="xs" />
                              <span className="truncate text-zinc-200">{home?.name}</span>
                            </div>
                            <span className="font-mono font-bold tabular-nums text-white">
                              {f.played ? f.homeGoals : '—'}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <ClubCrest clubId={f.awayClubId} clubName={away?.name || ''} size="xs" />
                              <span className="truncate text-zinc-200">{away?.name}</span>
                            </div>
                            <span className="font-mono font-bold tabular-nums text-white">
                              {f.played ? f.awayGoals : '—'}
                            </span>
                          </div>
                          {f.played && goalEvents.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                              {goalEvents.map((e, gi) => (
                                <button
                                  key={gi}
                                  type="button"
                                  onClick={() => onInspectGoal?.(e, f)}
                                  title="Ver mapa do chute"
                                  className="inline-flex items-center gap-1 text-[10px] text-zinc-400 hover:text-emerald-400 cursor-pointer"
                                >
                                  <Crosshair className="w-2.5 h-2.5 text-emerald-500/80" />
                                  <span>{e.playerName} {e.minute}&apos;</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        {!f.played && (
                          <button
                            onClick={() => onWatchLive(f.id)}
                            className="px-2.5 py-1 text-[11px] font-semibold bg-emerald-500 hover:bg-emerald-400 text-zinc-950 rounded shrink-0 cursor-pointer"
                          >
                            2D
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            renderKnockoutPanel(
              'CHAMPIONS_LEAGUE',
              state.championsLeague.id,
              state.championsLeague.name,
              state.championsLeague.championClubId,
              state.championsLeague.rounds,
              state.championsLeague.currentRoundIndex
            )
          )}
        </div>
      )}

      {/* 3B. EUROPA LEAGUE BETA (GRUPOS + MATA-MATA) */}
      {subTab === 'uel' && state.europaLeague && (
        <div className="space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-[#111114] border border-amber-500/30 rounded-xl">
            <div>
              <div className="text-xs font-mono text-amber-400">
                Europa League Beta · 32 Clubes das 7 Primeiras Divisões
              </div>
              <h2 className="font-display text-lg font-bold text-white mt-0.5">
                {state.europaLeague.stage === 'GRUPOS'
                  ? `Fase de Grupos · Rodada ${state.europaLeague.groupRound} de 6`
                  : state.europaLeague.championClubId
                    ? `Campeão: ${state.clubs[state.europaLeague.championClubId]?.name}`
                    : `Mata-Mata · ${state.europaLeague.rounds[state.europaLeague.currentRoundIndex]?.name || 'Em andamento'}`}
              </h2>
            </div>

            <div className="flex items-center gap-1 p-1 bg-[#09090B] border border-zinc-800 rounded-lg self-start">
              <button
                onClick={() => setUelTab('grupos')}
                className={`px-3.5 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 cursor-pointer ${
                  uelTab === 'grupos' ? 'bg-amber-400 text-zinc-950 font-semibold' : 'text-zinc-400 hover:text-white'
                }`}
              >
                Fase de Grupos (8)
              </button>
              <button
                onClick={() => setUelTab('matamata')}
                className={`px-3.5 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 cursor-pointer ${
                  uelTab === 'matamata' ? 'bg-amber-400 text-zinc-950 font-semibold' : 'text-zinc-400 hover:text-white'
                }`}
              >
                Mata-Mata
              </button>
            </div>
          </div>

          {uelTab === 'grupos' ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {state.europaLeague.groups.map((group) => {
                  const gTable = computeChampionsGroupTable(group.id, state, 'EUROPA_LEAGUE');
                  return (
                    <div
                      key={group.id}
                      className="bg-[#111114] border border-zinc-800/90 rounded-xl overflow-hidden"
                    >
                      <div className="px-4 py-2.5 border-b border-zinc-800 bg-[#0d0d10] flex items-center justify-between">
                        <span className="font-display text-xs font-semibold text-white">
                          {group.name}
                        </span>
                        <span className="text-[10px] font-mono text-zinc-500">
                          Top 2 avançam às Oitavas
                        </span>
                      </div>
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="text-[10px] text-zinc-500 border-b border-zinc-800/70">
                            <th className="py-2 pl-3 pr-2 w-6">#</th>
                            <th className="py-2 pr-2">Clube</th>
                            <th className="py-2 px-2 text-right">J</th>
                            <th className="py-2 px-2 text-right">V</th>
                            <th className="py-2 px-2 text-right">E</th>
                            <th className="py-2 px-2 text-right">D</th>
                            <th className="py-2 px-2 text-right">SG</th>
                            <th className="py-2 pr-3 pl-2 text-right">Pts</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800/40">
                          {gTable.map((row, idx) => {
                            const club = state.clubs[row.clubId];
                            const gd = row.goalsFor - row.goalsAgainst;
                            const isUser = row.clubId === state.userClubId;
                            return (
                              <tr
                                key={row.clubId}
                                className={isUser ? 'bg-amber-500/10 text-white font-semibold' : 'text-zinc-300'}
                              >
                                <td className="py-2 pl-3 pr-2 font-mono tabular-nums">
                                  <span className={idx < 2 ? 'text-amber-400' : 'text-zinc-500'}>
                                    {idx + 1}
                                  </span>
                                </td>
                                <td className="py-2 pr-2">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <ClubCrest clubId={row.clubId} clubName={club?.name || ''} size="xs" />
                                    <span className="truncate">{club?.name}</span>
                                  </div>
                                </td>
                                <td className="py-2 px-2 text-right font-mono tabular-nums text-zinc-400">{row.played}</td>
                                <td className="py-2 px-2 text-right font-mono tabular-nums text-zinc-400">{row.won}</td>
                                <td className="py-2 px-2 text-right font-mono tabular-nums text-zinc-400">{row.drawn}</td>
                                <td className="py-2 px-2 text-right font-mono tabular-nums text-zinc-400">{row.lost}</td>
                                <td className="py-2 px-2 text-right font-mono tabular-nums text-zinc-400">
                                  {gd > 0 ? `+${gd}` : gd}
                                </td>
                                <td className="py-2 pr-3 pl-2 text-right font-mono font-bold tabular-nums text-white">
                                  {row.points}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  );
                })}
              </div>

              <div className="bg-[#111114] border border-zinc-800/90 rounded-xl p-4 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-3">
                  <h3 className="font-display text-sm font-semibold text-white">
                    Jogos da Fase de Grupos · Europa League
                  </h3>
                  <div className="flex items-center gap-1 overflow-x-auto">
                    {[1, 2, 3, 4, 5, 6].map((r) => (
                      <button
                        key={r}
                        onClick={() => setUelGroupRound(r)}
                        className={`px-3 py-1 text-xs font-mono rounded cursor-pointer ${
                          uelGroupRound === r
                            ? 'bg-amber-400 text-zinc-950 font-semibold'
                            : 'bg-[#09090B] text-zinc-400 border border-zinc-800 hover:text-white'
                        }`}
                      >
                        R{r}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {uelRoundFixtures.map(({ groupName, fixture: f }) => {
                    const home = state.clubs[f.homeClubId];
                    const away = state.clubs[f.awayClubId];
                    const isUserMatch =
                      f.homeClubId === state.userClubId || f.awayClubId === state.userClubId;
                    const goalEvents = (f.events || [])
                      .filter((e) => e.type === 'GOAL' && e.playerName)
                      .slice(0, 4);

                    return (
                      <div
                        key={f.id}
                        className={`p-3 rounded-lg border flex items-center justify-between gap-3 text-xs ${
                          isUserMatch
                            ? 'bg-amber-500/5 border-amber-500/40'
                            : 'bg-[#09090B] border-zinc-800/80'
                        }`}
                      >
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="text-[10px] font-mono text-zinc-500">{groupName}</div>
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <ClubCrest clubId={f.homeClubId} clubName={home?.name || ''} size="xs" />
                              <span className="truncate text-zinc-200">{home?.name}</span>
                            </div>
                            <span className="font-mono font-bold tabular-nums text-white">
                              {f.played ? f.homeGoals : '—'}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <ClubCrest clubId={f.awayClubId} clubName={away?.name || ''} size="xs" />
                              <span className="truncate text-zinc-200">{away?.name}</span>
                            </div>
                            <span className="font-mono font-bold tabular-nums text-white">
                              {f.played ? f.awayGoals : '—'}
                            </span>
                          </div>
                          {f.played && goalEvents.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                              {goalEvents.map((e, gi) => (
                                <button
                                  key={gi}
                                  type="button"
                                  onClick={() => onInspectGoal?.(e, f)}
                                  title="Ver mapa do chute"
                                  className="inline-flex items-center gap-1 text-[10px] text-zinc-400 hover:text-amber-300 cursor-pointer"
                                >
                                  <Crosshair className="w-2.5 h-2.5 text-amber-400/80" />
                                  <span>{e.playerName} {e.minute}&apos;</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        {!f.played && (
                          <button
                            onClick={() => onWatchLive(f.id)}
                            className="px-2.5 py-1 text-[11px] font-semibold bg-amber-400 hover:bg-amber-300 text-zinc-950 rounded shrink-0 cursor-pointer"
                          >
                            2D
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            renderKnockoutPanel(
              'EUROPA_LEAGUE',
              state.europaLeague.id,
              state.europaLeague.name,
              state.europaLeague.championClubId,
              state.europaLeague.rounds,
              state.europaLeague.currentRoundIndex
            )
          )}
        </div>
      )}

      {/* 4. COPAS LOCAIS */}
      {subTab === 'copas' && (
        <div className="space-y-5">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {DOMESTIC_CUPS_META.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedCupId(c.id)}
                className={`px-3.5 py-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  selectedCupId === c.id
                    ? 'bg-zinc-100 text-zinc-950 font-semibold'
                    : 'bg-[#111114] text-zinc-400 hover:text-white border border-zinc-800'
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>

          {activeCup &&
            renderKnockoutPanel(
              'CUP',
              activeCup.id,
              activeCup.name,
              activeCup.championClubId,
              activeCup.rounds,
              activeCup.currentRoundIndex
            )}
        </div>
      )}
    </div>
  );
};
