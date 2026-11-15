import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  Check,
  Dices,
  RefreshCw,
  Search,
  Sparkles,
  UserMinus,
} from 'lucide-react';
import { FORM_LABELS, getPositionGroup } from '../data/formations';
import { resolvePlayerAttributes } from '../data/playerProfileUtils';
import {
  ATTRIBUTE_FOCUS_INFO,
  DRAFT_TIER_DESC,
  DRAFT_TIER_LABEL,
  getClubCurrentLeagueRank,
  isDraftWindowMandatoryPending,
} from '../engine/draftEngine';
import {
  Club,
  DraftAttributeFocus,
  DraftCandidate,
  DraftClassTier,
  GameState,
  Player,
  Position,
  PositionGroup,
} from '../types/game';
import { formatCurrency } from '../utils/format';
import { ClubCrest } from './ClubCrest';
import { NationFlag } from './NationFlag';

interface DraftViewProps {
  state: GameState;
  userClub: Club;
  clubPlayers: Player[];
  feedbackMsg: string | null;
  onSellSquadPlayer: (playerId: string) => void;
  onBuyInitialCandidate: (tier: DraftClassTier, playerId: string) => void;
  onRerollInitial: (tier?: DraftClassTier) => void;
  onRollMidWindow: (position: Position, tier: DraftClassTier) => void;
  onSignMidCandidate: () => void;
  onApplyAttributeBuff: (playerId: string, focus: DraftAttributeFocus) => void;
  onInspectPlayer: (playerId: string) => void;
  onGoToCentral: () => void;
}

const POSITIONS: Position[] = ['GOL', 'ZAG', 'LE', 'LD', 'VOL', 'MC', 'MEI', 'PE', 'PD', 'ATA'];
const TIER_ORDER: DraftClassTier[] = ['VETERANO', 'AUGE', 'PROMESSA'];
const FOCUS_KEYS: DraftAttributeFocus[] = [
  'FINALIZACAO',
  'ARMACAO',
  'VELOCIDADE_DRIBLE',
  'DEFESA',
  'FISICO',
  'GOLEIRO',
];

export const DraftView: React.FC<DraftViewProps> = ({
  state,
  userClub,
  clubPlayers,
  feedbackMsg,
  onSellSquadPlayer,
  onBuyInitialCandidate,
  onRerollInitial,
  onRollMidWindow,
  onSignMidCandidate,
  onApplyAttributeBuff,
  onInspectPlayer,
  onGoToCentral,
}) => {
  const draft = state.draftState;
  const { rank: currentRank, total: totalClubsInLeague } = useMemo(
    () => getClubCurrentLeagueRank(userClub.id, state),
    [userClub.id, state]
  );

  const [subMode, setSubMode] = useState<'WINDOW' | 'BUFFS'>('WINDOW');
  const [sellSearch, setSellSearch] = useState('');
  const [sellPosGroup, setSellPosGroup] = useState<'ALL' | PositionGroup>('ALL');

  const [midPos, setMidPos] = useState<Position>(draft?.midWindowSelectedPos || 'MC');
  const [midTier, setMidTier] = useState<DraftClassTier>(draft?.midWindowSelectedTier || 'PROMESSA');

  const sortedSquad = useMemo(
    () => clubPlayers.slice().sort((a, b) => b.overall - a.overall || a.age - b.age),
    [clubPlayers]
  );
  const [buffPlayerId, setBuffPlayerId] = useState<string>(sortedSquad[0]?.id || '');
  const [buffFocus, setBuffFocus] = useState<DraftAttributeFocus>('FINALIZACAO');

  if (!draft) {
    return (
      <div className="p-6 bg-[#111114] border border-zinc-800 rounded-xl text-sm text-zinc-400">
        Estado do Draft indisponível para esta carreira.
      </div>
    );
  }

  const mandatoryPending = isDraftWindowMandatoryPending(state);

  // Determine exact sequential step for Phase 1
  const currentInitialTier: DraftClassTier | null =
    state.phase === 'INICIO_JANELA' && draft.soldOutCountThisWindow >= 3
      ? TIER_ORDER.find((t) => !draft.pickedTiersThisWindow.includes(t)) || null
      : null;

  const isPhase1Selling = state.phase === 'INICIO_JANELA' && draft.soldOutCountThisWindow < 3;
  const isPhase1Done =
    state.phase === 'INICIO_JANELA' &&
    draft.soldOutCountThisWindow >= 3 &&
    draft.pickedTiersThisWindow.length >= 3;

  const selectedBuffPlayer =
    clubPlayers.find((p) => p.id === buffPlayerId) || sortedSquad[0] || null;
  const effectiveFocus: DraftAttributeFocus =
    selectedBuffPlayer?.position === 'GOL'
      ? 'GOLEIRO'
      : buffFocus === 'GOLEIRO'
        ? 'FINALIZACAO'
        : buffFocus;

  const filteredSellList = useMemo(() => {
    const q = sellSearch.trim().toLowerCase();
    return sortedSquad.filter((p) => {
      if (sellPosGroup !== 'ALL' && getPositionGroup(p.position) !== sellPosGroup) return false;
      if (q && !p.name.toLowerCase().includes(q) && !p.position.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [sortedSquad, sellPosGroup, sellSearch]);

  const isFreeOpeningMidRoll =
    state.phase === 'MEIO_JANELA' &&
    draft.midWindowPicksUsed === 0 &&
    !draft.midWindowCandidate;

  const renderScoutingCard = (
    cand: DraftCandidate,
    actionLabel: string,
    onSelect: () => void,
    canAffordAllCheck?: boolean
  ) => {
    const p = state.players[cand.playerId];
    if (!p) return null;
    const attrs = resolvePlayerAttributes(p);
    const affordable = canAffordAllCheck === false ? true : userClub.budget >= cand.draftPrice;

    const miniStats =
      p.position === 'GOL'
        ? [
            { k: 'REF', v: attrs.gkReflexes ?? p.overall },
            { k: 'ELA', v: attrs.gkDiving ?? p.overall },
            { k: 'POS', v: attrs.gkPositioning ?? p.overall },
            { k: 'MAN', v: attrs.gkHandling ?? p.overall },
          ]
        : [
            { k: 'RIT', v: attrs.pace },
            { k: 'FIN', v: attrs.shooting },
            { k: 'PAS', v: attrs.passing },
            { k: 'DRI', v: attrs.dribbling },
            { k: 'DEF', v: attrs.defending },
            { k: 'FIS', v: attrs.physicality },
          ];

    return (
      <div
        key={cand.playerId}
        className={`p-5 rounded-xl border flex flex-col justify-between gap-4 transition-colors ${
          cand.isUnderdogBuffed
            ? 'bg-[#0e1512] border-emerald-500/45'
            : 'bg-[#111114] border-zinc-800/90'
        }`}
      >
        <div className="space-y-3.5">
          {/* Player Identity & OVR */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2">
                <NationFlag nationality={p.nationality} size="sm" />
                <button
                  type="button"
                  onClick={() => onInspectPlayer(p.id)}
                  className="font-display text-base font-bold text-white hover:text-emerald-400 truncate text-left cursor-pointer"
                >
                  {p.name}
                </button>
              </div>
              <div className="text-xs font-mono text-zinc-400">
                {p.position} · {p.age} anos · POT{' '}
                {cand.isUnderdogBuffed ? Math.max(p.potential, cand.buffedOverall + 1) : p.potential}
              </div>
            </div>

            <div className="text-right shrink-0">
              {cand.isUnderdogBuffed ? (
                <div>
                  <div className="font-mono text-2xl font-bold tabular-nums text-emerald-400 leading-none">
                    {cand.buffedOverall}
                  </div>
                  <div className="text-[11px] font-mono tabular-nums text-zinc-500 mt-1">
                    Era {cand.originalOverall} (+{cand.ovrBuffDelta})
                  </div>
                </div>
              ) : (
                <div>
                  <div className="font-mono text-2xl font-bold tabular-nums text-white leading-none">
                    {cand.originalOverall}
                  </div>
                  <div className="text-[11px] font-mono text-zinc-500 mt-1">OVR</div>
                </div>
              )}
            </div>
          </div>

          {/* Origin Club & Buff Explanation */}
          <div className="pt-2.5 border-t border-zinc-800/70 space-y-1.5">
            <div className="flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <ClubCrest clubId={cand.fromClubId} clubName={cand.fromClubName} size="xs" />
                <span className="text-zinc-200 truncate">{cand.fromClubName}</span>
              </div>
              <span className="font-mono text-[11px] tabular-nums text-zinc-400 shrink-0">
                {cand.fromTableRank}º de {cand.fromLeagueClubCount}
              </span>
            </div>
            <div
              className={`text-xs ${
                cand.isUnderdogBuffed ? 'text-emerald-400 font-medium' : 'text-zinc-500'
              }`}
            >
              {cand.isUnderdogBuffed
                ? `Clube da metade inferior da tabela · Buff automático (+${cand.ovrBuffDelta} OVR)`
                : 'Clube da metade superior · sem bônus extra de Draft'}
            </div>
          </div>

          {/* Key Attribute Bars */}
          <div className="grid grid-cols-3 gap-2 pt-1">
            {miniStats.map((st) => (
              <div key={st.k} className="px-2.5 py-1.5 bg-[#09090B] border border-zinc-800/80 rounded-lg">
                <div className="flex items-center justify-between text-[11px] font-mono tabular-nums">
                  <span className="text-zinc-500">{st.k}</span>
                  <span className={st.v >= 80 ? 'text-emerald-400 font-bold' : 'text-zinc-200 font-semibold'}>
                    {st.v}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {p.playstyles && p.playstyles.length > 0 && (
            <div className="text-[11px] text-zinc-400 truncate">
              Especialidades: {p.playstyles.slice(0, 3).join(', ')}
            </div>
          )}
        </div>

        {/* Price & Action Footer */}
        <div className="pt-3 border-t border-zinc-800/80 flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] text-zinc-500">Valor do Draft</div>
            <div className="font-mono text-sm font-bold tabular-nums text-emerald-400">
              {canAffordAllCheck === false
                ? formatCurrency(Math.min(userClub.budget, cand.draftPrice))
                : formatCurrency(cand.draftPrice)}
            </div>
          </div>
          <button
            onClick={onSelect}
            disabled={!affordable}
            className="px-4 py-2 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-zinc-950 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {affordable ? actionLabel : 'Verba Insuficiente'}
          </button>
        </div>
      </div>
    );
  };

  const phase1Steps = [
    { id: 'SELL', label: '1. Vender 3', done: draft.soldOutCountThisWindow >= 3, active: isPhase1Selling },
    {
      id: 'VETERANO',
      label: '2. Veteranos',
      done: draft.pickedTiersThisWindow.includes('VETERANO'),
      active: currentInitialTier === 'VETERANO',
    },
    {
      id: 'AUGE',
      label: '3. No Auge',
      done: draft.pickedTiersThisWindow.includes('AUGE'),
      active: currentInitialTier === 'AUGE',
    },
    {
      id: 'PROMESSA',
      label: '4. Promessas',
      done: draft.pickedTiersThisWindow.includes('PROMESSA'),
      active: currentInitialTier === 'PROMESSA',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Unified Clean Top Header Strip */}
      <div className="p-4 bg-[#111114] border border-zinc-800/90 rounded-xl flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-6">
          <div>
            <div className="text-[11px] font-mono text-zinc-500">Verba de Draft</div>
            <div className="font-mono text-lg font-bold tabular-nums text-emerald-400">
              {formatCurrency(userClub.budget)}
            </div>
          </div>
          <div className="h-8 w-px bg-zinc-800 hidden sm:block" />
          <div>
            <div className="text-[11px] font-mono text-zinc-500">Passes de Roleta</div>
            <div className="font-mono text-lg font-bold tabular-nums text-amber-400">
              {draft.roulettePasses}
            </div>
          </div>
          <div className="h-8 w-px bg-zinc-800 hidden sm:block" />
          <div>
            <div className="text-[11px] font-mono text-zinc-500">Liga vs Meta</div>
            <div className="font-mono text-sm font-semibold tabular-nums text-white mt-0.5">
              {currentRank}º de {totalClubsInLeague}{' '}
              <span className={currentRank <= draft.expectedLeaguePos ? 'text-emerald-400' : 'text-zinc-400'}>
                (Meta: {draft.expectedLeaguePos}º)
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 p-1 bg-[#09090B] border border-zinc-800 rounded-lg self-start lg:self-auto">
          <button
            onClick={() => setSubMode('WINDOW')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md whitespace-nowrap cursor-pointer ${
              subMode === 'WINDOW'
                ? 'bg-emerald-500 text-zinc-950 font-semibold'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            {mandatoryPending ? 'Janela Obrigatória' : 'Janela do Draft'}
          </button>
          <button
            onClick={() => setSubMode('BUFFS')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md whitespace-nowrap cursor-pointer ${
              subMode === 'BUFFS'
                ? 'bg-amber-400 text-zinc-950 font-semibold'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Buffs Direcionados ({draft.roulettePasses})
          </button>
        </div>
      </div>

      {feedbackMsg && (
        <div className="px-4 py-3 bg-[#111114] border border-emerald-500/40 rounded-xl text-xs text-emerald-300">
          {feedbackMsg}
        </div>
      )}

      {subMode === 'BUFFS' ? (
        /* FOCUSED DIRECTED ATTRIBUTE BUFF VIEW */
        <div className="p-6 bg-[#111114] border border-zinc-800/90 rounded-xl space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800 pb-4">
            <div>
              <h2 className="font-display text-xl font-bold text-white">
                Buff Direcionado de Atributos
              </h2>
              <p className="text-xs text-zinc-400 mt-1">
                Invista 1 Passe de Roleta para evoluir um jogador do elenco exatamente na área desejada (+8 nos atributos do pacote e salto no OVR).
              </p>
            </div>
            <div className="font-mono text-sm font-bold tabular-nums text-amber-400 shrink-0">
              {draft.roulettePasses} {draft.roulettePasses === 1 ? 'passe disponível' : 'passes disponíveis'}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-5 space-y-3">
              <div className="text-xs font-medium text-zinc-300">1. Selecione o atleta do elenco</div>
              <select
                value={selectedBuffPlayer?.id || ''}
                onChange={(e) => setBuffPlayerId(e.target.value)}
                className="w-full px-3 py-2.5 text-xs bg-[#09090B] border border-zinc-800 rounded-lg text-white"
              >
                {sortedSquad.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.position} · {p.overall} OVR · {p.age}a)
                  </option>
                ))}
              </select>

              {selectedBuffPlayer && (
                <div className="p-4 bg-[#09090B] border border-zinc-800/90 rounded-xl space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-white text-sm">{selectedBuffPlayer.name}</span>
                    <span className="font-mono font-bold tabular-nums text-emerald-400">
                      {selectedBuffPlayer.overall} →{' '}
                      {Math.min(96, selectedBuffPlayer.overall + (selectedBuffPlayer.overall < 86 ? 3 : 2))} OVR
                    </span>
                  </div>
                  <div className="text-zinc-400 font-mono">
                    {selectedBuffPlayer.position} · {selectedBuffPlayer.age} anos · POT {selectedBuffPlayer.potential}
                  </div>
                </div>
              )}
            </div>

            <div className="lg:col-span-7 space-y-3">
              <div className="text-xs font-medium text-zinc-300">2. Escolha o foco do treinamento</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {FOCUS_KEYS.map((fk) => {
                  const info = ATTRIBUTE_FOCUS_INFO[fk];
                  const isGkFocus = fk === 'GOLEIRO';
                  const playerIsGk = selectedBuffPlayer?.position === 'GOL';
                  const invalidCombo = (isGkFocus && !playerIsGk) || (!isGkFocus && playerIsGk);
                  const selected = effectiveFocus === fk;
                  return (
                    <button
                      key={fk}
                      disabled={invalidCombo}
                      onClick={() => setBuffFocus(fk)}
                      className={`p-3.5 rounded-xl border text-left cursor-pointer disabled:opacity-35 transition-colors ${
                        selected
                          ? 'bg-amber-500/15 border-amber-400 text-white'
                          : 'bg-[#09090B] border-zinc-800 text-zinc-300 hover:border-zinc-700'
                      }`}
                    >
                      <div className="text-xs font-semibold">{info.label}</div>
                      <div className="text-[11px] text-zinc-400 mt-1">{info.desc}</div>
                    </button>
                  );
                })}
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={() => selectedBuffPlayer && onApplyAttributeBuff(selectedBuffPlayer.id, effectiveFocus)}
                  disabled={!selectedBuffPlayer || draft.roulettePasses < 1}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold bg-amber-400 hover:bg-amber-300 disabled:opacity-40 text-zinc-950 rounded-lg cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" />
                  Aplicar Buff em {selectedBuffPlayer?.name || 'Atleta'} (1 Passe)
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : state.phase === 'INICIO_JANELA' ? (
        /* PHASE 1: CLEAN SEQUENTIAL STEP-BY-STEP WIZARD */
        <div className="space-y-5">
          {/* Stepper Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {phase1Steps.map((st) => (
              <div
                key={st.id}
                className={`px-4 py-3 rounded-xl border text-xs flex items-center justify-between gap-2 ${
                  st.active
                    ? 'bg-zinc-900 border-emerald-500 text-white font-semibold'
                    : st.done
                      ? 'bg-[#111114] border-emerald-500/35 text-emerald-400'
                      : 'bg-[#111114] border-zinc-800/80 text-zinc-500'
                }`}
              >
                <span className="truncate">{st.label}</span>
                {st.done && <Check className="w-3.5 h-3.5 shrink-0" />}
              </div>
            ))}
          </div>

          {isPhase1Selling && (
            /* STEP 1: ONLY SELL 3 PLAYERS */
            <div className="p-6 bg-[#111114] border border-zinc-800/90 rounded-xl space-y-5">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
                <div>
                  <h2 className="font-display text-xl font-bold text-white">
                    Passo 1: Escolha 3 Jogadores para Vender
                  </h2>
                  <p className="text-xs text-zinc-400 mt-1">
                    Antes de abrir a tela dos Veteranos, No Auge e Promessas, dispense 3 atletas. Eles vão para clubes aleatórios e o dinheiro soma à sua verba.
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {[0, 1, 2].map((slotIdx) => {
                    const soldName = draft.soldPlayerNamesThisWindow[slotIdx];
                    return (
                      <div
                        key={slotIdx}
                        className={`px-3 py-2 rounded-lg border text-xs font-mono min-w-[100px] text-center ${
                          soldName
                            ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
                            : 'bg-[#09090B] border-zinc-800 text-zinc-500'
                        }`}
                      >
                        {soldName ? soldName.split(' ').slice(-1)[0] : `Saída ${slotIdx + 1}`}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Filter & Search Squad */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={sellSearch}
                    onChange={(e) => setSellSearch(e.target.value)}
                    placeholder="Filtrar jogador do elenco..."
                    className="w-full pl-9 pr-3 py-2 bg-[#09090B] border border-zinc-800 rounded-lg text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div className="flex items-center gap-1 p-1 bg-[#09090B] border border-zinc-800 rounded-lg">
                  {(['ALL', 'GOL', 'DEF', 'MEI', 'ATA'] as const).map((pg) => (
                    <button
                      key={pg}
                      type="button"
                      onClick={() => setSellPosGroup(pg)}
                      className={`px-2.5 py-1 text-[11px] font-medium rounded cursor-pointer ${
                        sellPosGroup === pg
                          ? 'bg-emerald-500 text-zinc-950 font-semibold'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      {pg === 'ALL' ? 'Todos' : pg}
                    </button>
                  ))}
                </div>
              </div>

              {/* Clean Squad Sell Table */}
              <div className="border border-zinc-800/80 rounded-xl overflow-hidden">
                <div className="max-h-[420px] overflow-y-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="sticky top-0 bg-[#0d0d10] border-b border-zinc-800">
                      <tr className="text-[11px] text-zinc-500">
                        <th className="py-2.5 pl-4 pr-2">Atleta</th>
                        <th className="py-2.5 px-2">Pos</th>
                        <th className="py-2.5 px-2 text-right">Idade</th>
                        <th className="py-2.5 px-2 text-right">OVR / POT</th>
                        <th className="py-2.5 px-2">Fase</th>
                        <th className="py-2.5 px-2 text-right">Valor de Venda</th>
                        <th className="py-2.5 pl-2 pr-4 text-right">Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/50 bg-[#09090B]">
                      {filteredSellList.map((p) => {
                        const salePrice = Math.max(650_000, Math.round(p.value * 0.95));
                        const minSquadReached = clubPlayers.length <= 15;
                        return (
                          <tr key={p.id} className="hover:bg-zinc-900/60">
                            <td className="py-2.5 pl-4 pr-2">
                              <div className="flex items-center gap-2">
                                <NationFlag nationality={p.nationality} size="xs" />
                                <button
                                  type="button"
                                  onClick={() => onInspectPlayer(p.id)}
                                  className="font-semibold text-white hover:text-emerald-400 text-left cursor-pointer"
                                >
                                  {p.name}
                                </button>
                              </div>
                            </td>
                            <td className="py-2.5 px-2 font-mono text-zinc-300">{p.position}</td>
                            <td className="py-2.5 px-2 text-right font-mono tabular-nums text-zinc-400">
                              {p.age}
                            </td>
                            <td className="py-2.5 px-2 text-right font-mono tabular-nums">
                              <span className="font-bold text-white">{p.overall}</span>
                              <span className="text-zinc-500">/{p.potential}</span>
                            </td>
                            <td className="py-2.5 px-2 text-zinc-400">{FORM_LABELS[p.form || 'normal']}</td>
                            <td className="py-2.5 px-2 text-right font-mono font-bold tabular-nums text-emerald-400">
                              +{formatCurrency(salePrice)}
                            </td>
                            <td className="py-2.5 pl-2 pr-4 text-right">
                              <button
                                onClick={() => onSellSquadPlayer(p.id)}
                                disabled={minSquadReached}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold bg-zinc-800 hover:bg-red-500/20 hover:text-red-300 border border-zinc-700 disabled:opacity-40 text-zinc-200 rounded-md cursor-pointer"
                              >
                                <UserMinus className="w-3 h-3" />
                                Vender
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {currentInitialTier && (
            /* STEPS 2, 3, 4: ONE FOCUSED TIER STAGE AT A TIME */
            <div className="p-6 bg-[#111114] border border-zinc-800/90 rounded-xl space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
                <div>
                  <div className="text-xs font-mono text-emerald-400">
                    Escolha {draft.pickedTiersThisWindow.length + 1} de 3 · Classe {DRAFT_TIER_LABEL[currentInitialTier]}
                  </div>
                  <h2 className="font-display text-2xl font-bold text-white mt-0.5">
                    Draft: {DRAFT_TIER_LABEL[currentInitialTier]}
                  </h2>
                  <p className="text-xs text-zinc-400 mt-1">
                    {DRAFT_TIER_DESC[currentInitialTier]} · Apenas atletas de clubes da metade inferior da tabela ganham Buff automático.
                  </p>
                </div>

                <button
                  onClick={() => onRerollInitial(currentInitialTier)}
                  disabled={draft.roulettePasses < 1}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-amber-300 border border-amber-500/35 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Re-rolar {DRAFT_TIER_LABEL[currentInitialTier]} (1 Passe)
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {(() => {
                  const cards = draft.initialOfferings[currentInitialTier] || [];
                  const canAffordAny = cards.some((c) => userClub.budget >= c.draftPrice);
                  return cards.map((cand) =>
                    renderScoutingCard(
                      cand,
                      `Escolher ${DRAFT_TIER_LABEL[currentInitialTier]}`,
                      () => onBuyInitialCandidate(currentInitialTier, cand.playerId),
                      canAffordAny
                    )
                  );
                })()}
              </div>
            </div>
          )}

          {isPhase1Done && (
            /* PHASE 1 COMPLETE SUMMARY */
            <div className="p-6 bg-[#111114] border border-emerald-500/45 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-5">
              <div className="space-y-1.5">
                <div className="inline-flex items-center gap-1.5 text-xs font-mono font-semibold text-emerald-400">
                  <Check className="w-4 h-4" />
                  Janela Inicial do Draft Concluída
                </div>
                <h2 className="font-display text-xl font-bold text-white">
                  3 saídas e 3 reforços confirmados no elenco
                </h2>
                <p className="text-xs text-zinc-400">
                  Saídas: {draft.soldPlayerNamesThisWindow.join(', ')}. Ajuste sua escalação ou simule até o Meio da Temporada.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                {draft.roulettePasses > 0 && (
                  <button
                    onClick={() => setSubMode('BUFFS')}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-amber-300 border border-amber-500/35 rounded-lg cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Usar Passe de Buff ({draft.roulettePasses})
                  </button>
                )}
                <button
                  onClick={onGoToCentral}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-zinc-950 rounded-lg cursor-pointer"
                >
                  Ir para Central & Simular
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      ) : state.phase === 'MEIO_JANELA' ? (
        /* PHASE 2: CLEAN MID-SEASON ROULETTE */
        <div className="p-6 bg-[#111114] border border-zinc-800/90 rounded-xl space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-4">
            <div>
              <div className="text-xs font-mono text-emerald-400">
                Janela de Meio de Temporada · {draft.midWindowPicksUsed === 0 ? 'Passo Obrigatório' : 'Giros Extras'}
              </div>
              <h2 className="font-display text-xl font-bold text-white mt-0.5">
                Roleta por Posição & Classificação
              </h2>
              <p className="text-xs text-zinc-400 mt-1">
                Escolha a posição e a faixa etária. Se o atleta roletado vier de um clube da metade inferior da tabela, recebe Buff automático de OVR.
              </p>
            </div>
            {draft.midWindowPicksUsed >= 1 && (
              <button
                onClick={onGoToCentral}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-zinc-950 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
              >
                Voltar para Central
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-6 space-y-4">
              <div>
                <div className="text-xs font-medium text-zinc-300 mb-2">1. Escolha a Posição</div>
                <div className="grid grid-cols-5 gap-2">
                  {POSITIONS.map((pos) => (
                    <button
                      key={pos}
                      onClick={() => setMidPos(pos)}
                      className={`py-2.5 text-xs font-mono font-semibold rounded-lg border cursor-pointer ${
                        midPos === pos
                          ? 'bg-emerald-500 border-emerald-400 text-zinc-950'
                          : 'bg-[#09090B] border-zinc-800 text-zinc-300 hover:border-zinc-700'
                      }`}
                    >
                      {pos}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-xs font-medium text-zinc-300 mb-2">2. Escolha a Classe</div>
                <div className="grid grid-cols-3 gap-2.5">
                  {TIER_ORDER.map((t) => (
                    <button
                      key={t}
                      onClick={() => setMidTier(t)}
                      className={`p-3 rounded-xl border text-left cursor-pointer ${
                        midTier === t
                          ? 'bg-emerald-500/15 border-emerald-500 text-white'
                          : 'bg-[#09090B] border-zinc-800 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      <div className="text-xs font-semibold">{DRAFT_TIER_LABEL[t]}</div>
                      <div className="text-[11px] text-zinc-500 mt-0.5">
                        {t === 'PROMESSA' ? 'Até 22a' : t === 'AUGE' ? '23–28a' : '29+a'}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={() => onRollMidWindow(midPos, midTier)}
                disabled={!isFreeOpeningMidRoll && draft.roulettePasses < 1}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-zinc-950 rounded-xl cursor-pointer"
              >
                <Dices className="w-4 h-4" />
                {isFreeOpeningMidRoll
                  ? `Roletar ${midPos} · ${DRAFT_TIER_LABEL[midTier]} (Giro Obrigatório Gratuito)`
                  : draft.roulettePasses >= 1
                    ? `Roletar Novo ${midPos} · ${DRAFT_TIER_LABEL[midTier]} (1 Passe)`
                    : 'Sem Passes de Roleta Extras'}
              </button>
            </div>

            <div className="lg:col-span-6">
              {draft.midWindowCandidate ? (
                renderScoutingCard(
                  draft.midWindowCandidate,
                  'Contratar para o Elenco',
                  onSignMidCandidate,
                  false
                )
              ) : (
                <div className="p-8 bg-[#09090B] border border-zinc-800/80 rounded-xl text-center space-y-2">
                  <Dices className="w-9 h-9 text-zinc-600 mx-auto" />
                  <div className="text-sm font-semibold text-zinc-300">
                    {draft.midWindowPicksUsed > 0
                      ? 'Contratação de Meio Concluída'
                      : 'Gire a roleta para revelar seu reforço'}
                  </div>
                  <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                    {draft.midWindowPicksUsed > 0
                      ? 'Você já contratou nesta janela e pode seguir para a reta final ou gastar 1 Passe para girar novamente.'
                      : 'Defina posição e faixa etária à esquerda e clique no botão verde.'}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* END OF SEASON SUMMARY IN DRAFT */
        <div className="p-6 bg-[#111114] border border-zinc-800/90 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-bold text-white">
              Temporada {state.season} Finalizada
            </h2>
            <p className="text-xs text-zinc-400 mt-1">
              Use seus Passes de Roleta acumulados na aba &quot;Buffs Direcionados&quot; ou inicie a próxima temporada para abrir um novo Draft.
            </p>
          </div>
          <button
            onClick={onGoToCentral}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-zinc-950 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
          >
            Ir para Central
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};
