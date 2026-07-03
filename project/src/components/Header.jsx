export default function Header({ team1, team2, score, timer, period, updateNumber }) {
  const fmt = (s) => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
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
      <div className="text-gray-400 text-xs text-right truncate min-w-0">
        {team1 && team2 ? <><span className="text-white">{team1}</span> vs <span className="text-white">{team2}</span></> : 'Selecciona equipos'}
      </div>
    </div>
  );
}
