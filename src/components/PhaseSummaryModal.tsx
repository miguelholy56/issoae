import React, { useState } from 'react';
import { X, ArrowRight, Trophy, Crosshair } from 'lucide-react';
import { FORM_LABELS } from '../data/formations';
import { getFixtureCalendarRound } from '../engine/seasonEngine';
import { Fixture, GameState, MatchEvent, PhaseReport } from '../types/game';
import { ClubCrest } from './ClubCrest';

interface PhaseSummaryModalProps {
  state: GameState;
  report: PhaseReport;
  onClose: () => void;
  onGoToMundo: () => void;
  onGoToSquad: () => void;
  onGoToCalendar?: () => void;
  onInspectPlayer: (playerId: string) => void;
  onInspectGoal?: (event: MatchEvent, fixture?: Fixture) => void;
}

export const PhaseSummaryModal: React.FC<PhaseSummaryModalProps> = ({
  state,
  report,
  onClose,
  onGoToMundo,
  onGoToSquad,
  onGoToCalendar,
  onInspectPlayer,
  onInspectGoal,
}) => {
  const [tab, setTab] = useState<'clube' | 'mundo' | 'fases'>('clube');

  const userFixtures = report.userFixtureIds
    .map((id) => state.fixtures[id])
    .filter(Boolean)
    .sort((a, b) => getFixtureCalendarRound(a, state) - getFixtureCalendarRound(b, state));

  const highlightFixtures = report.highlightFixtureIds
    .map((id) => state.fixtures[id])
    .filter(Boolean);

  const upcomingKnockoutDraws = Object.values(state.fixtures)
    .filter(
      (f) =>
        !f.played &&
        (f.homeClubId === state.userClubId || f.awayClubId === state.userClubId) &&
        (f.competitionType === 'CUP' ||
          ((f.competitionType === 'CHAMPIONS_LEAGUE' || f.competitionType === 'EUROPA_LEAGUE') && !f.groupId))
    )
    .sort((a, b) => getFixtureCalendarRound(a, state) - getFixtureCalendarRound(b, state));

  const userPlayedUclGroups = state.championsLeague.groups.some((g) =>
    g.clubIds.includes(state.userClubId)
  );
  const userPlayedUelGroups = Boolean(
    state.europaLeague?.groups.some((g) => g.clubIds.includes(state.userClubId))
  );
  const userQualifiedContinental = upcomingKnockoutDraws.some(
    (f) => f.competitionType === 'CHAMPIONS_LEAGUE' || f.competitionType === 'EUROPA_LEAGUE'
  );

  const renderFixtureRow = (f: Fixture) => {
    const home = state.clubs[f.homeClubId];
    const away = state.clubs[f.awayClubId];
    const isUserHome = f.homeClubId === state.userClubId;
    const isUserAway = f.awayClubId === state.userClubId;
    const userGoals = isUserHome ? f.homeGoals! : isUserAway ? f.awayGoals! : null;
    const oppGoals = isUserHome ? f.awayGoals! : isUserAway ? f.homeGoals! : null;

    let resultTag = '';
    let resultColor = 'text-zinc-400';
    if (userGoals !== null && oppGoals !== null) {
      const wonPen = f.penaltiesWinnerId === state.userClubId;
      if (userGoals > oppGoals || wonPen) {
        resultTag = 'Vitória';
        resultColor = 'text-emerald-400';
      } else if (userGoals < oppGoals || (f.penaltiesWinnerId && f.penaltiesWinnerId !== state.userClubId)) {
        resultTag = 'Derrota';
        resultColor = 'text-red-400';
      } else {
        resultTag = 'Empate';
        resultColor = 'text-amber-400';
      }
    }

    const goalEvents = (f.events || [])
      .filter((e) => e.type === 'GOAL' && e.playerName)
      .slice(0, 6);

    // Best rated player in match
    let mvpId = '';
    let mvpName = '';
    let mvpRating = 0;
    if (f.playerRatings) {
      for (const [pid, r] of Object.entries(f.playerRatings)) {
        if (r > mvpRating && state.players[pid]) {
          mvpRating = r;
          mvpId = pid;
          mvpName = state.players[pid].name;
        }
      }
    }

    return (
      <div
        key={f.id}
        className="py-3 px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-zinc-900/40"
      >
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-500">
            <span>{f.competitionName}</span>
            <span aria-hidden="true">·</span>
            <span>{f.roundLabel}</span>
            {resultTag && (
              <>
                <span aria-hidden="true">·</span>
                <span className={`font-semibold ${resultColor}`}>{resultTag}</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2.5 text-sm">
            <ClubCrest clubId={f.homeClubId} clubName={home?.name || ''} size="xs" />
            <span className={isUserHome ? 'font-semibold text-white' : 'text-zinc-300'}>
              {home?.name}
            </span>
            <span className="px-2 py-0.5 bg-[#09090B] border border-zinc-800 rounded font-mono font-bold tabular-nums text-white">
              {f.homeGoals} - {f.awayGoals}
            </span>
            <span className={isUserAway ? 'font-semibold text-white' : 'text-zinc-300'}>
              {away?.name}
            </span>
            <ClubCrest clubId={f.awayClubId} clubName={away?.name || ''} size="xs" />
          </div>

          {goalEvents.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              {goalEvents.map((e, gi) => (
                <button
                  key={gi}
                  type="button"
                  onClick={() => onInspectGoal?.(e, f)}
                  title="Ver mapa do chute e detalhes do gol"
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#09090B] border border-zinc-800/90 hover:border-emerald-500/50 text-[11px] text-zinc-300 hover:text-emerald-300 cursor-pointer"
                >
                  <Crosshair className="w-2.5 h-2.5 text-emerald-400" />
                  <span>{e.playerName} ({e.minute}&apos;)</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="text-right shrink-0 space-y-0.5">
          {f.penaltiesWinnerId && (
            <div className="text-[11px] font-mono text-amber-400">
              Pênaltis: {state.clubs[f.penaltiesWinnerId]?.shortName}
            </div>
          )}
          {mvpName && mvpId && (
            <div className="text-[11px] font-mono tabular-nums text-zinc-400">
              Destaque:{' '}
              <button
                type="button"
                onClick={() => onInspectPlayer(mvpId)}
                className="text-emerald-400 font-semibold hover:underline cursor-pointer"
              >
                {mvpName} ({mvpRating.toFixed(1)})
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-4xl max-h-[88vh] bg-[#111114] border border-zinc-800 rounded-xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-800 flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-xl font-bold text-white">
              {report.title}
            </h2>
            <p className="text-xs text-zinc-400 mt-1">{report.subtitle}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-white rounded-lg cursor-pointer"
            aria-label="Fechar resumo"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Metrics Strip */}
        <div className="grid grid-cols-3 border-b border-zinc-800 bg-[#0d0d10] divide-x divide-zinc-800 text-xs">
          <div className="px-5 py-3">
            <div className="text-zinc-500">Partidas do Clube</div>
            <div className="font-mono text-lg font-bold tabular-nums text-white mt-0.5">
              {userFixtures.length}
            </div>
          </div>
          <div className="px-5 py-3">
            <div className="text-zinc-500">Mercado Global (NPCs)</div>
            <div className="font-mono text-lg font-bold tabular-nums text-emerald-400 mt-0.5">
              {report.npcTransferCount} negócios
            </div>
          </div>
          <div className="px-5 py-3">
            <div className="text-zinc-500">Lesões Registradas</div>
            <div className="font-mono text-lg font-bold tabular-nums text-amber-400 mt-0.5">
              {report.injuriesOccurred.length} atletas
            </div>
          </div>
        </div>

        {/* Subtabs */}
        <div className="px-6 pt-3 pb-2 border-b border-zinc-800/80 flex items-center gap-1">
          <button
            onClick={() => setTab('clube')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
              tab === 'clube' ? 'bg-emerald-500 text-zinc-950 font-semibold' : 'text-zinc-400 hover:text-white'
            }`}
          >
            Placares do Clube ({userFixtures.length})
          </button>
          <button
            onClick={() => setTab('mundo')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
              tab === 'mundo' ? 'bg-emerald-500 text-zinc-950 font-semibold' : 'text-zinc-400 hover:text-white'
            }`}
          >
            Placares em Destaque ({highlightFixtures.length})
          </button>
          <button
            onClick={() => setTab('fases')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
              tab === 'fases' ? 'bg-emerald-500 text-zinc-950 font-semibold' : 'text-zinc-400 hover:text-white'
            }`}
          >
            Boas Fases & Lesões
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {report.phaseCompleted === 'MEIO_JANELA' &&
            (upcomingKnockoutDraws.length > 0 ||
              (userPlayedUclGroups && state.championsLeague.stage !== 'GRUPOS' && !userQualifiedContinental) ||
              (userPlayedUelGroups && state.europaLeague?.stage !== 'GRUPOS' && !userQualifiedContinental)) && (
              <div className="mx-6 mt-4 p-4 rounded-xl bg-[#09090B] border border-emerald-500/35 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
                    <Trophy className="w-4 h-4" />
                    <span>Sorteio do Mata-Mata Definido</span>
                  </div>
                  {onGoToCalendar && (
                    <button
                      onClick={onGoToCalendar}
                      className="text-xs font-medium text-emerald-400 hover:underline cursor-pointer"
                    >
                      Ver no Calendário →
                    </button>
                  )}
                </div>

                {upcomingKnockoutDraws.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {upcomingKnockoutDraws.map((kf) => {
                      const isHome = kf.homeClubId === state.userClubId;
                      const oppId = isHome ? kf.awayClubId : kf.homeClubId;
                      const opp = state.clubs[oppId];
                      return (
                        <div
                          key={kf.id}
                          className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-[#111114] border border-zinc-800/80"
                        >
                          <ClubCrest clubId={oppId} clubName={opp?.name || ''} size="xs" />
                          <div className="min-w-0">
                            <div className="text-[11px] font-mono text-zinc-400">
                              {kf.competitionName} · {kf.roundLabel} (Rod. {getFixtureCalendarRound(kf, state)})
                            </div>
                            <div className="text-xs font-medium text-white truncate">
                              vs {opp?.name || oppId} ({isHome ? 'Casa' : 'Fora'})
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-zinc-400">
                    Seu clube não avançou da Fase de Grupos continental nesta temporada.
                  </p>
                )}
              </div>
            )}

          {tab === 'clube' && (
            <div className="divide-y divide-zinc-800/70">
              {userFixtures.length === 0 ? (
                <div className="p-8 text-center text-sm text-zinc-500">
                  Nenhuma partida registrada para o seu clube nesta etapa.
                </div>
              ) : (
                userFixtures.map(renderFixtureRow)
              )}
            </div>
          )}

          {tab === 'mundo' && (
            <div className="divide-y divide-zinc-800/70">
              {highlightFixtures.length === 0 ? (
                <div className="p-8 text-center text-sm text-zinc-500">
                  Sem placares de destaque adicionais registrados.
                </div>
              ) : (
                highlightFixtures.map(renderFixtureRow)
              )}
            </div>
          )}

          {tab === 'fases' && (
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <h3 className="font-display text-sm font-semibold text-white">
                  Jogadores em Boa / Ótima Fase
                </h3>
                <div className="divide-y divide-zinc-800/60 border border-zinc-800 rounded-lg bg-[#09090B]">
                  {report.hotPlayers.map((hp) => (
                    <button
                      key={hp.playerId}
                      type="button"
                      onClick={() => onInspectPlayer(hp.playerId)}
                      className="w-full px-3.5 py-2.5 flex items-center justify-between text-xs text-left hover:bg-zinc-900/60 cursor-pointer"
                    >
                      <div className="min-w-0">
                        <div className="font-medium text-white hover:text-emerald-400 truncate">{hp.playerName}</div>
                        <div className="text-[11px] text-zinc-500">
                          {state.clubs[hp.clubId]?.name} · {FORM_LABELS[hp.form]}
                        </div>
                      </div>
                      <span className="font-mono font-bold tabular-nums text-emerald-400">
                        Nota {hp.avgRating.toFixed(1)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="font-display text-sm font-semibold text-white">
                  Boletim Médico
                </h3>
                <div className="divide-y divide-zinc-800/60 border border-zinc-800 rounded-lg bg-[#09090B]">
                  {report.injuriesOccurred.length === 0 ? (
                    <div className="p-4 text-xs text-zinc-500">
                      Nenhuma lesão grave ativa no elenco principal.
                    </div>
                  ) : (
                    report.injuriesOccurred.map((inj) => (
                      <button
                        key={inj.playerId}
                        type="button"
                        onClick={() => onInspectPlayer(inj.playerId)}
                        className="w-full px-3.5 py-2.5 flex items-center justify-between text-xs text-left hover:bg-zinc-900/60 cursor-pointer"
                      >
                        <div className="min-w-0">
                          <div className="font-medium text-white hover:text-emerald-400 truncate">{inj.playerName}</div>
                          <div className="text-[11px] text-zinc-500">
                            {state.clubs[inj.clubId]?.name} · {inj.type}
                          </div>
                        </div>
                        <span className="font-mono font-semibold tabular-nums text-red-400 shrink-0">
                          {inj.rounds} rod.
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-zinc-800 bg-[#0d0d10] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                onClose();
                onGoToMundo();
              }}
              className="text-xs font-medium text-zinc-300 hover:text-emerald-400 cursor-pointer"
            >
              Ver Transferências & Tabelas no Mundo →
            </button>
            <button
              onClick={() => {
                onClose();
                onGoToSquad();
              }}
              className="text-xs font-medium text-zinc-300 hover:text-emerald-400 cursor-pointer"
            >
              Revisar Elenco & Lesões →
            </button>
          </div>
          <button
            onClick={onClose}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-zinc-950 rounded-lg cursor-pointer"
          >
            Continuar Carreira
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
