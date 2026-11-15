import { FormationSlot, FormationTemplate, Player, PlayerFormPhase, Position, PositionGroup, SquadRole } from '../types/game';

export const PRESET_FORMATIONS: FormationTemplate[] = [
  {
    id: '4-3-3',
    name: '4-3-3 Ofensivo',
    slots: [
      { id: 'gk', label: 'GOL', pos: 'GOL', x: 50, y: 90 },
      { id: 'lb', label: 'LE', pos: 'LE', x: 16, y: 72 },
      { id: 'lcb', label: 'ZAG', pos: 'ZAG', x: 38, y: 75 },
      { id: 'rcb', label: 'ZAG', pos: 'ZAG', x: 62, y: 75 },
      { id: 'rb', label: 'LD', pos: 'LD', x: 84, y: 72 },
      { id: 'cdm', label: 'VOL', pos: 'VOL', x: 50, y: 56 },
      { id: 'lcm', label: 'MC', pos: 'MC', x: 30, y: 45 },
      { id: 'rcm', label: 'MC', pos: 'MC', x: 70, y: 45 },
      { id: 'lw', label: 'PE', pos: 'PE', x: 18, y: 22 },
      { id: 'st', label: 'ATA', pos: 'ATA', x: 50, y: 15 },
      { id: 'rw', label: 'PD', pos: 'PD', x: 82, y: 22 },
    ],
  },
  {
    id: '4-4-2',
    name: '4-4-2 Clássico',
    slots: [
      { id: 'gk', label: 'GOL', pos: 'GOL', x: 50, y: 90 },
      { id: 'lb', label: 'LE', pos: 'LE', x: 16, y: 72 },
      { id: 'lcb', label: 'ZAG', pos: 'ZAG', x: 38, y: 75 },
      { id: 'rcb', label: 'ZAG', pos: 'ZAG', x: 62, y: 75 },
      { id: 'rb', label: 'LD', pos: 'LD', x: 84, y: 72 },
      { id: 'lm', label: 'PE', pos: 'PE', x: 16, y: 46 },
      { id: 'lcm', label: 'MC', pos: 'MC', x: 39, y: 50 },
      { id: 'rcm', label: 'MC', pos: 'MC', x: 61, y: 50 },
      { id: 'rm', label: 'PD', pos: 'PD', x: 84, y: 46 },
      { id: 'lst', label: 'ATA', pos: 'ATA', x: 38, y: 18 },
      { id: 'rst', label: 'ATA', pos: 'ATA', x: 62, y: 18 },
    ],
  },
  {
    id: '4-2-3-1',
    name: '4-2-3-1 Moderno',
    slots: [
      { id: 'gk', label: 'GOL', pos: 'GOL', x: 50, y: 90 },
      { id: 'lb', label: 'LE', pos: 'LE', x: 16, y: 73 },
      { id: 'lcb', label: 'ZAG', pos: 'ZAG', x: 38, y: 76 },
      { id: 'rcb', label: 'ZAG', pos: 'ZAG', x: 62, y: 76 },
      { id: 'rb', label: 'LD', pos: 'LD', x: 84, y: 73 },
      { id: 'lcdm', label: 'VOL', pos: 'VOL', x: 38, y: 56 },
      { id: 'rcdm', label: 'VOL', pos: 'VOL', x: 62, y: 56 },
      { id: 'lam', label: 'PE', pos: 'PE', x: 20, y: 34 },
      { id: 'cam', label: 'MEI', pos: 'MEI', x: 50, y: 36 },
      { id: 'ram', label: 'PD', pos: 'PD', x: 80, y: 34 },
      { id: 'st', label: 'ATA', pos: 'ATA', x: 50, y: 15 },
    ],
  },
  {
    id: '3-5-2',
    name: '3-5-2 Alas',
    slots: [
      { id: 'gk', label: 'GOL', pos: 'GOL', x: 50, y: 90 },
      { id: 'lcb', label: 'ZAG', pos: 'ZAG', x: 28, y: 74 },
      { id: 'ccb', label: 'ZAG', pos: 'ZAG', x: 50, y: 76 },
      { id: 'rcb', label: 'ZAG', pos: 'ZAG', x: 72, y: 74 },
      { id: 'lwb', label: 'LE', pos: 'LE', x: 14, y: 50 },
      { id: 'cdm', label: 'VOL', pos: 'VOL', x: 50, y: 56 },
      { id: 'lcm', label: 'MC', pos: 'MC', x: 34, y: 43 },
      { id: 'rcm', label: 'MC', pos: 'MC', x: 66, y: 43 },
      { id: 'rwb', label: 'LD', pos: 'LD', x: 86, y: 50 },
      { id: 'lst', label: 'ATA', pos: 'ATA', x: 38, y: 18 },
      { id: 'rst', label: 'ATA', pos: 'ATA', x: 62, y: 18 },
    ],
  },
  {
    id: '5-3-2',
    name: '5-3-2 Retranca',
    slots: [
      { id: 'gk', label: 'GOL', pos: 'GOL', x: 50, y: 90 },
      { id: 'lwb', label: 'LE', pos: 'LE', x: 13, y: 66 },
      { id: 'lcb', label: 'ZAG', pos: 'ZAG', x: 32, y: 75 },
      { id: 'ccb', label: 'ZAG', pos: 'ZAG', x: 50, y: 77 },
      { id: 'rcb', label: 'ZAG', pos: 'ZAG', x: 68, y: 75 },
      { id: 'rwb', label: 'LD', pos: 'LD', x: 87, y: 66 },
      { id: 'lcm', label: 'MC', pos: 'MC', x: 32, y: 47 },
      { id: 'cdm', label: 'VOL', pos: 'VOL', x: 50, y: 53 },
      { id: 'rcm', label: 'MC', pos: 'MC', x: 68, y: 47 },
      { id: 'lst', label: 'ATA', pos: 'ATA', x: 38, y: 19 },
      { id: 'rst', label: 'ATA', pos: 'ATA', x: 62, y: 19 },
    ],
  },
  {
    id: '4-1-4-1',
    name: '4-1-4-1 Equilibrado',
    slots: [
      { id: 'gk', label: 'GOL', pos: 'GOL', x: 50, y: 90 },
      { id: 'lb', label: 'LE', pos: 'LE', x: 16, y: 72 },
      { id: 'lcb', label: 'ZAG', pos: 'ZAG', x: 38, y: 75 },
      { id: 'rcb', label: 'ZAG', pos: 'ZAG', x: 62, y: 75 },
      { id: 'rb', label: 'LD', pos: 'LD', x: 84, y: 72 },
      { id: 'cdm', label: 'VOL', pos: 'VOL', x: 50, y: 58 },
      { id: 'lm', label: 'PE', pos: 'PE', x: 17, y: 38 },
      { id: 'lcm', label: 'MC', pos: 'MC', x: 39, y: 41 },
      { id: 'rcm', label: 'MC', pos: 'MC', x: 61, y: 41 },
      { id: 'rm', label: 'PD', pos: 'PD', x: 83, y: 38 },
      { id: 'st', label: 'ATA', pos: 'ATA', x: 50, y: 16 },
    ],
  },
];

export const ROLE_LABELS: Record<SquadRole, string> = {
  importantissimo: 'Importantíssimo',
  titular: 'Titular',
  rotacao: 'Rotação',
  reserva: 'Reserva',
  promessa: 'Promessa',
};

export const ROLE_PRIORITY: Record<SquadRole, number> = {
  importantissimo: 1.22,
  titular: 1.12,
  rotacao: 0.98,
  reserva: 0.80,
  promessa: 0.88,
};

export const ROLE_TARGET_SHARE: Record<SquadRole, number> = {
  importantissimo: 0.86,
  titular: 0.74,
  rotacao: 0.48,
  promessa: 0.34,
  reserva: 0.16,
};

export function getPositionGroup(pos: Position): PositionGroup {
  if (pos === 'GOL') return 'GOL';
  if (pos === 'ZAG' || pos === 'LE' || pos === 'LD') return 'DEF';
  if (pos === 'VOL' || pos === 'MC' || pos === 'MEI') return 'MEI';
  return 'ATA';
}

export function normalizePosition(raw: string): Position {
  const s = (raw || '').trim().toUpperCase();
  const map: Record<string, Position> = {
    GK: 'GOL', GOL: 'GOL',
    CB: 'ZAG', ZAG: 'ZAG', DC: 'ZAG',
    LB: 'LE', LWB: 'LE', LE: 'LE',
    RB: 'LD', RWB: 'LD', LD: 'LD',
    CDM: 'VOL', DM: 'VOL', VOL: 'VOL',
    CM: 'MC', MC: 'MC',
    CAM: 'MEI', AM: 'MEI', MEI: 'MEI',
    LW: 'PE', LM: 'PE', PE: 'PE',
    RW: 'PD', RM: 'PD', PD: 'PD',
    ST: 'ATA', CF: 'ATA', ATA: 'ATA',
  };
  return map[s] || 'MC';
}

export function inferPosFromCoords(x: number, y: number): Position {
  if (y >= 83) return 'GOL';
  if (y >= 64) {
    if (x < 26) return 'LE';
    if (x > 74) return 'LD';
    return 'ZAG';
  }
  if (y >= 50) {
    if (x < 24) return 'LE';
    if (x > 76) return 'LD';
    return 'VOL';
  }
  if (y >= 34) {
    if (x < 24) return 'PE';
    if (x > 76) return 'PD';
    if (y < 42) return 'MEI';
    return 'MC';
  }
  if (x < 28) return 'PE';
  if (x > 72) return 'PD';
  return 'ATA';
}

export function getSlotCompatibility(
  playerPos: Position,
  slotPos: Position,
  alternatePositions?: Position[]
): number {
  if (playerPos === slotPos) return 1.0;
  if (alternatePositions && alternatePositions.includes(slotPos)) return 0.97;
  if (playerPos === 'GOL' || slotPos === 'GOL') return 0.35;
  const g1 = getPositionGroup(playerPos);
  const g2 = getPositionGroup(slotPos);
  if (g1 === g2) return 0.92;
  if (
    (playerPos === 'PE' && slotPos === 'ATA') ||
    (playerPos === 'PD' && slotPos === 'ATA') ||
    (playerPos === 'MEI' && (slotPos === 'PE' || slotPos === 'PD' || slotPos === 'ATA')) ||
    (playerPos === 'VOL' && slotPos === 'ZAG') ||
    (playerPos === 'LE' && slotPos === 'PE') ||
    (playerPos === 'LD' && slotPos === 'PD')
  ) {
    return 0.88;
  }
  return 0.72;
}

export function getActiveSlots(
  tactics: { formationId: string; customFormation?: FormationSlot[] },
  customFormations: FormationTemplate[]
): FormationSlot[] {
  if (tactics.customFormation && tactics.customFormation.length === 11) {
    return tactics.customFormation;
  }
  const all = [...PRESET_FORMATIONS, ...customFormations];
  return all.find((f) => f.id === tactics.formationId)?.slots || PRESET_FORMATIONS[0].slots;
}

export const FORM_LABELS: Record<PlayerFormPhase, string> = {
  otima: 'Fase Ótima',
  boa: 'Boa Fase',
  normal: 'Normal',
  ma: 'Má Fase',
};

export function getFormOvrBonus(form: PlayerFormPhase): number {
  if (form === 'otima') return 4;
  if (form === 'boa') return 2;
  if (form === 'ma') return -2;
  return 0;
}

export function getPlayerAvgRating(p: Player): number {
  return p.stats.ratingCount > 0 ? p.stats.ratingSum / p.stats.ratingCount : 0;
}

export function autoPickLineup(
  clubPlayers: Player[],
  slots: FormationSlot[],
  matchImportance: 'league' | 'cup' | 'ucl' = 'league'
): { starterIds: string[]; benchIds: string[] } {
  const healthyPool = clubPlayers.filter((p) => !p.injury || p.injury.roundsRemaining <= 0);
  const pool = healthyPool.length >= 11 ? healthyPool : [...clubPlayers];
  const chosen = new Set<string>();
  const starterIds: string[] = [];

  const maxApps = pool.reduce((m, p) => Math.max(m, p.stats.appearances), 0);
  const maxScorerGoals = pool.reduce((m, p) => Math.max(m, p.stats.goals), 0);
  const topScorerIds = new Set(
    [...pool]
      .filter((p) => p.stats.goals >= 2)
      .sort((a, b) => b.stats.goals - a.stats.goals || b.stats.assists - a.stats.assists)
      .slice(0, 2)
      .map((p) => p.id)
  );

  // Best GK baseline for cup backup GK rotation
  const gks = pool
    .filter((p) => p.position === 'GOL')
    .sort((a, b) => b.overall - a.overall);
  const mainGkId = gks[0]?.id;

  for (const slot of slots) {
    let best: Player | null = null;
    let bestScore = -1;

    for (const p of pool) {
      if (chosen.has(p.id)) continue;
      const compat = getSlotCompatibility(p.position, slot.pos, p.alternatePositions);
      const injuryPenalty = p.injury && p.injury.roundsRemaining > 0 ? 0.1 : 1.0;

      // Fatigue protection: rest heavily drained players unless cup backup isn't available
      let fitnessFactor =
        p.fitness < 55
          ? 0.50
          : p.fitness < 68
            ? 0.78
            : p.fitness < 78
              ? 0.91
              : 0.97 + (p.fitness / 100) * 0.08;

      let roleMult = ROLE_PRIORITY[p.role];
      let cupBonus = 0;

      if (matchImportance === 'cup') {
        if (p.role === 'promessa') {
          roleMult = 1.25;
          cupBonus += 10;
        } else if (p.role === 'rotacao') {
          roleMult = 1.20;
          cupBonus += 8.5;
        } else if (p.role === 'reserva') {
          roleMult = 1.05;
          cupBonus += 5.5;
        } else if (p.role === 'importantissimo') {
          roleMult = p.fitness < 85 ? 0.80 : 0.88;
        } else if (p.role === 'titular') {
          roleMult = p.fitness < 82 ? 0.86 : 0.93;
        }

        // Rotate backup GK in Cup if reasonably close in OVR
        if (
          slot.pos === 'GOL' &&
          p.position === 'GOL' &&
          p.id !== mainGkId &&
          gks[0] &&
          p.overall >= gks[0].overall - 11
        ) {
          cupBonus += 14;
        }
      } else if (matchImportance === 'ucl') {
        if (p.role === 'importantissimo') roleMult += 0.14;
        if (p.role === 'titular') roleMult += 0.06;
        fitnessFactor = p.fitness < 52 ? 0.65 : p.fitness < 68 ? 0.88 : 1.02;
      }

      // Meritocracy: reward top goalscorers, high average ratings, and hot form
      const avgRating = getPlayerAvgRating(p);
      let meritBonus = getFormOvrBonus(p.form || 'normal') * 0.9;
      if (avgRating >= 7.55) meritBonus += 4.5;
      else if (avgRating >= 7.15) meritBonus += 2.6;
      else if (avgRating > 0 && avgRating <= 6.2) meritBonus -= 2.2;

      if (topScorerIds.has(p.id) && maxScorerGoals >= 2) {
        meritBonus += matchImportance === 'cup' ? 2.2 : 4.2;
      } else if (p.stats.goals + p.stats.assists * 0.7 >= 4) {
        meritBonus += 1.8;
      }

      // Role-based minutes fairness once season is underway
      let fairnessBonus = 0;
      if (maxApps >= 3) {
        const expectedTotalMins = Math.max(180, maxApps * 90);
        const actualShare = p.stats.minutes / expectedTotalMins;
        const targetShare = ROLE_TARGET_SHARE[p.role];
        const deficit = targetShare - actualShare;
        fairnessBonus = Math.max(-5.0, Math.min(7.5, deficit * 16));
      }

      // Tactical slot profile fit (e.g. wingbacks at y<=62 value pace/passing, deep VOL values defending)
      let slotAttrFit = 0;
      if (p.attributes) {
        if ((slot.pos === 'LE' || slot.pos === 'LD') && slot.y <= 62) {
          slotAttrFit += ((p.attributes.pace - 72) * 0.08) + ((p.attributes.passing - 70) * 0.06);
        } else if (slot.pos === 'VOL' && slot.y >= 55) {
          slotAttrFit += (p.attributes.defending - 72) * 0.08;
        } else if (slot.pos === 'ZAG' && slot.y <= 69) {
          slotAttrFit += (p.attributes.pace - 70) * 0.06;
        }
      }

      const effOvr = p.overall + meritBonus + cupBonus + fairnessBonus + slotAttrFit;
      const score = Math.max(1, effOvr) * compat * fitnessFactor * roleMult * injuryPenalty;
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }

    if (best) {
      chosen.add(best.id);
      starterIds.push(best.id);
    }
  }

  const remaining = pool
    .filter((p) => !chosen.has(p.id) && (!p.injury || p.injury.roundsRemaining <= 0))
    .sort((a, b) => {
      const roleBenchBonus = (p: Player) =>
        p.role === 'promessa' ? 5 : p.role === 'rotacao' ? 4 : p.role === 'titular' ? 2 : 0;
      const meritA = getFormOvrBonus(a.form || 'normal') * 0.8 + (getPlayerAvgRating(a) >= 7.1 ? 2.5 : 0);
      const meritB = getFormOvrBonus(b.form || 'normal') * 0.8 + (getPlayerAvgRating(b) >= 7.1 ? 2.5 : 0);
      const scoreA = a.overall + meritA + a.fitness / 180 + roleBenchBonus(a);
      const scoreB = b.overall + meritB + b.fitness / 180 + roleBenchBonus(b);
      return scoreB - scoreA;
    });

  // Ensure 1 GK + balanced outfield options on bench (up to 7)
  const benchIds: string[] = [];
  const benchGk = remaining.find((p) => p.position === 'GOL');
  if (benchGk) benchIds.push(benchGk.id);
  for (const p of remaining) {
    if (benchIds.length >= 7) break;
    if (!benchIds.includes(p.id)) benchIds.push(p.id);
  }

  return { starterIds, benchIds };
}

