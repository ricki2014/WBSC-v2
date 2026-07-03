// TAB 2 — Registro por equipo
import { useRef } from 'react';

const ACTIONS = [
  { icon: '⚽', label: '+ Gol',          key: 'Goles' },
  { icon: '🚩', label: '+ Corner',        key: 'Corners' },
  { icon: '🟨', label: '+ Tarjeta',       key: 'Tarjetas' },
  { icon: '🎯', label: '+ Disparo',       key: 'Disparos' },
  { icon: '🥅', label: '+ Tiro al arco',  key: 'TiroAlArco' },
  { icon: '↔️', label: '+ Pase',          key: 'Pases' },
  { icon: '🤛', label: '+ Foul cometido', key: 'FoulCometido' },
  { icon: '🛡️', label: '+ Foul recibido', key: 'FoulRecibido' },
];

const STAT_LABELS = {
  Goles:'Goles', Corners:'Corners', Tarjetas:'Tarjetas',
  Disparos:'Disparos totales', TiroAlArco:'Tiros al arco',
  Pases:'Pases', FoulCometido:'Fouls cometidos', FoulRecibido:'Fouls recibidos',
};

const INIT_LIVE = {
  team1: { Goles:0, Corners:0, Tarjetas:0, Rojas:0, Disparos:0, TiroAlArco:0, Pases:0, FoulCometido:0, FoulRecibido:0 },
  team2: { Goles:0, Corners:0, Tarjetas:0, Rojas:0, Disparos:0, TiroAlArco:0, Pases:0, FoulCometido:0, FoulRecibido:0 },
};

export default function P2_RegistroEquipo({
  team1Name, team2Name,
  liveStats, setLiveStats,
  score, setScore,
  timer, setTimer,
  isRunning, setIsRunning,
  period, setPeriod,
  playerEvents, setPlayerEvents,
}) {
  const historyRef = useRef([]);
  const t1 = liveStats.team1;
  const t2 = liveStats.team2;

  // Guarda snapshot antes de cada acción (clausura sobre valores actuales)
  const saveSnapshot = (currentLive, currentScore) => {
    historyRef.current = [
      ...historyRef.current.slice(-40),
      {
        liveStats: { team1: { ...currentLive.team1 }, team2: { ...currentLive.team2 } },
        score: { ...currentScore },
      },
    ];
  };

  const undo = () => {
    if (historyRef.current.length === 0) return;
    const snap = historyRef.current[historyRef.current.length - 1];
    historyRef.current = historyRef.current.slice(0, -1);
    setLiveStats(snap.liveStats);
    setScore(snap.score);
  };

  const inc = (team, key) => {
    saveSnapshot(liveStats, score);
    const rival = team === 'team1' ? 'team2' : 'team1';
    setLiveStats(prev => {
      const next = { ...prev, [team]: { ...prev[team], [key]: prev[team][key] + 1 } };
      // Foul cometido ↔ foul recibido del rival (bidireccional)
      if (key === 'FoulCometido') {
        next[rival] = { ...next[rival], FoulRecibido: next[rival].FoulRecibido + 1 };
      }
      if (key === 'FoulRecibido') {
        next[rival] = { ...next[rival], FoulCometido: next[rival].FoulCometido + 1 };
      }
      return next;
    });
  };

  const handleGol = (team) => {
    saveSnapshot(liveStats, score);
    setLiveStats(prev => ({
      ...prev,
      [team]: {
        ...prev[team],
        Goles:      prev[team].Goles      + 1,
        TiroAlArco: prev[team].TiroAlArco + 1,
        Disparos:   prev[team].Disparos   + 1,
      },
    }));
    const side = team === 'team1' ? 'home' : 'away';
    setScore(prev => ({ ...prev, [side]: prev[side] + 1 }));
  };

  const fmt = (s) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const canUndo = historyRef.current.length > 0;

  const doAction = (team, key) =>
    key === 'Goles' ? handleGol(team) : inc(team, key);

  const resetAll = () => {
    if (!window.confirm('¿Reiniciar estadísticas en vivo, marcador, cronómetro y eventos de jugadores?\n(Las alineaciones y el análisis prematch se conservan)')) return;
    historyRef.current = [];
    setLiveStats(INIT_LIVE);
    setScore({ home: 0, away: 0 });
    setTimer(0);
    setIsRunning(false);
    setPeriod('1T');
    setPlayerEvents({});
  };

  return (
    <div className="md:h-full flex flex-col overflow-y-auto md:overflow-hidden">
      <div className="grid grid-cols-1 md:grid-cols-[1fr,280px,1fr] gap-3 flex-1 md:overflow-hidden">

        {/* Team 1 buttons */}
        <div className="flex flex-col gap-1.5 md:overflow-auto pr-1">
          <div className="text-green-400 font-bold text-sm mb-1 text-center">
            {team1Name || 'Equipo Local'}
          </div>
          {ACTIONS.map(a => (
            <button key={a.key} onClick={() => doAction('team1', a.key)}
              className="btn-action justify-center">
              <span>{a.icon}</span>{a.label}
            </button>
          ))}
        </div>

        {/* Center: score + undo + stats table */}
        <div className="flex flex-col items-center gap-3">
          {/* Score card */}
          <div className="stat-card w-full text-center">
            <div className="text-xs text-gray-500 mb-1">Marcadores y Cronómetro</div>
            <div className="text-4xl font-bold text-white mb-2">{fmt(timer)}</div>
            <div className="flex gap-2 justify-center mb-3">
              <button
                onClick={() => setIsRunning(r => !r)}
                className={`px-4 py-1.5 rounded-lg font-bold text-sm ${isRunning ? 'bg-yellow-600 hover:bg-yellow-500' : 'bg-green-600 hover:bg-green-500'}`}>
                {isRunning ? '⏸ Pausar' : '▶ Iniciar'}
              </button>
              <button
                onClick={() => { setTimer(0); setIsRunning(false); }}
                className="px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-xs">
                Reset
              </button>
            </div>
            <div className="flex items-center justify-center gap-4 mb-3">
              <div className="text-center">
                <div className="text-xs text-green-400 font-bold truncate max-w-[80px]">
                  {team1Name || 'Local'}
                </div>
                <div className="text-3xl font-bold text-white">{score.home}</div>
              </div>
              <div className="text-gray-500 font-bold text-xl">—</div>
              <div className="text-center">
                <div className="text-xs text-blue-400 font-bold truncate max-w-[80px]">
                  {team2Name || 'Visita'}
                </div>
                <div className="text-3xl font-bold text-white">{score.away}</div>
              </div>
            </div>
            <div className="flex gap-1 justify-center">
              {['1T', '2T', 'ET', 'P'].map(p => (
                <button key={p} onClick={() => setPeriod(p)}
                  className={`text-xs px-2 py-1 rounded font-bold ${period === p ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-400'}`}>
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Deshacer última modificación */}
          <button
            onClick={undo}
            disabled={!canUndo}
            className={`w-full flex items-center justify-center gap-2 py-2 rounded-xl border font-semibold text-sm transition-all
              ${canUndo
                ? 'bg-orange-900/30 hover:bg-orange-900/50 border-orange-700/60 text-orange-400'
                : 'bg-gray-800/30 border-gray-700/30 text-gray-600 cursor-not-allowed'}`}>
            ↩ Deshacer última modificación
            {canUndo && (
              <span className="bg-orange-700 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {historyRef.current.length}
              </span>
            )}
          </button>

          {/* Stats table */}
          <div className="stat-card w-full flex-1 overflow-auto">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-gray-400">📈 Contadores en vivo</span>
              <button
                onClick={resetAll}
                className="text-[10px] px-2 py-1 rounded border border-red-700/50 bg-red-900/20 text-red-400 hover:bg-red-900/40 hover:border-red-600 transition-all font-medium">
                🔄 Reiniciar
              </button>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-gray-500 text-left pb-1 font-medium">Estadística</th>
                  <th className="text-green-400 pb-1 font-bold">
                    {team1Name?.split(' ')[0] || 'L'}
                  </th>
                  <th className="text-blue-400 pb-1 font-bold">
                    {team2Name?.split(' ')[0] || 'V'}
                  </th>
                </tr>
              </thead>
              <tbody>
                {ACTIONS.map(a => (
                  <tr key={a.key} className="border-b border-gray-800/50">
                    <td className="py-1 text-gray-300">{a.icon} {STAT_LABELS[a.key]}</td>
                    <td className="py-1 text-center text-green-400 font-bold">{t1[a.key]}</td>
                    <td className="py-1 text-center text-blue-400 font-bold">{t2[a.key]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Team 2 buttons */}
        <div className="flex flex-col gap-1.5 md:overflow-auto pl-1">
          <div className="text-blue-400 font-bold text-sm mb-1 text-center">
            {team2Name || 'Equipo Visita'}
          </div>
          {ACTIONS.map(a => (
            <button key={a.key} onClick={() => doAction('team2', a.key)}
              className="btn-action justify-center">
              <span>{a.icon}</span>{a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

