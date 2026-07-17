from curl_cffi import requests
from config import BASE_URL, HEADERS
from utils import human_sleep, burst_sleep


class SofaScoreClient:
    def __init__(self):
        self.session = requests.Session(impersonate="chrome120")
        self.session.headers.update(HEADERS)
        self.iniciar_sesion()

    def iniciar_sesion(self):
        try:
            self.session.get(f"{BASE_URL}/config/default-events", timeout=10)
            human_sleep(0.8, 1.6)
        except Exception:
            pass

    def fetch(self, url, label=""):
        for intento in range(1, 4):
            try:
                print(f"   🔎 GET {label}: {url}")
                resp = self.session.get(url, timeout=15)
                print(f"      Status: {resp.status_code}")

                if resp.status_code == 403:
                    print("      ❌ 403: bloqueo temporal. Reintentando...")
                    burst_sleep(3.0, 6.0)
                    continue
                if resp.status_code == 429:
                    print("      ⚠️ 429: muchas peticiones. Esperando...")
                    burst_sleep(8.0, 15.0)
                    continue
                if resp.status_code != 200:
                    print(f"      ⚠️ HTTP {resp.status_code}. Se guardará vacío.")
                    return {}

                data = resp.json()
                human_sleep()
                return data
            except Exception as e:
                print(f"      ⚠️ Error intento {intento}/3: {e}")
                burst_sleep()
        return {}

    def get_team_info(self, team_id):
        return self.fetch(f"{BASE_URL}/team/{team_id}", "team")

    def get_last_events(self, team_id):
        return self.fetch(f"{BASE_URL}/team/{team_id}/events/last/0", "events")

    def get_lineups(self, match_id):
        return self.fetch(f"{BASE_URL}/event/{match_id}/lineups", "lineups")

    def get_incidents(self, match_id):
        return self.fetch(f"{BASE_URL}/event/{match_id}/incidents", "incidents")

    def get_statistics(self, match_id):
        return self.fetch(f"{BASE_URL}/event/{match_id}/statistics", "statistics")

    def get_graph(self, match_id):
        return self.fetch(f"{BASE_URL}/event/{match_id}/graph", "graph")

    def get_shotmap(self, match_id):
        return self.fetch(f"{BASE_URL}/event/{match_id}/shotmap", "shotmap")

    def get_referee_info(self, referee_id):
        return self.fetch(f"{BASE_URL}/referee/{referee_id}", "referee")

    def get_referee_events(self, referee_id, page=0):
        return self.fetch(f"{BASE_URL}/referee/{referee_id}/events/last/{page}", "referee-events")
