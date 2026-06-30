from .common import iter_match_folders, load_match_json, match_context


def parse_graph_raw(team_folder):
    rows = []
    for match_id, folder in iter_match_folders(team_folder):
        ctx = match_context(match_id, folder)
        data = load_match_json(folder, "graph")
        points = []
        if isinstance(data, dict):
            if isinstance(data.get("graphPoints"), list):
                points = data.get("graphPoints")
            elif isinstance(data.get("points"), list):
                points = data.get("points")
            elif isinstance(data.get("graph"), list):
                points = data.get("graph")
        for i, pt in enumerate(points, 1):
            if not isinstance(pt, dict):
                continue
            rows.append({
                **ctx,
                "point_num": i,
                "minute": pt.get("minute", pt.get("time", "")),
                "value": pt.get("value", ""),
            })
    return rows
