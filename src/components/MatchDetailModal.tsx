import React from 'react';
import { Crosshair, Trophy, User, X } from 'lucide-react';
import { FINISH_TYPE_SHORT } from '../engine/goalShotEngine';
import { Fixture, GameState, MatchEvent } from '../types/game';
import { ClubCrest } from './ClubCrest';

interface MatchDetailModalProps {
  state: GameState;
  fixture: Fixture;
  onClose: () => void;
  onInspectPlayer: (playerId: string) => void;
  onInspectGoal?: (event: MatchEvent, fixture?: Fixture) => void;
}

export const MatchDetailModal: React.FC<MatchDetailModalProps> = ({
  state,
  fixture,
  onClose,
  onInspectPlayer,
  onInspectGoal,
}) => {
  const home = state.clubs[fixture.homeClubId];
  const away = state.clubs[fixture.awayClubId];
  const stats = fixture.stats;
  const events = [...(fixture.events || [])].sort((a, b) => a.minute - b.minute);

  const ratingEntries = fixture.playerRatings
    ? Object.entries(fixture.playerRatings)
        .filter(([pid]) => Boolean(state.players[pid]))
        .sort((a, b) => b[1] - a[1])
    : [];

  const homeRatings = ratingEntries.filter(([pid]) => state.players[pid]?.clubId === fixture.homeClubId);
  const awayRatings = ratingEntries.filter(([pid]) => state.players[pid]?.clubId === fixture.awayClubId);

  const renderStatBar = (label: string, homeVal: number, awayVal: number, isFloat = false) => {
    const total = homeVal + awayVal;
    const homePct = total > 0 ? Math.round((homeVal / total) * 100) : 50;
    const hText = isFloat ? homeVal.toFixed(2) : String(homeVal);
    const aText = isFloat ? awayVal.toFixed(2) : String(awayVal);

    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs font-mono tabular-nums">
          <span className="font-semibold text-white">{hText}</span>
          <span className="text-[11px] font-sans text-zinc-400">{label}</span>
          <span className="font-semibold text-white">{aText}</span>
        </div>
        <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden flex">
          <div className="h-full bg-emerald-500" style={{ width: `${homePct}%` }} />
          <div className="h-full bg-sky-500/80" style={{ width: `${100 - homePct}%` }} />
        </div>
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl max-h-[90vh] bg-[#111114] border border-zinc-800 rounded-xl flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs font-mono text-emerald-400 min-w-0">
            <Trophy className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">
              {fixture.competitionName} · {fixture.roundLabel}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-white rounded-lg cursor-pointer"
            aria-label="Fechar detalhes da partida"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scoreboard Banner */}
        <div className="px-6 py-5 bg-[#09090B] border-b border-zinc-800 flex items-center justify-between gap-4">
          <div className="flex-1 flex items-center justify-end gap-3 min-w-0">
            <div className="text-right min-w-0">
              <div className="font-display text-base font-bold text-white truncate">
                {home?.name || fixture.homeClubId}
              </div>
              <div className="text-[11px] font-mono text-zinc-500">Mandante</div>
            </div>
            <ClubCrest
              clubId={fixture.homeClubId}
              clubName={home?.name || ''}
              primaryColor={home?.primaryColor}
              size="md"
            />
          </div>

          <div className="px-4 py-2 bg-[#111114] border border-zinc-800 rounded-lg text-center shrink-0">
            <div className="font-mono text-2xl font-bold tabular-nums text-white">
              {fixture.played ? `${fixture.homeGoals ?? 0} - ${fixture.awayGoals ?? 0}` : 'vs'}
            </div>
            {fixture.penaltiesWinnerId && (
              <div className="text-[10px] font-mono text-amber-400 mt-0.5">
                Pênaltis: {state.clubs[fixture.penaltiesWinnerId]?.shortName}
              </div>
            )}
          </div>

          <div className="flex-1 flex items-center gap-3 min-w-0">
            <ClubCrest
              clubId={fixture.awayClubId}
              clubName={away?.name || ''}
              primaryColor={away?.primaryColor}
              size="md"
            />
            <div className="text-left min-w-0">
              <div className="font-display text-base font-bold text-white truncate">
                {away?.name || fixture.awayClubId}
              </div>
              <div className="text-[11px] font-mono text-zinc-500">Visitante</div>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {!fixture.played ? (
            <div className="py-8 text-center text-sm text-zinc-400">
              Esta partida ainda não foi simulada.
            </div>
          ) : (
            <>
              {/* Stats + Tactical Note */}
              {stats && (
                <div className="p-4 bg-[#09090B] border border-zinc-800/90 rounded-xl space-y-3">
                  {renderStatBar('Posse de Bola (%)', stats.homePossession, stats.awayPossession)}
                  {renderStatBar('Finalizações', stats.homeShots, stats.awayShots)}
                  {renderStatBar('Chutes no Gol', stats.homeShotsOnTarget, stats.awayShotsOnTarget)}
                  {renderStatBar('Gols Esperados (xG)', stats.homeXG, stats.awayXG, true)}
                  {renderStatBar('Grandes Chances', stats.homeBigChances ?? 0, stats.awayBigChances ?? 0)}
                  {stats.tacticalNote && (
                    <div className="pt-2 border-t border-zinc-800/80 text-xs text-emerald-400/95">
                      {stats.tacticalNote}
                    </div>
                  )}
                </div>
              )}

              {/* Events Timeline */}
              <div className="space-y-2.5">
                <h3 className="font-display text-sm font-semibold text-white">
                  Lances, Gols & Cartões ({events.length})
                </h3>
                {events.length === 0 ? (
                  <p className="text-xs text-zinc-500">Sem eventos de destaque registrados.</p>
                ) : (
                  <div className="divide-y divide-zinc-800/70 bg-[#09090B] border border-zinc-800/90 rounded-xl">
                    {events.map((ev, idx) => {
                      const evClub = state.clubs[ev.clubId];
                      const isGoal = ev.type === 'GOAL';
                      return (
                        <div
                          key={`${ev.minute}_${idx}`}
                          className="px-4 py-2.5 flex items-center justify-between gap-3 text-xs"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="font-mono font-bold tabular-nums text-emerald-400 w-9 shrink-0">
                              {ev.minute}&apos;
                            </span>
                            <span
                              className={`text-[10px] font-mono px-1.5 py-0.5 rounded shrink-0 ${
                                isGoal
                                  ? 'bg-emerald-500/15 text-emerald-400'
                                  : ev.type === 'RED'
                                    ? 'bg-red-500/15 text-red-400'
                                    : ev.type === 'YELLOW'
                                      ? 'bg-amber-500/15 text-amber-300'
                                      : 'bg-zinc-800 text-zinc-400'
                              }`}
                            >
                              {isGoal
                                ? 'GOL'
                                : ev.type === 'RED'
                                  ? 'CV'
                                  : ev.type === 'YELLOW'
                                    ? 'CA'
                                    : ev.type === 'INJURY'
                                      ? 'DM'
                                      : 'SUB'}
                            </span>
                            <div className="min-w-0">
                              <div className="text-zinc-200 truncate">
                                <span className="text-zinc-400 mr-1.5">[{evClub?.shortName}]</span>
                                {ev.playerId ? (
                                  <button
                                    type="button"
                                    onClick={() => onInspectPlayer(ev.playerId!)}
                                    className="font-medium text-white hover:text-emerald-400 cursor-pointer"
                                  >
                                    {ev.playerName || ev.description}
                                  </button>
                                ) : (
                                  <span>{ev.description}</span>
                                )}
                                {ev.assistPlayerName && (
                                  <span className="text-zinc-400 ml-1.5">
                                    (Assist: {ev.assistPlayerName})
                                  </span>
                                )}
                              </div>
                              {isGoal && ev.shotDetail && (
                                <div className="text-[11px] font-mono text-zinc-500">
                                  {FINISH_TYPE_SHORT[ev.shotDetail.finishType]} · {ev.shotDetail.distanceMeters.toFixed(1)}m · xG {ev.shotDetail.xg.toFixed(2)}
                                </div>
                              )}
                            </div>
                          </div>

                          {isGoal && onInspectGoal && (
                            <button
                              type="button"
                              onClick={() => onInspectGoal(ev, fixture)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium bg-[#111114] border border-zinc-800 hover:border-emerald-500/50 text-emerald-400 rounded shrink-0 cursor-pointer"
                            >
                              <Crosshair className="w-3 h-3" />
                              Mapa do Chute
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Player Ratings */}
              {ratingEntries.length > 0 && (
                <div className="space-y-2.5">
                  <h3 className="font-display text-sm font-semibold text-white">
                    Notas dos Atletas em Campo
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[
                      { title: home?.name || 'Mandante', list: homeRatings },
                      { title: away?.name || 'Visitante', list: awayRatings },
                    ].map((side) => (
                      <div
                        key={side.title}
                        className="bg-[#09090B] border border-zinc-800/90 rounded-xl overflow-hidden"
                      >
                        <div className="px-3.5 py-2 border-b border-zinc-800 text-xs font-semibold text-zinc-300">
                          {side.title}
                        </div>
                        <div className="divide-y divide-zinc-800/50">
                          {side.list.slice(0, 8).map(([pid, rating]) => {
                            const pl = state.players[pid];
                            if (!pl) return null;
                            return (
                              <button
                                key={pid}
                                type="button"
                                onClick={() => onInspectPlayer(pid)}
                                className="w-full px-3.5 py-2 flex items-center justify-between gap-2 text-xs text-left hover:bg-zinc-900/60 cursor-pointer"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <User className="w-3 h-3 text-zinc-500 shrink-0" />
                                  <span className="font-mono text-[10px] text-zinc-500 w-7 shrink-0">
                                    {pl.position}
                                  </span>
                                  <span className="text-zinc-200 hover:text-emerald-400 truncate">
                                    {pl.name}
                                  </span>
                                </div>
                                <span
                                  className={`font-mono font-bold tabular-nums shrink-0 ${
                                    rating >= 8.0
                                      ? 'text-emerald-400'
                                      : rating >= 7.0
                                        ? 'text-white'
                                        : 'text-zinc-400'
                                  }`}
                                >
                                  {rating.toFixed(1)}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
