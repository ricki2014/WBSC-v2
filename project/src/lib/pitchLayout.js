// Cálculo de posiciones de jugadores en la cancha — compartido por TODAS las
// pantallas con cancha (Registro x Jugador, Alineaciones, Stats en Vivo,
// Stats Fijos, Dist Tiros) para que se vean siempre iguales. Antes esta
// lógica estaba duplicada en cada archivo y terminaba desincronizándose.

// side: lado VISUAL ('home'/'away', izquierda/derecha en pantalla).
// team: identidad real ('team1'/'team2'), independiente del lado visual
// (que puede invertirse en 2T o manualmente con "Invertir lados").
export function layoutFormation(players, formation, side, team) {
  const posOrder = { G: 0, D: 1, M: 2, F: 3 };
  const starters = players
    .filter(p => !p.isSubstitute)
    .sort((a, b) => (posOrder[a.position] ?? 2) - (posOrder[b.position] ?? 2));

  const isHome = side === 'home';
  const fNums  = (formation || '').split('-').map(Number).filter(n => n > 0);

  const gks      = starters.filter(p => p.position === 'G');
  const outfield = starters.filter(p => p.position !== 'G');

  // Dividir el campo estrictamente según los números de la formación,
  // en lugar de agrupar por posición de SofaScore (que puede no coincidir)
  const layers = [gks];
  if (fNums.length >= 1) {
    let rest = [...outfield];
    fNums.forEach(count => layers.push(rest.splice(0, count)));
    if (rest.length) layers[layers.length - 1].push(...rest);
  } else if (outfield.length) {
    layers.push(outfield);
  }

  const totalL = layers.length;
  const result = [];
  layers.forEach((group, li) => {
    const n = group.length;
    if (!n) return;
    const ratio = totalL <= 1 ? 0 : li / (totalL - 1);
    // 38 (no 43): deja más margen entre las líneas más adelantadas de cada
    // equipo cerca del medio campo, para que no se crucen en canchas angostas.
    const x = isHome ? 4 + ratio * 38 : 96 - ratio * 38;
    group.forEach((player, pi) => {
      // 12-88 (no 8-92): más margen arriba/abajo para que la última fila no
      // se corte contra el borde de la cancha en contenedores de poca altura.
      const y = n === 1 ? 50 : 12 + ((n - 1 - pi) / (n - 1)) * 76;
      result.push({ ...player, x, y: isHome ? y : 100 - y, side, team });
    });
  });
  return result;
}

// Identidad real de cada lado de lineupData — independiente del lado visual.
export function teamIdentities(baseSwapped) {
  return {
    teamOfHome: baseSwapped ? 'team2' : 'team1',
    teamOfAway: baseSwapped ? 'team1' : 'team2',
  };
}

// Arma el array completo de jugadores en cancha (home + away) a partir de
// lineupData, respetando el lado visual (swapped) y la identidad real
// (baseSwapped). No considera manualPos — eso lo resuelve cada página
// (manualPos ?? computePositions(...)) porque su prioridad es la misma en todas.
export function computePositions(lineupData, swapped, baseSwapped) {
  if (!lineupData) return [];
  const { teamOfHome, teamOfAway } = teamIdentities(baseSwapped);
  const h  = swapped ? lineupData.away : lineupData.home;
  const a  = swapped ? lineupData.home : lineupData.away;
  const hf = swapped ? lineupData.away_formation : lineupData.home_formation;
  const af = swapped ? lineupData.home_formation : lineupData.away_formation;
  const hTeam = swapped ? teamOfAway : teamOfHome;
  const aTeam = swapped ? teamOfHome : teamOfAway;
  return [
    ...layoutFormation(h || [], hf || '', 'home', hTeam),
    ...layoutFormation(a || [], af || '', 'away', aTeam),
  ];
}
