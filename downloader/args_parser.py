import sys


def parsear_id_offset(raw):
    raw = str(raw).strip()
    if "-" in raw:
        team, skip = raw.split("-", 1)
        return int(team), int(skip)
    return int(raw), 0


def leer_argumentos():
    arg1 = sys.argv[1] if len(sys.argv) > 1 else None
    arg2 = sys.argv[2] if len(sys.argv) > 2 else None

    try:
        if arg1:
            team_id, skip = parsear_id_offset(arg1)
        else:
            raw_id = input("🔵 ID del equipo. Ej: 2301 o 2301-2: ").strip()
            team_id, skip = parsear_id_offset(raw_id)

        if arg2:
            n_partidos = int(arg2)
        else:
            n_partidos = int(input("📋 ¿Cuántos partidos?: ").strip())
    except ValueError:
        print("❌ Formato inválido. Usa: 2301 12  ó  2301-2 12")
        sys.exit(1)

    return team_id, skip, n_partidos
