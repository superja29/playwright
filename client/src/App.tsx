import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import NewWatcher from './pages/NewWatcher';
import WatcherDetail from './pages/WatcherDetail';

function App() {
  return (
    <Router>
      <div className="min-h-screen flex flex-col">
        <header className="bg-white shadow-sm p-4">
          <div className="container mx-auto flex justify-between items-center">
            <Link to="/" className="text-xl font-bold text-blue-600">PriceWatch CL</Link>
            <Link to="/new" className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
              + Nuevo Watcher
            </Link>
          </div>
        </header>
        <main className="container mx-auto p-4 flex-grow">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/new" element={<NewWatcher />} />
            <Route path="/watcher/:id" element={<WatcherDetail />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
