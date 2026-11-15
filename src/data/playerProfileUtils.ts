import { Player, PlayerAttributes, Position } from '../types/game';
import { getSlotCompatibility } from './formations';

export interface PitchZoneScore {
  pos: Position;
  label: string;
  fullName: string;
  x: number;
  y: number;
  score: number; // 0..100
  status: 'natural' | 'alternativa' | 'adaptavel' | 'inadequada';
  reason: string;
}

const PITCH_ZONES: { pos: Position; label: string; fullName: string; x: number; y: number }[] = [
  { pos: 'ATA', label: 'ATA', fullName: 'Centroavante', x: 50, y: 15 },
  { pos: 'PE', label: 'PE', fullName: 'Ponta / Meia Esquerda', x: 18, y: 24 },
  { pos: 'PD', label: 'PD', fullName: 'Ponta / Meia Direita', x: 82, y: 24 },
  { pos: 'MEI', label: 'MEI', fullName: 'Meia Armador', x: 50, y: 35 },
  { pos: 'MC', label: 'MC', fullName: 'Meio-Campista Central', x: 50, y: 50 },
  { pos: 'VOL', label: 'VOL', fullName: 'Volante / Primeiro Homem', x: 50, y: 63 },
  { pos: 'LE', label: 'LE', fullName: 'Lateral Esquerdo', x: 17, y: 72 },
  { pos: 'LD', label: 'LD', fullName: 'Lateral Direito', x: 83, y: 72 },
  { pos: 'ZAG', label: 'ZAG', fullName: 'Zagueiro Central', x: 50, y: 77 },
  { pos: 'GOL', label: 'GOL', fullName: 'Goleiro', x: 50, y: 91 },
];

const PLAYSTYLE_PT: Record<string, string> = {
  'Finesse Shot': 'Chute Colocado',
  'Power Shot': 'Chute Potente',
  'Chip Shot': 'Cavadinha',
  'Low Driven Shot': 'Chute Rasteiro',
  'Dead Ball': 'Bola Parada',
  'Precision Header': 'Cabeceio Preciso',
  'Acrobatic': 'Acrobático',
  'Gamechanger': 'Decisivo',
  'Incisive Pass': 'Passe Incisivo',
  'Pinged Pass': 'Passe Firme',
  'Long Ball Pass': 'Lançamento Longo',
  'Tiki Taka': 'Tiki-Taka',
  'Whipped Pass': 'Cruzamento Preciso',
  'Inventive': 'Passe Criativo',
  'Technical': 'Drible Técnico',
  'Rapid': 'Corrida Rápida',
  'Quick Step': 'Arrancada Explosiva',
  'First Touch': 'Domínio de Primeira',
  'Trickster': 'Habilidoso',
  'Press Proven': 'Resistente à Pressão',
  'Relentless': 'Incansável',
  'Jockey': 'Cercar',
  'Block': 'Bloqueio',
  'Intercept': 'Interceptação',
  'Anticipate': 'Antecipação',
  'Slide Tackle': 'Carrinho Limpo',
  'Aerial Fortress': 'Fortaleza Aérea',
  'Bruiser': 'Imposição Física',
  'Enforcer': 'Combativo',
  'Long Throw': 'Lateral Longo',
  'Far Throw': 'Arremesso Longo',
  'Far Reach': 'Alcance Longo',
  'Rush Out': 'Saída Rápida',
  'Deflector': 'Espalmada Segura',
  'Footwork': 'Jogo de Pés',
  'Cross Claimer': 'Domínio Aéreo',
};

export function formatPlaystylePt(raw: string): { label: string; rawName: string; isPlus: boolean } {
  const trimmed = raw.trim();
  const isPlus = trimmed.endsWith('+');
  const base = isPlus ? trimmed.slice(0, -1).trim() : trimmed;
  const translated = PLAYSTYLE_PT[base] || base;
  return {
    label: isPlus ? `${translated}+` : translated,
    rawName: trimmed,
    isPlus,
  };
}

function clampAttr(v: number): number {
  return Math.max(30, Math.min(99, Math.round(v)));
}

export function resolvePlayerAttributes(p: Player): PlayerAttributes {
  if (p.attributes) return p.attributes;
  const ovr = p.overall;
  const pos = p.position;

  if (pos === 'GOL') {
    return {
      pace: clampAttr(ovr - 2),
      shooting: clampAttr(ovr - 4),
      passing: clampAttr(ovr - 12),
      dribbling: clampAttr(ovr - 1),
      defending: clampAttr(ovr - 38),
      physicality: clampAttr(ovr - 4),
      gkDiving: clampAttr(ovr),
      gkHandling: clampAttr(ovr - 2),
      gkKicking: clampAttr(ovr - 6),
      gkPositioning: clampAttr(ovr - 1),
      gkReflexes: clampAttr(ovr + 1),
    };
  }

  const isAtt = pos === 'ATA' || pos === 'PE' || pos === 'PD';
  const isWing = pos === 'PE' || pos === 'PD' || pos === 'LE' || pos === 'LD';
  const isMid = pos === 'MEI' || pos === 'MC' || pos === 'VOL';
  const isDef = pos === 'ZAG' || pos === 'LE' || pos === 'LD' || pos === 'VOL';

  return {
    pace: clampAttr(ovr + (isWing ? 6 : isAtt ? 3 : pos === 'ZAG' ? -7 : -1)),
    shooting: clampAttr(ovr + (pos === 'ATA' ? 3 : isAtt ? -1 : isMid ? -8 : -28)),
    passing: clampAttr(ovr + (pos === 'MEI' || pos === 'MC' ? 3 : isWing ? -1 : pos === 'ZAG' ? -14 : -5)),
    dribbling: clampAttr(ovr + (isAtt || pos === 'MEI' ? 2 : isMid ? -1 : -15)),
    defending: clampAttr(ovr + (isDef ? 2 : pos === 'MC' ? -8 : -36)),
    physicality: clampAttr(ovr + (pos === 'ZAG' || pos === 'VOL' ? 4 : -4)),
  };
}

export function computePitchEffectivenessMap(p: Player): PitchZoneScore[] {
  const attrs = resolvePlayerAttributes(p);
  const altSet = new Set(p.alternatePositions || []);

  return PITCH_ZONES.map((z) => {
    if (z.pos === p.position) {
      return {
        ...z,
        score: 100,
        status: 'natural',
        reason: `Posição natural do atleta (${p.overall} OVR pleno).`,
      };
    }

    if (altSet.has(z.pos)) {
      return {
        ...z,
        score: 94,
        status: 'alternativa',
        reason: `Posição secundária nativa cadastrada no perfil.`,
      };
    }

    if (p.position === 'GOL' || z.pos === 'GOL') {
      return {
        ...z,
        score: 24,
        status: 'inadequada',
        reason: `Função específica de goleiro sem adaptação para linha.`,
      };
    }

    const baseCompat = getSlotCompatibility(p.position, z.pos, p.alternatePositions);
    let attrBoost = 0;

    if (z.pos === 'PE' || z.pos === 'PD') {
      attrBoost = ((attrs.pace - 72) * 0.25 + (attrs.dribbling - 72) * 0.25 + (attrs.passing - 70) * 0.15) * 0.45;
    } else if (z.pos === 'ATA') {
      attrBoost = ((attrs.shooting - 72) * 0.35 + (attrs.pace - 70) * 0.2) * 0.45;
    } else if (z.pos === 'MEI') {
      attrBoost = ((attrs.passing - 72) * 0.3 + (attrs.dribbling - 72) * 0.25) * 0.45;
    } else if (z.pos === 'MC') {
      attrBoost = ((attrs.passing - 72) * 0.25 + (attrs.defending - 65) * 0.15 + (attrs.physicality - 70) * 0.1) * 0.4;
    } else if (z.pos === 'VOL') {
      attrBoost = ((attrs.defending - 70) * 0.3 + (attrs.physicality - 70) * 0.2 + (attrs.passing - 68) * 0.15) * 0.4;
    } else if (z.pos === 'LE' || z.pos === 'LD') {
      attrBoost = ((attrs.pace - 72) * 0.25 + (attrs.defending - 68) * 0.25) * 0.4;
    } else if (z.pos === 'ZAG') {
      attrBoost = ((attrs.defending - 70) * 0.35 + (attrs.physicality - 70) * 0.25) * 0.4;
    }

    // Penalize cross-flank penalty slightly if single-footed opposite flank unless weakFoot >= 4
    const weakFootBonus = (p.weakFoot || 3) >= 4 ? 2 : 0;
    const raw = Math.round(baseCompat * 90 + attrBoost + weakFootBonus);
    const score = Math.max(38, Math.min(91, raw));

    const status: PitchZoneScore['status'] =
      score >= 82 ? 'adaptavel' : score >= 68 ? 'adaptavel' : 'inadequada';

    const reason =
      score >= 82
        ? `Alta adaptação tática pelos atributos compatíveis no setor.`
        : score >= 68
          ? `Pode atuar improvisado com leve queda de rendimento.`
          : `Setor distante das características naturais do atleta.`;

    return {
      ...z,
      score,
      status,
      reason,
    };
  });
}
