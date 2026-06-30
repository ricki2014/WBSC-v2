import os
from utils import read_json


def parse_events(team_folder, team_id=None):
    data = read_json(os.path.join(team_folder, "events.json"), default={})
    rows = []
    for ev in data.get("events", []):
        home = ev.get("homeTeam", {})
        away = ev.get("awayTeam", {})
        tournament = ev.get("tournament", {})
        home_score = ev.get("homeScore", {}).get("current", "")
        away_score = ev.get("awayScore", {}).get("current", "")
        is_home = (home.get("id") == team_id) if team_id is not None else ""
        team_goals = home_score if is_home else away_score
        rival_goals = away_score if is_home else home_score
        resultado_equipo = ""
        if isinstance(team_goals, int) and isinstance(rival_goals, int):
            resultado_equipo = "W" if team_goals > rival_goals else "D" if team_goals == rival_goals else "L"
        rows.append({
            "match_id": ev.get("id", ""),
            "partido": f"{home.get('name','?')} vs {away.get('name','?')}",
            "torneo": tournament.get("name", ""),
            "home_team_id": home.get("id", ""),
            "home_team": home.get("name", ""),
            "away_team_id": away.get("id", ""),
            "away_team": away.get("name", ""),
            "home_score": home_score,
            "away_score": away_score,
            "status": ev.get("status", {}).get("type", ""),
            "condicion_equipo": "LOCAL" if is_home else "VISITA" if is_home is not None else "",
            "resultado_equipo": resultado_equipo,
        })
    return rows
