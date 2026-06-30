SOFASCORE DOWNLOADER V3
======================

Objetivo:
1) Descargar JSON crudo desde SofaScore.
2) Guardar carpetas por equipo con formato: Nombre Equipo - ID.
3) Leer los JSON locales.
4) Exportar Excel con hojas RAW y hojas separadas por objetivo/origen.

Uso:
    pip install -r requirements.txt
    python main.py 2301 12
    python main.py 2301-2 12

Estructura de salida:
    data/raw_json/Nombre Equipo - ID/
        team.json
        events.json
        manifest.json
        matches/MATCH_ID/
            event.json
            lineups.json
            incidents.json
            statistics.json
            graph.json
            shotmap.json

    data/excel/Nombre Equipo - ID_FECHA.xlsx

Reglas aplicadas:
- No se hacen cálculos de predicción ni rankings.
- Se separan datos crudos por objetivo y origen.
- Se elimina fecha_utc del Excel.
- En lineups solo entran jugadores con minutesPlayed > 0.
- Para lineups:
    * Si una estadística existe para algunos jugadores del partido, a los jugadores que jugaron y no la tienen se les coloca 0.
    * Si una estadística no existe para ningún jugador del partido, se coloca -1.
- Para statistics:
    * Si una estadística objetivo no existe en el periodo del partido, se coloca -1.

Hojas principales:
- Equipo
- Partidos
- Raw Statistics
- Raw Lineups
- Raw Incidents
- Raw Momentum
- Raw Shotmap
- Goles Statistics
- Goles Lineups
- Goles Incidents
- Disparos Statistics
- Disparos Shotmap
- Disparos Lineups
- Disparos Incidents
- Corners Statistics
- Tarjetas Statistics
- Tarjetas Incidents
- Tarjetas Lineups
- Arqueros Statistics
- Arqueros Lineups
- Arqueros Incidents
- Pases Statistics
- Pases Lineups
