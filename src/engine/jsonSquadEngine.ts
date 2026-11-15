import { autoPickLineup, getActiveSlots, normalizePosition } from '../data/formations';
import { LEAGUES_META, normalizeLeagueId } from '../data/leaguesMeta';
import {
  Club,
  GameState,
  LeagueId,
  Player,
  Position,
  RawDataset,
  RawDatasetClub,
  RawDatasetPlayer,
} from '../types/game';
import { buildClubMetadataFromPlayers, estimateValue, estimateWage } from './dataLoader';
import { cloneState } from './seasonEngine';

export type JsonApplyMode = 'MERGE' | 'REPLACE';

export interface JsonUpdatePreview {
  totalIncoming: number;
  updatedCount: number;
  transferredCount: number;
  addedCount: number;
  removedCount: number;
  affectedClubNames: string[];
  unresolvedClubNames: string[];
  changes: string[];
}

interface ClubRef {
  id: string;
  name: string;
  leagueId: LeagueId;
}

const CLUB_ALIASES: Record<string, string> = {
  psg: 'paris-saint-germain-psg',
  'paris saint germain': 'paris-saint-germain-psg',
  'paris saint-germain': 'paris-saint-germain-psg',
  'paris sg': 'paris-saint-germain-psg',
  inter: 'inter-milan',
  'inter milan': 'inter-milan',
  'inter de milao': 'inter-milan',
  internazionale: 'inter-milan',
  'lombardia fc': 'inter-milan',
  milan: 'ac-milan',
  'ac milan': 'ac-milan',
  'milano fc': 'ac-milan',
  atalanta: 'atalanta',
  'bergamo calcio': 'atalanta',
  'man united': 'manchester-united',
  'man utd': 'manchester-united',
  'manchester united': 'manchester-united',
  'man city': 'manchester-city',
  'manchester city': 'manchester-city',
  tottenham: 'tottenham-hotspur',
  spurs: 'tottenham-hotspur',
  'tottenham hotspur': 'tottenham-hotspur',
  bayern: 'bayern-munich',
  'bayern munich': 'bayern-munich',
  'bayern munchen': 'bayern-munich',
  'fc bayern munchen': 'bayern-munich',
  barcelona: 'fc-barcelona',
  barca: 'fc-barcelona',
  'fc barcelona': 'fc-barcelona',
  atletico: 'atletico-madrid',
  'atletico madrid': 'atletico-madrid',
  'atletico de madrid': 'atletico-madrid',
  liverpool: 'liverpool-fc',
  dortmund: 'borussia-dortmund',
  'borussia dortmund': 'borussia-dortmund',
  leverkusen: 'bayer-leverkusen',
  'bayer leverkusen': 'bayer-leverkusen',
  'athletic bilbao': 'athletic-club-bilbao',
  'athletic club': 'athletic-club-bilbao',
  benfica: 'sl-benfica',
  porto: 'fc-porto',
  sporting: 'sporting-cp',
  psv: 'psv-eindhoven',
  az: 'az-alkmaar',
  lyon: 'olympique-lyonnais',
  marseille: 'olympique-de-marseille-om',
  lille: 'losc-lille',
  monaco: 'as-monaco',
  nice: 'ogc-nice',
  lens: 'rc-lens',
  betis: 'real-betis-balompie',
  'real betis': 'real-betis-balompie',
  sevilla: 'sevilla-fc',
  valencia: 'valencia-cf',
  villarreal: 'villarreal-cf',
  espanyol: 'rcd-espanyol-barcelona',
  braga: 'sc-braga',
  como: 'como-1907',
  newcastle: 'newcastle-united',
  'west ham': 'west-ham-united',
  'aston villa': 'aston-villa',
  nottingham: 'nottingham-forest',
  'nottingham forest': 'nottingham-forest',
  brighton: 'brighton-and-hove-albion',
  wolves: 'wolverhampton-wanderers',
  wolverhampton: 'wolverhampton-wanderers',
  bournemouth: 'afc-bournemouth',
  koln: '1-fc-koln',
  gladbach: 'borussia-monchengladbach',
};

function normText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripClubPrefix(s: string): string {
  return normText(s)
    .replace(/^(fc|cf|sc|ac|as|ssc|rc|rcd|afc|ud|cd|sd|ca|sv|vfb|vfl|tsg|rb|sl|ogc|losc|1 fc|1 fsv)\s+/i, '')
    .replace(/\s+(fc|cf|sc|ac|cp|om|psg)$/i, '')
    .trim();
}

export function resolveClubFromRefs(
  rawClubId: string,
  rawClubName: string | undefined,
  clubs: ClubRef[]
): ClubRef | null {
  const byId = new Map(clubs.map((c) => [c.id.toLowerCase(), c]));
  const slugCandidate = rawClubId.toLowerCase().trim();
  if (byId.has(slugCandidate)) return byId.get(slugCandidate)!;

  const candidates = [rawClubName || '', rawClubId.replace(/-/g, ' ')].filter(Boolean);
  for (const cand of candidates) {
    const n = normText(cand);
    const aliasId = CLUB_ALIASES[n];
    if (aliasId && byId.has(aliasId)) return byId.get(aliasId)!;
  }

  for (const cand of candidates) {
    const n = normText(cand);
    const stripped = stripClubPrefix(cand);
    const exact = clubs.find((c) => normText(c.name) === n);
    if (exact) return exact;
    if (stripped.length >= 3) {
      const strippedMatch = clubs.find((c) => stripClubPrefix(c.name) === stripped);
      if (strippedMatch) return strippedMatch;
    }
  }

  // Unique substring match
  for (const cand of candidates) {
    const n = normText(cand);
    if (n.length < 4) continue;
    const matches = clubs.filter(
      (c) => normText(c.name).includes(n) || c.id.replace(/-/g, ' ').includes(n)
    );
    if (matches.length === 1) return matches[0];
  }

  return null;
}

function buildDatasetClubRefs(ds: RawDataset): ClubRef[] {
  const map = new Map<string, ClubRef>();
  for (const c of ds.clubs || []) {
    map.set(c.id, { id: c.id, name: c.name, leagueId: c.leagueId });
  }
  for (const p of ds.players) {
    if (!map.has(p.clubId)) {
      map.set(p.clubId, {
        id: p.clubId,
        name: p.clubName || p.clubId,
        leagueId: normalizeLeagueId(p.leagueId || p.league) || 'premier-league',
      });
    }
  }
  return Array.from(map.values());
}

function buildStateClubRefs(state: GameState): ClubRef[] {
  return Object.values(state.clubs).map((c) => ({
    id: c.id,
    name: c.name,
    leagueId: c.leagueId,
  }));
}

interface MatchablePlayer {
  id?: string;
  name: string;
  clubId: string;
  overall: number;
}

function findMatchingPlayer<T extends MatchablePlayer>(
  inc: RawDatasetPlayer,
  resolvedClubId: string,
  allPlayers: T[],
  byId: Map<string, T>,
  byNormName: Map<string, T[]>
): T | null {
  const hasExplicitId = inc.providedFields?.includes('id');
  if (hasExplicitId && inc.id && byId.has(inc.id)) {
    return byId.get(inc.id)!;
  }

  const nName = normText(inc.name);
  const candidates = byNormName.get(nName) || [];
  if (candidates.length === 1) return candidates[0];
  if (candidates.length > 1) {
    const sameClub = candidates.find((p) => p.clubId === resolvedClubId);
    if (sameClub) return sameClub;
    return [...candidates].sort((a, b) => b.overall - a.overall)[0];
  }

  // Fallback loose match if player name is unique substring (e.g. "Mbappe" vs "Kylian Mbappe")
  if (nName.length >= 6) {
    const loose = allPlayers.filter(
      (p) => normText(p.name).includes(nName) || nName.includes(normText(p.name))
    );
    if (loose.length === 1) return loose[0];
    if (loose.length > 1) {
      const sameClub = loose.find((p) => p.clubId === resolvedClubId);
      if (sameClub) return sameClub;
    }
  }

  return null;
}

export function previewJsonSquadUpdate(
  incoming: RawDataset,
  target: { kind: 'DATASET'; dataset: RawDataset } | { kind: 'STATE'; state: GameState },
  mode: JsonApplyMode,
  replaceClubSquads: boolean
): JsonUpdatePreview {
  const clubs =
    target.kind === 'DATASET'
      ? buildDatasetClubRefs(target.dataset)
      : buildStateClubRefs(target.state);

  const clubNameMap = new Map(clubs.map((c) => [c.id, c.name]));

  if (mode === 'REPLACE' && target.kind === 'DATASET') {
    const incClubs = buildDatasetClubRefs(incoming);
    return {
      totalIncoming: incoming.players.length,
      updatedCount: 0,
      transferredCount: 0,
      addedCount: incoming.players.length,
      removedCount: target.dataset.players.length,
      affectedClubNames: incClubs.slice(0, 8).map((c) => c.name),
      unresolvedClubNames: [],
      changes: [
        `Substituição completa: ${incoming.players.length.toLocaleString('pt-BR')} atletas em ${incClubs.length} clubes substituirão a base atual.`,
      ],
    };
  }

  const existingList: MatchablePlayer[] =
    target.kind === 'DATASET'
      ? target.dataset.players
      : Object.values(target.state.players);

  const byId = new Map<string, MatchablePlayer>();
  const byNormName = new Map<string, MatchablePlayer[]>();
  for (const p of existingList) {
    if (p.id) byId.set(p.id, p);
    const n = normText(p.name);
    const arr = byNormName.get(n) || [];
    arr.push(p);
    byNormName.set(n, arr);
  }

  let updatedCount = 0;
  let transferredCount = 0;
  let addedCount = 0;
  let removedCount = 0;
  const affectedClubs = new Set<string>();
  const unresolved = new Set<string>();
  const changes: string[] = [];
  const keptIdsByClub = new Map<string, Set<string>>();

  for (const inc of incoming.players) {
    const hasClubProvided = !inc.providedFields || inc.providedFields.includes('club');
    const resolvedClub = hasClubProvided
      ? resolveClubFromRefs(inc.clubId, inc.clubName, clubs)
      : null;

    if (hasClubProvided && !resolvedClub && (inc.clubName || inc.clubId)) {
      unresolved.add(inc.clubName || inc.clubId);
    }

    const tempClubId = resolvedClub?.id || inc.clubId;
    const match = findMatchingPlayer(inc, tempClubId, existingList, byId, byNormName);

    if (match) {
      const finalClubId = hasClubProvided ? resolvedClub?.id || inc.clubId : match.clubId;
      const finalClubName = clubNameMap.get(finalClubId) || inc.clubName || finalClubId;
      const movedClub = hasClubProvided && finalClubId !== match.clubId;
      const hasOvrChange =
        (!inc.providedFields || inc.providedFields.includes('overall')) &&
        inc.overall !== match.overall;

      if (movedClub) {
        transferredCount++;
        const oldName = clubNameMap.get(match.clubId) || match.clubId;
        affectedClubs.add(oldName);
        affectedClubs.add(finalClubName);
        if (changes.length < 12) {
          changes.push(`${match.name}: ${oldName} → ${finalClubName}`);
        }
      } else {
        updatedCount++;
        affectedClubs.add(finalClubName);
        if (changes.length < 12 && hasOvrChange) {
          changes.push(`${match.name}: OVR ${match.overall} → ${inc.overall} (${finalClubName})`);
        }
      }

      if (!keptIdsByClub.has(finalClubId)) keptIdsByClub.set(finalClubId, new Set());
      keptIdsByClub.get(finalClubId)!.add(match.id || match.name);
    } else {
      addedCount++;
      const finalClubId = resolvedClub?.id || inc.clubId;
      const finalClubName = clubNameMap.get(finalClubId) || inc.clubName || finalClubId;
      affectedClubs.add(finalClubName);
      if (changes.length < 12) {
        changes.push(`+ ${inc.name} (${normalizePosition(inc.position)}, ${inc.overall} OVR) → ${finalClubName}`);
      }
      if (!keptIdsByClub.has(finalClubId)) keptIdsByClub.set(finalClubId, new Set());
      keptIdsByClub.get(finalClubId)!.add(inc.id || inc.name);
    }
  }

  if (replaceClubSquads) {
    for (const [cid, kept] of keptIdsByClub.entries()) {
      for (const p of existingList) {
        if (p.clubId === cid && !kept.has(p.id || p.name)) {
          removedCount++;
          if (changes.length < 12) {
            changes.push(`- ${p.name} removido de ${clubNameMap.get(cid) || cid}`);
          }
        }
      }
    }
  }

  return {
    totalIncoming: incoming.players.length,
    updatedCount,
    transferredCount,
    addedCount,
    removedCount,
    affectedClubNames: Array.from(affectedClubs),
    unresolvedClubNames: Array.from(unresolved),
    changes,
  };
}

export function applyJsonPatchToRawDataset(
  incoming: RawDataset,
  baseDataset: RawDataset,
  mode: JsonApplyMode,
  replaceClubSquads: boolean
): { dataset: RawDataset; preview: JsonUpdatePreview } {
  const preview = previewJsonSquadUpdate(
    incoming,
    { kind: 'DATASET', dataset: baseDataset },
    mode,
    replaceClubSquads
  );

  if (mode === 'REPLACE') {
    const cleanedPlayers = incoming.players.map(({ providedFields: _pf, ...rest }) => rest);
    return {
      dataset: {
        clubs:
          incoming.clubs && incoming.clubs.length > 0
            ? incoming.clubs
            : buildClubMetadataFromPlayers(cleanedPlayers),
        players: cleanedPlayers,
      },
      preview,
    };
  }

  const clubs = buildDatasetClubRefs(baseDataset);
  const clubMetaMap = new Map<string, RawDatasetClub>(
    (baseDataset.clubs || []).map((c) => [c.id, { ...c }])
  );
  const nextPlayers: RawDatasetPlayer[] = baseDataset.players.map((p, idx) => ({
    ...p,
    id: p.id || `pl_${idx + 1}`,
  }));
  const byId = new Map<string, RawDatasetPlayer>();
  const byNormName = new Map<string, RawDatasetPlayer[]>();

  for (const p of nextPlayers) {
    if (p.id) byId.set(p.id, p);
    const n = normText(p.name);
    const arr = byNormName.get(n) || [];
    arr.push(p);
    byNormName.set(n, arr);
  }

  const touchedClubIds = new Set<string>();
  const keptIdsByClub = new Map<string, Set<string>>();

  for (const inc of incoming.players) {
    const provided = new Set(inc.providedFields || []);
    const hasField = (f: string) => provided.size === 0 || provided.has(f);

    const resolvedClub = hasField('club')
      ? resolveClubFromRefs(inc.clubId, inc.clubName, clubs)
      : null;

    const targetClubId = resolvedClub?.id || inc.clubId;
    const match = findMatchingPlayer<RawDatasetPlayer>(inc, targetClubId, nextPlayers, byId, byNormName);

    if (match) {
      const finalClubId = hasField('club') ? resolvedClub?.id || inc.clubId : match.clubId;
      const finalClubObj = resolvedClub || clubMetaMap.get(finalClubId);
      if (hasField('club')) {
        match.clubId = finalClubId;
        match.clubName = finalClubObj?.name || inc.clubName || finalClubId;
        if (finalClubObj?.leagueId) match.leagueId = finalClubObj.leagueId;
      }
      if (hasField('name')) match.name = inc.name;
      if (hasField('nationality')) match.nationality = inc.nationality;
      if (hasField('age')) match.age = inc.age;
      if (hasField('position')) match.position = inc.position;
      if (hasField('alternatePositions')) match.alternatePositions = inc.alternatePositions;
      if (hasField('preferredFoot')) match.preferredFoot = inc.preferredFoot;
      if (hasField('skillMoves')) match.skillMoves = inc.skillMoves;
      if (hasField('weakFoot')) match.weakFoot = inc.weakFoot;
      if (hasField('playstyles')) match.playstyles = inc.playstyles;
      if (hasField('attributes')) match.attributes = inc.attributes;
      if (hasField('overall')) {
        match.overall = inc.overall;
        if (match.potential < inc.overall) match.potential = inc.overall;
      }
      if (hasField('potential')) match.potential = Math.max(match.overall, inc.potential);
      if (hasField('value')) match.value = inc.value;
      if (hasField('wage')) match.wage = inc.wage;
      if (hasField('league') && inc.leagueId) match.leagueId = inc.leagueId;

      touchedClubIds.add(finalClubId);
      if (!keptIdsByClub.has(finalClubId)) keptIdsByClub.set(finalClubId, new Set());
      keptIdsByClub.get(finalClubId)!.add(match.id || match.name);
    } else {
      const finalClubId = resolvedClub?.id || inc.clubId;
      const finalClubObj = resolvedClub || clubMetaMap.get(finalClubId);
      const rawIncId = inc.id || `json_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const uniqueId = byId.has(rawIncId)
        ? `${rawIncId}_${Math.random().toString(36).slice(2, 6)}`
        : rawIncId;
      const { providedFields: _pf, ...clean } = inc;
      const created: RawDatasetPlayer = {
        ...clean,
        id: uniqueId,
        clubId: finalClubId,
        clubName: finalClubObj?.name || inc.clubName || finalClubId,
        leagueId: finalClubObj?.leagueId || inc.leagueId || 'premier-league',
      };
      nextPlayers.push(created);
      byId.set(uniqueId, created);
      touchedClubIds.add(finalClubId);
      if (!keptIdsByClub.has(finalClubId)) keptIdsByClub.set(finalClubId, new Set());
      keptIdsByClub.get(finalClubId)!.add(uniqueId);
    }
  }

  let finalPlayers = nextPlayers;
  if (replaceClubSquads) {
    finalPlayers = nextPlayers.filter((p) => {
      if (!touchedClubIds.has(p.clubId)) return true;
      return keptIdsByClub.get(p.clubId)?.has(p.id || p.name) ?? true;
    });
  }

  const rebuiltClubs = buildClubMetadataFromPlayers(finalPlayers).map((c) => {
    const old = clubMetaMap.get(c.id);
    return old
      ? {
          ...old,
          reputation: c.reputation,
        }
      : c;
  });

  return {
    dataset: {
      clubs: rebuiltClubs,
      players: finalPlayers,
    },
    preview,
  };
}

export function applyJsonPatchToGameState(
  incoming: RawDataset,
  state: GameState,
  replaceClubSquads: boolean
): { state: GameState; preview: JsonUpdatePreview } {
  const preview = previewJsonSquadUpdate(
    incoming,
    { kind: 'STATE', state },
    'MERGE',
    replaceClubSquads
  );

  const draft = cloneState(state);
  const clubs = buildStateClubRefs(draft);

  const byId = new Map<string, Player>();
  const byNormName = new Map<string, Player[]>();
  const allPlayers = Object.values(draft.players);

  for (const p of allPlayers) {
    byId.set(p.id, p);
    const n = normText(p.name);
    const arr = byNormName.get(n) || [];
    arr.push(p);
    byNormName.set(n, arr);
  }

  const affectedClubIds = new Set<string>();
  const keptIdsByClub = new Map<string, Set<string>>();

  const ensureClubExists = (clubId: string, clubName: string, leagueHint?: string): Club => {
    if (draft.clubs[clubId]) return draft.clubs[clubId];
    const lid = normalizeLeagueId(leagueHint) || 'premier-league';
    const meta = LEAGUES_META.find((l) => l.id === lid) || LEAGUES_META[0];
    const newClub: Club = {
      id: clubId,
      name: clubName || clubId,
      shortName: (clubName || clubId).replace(/[^a-zA-Z0-9]/g, '').slice(0, 3).toUpperCase() || 'CLB',
      leagueId: meta.id,
      division: meta.division,
      country: meta.country,
      primaryColor: '#10B981',
      secondaryColor: '#FFFFFF',
      budget: meta.division === 1 ? 30000000 : 8000000,
      reputation: 74,
      autoRotate: true,
      tactics: {
        formationId: '4-3-3',
        mentality: 'equilibrada',
        passing: 'misto',
        pressing: 'media',
        tempo: 'normal',
      },
      starterIds: [],
      benchIds: [],
    };
    draft.clubs[clubId] = newClub;
    return newClub;
  };

  for (const inc of incoming.players) {
    const provided = new Set(inc.providedFields || []);
    const hasField = (f: string) => provided.size === 0 || provided.has(f);

    const resolvedClub = hasField('club')
      ? resolveClubFromRefs(inc.clubId, inc.clubName, clubs)
      : null;

    const candidateClubId = resolvedClub?.id || inc.clubId;
    const match = findMatchingPlayer(inc, candidateClubId, Object.values(draft.players), byId, byNormName);

    if (match) {
      const targetClubId = hasField('club') ? candidateClubId : match.clubId;
      if (hasField('club')) {
        ensureClubExists(targetClubId, resolvedClub?.name || inc.clubName || targetClubId, inc.leagueId || inc.league);
      }

      if (hasField('club') && targetClubId !== match.clubId) {
        const oldClub = draft.clubs[match.clubId];
        if (oldClub) {
          oldClub.starterIds = oldClub.starterIds.filter((id) => id !== match.id);
          oldClub.benchIds = oldClub.benchIds.filter((id) => id !== match.id);
          affectedClubIds.add(oldClub.id);
        }
        draft.offers = draft.offers.filter((o) => o.playerId !== match.id);
        draft.transferHistory.unshift({
          id: `tr_json_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          playerId: match.id,
          playerName: match.name,
          fromClubId: match.clubId,
          toClubId: targetClubId,
          amount: match.value,
          season: draft.season,
          phase: draft.phase,
          reason: 'Atualização rápida via JSON',
        });
        match.clubId = targetClubId;
        match.transferListed = false;
        match.askingPrice = undefined;
      }

      if (hasField('name')) match.name = inc.name;
      if (hasField('nationality')) match.nationality = inc.nationality;
      if (hasField('age')) match.age = Math.max(16, Math.min(44, Math.round(inc.age)));
      if (hasField('position')) match.position = normalizePosition(inc.position);
      if (hasField('alternatePositions')) {
        const alts = (inc.alternatePositions || [])
          .map((a) => normalizePosition(a))
          .filter((p) => p !== match.position);
        match.alternatePositions = alts.length > 0 ? Array.from(new Set(alts)) : undefined;
      }
      if (hasField('preferredFoot') && inc.preferredFoot) match.preferredFoot = inc.preferredFoot;
      if (hasField('skillMoves') && inc.skillMoves) match.skillMoves = inc.skillMoves;
      if (hasField('weakFoot') && inc.weakFoot) match.weakFoot = inc.weakFoot;
      if (hasField('playstyles')) match.playstyles = inc.playstyles;
      if (hasField('attributes') && inc.attributes) match.attributes = inc.attributes;
      if (hasField('overall')) {
        const ovr = Math.max(50, Math.min(97, Math.round(inc.overall)));
        match.stats.ovrDelta += ovr - match.overall;
        match.overall = ovr;
        if (match.potential < ovr) match.potential = ovr;
        if (!hasField('value')) match.value = estimateValue(match.overall, match.potential, match.age);
        if (!hasField('wage')) match.wage = estimateWage(match.overall);
      }
      if (hasField('potential')) {
        match.potential = Math.max(match.overall, Math.min(99, Math.round(inc.potential)));
      }
      if (hasField('value') && inc.value) match.value = inc.value;
      if (hasField('wage') && inc.wage) match.wage = inc.wage;

      affectedClubIds.add(match.clubId);
      if (!keptIdsByClub.has(match.clubId)) keptIdsByClub.set(match.clubId, new Set());
      keptIdsByClub.get(match.clubId)!.add(match.id);
    } else {
      const targetClubId = candidateClubId;
      ensureClubExists(targetClubId, resolvedClub?.name || inc.clubName || targetClubId, inc.leagueId || inc.league);
      const pos: Position = normalizePosition(inc.position);
      const ovr = Math.max(50, Math.min(97, Math.round(inc.overall || 72)));
      const pot = Math.max(ovr, Math.min(99, Math.round(inc.potential || Math.max(ovr, ovr + 4))));
      const age = Math.max(16, Math.min(43, Math.round(inc.age || 22)));
      const rawIncId = inc.id || `json_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const uniqueId = draft.players[rawIncId]
        ? `json_${rawIncId}_${Math.random().toString(36).slice(2, 6)}`
        : rawIncId.startsWith('pl_')
          ? `json_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
          : rawIncId;

      const alts = (inc.alternatePositions || [])
        .map((a) => normalizePosition(a))
        .filter((p) => p !== pos);

      const newPlayer: Player = {
        id: uniqueId,
        name: inc.name,
        nationality: inc.nationality || draft.clubs[targetClubId]?.country || 'England',
        age,
        position: pos,
        alternatePositions: alts.length > 0 ? Array.from(new Set(alts)) : undefined,
        preferredFoot: inc.preferredFoot || 'Direito',
        skillMoves: inc.skillMoves || (pos === 'GOL' ? 1 : 3),
        weakFoot: inc.weakFoot || 3,
        playstyles: inc.playstyles,
        attributes: inc.attributes,
        overall: ovr,
        potential: pot,
        baseOverall: ovr,
        value: inc.value || estimateValue(ovr, pot, age),
        wage: inc.wage || estimateWage(ovr),
        clubId: targetClubId,
        role: ovr >= 80 ? 'titular' : age <= 21 && pot - ovr >= 6 ? 'promessa' : 'rotacao',
        fitness: 100,
        form: 'normal',
        recentRatings: [],
        lastRating: null,
        injury: null,
        transferListed: false,
        stats: {
          appearances: 0,
          minutes: 0,
          goals: 0,
          assists: 0,
          yellowCards: 0,
          redCards: 0,
          ratingSum: 0,
          ratingCount: 0,
          ovrDelta: 0,
        },
      };

      draft.players[newPlayer.id] = newPlayer;
      byId.set(newPlayer.id, newPlayer);
      affectedClubIds.add(targetClubId);
      if (!keptIdsByClub.has(targetClubId)) keptIdsByClub.set(targetClubId, new Set());
      keptIdsByClub.get(targetClubId)!.add(newPlayer.id);
    }
  }

  if (replaceClubSquads) {
    for (const [cid, kept] of keptIdsByClub.entries()) {
      const club = draft.clubs[cid];
      for (const p of Object.values(draft.players)) {
        if (p.clubId === cid && !kept.has(p.id)) {
          if (club) {
            club.starterIds = club.starterIds.filter((id) => id !== p.id);
            club.benchIds = club.benchIds.filter((id) => id !== p.id);
          }
          delete draft.players[p.id];
          affectedClubIds.add(cid);
        }
      }
    }
  }

  // Repair lineups of all affected clubs
  for (const cid of affectedClubIds) {
    const club = draft.clubs[cid];
    if (!club) continue;
    const clubList = Object.values(draft.players).filter((p) => p.clubId === cid);
    if (clubList.length === 0) continue;

    const validStarters = club.starterIds.filter(
      (id) => draft.players[id]?.clubId === cid && !draft.players[id]?.injury
    );
    const validBench = club.benchIds.filter(
      (id) => draft.players[id]?.clubId === cid && !validStarters.includes(id)
    );

    if (validStarters.length < 11 || validBench.length < Math.min(7, clubList.length - 11)) {
      const slots = getActiveSlots(club.tactics, draft.customFormations);
      const picked = autoPickLineup(clubList, slots);
      club.starterIds = picked.starterIds;
      club.benchIds = picked.benchIds;
    } else {
      club.starterIds = validStarters;
      club.benchIds = validBench;
    }
  }

  const userLeague = draft.leagues[draft.clubs[draft.userClubId]?.leagueId];
  draft.newsFeed.unshift({
    id: `news_json_${Date.now()}`,
    round: userLeague?.currentRound || 1,
    title: 'Elencos atualizados via JSON',
    detail: `${preview.updatedCount + preview.transferredCount + preview.addedCount} alterações aplicadas em ${preview.affectedClubNames.slice(0, 4).join(', ')}${preview.affectedClubNames.length > 4 ? '...' : ''}.`,
    type: 'info',
  });
  draft.newsFeed = draft.newsFeed.slice(0, 40);

  return { state: draft, preview };
}

export function exportClubToJson(clubName: string, clubId: string, players: Player[]): string {
  const payload = {
    clubId,
    club: clubName,
    players: [...players]
      .sort((a, b) => b.overall - a.overall)
      .map((p) => ({
        id: p.id,
        name: p.name,
        position: p.position,
        alternatePositions: p.alternatePositions,
        overall: p.overall,
        potential: p.potential,
        age: p.age,
        nationality: p.nationality,
        preferredFoot: p.preferredFoot,
        playstyles: p.playstyles,
      })),
  };
  return JSON.stringify(payload, null, 2);
}

export function exportRawDatasetToJson(dataset: RawDataset): string {
  const cleaned = dataset.players.map(({ providedFields: _pf, ...rest }) => rest);
  return JSON.stringify({ players: cleaned }, null, 2);
}

export const SAMPLE_QUICK_SQUAD_JSON = `[
  {
    "name": "Kylian Mbappé",
    "club": "Real Madrid",
    "overall": 92
  },
  {
    "name": "Trent Alexander-Arnold",
    "club": "Real Madrid"
  },
  {
    "name": "Estêvão",
    "club": "Chelsea",
    "position": "PD",
    "alternatePositions": ["MEI"],
    "overall": 80,
    "potential": 90,
    "age": 19,
    "nationality": "Brazil",
    "playstyles": ["Technical", "Finesse Shot", "Quick Step"]
  }
]`;
