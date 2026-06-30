export default function TeamBadge({ name, formation, color = 'green' }) {
  const cls = color === 'green' ? 'text-green-400' : 'text-blue-400';
  return (
    <div className="flex items-center gap-3 bg-gray-800/50 rounded-xl p-3 border border-gray-700/50">
      <div className={`w-10 h-10 rounded-full border-2 ${color==='green'?'border-green-500':'border-blue-500'} flex items-center justify-center text-lg font-bold ${cls}`}>
        {name?.[0] || '?'}
      </div>
      <div>
        <div className="text-white font-bold text-sm">{name || '—'}</div>
        {formation && <div className={`text-xs font-mono ${cls}`}>{formation}</div>}
      </div>
    </div>
  );
}
