import React, { useMemo, useState } from 'react';
import { FileJson, Trash2, Play, BarChart3, Plus, Search, Dices, RefreshCw } from 'lucide-react';
import { LEAGUES_META } from '../data/leaguesMeta';
import { drawThreeUnderdogClubs, UnderdogClubOption } from '../engine/draftEngine';
import { GameMode, LeagueId, RawDataset, SaveSlotMeta } from '../types/game';
import { formatCurrency } from '../utils/format';
import { ClubCrest } from './ClubCrest';

interface CareerHubProps {
  dataset: RawDataset;
  isCustomDataset?: boolean;
  slots: SaveSlotMeta[];
  onLoadSlot: (slotId: string) => void;
  onDeleteSlot: (slotId: string) => void;
  onCreateCareer: (clubId: string, slotName: string) => void;
  onCreateDraftCareer: (clubId: string, slotName: string) => void;
  onOpenSecondaryMode: () => void;
  onOpenJsonUpdater: () => void;
  importMessage: string | null;
}

const PHASE_TEXT: Record<string, string> = {
  INICIO_JANELA: 'Início (Janela)',
  MEIO_JANELA: 'Meio (Janela)',
  FINAL_TEMPORADA: 'Final da Temporada',
};

export const CareerHub: React.FC<CareerHubProps> = ({
  dataset,
  isCustomDataset = false,
  slots,
  onLoadSlot,
  onDeleteSlot,
  onCreateCareer,
  onCreateDraftCareer,
  onOpenSecondaryMode,
  onOpenJsonUpdater,
  importMessage,
}) => {
  const [createMode, setCreateMode] = useState<GameMode>('CAREER');
  const [selectedLeague, setSelectedLeague] = useState<LeagueId>('premier-league');
  const [selectedClubId, setSelectedClubId] = useState<string>('arsenal');
  const [slotName, setSlotName] = useState<string>('Minha Carreira');
  const [clubSearch, setClubSearch] = useState<string>('');
  const [draftCandidates, setDraftCandidates] = useState<UnderdogClubOption[]>(() =>
    drawThreeUnderdogClubs(dataset, 'premier-league')
  );
  const [selectedDraftClubId, setSelectedDraftClubId] = useState<string>(
    () => draftCandidates[0]?.id || ''
  );

  const rerollDraftClubs = (leagueId: LeagueId) => {
    const next = drawThreeUnderdogClubs(dataset, leagueId);
    setDraftCandidates(next);
    setSelectedDraftClubId(next[0]?.id || '');
  };

  const clubsInLeague = useMemo(() => {
    const map = new Map<string, { id: string; name: string; shortName: string; leagueId: LeagueId; budget: number; rep: number; c1: string; count: number }>();
    for (const rc of dataset.clubs || []) {
      map.set(rc.id, {
        id: rc.id,
        name: rc.name,
        shortName: rc.shortName || rc.name.slice(0, 3).toUpperCase(),
        leagueId: rc.leagueId,
        budget: rc.budget || 25000000,
        rep: rc.reputation || 75,
        c1: rc.primaryColor || '#10B981',
        count: 0,
      });
    }
    for (const rp of dataset.players) {
      const entry = map.get(rp.clubId);
      if (entry) {
        entry.count++;
      } else {
        map.set(rp.clubId, {
          id: rp.clubId,
          name: rp.clubName || rp.clubId,
          shortName: (rp.clubName || rp.clubId).slice(0, 3).toUpperCase(),
          leagueId: (rp.leagueId as LeagueId) || 'premier-league',
          budget: rp.budget || 20000000,
          rep: 74,
          c1: '#10B981',
          count: 1,
        });
      }
    }

    const q = clubSearch.trim().toLowerCase();
    return Array.from(map.values())
      .filter((c) => (q ? c.name.toLowerCase().includes(q) : c.leagueId === selectedLeague))
      .sort((a, b) => b.rep - a.rep);
  }, [dataset, selectedLeague, clubSearch]);

  const activeClub = clubsInLeague.find((c) => c.id === selectedClubId) || clubsInLeague[0];

  return (
    <div className="min-h-screen bg-[#09090B] text-zinc-100">
      <header className="border-b border-zinc-800/80 bg-[#09090B]">
        <div className="max-w-[1360px] mx-auto px-6 h-16 flex items-center justify-between gap-8">
          <span className="font-display text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0">
            PitchCommand FM
          </span>

          <div className="flex items-center gap-6 text-xs text-zinc-400">
            <span className="hidden sm:inline whitespace-nowrap">
              {dataset.clubs?.length || 174} clubes · {dataset.players.length.toLocaleString('pt-BR')} jogadores · 9 ligas
              {isCustomDataset && (
                <span className="text-emerald-400 font-medium"> · Elenco personalizado</span>
              )}
            </span>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={onOpenJsonUpdater}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-zinc-200 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <FileJson className="w-3.5 h-3.5 text-emerald-400" />
              Atualizar Elencos (JSON)
            </button>
            <button
              onClick={onOpenSecondaryMode}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-zinc-950 bg-emerald-500 hover:bg-emerald-400 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <BarChart3 className="w-3.5 h-3.5" />
              Modo Sandbox
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1360px] mx-auto px-6 py-8 space-y-10">
        {importMessage && (
          <div className="px-4 py-3 text-sm bg-zinc-900 border border-zinc-700 text-zinc-200 rounded-lg">
            {importMessage}
          </div>
        )}

        {/* Saved Career Slots */}
        <section className="space-y-4">
          <div className="flex items-baseline justify-between border-b border-zinc-800/80 pb-3">
            <div>
              <h1 className="font-display text-2xl font-bold tracking-tight text-white">
                Carreiras Salvas
              </h1>
              <p className="text-sm text-zinc-400 mt-1">
                Salvamento automático local em múltiplos slots no navegador.
              </p>
            </div>
            <span className="text-xs font-mono tabular-nums text-zinc-500">
              {slots.length} {slots.length === 1 ? 'slot ativo' : 'slots ativos'}
            </span>
          </div>

          {slots.length === 0 ? (
            <div className="p-6 bg-[#111114] border border-zinc-800/80 rounded-xl text-sm text-zinc-400">
              Nenhuma carreira salva ainda. Escolha uma liga e um clube abaixo para iniciar sua primeira temporada.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {slots.map((slot) => (
                <div
                  key={slot.slotId}
                  className="p-4 bg-[#111114] border border-zinc-800/90 hover:border-zinc-700 rounded-xl flex flex-col justify-between gap-4 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <ClubCrest clubId={slot.userClubId} clubName={slot.userClubName} size="md" />
                      <div className="min-w-0">
                        <div className="font-display text-base font-semibold text-white truncate">
                          {slot.slotName}
                        </div>
                        <div className="text-xs text-zinc-400 truncate">
                          {slot.userClubName} · {slot.leagueName}
                          {slot.gameMode === 'DRAFT' && (
                            <span className="text-amber-400 font-medium"> · Modo Draft</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => onDeleteSlot(slot.slotId)}
                      title="Excluir slot"
                      className="p-1.5 text-zinc-500 hover:text-red-400 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex items-center justify-between text-xs text-zinc-400 border-t border-zinc-800/70 pt-3 font-mono tabular-nums">
                    <span>Temp. {slot.season} · Rod. {slot.currentRound}</span>
                    <span>{PHASE_TEXT[slot.phase] || slot.phase}</span>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-mono tabular-nums text-emerald-400">
                      Verba: {formatCurrency(slot.budget)}
                    </span>
                    <button
                      onClick={() => onLoadSlot(slot.slotId)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold bg-zinc-100 hover:bg-white text-zinc-950 rounded-lg transition-colors cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5" />
                      Continuar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* New Career / Draft Setup */}
        <section className="space-y-5">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-zinc-800/80 pb-3">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-1 p-1 bg-[#111114] border border-zinc-800 rounded-lg">
                <button
                  onClick={() => {
                    setCreateMode('CAREER');
                    if (slotName === 'Meu Draft') setSlotName('Minha Carreira');
                  }}
                  className={`px-3.5 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                    createMode === 'CAREER'
                      ? 'bg-emerald-500 text-zinc-950 font-semibold'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  Carreira Clássica
                </button>
                <button
                  onClick={() => {
                    setCreateMode('DRAFT');
                    rerollDraftClubs(selectedLeague);
                    if (slotName === 'Minha Carreira') setSlotName('Meu Draft');
                  }}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                    createMode === 'DRAFT'
                      ? 'bg-amber-400 text-zinc-950 font-semibold'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <Dices className="w-3.5 h-3.5" />
                  Modo Draft
                </button>
              </div>
              <h2 className="font-display text-xl font-bold tracking-tight text-white">
                {createMode === 'DRAFT' ? 'Novo Modo Draft (Clubes Sorteados)' : 'Iniciar Nova Carreira'}
              </h2>
              <p className="text-sm text-zinc-400">
                {createMode === 'DRAFT'
                  ? 'Escolha uma liga e assuma 1 dos 3 clubes médios/pequenos sorteados com verba extra de Draft e sem mercado livre.'
                  : 'Selecione uma das 9 ligas oficiais e assuma o comando de qualquer clube.'}
              </p>
            </div>

            {createMode === 'CAREER' ? (
              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={clubSearch}
                  onChange={(e) => setClubSearch(e.target.value)}
                  placeholder="Buscar clube por nome..."
                  className="w-full pl-9 pr-3 py-2 text-xs bg-[#111114] border border-zinc-800 rounded-lg text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500"
                />
              </div>
            ) : (
              <button
                onClick={() => rerollDraftClubs(selectedLeague)}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 border border-amber-500/40 text-amber-300 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Sortear Outros 3 Clubes
              </button>
            )}
          </div>

          {/* 9 Leagues Selector */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {LEAGUES_META.map((league) => {
              const active = selectedLeague === league.id && (createMode === 'DRAFT' || !clubSearch.trim());
              return (
                <button
                  key={league.id}
                  onClick={() => {
                    setClubSearch('');
                    setSelectedLeague(league.id);
                    if (createMode === 'DRAFT') {
                      rerollDraftClubs(league.id);
                    }
                  }}
                  className={`px-3.5 py-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? createMode === 'DRAFT'
                        ? 'bg-amber-400 text-zinc-950 font-semibold'
                        : 'bg-emerald-500 text-zinc-950 font-semibold'
                      : 'bg-[#111114] text-zinc-400 hover:text-zinc-100 border border-zinc-800/80'
                  }`}
                >
                  {league.name}
                </button>
              );
            })}
          </div>

          {createMode === 'DRAFT' ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
                {draftCandidates.map((c) => {
                  const selected = selectedDraftClubId === c.id;
                  return (
                    <button
                      key={c.id}
                      onClick={() => setSelectedDraftClubId(c.id)}
                      className={`p-5 rounded-xl border text-left transition-colors flex flex-col justify-between gap-4 cursor-pointer ${
                        selected
                          ? 'bg-zinc-900 border-amber-400'
                          : 'bg-[#111114] border-zinc-800/90 hover:border-zinc-700'
                      }`}
                    >
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <ClubCrest
                            clubId={c.id}
                            clubName={c.name}
                            shortName={c.shortName}
                            primaryColor={c.primaryColor}
                            size="lg"
                          />
                          <span className="font-mono text-xs tabular-nums text-zinc-400">
                            {c.avgOvr} OVR
                          </span>
                        </div>
                        <div>
                          <div className="font-display text-base font-bold text-white truncate">
                            {c.name}
                          </div>
                          <div className="text-[11px] font-mono text-zinc-400 mt-0.5">
                            Projeção: {c.expectedPos}º/{c.leagueClubCount} · {c.squadCount} atletas
                          </div>
                        </div>
                      </div>

                      <div className="border-t border-zinc-800/80 pt-3 space-y-1 text-xs">
                        <div className="text-zinc-500 text-[11px]">Verba Inicial de Draft</div>
                        <div className="font-mono font-bold tabular-nums text-emerald-400">
                          {formatCurrency(c.draftBudget)}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="lg:col-span-4 p-5 bg-[#111114] border border-amber-500/35 rounded-xl space-y-4">
                {(() => {
                  const chosen =
                    draftCandidates.find((c) => c.id === selectedDraftClubId) || draftCandidates[0];
                  if (!chosen) return null;
                  return (
                    <>
                      <div className="flex items-center gap-3">
                        <ClubCrest
                          clubId={chosen.id}
                          clubName={chosen.name}
                          shortName={chosen.shortName}
                          primaryColor={chosen.primaryColor}
                          size="lg"
                        />
                        <div>
                          <div className="text-[11px] font-mono text-amber-400">Modo Draft</div>
                          <h3 className="font-display text-lg font-bold text-white">{chosen.name}</h3>
                          <div className="text-xs font-mono text-zinc-400">
                            Meta da liga: {chosen.expectedPos}º lugar
                          </div>
                        </div>
                      </div>

                      <ul className="space-y-1.5 text-xs text-zinc-300 border-t border-b border-zinc-800/80 py-3">
                        <li>• Sem aba de Mercado tradicional</li>
                        <li>• Fase 1: venda 3 do elenco e compre 1 Veterano, 1 Auge e 1 Promessa</li>
                        <li>• Meio: roleta por posição e classificação</li>
                        <li>• Passes de Roleta: buff direcionado por atributo ao superar meta ou erguer taças</li>
                      </ul>

                      <div className="space-y-1.5">
                        <label className="block text-xs font-medium text-zinc-400">
                          Nome do Slot de Save
                        </label>
                        <input
                          type="text"
                          value={slotName}
                          onChange={(e) => setSlotName(e.target.value)}
                          maxLength={32}
                          className="w-full px-3 py-2 text-sm bg-[#09090B] border border-zinc-800 rounded-lg text-white focus:outline-none focus:border-amber-400"
                        />
                      </div>

                      <button
                        onClick={() =>
                          onCreateDraftCareer(chosen.id, slotName.trim() || `Draft ${chosen.shortName}`)
                        }
                        className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold bg-amber-400 hover:bg-amber-300 text-zinc-950 rounded-lg transition-colors cursor-pointer"
                      >
                        <Dices className="w-4 h-4" />
                        Iniciar Modo Draft ({chosen.shortName})
                      </button>
                    </>
                  );
                })()}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Club Grid */}
              <div className="lg:col-span-8 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {clubsInLeague.map((c) => {
                  const isSelected = activeClub?.id === c.id;
                  return (
                    <button
                      key={c.id}
                      onClick={() => setSelectedClubId(c.id)}
                      className={`p-3.5 rounded-xl border text-left transition-colors flex flex-col gap-2.5 cursor-pointer ${
                        isSelected
                          ? 'bg-zinc-900 border-emerald-500'
                          : 'bg-[#111114] border-zinc-800/80 hover:border-zinc-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <ClubCrest
                          clubId={c.id}
                          clubName={c.name}
                          shortName={c.shortName}
                          primaryColor={c.c1}
                          size="md"
                        />
                        <span className="font-mono text-xs tabular-nums text-zinc-400">
                          {c.rep} OVR
                        </span>
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-white truncate">{c.name}</div>
                        <div className="text-xs font-mono tabular-nums text-emerald-400 mt-0.5">
                          {formatCurrency(c.budget)}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Selected Club Confirmation Card */}
              <div className="lg:col-span-4 p-5 bg-[#111114] border border-zinc-800 rounded-xl space-y-5 sticky top-6">
                {activeClub ? (
                  <>
                    <div className="flex items-center gap-4">
                      <ClubCrest
                        clubId={activeClub.id}
                        clubName={activeClub.name}
                        shortName={activeClub.shortName}
                        primaryColor={activeClub.c1}
                        size="xl"
                      />
                      <div>
                        <div className="text-xs text-zinc-400">
                          {LEAGUES_META.find((l) => l.id === activeClub.leagueId)?.name}
                        </div>
                        <h3 className="font-display text-xl font-bold text-white">
                          {activeClub.name}
                        </h3>
                        <div className="text-xs text-zinc-400 mt-0.5 font-mono tabular-nums">
                          Elenco: {activeClub.count} atletas · Força {activeClub.rep}
                        </div>
                      </div>
                    </div>

                    <div className="border-t border-b border-zinc-800/80 py-3.5 space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-zinc-400">Verba de Transferências</span>
                        <span className="font-mono tabular-nums text-emerald-400 font-semibold">
                          {formatCurrency(activeClub.budget)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-400">Temporada Inicial</span>
                        <span className="font-mono tabular-nums text-zinc-200">2026</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-400">Competição Europeia</span>
                        <span className="text-zinc-200">Champions League (Beta)</span>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-xs font-medium text-zinc-400">
                        Nome do Slot de Save
                      </label>
                      <input
                        type="text"
                        value={slotName}
                        onChange={(e) => setSlotName(e.target.value)}
                        maxLength={32}
                        className="w-full px-3 py-2 text-sm bg-[#09090B] border border-zinc-800 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                      />
                    </div>

                    <button
                      onClick={() => onCreateCareer(activeClub.id, slotName.trim() || activeClub.name)}
                      className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold bg-emerald-500 hover:bg-emerald-400 text-zinc-950 rounded-lg transition-colors cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      Assumir {activeClub.shortName}
                    </button>
                  </>
                ) : (
                  <p className="text-sm text-zinc-400">Selecione um clube para começar.</p>
                )}
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
};
