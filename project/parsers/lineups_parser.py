from config import GOLES_LINEUPS_KEYS, DISPAROS_LINEUPS_KEYS, TARJETAS_LINEUPS_KEYS, ARQUEROS_LINEUPS_KEYS, PASES_LINEUPS_KEYS
from .common import iter_match_folders, load_match_json, match_context

ALL_LINEUPS_KEYS = sorted(set(GOLES_LINEUPS_KEYS + DISPAROS_LINEUPS_KEYS + TARJETAS_LINEUPS_KEYS + ARQUEROS_LINEUPS_KEYS + PASES_LINEUPS_KEYS))


def _player_base(ctx, side, p):
    player = p.get("player", {}) or {}
    stats = p.get("statistics", {}) or {}
    return {
        **ctx,
        "side": side,
        "team_id": ctx["home_team_id"] if side == "home" else ctx["away_team_id"],
        "team_name": ctx["home_team"] if side == "home" else ctx["away_team"],
        "player_id": player.get("id", ""),
        "player_name": player.get("name", ""),
        "player_short_name": player.get("shortName", ""),
        "position": player.get("position", ""),
        "shirt_number": player.get("shirtNumber", ""),
        "minutesPlayed": stats.get("minutesPlayed", 0),
    }


def _players_with_minutes(data):
    out = []
    if not isinstance(data, dict):
        return out
    for side in ["home", "away"]:
        for p in data.get(side, {}).get("players", []) or []:
            stats = p.get("statistics", {}) or {}
            minutes = stats.get("minutesPlayed", 0) or 0
            try:
                minutes_num = float(minutes)
            except Exception:
                minutes_num = 0
            if minutes_num > 0:
                out.append((side, p))
    return out


def _parse_lineups(team_folder, keys=None, only_goalkeepers=False):
    rows = []
    keys = keys or ALL_LINEUPS_KEYS
    for match_id, folder in iter_match_folders(team_folder):
        ctx = match_context(match_id, folder)
        data = load_match_json(folder, "lineups")
        players = _players_with_minutes(data)
        if not players:
            continue
        # Si una key existe para al menos un jugador del partido, ausentes = 0. Si no existe para nadie = -1.
        key_exists = {k: any(k in ((p.get("statistics", {}) or {})) and (p.get("statistics", {}) or {}).get(k) is not None for _, p in players) for k in keys}
        for side, p in players:
            player = p.get("player", {}) or {}
            if only_goalkeepers and player.get("position") != "G":
                continue
            stats = p.get("statistics", {}) or {}
            row = _player_base(ctx, side, p)
            for k in keys:
                if k in stats and stats.get(k) is not None:
                    row[k] = stats.get(k)
                else:
                    row[k] = 0 if key_exists[k] else -1
            rows.append(row)
    return rows


def parse_lineups_raw(team_folder):
    return _parse_lineups(team_folder, ALL_LINEUPS_KEYS, only_goalkeepers=False)


def parse_lineups_selected(team_folder, keys, only_goalkeepers=False):
    return _parse_lineups(team_folder, keys, only_goalkeepers=only_goalkeepers)
