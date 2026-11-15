import React, { useRef, useState } from 'react';
import { Sparkles, Move, Save, RotateCcw, User, RefreshCw, FileJson, Copy, Check } from 'lucide-react';
import {
  autoPickLineup,
  FORM_LABELS,
  getActiveSlots,
  getPlayerAvgRating,
  inferPosFromCoords,
  PRESET_FORMATIONS,
  ROLE_LABELS,
} from '../data/formations';
import { analyzeClubTactics, getSlotDisplayLabel } from '../engine/tacticsEngine';
import {
  Club,
  ClubTactics,
  FormationSlot,
  FormationTemplate,
  GameState,
  Mentality,
  PassingStyle,
  Player,
  PlayerFormPhase,
  PressingLevel,
  SquadRole,
  TempoLevel,
} from '../types/game';
import { buildSquadExportText, copyTextToClipboard } from '../utils/squadExport';
import { NationFlag } from './NationFlag';

interface TacticsSquadViewProps {
  state: GameState;
  userClub: Club;
  clubPlayers: Player[];
  onUpdateClubAndPlayers: (updater: (draft: GameState) => void) => void;
  onInspectPlayer: (playerId: string) => void;
  onOpenJsonUpdater: () => void;
}

const FORM_COLOR: Record<PlayerFormPhase, string> = {
  otima: 'text-emerald-400 font-semibold',
  boa: 'text-sky-400',
  normal: 'text-zinc-400',
  ma: 'text-red-400',
};

export const TacticsSquadView: React.FC<TacticsSquadViewProps> = ({
  state,
  userClub,
  clubPlayers,
  onUpdateClubAndPlayers,
  onInspectPlayer,
  onOpenJsonUpdater,
}) => {
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [customEditorOpen, setCustomEditorOpen] = useState(false);
  const [customName, setCustomName] = useState('Minha Formação');
  const [draggingSlotIdx, setDraggingSlotIdx] = useState<number | null>(null);
  const [injuryNotice, setInjuryNotice] = useState<string | null>(null);
  const [copiedSquad, setCopiedSquad] = useState(false);
  const pitchRef = useRef<HTMLDivElement>(null);

  const handleCopySquadText = async () => {
    const text = buildSquadExportText(state, userClub, clubPlayers);
    const ok = await copyTextToClipboard(text);
    if (ok) {
      setCopiedSquad(true);
      window.setTimeout(() => setCopiedSquad(false), 2000);
    }
  };

  const allFormations = [...PRESET_FORMATIONS, ...state.customFormations];
  const activeSlots = getActiveSlots(userClub.tactics, state.customFormations);
  const tacticalAnalysis = analyzeClubTactics(activeSlots, userClub.tactics);

  const starterSet = new Set(userClub.starterIds);
  const benchSet = new Set(userClub.benchIds);
  const starters = userClub.starterIds.map((id) => state.players[id]).filter(Boolean);
  const bench = userClub.benchIds.map((id) => state.players[id]).filter(Boolean);
  const reserves = clubPlayers
    .filter((p) => !starterSet.has(p.id) && !benchSet.has(p.id))
    .sort((a, b) => b.overall - a.overall);

  const handleSwapOrSelect = (playerId: string) => {
    const target = state.players[playerId];
    if (target?.injury && target.injury.roundsRemaining > 0) {
      setInjuryNotice(
        `${target.name} está lesionado (${target.injury.type} · ${target.injury.roundsRemaining} rod.) e não pode ser escalado.`
      );
      return;
    }
    setInjuryNotice(null);

    if (!selectedPlayerId) {
      setSelectedPlayerId(playerId);
      return;
    }
    if (selectedPlayerId === playerId) {
      setSelectedPlayerId(null);
      return;
    }

    onUpdateClubAndPlayers((draft) => {
      const club = draft.clubs[draft.userClubId];
      const s = [...club.starterIds];
      const b = [...club.benchIds];
      const idx1S = s.indexOf(selectedPlayerId);
      const idx2S = s.indexOf(playerId);
      const idx1B = b.indexOf(selectedPlayerId);
      const idx2B = b.indexOf(playerId);

      if (idx1S !== -1 && idx2S !== -1) {
        [s[idx1S], s[idx2S]] = [s[idx2S], s[idx1S]];
      } else if (idx1S !== -1 && idx2B !== -1) {
        s[idx1S] = playerId;
        b[idx2B] = selectedPlayerId;
      } else if (idx2S !== -1 && idx1B !== -1) {
        s[idx2S] = selectedPlayerId;
        b[idx1B] = playerId;
      } else if (idx1S !== -1 && idx2B === -1 && idx2S === -1) {
        s[idx1S] = playerId;
      } else if (idx2S !== -1 && idx1B === -1 && idx1S === -1) {
        s[idx2S] = selectedPlayerId;
      } else if (idx1B !== -1 && idx2B !== -1) {
        [b[idx1B], b[idx2B]] = [b[idx2B], b[idx1B]];
      } else if (idx1B !== -1 && idx2S === -1 && idx2B === -1) {
        b[idx1B] = playerId;
      } else if (idx2B !== -1 && idx1S === -1 && idx1B === -1) {
        b[idx2B] = selectedPlayerId;
      } else if (idx1S === -1 && idx1B === -1 && idx2S === -1 && idx2B === -1) {
        if (b.length < 7) b.push(playerId);
      }

      club.starterIds = s;
      club.benchIds = b;
    });
    setSelectedPlayerId(null);
  };

  const handleSelectFormation = (formationId: string) => {
    onUpdateClubAndPlayers((draft) => {
      const club = draft.clubs[draft.userClubId];
      club.tactics.formationId = formationId;
      club.tactics.customFormation = undefined;
    });
  };

  const handleUpdateTactic = <K extends keyof ClubTactics>(key: K, val: ClubTactics[K]) => {
    onUpdateClubAndPlayers((draft) => {
      draft.clubs[draft.userClubId].tactics[key] = val;
    });
  };

  const handleRoleChange = (playerId: string, role: SquadRole) => {
    onUpdateClubAndPlayers((draft) => {
      if (draft.players[playerId]) {
        draft.players[playerId].role = role;
      }
    });
  };

  const handleAutoPick = () => {
    setInjuryNotice(null);
    onUpdateClubAndPlayers((draft) => {
      const club = draft.clubs[draft.userClubId];
      const list = Object.values(draft.players).filter((p) => p.clubId === club.id);
      const slots = getActiveSlots(club.tactics, draft.customFormations);
      const picked = autoPickLineup(list, slots);
      club.starterIds = picked.starterIds;
      club.benchIds = picked.benchIds;
    });
  };

  const handleToggleAutoRotate = () => {
    onUpdateClubAndPlayers((draft) => {
      const club = draft.clubs[draft.userClubId];
      club.autoRotate = club.autoRotate === false ? true : false;
    });
  };

  const handlePitchPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!customEditorOpen || draggingSlotIdx === null || !pitchRef.current) return;
    const rect = pitchRef.current.getBoundingClientRect();
    const x = Math.max(8, Math.min(92, Math.round(((e.clientX - rect.left) / rect.width) * 100)));
    const y = Math.max(10, Math.min(92, Math.round(((e.clientY - rect.top) / rect.height) * 100)));

    onUpdateClubAndPlayers((draft) => {
      const club = draft.clubs[draft.userClubId];
      const current = club.tactics.customFormation
        ? [...club.tactics.customFormation]
        : activeSlots.map((s) => ({ ...s }));
      const pos = draggingSlotIdx === 0 ? 'GOL' : inferPosFromCoords(x, y);
      const updatedSlot: FormationSlot = {
        ...current[draggingSlotIdx],
        x,
        y,
        pos,
        label: pos,
      };
      updatedSlot.label = getSlotDisplayLabel(updatedSlot, draggingSlotIdx);
      current[draggingSlotIdx] = updatedSlot;
      club.tactics.customFormation = current;
    });
  };

  const handleSaveCustomFormation = () => {
    const slotsToSave: FormationSlot[] = activeSlots.map((s) => ({ ...s }));
    const id = `custom_${Date.now()}`;
    const newTemplate: FormationTemplate = {
      id,
      name: customName.trim() || 'Formação Customizada',
      isCustom: true,
      slots: slotsToSave,
    };
    onUpdateClubAndPlayers((draft) => {
      draft.customFormations.push(newTemplate);
      draft.clubs[draft.userClubId].tactics.formationId = id;
      draft.clubs[draft.userClubId].tactics.customFormation = undefined;
    });
    setCustomEditorOpen(false);
  };

  const renderPlayerRow = (p: Player, slotLabel?: string) => {
    const isSelected = selectedPlayerId === p.id;
    const isInjured = Boolean(p.injury && p.injury.roundsRemaining > 0);
    const avgRating = getPlayerAvgRating(p);
    const fitnessColor =
      p.fitness >= 80 ? 'bg-emerald-500' : p.fitness >= 65 ? 'bg-amber-500' : 'bg-red-500';
    return (
      <tr
        key={p.id}
        onClick={() => handleSwapOrSelect(p.id)}
        className={`transition-colors ${
          isInjured
            ? 'opacity-70 cursor-not-allowed bg-red-500/5'
            : isSelected
              ? 'bg-emerald-500/15 cursor-pointer'
              : 'hover:bg-zinc-900/70 cursor-pointer'
        }`}
      >
        <td className="py-2 pl-3 pr-2 w-12">
          <span className="font-mono text-[11px] text-zinc-400">
            {slotLabel || p.position}
          </span>
        </td>
        <td className="py-2 pr-2">
          <div className="flex items-center gap-2 min-w-0">
            <NationFlag nationality={p.nationality} size="sm" />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onInspectPlayer(p.id);
                    }}
                    className="text-xs font-medium text-zinc-100 hover:text-emerald-400 truncate text-left cursor-pointer"
                    title="Abrir Perfil do Atleta"
                  >
                    {p.name}
                  </button>
                </div>
                <div className="text-[11px] text-zinc-500 font-mono tabular-nums">
                  {p.position} · {p.age}a · {p.stats.goals}G {p.stats.assists}A · {p.stats.minutes}'
                </div>
              </div>
            </div>
        </td>
        <td className="py-2 px-2 text-right font-mono text-xs tabular-nums">
          <div className={FORM_COLOR[p.form || 'normal']}>{FORM_LABELS[p.form || 'normal']}</div>
          <div className="text-[11px] text-zinc-400">
            {avgRating > 0 ? `Média ${avgRating.toFixed(1)}` : 'Sem nota'}
          </div>
        </td>
        <td className="py-2 px-2 text-right font-mono text-xs tabular-nums">
          <span className="font-semibold text-white">{p.overall}</span>
          <span className="text-zinc-500">/{p.potential}</span>
        </td>
        <td className="py-2 px-2 w-28">
          {isInjured ? (
            <div className="text-[11px] font-mono text-red-400">
              Lesão · {p.injury?.roundsRemaining} rod.
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className={`h-full ${fitnessColor}`}
                  style={{ width: `${p.fitness}%` }}
                />
              </div>
              <span className="font-mono text-[11px] tabular-nums text-zinc-400 w-7 text-right">
                {p.fitness}
              </span>
            </div>
          )}
        </td>
        <td
          className="py-2 pl-2 pr-3 text-right"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="inline-flex items-center justify-end gap-1.5">
            <select
              value={p.role}
              onChange={(e) => handleRoleChange(p.id, e.target.value as SquadRole)}
              className="bg-[#09090B] border border-zinc-800 rounded px-2 py-1 text-[11px] text-zinc-200 focus:outline-none focus:border-emerald-500"
            >
              {Object.entries(ROLE_LABELS).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => onInspectPlayer(p.id)}
              title="Ver Perfil do Atleta"
              className="p-1.5 rounded bg-[#09090B] border border-zinc-800 text-zinc-400 hover:text-emerald-400 hover:border-emerald-500/50 transition-colors cursor-pointer"
            >
              <User className="w-3.5 h-3.5" />
            </button>
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left 5 cols: Interactive Tactical Pitch + Instructions */}
      <div className="lg:col-span-5 space-y-4">
        <div className="p-4 bg-[#111114] border border-zinc-800/90 rounded-xl space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <select
              value={userClub.tactics.formationId}
              onChange={(e) => handleSelectFormation(e.target.value)}
              className="bg-[#09090B] border border-zinc-800 rounded-lg px-3 py-2 text-xs font-medium text-white focus:outline-none focus:border-emerald-500"
            >
              {allFormations.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} {f.isCustom ? '(Minha)' : ''}
                </option>
              ))}
            </select>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleToggleAutoRotate}
                title="Quando ativa, a comissão técnica roda o elenco em Copas, poupa atletas cansados e dá minutos para artilharia e cargos de minutagem."
                className={`inline-flex items-center gap-1.5 px-2.5 py-2 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                  userClub.autoRotate !== false
                    ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white'
                }`}
              >
                <RefreshCw className="w-3.5 h-3.5" />
                {userClub.autoRotate !== false ? 'Rotação IA: Ativa' : 'Rotação IA: Manual'}
              </button>
              <button
                onClick={() => setCustomEditorOpen((v) => !v)}
                className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                  customEditorOpen
                    ? 'bg-emerald-500/15 border-emerald-500 text-emerald-400'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:text-white'
                }`}
              >
                <Move className="w-3.5 h-3.5" />
                {customEditorOpen ? 'Editando Posições' : 'Criar Formação'}
              </button>
              <button
                onClick={handleAutoPick}
                title="Escalar automaticamente por fase, cargo e saúde"
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-zinc-950 rounded-lg transition-colors cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Auto-Escalar
              </button>
            </div>
          </div>

          {customEditorOpen && (
            <div className="p-3 bg-[#09090B] border border-zinc-800 rounded-lg flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="Nome da sua formação"
                className="flex-1 min-w-[140px] px-2.5 py-1.5 text-xs bg-[#111114] border border-zinc-800 rounded text-white focus:outline-none focus:border-emerald-500"
              />
              <button
                onClick={handleSaveCustomFormation}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-emerald-500 text-zinc-950 rounded hover:bg-emerald-400 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                Salvar Formação
              </button>
              <button
                onClick={() => {
                  handleSelectFormation('4-3-3');
                  setCustomEditorOpen(false);
                }}
                className="p-1.5 text-zinc-400 hover:text-white cursor-pointer"
                title="Resetar"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Tactical Pitch Canvas */}
          <div
            ref={pitchRef}
            onPointerMove={handlePitchPointerMove}
            onPointerUp={() => setDraggingSlotIdx(null)}
            onPointerLeave={() => setDraggingSlotIdx(null)}
            className="relative w-full aspect-[4/5] rounded-xl overflow-hidden border border-zinc-800 select-none touch-none"
            style={{
              background:
                'repeating-linear-gradient(180deg, #0d2b1d 0%, #0d2b1d 10%, #0f3322 10%, #0f3322 20%)',
            }}
          >
            <svg viewBox="0 0 100 125" className="absolute inset-0 w-full h-full pointer-events-none opacity-30">
              <rect x="4" y="4" width="92" height="117" fill="none" stroke="#ffffff" strokeWidth="0.6" />
              <line x1="4" y1="62.5" x2="96" y2="62.5" stroke="#ffffff" strokeWidth="0.6" />
              <circle cx="50" cy="62.5" r="12" fill="none" stroke="#ffffff" strokeWidth="0.6" />
              <rect x="24" y="4" width="52" height="18" fill="none" stroke="#ffffff" strokeWidth="0.6" />
              <rect x="24" y="103" width="52" height="18" fill="none" stroke="#ffffff" strokeWidth="0.6" />
            </svg>

            {activeSlots.map((slot, idx) => {
              const player = starters[idx];
              const isSelected = player && selectedPlayerId === player.id;
              const isHot = player && (player.form === 'otima' || player.form === 'boa');
              return (
                <div
                  key={slot.id + idx}
                  onPointerDown={(e) => {
                    if (customEditorOpen) {
                      e.preventDefault();
                      setDraggingSlotIdx(idx);
                    } else if (player) {
                      handleSwapOrSelect(player.id);
                    }
                  }}
                  style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-0.5 ${
                    customEditorOpen ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
                  }`}
                >
                  <div
                    className={`w-9 h-9 rounded-full border-2 flex items-center justify-center font-mono text-xs font-bold shadow-md transition-transform ${
                      isSelected
                        ? 'scale-110 border-emerald-400 bg-emerald-500 text-zinc-950'
                        : customEditorOpen
                          ? 'border-amber-400 bg-zinc-950/90 text-amber-300'
                          : isHot
                            ? 'border-emerald-400 bg-zinc-950/95 text-emerald-300'
                            : 'border-zinc-200 bg-zinc-950/90 text-white hover:border-emerald-400'
                    }`}
                  >
                    {player ? player.overall : slot.pos}
                  </div>
                  <div className="px-1.5 py-0.5 rounded bg-zinc-950/85 text-[10px] font-medium text-zinc-100 whitespace-nowrap max-w-[84px] truncate">
                    {customEditorOpen
                      ? getSlotDisplayLabel(slot, idx)
                      : player
                        ? player.name.split(' ').slice(-1)[0]
                        : getSlotDisplayLabel(slot, idx)}
                  </div>
                  {player && (
                    <div className="w-8 h-1 bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${
                          player.fitness >= 75
                            ? 'bg-emerald-400'
                            : player.fitness >= 60
                              ? 'bg-amber-400'
                              : 'bg-red-500'
                        }`}
                        style={{ width: `${player.fitness}%` }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <p className="text-[11px] text-zinc-500">
            {customEditorOpen
              ? 'Arraste os círculos no campo para criar sua formação e clique em Salvar.'
              : 'Clique em dois jogadores disponíveis para trocar titularidade e banco.'}
          </p>
        </div>

        {/* Tactical Instructions */}
        <div className="p-4 bg-[#111114] border border-zinc-800/90 rounded-xl grid grid-cols-2 gap-3 text-xs">
          <div>
            <label className="block text-zinc-400 mb-1">Mentalidade</label>
            <select
              value={userClub.tactics.mentality}
              onChange={(e) => handleUpdateTactic('mentality', e.target.value as Mentality)}
              className="w-full bg-[#09090B] border border-zinc-800 rounded-lg px-2.5 py-2 text-zinc-100"
            >
              <option value="defensiva">Defensiva</option>
              <option value="equilibrada">Equilibrada</option>
              <option value="ofensiva">Ofensiva</option>
            </select>
          </div>
          <div>
            <label className="block text-zinc-400 mb-1">Estilo de Passe</label>
            <select
              value={userClub.tactics.passing}
              onChange={(e) => handleUpdateTactic('passing', e.target.value as PassingStyle)}
              className="w-full bg-[#09090B] border border-zinc-800 rounded-lg px-2.5 py-2 text-zinc-100"
            >
              <option value="curto">Posse / Curto</option>
              <option value="misto">Misto</option>
              <option value="direto">Direto / Longo</option>
            </select>
          </div>
          <div>
            <label className="block text-zinc-400 mb-1">Pressão</label>
            <select
              value={userClub.tactics.pressing}
              onChange={(e) => handleUpdateTactic('pressing', e.target.value as PressingLevel)}
              className="w-full bg-[#09090B] border border-zinc-800 rounded-lg px-2.5 py-2 text-zinc-100"
            >
              <option value="baixa">Baixa (Poupa Físico)</option>
              <option value="media">Média</option>
              <option value="alta">Alta (Mais Risco de Lesão)</option>
            </select>
          </div>
          <div>
            <label className="block text-zinc-400 mb-1">Ritmo de Jogo</label>
            <select
              value={userClub.tactics.tempo}
              onChange={(e) => handleUpdateTactic('tempo', e.target.value as TempoLevel)}
              className="w-full bg-[#09090B] border border-zinc-800 rounded-lg px-2.5 py-2 text-zinc-100"
            >
              <option value="lento">Cadenciado</option>
              <option value="normal">Normal</option>
              <option value="rapido">Acelerado</option>
            </select>
          </div>
        </div>

        {/* Compact Behind-the-Scenes Tactical Readout */}
        <div className="p-4 bg-[#111114] border border-zinc-800/90 rounded-xl space-y-3 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-display font-semibold text-white">Leitura Tática do Esquema</span>
            <span className="font-mono text-[11px] text-zinc-400 tabular-nums">
              Compactação {tacticalAnalysis.compactnessScore}% · Amplitude {tacticalAnalysis.ratings.width}%
            </span>
          </div>

          <div className="grid grid-cols-4 gap-2 text-center font-mono tabular-nums">
            <div className="p-2 bg-[#09090B] border border-zinc-800/80 rounded-lg">
              <div className="text-[10px] text-zinc-500">Defesa</div>
              <div className="text-sm font-bold text-white mt-0.5">{tacticalAnalysis.ratings.defense}</div>
            </div>
            <div className="p-2 bg-[#09090B] border border-zinc-800/80 rounded-lg">
              <div className="text-[10px] text-zinc-500">Meio</div>
              <div className="text-sm font-bold text-white mt-0.5">{tacticalAnalysis.ratings.midfield}</div>
            </div>
            <div className="p-2 bg-[#09090B] border border-zinc-800/80 rounded-lg">
              <div className="text-[10px] text-zinc-500">Ataque</div>
              <div className="text-sm font-bold text-white mt-0.5">{tacticalAnalysis.ratings.attack}</div>
            </div>
            <div className="p-2 bg-[#09090B] border border-zinc-800/80 rounded-lg">
              <div className="text-[10px] text-zinc-500">Risco Costas</div>
              <div
                className={`text-sm font-bold mt-0.5 ${
                  tacticalAnalysis.ratings.risk >= 45
                    ? 'text-red-400'
                    : tacticalAnalysis.ratings.risk >= 25
                      ? 'text-amber-400'
                      : 'text-emerald-400'
                }`}
              >
                {tacticalAnalysis.ratings.risk}%
              </div>
            </div>
          </div>

          {(tacticalAnalysis.warnings.length > 0 || tacticalAnalysis.strengths.length > 0) && (
            <div className="space-y-1 text-[11px] leading-snug">
              {tacticalAnalysis.warnings.slice(0, 2).map((w, i) => (
                <div key={`w-${i}`} className="text-amber-400/95">
                  • {w}
                </div>
              ))}
              {tacticalAnalysis.strengths.slice(0, 2).map((s, i) => (
                <div key={`s-${i}`} className="text-emerald-400/95">
                  • {s}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right 7 cols: Squad Table with Ratings, Form, Injuries & Roles */}
      <div className="lg:col-span-7 bg-[#111114] border border-zinc-800/90 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-base font-semibold text-white">
              Elenco, Notas, Fases & Lesões
            </h2>
            <p className="text-xs text-zinc-400">
              Boas fases elevam o rendimento em campo; atletas lesionados ficam vetados até se recuperarem.
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {selectedPlayerId && (
              <>
                <button
                  onClick={() => onInspectPlayer(selectedPlayerId)}
                  className="text-xs text-emerald-400 hover:underline cursor-pointer"
                >
                  Ver Perfil
                </button>
                <button
                  onClick={() => setSelectedPlayerId(null)}
                  className="text-xs text-amber-400 hover:underline cursor-pointer"
                >
                  Cancelar troca
                </button>
              </>
            )}
            <button
              type="button"
              onClick={handleCopySquadText}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                copiedSquad
                  ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300'
                  : 'bg-[#09090B] hover:bg-zinc-900 border-zinc-800 text-zinc-200'
              }`}
              title="Copiar elenco completo em texto (tudo que aparece na tabela)"
            >
              {copiedSquad ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5 text-emerald-400" />
              )}
              {copiedSquad ? 'Elenco Copiado!' : 'Copiar Elenco'}
            </button>
            <button
              type="button"
              onClick={onOpenJsonUpdater}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#09090B] hover:bg-zinc-900 border border-zinc-800 text-zinc-200 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
              title="Atualizar elencos rapidamente via JSON"
            >
              <FileJson className="w-3.5 h-3.5 text-emerald-400" />
              Atualizar JSON
            </button>
          </div>
        </div>

        {injuryNotice && (
          <div className="px-4 py-2.5 text-xs bg-red-500/10 border-b border-red-500/30 text-red-300">
            {injuryNotice}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="text-[11px] text-zinc-500 border-b border-zinc-800 bg-[#0d0d10]">
                <th className="py-2 pl-3 pr-2">Vaga</th>
                <th className="py-2 pr-2">Atleta</th>
                <th className="py-2 px-2 text-right">Fase / Nota</th>
                <th className="py-2 px-2 text-right">OVR/POT</th>
                <th className="py-2 px-2">Condição</th>
                <th className="py-2 pl-2 pr-3 text-right">Cargo Minutagem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              <tr className="bg-zinc-900/50">
                <td colSpan={6} className="px-3 py-1.5 text-[11px] font-mono text-emerald-400">
                  Titulares ({starters.length}/11)
                </td>
              </tr>
              {starters.map((p, idx) =>
                renderPlayerRow(
                  p,
                  activeSlots[idx] ? getSlotDisplayLabel(activeSlots[idx], idx) : p.position
                )
              )}

              <tr className="bg-zinc-900/50">
                <td colSpan={6} className="px-3 py-1.5 text-[11px] font-mono text-zinc-400">
                  Banco de Reservas ({bench.length}/7)
                </td>
              </tr>
              {bench.map((p) => renderPlayerRow(p, 'BAN'))}

              <tr className="bg-zinc-900/50">
                <td colSpan={6} className="px-3 py-1.5 text-[11px] font-mono text-zinc-500">
                  Não Relacionados & DM ({reserves.length})
                </td>
              </tr>
              {reserves.map((p) => renderPlayerRow(p, 'RES'))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
