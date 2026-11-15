import { useEffect, useMemo, useState } from 'react';
import { CalendarView } from './components/CalendarView';
import { CareerHub } from './components/CareerHub';
import { DashboardView } from './components/DashboardView';
import { DraftView } from './components/DraftView';
import { GoalDetailModal } from './components/GoalDetailModal';
import { JsonSquadUpdaterModal } from './components/JsonSquadUpdaterModal';
import { LiveMatch2D } from './components/LiveMatch2D';
import { MundoView } from './components/MundoView';
import { PhaseSummaryModal } from './components/PhaseSummaryModal';
import { PlayerProfileModal } from './components/PlayerProfileModal';
import { SandboxView } from './components/SandboxView';
import { TacticsSquadView } from './components/TacticsSquadView';
import { ActiveTab, TopBar } from './components/TopBar';
import { TransferMarketView } from './components/TransferMarketView';
import { TrophyCelebrationModal } from './components/TrophyCelebrationModal';
import { normalizePosition } from './data/formations';
import {
  buildEuropaLeagueGroupStage,
  initializeGameState,
  loadDefaultDataset,
} from './engine/dataLoader';
import {
  getPendingDraftStepLabel,
  initializeDraftState,
  isDraftWindowMandatoryPending,
} from './engine/draftEngine';
import { ensureFinanceState } from './engine/financeEngine';
import {
  applyJsonPatchToGameState,
  applyJsonPatchToRawDataset,
  JsonApplyMode,
} from './engine/jsonSquadEngine';
import {
  advanceSeasonRound,
  buyPlayerFromMarket,
  cloneState,
  computeLeagueTable,
  executeDraftAttributeBuff,
  executeDraftBuyCandidate,
  executeDraftReroll,
  executeDraftRollMid,
  executeDraftSellPlayer,
  executeDraftSignMid,
  exerciseLoanBuyOption,
  findNextCupOrUclFixture,
  getClubPlayers,
  getFixtureCalendarRound,
  hasActiveCupOrUclForUser,
  LiveMatchOverride,
  loanPlayerFromMarket,
  recoverBetweenRoundsFitness,
  resolveCupOrUclFixtureAndRound,
  respondToTransferOffer,
  simulateFixtureInPlace,
  simulateNextKnockoutMatch,
  simulateToEndSeason,
  simulateToMidSeason,
  simulateUntilNextCupOrUclMatch,
  startNewSeason,
} from './engine/seasonEngine';
import {
  clearCustomBaseDataset,
  loadCustomBaseDataset,
  saveCustomBaseDataset,
} from './storage/customDatasetStore';
import {
  createSlotId,
  deleteSaveSlot,
  listSaveSlots,
  loadGameFromSlot,
  saveGameToSlot,
} from './storage/saveManager';
import { Fixture, GameState, MatchEvent, RawDataset, SaveSlotMeta } from './types/game';

function normalizeLoadedGameState(loaded: GameState, ds?: RawDataset | null): GameState {
  const next = cloneState(loaded);
  const rawById = new Map(ds ? ds.players.map((rp) => [rp.id, rp]) : []);

  for (const c of Object.values(next.clubs)) {
    if (c.autoRotate === undefined) c.autoRotate = true;
  }

  for (const p of Object.values(next.players)) {
    if (!p.form) p.form = 'normal';
    if (!p.recentRatings) p.recentRatings = [];
    if (p.lastRating === undefined) p.lastRating = null;
    if (p.injury === undefined) p.injury = null;

    const raw = rawById.get(p.id);
    if (raw) {
      if (!p.attributes && raw.attributes) p.attributes = raw.attributes;
      if (!p.playstyles && raw.playstyles) p.playstyles = raw.playstyles;
      if (!p.alternatePositions && raw.alternatePositions) {
        const alts = Array.from(
          new Set(
            raw.alternatePositions
              .map((a) => normalizePosition(a))
              .filter((posNorm) => posNorm !== p.position)
          )
        );
        if (alts.length > 0) p.alternatePositions = alts;
      }
      if (!p.preferredFoot && raw.preferredFoot) p.preferredFoot = raw.preferredFoot;
      if (!p.skillMoves && raw.skillMoves) p.skillMoves = raw.skillMoves;
      if (!p.weakFoot && raw.weakFoot) p.weakFoot = raw.weakFoot;
    }
  }
  if (!next.championsLeague.stage) {
    next.championsLeague.stage = next.championsLeague.championClubId ? 'CONCLUIDA' : 'MATA_MATA';
  }
  if (!next.championsLeague.groups) next.championsLeague.groups = [];
  if (!next.championsLeague.groupRound) next.championsLeague.groupRound = 1;
  if (!next.europaLeague) {
    const uclClubIds = next.championsLeague.groups.flatMap((g) => g.clubIds);
    const totalRounds = next.leagues['premier-league']?.totalRounds || 38;
    next.europaLeague = buildEuropaLeagueGroupStage(
      next.clubs,
      next.fixtures,
      uclClubIds,
      undefined,
      totalRounds
    );
  }
  if (!next.europaLeague.stage) {
    next.europaLeague.stage = next.europaLeague.championClubId ? 'CONCLUIDA' : 'MATA_MATA';
  }
  if (!next.europaLeague.groups) next.europaLeague.groups = [];
  if (!next.europaLeague.groupRound) next.europaLeague.groupRound = 1;
  if (!next.npcWindowDone) next.npcWindowDone = { inicio: true, meio: next.phase !== 'INICIO_JANELA' };
  if (!next.gameMode) next.gameMode = 'CAREER';
  if (!next.pendingTrophies) next.pendingTrophies = [];
  if (next.gameMode === 'DRAFT' && !next.draftState) {
    initializeDraftState(next);
  }
  ensureFinanceState(next);
  return next;
}

export default function App() {
  const [officialDataset, setOfficialDataset] = useState<RawDataset | null>(null);
  const [dataset, setDataset] = useState<RawDataset | null>(null);
  const [isCustomDataset, setIsCustomDataset] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [slots, setSlots] = useState<SaveSlotMeta[]>(() => listSaveSlots());
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [secondaryOpen, setSecondaryOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>('central');
  const [liveFixtureId, setLiveFixtureId] = useState<string | null>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [marketFeedback, setMarketFeedback] = useState<string | null>(null);
  const [draftFeedback, setDraftFeedback] = useState<string | null>(null);
  const [phaseReportOpen, setPhaseReportOpen] = useState(false);
  const [inspectedPlayerId, setInspectedPlayerId] = useState<string | null>(null);
  const [inspectedGoal, setInspectedGoal] = useState<{ event: MatchEvent; fixture?: Fixture | null } | null>(null);
  const [preselectedNegotiatePlayerId, setPreselectedNegotiatePlayerId] = useState<string | null>(null);
  const [jsonModalOpen, setJsonModalOpen] = useState(false);
  const [savedFeedback, setSavedFeedback] = useState(false);

  useEffect(() => {
    Promise.all([loadDefaultDataset(), loadCustomBaseDataset()])
      .then(([def, custom]) => {
        setOfficialDataset(def);
        if (custom) {
          setDataset(custom);
          setIsCustomDataset(true);
        } else {
          setDataset(def);
        }
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'Erro ao carregar base de dados.'));
  }, []);

  // Auto-save active career slot whenever gameState mutates
  useEffect(() => {
    if (gameState) {
      const updatedSlots = saveGameToSlot(gameState);
      setSlots(updatedSlots);
    }
  }, [gameState]);

  const userClub = gameState ? gameState.clubs[gameState.userClubId] : null;
  const userLeague = gameState && userClub ? gameState.leagues[userClub.leagueId] : null;

  const userTable = useMemo(() => {
    if (!gameState || !userClub) return [];
    return computeLeagueTable(userClub.leagueId, gameState);
  }, [gameState, userClub]);

  const clubPlayers = useMemo(() => {
    if (!gameState || !userClub) return [];
    return getClubPlayers(userClub.id, gameState.players);
  }, [gameState, userClub]);

  const nextCupOrUcl = useMemo(() => {
    if (!gameState) return null;
    return findNextCupOrUclFixture(gameState);
  }, [gameState]);

  const userHasActiveCupOrUcl = useMemo(() => {
    if (!gameState) return false;
    return hasActiveCupOrUclForUser(gameState);
  }, [gameState]);

  const nextFixture = useMemo(() => {
    if (!gameState || !userClub || !userLeague) return null;
    if (nextCupOrUcl && nextCupOrUcl.calendarRound <= userLeague.currentRound) {
      return nextCupOrUcl.fixture;
    }

    const roundMatch = Object.values(gameState.fixtures).find(
      (f) =>
        !f.played &&
        f.competitionType === 'LEAGUE' &&
        f.competitionId === userClub.leagueId &&
        f.round === userLeague.currentRound &&
        (f.homeClubId === userClub.id || f.awayClubId === userClub.id)
    );
    if (roundMatch) return roundMatch;

    return (
      Object.values(gameState.fixtures)
        .filter((f) => !f.played && (f.homeClubId === userClub.id || f.awayClubId === userClub.id))
        .sort((a, b) => getFixtureCalendarRound(a, gameState) - getFixtureCalendarRound(b, gameState))[0] ||
      null
    );
  }, [gameState, userClub, userLeague, nextCupOrUcl]);

  const handleCreateCareer = (clubId: string, slotName: string) => {
    if (!dataset) return;
    const newId = createSlotId();
    const initial = initializeGameState(dataset, clubId, newId, slotName, 2026, 'CAREER');
    setGameState(initial);
    setActiveTab('central');
    setSecondaryOpen(false);
    setPhaseReportOpen(false);
    setDraftFeedback(null);
  };

  const handleCreateDraftCareer = (clubId: string, slotName: string) => {
    if (!dataset) return;
    const newId = createSlotId();
    const initial = initializeGameState(dataset, clubId, newId, slotName, 2026, 'DRAFT');
    setGameState(initial);
    setActiveTab('draft');
    setSecondaryOpen(false);
    setPhaseReportOpen(false);
    setDraftFeedback(null);
  };

  const handleLaunchCareerFromSandbox = (sandboxState: GameState) => {
    const club = sandboxState.clubs[sandboxState.userClubId];
    const cloned = cloneState(sandboxState);
    cloned.slotId = createSlotId();
    cloned.slotName = `Sandbox ${club?.shortName || 'Clube'} T${cloned.season}`;
    cloned.gameMode = 'CAREER';
    cloned.updatedAt = Date.now();
    ensureFinanceState(cloned);
    setSlots(saveGameToSlot(cloned));
    setGameState(cloned);
    setSecondaryOpen(false);
    setActiveTab('central');
    setPhaseReportOpen(false);
    setDraftFeedback(null);
  };

  const handleLoadSlot = (slotId: string) => {
    const loaded = loadGameFromSlot(slotId);
    if (loaded) {
      const norm = normalizeLoadedGameState(loaded, dataset);
      setGameState(norm);
      setActiveTab(norm.gameMode === 'DRAFT' ? 'draft' : 'central');
      setSecondaryOpen(false);
      setPhaseReportOpen(false);
      setInspectedPlayerId(null);
      setDraftFeedback(null);
    }
  };

  const handleDeleteSlot = (slotId: string) => {
    setSlots(deleteSaveSlot(slotId));
  };

  const handleManualSave = () => {
    if (!gameState) return;
    const stamped = { ...gameState, updatedAt: Date.now() };
    setSlots(saveGameToSlot(stamped));
    setSavedFeedback(true);
    setTimeout(() => setSavedFeedback(false), 2200);
  };

  const handleApplyToDataset = (
    incoming: RawDataset,
    applyMode: JsonApplyMode,
    replaceClubSquads: boolean
  ) => {
    if (!dataset) return;
    const { dataset: updated, preview } = applyJsonPatchToRawDataset(
      incoming,
      dataset,
      applyMode,
      replaceClubSquads
    );
    setDataset(updated);
    setIsCustomDataset(true);
    saveCustomBaseDataset(updated);
    setImportMessage(
      applyMode === 'REPLACE'
        ? `Base substituída: ${updated.players.length.toLocaleString('pt-BR')} atletas carregados.`
        : `Elencos atualizados: ${preview.updatedCount} atualizados, ${preview.transferredCount} transferidos e ${preview.addedCount} adicionados.`
    );
  };

  const handleApplyToCareer = (
    incoming: RawDataset,
    replaceClubSquads: boolean,
    alsoUpdateBase: boolean
  ) => {
    if (!gameState) return;
    const { state: updatedState } = applyJsonPatchToGameState(
      incoming,
      gameState,
      replaceClubSquads
    );
    setGameState(updatedState);
    if (alsoUpdateBase && dataset) {
      const { dataset: updatedBase } = applyJsonPatchToRawDataset(
        incoming,
        dataset,
        'MERGE',
        replaceClubSquads
      );
      setDataset(updatedBase);
      setIsCustomDataset(true);
      saveCustomBaseDataset(updatedBase);
    }
  };

  const handleResetOfficialDataset = () => {
    clearCustomBaseDataset();
    setIsCustomDataset(false);
    if (officialDataset) {
      setDataset(officialDataset);
      setImportMessage('Base oficial restaurada com sucesso.');
    }
  };

  const ensureDraftGateCleared = (): boolean => {
    if (!gameState) return false;
    if (isDraftWindowMandatoryPending(gameState)) {
      setDraftFeedback(`Janela obrigatória: ${getPendingDraftStepLabel(gameState)}`);
      setActiveTab('draft');
      return false;
    }
    return true;
  };

  const handleAdvanceRound = () => {
    if (!gameState || !userClub || !userLeague) return;
    if (gameState.phase === 'FINAL_TEMPORADA') {
      const nextSeason = startNewSeason(gameState);
      setGameState(nextSeason);
      setActiveTab(
        nextSeason.gameMode === 'DRAFT' && isDraftWindowMandatoryPending(nextSeason)
          ? 'draft'
          : 'central'
      );
      setPhaseReportOpen(false);
      return;
    }

    if (!ensureDraftGateCleared()) return;

    const scheduledMatch = Object.values(gameState.fixtures)
      .filter(
        (f) =>
          !f.played &&
          f.scheduledWatch &&
          (f.homeClubId === userClub.id || f.awayClubId === userClub.id) &&
          getFixtureCalendarRound(f, gameState) <= userLeague.currentRound
      )
      .sort((a, b) => getFixtureCalendarRound(a, gameState) - getFixtureCalendarRound(b, gameState))[0];

    if (scheduledMatch) {
      setLiveFixtureId(scheduledMatch.id);
      return;
    }

    const updated = advanceSeasonRound(gameState);
    setGameState(updated);
    if (updated.gameMode === 'DRAFT' && updated.phase !== gameState.phase && isDraftWindowMandatoryPending(updated)) {
      setActiveTab('draft');
    } else if (updated.phase !== gameState.phase && updated.lastPhaseReport) {
      setPhaseReportOpen(true);
    }
  };

  const handleSimulateToCupOrUcl = () => {
    if (!gameState || gameState.phase === 'FINAL_TEMPORADA') return;
    if (!ensureDraftGateCleared()) return;
    const updated = simulateUntilNextCupOrUclMatch(gameState);
    setGameState(updated);
    if (updated.gameMode === 'DRAFT' && updated.phase === 'MEIO_JANELA' && isDraftWindowMandatoryPending(updated)) {
      setActiveTab('draft');
    } else if (updated.phase === 'FINAL_TEMPORADA' && updated.lastPhaseReport) {
      setPhaseReportOpen(true);
    }
  };

  const handleSimulateCurrentFixture = (fixtureId: string) => {
    if (!gameState) return;
    if (!ensureDraftGateCleared()) return;
    const fix = gameState.fixtures[fixtureId];
    if (!fix) {
      handleAdvanceRound();
      return;
    }
    if (
      fix.competitionType === 'CUP' ||
      fix.competitionType === 'CHAMPIONS_LEAGUE' ||
      fix.competitionType === 'EUROPA_LEAGUE'
    ) {
      setGameState(resolveCupOrUclFixtureAndRound(gameState, fixtureId));
    } else {
      handleAdvanceRound();
    }
  };

  const handleSimulatePhaseJump = () => {
    if (!gameState) return;
    if (gameState.phase === 'FINAL_TEMPORADA') {
      const nextSeason = startNewSeason(gameState);
      setGameState(nextSeason);
      setActiveTab(
        nextSeason.gameMode === 'DRAFT' && isDraftWindowMandatoryPending(nextSeason)
          ? 'draft'
          : 'central'
      );
      setPhaseReportOpen(false);
      return;
    }

    if (!ensureDraftGateCleared()) return;

    const scheduled = Object.values(gameState.fixtures).find(
      (f) =>
        !f.played &&
        f.scheduledWatch &&
        (f.homeClubId === gameState.userClubId || f.awayClubId === gameState.userClubId)
    );
    if (scheduled) {
      setLiveFixtureId(scheduled.id);
      return;
    }

    const updated =
      gameState.phase === 'INICIO_JANELA'
        ? simulateToMidSeason(gameState)
        : simulateToEndSeason(gameState);
    setGameState(updated);
    if (updated.gameMode === 'DRAFT' && updated.phase === 'MEIO_JANELA' && isDraftWindowMandatoryPending(updated)) {
      setActiveTab('draft');
    }
    if (updated.lastPhaseReport) {
      setPhaseReportOpen(true);
    }
  };

  const handleFinishLiveMatch = (override: LiveMatchOverride) => {
    if (!gameState || !liveFixtureId) return;
    const fix = gameState.fixtures[liveFixtureId];
    if (!fix) {
      setLiveFixtureId(null);
      return;
    }

    if (
      fix.competitionType === 'CUP' ||
      fix.competitionType === 'CHAMPIONS_LEAGUE' ||
      fix.competitionType === 'EUROPA_LEAGUE'
    ) {
      const updated = resolveCupOrUclFixtureAndRound(gameState, liveFixtureId, override);
      setGameState(updated);
      setLiveFixtureId(null);
      return;
    }

    // League match: apply live result first, then if it's the current round, simulate remaining round matches
    const next = cloneState(gameState);
    const target = next.fixtures[liveFixtureId];
    if (target) {
      target.scheduledWatch = false;
      simulateFixtureInPlace(target, next, override);
    }

    const uClub = next.clubs[next.userClubId];
    const uLeague = next.leagues[uClub.leagueId];
    if (target && target.competitionId === uClub.leagueId && target.round === uLeague.currentRound) {
      const advanced = advanceSeasonRound(next);
      setGameState(advanced);
    } else {
      recoverBetweenRoundsFitness(next);
      setGameState(next);
    }
    setLiveFixtureId(null);
  };

  if (loadError) {
    return (
      <div className="min-h-screen bg-[#09090B] text-zinc-100 flex items-center justify-center p-6">
        <div className="p-6 bg-[#111114] border border-red-500/40 rounded-xl max-w-md space-y-2">
          <h1 className="font-display text-lg font-bold text-white">Erro ao carregar base</h1>
          <p className="text-sm text-zinc-400">{loadError}</p>
        </div>
      </div>
    );
  }

  if (!dataset) {
    return (
      <div className="min-h-screen bg-[#09090B] text-zinc-100 flex items-center justify-center">
        <div className="text-sm font-mono text-zinc-400">Carregando elenco oficial...</div>
      </div>
    );
  }

  if (secondaryOpen) {
    return (
      <SandboxView
        dataset={dataset}
        onBack={() => setSecondaryOpen(false)}
        onLaunchCareerFromSandbox={handleLaunchCareerFromSandbox}
      />
    );
  }

  if (!gameState || !userClub || !userLeague) {
    return (
      <>
        <CareerHub
          dataset={dataset}
          isCustomDataset={isCustomDataset}
          slots={slots}
          onLoadSlot={handleLoadSlot}
          onDeleteSlot={handleDeleteSlot}
          onCreateCareer={handleCreateCareer}
          onCreateDraftCareer={handleCreateDraftCareer}
          onOpenSecondaryMode={() => setSecondaryOpen(true)}
          onOpenJsonUpdater={() => setJsonModalOpen(true)}
          importMessage={importMessage}
        />
        {jsonModalOpen && (
          <JsonSquadUpdaterModal
            modeContext="HUB"
            baseDataset={dataset}
            isCustomDataset={isCustomDataset}
            onClose={() => setJsonModalOpen(false)}
            onApplyToDataset={handleApplyToDataset}
            onResetOfficialDataset={handleResetOfficialDataset}
          />
        )}
      </>
    );
  }

  if (liveFixtureId && gameState.fixtures[liveFixtureId]) {
    return (
      <LiveMatch2D
        state={gameState}
        fixture={gameState.fixtures[liveFixtureId]}
        onFinishMatch={handleFinishLiveMatch}
        onCancel={() => setLiveFixtureId(null)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#09090B] text-zinc-100">
      <TopBar
        club={userClub}
        league={userLeague}
        season={gameState.season}
        phase={gameState.phase}
        gameMode={gameState.gameMode}
        activeTab={activeTab}
        savedFeedback={savedFeedback}
        onSaveCareer={handleManualSave}
        onSelectTab={setActiveTab}
        onPrimaryAction={handleSimulatePhaseJump}
        onExitToHub={() => setGameState(null)}
      />

      <main className="max-w-[1440px] mx-auto px-6 py-6">
        {activeTab === 'central' && (
          <DashboardView
            state={gameState}
            userClub={userClub}
            userTable={userTable}
            clubPlayers={clubPlayers}
            nextFixture={nextFixture}
            nextCupOrUcl={nextCupOrUcl}
            hasActiveCupOrUcl={userHasActiveCupOrUcl}
            onWatchLive={(fid) => {
              if (!ensureDraftGateCleared()) return;
              setLiveFixtureId(fid);
            }}
            onSimulateCurrentFixture={handleSimulateCurrentFixture}
            onSimulateToCupOrUcl={handleSimulateToCupOrUcl}
            onSimulatePhaseJump={handleSimulatePhaseJump}
            onStartNewSeason={() => {
              setGameState((prev) => {
                if (!prev) return prev;
                const next = startNewSeason(prev);
                if (next.gameMode === 'DRAFT' && isDraftWindowMandatoryPending(next)) {
                  setActiveTab('draft');
                }
                return next;
              });
              setPhaseReportOpen(false);
            }}
            onOpenPhaseReport={() => setPhaseReportOpen(true)}
            onNavigate={setActiveTab}
            onInspectPlayer={(pid) => setInspectedPlayerId(pid)}
            onInspectGoal={(event, fixture) => setInspectedGoal({ event, fixture })}
          />
        )}

        {activeTab === 'tatica' && (
          <TacticsSquadView
            state={gameState}
            userClub={userClub}
            clubPlayers={clubPlayers}
            onInspectPlayer={(pid) => setInspectedPlayerId(pid)}
            onOpenJsonUpdater={() => setJsonModalOpen(true)}
            onUpdateClubAndPlayers={(updater) =>
              setGameState((prev) => {
                if (!prev) return prev;
                const draft = cloneState(prev);
                updater(draft);
                return draft;
              })
            }
          />
        )}

        {activeTab === 'mercado' && gameState.gameMode !== 'DRAFT' && (
          <TransferMarketView
            state={gameState}
            userClub={userClub}
            clubPlayers={clubPlayers}
            feedbackMsg={marketFeedback}
            onInspectPlayer={(pid) => setInspectedPlayerId(pid)}
            preselectedNegotiatePlayerId={preselectedNegotiatePlayerId}
            onClearPreselectedNegotiate={() => setPreselectedNegotiatePlayerId(null)}
            onBuyPlayer={(playerId, amount) => {
              const res = buyPlayerFromMarket(gameState, playerId, amount);
              if (res.error) {
                setMarketFeedback(res.error);
              } else {
                setGameState(res.state);
                setMarketFeedback('Contratação concluída com sucesso!');
              }
            }}
            onLoanPlayer={(playerId, withBuyOption) => {
              const res = loanPlayerFromMarket(gameState, playerId, withBuyOption);
              if (res.error) {
                setMarketFeedback(res.error);
              } else {
                setGameState(res.state);
                setMarketFeedback('Empréstimo fechado! O atleta já integra seu elenco nesta temporada.');
              }
            }}
            onExerciseLoanBuyOption={(playerId) => {
              const res = exerciseLoanBuyOption(gameState, playerId);
              if (res.error) {
                setMarketFeedback(res.error);
              } else {
                setGameState(res.state);
                setMarketFeedback('Opção de compra exercida! O jogador agora é definitivo do seu clube.');
              }
            }}
            onToggleTransferList={(playerId, listed, askingPrice) => {
              setGameState((prev) => {
                if (!prev) return prev;
                const draft = cloneState(prev);
                if (draft.players[playerId]) {
                  draft.players[playerId].transferListed = listed;
                  draft.players[playerId].askingPrice = askingPrice;
                  if (listed) draft.players[playerId].loanListed = false;
                }
                return draft;
              });
              setMarketFeedback(
                listed
                  ? 'Atleta adicionado à Lista de Transferências. Avance a fase para receber propostas.'
                  : 'Atleta removido da Lista de Transferências.'
              );
            }}
            onToggleLoanList={(playerId, listed) => {
              setGameState((prev) => {
                if (!prev) return prev;
                const draft = cloneState(prev);
                if (draft.players[playerId]) {
                  draft.players[playerId].loanListed = listed;
                  if (listed) draft.players[playerId].transferListed = false;
                }
                return draft;
              });
              setMarketFeedback(
                listed
                  ? 'Atleta disponibilizado para empréstimo! Clubes interessados enviarão propostas.'
                  : 'Atleta removido da lista de empréstimos.'
              );
            }}
            onRespondOffer={(offerId, decision, counterAmount) => {
              const offer = gameState.offers.find((o) => o.id === offerId);
              setGameState((prev) =>
                prev ? respondToTransferOffer(prev, offerId, decision, counterAmount) : prev
              );
              setMarketFeedback(
                decision === 'ACCEPT'
                  ? offer?.type === 'LOAN'
                    ? 'Empréstimo aceito e taxa creditada no caixa!'
                    : 'Venda concluída e verba creditada!'
                  : decision === 'REJECT'
                    ? 'Proposta recusada.'
                    : 'Contraproposta enviada ao clube interessado.'
              );
            }}
          />
        )}

        {activeTab === 'draft' && gameState.gameMode === 'DRAFT' && (
          <DraftView
            state={gameState}
            userClub={userClub}
            clubPlayers={clubPlayers}
            feedbackMsg={draftFeedback}
            onInspectPlayer={(pid) => setInspectedPlayerId(pid)}
            onGoToCentral={() => setActiveTab('central')}
            onSellSquadPlayer={(pid) => {
              const res = executeDraftSellPlayer(gameState, pid);
              if (res.error) setDraftFeedback(res.error);
              else {
                setGameState(res.state);
                setDraftFeedback('Atleta vendido para outro clube! Verba creditada para suas escolhas.');
              }
            }}
            onBuyInitialCandidate={(tier, pid) => {
              const res = executeDraftBuyCandidate(gameState, tier, pid);
              if (res.error) setDraftFeedback(res.error);
              else {
                setGameState(res.state);
                setDraftFeedback('Reforço contratado no Draft!');
              }
            }}
            onRerollInitial={(tier) => {
              const res = executeDraftReroll(gameState, tier);
              if (res.error) setDraftFeedback(res.error);
              else {
                setGameState(res.state);
                setDraftFeedback('Cartas do Draft re-roladas com 1 Passe de Roleta!');
              }
            }}
            onRollMidWindow={(pos, tier) => {
              const res = executeDraftRollMid(gameState, pos, tier);
              if (res.error) setDraftFeedback(res.error);
              else {
                setGameState(res.state);
                setDraftFeedback('Roleta girou e revelou um novo alvo!');
              }
            }}
            onSignMidCandidate={() => {
              const res = executeDraftSignMid(gameState);
              if (res.error) setDraftFeedback(res.error);
              else {
                setGameState(res.state);
                setDraftFeedback('Jogador da roleta integrado ao elenco!');
              }
            }}
            onApplyAttributeBuff={(pid, focus) => {
              const res = executeDraftAttributeBuff(gameState, pid, focus);
              if (res.error) setDraftFeedback(res.error);
              else {
                setGameState(res.state);
                setDraftFeedback(
                  `Buff direcionado aplicado com sucesso (+${res.ovrGain || 2} OVR e +8 nos atributos escolhidos)!`
                );
              }
            }}
          />
        )}

        {activeTab === 'mundo' && (
          <MundoView
            state={gameState}
            onSimulateOneKnockout={(kind, compId, fixtureId) =>
              setGameState((prev) =>
                prev ? simulateNextKnockoutMatch(prev, kind, compId, fixtureId) : prev
              )
            }
            onWatchLive={(fid) => {
              if (!ensureDraftGateCleared()) return;
              setLiveFixtureId(fid);
            }}
            onInspectPlayer={(pid) => setInspectedPlayerId(pid)}
            onInspectGoal={(event, fixture) => setInspectedGoal({ event, fixture })}
          />
        )}

        {activeTab === 'calendario' && (
          <CalendarView
            state={gameState}
            nextCupOrUcl={nextCupOrUcl}
            hasActiveCupOrUcl={userHasActiveCupOrUcl}
            onToggleScheduleWatch={(fid) =>
              setGameState((prev) => {
                if (!prev || !prev.fixtures[fid]) return prev;
                const draft = cloneState(prev);
                draft.fixtures[fid].scheduledWatch = !draft.fixtures[fid].scheduledWatch;
                return draft;
              })
            }
            onWatchLive={(fid) => {
              if (!ensureDraftGateCleared()) return;
              setLiveFixtureId(fid);
            }}
            onAdvanceRound={handleAdvanceRound}
            onSimulateToCupOrUcl={handleSimulateToCupOrUcl}
            onSimulatePhaseJump={handleSimulatePhaseJump}
            onInspectGoal={(event, fixture) => setInspectedGoal({ event, fixture })}
          />
        )}
      </main>

      {phaseReportOpen && gameState.lastPhaseReport && (
        <PhaseSummaryModal
          state={gameState}
          report={gameState.lastPhaseReport}
          onClose={() => setPhaseReportOpen(false)}
          onGoToMundo={() => {
            setPhaseReportOpen(false);
            setActiveTab('mundo');
          }}
          onGoToSquad={() => {
            setPhaseReportOpen(false);
            setActiveTab('tatica');
          }}
          onGoToCalendar={() => {
            setPhaseReportOpen(false);
            setActiveTab('calendario');
          }}
          onInspectPlayer={(pid) => setInspectedPlayerId(pid)}
          onInspectGoal={(event, fixture) => setInspectedGoal({ event, fixture })}
        />
      )}

      {inspectedPlayerId && gameState.players[inspectedPlayerId] && (
        <PlayerProfileModal
          state={gameState}
          player={gameState.players[inspectedPlayerId]}
          onClose={() => setInspectedPlayerId(null)}
          onGoToNegotiate={(pl) => {
            if (gameState.gameMode === 'DRAFT') return;
            setInspectedPlayerId(null);
            setPhaseReportOpen(false);
            setPreselectedNegotiatePlayerId(pl.id);
            setActiveTab('mercado');
          }}
        />
      )}

      {inspectedGoal && (
        <GoalDetailModal
          state={gameState}
          event={inspectedGoal.event}
          fixture={inspectedGoal.fixture}
          onClose={() => setInspectedGoal(null)}
          onInspectPlayer={(pid) => {
            setInspectedGoal(null);
            setInspectedPlayerId(pid);
          }}
        />
      )}

      {jsonModalOpen && (
        <JsonSquadUpdaterModal
          modeContext="CAREER"
          baseDataset={dataset}
          isCustomDataset={isCustomDataset}
          gameState={gameState}
          userClub={userClub}
          clubPlayers={clubPlayers}
          onClose={() => setJsonModalOpen(false)}
          onApplyToCareer={handleApplyToCareer}
        />
      )}

      {gameState.pendingTrophies && gameState.pendingTrophies.length > 0 && (
        <TrophyCelebrationModal
          trophy={gameState.pendingTrophies[0]}
          remainingCount={gameState.pendingTrophies.length}
          onDismiss={() =>
            setGameState((prev) => {
              if (!prev) return prev;
              const draft = cloneState(prev);
              draft.pendingTrophies = (draft.pendingTrophies || []).slice(1);
              return draft;
            })
          }
        />
      )}
    </div>
  );
}
