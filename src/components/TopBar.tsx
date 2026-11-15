import React from 'react';
import { Check, Save } from 'lucide-react';
import { Club, GameMode, League, SeasonPhase } from '../types/game';
import { ClubCrest } from './ClubCrest';

export type ActiveTab = 'central' | 'tatica' | 'mercado' | 'draft' | 'mundo' | 'calendario';

interface TopBarProps {
  club: Club;
  league: League;
  season: number;
  phase: SeasonPhase;
  gameMode?: GameMode;
  activeTab: ActiveTab;
  savedFeedback?: boolean;
  onSelectTab: (tab: ActiveTab) => void;
  onSaveCareer: () => void;
  onPrimaryAction: () => void;
  onExitToHub: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  club,
  season,
  phase,
  gameMode = 'CAREER',
  activeTab,
  savedFeedback,
  onSelectTab,
  onSaveCareer,
  onPrimaryAction,
  onExitToHub,
}) => {
  const navItems: { id: ActiveTab; label: string }[] =
    gameMode === 'DRAFT'
      ? [
          { id: 'central', label: 'Central' },
          { id: 'tatica', label: 'Elenco & Tática' },
          { id: 'draft', label: 'Draft' },
          { id: 'mundo', label: 'Mundo' },
          { id: 'calendario', label: 'Calendário' },
        ]
      : [
          { id: 'central', label: 'Central' },
          { id: 'tatica', label: 'Elenco & Tática' },
          { id: 'mercado', label: 'Mercado' },
          { id: 'mundo', label: 'Mundo' },
          { id: 'calendario', label: 'Calendário' },
        ];

  const primaryLabel =
    phase === 'INICIO_JANELA'
      ? 'Simular até o Meio'
      : phase === 'MEIO_JANELA'
        ? 'Simular até Última Rodada'
        : `Nova Temporada ${season + 1}`;

  return (
    <header className="sticky top-0 z-30 bg-[#09090B]/95 backdrop-blur border-b border-zinc-800/80">
      <div className="max-w-[1440px] mx-auto px-6 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Club identity */}
        <button
          onClick={onExitToHub}
          title="Voltar para Seleção de Carreira"
          className="flex items-center gap-3 text-left group whitespace-nowrap shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded-md cursor-pointer"
        >
          <ClubCrest
            clubId={club.id}
            clubName={club.name}
            shortName={club.shortName}
            primaryColor={club.primaryColor}
            size="sm"
          />
          <span className="font-display text-base font-bold tracking-tight text-zinc-100 group-hover:text-emerald-400 transition-colors whitespace-nowrap shrink-0">
            {club.name}
          </span>
        </button>

        {/* Zone 2: 5 single-line nav links */}
        <nav className="hidden md:flex items-center gap-6">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id)}
                className={`relative py-1 text-sm font-medium transition-colors whitespace-nowrap shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded cursor-pointer ${
                  isActive
                    ? 'text-emerald-400'
                    : 'text-zinc-400 hover:text-zinc-100'
                }`}
              >
                {item.label}
                {isActive && (
                  <span className="absolute left-0 right-0 -bottom-[19px] h-[2px] bg-emerald-500" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Save & Primary simulation CTA */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onSaveCareer}
            title="Salvar carreira neste slot agora (auto-save também está ativo)"
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              savedFeedback
                ? 'bg-emerald-500/15 border-emerald-500/60 text-emerald-400'
                : 'bg-zinc-900 hover:bg-zinc-800 border-zinc-800 text-zinc-200'
            }`}
          >
            {savedFeedback ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
            <span>{savedFeedback ? 'Salvo' : 'Salvar'}</span>
          </button>

          <button
            onClick={onPrimaryAction}
            className="px-4 py-2 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-zinc-950 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {primaryLabel}
          </button>
        </div>
      </div>

      {/* Mobile nav strip */}
      <div className="md:hidden flex items-center gap-4 px-4 pb-2.5 overflow-x-auto border-t border-zinc-900 pt-2">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onSelectTab(item.id)}
            className={`text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === item.id ? 'text-emerald-400' : 'text-zinc-400'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
    </header>
  );
};
