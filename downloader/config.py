BASE_URL = "https://api.sofascore.com/api/v1"
DATA_DIR = "data"
RAW_JSON_DIR = "data/raw_json"
EXCEL_DIR = "data/excel"

HEADERS = {
    "User-Agent": "SofaScore/2023.11.14 (Linux; Android 13; SM-S918B; Build/TP1A.220624.014)",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "es-ES,es;q=0.9,en-US;q=0.8,en;q=0.7",
    "Origin": "https://www.sofascore.com",
    "Referer": "https://www.sofascore.com/",
    "X-Requested-With": "com.sofascore.results",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
}

# Nombres EXACTOS como aparecen en /statistics. Se filtran sin calcular nada.
GOLES_STATS = [
    "Expected goals", "Big chances", "Big chances scored", "Big chances missed",
    "Total shots", "Shots on target", "Shots off target", "Blocked shots",
    "Shots inside box", "Shots outside box", "Touches in penalty area",
    "Final third entries", "Final third phase", "Crosses", "Long balls",
    "Corner kicks", "Offsides", "Ball possession", "Passes",
]

DISPAROS_STATS = [
    "Expected goals", "Big chances", "Big chances scored", "Big chances missed",
    "Total shots", "Shots on target", "Shots off target", "Blocked shots",
    "Shots inside box", "Shots outside box", "Goalkeeper saves", "Total saves", "Big saves",
]

CORNERS_STATS = [
    "Corner kicks", "Crosses", "Blocked shots", "Total shots", "Shots on target",
    "Shots off target", "Shots inside box", "Shots outside box", "Touches in penalty area",
    "Final third entries", "Final third phase", "Fouled in final third", "Throw-ins",
    "Offsides", "Ball possession", "Clearances", "Interceptions", "Goalkeeper saves",
]

TARJETAS_STATS = [
    "Fouls", "Yellow cards", "Red cards", "Tackles", "Total tackles", "Tackles won",
    "Duels", "Ground duels", "Aerial duels", "Dispossessed", "Interceptions",
    "Recoveries", "Clearances", "Ball possession",
]

ARQUEROS_STATS = [
    "Goalkeeper saves", "Total saves", "Big saves", "Goal kicks", "Expected goals",
    "Shots on target", "Total shots", "Shots inside box", "Shots outside box",
    "Big chances", "Big chances scored", "Big chances missed", "Corner kicks",
]

PASES_STATS = [
    "Passes", "Accurate passes", "Ball possession", "Long balls", "Crosses",
    "Final third entries", "Final third phase", "Throw-ins", "Dispossessed",
    "Recoveries", "Interceptions", "Duels", "Ground duels", "Aerial duels",
]

# Campos crudos esperados en lineups. Si el campo no existe para nadie en el partido -> -1.
# Si existe para algunos, al jugador que no lo tenga y jugó minutos -> 0.
GOLES_LINEUPS_KEYS = [
    "goals", "goalAssist", "assists", "expectedGoals", "expectedAssists", "totalShots",
    "onTargetScoringAttempt", "shotOffTarget", "blockedScoringAttempt", "keyPass",
    "bigChanceCreated", "bigChanceMissed", "touches", "touchesInOppBox", "totalContest",
    "wonContest", "ballCarriesCount", "progressiveBallCarriesCount", "rating", "minutesPlayed",
]

DISPAROS_LINEUPS_KEYS = [
    "totalShots", "onTargetScoringAttempt", "shotOffTarget", "blockedScoringAttempt",
    "expectedGoals", "goals", "minutesPlayed", "rating",
]

TARJETAS_LINEUPS_KEYS = [
    "fouls", "totalFoulsConceded", "wasFouled", "totalTackle", "wonTackle",
    "challengeLost", "duelWon", "duelLost", "aerialWon", "aerialLost", "interceptionWon",
    "ballRecovery", "totalClearance", "possessionLostCtrl", "minutesPlayed", "rating",
]

ARQUEROS_LINEUPS_KEYS = [
    "saves", "goalKeeperSave", "savedShotsFromInsideTheBox", "goalsConceded",
    "totalKeeperSweeper", "keeperSweeper", "punches", "goodHighClaim", "highClaims",
    "totalClearance", "totalPass", "accuratePass", "totalLongBalls", "accurateLongBalls",
    "aerialWon", "errorLeadToGoal", "rating", "minutesPlayed",
]

PASES_LINEUPS_KEYS = [
    "totalPass", "accuratePass", "keyPass", "totalLongBalls", "accurateLongBalls",
    "accurateCross", "totalCross", "touches", "possessionLostCtrl", "ballCarriesCount",
    "progressiveBallCarriesCount", "rating", "minutesPlayed",
]
