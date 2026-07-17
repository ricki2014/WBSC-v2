// TAB 1 — Comparación previa estilo Aw.py (1T / 2T / Total)
import { useState, useEffect } from 'react';
import { fetchTeamMatchList } from '../api';

const CONDITIONS = [
  { value: 'TOTAL',    label: 'Ambos'       },
  { value: 'LOCAL',    label: 'Solo LOCAL'  },
  { value: 'VISITA',   label: 'Solo VISITA' },
  { value: 'SELECTED', label: '📋 Seleccionados' },
];

function v(s, k) {
  if (!s || s[k] == null || isNaN(s[k])) return 0;
  return s[k];
}

function fmt(n) {
  return Number(n).toFixed(2);
}

// Caja de métrica estilo Aw.py: título arriba, valor grande abajo
function MetricBox({ period, favor, contra, big = false }) {
  const favStr = big ? Math.round(favor) : fmt(favor);
  const conStr = big ? Math.round(contra) : fmt(contra);
  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-2 flex-1 text-center">
      <div className="text-gray-500 text-[10px] font-medium mb-1">{period}</div>
      <div className="font-bold text-xl leading-tight">
        <span className="text-green-300">{favStr}</span>
        <span className="text-gray-600 font-normal mx-1">/</span>
        <span className="text-red-300">{conStr}</span>
      </div>
    </div>
  );
}

// Fila de sección con 3 cajas (1T / 2T / Total)
function StatSection({ icon, label, sub, s,
  kF1, kC1, kF2, kC2, kFF, kCF, big = false }) {
  return (
    <div className="mb-3">
      <div className="text-gray-300 text-sm font-semibold mb-1.5">
        {icon} {label} <span className="text-gray-600 text-xs font-normal">({sub})</span>
      </div>
      <div className="flex gap-2">
        <MetricBox period="1T"    favor={v(s,kF1)} contra={v(s,kC1)} big={big} />
        <MetricBox period="2T"    favor={v(s,kF2)} contra={v(s,kC2)} big={big} />
        <MetricBox period="Total" favor={v(s,kFF)} contra={v(s,kCF)} big={big} />
      </div>
    </div>
  );
}

// Panel de un equipo completo
function TeamFicha({ name, stats, color }) {
  const accent = color === 'green' ? 'text-green-400' : 'text-blue-400';
  const border  = color === 'green' ? 'border-green-800/40' : 'border-blue-800/40';
  const bg      = color === 'green' ? 'bg-green-700'        : 'bg-blue-700';

  return (
    <div className={`bg-gray-900 border ${border} rounded-xl p-4 flex-1`}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <div className={`w-7 h-7 rounded-full ${bg} flex items-center justify-center font-bold text-white text-sm`}>
          {name?.[0]}
        </div>
        <span className={`${accent} font-bold text-sm`}>{name}</span>
      </div>

      {/* Secciones */}
      <StatSection icon="⚽" label="Goles"    sub="Marcados / Recibidos" s={stats}
        kF1="G_F_1T" kC1="G_C_1T" kF2="G_F_2T" kC2="G_C_2T" kFF="G_F_FT" kCF="G_C_FT" />

      <StatSection icon="🚩" label="Corners"  sub="Favor / Contra" s={stats}
        kF1="C_F_1T" kC1="C_C_1T" kF2="C_F_2T" kC2="C_C_2T" kFF="C_F_FT" kCF="C_C_FT" />

      <StatSection icon="🟨" label="Amarillas" sub="Favor / Contra" s={stats}
        kF1="AM_F_1T" kC1="AM_C_1T" kF2="AM_F_2T" kC2="AM_C_2T" kFF="AM_F_FT" kCF="AM_C_FT" />

      <StatSection icon="🟥" label="Rojas"    sub="Favor / Contra" s={stats}
        kF1="RO_F_1T" kC1="RO_C_1T" kF2="RO_F_2T" kC2="RO_C_2T" kFF="RO_F_FT" kCF="RO_C_FT" />

      <StatSection icon="🎯" label="Disparos"  sub="Favor / Contra" s={stats}
        kF1="TI_F_1T" kC1="TI_C_1T" kF2="TI_F_2T" kC2="TI_C_2T" kFF="TI_F_FT" kCF="TI_C_FT" />

      <StatSection icon="🥅" label="Tiros al arco" sub="Favor / Contra" s={stats}
        kF1="SOT_F_1T" kC1="SOT_C_1T" kF2="SOT_F_2T" kC2="SOT_C_2T" kFF="SOT_F_FT" kCF="SOT_C_FT" />

      <StatSection icon="↔️" label="Pases" sub="Favor / Contra" s={stats}
        kF1="PA_F_1T" kC1="PA_C_1T" kF2="PA_F_2T" kC2="PA_C_2T" kFF="PA_F_FT" kCF="PA_C_FT" big />

      <StatSection icon="🤛" label="Faltas"   sub="Cometidas / Recibidas" s={stats}
        kF1="FA_F_1T" kC1="FA_C_1T" kF2="FA_F_2T" kC2="FA_C_2T" kFF="FA_F_FT" kCF="FA_C_FT" />
    </div>
  );
}

// Selector de condición
function CondSelector({ value, onChange, color }) {
  const active = color === 'green'
    ? 'bg-green-600 text-white border-green-500'
    : 'bg-blue-600 text-white border-blue-500';
  return (
    <div className="flex gap-1">
      {CONDITIONS.map(c => (
        <button
          key={c.value}
          onClick={() => onChange(c.value)}
          className={`text-[10px] px-2 py-1 rounded-lg border font-medium transition-all
            ${value === c.value
              ? active
              : 'bg-gray-800 border-gray-600 text-gray-400 hover:border-gray-400'}`}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}

// ─── SELECTOR DE PARTIDOS ("Solo partidos seleccionados") ───────────────────
function MatchPickerModal({ file, initialSelected, onConfirm, onClose, color }) {
  const [matches, setMatches] = useState(null);
  const [error, setError]     = useState('');
  const [checked, setChecked] = useState(() => new Set(initialSelected ?? []));

  useEffect(() => {
    if (!file) return;
    fetchTeamMatchList(file)
      .then(setMatches)
      .catch(() => setError('No se pudo cargar la lista de partidos.'));
  }, [file]);

  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const toggle = (id) => {
    setChecked(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const accent = color === 'green' ? 'text-green-400' : 'text-blue-400';
  const btnAccent = color === 'green'
    ? 'bg-green-600 hover:bg-green-500'
    : 'bg-blue-600 hover:bg-blue-500';

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-xl p-4 w-full max-w-md max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <span className={`font-bold text-sm ${accent}`}>📋 Elegir partidos</span>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-lg leading-none">✕</button>
        </div>

        {error && <div className="text-red-400 text-xs mb-2">{error}</div>}
        {!matches && !error && <div className="text-gray-500 text-xs">Cargando partidos...</div>}

        {matches && (
          <>
            <div className="flex gap-2 mb-2 text-[10px]">
              <button
                className="text-gray-400 hover:text-white underline"
                onClick={() => setChecked(new Set(matches.map(m => m.match_id)))}
              >
                Seleccionar todos
              </button>
              <button
                className="text-gray-400 hover:text-white underline"
                onClick={() => setChecked(new Set())}
              >
                Ninguno
              </button>
            </div>

            <div className="overflow-y-auto flex-1 flex flex-col gap-1 pr-1">
              {matches.length === 0 && (
                <div className="text-gray-500 text-xs">Este equipo no tiene partidos cargados.</div>
              )}
              {matches.map(m => (
                <label
                  key={m.match_id}
                  className="flex items-center gap-2 text-xs bg-white/5 hover:bg-white/10 rounded-lg px-2 py-1.5 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={checked.has(m.match_id)}
                    onChange={() => toggle(m.match_id)}
                    className="shrink-0"
                  />
                  <span className="text-gray-500 w-9 shrink-0">{m.condicion === 'LOCAL' ? 'L' : 'V'}</span>
                  <span className="text-gray-300 truncate flex-1">{m.partido || m.rival}</span>
                  <span className="text-gray-500 shrink-0">{m.resultado}</span>
                  <span className="text-gray-600 text-[10px] shrink-0">{m.fecha}</span>
                </label>
              ))}
            </div>
          </>
        )}

        <div className="flex justify-end gap-2 mt-3 pt-3 border-t border-gray-800">
          <button onClick={onClose} className="text-xs px-3 py-1.5 rounded-lg border border-gray-600 text-gray-300 hover:border-gray-400">
            Cancelar
          </button>
          <button
            disabled={checked.size === 0}
            onClick={() => onConfirm(Array.from(checked))}
            className={`text-xs px-3 py-1.5 rounded-lg text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed ${btnAccent}`}
          >
            Aplicar ({checked.size})
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── EXPECTATIVAS ─────────────────────────────────────────────────────────────
// Fórmula: expA = (A_favor_p + B_contra_p) / 2   (igual que Aw.py render_poisson_internal)
//          expB = (B_favor_p + A_contra_p) / 2
//          total = expA + expB

// swap: true → intercambia expA/expB (para "recibidas" = lo que el rival
// comete combinado con lo que este equipo recibe habitualmente, en vez de al revés)
const EXP_STATS = [
  { icon: '⚽', label: 'Goles',            pre: 'G',  big: false },
  { icon: '🚩', label: 'Corners',          pre: 'C',  big: false },
  { icon: '🟨', label: 'Amarillas',        pre: 'AM', big: false },
  { icon: '🟥', label: 'Rojas',            pre: 'RO', big: false },
  { icon: '🎯', label: 'Disparos',         pre: 'TI', big: false },
  { icon: '↔️', label: 'Pases',           pre: 'PA', big: true  },
  { icon: '🤛', label: 'Faltas cometidas', pre: 'FA', big: false },
  { icon: '🛡️', label: 'Faltas recibidas', pre: 'FA', big: false, swap: true },
];

function calcExp(s1, s2, pre, suf) {
  const a = (v(s1, `${pre}_F_${suf}`) + v(s2, `${pre}_C_${suf}`)) / 2;
  const b = (v(s2, `${pre}_F_${suf}`) + v(s1, `${pre}_C_${suf}`)) / 2;
  return { a, b, tot: a + b };
}

function ExpCard({ icon, label, expA, expB, total, nameA, nameB, big }) {
  const f = n => big ? Math.round(n) : fmt(n);
  return (
    <div className="bg-gray-800/60 border border-gray-700/40 rounded-xl p-3">
      <div className="text-center text-sm font-semibold text-gray-300 mb-3">{icon} {label}</div>
      <div className="flex justify-between gap-1">
        <div className="text-center flex-1">
          <div className="text-gray-500 truncate text-[11px] mb-0.5">{nameA?.split(' ')[0]}</div>
          <div className="text-green-400 font-bold text-xl">{f(expA)}</div>
        </div>
        <div className="text-center flex-1">
          <div className="text-gray-500 text-[11px] mb-0.5">Total</div>
          <div className="text-yellow-400 font-bold text-xl">{f(total)}</div>
        </div>
        <div className="text-center flex-1">
          <div className="text-gray-500 truncate text-[11px] mb-0.5">{nameB?.split(' ')[0]}</div>
          <div className="text-blue-400 font-bold text-xl">{f(expB)}</div>
        </div>
      </div>
    </div>
  );
}

function Expectativas({ s1, s2, name1, name2 }) {
  const [tab, setTab] = useState('1T');
  const sufMap = { '1T': '1T', '2T': '2T', 'Total': 'FT' };
  const suf = sufMap[tab];

  return (
    <div className="bg-gray-900 border border-gray-700/40 rounded-xl p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-base">📈</span>
          <span className="text-white font-bold text-sm">Expectativas del partido</span>
          <span className="hidden sm:inline text-gray-500 text-[10px]">(Mi ataque + Defensa rival) / 2</span>
        </div>
        {/* Tabs 1T / 2T / Total */}
        <div className="flex gap-1">
          {['1T','2T','Total'].map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`text-[10px] px-2.5 py-1 rounded-lg font-bold transition-all
                ${tab === t
                  ? 'bg-yellow-500 text-black'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {EXP_STATS.map(({ icon, label, pre, big, swap }) => {
          const { a, b, tot } = calcExp(s1, s2, pre, suf);
          const expA = swap ? b : a;
          const expB = swap ? a : b;
          return (
            <ExpCard key={label}
              icon={icon} label={label}
              expA={expA} expB={expB} total={tot}
              nameA={name1} nameB={name2}
              big={big} />
          );
        })}
      </div>

      {/* Resumen numérico debajo */}
      <div className="mt-3 pt-3 border-t border-gray-700/40 grid grid-cols-1 sm:grid-cols-2 gap-3 text-[10px]">
        {['Goles','Corners'].map(stat => {
          const pre = stat === 'Goles' ? 'G' : 'C';
          const { a, b, tot } = calcExp(s1, s2, pre, suf);
          return (
            <div key={stat} className="text-gray-400">
              <span className="font-bold text-white">{stat} {tab}:</span>{' '}
              <span className="text-green-400">{name1} {fmt(a)}</span>
              {' + '}
              <span className="text-blue-400">{name2} {fmt(b)}</span>
              {' = '}
              <span className="text-yellow-400 font-bold">{fmt(tot)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── DISTRIBUCIÓN DE GOLES POR TRAMO ─────────────────────────────────────────
function GoalDistChart({ dist, name, color, max }) {
  if (!dist || dist.length === 0) return null;
  const accent = color === 'green' ? 'bg-green-500' : 'bg-blue-500';
  const text   = color === 'green' ? 'text-green-400' : 'text-blue-400';
  return (
    <div className="flex-1 min-w-0">
      <div className={`text-xs font-bold mb-2 ${text}`}>{name}</div>
      <div className="flex items-end gap-1 h-20">
        {dist.map((d, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
            {d.count > 0 && (
              <span className="text-[9px] text-gray-400 font-bold leading-none">{d.count}</span>
            )}
            <div
              className={`w-full rounded-t ${accent} transition-all`}
              style={{ height: `${Math.max(4, (d.count / max) * 64)}px`, opacity: d.count === 0 ? 0.15 : 1 }}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-1 mt-1">
        {dist.map((d, i) => (
          <div key={i} className="flex-1 text-center text-[8px] text-gray-600 leading-tight">{d.label}</div>
        ))}
      </div>
    </div>
  );
}

function GoalDistSection({ dist1, dist2, name1, name2 }) {
  if (!dist1?.length && !dist2?.length) return null;
  const total1 = dist1?.reduce((s, d) => s + d.count, 0) ?? 0;
  const total2 = dist2?.reduce((s, d) => s + d.count, 0) ?? 0;
  const max = Math.max(...(dist1 ?? []).map(d => d.count), ...(dist2 ?? []).map(d => d.count), 1);
  return (
    <div className="bg-gray-900 border border-gray-700/40 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-base">⚽</span>
        <span className="text-white font-bold text-sm">Distribución de goles por tramo</span>
        <span className="text-gray-500 text-[10px]">· cada 10 minutos</span>
      </div>
      <div className="flex flex-col md:flex-row gap-6">
        <GoalDistChart dist={dist1} name={`${name1} (${total1} goles)`} color="green" max={max} />
        <GoalDistChart dist={dist2} name={`${name2} (${total2} goles)`} color="blue" max={max} />
      </div>
    </div>
  );
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────

export default function P1_Comparacion({
  analysis, selectedFiles,
  cond1, setCond1, cond2, setCond2,
  matches1, setMatches1, matches2, setMatches2,
}) {
  // Qué modal de selección de partidos está abierto ('team1' | 'team2' | null)
  const [picker, setPicker] = useState(null);

  const makeCondHandler = (setCond, setMatches, key) => (value) => {
    if (value === 'SELECTED') {
      setPicker(key);
      return;
    }
    setMatches(null);
    setCond(value);
  };

  const handleConfirmPicker = (ids) => {
    if (picker === 'team1') { setMatches1(ids); setCond1('SELECTED'); }
    else                    { setMatches2(ids); setCond2('SELECTED'); }
    setPicker(null);
  };

  const clearSelection = (key) => {
    if (key === 'team1') { setMatches1(null); setCond1('TOTAL'); }
    else                 { setMatches2(null); setCond2('TOTAL'); }
  };

  if (!analysis) return (
    <div className="h-full flex items-center justify-center text-gray-500 text-sm">
      <div className="text-center">
        <div className="text-4xl mb-3">📊</div>
        <div>Selecciona dos equipos y pulsa <strong className="text-white">Analizar</strong></div>
      </div>
    </div>
  );

  const { team1, team2 } = analysis;

  return (
    <div className="flex flex-col gap-3 p-1">

      {/* Filtros de condición */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 shrink-0">
        <div className="bg-gray-900 border border-green-800/30 rounded-xl px-3 py-2">
          <div className="text-green-400 font-bold text-xs mb-1.5">{team1.name}</div>
          <CondSelector value={cond1} onChange={makeCondHandler(setCond1, setMatches1, 'team1')} color="green" />
          {cond1 === 'SELECTED' && (
            <div className="flex items-center gap-2 mt-1.5 text-[10px]">
              <span className="text-green-400">📋 {matches1?.length ?? 0} partido(s) seleccionado(s)</span>
              <button onClick={() => setPicker('team1')} className="text-gray-400 hover:text-white underline">editar</button>
              <button onClick={() => clearSelection('team1')} className="text-gray-400 hover:text-white underline">quitar</button>
            </div>
          )}
        </div>
        <div className="bg-gray-900 border border-blue-800/30 rounded-xl px-3 py-2">
          <div className="text-blue-400 font-bold text-xs mb-1.5">{team2.name}</div>
          <CondSelector value={cond2} onChange={makeCondHandler(setCond2, setMatches2, 'team2')} color="blue" />
          {cond2 === 'SELECTED' && (
            <div className="flex items-center gap-2 mt-1.5 text-[10px]">
              <span className="text-blue-400">📋 {matches2?.length ?? 0} partido(s) seleccionado(s)</span>
              <button onClick={() => setPicker('team2')} className="text-gray-400 hover:text-white underline">editar</button>
              <button onClick={() => clearSelection('team2')} className="text-gray-400 hover:text-white underline">quitar</button>
            </div>
          )}
        </div>
      </div>

      {picker && (
        <MatchPickerModal
          file={picker === 'team1' ? selectedFiles?.f1 : selectedFiles?.f2}
          initialSelected={picker === 'team1' ? matches1 : matches2}
          color={picker === 'team1' ? 'green' : 'blue'}
          onConfirm={handleConfirmPicker}
          onClose={() => setPicker(null)}
        />
      )}

      {/* Fichas de equipo lado a lado */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <TeamFicha name={team1.name} stats={team1.stats} color="green" />
        <TeamFicha name={team2.name} stats={team2.stats} color="blue"  />
      </div>

      {/* Expectativas */}
      <Expectativas s1={team1.stats} s2={team2.stats} name1={team1.name} name2={team2.name} />

      {/* Distribución de goles */}
      <GoalDistSection
        dist1={analysis.goals_dist?.team1}
        dist2={analysis.goals_dist?.team2}
        name1={team1.name}
        name2={team2.name}
      />

      <div className="bg-gray-900/40 border border-gray-700/40 rounded-lg p-2 text-[10px] text-gray-500 flex gap-2 shrink-0">
        <span>ℹ️</span>
        <span>Datos desde Excel · Modelo: Distribución de Poisson · Filtros independientes por equipo · el filtro se aplica a toda la app</span>
      </div>
    </div>
  );
}
