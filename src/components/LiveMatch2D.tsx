import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, FastForward, ArrowLeftRight, CheckCircle2 } from 'lucide-react';
import { getActiveSlots } from '../data/formations';
import { evaluateClubMatchPower, LiveMatchOverride } from '../engine/seasonEngine';
import {
  computeTacticalMatchup,
  pickTacticalAssister,
  pickTacticalScorer,
} from '../engine/tacticsEngine';
import { Fixture, GameState, MatchEvent, Mentality, Player } from '../types/game';
import { describeShotSuffix, generateGoalShotDetail } from '../engine/goalShotEngine';
import { ClubCrest } from './ClubCrest';
import { GoalDetailModal } from './GoalDetailModal';

interface LiveMatch2DProps {
  state: GameState;
  fixture: Fixture;
  onFinishMatch: (override: LiveMatchOverride) => void;
  onCancel: () => void;
}

export const LiveMatch2D: React.FC<LiveMatch2DProps> = ({
  state,
  fixture,
  onFinishMatch,
  onCancel,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const homeClub = state.clubs[fixture.homeClubId];
  const awayClub = state.clubs[fixture.awayClubId];
  const isUserHome = fixture.homeClubId === state.userClubId;
  const isUserAway = fixture.awayClubId === state.userClubId;
  const userSide: 'home' | 'away' | null = isUserHome ? 'home' : isUserAway ? 'away' : null;

  const [minute, setMinute] = useState(0);
  const [speed, setSpeed] = useState<1 | 2 | 4>(1);
  const [paused, setPaused] = useState(false);
  const [finished, setFinished] = useState(false);

  const [homeGoals, setHomeGoals] = useState(0);
  const [awayGoals, setAwayGoals] = useState(0);
  const [homeShots, setHomeShots] = useState(0);
  const [awayShots, setAwayShots] = useState(0);
  const [homeOnTarget, setHomeOnTarget] = useState(0);
  const [awayOnTarget, setAwayOnTarget] = useState(0);
  const [events, setEvents] = useState<MatchEvent[]>([]);

  // Live lineups & fatigue state
  const [homeLineup, setHomeLineup] = useState<string[]>(() => [...homeClub.starterIds]);
  const [awayLineup, setAwayLineup] = useState<string[]>(() => [...awayClub.starterIds]);
  const [userBench, setUserBench] = useState<string[]>(() =>
    userSide ? [...(userSide === 'home' ? homeClub.benchIds : awayClub.benchIds)] : []
  );
  const [subsUsed, setSubsUsed] = useState(0);
  const [subOutSelected, setSubOutSelected] = useState<string | null>(null);
  const [inspectedGoal, setInspectedGoal] = useState<MatchEvent | null>(null);
  const [userMentality, setUserMentality] = useState<Mentality>(
    userSide ? state.clubs[state.userClubId].tactics.mentality : 'equilibrada'
  );

  const [liveFitness, setLiveFitness] = useState<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    for (const pid of [...homeClub.starterIds, ...awayClub.starterIds, ...homeClub.benchIds, ...awayClub.benchIds]) {
      if (state.players[pid]) map[pid] = state.players[pid].fitness;
    }
    return map;
  });

  const minutesRef = useRef<Record<string, number>>({});
  const ballPosRef = useRef({ x: 50, y: 50, vx: 0.8, vy: 0.4, owner: 'home' as 'home' | 'away' });

  const homeSlots = getActiveSlots(homeClub.tactics, state.customFormations);
  const awaySlots = getActiveSlots(awayClub.tactics, state.customFormations);
  const homePow = evaluateClubMatchPower(homeClub, state.players, state.customFormations);
  const awayPow = evaluateClubMatchPower(awayClub, state.players, state.customFormations);
  const matchup = computeTacticalMatchup(
    homeClub,
    awayClub,
    homeSlots,
    awaySlots,
    state.players,
    userSide === 'home' ? userMentality : undefined,
    userSide === 'away' ? userMentality : undefined
  );
  const homePoss = Math.max(
    26,
    Math.min(74, Math.round(50 + (homePow.midfield - awayPow.midfield) * 1.35 + matchup.homePossessionBonus))
  );

  // Simulation minute tick
  useEffect(() => {
    if (paused || finished) return;

    const intervalMs = speed === 1 ? 380 : speed === 2 ? 190 : 85;
    const timer = setInterval(() => {
      setMinute((prevMin) => {
        const nextMin = prevMin + 1;

        // Track minutes played & drain stamina slightly according to pressing & tempo
        const activeIds = [...homeLineup, ...awayLineup];
        for (const pid of activeIds) {
          minutesRef.current[pid] = (minutesRef.current[pid] || 0) + 1;
        }
        const homeFastDrain = homeClub.tactics.pressing === 'alta' || homeClub.tactics.tempo === 'rapido';
        const awayFastDrain = awayClub.tactics.pressing === 'alta' || awayClub.tactics.tempo === 'rapido';
        if (nextMin % 5 === 0) {
          setLiveFitness((prevFit) => {
            const next = { ...prevFit };
            for (const pid of homeLineup) {
              next[pid] = Math.max(22, (next[pid] ?? 80) - (homeFastDrain && nextMin % 10 === 0 ? 2 : 1));
            }
            for (const pid of awayLineup) {
              next[pid] = Math.max(22, (next[pid] ?? 80) - (awayFastDrain && nextMin % 10 === 0 ? 2 : 1));
            }
            return next;
          });
        }

        // Match event logic incorporating tactical matchups (flank space, high line, tempo, passing)
        const mentalityModHome =
          userSide === 'home' && userMentality === 'ofensiva'
            ? 0.012
            : userSide === 'home' && userMentality === 'defensiva'
              ? -0.008
              : 0;
        const mentalityModAway =
          userSide === 'away' && userMentality === 'ofensiva'
            ? 0.012
            : userSide === 'away' && userMentality === 'defensiva'
              ? -0.008
              : 0;

        const homeEffAtt = homePow.attack + matchup.homeAttackBonus;
        const awayEffDef = awayPow.defense - matchup.awayDefensePenalty;
        const awayEffAtt = awayPow.attack + matchup.awayAttackBonus;
        const homeEffDef = homePow.defense - matchup.homeDefensePenalty;

        const homeAttackRoll = Math.random();
        const homeChance =
          (0.052 + (homeEffAtt - awayEffDef) * 0.0018 + mentalityModHome) * matchup.homeShotsMult;
        const awayChance =
          (0.048 + (awayEffAtt - homeEffDef) * 0.0018 + mentalityModAway) * matchup.awayShotsMult;

        if (homeAttackRoll < homeChance) {
          // Attack exposed flank more visibly in 2D ball movement
          const targetY =
            matchup.awayAnalysis.leftFlankExposure > 0.4
              ? 68 + Math.random() * 22
              : matchup.awayAnalysis.rightFlankExposure > 0.4
                ? 10 + Math.random() * 22
                : 28 + Math.random() * 44;
          ballPosRef.current = { x: 86 + Math.random() * 10, y: targetY, vx: 0, vy: 0, owner: 'home' };
          setHomeShots((s) => s + 1);
          const goalProb = Math.min(0.42, 0.25 + matchup.homeXGBoost * 0.14);
          const isGoal = Math.random() < goalProb;
          const shooter = pickTacticalScorer(homeLineup, homeSlots, state.players);
          if (isGoal) {
            setHomeOnTarget((s) => s + 1);
            setHomeGoals((g) => g + 1);
            const assister =
              Math.random() < 0.78
                ? pickTacticalAssister(homeLineup, homeSlots, state.players, shooter?.id)
                : undefined;
            const sIdx = shooter ? homeLineup.indexOf(shooter.id) : -1;
            const aIdx = assister ? homeLineup.indexOf(assister.id) : -1;
            const shotDetail = generateGoalShotDetail({
              scorer: shooter,
              assister,
              scorerSlot: sIdx >= 0 ? homeSlots[sIdx] : undefined,
              assisterSlot: aIdx >= 0 ? homeSlots[aIdx] : undefined,
            });
            const suffix = describeShotSuffix(shotDetail);
            setEvents((evs) => [
              {
                minute: nextMin,
                type: 'GOAL',
                clubId: homeClub.id,
                playerId: shooter?.id,
                playerName: shooter?.name,
                assistPlayerId: assister?.id,
                assistPlayerName: assister?.name,
                description: `GOL! ${shooter?.name || homeClub.shortName}${suffix}${assister ? ` (assist. ${assister.name})` : ''}`,
                shotDetail,
              },
              ...evs,
            ]);
          } else if (Math.random() < 0.5 + matchup.homeOnTargetAdj) {
            setHomeOnTarget((s) => s + 1);
            setEvents((evs) => [
              {
                minute: nextMin,
                type: 'SAVE',
                clubId: homeClub.id,
                playerName: shooter?.name,
                description: `Grande defesa! ${shooter?.name || homeClub.shortName} arrisca com perigo.`,
              },
              ...evs,
            ]);
          }
        } else if (homeAttackRoll > 1 - awayChance) {
          const targetY =
            matchup.homeAnalysis.leftFlankExposure > 0.4
              ? 68 + Math.random() * 22
              : matchup.homeAnalysis.rightFlankExposure > 0.4
                ? 10 + Math.random() * 22
                : 28 + Math.random() * 44;
          ballPosRef.current = { x: 4 + Math.random() * 10, y: targetY, vx: 0, vy: 0, owner: 'away' };
          setAwayShots((s) => s + 1);
          const goalProb = Math.min(0.42, 0.24 + matchup.awayXGBoost * 0.14);
          const isGoal = Math.random() < goalProb;
          const shooter = pickTacticalScorer(awayLineup, awaySlots, state.players);
          if (isGoal) {
            setAwayOnTarget((s) => s + 1);
            setAwayGoals((g) => g + 1);
            const assister =
              Math.random() < 0.78
                ? pickTacticalAssister(awayLineup, awaySlots, state.players, shooter?.id)
                : undefined;
            const sIdx = shooter ? awayLineup.indexOf(shooter.id) : -1;
            const aIdx = assister ? awayLineup.indexOf(assister.id) : -1;
            const shotDetail = generateGoalShotDetail({
              scorer: shooter,
              assister,
              scorerSlot: sIdx >= 0 ? awaySlots[sIdx] : undefined,
              assisterSlot: aIdx >= 0 ? awaySlots[aIdx] : undefined,
            });
            const suffix = describeShotSuffix(shotDetail);
            setEvents((evs) => [
              {
                minute: nextMin,
                type: 'GOAL',
                clubId: awayClub.id,
                playerId: shooter?.id,
                playerName: shooter?.name,
                assistPlayerId: assister?.id,
                assistPlayerName: assister?.name,
                description: `GOL! ${shooter?.name || awayClub.shortName}${suffix}${assister ? ` (assist. ${assister.name})` : ''}`,
                shotDetail,
              },
              ...evs,
            ]);
          } else if (Math.random() < 0.5 + matchup.awayOnTargetAdj) {
            setAwayOnTarget((s) => s + 1);
            setEvents((evs) => [
              {
                minute: nextMin,
                type: 'SAVE',
                clubId: awayClub.id,
                playerName: shooter?.name,
                description: `Perigo! ${shooter?.name || awayClub.shortName} exige boa defesa.`,
              },
              ...evs,
            ]);
          }
        } else {
          // Normal midfield ball drift
          const owner = Math.random() < homePoss / 100 ? 'home' : 'away';
          ballPosRef.current = {
            x: owner === 'home' ? 45 + Math.random() * 35 : 20 + Math.random() * 35,
            y: 18 + Math.random() * 64,
            vx: 0,
            vy: 0,
            owner,
          };
        }

        if (nextMin >= 90) {
          setFinished(true);
          return 90;
        }
        return nextMin;
      });
    }, intervalMs);

    return () => clearInterval(timer);
  }, [paused, finished, speed, homeLineup, awayLineup, userMentality, homePow.attack, homePow.defense, awayPow.attack, awayPow.defense, homePoss, homeClub.id, homeClub.shortName, homeClub.tactics.pressing, homeClub.tactics.tempo, awayClub.id, awayClub.shortName, awayClub.tactics.pressing, awayClub.tactics.tempo, state.players, userSide, homeSlots, awaySlots, matchup]);

  // 2D Tactical Pitch Canvas animation loop
  useEffect(() => {
    let animId = 0;
    const homeSlots = getActiveSlots(homeClub.tactics, state.customFormations);
    const awaySlots = getActiveSlots(awayClub.tactics, state.customFormations);
    let smoothBallX = 50;
    let smoothBallY = 50;

    const render = (time: number) => {
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const w = canvas.width;
          const h = canvas.height;

          // Pitch turf stripes
          for (let i = 0; i < 10; i++) {
            ctx.fillStyle = i % 2 === 0 ? '#0c261a' : '#0f2f20';
            ctx.fillRect((w / 10) * i, 0, w / 10 + 1, h);
          }

          // Pitch lines
          ctx.strokeStyle = 'rgba(255,255,255,0.28)';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(14, 14, w - 28, h - 28);
          ctx.beginPath();
          ctx.moveTo(w / 2, 14);
          ctx.lineTo(w / 2, h - 14);
          ctx.stroke();

          ctx.beginPath();
          ctx.arc(w / 2, h / 2, 42, 0, Math.PI * 2);
          ctx.stroke();

          ctx.strokeRect(14, h * 0.25, 68, h * 0.5);
          ctx.strokeRect(w - 82, h * 0.25, 68, h * 0.5);

          // Smooth ball target
          const target = ballPosRef.current;
          smoothBallX += (target.x - smoothBallX) * 0.08;
          smoothBallY += (target.y - smoothBallY) * 0.08;
          const shiftX = (smoothBallX - 50) * 0.22;

          // Draw Home 11 (left -> right)
          homeSlots.forEach((slot, idx) => {
            const baseX = 100 - slot.y; // GK near x=10, ST near x=85
            const baseY = slot.x;
            const px =
              idx === 0
                ? (baseX / 100) * (w - 28) + 14
                : ((Math.max(12, Math.min(92, baseX * 0.65 + shiftX)) / 100) * (w - 28)) + 14;
            const py = (baseY / 100) * (h - 28) + 14 + Math.sin(time * 0.003 + idx) * 3;

            ctx.beginPath();
            ctx.arc(px, py, 7.5, 0, Math.PI * 2);
            ctx.fillStyle = homeClub.primaryColor || '#10B981';
            ctx.fill();
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = '#ffffff';
            ctx.stroke();
          });

          // Draw Away 11 (right -> left)
          awaySlots.forEach((slot, idx) => {
            const baseX = slot.y; // GK near x=90, ST near x=15
            const baseY = 100 - slot.x;
            const px =
              idx === 0
                ? (baseX / 100) * (w - 28) + 14
                : ((Math.max(8, Math.min(88, 100 - (100 - baseX) * 0.65 + shiftX)) / 100) * (w - 28)) + 14;
            const py = (baseY / 100) * (h - 28) + 14 + Math.cos(time * 0.003 + idx) * 3;

            ctx.beginPath();
            ctx.arc(px, py, 7.5, 0, Math.PI * 2);
            ctx.fillStyle = awayClub.primaryColor === homeClub.primaryColor ? '#3B82F6' : awayClub.primaryColor || '#F59E0B';
            ctx.fill();
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = '#09090B';
            ctx.stroke();
          });

          // Draw Ball
          const bx = (smoothBallX / 100) * (w - 28) + 14;
          const by = (smoothBallY / 100) * (h - 28) + 14;
          ctx.beginPath();
          ctx.arc(bx, by, 4.5, 0, Math.PI * 2);
          ctx.fillStyle = '#ffffff';
          ctx.fill();
          ctx.lineWidth = 1.2;
          ctx.strokeStyle = '#09090B';
          ctx.stroke();
        }
      }
      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [homeClub, awayClub, state.customFormations]);

  const handlePerformSub = (benchPlayerId: string) => {
    if (!userSide || !subOutSelected || subsUsed >= 5) return;
    const outPlayer = state.players[subOutSelected];
    const inPlayer = state.players[benchPlayerId];
    if (!outPlayer || !inPlayer) return;

    if (userSide === 'home') {
      setHomeLineup((prev) => prev.map((id) => (id === subOutSelected ? benchPlayerId : id)));
    } else {
      setAwayLineup((prev) => prev.map((id) => (id === subOutSelected ? benchPlayerId : id)));
    }
    setUserBench((prev) => prev.filter((id) => id !== benchPlayerId));
    setSubsUsed((c) => c + 1);
    setSubOutSelected(null);

    setEvents((evs) => [
      {
        minute,
        type: 'SUB',
        clubId: state.userClubId,
        playerId: inPlayer.id,
        playerName: inPlayer.name,
        description: `Substituição: Entra ${inPlayer.name}, sai ${outPlayer.name}.`,
      },
      ...evs,
    ]);
  };

  const handleCompleteAndSave = () => {
    let finalHome = homeGoals;
    let finalAway = awayGoals;
    let finalHShots = homeShots;
    let finalAShots = awayShots;
    let finalHOn = homeOnTarget;
    let finalAOn = awayOnTarget;
    const finalEvents = [...events];

    // If user clicks "Simular Restante" before 90', quickly simulate remaining minutes
    if (minute < 90) {
      const remRatio = (90 - minute) / 90;
      const extraH = Math.random() < remRatio * 1.4 ? 1 : 0;
      const extraA = Math.random() < remRatio * 1.2 ? 1 : 0;
      finalHome += extraH;
      finalAway += extraA;
      finalHShots += Math.round(remRatio * 5);
      finalAShots += Math.round(remRatio * 5);
      finalHOn += extraH + 1;
      finalAOn += extraA + 1;
      for (const pid of [...homeLineup, ...awayLineup]) {
        minutesRef.current[pid] = (minutesRef.current[pid] || 0) + (90 - minute);
      }
      if (extraH > 0) {
        const s = pickTacticalScorer(homeLineup, homeSlots, state.players);
        const a = Math.random() < 0.75 ? pickTacticalAssister(homeLineup, homeSlots, state.players, s?.id) : undefined;
        const shotDetail = generateGoalShotDetail({ scorer: s, assister: a });
        finalEvents.unshift({
          minute: Math.min(90, minute + 5),
          type: 'GOAL',
          clubId: homeClub.id,
          playerId: s?.id,
          playerName: s?.name,
          assistPlayerId: a?.id,
          assistPlayerName: a?.name,
          description: `GOL! ${s?.name || homeClub.shortName}${describeShotSuffix(shotDetail)}${a ? ` (assist. ${a.name})` : ''}`,
          shotDetail,
        });
      }
      if (extraA > 0) {
        const s = pickTacticalScorer(awayLineup, awaySlots, state.players);
        const a = Math.random() < 0.75 ? pickTacticalAssister(awayLineup, awaySlots, state.players, s?.id) : undefined;
        const shotDetail = generateGoalShotDetail({ scorer: s, assister: a });
        finalEvents.unshift({
          minute: Math.min(90, minute + 6),
          type: 'GOAL',
          clubId: awayClub.id,
          playerId: s?.id,
          playerName: s?.name,
          assistPlayerId: a?.id,
          assistPlayerName: a?.name,
          description: `GOL! ${s?.name || awayClub.shortName}${describeShotSuffix(shotDetail)}${a ? ` (assist. ${a.name})` : ''}`,
          shotDetail,
        });
      }
    }

    let penaltiesWinnerId: string | undefined;
    if (fixture.competitionType !== 'LEAGUE' && finalHome === finalAway) {
      penaltiesWinnerId = Math.random() < 0.52 ? homeClub.id : awayClub.id;
    }

    onFinishMatch({
      homeGoals: finalHome,
      awayGoals: finalAway,
      events: finalEvents.sort((a, b) => a.minute - b.minute),
      stats: {
        homePossession: homePoss,
        awayPossession: 100 - homePoss,
        homeShots: Math.max(finalHome, finalHShots),
        awayShots: Math.max(finalAway, finalAShots),
        homeShotsOnTarget: Math.max(finalHome, finalHOn),
        awayShotsOnTarget: Math.max(finalAway, finalAOn),
        homeXG: Number((finalHShots * 0.11 + finalHome * 0.25 + matchup.homeXGBoost * 0.2).toFixed(2)),
        awayXG: Number((finalAShots * 0.11 + finalAway * 0.25 + matchup.awayXGBoost * 0.2).toFixed(2)),
        homeBigChances: Math.max(finalHome, Math.round(finalHOn * 0.45 + matchup.homeBigChancesBonus)),
        awayBigChances: Math.max(finalAway, Math.round(finalAOn * 0.45 + matchup.awayBigChancesBonus)),
        tacticalNote: matchup.summaryNote || undefined,
      },
      minutesPlayed: minutesRef.current,
      penaltiesWinnerId,
    });
  };

  const userOnPitchIds = userSide === 'home' ? homeLineup : userSide === 'away' ? awayLineup : [];

  return (
    <div className="min-h-screen bg-[#09090B] text-zinc-100 p-4 sm:p-6">
      <div className="max-w-[1320px] mx-auto space-y-5">
        {/* Top Scoreboard Bar */}
        <div className="p-4 bg-[#111114] border border-zinc-800 rounded-xl flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="text-xs font-mono text-zinc-400">
            {fixture.competitionName} · {fixture.roundLabel}
          </div>

          <div className="flex items-center gap-5">
            <div className="flex items-center gap-2.5">
              <span className="font-display text-base font-bold text-white">{homeClub.name}</span>
              <ClubCrest clubId={homeClub.id} clubName={homeClub.name} size="md" />
            </div>

            <div className="px-4 py-1.5 bg-[#09090B] border border-zinc-800 rounded-lg font-mono text-2xl font-bold tabular-nums text-white">
              {homeGoals} : {awayGoals}
            </div>

            <div className="flex items-center gap-2.5">
              <ClubCrest clubId={awayClub.id} clubName={awayClub.name} size="md" />
              <span className="font-display text-base font-bold text-white">{awayClub.name}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-bold tabular-nums text-emerald-400 mr-2">
              {minute}&apos;
            </span>
            {!finished ? (
              <>
                <button
                  onClick={() => setPaused((p) => !p)}
                  className="p-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-white cursor-pointer"
                >
                  {paused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                </button>
                {([1, 2, 4] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setSpeed(s)}
                    className={`px-2.5 py-1.5 text-xs font-mono rounded-lg cursor-pointer ${
                      speed === s ? 'bg-emerald-500 text-zinc-950 font-bold' : 'bg-zinc-800 text-zinc-300'
                    }`}
                  >
                    {s}x
                  </button>
                ))}
                <button
                  onClick={handleCompleteAndSave}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded-lg cursor-pointer"
                >
                  <FastForward className="w-3.5 h-3.5" />
                  Finalizar
                </button>
              </>
            ) : (
              <button
                onClick={handleCompleteAndSave}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-zinc-950 rounded-lg cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                Confirmar Resultado
              </button>
            )}
            {minute === 0 && (
              <button
                onClick={onCancel}
                className="px-2.5 py-1.5 text-xs text-zinc-400 hover:text-white cursor-pointer"
              >
                Sair
              </button>
            )}
          </div>
        </div>

        {/* Main 2D Pitch + Live Substitutions & Events */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          <div className="lg:col-span-7 space-y-4">
            <div className="p-3 bg-[#111114] border border-zinc-800 rounded-xl">
              <canvas
                ref={canvasRef}
                width={720}
                height={420}
                className="w-full h-auto rounded-lg border border-zinc-800/80 block"
              />
            </div>

            {/* Live Stats Bar */}
            <div className="p-4 bg-[#111114] border border-zinc-800 rounded-xl grid grid-cols-3 gap-4 text-center text-xs font-mono tabular-nums">
              <div>
                <div className="text-zinc-500">Posse de Bola</div>
                <div className="text-sm font-bold text-white mt-1">
                  {homePoss}% — {100 - homePoss}%
                </div>
              </div>
              <div>
                <div className="text-zinc-500">Finalizações</div>
                <div className="text-sm font-bold text-white mt-1">
                  {homeShots} — {awayShots}
                </div>
              </div>
              <div>
                <div className="text-zinc-500">No Alvo</div>
                <div className="text-sm font-bold text-white mt-1">
                  {homeOnTarget} — {awayOnTarget}
                </div>
              </div>
            </div>

            {/* Commentary Feed */}
            <div className="p-4 bg-[#111114] border border-zinc-800 rounded-xl space-y-2.5 max-h-60 overflow-y-auto">
              <h3 className="font-display text-sm font-semibold text-white">
                Lances da Partida
              </h3>
              {events.length === 0 ? (
                <p className="text-xs text-zinc-500">Bola rolando no meio-campo...</p>
              ) : (
                events.map((ev, i) => (
                  <div
                    key={i}
                    className={`text-xs flex items-start justify-between gap-2.5 py-1.5 border-b border-zinc-800/50 last:border-0 ${
                      ev.type === 'GOAL' ? 'text-emerald-400 font-semibold' : 'text-zinc-300'
                    }`}
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <span className="font-mono tabular-nums text-zinc-500 w-8 shrink-0">
                        {ev.minute}&apos;
                      </span>
                      <span>{ev.description}</span>
                    </div>
                    {ev.type === 'GOAL' && (
                      <button
                        type="button"
                        onClick={() => setInspectedGoal(ev)}
                        className="text-[11px] font-mono text-zinc-300 hover:text-emerald-300 underline shrink-0 cursor-pointer"
                      >
                        Mapa
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Right 5 cols: Live Substitutions & Tactical Mentality */}
          <div className="lg:col-span-5 p-4 bg-[#111114] border border-zinc-800 rounded-xl space-y-4">
            {userSide ? (
              <>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-display text-sm font-semibold text-white">
                      Substituições ao Vivo ({subsUsed}/5)
                    </h3>
                    <p className="text-[11px] text-zinc-400">
                      Selecione quem sai em campo e depois quem entra do banco.
                    </p>
                  </div>
                  <select
                    value={userMentality}
                    onChange={(e) => setUserMentality(e.target.value as Mentality)}
                    className="bg-[#09090B] border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-100"
                  >
                    <option value="defensiva">Defensiva</option>
                    <option value="equilibrada">Equilibrada</option>
                    <option value="ofensiva">Ofensiva</option>
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* On Pitch */}
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-mono text-zinc-400">Em Campo</div>
                    <div className="space-y-1 max-h-80 overflow-y-auto pr-1">
                      {userOnPitchIds.map((pid) => {
                        const p: Player | undefined = state.players[pid];
                        if (!p) return null;
                        const fit = liveFitness[pid] ?? p.fitness;
                        const selected = subOutSelected === pid;
                        return (
                          <button
                            key={pid}
                            disabled={subsUsed >= 5 || finished}
                            onClick={() => setSubOutSelected(selected ? null : pid)}
                            className={`w-full px-2.5 py-1.5 rounded-lg border text-left text-xs flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                              selected
                                ? 'bg-amber-500/15 border-amber-500 text-amber-200'
                                : 'bg-[#09090B] border-zinc-800/80 text-zinc-200 hover:border-zinc-700'
                            }`}
                          >
                            <span className="truncate">
                              <span className="font-mono text-zinc-500 mr-1.5">{p.position}</span>
                              {p.name.split(' ').slice(-1)[0]}
                            </span>
                            <span
                              className={`font-mono tabular-nums text-[11px] ${
                                fit >= 70 ? 'text-emerald-400' : fit >= 55 ? 'text-amber-400' : 'text-red-400'
                              }`}
                            >
                              {fit}%
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Bench */}
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-mono text-zinc-400">Banco Disponível</div>
                    <div className="space-y-1 max-h-80 overflow-y-auto pr-1">
                      {userBench.map((pid) => {
                        const p = state.players[pid];
                        if (!p) return null;
                        return (
                          <button
                            key={pid}
                            disabled={!subOutSelected || subsUsed >= 5 || finished}
                            onClick={() => handlePerformSub(pid)}
                            className={`w-full px-2.5 py-1.5 rounded-lg border text-left text-xs flex items-center justify-between gap-2 transition-colors ${
                              subOutSelected && subsUsed < 5
                                ? 'bg-emerald-500/10 border-emerald-500/50 text-white hover:bg-emerald-500/20 cursor-pointer'
                                : 'bg-[#09090B] border-zinc-800/60 text-zinc-400 opacity-75'
                            }`}
                          >
                            <span className="truncate">
                              <span className="font-mono text-zinc-500 mr-1.5">{p.position}</span>
                              {p.name.split(' ').slice(-1)[0]}
                            </span>
                            <span className="inline-flex items-center gap-1 font-mono text-[11px] text-zinc-300">
                              {p.overall}
                              {subOutSelected && <ArrowLeftRight className="w-3 h-3 text-emerald-400" />}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-xs text-zinc-400 space-y-2">
                <h3 className="font-display text-sm font-semibold text-white">
                  Modo Espectador
                </h3>
                <p>
                  Você está assistindo a este confronto neutro em tempo real no motor tático 2D.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {inspectedGoal && (
        <GoalDetailModal
          state={state}
          fixture={{ ...fixture, homeGoals, awayGoals }}
          event={inspectedGoal}
          onClose={() => setInspectedGoal(null)}
        />
      )}
    </div>
  );
};
