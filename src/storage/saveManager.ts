import { GameState, SaveSlotMeta } from '../types/game';

const SLOTS_INDEX_KEY = 'pitchcommand_fm_slots_v1';
const SLOT_DATA_PREFIX = 'pitchcommand_fm_slot_data_v1_';

export function createSlotId(): string {
  return `slot_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function listSaveSlots(): SaveSlotMeta[] {
  try {
    const raw = localStorage.getItem(SLOTS_INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SaveSlotMeta[];
    return Array.isArray(parsed)
      ? parsed.sort((a, b) => b.updatedAt - a.updatedAt)
      : [];
  } catch {
    return [];
  }
}

export function saveGameToSlot(state: GameState): SaveSlotMeta[] {
  const club = state.clubs[state.userClubId];
  const league = club ? state.leagues[club.leagueId] : undefined;
  const meta: SaveSlotMeta = {
    slotId: state.slotId,
    slotName: state.slotName,
    gameMode: state.gameMode || 'CAREER',
    userClubId: state.userClubId,
    userClubName: club?.name || state.userClubId,
    leagueName: league?.name || '',
    season: state.season,
    phase: state.phase,
    currentRound: league?.currentRound || 1,
    budget: club?.budget || 0,
    updatedAt: Date.now(),
  };

  try {
    const payload = JSON.stringify({ ...state, updatedAt: meta.updatedAt });
    localStorage.setItem(`${SLOT_DATA_PREFIX}${state.slotId}`, payload);
    const existing = listSaveSlots().filter((s) => s.slotId !== state.slotId);
    const updated = [meta, ...existing];
    localStorage.setItem(SLOTS_INDEX_KEY, JSON.stringify(updated));
    return updated;
  } catch {
    return listSaveSlots();
  }
}

export function loadGameFromSlot(slotId: string): GameState | null {
  try {
    const raw = localStorage.getItem(`${SLOT_DATA_PREFIX}${slotId}`);
    if (!raw) return null;
    return JSON.parse(raw) as GameState;
  } catch {
    return null;
  }
}

export function deleteSaveSlot(slotId: string): SaveSlotMeta[] {
  try {
    localStorage.removeItem(`${SLOT_DATA_PREFIX}${slotId}`);
    const remaining = listSaveSlots().filter((s) => s.slotId !== slotId);
    localStorage.setItem(SLOTS_INDEX_KEY, JSON.stringify(remaining));
    return remaining;
  } catch {
    return listSaveSlots();
  }
}
