import { BrowserRouter, Routes, Route, Navigate, NavLink, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Sidebar, { navItems } from './components/Sidebar';
import Toast from './components/Toast';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Products from './pages/Products';
import Sales from './pages/Sales';
import Finance from './pages/Finance';
import Inventory from './pages/Inventory';
import Analytics from './pages/Analytics';
import Orders from './pages/Orders';
import { useState, useEffect, useRef } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from './firebase';

function ProtectedLayout({ children }) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span className="material-symbols-outlined" style={{ fontSize: 40, color: 'var(--color-primary-fixed-dim)', animation: 'spin 1s linear infinite' }}>
          autorenew
        </span>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/login');
  };

  return (
    <div className="app-layout">
      <Sidebar />
      <div className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <div className="topbar-brand">KareeemEgg</div>
            <div className="topbar-search">
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--color-on-surface-variant)' }}>search</span>
              <input placeholder="Search products, sales, or transactions..." />
            </div>
          </div>
          <div className="topbar-right" ref={dropdownRef} style={{ position: 'relative' }}>
            <button className="topbar-menu-btn" onClick={() => setMenuOpen(!menuOpen)}>
              <span className="material-symbols-outlined">menu</span>
            </button>
            {menuOpen && (
              <div className="topbar-dropdown">
                {navItems.map(item => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/'}
                    className={({ isActive }) => `dropdown-item${isActive ? ' active' : ''}`}
                    onClick={() => setMenuOpen(false)}
                  >
                    <span className="material-symbols-outlined">{item.icon}</span>
                    <span>{item.label}</span>
                  </NavLink>
                ))}
                <div className="dropdown-divider"></div>
                <button className="dropdown-item logout" onClick={() => { setMenuOpen(false); handleLogout(); }}>
                  <span className="material-symbols-outlined">logout</span>
                  <span>Logout</span>
                </button>
              </div>
            )}
          </div>
        </header>
        {children}
      </div>
      <Toast />
    </div>
  );
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
          <Route path="/" element={<ProtectedLayout><Dashboard /></ProtectedLayout>} />
          <Route path="/inventory" element={<ProtectedLayout><Inventory /></ProtectedLayout>} />
          <Route path="/products" element={<ProtectedLayout><Products /></ProtectedLayout>} />
          <Route path="/sales" element={<ProtectedLayout><Sales /></ProtectedLayout>} />
          <Route path="/orders" element={<ProtectedLayout><Orders /></ProtectedLayout>} />
          <Route path="/finance" element={<ProtectedLayout><Finance /></ProtectedLayout>} />
          <Route path="/analytics" element={<ProtectedLayout><Analytics /></ProtectedLayout>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
