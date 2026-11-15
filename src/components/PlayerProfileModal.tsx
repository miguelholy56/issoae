import React, { useMemo, useState } from 'react';
import { X, ArrowUpRight, AlertTriangle } from 'lucide-react';
import { FORM_LABELS, getPlayerAvgRating, ROLE_LABELS, ROLE_TARGET_SHARE } from '../data/formations';
import {
  computePitchEffectivenessMap,
  formatPlaystylePt,
  PitchZoneScore,
  resolvePlayerAttributes,
} from '../data/playerProfileUtils';
import { evaluateTransferAttempt } from '../engine/transferMarketEngine';
import { GameState, Player } from '../types/game';
import { formatCurrency, formatWage } from '../utils/format';
import { ClubCrest } from './ClubCrest';
import { NationFlag } from './NationFlag';

interface PlayerProfileModalProps {
  state: GameState;
  player: Player;
  onClose: () => void;
  onGoToNegotiate?: (player: Player) => void;
}

function getStatColor(val: number): string {
  if (val >= 85) return 'text-emerald-400';
  if (val >= 76) return 'text-emerald-300';
  if (val >= 66) return 'text-amber-400';
  return 'text-zinc-400';
}

function getStatBarColor(val: number): string {
  if (val >= 85) return 'bg-emerald-500';
  if (val >= 76) return 'bg-emerald-400/80';
  if (val >= 66) return 'bg-amber-500';
  return 'bg-zinc-600';
}

export const PlayerProfileModal: React.FC<PlayerProfileModalProps> = ({
  state,
  player,
  onClose,
  onGoToNegotiate,
}) => {
  const club = state.clubs[player.clubId];
  const league = club ? state.leagues[club.leagueId] : undefined;
  const isUserClub = player.clubId === state.userClubId;

  const attrs = useMemo(() => resolvePlayerAttributes(player), [player]);
  const zoneMap = useMemo(() => computePitchEffectivenessMap(player), [player]);
  const [selectedZone, setSelectedZone] = useState<PitchZoneScore>(() => {
    const map = computePitchEffectivenessMap(player);
    return map.find((z) => z.pos === player.position) || map[0];
  });

  const avgRating = getPlayerAvgRating(player);
  const recent = player.recentRatings || [];
  const per90GA =
    player.stats.minutes >= 45
      ? (((player.stats.goals + player.stats.assists) / player.stats.minutes) * 90).toFixed(2)
      : '—';

  const clubMaxMins = useMemo(() => {
    const mates = Object.values(state.players).filter((p) => p.clubId === player.clubId);
    return Math.max(90, ...mates.map((m) => m.stats.minutes));
  }, [state.players, player.clubId]);

  const minSharePct = Math.min(100, Math.round((player.stats.minutes / clubMaxMins) * 100));
  const targetSharePct = Math.round(ROLE_TARGET_SHARE[player.role] * 100);

  const transferEval = !isUserClub
    ? evaluateTransferAttempt(state, player.id, state.userClubId)
    : null;

  const corePillars =
    player.position === 'GOL'
      ? [
          { code: 'SAL', label: 'Elasticidade', val: attrs.gkDiving ?? attrs.pace },
          { code: 'MAN', label: 'Manejo', val: attrs.gkHandling ?? attrs.shooting },
          { code: 'REP', label: 'Reposição', val: attrs.gkKicking ?? attrs.passing },
          { code: 'REF', label: 'Reflexos', val: attrs.gkReflexes ?? attrs.dribbling },
          { code: 'VEL', label: 'Velocidade', val: Math.round((attrs.acceleration ?? 45) * 0.5 + 30) },
          { code: 'POS', label: 'Posicionamento', val: attrs.gkPositioning ?? attrs.physicality },
        ]
      : [
          { code: 'RIT', label: 'Ritmo', val: attrs.pace },
          { code: 'FIN', label: 'Finalização', val: attrs.shooting },
          { code: 'PAS', label: 'Passe', val: attrs.passing },
          { code: 'DRI', label: 'Drible', val: attrs.dribbling },
          { code: 'DEF', label: 'Defesa', val: attrs.defending },
          { code: 'FIS', label: 'Físico', val: attrs.physicality },
        ];

  const detailGroups =
    player.position === 'GOL'
      ? [
          {
            title: 'Fundamentos de Goleiro',
            items: [
              { label: 'Elasticidade', val: attrs.gkDiving },
              { label: 'Manejo / Defesa Segura', val: attrs.gkHandling },
              { label: 'Reposição com os Pés', val: attrs.gkKicking },
              { label: 'Posicionamento', val: attrs.gkPositioning },
              { label: 'Reflexos', val: attrs.gkReflexes },
              { label: 'Reação', val: attrs.reactions },
            ],
          },
          {
            title: 'Distribuição & Físico',
            items: [
              { label: 'Passe Curto', val: attrs.shortPassing },
              { label: 'Lançamento Longo', val: attrs.longPassing },
              { label: 'Impulsão', val: attrs.jumping },
              { label: 'Força', val: attrs.strength },
              { label: 'Frieza', val: attrs.composure },
            ],
          },
        ]
      : [
          {
            title: 'Ritmo & Físico',
            items: [
              { label: 'Aceleração', val: attrs.acceleration },
              { label: 'Pique', val: attrs.sprintSpeed },
              { label: 'Fôlego', val: attrs.stamina },
              { label: 'Força', val: attrs.strength },
              { label: 'Impulsão', val: attrs.jumping },
              { label: 'Agressividade', val: attrs.aggression },
            ],
          },
          {
            title: 'Ataque & Finalização',
            items: [
              { label: 'Finalização', val: attrs.finishing },
              { label: 'Posicionamento', val: attrs.positioning },
              { label: 'Força do Chute', val: attrs.shotPower },
              { label: 'Chute de Longe', val: attrs.longShots },
              { label: 'Voleios', val: attrs.volleys },
              { label: 'Pênaltis', val: attrs.penalties },
            ],
          },
          {
            title: 'Passe & Drible',
            items: [
              { label: 'Visão de Jogo', val: attrs.vision },
              { label: 'Passe Curto', val: attrs.shortPassing },
              { label: 'Passe Longo', val: attrs.longPassing },
              { label: 'Cruzamento', val: attrs.crossing },
              { label: 'Controle de Bola', val: attrs.ballControl },
              { label: 'Condução', val: attrs.dribblingSkill },
              { label: 'Agilidade', val: attrs.agility },
              { label: 'Frieza', val: attrs.composure },
            ],
          },
          {
            title: 'Defesa & Marcação',
            items: [
              { label: 'Noção Defensiva', val: attrs.defAwareness },
              { label: 'Dividida em Pé', val: attrs.standingTackle },
              { label: 'Carrinho', val: attrs.slidingTackle },
              { label: 'Interceptação', val: attrs.interceptions },
              { label: 'Cabeceio', val: attrs.headingAccuracy },
              { label: 'Reação', val: attrs.reactions },
            ],
          },
        ];

  const formColor =
    player.form === 'otima'
      ? 'text-emerald-400'
      : player.form === 'boa'
        ? 'text-sky-400'
        : player.form === 'ma'
          ? 'text-red-400'
          : 'text-zinc-300';

  const playstyles = (player.playstyles || []).map(formatPlaystylePt);
  const stars = (n?: number) => '★'.repeat(Math.max(1, Math.min(5, n || 3))) + '☆'.repeat(Math.max(0, 5 - (n || 3)));

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-5xl max-h-[92vh] overflow-y-auto bg-[#09090B] border border-zinc-800 rounded-xl shadow-2xl"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-[#09090B]/95 backdrop-blur border-b border-zinc-800 px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-12 h-12 rounded-lg bg-[#111114] border border-zinc-800 flex flex-col items-center justify-center shrink-0">
              <span className="font-mono text-lg font-bold tabular-nums text-emerald-400 leading-none">
                {player.overall}
              </span>
              <span className="font-mono text-[10px] text-zinc-500 mt-0.5">{player.position}</span>
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <NationFlag nationality={player.nationality} size="sm" />
                <h2 className="font-display text-xl font-bold text-white truncate">{player.name}</h2>
                {club && (
                  <div className="flex items-center gap-1.5 text-xs text-zinc-300">
                    <ClubCrest clubId={club.id} clubName={club.name} size="xs" />
                    <span>{club.name}</span>
                  </div>
                )}
              </div>
              <div className="text-xs text-zinc-400 font-mono tabular-nums mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span>{league?.name}</span>
                <span>·</span>
                <span>{player.age} anos</span>
                <span>·</span>
                <span>POT {player.potential}</span>
                <span>·</span>
                <span>Pé {player.preferredFoot || 'Direito'}</span>
                <span>·</span>
                <span>{ROLE_LABELS[player.role]}</span>
                {player.alternatePositions && player.alternatePositions.length > 0 && (
                  <>
                    <span>·</span>
                    <span className="text-zinc-300">Alt: {player.alternatePositions.join(', ')}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0 self-end sm:self-center">
            {!isUserClub && state.gameMode !== 'DRAFT' && onGoToNegotiate && transferEval && (
              <button
                onClick={() => onGoToNegotiate(player)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-zinc-950 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
              >
                {transferEval.allowed ? 'Negociar no Mercado' : 'Consultar Clube'}
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              onClick={onClose}
              aria-label="Fechar perfil"
              className="p-2 text-zinc-400 hover:text-white bg-[#111114] border border-zinc-800 rounded-lg cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Injury Alert if injured */}
          {player.injury && player.injury.roundsRemaining > 0 && (
            <div className="px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center justify-between gap-3 text-xs text-red-300">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                <span>
                  Departamento Médico: <strong className="text-white">{player.injury.type}</strong> — retorno estimado em{' '}
                  <span className="font-mono font-bold tabular-nums">{player.injury.roundsRemaining}</span> rodada(s).
                </span>
              </div>
              <span className="font-mono text-red-400 shrink-0">Indisponível</span>
            </div>
          )}

          {/* Top KPI Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            <div className="p-3.5 bg-[#111114] border border-zinc-800/90 rounded-xl">
              <div className="text-[11px] text-zinc-400">Nota Média</div>
              <div className={`font-mono text-xl font-bold tabular-nums mt-1 ${avgRating >= 7.2 ? 'text-emerald-400' : 'text-white'}`}>
                {avgRating > 0 ? avgRating.toFixed(2) : '—'}
              </div>
              <div className={`text-[11px] mt-0.5 ${formColor}`}>{FORM_LABELS[player.form || 'normal']}</div>
            </div>

            <div className="p-3.5 bg-[#111114] border border-zinc-800/90 rounded-xl">
              <div className="text-[11px] text-zinc-400">Jogos / Minutos</div>
              <div className="font-mono text-xl font-bold tabular-nums text-white mt-1">
                {player.stats.appearances}j · {player.stats.minutes}&apos;
              </div>
              <div className="text-[11px] font-mono tabular-nums text-zinc-500 mt-0.5">
                {minSharePct}% usado (meta {targetSharePct}%)
              </div>
            </div>

            <div className="p-3.5 bg-[#111114] border border-zinc-800/90 rounded-xl">
              <div className="text-[11px] text-zinc-400">Gols & Assist.</div>
              <div className="font-mono text-xl font-bold tabular-nums text-white mt-1">
                {player.stats.goals}G · {player.stats.assists}A
              </div>
              <div className="text-[11px] font-mono tabular-nums text-zinc-500 mt-0.5">
                {per90GA} G+A / 90min
              </div>
            </div>

            <div className="p-3.5 bg-[#111114] border border-zinc-800/90 rounded-xl">
              <div className="text-[11px] text-zinc-400">Físico Atual</div>
              <div className={`font-mono text-xl font-bold tabular-nums mt-1 ${player.fitness >= 75 ? 'text-emerald-400' : player.fitness >= 60 ? 'text-amber-400' : 'text-red-400'}`}>
                {player.fitness}%
              </div>
              <div className="text-[11px] text-zinc-500 mt-0.5">
                {player.stats.yellowCards} CA · {player.stats.redCards} CV
              </div>
            </div>

            <div className="p-3.5 bg-[#111114] border border-zinc-800/90 rounded-xl">
              <div className="text-[11px] text-zinc-400">Valor & Salário</div>
              <div className="font-mono text-lg font-bold tabular-nums text-emerald-400 mt-1">
                {formatCurrency(player.value)}
              </div>
              <div className="text-[11px] font-mono tabular-nums text-zinc-500 mt-0.5">
                {formatWage(player.wage)}
              </div>
            </div>

            <div className="p-3.5 bg-[#111114] border border-zinc-800/90 rounded-xl">
              <div className="text-[11px] text-zinc-400">Técnica</div>
              <div className="font-mono text-xs text-amber-400 mt-1.5">
                Fintas: {stars(player.skillMoves)}
              </div>
              <div className="font-mono text-xs text-zinc-300 mt-1">
                Perna Ruim: {stars(player.weakFoot)}
              </div>
            </div>
          </div>

          {/* Main 2-column Analytical Split: Left Pitch Effectiveness Map | Right Attributes, PlayStyles & Recent Ratings */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left 5 cols: Interactive Pitch Effectiveness Map */}
            <div className="lg:col-span-5 bg-[#111114] border border-zinc-800/90 rounded-xl p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-display text-sm font-semibold text-white">
                    Mapa de Rendimento em Campo
                  </h3>
                  <p className="text-[11px] text-zinc-400">
                    Zonas de maior eficiência tática (clique nos setores)
                  </p>
                </div>
                <span className="font-mono text-xs text-emerald-400 font-semibold">
                  {player.position}
                </span>
              </div>

              <div
                className="relative w-full aspect-[4/5] rounded-xl overflow-hidden border border-zinc-800 select-none"
                style={{
                  background:
                    'repeating-linear-gradient(180deg, #0b2418 0%, #0b2418 10%, #0d2b1d 10%, #0d2b1d 20%)',
                }}
              >
                <svg viewBox="0 0 100 125" className="absolute inset-0 w-full h-full pointer-events-none">
                  <defs>
                    {zoneMap
                      .filter((z) => z.score >= 70)
                      .map((z) => {
                        const isTop = z.score >= 92;
                        const isGood = z.score >= 82;
                        const color = isTop ? '#10b981' : isGood ? '#34d399' : '#f59e0b';
                        const opacity = isTop ? 0.55 : isGood ? 0.35 : 0.22;
                        return (
                          <radialGradient key={`grad_${z.pos}`} id={`heat_${z.pos}`} cx="50%" cy="50%" r="50%">
                            <stop offset="0%" stopColor={color} stopOpacity={opacity} />
                            <stop offset="65%" stopColor={color} stopOpacity={opacity * 0.35} />
                            <stop offset="100%" stopColor={color} stopOpacity="0" />
                          </radialGradient>
                        );
                      })}
                  </defs>

                  {/* Heat blobs */}
                  {zoneMap
                    .filter((z) => z.score >= 70)
                    .map((z) => {
                      const cx = z.x;
                      const cy = (z.y / 100) * 125;
                      const radius = z.score >= 92 ? 24 : z.score >= 82 ? 19 : 14;
                      return (
                        <circle
                          key={`blob_${z.pos}`}
                          cx={cx}
                          cy={cy}
                          r={radius}
                          fill={`url(#heat_${z.pos})`}
                        />
                      );
                    })}

                  {/* Crisp pitch lines */}
                  <g className="opacity-35">
                    <rect x="4" y="4" width="92" height="117" fill="none" stroke="#ffffff" strokeWidth="0.6" />
                    <line x1="4" y1="62.5" x2="96" y2="62.5" stroke="#ffffff" strokeWidth="0.6" />
                    <circle cx="50" cy="62.5" r="12" fill="none" stroke="#ffffff" strokeWidth="0.6" />
                    <rect x="24" y="4" width="52" height="18" fill="none" stroke="#ffffff" strokeWidth="0.6" />
                    <rect x="24" y="103" width="52" height="18" fill="none" stroke="#ffffff" strokeWidth="0.6" />
                  </g>
                </svg>

                {/* Interactive Zone Nodes */}
                {zoneMap.map((z) => {
                  const isSel = selectedZone.pos === z.pos;
                  const ringCls =
                    z.score >= 92
                      ? 'border-emerald-400 bg-emerald-500 text-zinc-950'
                      : z.score >= 82
                        ? 'border-emerald-400/80 bg-zinc-950/90 text-emerald-300'
                        : z.score >= 70
                          ? 'border-amber-400/70 bg-zinc-950/90 text-amber-300'
                          : 'border-zinc-700 bg-zinc-950/75 text-zinc-500';

                  return (
                    <button
                      key={z.pos}
                      type="button"
                      onClick={() => setSelectedZone(z)}
                      style={{ left: `${z.x}%`, top: `${z.y}%` }}
                      className={`absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center cursor-pointer transition-transform ${
                        isSel ? 'scale-115 z-10' : 'hover:scale-105'
                      }`}
                    >
                      <span
                        className={`px-2 py-0.5 rounded border text-[10px] font-mono font-bold tabular-nums shadow ${ringCls} ${
                          isSel ? 'ring-2 ring-white/80' : ''
                        }`}
                      >
                        {z.label} · {z.score}%
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Selected Zone Readout */}
              <div className="p-3 bg-[#09090B] border border-zinc-800 rounded-lg space-y-1 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white">
                    {selectedZone.pos} — {selectedZone.fullName}
                  </span>
                  <span
                    className={`font-mono font-bold tabular-nums ${
                      selectedZone.score >= 92
                        ? 'text-emerald-400'
                        : selectedZone.score >= 80
                          ? 'text-emerald-300'
                          : selectedZone.score >= 68
                            ? 'text-amber-400'
                            : 'text-zinc-500'
                    }`}
                  >
                    {selectedZone.score}% eficiência
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400">{selectedZone.reason}</p>
              </div>
            </div>

            {/* Right 7 cols: Core Attributes, PlayStyles, Recent Ratings & Detailed Breakdown */}
            <div className="lg:col-span-7 space-y-5">
              {/* 6 Core Attribute Bars + Recent 5 Match Ratings */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-[#111114] border border-zinc-800/90 rounded-xl space-y-3">
                  <h3 className="font-display text-sm font-semibold text-white">
                    Atributos Principais
                  </h3>
                  <div className="space-y-2.5">
                    {corePillars.map((c) => (
                      <div key={c.code} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-zinc-300">
                            <span className="font-mono text-zinc-500 mr-1.5">{c.code}</span>
                            {c.label}
                          </span>
                          <span className={`font-mono font-bold tabular-nums ${getStatColor(c.val)}`}>
                            {c.val}
                          </span>
                        </div>
                        <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${getStatBarColor(c.val)}`}
                            style={{ width: `${c.val}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Recent 5 Match Ratings + Market Posture */}
                <div className="p-4 bg-[#111114] border border-zinc-800/90 rounded-xl flex flex-col justify-between gap-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="font-display text-sm font-semibold text-white">
                        Histórico de Notas (Últimos 5)
                      </h3>
                      <span className="font-mono text-xs tabular-nums text-zinc-400">
                        Última: {player.lastRating !== null ? player.lastRating.toFixed(1) : '—'}
                      </span>
                    </div>

                    {recent.length === 0 ? (
                      <div className="py-6 text-center text-xs text-zinc-500">
                        Nenhuma nota registrada ainda nesta temporada.
                      </div>
                    ) : (
                      <div className="grid grid-cols-5 gap-2 items-end h-24 pt-2 border-b border-zinc-800 pb-2">
                        {recent.map((r, i) => {
                          const hPct = Math.max(18, Math.min(100, ((r - 4.0) / 6.0) * 100));
                          const barCol =
                            r >= 7.8
                              ? 'bg-emerald-500'
                              : r >= 6.9
                                ? 'bg-sky-500'
                                : r >= 6.0
                                  ? 'bg-zinc-500'
                                  : 'bg-red-500';
                          return (
                            <div key={i} className="flex flex-col items-center justify-end h-full gap-1">
                              <span className="font-mono text-[11px] font-bold tabular-nums text-zinc-200">
                                {r.toFixed(1)}
                              </span>
                              <div className="w-full max-w-[32px] bg-zinc-900 rounded-t h-14 flex items-end overflow-hidden">
                                <div className={`w-full rounded-t ${barCol}`} style={{ height: `${hPct}%` }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {transferEval && (
                    <div className="p-3 bg-[#09090B] border border-zinc-800 rounded-lg text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-zinc-400">Situação de Mercado</span>
                        <span className={transferEval.allowed ? 'text-emerald-400 font-semibold' : 'text-red-400 font-semibold'}>
                          {transferEval.statusLabel}
                        </span>
                      </div>
                      <div className="font-mono tabular-nums text-zinc-200">
                        {transferEval.allowed
                          ? `Pedido estimado: ${formatCurrency(transferEval.askingPrice)}`
                          : transferEval.reason}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* PlayStyles Section */}
              <div className="p-4 bg-[#111114] border border-zinc-800/90 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-sm font-semibold text-white">
                    PlayStyles & Especialidades
                  </h3>
                  <span className="font-mono text-[11px] text-zinc-500">
                    {playstyles.length} estilo(s) registrado(s)
                  </span>
                </div>

                {playstyles.length === 0 ? (
                  <p className="text-xs text-zinc-500">
                    Atleta sem PlayStyles especiais cadastrados na base atual.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {playstyles.map((ps, idx) => (
                      <div
                        key={idx}
                        className={`px-3 py-2 rounded-lg border text-xs ${
                          ps.isPlus
                            ? 'bg-amber-500/10 border-amber-500/40 text-amber-200'
                            : 'bg-[#09090B] border-zinc-800 text-zinc-200'
                        }`}
                      >
                        <div className="font-semibold truncate">
                          {ps.label}
                        </div>
                        <div className="text-[10px] font-mono text-zinc-500 truncate">
                          {ps.isPlus ? 'PlayStyle+ · Elite' : ps.rawName}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Detailed Attribute Groups */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {detailGroups.map((grp) => {
                  const validItems = grp.items.filter((it) => typeof it.val === 'number' && it.val > 0);
                  if (validItems.length === 0) return null;
                  return (
                    <div key={grp.title} className="p-4 bg-[#111114] border border-zinc-800/90 rounded-xl space-y-2.5">
                      <h4 className="font-display text-xs font-semibold text-zinc-200 border-b border-zinc-800 pb-1.5">
                        {grp.title}
                      </h4>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                        {validItems.map((it) => (
                          <div key={it.label} className="flex items-center justify-between gap-2">
                            <span className="text-zinc-400 truncate">{it.label}</span>
                            <span className={`font-mono font-bold tabular-nums ${getStatColor(it.val || 60)}`}>
                              {it.val}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
