from .common import iter_match_folders, load_match_json, match_context


def parse_incidents_raw(team_folder, team_id=None):
    rows = []
    for match_id, folder in iter_match_folders(team_folder):
        ctx = match_context(match_id, folder, team_id=team_id)
        data = load_match_json(folder, "incidents")
        for i, inc in enumerate(data.get("incidents", []) if isinstance(data, dict) else [], 1):
            player = inc.get("player", {}) or {}
            assist1 = inc.get("assist1", {}) or {}
            player_in = inc.get("playerIn", {}) or {}
            player_out = inc.get("playerOut", {}) or {}
            rows.append({
                **ctx,
                "incident_num": i,
                "text": inc.get("text", ""),
                "time": inc.get("time", ""),
                "addedTime": inc.get("addedTime", ""),
                "period": inc.get("period", ""),
                "isHome": inc.get("isHome", ""),
                "team_name": ctx["home_team"] if inc.get("isHome") is True else ctx["away_team"] if inc.get("isHome") is False else "",
                "incidentType": inc.get("incidentType", ""),
                "incidentClass": inc.get("incidentClass", ""),
                "reason": inc.get("reason", ""),
                "player_id": player.get("id", ""),
                "player_name": player.get("name", ""),
                "player_short_name": player.get("shortName", ""),
                "assist1_id": assist1.get("id", ""),
                "assist1_name": assist1.get("name", ""),
                "assist1_short_name": assist1.get("shortName", ""),
                "playerIn_id": player_in.get("id", ""),
                "playerIn_name": player_in.get("name", ""),
                "playerOut_id": player_out.get("id", ""),
                "playerOut_name": player_out.get("name", ""),
                "homeScore": inc.get("homeScore", ""),
                "awayScore": inc.get("awayScore", ""),
            })
    return rows


def parse_incidents_selected(team_folder, allowed_types=None, allowed_classes=None, team_id=None):
    rows = parse_incidents_raw(team_folder, team_id=team_id)
    if allowed_types is not None:
        rows = [r for r in rows if r.get("incidentType") in set(allowed_types)]
    if allowed_classes is not None:
        rows = [r for r in rows if r.get("incidentClass") in set(allowed_classes)]
    return rows


def parse_card_summaries(team_folder, target_team_id):
    rows = []
    for match_id, folder in iter_match_folders(team_folder):
        ctx = match_context(match_id, folder, team_id=target_team_id)
        data = load_match_json(folder, "incidents")
        incidents = data.get("incidents", []) if isinstance(data, dict) else []
        
        # Inicializar contadores
        summary = {
            "match_id": match_id,
            "Amarillas_home_1t": 0, "Amarillas_home_2t": 0, "Amarillas_home": 0,
            "Rojas_home_1t": 0, "Rojas_home_2t": 0, "Rojas_home": 0,
            "Subs_home": 0,
            "Amarillas_away_1t": 0, "Amarillas_away_2t": 0, "Amarillas_away": 0,
            "Rojas_away_1t": 0, "Rojas_away_2t": 0, "Rojas_away": 0,
            "Subs_away": 0,
        }
        
        for inc in incidents:
            tipo = inc.get("incidentType")
            clase = inc.get("incidentClass", "").lower()
            minuto = inc.get("time", 0)
            period = "2t" if minuto > 45 else "1t"
            is_home = inc.get("isHome")
            
            side = "home" if is_home else "away"
            
            if tipo == "card":
                if clase == "yellow":
                    summary[f"Amarillas_{side}_{period}"] += 1
                    summary[f"Amarillas_{side}"] += 1
                elif clase in ["red", "yellowred"]:
                    summary[f"Rojas_{side}_{period}"] += 1
                    summary[f"Rojas_{side}"] += 1
            elif tipo == "substitution":
                summary[f"Subs_{side}"] += 1
                
        rows.append(summary)
    return rows
