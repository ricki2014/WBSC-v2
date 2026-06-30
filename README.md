# WC 2026 — Analizador de Partidos

Herramienta de análisis de fútbol para el Mundial 2026. Descarga datos estadísticos desde SofaScore y los presenta en un dashboard interactivo con soporte para análisis pre-partido y registro en vivo.

---

## Estructura general

```
proyecto/
│
├── downloader/              # CLI para descargar y exportar datos desde SofaScore
│
├── data/                    # Datos procesados (Excel)
│   ├── upcoming/            # Archivos .xlsx de equipos con partido próximo (los lee la app)
│   └── partido_pasado/      # Archivos .xlsx de partidos ya jugados (archivo)
│       └── sin D T/         # Partidos sin datos de dirección técnica
│
└── project_clean_v2/
    └── project/             # Aplicación principal (backend FastAPI + frontend React)
```

---

## Módulos

### `downloader/` — Descargador de datos

CLI que consulta la API de SofaScore, guarda los datos crudos en JSON y genera archivos Excel listos para usar en la app.

**Archivos principales:**

| Archivo | Descripción |
|---|---|
| `main.py` | Punto de entrada del CLI. Lee argumentos y coordina la descarga y exportación |
| `downloader.py` | Clase `Downloader`: gestiona carpetas por equipo, selecciona partidos finalizados y descarga endpoints (lineups, incidents, statistics, graph, shotmap) |
| `client.py` | `SofaScoreClient`: wrapper HTTP que impersona la app móvil de SofaScore para evitar bloqueos |
| `excel_exporter.py` | Construye el archivo `.xlsx` multi-hoja a partir de los JSON locales |
| `args_parser.py` | Parseo de argumentos CLI (team_id, n_partidos, skip) |
| `config.py` | Rutas base del módulo |
| `utils.py` | Utilidades: manejo de carpetas, lectura/escritura de JSON, timestamps |
| `run_example.bat` | Ejemplo de ejecución rápida en Windows |
| `requirements.txt` | Dependencias Python del downloader |

**Parsers** (`downloader/parsers/`): cada módulo transforma un endpoint JSON en filas de DataFrame.

| Parser | Fuente |
|---|---|
| `statistics_parser.py` | Estadísticas del partido por período (corners, tiros, pases, faltas, xG, posesión…) |
| `lineups_parser.py` | Jugadores titulares y suplentes con estadísticas individuales |
| `incidents_parser.py` | Goles, tarjetas, cambios y marcador HT/FT |
| `shotmap_parser.py` | Disparos con coordenadas, resultado, xG y situación |
| `graph_parser.py` | Momentum (gráfico de dominio por minuto) |
| `events_parser.py` | Listado de eventos del equipo |
| `team_parser.py` | Información general del equipo |
| `common.py` | Helpers compartidos: iteración de carpetas, carga de JSON, contexto de partido |

**Hojas que genera el Excel:**

- `Partidos` — una fila por partido con stats de equipo por mitad (1T/2T/FT)
- `Goles del Equipo` — un gol por fila con jugador, minuto, asistente y tipo
- `Por Jugador x Partido` — stats individuales de cada jugador por partido
- `Arqueros x Partido` — atajadas, goles recibidos y salidas del arquero por partido
- `JUGADORES P90` — totales agregados normalizados a 90 minutos
- `Disparos Detalle` — cada disparo con xG, coordenadas, resultado y situación
- Hojas pivot raw: `GOLES EQUIPO`, `CORNERS EQUIPO`, `TARJETAS EQUIPO`, `DISPAROS EQUIPO`, `PASES EQUIPO`

**Uso:**
```bash
cd downloader
pip install -r requirements.txt
python main.py <team_id> <n_partidos>
# Ejemplo: python main.py 4819 10   (Argentina, últimos 10 partidos)
# El Excel se guarda en data/upcoming/
```

---

### `data/` — Datos procesados

Carpeta con los archivos `.xlsx` generados por el downloader.

| Subcarpeta | Contenido |
|---|---|
| `upcoming/` | Excels del equipo con su próximo partido. **La app lee desde aquí.** |
| `partido_pasado/` | Excels de equipos cuyos partidos ya se jugaron (archivo histórico) |
| `partido_pasado/sin D T/` | Partidos sin dirección técnica disponible en SofaScore |

---

### `project_clean_v2/project/` — Aplicación de análisis

Dashboard interactivo con backend en FastAPI y frontend en React + Tailwind.

#### Backend — `api.py`

Servidor FastAPI (puerto 8005) que expone los datos de los Excel al frontend.

| Endpoint | Descripción |
|---|---|
| `GET /available-files` | Lista los archivos `.xlsx` disponibles en `data/upcoming/` |
| `GET /analysis/{file1}/{file2}` | Retorna stats del equipo, rankings de jugadores, distribución de goles y goleadores para dos equipos |
| `GET /team-matches/{file}/{stat_key}` | Historial partido a partido de una estadística de equipo (goles, corners, tarjetas, etc.) |
| `GET /player-matches/{file}/{player_name}` | Historial partido a partido de un jugador específico |
| `GET /shot-distribution/{file}` | Distribución de disparos por franjas de minutos, filtrable por partido y jugador |
| `POST /get-lineups` | Obtiene la alineación confirmada o probable de un partido desde SofaScore en tiempo real |

**Uso:**
```bash
cd project_clean_v2/project
pip install -r requirements.txt
python api.py
```

#### Frontend — `src/`

SPA en React que consume el backend y permite análisis pre-partido y registro en vivo.

| Archivo / Componente | Descripción |
|---|---|
| `App.jsx` | Raíz de la app: gestiona estado global (análisis, marcador, timer, alineaciones, periodo) |
| `api.js` | Funciones para llamar al backend FastAPI |
| `components/Header.jsx` | Barra superior con nombres de equipos, marcador en vivo y cronómetro |
| `components/Tabs.jsx` | Navegación por pestañas |
| `components/FileSelector.jsx` | Selector de archivos Excel para cargar los dos equipos |
| `components/TeamBadge.jsx` | Badge con nombre e inicial del equipo |

**Pestañas (páginas):**

| Página | Pestaña | Descripción |
|---|---|---|
| `P1_Comparacion.jsx` | Comparación | Stats promedio de ambos equipos por período (1T/2T/Total): goles, corners, tarjetas, tiros, pases, faltas. Filtro por LOCAL/VISITA/Total |
| `P2_RegistroEquipo.jsx` | Registro Equipo | Registro de eventos en vivo por equipo (goles, corners, tarjetas, etc.) con cronómetro y control de período |
| `P4_EsperadoSucedido.jsx` | Esperado vs Sucedido | Compara el promedio histórico del equipo con lo que está ocurriendo en el partido actual |
| `P5_Alineaciones.jsx` | Alineaciones | Campo de fútbol con jugadores posicionados según formación táctica, cargado desde SofaScore |
| `P6_StatsJugador.jsx` | Stats Jugador | Ranking de jugadores por rol (DEF/MED/DEL/ARQ) con score ponderado y métricas p90 |
| `P3_RegistroJugadorCancha.jsx` | Registro en Cancha | Registro de eventos individuales de jugadores sobre el campo (con posición en cancha) |
| `P8_StatsEnCancha.jsx` | Stats en Cancha | Visualización de estadísticas individuales superpuestas sobre el campo |
| `P7_StatsVivoJugador.jsx` | Stats Vivo Jugador | Seguimiento de métricas de un jugador durante el partido en curso |
| `P9_DistTiros.jsx` | Distribución Tiros | Distribución de disparos por franjas de minutos, filtrable por partido y jugador |

**Uso:**
```bash
cd project_clean_v2/project
npm install
npm run dev   # http://localhost:5173
```

---

## Flujo de trabajo completo

```
1. Ejecutar downloader → genera Excel en data/upcoming/
2. Iniciar backend    → python api.py (puerto 8005)
3. Iniciar frontend   → npm run dev   (puerto 5173)
4. En el dashboard, seleccionar los dos archivos Excel de los equipos
5. Analizar estadísticas pre-partido y registrar eventos durante el juego
```
