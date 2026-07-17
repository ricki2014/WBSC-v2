import os
from config import RAW_REFEREE_DIR
from utils import ensure_dir, safe_filename, write_json, read_json, find_existing_team_folder, utc_now_iso


class RefereeDownloader:
    """Descarga los últimos partidos dirigidos por un árbitro de SofaScore.
    Solo trae event.json + incidents.json por partido (no lineups/statistics/
    graph/shotmap como el Downloader de equipos) porque lo único que se
    analiza acá es marcador + tarjetas."""

    def __init__(self, client):
        self.client = client

    def preparar_carpeta_arbitro(self, referee_id, referee_info):
        referee_name = referee_info.get("referee", {}).get("name", f"arbitro_{referee_id}") if referee_info else f"arbitro_{referee_id}"
        folder_name = f"{safe_filename(referee_name)} - {referee_id}"

        existing = find_existing_team_folder(RAW_REFEREE_DIR, referee_id)
        if existing:
            return existing, referee_name

        folder = os.path.join(RAW_REFEREE_DIR, folder_name)
        ensure_dir(folder)
        ensure_dir(os.path.join(folder, "matches"))
        return folder, referee_name

    def descargar_arbitro(self, referee_id, n_partidos):
        print(f"\n🟣 Descargando/actualizando árbitro {referee_id}...")
        referee_info = self.client.get_referee_info(referee_id)
        folder, referee_name = self.preparar_carpeta_arbitro(referee_id, referee_info)
        matches_dir = ensure_dir(os.path.join(folder, "matches"))

        write_json(os.path.join(folder, "referee.json"), referee_info)

        # SofaScore pagina de a ~30 eventos por página — se recorre hasta juntar
        # los N partidos finalizados pedidos o hasta que no haya más páginas.
        finalizados = []
        page = 0
        while len(finalizados) < n_partidos and page < 20:
            res = self.client.get_referee_events(referee_id, page)
            eventos = res.get("events", []) if isinstance(res, dict) else []
            if not eventos:
                break
            finalizados.extend([e for e in eventos if e.get("status", {}).get("type") == "finished"])
            if not res.get("hasNextPage"):
                break
            page += 1

        # OJO: dentro de una página, "events/last/{page}" NO viene ordenado
        # descendente (la página 0 trae ~ascendente, de la más vieja a la más
        # nueva) — sin este sort, finalizados[:n_partidos] agarraba los
        # partidos más VIEJOS de la ventana en vez de los más recientes.
        finalizados.sort(key=lambda e: e.get("startTimestamp") or 0, reverse=True)
        seleccionados = finalizados[:n_partidos]
        print(f"✅ Árbitro: {referee_name}")
        print(f"✅ Partidos seleccionados: {len(seleccionados)}")

        manifest_path = os.path.join(folder, "manifest.json")
        manifest = read_json(manifest_path, default={
            "referee_id": referee_id,
            "referee_name": referee_name,
            "downloaded_matches": [],
            "last_update_utc": None,
        })
        descargados = set(str(x) for x in manifest.get("downloaded_matches", []))

        for idx, evento in enumerate(seleccionados, 1):
            match_id = str(evento.get("id"))
            if not match_id:
                continue

            match_folder = ensure_dir(os.path.join(matches_dir, match_id))
            write_json(os.path.join(match_folder, "event.json"), evento)

            if match_id in descargados:
                print(f"[{idx}/{len(seleccionados)}] ✅ {match_id} ya existe. Se usa JSON local.")
                continue

            home = evento.get("homeTeam", {}).get("name", "?")
            away = evento.get("awayTeam", {}).get("name", "?")
            print(f"[{idx}/{len(seleccionados)}] ⬇️ {match_id} | {home} vs {away}")

            incidents = self.client.get_incidents(match_id)
            write_json(os.path.join(match_folder, "incidents.json"), incidents)
            descargados.add(match_id)

        manifest["referee_id"] = referee_id
        manifest["referee_name"] = referee_name
        manifest["last_update_utc"] = utc_now_iso()
        manifest["downloaded_matches"] = sorted(descargados)
        manifest["selected_matches"] = [str(e.get("id")) for e in seleccionados]
        write_json(manifest_path, manifest)

        return {
            "referee_id": referee_id,
            "referee_name": referee_name,
            "referee_folder": folder,
            "matches": seleccionados,
        }
