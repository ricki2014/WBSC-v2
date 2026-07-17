// TAB — Marcador por tramo: una línea horizontal por partido, con un
// bloque de color por cada tramo de 10 min según si el equipo estaba
// ganando (verde), empatando (plomo) o perdiendo (rojo) la mayor parte
// de ese tramo. Fuente: incidents.json (raw_json), igual que Momentum.
import { useState, useEffect } from 'react';
import { fetchScorelineTimeline } from '../api';

const STATE_COLOR = {
  win:  { bar: 'bg-emerald-500', text: 'text-emerald-400', label: 'Ganando' },
  draw: { bar: 'bg-gray-500',    text: 'text-gray-400',    label: 'Empate' },
  loss: { bar: 'bg-red-500',     text: 'text-red-400',     label: 'Perdiendo' },
};
const DEFAULT_LABELS = ['0-10','11-20','21-30','31-40','41-50','51-60','61-70','71-80','81-90','90+'];

function MatchRow({ m, labels }) {
  return (
    <div className="flex items-center gap-2 py-1 border-b border-gray-800/40 last:border-0">
      <div className="w-32 shrink-0 min-w-0">
        <div className="text-white text-[11px] truncate">
          {m.condicion === 'LOCAL' ? 'vs' : '@'} {m.rival}
        </div>
        <div className="text-gray-500 text-[9px] flex items-center gap-1.5">
          <span>{m.fecha || '—'}</span>
          <span className="font-mono text-gray-400">{m.own_score ?? '?'}-{m.rival_score ?? '?'}</span>
        </div>
      </div>
      <div className="flex-1 flex gap-0.5 h-4">
        {m.segments.map((s, i) => (
          <div
            key={i}
            className={`flex-1 rounded-sm ${STATE_COLOR[s.state]?.bar ?? 'bg-gray-700'}`}
            title={`${labels[i] ?? s.label}': ${STATE_COLOR[s.state]?.label ?? s.state}`}
          />
        ))}
      </div>
    </div>
  );
}

function TeamScorelinePanel({ teamName, teamId, color }) {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!teamId) { setMatches([]); setLoading(false); return; }
    setLoading(true);
    fetchScorelineTimeline(teamId)
      .then(setMatches)
      .catch(() => setMatches([]))
      .finally(() => setLoading(false));
  }, [teamId]);

  const labels = matches[0]?.segments.map(s => s.label) ?? DEFAULT_LABELS;
  const accentText   = color === 'green' ? 'text-green-400' : 'text-blue-400';
  const accentBorder = color === 'green' ? 'border-green-800/40' : 'border-blue-800/40';

  return (
    <div className={`bg-gray-900/60 border ${accentBorder} rounded-xl p-3 flex flex-col gap-1 min-w-0`}>
      <div className="flex items-center justify-between mb-1">
        <span className={`text-xs font-bold ${accentText}`}>{teamName}</span>
        {matches.length > 0 && <span className="text-gray-600 text-[10px]">{matches.length} partidos</span>}
      </div>

      {/* Eje de tramos, compartido para todas las filas del panel */}
      <div className="flex items-center gap-2 pb-1">
        <div className="w-32 shrink-0" />
        <div className="flex-1 flex gap-0.5">
          {labels.map((lbl, i) => (
            <div key={i} className="flex-1 text-center text-gray-600 text-[7px] leading-none truncate">{lbl}</div>
          ))}
        </div>
      </div>

      {loading && <div className="text-gray-500 text-xs py-4 text-center">Cargando...</div>}
      {!loading && matches.length === 0 && (
        <div className="text-gray-500 text-xs py-4 text-center">Sin partidos con datos descargados</div>
      )}
      {!loading && matches.length > 0 && (
        <div className="max-h-[70vh] overflow-y-auto pr-1">
          {matches.map(m => <MatchRow key={m.match_id} m={m} labels={labels} />)}
        </div>
      )}
    </div>
  );
}

export default function P12_ScorelineTramos({ analysis }) {
  if (!analysis) return (
    <div className="h-full flex items-center justify-center text-gray-500 text-sm">
      <div className="text-center">
        <div className="text-4xl mb-3">🚦</div>
        Selecciona equipos primero
      </div>
    </div>
  );

  const { team1, team2 } = analysis;

  return (
    <div className="flex flex-col gap-3 p-1">
      <div className="flex items-center gap-2 shrink-0 flex-wrap">
        <span className="text-white font-bold text-sm">🚦 Marcador por tramo</span>
        <div className="flex gap-2 ml-2">
          {Object.entries(STATE_COLOR).map(([k, c]) => (
            <div key={k} className="flex items-center gap-1">
              <div className={`w-2 h-2 rounded-sm ${c.bar}`} />
              <span className="text-[9px] text-gray-500">{c.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <TeamScorelinePanel teamName={team1.name} teamId={team1.team_id} color="green" />
        <TeamScorelinePanel teamName={team2.name} teamId={team2.team_id} color="blue" />
      </div>

      <div className="bg-gray-900/40 border border-gray-700/40 rounded-lg p-2 text-[10px] text-gray-500 shrink-0">
        ℹ️ Cada línea es un partido: por cada tramo de 10 min, el color indica si el equipo pasó la mayor parte de ese tramo
        ganando, empatando o perdiendo. Solo se listan los partidos con datos descargados (raw_json), igual que Momentum.
      </div>
    </div>
  );
}
