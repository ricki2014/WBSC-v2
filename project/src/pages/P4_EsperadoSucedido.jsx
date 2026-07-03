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

// ─── BOXPLOT SVG ─────────────────────────────────────────────────────────────
function boxStats(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const n = s.length;
  if (n === 0) return null;
  const q = p => {
    const i = p * (n - 1);
    const lo = Math.floor(i), hi = Math.ceil(i);
    return s[lo] + (s[hi] - s[lo]) * (i - lo);
  };
  return { min: s[0], q1: q(0.25), median: q(0.5), q3: q(0.75), max: s[n - 1], mean: arr.reduce((a,b)=>a+b,0)/n };
}

function Boxplot({ values, label, color }) {
  const stats = boxStats(values.filter(v => v !== null && v !== undefined));
  if (!stats) return null;

  const W = 320, H = 90, PAD = 30, PLOT_W = W - PAD * 2;
  const domainMax = Math.max(stats.max, 1);
  const x = v => PAD + (v / domainMax) * PLOT_W;

  const ticks = Array.from({ length: domainMax + 1 }, (_, i) => i).filter(i => i <= domainMax);

  const colors = {
    green:  { box: '#22c55e', med: '#86efac', whisker: '#4ade80', dot: '#bbf7d0' },
    orange: { box: '#f97316', med: '#fdba74', whisker: '#fb923c', dot: '#fed7aa' },
  }[color] || { box: '#60a5fa', med: '#93c5fd', whisker: '#7dd3fc', dot: '#bae6fd' };

  return (
    <div className="flex flex-col gap-1">
      <div className="text-[11px] text-gray-400 font-semibold px-1">{label}</div>
      <svg width={W} height={H} className="overflow-visible">
        {/* grid lines */}
        {ticks.map(t => (
          <line key={t} x1={x(t)} y1={10} x2={x(t)} y2={60} stroke="#374151" strokeWidth={0.5} strokeDasharray="2,2"/>
        ))}
        {/* whiskers */}
        <line x1={x(stats.min)} y1={35} x2={x(stats.q1)} y2={35} stroke={colors.whisker} strokeWidth={1.5}/>
        <line x1={x(stats.q3)} y1={35} x2={x(stats.max)} y2={35} stroke={colors.whisker} strokeWidth={1.5}/>
        <line x1={x(stats.min)} y1={28} x2={x(stats.min)} y2={42} stroke={colors.whisker} strokeWidth={1.5}/>
        <line x1={x(stats.max)} y1={28} x2={x(stats.max)} y2={42} stroke={colors.whisker} strokeWidth={1.5}/>
        {/* IQR box */}
        <rect x={x(stats.q1)} y={20} width={Math.max(1, x(stats.q3)-x(stats.q1))} height={30}
          fill={colors.box} fillOpacity={0.25} stroke={colors.box} strokeWidth={1.5} rx={2}/>
        {/* median */}
        <line x1={x(stats.median)} y1={20} x2={x(stats.median)} y2={50} stroke={colors.med} strokeWidth={2.5}/>
        {/* mean dot */}
        <circle cx={x(stats.mean)} cy={35} r={3} fill={colors.dot} opacity={0.8}/>
        {/* individual points jittered */}
        {values.map((v, i) => (
          <circle key={i} cx={x(v ?? 0)} cy={35 + (((i * 7) % 14) - 7) * 0.6} r={2}
            fill={colors.box} fillOpacity={0.35}/>
        ))}
        {/* tick labels */}
        {ticks.map(t => (
          <text key={t} x={x(t)} y={72} textAnchor="middle" fontSize={9} fill="#6b7280">{t}</text>
        ))}
        {/* stat labels */}
        <text x={x(stats.min)}  y={H} textAnchor="middle" fontSize={8} fill="#9ca3af">min:{stats.min}</text>
        <text x={x(stats.median)} y={H} textAnchor="middle" fontSize={8} fill={colors.med}>med:{stats.median.toFixed(1)}</text>
        <text x={x(stats.max)}  y={H} textAnchor="middle" fontSize={8} fill="#9ca3af">max:{stats.max}</text>
      </svg>
    </div>
  );
}

// ─── MODAL HISTORIAL POR PARTIDO ─────────────────────────────────────────────
function StatMatchModal({ row, teamName, file, rivalFile, rivalName, half, onClose }) {
  const [data, setData]           = useState(null);
  const [rivalData, setRivalData] = useState(null);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    if (!file || !row?.k) return;
    setLoading(true);
    fetchTeamMatches(file, row.k)
      .then(d => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [file, row?.k]);

  useEffect(() => {
    if (!rivalFile || !row?.k) return;
    fetchTeamMatches(rivalFile, row.k)
      .then(d => setRivalData(d))
      .catch(() => setRivalData(null));
  }, [rivalFile, row?.k]);

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

  const parseScore = str => {
    const parts = String(str || '').split('-').map(s => Number(s.trim()));
    if (parts.length !== 2 || isNaN(parts[0]) || isNaN(parts[1])) return null;
    return parts[0] > parts[1] ? 'G' : parts[0] < parts[1] ? 'P' : 'E';
  };
  const result = m => parseScore(m.ft);
  const scoreCls = r => r === 'G' ? 'text-green-400' : r === 'P' ? 'text-red-400' : r === 'E' ? 'text-gray-400' : 'text-gray-500';

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
                    <td className={`px-2 py-1.5 text-center font-mono font-bold ${scoreCls(parseScore(m.ht))}`}>{m.ht}</td>
                    <td className={`px-2 py-1.5 text-center font-mono font-bold ${scoreCls(result(m))}`}>{m.ft}</td>
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
        {!loading && matches.length > 0 && (() => {
          const halfKey   = half === '1T' ? '1T' : half === '2T' ? '2T' : 'FT';
          const halfLabel = half === '1T' ? '1° Tiempo' : half === '2T' ? '2° Tiempo' : 'Total';
          const rMatches  = rivalData?.matches || [];

          const t_stat   = matches.map(m => m[`stat_${halfKey}`]  ?? 0);
          const t_rival  = matches.map(m => m[`rival_${halfKey}`] ?? 0);
          const r_stat   = rMatches.map(m => m[`stat_${halfKey}`]  ?? 0);
          const r_rival  = rMatches.map(m => m[`rival_${halfKey}`] ?? 0);

          return (
            <div className="mt-4 p-3 bg-gray-800/50 rounded-xl border border-gray-700/50">
              <div className="text-[11px] text-gray-500 mb-3 font-semibold uppercase tracking-wide">
                Boxplot {row.label} por Partido — {halfLabel}
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <div className="text-[10px] text-green-400 font-bold mb-2 text-center">{teamName}</div>
                  <div className="flex flex-col gap-4">
                    <Boxplot values={t_stat}  label={`${row.icon} ${row.label} a favor`}  color="green"  />
                    <Boxplot values={t_rival} label={`${row.icon} ${row.label} en contra`} color="orange" />
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-blue-400 font-bold mb-2 text-center">{rivalName}</div>
                  <div className="flex flex-col gap-4">
                    <Boxplot values={r_stat}  label={`${row.icon} ${row.label} a favor`}  color="green"  />
                    <Boxplot values={r_rival} label={`${row.icon} ${row.label} en contra`} color="orange" />
                  </div>
                </div>
              </div>
              <div className="text-[9px] text-gray-600 mt-2">
                Línea = mediana · Punto = media · Caja = IQR (Q1–Q3) · Bigotes = min/max
              </div>
            </div>
          );
        })()}
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
          onRowClick={r => setModal({ row: r, teamName: team1.name, file: selectedFiles?.f1, rivalFile: selectedFiles?.f2, rivalName: team2.name })}
        />
        <TeamESR
          teamName={team2.name}
          stats={team2.stats}
          liveTeam={liveStats.team2}
          color="blue"
          half={half}
          file={selectedFiles?.f2}
          onRowClick={r => setModal({ row: r, teamName: team2.name, file: selectedFiles?.f2, rivalFile: selectedFiles?.f1, rivalName: team1.name })}
        />

        {/* Modal sobreposición */}
        {modal && (
          <div className="absolute inset-0 z-50 bg-gray-900 rounded-xl">
            <StatMatchModal
              row={modal.row}
              teamName={modal.teamName}
              file={modal.file}
              rivalFile={modal.rivalFile}
              rivalName={modal.rivalName}
              half={half}
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
