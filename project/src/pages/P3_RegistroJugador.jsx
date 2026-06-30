// TAB 3 — Registro por jugador (rankings)
import { useState, useMemo } from 'react';

const ROLES = [
  { key: 'DEF', label: '🛡️ Defensas' },
  { key: 'MED', label: '⚙️ Mediocampo' },
  { key: 'DEL', label: '🔥 Delanteros' },
  { key: 'SHO', label: '🎯 Disparos' },
  { key: 'ARQ', label: '🧤 Arqueros' },
];

const ROLE_LEGEND = {
  DEF: '🛡️ Score Defensa: Duelos 30% | Interc 25% | Despejes 25% | Recup 20% — penalización pérdidas',
  MED: '⚙️ Score Mediocampo: P.Clave 35% | Pases% 30% | Recup 20% | Duelos 15% — penalización pérdidas',
  DEL: '🔥 Score Delanteros: Goles p90 45% | Asist p90 30% | Puntería% 15% | Duelos% 10%',
  SHO: '🎯 Ranking por tiros por 90 minutos (todos los jugadores con al menos 1 tiro)',
  ARQ: '🧤 Arqueros: minutos sumados, atajadas sumadas, stats propias promediadas por 90 min',
};

// Flecha de orden
function SortArrow({ col, sortCol, sortDir }) {
  if (sortCol !== col) return <span className="text-gray-700 ml-0.5">⇅</span>;
  return <span className="text-yellow-400 ml-0.5">{sortDir === 'asc' ? '↑' : '↓'}</span>;
}

function RankTable({ rows, teamColor }) {
  const [sortCol, setSortCol] = useState(null);
  const [sortDir, setSortDir] = useState('desc');

  const handleSort = (col) => {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCol(col);
      // Texto asc, números desc por defecto
      const firstVal = rows[0]?.[col];
      setSortDir(typeof firstVal === 'number' ? 'desc' : 'asc');
    }
  };

  const sorted = useMemo(() => {
    if (!rows || rows.length === 0) return [];
    if (!sortCol) return rows;
    return [...rows].sort((a, b) => {
      const av = a[sortCol];
      const bv = b[sortCol];
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'asc' ? av - bv : bv - av;
      }
      const as = String(av ?? '');
      const bs = String(bv ?? '');
      return sortDir === 'asc' ? as.localeCompare(bs) : bs.localeCompare(as);
    });
  }, [rows, sortCol, sortDir]);

  if (!rows || rows.length === 0)
    return <div className="text-gray-500 text-xs p-4 text-center">Sin datos</div>;

  const cols = Object.keys(rows[0]).filter(k => k !== 'posicion');
  const accent = teamColor === 'green' ? 'text-green-400' : 'text-blue-400';

  return (
    <div className="overflow-auto flex-1">
      <table className="data-table w-full">
        <thead className="sticky top-0 bg-gray-900 z-10">
          <tr>
            {cols.map(c => (
              <th key={c}
                onClick={() => handleSort(c)}
                className={`text-[10px] cursor-pointer select-none hover:text-white transition-colors
                  ${c === 'jugador' ? 'text-left' : 'text-right'}`}>
                {c === 'jugador' ? 'Jugador' : c}
                <SortArrow col={c} sortCol={sortCol} sortDir={sortDir} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr key={i} className="hover:bg-gray-700/30">
              {cols.map(c => (
                <td key={c}
                  className={`text-[11px] ${
                    c === 'jugador'
                      ? 'text-white font-medium'
                      : `text-right ${
                          c === 'Score' || c === 'Atajadas p90'
                            ? `${accent} font-bold`
                            : 'text-gray-300'
                        }`
                  }`}>
                  {c === 'jugador'
                    ? r[c]
                    : typeof r[c] === 'number'
                      ? r[c] > 999 ? Math.round(r[c]) : r[c] % 1 === 0 ? r[c] : r[c].toFixed(2)
                      : (r[c] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function P3_RegistroJugador({ analysis }) {
  const [role, setRole] = useState('DEF');

  if (!analysis) return (
    <div className="h-full flex items-center justify-center text-gray-500 text-sm">
      <div className="text-center">
        <div className="text-4xl mb-3">👤</div>
        Selecciona equipos primero
      </div>
    </div>
  );

  const r1 = analysis.rankings?.team1?.[role] || [];
  const r2 = analysis.rankings?.team2?.[role] || [];

  return (
    <div className="h-full flex flex-col gap-3 overflow-hidden">
      {/* Role selector */}
      <div className="flex gap-2 overflow-x-auto pb-1 shrink-0">
        {ROLES.map(r => (
          <button key={r.key} onClick={() => setRole(r.key)}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium whitespace-nowrap border transition-all
              ${role === r.key
                ? 'bg-green-600 border-green-500 text-white'
                : 'bg-gray-800 border-gray-600 text-gray-400 hover:border-gray-400'}`}>
            {r.label}
          </button>
        ))}
      </div>

      {/* Tables */}
      <div className="grid grid-cols-2 gap-3 flex-1 overflow-hidden">
        <div className="stat-card overflow-hidden flex flex-col">
          <div className="text-green-400 font-bold text-sm mb-2 shrink-0">
            {analysis.team1?.name}
          </div>
          <RankTable rows={r1} teamColor="green" />
        </div>
        <div className="stat-card overflow-hidden flex flex-col">
          <div className="text-blue-400 font-bold text-sm mb-2 shrink-0">
            {analysis.team2?.name}
          </div>
          <RankTable rows={r2} teamColor="blue" />
        </div>
      </div>

      {/* Legend */}
      <div className="bg-gray-900/40 border border-gray-700/40 rounded-lg p-2 text-[10px] text-gray-500 shrink-0">
        {ROLE_LEGEND[role]}
        <span className="text-gray-700 ml-2">· Haz clic en cualquier columna para ordenar ↑↓</span>
      </div>
    </div>
  );
}
