// TAB 7 — Stats en cancha (valores históricos esperados, sin descuento en vivo)
import { useState, useMemo, useEffect, useCallback } from 'react';
import { fetchPlayerMatches } from '../api';
import { computePositions } from '../lib/pitchLayout';

const STAT_OPTIONS = [
  { key: 'Goles p90',       label: 'Goles',           icon: '⚽', color: 'text-yellow-400' },
  { key: 'Asist. p90',      label: 'Asistencias',     icon: '👟', color: 'text-blue-400'   },
  { key: 'Tiros p90',       label: 'Tiros Totales',   icon: '🎯', color: 'text-orange-400' },
  { key: 'Al Arco p90',     label: 'Tiros al Arco',   icon: '🥅', color: 'text-green-400'  },
  { key: 'Faltas Com. p90', label: 'Faltas Cometidas',icon: '🤛', color: 'text-red-400'    },
  { key: 'Faltas Rec. p90', label: 'Faltas Recibidas',icon: '🛡️', color: 'text-emerald-400'},
  { key: 'P. Clave p90',    label: 'Pases Clave',     icon: '🔑', color: 'text-purple-400' },
  { key: 'Recup. p90',      label: 'Recuperaciones',  icon: '💪', color: 'text-cyan-400'   },
  { key: 'Interc. p90',     label: 'Intercepciones',  icon: '✋', color: 'text-pink-400'   },
  { key: 'Duelos %',        label: 'Duelos %',        icon: '⚔️', color: 'text-amber-400'  },
  { key: 'Pases %',         label: 'Pases %',         icon: '🔄', color: 'text-sky-400'    },
  { key: 'Tiros Arco %',    label: 'Precisión Tiro',  icon: '🎯', color: 'text-lime-400'   },
];


const playerUid = p => p.id != null ? `p${p.id}` : `${p.side}-${p.lineupOrder}`;

function findStats(player, statsMap) {
  const names = [player.shortName, player.name].filter(Boolean);
  for (const name of names) {
    const nl = name.toLowerCase();
    if (statsMap[nl]) return statsMap[nl];
    for (const [key, val] of Object.entries(statsMap)) {
      const tokens = nl.split(' ').filter(t => t.length > 3);
      if (tokens.some(t => key.includes(t))) return val;
      const ktokens = key.split(' ').filter(t => t.length > 3);
      if (ktokens.some(t => nl.includes(t))) return val;
    }
  }
  return null;
}

function fmt(val) {
  if (val === null || val === undefined) return null;
  const n = parseFloat(val);
  if (isNaN(n)) return null;
  if (n >= 100) return Math.round(n).toString();
  if (n % 1 === 0) return n.toString();
  return n.toFixed(1);
}

function FieldMarkings() {
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
      <rect x="0" y="0" width="100" height="100" fill="none" stroke="white" strokeWidth="0.4" opacity="0.25"/>
      <line x1="50" y1="0" x2="50" y2="100" stroke="white" strokeWidth="0.4" opacity="0.25"/>
      <circle cx="50" cy="50" r="10" fill="none" stroke="white" strokeWidth="0.4" opacity="0.25"/>
      <circle cx="50" cy="50" r="0.6" fill="white" opacity="0.3"/>
      <rect x="0" y="28" width="14" height="44" fill="none" stroke="white" strokeWidth="0.4" opacity="0.2"/>
      <rect x="86" y="28" width="14" height="44" fill="none" stroke="white" strokeWidth="0.4" opacity="0.2"/>
      <rect x="0" y="40" width="4" height="20" fill="none" stroke="white" strokeWidth="0.4" opacity="0.15"/>
      <rect x="96" y="40" width="4" height="20" fill="none" stroke="white" strokeWidth="0.4" opacity="0.15"/>
    </svg>
  );
}

// ─── MODAL HISTORIAL (igual que P7) ──────────────────────────────────────────
const COL_HEADER = {
  '_fecha': 'Fecha', '_partido': 'Partido', '_lv': 'L/V',
  '_min': 'Min', '_ht': 'HT', '_ft': 'FT', '_stat': '',
  '_x_rating': 'Rating', '_x_goles': 'Goles', '_x_asistencias': 'Asis.', '_x_tiros_al_arco': 'Arco',
};

function PlayerMatchModal({ player, statOption, file, teamName, onClose }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!file || !player) return;
    setLoading(true);
    fetchPlayerMatches(file, player.name || player.shortName || '', statOption.key)
      .then(d => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [file, player, statOption.key]);

  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const rawMatches = data?.matches || [];
  const statCol    = data?.stat_col;

  const rows = rawMatches.map(r => {
    const isLocal = String(r.condicion || '').toUpperCase() === 'LOCAL';
    const rival   = r.rival || r.opponent || r.oponente || '?';
    const teamHT  = isLocal ? r.homeScore_HT : r.awayScore_HT;
    const rivalHT = isLocal ? r.awayScore_HT : r.homeScore_HT;
    const teamFT  = isLocal ? r.homeScore_FT : r.awayScore_FT;
    const rivalFT = isLocal ? r.awayScore_FT : r.homeScore_FT;
    const out = {};
    const fechaKey = ['fecha','date','match_date','partido_id'].find(k => r[k] != null && r[k] !== 0);
    if (fechaKey) out['_fecha'] = r[fechaKey];
    out['_partido'] = `${teamName || '?'} - ${rival}`;
    out['_lv'] = isLocal ? 'L' : 'V';
    if (r.minutos_jugados != null) out['_min'] = r.minutos_jugados;
    out['_ht'] = `${teamHT ?? '?'} - ${rivalHT ?? '?'}`;
    out['_ft'] = `${teamFT ?? '?'} - ${rivalFT ?? '?'}`;
    if (statCol && r[statCol] != null) out['_stat'] = r[statCol];
    for (const c of ['rating','goles','asistencias','tiros_al_arco']) {
      if (r[c] != null && c !== statCol) out[`_x_${c}`] = r[c];
    }
    return out;
  });

  const headers = { ...COL_HEADER, '_stat': statOption.label };
  const displayCols = rows.length ? Object.keys(rows[0]) : [];
  const statTotal = rows.reduce((s, r) => s + (typeof r['_stat'] === 'number' ? r['_stat'] : 0), 0);

  const isWin = row => {
    const parts = String(row['_ft'] || '').split('-').map(Number);
    if (parts.length !== 2 || isNaN(parts[0]) || isNaN(parts[1])) return null;
    return parts[0] > parts[1] ? 'W' : parts[0] < parts[1] ? 'L' : 'D';
  };

  return (
    <div className="absolute inset-0 z-50 bg-black/90 flex flex-col rounded-xl overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 bg-gray-900 border-b border-gray-700 shrink-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-lg">{statOption.icon}</span>
          <span className="text-white font-bold text-sm">{player.name || player.shortName}</span>
          <span className={`text-xs font-semibold ${statOption.color}`}>· {statOption.label}</span>
          {rawMatches.length > 0 && <span className="text-gray-500 text-[10px]">({rawMatches.length} partidos)</span>}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-gray-500 text-[10px]">ESC para cerrar</span>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-lg leading-none">✕</button>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-2">
        {loading && <div className="flex items-center justify-center h-full text-gray-500 text-sm">Cargando...</div>}
        {!loading && rows.length === 0 && <div className="flex items-center justify-center h-full text-gray-500 text-sm">Sin datos</div>}
        {!loading && rows.length > 0 && (
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-gray-800 sticky top-0 z-10">
                <th className="px-2 py-1.5 text-gray-400 text-left font-semibold border-b border-gray-700">#</th>
                {displayCols.map(col => (
                  <th key={col} className={`px-2 py-1.5 text-left font-semibold border-b border-gray-700 whitespace-nowrap
                    ${col === '_stat' ? `${statOption.color} bg-gray-700` : 'text-gray-400'}`}>
                    {headers[col] || col}
                  </th>
                ))}
                <th className="px-2 py-1.5 text-gray-600 text-left font-semibold border-b border-gray-700">R</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const result = isWin(row);
                return (
                  <tr key={i} className={`border-b border-gray-800/60 ${i % 2 === 0 ? 'bg-gray-900/30' : ''} hover:bg-gray-700/40`}>
                    <td className="px-2 py-1.5 text-gray-600">{i + 1}</td>
                    {displayCols.map(col => (
                      <td key={col} className={`px-2 py-1.5 whitespace-nowrap
                        ${col === '_stat'    ? `font-bold ${statOption.color} bg-gray-800/50`
                        : col === '_lv'      ? (row[col] === 'L' ? 'text-green-400' : 'text-blue-400')
                        : col === '_partido' ? 'text-white font-medium'
                        : col === '_ht'      ? 'text-gray-400 font-mono'
                        : col === '_ft'      ? 'text-white font-mono font-bold'
                        : 'text-gray-300'}`}>
                        {row[col] == null ? '—' : typeof row[col] === 'number' ? (Number.isInteger(row[col]) ? row[col] : row[col].toFixed(2)) : String(row[col])}
                      </td>
                    ))}
                    <td className={`px-2 py-1.5 font-bold text-center
                      ${result === 'W' ? 'text-green-400' : result === 'L' ? 'text-red-400' : result === 'D' ? 'text-yellow-400' : 'text-gray-600'}`}>
                      {result || '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-gray-800 border-t-2 border-gray-600">
                <td colSpan={displayCols.indexOf('_stat') + 2} className="px-2 py-1.5 text-gray-500 text-[10px]">TOTAL</td>
                <td className={`px-2 py-1.5 font-bold ${statOption.color}`}>{statTotal}</td>
                <td colSpan={displayCols.length - displayCols.indexOf('_stat')} />
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  );
}

function playerLabel(player) {
  const full = player.name || player.shortName || '';
  const parts = full.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0][0].toUpperCase()}. ${parts.slice(1).join(' ')}`;
  return full;
}

// ─── PUNTO EN CAMPO ───────────────────────────────────────────────────────────
function PlayerDot({ player, statOption, pStats, onDoubleClick }) {
  const isTeam1 = player.team === 'team1';
  const bg     = isTeam1 ? 'bg-red-700 border-red-400' : 'bg-blue-700 border-blue-400';
  const label  = playerLabel(player);

  const val = pStats?.[statOption.key] ?? null;
  const badge = fmt(val);

  return (
    <div
      onDoubleClick={e => { e.stopPropagation(); onDoubleClick(player); }}
      className="absolute flex flex-col items-center select-none cursor-pointer"
      style={{ left: `${player.x}%`, top: `${player.y}%`, transform: 'translate(-50%,-50%)' }}>

      <div className={`text-[10px] font-bold px-1.5 py-0.5 rounded border mb-0.5 leading-none min-w-[28px] text-center
        ${badge !== null ? 'bg-black/85 border-gray-600 text-white' : 'opacity-0 pointer-events-none'}`}>
        {badge !== null ? `${statOption.icon} ${badge}` : '·'}
      </div>

      <div className={`w-12 h-12 rounded-full border-2 flex items-center justify-center font-bold text-white text-sm shadow-lg ${bg}`}>
        {player.number ?? '?'}
      </div>
      <span className="text-[11px] text-white bg-black/70 px-1 rounded truncate max-w-[80px] text-center mt-0.5 leading-tight">
        {label}
      </span>
    </div>
  );
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────
export default function P8_StatsEnCancha({
  analysis, lineupData, manualPos, setManualPos,
  fieldSwapped, baseSwapped, team1Name, team2Name, selectedFiles,
  selectedStatKey, setSelectedStatKey,
}) {
  const selectedKey    = selectedStatKey;
  const setSelectedKey = setSelectedStatKey;
  const [modalPlayer, setModalPlayer] = useState(null);
  const swapped = fieldSwapped;

  const handleCloseModal = useCallback(() => setModalPlayer(null), []);

  const statsMap = useMemo(() => {
    if (!analysis) return { team1: {}, team2: {} };
    const buildMap = (rankings) => {
      const map = {};
      Object.values(rankings || {}).forEach(roleRows => {
        (roleRows || []).forEach(row => {
          const name = (row.jugador || '').toLowerCase();
          if (name) map[name] = { ...(map[name] || {}), ...row };
        });
      });
      return map;
    };
    return {
      team1: buildMap(analysis.rankings?.team1),
      team2: buildMap(analysis.rankings?.team2),
    };
  }, [analysis]);

  const positions = useMemo(
    () => manualPos ?? computePositions(lineupData, swapped, baseSwapped),
    [manualPos, lineupData, swapped, baseSwapped]
  );

  const statOption = STAT_OPTIONS.find(s => s.key === selectedKey) || STAT_OPTIONS[0];

  // Nombres/formaciones fijos por identidad real (team1=rojo, team2=azul),
  // independientes del lado visual — así el color siempre coincide con el
  // equipo real, incluso al compartir el estado con otra sesión (push/pull).
  const team1Label = team1Name || (baseSwapped ? lineupData?.away_name : lineupData?.home_name) || 'Equipo 1';
  const team2Label = team2Name || (baseSwapped ? lineupData?.home_name : lineupData?.away_name) || 'Equipo 2';

  const isModalTeam1 = modalPlayer ? modalPlayer.team === 'team1' : false;
  const modalFile     = modalPlayer ? (isModalTeam1 ? selectedFiles?.f1 : selectedFiles?.f2) : null;
  const modalTeamName = modalPlayer ? (isModalTeam1 ? team1Name : team2Name) : null;

  if (!lineupData) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500 text-sm">
        <div className="text-center">
          <div className="text-4xl mb-3">📌</div>
          <div>Carga una alineación desde</div>
          <div className="text-yellow-400 font-medium mt-1">Alineaciones</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row gap-3">

      {/* ── CAMPO ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col gap-2">

        <div className="flex flex-wrap items-center gap-3 text-xs shrink-0">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-700"/>
            <span className="text-gray-300 font-medium">{team1Label}</span>
            {lineupData.home_formation && <span className="text-gray-500 font-mono">{baseSwapped ? lineupData.away_formation : lineupData.home_formation}</span>}
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-blue-700"/>
            <span className="text-gray-300 font-medium">{team2Label}</span>
            {lineupData.away_formation && <span className="text-gray-500 font-mono">{baseSwapped ? lineupData.home_formation : lineupData.away_formation}</span>}
          </div>
          <div className="ml-auto text-[10px] text-gray-500">
            {statOption.icon} <span className={`font-bold ${statOption.color}`}>{statOption.label}</span>
            <span className="text-gray-600"> · promedio histórico p90 · doble click para historial</span>
          </div>
        </div>

        <div className="flex-1 relative bg-green-900 rounded-xl border-2 border-green-700 overflow-hidden min-h-[320px]">
          <FieldMarkings />
          {positions.map((p, i) => {
            const pStats = findStats(p, p.team === 'team1' ? statsMap.team1 : statsMap.team2);
            return (
              <PlayerDot
                key={`${p.side}-${p.id ?? i}`}
                player={p}
                statOption={statOption}
                pStats={pStats}
                onDoubleClick={setModalPlayer}
              />
            );
          })}
          {positions.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-green-600/40 text-sm">
              Sin jugadores en cancha
            </div>
          )}

          {modalPlayer && (
            <PlayerMatchModal
              player={modalPlayer}
              statOption={statOption}
              file={modalFile}
              teamName={modalTeamName}
              onClose={handleCloseModal}
            />
          )}
        </div>

        <div className="bg-gray-900/40 border border-gray-700/40 rounded-lg p-2 text-[10px] text-gray-500 shrink-0">
          {statOption.icon} Valor histórico promedio por 90 min · estático, no decrece · doble click en jugador para ver partido a partido
        </div>
      </div>

      {/* ── SIDEBAR ───────────────────────────────────────────────────────── */}
      <div className="w-full md:w-32 lg:w-44 shrink-0 flex flex-col gap-1.5 overflow-auto">
        <div className="text-white font-bold text-xs mb-0.5 shrink-0">📌 Estadística</div>
        {STAT_OPTIONS.map(s => {
          const active = selectedKey === s.key;
          return (
            <button
              key={s.key}
              onClick={() => setSelectedKey(s.key)}
              className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg border text-left transition-all
                ${active
                  ? 'bg-gray-700 border-gray-400 shadow-inner'
                  : 'bg-gray-900 border-gray-700/60 hover:bg-gray-800 hover:border-gray-500'}`}>
              <span className="text-sm shrink-0">{s.icon}</span>
              <div className="min-w-0 flex-1">
                <div className={`text-[11px] font-medium leading-tight ${active ? s.color : 'text-gray-300'}`}>
                  {s.label}
                </div>
                <div className="text-[9px] text-gray-600 leading-tight">{s.key}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
