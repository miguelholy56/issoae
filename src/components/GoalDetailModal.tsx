import React from 'react';
import { Crosshair, X } from 'lucide-react';
import { FINISH_TYPE_LABELS, getAttr } from '../engine/goalShotEngine';
import { Fixture, GameState, GoalShotDetail, MatchEvent } from '../types/game';
import { ClubCrest } from './ClubCrest';

interface GoalDetailModalProps {
  state: GameState;
  fixture?: Fixture | null;
  event: MatchEvent;
  onClose: () => void;
  onInspectPlayer?: (playerId: string) => void;
}

export const GoalDetailModal: React.FC<GoalDetailModalProps> = ({
  state,
  fixture,
  event,
  onClose,
  onInspectPlayer,
}) => {
  const club = state.clubs[event.clubId];
  const scorer = event.playerId ? state.players[event.playerId] : undefined;
  const assister = event.assistPlayerId ? state.players[event.assistPlayerId] : undefined;

  // Backwards-compatible fallback for older saves without shotDetail
  const detail: GoalShotDetail = event.shotDetail || {
    originX: 50,
    originY: 11,
    targetX: 47,
    targetY: -1.3,
    finishType: scorer?.preferredFoot === 'Esquerdo' ? 'ESQUERDA' : 'DIREITA',
    distanceMeters: 11.2,
    xg: 0.34,
    bodyPartLabel:
      FINISH_TYPE_LABELS[scorer?.preferredFoot === 'Esquerdo' ? 'ESQUERDA' : 'DIREITA'],
  };

  const zoneLabel =
    detail.finishType === 'PENALTI_D' || detail.finishType === 'PENALTI_E'
      ? 'Marca do Pênalti'
      : detail.isOutsideBox || detail.originY > 16.8
        ? 'Fora da Área'
        : detail.originY <= 5.8 && detail.originX >= 36 && detail.originX <= 64
          ? 'Pequena Área'
          : 'Grande Área';

  const keyAttrs: { label: string; value: number }[] = [];
  if (scorer) {
    if (detail.finishType === 'FALTA_D' || detail.finishType === 'FALTA_E') {
      keyAttrs.push({ label: 'Precisão Falta', value: getAttr(scorer, 'fkAccuracy', scorer.overall) });
      keyAttrs.push({ label: 'Curva', value: getAttr(scorer, 'curve', scorer.overall) });
      keyAttrs.push({ label: 'Força de Chute', value: getAttr(scorer, 'shotPower', scorer.overall) });
    } else if (detail.finishType === 'PENALTI_D' || detail.finishType === 'PENALTI_E') {
      keyAttrs.push({ label: 'Pênaltis', value: getAttr(scorer, 'penalties', scorer.overall) });
      keyAttrs.push({ label: 'Frieza', value: getAttr(scorer, 'composure', scorer.overall) });
      keyAttrs.push({ label: 'Força de Chute', value: getAttr(scorer, 'shotPower', scorer.overall) });
    } else if (detail.finishType === 'CABECEIO') {
      keyAttrs.push({ label: 'Cabeceio', value: getAttr(scorer, 'headingAccuracy', scorer.overall) });
      keyAttrs.push({ label: 'Impulsão', value: getAttr(scorer, 'jumping', scorer.overall) });
      keyAttrs.push({ label: 'Posicionamento', value: getAttr(scorer, 'positioning', scorer.overall) });
    } else if (detail.isOutsideBox) {
      keyAttrs.push({ label: 'Chute de Longe', value: getAttr(scorer, 'longShots', scorer.overall) });
      keyAttrs.push({ label: 'Força de Chute', value: getAttr(scorer, 'shotPower', scorer.overall) });
      keyAttrs.push({ label: 'Finalização', value: getAttr(scorer, 'finishing', scorer.overall) });
    } else {
      keyAttrs.push({ label: 'Finalização', value: getAttr(scorer, 'finishing', scorer.overall) });
      keyAttrs.push({ label: 'Frieza', value: getAttr(scorer, 'composure', scorer.overall) });
      keyAttrs.push({ label: 'Força de Chute', value: getAttr(scorer, 'shotPower', scorer.overall) });
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-[#111114] border border-zinc-800 rounded-xl overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            {club && (
              <ClubCrest
                clubId={club.id}
                clubName={club.name}
                shortName={club.shortName}
                primaryColor={club.primaryColor}
                size="sm"
              />
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs font-mono text-emerald-400">
                <Crosshair className="w-3.5 h-3.5 shrink-0" />
                <span>Mapa do Gol · {event.minute}&apos;</span>
                {fixture && (
                  <span className="text-zinc-500">
                    · {state.clubs[fixture.homeClubId]?.shortName} {fixture.homeGoals ?? 0} -{' '}
                    {fixture.awayGoals ?? 0} {state.clubs[fixture.awayClubId]?.shortName}
                  </span>
                )}
              </div>
              <div className="text-base font-display font-bold text-white truncate mt-0.5">
                {scorer ? (
                  <button
                    type="button"
                    onClick={() => onInspectPlayer?.(scorer.id)}
                    className="hover:text-emerald-400 transition-colors cursor-pointer"
                  >
                    {scorer.name}
                  </button>
                ) : (
                  event.playerName || club?.name
                )}
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-white rounded-lg cursor-pointer"
            aria-label="Fechar mapa do gol"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
          {/* Half-pitch SVG Map (7 cols) */}
          <div className="md:col-span-7 bg-[#09090B] border border-zinc-800 rounded-xl p-3">
            <svg viewBox="0 -6 100 58" className="w-full h-auto block rounded-lg overflow-hidden">
              <defs>
                <marker
                  id="shot-arrow"
                  markerWidth="4.5"
                  markerHeight="4.5"
                  refX="3.2"
                  refY="2.25"
                  orient="auto"
                >
                  <polygon points="0 0, 4.5 2.25, 0 4.5" fill="#34D399" />
                </marker>
                <marker
                  id="assist-arrow"
                  markerWidth="4"
                  markerHeight="4"
                  refX="2.8"
                  refY="2"
                  orient="auto"
                >
                  <polygon points="0 0, 4 2, 0 4" fill="#94A3B8" />
                </marker>
              </defs>

              {/* Turf stripes */}
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <rect
                  key={i}
                  x={0}
                  y={-6 + i * 9.8}
                  width={100}
                  height={9.8}
                  fill={i % 2 === 0 ? '#0B2318' : '#0E2B1E'}
                />
              ))}

              {/* Goal Net (top y=-3.2..0, x=44..56) */}
              <rect
                x={44}
                y={-3.2}
                width={12}
                height={3.2}
                fill="rgba(255,255,255,0.08)"
                stroke="rgba(255,255,255,0.78)"
                strokeWidth={0.6}
              />

              {/* Outer pitch boundary & midfield line */}
              <rect
                x={3}
                y={0}
                width={94}
                height={50}
                fill="none"
                stroke="rgba(255,255,255,0.34)"
                strokeWidth={0.55}
              />
              {/* Center circle top arc at midfield y=50 */}
              <path
                d="M 38 50 A 12 12 0 0 1 62 50"
                fill="none"
                stroke="rgba(255,255,255,0.28)"
                strokeWidth={0.5}
              />

              {/* Penalty Box (16.5m) */}
              <rect
                x={22}
                y={0}
                width={56}
                height={16.5}
                fill="none"
                stroke="rgba(255,255,255,0.4)"
                strokeWidth={0.55}
              />
              {/* 6-yard Box */}
              <rect
                x={36}
                y={0}
                width={28}
                height={5.5}
                fill="none"
                stroke="rgba(255,255,255,0.4)"
                strokeWidth={0.5}
              />
              {/* Penalty Spot & D-Arc */}
              <circle cx={50} cy={11.2} r={0.55} fill="rgba(255,255,255,0.55)" />
              <path
                d="M 41.5 16.5 A 9.5 9.5 0 0 0 58.5 16.5"
                fill="none"
                stroke="rgba(255,255,255,0.35)"
                strokeWidth={0.5}
              />

              {/* Assister origin & dashed pass trajectory */}
              {detail.assistOriginX !== undefined && detail.assistOriginY !== undefined && (
                <>
                  <line
                    x1={detail.assistOriginX}
                    y1={detail.assistOriginY}
                    x2={detail.originX}
                    y2={detail.originY}
                    stroke="#94A3B8"
                    strokeWidth={0.65}
                    strokeDasharray="1.6 1.4"
                    markerEnd="url(#assist-arrow)"
                    opacity={0.85}
                  />
                  <circle
                    cx={detail.assistOriginX}
                    cy={detail.assistOriginY}
                    r={2.1}
                    fill="#1E293B"
                    stroke="#CBD5E1"
                    strokeWidth={0.55}
                  />
                  <text
                    x={detail.assistOriginX}
                    y={detail.assistOriginY + 0.8}
                    textAnchor="middle"
                    fontSize={2.3}
                    fontWeight="bold"
                    fill="#E2E8F0"
                  >
                    A
                  </text>
                </>
              )}

              {/* Shot Trajectory Line */}
              <line
                x1={detail.originX}
                y1={detail.originY}
                x2={detail.targetX}
                y2={detail.targetY}
                stroke="#34D399"
                strokeWidth={1.1}
                markerEnd="url(#shot-arrow)"
              />

              {/* Shooter Origin Point */}
              <circle
                cx={detail.originX}
                cy={detail.originY}
                r={3.2}
                fill="rgba(16,185,129,0.22)"
              />
              <circle
                cx={detail.originX}
                cy={detail.originY}
                r={1.9}
                fill="#10B981"
                stroke="#FFFFFF"
                strokeWidth={0.6}
              />

              {/* Target Goal Mouth Dot */}
              <circle
                cx={detail.targetX}
                cy={detail.targetY}
                r={1.15}
                fill="#FBBF24"
                stroke="#09090B"
                strokeWidth={0.4}
              />
            </svg>

            <div className="mt-2.5 flex items-center justify-between text-[11px] font-mono text-zinc-400">
              <span>● Origem do chute</span>
              {detail.assistOriginX !== undefined && <span>A Passe / Cruzamento</span>}
              <span>● Ponto no gol</span>
            </div>
          </div>

          {/* Shot Metrics & Attributes (5 cols) */}
          <div className="md:col-span-5 space-y-3 text-xs">
            <div className="p-3 bg-[#09090B] border border-zinc-800/90 rounded-lg space-y-1.5">
              <div className="text-[11px] font-mono text-zinc-500">Tipo de Finalização</div>
              <div className="text-sm font-semibold text-emerald-400">
                {detail.bodyPartLabel}
              </div>
              <div className="text-[11px] font-mono text-zinc-400">
                Zona: <span className="text-zinc-200">{zoneLabel}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 font-mono tabular-nums">
              <div className="p-3 bg-[#09090B] border border-zinc-800/90 rounded-lg">
                <div className="text-[10px] text-zinc-500">Distância</div>
                <div className="text-base font-bold text-white mt-0.5">
                  {detail.distanceMeters.toFixed(1)} m
                </div>
              </div>
              <div className="p-3 bg-[#09090B] border border-zinc-800/90 rounded-lg">
                <div className="text-[10px] text-zinc-500">Probabilidade (xG)</div>
                <div className="text-base font-bold text-emerald-400 mt-0.5">
                  {detail.xg.toFixed(2)}
                </div>
              </div>
            </div>

            {assister && (
              <div className="p-3 bg-[#09090B] border border-zinc-800/90 rounded-lg flex items-center justify-between">
                <span className="text-zinc-500">Assistência</span>
                <button
                  type="button"
                  onClick={() => onInspectPlayer?.(assister.id)}
                  className="font-medium text-zinc-200 hover:text-emerald-400 cursor-pointer"
                >
                  {assister.name}
                </button>
              </div>
            )}

            {(detail.playstyleUsed || keyAttrs.length > 0) && (
              <div className="p-3 bg-[#09090B] border border-zinc-800/90 rounded-lg space-y-2">
                <div className="text-[11px] font-mono text-zinc-500">
                  Playstyles & Atributos Decisivos
                </div>
                {detail.playstyleUsed && (
                  <div className="text-xs font-semibold text-amber-300">
                    Estilo ativo: {detail.playstyleUsed}
                  </div>
                )}
                {keyAttrs.length > 0 && (
                  <div className="space-y-1">
                    {keyAttrs.map((a) => (
                      <div key={a.label} className="flex items-center justify-between font-mono tabular-nums">
                        <span className="text-zinc-400">{a.label}</span>
                        <span className={a.value >= 80 ? 'text-emerald-400 font-bold' : 'text-zinc-200'}>
                          {a.value}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
