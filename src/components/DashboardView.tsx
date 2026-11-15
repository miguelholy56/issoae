import React, { useState } from 'react';
import { Play, FastForward, ArrowRight, TrendingUp, AlertTriangle, FileText, Trophy, Building2, Crosshair } from 'lucide-react';
import { FORM_LABELS, getPlayerAvgRating } from '../data/formations';
import { getPendingDraftStepLabel, isDraftWindowMandatoryPending } from '../engine/draftEngine';
import { deriveStadiumCapacity } from '../engine/financeEngine';
import { getFixtureCalendarRound } from '../engine/seasonEngine';
import {
  Club,
  Fixture,
  GameState,
  LeagueTableRow,
  MatchEvent,
  NewsCategory,
  Player,
} from '../types/game';
import { formatCurrency } from '../utils/format';
import { ClubCrest } from './ClubCrest';
import { ActiveTab } from './TopBar';

interface DashboardViewProps {
  state: GameState;
  userClub: Club;
  userTable: LeagueTableRow[];
  clubPlayers: Player[];
  nextFixture: Fixture | null;
  nextCupOrUcl: { fixture: Fixture; calendarRound: number } | null;
  hasActiveCupOrUcl: boolean;
  onWatchLive: (fixtureId: string) => void;
  onSimulateCurrentFixture: (fixtureId: string) => void;
  onSimulateToCupOrUcl: () => void;
  onSimulatePhaseJump: () => void;
  onStartNewSeason: () => void;
  onOpenPhaseReport: () => void;
  onNavigate: (tab: ActiveTab) => void;
  onInspectPlayer: (playerId: string) => void;
  onInspectGoal?: (event: MatchEvent, fixture?: Fixture) => void;
}

const NEWS_TYPE_LABEL: Record<NewsCategory, { label: string; color: string }> = {
  form: { label: 'Boa Fase', color: 'text-emerald-400' },
  breakout: { label: 'Revelação', color: 'text-sky-400' },
  upset: { label: 'Zebra', color: 'text-amber-400' },
  injury: { label: 'Lesão', color: 'text-red-400' },
  transfer: { label: 'Mercado', color: 'text-emerald-300' },
  award: { label: 'Título / Prêmio', color: 'text-amber-300' },
  match: { label: 'Partida', color: 'text-zinc-300' },
  info: { label: 'Geral', color: 'text-zinc-400' },
};

export const DashboardView: React.FC<DashboardViewProps> = ({
  state,
  userClub,
  userTable,
  clubPlayers,
  nextFixture,
  nextCupOrUcl,
  hasActiveCupOrUcl,
  onWatchLive,
  onSimulateCurrentFixture,
  onSimulateToCupOrUcl,
  onSimulatePhaseJump,
  onStartNewSeason,
  onOpenPhaseReport,
  onNavigate,
  onInspectPlayer,
  onInspectGoal,
}) => {
  const [newsFilter, setNewsFilter] = useState<'ALL' | 'form' | 'breakout' | 'upset' | 'injury' | 'transfer'>('ALL');

  const league = state.leagues[userClub.leagueId];
  const userPos = userTable.findIndex((r) => r.clubId === userClub.id) + 1;
  const avgOvr = clubPlayers.length
    ? Math.round(clubPlayers.reduce((s, p) => s + p.overall, 0) / clubPlayers.length)
    : 0;

  const ratedPlayers = clubPlayers.filter((p) => p.stats.ratingCount > 0);
  const clubAvgRating = ratedPlayers.length
    ? ratedPlayers.reduce((s, p) => s + getPlayerAvgRating(p), 0) / ratedPlayers.length
    : 0;

  const avgFitness = clubPlayers.length
    ? Math.round(clubPlayers.reduce((s, p) => s + p.fitness, 0) / clubPlayers.length)
    : 100;
  const injuredPlayers = clubPlayers.filter((p) => p.injury && p.injury.roundsRemaining > 0);
  const tiredStarters = userClub.starterIds
    .map((id) => state.players[id])
    .filter((p) => p && !p.injury && p.fitness < 68);
  const pendingOffers = state.offers.filter((o) => o.status === 'PENDING');
  const loanedInWithOption = clubPlayers.filter(
    (p) => p.loan && p.loan.toClubId === userClub.id && (p.loan.buyOptionPrice || 0) > 0
  );
  const fin = state.financeState;
  const stadiumCapacity = fin?.stadiumCapacity || deriveStadiumCapacity(userClub);

  const phaseSteps = [
    { id: 'INICIO_JANELA', num: '01', title: 'Início & Janela', desc: 'Táticas, minutagem e contratações iniciais' },
    { id: 'MEIO_JANELA', num: '02', title: 'Meio & Janela', desc: 'Placares, grupos UCL, lesões e janela de meio' },
    { id: 'FINAL_TEMPORADA', num: '03', title: 'Última Rodada & Fim', desc: 'Campeões, copas, evoluções e nova temporada' },
  ];

  const recentUserFixtures = Object.values(state.fixtures)
    .filter((f) => f.played && (f.homeClubId === userClub.id || f.awayClubId === userClub.id))
    .sort((a, b) => {
      const diff = getFixtureCalendarRound(b, state) - getFixtureCalendarRound(a, state);
      if (diff !== 0) return diff;
      if (a.competitionType !== b.competitionType) {
        return a.competitionType === 'LEAGUE' ? -1 : 1;
      }
      return b.round - a.round;
    })
    .slice(0, 5);

  const upcomingKnockoutDraws = Object.values(state.fixtures)
    .filter(
      (f) =>
        !f.played &&
        (f.homeClubId === userClub.id || f.awayClubId === userClub.id) &&
        (f.competitionType === 'CUP' ||
          ((f.competitionType === 'CHAMPIONS_LEAGUE' || f.competitionType === 'EUROPA_LEAGUE') && !f.groupId))
    )
    .sort((a, b) => getFixtureCalendarRound(a, state) - getFixtureCalendarRound(b, state));

  const topClubPerformers = [...clubPlayers]
    .filter((p) => p.stats.appearances > 0)
    .sort((a, b) => getPlayerAvgRating(b) - getPlayerAvgRating(a) || b.stats.goals - a.stats.goals)
    .slice(0, 5);

  const topRisers = Object.values(state.players)
    .filter((p) => p.stats.ovrDelta > 0)
    .sort((a, b) => b.stats.ovrDelta - a.stats.ovrDelta)
    .slice(0, 6);

  const filteredNews = state.newsFeed.filter((item) => {
    if (newsFilter === 'ALL') return true;
    return item.type === newsFilter;
  });

  const phaseJumpLabel =
    state.phase === 'INICIO_JANELA'
      ? 'Simular até o Meio da Temporada'
      : 'Simular até Última Rodada';

  const isNextCupOrUcl =
    nextFixture &&
    (nextFixture.competitionType === 'CUP' ||
      nextFixture.competitionType === 'CHAMPIONS_LEAGUE' ||
      nextFixture.competitionType === 'EUROPA_LEAGUE');

  const cupCompShort = (compType: string) =>
    compType === 'CHAMPIONS_LEAGUE'
      ? 'Champions'
      : compType === 'EUROPA_LEAGUE'
        ? 'Europa League'
        : 'Copa';

  const cupJumpLabel = nextCupOrUcl
    ? `Simular até ${cupCompShort(nextCupOrUcl.fixture.competitionType)} (Rod. ${nextCupOrUcl.calendarRound})`
    : 'Simular até Copa / Continental';

  const draftPending = isDraftWindowMandatoryPending(state);
  const draftPendingLabel = draftPending ? getPendingDraftStepLabel(state) : '';

  return (
    <div className="space-y-6">
      {draftPending && (
        <div className="px-4 py-3.5 bg-amber-500/10 border border-amber-500/40 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <div className="text-xs font-mono uppercase tracking-wider text-amber-400 font-semibold">
              Janela do Draft Obrigatória
            </div>
            <p className="text-sm text-zinc-200">{draftPendingLabel}</p>
          </div>
          <button
            onClick={() => onNavigate('draft')}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-amber-400 hover:bg-amber-300 text-zinc-950 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Concluir Draft Obrigatório
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 3-Part Season Phase Strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {phaseSteps.map((step) => {
          const isCurrent = state.phase === step.id;
          return (
            <div
              key={step.id}
              className={`px-4 py-3.5 rounded-xl border transition-colors ${
                isCurrent
                  ? 'bg-zinc-900 border-emerald-500/70'
                  : 'bg-[#111114] border-zinc-800/80 opacity-65'
              }`}
            >
              <div className="flex items-center justify-between text-xs font-mono">
                <span className={isCurrent ? 'text-emerald-400 font-semibold' : 'text-zinc-500'}>
                  {step.num}. {step.title}
                </span>
                {isCurrent && (
                  <span className="text-emerald-400 font-semibold">Fase Atual</span>
                )}
              </div>
              <p className="text-xs text-zinc-400 mt-1">{step.desc}</p>
            </div>
          );
        })}
      </div>

      {/* Top KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-4 bg-[#111114] border border-zinc-800/90 rounded-xl">
          <div className="text-xs text-zinc-400">Posição na {league.name}</div>
          <div className="font-mono text-2xl font-bold text-white tabular-nums mt-1">
            {userPos > 0 ? `${userPos}º` : '—'}
          </div>
          <div className="text-xs text-zinc-500 mt-1 font-mono tabular-nums">
            Rodada {Math.min(league.currentRound, league.totalRounds)} de {league.totalRounds}
          </div>
        </div>

        <div className="p-4 bg-[#111114] border border-zinc-800/90 rounded-xl">
          <div className="text-xs text-zinc-400">Verba Disponível</div>
          <div className="font-mono text-2xl font-bold text-emerald-400 tabular-nums mt-1">
            {formatCurrency(userClub.budget)}
          </div>
          <div className="text-xs text-zinc-500 mt-1">
            {state.gameMode === 'DRAFT' && state.draftState
              ? `${state.draftState.roulettePasses} passe(s) de roleta`
              : `${pendingOffers.length} proposta(s) pendente(s)`}
          </div>
        </div>

        <div className="p-4 bg-[#111114] border border-zinc-800/90 rounded-xl">
          <div className="text-xs text-zinc-400">Força & Nota Média</div>
          <div className="font-mono text-2xl font-bold text-white tabular-nums mt-1">
            {avgOvr} OVR
          </div>
          <div className="text-xs text-zinc-500 mt-1 font-mono tabular-nums">
            Nota do elenco: {clubAvgRating > 0 ? clubAvgRating.toFixed(2) : '—'} · {userClub.tactics.formationId}
          </div>
        </div>

        <div className="p-4 bg-[#111114] border border-zinc-800/90 rounded-xl">
          <div className="text-xs text-zinc-400">Departamento Médico & Físico</div>
          <div
            className={`font-mono text-2xl font-bold tabular-nums mt-1 ${
              injuredPlayers.length > 0 ? 'text-amber-400' : avgFitness >= 80 ? 'text-emerald-400' : 'text-amber-400'
            }`}
          >
            {injuredPlayers.length > 0 ? `${injuredPlayers.length} lesão(ões)` : `${avgFitness}%`}
          </div>
          <div className="text-xs text-zinc-500 mt-1">
            {injuredPlayers.length > 0
              ? `Físico médio ${avgFitness}% · Confira elenco`
              : tiredStarters.length > 0
                ? `${tiredStarters.length} titular(es) desgastado(s)`
                : 'Plantel saudável'}
          </div>
        </div>
      </div>

      {/* Main 2-column Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 7 cols */}
        <div className="lg:col-span-7 space-y-6">
          {state.phase === 'FINAL_TEMPORADA' ? (
            <div className="p-6 bg-[#111114] border border-emerald-500/40 rounded-xl space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="text-xs font-mono text-emerald-400">
                    Temporada {state.season} Concluída
                  </div>
                  <h2 className="font-display text-2xl font-bold text-white mt-1">
                    Resumo e Evolução Global
                  </h2>
                </div>
                <div className="flex flex-wrap items-center gap-2.5">
                  {state.lastPhaseReport && (
                    <button
                      onClick={onOpenPhaseReport}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded-lg cursor-pointer"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      Ver Placares
                    </button>
                  )}
                  <button
                    onClick={onStartNewSeason}
                    className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold bg-emerald-500 hover:bg-emerald-400 text-zinc-950 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Iniciar Temporada {state.season + 1}
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-t border-zinc-800/80 pt-4">
                <div>
                  <div className="text-xs text-zinc-400 mb-2">Campeão da {league.name}</div>
                  {userTable[0] && state.clubs[userTable[0].clubId] && (
                    <div className="flex items-center gap-3">
                      <ClubCrest
                        clubId={userTable[0].clubId}
                        clubName={state.clubs[userTable[0].clubId].name}
                        size="md"
                      />
                      <div>
                        <div className="text-sm font-semibold text-white">
                          {state.clubs[userTable[0].clubId].name}
                        </div>
                        <div className="text-xs font-mono tabular-nums text-zinc-400">
                          {userTable[0].points} pts · {userTable[0].won}V {userTable[0].drawn}E {userTable[0].lost}D
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <div className="text-xs text-zinc-400 mb-2">Champions League (Beta)</div>
                  {state.championsLeague.championClubId ? (
                    <div className="flex items-center gap-3">
                      <ClubCrest
                        clubId={state.championsLeague.championClubId}
                        clubName={state.clubs[state.championsLeague.championClubId]?.name || ''}
                        size="md"
                      />
                      <div className="text-sm font-semibold text-white">
                        {state.clubs[state.championsLeague.championClubId]?.name}
                      </div>
                    </div>
                  ) : (
                    <span className="text-xs text-zinc-500">Em definição no Mundo</span>
                  )}
                </div>

                <div>
                  <div className="text-xs text-zinc-400 mb-2">Europa League (Beta)</div>
                  {state.europaLeague?.championClubId ? (
                    <div className="flex items-center gap-3">
                      <ClubCrest
                        clubId={state.europaLeague.championClubId}
                        clubName={state.clubs[state.europaLeague.championClubId]?.name || ''}
                        size="md"
                      />
                      <div className="text-sm font-semibold text-white">
                        {state.clubs[state.europaLeague.championClubId]?.name}
                      </div>
                    </div>
                  ) : (
                    <span className="text-xs text-zinc-500">Em definição no Mundo</span>
                  )}
                </div>
              </div>

              {state.gameMode !== 'DRAFT' && loanedInWithOption.length > 0 && (
                <div className="border-t border-zinc-800/80 pt-4 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="text-amber-300">
                    Você possui {loanedInWithOption.length} jogador(es) emprestado(s) com opção de compra antes da virada de temporada.
                  </div>
                  <button
                    onClick={() => onNavigate('mercado')}
                    className="text-emerald-400 font-semibold hover:underline cursor-pointer"
                  >
                    Revisar Empréstimos →
                  </button>
                </div>
              )}

              {topRisers.length > 0 && (
                <div className="border-t border-zinc-800/80 pt-4">
                  <div className="flex items-center gap-2 text-xs font-medium text-zinc-300 mb-3">
                    <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                    Maiores Evoluções de Potencial no Mundo
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {topRisers.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => onInspectPlayer(p.id)}
                        className="flex items-center justify-between px-3 py-2 bg-[#09090B] border border-zinc-800/80 hover:border-emerald-500/40 rounded-lg text-xs text-left cursor-pointer"
                      >
                        <div className="truncate pr-2">
                          <span className="font-medium text-white hover:text-emerald-400">{p.name}</span>
                          <span className="text-zinc-500 ml-1.5">
                            ({state.clubs[p.clubId]?.shortName})
                          </span>
                        </div>
                        <span className="font-mono tabular-nums text-emerald-400 shrink-0">
                          {p.overall - p.stats.ovrDelta} → {p.overall} (+{p.stats.ovrDelta})
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className={`p-6 bg-[#111114] border rounded-xl space-y-5 ${isNextCupOrUcl ? 'border-emerald-500/50' : 'border-zinc-800/90'}`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className={`text-xs font-mono ${isNextCupOrUcl ? 'text-emerald-400 font-semibold' : 'text-zinc-400'}`}>
                    {nextFixture
                      ? nextFixture.competitionType === 'LEAGUE'
                        ? `${nextFixture.competitionName} · ${nextFixture.roundLabel}`
                        : `${nextFixture.competitionName} · ${nextFixture.roundLabel} (Rod. ${getFixtureCalendarRound(nextFixture, state)})`
                      : 'Agenda da Temporada'}
                  </span>
                  <div className="flex items-center gap-4">
                    {state.lastPhaseReport && (
                      <button
                        onClick={onOpenPhaseReport}
                        className="text-xs text-zinc-300 hover:text-emerald-400 cursor-pointer"
                      >
                        Último Resumo de Placares
                      </button>
                    )}
                    <button
                      onClick={() => onNavigate('calendario')}
                      className="text-xs text-emerald-400 hover:underline cursor-pointer"
                    >
                      Ver calendário completo
                    </button>
                  </div>
                </div>

                {nextFixture ? (
                  <>
                    <div className="flex items-center justify-between gap-4 py-3">
                      <div className="flex-1 flex flex-col items-center text-center gap-2">
                        <ClubCrest
                          clubId={nextFixture.homeClubId}
                          clubName={state.clubs[nextFixture.homeClubId]?.name || ''}
                          primaryColor={state.clubs[nextFixture.homeClubId]?.primaryColor}
                          size="lg"
                        />
                        <div className="font-display text-base font-semibold text-white">
                          {state.clubs[nextFixture.homeClubId]?.name}
                        </div>
                        <span className="text-[11px] font-mono text-zinc-500">Mandante</span>
                      </div>

                      <div className="px-4 font-mono text-xl font-bold text-zinc-500">VS</div>

                      <div className="flex-1 flex flex-col items-center text-center gap-2">
                        <ClubCrest
                          clubId={nextFixture.awayClubId}
                          clubName={state.clubs[nextFixture.awayClubId]?.name || ''}
                          primaryColor={state.clubs[nextFixture.awayClubId]?.primaryColor}
                          size="lg"
                        />
                        <div className="font-display text-base font-semibold text-white">
                          {state.clubs[nextFixture.awayClubId]?.name}
                        </div>
                        <span className="text-[11px] font-mono text-zinc-500">Visitante</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-zinc-800/80 pt-4">
                      <button
                        onClick={() => onWatchLive(nextFixture.id)}
                        className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                          isNextCupOrUcl
                            ? 'bg-emerald-500 hover:bg-emerald-400 text-zinc-950'
                            : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-100'
                        }`}
                      >
                        <Play className="w-3.5 h-3.5" />
                        {isNextCupOrUcl ? 'Assistir em 2D' : 'Assistir 2D (Opcional)'}
                      </button>

                      {isNextCupOrUcl ? (
                        <button
                          onClick={() => onSimulateCurrentFixture(nextFixture.id)}
                          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded-lg transition-colors cursor-pointer"
                        >
                          <FastForward className="w-3.5 h-3.5" />
                          Simular Jogo ({cupCompShort(nextFixture.competitionType)})
                        </button>
                      ) : (
                        hasActiveCupOrUcl && (
                          <button
                            onClick={onSimulateToCupOrUcl}
                            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 border border-emerald-500/40 text-emerald-300 rounded-lg transition-colors cursor-pointer"
                          >
                            <Trophy className="w-3.5 h-3.5 text-emerald-400" />
                            {cupJumpLabel}
                          </button>
                        )
                      )}

                      <button
                        onClick={onSimulatePhaseJump}
                        className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                          isNextCupOrUcl
                            ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200'
                            : 'bg-emerald-500 hover:bg-emerald-400 text-zinc-950'
                        }`}
                      >
                        <FastForward className="w-3.5 h-3.5" />
                        {phaseJumpLabel}
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <p className="text-sm text-zinc-400">
                      Pronto para avançar para a próxima etapa da temporada.
                    </p>
                    <div className="flex flex-wrap items-center gap-2.5">
                      {hasActiveCupOrUcl && (
                        <button
                          onClick={onSimulateToCupOrUcl}
                          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 border border-emerald-500/40 text-emerald-300 rounded-lg transition-colors cursor-pointer"
                        >
                          <Trophy className="w-3.5 h-3.5 text-emerald-400" />
                          {cupJumpLabel}
                        </button>
                      )}
                      <button
                        onClick={onSimulatePhaseJump}
                        className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-zinc-950 rounded-lg transition-colors cursor-pointer"
                      >
                        <FastForward className="w-3.5 h-3.5" />
                        {phaseJumpLabel}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Post-Draw Cup & Champions Knockout Card */}
              {upcomingKnockoutDraws.length > 0 && (
                <div className="p-4 bg-[#111114] border border-zinc-800/90 rounded-xl space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Trophy className="w-4 h-4 text-emerald-400 shrink-0" />
                      <h3 className="font-display text-sm font-semibold text-white">
                        Confrontos Sorteados no Mata-Mata
                      </h3>
                    </div>
                    <button
                      onClick={() => onNavigate('mundo')}
                      className="text-xs text-emerald-400 hover:underline cursor-pointer"
                    >
                      Ver chaves no Mundo →
                    </button>
                  </div>

                  <div className="divide-y divide-zinc-800/70">
                    {upcomingKnockoutDraws.map((kf) => {
                      const isHome = kf.homeClubId === userClub.id;
                      const oppId = isHome ? kf.awayClubId : kf.homeClubId;
                      const opp = state.clubs[oppId];
                      const calRound = getFixtureCalendarRound(kf, state);
                      const isReadyNow = calRound <= league.currentRound;
                      return (
                        <div key={kf.id} className="py-2.5 first:pt-1 last:pb-0 flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <ClubCrest clubId={oppId} clubName={opp?.name || ''} size="sm" />
                            <div className="min-w-0">
                              <div className="text-[11px] font-mono text-emerald-400">
                                {kf.competitionName} · {kf.roundLabel} · Prev. Rod. {calRound}
                              </div>
                              <div className="text-xs font-medium text-white truncate">
                                vs {opp?.name || oppId} ({isHome ? 'Mandante' : 'Visitante'})
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {!isReadyNow && (
                              <button
                                onClick={onSimulateToCupOrUcl}
                                className="px-2.5 py-1 text-[11px] font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded cursor-pointer"
                              >
                                Simular até jogo
                              </button>
                            )}
                            <button
                              onClick={() => onWatchLive(kf.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold bg-emerald-500 hover:bg-emerald-400 text-zinc-950 rounded cursor-pointer"
                            >
                              <Play className="w-3 h-3" />
                              Ver em 2D
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Alerts / Injuries / Pending Offers / Draft Window */}
          {(injuredPlayers.length > 0 ||
            tiredStarters.length > 0 ||
            (state.gameMode !== 'DRAFT' && pendingOffers.length > 0) ||
            state.gameMode === 'DRAFT') && (
            <div className="p-4 bg-[#111114] border border-zinc-800/90 rounded-xl space-y-2.5">
              {state.gameMode === 'DRAFT' && state.draftState && (
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="text-amber-300 font-medium">
                    Modo Draft · {state.draftState.roulettePasses} passe(s) de roleta · Meta na liga: {state.draftState.expectedLeaguePos}º lugar
                  </span>
                  <button
                    onClick={() => onNavigate('draft')}
                    className="text-zinc-200 hover:text-amber-300 font-medium whitespace-nowrap cursor-pointer"
                  >
                    Abrir Draft →
                  </button>
                </div>
              )}
              {injuredPlayers.length > 0 && (
                <div className="flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2 text-red-400">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>
                      Lesionados:{' '}
                      {injuredPlayers
                        .slice(0, 3)
                        .map((p) => `${p.name} (${p.injury?.roundsRemaining} rod.)`)
                        .join(', ')}
                    </span>
                  </div>
                  <button
                    onClick={() => onNavigate('tatica')}
                    className="text-zinc-200 hover:text-emerald-400 font-medium whitespace-nowrap cursor-pointer"
                  >
                    Ver elenco →
                  </button>
                </div>
              )}
              {tiredStarters.length > 0 && (
                <div className="flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2 text-amber-400">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>
                      {tiredStarters.map((p) => p.name).slice(0, 3).join(', ')} com desgaste físico elevado.
                    </span>
                  </div>
                  <button
                    onClick={() => onNavigate('tatica')}
                    className="text-zinc-200 hover:text-emerald-400 font-medium whitespace-nowrap cursor-pointer"
                  >
                    Rodar elenco →
                  </button>
                </div>
              )}
              {state.gameMode !== 'DRAFT' && pendingOffers.length > 0 && (
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="text-emerald-400 font-medium">
                    Você tem {pendingOffers.length} proposta(s) de transferência aguardando resposta.
                  </span>
                  <button
                    onClick={() => onNavigate('mercado')}
                    className="text-zinc-200 hover:text-emerald-400 font-medium whitespace-nowrap cursor-pointer"
                  >
                    Ver propostas →
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Recent Club Match Scores */}
          {recentUserFixtures.length > 0 && (
            <div className="p-5 bg-[#111114] border border-zinc-800/90 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-base font-semibold text-white">
                  Últimos Placares do Clube
                </h3>
                <button
                  onClick={() => onNavigate('calendario')}
                  className="text-xs text-emerald-400 hover:underline cursor-pointer"
                >
                  Todos os placares →
                </button>
              </div>
              <div className="divide-y divide-zinc-800/70">
                {recentUserFixtures.map((f) => {
                  const home = state.clubs[f.homeClubId];
                  const away = state.clubs[f.awayClubId];
                  const isHome = f.homeClubId === userClub.id;
                  const uGoals = isHome ? f.homeGoals! : f.awayGoals!;
                  const oGoals = isHome ? f.awayGoals! : f.homeGoals!;
                  const win = uGoals > oGoals || f.penaltiesWinnerId === userClub.id;
                  const loss = uGoals < oGoals || (f.penaltiesWinnerId && f.penaltiesWinnerId !== userClub.id);
                  const goalEvents = (f.events || []).filter((e) => e.type === 'GOAL');
                  return (
                    <div key={f.id} className="py-2.5 space-y-1.5 text-xs">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[11px] font-mono text-zinc-500">
                            {f.competitionName} · {f.roundLabel}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className={isHome ? 'font-semibold text-white' : 'text-zinc-300'}>
                              {home?.shortName}
                            </span>
                            <span className="font-mono font-bold tabular-nums text-white">
                              {f.homeGoals} - {f.awayGoals}
                            </span>
                            <span className={!isHome ? 'font-semibold text-white' : 'text-zinc-300'}>
                              {away?.shortName}
                            </span>
                          </div>
                        </div>
                        <span
                          className={`font-mono font-semibold shrink-0 ${
                            win ? 'text-emerald-400' : loss ? 'text-red-400' : 'text-amber-400'
                          }`}
                        >
                          {win ? 'V' : loss ? 'D' : 'E'}
                        </span>
                      </div>
                      {goalEvents.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          {goalEvents.map((g, gi) => (
                            <button
                              key={gi}
                              type="button"
                              onClick={() => onInspectGoal?.(g, f)}
                              title="Abrir mapa do chute e detalhes do gol"
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#09090B] border border-zinc-800/90 hover:border-emerald-500/50 text-[11px] text-zinc-300 hover:text-emerald-300 cursor-pointer"
                            >
                              <Crosshair className="w-2.5 h-2.5 text-emerald-400" />
                              <span className="font-mono text-emerald-400">{g.minute}&apos;</span>
                              <span>{g.playerName || 'Gol'}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Dynamic News Feed */}
          <div className="p-5 bg-[#111114] border border-zinc-800/90 rounded-xl space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display text-base font-semibold text-white">
                Notícias do Clube & Mundo
              </h3>
              <div className="flex items-center gap-1 overflow-x-auto">
                {[
                  { id: 'ALL', label: 'Todas' },
                  { id: 'form', label: 'Boas Fases' },
                  { id: 'breakout', label: 'Revelações' },
                  { id: 'upset', label: 'Zebras' },
                  { id: 'injury', label: 'Lesões' },
                  { id: 'transfer', label: 'Mercado' },
                ].map((nf) => (
                  <button
                    key={nf.id}
                    onClick={() => setNewsFilter(nf.id as typeof newsFilter)}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded-md whitespace-nowrap cursor-pointer ${
                      newsFilter === nf.id
                        ? 'bg-emerald-500 text-zinc-950 font-semibold'
                        : 'text-zinc-400 hover:text-white bg-[#09090B]'
                    }`}
                  >
                    {nf.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="divide-y divide-zinc-800/70">
              {filteredNews.length === 0 ? (
                <p className="py-4 text-xs text-zinc-500">
                  Nenhuma notícia nesta categoria ainda. Avance a fase para gerar novidades.
                </p>
              ) : (
                filteredNews.slice(0, 10).map((item) => {
                  const meta = NEWS_TYPE_LABEL[item.type] || NEWS_TYPE_LABEL.info;
                  return (
                    <div key={item.id} className="py-2.5 first:pt-0 last:pb-0">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-medium text-zinc-100">{item.title}</span>
                        <span className="font-mono text-[11px] text-zinc-500 shrink-0">
                          <span className={meta.color}>{meta.label}</span>
                          {' · '}
                          {item.round > 0 ? `Rod. ${item.round}` : 'Geral'}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-400 mt-0.5">{item.detail}</p>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Right 5 cols: League Table & Top Performers */}
        <div className="lg:col-span-5 space-y-6">
          <div className="p-5 bg-[#111114] border border-zinc-800/90 rounded-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-semibold text-white">
                Classificação · {league.name}
              </h3>
              <button
                onClick={() => onNavigate('mundo')}
                className="text-xs text-emerald-400 hover:underline cursor-pointer"
              >
                Abrir Mundo →
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-zinc-500 border-b border-zinc-800">
                    <th className="py-2 text-left font-medium w-7">#</th>
                    <th className="py-2 text-left font-medium">Clube</th>
                    <th className="py-2 text-right font-medium w-8">J</th>
                    <th className="py-2 text-right font-medium w-9">SG</th>
                    <th className="py-2 text-right font-medium w-9">P</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50">
                  {userTable.slice(0, 12).map((row, idx) => {
                    const c = state.clubs[row.clubId];
                    const isUser = row.clubId === userClub.id;
                    const gd = row.goalsFor - row.goalsAgainst;
                    return (
                      <tr
                        key={row.clubId}
                        className={isUser ? 'bg-emerald-500/10 text-white font-semibold' : 'text-zinc-300'}
                      >
                        <td className="py-2 font-mono tabular-nums text-zinc-500">{idx + 1}</td>
                        <td className="py-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <ClubCrest clubId={row.clubId} clubName={c?.name || ''} size="xs" />
                            <span className="truncate">{c?.name}</span>
                          </div>
                        </td>
                        <td className="py-2 text-right font-mono tabular-nums text-zinc-400">{row.played}</td>
                        <td className="py-2 text-right font-mono tabular-nums text-zinc-400">
                          {gd > 0 ? `+${gd}` : gd}
                        </td>
                        <td className="py-2 text-right font-mono tabular-nums font-semibold text-white">
                          {row.points}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {topClubPerformers.length > 0 && (
            <div className="p-5 bg-[#111114] border border-zinc-800/90 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-base font-semibold text-white">
                  Destaques de Desempenho
                </h3>
                <button
                  onClick={() => onNavigate('tatica')}
                  className="text-xs text-emerald-400 hover:underline cursor-pointer"
                >
                  Notas do elenco →
                </button>
              </div>
              <div className="divide-y divide-zinc-800/60">
                {topClubPerformers.map((p) => {
                  const avg = getPlayerAvgRating(p);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => onInspectPlayer(p.id)}
                      className="w-full py-2.5 flex items-center justify-between text-xs text-left hover:bg-zinc-900/40 rounded px-1 -mx-1 cursor-pointer"
                    >
                      <div className="min-w-0">
                        <div className="font-medium text-white hover:text-emerald-400 truncate">{p.name}</div>
                        <div className="text-[11px] font-mono text-zinc-500">
                          {p.position} · {FORM_LABELS[p.form]} · {p.stats.goals}G {p.stats.assists}A · {p.stats.minutes}'
                        </div>
                      </div>
                      <span className="font-mono font-bold tabular-nums text-emerald-400 shrink-0">
                        {avg.toFixed(1)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {/* Finanças, Estádio & Bilheteria */}
          <div className="p-5 bg-[#111114] border border-zinc-800/90 rounded-xl space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-emerald-400" />
                <h3 className="font-display text-base font-semibold text-white">
                  Finanças, Estádio & Bilheteria
                </h3>
              </div>
              <span className="text-[11px] font-mono tabular-nums text-zinc-400">
                Lotação {stadiumCapacity.toLocaleString('pt-BR')}
              </span>
            </div>

            {fin && fin.lastMatchAttendance > 0 ? (
              <div className="p-3 bg-[#09090B] border border-zinc-800/80 rounded-lg space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-400">Último jogo em casa</span>
                  <span className="font-mono font-semibold tabular-nums text-white">
                    {fin.lastMatchAttendance.toLocaleString('pt-BR')} ({fin.lastMatchAttendancePct}%)
                  </span>
                </div>
                <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full"
                    style={{ width: `${Math.min(100, fin.lastMatchAttendancePct)}%` }}
                  />
                </div>
                {fin.lastMatchHypeNote && (
                  <div className="text-[11px] text-emerald-400/90">{fin.lastMatchHypeNote}</div>
                )}
              </div>
            ) : (
              <div className="p-3 bg-[#09090B] border border-zinc-800/80 rounded-lg text-[11px] text-zinc-400">
                Boas fases e estrelas em alta atraem mais torcedores ao estádio e impulsionam vendas de camisas.
              </div>
            )}

            <div className="grid grid-cols-2 gap-2.5 text-xs">
              <div className="px-3 py-2 bg-[#09090B] border border-zinc-800/70 rounded-lg">
                <div className="text-[11px] text-zinc-500">Bilheteria</div>
                <div className="font-mono font-semibold tabular-nums text-emerald-400 mt-0.5">
                  +{formatCurrency(fin?.seasonMatchdayRevenue || 0)}
                </div>
              </div>
              <div className="px-3 py-2 bg-[#09090B] border border-zinc-800/70 rounded-lg">
                <div className="text-[11px] text-zinc-500">Camisas & Marketing</div>
                <div className="font-mono font-semibold tabular-nums text-emerald-400 mt-0.5">
                  +{formatCurrency(fin?.seasonMerchRevenue || 0)}
                </div>
              </div>
              <div className="px-3 py-2 bg-[#09090B] border border-zinc-800/70 rounded-lg">
                <div className="text-[11px] text-zinc-500">Premiações & Cotas</div>
                <div className="font-mono font-semibold tabular-nums text-emerald-400 mt-0.5">
                  +{formatCurrency(fin?.seasonPrizeRevenue || 0)}
                </div>
              </div>
              <div className="px-3 py-2 bg-[#09090B] border border-zinc-800/70 rounded-lg">
                <div className="text-[11px] text-zinc-500">Saldo Empréstimos</div>
                <div
                  className={`font-mono font-semibold tabular-nums mt-0.5 ${
                    (fin?.seasonLoanRevenue || 0) >= 0 ? 'text-zinc-200' : 'text-amber-400'
                  }`}
                >
                  {(fin?.seasonLoanRevenue || 0) >= 0 ? '+' : ''}
                  {formatCurrency(fin?.seasonLoanRevenue || 0)}
                </div>
              </div>
            </div>

            {fin && fin.recentEntries.length > 0 && (
              <div className="divide-y divide-zinc-800/60 border-t border-zinc-800/70 pt-2">
                {fin.recentEntries.slice(0, 5).map((entry) => (
                  <div key={entry.id} className="py-1.5 flex items-center justify-between gap-2 text-[11px]">
                    <span className="text-zinc-300 truncate">{entry.label}</span>
                    <span
                      className={`font-mono font-semibold tabular-nums shrink-0 ${
                        entry.amount >= 0 ? 'text-emerald-400' : 'text-red-400'
                      }`}
                    >
                      {entry.amount >= 0 ? '+' : ''}
                      {formatCurrency(entry.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
