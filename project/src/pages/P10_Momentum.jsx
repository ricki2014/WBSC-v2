// TAB — Attack Momentum: réplica del gráfico de SofaScore para todos los
// partidos de cada equipo que tengan graph.json descargado (raw_json/).
import { useState, useEffect, useCallback } from 'react';
import { fetchMomentumMatches, fetchMomentumData } from '../api';
import AttackMomentumChart from '../components/AttackMomentumChart';

function MatchRow({ m, teamId }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const toggle = useCallback(() => {
    setOpen(o => !o);
  }, []);

  useEffect(() => {
    if (!open || data || loading) return;
    setLoading(true);
    setError(null);
    fetchMomentumData(teamId, m.match_id)
      .then(setData)
      .catch(() => setError('No se pudo cargar el gráfico'))
      .finally(() => setLoading(false));
  }, [open, data, loading, teamId, m.match_id]);

  return (
    <div className="border-b border-gray-800/50">
      <button onClick={toggle}
        className="w-full flex items-center justify-between gap-2 px-2 py-2 text-left hover:bg-white/5 transition-colors">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-gray-600 text-[10px] w-16 shrink-0">{m.fecha || '—'}</span>
          <span className="text-white text-xs truncate">
            {m.home_name} <span className="text-gray-500">-</span> {m.away_name}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-gray-400 text-xs font-mono">{m.home_score ?? '?'}-{m.away_score ?? '?'}</span>
          <span className="text-gray-600 text-[10px]">{open ? '▲' : '▼'}</span>
        </div>
      </button>
      {open && (
        <div className="px-2 pb-3">
          {loading && <div className="text-gray-500 text-xs py-3 text-center">Cargando...</div>}
          {error && <div className="text-red-400 text-xs py-3 text-center">{error}</div>}
          {data && <AttackMomentumChart data={data} />}
        </div>
      )}
    </div>
  );
}

function TeamMomentumList({ teamName, teamId, color }) {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const colorCls = color === 'green' ? 'text-green-400' : 'text-blue-400';
  const bgCls = color === 'green' ? 'bg-green-500/10 border-green-500/30' : 'bg-blue-500/10 border-blue-500/30';

  useEffect(() => {
    if (!teamId) { setMatches([]); setLoading(false); return; }
    setLoading(true);
    fetchMomentumMatches(teamId)
      .then(setMatches)
      .catch(() => setMatches([]))
      .finally(() => setLoading(false));
  }, [teamId]);

  return (
    <div className={`rounded-xl border ${bgCls} overflow-hidden`}>
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-800/50">
        <div className={`w-6 h-6 rounded-full ${color === 'green' ? 'bg-green-600' : 'bg-blue-600'} flex items-center justify-center text-xs font-bold text-white`}>
          {teamName?.[0]}
        </div>
        <span className={`${colorCls} font-bold text-sm`}>{teamName}</span>
        {matches.length > 0 && <span className="text-gray-600 text-[10px]">({matches.length} partidos)</span>}
      </div>
      <div className="max-h-[70vh] overflow-y-auto">
        {loading && <div className="text-gray-500 text-xs py-4 text-center">Cargando partidos...</div>}
        {!loading && matches.length === 0 && (
          <div className="text-gray-500 text-xs py-4 text-center">Sin partidos con datos descargados</div>
        )}
        {!loading && matches.map(m => <MatchRow key={m.match_id} m={m} teamId={teamId} />)}
      </div>
    </div>
  );
}

export default function P10_Momentum({ analysis }) {
  if (!analysis) return (
    <div className="h-full flex items-center justify-center text-gray-500 text-sm">
      <div className="text-center">
        <div className="text-4xl mb-3">📉</div>
        Selecciona equipos primero
      </div>
    </div>
  );

  const { team1, team2 } = analysis;

  return (
    <div className="flex flex-col gap-3 p-1">
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-lg">📉</span>
        <span className="text-white font-bold">Attack Momentum por partido</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <TeamMomentumList teamName={team1.name} teamId={team1.team_id} color="green" />
        <TeamMomentumList teamName={team2.name} teamId={team2.team_id} color="blue" />
      </div>

      <div className="bg-gray-900/40 border border-gray-700/40 rounded-lg p-2 text-[10px] text-gray-500 shrink-0">
        ℹ️ Solo se listan los partidos que tienen el gráfico descargado (raw_json). Clic en un partido para ver su Attack Momentum.
      </div>
    </div>
  );
}
