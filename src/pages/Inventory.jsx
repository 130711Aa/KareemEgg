import { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useToast } from '../components/Toast';

// Kategori supply bisa diisi bebas — ini hanya saran awal
const CATEGORY_SUGGESTIONS = ['Telur', 'Bensin', 'Pakan', 'Vitamin', 'Vaksin', 'Kardus', 'Plastik'];

const emptyForm = { name: '', category: '', unit: 'pcs', stock: 0, minStock: 0, note: '' };

export default function Inventory() {
    const [items, setItems] = useState([]);
    const [search, setSearch] = useState('');
    const [modal, setModal] = useState(null); // null | 'add' | 'restock'
    const [form, setForm] = useState(emptyForm);
    const [editId, setEditId] = useState(null);
    const [restockQty, setRestockQty] = useState(0);
    const [saving, setSaving] = useState(false);
    const { showToast } = useToast();

    useEffect(() => {
        const unsub = onSnapshot(collection(db, 'inventory'), snap => {
            setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
        return unsub;
    }, []);

    const filtered = items.filter(i =>
        i.name?.toLowerCase().includes(search.toLowerCase()) ||
        i.category?.toLowerCase().includes(search.toLowerCase())
    );

    // Summary stats
    const lowItems = items.filter(i => (i.stock || 0) <= (i.minStock || 0) && i.minStock > 0);
    const outItems = items.filter(i => (i.stock || 0) === 0);

    const openAdd = () => { setForm(emptyForm); setEditId(null); setModal('add'); };
    const openEdit = (item) => {
        setForm({ name: item.name, category: item.category, unit: item.unit || 'pcs', stock: item.stock, minStock: item.minStock || 0, note: item.note || '' });
        setEditId(item.id);
        setModal('add');
    };
    const openRestock = (item) => { setEditId(item.id); setRestockQty(0); setModal('restock'); };
    const closeModal = () => { setModal(null); setSaving(false); };

    const handleSave = async () => {
        if (!form.name) return;
        setSaving(true);
        try {
            const data = { ...form, stock: Number(form.stock), minStock: Number(form.minStock), updatedAt: serverTimestamp() };
            if (!editId) {
                await addDoc(collection(db, 'inventory'), { ...data, createdAt: serverTimestamp() });
                showToast(`${form.name} ditambahkan ke inventory!`);
            } else {
                await updateDoc(doc(db, 'inventory', editId), data);
                showToast(`${form.name} diperbarui!`);
            }
            closeModal();
        } catch { showToast('Gagal menyimpan.', 'error'); setSaving(false); }
    };

    const handleRestock = async () => {
        if (!restockQty || restockQty <= 0) return;
        setSaving(true);
        try {
            const item = items.find(i => i.id === editId);
            const newStock = (item?.stock || 0) + Number(restockQty);
            await updateDoc(doc(db, 'inventory', editId), { stock: newStock, updatedAt: serverTimestamp() });
            showToast(`Stok ${item?.name} bertambah ${restockQty} ${item?.unit}!`);
            closeModal();
        } catch { showToast('Gagal restock.', 'error'); setSaving(false); }
    };

    const getStatus = (item) => {
        if ((item.stock || 0) === 0) return { label: 'Habis', cls: 'badge-error', color: 'var(--color-error)' };
        if (item.minStock > 0 && (item.stock || 0) <= item.minStock) return { label: 'Stok Rendah', cls: 'badge-warning', color: 'var(--color-primary)' };
        return { label: 'Aman', cls: 'badge-success', color: 'var(--color-tertiary)' };
    };

    // Unique categories from existing items (for datalist)
    const existingCategories = [...new Set(items.map(i => i.category).filter(Boolean)), ...CATEGORY_SUGGESTIONS.filter(s => !items.find(i => i.category === s))];

    return (
        <main className="page-canvas">
            <div className="page-header">
                <div>
                    <h1 className="page-title">Inventory</h1>
                    <p className="page-subtitle">Pantau stok bahan & perlengkapan farm.</p>
                </div>
                <div className="page-header-actions">
                    <button className="btn btn-primary" onClick={openAdd}>
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
                        Tambah Item
                    </button>
                </div>
            </div>

            {/* KPI Strip */}
            <div className="grid-3 mb-xl">
                <div className="kpi-card">
                    <div className="kpi-card-header">
                        <span className="kpi-card-label">Total Item</span>
                        <div className="kpi-card-icon"><span className="material-symbols-outlined">inventory_2</span></div>
                    </div>
                    <div className="kpi-card-value">{items.length}</div>
                    <div className="kpi-card-trend neutral">
                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>category</span>
                        Semua kategori
                    </div>
                </div>
                <div className="kpi-card">
                    <div className="kpi-card-header">
                        <span className="kpi-card-label">Stok Rendah</span>
                        <div className="kpi-card-icon" style={{ background: 'rgba(255,193,7,0.15)' }}>
                            <span className="material-symbols-outlined" style={{ color: 'var(--color-primary)' }}>warning</span>
                        </div>
                    </div>
                    <div className="kpi-card-value text-warning">{lowItems.length}</div>
                    <div className="kpi-card-trend down">
                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>arrow_downward</span>
                        Perlu restock
                    </div>
                </div>
                <div className="kpi-card">
                    <div className="kpi-card-header">
                        <span className="kpi-card-label">Stok Habis</span>
                        <div className="kpi-card-icon" style={{ background: 'var(--color-error-container)' }}>
                            <span className="material-symbols-outlined" style={{ color: 'var(--color-on-error-container)' }}>remove_shopping_cart</span>
                        </div>
                    </div>
                    <div className="kpi-card-value text-error">{outItems.length}</div>
                    <div className="kpi-card-trend down">
                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>block</span>
                        Tidak tersedia
                    </div>
                </div>
            </div>

            {/* Alert Banner */}
            {lowItems.length > 0 && (
                <div style={{ background: 'rgba(255,193,7,0.1)', border: '1px solid var(--color-primary-container)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-md) var(--space-lg)', marginBottom: 'var(--space-lg)', display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
                    <span className="material-symbols-outlined" style={{ color: 'var(--color-primary)', fontSize: 24 }}>warning</span>
                    <div>
                        <div style={{ fontWeight: 600, fontSize: 'var(--fs-body-md)' }}>
                            {lowItems.length} item perlu restock segera
                        </div>
                        <div style={{ fontSize: 'var(--fs-body-sm)', color: 'var(--color-on-surface-variant)' }}>
                            {lowItems.map(i => i.name).join(', ')}
                        </div>
                    </div>
                </div>
            )}

            {/* Inventory Table */}
            <div className="card">
                <div className="card-header">
                    <span className="card-title">Daftar Inventory</span>
                    <div className="search-box">
                        <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--color-on-surface-variant)' }}>search</span>
                        <input placeholder="Cari nama atau kategori..." value={search} onChange={e => setSearch(e.target.value)} />
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="data-table" style={{ minWidth: 640 }}>
                        <thead>
                            <tr>
                                <th style={{ paddingLeft: 'var(--space-lg)' }}>Nama Item</th>
                                <th>Kategori</th>
                                <th style={{ textAlign: 'right' }}>Stok</th>
                                <th style={{ textAlign: 'right' }}>Min. Stok</th>
                                <th style={{ textAlign: 'center' }}>Status</th>
                                <th>Catatan</th>
                                <th style={{ textAlign: 'center' }}>Aksi</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.length === 0 ? (
                                <tr>
                                    <td colSpan={7} style={{ textAlign: 'center', padding: 'var(--space-xl)', color: 'var(--color-on-surface-variant)' }}>
                                        <span className="material-symbols-outlined" style={{ fontSize: 48, opacity: 0.3 }}>inventory_2</span>
                                        <p style={{ marginTop: 8 }}>{search ? 'Tidak ditemukan.' : 'Belum ada item. Klik "+ Tambah Item".'}</p>
                                    </td>
                                </tr>
                            ) : filtered.map(item => {
                                const s = getStatus(item);
                                const pct = item.minStock > 0 ? Math.min((item.stock / (item.minStock * 3)) * 100, 100) : 100;
                                return (
                                    <tr key={item.id}>
                                        <td style={{ paddingLeft: 'var(--space-lg)', fontWeight: 500 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                <div style={{ width: 32, height: 32, background: `${s.color}20`, borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                    <span className="material-symbols-outlined" style={{ fontSize: 16, color: s.color }}>
                                                        {item.category?.toLowerCase().includes('bensin') ? 'local_gas_station'
                                                            : item.category?.toLowerCase().includes('telur') ? 'egg'
                                                                : item.category?.toLowerCase().includes('pakan') ? 'grass'
                                                                    : 'inventory_2'}
                                                    </span>
                                                </div>
                                                {item.name}
                                            </div>
                                        </td>
                                        <td>
                                            <span className="badge badge-neutral">{item.category || '—'}</span>
                                        </td>
                                        <td style={{ textAlign: 'right' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                                                <span className={`text-mono ${item.stock === 0 ? 'text-error' : item.minStock > 0 && item.stock <= item.minStock ? 'text-warning' : ''}`} style={{ fontWeight: 600 }}>
                                                    {(item.stock || 0).toLocaleString('id-ID')}
                                                </span>
                                                <span style={{ fontSize: 11, color: 'var(--color-on-surface-variant)' }}>{item.unit}</span>
                                                <div className="stock-bar-track">
                                                    <div className={`stock-bar-fill ${item.stock === 0 ? 'low' : item.minStock > 0 && item.stock <= item.minStock ? 'medium' : 'high'}`} style={{ width: `${pct}%` }} />
                                                </div>
                                            </div>
                                        </td>
                                        <td className="text-mono text-muted" style={{ textAlign: 'right' }}>
                                            {item.minStock > 0 ? `${item.minStock} ${item.unit}` : '—'}
                                        </td>
                                        <td style={{ textAlign: 'center' }}>
                                            <span className={`badge ${s.cls}`}>{s.label}</span>
                                        </td>
                                        <td className="text-muted" style={{ fontSize: 'var(--fs-body-sm)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {item.note || '—'}
                                        </td>
                                        <td style={{ textAlign: 'center' }}>
                                            <div style={{ display: 'flex', justifyContent: 'center', gap: 4 }}>
                                                <button className="btn btn-icon" onClick={() => openRestock(item)} title="Restock" style={{ color: 'var(--color-tertiary)' }}>
                                                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add_shopping_cart</span>
                                                </button>
                                                <button className="btn btn-icon" onClick={() => openEdit(item)} title="Edit">
                                                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>edit</span>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Add/Edit Modal */}
            {modal === 'add' && (
                <div className="modal-overlay" onClick={e => e.target === e.currentTarget && closeModal()}>
                    <div className="modal">
                        <div className="modal-header">
                            <span className="modal-title">{editId ? 'Edit Item' : 'Tambah Item Inventory'}</span>
                            <button className="btn btn-icon" onClick={closeModal}><span className="material-symbols-outlined">close</span></button>
                        </div>
                        <div className="modal-body">
                            <div className="form-group">
                                <label className="form-label">Nama Item *</label>
                                <input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Bensin, Telur Grade A, Pakan..." />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
                                <div className="form-group">
                                    <label className="form-label">Kategori</label>
                                    <input
                                        className="form-input"
                                        list="inv-category-list"
                                        value={form.category}
                                        onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                                        placeholder="Ketik bebas atau pilih..."
                                    />
                                    <datalist id="inv-category-list">
                                        {existingCategories.map(c => <option key={c} value={c} />)}
                                    </datalist>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Satuan</label>
                                    <input
                                        className="form-input"
                                        list="unit-list"
                                        value={form.unit}
                                        onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
                                        placeholder="liter, kg, pcs..."
                                    />
                                    <datalist id="unit-list">
                                        <option value="liter" />
                                        <option value="kg" />
                                        <option value="pcs" />
                                        <option value="karung" />
                                        <option value="pack" />
                                        <option value="botol" />
                                    </datalist>
                                </div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
                                <div className="form-group">
                                    <label className="form-label">Stok Sekarang</label>
                                    <input className="form-input" type="number" min={0} value={form.stock} onChange={e => setForm(f => ({ ...f, stock: e.target.value }))} />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Min. Stok (Alert)</label>
                                    <input className="form-input" type="number" min={0} value={form.minStock} onChange={e => setForm(f => ({ ...f, minStock: e.target.value }))} placeholder="0 = tidak ada alert" />
                                </div>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Catatan</label>
                                <input className="form-input" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="Opsional: pemasok, lokasi, dll." />
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={closeModal}>Batal</button>
                            <button className="btn btn-primary" onClick={handleSave} disabled={saving || !form.name}>
                                {saving ? 'Menyimpan...' : 'Simpan'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Restock Modal */}
            {modal === 'restock' && (() => {
                const item = items.find(i => i.id === editId);
                return (
                    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && closeModal()}>
                        <div className="modal" style={{ maxWidth: 360 }}>
                            <div className="modal-header">
                                <span className="modal-title">Restock: {item?.name}</span>
                                <button className="btn btn-icon" onClick={closeModal}><span className="material-symbols-outlined">close</span></button>
                            </div>
                            <div className="modal-body">
                                <div style={{ textAlign: 'center', padding: 'var(--space-sm) 0' }}>
                                    <div style={{ fontSize: 'var(--fs-body-sm)', color: 'var(--color-on-surface-variant)', marginBottom: 4 }}>Stok saat ini</div>
                                    <div style={{ fontSize: 40, fontWeight: 700, color: 'var(--color-on-surface)' }}>
                                        {item?.stock || 0}
                                        <span style={{ fontSize: 16, color: 'var(--color-on-surface-variant)', marginLeft: 4 }}>{item?.unit}</span>
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Tambah Stok ({item?.unit})</label>
                                    <input
                                        className="form-input"
                                        type="number"
                                        min={1}
                                        value={restockQty}
                                        onChange={e => setRestockQty(e.target.value)}
                                        style={{ textAlign: 'center', fontSize: 24, fontWeight: 700 }}
                                        autoFocus
                                    />
                                </div>
                                {restockQty > 0 && (
                                    <div style={{ textAlign: 'center', fontSize: 'var(--fs-body-sm)', color: 'var(--color-tertiary)', fontWeight: 600 }}>
                                        ✓ Stok baru: {(item?.stock || 0) + Number(restockQty)} {item?.unit}
                                    </div>
                                )}
                            </div>
                            <div className="modal-footer">
                                <button className="btn btn-secondary" onClick={closeModal}>Batal</button>
                                <button className="btn btn-primary" onClick={handleRestock} disabled={saving || !restockQty || restockQty <= 0}>
                                    {saving ? 'Menyimpan...' : 'Konfirmasi Restock'}
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}
        </main>
    );
}
