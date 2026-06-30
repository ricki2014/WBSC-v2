import { useState, useEffect } from 'react';
import { getAvailableFiles } from '../api';

export default function FileSelector({ onSelectFiles }) {
  const [files, setFiles] = useState([]);
  const [f1, setF1] = useState('');
  const [f2, setF2] = useState('');

  useEffect(() => { getAvailableFiles().then(setFiles).catch(()=>{}); }, []);

  const handle = () => { if (f1 && f2) onSelectFiles(f1, f2); };

  return (
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
    </div>
  );
}
