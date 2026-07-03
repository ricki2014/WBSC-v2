import axios from 'axios';
const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8005';

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

export const getAnalysis = async (file1, file2, cond1='TOTAL', cond2='TOTAL') => {
  const r = await axios.get(`${BASE}/analysis/${file1}/${file2}`, { params: { cond1, cond2 } });
  return r.data;
};

export const fetchLineups = async (payload) => {
  const r = await axios.post(`${BASE}/get-lineups`, payload);
  return r.data;
};

export const getLiveStatus = async (matchId) => {
  const r = await axios.get(`${BASE}/live-status/${encodeURIComponent(matchId)}`);
  return r.data;
};

// Solo funciona corriendo local (necesita git + salida a SofaScore sin bloqueo)
export const pushWebUpdate = async (snapshot) => {
  const r = await axios.post(`${BASE}/push-web-update`, snapshot, { timeout: 60 * 1000 });
  return r.data;
};

export const getSharedLiveState = async () => {
  const r = await axios.get(`${BASE}/live-state`);
  return r.data;
};

export const fetchTeamMatches = async (file, statKey) => {
  const r = await axios.get(`${BASE}/team-matches/${encodeURIComponent(file)}/${encodeURIComponent(statKey)}`);
  return r.data;
};

export const fetchPlayerMatches = async (file, playerName, statKey = '') => {
  const r = await axios.get(`${BASE}/player-matches/${encodeURIComponent(file)}/${encodeURIComponent(playerName)}`, {
    params: { stat_key: statKey },
  });
  return r.data;
};

export const fetchShotDistribution = async (file, matchId = 'all', binSize = 10, playerName = null) => {
  const params = {};
  if (matchId !== 'all') params.match_id = matchId;
  if (binSize !== 10) params.bin_size = binSize;
  if (playerName) params.player_name = playerName;
  const r = await axios.get(`${BASE}/shot-distribution/${encodeURIComponent(file)}`, { params });
  return r.data;
};
