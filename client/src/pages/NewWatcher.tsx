import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const PRESETS: Record<string, { selector: string, name: string }> = {
  'falabella.com': { selector: '.vtex-product-price-1-x-sellingPrice', name: 'Falabella (VTEX)' },
  'paris.cl': { selector: '.vtex-product-price-1-x-sellingPrice', name: 'Paris (VTEX)' },
  'sodimac.cl': { selector: '.vtex-product-price-1-x-sellingPrice', name: 'Sodimac (VTEX)' },
  'tottus.cl': { selector: '.vtex-product-price-1-x-sellingPrice', name: 'Tottus (VTEX)' },
  'mercadolibre.cl': { selector: '.ui-pdp-price__second-line .andes-money-amount__fraction', name: 'MercadoLibre' },
  'ripley.cl': { selector: '.product-price', name: 'Ripley' },
  'linio.cl': { selector: '.price-main-md', name: 'Linio' },
  'tiendamademsa.cl': { selector: '.electrolux-product-prices-4-x-sellingPriceValue', name: 'Mademsa (Electrolux)' },
  'mademsa.cl': { selector: '.electrolux-product-prices-4-x-sellingPriceValue', name: 'Mademsa' },
  'tiendafensa.cl': { selector: '.vtex-product-price-1-x-sellingPriceValue', name: 'Fensa (VTEX Standard)' },
  'tienda.electrolux.cl': { selector: '.electrolux-product-prices-4-x-sellingPriceValue', name: 'Electrolux' },
  'electrolux.cl': { selector: '.electrolux-product-prices-4-x-sellingPriceValue', name: 'Electrolux' },
};

export default function NewWatcher() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [detectedStore, setDetectedStore] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    url: '',
    price_selector: '',
    stock_selector: '',
    check_frequency_minutes: 60,
    availability_strategy: 'PRICE_SELECTOR_ONLY',
    alert_on_drop: true,
    alert_on_back_in_stock: true
  });
  const [testResult, setTestResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const API = import.meta.env.VITE_API_URL || window.location.origin;

  const handleUrlChange = (e: any) => {
    const url = e.target.value;
    let newSelector = form.price_selector;
    let storeName = null;

    try {
        const hostname = new URL(url).hostname;
        const foundKey = Object.keys(PRESETS).find(domain => hostname.includes(domain));
        
        if (foundKey) {
            newSelector = PRESETS[foundKey].selector;
            storeName = PRESETS[foundKey].name;
        }
    } catch (e) {
        // Invalid URL, ignore
    }

    setDetectedStore(storeName);
    setForm({ ...form, url, price_selector: newSelector });
  };

  const autoDetect = async () => {
    if (!form.url) return alert('Ingresa una URL primero');
    setDetecting(true);
    try {
        const res = await fetch(`${API}/api/detect-selector`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: form.url })
        });
        const data = await res.json();
        if (data.selector) {
            setForm({ ...form, price_selector: data.selector });
            setDetectedStore(`Auto-detectado (${data.strategy})`);
        } else {
            alert('No se pudo detectar un selector automáticamente.');
        }
    } catch (e) {
        alert('Error detectando selector');
    }
    setDetecting(false);
  };

  const handleChange = (e: any) => setForm({ ...form, [e.target.name]: e.target.value });
  const handleBoolChange = (e: any) => setForm({ ...form, [e.target.name]: e.target.checked });

  const testSelector = async () => {
    setLoading(true);
    try {
        const res = await fetch(`${API}/api/test-check`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(form)
        });
        const data = await res.json();
        setTestResult(data);
    } catch (e) {
        alert('Error testing selector');
    }
    setLoading(false);
  };

  const saveWatcher = async () => {
    try {
        await fetch(`${API}/api/watchers`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(form)
        });
        navigate('/');
    } catch (e) {
        alert('Error saving');
    }
  };

  return (
    <div className="max-w-2xl mx-auto bg-white p-6 rounded shadow">
      <h2 className="text-2xl font-bold mb-4">Nuevo Watcher</h2>
      
      {step === 1 && (
        <div className="space-y-4">
            <div>
                <label className="block text-sm font-medium">Nombre Producto</label>
                <input name="name" value={form.name} onChange={handleChange} className="w-full border p-2 rounded" placeholder="iPhone 15" />
            </div>
            <div>
                <label className="block text-sm font-medium">URL</label>
                <input name="url" value={form.url} onChange={handleUrlChange} className="w-full border p-2 rounded" placeholder="https://..." />
                {detectedStore && (
                    <p className="text-xs text-green-600 mt-1 font-semibold">✓ Tienda detectada: {detectedStore}. Selector aplicado.</p>
                )}
            </div>
            <div>
                <label className="block text-sm font-medium">Selector de Precio (CSS)</label>
                <div className="flex gap-2">
                    <input name="price_selector" value={form.price_selector} onChange={handleChange} className="flex-1 border p-2 rounded" placeholder=".product-price" />
                    <button onClick={autoDetect} disabled={detecting || !form.url} className="bg-purple-600 text-white px-3 rounded hover:bg-purple-700 disabled:opacity-50 text-sm">
                        {detecting ? '🔍...' : '✨ Auto'}
                    </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">Tip: Usa DevTools para copiar el selector.</p>
            </div>

            <button onClick={testSelector} disabled={loading} className="w-full bg-gray-800 text-white py-2 rounded hover:bg-gray-700">
                {loading ? 'Testeando con Playwright...' : 'Probar Selector'}
            </button>

            {testResult && (
                <div className={`p-4 rounded border ${testResult.status === 'OK' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                    <h4 className="font-bold">Resultado del Test: {testResult.status}</h4>
                    {testResult.status === 'OK' ? (
                        <div className="text-sm mt-2">
                            <p>Precio Detectado: <strong>${testResult.price_value}</strong></p>
                            <p>Texto Crudo: "{testResult.price_text}"</p>
                            <p>En Stock: {testResult.in_stock ? 'Sí' : 'No'}</p>
                        </div>
                    ) : (
                        <p className="text-red-600 mt-2">{testResult.error_message}</p>
                    )}
                </div>
            )}

            {testResult?.status === 'OK' && (
                <button onClick={() => setStep(2)} className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 mt-4">
                    Continuar
                </button>
            )}
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
            <h3 className="font-semibold text-lg">Configuración Avanzada</h3>
            <div>
                <label className="block text-sm font-medium">Frecuencia (minutos)</label>
                <input type="number" name="check_frequency_minutes" value={form.check_frequency_minutes} onChange={handleChange} className="w-full border p-2 rounded" />
            </div>
            <div className="flex items-center gap-2">
                <input type="checkbox" name="alert_on_drop" checked={form.alert_on_drop} onChange={handleBoolChange} />
                <label>Alertar si baja de precio</label>
            </div>
            <div className="flex items-center gap-2">
                <input type="checkbox" name="alert_on_back_in_stock" checked={form.alert_on_back_in_stock} onChange={handleBoolChange} />
                <label>Alertar si vuelve stock</label>
            </div>
            
            <div className="flex gap-2 mt-6">
                <button onClick={() => setStep(1)} className="flex-1 bg-gray-200 text-gray-800 py-2 rounded">Atrás</button>
                <button onClick={saveWatcher} className="flex-1 bg-green-600 text-white py-2 rounded hover:bg-green-700">Guardar Watcher</button>
            </div>
        </div>
      )}
    </div>
  );
}
