import axios from 'axios';
const BASE = 'http://localhost:8005';

export const getAvailableFiles = async () => {
  const r = await axios.get(`${BASE}/available-files`);
  return r.data.files;
};

export const getAnalysis = async (file1, file2, cond1='TOTAL', cond2='TOTAL') => {
  const r = await axios.get(`${BASE}/analysis/${file1}/${file2}`, { params: { cond1, cond2 } });
  return r.data;
};

export const fetchLineups = async (payload) => {
  const r = await axios.post(`${BASE}/get-lineups`, payload);
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
