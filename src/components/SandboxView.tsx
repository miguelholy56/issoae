import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRightLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Crosshair,
  Dices,
  Eye,
  FastForward,
  Lock,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  StepForward,
  Trophy,
  Unlock,
  X,
} from 'lucide-react';
import { DOMESTIC_CUPS_META, LEAGUES_META } from '../data/leaguesMeta';
import { DRAFT_TIER_LABEL } from '../engine/draftEngine';
import {
  createSandboxWorld,
  sandboxAssumeClub,
  sandboxExecuteForcedDeal,
  sandboxGenerateDraftForClub,
  sandboxSetAllTransferLocks,
  sandboxSetLeagueTransferLock,
  sandboxSignDraftCandidate,
  sandboxToggleClubTransferLock,
} from '../engine/sandboxEngine';
import {
  advanceSeasonRound,
  cloneState,
  computeChampionsGroupTable,
  computeLeagueTable,
  getClubPlayers,
  getFixtureCalendarRound,
  simulateToEndSeason,
  startNewSeason,
} from '../engine/seasonEngine';
import {
  DraftCandidate,
  DraftClassTier,
  Fixture,
  GameState,
  LeagueId,
  MatchEvent,
  RawDataset,
} from '../types/game';
import { formatCurrency } from '../utils/format';
import { buildSquadExportText, copyTextToClipboard } from '../utils/squadExport';
import { ClubCrest } from './ClubCrest';
import { GoalDetailModal } from './GoalDetailModal';
import { MatchDetailModal } from './MatchDetailModal';
import { NationFlag } from './NationFlag';
import { PlayerProfileModal } from './PlayerProfileModal';
import { PlayerStatsHub } from './PlayerStatsHub';
import { TacticsSquadView } from './TacticsSquadView';

interface SandboxViewProps {
  dataset: RawDataset;
  onBack: () => void;
  onLaunchCareerFromSandbox: (sandboxState: GameState) => void;
}

type SimSpeed = '1x' | '2x' | '5x' | 'Turbo';

const SPEED_MS: Record<SimSpeed, number> = {
  '1x': 1050,
  '2x': 480,
  '5x': 160,
  Turbo: 75,
};

export const SandboxView: React.FC<SandboxViewProps> = ({
  dataset,
  onBack,
  onLaunchCareerFromSandbox,
}) => {
  const [state, setState] = useState<GameState>(() => createSandboxWorld(dataset));
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState<SimSpeed>('2x');
  const [activeTab, setActiveTab] = useState<
    'tabelas' | 'partidas' | 'estatisticas' | 'comando' | 'copas'
  >('tabelas');
  const [selectedLeague, setSelectedLeague] = useState<LeagueId>('premier-league');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [copiedClubId, setCopiedClubId] = useState<string | null>(null);

  // Inspection modals (same parity as career mode)
  const [inspectedPlayerId, setInspectedPlayerId] = useState<string | null>(null);
  const [inspectedMatchId, setInspectedMatchId] = useState<string | null>(null);
  const [inspectedGoal, setInspectedGoal] = useState<{
    event: MatchEvent;
    fixture?: Fixture | null;
  } | null>(null);

  // Partidas & Placares tab state
  const [matchScope, setMatchScope] = useState<'LEAGUE' | 'COMMANDED' | 'ALL_ROUND'>('LEAGUE');
  const [matchStatusFilter, setMatchStatusFilter] = useState<'PLAYED' | 'ALL'>('PLAYED');
  const [matchRoundView, setMatchRoundView] = useState<number>(1);
  const [autoFollowRound, setAutoFollowRound] = useState<boolean>(true);

  // Copas & Continentais tab state
  const [compSubTab, setCompSubTab] = useState<'ucl' | 'uel' | 'copas'>('ucl');
  const [uclStageTab, setUclStageTab] = useState<'grupos' | 'matamata'>('grupos');
  const [uclGroupRound, setUclGroupRound] = useState<number>(1);
  const [uelStageTab, setUelStageTab] = useState<'grupos' | 'matamata'>('grupos');
  const [uelGroupRound, setUelGroupRound] = useState<number>(1);
  const [selectedCupId, setSelectedCupId] = useState<string>(DOMESTIC_CUPS_META[0].id);

  // Forced Transfer / Loan modal state
  const [dealModalOpen, setDealModalOpen] = useState(false);
  const [dealFromClubId, setDealFromClubId] = useState<string>(() => state.userClubId);
  const [dealPlayerId, setDealPlayerId] = useState<string>('');
  const [dealToClubId, setDealToClubId] = useState<string>('');
  const [dealType, setDealType] = useState<'TRANSFER' | 'LOAN'>('TRANSFER');
  const [dealAmountMillions, setDealAmountMillions] = useState<string>('15');
  const [dealBuyOptMillions, setDealBuyOptMillions] = useState<string>('25');
  const [dealAdjustBudgets, setDealAdjustBudgets] = useState<boolean>(true);

  // Sandbox Draft modal state
  const [draftModalOpen, setDraftModalOpen] = useState(false);
  const [draftTargetClubId, setDraftTargetClubId] = useState<string>(() => state.userClubId);
  const [draftTier, setDraftTier] = useState<DraftClassTier>('VETERANO');
  const [draftOfferings, setDraftOfferings] = useState<
    Record<DraftClassTier, DraftCandidate[]> | null
  >(null);
  const [draftDeductBudget, setDraftDeductBudget] = useState<boolean>(true);

  // Live real-time simulation ticker
  useEffect(() => {
    if (!isPlaying) return;
    if (state.phase === 'FINAL_TEMPORADA') {
      setIsPlaying(false);
      return;
    }
    const timer = window.setInterval(() => {
      setState((prev) => {
        if (prev.phase === 'FINAL_TEMPORADA') {
          return prev;
        }
        return advanceSeasonRound(prev);
      });
    }, SPEED_MS[speed]);

    return () => window.clearInterval(timer);
  }, [isPlaying, speed, state.phase]);

  const userClub = state.clubs[state.userClubId];
  const userLeague = userClub
    ? state.leagues[userClub.leagueId]
    : state.leagues['premier-league'];
  const selectedLeagueObj = state.leagues[selectedLeague];

  const latestPlayedRoundForLeague = useMemo(() => {
    if (!selectedLeagueObj) return 1;
    if (state.phase === 'FINAL_TEMPORADA') return selectedLeagueObj.totalRounds;
    return Math.max(1, selectedLeagueObj.currentRound - 1);
  }, [selectedLeagueObj, state.phase]);

  useEffect(() => {
    if (autoFollowRound) {
      setMatchRoundView(latestPlayedRoundForLeague);
    }
  }, [latestPlayedRoundForLeague, autoFollowRound]);

  useEffect(() => {
    if (state.championsLeague.stage !== 'GRUPOS') setUclStageTab('matamata');
    else setUclStageTab('grupos');
  }, [state.championsLeague.stage]);

  useEffect(() => {
    if (state.europaLeague && state.europaLeague.stage !== 'GRUPOS') {
      setUelStageTab('matamata');
    } else {
      setUelStageTab('grupos');
    }
  }, [state.europaLeague?.stage]);

  const lockedSet = useMemo(
    () => new Set(state.sandboxLockedTransferClubIds || []),
    [state.sandboxLockedTransferClubIds]
  );

  const table = useMemo(
    () => computeLeagueTable(selectedLeague, state),
    [selectedLeague, state]
  );
  const leagueMeta = LEAGUES_META.find((l) => l.id === selectedLeague)!;

  const allClubsSorted = useMemo(
    () => Object.values(state.clubs).slice().sort((a, b) => a.name.localeCompare(b.name)),
    [state.clubs]
  );

  const latestRoundFixtures = useMemo(() => {
    const curR = latestPlayedRoundForLeague;
    return Object.values(state.fixtures)
      .filter(
        (f) =>
          f.competitionType === 'LEAGUE' &&
          f.competitionId === selectedLeague &&
          f.played &&
          f.round === curR
      )
      .slice(0, 10);
  }, [state.fixtures, selectedLeague, latestPlayedRoundForLeague]);

  const matchCenterFixtures = useMemo(() => {
    const all = Object.values(state.fixtures);
    if (matchScope === 'COMMANDED') {
      return all
        .filter((f) => f.homeClubId === state.userClubId || f.awayClubId === state.userClubId)
        .filter((f) => (matchStatusFilter === 'PLAYED' ? f.played : true))
        .sort((a, b) => {
          const ra = getFixtureCalendarRound(a, state);
          const rb = getFixtureCalendarRound(b, state);
          if (matchStatusFilter === 'PLAYED') return rb - ra;
          return ra - rb;
        });
    }

    if (matchScope === 'LEAGUE') {
      return all
        .filter(
          (f) =>
            f.competitionType === 'LEAGUE' &&
            f.competitionId === selectedLeague &&
            f.round === matchRoundView &&
            (matchStatusFilter === 'PLAYED' ? f.played : true)
        )
        .sort((a, b) => (a.id > b.id ? 1 : -1));
    }

    // ALL_ROUND: all matches scheduled on matchRoundView across leagues + cups + continental
    return all
      .filter((f) => {
        const cal = getFixtureCalendarRound(f, state);
        if (cal !== matchRoundView) return false;
        return matchStatusFilter === 'PLAYED' ? f.played : true;
      })
      .sort((a, b) => {
        if (a.competitionType !== b.competitionType) {
          return a.competitionType === 'LEAGUE' ? 1 : -1;
        }
        return a.competitionName.localeCompare(b.competitionName);
      });
  }, [
    state,
    matchScope,
    matchStatusFilter,
    selectedLeague,
    matchRoundView,
  ]);

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

  const commandedClubPlayers = useMemo(
    () => getClubPlayers(state.userClubId, state.players),
    [state.userClubId, state.players]
  );

  const originPlayers = useMemo(
    () =>
      Object.values(state.players)
        .filter((p) => p.clubId === dealFromClubId)
        .sort((a, b) => b.overall - a.overall),
    [state.players, dealFromClubId]
  );

  const handleCopyClubSquadText = async (clubId: string) => {
    const club = state.clubs[clubId];
    if (!club) return;
    const players = getClubPlayers(clubId, state.players);
    const text = buildSquadExportText(state, club, players);
    const ok = await copyTextToClipboard(text);
    if (ok) {
      setCopiedClubId(clubId);
      setFeedback(
        `Elenco completo de ${club.name} (${players.length} atletas) copiado em texto!`
      );
      window.setTimeout(() => {
        setCopiedClubId((cur) => (cur === clubId ? null : cur));
      }, 2200);
    } else {
      setFeedback('Não foi possível copiar automaticamente para a área de transferência.');
    }
  };

  const handleAdvanceMultipleRounds = (count: number) => {
    setIsPlaying(false);
    setState((prev) => {
      let cur = prev;
      for (let i = 0; i < count; i++) {
        if (cur.phase === 'FINAL_TEMPORADA') break;
        cur = advanceSeasonRound(cur);
      }
      return cur;
    });
  };

  const openForcedDealModal = (presetFromClubId?: string) => {
    setIsPlaying(false);
    const fromId = presetFromClubId || state.userClubId;
    const fromSquad = Object.values(state.players)
      .filter((p) => p.clubId === fromId)
      .sort((a, b) => b.overall - a.overall);
    const firstP = fromSquad[0];
    const otherClub = allClubsSorted.find((c) => c.id !== fromId)?.id || '';
    setDealFromClubId(fromId);
    setDealPlayerId(firstP?.id || '');
    setDealToClubId(otherClub);
    setDealAmountMillions(firstP ? (firstP.value / 1_000_000).toFixed(1) : '10');
    setDealModalOpen(true);
  };

  const openDraftModal = (clubId?: string) => {
    setIsPlaying(false);
    const targetId = clubId || state.userClubId;
    setDraftTargetClubId(targetId);
    setDraftOfferings(sandboxGenerateDraftForClub(state, targetId));
    setDraftTier('VETERANO');
    setDraftModalOpen(true);
  };

  const handleConfirmForcedDeal = () => {
    if (!dealPlayerId || !dealToClubId) return;
    const amount = Math.max(
      0,
      Math.round((parseFloat(dealAmountMillions.replace(',', '.')) || 0) * 1_000_000)
    );
    const buyOpt = Math.max(
      0,
      Math.round((parseFloat(dealBuyOptMillions.replace(',', '.')) || 0) * 1_000_000)
    );
    const res = sandboxExecuteForcedDeal(state, {
      playerId: dealPlayerId,
      toClubId: dealToClubId,
      type: dealType,
      amount,
      buyOptionPrice: dealType === 'LOAN' && buyOpt > 0 ? buyOpt : undefined,
      adjustBudgets: dealAdjustBudgets,
    });
    if (res.error) {
      setFeedback(res.error);
      return;
    }
    setState(res.state);
    const pName = state.players[dealPlayerId]?.name || 'Atleta';
    const toName = state.clubs[dealToClubId]?.name || dealToClubId;
    setFeedback(
      `${dealType === 'LOAN' ? 'Empréstimo forçado' : 'Transferência forçada'} concluída: ${pName} → ${toName} por ${formatCurrency(amount)}.`
    );
    setDealModalOpen(false);
  };

  const handleAssumeClub = (clubId: string) => {
    const next = sandboxAssumeClub(state, clubId);
    setState(next);
    const club = next.clubs[clubId];
    if (club) {
      setSelectedLeague(club.leagueId);
      setFeedback(
        `Você assumiu o comando do ${club.name}. Ajuste táticas ou abra "Comando do Clube".`
      );
    }
  };

  const currentDraftCards = draftOfferings ? draftOfferings[draftTier] || [] : [];
  const draftTargetClub = state.clubs[draftTargetClubId];
  const activeCup = state.cups[selectedCupId];

  const renderInteractiveFixtureCard = (f: Fixture, groupBadge?: string) => {
    const home = state.clubs[f.homeClubId];
    const away = state.clubs[f.awayClubId];
    const isCommanded = f.homeClubId === state.userClubId || f.awayClubId === state.userClubId;
    const goalEvents = (f.events || []).filter((e) => e.type === 'GOAL');
    const mvp = f.playerRatings
      ? Object.entries(f.playerRatings).sort((a, b) => b[1] - a[1])[0]
      : null;
    const mvpPlayer = mvp ? state.players[mvp[0]] : null;

    return (
      <div
        key={f.id}
        className={`p-3.5 rounded-xl border space-y-2.5 text-xs transition-colors ${
          isCommanded
            ? 'bg-emerald-500/5 border-emerald-500/40'
            : 'bg-[#09090B] border-zinc-800/90 hover:border-zinc-700'
        }`}
      >
        <div className="flex items-center justify-between gap-2 text-[11px] font-mono text-zinc-500">
          <span className="truncate">
            {groupBadge ? `${groupBadge} · ` : ''}
            {f.competitionName} · {f.roundLabel}
          </span>
          {f.played && (
            <button
              type="button"
              onClick={() => setInspectedMatchId(f.id)}
              className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-sans font-medium bg-[#111114] border border-zinc-800 hover:border-emerald-500/50 text-emerald-400 rounded shrink-0 cursor-pointer"
            >
              <Eye className="w-3 h-3" />
              Ver Partida
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => f.played && setInspectedMatchId(f.id)}
          className={`w-full flex items-center justify-between gap-3 text-left ${
            f.played ? 'cursor-pointer' : 'cursor-default'
          }`}
        >
          <div className="flex-1 flex items-center justify-end gap-2 min-w-0">
            <span className="font-medium text-white truncate text-right">
              {home?.name || f.homeClubId}
            </span>
            <ClubCrest clubId={f.homeClubId} clubName={home?.name || ''} size="xs" />
          </div>

          <span className="px-2.5 py-1 bg-[#111114] border border-zinc-800 rounded font-mono font-bold tabular-nums text-white shrink-0">
            {f.played ? `${f.homeGoals ?? 0} - ${f.awayGoals ?? 0}` : 'vs'}
          </span>

          <div className="flex-1 flex items-center gap-2 min-w-0">
            <ClubCrest clubId={f.awayClubId} clubName={away?.name || ''} size="xs" />
            <span className="font-medium text-white truncate">
              {away?.name || f.awayClubId}
            </span>
          </div>
        </button>

        {f.played && (f.penaltiesWinnerId || goalEvents.length > 0 || (mvpPlayer && mvp)) && (
          <div className="pt-1.5 border-t border-zinc-800/60 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {f.penaltiesWinnerId && (
                <span className="text-[10px] font-mono text-amber-400 mr-1">
                  Pên.: {state.clubs[f.penaltiesWinnerId]?.shortName}
                </span>
              )}
              {goalEvents.slice(0, 6).map((ev, gi) => (
                <button
                  key={gi}
                  type="button"
                  onClick={() => setInspectedGoal({ event: ev, fixture: f })}
                  title="Ver mapa do chute e detalhes do gol"
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#111114] border border-zinc-800 hover:border-emerald-500/50 text-[10px] text-zinc-300 hover:text-emerald-300 cursor-pointer"
                >
                  <Crosshair className="w-2.5 h-2.5 text-emerald-400" />
                  <span className="font-mono text-emerald-400">{ev.minute}&apos;</span>
                  <span>{ev.playerName || 'Gol'}</span>
                </button>
              ))}
            </div>

            {mvpPlayer && mvp && (
              <span className="text-[10px] font-mono tabular-nums text-zinc-500">
                MVP: {mvpPlayer.name} ({mvp[1].toFixed(1)})
              </span>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderContinentalView = (
    compType: 'CHAMPIONS_LEAGUE' | 'EUROPA_LEAGUE',
    comp: NonNullable<GameState['championsLeague']>,
    stageTab: 'grupos' | 'matamata',
    setStageTab: (t: 'grupos' | 'matamata') => void,
    groupRound: number,
    setGroupRound: (r: number) => void,
    roundFixtures: { groupName: string; fixture: Fixture }[]
  ) => {
    const isUel = compType === 'EUROPA_LEAGUE';
    const accentBg = isUel ? 'bg-amber-400 text-zinc-950' : 'bg-emerald-500 text-zinc-950';
    const accentText = isUel ? 'text-amber-400' : 'text-emerald-400';

    return (
      <div className="space-y-5">
        <div
          className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-[#111114] border rounded-xl ${
            isUel ? 'border-amber-500/35' : 'border-emerald-500/35'
          }`}
        >
          <div>
            <div className={`text-xs font-mono ${accentText}`}>
              {comp.name} · 32 Clubes das 7 Primeiras Divisões
            </div>
            <h2 className="font-display text-lg font-bold text-white mt-0.5">
              {comp.stage === 'GRUPOS'
                ? `Fase de Grupos · Rodada ${comp.groupRound} de 6`
                : comp.championClubId
                  ? `Campeão: ${state.clubs[comp.championClubId]?.name}`
                  : `Mata-Mata · ${comp.rounds[comp.currentRoundIndex]?.name || 'Em andamento'}`}
            </h2>
          </div>

          <div className="flex items-center gap-1 p-1 bg-[#09090B] border border-zinc-800 rounded-lg self-start">
            <button
              onClick={() => setStageTab('grupos')}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                stageTab === 'grupos' ? `${accentBg} font-semibold` : 'text-zinc-400 hover:text-white'
              }`}
            >
              Fase de Grupos (8)
            </button>
            <button
              onClick={() => setStageTab('matamata')}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                stageTab === 'matamata'
                  ? `${accentBg} font-semibold`
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Mata-Mata
            </button>
          </div>
        </div>

        {stageTab === 'grupos' ? (
          <div className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {comp.groups.map((group) => {
                const gTable = computeChampionsGroupTable(group.id, state, compType);
                return (
                  <div
                    key={group.id}
                    className="bg-[#111114] border border-zinc-800/90 rounded-xl overflow-hidden"
                  >
                    <div className="px-4 py-2.5 border-b border-zinc-800 bg-[#0d0d10] flex items-center justify-between">
                      <span className="font-display text-xs font-semibold text-white">
                        {group.name}
                      </span>
                      <span className="text-[10px] font-mono text-zinc-500">Top 2 avançam</span>
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
                          const isCmd = row.clubId === state.userClubId;
                          return (
                            <tr
                              key={row.clubId}
                              className={
                                isCmd ? 'bg-emerald-500/10 text-white font-semibold' : 'text-zinc-300'
                              }
                            >
                              <td className="py-2 pl-3 pr-2 font-mono tabular-nums">
                                <span className={idx < 2 ? accentText : 'text-zinc-500'}>
                                  {idx + 1}
                                </span>
                              </td>
                              <td className="py-2 pr-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <ClubCrest
                                    clubId={row.clubId}
                                    clubName={club?.name || ''}
                                    size="xs"
                                  />
                                  <span className="truncate">{club?.name}</span>
                                </div>
                              </td>
                              <td className="py-2 px-2 text-right font-mono tabular-nums text-zinc-400">
                                {row.played}
                              </td>
                              <td className="py-2 px-2 text-right font-mono tabular-nums text-zinc-400">
                                {row.won}
                              </td>
                              <td className="py-2 px-2 text-right font-mono tabular-nums text-zinc-400">
                                {row.drawn}
                              </td>
                              <td className="py-2 px-2 text-right font-mono tabular-nums text-zinc-400">
                                {row.lost}
                              </td>
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
                  Jogos & Placares dos Grupos ({comp.name})
                </h3>
                <div className="flex items-center gap-1 overflow-x-auto">
                  {[1, 2, 3, 4, 5, 6].map((r) => (
                    <button
                      key={r}
                      onClick={() => setGroupRound(r)}
                      className={`px-3 py-1 text-xs font-mono rounded cursor-pointer ${
                        groupRound === r
                          ? `${accentBg} font-semibold`
                          : 'bg-[#09090B] text-zinc-400 border border-zinc-800 hover:text-white'
                      }`}
                    >
                      R{r}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {roundFixtures.map(({ groupName, fixture }) =>
                  renderInteractiveFixtureCard(fixture, groupName)
                )}
              </div>
            </div>
          </div>
        ) : comp.rounds.length === 0 ? (
          <div className="p-8 bg-[#111114] border border-zinc-800/90 rounded-xl text-center text-xs text-zinc-400">
            Aguardando o término das 6 rodadas da Fase de Grupos para sortear as Oitavas de Final.
          </div>
        ) : (
          <div className="space-y-4">
            {comp.rounds
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
                      {r.fixtureIds.filter((id) => state.fixtures[id]?.played).length}/
                      {r.fixtureIds.length} jogos
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {r.fixtureIds.map((fid) => {
                      const f = state.fixtures[fid];
                      return f ? renderInteractiveFixtureCard(f) : null;
                    })}
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#09090B] text-zinc-100">
      {/* Top Bar */}
      <header className="sticky top-0 z-30 border-b border-zinc-800/80 bg-[#09090B]/95 backdrop-blur">
        <div className="max-w-[1440px] mx-auto px-6 h-16 flex items-center justify-between gap-6">
          <div className="flex items-center gap-4 min-w-0">
            <button
              onClick={onBack}
              className="inline-flex items-center gap-2 text-xs font-medium text-zinc-300 hover:text-white whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              Voltar ao Menu
            </button>
            <div className="h-5 w-px bg-zinc-800 hidden sm:block" />
            <span className="font-display text-base font-bold text-white whitespace-nowrap truncate">
              Modo Sandbox
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {userClub && (
              <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 bg-[#111114] border border-zinc-800 rounded-lg text-xs">
                <ClubCrest clubId={userClub.id} clubName={userClub.name} size="xs" />
                <span className="text-zinc-300 font-medium">Comando: {userClub.name}</span>
              </div>
            )}
            <button
              onClick={() => openForcedDealModal()}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-100 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ArrowRightLeft className="w-3.5 h-3.5 text-emerald-400" />
              Transferência / Empréstimo
            </button>
            <button
              onClick={() => openDraftModal()}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-amber-400 hover:bg-amber-300 text-zinc-950 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Dices className="w-3.5 h-3.5" />
              Chamar Draft
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1440px] mx-auto px-6 py-6 space-y-5">
        {/* Real-Time Simulation & World Control Bar */}
        <div className="p-4 bg-[#111114] border border-zinc-800/90 rounded-xl flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-5">
            <div>
              <div className="text-[11px] font-mono text-zinc-500">Temporada & Rodada</div>
              <div className="font-mono text-base font-bold tabular-nums text-white">
                {state.season} · Rodada {Math.min(userLeague.currentRound, userLeague.totalRounds)}/
                {userLeague.totalRounds}
              </div>
            </div>
            <div className="h-8 w-px bg-zinc-800 hidden sm:block" />
            <div>
              <div className="text-[11px] font-mono text-zinc-500">Fase da Janela</div>
              <div className="text-xs font-semibold text-emerald-400 mt-0.5">
                {state.phase === 'INICIO_JANELA'
                  ? 'Início (Janela)'
                  : state.phase === 'MEIO_JANELA'
                    ? 'Meio (Janela)'
                    : 'Fim da Temporada'}
              </div>
            </div>
            <div className="h-8 w-px bg-zinc-800 hidden sm:block" />
            <div>
              <div className="text-[11px] font-mono text-zinc-500">Clubes com IA Travada</div>
              <div className="font-mono text-sm font-bold tabular-nums text-amber-400 mt-0.5">
                {lockedSet.size} {lockedSet.size === 1 ? 'clube' : 'clubes'}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Speed Control (including Turbo) */}
            <div className="flex items-center gap-0.5 p-1 bg-[#09090B] border border-zinc-800 rounded-lg">
              {(['1x', '2x', '5x', 'Turbo'] as const).map((sp) => (
                <button
                  key={sp}
                  onClick={() => setSpeed(sp)}
                  className={`px-2.5 py-1 text-[11px] font-mono font-semibold rounded cursor-pointer ${
                    speed === sp ? 'bg-zinc-200 text-zinc-950' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {sp}
                </button>
              ))}
            </div>

            {state.phase !== 'FINAL_TEMPORADA' ? (
              <>
                <button
                  onClick={() => setIsPlaying((v) => !v)}
                  className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg whitespace-nowrap cursor-pointer ${
                    isPlaying
                      ? 'bg-amber-400 hover:bg-amber-300 text-zinc-950'
                      : 'bg-emerald-500 hover:bg-emerald-400 text-zinc-950'
                  }`}
                >
                  {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  {isPlaying ? 'Pausar Tempo Real' : 'Rodar em Tempo Real'}
                </button>

                <button
                  onClick={() => handleAdvanceMultipleRounds(1)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded-lg whitespace-nowrap cursor-pointer"
                >
                  <StepForward className="w-3.5 h-3.5" />
                  +1 Rodada
                </button>

                <button
                  onClick={() => handleAdvanceMultipleRounds(5)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-emerald-300 rounded-lg whitespace-nowrap cursor-pointer"
                  title="Avança rapidamente 5 rodadas de uma só vez"
                >
                  <FastForward className="w-3.5 h-3.5" />
                  +5 Rodadas
                </button>

                <button
                  onClick={() => {
                    setIsPlaying(false);
                    setState((prev) => simulateToEndSeason(prev));
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded-lg whitespace-nowrap cursor-pointer"
                >
                  <FastForward className="w-3.5 h-3.5" />
                  Simular Resto
                </button>
              </>
            ) : (
              <button
                onClick={() => setState((prev) => startNewSeason(prev))}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-zinc-950 rounded-lg whitespace-nowrap cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Nova Temporada {state.season + 1}
              </button>
            )}

            <button
              onClick={() => {
                setIsPlaying(false);
                setState(createSandboxWorld(dataset));
                setFeedback('Mundo Sandbox reiniciado para a temporada inicial.');
              }}
              title="Reiniciar mundo Sandbox"
              className="p-2 text-zinc-400 hover:text-white bg-[#09090B] border border-zinc-800 rounded-lg cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {feedback && (
          <div className="px-4 py-2.5 bg-[#111114] border border-emerald-500/40 rounded-xl flex items-center justify-between gap-3 text-xs text-emerald-300">
            <span>{feedback}</span>
            <button onClick={() => setFeedback(null)} className="text-zinc-500 hover:text-white cursor-pointer">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Sandbox Navigation Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1 p-1 bg-[#111114] border border-zinc-800 rounded-lg overflow-x-auto">
            {[
              { id: 'tabelas', label: 'Tabelas & Tempo Real' },
              { id: 'partidas', label: 'Partidas & Placares' },
              { id: 'estatisticas', label: 'Estatísticas da Temporada' },
              { id: 'comando', label: `Comando: ${userClub?.shortName || 'Clube'}` },
              { id: 'copas', label: 'Champions, Europa & Copas' },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id as typeof activeTab)}
                className={`px-3.5 py-1.5 text-xs font-medium rounded-md whitespace-nowrap cursor-pointer ${
                  activeTab === t.id
                    ? 'bg-emerald-500 text-zinc-950 font-semibold'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {userClub && (
            <button
              onClick={() => {
                setIsPlaying(false);
                onLaunchCareerFromSandbox(state);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-[#111114] hover:bg-zinc-900 border border-emerald-500/40 text-emerald-400 rounded-lg whitespace-nowrap cursor-pointer"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              Jogar Carreira com {userClub.shortName}
            </button>
          )}
        </div>

        {/* TAB 1: LIVE TABLES + LOCK AI + INTERACTIVE LIVE SCORES */}
        {activeTab === 'tabelas' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                {LEAGUES_META.map((l) => (
                  <button
                    key={l.id}
                    onClick={() => setSelectedLeague(l.id)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap cursor-pointer ${
                      selectedLeague === l.id
                        ? 'bg-zinc-100 text-zinc-950 font-semibold'
                        : 'bg-[#111114] text-zinc-400 hover:text-white border border-zinc-800'
                    }`}
                  >
                    {l.name}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => {
                    setState((prev) => sandboxSetLeagueTransferLock(prev, selectedLeague, true));
                    setFeedback(`IA de transferências travada para toda a ${leagueMeta.name}.`);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#111114] hover:bg-zinc-900 border border-zinc-800 text-amber-300 rounded-lg cursor-pointer"
                >
                  <Lock className="w-3 h-3" />
                  Travar IA da Liga
                </button>
                <button
                  onClick={() => {
                    setState((prev) => sandboxSetAllTransferLocks(prev, false));
                    setFeedback('Todas as travas de IA de transferências foram removidas.');
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#111114] hover:bg-zinc-900 border border-zinc-800 text-zinc-300 rounded-lg cursor-pointer"
                >
                  <Unlock className="w-3 h-3" />
                  Destravar Todos
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Live League Table */}
              <div className="lg:col-span-8 bg-[#111114] border border-zinc-800/90 rounded-xl overflow-x-auto">
                <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between gap-3">
                  <h2 className="font-display text-sm font-semibold text-white">
                    {leagueMeta.name} · Classificação ao Vivo
                  </h2>
                  <span className="text-[11px] font-mono text-zinc-400">
                    Verde = Champions/Acesso · Âmbar = Europa League · Clique para assumir ou copiar elenco
                  </span>
                </div>
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="text-[11px] text-zinc-500 border-b border-zinc-800 bg-[#0d0d10]">
                      <th className="py-2 pl-3 pr-2 w-7">#</th>
                      <th className="py-2 pr-2">Clube</th>
                      <th className="py-2 px-2 text-right">J</th>
                      <th className="py-2 px-2 text-right">V</th>
                      <th className="py-2 px-2 text-right">E</th>
                      <th className="py-2 px-2 text-right">D</th>
                      <th className="py-2 px-2 text-right">SG</th>
                      <th className="py-2 px-2 text-right">Pts</th>
                      <th className="py-2 px-2 text-right hidden sm:table-cell">Verba</th>
                      <th className="py-2 pl-2 pr-3 text-right">Controles</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/50">
                    {table.map((row, idx) => {
                      const club = state.clubs[row.clubId];
                      if (!club) return null;
                      const isCmd = row.clubId === state.userClubId;
                      const isLocked = lockedSet.has(row.clubId);
                      const isCopied = copiedClubId === club.id;
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
                          className={
                            isCmd ? 'bg-emerald-500/10 text-white' : 'text-zinc-300 hover:bg-zinc-900/50'
                          }
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
                          <td className="py-2 pr-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <ClubCrest clubId={club.id} clubName={club.name} size="xs" />
                              <span
                                className={`truncate ${
                                  isCmd ? 'font-bold text-emerald-300' : 'font-medium'
                                }`}
                              >
                                {club.name}
                              </span>
                            </div>
                          </td>
                          <td className="py-2 px-2 text-right font-mono tabular-nums text-zinc-400">
                            {row.played}
                          </td>
                          <td className="py-2 px-2 text-right font-mono tabular-nums text-zinc-400">
                            {row.won}
                          </td>
                          <td className="py-2 px-2 text-right font-mono tabular-nums text-zinc-400">
                            {row.drawn}
                          </td>
                          <td className="py-2 px-2 text-right font-mono tabular-nums text-zinc-400">
                            {row.lost}
                          </td>
                          <td className="py-2 px-2 text-right font-mono tabular-nums text-zinc-400">
                            {gd > 0 ? `+${gd}` : gd}
                          </td>
                          <td className="py-2 px-2 text-right font-mono tabular-nums font-bold text-white">
                            {row.points}
                          </td>
                          <td className="py-2 px-2 text-right font-mono tabular-nums text-emerald-400 hidden sm:table-cell">
                            {formatCurrency(club.budget)}
                          </td>
                          <td className="py-2 pl-2 pr-3 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleCopyClubSquadText(club.id)}
                                title={`Copiar elenco completo de ${club.name} em texto`}
                                className={`p-1.5 rounded border cursor-pointer ${
                                  isCopied
                                    ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-400'
                                    : 'bg-[#09090B] border-zinc-800 text-zinc-400 hover:text-white'
                                }`}
                              >
                                {isCopied ? (
                                  <Check className="w-3 h-3" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </button>
                              <button
                                onClick={() =>
                                  setState((prev) => sandboxToggleClubTransferLock(prev, club.id))
                                }
                                title={
                                  isLocked
                                    ? 'Destravar transferências de IA'
                                    : 'Impedir transferências de IA neste clube'
                                }
                                className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded border cursor-pointer ${
                                  isLocked
                                    ? 'bg-amber-500/15 border-amber-500/50 text-amber-300'
                                    : 'bg-[#09090B] border-zinc-800 text-zinc-400 hover:text-white'
                                }`}
                              >
                                {isLocked ? (
                                  <Lock className="w-3 h-3" />
                                ) : (
                                  <Unlock className="w-3 h-3" />
                                )}
                                <span className="hidden xl:inline">
                                  {isLocked ? 'Travada' : 'IA Livre'}
                                </span>
                              </button>
                              <button
                                onClick={() => handleAssumeClub(club.id)}
                                className={`px-2.5 py-1 text-[11px] font-semibold rounded cursor-pointer ${
                                  isCmd
                                    ? 'bg-emerald-500 text-zinc-950'
                                    : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-100'
                                }`}
                              >
                                {isCmd ? 'Comando' : 'Assumir'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Right 4 cols: Clickable Live Matchday Scores & Transfers */}
              <div className="lg:col-span-4 space-y-4">
                <div className="p-4 bg-[#111114] border border-zinc-800/90 rounded-xl space-y-3">
                  <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                    <div>
                      <h3 className="font-display text-sm font-semibold text-white">
                        Últimos Placares ({leagueMeta.name})
                      </h3>
                      <div className="text-[10px] text-zinc-500">
                        Clique no placar p/ detalhes ou no gol p/ mapa do chute
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab('partidas')}
                      className="text-[11px] font-mono text-emerald-400 hover:underline shrink-0 cursor-pointer"
                    >
                      Rod. {latestPlayedRoundForLeague} →
                    </button>
                  </div>

                  {latestRoundFixtures.length === 0 ? (
                    <p className="text-xs text-zinc-500 py-3">
                      Clique em &quot;Rodar em Tempo Real&quot; ou &quot;+1 Rodada&quot; para acompanhar os placares.
                    </p>
                  ) : (
                    <div className="divide-y divide-zinc-800/60 text-xs">
                      {latestRoundFixtures.map((f) => {
                        const h = state.clubs[f.homeClubId];
                        const a = state.clubs[f.awayClubId];
                        const goals = (f.events || []).filter((e) => e.type === 'GOAL').slice(0, 4);
                        return (
                          <div key={f.id} className="py-2.5 space-y-1">
                            <button
                              type="button"
                              onClick={() => setInspectedMatchId(f.id)}
                              className="w-full flex items-center justify-between gap-2 hover:text-emerald-300 cursor-pointer"
                            >
                              <span className="truncate flex-1 text-left text-zinc-200">
                                {h?.shortName}
                              </span>
                              <span className="font-mono font-bold tabular-nums text-white px-2 py-0.5 bg-[#09090B] border border-zinc-800 rounded">
                                {f.homeGoals} - {f.awayGoals}
                              </span>
                              <span className="truncate flex-1 text-right text-zinc-200">
                                {a?.shortName}
                              </span>
                            </button>
                            {goals.length > 0 && (
                              <div className="flex flex-wrap items-center gap-1.5">
                                {goals.map((ev, idx) => (
                                  <button
                                    key={idx}
                                    type="button"
                                    onClick={() => setInspectedGoal({ event: ev, fixture: f })}
                                    className="inline-flex items-center gap-1 text-[10px] text-zinc-400 hover:text-emerald-400 cursor-pointer"
                                  >
                                    <Crosshair className="w-2.5 h-2.5 text-emerald-500/80" />
                                    <span>
                                      {ev.playerName} {ev.minute}&apos;
                                    </span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="p-4 bg-[#111114] border border-zinc-800/90 rounded-xl space-y-3">
                  <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                    <h3 className="font-display text-sm font-semibold text-white">
                      Movimentações Recentes
                    </h3>
                    <span className="text-[11px] font-mono text-zinc-500">
                      {state.transferHistory.length} total
                    </span>
                  </div>
                  {state.transferHistory.length === 0 ? (
                    <p className="text-xs text-zinc-500 py-3">
                      Nenhuma transferência registrada ainda.
                    </p>
                  ) : (
                    <div className="divide-y divide-zinc-800/60 text-xs max-h-72 overflow-y-auto">
                      {state.transferHistory.slice(0, 12).map((tr) => (
                        <div key={tr.id} className="py-2 space-y-0.5">
                          <div className="flex items-center justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => setInspectedPlayerId(tr.playerId)}
                              className="font-semibold text-white hover:text-emerald-400 truncate text-left cursor-pointer"
                            >
                              {tr.playerName}
                            </button>
                            <span className="font-mono text-emerald-400 shrink-0 tabular-nums">
                              {tr.type === 'LOAN'
                                ? `Emp. ${formatCurrency(tr.amount)}`
                                : formatCurrency(tr.amount)}
                            </span>
                          </div>
                          <div className="text-[11px] text-zinc-500 truncate">
                            {state.clubs[tr.fromClubId]?.shortName} →{' '}
                            {state.clubs[tr.toClubId]?.shortName} · {tr.reason}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: FULL MATCH & SCORES CENTER (LIKE NORMAL MODE) */}
        {activeTab === 'partidas' && (
          <div className="space-y-4">
            <div className="p-4 bg-[#111114] border border-zinc-800/90 rounded-xl flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1 p-1 bg-[#09090B] border border-zinc-800 rounded-lg">
                  {[
                    { id: 'LEAGUE', label: `Liga: ${leagueMeta.name}` },
                    { id: 'COMMANDED', label: `Jogos: ${userClub?.shortName || 'Clube'}` },
                    { id: 'ALL_ROUND', label: 'Tudo na Rodada' },
                  ].map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setMatchScope(m.id as typeof matchScope)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                        matchScope === m.id
                          ? 'bg-emerald-500 text-zinc-950 font-semibold'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>

                {matchScope === 'LEAGUE' && (
                  <select
                    value={selectedLeague}
                    onChange={(e) => setSelectedLeague(e.target.value as LeagueId)}
                    className="px-3 py-2 bg-[#09090B] border border-zinc-800 rounded-lg text-xs text-white"
                  >
                    {LEAGUES_META.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                )}

                <div className="flex items-center gap-1 p-1 bg-[#09090B] border border-zinc-800 rounded-lg">
                  <button
                    onClick={() => setMatchStatusFilter('PLAYED')}
                    className={`px-2.5 py-1 text-xs rounded cursor-pointer ${
                      matchStatusFilter === 'PLAYED'
                        ? 'bg-zinc-200 text-zinc-950 font-semibold'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    Placares
                  </button>
                  <button
                    onClick={() => setMatchStatusFilter('ALL')}
                    className={`px-2.5 py-1 text-xs rounded cursor-pointer ${
                      matchStatusFilter === 'ALL'
                        ? 'bg-zinc-200 text-zinc-950 font-semibold'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    Todos / Próximos
                  </button>
                </div>
              </div>

              {matchScope !== 'COMMANDED' && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setAutoFollowRound(false);
                      setMatchRoundView((r) => Math.max(1, r - 1));
                    }}
                    className="p-1.5 bg-[#09090B] border border-zinc-800 rounded-lg text-zinc-300 hover:text-white cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="font-mono text-xs font-bold tabular-nums text-white px-2">
                    Rodada {matchRoundView}/{selectedLeagueObj?.totalRounds || 38}
                  </span>
                  <button
                    onClick={() => {
                      setAutoFollowRound(false);
                      setMatchRoundView((r) =>
                        Math.min(selectedLeagueObj?.totalRounds || 38, r + 1)
                      );
                    }}
                    className="p-1.5 bg-[#09090B] border border-zinc-800 rounded-lg text-zinc-300 hover:text-white cursor-pointer"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  {!autoFollowRound && (
                    <button
                      onClick={() => {
                        setAutoFollowRound(true);
                        setMatchRoundView(latestPlayedRoundForLeague);
                      }}
                      className="px-2.5 py-1.5 text-[11px] font-medium bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 rounded-lg cursor-pointer"
                    >
                      Seguir Ao Vivo
                    </button>
                  )}
                </div>
              )}
            </div>

            {matchCenterFixtures.length === 0 ? (
              <div className="p-8 bg-[#111114] border border-zinc-800/90 rounded-xl text-center text-xs text-zinc-400">
                Nenhuma partida encerrada para este filtro ainda. Avance uma rodada ou alterne para &quot;Todos / Próximos&quot;.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {matchCenterFixtures.slice(0, 60).map((f) => renderInteractiveFixtureCard(f))}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: FULL SEASON PLAYER STATS */}
        {activeTab === 'estatisticas' && (
          <PlayerStatsHub
            state={state}
            defaultScope="ALL"
            onInspectPlayer={(pid) => setInspectedPlayerId(pid)}
          />
        )}

        {/* TAB 4: CLUB COMMAND */}
        {activeTab === 'comando' && userClub && (
          <div className="space-y-5">
            <div className="p-4 bg-[#111114] border border-zinc-800/90 rounded-xl flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <ClubCrest clubId={userClub.id} clubName={userClub.name} size="md" />
                <div>
                  <div className="text-xs font-mono text-emerald-400">
                    Clube sob seu comando no Sandbox
                  </div>
                  <div className="font-display text-lg font-bold text-white">{userClub.name}</div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={state.userClubId}
                  onChange={(e) => handleAssumeClub(e.target.value)}
                  className="px-3 py-2 bg-[#09090B] border border-zinc-800 rounded-lg text-xs text-white"
                >
                  {allClubsSorted.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({state.leagues[c.leagueId]?.name})
                    </option>
                  ))}
                </select>
                <span className="font-mono text-xs font-bold text-emerald-400 tabular-nums px-2">
                  Verba: {formatCurrency(userClub.budget)}
                </span>
                <button
                  onClick={() =>
                    setState((prev) => {
                      const next = cloneState(prev);
                      next.clubs[next.userClubId].budget += 25_000_000;
                      return next;
                    })
                  }
                  className="px-3 py-1.5 text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-emerald-300 rounded-lg cursor-pointer"
                >
                  +€ 25M
                </button>
                <button
                  type="button"
                  onClick={() => handleCopyClubSquadText(userClub.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border cursor-pointer ${
                    copiedClubId === userClub.id
                      ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300'
                      : 'bg-[#09090B] hover:bg-zinc-900 border-zinc-800 text-zinc-200'
                  }`}
                >
                  {copiedClubId === userClub.id ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 text-emerald-400" />
                  )}
                  {copiedClubId === userClub.id ? 'Elenco Copiado!' : 'Copiar Elenco (Texto)'}
                </button>
                <button
                  onClick={() => openDraftModal(userClub.id)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-amber-400 hover:bg-amber-300 text-zinc-950 rounded-lg cursor-pointer"
                >
                  <Dices className="w-3.5 h-3.5" />
                  Draft p/ {userClub.shortName}
                </button>
                <button
                  onClick={() => openForcedDealModal(userClub.id)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded-lg cursor-pointer"
                >
                  <ArrowRightLeft className="w-3.5 h-3.5" />
                  Transferir / Emprestar
                </button>
              </div>
            </div>

            <TacticsSquadView
              state={state}
              userClub={userClub}
              clubPlayers={commandedClubPlayers}
              onInspectPlayer={(pid) => setInspectedPlayerId(pid)}
              onOpenJsonUpdater={() =>
                setFeedback('Para editar JSON em massa, use o botão Atualizar Elencos no Menu Principal.')
              }
              onUpdateClubAndPlayers={(updater) =>
                setState((prev) => {
                  const next = cloneState(prev);
                  updater(next);
                  return next;
                })
              }
            />
          </div>
        )}

        {/* TAB 5: CHAMPIONS, EUROPA LEAGUE & CUPS */}
        {activeTab === 'copas' && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-1.5 p-1 bg-[#111114] border border-zinc-800 rounded-lg w-fit">
              <button
                onClick={() => setCompSubTab('ucl')}
                className={`px-3.5 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                  compSubTab === 'ucl'
                    ? 'bg-emerald-500 text-zinc-950 font-semibold'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                Champions League (Beta)
              </button>
              <button
                onClick={() => setCompSubTab('uel')}
                className={`px-3.5 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                  compSubTab === 'uel'
                    ? 'bg-amber-400 text-zinc-950 font-semibold'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                Europa League (Beta)
              </button>
              <button
                onClick={() => setCompSubTab('copas')}
                className={`px-3.5 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                  compSubTab === 'copas'
                    ? 'bg-emerald-500 text-zinc-950 font-semibold'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                Copas Locais (7)
              </button>
            </div>

            {compSubTab === 'ucl' &&
              renderContinentalView(
                'CHAMPIONS_LEAGUE',
                state.championsLeague,
                uclStageTab,
                setUclStageTab,
                uclGroupRound,
                setUclGroupRound,
                uclRoundFixtures
              )}

            {compSubTab === 'uel' &&
              state.europaLeague &&
              renderContinentalView(
                'EUROPA_LEAGUE',
                state.europaLeague,
                uelStageTab,
                setUelStageTab,
                uelGroupRound,
                setUelGroupRound,
                uelRoundFixtures
              )}

            {compSubTab === 'copas' && (
              <div className="space-y-4">
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                  {DOMESTIC_CUPS_META.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setSelectedCupId(c.id)}
                      className={`px-3.5 py-2 text-xs font-medium rounded-lg whitespace-nowrap shrink-0 cursor-pointer ${
                        selectedCupId === c.id
                          ? 'bg-zinc-100 text-zinc-950 font-semibold'
                          : 'bg-[#111114] text-zinc-400 hover:text-white border border-zinc-800'
                      }`}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>

                {activeCup && (
                  <div className="space-y-4">
                    <div className="p-4 bg-[#111114] border border-zinc-800/90 rounded-xl flex items-center justify-between gap-4">
                      <div>
                        <div className="text-xs font-mono text-emerald-400">{activeCup.country}</div>
                        <h3 className="font-display text-lg font-bold text-white">{activeCup.name}</h3>
                      </div>
                      <div className="text-xs font-semibold text-emerald-400 flex items-center gap-2">
                        <Trophy className="w-4 h-4" />
                        {activeCup.championClubId
                          ? `Campeão: ${state.clubs[activeCup.championClubId]?.name}`
                          : activeCup.rounds[activeCup.currentRoundIndex]?.name || 'Em disputa'}
                      </div>
                    </div>

                    {activeCup.rounds
                      .slice()
                      .reverse()
                      .map((r) => (
                        <div
                          key={r.roundIndex}
                          className="p-4 bg-[#111114] border border-zinc-800/90 rounded-xl space-y-3"
                        >
                          <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                            <h4 className="font-display text-sm font-semibold text-white">{r.name}</h4>
                            <span className="text-[11px] font-mono tabular-nums text-zinc-500">
                              {r.fixtureIds.filter((id) => state.fixtures[id]?.played).length}/
                              {r.fixtureIds.length} jogos
                            </span>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {r.fixtureIds.map((fid) => {
                              const f = state.fixtures[fid];
                              return f ? renderInteractiveFixtureCard(f) : null;
                            })}
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {/* FORCED TRANSFER / LOAN MODAL */}
      {dealModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setDealModalOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-[#111114] border border-zinc-800 rounded-xl p-6 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h2 className="font-display text-lg font-bold text-white">
                Transferência ou Empréstimo Forçado
              </h2>
              <button
                onClick={() => setDealModalOpen(false)}
                className="text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2 p-1 bg-[#09090B] border border-zinc-800 rounded-lg">
                <button
                  onClick={() => setDealType('TRANSFER')}
                  className={`py-2 font-semibold rounded-md cursor-pointer ${
                    dealType === 'TRANSFER'
                      ? 'bg-emerald-500 text-zinc-950'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  Transferência Definitiva
                </button>
                <button
                  onClick={() => setDealType('LOAN')}
                  className={`py-2 font-semibold rounded-md cursor-pointer ${
                    dealType === 'LOAN'
                      ? 'bg-amber-400 text-zinc-950'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  Empréstimo (Temporada)
                </button>
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">Clube de Origem</label>
                <select
                  value={dealFromClubId}
                  onChange={(e) => {
                    const nextId = e.target.value;
                    setDealFromClubId(nextId);
                    const first = Object.values(state.players)
                      .filter((p) => p.clubId === nextId)
                      .sort((a, b) => b.overall - a.overall)[0];
                    setDealPlayerId(first?.id || '');
                    if (first) setDealAmountMillions((first.value / 1_000_000).toFixed(1));
                  }}
                  className="w-full px-3 py-2 bg-[#09090B] border border-zinc-800 rounded-lg text-white"
                >
                  {allClubsSorted.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">Jogador</label>
                <select
                  value={dealPlayerId}
                  onChange={(e) => {
                    const pid = e.target.value;
                    setDealPlayerId(pid);
                    const p = state.players[pid];
                    if (p) {
                      setDealAmountMillions(
                        dealType === 'LOAN'
                          ? ((p.value * 0.1) / 1_000_000).toFixed(1)
                          : (p.value / 1_000_000).toFixed(1)
                      );
                    }
                  }}
                  className="w-full px-3 py-2 bg-[#09090B] border border-zinc-800 rounded-lg text-white"
                >
                  {originPlayers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.position} · {p.overall} OVR · {formatCurrency(p.value)})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">Clube de Destino</label>
                <select
                  value={dealToClubId}
                  onChange={(e) => setDealToClubId(e.target.value)}
                  className="w-full px-3 py-2 bg-[#09090B] border border-zinc-800 rounded-lg text-white"
                >
                  {allClubsSorted
                    .filter((c) => c.id !== dealFromClubId)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-400 mb-1">
                    {dealType === 'LOAN' ? 'Taxa Empréstimo (€ Milhões)' : 'Valor (€ Milhões)'}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={dealAmountMillions}
                    onChange={(e) => setDealAmountMillions(e.target.value)}
                    className="w-full px-3 py-2 bg-[#09090B] border border-zinc-800 rounded-lg text-white font-mono"
                  />
                </div>
                {dealType === 'LOAN' && (
                  <div>
                    <label className="block text-zinc-400 mb-1">
                      Opção de Compra (€ M, opcional)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      value={dealBuyOptMillions}
                      onChange={(e) => setDealBuyOptMillions(e.target.value)}
                      className="w-full px-3 py-2 bg-[#09090B] border border-zinc-800 rounded-lg text-white font-mono"
                    />
                  </div>
                )}
              </div>

              <label className="flex items-center gap-2 text-zinc-300 pt-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={dealAdjustBudgets}
                  onChange={(e) => setDealAdjustBudgets(e.target.checked)}
                  className="accent-emerald-500"
                />
                <span>
                  Movimentar verba entre os dois clubes (desconta do destino e credita na origem)
                </span>
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800">
              <button
                onClick={() => setDealModalOpen(false)}
                className="px-4 py-2 text-xs text-zinc-300 bg-zinc-800 hover:bg-zinc-700 rounded-lg cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmForcedDeal}
                className="px-4 py-2 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-zinc-950 rounded-lg cursor-pointer"
              >
                Executar Agora
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SANDBOX DRAFT CALLER MODAL */}
      {draftModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setDraftModalOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-[#111114] border border-zinc-800 rounded-xl p-6 space-y-5"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-4">
              <div>
                <h2 className="font-display text-lg font-bold text-white">
                  Chamar Draft no Sandbox
                </h2>
                <p className="text-xs text-zinc-400">
                  Escolha qualquer clube, gire cartas de Veteranos, No Auge ou Promessas e contrate direto no elenco.
                </p>
              </div>
              <button
                onClick={() => setDraftModalOpen(false)}
                className="text-zinc-400 hover:text-white self-end sm:self-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <select
                  value={draftTargetClubId}
                  onChange={(e) => {
                    const nextClub = e.target.value;
                    setDraftTargetClubId(nextClub);
                    setDraftOfferings(sandboxGenerateDraftForClub(state, nextClub));
                  }}
                  className="px-3 py-2 bg-[#09090B] border border-zinc-800 rounded-lg text-xs text-white"
                >
                  {allClubsSorted.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                {draftTargetClub && (
                  <span className="font-mono text-xs text-emerald-400 tabular-nums">
                    Verba: {formatCurrency(draftTargetClub.budget)}
                  </span>
                )}
                <label className="flex items-center gap-1.5 text-xs text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draftDeductBudget}
                    onChange={(e) => setDraftDeductBudget(e.target.checked)}
                    className="accent-amber-400"
                  />
                  <span>Cobrar verba do clube</span>
                </label>
              </div>

              <button
                onClick={() => setDraftOfferings(sandboxGenerateDraftForClub(state, draftTargetClubId))}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-amber-300 rounded-lg cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Sortear Novas Cartas
              </button>
            </div>

            <div className="flex items-center gap-1 p-1 bg-[#09090B] border border-zinc-800 rounded-lg w-fit">
              {(['VETERANO', 'AUGE', 'PROMESSA'] as DraftClassTier[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setDraftTier(t)}
                  className={`px-3.5 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                    draftTier === t
                      ? 'bg-amber-400 text-zinc-950 font-semibold'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {DRAFT_TIER_LABEL[t]}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {currentDraftCards.map((cand) => {
                const p = state.players[cand.playerId];
                if (!p) return null;
                return (
                  <div
                    key={cand.playerId}
                    className={`p-4 rounded-xl border flex flex-col justify-between gap-3 ${
                      cand.isUnderdogBuffed
                        ? 'bg-[#0e1512] border-emerald-500/45'
                        : 'bg-[#09090B] border-zinc-800'
                    }`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <NationFlag nationality={p.nationality} size="xs" />
                          <span className="font-semibold text-sm text-white truncate">{p.name}</span>
                        </div>
                        <span className="font-mono text-base font-bold text-emerald-400 tabular-nums">
                          {cand.isUnderdogBuffed ? cand.buffedOverall : cand.originalOverall}
                        </span>
                      </div>
                      <div className="text-xs font-mono text-zinc-400">
                        {p.position} · {p.age}a · POT {p.potential}
                      </div>
                      <div className="text-[11px] text-zinc-400">
                        {cand.fromClubName} ({cand.fromTableRank}º/{cand.fromLeagueClubCount})
                      </div>
                      {cand.isUnderdogBuffed && (
                        <div className="text-[11px] font-mono text-emerald-400">
                          Buff metade inferior: +{cand.ovrBuffDelta} OVR
                        </div>
                      )}
                    </div>

                    <div className="pt-2 border-t border-zinc-800 flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-bold text-emerald-400 tabular-nums">
                        {draftDeductBudget ? formatCurrency(cand.draftPrice) : 'Grátis'}
                      </span>
                      <button
                        onClick={() => {
                          const res = sandboxSignDraftCandidate(
                            state,
                            draftTargetClubId,
                            cand,
                            draftDeductBudget
                          );
                          if (res.error) {
                            setFeedback(res.error);
                          } else {
                            setState(res.state);
                            setFeedback(
                              `${p.name} contratado via Draft para ${draftTargetClub?.name}!`
                            );
                            setDraftModalOpen(false);
                          }
                        }}
                        className="px-3 py-1.5 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-zinc-950 rounded-md cursor-pointer"
                      >
                        Contratar
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {inspectedMatchId && state.fixtures[inspectedMatchId] && (
        <MatchDetailModal
          state={state}
          fixture={state.fixtures[inspectedMatchId]}
          onClose={() => setInspectedMatchId(null)}
          onInspectPlayer={(pid) => {
            setInspectedMatchId(null);
            setInspectedPlayerId(pid);
          }}
          onInspectGoal={(event, fixture) => {
            setInspectedMatchId(null);
            setInspectedGoal({ event, fixture });
          }}
        />
      )}

      {inspectedGoal && (
        <GoalDetailModal
          state={state}
          event={inspectedGoal.event}
          fixture={inspectedGoal.fixture}
          onClose={() => setInspectedGoal(null)}
          onInspectPlayer={(pid) => {
            setInspectedGoal(null);
            setInspectedPlayerId(pid);
          }}
        />
      )}

      {inspectedPlayerId && state.players[inspectedPlayerId] && (
        <PlayerProfileModal
          state={state}
          player={state.players[inspectedPlayerId]}
          onClose={() => setInspectedPlayerId(null)}
        />
      )}
    </div>
  );
};
