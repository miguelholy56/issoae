import {
  Club,
  FormationSlot,
  GoalFinishType,
  GoalShotDetail,
  Player,
  Position,
} from '../types/game';

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export const FINISH_TYPE_LABELS: Record<GoalFinishType, string> = {
  DIREITA: 'Pé Direito (Destra)',
  ESQUERDA: 'Pé Esquerdo (Canhota)',
  CABECEIO: 'Cabeceio',
  ACROBACIA: 'Acrobacia / Voleio',
  PENALTI_D: 'Pênalti (Pé Direito)',
  PENALTI_E: 'Pênalti (Pé Esquerdo)',
  FALTA_D: 'Falta Direta (Destra)',
  FALTA_E: 'Falta Direta (Canhota)',
};

export const FINISH_TYPE_SHORT: Record<GoalFinishType, string> = {
  DIREITA: 'Destra',
  ESQUERDA: 'Canhota',
  CABECEIO: 'Cabeceio',
  ACROBACIA: 'Acrobacia',
  PENALTI_D: 'Pênalti D',
  PENALTI_E: 'Pênalti E',
  FALTA_D: 'Falta D',
  FALTA_E: 'Falta E',
};

/**
 * Returns 0 (absent), 1 (normal PlayStyle), or 2 (PlayStyle+).
 */
export function getPlaystyleTier(player: Player | undefined, baseName: string): 0 | 1 | 2 {
  if (!player?.playstyles || player.playstyles.length === 0) return 0;
  const target = baseName.trim().toLowerCase();
  let best: 0 | 1 | 2 = 0;
  for (const raw of player.playstyles) {
    const norm = raw.trim().toLowerCase();
    if (norm === `${target}+` || norm === `${target} +`) return 2;
    if (norm === target) best = Math.max(best, 1) as 0 | 1 | 2;
  }
  return best;
}

export function getAttr(player: Player | undefined, key: keyof NonNullable<Player['attributes']>, fallback = 70): number {
  if (!player) return fallback;
  const val = player.attributes?.[key];
  if (typeof val === 'number' && Number.isFinite(val) && val > 0) return val;
  return player.overall || fallback;
}

/**
 * Bounded scorer weight multiplier driven by granular finishing/long-shot attributes & playstyles.
 * Allows midfielders with high shotPower + longShots + Power Shot/Finesse Shot to be genuine goal threats
 * without inflating match totals or breaking positional hierarchy.
 */
export function computeAttackerGoalWeightMult(player: Player, effectivePos: Position): number {
  const finishing = getAttr(player, 'finishing', getAttr(player, 'shooting', player.overall));
  const shotPower = getAttr(player, 'shotPower', getAttr(player, 'shooting', player.overall));
  const longShots = getAttr(player, 'longShots', getAttr(player, 'shooting', player.overall));
  const heading = getAttr(player, 'headingAccuracy', player.overall - 4);
  const volleys = getAttr(player, 'volleys', finishing);
  const fk = getAttr(player, 'fkAccuracy', 62);
  const penalties = getAttr(player, 'penalties', finishing);

  let mult = 1 + (finishing - 74) * 0.014;

  // Long-range threat gives MC / MEI / VOL / wingers genuine scoring agency
  const isMidOrWide =
    effectivePos === 'MEI' ||
    effectivePos === 'MC' ||
    effectivePos === 'VOL' ||
    effectivePos === 'PE' ||
    effectivePos === 'PD';
  const longCombo = (longShots + shotPower) / 2;

  if (isMidOrWide && longCombo >= 75) {
    mult += clamp((longCombo - 74) * 0.02, 0, 0.34);
  } else if (longCombo >= 80) {
    mult += clamp((longCombo - 78) * 0.01, 0, 0.14);
  }

  const powerShot = getPlaystyleTier(player, 'Power Shot');
  const finesseShot = getPlaystyleTier(player, 'Finesse Shot');
  const lowDriven = getPlaystyleTier(player, 'Low Driven Shot');
  const chipShot = getPlaystyleTier(player, 'Chip Shot');
  const deadBall = getPlaystyleTier(player, 'Dead Ball');
  const precHeader = getPlaystyleTier(player, 'Precision Header');
  const acrobatic = getPlaystyleTier(player, 'Acrobatic');

  if (powerShot > 0) mult += powerShot === 2 ? 0.18 : 0.11;
  if (finesseShot > 0) mult += finesseShot === 2 ? 0.16 : 0.10;
  if (lowDriven > 0) mult += lowDriven === 2 ? 0.13 : 0.08;
  if (chipShot > 0) mult += chipShot === 2 ? 0.09 : 0.05;
  if (deadBall > 0 || fk >= 80) mult += deadBall === 2 ? 0.12 : 0.06;
  if ((precHeader > 0 || heading >= 81) && (effectivePos === 'ATA' || effectivePos === 'ZAG')) {
    mult += precHeader === 2 ? 0.14 : 0.08;
  }
  if (acrobatic > 0 && volleys >= 76) mult += acrobatic === 2 ? 0.09 : 0.05;
  if (penalties >= 82 && (effectivePos === 'ATA' || effectivePos === 'MEI')) {
    mult += 0.06;
  }

  return clamp(mult, 0.68, 1.62);
}

/**
 * Bounded assist weight multiplier driven by vision, crossing, curve & passing playstyles.
 */
export function computeCreatorAssistWeightMult(
  player: Player,
  effectivePos: Position,
  isWingback?: boolean
): number {
  const vision = getAttr(player, 'vision', getAttr(player, 'passing', player.overall));
  const crossing = getAttr(player, 'crossing', getAttr(player, 'passing', player.overall));
  const shortPassing = getAttr(player, 'shortPassing', getAttr(player, 'passing', player.overall));
  const curve = getAttr(player, 'curve', 68);

  const isWide = isWingback || effectivePos === 'PE' || effectivePos === 'PD' || effectivePos === 'LE' || effectivePos === 'LD';
  const corePass = isWide ? crossing * 0.55 + curve * 0.25 + vision * 0.2 : vision * 0.55 + shortPassing * 0.45;

  let mult = 1 + (corePass - 74) * 0.015;

  const incisive = getPlaystyleTier(player, 'Incisive Pass');
  const whipped = getPlaystyleTier(player, 'Whipped Pass');
  const tikiTaka = getPlaystyleTier(player, 'Tiki Taka');
  const pinged = getPlaystyleTier(player, 'Pinged Pass');
  const longBall = getPlaystyleTier(player, 'Long Ball Pass');

  if (incisive > 0) mult += incisive === 2 ? 0.2 : 0.12;
  if (whipped > 0 && isWide) mult += whipped === 2 ? 0.22 : 0.13;
  if (tikiTaka > 0) mult += tikiTaka === 2 ? 0.14 : 0.08;
  if (pinged > 0) mult += pinged === 2 ? 0.11 : 0.06;
  if (longBall > 0) mult += longBall === 2 ? 0.10 : 0.05;

  return clamp(mult, 0.72, 1.56);
}

export interface ClubMatchAttrModifiers {
  attackEdge: number; // [-1.8, +2.3]
  defenseEdge: number; // [-1.8, +2.2]
  gkEdge: number; // [-1.5, +2.1]
  xgLongShotBonus: number; // [0, +0.13]
  onTargetBoost: number; // [-0.02, +0.05]
}

export function computeClubMatchAttrModifiers(
  club: Club,
  players: Record<string, Player>,
  slots: FormationSlot[]
): ClubMatchAttrModifiers {
  let attFinSum = 0;
  let attCount = 0;
  let longShotSpecialists = 0;
  let attPlaystyleBonus = 0;

  let defSum = 0;
  let defCount = 0;
  let defPlaystyleBonus = 0;

  let gkEdge = 0;

  club.starterIds.forEach((pid, idx) => {
    const p = players[pid];
    if (!p) return;
    const slotPos = slots[idx]?.pos || p.position;

    if (idx === 0 || p.position === 'GOL' || slotPos === 'GOL') {
      const ref = getAttr(p, 'gkReflexes', p.overall);
      const pos = getAttr(p, 'gkPositioning', p.overall);
      const div = getAttr(p, 'gkDiving', p.overall);
      const gkAvg = (ref + pos + div) / 3;
      let gkBonus = (gkAvg - 74) * 0.06;
      const farReach = getPlaystyleTier(p, 'Far Reach');
      const deflector = getPlaystyleTier(p, 'Deflector');
      const rushOut = getPlaystyleTier(p, 'Rush Out');
      const footwork = getPlaystyleTier(p, 'Footwork');
      if (farReach > 0) gkBonus += farReach === 2 ? 0.55 : 0.32;
      if (deflector > 0) gkBonus += deflector === 2 ? 0.45 : 0.25;
      if (rushOut > 0) gkBonus += rushOut === 2 ? 0.35 : 0.2;
      if (footwork > 0) gkBonus += footwork === 2 ? 0.35 : 0.2;
      gkEdge = clamp(gkBonus, -1.5, 2.1);
      return;
    }

    if (['ATA', 'PE', 'PD', 'MEI', 'MC'].includes(slotPos)) {
      const fin = getAttr(p, 'finishing', p.overall);
      const comp = getAttr(p, 'composure', p.overall);
      const sp = getAttr(p, 'shotPower', p.overall);
      const ls = getAttr(p, 'longShots', p.overall);
      attFinSum += (fin * 0.45 + comp * 0.25 + sp * 0.15 + ls * 0.15);
      attCount++;

      if ((ls >= 79 && sp >= 78) || getPlaystyleTier(p, 'Power Shot') > 0 || getPlaystyleTier(p, 'Finesse Shot') > 0) {
        longShotSpecialists++;
      }

      if (getPlaystyleTier(p, 'Power Shot') > 0) attPlaystyleBonus += 0.22;
      if (getPlaystyleTier(p, 'Finesse Shot') > 0) attPlaystyleBonus += 0.22;
      if (getPlaystyleTier(p, 'Incisive Pass') > 0) attPlaystyleBonus += 0.18;
      if (getPlaystyleTier(p, 'Whipped Pass') > 0) attPlaystyleBonus += 0.16;
      if (getPlaystyleTier(p, 'Rapid') > 0 || getPlaystyleTier(p, 'Quick Step') > 0) attPlaystyleBonus += 0.12;
    }

    if (['ZAG', 'LE', 'LD', 'VOL'].includes(slotPos)) {
      const inter = getAttr(p, 'interceptions', p.overall);
      const aware = getAttr(p, 'defAwareness', p.overall);
      const tackle = getAttr(p, 'standingTackle', p.overall);
      defSum += (inter + aware + tackle) / 3;
      defCount++;

      if (getPlaystyleTier(p, 'Intercept') > 0) defPlaystyleBonus += 0.22;
      if (getPlaystyleTier(p, 'Anticipate') > 0) defPlaystyleBonus += 0.24;
      if (getPlaystyleTier(p, 'Block') > 0) defPlaystyleBonus += 0.16;
      if (getPlaystyleTier(p, 'Aerial Fortress') > 0) defPlaystyleBonus += 0.16;
    }
  });

  const attAvg = attCount > 0 ? attFinSum / attCount : 74;
  const defAvg = defCount > 0 ? defSum / defCount : 74;

  const attackEdge = clamp((attAvg - 74) * 0.08 + Math.min(1.15, attPlaystyleBonus), -1.8, 2.3);
  const defenseEdge = clamp((defAvg - 74) * 0.08 + Math.min(1.1, defPlaystyleBonus), -1.8, 2.2);
  const xgLongShotBonus = clamp(longShotSpecialists * 0.032, 0, 0.13);
  const onTargetBoost = clamp((attackEdge - gkEdge * 0.35) * 0.015, -0.02, 0.05);

  return { attackEdge, defenseEdge, gkEdge, xgLongShotBonus, onTargetBoost };
}

export function getPlayerStaminaDrainMult(player: Player): number {
  const relentless = getPlaystyleTier(player, 'Relentless');
  const stamina = getAttr(player, 'stamina', 75);
  let mult = 1 - (stamina - 75) * 0.005;
  if (relentless === 2) mult *= 0.78;
  else if (relentless === 1) mult *= 0.86;
  return clamp(mult, 0.74, 1.15);
}

/**
 * Generates realistic shot coordinates, finish type (Destra/Canhota/Cabeceio/Acrobacia/Falta/Pênalti),
 * distance, xG, and active playstyle for a goal event.
 */
export function generateGoalShotDetail(params: {
  scorer?: Player;
  assister?: Player;
  scorerSlot?: FormationSlot;
  assisterSlot?: FormationSlot;
}): GoalShotDetail {
  const { scorer, assister, scorerSlot, assisterSlot } = params;

  const preferredFoot = scorer?.preferredFoot || 'Direito';
  const weakFoot = scorer?.weakFoot ?? 3;
  const shotPower = getAttr(scorer, 'shotPower', getAttr(scorer, 'shooting', scorer?.overall || 74));
  const longShots = getAttr(scorer, 'longShots', getAttr(scorer, 'shooting', scorer?.overall || 74));
  const finishing = getAttr(scorer, 'finishing', getAttr(scorer, 'shooting', scorer?.overall || 74));
  const heading = getAttr(scorer, 'headingAccuracy', 66);
  const jumping = getAttr(scorer, 'jumping', 70);
  const volleys = getAttr(scorer, 'volleys', finishing);
  const fkAcc = getAttr(scorer, 'fkAccuracy', 64);
  const penalties = getAttr(scorer, 'penalties', finishing);

  const hasDeadBall = getPlaystyleTier(scorer, 'Dead Ball') > 0;
  const hasPowerShot = getPlaystyleTier(scorer, 'Power Shot') > 0;
  const hasFinesse = getPlaystyleTier(scorer, 'Finesse Shot') > 0;
  const hasPrecisionHeader = getPlaystyleTier(scorer, 'Precision Header') > 0;
  const hasAcrobatic = getPlaystyleTier(scorer, 'Acrobatic') > 0;
  const hasLowDriven = getPlaystyleTier(scorer, 'Low Driven Shot') > 0;
  const hasChip = getPlaystyleTier(scorer, 'Chip Shot') > 0;
  const hasWhippedAssist = getPlaystyleTier(assister, 'Whipped Pass') > 0;
  const hasIncisiveAssist = getPlaystyleTier(assister, 'Incisive Pass') > 0;

  const scorerPos = scorerSlot?.pos || scorer?.position || 'ATA';
  const assisterPos = assisterSlot?.pos || assister?.position;
  const isWideAssister =
    assisterPos === 'PE' || assisterPos === 'PD' || assisterPos === 'LE' || assisterPos === 'LD';
  const isMidLongShooter =
    scorerPos === 'MC' || scorerPos === 'MEI' || scorerPos === 'VOL' || scorerPos === 'ZAG';

  const pickFootType = (allowWeak = true): 'DIREITA' | 'ESQUERDA' => {
    const weakProb = !allowWeak ? 0.05 : weakFoot >= 5 ? 0.42 : weakFoot === 4 ? 0.3 : weakFoot === 3 ? 0.18 : 0.08;
    const useWeak = Math.random() < weakProb;
    if (preferredFoot === 'Esquerdo') return useWeak ? 'DIREITA' : 'ESQUERDA';
    return useWeak ? 'ESQUERDA' : 'DIREITA';
  };

  let finishType: GoalFinishType;
  let originX = 50;
  let originY = 10;
  let playstyleUsed: string | undefined;
  let isOutsideBox = false;
  let assistOriginX: number | undefined;
  let assistOriginY: number | undefined;

  if (assister) {
    // Realistic assister origin based on slot x/y
    const slotX = assisterSlot?.x ?? (assisterPos === 'PE' || assisterPos === 'LE' ? 14 : assisterPos === 'PD' || assisterPos === 'LD' ? 86 : 50);
    assistOriginX = clamp(slotX + (Math.random() - 0.5) * 14, 6, 94);
    assistOriginY = isWideAssister
      ? clamp(5 + Math.random() * 14, 4, 22)
      : clamp(18 + Math.random() * 20, 14, 40);
  }

  // Decide finish type organically
  const roll = Math.random();
  const penChance = !assister ? (penalties >= 80 ? 0.34 : 0.22) : 0;
  const fkChance = !assister ? clamp(0.10 + (fkAcc >= 78 ? 0.14 : 0) + (hasDeadBall ? 0.14 : 0), 0.10, 0.36) : 0;

  if (!assister && roll < penChance) {
    const primaryLeft = preferredFoot === 'Esquerdo';
    finishType = primaryLeft ? 'PENALTI_E' : 'PENALTI_D';
    originX = 50;
    originY = 11.2;
  } else if (!assister && roll < penChance + fkChance) {
    const primaryLeft = preferredFoot === 'Esquerdo';
    finishType = primaryLeft ? 'FALTA_E' : 'FALTA_D';
    originX = primaryLeft
      ? 46 + Math.random() * 18
      : 36 + Math.random() * 18;
    originY = 19.5 + Math.random() * 8.5; // 20-29m
    isOutsideBox = true;
    if (hasDeadBall) playstyleUsed = 'Dead Ball';
    else if (hasFinesse) playstyleUsed = 'Finesse Shot';
  } else {
    // Open play finish
    const headerChance = clamp(
      (isWideAssister ? 0.26 : 0.10) +
        (hasWhippedAssist ? 0.10 : 0) +
        (heading >= 78 ? 0.10 : 0) +
        (jumping >= 80 ? 0.04 : 0) +
        (hasPrecisionHeader ? 0.12 : 0) +
        (scorerPos === 'ZAG' ? 0.28 : 0),
      0.06,
      0.56
    );
    const acrobaticChance = clamp(
      0.025 + (hasAcrobatic ? 0.085 : 0) + (volleys >= 80 ? 0.035 : 0),
      0.02,
      0.14
    );
    const longShotWeight = clamp(
      (isMidLongShooter ? 0.34 : 0.11) +
        ((longShots - 74) * 0.015) +
        ((shotPower - 74) * 0.01) +
        (hasPowerShot ? 0.18 : 0) +
        (hasFinesse ? 0.10 : 0),
      0.07,
      0.72
    );

    const openRoll = Math.random();
    if (openRoll < headerChance) {
      finishType = 'CABECEIO';
      originX = clamp(42 + Math.random() * 16, 39, 61);
      originY = clamp(4.2 + Math.random() * 7.2, 3.8, 12.2);
      if (hasPrecisionHeader) playstyleUsed = 'Precision Header';
      else if (hasWhippedAssist) playstyleUsed = 'Whipped Pass';
    } else if (openRoll < headerChance + acrobaticChance) {
      finishType = 'ACROBACIA';
      originX = clamp(40 + Math.random() * 20, 38, 62);
      originY = clamp(6.5 + Math.random() * 8.0, 5.5, 15.0);
      if (hasAcrobatic) playstyleUsed = 'Acrobatic';
    } else if (openRoll < headerChance + acrobaticChance + longShotWeight) {
      // Outside the box strike!
      finishType = pickFootType(true);
      isOutsideBox = true;
      const sideBias = scorerSlot ? (scorerSlot.x - 50) * 0.45 : (Math.random() - 0.5) * 28;
      originX = clamp(50 + sideBias + (Math.random() - 0.5) * 18, 24, 76);
      originY = clamp(18.0 + Math.random() * 9.5, 17.6, 29.0);
      if (hasPowerShot) playstyleUsed = 'Power Shot';
      else if (hasFinesse) playstyleUsed = 'Finesse Shot';
      else if (hasIncisiveAssist) playstyleUsed = 'Incisive Pass';
    } else {
      // Inside box foot finish
      finishType = pickFootType(true);
      const slotBias = scorerSlot ? (scorerSlot.x - 50) * 0.32 : 0;
      originX = clamp(50 + slotBias + (Math.random() - 0.5) * 20, 32, 68);
      originY = clamp(4.5 + Math.random() * 11.4, 3.8, 16.2);
      if (hasFinesse && Math.random() < 0.55) playstyleUsed = 'Finesse Shot';
      else if (hasLowDriven && Math.random() < 0.5) playstyleUsed = 'Low Driven Shot';
      else if (hasChip && Math.random() < 0.35) playstyleUsed = 'Chip Shot';
      else if (hasIncisiveAssist) playstyleUsed = 'Incisive Pass';
      else if (hasWhippedAssist && isWideAssister) playstyleUsed = 'Whipped Pass';
    }
  }

  // Realistic goal target inside goal mouth (posts at x=44 and x=56, goal line y=0, back of net y=-2.4)
  const cornerLeft = Math.random() < 0.5;
  const targetX =
    finishType === 'PENALTI_D' || finishType === 'PENALTI_E'
      ? Number((cornerLeft ? 44.5 + Math.random() * 2.1 : 53.4 + Math.random() * 2.1).toFixed(1))
      : Number((cornerLeft ? 44.4 + Math.random() * 3.4 : 52.2 + Math.random() * 3.4).toFixed(1));
  const targetY = Number((-0.4 - Math.random() * 1.8).toFixed(1));

  // Real physical distance in meters (pitch width ~68m -> 0.68m/unit, half-length ~52.5m -> 1.05m/unit)
  const dxM = (originX - targetX) * 0.68;
  const dyM = Math.max(1.5, originY) * 0.96;
  const distanceMeters =
    finishType === 'PENALTI_D' || finishType === 'PENALTI_E'
      ? 11.0
      : Number(Math.hypot(dxM, dyM).toFixed(1));

  // Calibrated shot xG
  let xg = 0.28;
  if (finishType === 'PENALTI_D' || finishType === 'PENALTI_E') {
    xg = 0.78;
  } else if (finishType === 'FALTA_D' || finishType === 'FALTA_E') {
    xg = clamp(0.11 - (distanceMeters - 18) * 0.004 + (fkAcc >= 82 ? 0.03 : 0), 0.04, 0.16);
  } else if (isOutsideBox) {
    xg = clamp(0.11 - (distanceMeters - 18) * 0.005 + (shotPower >= 84 ? 0.02 : 0), 0.03, 0.15);
  } else if (finishType === 'CABECEIO') {
    xg = clamp(0.38 - distanceMeters * 0.014, 0.12, 0.45);
  } else {
    xg = clamp(0.58 - distanceMeters * 0.022 + (finishing >= 84 ? 0.04 : 0), 0.14, 0.72);
  }

  return {
    originX: Number(originX.toFixed(1)),
    originY: Number(originY.toFixed(1)),
    targetX,
    targetY,
    finishType,
    distanceMeters,
    xg: Number(xg.toFixed(2)),
    bodyPartLabel: FINISH_TYPE_LABELS[finishType],
    playstyleUsed,
    assistOriginX: assistOriginX !== undefined ? Number(assistOriginX.toFixed(1)) : undefined,
    assistOriginY: assistOriginY !== undefined ? Number(assistOriginY.toFixed(1)) : undefined,
    isOutsideBox,
  };
}

export function describeShotSuffix(detail?: GoalShotDetail): string {
  if (!detail) return '';
  if (detail.finishType === 'FALTA_D' || detail.finishType === 'FALTA_E') return ' (falta)';
  if (detail.finishType === 'PENALTI_D' || detail.finishType === 'PENALTI_E') return ' (pênalti)';
  if (detail.finishType === 'CABECEIO') return ' (cabeceio)';
  if (detail.finishType === 'ACROBACIA') return ' (acrobacia)';
  if (detail.isOutsideBox) return ' (fora da área)';
  return '';
}
