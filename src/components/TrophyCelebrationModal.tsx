import React, { useMemo } from 'react';
import { Award, Sparkles, ArrowRight } from 'lucide-react';
import { TrophyCelebrationItem } from '../types/game';
import { ClubCrest } from './ClubCrest';

interface TrophyCelebrationModalProps {
  trophy: TrophyCelebrationItem;
  remainingCount: number;
  onDismiss: () => void;
}

const CONFETTI_SPECS = Array.from({ length: 28 }, (_, i) => ({
  id: i,
  left: `${((i * 37) % 94) + 3}%`,
  delay: `${((i * 19) % 18) * 0.12}s`,
  duration: `${2.4 + ((i * 11) % 10) * 0.14}s`,
  color: i % 3 === 0 ? '#F59E0B' : i % 3 === 1 ? '#10B981' : '#F4F4F5',
  width: i % 2 === 0 ? 8 : 6,
  height: i % 2 === 0 ? 14 : 10,
}));

const TrophyArtwork: React.FC<{ kind: TrophyCelebrationItem['kind'] }> = ({ kind }) => {
  if (kind === 'CHAMPIONS_LEAGUE') {
    return (
      <svg viewBox="0 0 120 120" className="w-28 h-28 mx-auto drop-shadow-[0_12px_28px_rgba(16,185,129,0.28)]" aria-hidden="true">
        <defs>
          <linearGradient id="uclSilver" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#F8FAFC" />
            <stop offset="45%" stopColor="#CBD5E1" />
            <stop offset="100%" stopColor="#64748B" />
          </linearGradient>
          <linearGradient id="uclBase" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1E293B" />
            <stop offset="100%" stopColor="#09090B" />
          </linearGradient>
        </defs>
        {/* Big Ears Handles */}
        <path d="M35 28 C16 24, 15 56, 36 62" fill="none" stroke="url(#uclSilver)" strokeWidth="6" strokeLinecap="round" />
        <path d="M85 28 C104 24, 105 56, 84 62" fill="none" stroke="url(#uclSilver)" strokeWidth="6" strokeLinecap="round" />
        {/* Cup Bowl */}
        <path d="M34 20 L86 20 L78 68 C74 82, 46 82, 42 68 Z" fill="url(#uclSilver)" />
        {/* Rim */}
        <ellipse cx="60" cy="20" rx="26" ry="5" fill="#FFFFFF" opacity="0.65" />
        {/* Emblem Star */}
        <circle cx="60" cy="46" r="10" fill="#10B981" opacity="0.9" />
        <path d="M60 39 L62 44 L67 44 L63 47 L64.5 52 L60 49 L55.5 52 L57 47 L53 44 L58 44 Z" fill="#FFFFFF" />
        {/* Stem & Pedestal */}
        <rect x="52" y="76" width="16" height="14" rx="2" fill="url(#uclSilver)" />
        <path d="M36 90 L84 90 L90 104 L30 104 Z" fill="url(#uclBase)" stroke="#94A3B8" strokeWidth="1.5" />
      </svg>
    );
  }

  if (kind === 'EUROPA_LEAGUE') {
    return (
      <svg viewBox="0 0 120 120" className="w-28 h-28 mx-auto drop-shadow-[0_12px_28px_rgba(249,115,22,0.3)]" aria-hidden="true">
        <defs>
          <linearGradient id="uelBronze" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FED7AA" />
            <stop offset="45%" stopColor="#FB923C" />
            <stop offset="100%" stopColor="#C2410C" />
          </linearGradient>
        </defs>
        <path d="M36 22 L84 22 L75 72 C71 84, 49 84, 45 72 Z" fill="url(#uelBronze)" />
        <ellipse cx="60" cy="22" rx="24" ry="5" fill="#FFEDD5" opacity="0.7" />
        <path d="M40 34 L80 34 M42 46 L78 46 M45 58 L75 58" stroke="#7C2D12" strokeWidth="1.5" opacity="0.45" />
        <rect x="53" y="78" width="14" height="12" rx="2" fill="url(#uelBronze)" />
        <path d="M36 90 L84 90 L90 104 L30 104 Z" fill="#18181B" stroke="#FB923C" strokeWidth="1.5" />
      </svg>
    );
  }

  if (kind === 'CUP') {
    return (
      <svg viewBox="0 0 120 120" className="w-28 h-28 mx-auto drop-shadow-[0_12px_28px_rgba(245,158,11,0.28)]" aria-hidden="true">
        <defs>
          <linearGradient id="cupGold" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FDE68A" />
            <stop offset="50%" stopColor="#F59E0B" />
            <stop offset="100%" stopColor="#B45309" />
          </linearGradient>
        </defs>
        <path d="M38 30 C22 30, 22 54, 40 58" fill="none" stroke="url(#cupGold)" strokeWidth="5" strokeLinecap="round" />
        <path d="M82 30 C98 30, 98 54, 80 58" fill="none" stroke="url(#cupGold)" strokeWidth="5" strokeLinecap="round" />
        <path d="M38 22 L82 22 L76 66 C73 78, 47 78, 44 66 Z" fill="url(#cupGold)" />
        <ellipse cx="60" cy="22" rx="22" ry="4.5" fill="#FEF3C7" opacity="0.8" />
        <rect x="53" y="74" width="14" height="16" rx="2" fill="url(#cupGold)" />
        <path d="M38 90 L82 90 L88 104 L32 104 Z" fill="#18181B" stroke="#F59E0B" strokeWidth="1.5" />
      </svg>
    );
  }

  // League Trophy
  return (
    <svg viewBox="0 0 120 120" className="w-28 h-28 mx-auto drop-shadow-[0_12px_28px_rgba(245,158,11,0.34)]" aria-hidden="true">
      <defs>
        <linearGradient id="leagueGold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FEF08A" />
          <stop offset="50%" stopColor="#EAB308" />
          <stop offset="100%" stopColor="#A16207" />
        </linearGradient>
      </defs>
      {/* Crown & Rim */}
      <path d="M40 16 L47 24 L60 12 L73 24 L80 16 L82 28 L38 28 Z" fill="#FDE047" />
      {/* Chalice */}
      <path d="M36 28 L84 28 L76 70 C72 82, 48 82, 44 70 Z" fill="url(#leagueGold)" />
      <circle cx="60" cy="50" r="9" fill="#09090B" opacity="0.25" />
      <rect x="52" y="78" width="16" height="12" rx="2" fill="url(#leagueGold)" />
      <path d="M35 90 L85 90 L92 105 L28 105 Z" fill="#18181B" stroke="#EAB308" strokeWidth="1.5" />
    </svg>
  );
};

export const TrophyCelebrationModal: React.FC<TrophyCelebrationModalProps> = ({
  trophy,
  remainingCount,
  onDismiss,
}) => {
  const kindTitle =
    trophy.kind === 'CHAMPIONS_LEAGUE'
      ? 'Campeão Continental'
      : trophy.kind === 'EUROPA_LEAGUE'
        ? 'Campeão da Europa League'
        : trophy.kind === 'CUP'
          ? 'Campeão da Copa'
          : 'Campeão da Liga';

  const confetti = useMemo(() => CONFETTI_SPECS, []);

  return (
    <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-hidden">
      {/* Animated Confetti Layer */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        {confetti.map((c) => (
          <span
            key={c.id}
            className="animate-confetti-drop absolute -top-6 rounded-sm"
            style={{
              left: c.left,
              width: `${c.width}px`,
              height: `${c.height}px`,
              backgroundColor: c.color,
              animationDelay: c.delay,
              animationDuration: c.duration,
            }}
          />
        ))}
      </div>

      <div className="animate-trophy-reveal relative w-full max-w-md bg-[#111114] border border-amber-500/45 rounded-xl p-6 text-center space-y-5 overflow-hidden">
        {/* Radial Spotlight Glow */}
        <div
          className="animate-trophy-shine pointer-events-none absolute -top-20 left-1/2 -translate-x-1/2 w-72 h-72 rounded-full bg-amber-500/15 blur-2xl"
          aria-hidden="true"
        />

        <div className="relative space-y-1">
          <div className="text-xs font-mono text-amber-400">
            {kindTitle} · Temporada {trophy.season}
            {remainingCount > 1 ? ` · 1 de ${remainingCount}` : ''}
          </div>
          <h2 className="font-display text-2xl font-bold text-white text-balance">
            {trophy.competitionName}
          </h2>
        </div>

        <div className="relative py-2">
          <TrophyArtwork kind={trophy.kind} />
        </div>

        <div className="relative flex items-center justify-center gap-3 px-4 py-3 bg-[#09090B] border border-zinc-800/90 rounded-lg">
          <ClubCrest clubId={trophy.clubId} clubName={trophy.clubName} size="md" />
          <div className="text-left min-w-0">
            <div className="text-sm font-semibold text-white truncate">{trophy.clubName}</div>
            <div className="text-xs font-mono tabular-nums text-zinc-400">{trophy.summaryLine}</div>
          </div>
        </div>

        {trophy.passesEarned && trophy.passesEarned > 0 ? (
          <div className="relative flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-500/10 border border-emerald-500/40 rounded-lg text-xs font-medium text-emerald-300">
            <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              +{trophy.passesEarned} Passes de Roleta ganhos no Modo Draft!
            </span>
          </div>
        ) : (
          <div className="relative flex items-center justify-center gap-1.5 text-xs text-zinc-400">
            <Award className="w-3.5 h-3.5 text-amber-400" />
            <span>Taça eterna gravada na história do clube.</span>
          </div>
        )}

        <button
          onClick={onDismiss}
          className="relative w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold bg-emerald-500 hover:bg-emerald-400 text-zinc-950 rounded-lg transition-colors cursor-pointer"
        >
          <span>{remainingCount > 1 ? 'Próxima Conquista' : 'Erguer a Taça & Continuar'}</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
