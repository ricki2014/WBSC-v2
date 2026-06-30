// TAB 4 — Esperado vs Sucedido vs Restante
import { useState, useEffect, useCallback } from 'react';
import { fetchTeamMatches } from '../api';

const ROWS_DEF = [
  { icon: '⚽', label: 'Goles',          k: 'G_F',  lk: 'Goles'        },
  { icon: '🚩', label: 'Corners',        k: 'C_F',  lk: 'Corners'      },
  { icon: '🟨', label: 'Amarillas',      k: 'AM_F', lk: 'Tarjetas'     },
  { icon: '🟥', label: 'Tarjetas rojas', k: 'RO_F', lk: 'Rojas'        },
  { icon: '🎯', label: 'Disparos tot.',  k: 'TI_F', lk: 'Disparos'     },
  { icon: '🥅', label: 'Tiro al arco',   k: null,   lk: 'TiroAlArco'   },
  { icon: '🤛', label: 'Faltas com.',    k: 'FA_F', lk: 'FoulCometido' },
  { icon: '🛡️', label: 'Faltas rec.',    k: 'FA_C', lk: 'FoulRecibido' },
];

const HALVES = [
  { id: '1T', label: '1° Tiempo' },
  { id: '2T', label: '2° Tiempo' },
  { id: 'FT', label: 'Total'     },
];

function pct(suc, esp) {
  if (!esp || esp === 0) return null;
  return Math.round((suc / esp) * 100);
}

function ProgressBar({ suc, esp }) {
  if (!esp || esp === 0) return null;
  const p = Math.min(100, Math.round((suc / esp) * 100));
  const color = p >= 100 ? 'bg-red-500' : p >= 60 ? 'bg-yellow-500' : 'bg-green-500';
  return (
    <div className="w-full h-1 bg-gray-700 rounded mt-0.5">
      <div className={`h-full rounded ${color} transition-all`} style={{ width: `${p}%` }}/>
    </div>
  );
}

// ─── MODAL HISTORIAL POR PARTIDO ─────────────────────────────────────────────
function StatMatchModal({ row, teamName, file, onClose }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!file || !row?.k) return;
    setLoading(true);
    fetchTeamMatches(file, row.k)
      .then(d => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [file, row?.k]);

  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const matches = data?.matches || [];

  const totals = { stat_1T: 0, stat_2T: 0, stat_FT: 0, rival_1T: 0, rival_2T: 0, rival_FT: 0 };
  matches.forEach(m => {
    totals.stat_1T  += m.stat_1T  ?? 0;
    totals.stat_2T  += m.stat_2T  ?? 0;
    totals.stat_FT  += m.stat_FT  ?? 0;
    totals.rival_1T += m.rival_1T ?? 0;
    totals.rival_2T += m.rival_2T ?? 0;
    totals.rival_FT += m.rival_FT ?? 0;
  });

  const result = m => {
    const parts = String(m.ft || '').split('-').map(Number);
    if (parts.length !== 2 || isNaN(parts[0]) || isNaN(parts[1])) return null;
    return parts[0] > parts[1] ? 'G' : parts[0] < parts[1] ? 'P' : 'E';
  };

  const fmt = v => v === null || v === undefined ? '—' : typeof v === 'number' ? (Number.isInteger(v) ? v : v.toFixed(2)) : v;

  return (
    <div className="absolute inset-0 z-50 bg-gray-900 flex flex-col rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-gray-900 border-b border-gray-700 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-lg">{row.icon}</span>
          <span className="text-white font-bold text-sm">{row.label}</span>
          <span className="text-gray-500 text-[11px]">— {teamName}</span>
          {matches.length > 0 && (
            <span className="text-gray-600 text-[10px]">({matches.length} partidos)</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-gray-600 text-[10px]">ESC para cerrar</span>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-lg leading-none">✕</button>
        </div>
      </div>

      {/* Tabla */}
      <div className="flex-1 overflow-auto p-3">
        {loading && (
          <div className="flex items-center justify-center h-full text-gray-500 text-sm">Cargando partidos...</div>
        )}
        {!loading && matches.length === 0 && (
          <div className="flex items-center justify-center h-full text-gray-500 text-sm">Sin datos disponibles</div>
        )}
        {!loading && matches.length > 0 && (
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-gray-800 sticky top-0 z-10 text-gray-400">
                <th className="px-2 py-2 text-left font-semibold border-b border-gray-700">#</th>
                {matches[0].fecha !== null && (
                  <th className="px-2 py-2 text-left font-semibold border-b border-gray-700">Fecha</th>
                )}
                <th className="px-2 py-2 text-left font-semibold border-b border-gray-700">Partido</th>
                <th className="px-2 py-2 text-center font-semibold border-b border-gray-700">L/V</th>
                <th className="px-2 py-2 text-center font-semibold border-b border-gray-700 font-mono">HT</th>
                <th className="px-2 py-2 text-center font-semibold border-b border-gray-700 font-mono">FT</th>
                <th className="px-2 py-2 text-center font-semibold border-b border-gray-700 text-yellow-400">1T</th>
                <th className="px-2 py-2 text-center font-semibold border-b border-gray-700 text-cyan-400">2T</th>
                <th className="px-2 py-2 text-center font-semibold border-b border-gray-700 text-green-400">Total</th>
                <th className="px-2 py-2 text-center font-semibold border-b border-gray-700">R</th>
                <th className="px-2 py-2 text-center font-semibold border-b border-gray-700 border-l border-gray-600 text-orange-400">Riv 1T</th>
                <th className="px-2 py-2 text-center font-semibold border-b border-gray-700 text-orange-400">Riv 2T</th>
                <th className="px-2 py-2 text-center font-semibold border-b border-gray-700 text-orange-400">Riv Tot</th>
              </tr>
            </thead>
            <tbody>
              {matches.map((m, i) => {
                const r = result(m);
                const hasFecha = m.fecha !== null && m.fecha !== undefined;
                return (
                  <tr key={i} className={`border-b border-gray-800/50 ${i % 2 === 0 ? 'bg-gray-900/30' : ''} hover:bg-gray-700/30`}>
                    <td className="px-2 py-1.5 text-gray-600">{i + 1}</td>
                    {hasFecha && <td className="px-2 py-1.5 text-gray-500 whitespace-nowrap">{m.fecha}</td>}
                    <td className="px-2 py-1.5 text-white font-medium whitespace-nowrap">
                      {teamName} <span className="text-gray-500">-</span> {m.rival}
                    </td>
                    <td className={`px-2 py-1.5 text-center font-bold
                      ${m.lv === 'L' ? 'text-green-400' : 'text-blue-400'}`}>
                      {m.lv}
                    </td>
                    <td className="px-2 py-1.5 text-center text-gray-400 font-mono">{m.ht}</td>
                    <td className="px-2 py-1.5 text-center text-white font-mono font-bold">{m.ft}</td>
                    <td className="px-2 py-1.5 text-center text-yellow-400 font-bold">{fmt(m.stat_1T)}</td>
                    <td className="px-2 py-1.5 text-center text-cyan-400 font-bold">{fmt(m.stat_2T)}</td>
                    <td className="px-2 py-1.5 text-center text-green-400 font-bold">{fmt(m.stat_FT)}</td>
                    <td className={`px-2 py-1.5 text-center font-bold
                      ${r === 'G' ? 'text-green-400' : r === 'P' ? 'text-red-400' : r === 'E' ? 'text-yellow-400' : 'text-gray-600'}`}>
                      {r || '—'}
                    </td>
                    <td className="px-2 py-1.5 text-center text-orange-400 font-bold border-l border-gray-600">{fmt(m.rival_1T)}</td>
                    <td className="px-2 py-1.5 text-center text-orange-400 font-bold">{fmt(m.rival_2T)}</td>
                    <td className="px-2 py-1.5 text-center text-orange-400 font-bold">{fmt(m.rival_FT)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-gray-800 border-t-2 border-gray-600">
                <td colSpan={matches[0].fecha !== null ? 6 : 5} className="px-2 py-1.5 text-gray-500 text-[10px] font-semibold">
                  TOTAL ({matches.length} partidos)
                </td>
                <td className="px-2 py-1.5 text-center text-yellow-400 font-bold">{fmt(totals.stat_1T)}</td>
                <td className="px-2 py-1.5 text-center text-cyan-400 font-bold">{fmt(totals.stat_2T)}</td>
                <td className="px-2 py-1.5 text-center text-green-400 font-bold">{fmt(totals.stat_FT)}</td>
                <td />
                <td className="px-2 py-1.5 text-center text-orange-400 font-bold border-l border-gray-600">{fmt(totals.rival_1T)}</td>
                <td className="px-2 py-1.5 text-center text-orange-400 font-bold">{fmt(totals.rival_2T)}</td>
                <td className="px-2 py-1.5 text-center text-orange-400 font-bold">{fmt(totals.rival_FT)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── TABLA ESR POR EQUIPO ─────────────────────────────────────────────────────
function TeamESR({ teamName, stats, liveTeam, color, half, file, onRowClick }) {
  const colorCls = color === 'green' ? 'text-green-400' : 'text-blue-400';
  const bgCls    = color === 'green'
    ? 'bg-green-500/10 border-green-500/30'
    : 'bg-blue-500/10 border-blue-500/30';

  return (
    <div className={`rounded-xl border p-3 ${bgCls}`}>
      <div className="flex items-center gap-2 mb-3">
        <div className={`w-6 h-6 rounded-full ${color==='green'?'bg-green-600':'bg-blue-600'} flex items-center justify-center text-xs font-bold text-white`}>
          {teamName?.[0]}
        </div>
        <span className={`${colorCls} font-bold text-sm`}>{teamName}</span>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-gray-700">
            <th className="text-gray-500 text-left pb-1.5 font-medium w-32">Estadística</th>
            <th className="text-yellow-400 pb-1.5 font-bold text-center">Esperado</th>
            <th className="text-cyan-400 pb-1.5 font-bold text-center">Sucedido</th>
            <th className="text-orange-400 pb-1.5 font-bold text-center">Restante</th>
          </tr>
        </thead>
        <tbody>
          {ROWS_DEF.map(r => {
            const key  = r.k ? `${r.k}_${half}` : null;
            const esp  = stats && key ? (stats[key] ?? 0) : 0;
            const suc  = liveTeam?.[r.lk] ?? 0;
            const rest = esp > 0 ? esp - suc : 0;
            const p    = pct(suc, esp);
            const clickable = !!r.k && !!file;
            return (
              <tr
                key={r.label}
                className={`border-b border-gray-800/50 transition-colors
                  ${clickable ? 'cursor-pointer hover:bg-white/5 active:bg-white/10' : ''}`}
                onClick={clickable ? () => onRowClick(r) : undefined}
                title={clickable ? `Ver historial de ${r.label} por partido` : undefined}
              >
                <td className="py-1.5 text-gray-300 text-[11px]">
                  {r.icon} {r.label}
                  {clickable && <span className="ml-1 text-gray-600 text-[9px]">↗</span>}
                </td>
                <td className="py-1.5 text-center">
                  <span className="text-yellow-400 font-bold">
                    {esp > 0 ? esp.toFixed(2) : '—'}
                  </span>
                </td>
                <td className="py-1.5 text-center">
                  <div>
                    <span className={`font-bold ${suc > 0 ? 'text-cyan-400' : 'text-gray-600'}`}>
                      {suc}
                    </span>
                    {p !== null && (
                      <span className="text-gray-600 text-[9px] ml-1">({p}%)</span>
                    )}
                  </div>
                  <ProgressBar suc={suc} esp={esp}/>
                </td>
                <td className="py-1.5 text-center">
                  <span className={`font-bold ${rest > 0 ? 'text-orange-400' : rest < 0 ? 'text-red-400' : 'text-gray-500'}`}>
                    {esp > 0 ? rest.toFixed(2) : '—'}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────
export default function P4_EsperadoSucedido({ analysis, liveStats, selectedFiles }) {
  const [half, setHalf] = useState('FT');
  const [modal, setModal] = useState(null); // { row, teamName, file }

  const handleClose = useCallback(() => setModal(null), []);

  if (!analysis) return (
    <div className="h-full flex items-center justify-center text-gray-500 text-sm">
      <div className="text-center">
        <div className="text-4xl mb-3">📈</div>
        Selecciona equipos primero
      </div>
    </div>
  );

  const { team1, team2 } = analysis;

  return (
    <div className="h-full flex flex-col gap-3 overflow-auto p-1 relative">
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-lg">🧮</span>
          <span className="text-white font-bold">Esperado vs Sucedido vs Restante</span>
        </div>
        <div className="flex gap-1">
          {HALVES.map(h => (
            <button
              key={h.id}
              onClick={() => setHalf(h.id)}
              className={`text-xs px-3 py-1 rounded-lg font-medium border transition-all
                ${half === h.id
                  ? 'bg-yellow-500 border-yellow-400 text-black'
                  : 'bg-gray-800 border-gray-600 text-gray-400 hover:border-gray-400'}`}>
              {h.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 relative">
        <TeamESR
          teamName={team1.name}
          stats={team1.stats}
          liveTeam={liveStats.team1}
          color="green"
          half={half}
          file={selectedFiles?.f1}
          onRowClick={r => setModal({ row: r, teamName: team1.name, file: selectedFiles?.f1 })}
        />
        <TeamESR
          teamName={team2.name}
          stats={team2.stats}
          liveTeam={liveStats.team2}
          color="blue"
          half={half}
          file={selectedFiles?.f2}
          onRowClick={r => setModal({ row: r, teamName: team2.name, file: selectedFiles?.f2 })}
        />

        {/* Modal sobreposición */}
        {modal && (
          <div className="absolute inset-0 z-50 bg-gray-900 rounded-xl">
            <StatMatchModal
              row={modal.row}
              teamName={modal.teamName}
              file={modal.file}
              onClose={handleClose}
            />
          </div>
        )}
      </div>

      <div className="bg-gray-900/40 border border-gray-700/40 rounded-lg p-2 text-[10px] text-gray-500 shrink-0 flex gap-2">
        <span>ℹ️</span>
        <span>
          Barra verde = dentro de lo esperado · Amarilla = llegando al límite · Roja = por encima
          <span className="ml-2 text-gray-600">· Haz clic en una fila para ver el historial por partido</span>
        </span>
      </div>
    </div>
  );
}
