import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

export default function WatcherDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [watcher, setWatcher] = useState<any>(null);
  const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';

  useEffect(() => {
    fetch(`${API}/api/watchers/${id}`)
      .then(res => res.json())
      .then(data => setWatcher(data));
  }, [id]);

  const handleDelete = async () => {
      if (confirm('Are you sure?')) {
          await fetch(`${API}/api/watchers/${id}`, { method: 'DELETE' });
          navigate('/');
      }
  };

  if (!watcher) return <div>Loading...</div>;

  const chartData = watcher.checks?.map((c: any) => ({
      date: new Date(c.checked_at).toLocaleDateString(),
      price: c.price_value
  })).reverse() || [];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-white p-6 rounded shadow">
        <div>
            <h1 className="text-3xl font-bold">{watcher.name}</h1>
            <a href={watcher.url} target="_blank" className="text-blue-600 hover:underline">{watcher.url}</a>
        </div>
        <button onClick={handleDelete} className="text-red-600 border border-red-600 px-3 py-1 rounded hover:bg-red-50">Delete</button>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2 bg-white p-6 rounded shadow">
            <h3 className="font-bold mb-4">Historial de Precios</h3>
            <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                        <XAxis dataKey="date" />
                        <YAxis domain={['auto', 'auto']} />
                        <Tooltip />
                        <Line type="monotone" dataKey="price" stroke="#2563eb" strokeWidth={2} />
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>

        <div className="bg-white p-6 rounded shadow">
            <h3 className="font-bold mb-4">Últimos Checks</h3>
            <div className="space-y-3 max-h-96 overflow-y-auto">
                {watcher.checks?.map((check: any) => (
                    <div key={check.id} className="text-sm border-b pb-2">
                        <div className="flex justify-between">
                            <span className="font-medium">${check.price_value}</span>
                            <span className={check.status === 'OK' ? 'text-green-600' : 'text-red-600'}>{check.status}</span>
                        </div>
                        <div className="text-gray-500 text-xs">
                            {new Date(check.checked_at).toLocaleString()}
                        </div>
                    </div>
                ))}
            </div>
        </div>
      </div>
    </div>
  );
}
