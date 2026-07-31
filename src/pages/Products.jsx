import { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useToast } from '../components/Toast';

const CATEGORIES = ['Semua', 'Premium', 'Free Range', 'Specialty', 'Standard', 'Bulk'];
const PAGE_SIZE = 10;

const emptyForm = { name: '', sku: '', category: 'Standard', stock: 0, buyPrice: 0, sellPrice: 0, status: 'In Stock' };

export default function Products() {
    const [products, setProducts] = useState([]);
    const [search, setSearch] = useState('');
    const [catFilter, setCatFilter] = useState('Semua');
    const [page, setPage] = useState(0);
    const [modal, setModal] = useState(null); // null | 'add' | 'edit'
    const [form, setForm] = useState(emptyForm);
    const [editId, setEditId] = useState(null);
    const [saving, setSaving] = useState(false);
    const { showToast } = useToast();

    useEffect(() => {
        const unsub = onSnapshot(collection(db, 'products'), snap => {
            setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
        return unsub;
    }, []);

    const filtered = products.filter(p => {
        const matchSearch = p.name?.toLowerCase().includes(search.toLowerCase()) || p.sku?.toLowerCase().includes(search.toLowerCase());
        const matchCat = catFilter === 'Semua' || p.category === catFilter;
        return matchSearch && matchCat;
    });

    const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
    const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

    const openAdd = () => { setForm(emptyForm); setEditId(null); setModal('add'); };
    const openEdit = (p) => { setForm({ name: p.name, sku: p.sku, category: p.category, stock: p.stock, buyPrice: p.buyPrice, sellPrice: p.sellPrice, status: p.status }); setEditId(p.id); setModal('edit'); };
    const closeModal = () => { setModal(null); setForm(emptyForm); setSaving(false); };

    const handleSave = async () => {
        if (!form.name || !form.sku) return;
        setSaving(true);
        try {
            const data = { ...form, stock: Number(form.stock), buyPrice: Number(form.buyPrice), sellPrice: Number(form.sellPrice), updatedAt: serverTimestamp() };
            if (modal === 'add') {
                await addDoc(collection(db, 'products'), { ...data, createdAt: serverTimestamp() });
                showToast('Produk berhasil ditambahkan!');
            } else {
                await updateDoc(doc(db, 'products', editId), data);
                showToast('Produk berhasil diperbarui!');
            }
            closeModal();
        } catch (e) {
            showToast('Gagal menyimpan produk.', 'error');
            setSaving(false);
        }
    };

    const handleDelete = async (id) => {
        if (!confirm('Hapus produk ini?')) return;
        try {
            await deleteDoc(doc(db, 'products', id));
            showToast('Produk dihapus.');
        } catch { showToast('Gagal menghapus.', 'error'); }
    };

    const getStockStatus = (stockVal) => {
        const stock = Number(stockVal || 0);
        if (stock === 0) return { label: 'Habis', cls: 'badge-error', barCls: 'low', pct: 0 };
        if (stock < 100) {
            const pct = 10 + (stock / 100) * 40;
            return { label: 'Stok Rendah', cls: 'badge-warning', barCls: 'medium', pct };
        }
        const pct = 50 + Math.min(((stock - 100) / 4900) * 50, 50);
        return { label: 'Tersedia', cls: 'badge-success', barCls: 'high', pct };
    };
    const fmtRp = (n) => 'Rp ' + Number(n || 0).toLocaleString('id-ID');
    const lowStockCount = products.filter(p => Number(p.stock || 0) < 100).length;

    return (
        <main className="page-canvas">
            <div className="page-header">
                <div>
                    <h1 className="page-title">Produk</h1>
                    <p className="page-subtitle">Kelola katalog, stok, dan harga telur.</p>
                </div>
                <div className="page-header-actions">
                    <button className="btn btn-secondary">
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>filter_list</span>
                        Filter
                    </button>
                    <button className="btn btn-primary" onClick={openAdd}>
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
                        Tambah Produk
                    </button>
                </div>
            </div>

            {/* Metric Cards */}
            <div className="grid-2 mb-xl">
                <div className="kpi-card">
                    <div className="kpi-card-header">
                        <span className="kpi-card-label">Total Produk</span>
                        <div className="kpi-card-icon"><span className="material-symbols-outlined">category</span></div>
                    </div>
                    <div className="kpi-card-value">{products.length}</div>
                </div>
                <div className="kpi-card">
                    <div className="kpi-card-header">
                        <span className="kpi-card-label">Peringatan Stok</span>
                        <div className="kpi-card-icon" style={{ background: 'var(--color-error-container)' }}>
                            <span className="material-symbols-outlined" style={{ color: 'var(--color-on-error-container)' }}>warning</span>
                        </div>
                    </div>
                    <div className="kpi-card-value text-error">{lowStockCount}</div>
                </div>
            </div>

            {/* Data Table */}
            <div className="card">
                <div className="card-header">
                    <span className="card-title">Katalog Produk</span>
                    <div className="search-box">
                        <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--color-on-surface-variant)' }}>search</span>
                        <input placeholder="Cari SKU atau nama..." value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} />
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="data-table" style={{ minWidth: 700 }}>
                        <thead>
                            <tr>
                                <th style={{ paddingLeft: 'var(--space-lg)' }}>Nama Produk</th>
                                <th>SKU</th>
                                <th>Kategori</th>
                                <th style={{ textAlign: 'right' }}>Stok</th>
                                <th style={{ textAlign: 'right' }}>Harga Beli</th>
                                <th style={{ textAlign: 'right' }}>Harga Jual</th>
                                <th style={{ textAlign: 'center' }}>Status</th>
                                <th style={{ textAlign: 'center' }}>Aksi</th>
                            </tr>
                        </thead>
                        <tbody>
                            {paged.length === 0 ? (
                                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 'var(--space-xl)', color: 'var(--color-on-surface-variant)' }}>
                                    {search ? 'Tidak ada produk ditemukan.' : 'Belum ada produk. Klik "+ Tambah Produk".'}
                                </td></tr>
                            ) : paged.map(p => {
                                const s = getStockStatus(p.stock);
                                return (
                                    <tr key={p.id}>
                                        <td style={{ paddingLeft: 'var(--space-lg)' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                <div style={{ width: 32, height: 32, background: 'var(--color-surface-variant)', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>egg</span>
                                                </div>
                                                <span style={{ fontWeight: 500 }}>{p.name}</span>
                                            </div>
                                        </td>
                                        <td className="text-muted text-mono">{p.sku}</td>
                                        <td>{p.category}</td>
                                        <td style={{ textAlign: 'right' }}>
                                            <div className="stock-bar" style={{ justifyContent: 'flex-end' }}>
                                                <span className={`text-mono ${s.barCls === 'low' ? 'text-error' : s.barCls === 'medium' ? 'text-warning' : ''}`}>{Number(p.stock || 0).toLocaleString('id-ID')}</span>
                                                <div className="stock-bar-track">
                                                    <div className={`stock-bar-fill ${s.barCls}`} style={{ width: `${s.pct}%` }} />
                                                </div>
                                            </div>
                                        </td>
                                        <td className="text-mono text-muted" style={{ textAlign: 'right' }}>{fmtRp(p.buyPrice)}</td>
                                        <td className="text-mono" style={{ textAlign: 'right', fontWeight: 500 }}>{fmtRp(p.sellPrice)}</td>
                                        <td style={{ textAlign: 'center' }}>
                                            <span className={`badge ${s.cls}`}>{s.label}</span>
                                        </td>
                                        <td style={{ textAlign: 'center' }}>
                                            <div style={{ display: 'flex', justifyContent: 'center', gap: 4 }}>
                                                <button className="btn btn-icon" onClick={() => openEdit(p)} title="Edit">
                                                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>edit</span>
                                                </button>
                                                <button className="btn btn-icon" onClick={() => handleDelete(p.id)} title="Hapus" style={{ color: 'var(--color-error)' }}>
                                                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                {/* Pagination */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--space-sm) var(--space-lg)', borderTop: '1px solid var(--color-outline-variant)', fontSize: 'var(--fs-body-sm)', color: 'var(--color-on-surface-variant)' }}>
                    <span>Menampilkan {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} dari {filtered.length} produk</span>
                    <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-icon" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>chevron_left</span>
                        </button>
                        <button className="btn btn-icon" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>chevron_right</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Add/Edit Modal */}
            {modal && (
                <div className="modal-overlay" onClick={e => e.target === e.currentTarget && closeModal()}>
                    <div className="modal">
                        <div className="modal-header">
                            <span className="modal-title">{modal === 'add' ? 'Tambah Produk' : 'Edit Produk'}</span>
                            <button className="btn btn-icon" onClick={closeModal}><span className="material-symbols-outlined">close</span></button>
                        </div>
                        <div className="modal-body">
                            <div className="form-group">
                                <label className="form-label">Nama Produk *</label>
                                <input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Telur Omega 3 Grade A" />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
                                <div className="form-group">
                                    <label className="form-label">SKU *</label>
                                    <input className="form-input" value={form.sku} onChange={e => setForm(f => ({ ...f, sku: e.target.value }))} placeholder="EGG-OM-A-001" />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Kategori</label>
                                    <select className="form-input form-select" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                                        {CATEGORIES.slice(1).map(c => <option key={c}>{c}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Stok (Jumlah)</label>
                                <input className="form-input" type="number" min={0} value={form.stock} onChange={e => setForm(f => ({ ...f, stock: e.target.value }))} />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
                                <div className="form-group">
                                    <label className="form-label">Harga Beli (Rp)</label>
                                    <input className="form-input" type="number" min={0} value={form.buyPrice} onChange={e => setForm(f => ({ ...f, buyPrice: e.target.value }))} />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Harga Jual (Rp)</label>
                                    <input className="form-input" type="number" min={0} value={form.sellPrice} onChange={e => setForm(f => ({ ...f, sellPrice: e.target.value }))} />
                                </div>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={closeModal}>Batal</button>
                            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                                {saving ? 'Menyimpan...' : 'Simpan Produk'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}
