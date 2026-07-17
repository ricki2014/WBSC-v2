// TAB — Distribución de tarjetas por tramo
import { useState, useEffect, useMemo } from 'react';
import { fetchCardDistribution } from '../api';
import { computePositions } from '../lib/pitchLayout';

const TARJETA_COLOR = {
  'Amarilla': { bar: 'bg-yellow-400', text: 'text-yellow-400' },
  'Roja':     { bar: 'bg-red-600',    text: 'text-red-400'   },
};
const TARJETA_ORDER = ['Amarilla', 'Roja'];

// La hoja "Tarjetas Detalle" distingue "Roja" de "Roja (doble amarilla)" —
// para el filtro/gráfico las tratamos como una sola categoría (expulsión).
function normalizeTipo(raw) {
  return String(raw || '').startsWith('Roja') ? 'Roja' : 'Amarilla';
}

function mergeByTipo(byResult) {
  const merged = { Amarilla: 0, Roja: 0 };
  Object.entries(byResult || {}).forEach(([k, v]) => { merged[normalizeTipo(k)] += v; });
  return merged;
}

// Aplica el filtro de tipo (Ambas/Amarilla/Roja) recalculando el total de
// cada tramo — así la altura de barra refleja solo lo que se está mostrando.
function applyTypeFilter(distribution, typeFilter) {
  if (!distribution) return distribution;
  return distribution.map(bin => {
    const merged = mergeByTipo(bin.by_result);
    if (typeFilter === 'Ambas') {
      return { ...bin, count: merged.Amarilla + merged.Roja, by_result: merged };
    }
    const n = merged[typeFilter] || 0;
    return { ...bin, count: n, by_result: { [typeFilter]: n } };
  });
}

function playerLabel(player) {
  const full = player.name || player.shortName || '';
  const parts = full.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0][0].toUpperCase()}. ${parts.slice(1).join(' ')}`;
  return full;
}

const playerUid = p => p.id != null ? `p${p.id}` : `${p.side}-${p.lineupOrder}`;

// ─── ESCALA DE CALOR (acumulación de tarjetas a lo largo del partido) ────────
function heatColorForMinute(avgMinute) {
  const t = Math.max(0, Math.min(1, avgMinute / 90));
  const hue   = 135 - t * 135;
  const light = 78 - t * 33;
  return `hsl(${hue.toFixed(0)}, 68%, ${light.toFixed(0)}%)`;
}

function binMidpoint(label) {
  if (label === '90+') return 95;
  const [start, end] = label.split('-').map(Number);
  return (start + end) / 2;
}

// ─── FILTRO DE TIPO (Ambas / Amarillas / Rojas) ──────────────────────────────
const TYPE_OPTIONS = [
  { value: 'Ambas',    label: 'Ambas'        },
  { value: 'Amarilla', label: '🟨 Amarillas' },
  { value: 'Roja',     label: '🟥 Rojas'     },
];

function TypeFilter({ value, onChange }) {
  return (
    <div className="flex gap-1">
      {TYPE_OPTIONS.map(o => {
        const active = value === o.value;
        const activeCls = o.value === 'Roja'
          ? 'bg-red-900/40 border-red-500 text-red-300'
          : o.value === 'Amarilla'
            ? 'bg-yellow-900/30 border-yellow-400 text-yellow-300'
            : 'bg-gray-700 border-gray-400 text-white';
        return (
          <button key={o.value} onClick={() => onChange(o.value)}
            className={`text-[10px] px-2 py-1 rounded-lg border font-medium transition-all
              ${active ? activeCls : 'bg-gray-800 border-gray-600 text-gray-400 hover:border-gray-400'}`}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── FILTRO GANANDO / EMPATE / PERDIENDO (marcador en el instante de la tarjeta) ──
// Un solo filtro para los DOS paneles: "Ganando" muestra las tarjetas de CADA
// equipo cuando ESE equipo iba ganando en ese momento (no solo team1).
// Requiere raw_json descargado (event+incidents) para saber el marcador en
// cada minuto — partidos sin esos datos quedan afuera del filtro.
const SCORELINE_OPTIONS = [
  { value: 'Todas',     label: 'Todas'       },
  { value: 'Ganando',   label: '🟢 Ganando'  },
  { value: 'Empate',    label: '⚪ Empate'   },
  { value: 'Perdiendo', label: '🔴 Perdiendo' },
];

function ScorelineFilter({ value, onChange }) {
  return (
    <div className="flex gap-1">
      {SCORELINE_OPTIONS.map(o => {
        const active = value === o.value;
        return (
          <button key={o.value} onClick={() => onChange(o.value)}
            className={`text-[10px] px-2 py-1 rounded-lg border font-medium transition-all
              ${active ? 'bg-gray-700 border-gray-400 text-white' : 'bg-gray-800 border-gray-600 text-gray-400 hover:border-gray-400'}`}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── TOGGLE "NORMALIZADO" ─────────────────────────────────────────────────────
// Un conteo crudo de "tarjetas ganando" está sesgado por cuánto tiempo pasa
// cada equipo ganando — un equipo que casi nunca gana va a tener pocas
// tarjetas ahí aunque saque muchas cada vez que gana. Normalizado muestra
// tarjetas CADA 90' REALMENTE jugados en cada estado, para comparar parejo.
function NormalizedToggle({ active, onChange }) {
  return (
    <button onClick={() => onChange(!active)}
      className={`text-[10px] px-2 py-1 rounded-lg border font-medium transition-all
        ${active ? 'bg-purple-900/40 border-purple-500 text-purple-300' : 'bg-gray-800 border-gray-600 text-gray-400 hover:border-gray-400'}`}>
      📐 Normalizado
    </button>
  );
}

const SCORELINE_STYLE = {
  Ganando:   { icon: '🟢', bar: 'bg-green-500' },
  Empate:    { icon: '⚪', bar: 'bg-gray-400'  },
  Perdiendo: { icon: '🔴', bar: 'bg-red-500'   },
};

// ─── PANEL "NORMALIZADO" (cada 90' jugados en ese estado) ────────────────────
function NormalizedPanel({ states, loading, color, unitLabel, n_matches_reliable }) {
  if (loading) return <div className="flex items-center justify-center py-6 text-gray-500 text-xs">Cargando...</div>;
  if (!states || states.length === 0) return (
    <div className="flex items-center justify-center py-6 text-gray-500 text-xs">Sin datos</div>
  );
  const accent  = color === 'green' ? 'text-green-400' : color === 'red' ? 'text-red-400' : 'text-blue-400';
  const border  = color === 'green' ? 'border-green-800/30' : color === 'red' ? 'border-red-800/30' : 'border-blue-800/30';
  const maxRate = Math.max(...states.map(s => s.rate_per_90 || 0), 0.01);
  return (
    <div className={`bg-gray-900/60 border ${border} rounded-xl p-3 flex flex-col gap-3`}>
      <div className="flex items-center justify-between">
        <span className={`text-xs font-semibold ${accent}`}>📐 Normalizado — {unitLabel} cada 90' jugados en ese estado</span>
        {n_matches_reliable != null && <span className="text-gray-500 text-[10px]">{n_matches_reliable} partidos con dato</span>}
      </div>
      {states.map(s => (
        <div key={s.state} className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-300">{SCORELINE_STYLE[s.state]?.icon} {s.state}</span>
            <span className="text-white font-bold">{s.rate_per_90 != null ? s.rate_per_90.toFixed(2) : '—'} / 90'</span>
          </div>
          <div className="w-full h-2 bg-gray-800 rounded overflow-hidden">
            <div className={`h-full ${SCORELINE_STYLE[s.state]?.bar ?? 'bg-gray-600'}`}
              style={{ width: `${s.rate_per_90 != null ? Math.max(2, (s.rate_per_90 / maxRate) * 100) : 0}%` }} />
          </div>
          <span className="text-gray-600 text-[10px]">{s.count} en {s.minutes}' jugados</span>
        </div>
      ))}
    </div>
  );
}

// ─── BARRAS ───────────────────────────────────────────────────────────────────
function CardBar({ bin, maxCount, maxBarHeight }) {
  const total  = bin.count;
  const height = Math.max(4, (total / Math.max(maxCount, 1)) * maxBarHeight);
  const segments = TARJETA_ORDER
    .map(r => ({ r, n: bin.by_result?.[r] || 0 }))
    .filter(s => s.n > 0);
  return (
    <div className="flex-1 flex flex-col items-center gap-0.5">
      {total > 0 && <span className="text-[9px] text-gray-400 font-bold leading-none">{total}</span>}
      <div className="w-full flex flex-col-reverse rounded-t overflow-hidden" style={{ height: `${height}px` }}>
        {segments.map(({ r, n }) => (
          <div key={r} className={`w-full ${TARJETA_COLOR[r]?.bar ?? 'bg-gray-600'}`}
            style={{ height: `${(n / total) * 100}%` }} title={`${r}: ${n}`} />
        ))}
        {total === 0 && <div className="w-full h-1 bg-gray-700/40 rounded" />}
      </div>
    </div>
  );
}

function DistChart({ distribution, subtitle, color, loading, noDataMsg, sharedMax }) {
  const compact = distribution && distribution.length > 12;
  if (loading) return <div className="flex items-center justify-center py-6 text-gray-500 text-xs">Cargando...</div>;
  if (!distribution || distribution.length === 0) return (
    <div className="flex items-center justify-center py-6 text-gray-500 text-xs">{noDataMsg || 'Sin datos'}</div>
  );
  const total = distribution.reduce((s, d) => s + d.count, 0);
  if (total === 0) return (
    <div className="flex items-center justify-center py-6 text-gray-500 text-xs">Sin tarjetas registradas</div>
  );
  const localMax  = Math.max(...distribution.map(d => d.count), 1);
  const maxCount  = Math.max(sharedMax || 0, localMax);
  const chartHeight  = 140;
  const maxBarHeight = chartHeight - 14;
  const accent   = color === 'green' ? 'text-green-400' : color === 'red' ? 'text-red-400' : 'text-blue-400';
  const border   = color === 'green' ? 'border-green-800/30' : color === 'red' ? 'border-red-800/30' : 'border-blue-800/30';
  const byRes = {};
  distribution.forEach(d => {
    Object.entries(d.by_result || {}).forEach(([r, n]) => { byRes[r] = (byRes[r] || 0) + n; });
  });
  return (
    <div className={`bg-gray-900/60 border ${border} rounded-xl p-3 flex flex-col gap-2`}>
      <div className="flex items-center justify-between">
        <span className={`text-xs font-semibold ${accent}`}>{subtitle}</span>
        <span className="text-gray-500 text-[10px]">{total} tarjetas</span>
      </div>
      <div className={`flex items-end ${compact ? 'gap-0.5' : 'gap-1.5'}`} style={{ height: `${chartHeight}px` }}>
        {distribution.map((d, i) => <CardBar key={i} bin={d} maxCount={maxCount} maxBarHeight={maxBarHeight} />)}
      </div>
      <div className={`flex ${compact ? 'gap-0.5' : 'gap-1.5'}`}>
        {distribution.map((d, i) => (
          <div key={i} className={`flex-1 text-center text-gray-600 leading-tight ${compact ? 'text-[6px]' : 'text-[8px]'}`}>
            {d.label}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 pt-1 border-t border-gray-800">
        {TARJETA_ORDER.filter(r => byRes[r]).map(r => (
          <div key={r} className="flex items-center gap-1">
            <div className={`w-2 h-2 rounded-sm ${TARJETA_COLOR[r]?.bar ?? 'bg-gray-600'}`} />
            <span className={`text-[10px] ${TARJETA_COLOR[r]?.text ?? 'text-gray-400'}`}>{r} ({byRes[r]})</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── PANEL DE EQUIPO (gráficos 10+5 min) ─────────────────────────────────────
function TeamPanel({ file, teamName, color, selMatches, selCond, typeFilter, scorelineFilter, normalized, onMaxUpdate, sharedMax10, sharedMax5 }) {
  const [raw10, setRaw10] = useState(null); // distribución cruda (sin filtro de tipo)
  const [raw5,  setRaw5]  = useState(null);
  const [normData, setNormData] = useState(null); // Ganando/Empate/Perdiendo cada 90' (Amarillas+Rojas juntas)
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState('all');

  // Normalizado es una llamada aparte (una sola, no hay 10/5 min acá) — pisa
  // la vista de tramos mientras está activo. No distingue Amarilla/Roja (el
  // filtro de tipo de arriba queda inerte en este modo).
  useEffect(() => {
    if (!file || !normalized) return;
    setLoading(true);
    fetchCardDistribution(file, selectedMatch, 10, null, selMatches, 'Propio', selCond, scorelineFilter, true)
      .then(d => { setNormData(d); setMatches(d.matches || []); })
      .catch(() => setNormData(null))
      .finally(() => setLoading(false));
  }, [file, selMatches, selCond, scorelineFilter, normalized, selectedMatch]);

  useEffect(() => {
    if (!file || normalized) return;
    setLoading(true);
    Promise.all([
      fetchCardDistribution(file, 'all', 10, null, selMatches, 'Propio', selCond, scorelineFilter),
      fetchCardDistribution(file, 'all', 5, null, selMatches, 'Propio', selCond, scorelineFilter),
    ])
      .then(([d10, d5]) => {
        setRaw10(d10.distribution); setRaw5(d5.distribution);
        setMatches(d10.matches || []); setSelectedMatch('all');
      })
      .catch(() => { setRaw10(null); setRaw5(null); setMatches([]); })
      .finally(() => setLoading(false));
  }, [file, selMatches, selCond, scorelineFilter, normalized]);

  const handleMatchChange = (matchId) => {
    setSelectedMatch(matchId);
    if (!file || normalized) return; // el efecto de arriba maneja el refetch en modo normalizado
    setLoading(true);
    Promise.all([
      fetchCardDistribution(file, matchId, 10, null, selMatches, 'Propio', selCond, scorelineFilter),
      fetchCardDistribution(file, matchId, 5, null, selMatches, 'Propio', selCond, scorelineFilter),
    ])
      .then(([d10, d5]) => { setRaw10(d10.distribution); setRaw5(d5.distribution); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  // El filtro de tipo (Ambas/Amarillas/Rojas) se aplica en el cliente, sin
  // volver a pedir al backend — así cambiar el filtro es instantáneo.
  const data10 = useMemo(() => applyTypeFilter(raw10, typeFilter), [raw10, typeFilter]);
  const data5  = useMemo(() => applyTypeFilter(raw5,  typeFilter), [raw5,  typeFilter]);

  useEffect(() => {
    if (!onMaxUpdate) return;
    const max10 = data10?.length ? Math.max(...data10.map(d => d.count), 0) : 0;
    const max5  = data5?.length  ? Math.max(...data5.map(d => d.count), 0)  : 0;
    onMaxUpdate({ max10, max5 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data10, data5]);

  const accentBorder = color === 'green' ? 'border-green-700/50' : 'border-blue-700/50';
  const accentText   = color === 'green' ? 'text-green-400' : 'text-blue-400';

  return (
    <div className="flex-1 flex flex-col gap-3 min-w-0">
      <div className={`bg-gray-900 border ${accentBorder} rounded-xl px-3 py-2 shrink-0`}>
        <div className={`text-xs font-bold mb-1.5 ${accentText}`}>{teamName} · Filtro de partido</div>
        <select value={selectedMatch} onChange={e => handleMatchChange(e.target.value)}
          className="w-full bg-gray-800 border border-gray-600 text-white text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-green-500">
          <option value="all">Todos los partidos ({matches.length})</option>
          {matches.map(m => (
            <option key={m.match_id} value={m.match_id}>{m.partido} ({m.condicion})</option>
          ))}
        </select>
      </div>
      {normalized ? (
        <NormalizedPanel states={normData?.states} loading={loading} color={color} unitLabel="tarjetas" n_matches_reliable={normData?.n_matches_reliable} />
      ) : (
        <>
          <DistChart distribution={data10} subtitle="Tramos de 10 min" color={color} loading={loading} sharedMax={sharedMax10} />
          <DistChart distribution={data5}  subtitle="Tramos de 5 min"  color={color} loading={loading} sharedMax={sharedMax5} />
        </>
      )}
    </div>
  );
}

// ─── PUNTO DE JUGADOR EN CANCHA ───────────────────────────────────────────────
function PlayerDot({ player, selected, onClick, heat }) {
  const isTeam1 = player.team === 'team1';
  const baseColor = isTeam1 ? 'bg-red-700 border-red-400' : 'bg-blue-700 border-blue-400';
  const label = playerLabel(player);

  const heatColor = heat ? heatColorForMinute(heat.avgMinute) : null;
  const circleStyle = heatColor
    ? { backgroundColor: heatColor, borderColor: 'rgba(255,255,255,0.7)' }
    : undefined;
  const ringCls = selected ? 'ring-2 ring-yellow-400 scale-110' : 'group-hover:scale-105';

  return (
    <div
      onClick={() => onClick(player)}
      className="absolute flex flex-col items-center select-none cursor-pointer group"
      style={{ left: `${player.x}%`, top: `${player.y}%`, transform: 'translate(-50%,-50%)' }}>
      <div className={`w-10 h-10 rounded-full border-2 flex items-center justify-center font-bold text-white text-sm shadow-lg transition-all
        ${heatColor ? ringCls : baseColor + ' ' + ringCls}`}
        style={{ ...circleStyle, textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}
        title={heat ? `Minuto promedio de tarjeta: ${heat.avgMinute.toFixed(0)}' (${heat.total} tarjetas)` : undefined}>
        {player.number ?? '?'}
      </div>
      <span className="text-[10px] text-white bg-black/70 px-1 rounded truncate max-w-[72px] text-center mt-0.5 leading-tight">
        {label}
      </span>
    </div>
  );
}

function HeatLegend() {
  const STOPS = 20;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex rounded overflow-hidden h-2.5 w-full max-w-md">
        {Array.from({ length: STOPS }, (_, i) => (
          <div key={i} className="flex-1" style={{ background: heatColorForMinute((i / (STOPS - 1)) * 90) }} />
        ))}
      </div>
      <div className="flex justify-between text-[8px] text-gray-500 w-full max-w-md">
        <span>0-30' (tarjetas temprano)</span>
        <span>61-90+' (tarjetas tarde)</span>
      </div>
    </div>
  );
}

function FieldMarkings() {
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
      <rect x="0" y="0" width="100" height="100" fill="none" stroke="white" strokeWidth="0.5" opacity="0.2"/>
      <line x1="50" y1="0" x2="50" y2="100" stroke="white" strokeWidth="0.5" opacity="0.2"/>
      <circle cx="50" cy="50" r="10" fill="none" stroke="white" strokeWidth="0.5" opacity="0.2"/>
      <rect x="0" y="28" width="14" height="44" fill="none" stroke="white" strokeWidth="0.5" opacity="0.15"/>
      <rect x="86" y="28" width="14" height="44" fill="none" stroke="white" strokeWidth="0.5" opacity="0.15"/>
      <rect x="0" y="40" width="4" height="20" fill="none" stroke="white" strokeWidth="0.5" opacity="0.1"/>
      <rect x="96" y="40" width="4" height="20" fill="none" stroke="white" strokeWidth="0.5" opacity="0.1"/>
    </svg>
  );
}

// ─── SECCIÓN CAMPO + DIST POR JUGADOR ────────────────────────────────────────
function PlayerCardSection({ lineupData, manualPos, fieldSwapped, baseSwapped, selectedFiles, team1Name, team2Name, matches1, matches2, cond1, cond2, typeFilter }) {
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [playerDistRaw, setPlayerDistRaw]   = useState(null);
  const [loadingDist, setLoadingDist]       = useState(false);
  const [playerHeat, setPlayerHeat]         = useState({}); // uid -> { avgMinute, total }

  const swapped = fieldSwapped;

  const positions = useMemo(
    () => manualPos ?? computePositions(lineupData, swapped, baseSwapped),
    [manualPos, lineupData, swapped, baseSwapped]
  );

  const playerDist = useMemo(() => applyTypeFilter(playerDistRaw, typeFilter), [playerDistRaw, typeFilter]);

  useEffect(() => {
    if (!positions.length) { setPlayerHeat({}); return; }
    let cancelled = false;

    const jobs = positions
      .map(p => ({ p, isTeam1: p.team === 'team1' }))
      .map(({ p, isTeam1 }) => ({
        p,
        file: isTeam1 ? selectedFiles?.f1 : selectedFiles?.f2,
        matches: isTeam1 ? matches1 : matches2,
        cond: isTeam1 ? cond1 : cond2,
      }))
      .filter(j => j.file);

    Promise.all(jobs.map(j =>
      fetchCardDistribution(j.file, 'all', 10, j.p.name || j.p.shortName || '', j.matches, 'Propio', j.cond)
        .then(d => ({ uid: playerUid(j.p), dist: d.distribution || [] }))
        .catch(() => ({ uid: playerUid(j.p), dist: [] }))
    )).then(results => {
      if (cancelled) return;
      const map = {};
      results.forEach(({ uid, dist }) => {
        let weightedSum = 0, total = 0;
        dist.forEach(bin => {
          total += bin.count;
          weightedSum += bin.count * binMidpoint(bin.label);
        });
        if (total > 0) {
          map[uid] = { avgMinute: weightedSum / total, total };
        }
      });
      setPlayerHeat(map);
    });

    return () => { cancelled = true; };
  }, [positions, selectedFiles?.f1, selectedFiles?.f2, matches1, matches2, cond1, cond2]);

  const handlePlayerClick = (player) => {
    if (selectedPlayer && (selectedPlayer.id ?? selectedPlayer.lineupOrder) === (player.id ?? player.lineupOrder)) {
      setSelectedPlayer(null);
      setPlayerDistRaw(null);
      return;
    }
    setSelectedPlayer(player);
    setPlayerDistRaw(null);

    const isTeam1Player = player.team === 'team1';
    const file = isTeam1Player ? selectedFiles?.f1 : selectedFiles?.f2;
    if (!file) return;

    const name = player.name || player.shortName || '';
    setLoadingDist(true);
    fetchCardDistribution(file, 'all', 10, name, isTeam1Player ? matches1 : matches2, 'Propio', isTeam1Player ? cond1 : cond2)
      .then(d => setPlayerDistRaw(d.distribution))
      .catch(() => setPlayerDistRaw(null))
      .finally(() => setLoadingDist(false));
  };

  if (!lineupData) return null;

  const team1Label = team1Name || (baseSwapped ? lineupData.away_name : lineupData.home_name) || 'Equipo 1';
  const team2Label = team2Name || (baseSwapped ? lineupData.home_name : lineupData.away_name) || 'Equipo 2';
  const selLabel = selectedPlayer ? playerLabel(selectedPlayer) : null;

  return (
    <div className="flex flex-col gap-3 border-t border-gray-700/50 pt-3 mt-1">
      <div className="text-white font-bold text-sm shrink-0">
        🟨🟥 Tarjetas por jugador · clic para ver distribución (10 min)
      </div>

      <div className="flex flex-col md:flex-row gap-3">
        {/* Campo */}
        <div className="flex-1 flex flex-col gap-1 min-w-0">
          <div className="flex flex-wrap items-center gap-4 text-xs mb-1">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-700"/>
              <span className="text-gray-300">{team1Label}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-blue-700"/>
              <span className="text-gray-300">{team2Label}</span>
            </div>
            {selectedPlayer && (
              <span className="ml-auto text-[10px] text-yellow-400">
                ● {selLabel} seleccionado · clic de nuevo para deseleccionar
              </span>
            )}
          </div>
          <div className="relative bg-green-900 rounded-xl border-2 border-green-700 overflow-hidden" style={{ height: '320px' }}>
            <FieldMarkings />
            {positions.map((p, i) => {
              const isSel = selectedPlayer &&
                (selectedPlayer.id ?? selectedPlayer.lineupOrder) === (p.id ?? p.lineupOrder);
              return (
                <PlayerDot
                  key={`${p.side}-${p.id ?? i}`}
                  player={p}
                  selected={isSel}
                  onClick={handlePlayerClick}
                  heat={playerHeat[playerUid(p)]}
                />
              );
            })}
            {positions.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center text-green-600/40 text-sm">
                Sin jugadores en cancha
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <span className="text-[9px] text-gray-500 shrink-0">🔥 Acumulación de tarjetas (minuto promedio):</span>
            <HeatLegend />
          </div>
        </div>

        {/* Gráfico del jugador seleccionado */}
        <div className="w-full md:w-56 lg:w-72 shrink-0 flex flex-col justify-center">
          {!selectedPlayer ? (
            <div className="h-full flex items-center justify-center text-gray-600 text-xs text-center border border-gray-700/40 rounded-xl p-4">
              Seleccioná un jugador en la cancha para ver su distribución de tarjetas
            </div>
          ) : (
            <DistChart
              distribution={playerDist}
              subtitle={`${selLabel} · Tarjetas por tramo (10 min)`}
              color={selectedPlayer?.team === 'team1' ? 'green' : 'blue'}
              loading={loadingDist}
              noDataMsg="Sin tarjetas para este jugador"
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────
export default function P11_DistTarjetas({
  analysis, selectedFiles,
  lineupData, manualPos, fieldSwapped, baseSwapped,
  team1Name, team2Name, matches1, matches2, cond1, cond2,
}) {
  const [team1Max, setTeam1Max] = useState({ max10: 0, max5: 0 });
  const [team2Max, setTeam2Max] = useState({ max10: 0, max5: 0 });
  const [typeFilter, setTypeFilter] = useState('Ambas');
  const [scorelineFilter, setScorelineFilter] = useState('Todas');
  const [normalized, setNormalized] = useState(false);
  const sharedMax10 = Math.max(team1Max.max10, team2Max.max10, 1);
  const sharedMax5  = Math.max(team1Max.max5,  team2Max.max5,  1);

  if (!analysis) return (
    <div className="h-full flex items-center justify-center text-gray-500 text-sm">
      <div className="text-center">
        <div className="text-4xl mb-3">🟨🟥</div>
        <div>Selecciona equipos y pulsa <strong className="text-white">Analizar</strong></div>
        <div className="text-[11px] text-gray-600 mt-1">Requiere hoja "Tarjetas Detalle" en el Excel</div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-3 p-1">
      {/* Encabezado */}
      <div className="flex flex-wrap items-center gap-2 shrink-0">
        <span className="text-white font-bold text-sm">🟨🟥 Distribución de tarjetas por tramo</span>
        <div className="flex gap-1 ml-2">
          {TARJETA_ORDER.map(r => (
            <div key={r} className="flex items-center gap-0.5">
              <div className={`w-2 h-2 rounded-sm ${TARJETA_COLOR[r].bar}`} />
              <span className="text-[9px] text-gray-500">{r}</span>
            </div>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <span className="text-[10px] text-gray-500">Filtro:</span>
          <TypeFilter value={typeFilter} onChange={setTypeFilter} />
          <span className="text-[10px] text-gray-500 ml-2">Marcador:</span>
          <ScorelineFilter value={scorelineFilter} onChange={setScorelineFilter} />
          <NormalizedToggle active={normalized} onChange={setNormalized} />
        </div>
      </div>

      {/* Paneles por equipo */}
      <div className="flex flex-col md:flex-row gap-3">
        <TeamPanel file={selectedFiles?.f1} teamName={analysis.team1?.name} color="green" selMatches={matches1} selCond={cond1}
          typeFilter={typeFilter} scorelineFilter={scorelineFilter} normalized={normalized} onMaxUpdate={setTeam1Max} sharedMax10={sharedMax10} sharedMax5={sharedMax5} />
        <TeamPanel file={selectedFiles?.f2} teamName={analysis.team2?.name} color="blue"  selMatches={matches2} selCond={cond2}
          typeFilter={typeFilter} scorelineFilter={scorelineFilter} normalized={normalized} onMaxUpdate={setTeam2Max} sharedMax10={sharedMax10} sharedMax5={sharedMax5} />
      </div>

      {(scorelineFilter !== 'Todas' || normalized) && (
        <div className="text-[10px] text-amber-500/80 shrink-0 -mt-1">
          ⚠ Solo cuentan los partidos con datos descargados de SofaScore (raw_json) — un partido sin esos datos no puede saber el marcador minuto a minuto y queda afuera del filtro{normalized ? '/normalizado' : ''}.
        </div>
      )}

      <div className="text-[10px] text-gray-600 shrink-0">
        Tarjetas de la hoja "Tarjetas Detalle" · filtrá por partido para ver cada juego individualmente
      </div>

      {/* Campo interactivo por jugador */}
      <PlayerCardSection
        lineupData={lineupData}
        manualPos={manualPos}
        fieldSwapped={fieldSwapped}
        baseSwapped={baseSwapped}
        selectedFiles={selectedFiles}
        team1Name={team1Name}
        team2Name={team2Name}
        matches1={matches1}
        matches2={matches2}
        cond1={cond1}
        cond2={cond2}
        typeFilter={typeFilter}
      />
    </div>
  );
}
