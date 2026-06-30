import json
import os
import re
import time
import random
from datetime import datetime, timezone


def human_sleep(min_s=0.35, max_s=1.15):
    t = random.uniform(min_s, max_s)
    time.sleep(t)
    return t


def burst_sleep(min_s=2.0, max_s=4.5):
    t = random.uniform(min_s, max_s)
    time.sleep(t)
    return t


def safe_filename(name: str) -> str:
    name = str(name or "equipo").strip()
    name = re.sub(r'[\\/:*?"<>|]+', '-', name)
    name = re.sub(r'\s+', ' ', name).strip()
    return name[:120]


def ensure_dir(path: str):
    os.makedirs(path, exist_ok=True)
    return path


def read_json(path: str, default=None):
    if default is None:
        default = {}
    if not os.path.exists(path):
        return default
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default


def write_json(path: str, data):
    ensure_dir(os.path.dirname(path))
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def utc_now_iso():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def find_existing_team_folder(raw_json_dir: str, team_id: int):
    """Busca carpeta existente tipo 'Nombre Equipo - ID'."""
    if not os.path.isdir(raw_json_dir):
        return None
    suffix = f" - {team_id}"
    for folder in os.listdir(raw_json_dir):
        full = os.path.join(raw_json_dir, folder)
        if os.path.isdir(full) and folder.endswith(suffix):
            return full
    return None


def get_nested(d, path, default=""):
    cur = d
    for key in path:
        if not isinstance(cur, dict) or key not in cur or cur[key] is None:
            return default
        cur = cur[key]
    return cur


def flatten_dict(d, parent_key="", sep="."):
    items = {}
    if not isinstance(d, dict):
        return items
    for k, v in d.items():
        new_key = f"{parent_key}{sep}{k}" if parent_key else str(k)
        if isinstance(v, dict):
            items.update(flatten_dict(v, new_key, sep=sep))
        elif isinstance(v, list):
            # No expandimos listas enormes; se guarda tamaño para referencia cruda.
            items[f"{new_key}.__len__"] = len(v)
        else:
            items[new_key] = v
    return items


def first_existing(stats_obj: dict, keys: list):
    for key in keys:
        if isinstance(stats_obj, dict) and key in stats_obj and stats_obj[key] is not None:
            return stats_obj[key]
    return None
