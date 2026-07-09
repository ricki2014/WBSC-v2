const TABS = [
  { icon: '📊', label: 'Previa' },
  { icon: '🎮', label: 'Registro por equipo' },
  { icon: '📈', label: 'Esperado' },
  { icon: '👕', label: 'Alineaciones' },
  { icon: '👤', label: 'Stats x Jugador' },
  { icon: '🏟️', label: 'Registro x Jugador' },
  { icon: '📌', label: 'Stats Fijos' },
  { icon: '⚡', label: 'Stats en Vivo' },
  { icon: '🎯', label: 'Dist Tiros' },
  { icon: '📉', label: 'Momentum' },
];

export default function Tabs({ tab, setTab }) {
  return (
    <div className="flex gap-1 overflow-x-auto">
      {TABS.map((t, i) => (
        <button key={i} onClick={() => setTab(i)}
          className={`tab-btn ${tab === i ? 'active' : ''}`}>
          <span className="mr-1">{t.icon}</span>{t.label}
        </button>
      ))}
    </div>
  );
}
