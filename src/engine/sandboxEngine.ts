import { autoPickLineup, getActiveSlots } from '../data/formations';
import {
  DraftCandidate,
  DraftClassTier,
  GameState,
  LeagueId,
  RawDataset,
} from '../types/game';
import { initializeGameState } from './dataLoader';
import { buildFallbackPlayerAttributes, generateAllInitialDraftOfferings } from './draftEngine';
import { cloneState } from './seasonEngine';

export function createSandboxWorld(dataset: RawDataset, initialClubId?: string): GameState {
  const firstClub =
    initialClubId ||
    dataset.clubs?.find((c) => c.id === 'arsenal')?.id ||
    dataset.clubs?.[0]?.id ||
    dataset.players[0]?.clubId ||
    'arsenal';

  const state = initializeGameState(dataset, firstClub, 'sandbox_live', 'Modo Sandbox', 2026, 'CAREER', {
    skipInitialNpcTransfers: true,
  });
  state.sandboxLockedTransferClubIds = [];
  return state;
}

export function sandboxAssumeClub(prevState: GameState, clubId: string): GameState {
  if (!prevState.clubs[clubId]) return prevState;
  const state = cloneState(prevState);
  state.userClubId = clubId;
  const club = state.clubs[clubId];
  const round = state.leagues[club.leagueId]?.currentRound || 1;
  state.newsFeed.unshift({
    id: `news_sb_assume_${Date.now()}`,
    round,
    title: `Sandbox: Você assumiu o comando do ${club.name}`,
    detail: `Controle tático, escalação e finanças diretas ativadas para ${club.name}.`,
    type: 'info',
  });
  return state;
}

export function sandboxToggleClubTransferLock(prevState: GameState, clubId: string): GameState {
  const state = cloneState(prevState);
  const current = new Set(state.sandboxLockedTransferClubIds || []);
  if (current.has(clubId)) current.delete(clubId);
  else current.add(clubId);
  state.sandboxLockedTransferClubIds = Array.from(current);
  return state;
}

export function sandboxSetLeagueTransferLock(
  prevState: GameState,
  leagueId: LeagueId,
  locked: boolean
): GameState {
  const state = cloneState(prevState);
  const current = new Set(state.sandboxLockedTransferClubIds || []);
  for (const c of Object.values(state.clubs)) {
    if (c.leagueId === leagueId) {
      if (locked) current.add(c.id);
      else current.delete(c.id);
    }
  }
  state.sandboxLockedTransferClubIds = Array.from(current);
  return state;
}

export function sandboxSetAllTransferLocks(prevState: GameState, locked: boolean): GameState {
  const state = cloneState(prevState);
  state.sandboxLockedTransferClubIds = locked ? Object.keys(state.clubs) : [];
  return state;
}

export interface ForcedDealParams {
  playerId: string;
  toClubId: string;
  type: 'TRANSFER' | 'LOAN';
  amount: number;
  buyOptionPrice?: number;
  adjustBudgets: boolean;
}

export function sandboxExecuteForcedDeal(
  prevState: GameState,
  params: ForcedDealParams
): { state: GameState; error?: string } {
  const state = cloneState(prevState);
  const player = state.players[params.playerId];
  const toClub = state.clubs[params.toClubId];
  if (!player || !toClub) {
    return { state: prevState, error: 'Jogador ou clube de destino inválido.' };
  }
  if (player.clubId === toClub.id) {
    return { state: prevState, error: 'O jogador já pertence ao clube de destino.' };
  }

  const fromClub = state.clubs[player.clubId];
  const fromPlayers = Object.values(state.players).filter((p) => p.clubId === player.clubId);
  if (fromPlayers.length <= 12) {
    return { state: prevState, error: `${fromClub?.name || 'Clube de origem'} ficaria com menos de 12 atletas.` };
  }

  const amount = Math.max(0, Math.round(params.amount));
  if (params.adjustBudgets) {
    toClub.budget = Math.max(0, toClub.budget - amount);
    if (fromClub) fromClub.budget += amount;
  }

  if (fromClub) {
    fromClub.starterIds = fromClub.starterIds.filter((id) => id !== player.id);
    fromClub.benchIds = fromClub.benchIds.filter((id) => id !== player.id);
    const remaining = Object.values(state.players).filter(
      (p) => p.clubId === fromClub.id && p.id !== player.id
    );
    const slots = getActiveSlots(fromClub.tactics, state.customFormations);
    const picked = autoPickLineup(remaining, slots);
    fromClub.starterIds = picked.starterIds;
    fromClub.benchIds = picked.benchIds;
  }

  const prevClubId = player.clubId;
  player.clubId = toClub.id;
  player.transferListed = false;
  player.loanListed = false;
  player.askingPrice = undefined;
  player.role = player.overall >= toClub.reputation - 2 ? 'titular' : 'rotacao';

  if (params.type === 'LOAN') {
    player.loan = {
      parentClubId: prevClubId,
      fromClubId: prevClubId,
      toClubId: toClub.id,
      loanFee: amount,
      buyOptionPrice: params.buyOptionPrice && params.buyOptionPrice > 0 ? params.buyOptionPrice : undefined,
      endSeason: state.season,
    };
  } else {
    player.loan = undefined;
  }

  const destPlayers = Object.values(state.players).filter((p) => p.clubId === toClub.id);
  const destSlots = getActiveSlots(toClub.tactics, state.customFormations);
  const destPicked = autoPickLineup(destPlayers, destSlots);
  toClub.starterIds = destPicked.starterIds;
  toClub.benchIds = destPicked.benchIds;

  const round = state.leagues[toClub.leagueId]?.currentRound || 1;
  state.transferHistory.unshift({
    id: `tr_sb_${params.type}_${Date.now()}_${player.id}`,
    playerId: player.id,
    playerName: player.name,
    fromClubId: prevClubId,
    toClubId: toClub.id,
    amount,
    type: params.type,
    season: state.season,
    phase: state.phase,
    reason:
      params.type === 'LOAN'
        ? 'Empréstimo Forçado (Sandbox)'
        : 'Transferência Forçada (Sandbox)',
  });

  state.newsFeed.unshift({
    id: `news_sb_deal_${Date.now()}_${player.id}`,
    round,
    title:
      params.type === 'LOAN'
        ? `Sandbox: ${player.name} emprestado ao ${toClub.name}`
        : `Sandbox: ${player.name} transferido ao ${toClub.name}`,
    detail: `Acordo direto a partir do ${fromClub?.name || prevClubId} por € ${(amount / 1_000_000).toFixed(2)}M.`,
    type: 'transfer',
  });

  return { state };
}

export function sandboxGenerateDraftForClub(
  state: GameState,
  targetClubId: string
): Record<DraftClassTier, DraftCandidate[]> {
  const temp = cloneState(state);
  temp.userClubId = targetClubId;
  return generateAllInitialDraftOfferings(temp);
}

export function sandboxSignDraftCandidate(
  prevState: GameState,
  targetClubId: string,
  candidate: DraftCandidate,
  deductBudget: boolean
): { state: GameState; error?: string } {
  const state = cloneState(prevState);
  const player = state.players[candidate.playerId];
  const targetClub = state.clubs[targetClubId];
  if (!player || !targetClub) {
    return { state: prevState, error: 'Atleta ou clube inválido.' };
  }
  if (player.clubId === targetClub.id) {
    return { state: prevState, error: 'Este atleta já atua no clube selecionado.' };
  }

  const price = deductBudget ? candidate.draftPrice : 0;
  if (deductBudget && targetClub.budget < price) {
    return { state: prevState, error: 'Verba insuficiente para contratar pagando o valor do Draft.' };
  }

  const originClub = state.clubs[player.clubId];
  if (deductBudget) {
    targetClub.budget -= price;
    if (originClub) originClub.budget += price;
  }

  if (originClub) {
    originClub.starterIds = originClub.starterIds.filter((id) => id !== player.id);
    originClub.benchIds = originClub.benchIds.filter((id) => id !== player.id);
    const originPlayers = Object.values(state.players).filter(
      (p) => p.clubId === originClub.id && p.id !== player.id
    );
    const slots = getActiveSlots(originClub.tactics, state.customFormations);
    const picked = autoPickLineup(originPlayers, slots);
    originClub.starterIds = picked.starterIds;
    originClub.benchIds = picked.benchIds;
  }

  player.clubId = targetClub.id;
  player.loan = undefined;
  player.transferListed = false;
  player.loanListed = false;
  player.role = 'titular';

  if (candidate.isUnderdogBuffed && candidate.ovrBuffDelta > 0) {
    const prevOvr = player.overall;
    const nextOvr = Math.min(95, prevOvr + candidate.ovrBuffDelta);
    player.overall = nextOvr;
    player.potential = Math.max(player.potential, nextOvr + 1);
    player.stats.ovrDelta += Math.max(0, nextOvr - prevOvr);
    const attrs = buildFallbackPlayerAttributes(player);
    const boost = candidate.ovrBuffDelta * 2;
    if (player.position === 'GOL') {
      attrs.gkReflexes = Math.min(98, (attrs.gkReflexes ?? prevOvr) + boost);
      attrs.gkDiving = Math.min(98, (attrs.gkDiving ?? prevOvr) + boost);
      attrs.gkPositioning = Math.min(98, (attrs.gkPositioning ?? prevOvr) + boost);
    } else {
      attrs.pace = Math.min(98, attrs.pace + Math.ceil(boost * 0.7));
      attrs.shooting = Math.min(98, attrs.shooting + boost);
      attrs.passing = Math.min(98, attrs.passing + boost);
      attrs.dribbling = Math.min(98, attrs.dribbling + boost);
    }
    player.attributes = attrs;
  }

  const destPlayers = Object.values(state.players).filter((p) => p.clubId === targetClub.id);
  const destSlots = getActiveSlots(targetClub.tactics, state.customFormations);
  const destPicked = autoPickLineup(destPlayers, destSlots);
  targetClub.starterIds = destPicked.starterIds;
  targetClub.benchIds = destPicked.benchIds;

  const round = state.leagues[targetClub.leagueId]?.currentRound || 1;
  state.transferHistory.unshift({
    id: `tr_sb_draft_${Date.now()}_${player.id}`,
    playerId: player.id,
    playerName: player.name,
    fromClubId: candidate.fromClubId,
    toClubId: targetClub.id,
    amount: price,
    type: 'TRANSFER',
    season: state.season,
    phase: state.phase,
    reason: candidate.isUnderdogBuffed
      ? `Draft Sandbox (+${candidate.ovrBuffDelta} OVR Buff)`
      : 'Draft Sandbox',
  });

  state.newsFeed.unshift({
    id: `news_sb_draft_${Date.now()}_${player.id}`,
    round,
    title: `Draft Sandbox: ${player.name} fecha com ${targetClub.name}`,
    detail: candidate.isUnderdogBuffed
      ? `Reforço roletado do ${candidate.fromClubName} com buff automático (+${candidate.ovrBuffDelta} OVR).`
      : `Reforço escolhido no Draft para o ${targetClub.name}.`,
    type: 'transfer',
  });

  return { state };
}
