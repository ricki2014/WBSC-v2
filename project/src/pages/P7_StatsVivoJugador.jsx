// TAB 7 — Stats en vivo por jugador
import { useState, useMemo, useEffect, useCallback } from 'react';
import { fetchPlayerMatches } from '../api';

// Estadísticas disponibles con su equivalente en playerEvents
const STAT_OPTIONS = [
  { key: 'Goles p90',       label: 'Goles',            liveKey: 'Gol',      icon: '⚽', color: 'text-yellow-400' },
  { key: 'Asist. p90',      label: 'Asistencias',      liveKey: null,       icon: '👟', color: 'text-blue-400'   },
  { key: 'Tiros p90',       label: 'Tiros Totales',    liveKey: 'Disparo',  icon: '🎯', color: 'text-orange-400' },
  { key: 'Al Arco p90',     label: 'Tiros al Arco',    liveKey: 'TiroArco', icon: '🥅', color: 'text-green-400'  },
  { key: 'Faltas Com. p90', label: 'Faltas Cometidas', liveKey: 'FoulCom',  icon: '🤛', color: 'text-red-400'    },
  { key: 'Faltas Rec. p90', label: 'Faltas Recibidas', liveKey: 'FoulRec',  icon: '🛡️', color: 'text-emerald-400'},
  { key: 'P. Clave p90',    label: 'Pases Clave',      liveKey: null,       icon: '🔑', color: 'text-purple-400' },
  { key: 'Recup. p90',      label: 'Recuperaciones',   liveKey: null,       icon: '💪', color: 'text-cyan-400'   },
  { key: 'Interc. p90',     label: 'Intercepciones',   liveKey: null,       icon: '✋', color: 'text-pink-400'   },
  { key: 'Duelos %',        label: 'Duelos %',         liveKey: null,       icon: '⚔️', color: 'text-amber-400'  },
];

// ─── FORMACIÓN → COORDENADAS ──────────────────────────────────────────────────
function layoutFormation(players, formation, side) {
  const posOrder = { G: 0, D: 1, M: 2, F: 3 };
  const starters = players
    .filter(p => !p.isSubstitute)
    .sort((a, b) => (posOrder[a.position] ?? 2) - (posOrder[b.position] ?? 2));

  const isHome = side === 'home';
  const fNums  = (formation || '').split('-').map(Number).filter(n => n > 0);

  const gks      = starters.filter(p => p.position === 'G');
  const outfield = starters.filter(p => p.position !== 'G');

  const layers = [gks];
  if (fNums.length >= 1) {
    let rest = [...outfield];
    fNums.forEach(count => layers.push(rest.splice(0, count)));
    if (rest.length) layers[layers.length - 1].push(...rest);
  } else if (outfield.length) {
    layers.push(outfield);
  }

  const totalL = layers.length;
  const result = [];
  layers.forEach((group, li) => {
    const n = group.length;
    if (!n) return;
    const ratio = totalL <= 1 ? 0 : li / (totalL - 1);
    const x = isHome ? 4 + ratio * 43 : 96 - ratio * 43;
    group.forEach((player, pi) => {
      const y = n === 1 ? 50 : 8 + ((n - 1 - pi) / (n - 1)) * 84;
      result.push({ ...player, x, y: isHome ? y : 100 - y, side, team: side === 'home' ? 'team1' : 'team2' });
    });
  });
  return result;
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

const playerUid = p => p.id != null ? `p${p.id}` : `${p.side}-${p.lineupOrder}`;

// Busca las stats históricas de un jugador en el mapa (exacto luego por tokens)
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

// ─── MODAL HISTORIAL JUGADOR ──────────────────────────────────────────────────
const COL_LABELS = {
  fecha: 'Fecha', date: 'Fecha', match_date: 'Fecha', partido_id: 'Partido',
  rival: 'Rival', opponent: 'Rival', oponente: 'Rival',
  condicion: 'L/V', minutos_jugados: 'Min',
  homeScore_HT: 'Loc HT', awayScore_HT: 'Vis HT',
  homeScore_FT: 'Loc FT', awayScore_FT: 'Vis FT',
  goles: 'Goles', asistencias: 'Asis.', tiros_al_arco: 'Arco',
  faltas_cometidas: 'F.Com', faltas_recibidas: 'F.Rec',
  pases_clave: 'P.Clave', recuperaciones: 'Recup.', intercepciones: 'Interc.',
  duelos_ganados: 'Duelos G.', duelos_total: 'Duelos T.',
  tiros_totales: 'Tiros', rating: 'Rating',
};

function PlayerMatchModal({ player, statOption, file, teamName, onClose }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!file || !player) return;
    const name = player.name || player.shortName || '';
    setLoading(true);
    fetchPlayerMatches(file, name, statOption.key)
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

  // Transformar filas: siempre "equipo - rival" y marcador desde perspectiva del equipo
  const rows = rawMatches.map(r => {
    const isLocal = String(r.condicion || '').toUpperCase() === 'LOCAL';
    const rival   = r.rival || r.opponent || r.oponente || '?';
    const teamHT  = isLocal ? r.homeScore_HT : r.awayScore_HT;
    const rivalHT = isLocal ? r.awayScore_HT : r.homeScore_HT;
    const teamFT  = isLocal ? r.homeScore_FT : r.awayScore_FT;
    const rivalFT = isLocal ? r.awayScore_FT : r.homeScore_FT;

    const out = {};
    // Fecha
    const fechaKey = ['fecha','date','match_date','partido_id'].find(k => r[k] != null && r[k] !== 0);
    if (fechaKey) out['_fecha'] = r[fechaKey];
    // Partido como "equipo - rival"
    out['_partido'] = `${teamName || '?'} - ${rival}`;
    // L/V
    out['_lv'] = isLocal ? 'L' : 'V';
    // Minutos
    if (r.minutos_jugados != null) out['_min'] = r.minutos_jugados;
    // Marcadores
    out['_ht'] = `${teamHT ?? '?'} - ${rivalHT ?? '?'}`;
    out['_ft'] = `${teamFT ?? '?'} - ${rivalFT ?? '?'}`;
    // Stat principal
    if (statCol && r[statCol] != null) out['_stat'] = r[statCol];
    // Extras
    for (const c of ['rating','goles','asistencias','tiros_al_arco']) {
      if (r[c] != null && c !== statCol) out[`_x_${c}`] = r[c];
    }
    return out;
  });

  const COL_HEADER = {
    '_fecha': 'Fecha', '_partido': 'Partido', '_lv': 'L/V',
    '_min': 'Min', '_ht': 'HT', '_ft': 'FT', '_stat': statOption.label,
    '_x_rating': 'Rating', '_x_goles': 'Goles', '_x_asistencias': 'Asis.', '_x_tiros_al_arco': 'Arco',
  };

  const displayCols = rows.length ? Object.keys(rows[0]) : [];
  const statTotal   = rows.reduce((s, r) => s + (typeof r['_stat'] === 'number' ? r['_stat'] : 0), 0);

  const fmtCell = (col, val) => {
    if (val === null || val === undefined) return '—';
    if (typeof val === 'number') return Number.isInteger(val) ? val : val.toFixed(2);
    return String(val);
  };

  const isWin = row => {
    if (!row['_ft']) return null;
    const parts = String(row['_ft']).split('-').map(Number);
    if (parts.length !== 2 || isNaN(parts[0]) || isNaN(parts[1])) return null;
    return parts[0] > parts[1] ? 'W' : parts[0] < parts[1] ? 'L' : 'D';
  };

  return (
    <div className="absolute inset-0 z-50 bg-black/90 flex flex-col rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-700 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-lg">{statOption.icon}</span>
          <span className="text-white font-bold text-sm">{player.name || player.shortName}</span>
          <span className={`text-xs font-semibold ${statOption.color}`}>· {statOption.label}</span>
          {rawMatches.length > 0 && (
            <span className="text-gray-500 text-[10px]">({rawMatches.length} partidos)</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-gray-500 text-[10px]">ESC para cerrar</span>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-lg leading-none">✕</button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-2">
        {loading && (
          <div className="flex items-center justify-center h-full text-gray-500 text-sm">Cargando historial...</div>
        )}
        {!loading && rows.length === 0 && (
          <div className="flex items-center justify-center h-full text-gray-500 text-sm">Sin datos de partidos para este jugador</div>
        )}
        {!loading && rows.length > 0 && (
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-gray-800 sticky top-0 z-10">
                <th className="px-2 py-1.5 text-gray-400 text-left font-semibold border-b border-gray-700">#</th>
                {displayCols.map(col => (
                  <th key={col}
                    className={`px-2 py-1.5 text-left font-semibold border-b border-gray-700 whitespace-nowrap
                      ${col === '_stat' ? `${statOption.color} bg-gray-700` : 'text-gray-400'}`}>
                    {COL_HEADER[col] || col}
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
                      <td key={col}
                        className={`px-2 py-1.5 whitespace-nowrap
                          ${col === '_stat'    ? `font-bold ${statOption.color} bg-gray-800/50`
                          : col === '_lv'      ? (row[col] === 'L' ? 'text-green-400' : 'text-blue-400')
                          : col === '_partido' ? 'text-white font-medium'
                          : col === '_ht'      ? 'text-gray-400 font-mono'
                          : col === '_ft'      ? 'text-white font-mono font-bold'
                          : 'text-gray-300'}`}>
                        {fmtCell(col, row[col])}
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
function PlayerDot({ player, statOption, pStats, liveEvents, onDragStart, onDrop, onDoubleClick }) {
  const isHome  = player.side === 'home';
  const bg      = isHome ? 'bg-red-700 border-red-400' : 'bg-blue-700 border-blue-400';
  const label   = playerLabel(player);
  const uid     = playerUid(player);

  // Calcular valor a mostrar
  const histRaw = pStats?.[statOption.key] ?? null;
  const liveVal = statOption.liveKey ? (liveEvents?.[uid]?.[statOption.liveKey] ?? 0) : 0;

  let badge = null;
  let exceeded = false;

  if (histRaw !== null) {
    const hist = parseFloat(histRaw);
    if (statOption.liveKey) {
      // Mostrar restante: histórico − lo ya hecho
      const remaining = hist - liveVal;
      exceeded = remaining <= 0;
      badge = exceeded ? `↓${fmt(Math.abs(remaining))}` : fmt(remaining);
    } else {
      // Sin live tracking: solo mostrar histórico
      badge = fmt(hist);
    }
  }

  const badgeBg = exceeded
    ? 'bg-green-900/90 border-green-600 text-green-300'
    : badge !== null
      ? 'bg-black/85 border-gray-600 text-white'
      : '';

  return (
    <div
      draggable
      onDragStart={e => onDragStart(e, player)}
      onDrop={e => { e.stopPropagation(); onDrop(e, player); }}
      onDragOver={e => e.preventDefault()}
      onDoubleClick={e => { e.stopPropagation(); onDoubleClick(player); }}
      className="absolute flex flex-col items-center select-none cursor-move"
      style={{ left: `${player.x}%`, top: `${player.y}%`, transform: 'translate(-50%,-50%)' }}>

      {/* Badge con el valor */}
      <div className={`text-[10px] font-bold px-1.5 py-0.5 rounded border mb-0.5 leading-none min-w-[28px] text-center
        ${badge !== null ? badgeBg : 'opacity-0 pointer-events-none'}`}>
        {badge !== null ? `${statOption.icon} ${badge}` : '·'}
      </div>

      {/* Círculo del jugador */}
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
export default function P7_StatsVivoJugador({
  analysis, lineupData, manualPos, setManualPos, playerEvents,
  fieldSwapped, team1Name, team2Name, selectedFiles,
  selectedStatKey, setSelectedStatKey,
}) {
  const selectedKey    = selectedStatKey;
  const setSelectedKey = setSelectedStatKey;
  const [modalPlayer, setModalPlayer] = useState(null);
  const swapped = fieldSwapped;

  const handleCloseModal = useCallback(() => setModalPlayer(null), []);

  // Mapa nombre_lowercase → fila de stats (unión de todos los roles)
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

  // Posiciones de todos los titulares en campo
  // Si hay posiciones manuales (arrastradas en P5), usarlas directamente
  const positions = useMemo(() => {
    if (manualPos) return manualPos;
    if (!lineupData) return [];
    const h  = swapped ? lineupData.away : lineupData.home;
    const a  = swapped ? lineupData.home : lineupData.away;
    const hf = swapped ? lineupData.away_formation : lineupData.home_formation;
    const af = swapped ? lineupData.home_formation : lineupData.away_formation;
    return [
      ...layoutFormation(h || [], hf || '', 'home'),
      ...layoutFormation(a || [], af || '', 'away'),
    ];
  }, [manualPos, lineupData, swapped]);

  const statOption = STAT_OPTIONS.find(s => s.key === selectedKey) || STAT_OPTIONS[0];

  const homeStatsMap = swapped ? statsMap.team2 : statsMap.team1;
  const awayStatsMap = swapped ? statsMap.team1 : statsMap.team2;

  const homeName = swapped
    ? (lineupData?.away_name || team2Name || 'Visita')
    : (lineupData?.home_name || team1Name || 'Local');
  const awayName = swapped
    ? (lineupData?.home_name || team1Name || 'Local')
    : (lineupData?.away_name || team2Name || 'Visita');

  const liveCount = Object.keys(playerEvents || {}).length;

  // ── Drag-and-drop para reposicionar jugadores ──
  const handleDragStart = (e, player) => {
    e.dataTransfer.setData('uid', playerUid(player));
  };

  const handlePlayerDrop = (e, targetPlayer) => {
    e.preventDefault();
    const dragUid = e.dataTransfer.getData('uid');
    const targetUid = playerUid(targetPlayer);
    if (!dragUid || dragUid === targetUid) return;
    setManualPos(() => {
      const list = [...positions];
      const di = list.findIndex(p => playerUid(p) === dragUid);
      const ti = list.findIndex(p => playerUid(p) === targetUid);
      if (di !== -1 && ti !== -1) {
        const tmp = { x: list[di].x, y: list[di].y };
        list[di] = { ...list[di], x: list[ti].x, y: list[ti].y };
        list[ti] = { ...list[ti], ...tmp };
      }
      return list;
    });
  };

  const handleFieldDrop = (e) => {
    e.preventDefault();
    const dragUid = e.dataTransfer.getData('uid');
    if (!dragUid) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top)  / rect.height) * 100;
    setManualPos(() => positions.map(p => playerUid(p) === dragUid ? { ...p, x, y } : p));
  };

  const handleDoubleClick = useCallback((player) => {
    setModalPlayer(player);
  }, []);

  const isModalTeam1 = modalPlayer
    ? (swapped ? modalPlayer.side === 'away' : modalPlayer.side === 'home')
    : false;
  const modalFile     = modalPlayer ? (isModalTeam1 ? selectedFiles?.f1 : selectedFiles?.f2) : null;
  const modalTeamName = modalPlayer ? (isModalTeam1 ? team1Name : team2Name) : null;

  if (!lineupData) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500 text-sm">
        <div className="text-center">
          <div className="text-4xl mb-3">📊</div>
          <div>Carga una alineación desde</div>
          <div className="text-yellow-400 font-medium mt-1">Alineaciones/Formaciones · Registro x Jugador</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex gap-3 overflow-hidden">

      {/* ── CAMPO ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col gap-2 overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-3 text-xs shrink-0">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-700"/>
            <span className="text-gray-300 font-medium">{homeName}</span>
            {lineupData.home_formation && <span className="text-gray-500 font-mono">{swapped ? lineupData.away_formation : lineupData.home_formation}</span>}
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-blue-700"/>
            <span className="text-gray-300 font-medium">{awayName}</span>
            {lineupData.away_formation && <span className="text-gray-500 font-mono">{swapped ? lineupData.home_formation : lineupData.away_formation}</span>}
          </div>
          <div className="ml-auto flex items-center gap-2">
            {liveCount > 0 && (
              <span className="text-[10px] text-green-400 bg-green-900/30 border border-green-700/40 rounded px-2 py-0.5">
                ● {liveCount} jugadores con eventos
              </span>
            )}
            <span className="text-[10px] text-gray-500">
              {statOption.icon} <span className={`font-bold ${statOption.color}`}>{statOption.label}</span>
              {statOption.liveKey && <span className="text-gray-600"> · esperado restante</span>}
            </span>
          </div>
        </div>

        {/* Cancha */}
        <div className="flex-1 relative bg-green-900 rounded-xl border-2 border-green-700 overflow-hidden min-h-[280px]"
          onDrop={handleFieldDrop} onDragOver={e => e.preventDefault()}>
          <FieldMarkings />
          {positions.map((p, i) => {
            const pStats = findStats(p, p.side === 'home' ? homeStatsMap : awayStatsMap);
            return (
              <PlayerDot
                key={`${p.side}-${p.id ?? i}`}
                player={p}
                statOption={statOption}
                pStats={pStats}
                liveEvents={playerEvents}
                onDragStart={handleDragStart}
                onDrop={handlePlayerDrop}
                onDoubleClick={handleDoubleClick}
              />
            );
          })}
          {positions.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-green-600/40 text-sm">
              Sin jugadores en cancha
            </div>
          )}

          {/* Overlay modal al hacer doble click */}
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

        {/* Leyenda */}
        <div className="bg-gray-900/40 border border-gray-700/40 rounded-lg p-2 text-[10px] text-gray-500 shrink-0 flex items-center gap-3">
          {statOption.liveKey ? (
            <>
              <span>{statOption.icon} Valor = promedio histórico p90 <span className="text-gray-600">−</span> eventos registrados en vivo</span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-3 h-3 rounded bg-green-900/90 border border-green-600"/>
                <span className="text-green-400">↓ = ya alcanzó o superó su promedio</span>
              </span>
            </>
          ) : (
            <span>{statOption.icon} Promedio histórico por 90 min · sin descuento en vivo para esta estadística</span>
          )}
        </div>
      </div>

      {/* ── SIDEBAR DE ESTADÍSTICAS ────────────────────────────────────────── */}
      <div className="w-44 shrink-0 flex flex-col gap-1.5 overflow-auto">
        <div className="text-white font-bold text-xs mb-0.5 shrink-0">📊 Estadística a ver</div>

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
              {s.liveKey && (
                <div className="shrink-0 w-1.5 h-1.5 rounded-full bg-green-500 opacity-70" title="Soporta descuento en vivo"/>
              )}
            </button>
          );
        })}

        <div className="mt-1 text-[9px] text-gray-700 leading-relaxed shrink-0">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 mr-1 opacity-70"/>
          = descuenta eventos en vivo
        </div>
      </div>
    </div>
  );
}
