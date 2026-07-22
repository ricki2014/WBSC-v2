from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
import pandas as pd
import numpy as np
import os
import re
import sys
import json
from scipy.stats import poisson
from curl_cffi import requests as requests_cffi

# En Windows, cuando el proceso arranca con stdout/stderr en cp1252 (charmap)
# en vez de UTF-8, cualquier print() con emoji (🔵, ✅, etc. — hay varios en
# downloader/) tira UnicodeEncodeError y aborta el request a mitad de camino
# (se veía como "No se pudo consultar SofaScore: 'charmap' codec can't
# encode..." aunque la consulta a SofaScore nunca fue el problema).
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXCEL_DIR = os.path.join(ROOT_DIR, "data", "upcoming")
PASADO_DIR = os.path.join(ROOT_DIR, "data", "partido_pasado")

# El downloader guarda los JSON crudos de SofaScore (graph, incidents, event...)
# acá, uno por equipo — "{TeamName} - {team_id}" — a diferencia de los excels
# que viven fuera de project/. Sirve de fuente para el gráfico de Attack Momentum.
RAW_JSON_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "raw_json")

# Igual idea que RAW_JSON_DIR pero para árbitros — una carpeta por árbitro
# ("{Nombre} - {referee_id}") con event.json + incidents.json de sus últimos
# partidos, que alimenta el análisis de tarjetas por árbitro.
RAW_REFEREE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "raw_referees")

# El downloader (downloader/) vive fuera de project/ y usa imports de script suelto
# (from config import ..., from utils import ...) — lo agregamos al path para poder
# reusarlo desde acá sin duplicar código.
DOWNLOADER_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "downloader")
if DOWNLOADER_DIR not in sys.path:
    sys.path.insert(0, DOWNLOADER_DIR)

# ─── CARGA DE EQUIPO ─────────────────────────────────────────────────────────

_EQUIPO_CACHE = {}  # filename -> (mtime, data) — evita re-leer el Excel entero en cada request

def _pivot_disparos_equipo(df_de):
    """'DISPAROS EQUIPO' viene una fila por (match_id, periodo). La pasamos a
    ancho (una fila por match_id, columnas sot_home_1T/2T/FT, sof_home_1T/2T/FT)
    para poder usar el mismo helper team_col() de get_stats()."""
    if df_de.empty or 'match_id' not in df_de.columns:
        return pd.DataFrame()

    period_map = {'1ST': '1T', '2ND': '2T', 'ALL': 'FT'}
    src_cols = {
        'Shots on target_home':  'sot_home',
        'Shots on target_away':  'sot_away',
        'Shots off target_home': 'sof_home',
        'Shots off target_away': 'sof_away',
    }
    missing = [c for c in src_cols if c not in df_de.columns]
    if missing:
        return pd.DataFrame()

    out = df_de[['match_id']].drop_duplicates().reset_index(drop=True)
    for raw_p, label in period_map.items():
        sub = df_de[df_de['periodo'] == raw_p][['match_id', *src_cols.keys()]].copy()
        sub = sub.rename(columns={src: f"{dst}_{label}" for src, dst in src_cols.items()})
        out = out.merge(sub, on='match_id', how='left')
    return out

def _fill_missing_total_shots(df_partidos):
    """SofaScore a veces no trae 'Total shots' para un partido (queda -1) pero
    sí trae 'Shots on target'/'Shots off target' — en ese caso reconstruimos
    el total como on target + off target en vez de perder el partido entero
    del promedio de Disparos."""
    if df_partidos.empty:
        return df_partidos
    for label in ('1T', '2T', 'FT'):
        for side in ('home', 'away'):
            ti_col, sot_col, sof_col = f'tiros_{side}_{label}', f'sot_{side}_{label}', f'sof_{side}_{label}'
            if ti_col not in df_partidos.columns or sot_col not in df_partidos.columns or sof_col not in df_partidos.columns:
                continue
            ti  = pd.to_numeric(df_partidos[ti_col],  errors='coerce')
            sot = pd.to_numeric(df_partidos[sot_col], errors='coerce')
            sof = pd.to_numeric(df_partidos[sof_col], errors='coerce')
            missing   = ti.isna() | (ti == -1)
            has_parts = sot.notna() & (sot != -1) & sof.notna() & (sof != -1)
            fix = missing & has_parts
            df_partidos.loc[fix, ti_col] = (sot + sof)[fix]
    return df_partidos

def cargar_equipo(filename: str):
    path = os.path.join(EXCEL_DIR, filename)
    if not os.path.exists(path):
        return None

    mtime = os.path.getmtime(path)
    cached = _EQUIPO_CACHE.get(filename)
    if cached and cached[0] == mtime:
        return cached[1]

    try:
        # "with" cierra el handle del archivo al salir — en Windows, si queda
        # abierto (como pasaba antes), el archivo se bloquea y no se puede
        # borrar ni mover después.
        with pd.ExcelFile(path) as xl:
            sheets = xl.sheet_names

            df_partidos  = pd.read_excel(xl, sheet_name='Partidos')          if 'Partidos'              in sheets else pd.DataFrame()
            df_goles     = pd.read_excel(xl, sheet_name='Goles del Equipo')  if 'Goles del Equipo'      in sheets else pd.DataFrame()
            df_jugadores = pd.read_excel(xl, sheet_name='Por Jugador x Partido') if 'Por Jugador x Partido' in sheets else pd.DataFrame()
            df_arqueros  = pd.read_excel(xl, sheet_name='Arqueros x Partido') if 'Arqueros x Partido'   in sheets else pd.DataFrame()
            df_p90       = pd.read_excel(xl, sheet_name='JUGADORES P90')     if 'JUGADORES P90'          in sheets else pd.DataFrame()
            df_disparos  = pd.read_excel(xl, sheet_name='Disparos Detalle')  if 'Disparos Detalle'       in sheets else pd.DataFrame()
            df_disp_eq   = pd.read_excel(xl, sheet_name='DISPAROS EQUIPO')   if 'DISPAROS EQUIPO'        in sheets else pd.DataFrame()
            df_tarjetas  = pd.read_excel(xl, sheet_name='Tarjetas Detalle')  if 'Tarjetas Detalle'       in sheets else pd.DataFrame()

        # "Tarjetas Detalle" es un timeline evento-a-evento (una fila por tarjeta),
        # no viene por jugador/partido como el resto de las stats — se agrega acá
        # (propias, excluyendo las del rival) y se mergea a "Por Jugador x Partido"
        # para poder calcular p90 y mostrar el historial igual que cualquier otra stat.
        if not df_tarjetas.empty and not df_jugadores.empty and \
           {'match_id', 'jugador'}.issubset(df_tarjetas.columns):
            dfc = df_tarjetas.copy()
            if 'equipo' in dfc.columns:
                dfc = dfc[dfc['equipo'] == 'Propio']
            dfc['jugador'] = dfc['jugador'].astype(str).str.strip()
            tipo = dfc['tipo'].astype(str) if 'tipo' in dfc.columns else pd.Series('', index=dfc.index)

            # La 2da amarilla que termina en expulsión llega como incidente
            # separado "Roja (doble amarilla)", junto con la 1ra "Amarilla" del
            # mismo jugador/partido — esa amarilla no debe contarse aparte, ya
            # la representa la roja (roja = doble amarilla, no amarilla + roja).
            dfc = dfc.assign(_pair=list(zip(dfc['match_id'], dfc['jugador'])))
            doble_am_pairs = set(dfc.loc[tipo == 'Roja (doble amarilla)', '_pair'])
            es_amarilla_simple = tipo == 'Amarilla'
            dfc = dfc[~(es_amarilla_simple & dfc['_pair'].isin(doble_am_pairs))]

            is_red = dfc['tipo'].astype(str).str.startswith('Roja') if 'tipo' in dfc.columns else False
            am = dfc[~is_red].groupby(['match_id', 'jugador']).size().rename('tarjetas_amarillas')
            ro = dfc[is_red].groupby(['match_id', 'jugador']).size().rename('tarjetas_rojas')
            df_jugadores = df_jugadores.merge(am, on=['match_id', 'jugador'], how='left')
            df_jugadores = df_jugadores.merge(ro, on=['match_id', 'jugador'], how='left')
            df_jugadores['tarjetas_amarillas'] = df_jugadores['tarjetas_amarillas'].fillna(0)
            df_jugadores['tarjetas_rojas']     = df_jugadores['tarjetas_rojas'].fillna(0)
            # Una roja "pesa" como 2 amarillas (equivalencia estándar en fútbol).
            df_jugadores['tarjetas_totales']   = df_jugadores['tarjetas_amarillas'] + 2 * df_jugadores['tarjetas_rojas']

        # Detectar nombre del equipo y team_id desde Partidos
        team_name = os.path.basename(path).split('_')[0]
        team_id   = None
        abr       = team_name[:3].upper()

        if not df_partidos.empty:
            if 'team_id_meta' in df_partidos.columns:
                raw_id = df_partidos['team_id_meta'].iloc[0]
                team_id = int(raw_id) if pd.notna(raw_id) else None

        # "DISPAROS EQUIPO" trae, por (match_id, periodo ALL/1ST/2ND), los tiros al
        # arco / afuera a nivel equipo (Shots on/off target) — se pivotea al mismo
        # formato ancho (sot_home_1T, etc.) que 'Partidos' para reusar get_stats().
        df_sot = _pivot_disparos_equipo(df_disp_eq)
        if not df_sot.empty and not df_partidos.empty and 'match_id' in df_partidos.columns:
            df_partidos = df_partidos.merge(df_sot, on='match_id', how='left')
            df_partidos = _fill_missing_total_shots(df_partidos)

        data = {
            'partidos':  df_partidos,
            'goles':     df_goles,
            'jugadores': df_jugadores,
            'arqueros':  df_arqueros,
            'p90':       df_p90,
            'disparos':  df_disparos,
            'tarjetas':  df_tarjetas,
            'abr':       abr,
            'team':      team_name,
            'team_id':   team_id,
        }
        data = _apply_considerar_filter(data)
        _EQUIPO_CACHE[filename] = (mtime, data)
        return data
    except Exception as e:
        print(f"Error cargando {filename}: {e}")
        return None

# ─── FILTRO POR COLUMNA 'considerar' ─────────────────────────────────────────
# La hoja 'Partidos' trae una columna 'considerar' (default 'Si', editable a
# mano en el Excel) — los partidos marcados 'No' se excluyen de raíz de todo
# análisis de ese equipo, igual que si nunca hubiesen sido descargados.
def _apply_considerar_filter(data):
    df = data.get('partidos')
    if df is None or df.empty or 'considerar' not in df.columns:
        return data
    mask_no = df['considerar'].astype(str).str.strip().str.lower().isin(['no', 'n', '0', 'false'])
    if not mask_no.any():
        return data
    ids = set(df.loc[~mask_no, 'match_id'].astype(str))
    filtered = dict(data)
    for key in ('partidos', 'goles', 'jugadores', 'arqueros', 'disparos', 'tarjetas'):
        d = data.get(key)
        if d is not None and not d.empty and 'match_id' in d.columns:
            filtered[key] = d[d['match_id'].astype(str).isin(ids)].reset_index(drop=True)
    return filtered

# ─── FILTRO POR PARTIDOS SELECCIONADOS ───────────────────────────────────────
# Permite restringir cualquier análisis a un subconjunto de partidos elegidos
# a mano (en vez de TOTAL/LOCAL/VISITA). Filtra todas las hojas que tengan
# match_id — el resto de las funciones (get_stats, rankings, goleadores, etc.)
# no necesitan saber que existe este filtro: ya reciben el data recortado.
def filter_matches_data(data, match_ids):
    if not match_ids:
        return data
    ids = set(str(m) for m in match_ids)
    filtered = dict(data)
    for key in ('partidos', 'goles', 'jugadores', 'arqueros', 'disparos', 'tarjetas'):
        df = data.get(key)
        if df is not None and not df.empty and 'match_id' in df.columns:
            filtered[key] = df[df['match_id'].astype(str).isin(ids)].reset_index(drop=True)
    return filtered

def _parse_match_ids(matches: str | None):
    if not matches:
        return None
    ids = [m.strip() for m in matches.split(',') if m.strip()]
    return ids or None

# ─── FILTRO POR CONDICIÓN (LOCAL/VISITA) ─────────────────────────────────────
# Igual idea que filter_matches_data, pero a partir de la condición (LOCAL/
# VISITA) en vez de una lista puntual de match_id — así el filtro "Solo LOCAL"
# / "Solo VISITA" elegido en Previa también recorta las hojas de detalle
# (jugadores, goles, disparos, tarjetas), no solo el promedio agregado que ya
# calculaba get_stats() por su cuenta.
def _filter_by_condicion(data, condicion):
    if not condicion or condicion == 'TOTAL':
        return data
    df = data.get('partidos')
    if df is None or df.empty or 'condicion' not in df.columns:
        return data
    ids = set(df.loc[df['condicion'] == condicion, 'match_id'].astype(str))
    filtered = dict(data)
    for key in ('partidos', 'goles', 'jugadores', 'arqueros', 'disparos', 'tarjetas'):
        d = data.get(key)
        if d is not None and not d.empty and 'match_id' in d.columns:
            filtered[key] = d[d['match_id'].astype(str).isin(ids)].reset_index(drop=True)
    return filtered

# ─── ESTADÍSTICAS DEL EQUIPO ─────────────────────────────────────────────────

def _mean(series, fallback=0.0):
    if series is None or len(series) == 0:
        return fallback
    v = pd.to_numeric(series, errors='coerce').replace(-1, np.nan).mean()
    return float(v) if not np.isnan(v) else fallback

def get_stats(data, condicion='TOTAL'):
    df = data['partidos']
    if df.empty:
        return None

    sub = df if condicion == 'TOTAL' else df[df['condicion'] == condicion]
    if sub.empty:
        return None

    res = {'P': len(sub)}

    # Detectar si el equipo es LOCAL o VISITA en cada partido
    # Usar columnas home_team/away_team + condicion
    # Si condicion == LOCAL => stats_home; si VISITA => stats_away
    def team_col(base, suffix_local='home', suffix_visita='away', periodo='FT'):
        # base: e.g. 'corners', 'tiros', 'pases', 'faltas'
        # periodo: '1T', '2T', 'FT'
        col_local  = f"{base}_home_{periodo}"
        col_visita = f"{base}_away_{periodo}"

        if col_local not in sub.columns and col_visita not in sub.columns:
            return pd.Series([np.nan]*len(sub)), pd.Series([np.nan]*len(sub))

        # Para cada fila determinamos qué columna es el equipo y cuál el rival
        favor  = pd.Series(index=sub.index, dtype=float)
        contra = pd.Series(index=sub.index, dtype=float)

        for idx, row in sub.iterrows():
            c = row.get('condicion', '')
            if c == 'LOCAL':
                favor[idx]  = row.get(col_local,  np.nan)
                contra[idx] = row.get(col_visita, np.nan)
            else:
                favor[idx]  = row.get(col_visita, np.nan)
                contra[idx] = row.get(col_local,  np.nan)

        return favor, contra

    # ── Goles ──
    def gol_favor(periodo):
        col_ht_h = 'homeScore_HT'; col_ht_a = 'awayScore_HT'
        col_ft_h = 'homeScore_FT'; col_ft_a = 'awayScore_FT'
        favor = pd.Series(index=sub.index, dtype=float)
        contra = pd.Series(index=sub.index, dtype=float)
        for idx, row in sub.iterrows():
            c = row.get('condicion', '')
            if periodo == '1T':
                hv = row.get(col_ht_h, np.nan); av = row.get(col_ht_a, np.nan)
            else:
                hv = row.get(col_ft_h, np.nan); av = row.get(col_ft_a, np.nan)
            if c == 'LOCAL':
                favor[idx] = hv; contra[idx] = av
            else:
                favor[idx] = av; contra[idx] = hv
        return favor, contra

    gf1t_f, gf1t_c = gol_favor('1T')
    gfft_f, gfft_c = gol_favor('FT')
    res['G_F_1T'] = _mean(gf1t_f)
    res['G_C_1T'] = _mean(gf1t_c)
    res['G_F_FT'] = _mean(gfft_f)
    res['G_C_FT'] = _mean(gfft_c)
    res['G_F_2T'] = max(0.0, res['G_F_FT'] - res['G_F_1T'])
    res['G_C_2T'] = max(0.0, res['G_C_FT'] - res['G_C_1T'])

    # ── Corners ──
    cf_1t, cc_1t = team_col('corners', periodo='1T')
    cf_2t, cc_2t = team_col('corners', periodo='2T')
    cf_ft, cc_ft = team_col('corners', periodo='FT')
    res['C_F_1T'] = _mean(cf_1t); res['C_C_1T'] = _mean(cc_1t)
    res['C_F_2T'] = _mean(cf_2t); res['C_C_2T'] = _mean(cc_2t)
    res['C_F_FT'] = _mean(cf_ft); res['C_C_FT'] = _mean(cc_ft)

    # ── Tarjetas amarillas ──
    def card_stat(col_home, col_away):
        favor = pd.Series(index=sub.index, dtype=float)
        contra = pd.Series(index=sub.index, dtype=float)
        for idx, row in sub.iterrows():
            c = row.get('condicion', '')
            if c == 'LOCAL':
                favor[idx]  = row.get(col_home, np.nan)
                contra[idx] = row.get(col_away, np.nan)
            else:
                favor[idx]  = row.get(col_away, np.nan)
                contra[idx] = row.get(col_home, np.nan)
        return favor, contra

    am_f_1t, am_c_1t = card_stat('Amarillas_home_1t', 'Amarillas_away_1t')
    am_f_2t, am_c_2t = card_stat('Amarillas_home_2t', 'Amarillas_away_2t')
    am_f_ft, am_c_ft = card_stat('Amarillas_home',    'Amarillas_away')
    res['AM_F_1T'] = _mean(am_f_1t); res['AM_C_1T'] = _mean(am_c_1t)
    res['AM_F_2T'] = _mean(am_f_2t); res['AM_C_2T'] = _mean(am_c_2t)
    res['AM_F_FT'] = _mean(am_f_ft); res['AM_C_FT'] = _mean(am_c_ft)

    # ── Tarjetas rojas ──
    ro_f_1t, ro_c_1t = card_stat('Rojas_home_1t', 'Rojas_away_1t')
    ro_f_2t, ro_c_2t = card_stat('Rojas_home_2t', 'Rojas_away_2t')
    ro_f_ft, ro_c_ft = card_stat('Rojas_home',    'Rojas_away')
    res['RO_F_1T'] = _mean(ro_f_1t); res['RO_C_1T'] = _mean(ro_c_1t)
    res['RO_F_2T'] = _mean(ro_f_2t); res['RO_C_2T'] = _mean(ro_c_2t)
    res['RO_F_FT'] = _mean(ro_f_ft); res['RO_C_FT'] = _mean(ro_c_ft)

    # ── Tarjetas totales ──
    res['T_F_1T'] = res['AM_F_1T'] + res['RO_F_1T']
    res['T_C_1T'] = res['AM_C_1T'] + res['RO_C_1T']
    res['T_F_2T'] = res['AM_F_2T'] + res['RO_F_2T']
    res['T_C_2T'] = res['AM_C_2T'] + res['RO_C_2T']
    res['T_F_FT'] = res['AM_F_FT'] + res['RO_F_FT']
    res['T_C_FT'] = res['AM_C_FT'] + res['RO_C_FT']

    # ── Disparos ──
    ti_f_1t, ti_c_1t = team_col('tiros', periodo='1T')
    ti_f_2t, ti_c_2t = team_col('tiros', periodo='2T')
    ti_f_ft, ti_c_ft = team_col('tiros', periodo='FT')
    res['TI_F_1T'] = _mean(ti_f_1t); res['TI_C_1T'] = _mean(ti_c_1t)
    res['TI_F_2T'] = _mean(ti_f_2t); res['TI_C_2T'] = _mean(ti_c_2t)
    res['TI_F_FT'] = _mean(ti_f_ft); res['TI_C_FT'] = _mean(ti_c_ft)

    # ── Tiros al arco (equipo, viene de "DISPAROS EQUIPO" / statistics.json) ──
    sot_f_1t, sot_c_1t = team_col('sot', periodo='1T')
    sot_f_2t, sot_c_2t = team_col('sot', periodo='2T')
    sot_f_ft, sot_c_ft = team_col('sot', periodo='FT')
    res['SOT_F_1T'] = _mean(sot_f_1t); res['SOT_C_1T'] = _mean(sot_c_1t)
    res['SOT_F_2T'] = _mean(sot_f_2t); res['SOT_C_2T'] = _mean(sot_c_2t)
    res['SOT_F_FT'] = _mean(sot_f_ft); res['SOT_C_FT'] = _mean(sot_c_ft)

    # ── Pases ──
    pa_f_1t, pa_c_1t = team_col('pases', periodo='1T')
    pa_f_2t, pa_c_2t = team_col('pases', periodo='2T')
    pa_f_ft, pa_c_ft = team_col('pases', periodo='FT')
    res['PA_F_1T'] = _mean(pa_f_1t); res['PA_C_1T'] = _mean(pa_c_1t)
    res['PA_F_2T'] = _mean(pa_f_2t); res['PA_C_2T'] = _mean(pa_c_2t)
    res['PA_F_FT'] = _mean(pa_f_ft); res['PA_C_FT'] = _mean(pa_c_ft)

    # ── Faltas ──
    fa_f_1t, fa_c_1t = team_col('faltas', periodo='1T')
    fa_f_2t, fa_c_2t = team_col('faltas', periodo='2T')
    fa_f_ft, fa_c_ft = team_col('faltas', periodo='FT')
    res['FA_F_1T'] = _mean(fa_f_1t); res['FA_C_1T'] = _mean(fa_c_1t)
    res['FA_F_2T'] = _mean(fa_f_2t); res['FA_C_2T'] = _mean(fa_c_2t)
    res['FA_F_FT'] = _mean(fa_f_ft); res['FA_C_FT'] = _mean(fa_c_ft)

    return res

# ─── RANKINGS POR JUGADOR ─────────────────────────────────────────────────────

def normalize(series):
    s_min, s_max = series.min(), series.max()
    if s_max == s_min:
        return pd.Series([5.0] * len(series), index=series.index)
    return (series - s_min) / (s_max - s_min) * 10

def normalize_inv(series):
    s_min, s_max = series.min(), series.max()
    if s_max == s_min:
        return pd.Series([5.0] * len(series), index=series.index)
    return (s_max - series) / (s_max - s_min) * 10

def get_performance_ranking(data, role='DEF'):
    # ARQ usa la hoja específica de arqueros
    if role == 'ARQ':
        return _ranking_arqueros(data)

    df_j   = data.get('jugadores', pd.DataFrame())
    df_p90 = data.get('p90', pd.DataFrame())

    if not df_j.empty:
        return _ranking_from_partidos(df_j, role)
    elif not df_p90.empty:
        return _ranking_from_p90(df_p90, role)
    return pd.DataFrame()

def _ranking_arqueros(data):
    df_a = data.get('arqueros', pd.DataFrame())
    if df_a.empty:
        return pd.DataFrame()

    agg_dict = {'minutos_jugados': 'sum', 'atajadas': 'sum', 'rating': 'mean'}
    for col in ['goles_recibidos', 'atajadas_dentro', 'salidas', 'punos']:
        if col in df_a.columns:
            agg_dict[col] = 'sum'

    agg = df_a.groupby('arquero').agg(agg_dict).reset_index()
    agg.rename(columns={'arquero': 'jugador'}, inplace=True)
    agg['minutos_jugados'] = agg['minutos_jugados'].clip(lower=90)
    m = agg['minutos_jugados'] / 90

    agg['Atajadas p90']     = (agg['atajadas'] / m).round(2)
    if 'goles_recibidos'  in agg.columns: agg['Goles Rec. p90']  = (agg['goles_recibidos']  / m).round(2)
    if 'salidas'          in agg.columns: agg['Salidas p90']      = (agg['salidas']          / m).round(2)
    if 'atajadas_dentro'  in agg.columns: agg['Ataj. Dentro p90'] = (agg['atajadas_dentro']  / m).round(2)

    cols = ['jugador', 'minutos_jugados', 'atajadas', 'Atajadas p90']
    for c in ['Goles Rec. p90', 'Ataj. Dentro p90', 'Salidas p90', 'rating']:
        if c in agg.columns:
            cols.append(c)

    return agg[cols].sort_values('Atajadas p90', ascending=False)

def _safe_p90(col, minutes_factor):
    p90 = col / minutes_factor
    mask = (minutes_factor < 1.0) & (p90 > 1.0)
    p90[mask] = p90[mask].clip(upper=1.0)
    return p90.round(2)

def _ranking_from_partidos(df_j, role):
    # Normalizar nombre: quitar espacios extra para evitar duplicados por whitespace
    df_j = df_j.copy()
    df_j['jugador'] = df_j['jugador'].astype(str).str.strip()

    # Agrupar por player_id, no por "jugador" (nombre corto): SofaScore abrevia como
    # "Inicial + Apellido", y jugadores distintos (ej. Lautaro Martínez y Lisandro
    # Martínez → ambos "L. Martínez") pueden compartir esa abreviatura. Agrupar por
    # nombre sumaría/mezclaría las stats de dos personas distintas en una sola fila.
    group_key = 'player_id' if 'player_id' in df_j.columns else 'jugador'

    # Resolver posición por jugador: tomar la más frecuente (no vacía)
    def _best_pos(series):
        # dropna() primero: si no, un jugador con 'posicion' NaN en todos sus
        # partidos pasaba el filtro de string (str(NaN) != '') pero .mode()
        # descarta los NaN por defecto, dejando una serie vacía e .iloc[0]
        # tiraba IndexError.
        s = series.dropna().astype(str).str.strip()
        s = s[s != '']
        return s.mode().iloc[0] if len(s) else ''
    pos_map = df_j.groupby(group_key)['posicion'].apply(_best_pos)

    agg_dict = {
        'minutos_jugados':  'sum',
        'goles':            'sum',
        'asistencias':      'sum',
        'tiros_totales':    'sum',
        'tiros_al_arco':    'sum',
        'pases_totales':    'sum',
        'pases_ok':         'sum',
        'pases_clave':      'sum',
        'duelos_total':     'sum',
        'duelos_ganados':   'sum',
        'intercepciones':   'sum',
        'despejes':         'sum',
        'recuperaciones':   'sum',
        'perdidas_balon':   'sum',
        'rating':           'mean',
    }
    if 'faltas_recibidas' in df_j.columns:  agg_dict['faltas_recibidas']  = 'sum'
    if 'faltas_cometidas' in df_j.columns:  agg_dict['faltas_cometidas']  = 'sum'
    if 'tarjetas_amarillas' in df_j.columns: agg_dict['tarjetas_amarillas'] = 'sum'
    if 'tarjetas_rojas'     in df_j.columns: agg_dict['tarjetas_rojas']     = 'sum'

    agg = df_j.groupby(group_key).agg(
        {k: v for k, v in agg_dict.items() if k in df_j.columns}
    ).reset_index()
    name_map = df_j.groupby(group_key)['jugador'].first()
    agg['jugador'] = agg[group_key].map(name_map)
    if 'jugador_nombre' in df_j.columns:
        nombre_map = df_j.groupby(group_key)['jugador_nombre'].first()
        agg['jugador_nombre'] = agg[group_key].map(nombre_map)
    agg['posicion'] = agg[group_key].map(pos_map).fillna('')

    agg['minutos_jugados'] = agg['minutos_jugados'].clip(lower=90)
    mt = agg['minutos_jugados'] / 90

    agg['Duelos %']     = (agg['duelos_ganados'] / agg['duelos_total'].replace(0,1) * 100).round(1)
    agg['Goles p90']    = _safe_p90(agg['goles'], mt)
    agg['Asist. p90']   = _safe_p90(agg['asistencias'], mt)
    agg['Tiros p90']    = (agg['tiros_totales'] / mt).round(2)
    agg['Al Arco p90']  = (agg['tiros_al_arco'] / mt).round(2)
    agg['Interc. p90']  = (agg['intercepciones'] / mt).round(2)
    agg['Despejes p90'] = (agg['despejes'] / mt).round(2)
    agg['Recup. p90']   = (agg['recuperaciones'] / mt).round(2)
    agg['P. Clave p90'] = (agg['pases_clave'] / mt).round(2)
    agg['Pases %']      = (agg['pases_ok'] / agg['pases_totales'].replace(0,1) * 100).round(1)
    agg['Tiros Arco %'] = (agg['tiros_al_arco'] / agg['tiros_totales'].replace(0,1) * 100).round(1)
    agg['Perdidas p90'] = (agg['perdidas_balon'] / mt).round(2) if 'perdidas_balon' in agg.columns else 0.0
    agg['Faltas Rec. p90'] = (agg['faltas_recibidas'] / mt).round(2) if 'faltas_recibidas' in agg.columns else 0.0
    agg['Faltas Com. p90'] = (agg['faltas_cometidas'] / mt).round(2) if 'faltas_cometidas' in agg.columns else 0.0
    agg['Tarjetas Am. p90']  = (agg['tarjetas_amarillas'] / mt).round(2) if 'tarjetas_amarillas' in agg.columns else 0.0
    agg['Tarjetas Roja p90'] = (agg['tarjetas_rojas']     / mt).round(2) if 'tarjetas_rojas'     in agg.columns else 0.0
    # Una roja "pesa" como 2 amarillas (equivalencia estándar en fútbol).
    agg['Tarjetas Tot. p90'] = (agg['Tarjetas Am. p90'] + 2 * agg['Tarjetas Roja p90']).round(2)

    return _apply_role(agg, role, df_j)

def _ranking_from_p90(df_p90, role):
    # Renombrar columnas del p90 pre-calculado al formato estándar
    rename = {
        'player_short_name': 'jugador',
        'interc_p90': 'Interc. p90', 'despejes_p90': 'Despejes p90',
        'recup_p90': 'Recup. p90', 'pases_clave_p90': 'P. Clave p90',
        'goles_p90': 'Goles p90', 'asist_p90': 'Asist. p90',
        'tiros_p90': 'Tiros p90', 'tiros_arco_p90': 'Al Arco p90',
        'perdidas_p90': 'Perdidas p90', 'faltas_rec_p90': 'Faltas Rec. p90',
        'faltas_com_p90': 'Faltas Com. p90', 'duelos_pct': 'Duelos %',
        'pases_pct': 'Pases %', 'precision_tiro': 'Tiros Arco %',
    }
    agg = df_p90.rename(columns=rename)
    if 'jugador' not in agg.columns and 'player_short_name' in df_p90.columns:
        agg['jugador'] = df_p90['player_short_name']
    return _apply_role(agg, role, None)

def _apply_role(agg, role, df_j_raw):
    if role == 'DEF':
        agg = agg[agg['minutos_jugados'] >= 90].copy()
        if agg.empty: return pd.DataFrame()
        agg['Score'] = (
            normalize(agg['Duelos %'])     * 0.30 +
            normalize(agg['Interc. p90'])  * 0.25 +
            normalize(agg['Despejes p90']) * 0.25 +
            normalize(agg['Recup. p90'])   * 0.20
        ) * 0.75 + normalize_inv(agg['Perdidas p90']) * 0.25
        agg['Score'] = agg['Score'].round(2)
        cols = ['jugador','player_id','posicion','minutos_jugados','Duelos %','Interc. p90','Despejes p90','Recup. p90','Perdidas p90','Faltas Com. p90','Faltas Rec. p90','Tarjetas Am. p90','Tarjetas Roja p90','Tarjetas Tot. p90','Score']

    elif role == 'MED':
        agg = agg[agg['minutos_jugados'] >= 90].copy()
        if agg.empty: return pd.DataFrame()
        agg['Score'] = (
            normalize(agg['P. Clave p90']) * 0.35 +
            normalize(agg['Pases %'])      * 0.30 +
            normalize(agg['Recup. p90'])   * 0.20 +
            normalize(agg['Duelos %'])     * 0.15
        ) * 0.80 + normalize_inv(agg['Perdidas p90']) * 0.20
        agg['Score'] = agg['Score'].round(2)
        cols = ['jugador','player_id','posicion','minutos_jugados','P. Clave p90','Pases %','Recup. p90','Perdidas p90','Faltas Com. p90','Faltas Rec. p90','Tarjetas Am. p90','Tarjetas Roja p90','Tarjetas Tot. p90','Score']

    elif role == 'DEL':
        agg = agg[(agg.get('goles', agg.get('Goles p90', pd.Series([0]*len(agg)))) > 0) |
                  (agg.get('asistencias', agg.get('Asist. p90', pd.Series([0]*len(agg)))) > 0) |
                  (agg['posicion'] == 'F')].copy()
        if agg.empty: return pd.DataFrame()
        agg['Score'] = (
            normalize(agg['Goles p90'])    * 0.45 +
            normalize(agg['Asist. p90'])   * 0.30 +
            normalize(agg['Tiros Arco %']) * 0.15 +
            normalize(agg['Duelos %'])     * 0.10
        ).round(2)
        cols = ['jugador','player_id','posicion','minutos_jugados','Goles p90','Asist. p90','Tiros Arco %','Duelos %','Faltas Rec. p90','Tarjetas Am. p90','Tarjetas Roja p90','Tarjetas Tot. p90','Score']
        avail = [c for c in cols if c in agg.columns]
        return agg[avail].sort_values('Score', ascending=False)

    elif role == 'SHO':
        agg = agg[agg.get('tiros_totales', agg.get('Tiros p90', pd.Series([0]*len(agg)))) > 0].copy()
        if agg.empty: return pd.DataFrame()
        cols = ['jugador','player_id','posicion','minutos_jugados','Tiros p90','Al Arco p90','Tiros Arco %']
        avail = [c for c in cols if c in agg.columns]
        return agg[avail].sort_values('Tiros p90', ascending=False)

    else:
        cols = ['jugador','player_id','posicion','minutos_jugados','Goles p90','Asist. p90','Score']

    avail = [c for c in cols if c in agg.columns]
    return agg[avail].sort_values('Score', ascending=False) if 'Score' in agg.columns else agg[avail]

# ─── DISTRIBUCIÓN DE GOLES ───────────────────────────────────────────────────

def goal_distribution(data):
    df_g = data.get('goles', pd.DataFrame())
    if df_g.empty or 'minuto' not in df_g.columns:
        return []
    labels = ['0-10','11-20','21-30','31-40','41-50','51-60','61-70','71-80','81-90','90+']
    def clean_min(m):
        try:
            nums = re.findall(r'(\d+)', str(m))
            return int(nums[0]) if nums else 0
        except: return 0
    df_g = df_g.copy()
    df_g['min_clean'] = df_g['minuto'].apply(clean_min)
    df_g['bin'] = df_g['min_clean'].apply(lambda x: min((x-1)//10 if x>0 else 0, 9))
    result = []
    col_jugador = 'gol_jugador' if 'gol_jugador' in df_g.columns else 'jugador'
    for i, lbl in enumerate(labels):
        chunk = df_g[df_g['bin'] == i]
        result.append({
            'label': lbl,
            'count': int(len(chunk)),
            'players': [str(p) for p in chunk[col_jugador].fillna('').tolist()],
        })
    return result

# ─── GOLEADORES ──────────────────────────────────────────────────────────────

def get_scorers(data):
    df_g = data.get('goles', pd.DataFrame())
    if df_g.empty:
        return []
    col = 'gol_jugador' if 'gol_jugador' in df_g.columns else ('jugador' if 'jugador' in df_g.columns else None)
    if not col:
        return []
    sc = df_g.groupby(col).size().reset_index(name='Goles')
    sc.columns = ['Jugador', 'Goles']
    records = sc.sort_values('Goles', ascending=False).to_dict(orient='records')
    return [{'Jugador': str(r['Jugador']), 'Goles': int(r['Goles'])} for r in records]

# ─── SOFASCORE LINEUPS ───────────────────────────────────────────────────────

def fetch_starters_api(url_input=None, team_id=None, use_last=False):
    headers = {
        "User-Agent": "SofaScore/2023.11.14 (Linux; Android 13; SM-S918B; Build/TP1A.220624.014)",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "es-ES,es;q=0.9,en-US;q=0.8,en;q=0.7",
        "Origin": "https://www.sofascore.com",
        "Referer": "https://www.sofascore.com/",
        "X-Requested-With": "com.sofascore.results",
    }
    session = requests_cffi.Session(impersonate="chrome120")
    session.headers.update(headers)
    match_id = None

    if url_input:
        if 'sofascore.com' in url_input:
            m = re.search(r'#id:(\d+)', url_input) or re.search(r'/([0-9]+)/?$', url_input.rstrip('/'))
            match_id = m.group(1) if m else None
        else:
            match_id = url_input
    elif team_id and use_last:
        # "Descargar actual" = SOLO el partido en vivo ahora mismo. Sin fallback a
        # events/last (terminados) porque eso trae partidos viejos, no el actual.
        try:
            live = session.get("https://api.sofascore.com/api/v1/sport/football/events/live", timeout=10).json()
            for e in live.get('events', []):
                if str(e.get('homeTeam', {}).get('id')) == str(team_id) or str(e.get('awayTeam', {}).get('id')) == str(team_id):
                    match_id = e.get('id')
                    break
        except: pass
    elif team_id:
        try:
            ev = session.get(f"https://api.sofascore.com/api/v1/team/{team_id}/events/next/0", timeout=10).json()
            events = ev.get('events', [])
            if events: match_id = events[0]['id']
        except: pass

    if not match_id:
        return None

    debug = []

    home_name, away_name = "", ""
    try:
        det_r = session.get(f"https://api.sofascore.com/api/v1/event/{match_id}", timeout=10)
        print(f"   [fetch_starters_api] GET /event/{match_id} -> {det_r.status_code}")
        debug.append(f"event: {det_r.status_code}")
        det = det_r.json()
        if 'event' in det:
            home_name = det['event']['homeTeam']['name']
            away_name = det['event']['awayTeam']['name']
    except Exception as e:
        print(f"   [fetch_starters_api] GET /event/{match_id} FAILED: {e}")
        debug.append(f"event: error {e}")

    res = {'home': [], 'away': [], 'home_name': home_name, 'away_name': away_name, 'match_id': match_id, 'debug': debug}
    for endpoint in ["lineups", "expected-lineups"]:
        try:
            r = session.get(f"https://api.sofascore.com/api/v1/event/{match_id}/{endpoint}", timeout=10)
            print(f"   [fetch_starters_api] GET /event/{match_id}/{endpoint} -> {r.status_code}")
            debug.append(f"{endpoint}: {r.status_code}")
            if r.status_code == 200:
                d = r.json()
                main_data = d.get('expected', d)
                for side in ['home', 'away']:
                    if side in main_data:
                        formation = main_data[side].get('formation', '')
                        players = main_data[side].get('players', main_data[side].get('lineup', []))
                        _POS = {'goalkeeper':'G','defender':'D','midfielder':'M','forward':'F'}
                        def _num(p):
                            raw = (p.get('shirtNumber') or p.get('jerseyNumber') or
                                   p.get('player',{}).get('shirtNumber') or
                                   p.get('player',{}).get('jerseyNumber'))
                            try: return int(raw)
                            except: return None
                        def _pos(p):
                            # p['position'] = posición táctica en ESTE partido; player.position = posición habitual/de club.
                            # Priorizamos la del partido porque puede diferir (ej. mediocampista jugando de central).
                            raw = (p.get('position') or p.get('player', {}).get('position', '') or '')
                            return _POS.get(raw.lower(), raw[:1].upper() if raw else 'M')
                        res[side] = [{
                            'id':           p.get('player', {}).get('id'),
                            'name':         p.get('player', {}).get('name', ''),
                            'shortName':    p.get('player', {}).get('shortName') or p.get('player', {}).get('name', ''),
                            'number':       _num(p),
                            'position':     _pos(p),
                            'isSubstitute': p.get('substitute', False),
                            'lineupOrder':  i,
                        } for i, p in enumerate(players)]
                        res[f'{side}_formation'] = formation
                if res['home'] or res['away']:
                    break
        except Exception as e:
            print(f"   [fetch_starters_api] GET /event/{match_id}/{endpoint} FAILED: {e}")
            debug.append(f"{endpoint}: error {e}")
            continue

    return res

# ─── ENDPOINTS ───────────────────────────────────────────────────────────────

@app.get("/available-files")
async def get_available_files():
    if not os.path.exists(EXCEL_DIR):
        return {"files": []}
    files = sorted([f for f in os.listdir(EXCEL_DIR) if f.endswith('.xlsx')])
    return {"files": files}

@app.delete("/available-files/{filename}")
async def delete_file(filename: str):
    if os.path.basename(filename) != filename or not filename.endswith('.xlsx'):
        raise HTTPException(status_code=400, detail="Nombre de archivo inválido")
    path = os.path.join(EXCEL_DIR, filename)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Archivo no encontrado")
    os.remove(path)
    return {"deleted": filename}

@app.post("/available-files/{filename}/move-to-past")
async def move_to_past(filename: str):
    if os.path.basename(filename) != filename or not filename.endswith('.xlsx'):
        raise HTTPException(status_code=400, detail="Nombre de archivo inválido")
    src = os.path.join(EXCEL_DIR, filename)
    if not os.path.exists(src):
        raise HTTPException(status_code=404, detail="Archivo no encontrado")
    os.makedirs(PASADO_DIR, exist_ok=True)
    dst = os.path.join(PASADO_DIR, filename)
    if os.path.exists(dst):
        raise HTTPException(status_code=409, detail=f"Ya existe {filename} en partido_pasado")
    os.replace(src, dst)
    return {"moved": filename}

class DownloadRequest(BaseModel):
    team_id: int
    n_partidos: int = 10
    skip: int = 0

@app.post("/download-team")
def download_team(req: DownloadRequest):
    """Descarga los últimos partidos de un equipo desde SofaScore y genera
    su Excel en data/upcoming/, listo para aparecer en /available-files."""
    from client import SofaScoreClient
    from downloader import Downloader
    from excel_exporter import build_excel

    try:
        client = SofaScoreClient()
        dl = Downloader(client)
        result = dl.descargar_equipo(req.team_id, req.n_partidos, skip=req.skip, refresh_last=True)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"No se pudo consultar SofaScore: {e}")

    if not result.get("matches"):
        raise HTTPException(status_code=404, detail="No se encontraron partidos finalizados para ese ID de equipo")

    try:
        excel_path = build_excel(
            team_id=result["team_id"],
            team_name=result["team_name"],
            team_folder=result["team_folder"],
            urls_rows=result.get("urls_rows", []),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generando el Excel: {e}")

    return {
        "team_id": result["team_id"],
        "team_name": result["team_name"],
        "matches_found": len(result["matches"]),
        "file": os.path.basename(excel_path),
    }

@app.get("/analysis/{file1}/{file2}")
async def full_analysis(file1: str, file2: str, cond1: str = 'TOTAL', cond2: str = 'TOTAL',
                         matches1: str = None, matches2: str = None):
    d1 = cargar_equipo(file1)
    d2 = cargar_equipo(file2)
    if not d1 or not d2:
        raise HTTPException(status_code=404, detail="Archivo(s) no encontrado(s)")

    # "Solo partidos seleccionados" pisa cond1/cond2: se filtran las hojas a
    # esos match_id y se calcula todo (stats, rankings, goleadores, etc.) como TOTAL.
    ids1 = _parse_match_ids(matches1)
    ids2 = _parse_match_ids(matches2)
    if ids1:
        d1, cond1 = filter_matches_data(d1, ids1), 'TOTAL'
    elif cond1 in ('LOCAL', 'VISITA'):
        d1 = _filter_by_condicion(d1, cond1)
    if ids2:
        d2, cond2 = filter_matches_data(d2, ids2), 'TOTAL'
    elif cond2 in ('LOCAL', 'VISITA'):
        d2 = _filter_by_condicion(d2, cond2)

    # d1/d2 ya vienen recortados por condición/selección de arriba — se usan
    # tal cual para rankings/goleadores/distribución de goles, así el filtro
    # de Previa (LOCAL/VISITA/Seleccionados) queda reflejado en TODA la app
    # (Stats x Jugador, Momentum de goles, etc.), no solo en las fichas.
    s1 = get_stats(d1, cond1)
    s2 = get_stats(d2, cond2)

    def to_py(v):
        """Convierte cualquier tipo numpy a tipo Python nativo."""
        if v is None:
            return None
        if isinstance(v, (np.integer,)):
            return int(v)
        if isinstance(v, (np.floating,)):
            if np.isnan(v) or np.isinf(v):
                return 0.0
            return float(v)
        if isinstance(v, (np.bool_,)):
            return bool(v)
        if isinstance(v, float) and (np.isnan(v) or np.isinf(v)):
            return 0.0
        return v

    def clean_stats(s):
        return {k: to_py(v) for k, v in s.items()} if s else None

    def df_to_records(df):
        if df is None or df.empty:
            return []
        df = df.replace([np.inf, -np.inf], 0).fillna(0)
        records = df.to_dict(orient='records')
        return [{k: to_py(v) for k, v in row.items()} for row in records]

    team_id_1 = to_py(d1['team_id'])
    team_id_2 = to_py(d2['team_id'])

    return {
        "team1": {"name": d1['team'], "team_id": team_id_1, "stats": clean_stats(s1)},
        "team2": {"name": d2['team'], "team_id": team_id_2, "stats": clean_stats(s2)},
        "rankings": {
            "team1": {role: df_to_records(get_performance_ranking(d1, role)) for role in ['DEF','MED','DEL','SHO','ARQ']},
            "team2": {role: df_to_records(get_performance_ranking(d2, role)) for role in ['DEF','MED','DEL','SHO','ARQ']},
        },
        "goals_dist": {
            "team1": goal_distribution(d1),
            "team2": goal_distribution(d2),
        },
        "scorers": {
            "team1": get_scorers(d1),
            "team2": get_scorers(d2),
        },
    }

# ─── HISTORIAL DE EQUIPO POR PARTIDO (para P4) ───────────────────────────────

# Tuplas (col_home, col_away) por stat_key y período
_TEAM_COLS = {
    'G_F':  {'1T': ('homeScore_HT',    'awayScore_HT'),
              'FT': ('homeScore_FT',    'awayScore_FT')},
    'C_F':  {'1T': ('corners_home_1T', 'corners_away_1T'),
              '2T': ('corners_home_2T', 'corners_away_2T'),
              'FT': ('corners_home_FT', 'corners_away_FT')},
    'AM_F': {'1T': ('Amarillas_home_1t','Amarillas_away_1t'),
              '2T': ('Amarillas_home_2t','Amarillas_away_2t'),
              'FT': ('Amarillas_home',   'Amarillas_away')},
    'RO_F': {'1T': ('Rojas_home_1t',   'Rojas_away_1t'),
              '2T': ('Rojas_home_2t',   'Rojas_away_2t'),
              'FT': ('Rojas_home',      'Rojas_away')},
    'TI_F': {'1T': ('tiros_home_1T',   'tiros_away_1T'),
              '2T': ('tiros_home_2T',   'tiros_away_2T'),
              'FT': ('tiros_home_FT',   'tiros_away_FT')},
    'SOT_F': {'1T': ('sot_home_1T',    'sot_away_1T'),
              '2T': ('sot_home_2T',    'sot_away_2T'),
              'FT': ('sot_home_FT',    'sot_away_FT')},
    'PA_F': {'1T': ('pases_home_1T',   'pases_away_1T'),
              '2T': ('pases_home_2T',   'pases_away_2T'),
              'FT': ('pases_home_FT',   'pases_away_FT')},
    'FA_F': {'1T': ('faltas_home_1T',  'faltas_away_1T'),
              '2T': ('faltas_home_2T',  'faltas_away_2T'),
              'FT': ('faltas_home_FT',  'faltas_away_FT')},
    'FA_C': {'1T': ('faltas_home_1T',  'faltas_away_1T'),
              '2T': ('faltas_home_2T',  'faltas_away_2T'),
              'FT': ('faltas_home_FT',  'faltas_away_FT')},
}

@app.get("/team-match-list/{file}")
async def get_team_match_list(file: str):
    """Lista liviana de los partidos de un equipo, para el selector de
    'Solo partidos seleccionados' (P1_Comparacion)."""
    data = cargar_equipo(file)
    if not data:
        raise HTTPException(status_code=404, detail="Archivo no encontrado")

    df = data.get('partidos', pd.DataFrame())
    if df.empty or 'match_id' not in df.columns:
        return {"matches": []}

    def _n(v):
        try: return int(v) if pd.notna(v) else None
        except Exception: return None

    out = []
    for _, row in df.iterrows():
        hf, af = _n(row.get('homeScore_FT')), _n(row.get('awayScore_FT'))
        out.append({
            'match_id':  str(row.get('match_id')),
            'fecha':     str(row.get('fecha'))[:10] if pd.notna(row.get('fecha')) else '',
            'partido':   str(row.get('partido', '')),
            'rival':     str(row.get('rival', '')),
            'condicion': str(row.get('condicion', '')),
            'resultado': f"{hf}-{af}" if hf is not None and af is not None else '?',
        })
    out.sort(key=lambda r: r['fecha'] or '0000-00-00')
    return {"matches": out}

@app.get("/team-matches/{file}/{stat_key}")
async def get_team_matches(file: str, stat_key: str, matches: str = None, cond: str = 'TOTAL'):
    data = cargar_equipo(file)
    if not data:
        raise HTTPException(status_code=404, detail="Archivo no encontrado")
    ids = _parse_match_ids(matches)
    if ids:
        data = filter_matches_data(data, ids)
    elif cond in ('LOCAL', 'VISITA'):
        data = _filter_by_condicion(data, cond)

    df = data.get('partidos', pd.DataFrame())
    if df.empty:
        return {"matches": []}

    def to_py(v):
        if v is None: return None
        if isinstance(v, (np.integer,)): return int(v)
        if isinstance(v, (np.floating,)):
            return None if (np.isnan(v) or np.isinf(v)) else float(v)
        if isinstance(v, (np.bool_,)): return bool(v)
        if isinstance(v, float) and (np.isnan(v) or np.isinf(v)): return None
        import datetime
        if isinstance(v, (datetime.date, datetime.datetime, pd.Timestamp)):
            return str(v)[:10]
        return v

    cols_map = _TEAM_COLS.get(stat_key, {})
    # FA_C es "recibidas" → equipo y rival se invierten respecto a FA_F
    is_received = stat_key == 'FA_C'

    records = []
    for _, row in df.iterrows():
        is_local = str(row.get('condicion', '')).upper() == 'LOCAL'

        def get_val(col_home, col_away):
            h = row.get(col_home, None); a = row.get(col_away, None)
            if is_received:
                team_v = a if is_local else h
                rival_v = h if is_local else a
            else:
                team_v = h if is_local else a
                rival_v = a if is_local else h
            try: team_v = float(team_v) if team_v is not None and str(team_v) not in ('', 'nan') else None
            except: team_v = None
            try: rival_v = float(rival_v) if rival_v is not None and str(rival_v) not in ('', 'nan') else None
            except: rival_v = None
            return team_v, rival_v

        # Rival name
        rival = None
        for rk in ['rival','opponent','oponente','home_team','away_team','rival_name']:
            v = row.get(rk)
            if v and str(v) not in ('','nan','None','-1'):
                rival = str(v); break
        if not rival:
            # Intentar deducir de home/away si hay columnas
            if is_local:
                rival = str(row.get('away_team', row.get('equipo_visitante', '?')))
            else:
                rival = str(row.get('home_team', row.get('equipo_local', '?')))

        # Fecha
        fecha = None
        for fk in ['fecha','date','match_date','Fecha']:
            v = row.get(fk)
            if v is not None and str(v) not in ('','nan','None','0'):
                fecha = str(v)[:10]; break

        # Marcadores desde perspectiva del equipo
        ht_pair = cols_map.get('1T', ('homeScore_HT','awayScore_HT'))
        ft_pair = ('homeScore_FT','awayScore_FT')
        ht_team = row.get('homeScore_HT' if is_local else 'awayScore_HT')
        ht_riv  = row.get('awayScore_HT' if is_local else 'homeScore_HT')
        ft_team = row.get('homeScore_FT' if is_local else 'awayScore_FT')
        ft_riv  = row.get('awayScore_FT' if is_local else 'homeScore_FT')

        def _n(v):
            try: return int(float(v)) if v is not None and str(v) not in ('nan','') else None
            except: return None

        # Stat por período
        def stat_for(period):
            p = cols_map.get(period)
            if not p: return None, None
            tv, rv = get_val(p[0], p[1])
            return tv, rv

        s1t, r1t = stat_for('1T')
        s2t, r2t = stat_for('2T')
        sft, rft = stat_for('FT')
        # Para goles, 2T = FT - 1T
        if stat_key == 'G_F' and s1t is not None and sft is not None:
            s2t = sft - s1t
        if stat_key == 'G_F' and r1t is not None and rft is not None:
            r2t = rft - r1t

        rec = {
            'fecha': fecha,
            'rival': rival,
            'lv': 'L' if is_local else 'V',
            'ht': f"{_n(ht_team) if _n(ht_team) is not None else '?'} - {_n(ht_riv) if _n(ht_riv) is not None else '?'}",
            'ft': f"{_n(ft_team) if _n(ft_team) is not None else '?'} - {_n(ft_riv) if _n(ft_riv) is not None else '?'}",
            'stat_1T': to_py(s1t),
            'stat_2T': to_py(s2t),
            'stat_FT': to_py(sft),
            'rival_1T': to_py(r1t),
            'rival_2T': to_py(r2t),
            'rival_FT': to_py(rft),
        }
        records.append({k: to_py(v) if not isinstance(v, str) else v for k, v in rec.items()})

    records.sort(key=lambda r: r.get('fecha') or '0000-00-00')
    return {"matches": records}


# ─── HISTORIAL DE JUGADOR POR PARTIDO ────────────────────────────────────────

STAT_COL_MAP = {
    'Goles p90':       'goles',
    'Asist. p90':      'asistencias',
    'Tiros p90':       'tiros_totales',
    'Al Arco p90':     'tiros_al_arco',
    'Faltas Com. p90': 'faltas_cometidas',
    'Faltas Rec. p90': 'faltas_recibidas',
    'P. Clave p90':    'pases_clave',
    'Recup. p90':      'recuperaciones',
    'Interc. p90':     'intercepciones',
    'Duelos %':        'duelos_ganados',
    'Tarjetas Am. p90':  'tarjetas_amarillas',
    'Tarjetas Roja p90': 'tarjetas_rojas',
    'Tarjetas Tot. p90': 'tarjetas_totales',
}

@app.get("/player-matches/{file}/{player_name}")
async def get_player_matches(file: str, player_name: str, stat_key: str = '', player_id: int | None = None,
                              matches: str = None, cond: str = 'TOTAL'):
    data = cargar_equipo(file)
    if not data:
        raise HTTPException(status_code=404, detail="Archivo no encontrado")
    ids = _parse_match_ids(matches)
    if ids:
        data = filter_matches_data(data, ids)
    elif cond in ('LOCAL', 'VISITA'):
        data = _filter_by_condicion(data, cond)

    df_j = data.get('jugadores', pd.DataFrame())
    df_p = data.get('partidos', pd.DataFrame())

    def to_py(v):
        if v is None: return None
        if isinstance(v, (np.integer,)): return int(v)
        if isinstance(v, (np.floating,)):
            return None if (np.isnan(v) or np.isinf(v)) else float(v)
        if isinstance(v, (np.bool_,)): return bool(v)
        if isinstance(v, float) and (np.isnan(v) or np.isinf(v)): return None
        import datetime
        if isinstance(v, (datetime.date, datetime.datetime, pd.Timestamp)):
            return str(v)[:10]
        return v

    if df_j.empty:
        return {"matches": [], "stat_col": None}

    df_j = df_j.copy()

    # Si tenemos player_id (SofaScore) usamos match exacto e inequívoco: el nombre
    # corto ("jugador") solo trae inicial + apellido, y dos jugadores distintos
    # (ej. Lautaro Martínez y Lisandro Martínez) pueden compartir esa abreviatura
    # ("L. Martínez"), lo que mezclaría el historial de ambos en una sola tabla.
    if player_id is not None and 'player_id' in df_j.columns:
        player_rows = df_j[df_j['player_id'] == player_id]
        if player_rows.empty:
            return {"matches": [], "stat_col": None}
    else:
        # Fallback por nombre (tokens) para casos sin player_id disponible
        pn = player_name.lower()
        tokens = [t for t in pn.split() if len(t) >= 3]

        def score_row(name):
            nl = name.lower()
            if pn in nl or nl in pn: return 10
            matched = sum(1 for t in tokens if t in nl)
            return matched

        df_j['_score'] = df_j['jugador'].apply(lambda n: score_row(str(n)))
        best = df_j['_score'].max()
        if best == 0:
            return {"matches": [], "stat_col": None}

        player_rows = df_j[df_j['_score'] == best].drop(columns=['_score'])

    # Columna de la stat seleccionada
    stat_col = STAT_COL_MAP.get(stat_key)
    if stat_col and stat_col not in player_rows.columns:
        stat_col = None

    # Columnas de marcador — buscamos en df_jugadores primero, luego df_partidos
    score_cols = ['homeScore_HT','awayScore_HT','homeScore_FT','awayScore_FT','condicion']
    date_cols  = ['fecha','date','match_date','partido_id']
    rival_cols = ['rival','opponent','oponente']

    # Intentar unir con df_partidos si hay columna de join
    join_key = None
    for k in ['partido_id','fecha','match_id','date']:
        if k in player_rows.columns and not df_p.empty and k in df_p.columns:
            join_key = k; break

    if join_key and not df_p.empty:
        needed = [join_key] + [c for c in score_cols + rival_cols + date_cols if c in df_p.columns and c not in player_rows.columns]
        player_rows = player_rows.merge(df_p[list(set(needed))], on=join_key, how='left')

    # Columnas a devolver
    keep = []
    for c in date_cols + rival_cols + ['condicion','minutos_jugados']:
        if c in player_rows.columns: keep.append(c)
    for c in score_cols:
        if c in player_rows.columns: keep.append(c)
    if stat_col: keep.append(stat_col)
    if 'duelos_total' in player_rows.columns and stat_col == 'duelos_ganados':
        keep.append('duelos_total')
    # Añadir stat extras útiles
    for c in ['rating','goles','asistencias','tiros_al_arco']:
        if c in player_rows.columns and c not in keep: keep.append(c)

    keep = list(dict.fromkeys(keep))  # dedup preserving order
    out_df = player_rows[[c for c in keep if c in player_rows.columns]]
    out_df = out_df.fillna(0)

    records = out_df.to_dict(orient='records')
    records = [{k: to_py(v) for k, v in row.items()} for row in records]

    return {"matches": records, "stat_col": stat_col, "player": player_name}


class LineupRequest(BaseModel):
    url: str | None = None
    team_id: str | None = None
    last: bool = False

@app.post("/get-lineups")
async def get_lineups(req: LineupRequest):
    result = fetch_starters_api(url_input=req.url, team_id=req.team_id, use_last=req.last)
    if not result:
        raise HTTPException(status_code=404, detail="No se encontraron alineaciones")
    return result

# ─── ESTADO EN VIVO (sync automático desde SofaScore) ────────────────────────

def _live_period(status):
    desc = str(status.get('description', '')).lower()
    stype = status.get('type', '')
    if stype == 'finished':
        return 'FT'
    if 'halftime' in desc or 'first' in desc or '1st' in desc:
        return '1T'
    if 'second' in desc or '2nd' in desc:
        return '2T'
    return '1T'

@app.get("/live-status/{match_id}")
def get_live_status(match_id: str):
    session = requests_cffi.Session(impersonate="chrome120")
    session.headers.update({
        "User-Agent": "SofaScore/2023.11.14 (Linux; Android 13; SM-S918B; Build/TP1A.220624.014)",
        "Accept": "application/json, text/plain, */*",
        "Origin": "https://www.sofascore.com",
        "Referer": "https://www.sofascore.com/",
        "X-Requested-With": "com.sofascore.results",
    })

    try:
        ev = session.get(f"https://api.sofascore.com/api/v1/event/{match_id}", timeout=10).json()["event"]
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"No se pudo obtener el partido: {e}")

    score = {"home": ev.get("homeScore", {}).get("current", 0), "away": ev.get("awayScore", {}).get("current", 0)}
    period = _live_period(ev.get("status", {}))

    # ── Stats de equipo ──
    STAT_MAP = {
        "Corners": "Corner kicks", "Disparos": "Total shots", "TiroAlArco": "Shots on target",
        "Pases": "Passes",
    }
    team_stats = {"home": {}, "away": {}}
    try:
        st = session.get(f"https://api.sofascore.com/api/v1/event/{match_id}/statistics", timeout=10).json()
        all_block = next((b for b in st.get("statistics", []) if b.get("period") == "ALL"), None)
        items = {}
        if all_block:
            for group in all_block.get("groups", []):
                for item in group.get("statisticsItems", []):
                    items[item.get("name")] = item
        for field, sofa_name in STAT_MAP.items():
            it = items.get(sofa_name, {})
            team_stats["home"][field] = it.get("homeValue", 0) or 0
            team_stats["away"][field] = it.get("awayValue", 0) or 0
        fouls = items.get("Fouls", {})
        team_stats["home"]["FoulCometido"] = fouls.get("homeValue", 0) or 0
        team_stats["away"]["FoulCometido"] = fouls.get("awayValue", 0) or 0
        team_stats["home"]["FoulRecibido"] = fouls.get("awayValue", 0) or 0
        team_stats["away"]["FoulRecibido"] = fouls.get("homeValue", 0) or 0
    except Exception:
        pass
    team_stats["home"]["Goles"] = score["home"]
    team_stats["away"]["Goles"] = score["away"]

    # ── Tarjetas y sustituciones (equipo y jugador) desde incidents ──
    player_stats = {}
    substitutions = []
    team_stats["home"]["Tarjetas"] = 0; team_stats["home"]["Rojas"] = 0
    team_stats["away"]["Tarjetas"] = 0; team_stats["away"]["Rojas"] = 0
    try:
        inc = session.get(f"https://api.sofascore.com/api/v1/event/{match_id}/incidents", timeout=10).json()
        for i in inc.get("incidents", []):
            if i.get("incidentType") == "card":
                pid = str(i.get("player", {}).get("id", ""))
                if not pid:
                    # Tarjeta a un no-jugador (DT/cuerpo técnico en el área
                    # técnica) — SofaScore la manda sin "player" asociado.
                    # No debe sumar a los conteos de equipo ni de jugador.
                    continue
                side = "home" if i.get("isHome") else "away"
                klass = i.get("incidentClass")
                field = "Amarilla" if klass == "yellow" else "Roja"
                if klass == "yellow":
                    team_stats[side]["Tarjetas"] += 1
                else:
                    team_stats[side]["Rojas"] += 1
                player_stats.setdefault(pid, {})
                player_stats[pid][field] = player_stats[pid].get(field, 0) + 1
            elif i.get("incidentType") == "substitution":
                p_in = i.get("playerIn", {}) or {}
                p_out = i.get("playerOut", {}) or {}
                substitutions.append({
                    "is_home":     i.get("isHome"),
                    "out_id":      p_out.get("id"),
                    "in_id":       p_in.get("id"),
                    "in_name":     p_in.get("name", ""),
                    "in_shortName":p_in.get("shortName") or p_in.get("name", ""),
                    "in_position": p_in.get("position", ""),
                    "in_number":   p_in.get("jerseyNumber"),
                    "minute":      i.get("time"),
                })
    except Exception:
        pass

    # ── Stats por jugador desde lineups ──
    PLAYER_MAP = {"goals": "Gol", "totalShots": "Disparo", "onTargetScoringAttempt": "TiroArco",
                  "fouls": "FoulCom", "wasFouled": "FoulRec"}
    try:
        lu = session.get(f"https://api.sofascore.com/api/v1/event/{match_id}/lineups", timeout=10).json()
        for side in ["home", "away"]:
            for p in lu.get(side, {}).get("players", []):
                pid = str(p.get("player", {}).get("id", ""))
                if not pid:
                    continue
                stats = p.get("statistics", {}) or {}
                for sofa_key, field in PLAYER_MAP.items():
                    v = stats.get(sofa_key)
                    if v:
                        player_stats.setdefault(pid, {})
                        player_stats[pid][field] = int(v)
    except Exception:
        pass

    return {"score": score, "period": period, "team_stats": team_stats, "player_stats": player_stats,
            "substitutions": substitutions}

# ─── PUSH A LA WEB (SofaScore está bloqueado desde Render — todo lo que le habla
# a SofaScore se hace en la PC local, y esto publica el resultado para que la web
# deployada lo sirva sin necesitar su propio acceso a SofaScore) ─────────────────

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LIVE_STATE_PATH = os.path.join(REPO_ROOT, "data", "live_state.json")

class LiveStateSnapshot(BaseModel):
    lineupData: dict | None = None
    manualPos: list | None = None
    baseSwapped: bool | None = None
    score: dict | None = None
    period: str | None = None
    liveStats: dict | None = None
    playerEvents: dict | None = None
    team1Name: str | None = None
    team2Name: str | None = None

@app.get("/live-state")
def get_shared_live_state():
    if not os.path.exists(LIVE_STATE_PATH):
        raise HTTPException(status_code=404, detail="No hay estado publicado todavía")
    with open(LIVE_STATE_PATH, "r", encoding="utf-8") as f:
        return json.load(f)

@app.post("/push-web-update")
def push_web_update(snapshot: LiveStateSnapshot):
    # Escritura directa, SIN git — el frontend le pega directo a la URL de Render
    # (no a localhost), así que esto queda visible al instante para cualquiera que
    # entre a la web, sin esperar un commit+build+deploy (eso tarda minutos y es
    # inútil para algo "en vivo"). El botón push.bat sigue existiendo aparte para
    # cuando sí quieras subir código/Excel nuevos a GitHub.
    import datetime as _dt

    now_utc_iso = _dt.datetime.utcnow().isoformat()

    # Contador simple: sube 1 en cada publicación, en vez de mostrar la hora.
    prev_number = 0
    if os.path.exists(LIVE_STATE_PATH):
        try:
            with open(LIVE_STATE_PATH, "r", encoding="utf-8") as f:
                prev_number = json.load(f).get("update_number", 0)
        except Exception:
            prev_number = 0

    payload = snapshot.dict()
    payload["updated_at"] = now_utc_iso
    payload["update_number"] = prev_number + 1
    os.makedirs(os.path.dirname(LIVE_STATE_PATH), exist_ok=True)
    with open(LIVE_STATE_PATH, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    return {
        "pushed": True,
        "committed": True,
        "updated_at": now_utc_iso,
        "update_number": payload["update_number"],
        "manual_pos_count": len(payload.get("manualPos") or []),
    }

# ─── SYNC DE EXCELS A LA WEB (directo, sin git) ─────────────────────────────
# Mismo espíritu que push-web-update: el frontend le manda los excels locales
# directo a la URL pública de Render, sin pasar por git/build/deploy. Como el
# disco de Render es efímero, cada sync manda el estado COMPLETO de upcoming/
# y pasado/ (no un diff) y el otro lado reemplaza su carpeta para que coincida
# exactamente — así un archivo borrado o movido localmente también desaparece
# del lado publicado.

def _list_xlsx(dir_path: str):
    if not os.path.exists(dir_path):
        return []
    return sorted([f for f in os.listdir(dir_path) if f.endswith('.xlsx')])

@app.get("/data-files/{folder}")
async def list_data_files(folder: str):
    if folder not in ("upcoming", "pasado"):
        raise HTTPException(status_code=400, detail="folder debe ser 'upcoming' o 'pasado'")
    dir_path = EXCEL_DIR if folder == "upcoming" else PASADO_DIR
    return {"files": _list_xlsx(dir_path)}

@app.get("/data-files/{folder}/{filename}/download")
async def download_data_file(folder: str, filename: str):
    if folder not in ("upcoming", "pasado"):
        raise HTTPException(status_code=400, detail="folder debe ser 'upcoming' o 'pasado'")
    if os.path.basename(filename) != filename or not filename.endswith('.xlsx'):
        raise HTTPException(status_code=400, detail="Nombre de archivo inválido")
    dir_path = EXCEL_DIR if folder == "upcoming" else PASADO_DIR
    path = os.path.join(dir_path, filename)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Archivo no encontrado")
    return FileResponse(path, filename=filename)

@app.post("/receive-data-sync")
async def receive_data_sync(
    upcoming: list[UploadFile] = File(default=[]),
    pasado: list[UploadFile] = File(default=[]),
):
    async def replace_folder(dir_path: str, files: list[UploadFile]):
        os.makedirs(dir_path, exist_ok=True)
        keep = set()
        for f in files:
            name = os.path.basename(f.filename or "")
            if not name.endswith('.xlsx'):
                continue
            keep.add(name)
            content = await f.read()
            with open(os.path.join(dir_path, name), "wb") as out:
                out.write(content)
        removed = []
        for existing in _list_xlsx(dir_path):
            if existing not in keep:
                os.remove(os.path.join(dir_path, existing))
                removed.append(existing)
        return sorted(keep), removed

    up_kept, up_removed = await replace_folder(EXCEL_DIR, upcoming)
    past_kept, past_removed = await replace_folder(PASADO_DIR, pasado)
    return {
        "upcoming": {"kept": up_kept, "removed": up_removed},
        "pasado": {"kept": past_kept, "removed": past_removed},
    }

# ─── DISTRIBUCIÓN DE TIROS ───────────────────────────────────────────────────

@app.get("/shot-distribution/{file}")
async def get_shot_distribution(file: str, match_id: str = None, bin_size: int = 10, player_name: str = None,
                                 matches: str = None, cond: str = 'TOTAL', scoreline: str = None, normalized: bool = False):
    data = cargar_equipo(file)
    if not data:
        raise HTTPException(status_code=404, detail="Archivo no encontrado")
    ids = _parse_match_ids(matches)
    if ids:
        data = filter_matches_data(data, ids)
    elif cond in ('LOCAL', 'VISITA'):
        data = _filter_by_condicion(data, cond)

    df = data.get('disparos', pd.DataFrame())
    if df.empty:
        return {"matches": [], "distribution": []}

    def clean_min(m):
        try:
            nums = re.findall(r'(\d+)', str(m))
            return int(nums[0]) if nums else 0
        except:
            return 0

    # Lista de partidos disponibles para el filtro
    matches_list = []
    if 'match_id' in df.columns and 'partido' in df.columns:
        for _, row in df[['match_id', 'partido', 'condicion', 'rival']].drop_duplicates('match_id').iterrows():
            matches_list.append({
                'match_id': str(row.get('match_id', '')),
                'partido':  str(row.get('partido', '')),
                'condicion':str(row.get('condicion', '')),
                'rival':    str(row.get('rival', '')),
            })

    # Filtrar por partido si se pide
    df_f = df.copy()
    if match_id and match_id != 'all' and 'match_id' in df_f.columns:
        df_f = df_f[df_f['match_id'].astype(str) == str(match_id)]

    # Filtrar por jugador si se pide
    if player_name:
        # Detectar columna de jugador por coincidencia parcial en el nombre de columna
        player_col = next(
            (c for c in df_f.columns
             if any(kw in c.lower() for kw in ('jugador', 'nombre', 'player', 'name'))),
            None
        )
        if player_col:
            pn = player_name.lower().strip()
            pn_tokens = [t for t in pn.split() if len(t) > 3]
            def _match_player(n):
                # Filas sin jugador (dato faltante, p. ej. roja a un director
                # técnico) no deben "matchear" a nadie — str(NaN) da el texto
                # literal "nan", que por coincidencia es substring de nombres
                # como "Fernando" y les atribuía tarjetas/tiros ajenos.
                if pd.isna(n) or not str(n).strip():
                    return False
                nl = str(n).lower().strip()
                if pn in nl or nl in pn:
                    return True
                if pn_tokens and any(t in nl for t in pn_tokens):
                    return True
                return False
            df_f = df_f[df_f[player_col].apply(_match_player)]

    df_f['min_clean'] = df_f['minuto'].apply(clean_min) if 'minuto' in df_f.columns else 0

    # Toggle "Normalizado": en vez de tramos de N minutos, devuelve tiros
    # cada 90' REALMENTE jugados en cada estado (ganando/empate/perdiendo) —
    # así un equipo que casi nunca gana no queda "artificialmente limpio" en
    # Ganando solo por tener pocos minutos ahí. Corta acá, no pasa por bins.
    if normalized:
        df_partidos = data.get('partidos', pd.DataFrame())
        all_match_ids = df_partidos['match_id'].astype(str).unique().tolist() if not df_partidos.empty else []
        if match_id and match_id != 'all':
            all_match_ids = [m for m in all_match_ids if m == str(match_id)]
        states, n_reliable = _build_normalized_states(df_f, data.get('team_id'), all_match_ids)
        return {"matches": matches_list, "normalized": True, "n_matches_reliable": n_reliable, "states": states}

    # Filtro ganando/empate/perdiendo: cruza cada tiro (match_id + minuto)
    # contra el marcador de ESE partido en ESE instante (raw_json).
    df_f = _apply_scoreline_filter(df_f, data.get('team_id'), scoreline)

    num_regular = 90 // bin_size
    df_f['bin'] = df_f['min_clean'].apply(lambda x: min((x - 1) // bin_size if x > 0 else 0, num_regular))

    labels = []
    for i in range(num_regular):
        start = 0 if i == 0 else i * bin_size + 1
        end = (i + 1) * bin_size
        labels.append(f'{start}-{end}')
    labels.append('90+')

    distribution = []
    for i, lbl in enumerate(labels):
        chunk = df_f[df_f['bin'] == i]
        by_result = {}
        if 'resultado' in chunk.columns:
            for res, cnt in chunk.groupby('resultado').size().items():
                by_result[str(res)] = int(cnt)
        distribution.append({
            'label':     lbl,
            'count':     int(len(chunk)),
            'by_result': by_result,
        })

    return {"matches": matches_list, "distribution": distribution}


@app.get("/card-distribution/{file}")
async def get_card_distribution(file: str, match_id: str = None, bin_size: int = 10, player_name: str = None,
                                 side: str = 'Propio', matches: str = None, cond: str = 'TOTAL', scoreline: str = None,
                                 normalized: bool = False):
    """Igual que /shot-distribution pero sobre la hoja 'Tarjetas Detalle' —
    agrupa por 'tipo' (Amarilla/Roja) en vez de 'resultado'. `side` filtra
    Propio/Rival/Ambas (por defecto Propio, igual que Disparos Detalle, que
    ya viene pre-filtrada a los tiros del equipo dueño del Excel)."""
    data = cargar_equipo(file)
    if not data:
        raise HTTPException(status_code=404, detail="Archivo no encontrado")
    ids = _parse_match_ids(matches)
    if ids:
        data = filter_matches_data(data, ids)
    elif cond in ('LOCAL', 'VISITA'):
        data = _filter_by_condicion(data, cond)

    df = data.get('tarjetas', pd.DataFrame())
    if df.empty:
        return {"matches": [], "distribution": []}

    def clean_min(m):
        try:
            nums = re.findall(r'(\d+)', str(m))
            return int(nums[0]) if nums else 0
        except:
            return 0

    # Lista de partidos disponibles para el filtro
    matches_list = []
    if 'match_id' in df.columns and 'partido' in df.columns:
        for _, row in df[['match_id', 'partido', 'condicion', 'rival']].drop_duplicates('match_id').iterrows():
            matches_list.append({
                'match_id': str(row.get('match_id', '')),
                'partido':  str(row.get('partido', '')),
                'condicion':str(row.get('condicion', '')),
                'rival':    str(row.get('rival', '')),
            })

    df_f = df.copy()
    if side and side.lower() != 'ambas' and 'equipo' in df_f.columns:
        df_f = df_f[df_f['equipo'].str.lower() == side.lower()]

    if match_id and match_id != 'all' and 'match_id' in df_f.columns:
        df_f = df_f[df_f['match_id'].astype(str) == str(match_id)]

    if player_name:
        player_col = 'jugador' if 'jugador' in df_f.columns else None
        if player_col:
            pn = player_name.lower().strip()
            pn_tokens = [t for t in pn.split() if len(t) > 3]
            def _match_player(n):
                # Filas sin jugador (dato faltante, p. ej. roja a un director
                # técnico) no deben "matchear" a nadie — str(NaN) da el texto
                # literal "nan", que por coincidencia es substring de nombres
                # como "Fernando" y les atribuía tarjetas/tiros ajenos.
                if pd.isna(n) or not str(n).strip():
                    return False
                nl = str(n).lower().strip()
                if pn in nl or nl in pn:
                    return True
                if pn_tokens and any(t in nl for t in pn_tokens):
                    return True
                return False
            df_f = df_f[df_f[player_col].apply(_match_player)]

    df_f['min_clean'] = df_f['minuto'].apply(clean_min) if 'minuto' in df_f.columns else 0

    # Toggle "Normalizado": en vez de tramos de N minutos, devuelve tarjetas
    # cada 90' REALMENTE jugados en cada estado (ganando/empate/perdiendo) —
    # así un equipo que casi nunca gana no queda "artificialmente limpio" en
    # Ganando solo por tener pocos minutos ahí. Corta acá, no pasa por bins.
    if normalized:
        df_partidos = data.get('partidos', pd.DataFrame())
        all_match_ids = df_partidos['match_id'].astype(str).unique().tolist() if not df_partidos.empty else []
        if match_id and match_id != 'all':
            all_match_ids = [m for m in all_match_ids if m == str(match_id)]
        states, n_reliable = _build_normalized_states(df_f, data.get('team_id'), all_match_ids)
        return {"matches": matches_list, "normalized": True, "n_matches_reliable": n_reliable, "states": states}

    # Filtro ganando/empate/perdiendo: cruza cada tarjeta (match_id + minuto)
    # contra el marcador de ESE partido en ESE instante (raw_json).
    df_f = _apply_scoreline_filter(df_f, data.get('team_id'), scoreline)

    num_regular = 90 // bin_size
    df_f['bin'] = df_f['min_clean'].apply(lambda x: min((x - 1) // bin_size if x > 0 else 0, num_regular))

    labels = []
    for i in range(num_regular):
        start = 0 if i == 0 else i * bin_size + 1
        end = (i + 1) * bin_size
        labels.append(f'{start}-{end}')
    labels.append('90+')

    distribution = []
    for i, lbl in enumerate(labels):
        chunk = df_f[df_f['bin'] == i]
        by_result = {}
        if 'tipo' in chunk.columns:
            for res, cnt in chunk.groupby('tipo').size().items():
                by_result[str(res)] = int(cnt)
        distribution.append({
            'label':     lbl,
            'count':     int(len(chunk)),
            'by_result': by_result,
        })

    return {"matches": matches_list, "distribution": distribution}


# ─── ATTACK MOMENTUM (desde raw_json descargado) ─────────────────────────────
# Réplica del gráfico "Attack Momentum" de SofaScore (graphPoints de
# /event/{id}/graph): barras verdes hacia arriba = presión del local,
# barras hacia abajo = presión de la visita, con goles/tarjetas marcados.

def _read_raw_json(path):
    if not os.path.exists(path):
        return {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}

def _find_team_raw_folder(team_id):
    if not team_id or not os.path.isdir(RAW_JSON_DIR):
        return None
    suffix = f" - {team_id}"
    for name in os.listdir(RAW_JSON_DIR):
        if name.endswith(suffix) and os.path.isdir(os.path.join(RAW_JSON_DIR, name)):
            return os.path.join(RAW_JSON_DIR, name)
    return None

@app.get("/momentum-matches/{team_id}")
async def get_momentum_matches(team_id: int):
    """Lista los partidos de un equipo que tienen graph.json descargado
    (raw_json/), para elegir cuál ver en el gráfico de Attack Momentum."""
    folder = _find_team_raw_folder(team_id)
    if not folder:
        return {"matches": []}

    matches_dir = os.path.join(folder, "matches")
    if not os.path.isdir(matches_dir):
        return {"matches": []}

    out = []
    for match_id in os.listdir(matches_dir):
        match_folder = os.path.join(matches_dir, match_id)
        if not os.path.isfile(os.path.join(match_folder, "graph.json")):
            continue
        event = _read_raw_json(os.path.join(match_folder, "event.json"))
        if not event:
            continue
        home = event.get("homeTeam", {}) or {}
        away = event.get("awayTeam", {}) or {}
        ts = event.get("startTimestamp")
        import datetime as _dt
        fecha = _dt.datetime.utcfromtimestamp(ts).strftime('%Y-%m-%d') if ts else None
        out.append({
            "match_id":   match_id,
            "fecha":      fecha,
            "home_id":    home.get("id"),
            "home_name":  home.get("name", "?"),
            "away_id":    away.get("id"),
            "away_name":  away.get("name", "?"),
            "home_score": (event.get("homeScore") or {}).get("current"),
            "away_score": (event.get("awayScore") or {}).get("current"),
            "tournament": (event.get("tournament") or {}).get("name", ""),
        })
    out.sort(key=lambda r: r["fecha"] or "0000-00-00", reverse=True)
    return {"matches": out}

@app.get("/momentum/{team_id}/{match_id}")
async def get_momentum(team_id: int, match_id: str):
    folder = _find_team_raw_folder(team_id)
    if not folder:
        raise HTTPException(status_code=404, detail="Equipo sin datos raw_json")

    match_folder = os.path.join(folder, "matches", match_id)
    graph = _read_raw_json(os.path.join(match_folder, "graph.json"))
    if not graph or not graph.get("graphPoints"):
        raise HTTPException(status_code=404, detail="Sin datos de Attack Momentum para este partido")

    event = _read_raw_json(os.path.join(match_folder, "event.json"))
    incidents_raw = _read_raw_json(os.path.join(match_folder, "incidents.json")).get("incidents", [])

    home = event.get("homeTeam", {}) or {}
    away = event.get("awayTeam", {}) or {}

    incidents = []
    for inc in incidents_raw:
        itype = inc.get("incidentType")
        if itype == "goal":
            incidents.append({
                "type":      "goal",
                "isHome":    bool(inc.get("isHome")),
                "time":      inc.get("time"),
                "addedTime": inc.get("addedTime"),
            })
        elif itype == "card":
            klass = inc.get("incidentClass")  # yellow | red | yellowRed
            incidents.append({
                "type":      "card",
                "cardType":  klass,
                "isHome":    bool(inc.get("isHome")),
                "time":      inc.get("time"),
                "addedTime": inc.get("addedTime"),
            })

    return {
        "graphPoints":    graph.get("graphPoints", []),
        "periodTime":     graph.get("periodTime", 45),
        "overtimeLength": graph.get("overtimeLength", 15),
        "periodCount":    graph.get("periodCount", 2),
        "homeTeam": {
            "id": home.get("id"), "name": home.get("name", "?"),
            "colors": home.get("teamColors", {}),
        },
        "awayTeam": {
            "id": away.get("id"), "name": away.get("name", "?"),
            "colors": away.get("teamColors", {}),
        },
        "homeScore": (event.get("homeScore") or {}).get("current"),
        "awayScore": (event.get("awayScore") or {}).get("current"),
        "incidents": incidents,
    }


# ─── SCORELINE POR TRAMO (ganando/empate/perdiendo, desde raw_json) ──────────
# Una fila horizontal por partido: para cada tramo de N minutos, en qué estado
# pasó la MAYOR PARTE del tiempo el equipo (ponderado por minutos), a partir
# de las incidencias de gol (que traen el score acumulado en cada una).

def _team_side_in_event(event, team_id):
    home = event.get("homeTeam", {}) or {}
    away = event.get("awayTeam", {}) or {}
    if str(home.get("id")) == str(team_id):
        return "home"
    if str(away.get("id")) == str(team_id):
        return "away"
    return None

def _scoreline_state(diff):
    if diff > 0:
        return "win"
    if diff < 0:
        return "loss"
    return "draw"

def _goal_breakpoints(event, incidents_raw, team_id):
    """Momentos (minuto real, diff de gol acumulado desde la perspectiva de
    `team_id`) en que cambia la diferencia de gol — arranca en (0.0, 0).
    Reusado tanto para el estado por TRAMO (scoreline-timeline) como para el
    estado en un minuto EXACTO (filtro ganando/empate/perdiendo de tiros y
    tarjetas)."""
    side = _team_side_in_event(event, team_id)
    if not side:
        return None

    goals = []
    for inc in incidents_raw:
        if not isinstance(inc, dict) or inc.get("incidentType") != "goal":
            continue
        minute = inc.get("time")
        hs, as_ = inc.get("homeScore"), inc.get("awayScore")
        if minute is None or hs is None or as_ is None:
            continue
        added = inc.get("addedTime") or 0
        order_minute = float(minute) + float(added) / 1000.0
        diff = (hs - as_) if side == "home" else (as_ - hs)
        goals.append((order_minute, diff))
    goals.sort(key=lambda g: g[0])

    return [(0.0, 0)] + goals

def _scoreline_state_at_minute(event, incidents_raw, team_id, minute):
    """Estado (win/draw/loss) de `team_id` justo antes/en `minute` — para
    saber si un tiro o una tarjeta ocurrió con el equipo ganando, empatando
    o perdiendo en ESE instante (no por tramo)."""
    breakpoints = _goal_breakpoints(event, incidents_raw, team_id)
    if breakpoints is None:
        return None
    cur_diff = 0
    for bp_minute, diff in breakpoints:
        if bp_minute > minute:
            break
        cur_diff = diff
    return _scoreline_state(cur_diff)

def _incidents_goals_reliable(event, incidents_raw, team_id):
    """Algunos partidos (ligas menores, sobre todo) traen incidents.json con
    goles faltantes — el diff que se arma con las incidencias no llega al
    marcador final real del evento. En ese caso NO se puede confiar en el
    estado ganando/empate/perdiendo minuto a minuto (los tramos después del
    último gol registrado quedarían mal clasificados), así que el partido se
    excluye del filtro en vez de arriesgar una clasificación incorrecta."""
    breakpoints = _goal_breakpoints(event, incidents_raw, team_id)
    if breakpoints is None:
        return False
    side = _team_side_in_event(event, team_id)
    home_final = (event.get("homeScore") or {}).get("current")
    away_final = (event.get("awayScore") or {}).get("current")
    if home_final is None or away_final is None:
        return False
    real_diff = (home_final - away_final) if side == "home" else (away_final - home_final)
    return breakpoints[-1][1] == real_diff

def _apply_scoreline_filter(df_f, team_id, scoreline, minute_col='min_clean'):
    """Filtra un DataFrame de tiros/tarjetas (con columnas match_id + minute_col)
    a las filas donde `team_id` estaba ganando/empatando/perdiendo en ESE
    instante, cruzando contra el raw_json del partido (event+incidents). Un
    partido sin raw_json descargado, o con incidents.json incompleto (goles
    faltantes — ver _incidents_goals_reliable), no tiene forma confiable de
    saber su estado, así que sus filas se excluyen en vez de asumir algo."""
    if not scoreline or scoreline.lower() in ('todas', 'todos'):
        return df_f
    target = {'ganando': 'win', 'empate': 'draw', 'perdiendo': 'loss'}.get(scoreline.lower())
    if not target or df_f.empty or 'match_id' not in df_f.columns:
        return df_f.iloc[0:0]

    folder = _find_team_raw_folder(team_id)
    if not folder:
        return df_f.iloc[0:0]

    cache = {}
    def match_state(match_id, minute):
        mid = str(match_id)
        if mid not in cache:
            match_folder = os.path.join(folder, "matches", mid)
            event = _read_raw_json(os.path.join(match_folder, "event.json"))
            incidents = _read_raw_json(os.path.join(match_folder, "incidents.json")).get("incidents", [])
            reliable = bool(event) and _incidents_goals_reliable(event, incidents, team_id)
            cache[mid] = (event, incidents, reliable)
        event, incidents, reliable = cache[mid]
        if not event or not reliable:
            return None
        return _scoreline_state_at_minute(event, incidents, team_id, minute)

    mask = df_f.apply(lambda r: match_state(r['match_id'], r.get(minute_col, 0)) == target, axis=1)
    return df_f[mask]

def _minutes_by_state(team_id, match_ids):
    """Minutos totales (0-90) que `team_id` pasó ganando/empatando/perdiendo,
    sumados sobre `match_ids` — para "normalizar" tarjetas/tiros por cuánto
    tiempo estuvo REALMENTE en cada estado, en vez de comparar totales crudos
    (un equipo que casi nunca gana no debería verse artificialmente "limpio"
    en Ganando solo porque casi no tuvo minutos en ese estado). Partidos sin
    raw_json confiable (ver _incidents_goals_reliable) no aportan minutos a
    NINGÚN estado — mismo criterio que _apply_scoreline_filter."""
    totals = {"win": 0.0, "draw": 0.0, "loss": 0.0}
    n_reliable = 0
    folder = _find_team_raw_folder(team_id)
    if not folder:
        return totals, n_reliable
    for match_id in match_ids:
        match_folder = os.path.join(folder, "matches", str(match_id))
        event = _read_raw_json(os.path.join(match_folder, "event.json"))
        if not event:
            continue
        incidents = _read_raw_json(os.path.join(match_folder, "incidents.json")).get("incidents", [])
        if not _incidents_goals_reliable(event, incidents, team_id):
            continue
        breakpoints = _goal_breakpoints(event, incidents, team_id)
        n_reliable += 1
        for i, (seg_start, diff) in enumerate(breakpoints):
            seg_end = breakpoints[i + 1][0] if i + 1 < len(breakpoints) else 90.0
            seg_end = min(seg_end, 90.0)
            if seg_end <= seg_start:
                continue
            totals[_scoreline_state(diff)] += (seg_end - seg_start)
    return totals, n_reliable

def _build_normalized_states(df_f, team_id, match_ids):
    """Para el toggle "Normalizado": en vez de conteo crudo por ganando/
    empate/perdiendo (sesgado por cuánto juega el equipo en cada estado),
    devuelve tarjetas/tiros cada 90' REALMENTE jugados en cada estado."""
    minutes, n_reliable = _minutes_by_state(team_id, match_ids)
    states = []
    for key, label in (('win', 'Ganando'), ('draw', 'Empate'), ('loss', 'Perdiendo')):
        sub = _apply_scoreline_filter(df_f, team_id, label)
        count = len(sub)
        mins = minutes.get(key, 0.0)
        rate = round(count / mins * 90, 2) if mins > 0 else None
        states.append({
            'state':      label,
            'count':      int(count),
            'minutes':    round(mins, 1),
            'rate_per_90': rate,
        })
    return states, n_reliable

def _build_scoreline_segments(event, incidents_raw, team_id, bin_size=10):
    breakpoints = _goal_breakpoints(event, incidents_raw, team_id)
    if breakpoints is None:
        return None
    final_diff = breakpoints[-1][1]

    def weighted_state(seg_start, seg_end):
        totals = {"win": 0.0, "draw": 0.0, "loss": 0.0}
        cur_diff, cur_t = 0, seg_start
        for minute, diff in breakpoints:
            if minute <= seg_start:
                cur_diff = diff
                continue
            if minute >= seg_end:
                break
            totals[_scoreline_state(cur_diff)] += (minute - cur_t)
            cur_t, cur_diff = minute, diff
        totals[_scoreline_state(cur_diff)] += (seg_end - cur_t)
        return max(totals, key=totals.get)

    num_regular = 90 // bin_size
    segments = []
    for i in range(num_regular):
        start = 0 if i == 0 else i * bin_size + 1
        end = (i + 1) * bin_size
        segments.append({"label": f"{start}-{end}", "state": weighted_state(i * bin_size, end)})
    segments.append({"label": "90+", "state": _scoreline_state(final_diff)})
    return segments

@app.get("/scoreline-timeline/{team_id}")
async def get_scoreline_timeline(team_id: int, bin_size: int = 10, matches: str = None):
    """Estado (ganando/empate/perdiendo) por tramo de `bin_size` minutos, para
    todos los partidos de `team_id` que tengan incidents.json + event.json en
    raw_json/ — una fila por partido, pensada para dibujar barras horizontales
    apiladas por color (verde/plomo/rojo) por cada tramo."""
    folder = _find_team_raw_folder(team_id)
    if not folder:
        return {"matches": []}

    matches_dir = os.path.join(folder, "matches")
    if not os.path.isdir(matches_dir):
        return {"matches": []}

    ids_filter = _parse_match_ids(matches)

    out = []
    for match_id in os.listdir(matches_dir):
        if ids_filter and match_id not in ids_filter:
            continue
        match_folder = os.path.join(matches_dir, match_id)
        event = _read_raw_json(os.path.join(match_folder, "event.json"))
        incidents = _read_raw_json(os.path.join(match_folder, "incidents.json"))
        if not event or not incidents:
            continue
        incidents_raw = incidents.get("incidents", []) if isinstance(incidents, dict) else incidents
        segments = _build_scoreline_segments(event, incidents_raw, team_id, bin_size)
        if segments is None:
            continue

        home = event.get("homeTeam", {}) or {}
        away = event.get("awayTeam", {}) or {}
        side = _team_side_in_event(event, team_id)
        rival = away.get("name", "?") if side == "home" else home.get("name", "?")
        own_score   = (event.get("homeScore") or {}).get("current") if side == "home" else (event.get("awayScore") or {}).get("current")
        rival_score = (event.get("awayScore") or {}).get("current") if side == "home" else (event.get("homeScore") or {}).get("current")

        ts = event.get("startTimestamp")
        import datetime as _dt
        fecha = _dt.datetime.utcfromtimestamp(ts).strftime('%Y-%m-%d') if ts else None

        out.append({
            "match_id":    match_id,
            "fecha":       fecha,
            "rival":       rival,
            "condicion":   "LOCAL" if side == "home" else "VISITA",
            "own_score":   own_score,
            "rival_score": rival_score,
            "segments":    segments,
        })

    out.sort(key=lambda r: r["fecha"] or "0000-00-00", reverse=True)
    return {"matches": out}


# ─── ANÁLISIS DE ÁRBITRO (ventana aparte, botón "Árbitro" del Header) ────────
# Reusa el mismo patrón que /download-team + raw_json, pero con su propio
# downloader liviano (referee_downloader.py: solo event.json + incidents.json
# por partido, no lineups/statistics/graph/shotmap) y su propia carpeta
# (RAW_REFEREE_DIR) para no mezclar árbitros con equipos.

def _parse_referee_id(raw: str):
    """Acepta tanto un ID numérico como una URL de SofaScore
    (.../referee/perez-gutierrez-roberto/786859) y devuelve el ID."""
    raw = (raw or "").strip()
    if not raw:
        return None
    if raw.isdigit():
        return int(raw)
    m = re.search(r'/(\d+)/?(?:[?#].*)?$', raw.rstrip('/'))
    return int(m.group(1)) if m else None

def _find_referee_folder(referee_id):
    if not referee_id or not os.path.isdir(RAW_REFEREE_DIR):
        return None
    suffix = f" - {referee_id}"
    for name in os.listdir(RAW_REFEREE_DIR):
        if name.endswith(suffix) and os.path.isdir(os.path.join(RAW_REFEREE_DIR, name)):
            return os.path.join(RAW_REFEREE_DIR, name)
    return None

@app.get("/available-referees")
async def get_available_referees():
    """Árbitros ya descargados (raw_referees/) — para elegir uno sin tener que
    volver a pegar la URL/ID y re-descargar."""
    if not os.path.isdir(RAW_REFEREE_DIR):
        return {"referees": []}

    out = []
    for name in os.listdir(RAW_REFEREE_DIR):
        folder = os.path.join(RAW_REFEREE_DIR, name)
        if not os.path.isdir(folder):
            continue
        manifest = _read_raw_json(os.path.join(folder, "manifest.json"))
        referee_id = manifest.get("referee_id")
        if referee_id is None:
            m = re.search(r'-\s*(\d+)$', name)
            referee_id = int(m.group(1)) if m else None
        if referee_id is None:
            continue
        n_matches = len(manifest.get("selected_matches") or manifest.get("downloaded_matches") or [])
        out.append({
            "referee_id":      referee_id,
            "referee_name":    manifest.get("referee_name", name),
            "n_matches":       n_matches,
            "last_update_utc": manifest.get("last_update_utc"),
        })

    out.sort(key=lambda r: r["referee_name"])
    return {"referees": out}

def _card_type_label(incident_class):
    c = (incident_class or "").lower()
    if c == "yellow":
        return "Amarilla"
    if c == "yellowred":
        return "Roja (doble amarilla)"
    if c == "red":
        return "Roja"
    return "Amarilla"

class DownloadRefereeRequest(BaseModel):
    referee: str          # ID numérico o URL de SofaScore
    n_partidos: int = 20

@app.post("/download-referee")
def download_referee(req: DownloadRefereeRequest):
    """Descarga los últimos partidos finalizados dirigidos por un árbitro de
    SofaScore (event + incidents), listos para /referee-analysis."""
    referee_id = _parse_referee_id(req.referee)
    if not referee_id:
        raise HTTPException(status_code=400, detail="No se pudo interpretar el ID/URL del árbitro")

    from client import SofaScoreClient
    from referee_downloader import RefereeDownloader

    try:
        client = SofaScoreClient()
        rd = RefereeDownloader(client)
        result = rd.descargar_arbitro(referee_id, req.n_partidos)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"No se pudo consultar SofaScore: {e}")

    if not result.get("matches"):
        raise HTTPException(status_code=404, detail="No se encontraron partidos finalizados para ese árbitro")

    return {
        "referee_id":    result["referee_id"],
        "referee_name":  result["referee_name"],
        "matches_found": len(result["matches"]),
    }

def _parse_tournament_filter(raw: str | None):
    # Separador "~~" (no "," — nombres de torneo como "Liga 1, Apertura" o
    # "U17 FIFA World Cup, Group C" ya traen comas).
    if not raw:
        return None
    names = [t for t in raw.split('~~') if t.strip()]
    return set(names) if names else None

@app.get("/referee-analysis/{referee_id}")
async def get_referee_analysis(referee_id: int, tournaments: str = None):
    """Distribución de tarjetas (10 min) + promedio de tarjetas por partido
    (5 min) + marcador de cada partido dirigido, a partir de lo descargado
    en /download-referee. `tournaments` (opcional, separado por "~~") filtra
    a solo esas competiciones (ej. "Liga 1, Apertura~~CONMEBOL Libertadores")
    — la distribución y el promedio se recalculan sobre ese subconjunto."""
    folder = _find_referee_folder(referee_id)
    if not folder:
        raise HTTPException(status_code=404, detail="Árbitro sin datos descargados. Usá 'Descargar árbitro' primero.")

    referee_info = _read_raw_json(os.path.join(folder, "referee.json")).get("referee", {}) or {}

    # El folder de un árbitro acumula TODOS los partidos que se descargaron
    # alguna vez (corridas anteriores con otro n_partidos, etc.) — el análisis
    # se limita a "selected_matches" del último manifest, que es la selección
    # de la última corrida de "Analizar" (los N más recientes pedidos).
    manifest = _read_raw_json(os.path.join(folder, "manifest.json"))
    selected_ids = set(manifest.get("selected_matches") or [])

    matches_dir = os.path.join(folder, "matches")
    raw_matches = []  # todos los de la selección, SIN filtrar por torneo (para armar el filtro)

    if os.path.isdir(matches_dir):
        import datetime as _dt
        match_ids = selected_ids if selected_ids else set(os.listdir(matches_dir))
        for match_id in match_ids:
            match_folder = os.path.join(matches_dir, match_id)
            event = _read_raw_json(os.path.join(match_folder, "event.json"))
            if not event:
                continue
            incidents_raw = _read_raw_json(os.path.join(match_folder, "incidents.json")).get("incidents", [])

            home = event.get("homeTeam", {}) or {}
            away = event.get("awayTeam", {}) or {}
            ts = event.get("startTimestamp")
            fecha = _dt.datetime.utcfromtimestamp(ts).strftime('%Y-%m-%d') if ts else None
            tournament = (event.get("tournament") or {}).get("name", "") or "Sin competición"

            cards = []
            for inc in incidents_raw:
                if not isinstance(inc, dict) or inc.get("incidentType") != "card":
                    continue
                minute = inc.get("time")
                if minute is None:
                    continue
                cards.append((minute, _card_type_label(inc.get("incidentClass"))))

            raw_matches.append({
                "match_id":   match_id,
                "fecha":      fecha,
                "tournament": tournament,
                "home_name":  home.get("name", "?"),
                "away_name":  away.get("name", "?"),
                "home_score": (event.get("homeScore") or {}).get("current"),
                "away_score": (event.get("awayScore") or {}).get("current"),
                "cards":      cards,
            })

    # Torneos disponibles para el filtro — sobre el total descargado, no sobre
    # lo ya filtrado, así las opciones no desaparecen al tildar alguna.
    tournament_counts = {}
    for m in raw_matches:
        tournament_counts[m["tournament"]] = tournament_counts.get(m["tournament"], 0) + 1
    available_tournaments = [
        {"name": k, "count": v}
        for k, v in sorted(tournament_counts.items(), key=lambda kv: -kv[1])
    ]

    tournament_filter = _parse_tournament_filter(tournaments)
    filtered_matches = [m for m in raw_matches if not tournament_filter or m["tournament"] in tournament_filter]

    matches_out = []
    all_cards = []  # (minuto, label) — solo de los partidos filtrados
    for m in filtered_matches:
        yellow = sum(1 for _, l in m["cards"] if l == "Amarilla")
        red = sum(1 for _, l in m["cards"] if l.startswith("Roja"))
        matches_out.append({
            "match_id":    m["match_id"],
            "fecha":       m["fecha"],
            "tournament":  m["tournament"],
            "home_name":   m["home_name"],
            "away_name":   m["away_name"],
            "home_score":  m["home_score"],
            "away_score":  m["away_score"],
            "cards_count": len(m["cards"]),
            "yellow":      yellow,
            "red":         red,
        })
        all_cards.extend(m["cards"])

    matches_out.sort(key=lambda m: m["fecha"] or "0000-00-00", reverse=True)
    n_matches = len(matches_out)

    def build_distribution(bs):
        num_regular = 90 // bs
        labels = []
        for i in range(num_regular):
            start = 0 if i == 0 else i * bs + 1
            end = (i + 1) * bs
            labels.append(f"{start}-{end}")
        labels.append("90+")

        bins = [{"label": lbl, "count": 0, "by_type": {}} for lbl in labels]
        for minute, label in all_cards:
            try:
                m = int(minute)
            except (TypeError, ValueError):
                m = 0
            idx = min((m - 1) // bs if m > 0 else 0, num_regular)
            bins[idx]["count"] += 1
            bins[idx]["by_type"][label] = bins[idx]["by_type"].get(label, 0) + 1
        return bins

    distribution_10 = build_distribution(10)
    distribution_5  = build_distribution(5)
    distribution_5_avg = [
        {
            "label": b["label"],
            "avg": round(b["count"] / n_matches, 2) if n_matches else 0,
            "by_type_avg": {k: round(v / n_matches, 2) if n_matches else 0 for k, v in b["by_type"].items()},
        }
        for b in distribution_5
    ]

    return {
        "referee": {
            "id":                referee_id,
            "name":              referee_info.get("name", f"Árbitro {referee_id}"),
            "country":           (referee_info.get("country") or {}).get("name", ""),
            "career_games":      referee_info.get("games"),
            "career_yellow":     referee_info.get("yellowCards"),
            "career_red":        referee_info.get("redCards"),
            "career_yellow_red": referee_info.get("yellowRedCards"),
        },
        "available_tournaments": available_tournaments,
        "n_matches_analyzed":    n_matches,
        "n_matches_total":       len(raw_matches),
        "matches":               matches_out,
        "distribution_10":       distribution_10,
        "distribution_5_avg":    distribution_5_avg,
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8005)
