import { autoPickLineup, getActiveSlots, getPositionGroup } from '../data/formations';
import { areClubsRivals } from '../data/leaguesMeta';
import {
  Club,
  GameState,
  Player,
  PositionGroup,
  SquadRole,
} from '../types/game';

export interface TransferEvaluation {
  allowed: boolean;
  statusLabel: string;
  reason?: string;
  askingPrice: number;
}

export interface LoanEvaluation {
  allowed: boolean;
  statusLabel: string;
  reason?: string;
  loanFee: number;
  buyOptionPrice: number;
}

function deterministicScore(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

export function computeDynamicAskingPrice(
  player: Player,
  seller: Club,
  buyer: Club
): number {
  let mult = 1.0;

  if (player.role === 'importantissimo') mult *= 1.38;
  else if (player.role === 'titular') mult *= 1.18;
  else if (player.role === 'promessa') mult *= 1.24;
  else if (player.role === 'rotacao') mult *= 1.02;
  else mult *= 0.86;

  if (player.form === 'otima') mult *= 1.26;
  else if (player.form === 'boa') mult *= 1.12;
  else if (player.form === 'ma') mult *= 0.88;

  if (player.age <= 22 && player.potential - player.overall >= 5) {
    mult *= 1.18;
  }

  if (seller.leagueId === buyer.leagueId) {
    mult *= 1.15;
  }

  if (player.transferListed) {
    mult *= 0.82;
  }

  const raw = Math.max(250000, player.value * mult);
  return Math.round(raw / 50000) * 50000;
}

export function evaluateTransferAttempt(
  state: GameState,
  playerId: string,
  buyerClubId: string
): TransferEvaluation {
  const player = state.players[playerId];
  const buyer = state.clubs[buyerClubId];
  if (!player || !buyer) {
    return { allowed: false, statusLabel: 'Indisponível', reason: 'Atleta ou clube inválido.', askingPrice: 0 };
  }

  const seller = state.clubs[player.clubId];
  if (!seller) {
    return { allowed: true, statusLabel: 'Livre', askingPrice: player.value };
  }

  const askingPrice = computeDynamicAskingPrice(player, seller, buyer);

  if (player.loan) {
    const parentName = state.clubs[player.loan.parentClubId]?.name || 'clube de origem';
    return {
      allowed: false,
      statusLabel: 'Emprestado',
      reason: `${player.name} está emprestado pelo ${parentName} até o fim da temporada.`,
      askingPrice,
    };
  }

  if (areClubsRivals(seller.id, buyer.id)) {
    return {
      allowed: false,
      statusLabel: 'Rival Direto',
      reason: `${seller.name} e ${buyer.name} são rivais diretos e não negociam jogadores entre si.`,
      askingPrice,
    };
  }

  if (
    seller.leagueId === buyer.leagueId &&
    seller.reputation >= 80 &&
    buyer.reputation >= 80 &&
    (player.role === 'importantissimo' || player.role === 'titular') &&
    !player.transferListed
  ) {
    return {
      allowed: false,
      statusLabel: 'Concorrente Direto',
      reason: `${seller.name} recusou liberar um titular para um concorrente direto da mesma liga.`,
      askingPrice,
    };
  }

  const sellerPlayers = Object.values(state.players).filter((p) => p.clubId === seller.id);
  const sellerGks = sellerPlayers.filter((p) => p.position === 'GOL');
  if (sellerPlayers.length <= 14 || (player.position === 'GOL' && sellerGks.length <= 2)) {
    return {
      allowed: false,
      statusLabel: 'Elenco Curto',
      reason: `${seller.name} tem elenco curto na posição e vetou a saída de ${player.name}.`,
      askingPrice,
    };
  }

  if (!player.transferListed) {
    const roll = deterministicScore(`${player.id}_${state.season}_${state.phase}_${buyer.id}`);
    const isStar = player.role === 'importantissimo' && (player.form === 'otima' || player.overall >= 85);
    const isWonderkid = player.age <= 20 && player.potential >= 86 && seller.reputation >= 78;
    const isHotStarter = player.role === 'titular' && player.form === 'otima' && seller.reputation >= 76;

    if (isStar && roll < 0.72) {
      return {
        allowed: false,
        statusLabel: 'Intransferível',
        reason: `${seller.name} considera ${player.name} peça-chave inegociável nesta janela.`,
        askingPrice,
      };
    }
    if (isWonderkid && roll < 0.65) {
      return {
        allowed: false,
        statusLabel: 'Joia Protegida',
        reason: `${seller.name} recusou vender a jovem promessa ${player.name}.`,
        askingPrice,
      };
    }
    if (isHotStarter && roll < 0.4) {
      return {
        allowed: false,
        statusLabel: 'Momento Intransferível',
        reason: `Em Fase Ótima, ${player.name} teve saída vetada pela diretoria do ${seller.name}.`,
        askingPrice,
      };
    }
  }

  if (player.transferListed || askingPrice <= player.value * 0.96) {
    return { allowed: true, statusLabel: 'Negociável', askingPrice };
  }
  if (askingPrice >= player.value * 1.18) {
    return { allowed: true, statusLabel: 'Pede Valor Alto', askingPrice };
  }
  return { allowed: true, statusLabel: 'Aceita Proposta', askingPrice };
}

export function evaluateLoanAttempt(
  state: GameState,
  playerId: string,
  buyerClubId: string
): LoanEvaluation {
  const player = state.players[playerId];
  const buyer = state.clubs[buyerClubId];
  if (!player || !buyer) {
    return { allowed: false, statusLabel: 'Indisponível', reason: 'Atleta ou clube inválido.', loanFee: 0, buyOptionPrice: 0 };
  }

  const seller = state.clubs[player.clubId];
  const buyOptionPrice = Math.max(300000, Math.round((player.value * 1.06) / 50000) * 50000);
  const loanFee = Math.max(100000, Math.round((player.value * (player.age <= 22 ? 0.08 : 0.11)) / 50000) * 50000);

  if (!seller) {
    return { allowed: false, statusLabel: 'Indisponível', reason: 'Atleta sem vínculo ativo.', loanFee, buyOptionPrice };
  }

  if (player.loan) {
    return {
      allowed: false,
      statusLabel: 'Já Emprestado',
      reason: `${player.name} já cumpre contrato de empréstimo nesta temporada.`,
      loanFee,
      buyOptionPrice,
    };
  }

  if (player.injury && player.injury.roundsRemaining > 0) {
    return {
      allowed: false,
      statusLabel: 'Lesionado',
      reason: `${player.name} está no departamento médico e não pode ser emprestado agora.`,
      loanFee,
      buyOptionPrice,
    };
  }

  if (areClubsRivals(seller.id, buyer.id)) {
    return {
      allowed: false,
      statusLabel: 'Rival Direto',
      reason: `${seller.name} e ${buyer.name} são rivais diretos e não emprestam atletas entre si.`,
      loanFee,
      buyOptionPrice,
    };
  }

  const sellerPlayers = Object.values(state.players).filter((p) => p.clubId === seller.id);
  const sellerGks = sellerPlayers.filter((p) => p.position === 'GOL');
  if (sellerPlayers.length <= 15 || (player.position === 'GOL' && sellerGks.length <= 2)) {
    return {
      allowed: false,
      statusLabel: 'Elenco Curto',
      reason: `${seller.name} precisa de elenco mínimo e vetou o empréstimo.`,
      loanFee,
      buyOptionPrice,
    };
  }

  if (player.loanListed || player.transferListed) {
    return { allowed: true, statusLabel: 'Disponível p/ Empréstimo', loanFee, buyOptionPrice };
  }

  if (player.role === 'importantissimo' || (player.role === 'titular' && player.overall >= seller.reputation - 3)) {
    return {
      allowed: false,
      statusLabel: 'Titular Absoluto',
      reason: `${seller.name} conta com ${player.name} no time principal e não aceita emprestá-lo.`,
      loanFee,
      buyOptionPrice,
    };
  }

  const isYoungProspect = player.age <= 23 && (player.role === 'promessa' || player.role === 'reserva' || player.role === 'rotacao');
  if (isYoungProspect || player.role === 'reserva') {
    return { allowed: true, statusLabel: 'Aberto a Empréstimo', loanFee, buyOptionPrice };
  }

  const roll = deterministicScore(`loan_${player.id}_${state.season}_${buyer.id}`);
  if (roll < 0.55) {
    return { allowed: true, statusLabel: 'Aceita Empréstimo', loanFee, buyOptionPrice };
  }

  return {
    allowed: false,
    statusLabel: 'Prefere Venda',
    reason: `${seller.name} prefere manter ${player.name} no grupo ou negociar em definitivo.`,
    loanFee,
    buyOptionPrice,
  };
}

export function manageNpcSquadsAndRoles(state: GameState): void {
  const playersByClub: Record<string, Player[]> = {};
  for (const p of Object.values(state.players)) {
    if (!playersByClub[p.clubId]) playersByClub[p.clubId] = [];
    playersByClub[p.clubId].push(p);
  }

  for (const club of Object.values(state.clubs)) {
    if (club.id === state.userClubId) continue;
    const cPlayers = playersByClub[club.id] || [];
    if (cPlayers.length === 0) continue;

    const slots = getActiveSlots(club.tactics, state.customFormations);
    const picked = autoPickLineup(cPlayers, slots);
    club.starterIds = picked.starterIds;
    club.benchIds = picked.benchIds;

    const starterSet = new Set(picked.starterIds);
    const benchSet = new Set(picked.benchIds);
    const sorted = [...cPlayers].sort((a, b) => b.overall - a.overall);
    const top3Ids = new Set(sorted.slice(0, 3).map((p) => p.id));

    // Count positional surplus
    const posCounts: Record<PositionGroup, number> = { GOL: 0, DEF: 0, MEI: 0, ATA: 0 };
    for (const p of cPlayers) {
      posCounts[getPositionGroup(p.position)]++;
    }

    for (const p of cPlayers) {
      let role: SquadRole = 'reserva';
      if (top3Ids.has(p.id) && p.overall >= Math.max(73, club.reputation - 2)) {
        role = 'importantissimo';
      } else if (starterSet.has(p.id)) {
        role = 'titular';
      } else if (p.age <= 21 && p.potential - p.overall >= 5) {
        role = 'promessa';
      } else if (benchSet.has(p.id)) {
        role = 'rotacao';
      }
      p.role = role;

      // Realistic transfer listing by NPCs
      const grp = getPositionGroup(p.position);
      const hasSurplus =
        (grp === 'GOL' && posCounts.GOL > 3) ||
        (grp === 'DEF' && posCounts.DEF > 8) ||
        (grp === 'MEI' && posCounts.MEI > 8) ||
        (grp === 'ATA' && posCounts.ATA > 6);

      const isUnusedVeteran = p.role === 'reserva' && p.age >= 29;
      const isBenchedMature = p.role === 'reserva' && p.age >= 24 && p.stats.appearances === 0;
      p.transferListed = !p.loan && (hasSurplus || isUnusedVeteran || isBenchedMature);
      p.loanListed = !p.loan && p.age <= 22 && (p.role === 'promessa' || p.role === 'reserva') && cPlayers.length >= 20;
    }
  }
}

function findClubWeakestGroup(club: Club, clubPlayers: Player[]): PositionGroup | null {
  const counts: Record<PositionGroup, number> = { GOL: 0, DEF: 0, MEI: 0, ATA: 0 };
  const bestOvr: Record<PositionGroup, number> = { GOL: 0, DEF: 0, MEI: 0, ATA: 0 };

  for (const p of clubPlayers) {
    const g = getPositionGroup(p.position);
    counts[g]++;
    if (p.overall > bestOvr[g]) bestOvr[g] = p.overall;
  }

  if (counts.GOL < 2 || bestOvr.GOL < club.reputation - 6) return 'GOL';
  if (counts.DEF < 6) return 'DEF';
  if (counts.MEI < 5) return 'MEI';
  if (counts.ATA < 4) return 'ATA';

  const gaps: { grp: PositionGroup; score: number }[] = [
    { grp: 'ATA', score: club.reputation - bestOvr.ATA },
    { grp: 'MEI', score: club.reputation - bestOvr.MEI },
    { grp: 'DEF', score: club.reputation - bestOvr.DEF },
    { grp: 'GOL', score: club.reputation - bestOvr.GOL },
  ];
  gaps.sort((a, b) => b.score - a.score);
  return gaps[0].score >= -1 ? gaps[0].grp : null;
}

export function runGlobalNpcTransfers(
  state: GameState,
  windowType: 'INICIO' | 'MEIO',
  maxTransfers = 55
): number {
  const playersByClub: Record<string, Player[]> = {};
  for (const p of Object.values(state.players)) {
    if (!playersByClub[p.clubId]) playersByClub[p.clubId] = [];
    playersByClub[p.clubId].push(p);
  }

  const lockedSet = new Set(state.sandboxLockedTransferClubIds || []);

  const npcClubs = Object.values(state.clubs)
    .filter((c) => c.id !== state.userClubId && !lockedSet.has(c.id) && c.budget >= 2_500_000)
    .sort(() => Math.random() - 0.5);

  const allPlayers = Object.values(state.players).filter(
    (p) => p.clubId !== state.userClubId && !lockedSet.has(p.clubId) && !p.injury && !p.loan
  );

  let completed = 0;
  const movedPlayerIds = new Set<string>();
  const userClub = state.clubs[state.userClubId];
  const currentRound = userClub ? state.leagues[userClub.leagueId]?.currentRound || 1 : 1;
  const bigDeals: { player: Player; from: Club; to: Club; amount: number; reason: string }[] = [];

  for (const buyer of npcClubs) {
    if (completed >= maxTransfers) break;
    if (Math.random() > 0.62) continue;

    const buyerSquad = playersByClub[buyer.id] || [];
    if (buyerSquad.length >= 34) continue;

    const neededGroup = findClubWeakestGroup(buyer, buyerSquad);
    if (!neededGroup) continue;

    const maxSpend = buyer.budget * 0.78;
    const minTargetOvr = Math.max(60, buyer.reputation - 7);
    const maxTargetOvr = Math.min(92, buyer.reputation + 6);

    // Sample candidate targets efficiently
    const candidates: { player: Player; seller: Club; price: number; reason: string; priority: number }[] = [];

    for (let i = 0; i < 45; i++) {
      const candidate = allPlayers[Math.floor(Math.random() * allPlayers.length)];
      if (!candidate || movedPlayerIds.has(candidate.id)) continue;
      if (candidate.clubId === buyer.id || candidate.clubId === state.userClubId) continue;
      if (getPositionGroup(candidate.position) !== neededGroup) continue;
      if (candidate.overall < minTargetOvr || candidate.overall > maxTargetOvr) continue;

      const seller = state.clubs[candidate.clubId];
      if (!seller || lockedSet.has(seller.id) || areClubsRivals(seller.id, buyer.id)) continue;

      const sellerSquad = playersByClub[seller.id] || [];
      if (sellerSquad.length <= 16) continue;
      if (
        candidate.position === 'GOL' &&
        sellerSquad.filter((sp) => sp.position === 'GOL').length <= 2
      ) {
        continue;
      }

      if (
        seller.leagueId === buyer.leagueId &&
        seller.reputation >= 80 &&
        buyer.reputation >= 80 &&
        (candidate.role === 'importantissimo' || candidate.role === 'titular') &&
        !candidate.transferListed
      ) {
        continue;
      }

      const price = computeDynamicAskingPrice(candidate, seller, buyer);
      if (price > maxSpend) continue;

      // Determine realistic reason
      let reason = 'Reforço para titularidade';
      let priority = candidate.overall;

      if (candidate.transferListed) {
        if (candidate.age >= 30) reason = 'Renovação de elenco';
        else if (candidate.role === 'reserva') reason = 'Sem espaço / Minutagem';
        else reason = 'Excesso no elenco';
        priority += 6;
      } else if (seller.reputation < buyer.reputation - 3) {
        reason = 'Oportunidade de caixa';
        priority += 4;
      } else if (candidate.form === 'otima' || candidate.form === 'boa') {
        reason = 'Destaque em boa fase';
        priority += 5;
      } else {
        reason = 'Carência na posição';
      }

      if (candidate.role === 'importantissimo' && !candidate.transferListed && seller.reputation >= buyer.reputation) {
        continue;
      }

      candidates.push({ player: candidate, seller, price, reason, priority });
    }

    if (candidates.length === 0) continue;
    candidates.sort((a, b) => b.priority - a.priority);
    const chosen = candidates[0];

    // Execute NPC transfer (or young talent loan ~18% of the time)
    const { player, seller, price, reason } = chosen;
    const isYoungLoan =
      player.age <= 22 &&
      (player.loanListed || player.role === 'promessa' || player.role === 'reserva') &&
      buyer.reputation <= seller.reputation + 2 &&
      Math.random() < 0.35;

    if (isYoungLoan) {
      const loanFee = Math.max(100_000, Math.round((player.value * 0.08) / 50_000) * 50_000);
      if (buyer.budget >= loanFee) {
        buyer.budget -= loanFee;
        seller.budget += loanFee;
        seller.starterIds = seller.starterIds.filter((id) => id !== player.id);
        seller.benchIds = seller.benchIds.filter((id) => id !== player.id);

        player.clubId = buyer.id;
        player.transferListed = false;
        player.loanListed = false;
        player.askingPrice = undefined;
        player.role = player.overall >= buyer.reputation - 2 ? 'titular' : 'rotacao';
        player.loan = {
          parentClubId: seller.id,
          fromClubId: seller.id,
          toClubId: buyer.id,
          loanFee,
          endSeason: state.season,
        };

        playersByClub[seller.id] = (playersByClub[seller.id] || []).filter((p) => p.id !== player.id);
        playersByClub[buyer.id] = [...(playersByClub[buyer.id] || []), player];

        state.transferHistory.unshift({
          id: `tr_npc_loan_${windowType}_${Date.now()}_${completed}`,
          playerId: player.id,
          playerName: player.name,
          fromClubId: seller.id,
          toClubId: buyer.id,
          amount: loanFee,
          type: 'LOAN',
          season: state.season,
          phase: state.phase,
          reason: 'Empréstimo para ganhar rodagem',
        });

        movedPlayerIds.add(player.id);
        completed++;
        continue;
      }
    }

    buyer.budget -= price;
    seller.budget += price;

    seller.starterIds = seller.starterIds.filter((id) => id !== player.id);
    seller.benchIds = seller.benchIds.filter((id) => id !== player.id);

    player.clubId = buyer.id;
    player.transferListed = false;
    player.loanListed = false;
    player.askingPrice = undefined;
    player.role = player.overall >= buyer.reputation - 2 ? 'titular' : 'rotacao';

    playersByClub[seller.id] = (playersByClub[seller.id] || []).filter((p) => p.id !== player.id);
    playersByClub[buyer.id] = [...(playersByClub[buyer.id] || []), player];

    state.transferHistory.unshift({
      id: `tr_npc_${windowType}_${Date.now()}_${completed}`,
      playerId: player.id,
      playerName: player.name,
      fromClubId: seller.id,
      toClubId: buyer.id,
      amount: price,
      type: 'TRANSFER',
      season: state.season,
      phase: state.phase,
      reason,
    });

    movedPlayerIds.add(player.id);
    completed++;

    if (price >= 22_000_000 || player.overall >= 82) {
      bigDeals.push({ player, from: seller, to: buyer, amount: price, reason });
    }
  }

  // Re-evaluate NPC roles & healthy lineups after window deals
  manageNpcSquadsAndRoles(state);

  // Publish top NPC market headlines
  bigDeals
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 3)
    .forEach((deal, idx) => {
      state.newsFeed.unshift({
        id: `news_npc_tr_${windowType}_${Date.now()}_${idx}`,
        round: currentRound,
        title: `Mercado Global: ${deal.player.name} fecha com ${deal.to.name}`,
        detail: `${deal.to.name} pagou € ${(deal.amount / 1_000_000).toFixed(1)}M ao ${deal.from.name} (${deal.reason}).`,
        type: 'transfer',
      });
    });

  return completed;
}
