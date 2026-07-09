// Réplica del widget "Attack Momentum" de SofaScore: barras verdes hacia
// arriba = presión del local, barras índigo hacia abajo = presión de la
// visita, con líneas divisorias por período y marcadores de goles/tarjetas.
// periodCount de SofaScore no siempre refleja los tiempos extra jugados (queda
// en 2 aunque el partido llegue a 120'), así que las divisiones se derivan del
// rango real de minutos con datos: 1° y 2° tiempo fijos, y bloques de
// overtimeLength extra mientras el gráfico siga teniendo puntos más allá.
function periodBoundaries(periodTime, overtimeLength, lastMinute) {
  const bounds = [periodTime, periodTime * 2];
  let cum = bounds[1];
  while (cum < lastMinute - 1) {
    cum += overtimeLength;
    bounds.push(cum);
  }
  return bounds;
}

function incidentX(inc, scaleX) {
  // Comprime el tiempo de descuento para que el ícono no se salga del gráfico
  const minute = (inc.time || 0) + Math.min(inc.addedTime || 0, 6) * 0.3;
  return scaleX(minute);
}

function IncidentIcon({ inc, x, y }) {
  if (inc.type === 'goal') {
    return <text x={x} y={y} textAnchor="middle" fontSize={11}>⚽</text>;
  }
  const emoji = inc.cardType === 'red' ? '🟥' : inc.cardType === 'yellowRed' ? '🟨🟥' : '🟨';
  return <text x={x} y={y} textAnchor="middle" fontSize={9}>{emoji}</text>;
}

export default function AttackMomentumChart({ data }) {
  if (!data || !data.graphPoints?.length) return null;

  const { graphPoints, periodTime, overtimeLength, homeTeam, awayTeam, homeScore, awayScore, incidents } = data;

  const W = 640, PAD = 18;
  const ICON_H = 20, CHART_H = 90;
  const H = ICON_H * 2 + CHART_H;
  const plotW = W - PAD * 2;

  const lastPointMinute = graphPoints[graphPoints.length - 1]?.minute || 0;
  const bounds = periodBoundaries(periodTime || 45, overtimeLength || 15, lastPointMinute);
  const domainMax = Math.max(bounds[bounds.length - 1], lastPointMinute) + 1;

  const scaleX = m => PAD + (m / domainMax) * plotW;

  const maxAbs = Math.max(50, ...graphPoints.map(p => Math.abs(p.value || 0)));
  const halfH = CHART_H / 2;
  const midY = ICON_H + halfH;
  const scaleY = v => (v / maxAbs) * halfH;

  const barW = Math.max(1, plotW / graphPoints.length - 0.5);

  const homeIncidents = (incidents || []).filter(i => i.isHome);
  const awayIncidents = (incidents || []).filter(i => !i.isHome);

  return (
    <div className="bg-gray-900 border border-gray-700/60 rounded-xl p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-5 h-5 rounded-full bg-green-600 flex items-center justify-center text-[10px] font-bold text-white shrink-0">
            {homeTeam?.name?.[0]}
          </div>
          <span className="text-gray-200 text-xs font-semibold truncate">{homeTeam?.name}</span>
        </div>
        <span className="text-gray-400 text-xs font-mono font-bold">{homeScore ?? '-'} : {awayScore ?? '-'}</span>
        <div className="flex items-center gap-2 min-w-0 justify-end">
          <span className="text-gray-200 text-xs font-semibold truncate">{awayTeam?.name}</span>
          <div className="w-5 h-5 rounded-full bg-indigo-600 flex items-center justify-center text-[10px] font-bold text-white shrink-0">
            {awayTeam?.name?.[0]}
          </div>
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 'auto' }}>
        {/* íconos de goles/tarjetas del local, arriba */}
        {homeIncidents.map((inc, i) => (
          <IncidentIcon key={i} inc={inc} x={incidentX(inc, scaleX)} y={ICON_H - 6} />
        ))}

        {/* líneas divisorias por período */}
        {bounds.map((b, i) => (
          <line key={i} x1={scaleX(b)} y1={ICON_H} x2={scaleX(b)} y2={ICON_H + CHART_H}
            stroke="#e5e7eb" strokeWidth={1.5} />
        ))}

        {/* línea central */}
        <line x1={PAD} y1={midY} x2={W - PAD} y2={midY} stroke="#4b5563" strokeWidth={1} />

        {/* barras */}
        {graphPoints.map((p, i) => {
          const v = p.value || 0;
          const x = scaleX(p.minute) - barW / 2;
          const h = Math.abs(scaleY(v));
          const y = v >= 0 ? midY - h : midY;
          return (
            <rect key={i} x={x} y={y} width={barW} height={Math.max(0.5, h)}
              fill={v >= 0 ? '#22c55e' : '#4f46e5'} />
          );
        })}

        {/* íconos de goles/tarjetas de la visita, abajo */}
        {awayIncidents.map((inc, i) => (
          <IncidentIcon key={i} inc={inc} x={incidentX(inc, scaleX)} y={ICON_H + CHART_H + 14} />
        ))}
      </svg>
    </div>
  );
}
