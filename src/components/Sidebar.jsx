import { NavLink, useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import { useAuth } from '../context/AuthContext';

const navItems = [
    { to: '/', icon: 'dashboard', label: 'Dashboard' },
    { to: '/inventory', icon: 'inventory_2', label: 'Inventory' },
    { to: '/products', icon: 'egg', label: 'Products' },
    { to: '/sales', icon: 'payments', label: 'Sales' },
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
                    <span className="material-symbols-outlined sidebar-logo-icon fill">egg</span>
                    <div>
                        <div className="sidebar-logo-title">EggERP</div>
                        <div className="sidebar-logo-sub">Farm-to-Finance</div>
                    </div>
                </div>

                <button className="sidebar-new-batch-btn">
                    <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>add</span>
                    New Batch
                </button>

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

            {/* Mobile Bottom Nav */}
            <div className="bottom-nav">
                <div className="bottom-nav-items">
                    {navItems.map(item => (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            end={item.to === '/'}
                            className={({ isActive }) => `bottom-nav-item${isActive ? ' active' : ''}`}
                        >
                            <span className="material-symbols-outlined">{item.icon}</span>
                            <span>{item.label}</span>
                        </NavLink>
                    ))}
                </div>
            </div>
        </>
    );
}
