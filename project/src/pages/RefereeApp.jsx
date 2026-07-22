// Ventana aparte (#/referee, ver main.jsx) — análisis de árbitro de SofaScore:
// descarga sus últimos N partidos dirigidos y muestra distribución de
// tarjetas cada 10 min, promedio de tarjetas cada 5 min, y el marcador de
// cada partido que dirigió.
import { useState, useCallback, useEffect } from 'react';
import { downloadReferee, getRefereeAnalysis, getAvailableReferees } from '../api';

const TARJETA_COLOR = {
  Amarilla: { bar: 'bg-yellow-400', text: 'text-yellow-400' },
  Roja:     { bar: 'bg-red-600',    text: 'text-red-400' },
};
const TARJETA_ORDER = ['Amarilla', 'Roja'];

// "Roja (doble amarilla)" se agrupa con "Roja" para mostrar, igual que en
// P11_DistTarjetas (misma convención en toda la app).
function normalizeTipo(raw) {
  return String(raw || '').startsWith('Roja') ? 'Roja' : 'Amarilla';
}

function mergeByType(byType) {
  const merged = { Amarilla: 0, Roja: 0 };
  Object.entries(byType || {}).forEach(([k, v]) => { merged[normalizeTipo(k)] += v; });
  return merged;
}

// ─── FORMULARIO DE DESCARGA ───────────────────────────────────────────────────
function DownloadForm({ onLoaded }) {
  const [refInput, setRefInput]   = useState('');
  const [nPartidos, setNPartidos] = useState(20);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');

  const handleAnalyze = async () => {
    if (!refInput.trim()) return;
    setLoading(true); setError('');
    try {
      const dl = await downloadReferee(refInput.trim(), nPartidos);
      const analysis = await getRefereeAnalysis(dl.referee_id);
      onLoaded(analysis);
    } catch (e) {
      const detail = e?.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : (e?.message || 'Error al analizar el árbitro'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-gray-900 border border-purple-800/40 rounded-xl p-4 flex flex-col gap-3 max-w-xl">
      <div className="text-white font-bold text-sm">🧑‍⚖️ Analizar árbitro de SofaScore</div>
      <input value={refInput} onChange={e => setRefInput(e.target.value)}
        placeholder="URL de SofaScore o ID (ej: https://www.sofascore.com/football/referee/perez-gutierrez-roberto/786859)"
        className="bg-gray-800 border border-gray-600 text-white text-xs rounded-lg px-3 py-2 w-full focus:outline-none focus:border-purple-500"
        onKeyDown={e => e.key === 'Enter' && handleAnalyze()} />
      <div className="flex items-center gap-2">
        <span className="text-gray-400 text-xs">Partidos a analizar:</span>
        <input type="number" min={1} max={200} value={nPartidos} onChange={e => setNPartidos(e.target.value)}
          className="bg-gray-800 border border-gray-600 text-white text-xs rounded-lg px-2 py-1.5 w-20 focus:outline-none focus:border-purple-500" />
        <button onClick={handleAnalyze} disabled={loading || !refInput.trim()}
          className="ml-auto bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold px-4 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
          {loading ? '⏳ Analizando...' : '🚀 Analizar'}
        </button>
      </div>
      {error && <span className="text-red-400 text-[11px]">{error}</span>}
      <span className="text-gray-600 text-[10px]">
        Trae los últimos partidos finalizados dirigidos por ese árbitro (marcador + tarjetas), directo de SofaScore.
      </span>
    </div>
  );
}

// ─── BARRAS APILADAS (reusa el estilo de P11_DistTarjetas) ───────────────────
function StackedBar({ label, total, byType, maxVal, maxBarHeight, valueFmt }) {
  const height = total > 0 ? Math.max(4, (total / Math.max(maxVal, 0.0001)) * maxBarHeight) : 0;
  const merged = mergeByType(byType);
  const segments = TARJETA_ORDER.map(r => ({ r, n: merged[r] })).filter(s => s.n > 0);
  return (
    <div className="flex-1 flex flex-col items-center gap-0.5">
      {total > 0 && <span className="text-[9px] text-gray-400 font-bold leading-none">{valueFmt(total)}</span>}
      <div className="w-full flex flex-col-reverse rounded-t overflow-hidden" style={{ height: `${height}px` }}>
        {segments.map(({ r, n }) => (
          <div key={r} className={`w-full ${TARJETA_COLOR[r].bar}`}
            style={{ height: `${(n / total) * 100}%` }} title={`${r}: ${valueFmt(n)}`} />
        ))}
        {total === 0 && <div className="w-full h-1 bg-gray-700/40 rounded" />}
      </div>
      <span className="text-[8px] text-gray-600 leading-tight">{label}</span>
    </div>
  );
}

function CardDistChart({ title, subtitle, bins, valueKey, byTypeKey, valueFmt, totalLabel }) {
  if (!bins || bins.length === 0) return null;
  const values = bins.map(b => b[valueKey] || 0);
  const total = values.reduce((s, v) => s + v, 0);
  const maxVal = Math.max(...values, 0.0001);
  const chartHeight = 150;
  const maxBarHeight = chartHeight - 14;

  return (
    <div className="bg-gray-900/60 border border-purple-800/30 rounded-xl p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-purple-300 text-xs font-semibold">{title}</div>
          <div className="text-gray-500 text-[10px]">{subtitle}</div>
        </div>
        <span className="text-gray-500 text-[10px]">{totalLabel}: {valueFmt(total)}</span>
      </div>
      <div className="flex items-end gap-1" style={{ height: `${chartHeight}px` }}>
        {bins.map((b, i) => (
          <StackedBar key={i} label={b.label} total={b[valueKey] || 0} byType={b[byTypeKey]}
            maxVal={maxVal} maxBarHeight={maxBarHeight} valueFmt={valueFmt} />
        ))}
      </div>
      <div className="flex flex-wrap gap-3 pt-1 border-t border-gray-800">
        {TARJETA_ORDER.map(r => (
          <div key={r} className="flex items-center gap-1">
            <div className={`w-2 h-2 rounded-sm ${TARJETA_COLOR[r].bar}`} />
            <span className={`text-[10px] ${TARJETA_COLOR[r].text}`}>{r === 'Roja' ? 'Roja (incl. doble amarilla)' : r}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── PROMEDIO DE TARJETAS (sobre el subconjunto ya filtrado por competición) ──
function AvgCardsSummary({ matches }) {
  const n = matches?.length || 0;
  if (n === 0) return null;
  const yellow = matches.reduce((s, m) => s + (m.yellow || 0), 0);
  const red    = matches.reduce((s, m) => s + (m.red    || 0), 0);
  const tiles = [
    { label: '🟨 Promedio amarillas',       value: yellow / n, color: 'text-yellow-400' },
    { label: '🟥 Promedio rojas',           value: red    / n, color: 'text-red-400'    },
    { label: '🟨🟥 Promedio amarillas+rojas', value: (yellow + red) / n, color: 'text-purple-300' },
  ];
  return (
    <div className="flex flex-wrap gap-3">
      {tiles.map(t => (
        <div key={t.label} className="bg-gray-900/60 border border-purple-800/30 rounded-xl px-4 py-2.5 flex flex-col gap-0.5">
          <span className="text-gray-500 text-[10px]">{t.label}</span>
          <span className={`font-bold text-lg ${t.color}`}>{t.value.toFixed(2)}</span>
          <span className="text-gray-600 text-[9px]">por partido ({n})</span>
        </div>
      ))}
    </div>
  );
}

// ─── LISTA DE PARTIDOS DIRIGIDOS ──────────────────────────────────────────────
function MatchList({ matches }) {
  if (!matches || matches.length === 0) {
    return <div className="text-gray-500 text-xs">Sin partidos descargados.</div>;
  }
  return (
    <div className="bg-gray-900/60 border border-purple-800/30 rounded-xl overflow-hidden">
      <div className="max-h-96 overflow-auto">
        <table className="w-full text-xs">
          <thead className="bg-gray-900 sticky top-0">
            <tr className="text-gray-500 text-left">
              <th className="px-3 py-2 font-medium">Fecha</th>
              <th className="px-3 py-2 font-medium">Competición</th>
              <th className="px-3 py-2 font-medium">Partido</th>
              <th className="px-3 py-2 font-medium text-center">Marcador</th>
              <th className="px-3 py-2 font-medium text-right">Tarjetas</th>
            </tr>
          </thead>
          <tbody>
            {matches.map(m => (
              <tr key={m.match_id} className="border-t border-gray-800/60 hover:bg-gray-800/30">
                <td className="px-3 py-1.5 text-gray-400 whitespace-nowrap">{m.fecha || '—'}</td>
                <td className="px-3 py-1.5 text-gray-500 truncate max-w-[140px]">{m.tournament}</td>
                <td className="px-3 py-1.5 text-white truncate max-w-[220px]">{m.home_name} vs {m.away_name}</td>
                <td className="px-3 py-1.5 text-center text-white font-bold whitespace-nowrap">
                  {m.home_score ?? '?'} - {m.away_score ?? '?'}
                </td>
                <td className="px-3 py-1.5 text-right whitespace-nowrap">
                  {m.yellow > 0 && <span className="text-yellow-400">🟨{m.yellow}</span>}
                  {' '}
                  {m.red > 0 && <span className="text-red-400">🟥{m.red}</span>}
                  {m.cards_count === 0 && <span className="text-gray-600">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── ÁRBITROS YA DESCARGADOS ──────────────────────────────────────────────────
// Lista de raw_referees/ existentes — clic carga su análisis directo, sin
// tener que volver a pegar la URL/ID ni re-descargar de SofaScore.
function SavedRefereesList({ referees, activeId, loading, onSelect }) {
  if (!referees) return null;
  if (referees.length === 0) {
    return <div className="text-gray-600 text-[11px]">Todavía no descargaste ningún árbitro.</div>;
  }
  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-gray-400 text-xs font-semibold">📂 Árbitros ya descargados</div>
      <div className="flex flex-wrap gap-1.5">
        {referees.map(r => {
          const active = r.referee_id === activeId;
          return (
            <button key={r.referee_id} onClick={() => onSelect(r.referee_id)} disabled={loading}
              title={r.last_update_utc ? `Última descarga: ${r.last_update_utc}` : undefined}
              className={`text-[11px] px-2.5 py-1.5 rounded-lg border font-medium transition-all disabled:opacity-50
                ${active ? 'bg-purple-900/40 border-purple-500 text-purple-300' : 'bg-gray-800 border-gray-600 text-gray-300 hover:border-gray-400'}`}>
              {r.referee_name} <span className="text-gray-500">({r.n_matches})</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── FILTRO DE COMPETICIÓN (Liga 1, CONMEBOL, etc.) ──────────────────────────
// Multi-select: sin nada tildado = todas. Recalcula distribución/promedio en
// el backend sobre el subconjunto de partidos de las competiciones elegidas.
function CompetitionFilter({ tournaments, selected, onToggle, onReset, loading }) {
  if (!tournaments || tournaments.length <= 1) return null;
  const allSelected = selected.length === 0;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-gray-500 text-[10px] shrink-0">Competición:{loading && ' ⏳'}</span>
      <button onClick={onReset}
        className={`text-[10px] px-2 py-1 rounded-lg border font-medium transition-all
          ${allSelected ? 'bg-purple-900/40 border-purple-500 text-purple-300' : 'bg-gray-800 border-gray-600 text-gray-400 hover:border-gray-400'}`}>
        Todas ({tournaments.reduce((s, t) => s + t.count, 0)})
      </button>
      {tournaments.map(t => {
        const active = selected.includes(t.name);
        return (
          <button key={t.name} onClick={() => onToggle(t.name)}
            className={`text-[10px] px-2 py-1 rounded-lg border font-medium transition-all
              ${active ? 'bg-purple-900/40 border-purple-500 text-purple-300' : 'bg-gray-800 border-gray-600 text-gray-400 hover:border-gray-400'}`}>
            {t.name} ({t.count})
          </button>
        );
      })}
    </div>
  );
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────
export default function RefereeApp() {
  const [analysis, setAnalysis]     = useState(null);
  const [refereeId, setRefereeId]   = useState(null);
  const [selectedTournaments, setSelectedTournaments] = useState([]);
  const [filterLoading, setFilterLoading] = useState(false);

  const [savedReferees, setSavedReferees] = useState(null);
  const [loadingSaved, setLoadingSaved]   = useState(false);

  const refreshSaved = useCallback(() => {
    getAvailableReferees().then(setSavedReferees).catch(() => {});
  }, []);

  useEffect(() => { refreshSaved(); }, [refreshSaved]);

  const handleLoaded = (data) => {
    setAnalysis(data);
    setRefereeId(data.referee.id);
    setSelectedTournaments([]);
    refreshSaved();
  };

  const handleSelectSaved = (id) => {
    if (id === refereeId) return;
    setLoadingSaved(true);
    getRefereeAnalysis(id)
      .then(handleLoaded)
      .catch(() => {})
      .finally(() => setLoadingSaved(false));
  };

  const refetchWithFilter = useCallback(async (nextSelected, id) => {
    setFilterLoading(true);
    try {
      const data = await getRefereeAnalysis(id, nextSelected);
      setAnalysis(data);
    } catch {
      // el error ya se muestra al descargar — un filtro que falla se ignora en silencio
    } finally {
      setFilterLoading(false);
    }
  }, []);

  const handleToggleTournament = (name) => {
    const next = selectedTournaments.includes(name)
      ? selectedTournaments.filter(n => n !== name)
      : [...selectedTournaments, name];
    setSelectedTournaments(next);
    refetchWithFilter(next, refereeId);
  };

  const handleResetTournaments = () => {
    setSelectedTournaments([]);
    refetchWithFilter([], refereeId);
  };

  return (
    <div className="w-screen min-h-screen bg-gray-950 p-3 md:p-5 flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="text-2xl">🧑‍⚖️</span>
        <span className="text-white font-bold text-lg">Analizador de Árbitro</span>
        <span className="text-purple-400 font-bold text-lg">SofaScore</span>
      </div>

      <DownloadForm onLoaded={handleLoaded} />

      <SavedRefereesList referees={savedReferees} activeId={refereeId} loading={loadingSaved} onSelect={handleSelectSaved} />

      {analysis && (
        <div className="flex flex-col gap-4">
          <div className="bg-gray-900 border border-purple-700/50 rounded-xl px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-2">
            <div>
              <div className="text-white font-bold text-base">{analysis.referee.name}</div>
              <div className="text-gray-500 text-xs">{analysis.referee.country}</div>
            </div>
            <div className="flex gap-4 text-xs text-gray-400">
              <span>Partidos (carrera): <strong className="text-white">{analysis.referee.career_games ?? '—'}</strong></span>
              <span>🟨 Carrera: <strong className="text-yellow-400">{analysis.referee.career_yellow ?? '—'}</strong></span>
              <span>🟥 Carrera: <strong className="text-red-400">{analysis.referee.career_red ?? '—'}</strong></span>
            </div>
            <div className="ml-auto text-xs text-purple-300">
              {selectedTournaments.length > 0
                ? `${analysis.n_matches_analyzed} de ${analysis.n_matches_total} partidos (filtrado)`
                : `${analysis.n_matches_analyzed} partido${analysis.n_matches_analyzed === 1 ? '' : 's'} analizado${analysis.n_matches_analyzed === 1 ? '' : 's'}`}
            </div>
          </div>

          <CompetitionFilter
            tournaments={analysis.available_tournaments}
            selected={selectedTournaments}
            onToggle={handleToggleTournament}
            onReset={handleResetTournaments}
            loading={filterLoading} />

          <AvgCardsSummary matches={analysis.matches} />

          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1 min-w-0">
              <CardDistChart
                title="🟨🟥 Distribución de tarjetas por tramo (10 min)"
                subtitle="Total de tarjetas mostradas/repartidas en sus partidos"
                bins={analysis.distribution_10}
                valueKey="count" byTypeKey="by_type"
                valueFmt={v => String(v)}
                totalLabel="Total" />
            </div>
            <div className="flex-1 min-w-0">
              <CardDistChart
                title="📊 Promedio de tarjetas por tramo (5 min)"
                subtitle="Promedio por partido dirigido"
                bins={analysis.distribution_5_avg}
                valueKey="avg" byTypeKey="by_type_avg"
                valueFmt={v => v.toFixed(2)}
                totalLabel="Promedio total" />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <div className="text-white font-bold text-sm">📋 Partidos dirigidos</div>
            <MatchList matches={analysis.matches} />
          </div>
        </div>
      )}
    </div>
  );
}
