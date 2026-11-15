import React, { useState } from 'react';
import { ArrowLeft, Play, Trophy, TrendingUp } from 'lucide-react';
import { LEAGUES_META } from '../data/leaguesMeta';
import { runSecondarySeasonSimulation, SecondarySimResult } from '../engine/secondarySim';
import { LeagueId, RawDataset } from '../types/game';
import { formatCurrency } from '../utils/format';
import { ClubCrest } from './ClubCrest';
import { NationFlag } from './NationFlag';

interface SecondaryModeViewProps {
  dataset: RawDataset;
  onBack: () => void;
}

export const SecondaryModeView: React.FC<SecondaryModeViewProps> = ({ dataset, onBack }) => {
  const [targetLeague, setTargetLeague] = useState<LeagueId | 'ALL'>('ALL');
  const [simResult, setSimResult] = useState<SecondarySimResult | null>(() =>
    runSecondarySeasonSimulation(dataset, 'ALL')
  );
  const [statTab, setStatTab] = useState<'scorers' | 'assists' | 'ratings' | 'growth' | 'leagues' | 'tables'>('scorers');
  const [inspectTableLeague, setInspectTableLeague] = useState<LeagueId>('premier-league');

  const handleRunSim = () => {
    const res = runSecondarySeasonSimulation(dataset, targetLeague);
    setSimResult(res);
    if (targetLeague !== 'ALL') {
      setInspectTableLeague(targetLeague);
    }
  };

  return (
    <div className="min-h-screen bg-[#09090B] text-zinc-100">
      <header className="border-b border-zinc-800/80 bg-[#09090B]">
        <div className="max-w-[1360px] mx-auto px-6 h-16 flex items-center justify-between gap-6">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 text-xs font-medium text-zinc-300 hover:text-white cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar ao Menu Principal
          </button>
          <span className="font-display text-base font-bold text-white">
            Modo Secundário · Simulador Rápido & Estatísticas Globais
          </span>
          <div className="w-28 hidden sm:block" />
        </div>
      </header>

      <main className="max-w-[1360px] mx-auto px-6 py-8 space-y-6">
        {/* Controls */}
        <div className="p-5 bg-[#111114] border border-zinc-800 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-xl font-bold text-white">
              Simulação Automática de Temporada Completa
            </h1>
            <p className="text-xs text-zinc-400 mt-1">
              Escolha uma liga ou simule todas as 9 ligas simultaneamente e compare estatísticas globais em tempo real.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <select
              value={targetLeague}
              onChange={(e) => setTargetLeague(e.target.value as LeagueId | 'ALL')}
              className="bg-[#09090B] border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white"
            >
              <option value="ALL">Todas as 9 Ligas</option>
              {LEAGUES_META.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>

            <button
              onClick={handleRunSim}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-zinc-950 rounded-lg transition-colors cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" />
              Simular Nova Temporada
            </button>
          </div>
        </div>

        {simResult && (
          <>
            {/* Quick Champions Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {(['premier-league', 'la-liga', 'serie-a', 'bundesliga'] as LeagueId[]).map((lid) => {
                const top = simResult.tables[lid]?.[0];
                const club = top ? simResult.state.clubs[top.clubId] : undefined;
                return (
                  <div key={lid} className="p-3.5 bg-[#111114] border border-zinc-800/90 rounded-xl space-y-2">
                    <div className="text-[11px] font-mono text-zinc-500">
                      {simResult.state.leagues[lid].name}
                    </div>
                    {club && (
                      <div className="flex items-center gap-2.5">
                        <ClubCrest clubId={club.id} clubName={club.name} size="sm" />
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-white truncate">{club.name}</div>
                          <div className="text-[11px] font-mono tabular-nums text-emerald-400">
                            {top.points} pts
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              <div className="p-3.5 bg-[#111114] border border-emerald-500/40 rounded-xl space-y-2">
                <div className="flex items-center gap-1.5 text-[11px] font-mono text-emerald-400">
                  <Trophy className="w-3 h-3" />
                  Champions League Beta
                </div>
                {simResult.state.championsLeague.championClubId && (
                  <div className="flex items-center gap-2.5">
                    <ClubCrest
                      clubId={simResult.state.championsLeague.championClubId}
                      clubName={simResult.state.clubs[simResult.state.championsLeague.championClubId]?.name || ''}
                      size="sm"
                    />
                    <div className="text-xs font-semibold text-white truncate">
                      {simResult.state.clubs[simResult.state.championsLeague.championClubId]?.name}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Stat Subtabs */}
            <div className="flex items-center gap-1 p-1 bg-[#111114] border border-zinc-800 rounded-lg w-fit overflow-x-auto">
              {[
                { id: 'scorers', label: 'Artilharia Global' },
                { id: 'assists', label: 'Líderes em Assistências' },
                { id: 'ratings', label: 'Melhores Notas' },
                { id: 'growth', label: 'Maiores Evoluções (POT)' },
                { id: 'leagues', label: 'Comparativo das 9 Ligas' },
                { id: 'tables', label: 'Tabelas Simuladas' },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setStatTab(t.id as typeof statTab)}
                  className={`px-3.5 py-1.5 text-xs font-medium rounded-md whitespace-nowrap cursor-pointer ${
                    statTab === t.id ? 'bg-emerald-500 text-zinc-950 font-semibold' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Content */}
            {(statTab === 'scorers' || statTab === 'assists' || statTab === 'ratings' || statTab === 'growth') && (
              <div className="bg-[#111114] border border-zinc-800/90 rounded-xl overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="text-[11px] text-zinc-500 border-b border-zinc-800 bg-[#0d0d10]">
                      <th className="py-2.5 pl-4 pr-2 w-8">#</th>
                      <th className="py-2.5 pr-3">Jogador</th>
                      <th className="py-2.5 px-2">Clube / Liga</th>
                      <th className="py-2.5 px-2 text-right">Idade</th>
                      <th className="py-2.5 px-2 text-right">OVR / POT</th>
                      <th className="py-2.5 px-2 text-right">Nota</th>
                      <th className="py-2.5 px-2 text-right">Gols</th>
                      <th className="py-2.5 px-2 text-right">Assist.</th>
                      <th className="py-2.5 px-4 text-right">Valor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/50">
                    {(statTab === 'scorers'
                      ? simResult.topScorers
                      : statTab === 'assists'
                        ? simResult.topAssisters
                        : statTab === 'ratings'
                          ? simResult.topRatings
                          : simResult.topGrowth
                    ).map((p, idx) => {
                      const club = simResult.state.clubs[p.clubId];
                      const avgRating = p.stats.ratingCount > 0 ? (p.stats.ratingSum / p.stats.ratingCount).toFixed(1) : '—';
                      return (
                        <tr key={p.id} className="hover:bg-zinc-900/60">
                          <td className="py-2.5 pl-4 pr-2 font-mono text-zinc-500">{idx + 1}</td>
                          <td className="py-2.5 pr-3">
                            <div className="flex items-center gap-2.5">
                              <NationFlag nationality={p.nationality} size="sm" />
                              <span className="font-medium text-white">{p.name}</span>
                            </div>
                          </td>
                          <td className="py-2.5 px-2">
                            <div className="flex items-center gap-2">
                              <ClubCrest clubId={p.clubId} clubName={club?.name || ''} size="xs" />
                              <span className="text-zinc-300">{club?.name}</span>
                              <span className="text-zinc-500">· {simResult.state.leagues[club?.leagueId]?.name}</span>
                            </div>
                          </td>
                          <td className="py-2.5 px-2 text-right font-mono tabular-nums text-zinc-400">{p.age}</td>
                          <td className="py-2.5 px-2 text-right font-mono tabular-nums">
                            <span className="text-white font-semibold">{p.overall}</span>
                            <span className="text-zinc-500">/{p.potential}</span>
                            {p.stats.ovrDelta > 0 && (
                              <span className="ml-1.5 text-emerald-400 inline-flex items-center">
                                <TrendingUp className="w-3 h-3 mr-0.5" />+{p.stats.ovrDelta}
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-2 text-right font-mono tabular-nums font-bold text-emerald-400">
                            {avgRating}
                          </td>
                          <td className="py-2.5 px-2 text-right font-mono tabular-nums font-semibold text-white">
                            {p.stats.goals}
                          </td>
                          <td className="py-2.5 px-2 text-right font-mono tabular-nums text-zinc-300">
                            {p.stats.assists}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono tabular-nums text-emerald-400">
                            {formatCurrency(p.value)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {statTab === 'leagues' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {simResult.leaguePower.map((lp) => {
                  const championRow = simResult.tables[lp.leagueId]?.[0];
                  const champion = championRow ? simResult.state.clubs[championRow.clubId] : undefined;
                  return (
                    <div key={lp.leagueId} className="p-4 bg-[#111114] border border-zinc-800/90 rounded-xl space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="font-display text-sm font-semibold text-white">{lp.name}</h3>
                        <span className="font-mono text-xs text-emerald-400 tabular-nums">
                          Média {lp.avgOvr} OVR
                        </span>
                      </div>
                      <div className="text-xs text-zinc-400 font-mono tabular-nums">
                        Gols na temporada: <span className="text-white font-semibold">{lp.totalGoals}</span>
                      </div>
                      {champion && (
                        <div className="flex items-center gap-2 pt-2 border-t border-zinc-800/70 text-xs">
                          <ClubCrest clubId={champion.id} clubName={champion.name} size="xs" />
                          <span className="text-zinc-300">Campeão: {champion.name} ({championRow.points} pts)</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {statTab === 'tables' && (
              <div className="space-y-4">
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                  {LEAGUES_META.map((l) => (
                    <button
                      key={l.id}
                      onClick={() => setInspectTableLeague(l.id)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap cursor-pointer ${
                        inspectTableLeague === l.id
                          ? 'bg-zinc-100 text-zinc-950 font-semibold'
                          : 'bg-[#111114] text-zinc-400 border border-zinc-800'
                      }`}
                    >
                      {l.name}
                    </button>
                  ))}
                </div>

                <div className="bg-[#111114] border border-zinc-800/90 rounded-xl overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="text-[11px] text-zinc-500 border-b border-zinc-800 bg-[#0d0d10]">
                        <th className="py-2.5 pl-4 pr-2 w-8">#</th>
                        <th className="py-2.5 pr-3">Clube</th>
                        <th className="py-2.5 px-2 text-right">J</th>
                        <th className="py-2.5 px-2 text-right">V</th>
                        <th className="py-2.5 px-2 text-right">E</th>
                        <th className="py-2.5 px-2 text-right">D</th>
                        <th className="py-2.5 px-2 text-right">SG</th>
                        <th className="py-2.5 px-4 text-right">Pts</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/50">
                      {simResult.tables[inspectTableLeague]?.map((row, idx) => {
                        const c = simResult.state.clubs[row.clubId];
                        const gd = row.goalsFor - row.goalsAgainst;
                        return (
                          <tr key={row.clubId} className="text-zinc-300">
                            <td className="py-2 pl-4 pr-2 font-mono text-zinc-500">{idx + 1}</td>
                            <td className="py-2 pr-3">
                              <div className="flex items-center gap-2">
                                <ClubCrest clubId={row.clubId} clubName={c?.name || ''} size="xs" />
                                <span>{c?.name}</span>
                              </div>
                            </td>
                            <td className="py-2 px-2 text-right font-mono tabular-nums">{row.played}</td>
                            <td className="py-2 px-2 text-right font-mono tabular-nums">{row.won}</td>
                            <td className="py-2 px-2 text-right font-mono tabular-nums">{row.drawn}</td>
                            <td className="py-2 px-2 text-right font-mono tabular-nums">{row.lost}</td>
                            <td className="py-2 px-2 text-right font-mono tabular-nums">{gd > 0 ? `+${gd}` : gd}</td>
                            <td className="py-2 px-4 text-right font-mono tabular-nums font-bold text-white">{row.points}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
};
