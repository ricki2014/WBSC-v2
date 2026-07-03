import { useState, useEffect, useRef } from 'react';
import Header from './components/Header';
import Tabs from './components/Tabs';
import FileSelector from './components/FileSelector';
import { getAnalysis, pushWebUpdate, getSharedLiveState } from './api';

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

// Autoguardado: evita perder el registro en vivo si el navegador
// descarga la pestaña por falta de RAM (p. ej. al abrir otras apps en el celular).
const STORAGE_KEY = 'wc2026_live_state_v1';

function loadSavedState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

const saved = loadSavedState();

export default function App() {
  const [tab, setTab]               = useState(0);
  const [analysis, setAnalysis]     = useState(null);
  const [loading, setLoading]       = useState(false);
  const [selectedFiles, setSelectedFiles] = useState(saved.selectedFiles ?? { f1: null, f2: null });
  const [liveStats, setLiveStats]   = useState(saved.liveStats ?? INIT_LIVE);
  const [score, setScore]           = useState(saved.score ?? { home: 0, away: 0 });
  const [timer, setTimer]           = useState(saved.timer ?? 0);
  const [isRunning, setIsRunning]   = useState(saved.isRunning ?? false);
  const [period, setPeriod]         = useState(saved.period ?? '1T');
  const [lastUpdate, setLastUpdate] = useState(saved.lastUpdate ?? null);

  // Lineup compartido entre P3 (cancha), P5 (formaciones) y P7 (stats vivo)
  const [lineupData,   setLineupData]   = useState(saved.lineupData ?? null);
  const [manualPos,    setManualPos]    = useState(saved.manualPos ?? null);
  const [playerEvents, setPlayerEvents] = useState(saved.playerEvents ?? {});

  // Estadística seleccionada compartida entre Stats Fijos y Stats en Vivo
  const [selectedStatKey, setSelectedStatKey] = useState(saved.selectedStatKey ?? 'Goles p90');

  // Registro de eventos del jugador — persisten al cambiar de pestaña
  const [registroEvents,    setRegistroEvents]    = useState(saved.registroEvents ?? []);
  const [lastRegistroEvent, setLastRegistroEvent] = useState(saved.lastRegistroEvent ?? null);
  const registroHistoryRef = useRef([]);
  // baseSwapped = identidad REAL de equipo (¿lineupData.home es team1 o team2?),
  // solo la fija el auto-detect por nombre — "Invertir lados" NO debe tocarla,
  // porque eso rompe todos los lookups (archivo, stats) que dependen de saber
  // quién es quién. En 2T los equipos cambian de lado, así que el valor base
  // se invierte automáticamente para la posición VISUAL (no la identidad).
  const [baseSwapped, setBaseSwapped]   = useState(saved.baseSwapped ?? false);
  // visualSwap = preferencia puramente cosmética del usuario ("Invertir lados"),
  // independiente de quién es cada equipo.
  const [visualSwap, setVisualSwap]     = useState(saved.visualSwap ?? false);
  // Último "updated_at" del estado publicado que efectivamente cargaste (para
  // saber si hay una publicación más nueva sin haberla cargado todavía).
  const [lastPulledAt, setLastPulledAt] = useState(saved.lastPulledAt ?? null);
  const fieldSwapped = (period === '2T' ? !baseSwapped : baseSwapped) !== visualSwap;
  // setFieldSwapped: lo que usan los botones "Invertir lados" — solo mueve visualSwap.
  const setFieldSwapped = (updater) =>
    setVisualSwap(prev => typeof updater === 'function' ? !prev : updater);

  // Auto-detectar al cargar un lineup NUEVO: si team1 es el "away" en SofaScore, swap.
  // Dispara solo con match_id (no con lineupData entero) para no repetir la detección
  // — y pisar una corrección manual con "Invertir lados" — cada vez que una
  // sustitución (Actualizar estado) muta el roster del mismo partido.
  useEffect(() => {
    const t1name = analysis?.team1?.name;
    if (!lineupData || !t1name) return;
    const t1 = t1name.toLowerCase();
    const awayN = (lineupData.away_name || '').toLowerCase();
    const homeN = (lineupData.home_name || '').toLowerCase();
    const awayIsTeam1 = awayN.includes(t1.split(' ')[0]) || t1.includes(awayN.split(' ')[0]);
    const homeIsTeam1 = homeN.includes(t1.split(' ')[0]) || t1.includes(homeN.split(' ')[0]);
    setBaseSwapped(awayIsTeam1 && !homeIsTeam1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineupData?.match_id]);

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

  // Al abrir la app: si había equipos cargados en la sesión guardada, recuperar
  // el análisis (sin tocar el resto del estado en vivo ya restaurado).
  useEffect(() => {
    if (analysis || !selectedFiles?.f1 || !selectedFiles?.f2) return;
    getAnalysis(selectedFiles.f1, selectedFiles.f2)
      .then(setAnalysis)
      .catch(e => console.error('No se pudo restaurar el análisis guardado:', e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Autoguardado en localStorage — así el registro en vivo sobrevive
  // si el navegador descarga la pestaña por falta de RAM o se recarga la página.
  useEffect(() => {
    const snapshot = {
      selectedFiles, liveStats, score, timer, isRunning, period, lastUpdate,
      lineupData, manualPos, playerEvents, selectedStatKey,
      registroEvents, lastRegistroEvent, baseSwapped, visualSwap, lastPulledAt,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    } catch (e) {
      console.error('No se pudo guardar el progreso:', e);
    }
  }, [
    selectedFiles, liveStats, score, timer, isRunning, period, lastUpdate,
    lineupData, manualPos, playerEvents, selectedStatKey,
    registroEvents, lastRegistroEvent, baseSwapped, visualSwap, lastPulledAt,
  ]);

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
      setVisualSwap(false);
      setLastUpdate(new Date().toLocaleTimeString());
    } catch (e) {
      console.error('Error cargando análisis:', e);
    } finally {
      setLoading(false);
    }
  };

  const team1Name = analysis?.team1?.name;
  const team2Name = analysis?.team2?.name;

  // Push a la web: como SofaScore bloquea la IP de Render, todo lo que le habla a
  // SofaScore (bajar equipos, cargar alineación, actualizar estado) se hace acá en
  // la PC local, y esto publica el resultado (Excel + estado en vivo actual) para
  // que la web deployada lo muestre sin necesitar su propio acceso a SofaScore.
  const [pushing, setPushing]   = useState(false);
  const [pushMsg, setPushMsg]   = useState('');
  const [pulling, setPulling]   = useState(false);
  const [sharedUpdatedAt, setSharedUpdatedAt] = useState(null);
  const hasNewSharedState = sharedUpdatedAt && sharedUpdatedAt !== lastPulledAt;

  // Revisa cada 30s si hay una publicación más nueva que la última que cargaste
  // (sin aplicarla sola — solo prende el botón en rojo para avisar).
  useEffect(() => {
    const check = () => {
      getSharedLiveState()
        .then(shared => setSharedUpdatedAt(shared.updated_at || null))
        .catch(() => {});
    };
    check();
    const id = setInterval(check, 30000);
    return () => clearInterval(id);
  }, []);

  const handlePush = async () => {
    setPushing(true); setPushMsg('');
    try {
      const res = await pushWebUpdate({
        lineupData, score, period, liveStats, playerEvents, team1Name, team2Name,
      });
      setPushMsg(res.committed ? '✅ Publicado' : '✅ Ya estaba al día');
    } catch (e) {
      setPushMsg('❌ ' + (e?.response?.data?.detail || 'Error al publicar'));
    } finally {
      setPushing(false);
    }
  };

  const handlePull = async () => {
    setPulling(true); setPushMsg('');
    try {
      const shared = await getSharedLiveState();
      if (shared.lineupData) setLineupData(shared.lineupData);
      if (shared.score) setScore(shared.score);
      if (shared.period) setPeriod(shared.period);
      if (shared.liveStats) setLiveStats(shared.liveStats);
      if (shared.playerEvents) setPlayerEvents(shared.playerEvents);
      setLastPulledAt(shared.updated_at || null);
      setPushMsg(`✅ Estado cargado (${shared.updated_at ? new Date(shared.updated_at).toLocaleTimeString() : ''})`);
    } catch (e) {
      setPushMsg('❌ ' + (e?.response?.data?.detail || 'No hay estado publicado'));
    } finally {
      setPulling(false);
    }
  };

  const commonProps = {
    analysis, liveStats, setLiveStats, score, setScore,
    timer, setTimer, isRunning, setIsRunning, period, setPeriod,
    team1Name, team2Name, selectedFiles,
    lineupData, setLineupData,
    manualPos, setManualPos,
    playerEvents, setPlayerEvents,
    fieldSwapped, setFieldSwapped, baseSwapped,
    registroEvents, setRegistroEvents,
    lastRegistroEvent, setLastRegistroEvent,
    registroHistoryRef,
    selectedStatKey, setSelectedStatKey,
  };

  const formation1 = lineupData?.home_formation || '';
  const formation2 = lineupData?.away_formation || '';

  return (
    <div className="w-screen min-h-screen flex flex-col bg-gray-950 overflow-x-hidden">
      <Header team1={team1Name} team2={team2Name} score={score} timer={timer} period={period} />

      {/* FileSelector — siempre visible arriba */}
      <div className="flex flex-wrap items-center gap-2 md:gap-3 px-2 md:px-3 pt-2 pb-2 border-b border-gray-800 shrink-0">
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
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {pushMsg && <span className="text-[10px] text-gray-400 whitespace-nowrap">{pushMsg}</span>}
          <button onClick={handlePull} disabled={pulling}
            title={hasNewSharedState ? '¡Hay una actualización nueva sin cargar!' : 'Trae el último estado publicado (marcador, stats, alineación) — funciona en cualquier lado'}
            className={`text-xs px-2 py-1.5 rounded-lg border transition-colors disabled:opacity-50
              ${hasNewSharedState
                ? 'border-red-500 text-red-400 bg-red-900/20 animate-pulse'
                : 'border-gray-600 text-gray-300 hover:border-gray-400'}`}>
            {pulling ? '⏳...' : hasNewSharedState ? '🔴' : '🔄'}
            <span className="hidden md:inline"> Cargar estado publicado</span>
          </button>
          <button onClick={handlePush} disabled={pushing}
            title="Publica el marcador/stats/alineación actuales para que cualquiera que entre a la web los vea — solo funciona corriendo local (necesita git y salida a SofaScore)"
            className="text-xs px-2 py-1.5 rounded-lg border border-green-600 text-green-400 hover:bg-green-900/20 transition-colors disabled:opacity-50">
            {pushing ? '⏳' : '🚀'}
            <span className="hidden md:inline">{pushing ? ' Publicando...' : ' Push a la web'}</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-2 md:px-3 pt-1 pb-1 border-b border-gray-800 shrink-0">
        <Tabs tab={tab} setTab={setTab} />
      </div>

      {loading && (
        <div className="h-0.5 bg-gray-800 shrink-0">
          <div className="h-full bg-green-500 animate-pulse w-full"></div>
        </div>
      )}

      <div className="flex-1 p-2 md:p-3">
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
