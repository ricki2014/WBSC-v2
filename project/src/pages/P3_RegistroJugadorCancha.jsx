// TAB 3 — Registro por jugador en cancha (campo interactivo)
import { useState, useMemo, useEffect } from 'react';
import { fetchLineups } from '../api';

// ─── FORMACIÓN → COORDENADAS ──────────────────────────────────────────────────
// formation: "4-2-3-1"  side: 'home' | 'away'
// home ocupa x 4%..47%, away ocupa x 96%..53% (espejo)
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

// uid estable para identificar jugador en playerEvents
const playerUid = p => p.id != null ? `p${p.id}` : `${p.side}-${p.lineupOrder}`;

// Íconos por tipo de evento (para badges)
const EV_ICONS = {
  Gol:      '⚽',
  Disparo:  '🎯',
  TiroArco: '🥅',
  FoulCom:  '🤛',
  FoulRec:  '🛡️',
  Amarilla: '🟨',
  Roja:     '🟥',
};

// ─── CÍRCULO DE JUGADOR ───────────────────────────────────────────────────────
function playerLabel(player) {
  const full = player.name || player.shortName || '';
  const parts = full.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0][0].toUpperCase()}. ${parts.slice(1).join(' ')}`;
  return full;
}

function PlayerCircle({ player, selected, evSummary, onClick, onDragStart, onDrop }) {
  const isHome = player.side === 'home';
  const base = selected
    ? 'bg-yellow-400 border-yellow-200 scale-110 text-black'
    : isHome
      ? 'bg-red-700 border-red-400 hover:bg-red-600'
      : 'bg-blue-700 border-blue-400 hover:bg-blue-600';

  const short    = player.shortName || player.name || '';
  const initials = short.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const label    = playerLabel(player);

  const badges = evSummary
    ? Object.entries(evSummary).filter(([, n]) => n > 0)
    : [];

  return (
    <button
      draggable
      onDragStart={e => onDragStart(e, player)}
      onDrop={e => { e.stopPropagation(); onDrop(e, player); }}
      onDragOver={e => e.preventDefault()}
      onClick={() => onClick(player)}
      className="absolute flex flex-col items-center cursor-move transition-all duration-150 select-none"
      style={{ left: `${player.x}%`, top: `${player.y}%`, transform: 'translate(-50%,-50%)' }}>

      {/* Badges de eventos encima del círculo */}
      {badges.length > 0 && (
        <div className="flex flex-wrap justify-center gap-0.5 mb-0.5 max-w-[64px]">
          {badges.map(([key, count]) => (
            <span key={key}
              className="text-[10px] leading-none bg-black/80 rounded-sm px-0.5 shadow">
              {EV_ICONS[key] ?? '●'}{count > 1 ? <span className="text-[8px] font-bold text-white">x{count}</span> : null}
            </span>
          ))}
        </div>
      )}

      {/* Círculo con número */}
      <div className={`w-12 h-12 rounded-full border-2 flex items-center justify-center font-bold text-sm shadow-lg ${base}`}>
        {player.number ?? initials}
      </div>

      {/* Nombre corto */}
      <span className="text-[11px] text-white bg-black/75 px-1 rounded truncate max-w-[80px] text-center mt-0.5 leading-tight shadow">
        {label}
      </span>
    </button>
  );
}

// ─── BOTONES DE EVENTO ────────────────────────────────────────────────────────
// key: evento · statKey: qué campo de liveStats actualizar · scoreKey: si suma al marcador
const EVENTOS = [
  { icon: '⚽', label: '+ Gol',             key: 'Gol',      statKey: 'Goles',       addsScore: true,  color: 'text-yellow-400' },
  { icon: '🎯', label: '+ Disparo (total)', key: 'Disparo',  statKey: 'Disparos',    addsScore: false, color: 'text-orange-400' },
  { icon: '🥅', label: '+ Tiro al arco',    key: 'TiroArco', statKey: 'TiroAlArco',  addsScore: false, color: 'text-blue-400',   also: { key: 'Disparo', statKey: 'Disparos' } },
  { icon: '🤛', label: '+ Foul cometido',   key: 'FoulCom',  statKey: 'FoulCometido',addsScore: false, color: 'text-orange-400' },
  { icon: '🛡️', label: '+ Foul recibido',   key: 'FoulRec',  statKey: 'FoulRecibido',addsScore: false, color: 'text-green-400'  },
  { icon: '🟨', label: '+ Tarjeta amarilla',key: 'Amarilla', statKey: 'Tarjetas',    addsScore: false, color: 'text-yellow-300' },
  { icon: '🟥', label: '+ Tarjeta roja',    key: 'Roja',     statKey: 'Rojas',       addsScore: false, color: 'text-red-400'    },
];

// ─── CAMPO SVG ────────────────────────────────────────────────────────────────
function FieldMarkings() {
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
      <rect x="0" y="0" width="100" height="100" fill="none" stroke="white" strokeWidth="0.4" opacity="0.25"/>
      <line x1="50" y1="0" x2="50" y2="100" stroke="white" strokeWidth="0.4" opacity="0.25"/>
      <circle cx="50" cy="50" r="10" fill="none" stroke="white" strokeWidth="0.4" opacity="0.25"/>
      <circle cx="50" cy="50" r="0.6" fill="white" opacity="0.3"/>
      {/* Áreas */}
      <rect x="0" y="28" width="14" height="44" fill="none" stroke="white" strokeWidth="0.4" opacity="0.2"/>
      <rect x="86" y="28" width="14" height="44" fill="none" stroke="white" strokeWidth="0.4" opacity="0.2"/>
      {/* Porterías */}
      <rect x="0" y="40" width="4" height="20" fill="none" stroke="white" strokeWidth="0.4" opacity="0.15"/>
      <rect x="96" y="40" width="4" height="20" fill="none" stroke="white" strokeWidth="0.4" opacity="0.15"/>
    </svg>
  );
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────
export default function P3_RegistroJugadorCancha({
  analysis, lineupData, setLineupData,
  manualPos, setManualPos,
  timer, score, setScore, liveStats, setLiveStats,
  team1Name, team2Name,
  playerEvents, setPlayerEvents,
  fieldSwapped, setFieldSwapped,
  registroEvents, setRegistroEvents,
  lastRegistroEvent, setLastRegistroEvent,
  registroHistoryRef,
}) {
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState('');
  const [urlInput, setUrlInput]         = useState('');
  const [autoSide, setAutoSide]         = useState('home');
  const [selectedPlayers, setSelectedPlayers] = useState(new Map()); // uid → player
  const [subTeam, setSubTeam]           = useState('home');

  // Aliases locales para legibilidad
  const events       = registroEvents;
  const setEvents    = setRegistroEvents;
  const lastEvent    = lastRegistroEvent;
  const setLastEvent = setLastRegistroEvent;
  const historyRef   = registroHistoryRef;

  const swapped    = fieldSwapped;
  const setSwapped = setFieldSwapped;

  const togglePlayer = (player) => {
    const uid = playerUid(player);
    setSelectedPlayers(prev => {
      const next = new Map(prev);
      if (next.has(uid)) next.delete(uid);
      else next.set(uid, player);
      return next;
    });
  };

  const clearSelection = () => setSelectedPlayers(new Map());

  // Limpiar selección si cambia la alineación o se presiona Escape
  useEffect(() => { clearSelection(); }, [lineupData]);
  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') clearSelection(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const team1Id = analysis?.team1?.team_id;
  const team2Id = analysis?.team2?.team_id;

  // Cargar alineación desde URL
  const loadUrl = async () => {
    if (!urlInput.trim()) return;
    setLoading(true); setError('');
    try {
      const data = await fetchLineups({ url: urlInput });
      setManualPos(null);
      setLineupData(data);
    } catch { setError('No se encontraron alineaciones en esa URL'); }
    finally   { setLoading(false); }
  };

  // Auto-detectar próximo partido
  const autoDetect = async () => {
    const tid = autoSide === 'home' ? team1Id : team2Id;
    if (!tid) { setError('No hay team_id cargado'); return; }
    setLoading(true); setError('');
    try {
      const data = await fetchLineups({ team_id: String(tid) });
      setManualPos(null);
      setLineupData(data);
    } catch { setError('No se encontró próximo partido'); }
    finally   { setLoading(false); }
  };

  // Calcular posiciones desde formación (respetando inversión de lados)
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

  const starters = positions;
  const subsList = {
    home: (swapped ? lineupData?.away : lineupData?.home || []).filter(p => p.isSubstitute),
    away: (swapped ? lineupData?.home : lineupData?.away || []).filter(p => p.isSubstitute),
  };

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

  // Deshacer último evento
  const undo = () => {
    if (!historyRef.current.length) return;
    const snap = historyRef.current.pop();
    setLiveStats(snap.liveStats);
    setScore(snap.score);
    setPlayerEvents(snap.playerEvents);
    setEvents(snap.events);
    setLastEvent(snap.lastEvent);
  };

  // Registrar evento en todos los jugadores seleccionados (un solo paso de undo)
  const registerEvent = (ev) => {
    const players = [...selectedPlayers.values()];
    if (players.length === 0) return;

    // Snapshot único para deshacer todos los cambios de esta acción
    historyRef.current = [
      ...historyRef.current.slice(-40),
      {
        liveStats:    { team1: { ...liveStats.team1 }, team2: { ...liveStats.team2 } },
        score:        { ...score },
        playerEvents: JSON.parse(JSON.stringify(playerEvents)),
        events:       [...events],
        lastEvent,
      },
    ];

    const min = Math.floor(timer / 60);
    const newLive = { team1: { ...liveStats.team1 }, team2: { ...liveStats.team2 } };
    const newScore = { ...score };
    const newPE = { ...playerEvents };
    const newEvs = [];

    for (const player of players) {
      const teamKey  = player.side === 'home' ? 'team1' : 'team2';
      const scoreKey = player.side === 'home' ? 'home'  : 'away';

      if (ev.statKey) {
        newLive[teamKey][ev.statKey] = (newLive[teamKey][ev.statKey] || 0) + 1;
        if (ev.also) newLive[teamKey][ev.also.statKey] = (newLive[teamKey][ev.also.statKey] || 0) + 1;
      }
      if (ev.addsScore) newScore[scoreKey] = (newScore[scoreKey] || 0) + 1;

      const pUid = playerUid(player);
      newPE[pUid] = {
        ...(newPE[pUid] || {}),
        [ev.key]: ((newPE[pUid]?.[ev.key] || 0) + 1),
        ...(ev.also ? { [ev.also.key]: ((newPE[pUid]?.[ev.also.key] || 0) + 1) } : {}),
      };

      newEvs.push({
        id: Date.now() + Math.random(),
        minute: min,
        player: player.shortName || player.name,
        number: player.number,
        side: player.side,
        team: player.side === 'home'
          ? (lineupData?.home_name || team1Name || 'Local')
          : (lineupData?.away_name || team2Name || 'Visita'),
        event: ev.key,
        label: ev.label.replace('+ ', ''),
        icon: ev.icon,
      });
    }

    setLiveStats(newLive);
    setScore(newScore);
    setPlayerEvents(newPE);
    setEvents(prev => [...newEvs, ...prev]);
    setLastEvent(newEvs[newEvs.length - 1]);
  };

  const fmtMin = s => `${Math.floor(s / 60)}'`;

  // ── Sin alineación cargada ──
  if (!lineupData) {
    return (
      <div className="h-full flex flex-col gap-3 overflow-auto">
        <div className="bg-gray-900 border border-gray-700/40 rounded-xl p-4">
          <div className="text-white font-bold text-sm mb-1">🏟️ Registro por jugador en cancha</div>
          <p className="text-gray-500 text-xs mb-3">
            Carga la alineación desde SofaScore para poder registrar eventos por jugador en tiempo real.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-gray-400 mb-1">URL del partido (SofaScore)</div>
              <input value={urlInput} onChange={e => setUrlInput(e.target.value)}
                placeholder="https://www.sofascore.com/..."
                className="w-full bg-gray-900 border border-gray-600 text-white text-xs rounded-lg px-3 py-2 mb-2 focus:outline-none focus:border-green-500"/>
              <button onClick={loadUrl} disabled={loading}
                className="btn-primary w-full text-xs py-1.5">
                {loading ? '⏳ Cargando...' : '🔗 Cargar desde URL'}
              </button>
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-1">Auto-detectar próximo partido</div>
              <div className="flex gap-3 mb-2">
                {['home','away'].map(s => (
                  <label key={s} className="flex items-center gap-1.5 cursor-pointer text-xs text-gray-300">
                    <input type="radio" checked={autoSide === s} onChange={() => setAutoSide(s)} className="accent-green-500"/>
                    {s === 'home' ? '🟢 Local' : '🔵 Visita'}
                  </label>
                ))}
              </div>
              <button onClick={autoDetect} disabled={loading || !analysis}
                className="btn-secondary w-full text-xs py-1.5">
                {loading ? '⏳...' : '🚀 Auto-detectar'}
              </button>
              {!analysis && <div className="text-yellow-600 text-[10px] mt-1">Primero selecciona equipos</div>}
            </div>
          </div>
          {error && <div className="mt-2 text-red-400 text-xs">{error}</div>}
        </div>
      </div>
    );
  }

  const homeName = swapped
    ? (lineupData.away_name || team2Name || 'Visita')
    : (lineupData.home_name || team1Name || 'Local');
  const awayName = swapped
    ? (lineupData.home_name || team1Name || 'Local')
    : (lineupData.away_name || team2Name || 'Visita');

  return (
    <div className="h-full flex gap-3 overflow-hidden">

      {/* ── CAMPO ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col gap-2 overflow-hidden min-w-0">

        {/* Leyenda */}
        <div className="flex items-center gap-4 text-xs shrink-0">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-700"/>
            <span className="text-gray-300">{homeName}</span>
            {lineupData.home_formation && (
              <span className="text-gray-500">{lineupData.home_formation}</span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-blue-700"/>
            <span className="text-gray-300">{awayName}</span>
            {lineupData.away_formation && (
              <span className="text-gray-500">{lineupData.away_formation}</span>
            )}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={() => setSwapped(v => !v)}
              className="text-[10px] px-2 py-1 rounded-lg bg-gray-800 border border-gray-600 text-yellow-400 hover:bg-gray-700 transition-colors font-bold whitespace-nowrap">
              ⇄ Invertir lados
            </button>
            {selectedPlayers.size > 0 && (
              <div className="flex items-center gap-1.5 bg-yellow-900/30 border border-yellow-700/40 rounded-lg px-2 py-0.5">
                <span className="text-yellow-400 font-bold text-[11px]">
                  {selectedPlayers.size === 1
                    ? (() => { const p = [...selectedPlayers.values()][0]; return `#${p.number} ${p.shortName || p.name}`; })()
                    : `${selectedPlayers.size} jugadores`}
                </span>
                <button onClick={clearSelection} className="text-gray-500 hover:text-white text-xs">✕</button>
              </div>
            )}
          </div>
        </div>

        {/* Campo */}
        <div className="flex-1 relative bg-green-900 rounded-xl border-2 border-green-700 overflow-hidden"
          onDrop={handleFieldDrop} onDragOver={e => e.preventDefault()}>
          <FieldMarkings />
          {starters.map((p, i) => (
            <PlayerCircle key={`${p.side}-${p.id ?? i}`}
              player={p}
              selected={selectedPlayers.has(playerUid(p))}
              evSummary={playerEvents[playerUid(p)]}
              onClick={togglePlayer}
              onDragStart={handleDragStart}
              onDrop={handlePlayerDrop}
            />
          ))}
          {starters.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-green-600/40 text-sm">
              Sin jugadores en cancha
            </div>
          )}
        </div>

        {/* Suplentes con filtro por equipo */}
        {(subsList.home.length > 0 || subsList.away.length > 0) && (
          <div className="bg-gray-900/60 border border-gray-700/40 rounded-lg px-2 py-1.5 shrink-0">
            {/* Toggle */}
            <div className="flex rounded overflow-hidden border border-gray-700 mb-1.5 w-fit">
              {['home','away'].map(side => (
                <button key={side}
                  onClick={() => setSubTeam(side)}
                  className={`text-[9px] px-3 py-1 font-bold transition-colors
                    ${subTeam === side
                      ? side === 'home' ? 'bg-red-700 text-white' : 'bg-blue-700 text-white'
                      : 'bg-gray-800 text-gray-500 hover:text-gray-300'}`}>
                  {side === 'home' ? homeName.split(' ')[0] : awayName.split(' ')[0]}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1">
              {subsList[subTeam].map((p, i) => {
                const withSide = { ...p, side: subTeam };
                const uid = playerUid(withSide);
                return (
                  <button key={i}
                    onClick={() => togglePlayer(withSide)}
                    className={`text-[9px] px-1.5 py-0.5 rounded border transition-all
                      ${selectedPlayers.has(uid)
                        ? 'bg-yellow-700 border-yellow-500 text-white'
                        : 'bg-gray-800 border-gray-600 text-gray-300 hover:border-gray-400'}`}>
                    #{p.number ?? '?'} {(p.shortName || p.name || '').split(' ').slice(-1)[0]}
                  </button>
                );
              })}
              {subsList[subTeam].length === 0 && (
                <span className="text-gray-600 text-[9px]">Sin suplentes</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── PANEL DERECHO ─────────────────────────────────────────────────── */}
      <div className="w-52 shrink-0 flex flex-col gap-3 overflow-auto">

        {/* Jugadores seleccionados */}
        <div className="bg-gray-900 border border-gray-700/40 rounded-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-gray-400 text-[10px] font-semibold">
              {selectedPlayers.size > 0 ? `${selectedPlayers.size} seleccionado${selectedPlayers.size > 1 ? 's' : ''}` : 'Selección'}
            </div>
            {selectedPlayers.size > 0 && (
              <button onClick={clearSelection} className="text-[9px] text-gray-600 hover:text-gray-300 transition-colors">
                ESC / ✕ limpiar
              </button>
            )}
          </div>
          {selectedPlayers.size > 0 ? (
            <div className="flex flex-col gap-1 max-h-24 overflow-auto">
              {[...selectedPlayers.values()].map(p => (
                <div key={playerUid(p)} className="flex items-center gap-1.5">
                  <div className={`w-6 h-6 rounded-full border flex items-center justify-center font-bold text-white text-[10px] shrink-0
                    ${p.side === 'home' ? 'bg-red-700 border-red-400' : 'bg-blue-700 border-blue-400'}`}>
                    {p.number ?? '?'}
                  </div>
                  <div className="min-w-0">
                    <div className="text-white text-[11px] font-bold leading-tight truncate">
                      {p.shortName || p.name}
                    </div>
                    <div className="text-gray-500 text-[9px]">{p.position} · {p.side === 'home' ? homeName : awayName}</div>
                  </div>
                  <button onClick={() => togglePlayer(p)} className="ml-auto text-gray-600 hover:text-gray-300 text-[10px] shrink-0">✕</button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-gray-600 text-xs text-center py-2">
              Toca jugadores en el campo
            </div>
          )}
        </div>

        {/* Evento rápido (último registrado) */}
        {lastEvent && (
          <div className="bg-green-900/30 border border-green-700/40 rounded-xl p-2 text-center">
            <div className="text-[10px] text-gray-400 mb-0.5">Último evento</div>
            <div className="text-white text-xs font-bold">
              {lastEvent.icon} {lastEvent.label}
            </div>
            <div className="text-gray-400 text-[10px]">
              {lastEvent.minute}' · {lastEvent.player}
            </div>
          </div>
        )}

        {/* Eventos rápidos */}
        <div className="bg-gray-900 border border-gray-700/40 rounded-xl p-3 flex flex-col gap-1.5">
          <div className="text-gray-400 text-[10px] font-semibold mb-1">Eventos rápidos</div>
          {EVENTOS.map(ev => (
            <button key={ev.key}
              onClick={() => registerEvent(ev)}
              disabled={selectedPlayers.size === 0}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all
                ${selectedPlayers.size > 0
                  ? 'bg-gray-800 border-gray-600 hover:bg-gray-700 hover:border-gray-400 text-gray-200 cursor-pointer'
                  : 'bg-gray-900/30 border-gray-700/30 text-gray-700 cursor-not-allowed'}`}>
              <span>{ev.icon}</span>
              <span className={selectedPlayers.size > 0 ? ev.color : ''}>{ev.label}</span>
            </button>
          ))}
        </div>

        {/* Deshacer */}
        <button
          onClick={undo}
          disabled={!historyRef.current.length}
          className={`w-full flex items-center justify-center gap-2 py-2 rounded-xl border font-semibold text-sm transition-all
            ${historyRef.current.length
              ? 'bg-orange-900/30 hover:bg-orange-900/50 border-orange-700/60 text-orange-400'
              : 'bg-gray-800/30 border-gray-700/30 text-gray-600 cursor-not-allowed'}`}>
          ↩ Deshacer
          {historyRef.current.length > 0 && (
            <span className="bg-orange-700 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
              {historyRef.current.length}
            </span>
          )}
        </button>

        {/* Cambiar alineación */}
        <button onClick={() => { setManualPos(null); setLineupData(null); }}
          className="text-[10px] text-gray-600 hover:text-gray-400 text-center transition-colors">
          ↺ Cambiar alineación
        </button>
      </div>

    </div>
  );
}
