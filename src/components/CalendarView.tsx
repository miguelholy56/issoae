import React, { useState } from 'react';
import { CalendarCheck, Play, FastForward, ChevronDown, ChevronUp, Trophy, Crosshair } from 'lucide-react';
import { FINISH_TYPE_SHORT } from '../engine/goalShotEngine';
import { getFixtureCalendarRound } from '../engine/seasonEngine';
import { Fixture, GameState, MatchEvent } from '../types/game';
import { ClubCrest } from './ClubCrest';

interface CalendarViewProps {
  state: GameState;
  nextCupOrUcl: { fixture: Fixture; calendarRound: number } | null;
  hasActiveCupOrUcl: boolean;
  onToggleScheduleWatch: (fixtureId: string) => void;
  onWatchLive: (fixtureId: string) => void;
  onAdvanceRound: () => void;
  onSimulateToCupOrUcl: () => void;
  onSimulatePhaseJump: () => void;
  onInspectGoal?: (event: MatchEvent, fixture?: Fixture) => void;
}

export const CalendarView: React.FC<CalendarViewProps> = ({
  state,
  nextCupOrUcl,
  hasActiveCupOrUcl,
  onToggleScheduleWatch,
  onWatchLive,
  onAdvanceRound,
  onSimulateToCupOrUcl,
  onSimulatePhaseJump,
  onInspectGoal,
}) => {
  const [filter, setFilter] = useState<'ALL' | 'UPCOMING' | 'PLAYED'>('UPCOMING');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const userClub = state.clubs[state.userClubId];
  const currentLeagueRound = (userClub && state.leagues[userClub.leagueId]?.currentRound) || 1;

  const userFixtures = Object.values(state.fixtures)
    .filter((f) => f.homeClubId === state.userClubId || f.awayClubId === state.userClubId)
    .filter((f) => {
      if (filter === 'UPCOMING') return !f.played;
      if (filter === 'PLAYED') return f.played;
      return true;
    })
    .sort((a, b) => {
      const ra = getFixtureCalendarRound(a, state);
      const rb = getFixtureCalendarRound(b, state);
      if (filter === 'PLAYED') {
        if (rb !== ra) return rb - ra;
        if (a.competitionType !== b.competitionType) {
          return a.competitionType === 'LEAGUE' ? -1 : 1;
        }
        return b.round - a.round;
      }
      if (filter === 'UPCOMING') {
        if (ra !== rb) return ra - rb;
        if (a.competitionType !== b.competitionType) {
          return a.competitionType !== 'LEAGUE' ? -1 : 1;
        }
        return a.round - b.round;
      }
      // ALL: chronological ascending
      if (ra !== rb) return ra - rb;
      if (a.competitionType !== b.competitionType) {
        return a.competitionType !== 'LEAGUE' ? -1 : 1;
      }
      return a.round - b.round;
    });

  const phaseLabel =
    state.phase === 'INICIO_JANELA'
      ? 'Simular até o Meio'
      : state.phase === 'MEIO_JANELA'
        ? 'Simular até Última Rodada'
        : 'Temporada Encerrada';

  const isCupOrUclReadyNow = Boolean(nextCupOrUcl && nextCupOrUcl.calendarRound <= currentLeagueRound);
  const compShort = nextCupOrUcl
    ? nextCupOrUcl.fixture.competitionType === 'CHAMPIONS_LEAGUE'
      ? 'Champions'
      : nextCupOrUcl.fixture.competitionType === 'EUROPA_LEAGUE'
        ? 'Europa'
        : 'Copa'
    : 'Copa / Continental';
  const cupBtnLabel = nextCupOrUcl
    ? isCupOrUclReadyNow
      ? `Assistir ${compShort} 2D`
      : `Simular até ${compShort} (Rod. ${nextCupOrUcl.calendarRound})`
    : 'Simular até Copa / Continental';

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
        <div className="flex items-center gap-1 p-1 bg-[#111114] border border-zinc-800 rounded-lg self-start">
          <button
            onClick={() => setFilter('UPCOMING')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
              filter === 'UPCOMING' ? 'bg-emerald-500 text-zinc-950 font-semibold' : 'text-zinc-400 hover:text-white'
            }`}
          >
            Próximos Jogos
          </button>
          <button
            onClick={() => setFilter('PLAYED')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
              filter === 'PLAYED' ? 'bg-emerald-500 text-zinc-950 font-semibold' : 'text-zinc-400 hover:text-white'
            }`}
          >
            Resultados
          </button>
          <button
            onClick={() => setFilter('ALL')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
              filter === 'ALL' ? 'bg-emerald-500 text-zinc-950 font-semibold' : 'text-zinc-400 hover:text-white'
            }`}
          >
            Todos
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {hasActiveCupOrUcl && state.phase !== 'FINAL_TEMPORADA' && (
            <button
              onClick={() =>
                isCupOrUclReadyNow && nextCupOrUcl
                  ? onWatchLive(nextCupOrUcl.fixture.id)
                  : onSimulateToCupOrUcl()
              }
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 border border-emerald-500/40 text-emerald-300 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Trophy className="w-3.5 h-3.5 text-emerald-400" />
              {cupBtnLabel}
            </button>
          )}
          <button
            onClick={onAdvanceRound}
            disabled={state.phase === 'FINAL_TEMPORADA'}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-100 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
          >
            <FastForward className="w-3.5 h-3.5" />
            Simular 1 Rodada
          </button>
          <button
            onClick={onSimulatePhaseJump}
            disabled={state.phase === 'FINAL_TEMPORADA'}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-zinc-950 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
          >
            <FastForward className="w-3.5 h-3.5" />
            {phaseLabel}
          </button>
        </div>
      </div>

      <div className="bg-[#111114] border border-zinc-800/90 rounded-xl divide-y divide-zinc-800/70">
        {userFixtures.length === 0 ? (
          <div className="p-8 text-center text-sm text-zinc-500">
            Nenhuma partida encontrada para este filtro.
          </div>
        ) : (
          userFixtures.map((f: Fixture) => {
            const home = state.clubs[f.homeClubId];
            const away = state.clubs[f.awayClubId];
            const isHome = f.homeClubId === state.userClubId;
            const isExpanded = expandedId === f.id;
            const calRound = getFixtureCalendarRound(f, state);
            const isCupOrUcl =
              f.competitionType === 'CUP' ||
              f.competitionType === 'CHAMPIONS_LEAGUE' ||
              f.competitionType === 'EUROPA_LEAGUE';

            const goals = (f.events || []).filter((e) => e.type === 'GOAL');
            const mvp = f.playerRatings
              ? Object.entries(f.playerRatings).sort((a, b) => b[1] - a[1])[0]
              : null;
            const mvpPlayer = mvp ? state.players[mvp[0]] : null;

            return (
              <div
                key={f.id}
                className={`hover:bg-zinc-900/30 ${
                  isCupOrUcl && !f.played ? 'bg-emerald-500/[0.03]' : ''
                }`}
              >
                <div className="px-4 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-44 shrink-0">
                      <div
                        className={`text-xs font-medium truncate ${
                          f.competitionType === 'CHAMPIONS_LEAGUE'
                            ? 'text-emerald-400'
                            : f.competitionType === 'EUROPA_LEAGUE'
                              ? 'text-amber-400'
                              : f.competitionType === 'CUP'
                                ? 'text-sky-400'
                                : 'text-zinc-200'
                        }`}
                      >
                        {f.competitionName}
                      </div>
                      <div className="text-[11px] font-mono text-zinc-500">
                        {isCupOrUcl
                          ? `Prev. Rod. ${calRound} · ${f.roundLabel} · ${isHome ? 'Casa' : 'Fora'}`
                          : `${f.roundLabel} · ${isHome ? 'Casa' : 'Fora'}`}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 min-w-0">
                      <ClubCrest clubId={f.homeClubId} clubName={home?.name || ''} size="sm" />
                      <span className={`text-sm truncate ${isHome ? 'font-semibold text-white' : 'text-zinc-300'}`}>
                        {home?.shortName}
                      </span>

                      <span className="font-mono text-sm font-bold tabular-nums px-2 py-0.5 bg-[#09090B] border border-zinc-800 rounded text-white">
                        {f.played ? `${f.homeGoals} - ${f.awayGoals}` : 'vs'}
                      </span>

                      <span className={`text-sm truncate ${!isHome ? 'font-semibold text-white' : 'text-zinc-300'}`}>
                        {away?.shortName}
                      </span>
                      <ClubCrest clubId={f.awayClubId} clubName={away?.name || ''} size="sm" />
                    </div>
                  </div>

                  {!f.played ? (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => onToggleScheduleWatch(f.id)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                          f.scheduledWatch
                            ? 'bg-emerald-500/15 border-emerald-500/60 text-emerald-400'
                            : 'bg-[#09090B] border-zinc-800 text-zinc-400 hover:text-white'
                        }`}
                      >
                        <CalendarCheck className="w-3.5 h-3.5" />
                        {f.scheduledWatch ? 'Agendado 2D' : 'Agendar 2D'}
                      </button>

                      <button
                        onClick={() => onWatchLive(f.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-zinc-950 rounded-lg cursor-pointer"
                      >
                        <Play className="w-3.5 h-3.5" />
                        Assistir 2D
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : f.id)}
                      className="flex items-center gap-3 text-xs font-mono text-zinc-400 hover:text-white shrink-0 cursor-pointer"
                    >
                      {mvpPlayer && mvp && (
                        <span className="text-emerald-400 hidden md:inline tabular-nums">
                          MVP: {mvpPlayer.name} ({mvp[1].toFixed(1)})
                        </span>
                      )}
                      <span>
                        {f.stats
                          ? `${f.stats.homePossession}% posse · ${f.stats.homeShots}-${f.stats.awayShots} chutes`
                          : 'Encerrado'}
                      </span>
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  )}
                </div>

                {f.played && isExpanded && (
                  <div className="px-4 pb-4 pt-2 border-t border-zinc-800/50 bg-[#0c0c0f] grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                    <div>
                      <div className="text-[11px] font-mono text-zinc-500 mb-1.5">
                        Gols e Eventos
                      </div>
                      {f.stats && (
                        <div className="mb-2 text-[11px] font-mono tabular-nums text-zinc-400">
                          xG {f.stats.homeXG.toFixed(2)} - {f.stats.awayXG.toFixed(2)} · No alvo{' '}
                          {f.stats.homeShotsOnTarget}-{f.stats.awayShotsOnTarget}
                          {f.stats.tacticalNote && (
                            <div className="text-emerald-400/90 font-sans mt-1">
                              {f.stats.tacticalNote}
                            </div>
                          )}
                        </div>
                      )}
                      {goals.length === 0 ? (
                        <div className="text-zinc-500">Sem gols nesta partida.</div>
                      ) : (
                        <div className="space-y-1.5">
                          {goals.map((g, idx) => (
                            <div key={idx} className="flex items-center justify-between gap-2 text-zinc-300">
                              <div className="min-w-0 truncate">
                                <span className="font-mono text-emerald-400">{g.minute}&apos;</span>{' '}
                                <span>{g.description}</span>
                                {g.shotDetail && (
                                  <span className="text-[10px] font-mono text-zinc-500 ml-1.5">
                                    ({FINISH_TYPE_SHORT[g.shotDetail.finishType]}
                                    {g.shotDetail.isOutsideBox ? ' · Fora da área' : ''})
                                  </span>
                                )}
                              </div>
                              {onInspectGoal && (
                                <button
                                  type="button"
                                  onClick={() => onInspectGoal(g, f)}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium bg-[#111114] border border-zinc-800 hover:border-emerald-500/50 text-emerald-400 rounded shrink-0 cursor-pointer"
                                >
                                  <Crosshair className="w-3 h-3" />
                                  Mapa
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div>
                      <div className="text-[11px] font-mono text-zinc-500 mb-1.5">
                        Melhores Notas em Campo
                      </div>
                      {f.playerRatings ? (
                        <div className="grid grid-cols-2 gap-1.5">
                          {Object.entries(f.playerRatings)
                            .sort((a, b) => b[1] - a[1])
                            .slice(0, 6)
                            .map(([pid, rating]) => {
                              const pl = state.players[pid];
                              if (!pl) return null;
                              return (
                                <div
                                  key={pid}
                                  className="flex items-center justify-between gap-2 px-2 py-1 bg-[#111114] border border-zinc-800/80 rounded"
                                >
                                  <span className="truncate text-zinc-200">{pl.name}</span>
                                  <span
                                    className={`font-mono font-bold tabular-nums ${
                                      rating >= 8.0
                                        ? 'text-emerald-400'
                                        : rating >= 7.0
                                          ? 'text-zinc-100'
                                          : 'text-zinc-400'
                                    }`}
                                  >
                                    {rating.toFixed(1)}
                                  </span>
                                </div>
                              );
                            })}
                        </div>
                      ) : (
                        <div className="text-zinc-500">Notas indisponíveis.</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
