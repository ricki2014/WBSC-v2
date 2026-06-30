import os
from config import RAW_JSON_DIR
from utils import ensure_dir, safe_filename, write_json, read_json, find_existing_team_folder, utc_now_iso


class Downloader:
    def __init__(self, client):
        self.client = client

    def preparar_carpeta_equipo(self, team_id, team_info):
        team_name = team_info.get("team", {}).get("name", f"equipo_{team_id}") if team_info else f"equipo_{team_id}"
        team_folder_name = f"{safe_filename(team_name)} - {team_id}"

        existing = find_existing_team_folder(RAW_JSON_DIR, team_id)
        if existing:
            return existing, team_name

        folder = os.path.join(RAW_JSON_DIR, team_folder_name)
        ensure_dir(folder)
        ensure_dir(os.path.join(folder, "matches"))
        return folder, team_name

    def seleccionar_finalizados(self, events_res, n_partidos, skip):
        partidos_raw = events_res.get("events", []) if isinstance(events_res, dict) else []
        finalizados = [p for p in partidos_raw if p.get("status", {}).get("type") == "finished"]

        # SofaScore suele devolver más recientes primero o mezclado; mantenemos orden recibido y tomamos últimos N tras skip.
        if skip > 0:
            if skip >= len(finalizados):
                return []
            finalizados = finalizados[:-skip]

        return finalizados[-n_partidos:]

    def descargar_equipo(self, team_id, n_partidos, skip=0, refresh_last=True):
        print(f"\n🔵 Descargando/actualizando equipo {team_id}...")
        team_info = self.client.get_team_info(team_id)
        team_folder, team_name = self.preparar_carpeta_equipo(team_id, team_info)
        matches_dir = ensure_dir(os.path.join(team_folder, "matches"))

        write_json(os.path.join(team_folder, "team.json"), team_info)

        events_res = self.client.get_last_events(team_id)
        write_json(os.path.join(team_folder, "events.json"), events_res)

        partidos_sel = self.seleccionar_finalizados(events_res, n_partidos, skip)
        print(f"✅ Equipo: {team_name}")
        print(f"✅ Partidos seleccionados: {len(partidos_sel)}")

        manifest_path = os.path.join(team_folder, "manifest.json")
        manifest = read_json(manifest_path, default={
            "team_id": team_id,
            "team_name": team_name,
            "downloaded_matches": [],
            "last_update_utc": None,
        })
        descargados = set(str(x) for x in manifest.get("downloaded_matches", []))

        # Refrescamos el último descargado/seleccionado para completar datos recientes.
        selected_ids = [str(p.get("id")) for p in partidos_sel if p.get("id")]
        ids_to_refresh = set()
        if refresh_last and selected_ids:
            ids_to_refresh.add(selected_ids[-1])

        urls_rows = []
        for idx, evento in enumerate(partidos_sel, 1):
            match_id = str(evento.get("id"))
            if not match_id:
                continue

            match_folder = ensure_dir(os.path.join(matches_dir, match_id))
            event_path = os.path.join(match_folder, "event.json")
            write_json(event_path, evento)

            needs_download = match_id not in descargados or match_id in ids_to_refresh
            if not needs_download:
                print(f"[{idx}/{len(partidos_sel)}] ✅ {match_id} ya existe. Se usa JSON local.")
                continue

            home = evento.get("homeTeam", {}).get("name", "?")
            away = evento.get("awayTeam", {}).get("name", "?")
            print(f"\n[{idx}/{len(partidos_sel)}] ⬇️ {match_id} | {home} vs {away}")

            endpoints = {
                "lineups": self.client.get_lineups,
                "incidents": self.client.get_incidents,
                "statistics": self.client.get_statistics,
                "graph": self.client.get_graph,
                "shotmap": self.client.get_shotmap,
            }

            for name, fn in endpoints.items():
                data = fn(match_id)
                write_json(os.path.join(match_folder, f"{name}.json"), data)
                urls_rows.append({
                    "match_id": match_id,
                    "endpoint": name,
                    "file": os.path.join(match_folder, f"{name}.json"),
                })

            descargados.add(match_id)

        manifest["team_id"] = team_id
        manifest["team_name"] = team_name
        manifest["last_update_utc"] = utc_now_iso()
        manifest["downloaded_matches"] = sorted(descargados)
        manifest["selected_matches"] = selected_ids
        write_json(manifest_path, manifest)

        return {
            "team_id": team_id,
            "team_name": team_name,
            "team_folder": team_folder,
            "matches": partidos_sel,
            "urls_rows": urls_rows,
        }
