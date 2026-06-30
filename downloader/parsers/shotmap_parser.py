from .common import iter_match_folders, load_match_json, match_context


def _shots(data):
    if not isinstance(data, dict):
        return []
    for key in ["shotmap", "shots", "incidents"]:
        if isinstance(data.get(key), list):
            return data[key]
    return []


def parse_shotmap_raw(team_folder):
    rows = []
    for match_id, folder in iter_match_folders(team_folder):
        ctx = match_context(match_id, folder)
        data = load_match_json(folder, "shotmap")
        for i, shot in enumerate(_shots(data), 1):
            player = shot.get("player", {}) or {}
            team = shot.get("team", {}) or {}
            draw = shot.get("draw", {}) or {}
            gmc = shot.get("goalMouthCoordinates", {}) or {}
            bc = shot.get("blockCoordinates", {}) or {}
            rows.append({
                **ctx,
                "shot_num": i,
                "shot_id": shot.get("id", ""),
                "minute": shot.get("time", shot.get("minute", "")),
                "addedTime": shot.get("addedTime", ""),
                "timeSeconds": shot.get("timeSeconds", ""),
                "period": shot.get("period", ""),
                "isHome": shot.get("isHome", ""),
                "team_id": team.get("id", ""),
                "team_name": team.get("name", ""),
                "player_id": player.get("id", ""),
                "player_name": player.get("name", ""),
                "player_short_name": player.get("shortName", ""),
                "player_position": player.get("position", ""),
                "incident_type": shot.get("incidentType", ""),
                "incident_class": shot.get("incidentClass", ""),
                "shot_type": shot.get("shotType", ""),
                "situation": shot.get("situation", ""),
                "body_part": shot.get("bodyPart", ""),
                "goal_mouth_location": shot.get("goalMouthLocation", ""),
                "xg": shot.get("xg", ""),
                "xgot": shot.get("xgot", ""),
                "homeScore": shot.get("homeScore", ""),
                "awayScore": shot.get("awayScore", ""),
                "x": shot.get("x", ""),
                "y": shot.get("y", ""),
                "draw_start_x": draw.get("startX", ""),
                "draw_start_y": draw.get("startY", ""),
                "draw_end_x": draw.get("endX", ""),
                "draw_end_y": draw.get("endY", ""),
                "draw_goal_x": draw.get("goalX", ""),
                "draw_goal_y": draw.get("goalY", ""),
                "goal_mouth_x": gmc.get("x", ""),
                "goal_mouth_y": gmc.get("y", ""),
                "goal_mouth_z": gmc.get("z", ""),
                "block_x": bc.get("x", ""),
                "block_y": bc.get("y", ""),
                "block_z": bc.get("z", ""),
            })
    return rows
