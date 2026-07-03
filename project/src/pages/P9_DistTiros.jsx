// TAB 9 — Distribución de tiros por tramo
import { useState, useEffect, useMemo } from 'react';
import { fetchShotDistribution } from '../api';

const RESULTADO_COLOR = {
  'Gol':      { bar: 'bg-yellow-400', text: 'text-yellow-400' },
  'Al arco':  { bar: 'bg-green-500',  text: 'text-green-400'  },
  'Afuera':   { bar: 'bg-gray-500',   text: 'text-gray-400'   },
  'Bloqueado':{ bar: 'bg-orange-500', text: 'text-orange-400' },
};
const RESULTADO_ORDER = ['Gol', 'Al arco', 'Afuera', 'Bloqueado'];

// ─── FORMACIÓN → COORDENADAS (igual que P5/P7/P8) ────────────────────────────
// side: lado VISUAL ('home'/'away') · team: identidad real ('team1'/'team2'),
// independiente del lado visual (que puede invertirse en 2T o manualmente).
function layoutFormation(players, formation, side, team) {
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
      const y = n === 1 ? 50 : 12 + ((n - 1 - pi) / (n - 1)) * 76;
      result.push({ ...player, x, y: isHome ? y : 100 - y, side, team });
    });
  });
  return result;
}

function playerLabel(player) {
  const full = player.name || player.shortName || '';
  const parts = full.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0][0].toUpperCase()}. ${parts.slice(1).join(' ')}`;
  return full;
}

// ─── BARRAS ───────────────────────────────────────────────────────────────────
function ShotBar({ bin, maxCount }) {
  const total  = bin.count;
  const height = Math.max(4, (total / Math.max(maxCount, 1)) * 96);
  const segments = RESULTADO_ORDER
    .map(r => ({ r, n: bin.by_result?.[r] || 0 }))
    .filter(s => s.n > 0);
  return (
    <div className="flex-1 flex flex-col items-center gap-0.5">
      {total > 0 && <span className="text-[9px] text-gray-400 font-bold leading-none">{total}</span>}
      <div className="w-full flex flex-col-reverse rounded-t overflow-hidden" style={{ height: `${height}px` }}>
        {segments.map(({ r, n }) => (
          <div key={r} className={`w-full ${RESULTADO_COLOR[r]?.bar ?? 'bg-gray-600'}`}
            style={{ height: `${(n / total) * 100}%` }} title={`${r}: ${n}`} />
        ))}
        {total === 0 && <div className="w-full h-1 bg-gray-700/40 rounded" />}
      </div>
    </div>
  );
}

function DistChart({ distribution, subtitle, color, loading, noDataMsg }) {
  const compact = distribution && distribution.length > 12;
  if (loading) return <div className="flex items-center justify-center py-6 text-gray-500 text-xs">Cargando...</div>;
  if (!distribution || distribution.length === 0) return (
    <div className="flex items-center justify-center py-6 text-gray-500 text-xs">{noDataMsg || 'Sin datos'}</div>
  );
  const total = distribution.reduce((s, d) => s + d.count, 0);
  if (total === 0) return (
    <div className="flex items-center justify-center py-6 text-gray-500 text-xs">Sin disparos registrados</div>
  );
  const maxCount = Math.max(...distribution.map(d => d.count), 1);
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
        <span className="text-gray-500 text-[10px]">{total} disparos</span>
      </div>
      <div className={`flex items-end ${compact ? 'gap-0.5' : 'gap-1.5'}`} style={{ height: '100px' }}>
        {distribution.map((d, i) => <ShotBar key={i} bin={d} maxCount={maxCount} />)}
      </div>
      <div className={`flex ${compact ? 'gap-0.5' : 'gap-1.5'}`}>
        {distribution.map((d, i) => (
          <div key={i} className={`flex-1 text-center text-gray-600 leading-tight ${compact ? 'text-[6px]' : 'text-[8px]'}`}>
            {d.label}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 pt-1 border-t border-gray-800">
        {RESULTADO_ORDER.filter(r => byRes[r]).map(r => (
          <div key={r} className="flex items-center gap-1">
            <div className={`w-2 h-2 rounded-sm ${RESULTADO_COLOR[r]?.bar ?? 'bg-gray-600'}`} />
            <span className={`text-[10px] ${RESULTADO_COLOR[r]?.text ?? 'text-gray-400'}`}>{r} ({byRes[r]})</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── PANEL DE EQUIPO (gráficos 10+5 min) ─────────────────────────────────────
function TeamPanel({ file, teamName, color }) {
  const [data10, setData10] = useState(null);
  const [data5,  setData5]  = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState('all');

  useEffect(() => {
    if (!file) return;
    setLoading(true);
    Promise.all([fetchShotDistribution(file, 'all', 10), fetchShotDistribution(file, 'all', 5)])
      .then(([d10, d5]) => { setData10(d10); setData5(d5); setSelectedMatch('all'); })
      .catch(() => { setData10(null); setData5(null); })
      .finally(() => setLoading(false));
  }, [file]);

  const handleMatchChange = (matchId) => {
    setSelectedMatch(matchId);
    if (!file) return;
    setLoading(true);
    Promise.all([fetchShotDistribution(file, matchId, 10), fetchShotDistribution(file, matchId, 5)])
      .then(([d10, d5]) => {
        setData10(prev => ({ ...prev, distribution: d10.distribution }));
        setData5(prev  => ({ ...prev, distribution: d5.distribution }));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  const matches      = data10?.matches || [];
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
      <DistChart distribution={data10?.distribution} subtitle="Tramos de 10 min" color={color} loading={loading} />
      <DistChart distribution={data5?.distribution}  subtitle="Tramos de 5 min"  color={color} loading={loading} />
    </div>
  );
}

// ─── PUNTO DE JUGADOR EN CANCHA ───────────────────────────────────────────────
function PlayerDot({ player, selected, onClick }) {
  const isHome = player.side === 'home';
  const baseColor = isHome ? 'bg-red-700 border-red-400' : 'bg-blue-700 border-blue-400';
  const selColor  = isHome ? 'bg-red-400 border-yellow-300' : 'bg-blue-400 border-yellow-300';
  const label = playerLabel(player);
  return (
    <div
      onClick={() => onClick(player)}
      className="absolute flex flex-col items-center select-none cursor-pointer group"
      style={{ left: `${player.x}%`, top: `${player.y}%`, transform: 'translate(-50%,-50%)' }}>
      <div className={`w-10 h-10 rounded-full border-2 flex items-center justify-center font-bold text-white text-sm shadow-lg transition-all
        ${selected ? selColor + ' ring-2 ring-yellow-400 scale-110' : baseColor + ' group-hover:scale-105'}`}>
        {player.number ?? '?'}
      </div>
      <span className="text-[10px] text-white bg-black/70 px-1 rounded truncate max-w-[72px] text-center mt-0.5 leading-tight">
        {label}
      </span>
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
function PlayerShotSection({ lineupData, manualPos, fieldSwapped, baseSwapped, selectedFiles, team1Name, team2Name }) {
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [playerDist, setPlayerDist]         = useState(null);
  const [loadingDist, setLoadingDist]       = useState(false);

  const swapped = fieldSwapped;
  // Identidad real de equipo — independiente del lado visual (que invierte en 2T).
  const teamOfHome = baseSwapped ? 'team2' : 'team1';
  const teamOfAway = baseSwapped ? 'team1' : 'team2';

  const positions = useMemo(() => {
    if (manualPos) return manualPos;
    if (!lineupData) return [];
    const h  = swapped ? lineupData.away : lineupData.home;
    const a  = swapped ? lineupData.home : lineupData.away;
    const hf = swapped ? lineupData.away_formation : lineupData.home_formation;
    const af = swapped ? lineupData.home_formation : lineupData.away_formation;
    const hTeam = swapped ? teamOfAway : teamOfHome;
    const aTeam = swapped ? teamOfHome : teamOfAway;
    return [
      ...layoutFormation(h || [], hf || '', 'home', hTeam),
      ...layoutFormation(a || [], af || '', 'away', aTeam),
    ];
  }, [manualPos, lineupData, swapped, teamOfHome, teamOfAway]);

  const handlePlayerClick = (player) => {
    if (selectedPlayer && (selectedPlayer.id ?? selectedPlayer.lineupOrder) === (player.id ?? player.lineupOrder)) {
      setSelectedPlayer(null);
      setPlayerDist(null);
      return;
    }
    setSelectedPlayer(player);
    setPlayerDist(null);

    // player.team ya es la identidad real (team1/team2) — no hay que
    // volver a corregir por "swapped" acá, eso ya duplicaba la inversión.
    const isTeam1Player = player.team === 'team1';
    const file = isTeam1Player ? selectedFiles?.f1 : selectedFiles?.f2;
    if (!file) return;

    const name = player.name || player.shortName || '';
    setLoadingDist(true);
    fetchShotDistribution(file, 'all', 10, name)
      .then(d => setPlayerDist(d.distribution))
      .catch(() => setPlayerDist(null))
      .finally(() => setLoadingDist(false));
  };

  if (!lineupData) return null;

  const homeName = swapped ? (lineupData.away_name || team2Name || 'Visita') : (lineupData.home_name || team1Name || 'Local');
  const awayName = swapped ? (lineupData.home_name || team1Name || 'Local')  : (lineupData.away_name || team2Name || 'Visita');
  const selLabel = selectedPlayer ? playerLabel(selectedPlayer) : null;
  const selIsHome = selectedPlayer?.side === 'home';

  return (
    <div className="flex flex-col gap-3 border-t border-gray-700/50 pt-3 mt-1">
      <div className="text-white font-bold text-sm shrink-0">
        🎯 Tiros por jugador · clic para ver distribución (10 min)
      </div>

      <div className="flex flex-col md:flex-row gap-3">
        {/* Campo */}
        <div className="flex-1 flex flex-col gap-1 min-w-0">
          <div className="flex flex-wrap items-center gap-4 text-xs mb-1">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-700"/>
              <span className="text-gray-300">{homeName}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-blue-700"/>
              <span className="text-gray-300">{awayName}</span>
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
                />
              );
            })}
            {positions.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center text-green-600/40 text-sm">
                Sin jugadores en cancha
              </div>
            )}
          </div>
        </div>

        {/* Gráfico del jugador seleccionado */}
        <div className="w-full md:w-72 shrink-0 flex flex-col justify-center">
          {!selectedPlayer ? (
            <div className="h-full flex items-center justify-center text-gray-600 text-xs text-center border border-gray-700/40 rounded-xl p-4">
              Seleccioná un jugador en la cancha para ver su distribución de tiros
            </div>
          ) : (
            <DistChart
              distribution={playerDist}
              subtitle={`${selLabel} · Tiros por tramo (10 min)`}
              color={selIsHome ? 'red' : 'blue'}
              loading={loadingDist}
              noDataMsg="Sin disparos para este jugador"
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────
export default function P9_DistTiros({
  analysis, selectedFiles,
  lineupData, manualPos, fieldSwapped, baseSwapped,
  team1Name, team2Name,
}) {
  if (!analysis) return (
    <div className="h-full flex items-center justify-center text-gray-500 text-sm">
      <div className="text-center">
        <div className="text-4xl mb-3">🎯</div>
        <div>Selecciona equipos y pulsa <strong className="text-white">Analizar</strong></div>
        <div className="text-[11px] text-gray-600 mt-1">Requiere hoja "Disparos Detalle" en el Excel</div>
      </div>
    </div>
  );

  return (
    <div className="h-full flex flex-col gap-3 overflow-auto p-1">
      {/* Encabezado */}
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-white font-bold text-sm">🎯 Distribución de tiros por tramo</span>
        <div className="flex gap-1 ml-2">
          {Object.entries(RESULTADO_COLOR).map(([r, c]) => (
            <div key={r} className="flex items-center gap-0.5">
              <div className={`w-2 h-2 rounded-sm ${c.bar}`} />
              <span className="text-[9px] text-gray-500">{r}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Paneles por equipo */}
      <div className="flex flex-col md:flex-row gap-3">
        <TeamPanel file={selectedFiles?.f1} teamName={analysis.team1?.name} color="green" />
        <TeamPanel file={selectedFiles?.f2} teamName={analysis.team2?.name} color="blue"  />
      </div>

      <div className="text-[10px] text-gray-600 shrink-0">
        Disparos de la hoja "Disparos Detalle" · filtrá por partido para ver cada juego individualmente
      </div>

      {/* Campo interactivo por jugador */}
      <PlayerShotSection
        lineupData={lineupData}
        manualPos={manualPos}
        fieldSwapped={fieldSwapped}
        baseSwapped={baseSwapped}
        selectedFiles={selectedFiles}
        team1Name={team1Name}
        team2Name={team2Name}
      />
    </div>
  );
}
