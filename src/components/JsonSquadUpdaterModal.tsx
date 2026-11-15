import React, { useMemo, useRef, useState } from 'react';
import {
  X,
  Upload,
  Download,
  FileCode2,
  Check,
  RotateCcw,
  Sparkles,
  AlertTriangle,
} from 'lucide-react';
import { parseCustomDataset } from '../engine/dataLoader';
import {
  exportClubToJson,
  exportRawDatasetToJson,
  JsonApplyMode,
  previewJsonSquadUpdate,
  SAMPLE_QUICK_SQUAD_JSON,
} from '../engine/jsonSquadEngine';
import { Club, GameState, Player, RawDataset } from '../types/game';

interface JsonSquadUpdaterModalProps {
  modeContext: 'HUB' | 'CAREER';
  baseDataset: RawDataset;
  isCustomDataset?: boolean;
  gameState?: GameState;
  userClub?: Club;
  clubPlayers?: Player[];
  onClose: () => void;
  onApplyToDataset?: (
    incoming: RawDataset,
    applyMode: JsonApplyMode,
    replaceClubSquads: boolean
  ) => void;
  onApplyToCareer?: (
    incoming: RawDataset,
    replaceClubSquads: boolean,
    alsoUpdateBase: boolean
  ) => void;
  onResetOfficialDataset?: () => void;
}

function triggerJsonDownload(filename: string, content: string) {
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export const JsonSquadUpdaterModal: React.FC<JsonSquadUpdaterModalProps> = ({
  modeContext,
  baseDataset,
  isCustomDataset = false,
  gameState,
  userClub,
  clubPlayers,
  onClose,
  onApplyToDataset,
  onApplyToCareer,
  onResetOfficialDataset,
}) => {
  const [jsonText, setJsonText] = useState<string>('');
  const [fileName, setFileName] = useState<string>('atualizacao.json');
  const [applyMode, setApplyMode] = useState<JsonApplyMode>('MERGE');
  const [replaceClubSquads, setReplaceClubSquads] = useState<boolean>(false);
  const [alsoUpdateBase, setAlsoUpdateBase] = useState<boolean>(true);
  const [dragging, setDragging] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const parsedResult = useMemo<{
    dataset: RawDataset | null;
    error: string | null;
  }>(() => {
    const trimmed = jsonText.trim();
    if (!trimmed) return { dataset: null, error: null };
    try {
      const ds = parseCustomDataset(trimmed, fileName);
      if (ds.players.length === 0) {
        return { dataset: null, error: 'Nenhum jogador encontrado no JSON informado.' };
      }
      return { dataset: ds, error: null };
    } catch (err) {
      return {
        dataset: null,
        error: err instanceof Error ? err.message : 'Erro ao interpretar o JSON.',
      };
    }
  }, [jsonText, fileName]);

  const preview = useMemo(() => {
    if (!parsedResult.dataset) return null;
    if (modeContext === 'CAREER' && gameState) {
      return previewJsonSquadUpdate(
        parsedResult.dataset,
        { kind: 'STATE', state: gameState },
        'MERGE',
        replaceClubSquads
      );
    }
    return previewJsonSquadUpdate(
      parsedResult.dataset,
      { kind: 'DATASET', dataset: baseDataset },
      applyMode,
      replaceClubSquads
    );
  }, [parsedResult.dataset, modeContext, gameState, baseDataset, applyMode, replaceClubSquads]);

  const loadFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setFileName(file.name);
        setJsonText(reader.result);
        // Smart auto-default: large full datasets (> 800 players) default to REPLACE in Hub
        if (modeContext === 'HUB') {
          try {
            const ds = parseCustomDataset(reader.result, file.name);
            if (ds.players.length >= 1000) {
              setApplyMode('REPLACE');
            } else {
              setApplyMode('MERGE');
            }
          } catch {
            // handled in parsedResult
          }
        }
      }
    };
    reader.readAsText(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) loadFile(file);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) loadFile(file);
  };

  const handleLoadMyClubIntoEditor = () => {
    if (!userClub || !clubPlayers) return;
    setFileName(`${userClub.id}.json`);
    setJsonText(exportClubToJson(userClub.name, userClub.id, clubPlayers));
  };

  const handleDownloadExport = () => {
    if (modeContext === 'CAREER' && userClub && clubPlayers) {
      triggerJsonDownload(
        `${userClub.id}-elenco.json`,
        exportClubToJson(userClub.name, userClub.id, clubPlayers)
      );
      return;
    }
    triggerJsonDownload('pitchcommand-base-elencos.json', exportRawDatasetToJson(baseDataset));
  };

  const handleConfirmApply = () => {
    if (!parsedResult.dataset) return;
    if (modeContext === 'CAREER' && onApplyToCareer) {
      onApplyToCareer(parsedResult.dataset, replaceClubSquads, alsoUpdateBase);
      onClose();
    } else if (modeContext === 'HUB' && onApplyToDataset) {
      onApplyToDataset(parsedResult.dataset, applyMode, replaceClubSquads);
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl max-h-[90vh] bg-[#111114] border border-zinc-800 rounded-xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-800 flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-bold text-white">
              {modeContext === 'CAREER'
                ? 'Atualizar Elencos na Carreira (JSON)'
                : 'Atualizar Elencos & Base de Dados (JSON / CSV)'}
            </h2>
            <p className="text-xs text-zinc-400 mt-1">
              {modeContext === 'CAREER'
                ? 'Cole um JSON rápido ou envie um arquivo para transferir atletas, ajustar OVR/POT e adicionar reforços sem perder a temporada.'
                : 'Atualize elencos rapidamente mesclando alterações pontuais ou substituindo a base completa.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-white rounded-lg cursor-pointer"
            aria-label="Fechar atualizador JSON"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Quick Actions Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,.csv"
                onChange={handleFileChange}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-zinc-100 hover:bg-white text-zinc-950 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                Escolher Arquivo .json / .csv
              </button>

              {modeContext === 'CAREER' && userClub && (
                <button
                  type="button"
                  onClick={handleLoadMyClubIntoEditor}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-emerald-400 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <FileCode2 className="w-3.5 h-3.5" />
                  Editar Meu Clube ({userClub.shortName})
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  setFileName('exemplo-atualizacao.json');
                  setJsonText(SAMPLE_QUICK_SQUAD_JSON);
                  setApplyMode('MERGE');
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                Carregar Exemplo
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleDownloadExport}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-[#09090B] hover:bg-zinc-900 border border-zinc-800 text-zinc-300 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                {modeContext === 'CAREER' ? 'Exportar Clube (.json)' : 'Exportar Base (.json)'}
              </button>

              {modeContext === 'HUB' && isCustomDataset && onResetOfficialDataset && (
                <button
                  type="button"
                  onClick={() => {
                    onResetOfficialDataset();
                    onClose();
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-300 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Restaurar Oficial
                </button>
              )}
            </div>
          </div>

          {/* Mode Selector */}
          <div className="p-4 bg-[#09090B] border border-zinc-800/90 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
            {modeContext === 'HUB' ? (
              <div className="flex items-center gap-1 p-1 bg-[#111114] border border-zinc-800 rounded-lg self-start">
                <button
                  type="button"
                  onClick={() => setApplyMode('MERGE')}
                  className={`px-3.5 py-1.5 text-xs font-medium rounded-md whitespace-nowrap cursor-pointer ${
                    applyMode === 'MERGE'
                      ? 'bg-emerald-500 text-zinc-950 font-semibold'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  Mesclar / Atualizar (Rápido)
                </button>
                <button
                  type="button"
                  onClick={() => setApplyMode('REPLACE')}
                  className={`px-3.5 py-1.5 text-xs font-medium rounded-md whitespace-nowrap cursor-pointer ${
                    applyMode === 'REPLACE'
                      ? 'bg-emerald-500 text-zinc-950 font-semibold'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  Substituir Base Completa
                </button>
              </div>
            ) : (
              <div className="text-xs text-zinc-300">
                Modo ativo: <span className="text-emerald-400 font-semibold">Mesclar alterações na carreira</span> (mantém tabela, jogos e finanças)
              </div>
            )}

            <div className="flex flex-col sm:flex-row sm:items-center gap-4 text-xs text-zinc-300">
              {(modeContext === 'CAREER' || applyMode === 'MERGE') && (
                <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={replaceClubSquads}
                    onChange={(e) => setReplaceClubSquads(e.target.checked)}
                    className="accent-emerald-500 w-3.5 h-3.5"
                  />
                  <span>Substituir elenco completo dos clubes citados</span>
                </label>
              )}

              {modeContext === 'CAREER' && (
                <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={alsoUpdateBase}
                    onChange={(e) => setAlsoUpdateBase(e.target.checked)}
                    className="accent-emerald-500 w-3.5 h-3.5"
                  />
                  <span>Salvar também na base padrão</span>
                </label>
              )}
            </div>
          </div>

          {/* Paste / Drop Editor */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            className={`rounded-xl border transition-colors ${
              dragging ? 'border-emerald-500 bg-emerald-500/5' : 'border-zinc-800 bg-[#09090B]'
            }`}
          >
            <div className="px-4 py-2 border-b border-zinc-800/80 flex items-center justify-between text-[11px] font-mono text-zinc-400">
              <span>
                Aceita: {'[{ name, club, overall, ... }]'}, {'{ club, players: [...] }'}, {'{ colunas, linhas }'} ou {'{ "Arsenal": [...] }'}
              </span>
              {jsonText && (
                <button
                  type="button"
                  onClick={() => setJsonText('')}
                  className="text-zinc-500 hover:text-zinc-200 cursor-pointer"
                >
                  Limpar
                </button>
              )}
            </div>
            <textarea
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              spellCheck={false}
              placeholder='Cole aqui seu JSON de atualização (ex: [{ "name": "Kylian Mbappé", "club": "Real Madrid", "overall": 92 }]) ou arraste um arquivo .json/.csv...'
              className="w-full h-56 p-4 bg-transparent text-xs font-mono text-zinc-100 placeholder:text-zinc-600 focus:outline-none resize-y"
            />
          </div>

          {/* Validation Error */}
          {parsedResult.error && (
            <div className="p-3.5 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-2.5 text-xs text-red-300">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
              <span>{parsedResult.error}</span>
            </div>
          )}

          {/* Live Diff Preview */}
          {preview && (
            <div className="p-4 bg-[#09090B] border border-zinc-800 rounded-xl space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800/80 pb-2.5">
                <span className="font-display text-sm font-semibold text-white">
                  Pré-Visualização das Alterações
                </span>
                <span className="text-xs font-mono tabular-nums text-zinc-400">
                  {preview.totalIncoming.toLocaleString('pt-BR')} registros lidos · {preview.affectedClubNames.length} clube(s)
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono tabular-nums">
                <div className="p-2.5 bg-[#111114] border border-zinc-800/80 rounded-lg">
                  <div className="text-zinc-500">Atualizados</div>
                  <div className="text-base font-bold text-white mt-0.5">{preview.updatedCount}</div>
                </div>
                <div className="p-2.5 bg-[#111114] border border-zinc-800/80 rounded-lg">
                  <div className="text-zinc-500">Transferidos</div>
                  <div className="text-base font-bold text-amber-400 mt-0.5">{preview.transferredCount}</div>
                </div>
                <div className="p-2.5 bg-[#111114] border border-zinc-800/80 rounded-lg">
                  <div className="text-zinc-500">Novos Adicionados</div>
                  <div className="text-base font-bold text-emerald-400 mt-0.5">{preview.addedCount}</div>
                </div>
                <div className="p-2.5 bg-[#111114] border border-zinc-800/80 rounded-lg">
                  <div className="text-zinc-500">Removidos</div>
                  <div className="text-base font-bold text-red-400 mt-0.5">{preview.removedCount}</div>
                </div>
              </div>

              {preview.unresolvedClubNames.length > 0 && (
                <div className="text-xs text-amber-300">
                  Clubes novos (não encontrados na base atual, serão criados):{' '}
                  <span className="font-mono">{preview.unresolvedClubNames.join(', ')}</span>
                </div>
              )}

              {preview.changes.length > 0 && (
                <div className="space-y-1 pt-1">
                  {preview.changes.map((line, i) => (
                    <div key={i} className="text-xs font-mono text-zinc-300">
                      · {line}
                    </div>
                  ))}
                  {preview.totalIncoming > preview.changes.length && (
                    <div className="text-[11px] font-mono text-zinc-500">
                      + mais alterações serão aplicadas...
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-zinc-800 bg-[#0d0d10] flex items-center justify-between gap-3">
          <div className="text-xs text-zinc-500">
            {modeContext === 'CAREER'
              ? 'Escalações afetadas são ajustadas automaticamente após a atualização.'
              : 'Alterações ficam salvas localmente para suas próximas carreiras.'}
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={!parsedResult.dataset}
              onClick={handleConfirmApply}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed text-zinc-950 rounded-lg cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              {modeContext === 'CAREER' ? 'Aplicar na Carreira' : 'Aplicar Atualização'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
