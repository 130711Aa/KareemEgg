import { NavLink, useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import { useAuth } from '../context/AuthContext';

export const navItems = [
    { to: '/', icon: 'dashboard', label: 'Dashboard' },
    { to: '/analytics', icon: 'analytics', label: 'Analytics' },
    { to: '/inventory', icon: 'inventory_2', label: 'Inventory' },
    { to: '/products', icon: 'egg', label: 'Products' },
    { to: '/sales', icon: 'payments', label: 'Sales' },
    { to: '/orders', icon: 'list_alt', label: 'Pemesanan' },
    { to: '/finance', icon: 'account_balance', label: 'Finance' },
];

export default function Sidebar() {
    const navigate = useNavigate();
    const { user } = useAuth();

    const handleLogout = async () => {
        await signOut(auth);
        navigate('/login');
    };

    const initials = user?.email?.charAt(0).toUpperCase() || 'A';

    return (
        <>
            {/* Desktop Sidebar */}
            <nav className="sidebar">
                <div className="sidebar-logo">
                    <div className="sidebar-logo-icon-wrap" style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 38,
                        height: 38,
                        background: 'linear-gradient(135deg, #fbbf24 0%, #d97706 100%)',
                        borderRadius: '12px',
                        boxShadow: '0 3px 8px rgba(217, 119, 6, 0.4)',
                        flexShrink: 0,
                        marginRight: 6
                    }}>
                        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ filter: 'drop-shadow(0px 1.5px 1px rgba(0,0,0,0.2))' }}>
                            <path d="M12 2C7.5 2 4 7 4 12s3.5 10 8 10 8-5 8-10S16.5 2 12 2z" fill="rgba(255,255,255,0.15)" />
                            <path d="M12 6a3 3 0 0 0-3 3" strokeWidth="1.5" strokeOpacity="0.8" strokeLinecap="round" />
                        </svg>
                    </div>
                    <div>
                        <div className="sidebar-logo-title">KareeemEgg</div>
                        <div className="sidebar-logo-sub">Farm-to-Finance</div>
                    </div>
                </div>

                <nav className="sidebar-nav">
                    {navItems.map(item => (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            end={item.to === '/'}
                            className={({ isActive }) => `sidebar-nav-item${isActive ? ' active' : ''}`}
                        >
                            <span className="material-symbols-outlined">{item.icon}</span>
                            <span>{item.label}</span>
                        </NavLink>
                    ))}
                </nav>

                <div className="sidebar-footer">
                    <div className="sidebar-nav-item" style={{ color: 'rgba(255,255,255,0.6)', fontSize: '13px' }}>
                        <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 600, color: '#fff', flexShrink: 0 }}>
                            {initials}
                        </div>
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.email}</span>
                    </div>
                    <button className="sidebar-nav-item" onClick={handleLogout} style={{ width: '100%', cursor: 'pointer' }}>
                        <span className="material-symbols-outlined">logout</span>
                        <span>Logout</span>
                    </button>
                </div>
            </nav>
        </>
    );
}
