import { FORM_LABELS, getActiveSlots, getPlayerAvgRating, ROLE_LABELS } from '../data/formations';
import { getSlotDisplayLabel } from '../engine/tacticsEngine';
import { Club, GameState, Player } from '../types/game';
import { formatCurrency } from './format';

function formatPlayerLine(p: Player, state: GameState, prefixLabel?: string): string {
  const posTag = prefixLabel ? `${prefixLabel} (${p.position})` : p.position;
  const altPos = p.alternatePositions?.length ? ` [${p.alternatePositions.join('/')}]` : '';
  const avg = getPlayerAvgRating(p);
  const avgText = avg > 0 ? `Média ${avg.toFixed(1)}` : 'Sem nota';
  const formText = FORM_LABELS[p.form || 'normal'];
  const fitnessText =
    p.injury && p.injury.roundsRemaining > 0
      ? `Lesão: ${p.injury.type} (${p.injury.roundsRemaining} rod.)`
      : `Físico ${p.fitness}%`;
  const roleText = ROLE_LABELS[p.role] || p.role;
  const ovrDelta = p.stats.ovrDelta > 0 ? ` (+${p.stats.ovrDelta})` : p.stats.ovrDelta < 0 ? ` (${p.stats.ovrDelta})` : '';
  const loanTag = p.loan
    ? ` | Empréstimo (${state.clubs[p.loan.parentClubId]?.shortName || p.loan.parentClubId})`
    : '';

  return `- [${posTag}] ${p.name}${altPos} | ${p.nationality} | ${p.age}a | OVR ${p.overall}/${p.potential}${ovrDelta} | ${formText} (${avgText}) | ${fitnessText} | ${roleText} | J:${p.stats.appearances} Min:${p.stats.minutes}' G:${p.stats.goals} A:${p.stats.assists} SG:${p.stats.cleanSheets || 0} CA:${p.stats.yellowCards} CV:${p.stats.redCards} | Valor ${formatCurrency(p.value)}${loanTag}`;
}

export function buildSquadExportText(
  state: GameState,
  club: Club,
  clubPlayers: Player[]
): string {
  const league = state.leagues[club.leagueId];
  const slots = getActiveSlots(club.tactics, state.customFormations);

  const starterSet = new Set(club.starterIds);
  const benchSet = new Set(club.benchIds);

  const starters = club.starterIds.map((id) => state.players[id]).filter(Boolean);
  const bench = club.benchIds.map((id) => state.players[id]).filter(Boolean);
  const reserves = clubPlayers
    .filter((p) => !starterSet.has(p.id) && !benchSet.has(p.id))
    .sort((a, b) => b.overall - a.overall);

  const avgOvr = clubPlayers.length
    ? Math.round(clubPlayers.reduce((s, p) => s + p.overall, 0) / clubPlayers.length)
    : 0;
  const starterAvgOvr = starters.length
    ? Math.round(starters.reduce((s, p) => s + p.overall, 0) / starters.length)
    : 0;

  const lines: string[] = [
    `=== ELENCO: ${club.name.toUpperCase()} (${club.shortName}) ===`,
    `Liga: ${league?.name || club.leagueId} | Temporada ${state.season} (Rodada ${league?.currentRound || 1})`,
    `Formação: ${club.tactics.formationId} | Estilo: ${club.tactics.mentality} / passe ${club.tactics.passing} / pressão ${club.tactics.pressing} / ritmo ${club.tactics.tempo}`,
    `Verba: ${formatCurrency(club.budget)} | Elenco: ${clubPlayers.length} atletas | OVR Titular: ${starterAvgOvr} | OVR Geral: ${avgOvr}`,
    '',
    `--- TITULARES (${starters.length}) ---`,
  ];

  starters.forEach((p, idx) => {
    const slotLabel = slots[idx] ? getSlotDisplayLabel(slots[idx], idx) : p.position;
    lines.push(formatPlayerLine(p, state, slotLabel));
  });

  lines.push('');
  lines.push(`--- BANCO DE RESERVAS (${bench.length}) ---`);
  if (bench.length === 0) {
    lines.push('(Nenhum jogador no banco)');
  } else {
    bench.forEach((p) => lines.push(formatPlayerLine(p, state)));
  }

  lines.push('');
  lines.push(`--- RESERVAS / RESTANTE DO ELENCO (${reserves.length}) ---`);
  if (reserves.length === 0) {
    lines.push('(Nenhum reserva adicional)');
  } else {
    reserves.forEach((p) => lines.push(formatPlayerLine(p, state)));
  }

  return lines.join('\n');
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fallback below
  }

  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.top = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
