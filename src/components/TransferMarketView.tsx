import React, { useEffect, useMemo, useState } from 'react';
import { Search, Check, X, ArrowLeftRight, User } from 'lucide-react';
import { FORM_LABELS, getPlayerAvgRating } from '../data/formations';
import { LEAGUES_META } from '../data/leaguesMeta';
import { evaluateLoanAttempt, evaluateTransferAttempt } from '../engine/transferMarketEngine';
import { Club, GameState, LeagueId, Player, Position } from '../types/game';
import { formatCurrency, formatWage } from '../utils/format';
import { ClubCrest } from './ClubCrest';
import { NationFlag } from './NationFlag';

interface TransferMarketViewProps {
  state: GameState;
  userClub: Club;
  clubPlayers: Player[];
  onBuyPlayer: (playerId: string, amount: number) => void;
  onLoanPlayer: (playerId: string, withBuyOption: boolean) => void;
  onExerciseLoanBuyOption: (playerId: string) => void;
  onToggleTransferList: (playerId: string, listed: boolean, askingPrice?: number) => void;
  onToggleLoanList: (playerId: string, listed: boolean) => void;
  onRespondOffer: (offerId: string, decision: 'ACCEPT' | 'REJECT' | 'COUNTER', counterAmount?: number) => void;
  onInspectPlayer: (playerId: string) => void;
  preselectedNegotiatePlayerId?: string | null;
  onClearPreselectedNegotiate?: () => void;
  feedbackMsg: string | null;
}

const POSITIONS: Position[] = ['GOL', 'ZAG', 'LE', 'LD', 'VOL', 'MC', 'MEI', 'PE', 'PD', 'ATA'];

export const TransferMarketView: React.FC<TransferMarketViewProps> = ({
  state,
  userClub,
  clubPlayers,
  onBuyPlayer,
  onLoanPlayer,
  onExerciseLoanBuyOption,
  onToggleTransferList,
  onToggleLoanList,
  onRespondOffer,
  onInspectPlayer,
  preselectedNegotiatePlayerId,
  onClearPreselectedNegotiate,
  feedbackMsg,
}) => {
  const [subTab, setSubTab] = useState<'buscar' | 'vender' | 'emprestimos' | 'propostas'>('buscar');
  const [query, setQuery] = useState('');
  const [posFilter, setPosFilter] = useState<string>('ALL');
  const [leagueFilter, setLeagueFilter] = useState<string>('ALL');
  const [formFilter, setFormFilter] = useState<'ALL' | 'HOT' | 'otima' | 'boa'>('ALL');
  const [sortBy, setSortBy] = useState<'ovr' | 'rating' | 'value'>('ovr');
  const [minOvr, setMinOvr] = useState<number>(65);
  const [maxAge, setMaxAge] = useState<number>(36);
  const [counterDrafts, setCounterDrafts] = useState<Record<string, number>>({});

  // Negotiation drawer/modal state
  const [negotiatingPlayerId, setNegotiatingPlayerId] = useState<string | null>(null);
  const [negotiateMode, setNegotiateMode] = useState<'BUY' | 'LOAN'>('BUY');
  const [withBuyOption, setWithBuyOption] = useState(true);
  const [bidAmount, setBidAmount] = useState<number>(0);

  const pendingOffers = state.offers.filter((o) => o.status === 'PENDING');
  const windowClosed = state.phase === 'FINAL_TEMPORADA';

  const loanedInPlayers = useMemo(
    () => clubPlayers.filter((p) => p.loan && p.loan.toClubId === userClub.id),
    [clubPlayers, userClub.id]
  );
  const loanedOutPlayers = useMemo(
    () => Object.values(state.players).filter((p) => p.loan && p.loan.parentClubId === userClub.id),
    [state.players, userClub.id]
  );

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    return Object.values(state.players)
      .filter((p) => {
        if (p.clubId === userClub.id) return false;
        if (posFilter !== 'ALL' && p.position !== posFilter) return false;
        if (leagueFilter !== 'ALL' && state.clubs[p.clubId]?.leagueId !== (leagueFilter as LeagueId)) return false;
        if (formFilter === 'HOT' && p.form !== 'boa' && p.form !== 'otima') return false;
        if ((formFilter === 'otima' || formFilter === 'boa') && p.form !== formFilter) return false;
        if (p.overall < minOvr) return false;
        if (p.age > maxAge) return false;
        if (q && !p.name.toLowerCase().includes(q) && !(state.clubs[p.clubId]?.name.toLowerCase().includes(q))) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'rating') {
          return getPlayerAvgRating(b) - getPlayerAvgRating(a) || b.overall - a.overall;
        }
        if (sortBy === 'value') {
          return b.value - a.value;
        }
        return b.overall - a.overall || b.potential - a.potential;
      })
      .slice(0, 60);
  }, [state.players, state.clubs, userClub.id, query, posFilter, leagueFilter, formFilter, sortBy, minOvr, maxAge]);

  const negotiatingPlayer = negotiatingPlayerId ? state.players[negotiatingPlayerId] : null;
  const negotiatingEval = negotiatingPlayer
    ? evaluateTransferAttempt(state, negotiatingPlayer.id, userClub.id)
    : null;
  const negotiatingLoanEval = negotiatingPlayer
    ? evaluateLoanAttempt(state, negotiatingPlayer.id, userClub.id)
    : null;
  const negotiatingSeller = negotiatingPlayer ? state.clubs[negotiatingPlayer.clubId] : null;

  const openNegotiation = (p: Player) => {
    const ev = evaluateTransferAttempt(state, p.id, userClub.id);
    const loanEv = evaluateLoanAttempt(state, p.id, userClub.id);
    setNegotiatingPlayerId(p.id);
    setNegotiateMode(!ev.allowed && loanEv.allowed ? 'LOAN' : 'BUY');
    setWithBuyOption(true);
    setBidAmount(ev.askingPrice || p.value);
  };

  useEffect(() => {
    if (!preselectedNegotiatePlayerId) return;
    const p = state.players[preselectedNegotiatePlayerId];
    if (p && p.clubId !== userClub.id) {
      setSubTab('buscar');
      const ev = evaluateTransferAttempt(state, p.id, userClub.id);
      const loanEv = evaluateLoanAttempt(state, p.id, userClub.id);
      setNegotiatingPlayerId(p.id);
      setNegotiateMode(!ev.allowed && loanEv.allowed ? 'LOAN' : 'BUY');
      setBidAmount(ev.askingPrice || p.value);
    }
    onClearPreselectedNegotiate?.();
  }, [preselectedNegotiatePlayerId, state, userClub.id, onClearPreselectedNegotiate]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
        <div className="flex items-center gap-1 p-1 bg-[#111114] border border-zinc-800 rounded-lg self-start overflow-x-auto max-w-full">
          <button
            onClick={() => setSubTab('buscar')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              subTab === 'buscar' ? 'bg-emerald-500 text-zinc-950 font-semibold' : 'text-zinc-400 hover:text-white'
            }`}
          >
            Buscar Jogadores
          </button>
          <button
            onClick={() => setSubTab('vender')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              subTab === 'vender' ? 'bg-emerald-500 text-zinc-950 font-semibold' : 'text-zinc-400 hover:text-white'
            }`}
          >
            Lista de Saídas
          </button>
          <button
            onClick={() => setSubTab('emprestimos')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              subTab === 'emprestimos' ? 'bg-emerald-500 text-zinc-950 font-semibold' : 'text-zinc-400 hover:text-white'
            }`}
          >
            Empréstimos ({loanedInPlayers.length + loanedOutPlayers.length})
          </button>
          <button
            onClick={() => setSubTab('propostas')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              subTab === 'propostas' ? 'bg-emerald-500 text-zinc-950 font-semibold' : 'text-zinc-400 hover:text-white'
            }`}
          >
            Propostas ({pendingOffers.length})
          </button>
        </div>

        <div className="text-xs font-mono tabular-nums text-zinc-300">
          Verba do clube: <span className="text-emerald-400 font-semibold">{formatCurrency(userClub.budget)}</span>
        </div>
      </div>

      {feedbackMsg && (
        <div className="px-4 py-2.5 text-xs bg-zinc-900 border border-zinc-700 rounded-lg text-zinc-200">
          {feedbackMsg}
        </div>
      )}

      {windowClosed && (
        <div className="px-4 py-2.5 text-xs bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-300">
          Temporada encerrada. Inicie a próxima temporada na Central para abrir a nova janela de transferências.
        </div>
      )}

      {/* Active Negotiation Box */}
      {subTab === 'buscar' && negotiatingPlayer && negotiatingEval && negotiatingLoanEval && (
        <div className="p-5 bg-[#111114] border border-emerald-500/50 rounded-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-3">
            <div className="flex items-center gap-3">
              <NationFlag nationality={negotiatingPlayer.nationality} size="md" />
              <div>
                <button
                  type="button"
                  onClick={() => onInspectPlayer(negotiatingPlayer.id)}
                  className="font-display text-base font-bold text-white hover:text-emerald-400 text-left cursor-pointer"
                >
                  Negociação: {negotiatingPlayer.name}
                </button>
                <div className="text-xs text-zinc-400 font-mono">
                  {negotiatingSeller?.name} · {negotiatingPlayer.position} · {negotiatingPlayer.overall} OVR · {FORM_LABELS[negotiatingPlayer.form || 'normal']}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 self-start">
              <div className="flex items-center gap-1 p-0.5 bg-[#09090B] border border-zinc-800 rounded-lg text-xs">
                <button
                  type="button"
                  onClick={() => setNegotiateMode('BUY')}
                  className={`px-2.5 py-1 rounded-md cursor-pointer ${
                    negotiateMode === 'BUY' ? 'bg-emerald-500 text-zinc-950 font-semibold' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  Compra
                </button>
                <button
                  type="button"
                  onClick={() => setNegotiateMode('LOAN')}
                  className={`px-2.5 py-1 rounded-md cursor-pointer ${
                    negotiateMode === 'LOAN' ? 'bg-emerald-500 text-zinc-950 font-semibold' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  Empréstimo
                </button>
              </div>
              <button
                type="button"
                onClick={() => onInspectPlayer(negotiatingPlayer.id)}
                className="text-xs text-emerald-400 hover:underline cursor-pointer"
              >
                Perfil
              </button>
              <button
                onClick={() => setNegotiatingPlayerId(null)}
                className="text-xs text-zinc-400 hover:text-white cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>

          {negotiateMode === 'BUY' ? (
            !negotiatingEval.allowed ? (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="text-red-400">
                  <span className="font-semibold">{negotiatingEval.statusLabel}:</span> {negotiatingEval.reason}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {negotiatingLoanEval.allowed && (
                    <button
                      onClick={() => setNegotiateMode('LOAN')}
                      className="px-3.5 py-1.5 bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25 rounded-lg cursor-pointer"
                    >
                      Tentar Empréstimo
                    </button>
                  )}
                  <button
                    onClick={() => setNegotiatingPlayerId(null)}
                    className="px-3.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg cursor-pointer"
                  >
                    Entendido
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="grid grid-cols-3 gap-6 text-xs font-mono tabular-nums">
                  <div>
                    <div className="text-zinc-500">Valor de Mercado</div>
                    <div className="text-zinc-200 font-semibold mt-0.5">{formatCurrency(negotiatingPlayer.value)}</div>
                  </div>
                  <div>
                    <div className="text-zinc-500">Pedido do Clube</div>
                    <div className="text-amber-400 font-bold mt-0.5">{formatCurrency(negotiatingEval.askingPrice)}</div>
                  </div>
                  <div>
                    <div className="text-zinc-500">Postura</div>
                    <div className="text-emerald-400 mt-0.5">{negotiatingEval.statusLabel}</div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="number"
                    step={500000}
                    min={250000}
                    value={bidAmount}
                    onChange={(e) => setBidAmount(Number(e.target.value) || 0)}
                    className="w-36 px-3 py-2 text-xs font-mono tabular-nums bg-[#09090B] border border-zinc-800 rounded-lg text-white"
                  />
                  <button
                    disabled={windowClosed || userClub.budget < bidAmount}
                    onClick={() => {
                      onBuyPlayer(negotiatingPlayer.id, bidAmount);
                      if (bidAmount >= negotiatingEval.askingPrice && userClub.budget >= bidAmount) {
                        setNegotiatingPlayerId(null);
                      }
                    }}
                    className="px-4 py-2 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-zinc-950 rounded-lg cursor-pointer"
                  >
                    Enviar Proposta
                  </button>
                </div>
              </div>
            )
          ) : !negotiatingLoanEval.allowed ? (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="text-red-400">
                <span className="font-semibold">{negotiatingLoanEval.statusLabel}:</span> {negotiatingLoanEval.reason}
              </div>
              <button
                onClick={() => setNegotiatingPlayerId(null)}
                className="px-3.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg shrink-0 cursor-pointer"
              >
                Entendido
              </button>
            </div>
          ) : (
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="grid grid-cols-3 gap-6 text-xs font-mono tabular-nums">
                <div>
                  <div className="text-zinc-500">Taxa do Empréstimo</div>
                  <div className="text-emerald-400 font-bold mt-0.5">{formatCurrency(negotiatingLoanEval.loanFee)}</div>
                </div>
                <div>
                  <div className="text-zinc-500">Opção de Compra</div>
                  <div className="text-zinc-200 font-semibold mt-0.5">
                    {withBuyOption ? formatCurrency(negotiatingLoanEval.buyOptionPrice) : 'Sem cláusula'}
                  </div>
                </div>
                <div>
                  <div className="text-zinc-500">Vigência</div>
                  <div className="text-zinc-300 mt-0.5">Fim da Temp. {state.season}</div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex items-center gap-1.5 text-xs text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={withBuyOption}
                    onChange={(e) => setWithBuyOption(e.target.checked)}
                    className="rounded border-zinc-700 accent-emerald-500"
                  />
                  Incluir opção de compra
                </label>
                <button
                  disabled={windowClosed || userClub.budget < negotiatingLoanEval.loanFee}
                  onClick={() => {
                    onLoanPlayer(negotiatingPlayer.id, withBuyOption);
                    if (userClub.budget >= negotiatingLoanEval.loanFee) {
                      setNegotiatingPlayerId(null);
                    }
                  }}
                  className="px-4 py-2 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-zinc-950 rounded-lg cursor-pointer"
                >
                  Fechar Empréstimo ({formatCurrency(negotiatingLoanEval.loanFee)})
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {subTab === 'buscar' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="p-4 bg-[#111114] border border-zinc-800/90 rounded-xl grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 text-xs">
            <div className="relative lg:col-span-2">
              <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar jogador ou clube..."
                className="w-full pl-9 pr-3 py-2 bg-[#09090B] border border-zinc-800 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <select
              value={posFilter}
              onChange={(e) => setPosFilter(e.target.value)}
              className="bg-[#09090B] border border-zinc-800 rounded-lg px-3 py-2 text-zinc-100"
            >
              <option value="ALL">Todas Posições</option>
              {POSITIONS.map((pos) => (
                <option key={pos} value={pos}>{pos}</option>
              ))}
            </select>

            <select
              value={leagueFilter}
              onChange={(e) => setLeagueFilter(e.target.value)}
              className="bg-[#09090B] border border-zinc-800 rounded-lg px-3 py-2 text-zinc-100"
            >
              <option value="ALL">Todas as 9 Ligas</option>
              {LEAGUES_META.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>

            <select
              value={formFilter}
              onChange={(e) => setFormFilter(e.target.value as typeof formFilter)}
              className="bg-[#09090B] border border-zinc-800 rounded-lg px-3 py-2 text-zinc-100"
            >
              <option value="ALL">Todas as Fases</option>
              <option value="HOT">Boa ou Ótima Fase</option>
              <option value="otima">Somente Fase Ótima</option>
              <option value="boa">Somente Boa Fase</option>
            </select>

            <div className="flex items-center gap-2">
              <input
                type="number"
                min={50}
                max={95}
                value={minOvr}
                onChange={(e) => setMinOvr(Number(e.target.value) || 50)}
                title="OVR Mínimo"
                className="w-full px-2.5 py-2 bg-[#09090B] border border-zinc-800 rounded-lg text-white font-mono tabular-nums"
                placeholder="Min OVR"
              />
              <input
                type="number"
                min={16}
                max={45}
                value={maxAge}
                onChange={(e) => setMaxAge(Number(e.target.value) || 40)}
                title="Idade Máxima"
                className="w-full px-2.5 py-2 bg-[#09090B] border border-zinc-800 rounded-lg text-white font-mono tabular-nums"
                placeholder="Max Idade"
              />
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Exibindo {searchResults.length} atletas</span>
            <div className="flex items-center gap-2">
              <span>Ordenar por:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="bg-[#111114] border border-zinc-800 rounded-md px-2.5 py-1 text-zinc-200"
              >
                <option value="ovr">Overall</option>
                <option value="rating">Nota Média</option>
                <option value="value">Valor de Mercado</option>
              </select>
            </div>
          </div>

          {/* Results Table */}
          <div className="bg-[#111114] border border-zinc-800/90 rounded-xl overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="text-[11px] text-zinc-500 border-b border-zinc-800 bg-[#0d0d10]">
                  <th className="py-2.5 px-3">Atleta</th>
                  <th className="py-2.5 px-2">Clube</th>
                  <th className="py-2.5 px-2">Pos</th>
                  <th className="py-2.5 px-2">Fase / Nota</th>
                  <th className="py-2.5 px-2 text-right">Idade</th>
                  <th className="py-2.5 px-2 text-right">OVR/POT</th>
                  <th className="py-2.5 px-2 text-right">Salário</th>
                  <th className="py-2.5 px-2 text-right">Pedido / Postura</th>
                  <th className="py-2.5 px-3 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {searchResults.map((p) => {
                  const club = state.clubs[p.clubId];
                  const avg = getPlayerAvgRating(p);
                  const evalRes = evaluateTransferAttempt(state, p.id, userClub.id);
                  const formText = FORM_LABELS[p.form || 'normal'];
                  const formCls =
                    p.form === 'otima'
                      ? 'text-emerald-400 font-semibold'
                      : p.form === 'boa'
                        ? 'text-sky-400'
                        : p.form === 'ma'
                          ? 'text-red-400'
                          : 'text-zinc-400';

                  return (
                    <tr key={p.id} className="hover:bg-zinc-900/60">
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2.5">
                          <NationFlag nationality={p.nationality} size="sm" />
                          <button
                            type="button"
                            onClick={() => onInspectPlayer(p.id)}
                            className="font-medium text-white hover:text-emerald-400 text-left cursor-pointer"
                            title="Abrir Perfil do Atleta"
                          >
                            {p.name}
                          </button>
                        </div>
                      </td>
                      <td className="py-2.5 px-2">
                        <div className="flex items-center gap-2 text-zinc-300">
                          <ClubCrest clubId={p.clubId} clubName={club?.name || ''} size="xs" />
                          <span className="truncate max-w-[130px]">{club?.name}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-2 font-mono text-zinc-400">{p.position}</td>
                      <td className="py-2.5 px-2 font-mono tabular-nums">
                        <span className={formCls}>{formText}</span>
                        {avg > 0 && <span className="text-zinc-500"> · {avg.toFixed(1)}</span>}
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono tabular-nums text-zinc-400">{p.age}</td>
                      <td className="py-2.5 px-2 text-right font-mono tabular-nums">
                        <span className="text-white font-semibold">{p.overall}</span>
                        <span className="text-zinc-500">/{p.potential}</span>
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono tabular-nums text-zinc-400">
                        {formatWage(p.wage)}
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono tabular-nums">
                        {!evalRes.allowed ? (
                          <span className="text-red-400">{evalRes.statusLabel}</span>
                        ) : (
                          <div>
                            <div className={evalRes.askingPrice > p.value * 1.15 ? 'text-amber-400 font-medium' : 'text-emerald-400 font-medium'}>
                              {formatCurrency(evalRes.askingPrice)}
                            </div>
                            <div className="text-[10px] text-zinc-500">{evalRes.statusLabel}</div>
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => onInspectPlayer(p.id)}
                            title="Ver Perfil do Atleta"
                            className="p-1.5 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-emerald-400 hover:border-emerald-500/50 transition-colors cursor-pointer"
                          >
                            <User className="w-3.5 h-3.5" />
                          </button>
                          <button
                            disabled={windowClosed}
                            onClick={() => openNegotiation(p)}
                            className={`px-3 py-1.5 rounded-md font-semibold transition-colors whitespace-nowrap ${
                              windowClosed
                                ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                                : !evalRes.allowed
                                  ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 cursor-pointer'
                                  : 'bg-emerald-500 hover:bg-emerald-400 text-zinc-950 cursor-pointer'
                            }`}
                          >
                            {!evalRes.allowed ? 'Consultar' : 'Negociar'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {searchResults.length === 0 && (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-zinc-500">
                      Nenhum atleta encontrado com esses filtros.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {subTab === 'vender' && (
        <div className="bg-[#111114] border border-zinc-800/90 rounded-xl overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="text-[11px] text-zinc-500 border-b border-zinc-800 bg-[#0d0d10]">
                <th className="py-2.5 px-3">Atleta</th>
                <th className="py-2.5 px-2">Pos</th>
                <th className="py-2.5 px-2">Fase / Nota</th>
                <th className="py-2.5 px-2 text-right">Idade</th>
                <th className="py-2.5 px-2 text-right">OVR/POT</th>
                <th className="py-2.5 px-2 text-right">Valor de Mercado</th>
                <th className="py-2.5 px-3 text-right">Disponibilidade no Mercado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {clubPlayers
                .slice()
                .sort((a, b) => b.overall - a.overall)
                .map((p) => {
                  const avg = getPlayerAvgRating(p);
                  const isBorrowed = Boolean(p.loan);
                  return (
                    <tr key={p.id} className="hover:bg-zinc-900/60">
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2.5">
                          <NationFlag nationality={p.nationality} size="sm" />
                          <button
                            type="button"
                            onClick={() => onInspectPlayer(p.id)}
                            className="font-medium text-white hover:text-emerald-400 text-left cursor-pointer"
                          >
                            {p.name}
                          </button>
                        </div>
                      </td>
                      <td className="py-2.5 px-2 font-mono text-zinc-400">{p.position}</td>
                      <td className="py-2.5 px-2 font-mono tabular-nums text-zinc-400">
                        {FORM_LABELS[p.form || 'normal']}
                        {avg > 0 ? ` · ${avg.toFixed(1)}` : ''}
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono tabular-nums text-zinc-400">{p.age}</td>
                      <td className="py-2.5 px-2 text-right font-mono tabular-nums">
                        <span className="text-white font-semibold">{p.overall}</span>
                        <span className="text-zinc-500">/{p.potential}</span>
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono tabular-nums text-zinc-300">
                        {formatCurrency(p.value)}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {isBorrowed ? (
                          <span className="font-mono text-[11px] text-sky-400">
                            Emprestado ({state.clubs[p.loan!.parentClubId]?.shortName})
                          </span>
                        ) : (
                          <div className="inline-flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => onToggleLoanList(p.id, !p.loanListed)}
                              className={`px-2.5 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
                                p.loanListed
                                  ? 'bg-sky-500/15 border border-sky-500/40 text-sky-300 hover:bg-sky-500/25'
                                  : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
                              }`}
                            >
                              {p.loanListed ? 'Empréstimo Ativo' : 'Emprestar'}
                            </button>
                            <button
                              onClick={() => onToggleTransferList(p.id, !p.transferListed, p.value)}
                              className={`px-3 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
                                p.transferListed
                                  ? 'bg-amber-500/15 border border-amber-500/40 text-amber-300 hover:bg-amber-500/25'
                                  : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200'
                              }`}
                            >
                              {p.transferListed ? 'À Venda' : 'Vender'}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}

      {subTab === 'emprestimos' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Loaned In */}
          <div className="p-5 bg-[#111114] border border-zinc-800/90 rounded-xl space-y-3">
            <div>
              <h3 className="font-display text-sm font-semibold text-white">
                Emprestados ao Clube ({loanedInPlayers.length})
              </h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                Retornam ao clube de origem ao iniciar a próxima temporada, salvo se você exercer a opção de compra.
              </p>
            </div>
            {loanedInPlayers.length === 0 ? (
              <div className="py-6 text-center text-xs text-zinc-500 border border-zinc-800/70 rounded-lg">
                Nenhum atleta emprestado no seu elenco atual.
              </div>
            ) : (
              <div className="divide-y divide-zinc-800/70">
                {loanedInPlayers.map((p) => {
                  const parent = state.clubs[p.loan!.parentClubId];
                  const avg = getPlayerAvgRating(p);
                  return (
                    <div key={p.id} className="py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                      <div className="min-w-0">
                        <button
                          type="button"
                          onClick={() => onInspectPlayer(p.id)}
                          className="font-semibold text-white hover:text-emerald-400 cursor-pointer"
                        >
                          {p.name}
                        </button>
                        <div className="text-[11px] font-mono text-zinc-400 mt-0.5">
                          Origem: {parent?.name || p.loan!.parentClubId} · {p.position} · {p.overall} OVR ·{' '}
                          {p.stats.appearances}J {p.stats.goals}G {p.stats.assists}A
                          {avg > 0 ? ` · Nota ${avg.toFixed(1)}` : ''}
                        </div>
                      </div>
                      {p.loan?.buyOptionPrice ? (
                        <button
                          disabled={userClub.budget < p.loan.buyOptionPrice}
                          onClick={() => onExerciseLoanBuyOption(p.id)}
                          className="px-3 py-1.5 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-zinc-950 rounded-lg cursor-pointer shrink-0"
                        >
                          Exercer Compra ({formatCurrency(p.loan.buyOptionPrice)})
                        </button>
                      ) : (
                        <span className="font-mono text-[11px] text-zinc-500">Sem opção de compra</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Loaned Out */}
          <div className="p-5 bg-[#111114] border border-zinc-800/90 rounded-xl space-y-3">
            <div>
              <h3 className="font-display text-sm font-semibold text-white">
                Emprestados pelo Clube ({loanedOutPlayers.length})
              </h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                Acompanhe a evolução e minutagem dos seus jogadores cedidos por empréstimo.
              </p>
            </div>
            {loanedOutPlayers.length === 0 ? (
              <div className="py-6 text-center text-xs text-zinc-500 border border-zinc-800/70 rounded-lg">
                Você não possui jogadores emprestados para outros clubes. Marque atletas em Lista de Saídas para receber ofertas.
              </div>
            ) : (
              <div className="divide-y divide-zinc-800/70">
                {loanedOutPlayers.map((p) => {
                  const dest = state.clubs[p.clubId];
                  const avg = getPlayerAvgRating(p);
                  return (
                    <div key={p.id} className="py-3 flex items-center justify-between gap-3 text-xs">
                      <div className="min-w-0">
                        <button
                          type="button"
                          onClick={() => onInspectPlayer(p.id)}
                          className="font-semibold text-white hover:text-emerald-400 cursor-pointer"
                        >
                          {p.name}
                        </button>
                        <div className="text-[11px] font-mono text-zinc-400 mt-0.5">
                          No {dest?.name || p.clubId} · {p.stats.appearances}J · {p.stats.minutes}&apos; ·{' '}
                          {p.stats.goals}G {p.stats.assists}A{avg > 0 ? ` · Nota ${avg.toFixed(1)}` : ''}
                        </div>
                      </div>
                      <div className="text-right font-mono tabular-nums shrink-0">
                        <div className="text-white font-semibold">{p.overall} OVR</div>
                        {p.stats.ovrDelta > 0 && (
                          <div className="text-[11px] text-emerald-400">+{p.stats.ovrDelta} evolução</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {subTab === 'propostas' && (
        <div className="space-y-3">
          {pendingOffers.length === 0 ? (
            <div className="p-8 bg-[#111114] border border-zinc-800/90 rounded-xl text-center text-sm text-zinc-400">
              Nenhuma proposta recebida no momento. Coloque jogadores à venda ou para empréstimo em Lista de Saídas e avance a fase.
            </div>
          ) : (
            pendingOffers.map((offer) => {
              const p = state.players[offer.playerId];
              const buyer = state.clubs[offer.fromClubId];
              if (!p || !buyer) return null;
              const isLoanOffer = offer.type === 'LOAN';
              const counterVal = counterDrafts[offer.id] ?? Math.round((offer.amount * 1.15) / 50000) * 50000;
              return (
                <div
                  key={offer.id}
                  className="p-4 bg-[#111114] border border-zinc-800 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-3">
                    <ClubCrest clubId={buyer.id} clubName={buyer.name} size="md" />
                    <div>
                      <div className="text-sm font-semibold text-white">
                        {buyer.name} quer {isLoanOffer ? 'o empréstimo de' : 'contratar'}{' '}
                        <button
                          type="button"
                          onClick={() => onInspectPlayer(p.id)}
                          className="text-emerald-400 hover:underline cursor-pointer"
                        >
                          {p.name}
                        </button>
                      </div>
                      <div className="text-xs text-zinc-400 font-mono tabular-nums mt-0.5">
                        {isLoanOffer ? (
                          <>
                            Taxa de empréstimo: <span className="text-emerald-400 font-semibold">{formatCurrency(offer.amount)}</span>
                            {offer.buyOptionPrice ? ` · Opção de compra: ${formatCurrency(offer.buyOptionPrice)}` : ' · Sem opção de compra'}
                          </>
                        ) : (
                          <>
                            Oferta: <span className="text-emerald-400 font-semibold">{formatCurrency(offer.amount)}</span> · Valor estimado: {formatCurrency(p.value)}
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        step={isLoanOffer ? 100000 : 500000}
                        value={counterVal}
                        onChange={(e) =>
                          setCounterDrafts((prev) => ({
                            ...prev,
                            [offer.id]: Number(e.target.value),
                          }))
                        }
                        className="w-32 px-2.5 py-1.5 text-xs font-mono tabular-nums bg-[#09090B] border border-zinc-800 rounded-lg text-white"
                      />
                      <button
                        onClick={() => onRespondOffer(offer.id, 'COUNTER', counterVal)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded-lg cursor-pointer"
                      >
                        <ArrowLeftRight className="w-3.5 h-3.5" />
                        Contraproposta
                      </button>
                    </div>

                    <button
                      onClick={() => onRespondOffer(offer.id, 'ACCEPT')}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-zinc-950 rounded-lg cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                      Aceitar
                    </button>

                    <button
                      onClick={() => onRespondOffer(offer.id, 'REJECT')}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-red-500/15 hover:bg-red-500/25 text-red-400 rounded-lg cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                      Recusar
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
