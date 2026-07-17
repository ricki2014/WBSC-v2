export default function Header({ team1, team2, score, timer, period, updateNumber }) {
  const fmt = (s) => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;

  // Abre el análisis de árbitro en una ventana/pestaña aparte (#/referee, ver
  // main.jsx) — independiente del partido que se esté registrando acá.
  const openReferee = () => {
    const url = `${window.location.origin}${window.location.pathname}#/referee`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="bg-gray-950 border-b border-gray-800 px-2 md:px-4 py-2 flex items-center justify-between gap-2 shrink-0">
      <div className="flex items-center gap-1.5 md:gap-2 shrink-0">
        <span className="text-lg">⚽</span>
        <span className="hidden sm:inline text-white font-bold text-sm">Live Match</span>
        <span className="text-green-400 font-bold text-sm">Analyzer</span>
      </div>
      <div className="flex flex-col items-center shrink-0">
        <div className="text-white font-bold text-lg md:text-xl tracking-widest whitespace-nowrap">
          {score.home} - {score.away}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="bg-green-500/20 text-green-400 font-mono text-sm px-2 py-0.5 rounded border border-green-500/30">
            {fmt(timer)}
          </span>
          <span className="text-gray-400 text-xs font-bold">{period}</span>
        </div>
        {updateNumber != null && (
          <span className="text-gray-500 text-[10px] mt-0.5 whitespace-nowrap">
            🔄 Actualización {updateNumber}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 md:gap-3 min-w-0">
        <button onClick={openReferee} title="Analizar árbitro en una ventana aparte (SofaScore)"
          className="shrink-0 flex items-center gap-1 text-xs px-2 py-1.5 rounded-lg border border-purple-600 text-purple-300 hover:bg-purple-900/20 transition-colors">
          🧑‍⚖️ <span className="hidden sm:inline">Árbitro</span>
        </button>
        <div className="text-gray-400 text-xs text-right truncate min-w-0">
          {team1 && team2 ? <><span className="text-white">{team1}</span> vs <span className="text-white">{team2}</span></> : 'Selecciona equipos'}
        </div>
      </div>
    </div>
  );
}
