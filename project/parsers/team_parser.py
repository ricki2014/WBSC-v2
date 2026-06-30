import os
from utils import read_json, flatten_dict


def parse_team(team_folder):
    data = read_json(os.path.join(team_folder, "team.json"), default={})
    row = flatten_dict(data)
    return [row] if row else []
