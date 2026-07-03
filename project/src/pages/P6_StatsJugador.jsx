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

function SortArrow({ col, sortCol, sortDir }) {
  if (sortCol !== col) return <span className="text-gray-700 ml-0.5">⇅</span>;
  return <span className="text-yellow-400 ml-0.5">{sortDir === 'asc' ? '↑' : '↓'}</span>;
}

function playerLabel(name) {
  if (!name) return name;
  const parts = String(name).trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0][0].toUpperCase()}. ${parts.slice(1).join(' ')}`;
  return name;
}

// Normaliza nombres: minúsculas, elimina puntuación, colapsa espacios
const normName = s => s.toLowerCase().replace(/[,.()/\-]/g, ' ').replace(/\s+/g, ' ').trim();
// Palabras significativas: >= 3 chars y no son iniciales (no terminan en punto original)
const meaningful = w => w.length >= 3;

// Compara jugador del ranking contra los nombres de titulares del lineup.
// Usa subconjunto de palabras: todos los tokens del nombre más corto deben estar en el más largo.
// Esto evita falsos positivos por apellidos compartidos entre titulares y suplentes.
function matchesStarter(jugador, starterNames) {
  if (!starterNames?.size || !jugador) return false;
  const jl = normName(jugador);
  if (starterNames.has(jl)) return true;

  const jWords = jl.split(' ').filter(meaningful);
  if (jWords.length === 0) return false;
  const jSet = new Set(jWords);

  for (const sn of starterNames) {
    const snNorm = normName(sn);
    if (snNorm === jl) return true;

    // Filtrar iniciales (palabras que eran "X." antes de normalizar — ahora son 1 char como "j")
    const snWords = snNorm.split(' ').filter(w => w.length >= 3);
    if (snWords.length === 0) continue;
    const snSet = new Set(snWords);

    // Todos los tokens de jl están en sn (ej: "caicedo" ⊆ "moisés caicedo") ✓
    // Todos los tokens de sn están en jl (ej: "moisés caicedo" ⊆ "moisés caicedo hincapié") ✓
    // Rechaza: "caicedo ángel" vs "moisés caicedo" porque "ángel" no está en sn ✓
    // Requiere >= 2 palabras significativas para evitar que "b. silva" matchee "a. silva"
    // (ambos quedan ["silva"] al filtrar iniciales, generando falsos positivos).
    // Nombres de 1 sola palabra se resuelven por exact-lookup en starterNames.has(jl) arriba.
    if (jWords.length >= 2 && jWords.every(w => snSet.has(w))) return true;
    if (snWords.length >= 2 && snWords.every(w => jSet.has(w))) return true;
  }
  return false;
}

function RankTable({ rows, teamColor, starterNames }) {
  const [sortCol, setSortCol] = useState(null);
  const [sortDir, setSortDir] = useState('desc');

  const handleSort = (col) => {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCol(col);
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
  const starterBg = teamColor === 'green'
    ? 'bg-green-950/50 border-l-2 border-green-500/60'
    : 'bg-blue-950/50 border-l-2 border-blue-500/60';

  // Suma/promedio de columnas numéricas solo para titulares (▶)
  const starterRows = rows.filter(r => matchesStarter(r['jugador'], starterNames));
  const isPct = col => col.includes('%');
  const sumRow = {};
  cols.forEach(c => {
    if (c === 'jugador') {
      sumRow[c] = `${starterRows.length} titulares`;
    } else {
      const vals = starterRows.map(r => r[c]).filter(v => typeof v === 'number');
      if (vals.length === 0) { sumRow[c] = null; return; }
      sumRow[c] = isPct(c)
        ? vals.reduce((a, b) => a + b, 0) / vals.length   // promedio para %
        : vals.reduce((a, b) => a + b, 0);                 // suma para el resto
    }
  });

  const fmtVal = v =>
    typeof v === 'number'
      ? v > 999 ? Math.round(v) : v % 1 === 0 ? v : v.toFixed(2)
      : '—';

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
          {sorted.map((r, i) => {
            const isStarter = matchesStarter(r['jugador'], starterNames);
            return (
              <tr key={i} className={`hover:bg-gray-700/30 ${isStarter ? starterBg : ''}`}>
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
                      ? <>
                          {isStarter && (
                            <span className="text-yellow-400 mr-0.5 text-[9px]" title="Titular">▶</span>
                          )}
                          {playerLabel(r[c])}
                        </>
                      : typeof r[c] === 'number'
                        ? r[c] > 999 ? Math.round(r[c]) : r[c] % 1 === 0 ? r[c] : r[c].toFixed(2)
                        : (r[c] ?? '—')}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
        {starterRows.length > 0 && (
          <tfoot className="sticky bottom-0">
            <tr className="border-t-2 border-yellow-600/60 bg-yellow-950/60">
              {cols.map(c => (
                <td key={c}
                  className={`py-1.5 text-[11px] font-bold ${
                    c === 'jugador'
                      ? 'text-yellow-300'
                      : `text-right ${sumRow[c] !== null ? 'text-yellow-400' : 'text-gray-600'}`
                  }`}>
                  {c === 'jugador'
                    ? <><span className="text-yellow-400 mr-0.5 text-[9px]">▶</span>{sumRow[c]}</>
                    : sumRow[c] !== null
                      ? <>{fmtVal(sumRow[c])}{isPct(c) && <span className="text-yellow-600 text-[9px] ml-0.5">x̄</span>}</>
                      : '—'}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

export default function P3_RegistroJugador({ analysis, lineupData, manualPos, baseSwapped }) {
  const [role, setRole] = useState('DEF');

  // manualPos tiene campo `team: 'team1'|'team2'` estable (no cambia al invertir lados).
  // Para el resto, usar baseSwapped (identidad real) — NO fieldSwapped, que es solo
  // el lado visual y cambia en 2T sin que el equipo deje de ser quien es.
  const team1Starters = useMemo(() => {
    if (manualPos) {
      return new Set(
        manualPos
          .filter(p => p.team === 'team1')
          .flatMap(p => [p.shortName, p.name].filter(Boolean).map(normName))
      );
    }
    if (!lineupData) return new Set();
    const side = baseSwapped ? lineupData.away : lineupData.home;
    return new Set(
      (side || [])
        .filter(p => !p.isSubstitute)
        .flatMap(p => [p.shortName, p.name].filter(Boolean).map(normName))
    );
  }, [manualPos, lineupData, baseSwapped]);

  const team2Starters = useMemo(() => {
    if (manualPos) {
      return new Set(
        manualPos
          .filter(p => p.team === 'team2')
          .flatMap(p => [p.shortName, p.name].filter(Boolean).map(normName))
      );
    }
    if (!lineupData) return new Set();
    const side = baseSwapped ? lineupData.home : lineupData.away;
    return new Set(
      (side || [])
        .filter(p => !p.isSubstitute)
        .flatMap(p => [p.shortName, p.name].filter(Boolean).map(normName))
    );
  }, [manualPos, lineupData, baseSwapped]);

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
    <div className="flex flex-col gap-3">
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="stat-card flex flex-col">
          <div className="text-green-400 font-bold text-sm mb-2 shrink-0">
            {analysis.team1?.name}
          </div>
          <RankTable rows={r1} teamColor="green" starterNames={team1Starters} />
        </div>
        <div className="stat-card flex flex-col">
          <div className="text-blue-400 font-bold text-sm mb-2 shrink-0">
            {analysis.team2?.name}
          </div>
          <RankTable rows={r2} teamColor="blue" starterNames={team2Starters} />
        </div>
      </div>

      {/* Legend */}
      <div className="bg-gray-900/40 border border-gray-700/40 rounded-lg p-2 text-[10px] text-gray-500 shrink-0">
        {ROLE_LEGEND[role]}
        <span className="text-gray-700 ml-2">· Haz clic en cualquier columna para ordenar ↑↓</span>
        {lineupData && (
          <span className="ml-2">
            · <span className="text-yellow-400">▶</span>
            <span className="text-yellow-500/70"> Titular según alineación cargada</span>
          </span>
        )}
      </div>
    </div>
  );
}
