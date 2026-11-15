import React, { useMemo, useState } from 'react';
import { Search, ArrowUpDown, TrendingUp } from 'lucide-react';
import { FORM_LABELS, getPlayerAvgRating, getPositionGroup } from '../data/formations';
import { LEAGUES_META } from '../data/leaguesMeta';
import { GameState, LeagueId, Player, PositionGroup } from '../types/game';
import { formatCurrency } from '../utils/format';
import { ClubCrest } from './ClubCrest';
import { NationFlag } from './NationFlag';

interface PlayerStatsHubProps {
  state: GameState;
  defaultScope?: 'ALL' | 'USER_CLUB' | LeagueId;
  onInspectPlayer?: (playerId: string) => void;
}

type SortKey =
  | 'goals'
  | 'assists'
  | 'ga'
  | 'ga90'
  | 'rating'
  | 'minutes'
  | 'appearances'
  | 'cleanSheets'
  | 'outsideBox'
  | 'motm'
  | 'ovrDelta'
  | 'value';

export const PlayerStatsHub: React.FC<PlayerStatsHubProps> = ({
  state,
  defaultScope = 'ALL',
  onInspectPlayer,
}) => {
  const [scope, setScope] = useState<'ALL' | 'USER_CLUB' | LeagueId>(defaultScope);
  const [posGroup, setPosGroup] = useState<'ALL' | PositionGroup>('ALL');
  const [minApps, setMinApps] = useState<number>(1);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('goals');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');

  const allPlayers = useMemo(() => Object.values(state.players), [state.players]);

  const scopedPlayers = useMemo(() => {
    return allPlayers.filter((p) => {
      if (scope === 'USER_CLUB') return p.clubId === state.userClubId;
      if (scope !== 'ALL') return state.clubs[p.clubId]?.leagueId === scope;
      return true;
    });
  }, [allPlayers, scope, state.userClubId, state.clubs]);

  const leaders = useMemo(() => {
    const active = scopedPlayers.filter((p) => p.stats.appearances > 0);
    const topScorer = [...active].sort((a, b) => b.stats.goals - a.stats.goals || b.stats.assists - a.stats.assists)[0];
    const topAssist = [...active].sort((a, b) => b.stats.assists - a.stats.assists || b.stats.goals - a.stats.goals)[0];
    const topRating = [...active]
      .filter((p) => p.stats.appearances >= Math.min(3, Math.max(1, minApps)))
      .sort((a, b) => getPlayerAvgRating(b) - getPlayerAvgRating(a) || b.overall - a.overall)[0];
    const topGrowth = [...scopedPlayers]
      .filter((p) => p.stats.ovrDelta > 0)
      .sort((a, b) => b.stats.ovrDelta - a.stats.ovrDelta || b.overall - a.overall)[0];
    return { topScorer, topAssist, topRating, topGrowth };
  }, [scopedPlayers, minApps]);

  const getMetricValue = (p: Player, key: SortKey): number => {
    const ga = p.stats.goals + p.stats.assists;
    switch (key) {
      case 'goals':
        return p.stats.goals;
      case 'assists':
        return p.stats.assists;
      case 'ga':
        return ga;
      case 'ga90':
        return p.stats.minutes >= 45 ? (ga / p.stats.minutes) * 90 : 0;
      case 'rating':
        return getPlayerAvgRating(p);
      case 'minutes':
        return p.stats.minutes;
      case 'appearances':
        return p.stats.appearances;
      case 'cleanSheets':
        return p.stats.cleanSheets || 0;
      case 'outsideBox':
        return p.stats.outsideBoxGoals || 0;
      case 'motm':
        return p.stats.motm || 0;
      case 'ovrDelta':
        return p.stats.ovrDelta;
      case 'value':
        return p.value;
    }
  };

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = scopedPlayers.filter((p) => {
      if (p.stats.appearances < minApps) return false;
      if (posGroup !== 'ALL' && getPositionGroup(p.position) !== posGroup) return false;
      if (q) {
        const clubName = state.clubs[p.clubId]?.name || '';
        if (!p.name.toLowerCase().includes(q) && !clubName.toLowerCase().includes(q)) return false;
      }
      return true;
    });

    filtered.sort((a, b) => {
      const va = getMetricValue(a, sortKey);
      const vb = getMetricValue(b, sortKey);
      if (vb !== va) return sortDir === 'desc' ? vb - va : va - vb;
      return b.overall - a.overall;
    });

    return filtered.slice(0, 80);
  }, [scopedPlayers, minApps, posGroup, search, state.clubs, sortKey, sortDir]);

  const handleToggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const renderSortHeader = (label: string, key: SortKey, align: 'left' | 'right' = 'right') => {
    const active = sortKey === key;
    return (
      <th className={`py-2.5 px-2 ${align === 'right' ? 'text-right' : 'text-left'}`}>
        <button
          type="button"
          onClick={() => handleToggleSort(key)}
          className={`inline-flex items-center gap-1 whitespace-nowrap cursor-pointer ${
            active ? 'text-emerald-400 font-semibold' : 'text-zinc-500 hover:text-zinc-200'
          }`}
        >
          <span>{label}</span>
          <ArrowUpDown className="w-2.5 h-2.5" />
        </button>
      </th>
    );
  };

  const userClubName = state.clubs[state.userClubId]?.name || 'Meu Clube';

  return (
    <div className="space-y-5">
      {/* Top 4 Season Leaders Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          {
            title: 'Artilheiro',
            player: leaders.topScorer,
            metric: leaders.topScorer ? `${leaders.topScorer.stats.goals} gols` : '—',
            sub: leaders.topScorer ? `${leaders.topScorer.stats.appearances} jogos` : 'Sem gols',
          },
          {
            title: 'Líder em Assistências',
            player: leaders.topAssist,
            metric: leaders.topAssist ? `${leaders.topAssist.stats.assists} assist.` : '—',
            sub: leaders.topAssist ? `${leaders.topAssist.stats.goals} gols` : 'Sem assistências',
          },
          {
            title: 'Melhor Nota Média',
            player: leaders.topRating,
            metric: leaders.topRating ? getPlayerAvgRating(leaders.topRating).toFixed(2) : '—',
            sub: leaders.topRating ? `${leaders.topRating.stats.motm || 0}x nota ≥ 8.2` : 'Aguardando jogos',
          },
          {
            title: 'Maior Evolução',
            player: leaders.topGrowth,
            metric: leaders.topGrowth ? `+${leaders.topGrowth.stats.ovrDelta} OVR` : '—',
            sub: leaders.topGrowth ? `Atual ${leaders.topGrowth.overall} OVR` : 'Avaliado no fim da época',
          },
        ].map((card) => {
          const club = card.player ? state.clubs[card.player.clubId] : undefined;
          return (
            <button
              key={card.title}
              type="button"
              disabled={!card.player || !onInspectPlayer}
              onClick={() => card.player && onInspectPlayer?.(card.player.id)}
              className="p-4 bg-[#111114] border border-zinc-800/90 hover:border-zinc-700 disabled:hover:border-zinc-800/90 rounded-xl text-left transition-colors cursor-pointer disabled:cursor-default"
            >
              <div className="text-[11px] font-mono text-zinc-400">{card.title}</div>
              {card.player ? (
                <div className="mt-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <ClubCrest clubId={card.player.clubId} clubName={club?.name || ''} size="sm" />
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white truncate">{card.player.name}</div>
                      <div className="text-[11px] text-zinc-500 truncate">{club?.shortName || ''} · {card.player.position}</div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono text-sm font-bold tabular-nums text-emerald-400">{card.metric}</div>
                    <div className="text-[10px] font-mono text-zinc-500">{card.sub}</div>
                  </div>
                </div>
              ) : (
                <div className="mt-2 text-xs text-zinc-500">{card.sub}</div>
              )}
            </button>
          );
        })}
      </div>

      {/* Filters Toolbar */}
      <div className="p-4 bg-[#111114] border border-zinc-800/90 rounded-xl flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[210px]">
          <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar jogador ou clube..."
            className="w-full pl-9 pr-3 py-2 bg-[#09090B] border border-zinc-800 rounded-lg text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500"
          />
        </div>

        <select
          value={scope}
          onChange={(e) => setScope(e.target.value as typeof scope)}
          className="px-3 py-2 bg-[#09090B] border border-zinc-800 rounded-lg text-xs text-zinc-200"
        >
          <option value="ALL">Todas as 9 Ligas</option>
          <option value="USER_CLUB">Elenco: {userClubName}</option>
          {LEAGUES_META.map((l) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>

        <div className="flex items-center gap-1 p-1 bg-[#09090B] border border-zinc-800 rounded-lg">
          {(['ALL', 'GOL', 'DEF', 'MEI', 'ATA'] as const).map((pg) => (
            <button
              key={pg}
              type="button"
              onClick={() => setPosGroup(pg)}
              className={`px-2.5 py-1 text-[11px] font-medium rounded whitespace-nowrap cursor-pointer ${
                posGroup === pg
                  ? 'bg-emerald-500 text-zinc-950 font-semibold'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              {pg === 'ALL' ? 'Todas' : pg}
            </button>
          ))}
        </div>

        <select
          value={minApps}
          onChange={(e) => setMinApps(Number(e.target.value))}
          className="px-3 py-2 bg-[#09090B] border border-zinc-800 rounded-lg text-xs text-zinc-200"
        >
          <option value={0}>Todos (0+ jogos)</option>
          <option value={1}>Com minutos (1+ jogos)</option>
          <option value={5}>Regulares (5+ jogos)</option>
          <option value={15}>Titulares (15+ jogos)</option>
        </select>
      </div>

      {/* Main Stats Table */}
      <div className="bg-[#111114] border border-zinc-800/90 rounded-xl overflow-x-auto">
        {rows.length === 0 ? (
          <div className="p-8 text-center text-xs text-zinc-500">
            Nenhum jogador com os filtros atuais. Simule algumas rodadas ou reduza o filtro de jogos mínimos.
          </div>
        ) : (
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="text-[11px] text-zinc-500 border-b border-zinc-800 bg-[#0d0d10]">
                <th className="py-2.5 pl-4 pr-2 w-8">#</th>
                <th className="py-2.5 pr-3">Jogador</th>
                <th className="py-2.5 px-2">Clube</th>
                <th className="py-2.5 px-2 text-right">OVR</th>
                {renderSortHeader('J', 'appearances')}
                {renderSortHeader('Min', 'minutes')}
                {renderSortHeader('Gols', 'goals')}
                {renderSortHeader('Ast', 'assists')}
                {renderSortHeader('G+A', 'ga')}
                {renderSortHeader('G+A/90', 'ga90')}
                {renderSortHeader('Nota', 'rating')}
                {renderSortHeader('SG', 'cleanSheets')}
                {renderSortHeader('Fora Área', 'outsideBox')}
                {renderSortHeader('8.2+', 'motm')}
                <th className="py-2.5 px-2 text-right whitespace-nowrap">CA/CV</th>
                {renderSortHeader('+OVR', 'ovrDelta')}
                {renderSortHeader('Valor', 'value')}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {rows.map((p, idx) => {
                const club = state.clubs[p.clubId];
                const isUser = p.clubId === state.userClubId;
                const avg = getPlayerAvgRating(p);
                const ga = p.stats.goals + p.stats.assists;
                const ga90 = p.stats.minutes >= 45 ? ((ga / p.stats.minutes) * 90).toFixed(2) : '—';
                return (
                  <tr
                    key={p.id}
                    className={isUser ? 'bg-emerald-500/5 hover:bg-emerald-500/10' : 'hover:bg-zinc-900/50'}
                  >
                    <td className="py-2.5 pl-4 pr-2 font-mono tabular-nums text-zinc-500">{idx + 1}</td>
                    <td className="py-2.5 pr-3">
                      <div className="flex items-center gap-2 min-w-[155px]">
                        <NationFlag nationality={p.nationality} size="xs" />
                        <div className="min-w-0">
                          {onInspectPlayer ? (
                            <button
                              type="button"
                              onClick={() => onInspectPlayer(p.id)}
                              className="font-semibold text-white hover:text-emerald-400 truncate block text-left cursor-pointer"
                            >
                              {p.name}
                            </button>
                          ) : (
                            <span className="font-semibold text-white truncate block">{p.name}</span>
                          )}
                          <div className="text-[10px] font-mono text-zinc-500">
                            {p.position} · {p.age}a · {FORM_LABELS[p.form || 'normal']}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5 px-2 whitespace-nowrap">
                      <div className="flex items-center gap-1.5 text-zinc-300">
                        <ClubCrest clubId={p.clubId} clubName={club?.name || ''} size="xs" />
                        <span>{club?.shortName || p.clubId}</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono tabular-nums font-semibold text-white">
                      {p.overall}
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono tabular-nums text-zinc-400">
                      {p.stats.appearances}
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono tabular-nums text-zinc-400">
                      {p.stats.minutes}&apos;
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono tabular-nums font-bold text-white">
                      {p.stats.goals}
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono tabular-nums text-zinc-200">
                      {p.stats.assists}
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono tabular-nums font-semibold text-emerald-400">
                      {ga}
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono tabular-nums text-zinc-300">
                      {ga90}
                    </td>
                    <td
                      className={`py-2.5 px-2 text-right font-mono tabular-nums font-bold ${
                        avg >= 7.5 ? 'text-emerald-400' : avg >= 6.9 ? 'text-sky-400' : 'text-zinc-300'
                      }`}
                    >
                      {avg > 0 ? avg.toFixed(2) : '—'}
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono tabular-nums text-zinc-400">
                      {p.stats.cleanSheets || 0}
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono tabular-nums text-zinc-400">
                      {p.stats.outsideBoxGoals || 0}
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono tabular-nums text-amber-400">
                      {p.stats.motm || 0}
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono tabular-nums text-zinc-500 whitespace-nowrap">
                      {p.stats.yellowCards}/{p.stats.redCards}
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono tabular-nums">
                      {p.stats.ovrDelta > 0 ? (
                        <span className="inline-flex items-center text-emerald-400 font-semibold">
                          <TrendingUp className="w-3 h-3 mr-0.5" />+{p.stats.ovrDelta}
                        </span>
                      ) : p.stats.ovrDelta < 0 ? (
                        <span className="text-red-400">{p.stats.ovrDelta}</span>
                      ) : (
                        <span className="text-zinc-600">0</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-4 pl-2 text-right font-mono tabular-nums text-emerald-400 whitespace-nowrap">
                      {formatCurrency(p.value)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
