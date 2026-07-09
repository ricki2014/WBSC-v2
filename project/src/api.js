import axios from 'axios';
const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8005';
// Publicar el estado en vivo siempre va DIRECTO a la web deployada (aunque estés
// corriendo local), así aparece al instante — no pasa por localhost ni por git.
const PUBLIC_BASE = import.meta.env.VITE_API_URL || 'https://wbsc-v2.onrender.com';

export const getAvailableFiles = async () => {
  const r = await axios.get(`${BASE}/available-files`);
  return r.data.files;
};

// La descarga puede tardar bastante (varios requests a SofaScore por partido)
export const downloadTeam = async (teamId, nPartidos = 10, skip = 0) => {
  const r = await axios.post(`${BASE}/download-team`,
    { team_id: Number(teamId), n_partidos: Number(nPartidos), skip: Number(skip) },
    { timeout: 5 * 60 * 1000 });
  return r.data;
};

export const deleteFile = async (filename) => {
  const r = await axios.delete(`${BASE}/available-files/${encodeURIComponent(filename)}`);
  return r.data;
};

export const moveFileToPast = async (filename) => {
  const r = await axios.post(`${BASE}/available-files/${encodeURIComponent(filename)}/move-to-past`);
  return r.data;
};

// Sync directo de excels a la web (sin git): lee los .xlsx locales (BASE) y
// los sube al backend público de Render (PUBLIC_BASE), que reemplaza su
// carpeta para que quede idéntica — así los nuevos aparecen y los que
// moviste/borraste localmente también desaparecen del lado publicado.
const listDataFiles = async (folder) => {
  const r = await axios.get(`${BASE}/data-files/${folder}`);
  return r.data.files;
};

const fetchDataFileBlob = async (folder, filename) => {
  const r = await axios.get(`${BASE}/data-files/${folder}/${encodeURIComponent(filename)}/download`, {
    responseType: 'blob',
  });
  return r.data;
};

export const syncFilesToWeb = async () => {
  const [upcomingNames, pasadoNames] = await Promise.all([
    listDataFiles('upcoming'),
    listDataFiles('pasado'),
  ]);

  const formData = new FormData();
  for (const name of upcomingNames) {
    formData.append('upcoming', await fetchDataFileBlob('upcoming', name), name);
  }
  for (const name of pasadoNames) {
    formData.append('pasado', await fetchDataFileBlob('pasado', name), name);
  }

  const r = await axios.post(`${PUBLIC_BASE}/receive-data-sync`, formData, { timeout: 120 * 1000 });
  return r.data;
};

export const getAnalysis = async (file1, file2, cond1='TOTAL', cond2='TOTAL', matches1=null, matches2=null) => {
  const params = { cond1, cond2 };
  if (matches1?.length) params.matches1 = matches1.join(',');
  if (matches2?.length) params.matches2 = matches2.join(',');
  const r = await axios.get(`${BASE}/analysis/${file1}/${file2}`, { params });
  return r.data;
};

export const fetchTeamMatchList = async (file) => {
  const r = await axios.get(`${BASE}/team-match-list/${encodeURIComponent(file)}`);
  return r.data.matches;
};

export const fetchLineups = async (payload) => {
  const r = await axios.post(`${BASE}/get-lineups`, payload);
  return r.data;
};

export const getLiveStatus = async (matchId) => {
  const r = await axios.get(`${BASE}/live-status/${encodeURIComponent(matchId)}`);
  return r.data;
};

// Va directo a PUBLIC_BASE (Render), no a localhost — así queda visible al
// instante para cualquiera en la web, sin pasar por git/build/deploy.
export const pushWebUpdate = async (snapshot) => {
  const r = await axios.post(`${PUBLIC_BASE}/push-web-update`, snapshot, { timeout: 30 * 1000 });
  return r.data;
};

export const getSharedLiveState = async () => {
  const r = await axios.get(`${PUBLIC_BASE}/live-state`);
  return r.data;
};

export const fetchTeamMatches = async (file, statKey, matches = null) => {
  const params = {};
  if (matches?.length) params.matches = matches.join(',');
  const r = await axios.get(`${BASE}/team-matches/${encodeURIComponent(file)}/${encodeURIComponent(statKey)}`, { params });
  return r.data;
};

export const fetchPlayerMatches = async (file, playerName, statKey = '', playerId = null, matches = null) => {
  const params = { stat_key: statKey };
  if (playerId != null) params.player_id = playerId;
  if (matches?.length) params.matches = matches.join(',');
  const r = await axios.get(`${BASE}/player-matches/${encodeURIComponent(file)}/${encodeURIComponent(playerName)}`, {
    params,
  });
  return r.data;
};

export const fetchShotDistribution = async (file, matchId = 'all', binSize = 10, playerName = null, matches = null) => {
  const params = {};
  if (matchId !== 'all') params.match_id = matchId;
  if (binSize !== 10) params.bin_size = binSize;
  if (playerName) params.player_name = playerName;
  if (matches?.length) params.matches = matches.join(',');
  const r = await axios.get(`${BASE}/shot-distribution/${encodeURIComponent(file)}`, { params });
  return r.data;
};

export const fetchMomentumMatches = async (teamId) => {
  const r = await axios.get(`${BASE}/momentum-matches/${encodeURIComponent(teamId)}`);
  return r.data.matches;
};

export const fetchMomentumData = async (teamId, matchId) => {
  const r = await axios.get(`${BASE}/momentum/${encodeURIComponent(teamId)}/${encodeURIComponent(matchId)}`);
  return r.data;
};
