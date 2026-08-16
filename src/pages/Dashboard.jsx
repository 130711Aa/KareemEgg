import { useEffect, useState, useRef } from 'react';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { useNavigate } from 'react-router-dom';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function Dashboard() {
    const navigate = useNavigate();
    const [products, setProducts] = useState([]);
    const [sales, setSales] = useState([]);
    const [barsVisible, setBarsVisible] = useState(false);
    const chartRef = useRef(null);

    useEffect(() => {
        const unsub1 = onSnapshot(collection(db, 'products'), snap => {
            setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
        const q = query(collection(db, 'sales'), orderBy('date', 'desc'), limit(50));
        const unsub2 = onSnapshot(q, snap => {
            setSales(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
        setTimeout(() => setBarsVisible(true), 300);
        return () => { unsub1(); unsub2(); };
    }, []);

    // KPI calculations
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const mtdSales = sales
        .filter(s => s.date?.toDate?.() >= startOfMonth)
        .reduce((sum, s) => sum + (s.total || 0), 0);
    const totalStock = products.reduce((sum, p) => sum + Number(p.stock || 0), 0);
    const lowStock = products.filter(p => Number(p.stock || 0) < 100);
    const totalProducts = products.length;

    // Weekly sales data (Sun=0..Sat=6) → Mon..Sun display
    const weeklyData = [0, 0, 0, 0, 0, 0, 0];
    const today = new Date();
    sales.forEach(s => {
        const sDate = s.date?.toDate?.();
        if (!sDate) return;
        const diff = Math.floor((today - sDate) / 86400000);
        if (diff < 7) {
            const dayOfWeek = sDate.getDay(); // 0=Sun
            const idx = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Mon=0..Sun=6
            weeklyData[idx] += s.total || 0;
        }
    });
    const maxBar = Math.max(...weeklyData, 1);

    const fmtRp = (n) => 'Rp ' + Number(n || 0).toLocaleString('id-ID');

    return (
        <main className="page-canvas">
            {/* Page Header */}
            <div className="page-header">
                <div>
                    <h1 className="page-title">Executive Overview</h1>
                    <p className="page-subtitle">Selamat datang. Berikut ringkasan farm-to-finance Anda.</p>
                </div>
                <div className="page-header-actions">
                    <button className="btn btn-secondary" onClick={() => navigate('/products')}>
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>shopping_cart</span>
                        Tambah Pembelian
                    </button>
                    <button className="btn btn-primary" onClick={() => navigate('/sales')}>
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>point_of_sale</span>
                        Penjualan Baru
                    </button>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid-4 mb-xl">
                <div className="kpi-card">
                    <div className="kpi-card-header">
                        <span className="kpi-card-label">Total Penjualan (MTD)</span>
                        <div className="kpi-card-icon"><span className="material-symbols-outlined">trending_up</span></div>
                    </div>
                    <div className="kpi-card-value">{fmtRp(mtdSales)}</div>
                    <div className="kpi-card-trend neutral">
                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>calendar_month</span>
                        Bulan ini
                    </div>
                </div>
                <div className="kpi-card">
                    <div className="kpi-card-header">
                        <span className="kpi-card-label">Total Produk</span>
                        <div className="kpi-card-icon"><span className="material-symbols-outlined">category</span></div>
                    </div>
                    <div className="kpi-card-value">{totalProducts}</div>
                    <div className="kpi-card-trend up">
                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>inventory_2</span>
                        Produk aktif
                    </div>
                </div>
                <div className="kpi-card">
                    <div className="kpi-card-header">
                        <span className="kpi-card-label">Total Stok (Butir)</span>
                        <div className="kpi-card-icon"><span className="material-symbols-outlined">egg</span></div>
                    </div>
                    <div className="kpi-card-value">{totalStock.toLocaleString('id-ID')}</div>
                    <div className={`kpi-card-trend ${lowStock.length > 0 ? 'down' : 'up'}`}>
                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{lowStock.length > 0 ? 'warning' : 'check_circle'}</span>
                        {lowStock.length > 0 ? `${lowStock.length} stok rendah` : 'Stok aman'}
                    </div>
                </div>
                <div className="kpi-card">
                    <div className="kpi-card-header">
                        <span className="kpi-card-label">Transaksi Minggu Ini</span>
                        <div className="kpi-card-icon"><span className="material-symbols-outlined">receipt_long</span></div>
                    </div>
                    <div className="kpi-card-value">{sales.filter(s => { const d = s.date?.toDate?.(); return d && (today - d) < 7 * 86400000; }).length}</div>
                    <div className="kpi-card-trend neutral">
                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>sync</span>
                        Real-time
                    </div>
                </div>
            </div>

            {/* Main Grid: Chart + Alerts */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr minmax(280px, 340px)', gap: 'var(--space-lg)' }} className="resp-grid-main">
                {/* Weekly Sales Chart */}
                <div className="card">
                    <div className="card-header">
                        <span className="card-title">Penjualan Mingguan</span>
                        <span className="text-mono text-muted" style={{ fontSize: 12 }}>{fmtRp(weeklyData.reduce((a, b) => a + b, 0))} total</span>
                    </div>
                    <div className="card-body" ref={chartRef}>
                        <div className="bar-chart-container">
                            {DAYS.map((day, i) => {
                                const pct = maxBar > 0 ? (weeklyData[i] / maxBar) * 100 : 0;
                                return (
                                    <div key={day} className="bar-chart-bar-group">
                                        <div
                                            className="bar-chart-bar"
                                            title={`${day}: ${fmtRp(weeklyData[i])}`}
                                            style={{ height: barsVisible ? `${Math.max(pct, 4)}%` : '4%', transition: 'height 0.6s ease' }}
                                        />
                                        <span className="bar-chart-bar-label">{day}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Stock Alerts */}
                <div className="card">
                    <div className="card-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span className="material-symbols-outlined text-error">warning</span>
                            <span className="card-title">Peringatan Stok</span>
                        </div>
                        <button className="btn btn-secondary" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => navigate('/products')}>
                            Lihat Semua
                        </button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        {lowStock.length === 0 ? (
                            <div style={{ padding: 'var(--space-lg)', textAlign: 'center', color: 'var(--color-on-surface-variant)' }}>
                                <span className="material-symbols-outlined text-success" style={{ fontSize: 40 }}>check_circle</span>
                                <p style={{ marginTop: 8, fontSize: 'var(--fs-body-sm)' }}>Semua stok aman!</p>
                            </div>
                        ) : (
                            lowStock.slice(0, 5).map(p => (
                                <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-md)', borderBottom: '1px solid var(--color-outline-variant)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                        <div style={{ width: 36, height: 36, borderRadius: 'var(--radius-md)', background: 'var(--color-error-container)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <span className="material-symbols-outlined" style={{ color: 'var(--color-on-error-container)', fontSize: 18 }}>egg</span>
                                        </div>
                                        <div>
                                            <div style={{ fontWeight: 600, fontSize: 'var(--fs-body-md)' }}>{p.name}</div>
                                            <div style={{ fontSize: 'var(--fs-body-sm)', color: 'var(--color-on-surface-variant)' }}>{p.category}</div>
                                        </div>
                                    </div>
                                    <div className="text-mono text-error" style={{ fontWeight: 700 }}>{p.stock} pcs</div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            <style>{`
        @media (max-width: 900px) { .resp-grid-main { grid-template-columns: minmax(0, 1fr) !important; } }
      `}</style>
        </main>
    );
}
