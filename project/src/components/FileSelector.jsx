import { useState, useEffect } from 'react';
import { getAvailableFiles, downloadTeam, deleteFile } from '../api';

export default function FileSelector({ onSelectFiles }) {
  const [files, setFiles] = useState([]);
  const [f1, setF1] = useState('');
  const [f2, setF2] = useState('');

  const [showDownload, setShowDownload] = useState(false);
  const [teamId, setTeamId]         = useState('');
  const [nPartidos, setNPartidos]   = useState(10);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  const [downloadOk, setDownloadOk] = useState('');

  const [showManage, setShowManage] = useState(false);
  const [deletingFile, setDeletingFile] = useState('');
  const [deleteError, setDeleteError] = useState('');

  const refreshFiles = () => getAvailableFiles().then(setFiles).catch(()=>{});

  useEffect(() => { refreshFiles(); }, []);

  const handle = () => { if (f1 && f2) onSelectFiles(f1, f2); };

  const handleDelete = async (filename) => {
    setDeletingFile(filename); setDeleteError('');
    try {
      await deleteFile(filename);
      if (f1 === filename) setF1('');
      if (f2 === filename) setF2('');
      await refreshFiles();
    } catch (e) {
      setDeleteError(e?.response?.data?.detail || `No se pudo borrar ${filename}`);
    } finally {
      setDeletingFile('');
    }
  };

  const handleDownload = async () => {
    if (!teamId.trim()) return;
    setDownloading(true); setDownloadError(''); setDownloadOk('');
    try {
      const res = await downloadTeam(teamId, nPartidos);
      setDownloadOk(`✅ ${res.team_name} (${res.matches_found} partidos)`);
      setTeamId('');
      await refreshFiles();
    } catch (e) {
      setDownloadError(e?.response?.data?.detail || 'Error al descargar el equipo');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2 items-center">
        <select value={f1} onChange={e=>setF1(e.target.value)}
          className="bg-gray-800 border border-gray-600 text-white text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-green-500">
          <option value="">Equipo Local</option>
          {files.map(f=><option key={f} value={f}>{f.replace('.xlsx','')}</option>)}
        </select>
        <span className="text-gray-500 text-xs font-bold">vs</span>
        <select value={f2} onChange={e=>setF2(e.target.value)}
          className="bg-gray-800 border border-gray-600 text-white text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-blue-500">
          <option value="">Equipo Visita</option>
          {files.map(f=><option key={f} value={f}>{f.replace('.xlsx','')}</option>)}
        </select>
        <button onClick={handle} className="btn-primary text-xs py-1.5">Analizar</button>
        <button onClick={() => setShowDownload(v => !v)}
          className="text-xs px-2 py-1.5 rounded-lg border border-gray-600 text-gray-300 hover:border-gray-400 transition-colors">
          ⬇ {showDownload ? 'Cerrar' : 'Descargar equipo'}
        </button>
        <button onClick={() => setShowManage(v => !v)}
          className="text-xs px-2 py-1.5 rounded-lg border border-gray-600 text-gray-300 hover:border-gray-400 transition-colors">
          🗑 {showManage ? 'Cerrar' : 'Gestionar archivos'}
        </button>
      </div>

      {showDownload && (
        <div className="flex items-center gap-2 bg-gray-900 border border-gray-700/40 rounded-lg px-2 py-1.5">
          <input value={teamId} onChange={e => setTeamId(e.target.value)}
            placeholder="ID equipo SofaScore (ej: 4819)"
            className="bg-gray-800 border border-gray-600 text-white text-xs rounded-lg px-2 py-1.5 w-48 focus:outline-none focus:border-green-500"/>
          <input type="number" min={1} value={nPartidos} onChange={e => setNPartidos(e.target.value)}
            className="bg-gray-800 border border-gray-600 text-white text-xs rounded-lg px-2 py-1.5 w-16 focus:outline-none focus:border-green-500"/>
          <span className="text-gray-500 text-[10px]">partidos</span>
          <button onClick={handleDownload} disabled={downloading || !teamId.trim()}
            className="btn-primary text-xs py-1.5 disabled:opacity-50 disabled:cursor-not-allowed">
            {downloading ? '⏳ Descargando...' : '🚀 Descargar'}
          </button>
          {downloadError && <span className="text-red-400 text-[10px]">{downloadError}</span>}
          {downloadOk && <span className="text-green-400 text-[10px]">{downloadOk}</span>}
        </div>
      )}

      {showManage && (
        <div className="flex flex-col gap-1 bg-gray-900 border border-gray-700/40 rounded-lg px-2 py-1.5 max-w-md">
          {files.length === 0 && <span className="text-gray-500 text-[10px]">Sin archivos en data/upcoming</span>}
          {files.map(f => (
            <div key={f} className="flex items-center justify-between gap-2 text-xs">
              <span className="text-gray-300 truncate">{f.replace('.xlsx', '')}</span>
              <button onClick={() => handleDelete(f)} disabled={deletingFile === f}
                className="text-red-400 hover:text-red-300 text-[10px] shrink-0 disabled:opacity-50">
                {deletingFile === f ? '⏳...' : '✕ Borrar'}
              </button>
            </div>
          ))}
          {deleteError && <span className="text-red-400 text-[10px] mt-1">{deleteError}</span>}
        </div>
      )}
    </div>
  );
}
