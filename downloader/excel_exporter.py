import os
import pandas as pd
from datetime import date

pd.set_option('future.no_silent_downcasting', True)

from utils import ensure_dir, safe_filename
from parsers.statistics_parser import parse_statistics_raw
from parsers.incidents_parser import parse_incidents_raw, parse_card_summaries
from parsers.lineups_parser import parse_lineups_raw
from parsers.shotmap_parser import parse_shotmap_raw
from parsers.common import iter_match_folders, load_match_json, match_context


# ─── HELPER: scores HT/FT por partido ────────────────────────────────────────

def _build_scores_df(team_folder, team_id):
    incidents_raw = pd.DataFrame(parse_incidents_raw(team_folder, team_id=team_id))
    if incidents_raw.empty:
        return pd.DataFrame()
    scores = incidents_raw[incidents_raw['text'].isin(['HT', 'FT'])].copy()
    if scores.empty:
        return pd.DataFrame()
    scores = scores.pivot_table(
        index='match_id',
        columns='text',
        values=['homeScore', 'awayScore'],
        aggfunc='first'
    )
    scores.columns = [f"{col[0]}_{col[1]}" for col in scores.columns]
    return scores.reset_index()


# ─── HOJA: PARTIDOS (una fila por partido, stats por mitad y total) ───────────

def _build_partidos(team_folder, team_id, scores_df):
    """
    Una fila por partido con condicion, rival, goles, corners, tarjetas,
    disparos y pases por mitad (1T/2T) y total (FT).
    Compatible con el formato esperado por api.py (usando home_team/away_team).
    """
    raw = pd.DataFrame(parse_statistics_raw(team_folder, team_id=team_id))
    if raw.empty:
        return pd.DataFrame()

    # Pivot: una fila por (match_id, periodo), columnas = stat_name con sufijo _home/_away
    def _pivot_side(side_col):
        df = raw.pivot_table(
            index=["match_id", "home_team", "away_team", "condicion", "periodo"],
            columns="stat_name",
            values=side_col,
            aggfunc="first"
        ).reset_index()
        df.columns.name = None
        return df

    df_home = _pivot_side("homeValue")
    df_away = _pivot_side("awayValue")
    df_merged = pd.merge(
        df_home, df_away,
        on=["match_id", "home_team", "away_team", "condicion", "periodo"],
        suffixes=("_home", "_away")
    )

    # Agregar tarjetas detalladas de incidents
    card_summaries = pd.DataFrame(parse_card_summaries(team_folder, team_id))
    if not card_summaries.empty:
        df_merged = pd.merge(df_merged, card_summaries, on="match_id", how="left")

    # Agregar scores HT/FT
    if not scores_df.empty:
        df_merged = pd.merge(df_merged, scores_df, on="match_id", how="left")

    df_merged = df_merged.fillna(-1)

    # Separar periodos: ALL=FT, 1ST=1T, 2ND=2T
    period_map = {"ALL": "FT", "1ST": "1T", "2ND": "2T"}

    # Stat columns de interés por categoría
    stat_cols = {
        "corners":  ("Corner kicks", "corner"),
        "tiros":    ("Total shots", "tiro"),
        "pases":    ("Passes", "pase"),
        "faltas":   ("Fouls", "falta"),
    }

    # Construir una fila por partido (pivot de periodos)
    matches = df_merged["match_id"].unique()
    rows = []

    for mid in matches:
        df_m = df_merged[df_merged["match_id"] == mid]
        base = df_m.iloc[0]

        # Leer fecha desde event.json
        from parsers.common import load_match_json
        import datetime as _dt
        _ev = load_match_json(os.path.join(team_folder, "matches", str(mid)), "event")
        _ts = _ev.get("startTimestamp")
        _fecha = _dt.datetime.utcfromtimestamp(_ts).strftime('%Y-%m-%d') if _ts else None

        row = {
            "match_id":   mid,
            "fecha":      _fecha,
            "partido":    f"{base['home_team']} vs {base['away_team']}",
            "home_team":  base["home_team"],
            "away_team":  base["away_team"],
            "condicion":  base["condicion"],
            "rival":      base["away_team"] if base["condicion"] == "LOCAL" else base["home_team"],
            # Scores
            "homeScore_HT": base.get("homeScore_HT", -1),
            "homeScore_FT": base.get("homeScore_FT", -1),
            "awayScore_HT": base.get("awayScore_HT", -1),
            "awayScore_FT": base.get("awayScore_FT", -1),
            # team_id_meta para que api.py lo lea
            "team_id_meta": team_id,
        }

        # Por cada periodo disponible, extraer stats
        for raw_p, label in period_map.items():
            df_p = df_m[df_m["periodo"] == raw_p]
            if df_p.empty:
                df_p = df_m[df_m["periodo"] == raw_p.upper()]

            def _get(col_home, col_away=None):
                if df_p.empty:
                    return -1, -1
                h = df_p.iloc[0].get(f"{col_home}_home", df_p.iloc[0].get(col_home, -1))
                a_col = col_away or col_home
                a = df_p.iloc[0].get(f"{a_col}_away", df_p.iloc[0].get(a_col, -1))
                return h, a

            # Corners
            ch, ca = _get("Corner kicks")
            row[f"corners_home_{label}"] = ch
            row[f"corners_away_{label}"] = ca

            # Disparos
            th, ta = _get("Total shots")
            row[f"tiros_home_{label}"] = th
            row[f"tiros_away_{label}"] = ta

            # Pases
            ph, pa = _get("Passes")
            row[f"pases_home_{label}"] = ph
            row[f"pases_away_{label}"] = pa

            # Faltas
            fh, fa = _get("Fouls")
            row[f"faltas_home_{label}"] = fh
            row[f"faltas_away_{label}"] = fa

        # Tarjetas de incidents (ya vienen por partido entero con 1t/2t)
        for k in ["Amarillas_home_1t", "Amarillas_home_2t", "Amarillas_home",
                  "Rojas_home_1t", "Rojas_home_2t", "Rojas_home",
                  "Amarillas_away_1t", "Amarillas_away_2t", "Amarillas_away",
                  "Rojas_away_1t", "Rojas_away_2t", "Rojas_away",
                  "Subs_home", "Subs_away"]:
            row[k] = base.get(k, 0)

        rows.append(row)

    df = pd.DataFrame(rows)
    if not df.empty and "fecha" in df.columns:
        df = df.sort_values("fecha").reset_index(drop=True)
    return df


# ─── HOJA: GOLES DEL EQUIPO ───────────────────────────────────────────────────

def _build_goles_equipo(team_folder, team_id):
    """
    Una fila por gol: jugador, minuto, partido, condicion, rival, isHome.
    Solo goles del equipo objetivo (team_id).
    """
    rows = []
    for match_id, folder in iter_match_folders(team_folder):
        ctx = match_context(match_id, folder, team_id=team_id)
        data = load_match_json(folder, "incidents")
        for inc in data.get("incidents", []) if isinstance(data, dict) else []:
            if inc.get("incidentType") != "goal":
                continue
            # Ignorar autogoles del rival (ownGoal del equipo contrario)
            is_home = inc.get("isHome")
            team_is_home = (str(ctx["home_team_id"]) == str(team_id))
            # El gol pertenece al equipo objetivo si:
            # (is_home == True y team_id es home) o (is_home == False y team_id es away)
            if team_is_home and is_home is not True:
                # Si es ownGoal del rival (is_home=False pero somos home → gol a favor)
                if inc.get("incidentClass") != "ownGoal":
                    continue
            if not team_is_home and is_home is not False:
                if inc.get("incidentClass") != "ownGoal":
                    continue

            player = inc.get("player", {}) or {}
            assist = inc.get("assist1", {}) or {}
            minuto = inc.get("time", "")
            added  = inc.get("addedTime", 0)
            min_str = f"{minuto}+{added}" if added and int(added) > 0 else str(minuto)

            rows.append({
                "partido":       ctx["partido"],
                "match_id":      match_id,
                "condicion":     ctx["condicion"],
                "rival":         ctx["away_team"] if ctx["condicion"] == "LOCAL" else ctx["home_team"],
                "minuto":        min_str,
                "gol_jugador":   player.get("shortName", player.get("name", "")),
                "asistente":     assist.get("shortName", assist.get("name", "")),
                "tipo":          inc.get("incidentClass", "regular"),
            })
    return pd.DataFrame(rows)


# ─── HOJA: POR JUGADOR x PARTIDO ─────────────────────────────────────────────

def _build_jugadores_por_partido(team_folder, team_id):
    """
    Una fila por jugador por partido. Incluye intercepciones y perdidas_balon.
    Compatible con el formato de 'Por Jugador x Partido' del proyecto antiguo.
    """
    rows = []
    for match_id, folder in iter_match_folders(team_folder):
        ctx = match_context(match_id, folder, team_id=team_id)
        data = load_match_json(folder, "lineups")
        if not isinstance(data, dict):
            continue

        team_side = None
        home_id = str(ctx.get("home_team_id", ""))
        away_id = str(ctx.get("away_team_id", ""))
        if str(team_id) == home_id:
            team_side = "home"
        elif str(team_id) == away_id:
            team_side = "away"
        if not team_side:
            continue

        side_data = data.get(team_side, {})
        players = side_data.get("players", []) if isinstance(side_data, dict) else []

        for p in players:
            player = p.get("player", {}) or {}
            stats  = p.get("statistics", {}) or {}
            minutes = stats.get("minutesPlayed", 0) or 0
            if float(minutes) <= 0:
                continue

            def s(k, default=0):
                v = stats.get(k)
                return v if v is not None else default

            rows.append({
                "partido":          ctx["partido"],
                "match_id":         match_id,
                "condicion":        ctx["condicion"],
                "rival":            ctx["away_team"] if ctx["condicion"] == "LOCAL" else ctx["home_team"],
                "player_id":        player.get("id", ""),
                "jugador":          player.get("shortName", player.get("name", "")),
                "jugador_nombre":   player.get("name", ""),
                "posicion":         player.get("position", ""),
                "titular":          not p.get("substitute", False),
                "minutos_jugados":  float(minutes),
                "goles":            s("goals"),
                "asistencias":      s("goalAssist") or s("assists", 0),
                "tiros_totales":    s("totalShots"),
                "tiros_al_arco":    s("onTargetScoringAttempt"),
                "pases_totales":    s("totalPass"),
                "pases_ok":         s("accuratePass"),
                "pases_clave":      s("keyPass"),
                "duelos_total":     s("duelWon") + s("duelLost"),
                "duelos_ganados":   s("duelWon"),
                "intercepciones":   s("interceptionWon"),
                "despejes":         s("totalClearance"),
                "recuperaciones":   s("ballRecovery"),
                "perdidas_balon":   s("possessionLostCtrl"),
                "faltas_cometidas": s("fouls") or s("totalFoulsConceded", 0),
                "faltas_recibidas": s("wasFouled"),
                "rating":           s("rating", None),
            })
    return pd.DataFrame(rows)


# ─── HOJA: ARQUEROS x PARTIDO ─────────────────────────────────────────────────

def _build_arqueros_por_partido(team_folder, team_id):
    """
    Una fila por arquero por partido con atajadas, goles_recibidos, etc.
    """
    rows = []
    for match_id, folder in iter_match_folders(team_folder):
        ctx = match_context(match_id, folder, team_id=team_id)
        data = load_match_json(folder, "lineups")
        if not isinstance(data, dict):
            continue

        home_id = str(ctx.get("home_team_id", ""))
        team_side = "home" if str(team_id) == home_id else "away"

        side_data = data.get(team_side, {})
        players = side_data.get("players", []) if isinstance(side_data, dict) else []

        for p in players:
            player = p.get("player", {}) or {}
            if player.get("position") != "G":
                continue
            stats   = p.get("statistics", {}) or {}
            minutes = stats.get("minutesPlayed", 0) or 0
            if float(minutes) <= 0:
                continue

            def s(k, default=0):
                v = stats.get(k)
                return v if v is not None else default

            rows.append({
                "partido":           ctx["partido"],
                "match_id":          match_id,
                "condicion":         ctx["condicion"],
                "rival":             ctx["away_team"] if ctx["condicion"] == "LOCAL" else ctx["home_team"],
                "arquero":           player.get("shortName", player.get("name", "")),
                "minutos_jugados":   float(minutes),
                "atajadas":          s("saves") or s("goalKeeperSave", 0),
                "atajadas_dentro":   s("savedShotsFromInsideTheBox"),
                "goles_recibidos":   s("goalsConceded"),
                "salidas":           s("totalKeeperSweeper") or s("keeperSweeper", 0),
                "punos":             s("punches"),
                "rating":            s("rating", None),
            })
    return pd.DataFrame(rows)


# ─── HOJA: JUGADORES P90 (mejorada) ──────────────────────────────────────────

def _build_jugadores_p90(team_folder, team_id):
    """
    Agrupación total por jugador con todas las stats incluyendo
    intercepciones y perdidas_balon.
    """
    df_j = _build_jugadores_por_partido(team_folder, team_id)
    if df_j.empty:
        return pd.DataFrame()

    numeric_cols = [
        'minutos_jugados', 'goles', 'asistencias', 'tiros_totales', 'tiros_al_arco',
        'pases_totales', 'pases_ok', 'pases_clave', 'duelos_total', 'duelos_ganados',
        'intercepciones', 'despejes', 'recuperaciones', 'perdidas_balon',
        'faltas_cometidas', 'faltas_recibidas',
    ]
    agg_dict = {c: 'sum' for c in numeric_cols if c in df_j.columns}
    agg_dict['rating'] = 'mean'

    # Agrupar solo por jugador para evitar duplicados cuando la posición varía entre partidos
    agg = df_j.groupby('jugador').agg(agg_dict).reset_index()
    pos_map = df_j.groupby('jugador')['posicion'].apply(
        lambda s: s[s.astype(str).str.strip() != ''].mode().iloc[0] if len(s[s.astype(str).str.strip() != '']) else ''
    )
    agg['posicion'] = agg['jugador'].map(pos_map).fillna('')
    agg['minutos_jugados'] = agg['minutos_jugados'].clip(lower=90)

    m = agg['minutos_jugados'] / 90
    agg['goles_p90']        = (agg['goles'] / m).round(2)
    agg['asist_p90']        = (agg['asistencias'] / m).round(2)
    agg['tiros_p90']        = (agg['tiros_totales'] / m).round(2)
    agg['tiros_arco_p90']   = (agg['tiros_al_arco'] / m).round(2)
    agg['pases_clave_p90']  = (agg['pases_clave'] / m).round(2)
    agg['interc_p90']       = (agg['intercepciones'] / m).round(2)
    agg['despejes_p90']     = (agg['despejes'] / m).round(2)
    agg['recup_p90']        = (agg['recuperaciones'] / m).round(2)
    agg['perdidas_p90']     = (agg['perdidas_balon'] / m).round(2)
    agg['faltas_com_p90']   = (agg['faltas_cometidas'] / m).round(2)
    agg['faltas_rec_p90']   = (agg['faltas_recibidas'] / m).round(2)
    agg['duelos_pct']       = (agg['duelos_ganados'] / agg['duelos_total'].replace(0, 1) * 100).round(1)
    agg['pases_pct']        = (agg['pases_ok'] / agg['pases_totales'].replace(0, 1) * 100).round(1)
    agg['precision_tiro']   = (agg['tiros_al_arco'] / agg['tiros_totales'].replace(0, 1) * 100).round(1)

    return agg


# ─── HOJA: DISPAROS DETALLE ──────────────────────────────────────────────────

_RESULTADO_ES = {
    "goal":  "Gol",
    "save":  "Al arco",
    "miss":  "Afuera",
    "block": "Bloqueado",
}
_SITUACION_ES = {
    "regular":            "Juego abierto",
    "assisted":           "Asistido",
    "set-piece":          "Pelota parada",
    "free-kick":          "Tiro libre",
    "corner":             "Corner",
    "penalty":            "Penal",
    "fast-break":         "Contraataque",
    "throw-in-set-piece": "Lateral",
}
_PARTE_ES = {
    "right-foot": "Pie derecho",
    "left-foot":  "Pie izquierdo",
    "head":       "Cabeza",
}


def _build_disparos_detalle(team_folder, team_id):
    rows = []
    for match_id, folder in iter_match_folders(team_folder):
        ctx = match_context(match_id, folder, team_id=team_id)
        data = load_match_json(folder, "shotmap")

        shots = []
        if isinstance(data, dict):
            for key in ("shotmap", "shots", "incidents"):
                if isinstance(data.get(key), list):
                    shots = data[key]
                    break

        # Determinar si el equipo analizado juega de local en este partido
        team_is_home = str(ctx.get("home_team_id", "")) == str(team_id)

        # Sin shotmap: registrar fila centinela con -1
        team_shots = [s for s in shots if (team_is_home and s.get("isHome") is True) or (not team_is_home and s.get("isHome") is False)]
        if not team_shots:
            rows.append({
                "partido":          ctx["partido"],
                "match_id":         match_id,
                "condicion":        ctx["condicion"],
                "rival":            ctx["away_team"] if ctx["condicion"] == "LOCAL" else ctx["home_team"],
                "minuto":           -1,
                "jugador":          -1,
                "posicion":         -1,
                "resultado":        -1,
                "situacion":        -1,
                "parte_cuerpo":     -1,
                "xg":               -1,
                "xgot":             -1,
                "marcador_momento": -1,
                "pos_x":            -1,
                "pos_y":            -1,
                "zona_arco":        -1,
            })
            continue

        for shot in team_shots:
            player = shot.get("player", {}) or {}
            minute     = shot.get("time", shot.get("minute", ""))
            added_time = shot.get("addedTime", 0) or 0
            minuto_str = f"{minute}+{added_time}" if int(added_time) > 0 else str(minute)

            home_score = shot.get("homeScore", "")
            away_score = shot.get("awayScore", "")
            marcador = f"{home_score}-{away_score}" if home_score != "" else ""

            resultado_raw = shot.get("shotType", "")
            situacion_raw = shot.get("situation", "")
            parte_raw     = shot.get("bodyPart", "")

            rows.append({
                "partido":          ctx["partido"],
                "match_id":         match_id,
                "condicion":        ctx["condicion"],
                "rival":            ctx["away_team"] if ctx["condicion"] == "LOCAL" else ctx["home_team"],
                "minuto":           minuto_str,
                "jugador":          player.get("shortName", player.get("name", "")),
                "posicion":         player.get("position", ""),
                "resultado":        _RESULTADO_ES.get(resultado_raw, resultado_raw),
                "situacion":        _SITUACION_ES.get(situacion_raw, situacion_raw),
                "parte_cuerpo":     _PARTE_ES.get(parte_raw, parte_raw),
                "xg":               shot.get("xg", ""),
                "xgot":             shot.get("xgot", ""),
                "marcador_momento": marcador,
                "pos_x":            shot.get("playerCoordinates", {}).get("x", "") if isinstance(shot.get("playerCoordinates"), dict) else "",
                "pos_y":            shot.get("playerCoordinates", {}).get("y", "") if isinstance(shot.get("playerCoordinates"), dict) else "",
                "zona_arco":        shot.get("goalMouthLocation", ""),
            })

    df = pd.DataFrame(rows)
    if not df.empty and "match_id" in df.columns:
        df = df.sort_values(["match_id", "minuto"]).reset_index(drop=True)
    return df


# ─── EXPORT PRINCIPAL ─────────────────────────────────────────────────────────

def build_excel(team_id, team_name, team_folder, urls_rows=None):

    excel_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "upcoming")
    ensure_dir(excel_dir)

    path = os.path.join(
        excel_dir,
        f"{safe_filename(team_name)}_{date.today().strftime('%Y%m%d')}.xlsx"
    )

    print(">> Generando Excel...")

    # ── Estadísticas por equipo (pivot stats) ──
    raw = pd.DataFrame(parse_statistics_raw(team_folder, team_id=team_id))

    def _pivot_side(side_col):
        df = raw.pivot_table(
            index=["match_id", "home_team", "away_team", "condicion", "periodo"],
            columns="stat_name",
            values=side_col,
            aggfunc="first"
        ).reset_index()
        df.columns.name = None
        return df

    df_home = _pivot_side("homeValue")
    df_away = _pivot_side("awayValue")
    df_pivot = pd.merge(
        df_home, df_away,
        on=["match_id", "home_team", "away_team", "condicion", "periodo"],
        suffixes=("_home", "_away")
    )

    card_summaries = pd.DataFrame(parse_card_summaries(team_folder, team_id))
    if not card_summaries.empty:
        df_pivot = pd.merge(df_pivot, card_summaries, on="match_id", how="left")

    scores_df = _build_scores_df(team_folder, team_id)
    if not scores_df.empty:
        df_pivot = pd.merge(df_pivot, scores_df, on="match_id", how="left")

    df_pivot = df_pivot.fillna(-1)

    # Hojas pivot por categoría
    allowed_goals = [
        "match_id", "home_team", "away_team", "condicion", "periodo",
        "Expected goals_home", "Expected goals_away",
        "Total shots_home", "Total shots_away",
        "Shots on target_home", "Shots on target_away",
        "Shots off target_home", "Shots off target_away",
        "Shots inside box_home", "Shots inside box_away",
        "Big chances_home", "Big chances_away",
        "Ball possession_home", "Ball possession_away",
        "Passes_home", "Passes_away",
        "Accurate passes_home", "Accurate passes_away",
        "Final third entries_home", "Final third entries_away",
        "Crosses_home", "Crosses_away",
        "Long balls_home", "Long balls_away",
        "homeScore_HT", "homeScore_FT", "awayScore_HT", "awayScore_FT",
    ]
    allowed_corners = [
        "match_id", "home_team", "away_team", "condicion", "periodo",
        "Corner kicks_home", "Corner kicks_away",
        "Crosses_home", "Crosses_away",
        "Total shots_home", "Total shots_away",
        "Ball possession_home", "Ball possession_away",
        "homeScore_HT", "homeScore_FT", "awayScore_HT", "awayScore_FT",
    ]
    allowed_cards = [
        "match_id", "home_team", "away_team", "condicion", "periodo",
        "Amarillas_home_1t", "Amarillas_home_2t", "Amarillas_home",
        "Rojas_home_1t", "Rojas_home_2t", "Rojas_home", "Subs_home",
        "Amarillas_away_1t", "Amarillas_away_2t", "Amarillas_away",
        "Rojas_away_1t", "Rojas_away_2t", "Rojas_away", "Subs_away",
        "Fouls_home", "Fouls_away",
        "homeScore_HT", "homeScore_FT", "awayScore_HT", "awayScore_FT",
    ]
    allowed_shots = [
        "match_id", "home_team", "away_team", "condicion", "periodo",
        "Total shots_home", "Total shots_away",
        "Shots on target_home", "Shots on target_away",
        "Shots off target_home", "Shots off target_away",
        "Shots inside box_home", "Shots inside box_away",
        "Blocked shots_home", "Blocked shots_away",
        "Expected goals_home", "Expected goals_away",
        "homeScore_HT", "homeScore_FT", "awayScore_HT", "awayScore_FT",
    ]
    allowed_passes = [
        "match_id", "home_team", "away_team", "condicion", "periodo",
        "Passes_home", "Passes_away",
        "Accurate passes_home", "Accurate passes_away",
        "Long balls_home", "Long balls_away",
        "Ball possession_home", "Ball possession_away",
        "homeScore_HT", "homeScore_FT", "awayScore_HT", "awayScore_FT",
    ]

    df_goals   = df_pivot[[c for c in allowed_goals   if c in df_pivot.columns]]
    df_corners = df_pivot[[c for c in allowed_corners if c in df_pivot.columns]]
    df_cards   = df_pivot[[c for c in allowed_cards   if c in df_pivot.columns]]
    df_shots   = df_pivot[[c for c in allowed_shots   if c in df_pivot.columns]]
    df_passes  = df_pivot[[c for c in allowed_passes  if c in df_pivot.columns]]

    # ── Nuevas hojas ──
    print("   -> Construyendo hoja Partidos...")
    df_partidos = _build_partidos(team_folder, team_id, scores_df)

    print("   -> Construyendo hoja Goles del Equipo...")
    df_goles_equipo = _build_goles_equipo(team_folder, team_id)

    print("   -> Construyendo hoja Por Jugador x Partido...")
    df_jugadores = _build_jugadores_por_partido(team_folder, team_id)

    print("   -> Construyendo hoja Arqueros x Partido...")
    df_arqueros = _build_arqueros_por_partido(team_folder, team_id)

    print("   -> Construyendo hoja JUGADORES P90...")
    df_p90 = _build_jugadores_p90(team_folder, team_id)

    print("   -> Construyendo hoja Disparos Detalle...")
    df_disparos_detalle = _build_disparos_detalle(team_folder, team_id)

    # ── Escribir Excel ──
    with pd.ExcelWriter(path, engine="openpyxl") as writer:
        # Hojas nuevas (compatibles con Aw.py y api.py)
        df_partidos.to_excel(writer,        sheet_name="Partidos",            index=False)
        df_goles_equipo.to_excel(writer,    sheet_name="Goles del Equipo",    index=False)
        df_jugadores.to_excel(writer,       sheet_name="Por Jugador x Partido", index=False)
        df_arqueros.to_excel(writer,        sheet_name="Arqueros x Partido",  index=False)
        df_p90.to_excel(writer,             sheet_name="JUGADORES P90",       index=False)
        df_disparos_detalle.to_excel(writer, sheet_name="Disparos Detalle",   index=False)

        # Hojas pivot originales (para análisis raw)
        df_goals.to_excel(writer,   sheet_name="GOLES EQUIPO",    index=False)
        df_corners.to_excel(writer, sheet_name="CORNERS EQUIPO",  index=False)
        df_cards.to_excel(writer,   sheet_name="TARJETAS EQUIPO", index=False)
        df_shots.to_excel(writer,   sheet_name="DISPAROS EQUIPO", index=False)
        df_passes.to_excel(writer,  sheet_name="PASES EQUIPO",    index=False)

    print(f"OK Excel creado: {path}")
    return path
