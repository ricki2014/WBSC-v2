from config import GOLES_STATS, DISPAROS_STATS, CORNERS_STATS, TARJETAS_STATS, ARQUEROS_STATS, PASES_STATS
from .common import iter_match_folders, load_match_json, match_context

ALL_OBJECTIVE_STATS = sorted(set(GOLES_STATS + DISPAROS_STATS + CORNERS_STATS + TARJETAS_STATS + ARQUEROS_STATS + PASES_STATS))
PERIODS_DEFAULT = ["ALL", "1ST", "2ND"]


def _stat_row(ctx, period, group_name, item):
    return {
        **ctx,
        "periodo": period,
        "grupo": group_name,
        "stat_name": item.get("name", ""),
        "stat_key": item.get("key", ""),
        "home": item.get("home", ""),
        "away": item.get("away", ""),
        "homeValue": item.get("homeValue", ""),
        "awayValue": item.get("awayValue", ""),
        "compareCode": item.get("compareCode", ""),
        "statisticsType": item.get("statisticsType", ""),
        "valueType": item.get("valueType", ""),
        "renderType": item.get("renderType", ""),
    }


def parse_statistics_raw(team_folder, team_id=None):
    rows = []
    for match_id, folder in iter_match_folders(team_folder):
        ctx = match_context(match_id, folder, team_id=team_id)
        data = load_match_json(folder, "statistics")
        for block in data.get("statistics", []) if isinstance(data, dict) else []:
            period = str(block.get("period", "")).upper()
            for group in block.get("groups", []):
                group_name = group.get("groupName", "")
                for item in group.get("statisticsItems", []):
                    rows.append(_stat_row(ctx, period, group_name, item))
    return rows


def parse_statistics_selected(team_folder, wanted_names):
    wanted = set(wanted_names)
    rows = []
    for match_id, folder in iter_match_folders(team_folder):
        ctx = match_context(match_id, folder)
        data = load_match_json(folder, "statistics")
        found = {}
        periods_seen = set()
        if isinstance(data, dict) and data.get("statistics"):
            for block in data.get("statistics", []):
                period = str(block.get("period", "")).upper() or "ALL"
                periods_seen.add(period)
                for group in block.get("groups", []):
                    group_name = group.get("groupName", "")
                    for item in group.get("statisticsItems", []):
                        name = item.get("name", "")
                        if name in wanted:
                            found[(period, name)] = _stat_row(ctx, period, group_name, item)
        periods = sorted(periods_seen) if periods_seen else PERIODS_DEFAULT
        for period in periods:
            for name in wanted_names:
                if (period, name) in found:
                    rows.append(found[(period, name)])
                else:
                    rows.append({
                        **ctx,
                        "periodo": period,
                        "grupo": "NO_DATA",
                        "stat_name": name,
                        "stat_key": "NO_DATA",
                        "home": -1,
                        "away": -1,
                        "homeValue": -1,
                        "awayValue": -1,
                        "compareCode": -1,
                        "statisticsType": "NO_DATA",
                        "valueType": "NO_DATA",
                        "renderType": "NO_DATA",
                    })
    return rows
