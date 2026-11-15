import { getSlotCompatibility } from '../data/formations';
import { Club, ClubTactics, FormationSlot, Player, Position } from '../types/game';
import {
  computeAttackerGoalWeightMult,
  computeCreatorAssistWeightMult,
} from './goalShotEngine';

export type TacticalLane = 'left' | 'center' | 'right';

export interface SlotTacticalInfo {
  index: number;
  slot: FormationSlot;
  displayLabel: string;
  lane: TacticalLane;
  height: number; // 0 (GK) to 95 (striker)
  isGK: boolean;
  isCenterBack: boolean;
  isDeepFullback: boolean;
  isWingback: boolean;
  wingbackPush: number; // 0..1.35
  isHoldingMid: boolean;
  isDeepAnchor: boolean;
  isCentralMid: boolean;
  isAttackingMid: boolean;
  isWinger: boolean;
  isStriker: boolean;
}

export interface FormationTacticalAnalysis {
  slotInfos: SlotTacticalInfo[];
  cbCount: number;
  deepFullbackLeft: boolean;
  deepFullbackRight: boolean;
  wingbackLeftPush: number;
  wingbackRightPush: number;
  deepAnchorCount: number;
  holdingMidCount: number;
  midfieldCount: number;
  attackCount: number;
  defLineY: number; // lower = higher defensive line
  compactnessScore: number; // 0..100
  crowdingPenalty: number; // 0..8
  widthScore: number; // 0..100
  leftFlankExposure: number; // 0..1
  rightFlankExposure: number; // 0..1
  centralExposure: number; // 0..1
  highLineExposure: number; // 0..1
  leftThreat: number; // 0..1.5
  centerThreat: number; // 0..1.5
  rightThreat: number; // 0..1.5
  attackAdj: number;
  midfieldAdj: number;
  defenseAdj: number;
  possessionAdj: number;
  shotVolumeMult: number;
  fatigueMult: number;
  ratings: {
    defense: number; // 0..100
    midfield: number; // 0..100
    attack: number; // 0..100
    width: number; // 0..100
    risk: number; // 0..100 (space left behind)
  };
  strengths: string[];
  warnings: string[];
}

export interface TacticalMatchupResult {
  homeAnalysis: FormationTacticalAnalysis;
  awayAnalysis: FormationTacticalAnalysis;
  homePossessionBonus: number;
  homeAttackBonus: number;
  awayAttackBonus: number;
  homeDefensePenalty: number;
  awayDefensePenalty: number;
  homeShotsMult: number;
  awayShotsMult: number;
  homeXGBoost: number;
  awayXGBoost: number;
  homeOnTargetAdj: number;
  awayOnTargetAdj: number;
  homeBigChancesBonus: number;
  awayBigChancesBonus: number;
  summaryNote: string;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function getSlotDisplayLabel(slot: FormationSlot, idx: number): string {
  if (idx === 0 || slot.pos === 'GOL') return 'GOL';
  if (slot.pos === 'LE' && slot.y <= 62) return 'ALA E';
  if (slot.pos === 'LD' && slot.y <= 62) return 'ALA D';
  return slot.pos;
}

export function getSlotTacticalInfo(slot: FormationSlot, index: number): SlotTacticalInfo {
  const isGK = index === 0 || slot.pos === 'GOL';
  const lane: TacticalLane = slot.x < 33 ? 'left' : slot.x > 67 ? 'right' : 'center';
  const height = clamp(100 - slot.y, 0, 95);
  const isCenterBack = !isGK && slot.pos === 'ZAG';
  const isWingback = !isGK && (slot.pos === 'LE' || slot.pos === 'LD') && slot.y <= 62;
  const isDeepFullback = !isGK && (slot.pos === 'LE' || slot.pos === 'LD') && slot.y > 62;
  const wingbackPush = isWingback ? clamp((64 - slot.y) / 18, 0.25, 1.35) : 0;
  const isHoldingMid = !isGK && slot.pos === 'VOL';
  const isDeepAnchor = isHoldingMid && slot.y >= 54;
  const isCentralMid = !isGK && slot.pos === 'MC';
  const isAttackingMid = !isGK && (slot.pos === 'MEI' || (slot.pos === 'MC' && slot.y <= 41));
  const isWinger = !isGK && (slot.pos === 'PE' || slot.pos === 'PD');
  const isStriker = !isGK && slot.pos === 'ATA';

  return {
    index,
    slot,
    displayLabel: getSlotDisplayLabel(slot, index),
    lane,
    height,
    isGK,
    isCenterBack,
    isDeepFullback,
    isWingback,
    wingbackPush,
    isHoldingMid,
    isDeepAnchor,
    isCentralMid,
    isAttackingMid,
    isWinger,
    isStriker,
  };
}

export function analyzeClubTactics(
  slots: FormationSlot[],
  tactics: ClubTactics
): FormationTacticalAnalysis {
  const slotInfos = slots.map((s, idx) => getSlotTacticalInfo(s, idx));
  const outfield = slotInfos.filter((s) => !s.isGK);

  const cbs = outfield.filter((s) => s.isCenterBack);
  const cbCount = cbs.length;
  const deepFullbackLeft = outfield.some((s) => s.isDeepFullback && s.slot.pos === 'LE');
  const deepFullbackRight = outfield.some((s) => s.isDeepFullback && s.slot.pos === 'LD');

  const wingbacksLeft = outfield.filter((s) => s.isWingback && s.slot.pos === 'LE');
  const wingbacksRight = outfield.filter((s) => s.isWingback && s.slot.pos === 'LD');
  const wingbackLeftPush = wingbacksLeft.reduce((m, s) => Math.max(m, s.wingbackPush), 0);
  const wingbackRightPush = wingbacksRight.reduce((m, s) => Math.max(m, s.wingbackPush), 0);

  const holdingMids = outfield.filter((s) => s.isHoldingMid);
  const holdingMidCount = holdingMids.length;
  const deepAnchorCount = outfield.filter((s) => s.isDeepAnchor).length;

  const midfieldSlots = outfield.filter((s) => s.isHoldingMid || s.isCentralMid || s.isAttackingMid);
  const midfieldCount = midfieldSlots.length;

  const attackSlots = outfield.filter((s) => s.isWinger || s.isStriker);
  const attackCount = attackSlots.length;

  // Defensive line height (lower y = higher line)
  const backlineSlots = outfield.filter((s) => s.isCenterBack || s.isDeepFullback);
  const defLineY =
    backlineSlots.length > 0
      ? backlineSlots.reduce((sum, s) => sum + s.slot.y, 0) / backlineSlots.length
      : 66;

  // Crowding check: detect overlapping outfield players stacked on top of each other
  let overlapScore = 0;
  for (let i = 0; i < outfield.length; i++) {
    for (let j = i + 1; j < outfield.length; j++) {
      const dx = outfield[i].slot.x - outfield[j].slot.x;
      const dy = outfield[i].slot.y - outfield[j].slot.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 11) {
        overlapScore += (11 - dist) / 11;
      }
    }
  }
  const crowdingPenalty = clamp(overlapScore * 1.45, 0, 7.5);

  // Vertical compactness between backline and front line
  const maxY = outfield.reduce((m, s) => Math.max(m, s.slot.y), 0);
  const minY = outfield.reduce((m, s) => Math.min(m, s.slot.y), 100);
  const verticalSpan = maxY - minY;
  const idealSpan = 56;
  const spanPenalty = verticalSpan > 66 ? (verticalSpan - 66) * 1.1 : verticalSpan < 34 ? (34 - verticalSpan) * 0.9 : 0;
  const midBridgePenalty = midfieldCount < 2 ? 16 : midfieldCount === 2 && verticalSpan > 58 ? 8 : 0;
  const compactnessScore = clamp(Math.round(92 - spanPenalty - midBridgePenalty - crowdingPenalty * 3.5), 25, 98);

  // Width calculation (how well both left & right flanks are stretched)
  const hasLeftWidth = outfield.some((s) => s.slot.x <= 24);
  const hasRightWidth = outfield.some((s) => s.slot.x >= 76);
  const leftWideCount = outfield.filter((s) => s.slot.x <= 26).length;
  const rightWideCount = outfield.filter((s) => s.slot.x >= 74).length;
  let widthScore = 48;
  if (hasLeftWidth) widthScore += 18;
  if (hasRightWidth) widthScore += 18;
  if (wingbackLeftPush > 0) widthScore += 7;
  if (wingbackRightPush > 0) widthScore += 7;
  if (leftWideCount >= 2 && rightWideCount >= 2) widthScore += 4;
  widthScore = clamp(Math.round(widthScore - crowdingPenalty * 1.5), 20, 99);

  // Flank coverage & space behind wingbacks / advanced wide players
  // Key tactical principle:
  // - 3+ CBs provide wide CB cover behind pushed wingbacks (3-5-2 / 5-3-2)
  // - 2 CBs + deep VOL cover partially, but pushing BOTH fullbacks into wingbacks still leaves flank space
  // - 2 CBs without deep VOL + pushed wingbacks (or no deep fullbacks at all) leaves open flanks behind!
  const hasLeftWideAttacker = outfield.some((s) => s.slot.pos === 'PE' || s.lane === 'left');
  const hasRightWideAttacker = outfield.some((s) => s.slot.pos === 'PD' || s.lane === 'right');

  const wideCbLeftCover = cbs.some((s) => s.slot.x <= 34);
  const wideCbRightCover = cbs.some((s) => s.slot.x >= 66);

  let flankCoverStrength = 0;
  if (cbCount >= 3) {
    flankCoverStrength = 0.84 + (wideCbLeftCover && wideCbRightCover ? 0.08 : 0);
  } else if (cbCount === 2) {
    flankCoverStrength = deepAnchorCount >= 2 ? 0.56 : deepAnchorCount === 1 ? 0.36 : 0.08;
  } else {
    flankCoverStrength = deepAnchorCount >= 1 ? 0.12 : 0;
  }

  let leftNeed = 0;
  if (wingbackLeftPush > 0) {
    leftNeed = 0.45 + wingbackLeftPush * 0.48;
  } else if (!deepFullbackLeft) {
    leftNeed = hasLeftWideAttacker ? 0.85 : 1.05;
  }

  let rightNeed = 0;
  if (wingbackRightPush > 0) {
    rightNeed = 0.45 + wingbackRightPush * 0.48;
  } else if (!deepFullbackRight) {
    rightNeed = hasRightWideAttacker ? 0.85 : 1.05;
  }

  // Pushing both wingbacks simultaneously stretches 2-CB cover much more than pushing just one side
  const dualPushExtra = wingbackLeftPush > 0 && wingbackRightPush > 0 && cbCount < 3 ? 0.18 : 0;

  const leftFlankExposure = clamp(
    leftNeed * (1 - flankCoverStrength) + (leftNeed > 0 ? dualPushExtra : 0),
    0,
    1
  );
  const rightFlankExposure = clamp(
    rightNeed * (1 - flankCoverStrength) + (rightNeed > 0 ? dualPushExtra : 0),
    0,
    1
  );

  // Central defensive exposure (too few CBs or zero holding protection)
  let centralExposure = 0;
  if (cbCount === 0) centralExposure = 1.0;
  else if (cbCount === 1) centralExposure = deepAnchorCount > 0 ? 0.52 : 0.78;
  else if (cbCount === 2 && holdingMidCount === 0) {
    // 2 CBs with no DM leaves space in Zone 14, worsened if mentality is offensive
    centralExposure = tactics.mentality === 'ofensiva' ? 0.36 : 0.22;
  } else if (cbCount === 2 && deepAnchorCount === 0 && tactics.mentality === 'ofensiva') {
    centralExposure = 0.16;
  }
  if (tactics.mentality === 'defensiva') {
    centralExposure = Math.max(0, centralExposure - 0.1);
  }
  centralExposure = clamp(centralExposure, 0, 1);

  // High line exposure (CBs dragged up < 70 or high pressing with aggressive mentality)
  const highLineBase = defLineY < 70 ? clamp((70 - defLineY) / 10, 0, 0.85) : 0;
  const pressRisk = tactics.pressing === 'alta' ? 0.26 : tactics.pressing === 'baixa' ? -0.14 : 0;
  const mentalityRisk = tactics.mentality === 'ofensiva' ? 0.18 : tactics.mentality === 'defensiva' ? -0.16 : 0;
  const highLineExposure = clamp(highLineBase + pressRisk + mentalityRisk, 0, 1);

  // Offensive threats by lane
  const laneThreat = (lane: TacticalLane): number => {
    let t = 0;
    for (const s of outfield) {
      if (s.lane !== lane) continue;
      if (s.isStriker) t += 0.58 + (s.height > 80 ? 0.12 : 0);
      else if (s.isWinger) t += 0.48 + (s.height > 72 ? 0.08 : 0);
      else if (s.isWingback) t += 0.25 + s.wingbackPush * 0.24;
      else if (s.isAttackingMid) t += 0.34;
      else if (s.isCentralMid && s.height >= 54) t += 0.16;
    }
    return clamp(t, 0, 1.5);
  };

  const leftThreat = laneThreat('left');
  const centerThreat = laneThreat('center');
  const rightThreat = laneThreat('right');

  // Structural adjustments to club power
  let attackAdj = 0;
  let midfieldAdj = 0;
  let defenseAdj = 0;
  let possessionAdj = 0;
  let shotVolumeMult = 1.0;
  let fatigueMult = 1.0;

  // Wingbacks bring real width & attacking thrust
  const wingbackAttackGain = (wingbackLeftPush + wingbackRightPush) * 1.15;
  attackAdj += wingbackAttackGain;
  if (hasLeftWidth && hasRightWidth) attackAdj += 0.9;

  // Midfield numerical control
  if (midfieldCount >= 5) {
    midfieldAdj += 2.2;
    possessionAdj += 3.5;
  } else if (midfieldCount === 4) {
    midfieldAdj += 1.1;
    possessionAdj += 1.8;
  } else if (midfieldCount === 2) {
    midfieldAdj -= 1.8;
    possessionAdj -= 3.2;
  } else if (midfieldCount <= 1) {
    midfieldAdj -= 4.0;
    possessionAdj -= 6.5;
  }

  // 3 CBs solidify box & cover wingbacks
  if (cbCount >= 3) {
    defenseAdj += 1.9 + (cbCount > 3 ? 0.6 : 0);
  } else if (cbCount === 1) {
    defenseAdj -= 4.8;
  } else if (cbCount === 0) {
    defenseAdj -= 9.5;
  }

  // Deep anchor shields the center
  if (deepAnchorCount >= 2) {
    defenseAdj += 1.6;
    midfieldAdj += 0.6;
  } else if (deepAnchorCount === 1) {
    defenseAdj += 0.9;
  }

  // High line boosts midfield pressing but adds slight defensive fragility when exposed
  if (defLineY < 70) {
    midfieldAdj += clamp((70 - defLineY) * 0.16, 0, 1.5);
  }

  // Exposed flank / central penalties on raw defense
  defenseAdj -= (leftFlankExposure + rightFlankExposure) * 1.8;
  defenseAdj -= centralExposure * 3.2;

  // Diminishing returns for overcrowding / lack of attackers
  if (attackCount === 0) attackAdj -= 3.8;
  if (attackCount >= 5) {
    attackAdj -= (attackCount - 4) * 1.2; // congested box, lack of service
    midfieldAdj -= 1.5;
  }
  attackAdj -= crowdingPenalty * 0.45;
  midfieldAdj -= crowdingPenalty * 0.4;

  // Passing style effects
  if (tactics.passing === 'curto') {
    const shortFit = compactnessScore >= 65 && midfieldCount >= 3 ? 1.0 : -0.8;
    possessionAdj += 4.2 + shortFit;
    midfieldAdj += shortFit * 1.1;
    shotVolumeMult *= 0.97;
  } else if (tactics.passing === 'direto') {
    possessionAdj -= 4.5;
    attackAdj += 0.7;
    shotVolumeMult *= 1.05;
  }

  // Tempo effects
  if (tactics.tempo === 'rapido') {
    shotVolumeMult *= 1.12;
    fatigueMult *= 1.12;
    possessionAdj -= 1.2;
  } else if (tactics.tempo === 'lento') {
    shotVolumeMult *= 0.89;
    fatigueMult *= 0.91;
    possessionAdj += 2.0;
  }

  // Pressing effects
  if (tactics.pressing === 'alta') {
    possessionAdj += 2.2;
    shotVolumeMult *= 1.06;
    fatigueMult *= 1.14;
  } else if (tactics.pressing === 'baixa') {
    possessionAdj -= 2.2;
    shotVolumeMult *= 0.94;
    fatigueMult *= 0.90;
  }

  // Strengths & Warnings for subtle UI readout
  const strengths: string[] = [];
  const warnings: string[] = [];

  if ((wingbackLeftPush > 0 || wingbackRightPush > 0) && cbCount >= 3) {
    strengths.push('3 zagueiros cobrem as costas dos alas avançados com segurança.');
  } else if ((wingbackLeftPush > 0 || wingbackRightPush > 0) && cbCount === 2 && deepAnchorCount >= 1) {
    strengths.push('Volante recuado ajuda a fechar o espaço deixado pelos alas.');
  }

  if (wingbackLeftPush > 0 && wingbackRightPush > 0) {
    strengths.push('Alas dão amplitude ofensiva e geram mais cruzamentos/assistências.');
  } else if (hasLeftWidth && hasRightWidth) {
    strengths.push('Boa amplitude nos dois corredores do campo.');
  }

  if (midfieldCount >= 4 && compactnessScore >= 68) {
    strengths.push('Meio povoado e compacto favorece posse e controle.');
  }

  if (tactics.passing === 'direto' && tactics.tempo === 'rapido') {
    strengths.push('Transição direta veloz pune linhas altas e alas desprotegidos.');
  }

  if (cbCount < 2) {
    warnings.push('Poucos zagueiros na área: miolo defensivo muito vulnerável.');
  }
  if (leftFlankExposure >= 0.42 || rightFlankExposure >= 0.42) {
    const sides =
      leftFlankExposure >= 0.42 && rightFlankExposure >= 0.42
        ? 'nos dois lados'
        : leftFlankExposure >= 0.42
          ? 'na esquerda'
          : 'na direita';
    warnings.push(
      `Espaço aberto nas costas ${sides} (ala avançado sem 3º ZAG ou VOL cobrindo).`
    );
  }
  if (cbCount >= 2 && holdingMidCount === 0 && tactics.mentality !== 'defensiva') {
    warnings.push('Sem volante de contenção: espaço livre na entrada da área.');
  }
  if (highLineExposure >= 0.55) {
    warnings.push('Linha defensiva alta vulnerável a bolas nas costas e contra-ataques.');
  }
  if (crowdingPenalty >= 2.2) {
    warnings.push('Jogadores muito embolados na mesma faixa reduzem eficiência.');
  }
  if (tactics.passing === 'curto' && (midfieldCount < 3 || compactnessScore < 58)) {
    warnings.push('Passe curto sofre com pouca conexão no meio-campo.');
  }

  const defRating = clamp(
    Math.round(
      72 +
        defenseAdj * 3.4 -
        (leftFlankExposure + rightFlankExposure) * 10 -
        centralExposure * 18 -
        highLineExposure * 6
    ),
    20,
    99
  );
  const midRating = clamp(
    Math.round(68 + midfieldAdj * 4.0 + (compactnessScore - 65) * 0.28),
    20,
    99
  );
  const attRating = clamp(
    Math.round(68 + attackAdj * 3.8 + (widthScore - 65) * 0.16),
    20,
    99
  );
  const riskRating = clamp(
    Math.round(
      (leftFlankExposure * 28 +
        rightFlankExposure * 28 +
        centralExposure * 34 +
        highLineExposure * 22)
    ),
    4,
    99
  );

  return {
    slotInfos,
    cbCount,
    deepFullbackLeft,
    deepFullbackRight,
    wingbackLeftPush,
    wingbackRightPush,
    deepAnchorCount,
    holdingMidCount,
    midfieldCount,
    attackCount,
    defLineY,
    compactnessScore,
    crowdingPenalty,
    widthScore,
    leftFlankExposure,
    rightFlankExposure,
    centralExposure,
    highLineExposure,
    leftThreat,
    centerThreat,
    rightThreat,
    attackAdj,
    midfieldAdj,
    defenseAdj,
    possessionAdj,
    shotVolumeMult,
    fatigueMult,
    ratings: {
      defense: defRating,
      midfield: midRating,
      attack: attRating,
      width: widthScore,
      risk: riskRating,
    },
    strengths: strengths.slice(0, 3),
    warnings: warnings.slice(0, 3),
  };
}

function getClubPaceIndex(club: Club, players: Record<string, Player>): number {
  const attackers = club.starterIds
    .map((id) => players[id])
    .filter((p) => p && (p.position === 'ATA' || p.position === 'PE' || p.position === 'PD'));
  if (attackers.length === 0) return 0;
  const avgPace =
    attackers.reduce((sum, p) => sum + (p.attributes?.pace ?? 74), 0) / attackers.length;
  return clamp((avgPace - 74) / 15, -0.3, 0.8);
}

export function computeTacticalMatchup(
  homeClub: Club,
  awayClub: Club,
  homeSlots: FormationSlot[],
  awaySlots: FormationSlot[],
  players: Record<string, Player>,
  homeMentalityOverride?: ClubTactics['mentality'],
  awayMentalityOverride?: ClubTactics['mentality']
): TacticalMatchupResult {
  const homeTactics = homeMentalityOverride
    ? { ...homeClub.tactics, mentality: homeMentalityOverride }
    : homeClub.tactics;
  const awayTactics = awayMentalityOverride
    ? { ...awayClub.tactics, mentality: awayMentalityOverride }
    : awayClub.tactics;

  const homeAnalysis = analyzeClubTactics(homeSlots, homeTactics);
  const awayAnalysis = analyzeClubTactics(awaySlots, awayTactics);

  const homePace = getClubPaceIndex(homeClub, players);
  const awayPace = getClubPaceIndex(awayClub, players);

  // 1. Flank exploitation: Team A attacks down the flank left exposed behind Team B's wingback
  const homeExploitAwayLeft =
    awayAnalysis.leftFlankExposure * (0.45 + homeAnalysis.rightThreat * 0.72);
  const homeExploitAwayRight =
    awayAnalysis.rightFlankExposure * (0.45 + homeAnalysis.leftThreat * 0.72);
  const homeFlankEdge = homeExploitAwayLeft + homeExploitAwayRight;

  const awayExploitHomeLeft =
    homeAnalysis.leftFlankExposure * (0.45 + awayAnalysis.rightThreat * 0.72);
  const awayExploitHomeRight =
    homeAnalysis.rightFlankExposure * (0.45 + awayAnalysis.leftThreat * 0.72);
  const awayFlankEdge = awayExploitHomeLeft + awayExploitHomeRight;

  // 2. Central gap exploitation (Zone 14 / <2 CBs)
  const homeCentralEdge =
    awayAnalysis.centralExposure * (0.5 + homeAnalysis.centerThreat * 0.65);
  const awayCentralEdge =
    homeAnalysis.centralExposure * (0.5 + awayAnalysis.centerThreat * 0.65);

  // 3. High line vs direct/fast transition exploitation
  const homeDirectMult =
    (homeTactics.passing === 'direto' ? 0.55 : homeTactics.passing === 'misto' ? 0.25 : 0.08) +
    (homeTactics.tempo === 'rapido' ? 0.3 : 0) +
    Math.max(0, homePace) * 0.45;
  const awayDirectMult =
    (awayTactics.passing === 'direto' ? 0.55 : awayTactics.passing === 'misto' ? 0.25 : 0.08) +
    (awayTactics.tempo === 'rapido' ? 0.3 : 0) +
    Math.max(0, awayPace) * 0.45;

  const homeHighLineEdge = awayAnalysis.highLineExposure * homeDirectMult;
  const awayHighLineEdge = homeAnalysis.highLineExposure * awayDirectMult;

  // 4. Short passing under high press without compact midfield
  let homePressTurnover = 0;
  let awayPressTurnover = 0;
  if (
    awayTactics.pressing === 'alta' &&
    homeTactics.passing === 'curto' &&
    (homeAnalysis.midfieldCount < 3 || homeAnalysis.compactnessScore < 62)
  ) {
    awayPressTurnover += 0.45;
  }
  if (
    homeTactics.pressing === 'alta' &&
    awayTactics.passing === 'curto' &&
    (awayAnalysis.midfieldCount < 3 || awayAnalysis.compactnessScore < 62)
  ) {
    homePressTurnover += 0.45;
  }

  const homeTotalEdge = homeFlankEdge + homeCentralEdge + homeHighLineEdge + homePressTurnover;
  const awayTotalEdge = awayFlankEdge + awayCentralEdge + awayHighLineEdge + awayPressTurnover;

  const homeAttackBonus = clamp(homeTotalEdge * 2.3, 0, 5.8);
  const awayAttackBonus = clamp(awayTotalEdge * 2.3, 0, 5.8);
  const homeDefensePenalty = clamp(awayTotalEdge * 1.4, 0, 4.0);
  const awayDefensePenalty = clamp(homeTotalEdge * 1.4, 0, 4.0);

  // Match tempo affects both teams slightly (fast vs slow clash)
  const sharedPaceMult = clamp(
    (homeAnalysis.shotVolumeMult + awayAnalysis.shotVolumeMult) / 2,
    0.85,
    1.2
  );

  const homeShotsMult = clamp(
    sharedPaceMult * (1 + homeTotalEdge * 0.14),
    0.82,
    1.45
  );
  const awayShotsMult = clamp(
    sharedPaceMult * (1 + awayTotalEdge * 0.14),
    0.82,
    1.45
  );

  const homeXGBoost = clamp(homeTotalEdge * 0.24, 0, 0.75);
  const awayXGBoost = clamp(awayTotalEdge * 0.24, 0, 0.75);

  const homeOnTargetAdj =
    (homeTactics.passing === 'curto' ? 0.03 : 0) + clamp(homeTotalEdge * 0.04, 0, 0.12);
  const awayOnTargetAdj =
    (awayTactics.passing === 'curto' ? 0.03 : 0) + clamp(awayTotalEdge * 0.04, 0, 0.12);

  const homePossessionBonus = homeAnalysis.possessionAdj - awayAnalysis.possessionAdj;

  const notes: string[] = [];
  if (homeFlankEdge >= 0.45) {
    notes.push(`${homeClub.shortName} explorou os espaços nas costas das laterais de ${awayClub.shortName}`);
  }
  if (awayFlankEdge >= 0.45) {
    notes.push(`${awayClub.shortName} explorou os espaços nas costas das laterais de ${homeClub.shortName}`);
  }
  if (homeHighLineEdge >= 0.4) {
    notes.push(`${homeClub.shortName} atacou a linha alta adversária em velocidade`);
  }
  if (awayHighLineEdge >= 0.4) {
    notes.push(`${awayClub.shortName} atacou a linha alta adversária em velocidade`);
  }

  return {
    homeAnalysis,
    awayAnalysis,
    homePossessionBonus,
    homeAttackBonus,
    awayAttackBonus,
    homeDefensePenalty,
    awayDefensePenalty,
    homeShotsMult,
    awayShotsMult,
    homeXGBoost,
    awayXGBoost,
    homeOnTargetAdj,
    awayOnTargetAdj,
    homeBigChancesBonus: Math.round(homeTotalEdge * 2.2),
    awayBigChancesBonus: Math.round(awayTotalEdge * 2.2),
    summaryNote: notes[0] || '',
  };
}

function getFormWeightMult(form?: Player['form']): number {
  if (form === 'otima') return 1.24;
  if (form === 'boa') return 1.12;
  if (form === 'ma') return 0.85;
  return 1.0;
}

export function pickTacticalScorer(
  starterIds: string[],
  slots: FormationSlot[],
  players: Record<string, Player>
): Player | undefined {
  const entries = starterIds
    .map((id, idx) => ({ player: players[id], slot: slots[idx], idx }))
    .filter((e): e is { player: Player; slot: FormationSlot; idx: number } => Boolean(e.player));

  if (entries.length === 0) return undefined;

  const weights = entries.map(({ player, slot, idx }) => {
    const info = slot ? getSlotTacticalInfo(slot, idx) : null;
    const effectivePos: Position = info ? info.slot.pos : player.position;

    let base = 0.2;
    if (effectivePos === 'ATA') base = 44;
    else if (effectivePos === 'PE' || effectivePos === 'PD') base = 27;
    else if (effectivePos === 'MEI') base = 22;
    else if (effectivePos === 'MC') base = 11;
    else if (effectivePos === 'VOL') base = 5;
    else if (effectivePos === 'LE' || effectivePos === 'LD') {
      base = info?.isWingback ? 6.5 + info.wingbackPush * 3.5 : 2.5;
    } else if (effectivePos === 'ZAG') {
      base = 3.0;
    }

    // Continuous vertical height boost: dragging an attacker/mid higher increases goal share
    if (info && !info.isGK) {
      const heightFactor = clamp(0.75 + (info.height / 100) * 0.55, 0.72, 1.32);
      base *= heightFactor;
    }

    const compat = slot
      ? getSlotCompatibility(player.position, slot.pos, player.alternatePositions)
      : 0.9;
    const attrMult = computeAttackerGoalWeightMult(player, effectivePos);
    const ovrBoost = Math.max(0.75, 1 + (player.overall - 75) * 0.018);

    return Math.max(0.05, base * compat * attrMult * ovrBoost * getFormWeightMult(player.form));
  });

  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < entries.length; i++) {
    r -= weights[i];
    if (r <= 0) return entries[i].player;
  }
  return entries[entries.length - 1].player;
}

export function pickTacticalAssister(
  starterIds: string[],
  slots: FormationSlot[],
  players: Record<string, Player>,
  scorerId?: string
): Player | undefined {
  const entries = starterIds
    .map((id, idx) => ({ player: players[id], slot: slots[idx], idx }))
    .filter(
      (e): e is { player: Player; slot: FormationSlot; idx: number } =>
        Boolean(e.player) && e.player.id !== scorerId && e.player.position !== 'GOL' && e.idx !== 0
    );

  if (entries.length === 0) return undefined;

  const weights = entries.map(({ player, slot, idx }) => {
    const info = slot ? getSlotTacticalInfo(slot, idx) : null;
    const effectivePos: Position = info ? info.slot.pos : player.position;

    let base = 3;
    if (effectivePos === 'MEI' || effectivePos === 'PE' || effectivePos === 'PD') base = 30;
    else if (effectivePos === 'MC') base = 23;
    else if (effectivePos === 'LE' || effectivePos === 'LD') {
      // Wingbacks pushed up become primary crossers & assist providers!
      base = info?.isWingback ? 22 + info.wingbackPush * 11 : 12;
    } else if (effectivePos === 'ATA') base = 13;
    else if (effectivePos === 'VOL') base = info?.isDeepAnchor ? 8 : 12;
    else if (effectivePos === 'ZAG') base = 2.5;

    if (info && !info.isGK) {
      // Midfielders/wingbacks placed slightly higher create more assists
      const createHeight = clamp(0.8 + (info.height / 100) * 0.42, 0.78, 1.24);
      base *= createHeight;
    }

    const compat = slot
      ? getSlotCompatibility(player.position, slot.pos, player.alternatePositions)
      : 0.9;
    const attrMult = computeCreatorAssistWeightMult(player, effectivePos, info?.isWingback);

    return Math.max(0.1, base * compat * attrMult * getFormWeightMult(player.form));
  });

  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < entries.length; i++) {
    r -= weights[i];
    if (r <= 0) return entries[i].player;
  }
  return entries[0].player;
}
