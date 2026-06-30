import os
import datetime
from utils import read_json


def iter_match_folders(team_folder):
    matches_dir = os.path.join(team_folder, "matches")
    if not os.path.isdir(matches_dir):
        return
    entries = []
    for match_id in os.listdir(matches_dir):
        full = os.path.join(matches_dir, match_id)
        if os.path.isdir(full):
            event = read_json(os.path.join(full, "event.json"), default={})
            ts = event.get("startTimestamp", 0) or 0
            entries.append((ts, match_id, full))
    for _, match_id, full in sorted(entries):
        yield match_id, full


def load_match_json(match_folder, name):
    return read_json(os.path.join(match_folder, f"{name}.json"), default={})


def match_context(match_id, match_folder, team_id=None):
    event = load_match_json(match_folder, "event")
    home = event.get("homeTeam", {})
    away = event.get("awayTeam", {})
    tournament = event.get("tournament", {})
    score_home = event.get("homeScore", {}).get("current", "")
    score_away = event.get("awayScore", {}).get("current", "")

    ts = event.get("startTimestamp")
    fecha = datetime.datetime.utcfromtimestamp(ts).strftime('%Y-%m-%d') if ts else None

    condicion = "DESCONOCIDO"
    if team_id:
        if str(home.get("id", "")) == str(team_id):
            condicion = "LOCAL"
        elif str(away.get("id", "")) == str(team_id):
            condicion = "VISITA"

    return {
        "match_id": match_id,
        "fecha": fecha,
        "partido": f"{home.get('name','?')} vs {away.get('name','?')}",
        "home_team_id": home.get("id", ""),
        "home_team": home.get("name", ""),
        "away_team_id": away.get("id", ""),
        "away_team": away.get("name", ""),
        "torneo": tournament.get("name", ""),
        "home_score": score_home,
        "away_score": score_away,
        "status": event.get("status", {}).get("type", ""),
        "condicion": condicion,
    }
