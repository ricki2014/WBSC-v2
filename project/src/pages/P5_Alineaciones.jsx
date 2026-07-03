// TAB 5 — Alineaciones/Formaciones
import { useState, useMemo, useEffect, useRef } from 'react';
import { fetchLineups, getLiveStatus } from '../api';
import { teamIdentities, computePositions } from '../lib/pitchLayout';

const uid = p => p.id != null ? `p${p.id}` : `${p.side}-${p.lineupOrder}`;

const EV_ICONS = {
  Gol:          '⚽',
  Asistencia:   '👟',
  Disparo:      '🎯',
  TiroAlArco:   '🥅',
  Amarilla:     '🟨',
  Roja:         '🟥',
  FoulCometido: '🤛',
  FoulRecibido: '🛡️',
  Corner:       '🚩',
};

function playerLabel(player) {
  const full = player.name || player.shortName || '';
  const parts = full.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0][0].toUpperCase()}. ${parts.slice(1).join(' ')}`;
  return full;
}

function PlayerDot({ player, evSummary, onDragStart, onDrop }) {
  const isTeam1 = player.team === 'team1';
  const bg = isTeam1 ? 'bg-red-700 border-red-400' : 'bg-blue-700 border-blue-400';
  const label = playerLabel(player);
  const badges = evSummary ? Object.entries(evSummary).filter(([, n]) => n > 0) : [];

  return (
    <div
      draggable
      onDragStart={e => onDragStart(e, player)}
      onDrop={e => { e.stopPropagation(); onDrop(e, player); }}
      onDragOver={e => e.preventDefault()}
      className="absolute flex flex-col items-center cursor-move group select-none"
      style={{ left: `${player.x}%`, top: `${player.y}%`, transform: 'translate(-50%,-50%)' }}>
      {badges.length > 0 && (
        <div className="flex gap-0.5 mb-0.5 flex-wrap justify-center max-w-[72px]">
          {badges.map(([ev, n]) => (
            <span key={ev} className="text-[10px] leading-none" title={ev}>
              {EV_ICONS[ev] ?? '•'}{n > 1 ? `×${n}` : ''}
            </span>
          ))}
        </div>
      )}
      <div className={`w-12 h-12 rounded-full border-2 flex items-center justify-center font-bold text-white text-sm ${bg} shadow-lg group-hover:scale-110 transition-transform`}>
        {player.number ?? '?'}
      </div>
      <span className="text-[11px] text-white bg-black/70 px-1 rounded truncate max-w-[80px] text-center mt-0.5 leading-tight">
        {label}
      </span>
    </div>
  );
}

function FieldMarkings() {
  return (
    <svg className="absolute inset-0 w-full h-full opacity-20 pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
      <rect x="0" y="0" width="100" height="100" fill="none" stroke="white" strokeWidth="0.5"/>
      <line x1="50" y1="0" x2="50" y2="100" stroke="white" strokeWidth="0.5"/>
      <circle cx="50" cy="50" r="10" fill="none" stroke="white" strokeWidth="0.5"/>
      <circle cx="50" cy="50" r="0.5" fill="white"/>
      <rect x="0" y="28" width="14" height="44" fill="none" stroke="white" strokeWidth="0.5"/>
      <rect x="86" y="28" width="14" height="44" fill="none" stroke="white" strokeWidth="0.5"/>
      <rect x="0" y="40" width="4" height="20" fill="none" stroke="white" strokeWidth="0.5"/>
      <rect x="96" y="40" width="4" height="20" fill="none" stroke="white" strokeWidth="0.5"/>
    </svg>
  );
}

export default function P5_Alineaciones({
  analysis, lineupData, setLineupData,
  manualPos, setManualPos,
  playerEvents, setPlayerEvents,
  fieldSwapped, setFieldSwapped, baseSwapped,
  team1Name, team2Name,
  setScore, setPeriod, setLiveStats,
}) {
  const [updatingLive, setUpdatingLive] = useState(false);
  const [liveError, setLiveError]       = useState('');
  const [localSubs,    setLocalSubs]    = useState({ home: [], away: [] });
  const [subTeam,      setSubTeam]      = useState('home');
  const [urlInput,     setUrlInput]     = useState('');
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState('');
  const [autoSide,     setAutoSide]     = useState('home');
  const [showControls, setShowControls] = useState(false); // oculto por defecto

  // Evita que setLineupData (por sustitución) resetee manualPos
  const skipResetRef = useRef(false);

  const swapped    = fieldSwapped;
  const setSwapped = setFieldSwapped;

  // Identidad real de equipo — independiente del lado visual (que invierte en 2T).
  const { teamOfHome, teamOfAway } = teamIdentities(baseSwapped);

  const team1Id = analysis?.team1?.team_id;
  const team2Id = analysis?.team2?.team_id;

  const effHF = () => swapped ? lineupData?.away_formation : lineupData?.home_formation;
  const effAF = () => swapped ? lineupData?.home_formation : lineupData?.away_formation;

  useEffect(() => {
    if (!lineupData) return;
    const h = swapped ? lineupData.away : lineupData.home;
    const a = swapped ? lineupData.home : lineupData.away;
    const hTeam = swapped ? teamOfAway : teamOfHome;
    const aTeam = swapped ? teamOfHome : teamOfAway;
    const newSubs = {
      home: (h || []).filter(p => p.isSubstitute).map(p => ({ ...p, team: hTeam })),
      away: (a || []).filter(p => p.isSubstitute).map(p => ({ ...p, team: aTeam })),
    };
    if (skipResetRef.current) {
      skipResetRef.current = false;
    }
    setLocalSubs(newSubs);
  }, [lineupData, swapped, teamOfHome, teamOfAway]);

  const autoPositions = useMemo(
    () => computePositions(lineupData, swapped, baseSwapped),
    [lineupData, swapped, baseSwapped]
  );

  const positions = manualPos ?? autoPositions;

  // Sincroniza lineupData para P3 (marca skipReset para no destruir manualPos)
  const syncSubToLineup = (subPid, titPid, actualSide) => {
    skipResetRef.current = true;
    setLineupData(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        [actualSide]: (prev[actualSide] || []).map(p => {
          const pid = p.id ?? p.lineupOrder;
          if (pid === subPid) return { ...p, isSubstitute: false };
          if (pid === titPid) return { ...p, isSubstitute: true };
          return p;
        }),
      };
    });
  };

  const applyLineup = (data) => {
    setManualPos(null);
    setLineupData(data);
    setShowControls(false);
  };

  const loadUrl = async () => {
    if (!urlInput.trim()) return;
    setLoading(true); setError('');
    try { applyLineup(await fetchLineups({ url: urlInput })); }
    catch { setError('No se pudieron obtener las alineaciones'); }
    finally { setLoading(false); }
  };

  const autoDetect = async () => {
    const tid = autoSide === 'home' ? team1Id : team2Id;
    if (!tid) { setError('No hay team_id en el Excel'); return; }
    setLoading(true); setError('');
    try { applyLineup(await fetchLineups({ team_id: String(tid) })); }
    catch { setError('No se encontró próximo partido'); }
    finally { setLoading(false); }
  };

  // Descargar actual: el último partido con id (útil si el partido ya arrancó,
  // porque auto-detectar sigue apuntando al siguiente upcoming en vez del que está en curso)
  const downloadCurrent = async () => {
    const tid = autoSide === 'home' ? team1Id : team2Id;
    if (!tid) { setError('No hay team_id en el Excel'); return; }
    setLoading(true); setError('');
    try { applyLineup(await fetchLineups({ team_id: String(tid), last: true })); }
    catch { setError('No se encontró el partido actual'); }
    finally { setLoading(false); }
  };

  // Trae goles/disparos/tarjetas/etc. reales desde SofaScore y pisa lo cargado
  // manualmente — para no tener que registrar cada evento a mano.
  const updateLiveStatus = async () => {
    if (!lineupData?.match_id) { setLiveError('Primero cargá una alineación con un partido válido'); return; }
    setUpdatingLive(true); setLiveError('');
    try {
      const data = await getLiveStatus(lineupData.match_id);

      const homeN = (lineupData.home_name || '').toLowerCase();
      const t1 = (team1Name || '').toLowerCase();
      const homeIsTeam1 = !!t1 && (homeN.includes(t1.split(' ')[0]) || t1.includes(homeN.split(' ')[0]));
      const teamKey = homeIsTeam1
        ? { home: 'team1', away: 'team2' }
        : { home: 'team2', away: 'team1' };

      setScore({
        home: homeIsTeam1 ? data.score.home : data.score.away,
        away: homeIsTeam1 ? data.score.away : data.score.home,
      });
      setPeriod(data.period);
      setLiveStats(prev => ({
        ...prev,
        [teamKey.home]: { ...prev[teamKey.home], ...data.team_stats.home },
        [teamKey.away]: { ...prev[teamKey.away], ...data.team_stats.away },
      }));
      setPlayerEvents(prev => {
        const next = { ...prev };
        for (const [pid, stats] of Object.entries(data.player_stats)) {
          next[`p${pid}`] = { ...(next[`p${pid}`] || {}), ...stats };
        }
        return next;
      });

      // Sustituciones: el que entró toma la posición del que salió, en TODAS las
      // canchas (P3/P5/P7/P8/P9), porque todas leen lineupData/manualPos compartidos.
      const subs = data.substitutions || [];
      if (subs.length) {
        const applySubs = (roster) => {
          if (!roster) return roster;
          const inIds = new Set(subs.map(s => String(s.in_id)));
          return roster
            .filter(p => !inIds.has(String(p.id))) // saca la entrada original del suplente que ya entró
            .map(p => {
              const sub = subs.find(s => String(s.out_id) === String(p.id));
              if (!sub) return p;
              return {
                ...p,
                id: sub.in_id,
                name: sub.in_name,
                shortName: sub.in_shortName,
                number: sub.in_number != null ? Number(sub.in_number) : p.number,
                position: sub.in_position || p.position,
                isSubstitute: false,
              };
            });
        };

        setLineupData(prev => prev ? { ...prev, home: applySubs(prev.home), away: applySubs(prev.away) } : prev);

        setManualPos(prev => {
          if (!prev) return prev;
          return prev.map(p => {
            const sub = subs.find(s => String(s.out_id) === String(p.id));
            if (!sub) return p;
            return {
              ...p,
              id: sub.in_id,
              name: sub.in_name,
              shortName: sub.in_shortName,
              number: sub.in_number != null ? Number(sub.in_number) : p.number,
              position: sub.in_position || p.position,
            };
          });
        });
      }
    } catch (e) {
      setLiveError(e?.response?.data?.detail || 'No se pudo actualizar el estado');
    } finally {
      setUpdatingLive(false);
    }
  };

  // ── DRAG desde campo ──
  const handleDragStart = (e, player) => {
    e.dataTransfer.setData('uid', uid(player));
  };

  // ── DROP sobre jugador en campo: solo swap de posición entre titulares ──
  const handlePlayerDrop = (e, targetPlayer) => {
    e.preventDefault();
    const dragUid = e.dataTransfer.getData('uid');
    if (!dragUid || dragUid === uid(targetPlayer)) return;

    // Si lo que se arrastra es un suplente del banco, ignorar (debe soltarse en espacio libre)
    const [dragSide, ...rest] = dragUid.split('-');
    const dragIdStr = rest.join('-');
    const isSub = localSubs[dragSide]?.some(
      p => String(p.id ?? p.lineupOrder) === dragIdStr,
    );
    if (isSub) return;

    // Swap de posición entre titulares
    const targetUid = uid(targetPlayer);
    setManualPos(prev => {
      const list = [...(prev ?? autoPositions)];
      const di   = list.findIndex(p => uid(p) === dragUid);
      const ti   = list.findIndex(p => uid(p) === targetUid);
      if (di !== -1 && ti !== -1) {
        const tmp = { x: list[di].x, y: list[di].y };
        list[di] = { ...list[di], x: list[ti].x, y: list[ti].y };
        list[ti] = { ...list[ti], ...tmp };
      }
      return list;
    });
  };

  // ── DROP de jugador del campo sobre la barra lateral → va al banco ──
  const handleSidebarDrop = (e) => {
    e.preventDefault();
    const dragUid = e.dataTransfer.getData('uid');
    if (!dragUid) return;

    const list = manualPos ?? autoPositions;
    const dragged = list.find(p => uid(p) === dragUid);
    if (!dragged) return; // no es un jugador del campo

    const tSide = dragged.side;
    const actualSide = swapped ? (tSide === 'home' ? 'away' : 'home') : tSide;
    const playerId = dragged.id ?? dragged.lineupOrder;

    setManualPos(prev => (prev ?? autoPositions).filter(p => uid(p) !== dragUid));
    setLocalSubs(s => ({
      ...s,
      [tSide]: [...(s[tSide] || []), { ...dragged, isSubstitute: true }],
    }));
    skipResetRef.current = true;
    setLineupData(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        [actualSide]: (prev[actualSide] || []).map(p =>
          (p.id ?? p.lineupOrder) === playerId ? { ...p, isSubstitute: true } : p
        ),
      };
    });
  };

  // ── DROP sobre campo libre ──
  const handleFieldDrop = (e) => {
    e.preventDefault();
    const dragUid = e.dataTransfer.getData('uid');
    if (!dragUid) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top)  / rect.height) * 100;

    const [dragSide, ...rest] = dragUid.split('-');
    const dragIdStr = rest.join('-');
    const dragSub = localSubs[dragSide]?.find(
      p => String(p.id ?? p.lineupOrder) === dragIdStr,
    );
    if (dragSub) {
      setManualPos(prev => {
        const list = [...(prev ?? autoPositions)];
        if (!list.find(p => uid(p) === dragUid)) {
          // dragSub.team ya viene correcto desde localSubs — no recalcular desde dragSide (lado visual).
          list.push({ ...dragSub, side: dragSide, x, y, isSubstitute: false });
        }
        return list;
      });
      setLocalSubs(s => ({
        ...s,
        [dragSide]: s[dragSide].filter(p => (p.id ?? p.lineupOrder) !== (dragSub.id ?? dragSub.lineupOrder)),
      }));
    } else {
      setManualPos(prev =>
        (prev ?? autoPositions).map(p => uid(p) === dragUid ? { ...p, x, y } : p),
      );
    }
  };

  // Nombres/formaciones fijos por identidad real (team1=rojo, team2=azul),
  // independientes del lado visual — así el color siempre coincide con el
  // equipo real, incluso al compartir el estado con otra sesión (push/pull).
  const team1Label = (team1Name || analysis?.team1?.name) || (baseSwapped ? lineupData?.away_name : lineupData?.home_name) || 'Equipo 1';
  const team2Label = (team2Name || analysis?.team2?.name) || (baseSwapped ? lineupData?.home_name : lineupData?.away_name) || 'Equipo 2';
  // Qué equipo real ocupa cada bando visual (el panel de suplentes sigue
  // indexado por lado visual home/away).
  const homeTeam = swapped ? teamOfAway : teamOfHome;
  const awayTeam = swapped ? teamOfHome : teamOfAway;
  const homeName = homeTeam === 'team1' ? team1Label : team2Label;
  const awayName = awayTeam === 'team1' ? team1Label : team2Label;
  const team1Formation = baseSwapped ? lineupData?.away_formation : lineupData?.home_formation;
  const team2Formation = baseSwapped ? lineupData?.home_formation : lineupData?.away_formation;

  return (
    <div className="flex flex-col md:flex-row gap-3">
      <div className="flex-1 flex flex-col gap-2">

        {/* Barra compacta siempre visible */}
        <div className="shrink-0">
          <div className="flex flex-wrap items-center gap-2 bg-gray-900 border border-gray-700/50 rounded-xl px-3 py-2">
            <span className="text-white text-xs font-bold">👕 Alineaciones</span>
            {lineupData && (
              <span className="text-gray-500 text-[10px]">
                {team1Label} {team1Formation} vs {team2Label} {team2Formation}
              </span>
            )}
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {lineupData && (
                <button onClick={() => setSwapped(v => !v)}
                  className="text-[10px] px-2 py-1 rounded-lg bg-gray-800 border border-gray-600 text-yellow-400 hover:bg-gray-700 transition-colors whitespace-nowrap font-bold">
                  ⇄ Invertir lados
                </button>
              )}
              {lineupData?.match_id && (
                <button onClick={updateLiveStatus} disabled={updatingLive}
                  title="Trae goles, disparos, tarjetas y demás stats reales desde SofaScore"
                  className="text-[10px] px-2 py-1 rounded-lg bg-gray-800 border border-green-600 text-green-400 hover:bg-gray-700 transition-colors whitespace-nowrap font-bold disabled:opacity-50">
                  {updatingLive ? '⏳ Actualizando...' : '🔄 Actualizar estado'}
                </button>
              )}
              {lineupData && manualPos && (
                <button onClick={() => setManualPos(null)}
                  className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors whitespace-nowrap">
                  ↺ Reset posiciones
                </button>
              )}
              {lineupData && (
                <button onClick={() => { setManualPos(null); setLineupData(null); setSwapped(false); }}
                  className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors whitespace-nowrap">
                  ✕ Quitar
                </button>
              )}
              <button
                onClick={() => setShowControls(v => !v)}
                className="text-[10px] px-2 py-1 rounded-lg bg-gray-800 border border-gray-600 text-gray-300 hover:bg-gray-700 transition-colors whitespace-nowrap">
                {showControls ? '▲ Ocultar' : '▼ Cargar alineación'}
              </button>
            </div>
          </div>
          {liveError && <div className="text-red-400 text-[10px] px-1">{liveError}</div>}

          {/* Panel expandible */}
          {showControls && (
            <div className="mt-1 bg-gray-900 border border-gray-700/50 rounded-xl p-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-gray-400 mb-1">URL del partido SofaScore</div>
                  <input value={urlInput} onChange={e => setUrlInput(e.target.value)}
                    placeholder="https://www.sofascore.com/...#id:12345678"
                    className="w-full bg-gray-900 border border-gray-600 text-white text-xs rounded-lg px-3 py-2 mb-2 focus:outline-none focus:border-green-500"/>
                  <button onClick={loadUrl} disabled={loading} className="btn-primary w-full text-xs py-1.5">
                    {loading ? '⏳ Cargando...' : '🔗 Cargar desde URL'}
                  </button>
                </div>
                <div>
                  <div className="text-xs text-gray-400 mb-1">Auto detectar</div>
                  <div className="flex gap-3 mb-2">
                    {['home','away'].map(s => (
                      <label key={s} className="flex items-center gap-1.5 cursor-pointer text-xs text-gray-300">
                        <input type="radio" checked={autoSide===s} onChange={()=>setAutoSide(s)} className="accent-green-500"/>
                        {s==='home' ? '🟢 Local' : '🔵 Visita'}
                      </label>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={autoDetect} disabled={loading} className="btn-secondary flex-1 text-xs py-1.5">
                      {loading ? '⏳...' : '🚀 Auto-detectar próximo'}
                    </button>
                    <button onClick={downloadCurrent} disabled={loading}
                      title="Trae el último partido con id (útil si el partido ya arrancó)"
                      className="btn-secondary flex-1 text-xs py-1.5">
                      {loading ? '⏳...' : '📥 Descargar actual'}
                    </button>
                  </div>
                </div>
              </div>
              {error && <div className="mt-2 text-red-400 text-xs">{error}</div>}
            </div>
          )}
        </div>

        {/* Leyenda */}
        <div className="flex flex-wrap items-center gap-4 text-xs shrink-0">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-700"/>
            <span className="text-gray-300">{team1Label}</span>
            {team1Formation && <span className="text-gray-500 font-mono">{team1Formation}</span>}
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-blue-700"/>
            <span className="text-gray-300">{team2Label}</span>
            {team2Formation && <span className="text-gray-500 font-mono">{team2Formation}</span>}
          </div>
          <span className="text-gray-600 text-[10px] ml-auto">
            Suplente→Titular ó Titular→Suplente para sustituir
          </span>
        </div>

        {/* Campo */}
        <div className="flex-1 relative bg-green-900 rounded-xl border-2 border-green-700 overflow-hidden min-h-[320px]"
          onDrop={handleFieldDrop} onDragOver={e => e.preventDefault()}>
          <FieldMarkings/>
          {positions.map((p, i) => (
            <PlayerDot
              key={`${p.side}-${p.id ?? i}`}
              player={p}
              evSummary={playerEvents?.[uid(p)]}
              onDragStart={handleDragStart}
              onDrop={handlePlayerDrop}/>
          ))}
          {positions.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-green-600/40 text-sm">
              Carga una alineación para visualizarla
            </div>
          )}
        </div>
      </div>

      {/* Panel de suplentes */}
      <div className="w-full md:w-40 lg:w-52 shrink-0 flex flex-col gap-2 overflow-auto"
        onDrop={handleSidebarDrop} onDragOver={e => e.preventDefault()}>
        <div className="text-white font-bold text-sm">Suplentes</div>

        <div className="flex rounded-lg overflow-hidden border border-gray-700">
          <button
            onClick={() => setSubTeam('home')}
            className={`flex-1 text-[10px] py-1.5 font-bold transition-colors
              ${subTeam === 'home' ? (homeTeam === 'team1' ? 'bg-red-700' : 'bg-blue-700') + ' text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
            ● {homeName.split(' ')[0]}
          </button>
          <button
            onClick={() => setSubTeam('away')}
            className={`flex-1 text-[10px] py-1.5 font-bold transition-colors
              ${subTeam === 'away' ? (awayTeam === 'team1' ? 'bg-red-700' : 'bg-blue-700') + ' text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
            ● {awayName.split(' ')[0]}
          </button>
        </div>

        <div className="text-gray-600 text-[9px]">
          Arrastra un jugador del campo aquí para enviarlo al banco.<br/>
          Arrastra un suplente al campo para que entre.
        </div>

        <div className="stat-card flex-1 min-h-0 overflow-auto">
          <div className={`font-bold text-xs mb-2 ${(subTeam === 'home' ? homeTeam : awayTeam) === 'team1' ? 'text-red-400' : 'text-blue-400'}`}>
            ● {subTeam === 'home' ? homeName : awayName}
            <span className="text-gray-500 font-normal ml-1">
              ({localSubs[subTeam]?.length ?? 0} suplentes)
            </span>
          </div>
          <div className="space-y-1">
            {(localSubs[subTeam]?.length ?? 0) === 0
              ? <div className="text-gray-600 text-xs">Sin suplentes cargados</div>
              : localSubs[subTeam].map((p, i) => (
                <div key={i}
                  draggable
                  onDragStart={e => {
                    e.dataTransfer.setData('uid', `${subTeam}-${p.id ?? p.lineupOrder}`);
                  }}
                  onDragOver={e => e.preventDefault()}
                  className={`flex items-center gap-2 rounded p-1 transition-colors cursor-grab
                    ${p.team === 'team1'
                      ? 'hover:bg-red-900/30 active:bg-red-900/50'
                      : 'hover:bg-blue-900/30 active:bg-blue-900/50'}`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0
                    ${p.team === 'team1' ? 'bg-red-700' : 'bg-blue-700'}`}>
                    {p.number ?? '?'}
                  </div>
                  <div className="min-w-0">
                    <div className="text-gray-200 text-[10px] truncate font-medium">
                      {p.shortName || p.name}
                    </div>
                    <div className="text-gray-500 text-[9px]">{p.position}</div>
                  </div>
                </div>
              ))
            }
          </div>
        </div>
      </div>
    </div>
  );
}
