import { useState, useEffect, useRef } from 'react';
import Header from './components/Header';
import Tabs from './components/Tabs';
import FileSelector from './components/FileSelector';
import { getAnalysis } from './api';

import P1_Comparacion           from './pages/P1_Comparacion';
import P2_RegistroEquipo        from './pages/P2_RegistroEquipo';
import P3_RegistroJugadorCancha from './pages/P3_RegistroJugadorCancha';
import P4_EsperadoSucedido      from './pages/P4_EsperadoSucedido';
import P5_Alineaciones          from './pages/P5_Alineaciones';
import P6_StatsJugador          from './pages/P6_StatsJugador';
import P7_StatsVivoJugador      from './pages/P7_StatsVivoJugador';
import P8_StatsEnCancha         from './pages/P8_StatsEnCancha';
import P9_DistTiros             from './pages/P9_DistTiros';

const INIT_LIVE = {
  team1: { Goles:0, Corners:0, Tarjetas:0, Rojas:0, Disparos:0, TiroAlArco:0, Pases:0, FoulCometido:0, FoulRecibido:0 },
  team2: { Goles:0, Corners:0, Tarjetas:0, Rojas:0, Disparos:0, TiroAlArco:0, Pases:0, FoulCometido:0, FoulRecibido:0 },
};

export default function App() {
  const [tab, setTab]               = useState(0);
  const [analysis, setAnalysis]     = useState(null);
  const [loading, setLoading]       = useState(false);
  const [selectedFiles, setSelectedFiles] = useState({ f1: null, f2: null });
  const [liveStats, setLiveStats]   = useState(INIT_LIVE);
  const [score, setScore]           = useState({ home: 0, away: 0 });
  const [timer, setTimer]           = useState(0);
  const [isRunning, setIsRunning]   = useState(false);
  const [period, setPeriod]         = useState('1T');
  const [lastUpdate, setLastUpdate] = useState(null);

  // Lineup compartido entre P3 (cancha), P5 (formaciones) y P7 (stats vivo)
  const [lineupData,   setLineupData]   = useState(null);
  const [manualPos,    setManualPos]    = useState(null);
  const [playerEvents, setPlayerEvents] = useState({});

  // Estadística seleccionada compartida entre Stats Fijos y Stats en Vivo
  const [selectedStatKey, setSelectedStatKey] = useState('Goles p90');

  // Registro de eventos del jugador — persisten al cambiar de pestaña
  const [registroEvents,    setRegistroEvents]    = useState([]);
  const [lastRegistroEvent, setLastRegistroEvent] = useState(null);
  const registroHistoryRef = useRef([]);
  // baseSwapped = lado correcto para 1T (team1 a la izquierda)
  // En 2T los equipos cambian de lado, así que fieldSwapped = !base
  const [baseSwapped, setBaseSwapped]   = useState(false);
  const fieldSwapped = period === '2T' ? !baseSwapped : baseSwapped;
  // setFieldSwapped para uso manual (toggle) desde P3/P5 — siempre mueve baseSwapped
  const setFieldSwapped = (updater) =>
    setBaseSwapped(prev => typeof updater === 'function' ? !prev : (period === '2T' ? !updater : updater));

  // Auto-detectar al cargar lineup: si team1 es el "away" en SofaScore, swap
  useEffect(() => {
    const t1name = analysis?.team1?.name;
    if (!lineupData || !t1name) return;
    const t1 = t1name.toLowerCase();
    const awayN = (lineupData.away_name || '').toLowerCase();
    const homeN = (lineupData.home_name || '').toLowerCase();
    const awayIsTeam1 = awayN.includes(t1.split(' ')[0]) || t1.includes(awayN.split(' ')[0]);
    const homeIsTeam1 = homeN.includes(t1.split(' ')[0]) || t1.includes(homeN.split(' ')[0]);
    setBaseSwapped(awayIsTeam1 && !homeIsTeam1);
  }, [lineupData]);

  // Al invertir lados: espejear x (100-x) y cambiar side, sin perder el orden manual
  useEffect(() => {
    setManualPos(prev => {
      if (!prev) return null;
      return prev.map(p => ({
        ...p,
        x: 100 - p.x,
        y: 100 - p.y,
        side: p.side === 'home' ? 'away' : 'home',
      }));
    });
  }, [fieldSwapped]);

  const intervalRef = useRef(null);

  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(() => setTimer(t => t + 1), 1000);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [isRunning]);

  const handleSelectFiles = async (f1, f2) => {
    setLoading(true);
    setSelectedFiles({ f1, f2 });
    try {
      const data = await getAnalysis(f1, f2);
      setAnalysis(data);
      setLiveStats(INIT_LIVE);
      setScore({ home: 0, away: 0 });
      setTimer(0);
      setIsRunning(false);
      setPeriod('1T');
      setLineupData(null);
      setManualPos(null);
      setPlayerEvents({});
      setRegistroEvents([]);
      setLastRegistroEvent(null);
      registroHistoryRef.current = [];
      setBaseSwapped(false);
      setLastUpdate(new Date().toLocaleTimeString());
    } catch (e) {
      console.error('Error cargando análisis:', e);
    } finally {
      setLoading(false);
    }
  };

  const team1Name = analysis?.team1?.name;
  const team2Name = analysis?.team2?.name;

  const commonProps = {
    analysis, liveStats, setLiveStats, score, setScore,
    timer, setTimer, isRunning, setIsRunning, period, setPeriod,
    team1Name, team2Name, selectedFiles,
    lineupData, setLineupData,
    manualPos, setManualPos,
    playerEvents, setPlayerEvents,
    fieldSwapped, setFieldSwapped,
    registroEvents, setRegistroEvents,
    lastRegistroEvent, setLastRegistroEvent,
    registroHistoryRef,
    selectedStatKey, setSelectedStatKey,
  };

  const formation1 = lineupData?.home_formation || '';
  const formation2 = lineupData?.away_formation || '';

  return (
    <div className="w-screen h-screen flex flex-col bg-gray-950 overflow-hidden">
      <Header team1={team1Name} team2={team2Name} score={score} timer={timer} period={period} />

      {/* FileSelector — siempre visible arriba */}
      <div className="flex items-center gap-3 px-3 pt-2 pb-2 border-b border-gray-800 shrink-0">
        <FileSelector onSelectFiles={handleSelectFiles} />
        {/* Team badges inline */}
        {analysis && (
          <div className="flex gap-2 flex-1 min-w-0">
            <div className="bg-gray-900 border border-green-800/40 rounded-lg px-2 py-1 flex items-center gap-2 min-w-0">
              <div className="w-6 h-6 rounded-full bg-green-700 flex items-center justify-center font-bold text-white text-xs shrink-0">
                {team1Name?.[0]}
              </div>
              <div className="min-w-0">
                <div className="text-white font-bold text-xs truncate">{team1Name}</div>
                <div className="text-green-400 text-[10px] font-mono">{formation1 || '—'}</div>
              </div>
            </div>
            <div className="bg-gray-900 border border-blue-800/40 rounded-lg px-2 py-1 flex items-center gap-2 min-w-0">
              <div className="w-6 h-6 rounded-full bg-blue-700 flex items-center justify-center font-bold text-white text-xs shrink-0">
                {team2Name?.[0]}
              </div>
              <div className="min-w-0">
                <div className="text-white font-bold text-xs truncate">{team2Name}</div>
                <div className="text-blue-400 text-[10px] font-mono">{formation2 || '—'}</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="px-3 pt-1 pb-1 border-b border-gray-800 shrink-0">
        <Tabs tab={tab} setTab={setTab} />
      </div>

      {loading && (
        <div className="h-0.5 bg-gray-800 shrink-0">
          <div className="h-full bg-green-500 animate-pulse w-full"></div>
        </div>
      )}

      <div className="flex-1 overflow-hidden p-3">
        {tab === 0 && <P1_Comparacion           {...commonProps} />}
        {tab === 1 && <P2_RegistroEquipo         {...commonProps} />}
        {tab === 2 && <P4_EsperadoSucedido       {...commonProps} />}
        {tab === 3 && <P5_Alineaciones           {...commonProps} />}
        {tab === 4 && <P6_StatsJugador           {...commonProps} />}
        {tab === 5 && <P3_RegistroJugadorCancha  {...commonProps} />}
        {tab === 6 && <P8_StatsEnCancha          {...commonProps} />}
        {tab === 7 && <P7_StatsVivoJugador       {...commonProps} />}
        {tab === 8 && <P9_DistTiros              {...commonProps} />}
      </div>

      <div className="shrink-0 border-t border-gray-800 px-3 py-1 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${analysis ? 'bg-green-500 animate-pulse' : 'bg-gray-600'}`}></div>
          <span className="text-gray-500 text-xs">
            {lastUpdate ? `Última actualización: ${lastUpdate}` : 'Sin datos cargados'}
          </span>
        </div>
        <button onClick={() => window.print()} className="text-green-400 text-xs hover:text-green-300 font-medium">
          ⬇ Exportar informe
        </button>
      </div>
    </div>
  );
}
