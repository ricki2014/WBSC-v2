from args_parser import leer_argumentos
from client import SofaScoreClient
from downloader import Downloader
from excel_exporter import build_excel


def main():
    team_id, skip, n_partidos = leer_argumentos()
    print("=" * 70)
    print("🚀 SOFASCORE DOWNLOADER: JSON + EXCEL POR OBJETIVOS")
    print("=" * 70)
    print(f"TEAM_ID: {team_id}")
    print(f"SKIP: {skip}")
    print(f"N_PARTIDOS: {n_partidos}")

    client = SofaScoreClient()
    downloader = Downloader(client)
    result = downloader.descargar_equipo(team_id, n_partidos, skip=skip, refresh_last=True)

    excel_path = build_excel(
        team_id=result["team_id"],
        team_name=result["team_name"],
        team_folder=result["team_folder"],
        urls_rows=result.get("urls_rows", []),
    )

    print("\n" + "=" * 70)
    print("🎯 LISTO")
    print(f"📁 JSON: {result['team_folder']}")
    print(f"📊 Excel: {excel_path}")
    print("=" * 70)


if __name__ == "__main__":
    main()
