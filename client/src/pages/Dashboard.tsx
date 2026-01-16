import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

export default function Dashboard() {
  const [watchers, setWatchers] = useState<any[]>([]);
  const API = import.meta.env.VITE_API_URL || window.location.origin;

  useEffect(() => {
    fetch(`${API}/api/watchers`)
      .then(res => res.json())
      .then(data => setWatchers(data));
  }, []);

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Mis Productos Monitoreados</h2>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {watchers.map(w => {
            const lastCheck = w.checks?.[0];
            return (
                <Link key={w.id} to={`/watcher/${w.id}`} className="block bg-white p-4 rounded shadow hover:shadow-md transition">
                    <div className="flex justify-between items-start mb-2">
                        <h3 className="font-semibold text-lg truncate">{w.name}</h3>
                        <span className={`text-xs px-2 py-1 rounded ${w.enabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                            {w.enabled ? 'Active' : 'Paused'}
                        </span>
                    </div>
                    <div className="text-sm text-gray-500 mb-2">{w.store_domain}</div>
                    
                    <div className="flex justify-between items-end mt-4">
                        <div>
                            <div className="text-2xl font-bold text-gray-800">
                                {lastCheck?.price_value ? `$${lastCheck.price_value.toLocaleString('es-CL')}` : '---'}
                            </div>
                            <div className="text-xs text-gray-400">
                                {lastCheck ? new Date(lastCheck.checked_at).toLocaleString() : 'Never checked'}
                            </div>
                        </div>
                        <div className={`text-sm font-bold ${lastCheck?.status === 'OK' ? 'text-green-600' : 'text-red-600'}`}>
                            {lastCheck?.status || 'PENDING'}
                        </div>
                    </div>
                </Link>
            );
        })}
      </div>
    </div>
  );
}
