import { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtRp = (n) => {
    n = n || 0;
    if (n >= 1e9) return 'Rp ' + (n / 1e9).toFixed(1) + 'M';
    if (n >= 1e6) return 'Rp ' + (n / 1e6).toFixed(1) + 'jt';
    if (n >= 1e3) return 'Rp ' + (n / 1e3).toFixed(0) + 'rb';
    return 'Rp ' + n.toFixed(0);
};

const fmtRpExact = (n) => {
    n = n || 0;
    if (n >= 1e9) return 'Rp ' + (n / 1e9).toFixed(1) + 'M';
    if (n >= 1e6) return 'Rp ' + (n / 1e6).toFixed(1) + 'jt';
    return 'Rp ' + Math.round(n).toLocaleString('id-ID');
};

const DAYS_SHORT = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];

const getDateRange = (range, sales = []) => {
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    let start;
    switch (range) {
        case '7D': start = new Date(end); start.setDate(start.getDate() - 6); break;
        case '30D': start = new Date(end); start.setDate(start.getDate() - 29); break;
        case '3M': start = new Date(end); start.setMonth(start.getMonth() - 3); break;
        case '6M': start = new Date(end); start.setMonth(start.getMonth() - 6); break;
        case '1Y': start = new Date(end); start.setFullYear(start.getFullYear() - 1); break;
        case 'ALL': {
            if (sales.length > 0) {
                const oldest = sales.reduce((min, s) => {
                    const d = s.date?.toDate?.();
                    if (!d) return min;
                    return d < min ? d : min;
                }, end);
                start = new Date(oldest.getFullYear(), oldest.getMonth(), oldest.getDate(), 0, 0, 0, 0);
            } else {
                start = new Date(end); start.setDate(start.getDate() - 29);
            }
            break;
        }
        default: start = new Date(end); start.setDate(start.getDate() - 6);
    }
    return { start, end };
};

const getPrevRange = (range, start, sales = []) => {
    if (range === 'ALL') {
        return { prevStart: new Date(0), prevEnd: new Date(0) };
    }
    const duration = (getDateRange(range, sales).end - start);
    const prevEnd = new Date(start.getTime() - 1);
    const prevStart = new Date(prevEnd.getTime() - duration);
    return { prevStart, prevEnd };
};

const trendPct = (curr, prev) => {
    if (prev === 0) return null;
    return Math.round(((curr - prev) / prev) * 100);
};

// Build time-series data points for the line chart
const buildTimeSeries = (sales, range, metric, productFilter) => {
    const { start, end } = getDateRange(range, sales);
    const filtered = sales.filter(s => {
        const d = s.date?.toDate?.();
        if (!d || d < start || d > end) return false;
        if (productFilter !== 'all') {
            return s.items?.some(i => i.id === productFilter || i.name === productFilter);
        }
        return true;
    });

    const days = Math.round((end - start) / 86400000) + 1;
    let buckets;
    let labelFn;

    if (days <= 7) {
        buckets = Array.from({ length: days }, (_, i) => {
            const d = new Date(start);
            d.setDate(d.getDate() + i);
            return { label: d.toLocaleDateString('id-ID', { weekday: 'short' }), key: d.toDateString(), value: 0 };
        });
        labelFn = (d) => d.toDateString();
    } else if (days <= 90) {
        const weeks = Math.ceil(days / 7);
        buckets = Array.from({ length: weeks }, (_, i) => {
            const d = new Date(start);
            d.setDate(d.getDate() + i * 7);
            return { label: `W${i + 1}`, key: i, value: 0 };
        });
        labelFn = (d) => Math.floor((d - start) / (7 * 86400000));
    } else {
        const months = [];
        let cur = new Date(start.getFullYear(), start.getMonth(), 1);
        while (cur <= end) {
            months.push({
                label: cur.toLocaleDateString('id-ID', { month: 'short' }),
                key: `${cur.getFullYear()}-${cur.getMonth()}`,
                value: 0
            });
            cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
        }
        buckets = months;
        labelFn = (d) => `${d.getFullYear()}-${d.getMonth()}`;
    }

    filtered.forEach(s => {
        const d = s.date?.toDate?.();
        if (!d) return;
        const key = labelFn(d);
        const bucket = buckets.find(b => String(b.key) === String(key));
        if (!bucket) return;
        if (metric === 'revenue') {
            let val = s.total || 0;
            if (productFilter !== 'all') {
                val = s.items
                    ?.filter(i => i.id === productFilter || i.name === productFilter)
                    .reduce((sum, i) => sum + (i.price || 0) * (i.qty || 0), 0) || 0;
            }
            bucket.value += val;
        } else {
            let qty = s.items?.reduce((sum, i) => sum + (i.qty || 0), 0) || 0;
            if (productFilter !== 'all') {
                qty = s.items
                    ?.filter(i => i.id === productFilter || i.name === productFilter)
                    .reduce((sum, i) => sum + (i.qty || 0), 0) || 0;
            }
            bucket.value += qty;
        }
    });

    return buckets;
};

// ─── SVG Line Chart ────────────────────────────────────────────────────────────
function LineChart({ data, metric }) {
    if (!data || data.length === 0) return (
        <div className="analytics-empty-chart">Tidak ada data</div>
    );

    const maxVal = Math.max(...data.map(d => d.value), 1);
    const W = 800;
    const H = 200;

    const pointsObj = data.map((d, i) => {
        const x = (i / (data.length - 1 || 1)) * W;
        const y = H - (d.value / maxVal) * H;
        return { x, y, value: d.value, label: d.label };
    });

    // Smooth Bezier Curve generator
    const getSmoothBezierPath = (pts) => {
        if (pts.length === 0) return '';
        if (pts.length === 1) return `M ${pts[0].x},${pts[0].y}`;

        let path = `M ${pts[0].x},${pts[0].y}`;
        const smoothing = 0.15; // Bezier smoothing coefficient

        for (let i = 0; i < pts.length - 1; i++) {
            const p0 = pts[i];
            const p1 = pts[i + 1];

            const pMinus = pts[i - 1] || p0;
            const pPlus = pts[i + 2] || p1;

            const cp1x = p0.x + (p1.x - pMinus.x) * smoothing;
            const cp1y = p0.y + (p1.y - pMinus.y) * smoothing;

            const cp2x = p1.x - (pPlus.x - p0.x) * smoothing;
            const cp2y = p1.y - (pPlus.y - p0.y) * smoothing;

            path += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p1.x},${p1.y}`;
        }
        return path;
    };

    const pathD = getSmoothBezierPath(pointsObj);
    const fillD = pointsObj.length > 0
        ? `${pathD} L ${pointsObj[pointsObj.length - 1].x},${H} L ${pointsObj[0].x},${H} Z`
        : '';

    const yLabels = 4;
    const yTicks = Array.from({ length: yLabels + 1 }, (_, i) => ({
        pct: (i / yLabels) * 100,
        label: metric === 'revenue'
            ? fmtRp((maxVal / yLabels) * (yLabels - i))
            : ((maxVal / yLabels) * (yLabels - i)).toFixed(0)
    }));

    return (
        <div className="analytics-line-chart-wrap" style={{ position: 'relative', marginTop: 12 }}>
            {/* Main Chart Card Canvas with Left/Right Padding to prevent overflow & Y-label collision */}
            <div className="analytics-chart-canvas" style={{ position: 'relative', paddingLeft: 42, paddingRight: 16 }}>
                {/* Chart Grid & Drawing Area */}
                <div className="analytics-chart-draw-area" style={{ position: 'relative', height: H }}>
                    {/* Gridlines */}
                    <div className="analytics-chart-grid" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none' }}>
                        {yTicks.map((t, i) => (
                            <div
                                key={i}
                                className="analytics-grid-row"
                                style={{
                                    position: 'absolute',
                                    top: `${t.pct}%`,
                                    left: 0,
                                    right: 0,
                                    borderTop: i === yLabels ? '1px solid var(--color-outline)' : '1px dashed var(--color-outline-variant)',
                                    height: 0
                                }}
                            >
                                {/* Y-Axis Label positioned outside the chart grid on the left (in the 42px padding area) */}
                                <span
                                    className="analytics-grid-label"
                                    style={{
                                        position: 'absolute',
                                        top: -7,
                                        left: -38,
                                        width: 32,
                                        fontSize: 9,
                                        fontWeight: 600,
                                        color: 'var(--color-on-surface-variant)',
                                        textAlign: 'right',
                                        whiteSpace: 'nowrap'
                                    }}
                                >
                                    {t.label}
                                </span>
                            </div>
                        ))}
                    </div>

                    {/* SVG Line / Path */}
                    <svg
                        viewBox={`0 0 ${W} ${H}`}
                        preserveAspectRatio="none"
                        style={{ width: '100%', height: '100%', display: 'block', overflow: 'visible', position: 'relative', zIndex: 1 }}
                    >
                        <defs>
                            <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="var(--color-primary-container)" stopOpacity="0.4" />
                                <stop offset="100%" stopColor="var(--color-primary-container)" stopOpacity="0" />
                            </linearGradient>
                        </defs>
                        {fillD && <path d={fillD} fill="url(#chartGrad)" />}
                        {pathD && (
                            <path
                                d={pathD}
                                fill="none"
                                stroke="var(--color-primary-fixed-dim)"
                                strokeWidth="2.5"
                                strokeLinejoin="round"
                                strokeLinecap="round"
                                vectorEffect="non-scaling-stroke"
                            />
                        )}
                    </svg>

                    {/* HTML Interactive Dots & Tooltips */}
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none', zIndex: 2 }}>
                        {pointsObj.map((p, i) => {
                            const leftPct = (i / (pointsObj.length - 1 || 1)) * 100;
                            const topPct = (1 - (p.value / maxVal)) * 100;
                            return (
                                <div
                                    key={i}
                                    className="analytics-chart-dot-container"
                                    style={{
                                        position: 'absolute',
                                        left: `${leftPct}%`,
                                        top: `${topPct}%`,
                                        width: 0,
                                        height: 0,
                                        pointerEvents: 'auto'
                                    }}
                                >
                                    <div
                                        className="analytics-chart-dot"
                                        style={{
                                            position: 'absolute',
                                            left: -6,
                                            top: -6,
                                            width: 12,
                                            height: 12,
                                            borderRadius: '50%',
                                            backgroundColor: 'var(--color-surface-container-lowest)',
                                            border: '3px solid var(--color-primary-fixed-dim)',
                                            boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
                                            cursor: 'pointer',
                                            transition: 'transform 0.15s'
                                        }}
                                    />
                                    <div
                                        className="analytics-chart-tooltip"
                                        style={{
                                            position: 'absolute',
                                            bottom: 12,
                                            left: '50%',
                                            transform: 'translateX(-50%)',
                                            backgroundColor: 'var(--color-inverse-surface)',
                                            color: 'var(--color-inverse-on-surface)',
                                            padding: '4px 8px',
                                            borderRadius: 'var(--radius-sm)',
                                            fontSize: 10,
                                            fontWeight: 600,
                                            whiteSpace: 'nowrap',
                                            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                                            opacity: 0,
                                            visibility: 'hidden',
                                            transition: 'opacity 0.15s, visibility 0.15s',
                                            zIndex: 10
                                        }}
                                    >
                                        <div style={{ opacity: 0.8, fontSize: 9 }}>{p.label}</div>
                                        <div>{metric === 'revenue' ? fmtRp(p.value) : `${p.value.toLocaleString('id-ID')} pcs`}</div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* X Labels Container (aligned with the pad-left42 and pad-right16 grid) */}
                <div className="analytics-chart-xlabels" style={{ position: 'relative', height: 20, marginTop: 8 }}>
                    {data.map((d, i) => {
                        const leftPct = (i / (data.length - 1 || 1)) * 100;
                        return (
                            <span
                                key={i}
                                className="analytics-chart-xlabel"
                                style={{
                                    position: 'absolute',
                                    left: `${leftPct}%`,
                                    transform: 'translateX(-50%)',
                                    whiteSpace: 'nowrap',
                                    display: 'inline-block',
                                    textAlign: 'center',
                                    fontSize: 10,
                                    fontWeight: 600,
                                    color: 'var(--color-on-surface-variant)',
                                    letterSpacing: '0.03em',
                                    textTransform: 'uppercase'
                                }}
                            >
                                {d.label}
                            </span>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

// ─── Horizontal Bar ────────────────────────────────────────────────────────────
function HorizBarChart({ data }) {
    if (!data || data.length === 0) return (
        <div className="analytics-empty-chart">Tidak ada data</div>
    );
    const maxVal = Math.max(...data.map(d => d.value), 1);
    return (
        <div className="analytics-horiz-bars">
            {data.map((d, i) => (
                <div key={i} className="analytics-horiz-bar-row">
                    <div className="analytics-horiz-bar-label">{d.name}</div>
                    <div className="analytics-horiz-bar-track">
                        <div
                            className="analytics-horiz-bar-fill"
                            style={{ width: `${(d.value / maxVal) * 100}%` }}
                        />
                    </div>
                    <div className="analytics-horiz-bar-value">{d.value.toLocaleString('id-ID')} pcs</div>
                </div>
            ))}
        </div>
    );
}

// ─── Vertical Bar (Weekday) ────────────────────────────────────────────────────
function WeekdayChart({ data }) {
    const max = Math.max(...data, 1);
    return (
        <div className="analytics-weekday-chart">
            {DAYS_SHORT.map((label, i) => {
                const pct = Math.max((data[i] / max) * 100, data[i] > 0 ? 4 : 0);
                return (
                    <div key={label} className="analytics-weekday-bar-group">
                        <span className="analytics-weekday-bar-value">{data[i] > 0 ? fmtRp(data[i]) : ''}</span>
                        <div className="analytics-weekday-bar" style={{ height: `${pct}%` }} title={`${label}: ${fmtRp(data[i])}`} />
                        <span className="analytics-weekday-bar-label">{label}</span>
                    </div>
                );
            })}
        </div>
    );
}

// ─── Vertical Bar (Daily Profit) ───────────────────────────────────────────────
function DailyProfitChart({ data }) {
    const maxVal = Math.max(...data.map(d => d.value), 1);
    return (
        <div className="analytics-weekday-chart">
            {data.map((d, i) => {
                const pct = Math.max((d.value / maxVal) * 100, d.value > 0 ? 4 : 0);
                return (
                    <div key={i} className="analytics-weekday-bar-group">
                        <span className="analytics-weekday-bar-value" style={{ color: 'var(--color-tertiary)', fontWeight: 600, fontSize: 8 }}>
                            {d.value > 0 ? fmtRpExact(d.value) : ''}
                        </span>
                        <div
                            className="analytics-weekday-bar"
                            style={{
                                height: `${pct}%`,
                                background: 'linear-gradient(to top, rgba(0, 108, 73, 0.12), rgba(0, 108, 73, 0.65))',
                                border: '1px solid rgba(0, 108, 73, 0.25)',
                                borderRadius: 'var(--radius-sm) var(--radius-sm) 0 0'
                            }}
                            title={`${d.label} (${d.dateStr}): ${fmtRpExact(d.value)}`}
                        />
                        <span className="analytics-weekday-bar-label" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.2 }}>
                            <span>{d.label}</span>
                            <span style={{ fontSize: 9, opacity: 0.6 }}>{d.dateStr}</span>
                        </span>
                    </div>
                );
            })}
        </div>
    );
}

// ─── Skeleton ──────────────────────────────────────────────────────────────────
function Skeleton({ style }) {
    return <div className="analytics-skeleton" style={style} />;
}

// ─── Delta Badge ───────────────────────────────────────────────────────────────
function DeltaBadge({ pct }) {
    if (pct === null || pct === undefined) return null;
    const up = pct >= 0;
    return (
        <span className={`analytics-delta ${up ? 'analytics-delta-up' : 'analytics-delta-down'}`}>
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{up ? 'trending_up' : 'trending_down'}</span>
            {up ? '+' : ''}{pct}%
        </span>
    );
}

// ─── Main Component ────────────────────────────────────────────────────────────
const TIME_RANGES = ['7D', '30D', '3M', '6M', '1Y', 'ALL'];

export default function Analytics() {
    const [sales, setSales] = useState([]);
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [timeRange, setTimeRange] = useState('30D');
    const [selectedProduct, setSelectedProduct] = useState('all');
    const [activeMetric, setActiveMetric] = useState('revenue');

    useEffect(() => {
        const unsub1 = onSnapshot(collection(db, 'sales'), snap => {
            setSales(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setLoading(false);
        });
        const unsub2 = onSnapshot(collection(db, 'products'), snap => {
            setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
        return () => { unsub1(); unsub2(); };
    }, []);

    // Filtered window
    const { start, end } = useMemo(() => getDateRange(timeRange, sales), [timeRange, sales]);
    const { prevStart, prevEnd } = useMemo(() => getPrevRange(timeRange, start, sales), [timeRange, start, sales]);

    const filteredSales = useMemo(() => sales.filter(s => {
        const d = s.date?.toDate?.();
        if (!d || d < start || d > end) return false;
        if (selectedProduct !== 'all') return s.items?.some(i => i.id === selectedProduct || i.name === selectedProduct);
        return true;
    }), [sales, start, end, selectedProduct]);

    const prevSales = useMemo(() => sales.filter(s => {
        const d = s.date?.toDate?.();
        if (!d || d < prevStart || d > prevEnd) return false;
        if (selectedProduct !== 'all') return s.items?.some(i => i.id === selectedProduct || i.name === selectedProduct);
        return true;
    }), [sales, prevStart, prevEnd, selectedProduct]);

    // KPIs
    const kpis = useMemo(() => {
        const revenue = filteredSales.reduce((s, sale) => s + (sale.total || 0), 0);
        const orders = filteredSales.length;
        const qtySold = filteredSales.reduce((s, sale) => s + (sale.items?.reduce((a, i) => a + (i.qty || 0), 0) || 0), 0);
        const totalStock = products.reduce((s, p) => s + Number(p.stock || 0), 0);

        const prevRevenue = prevSales.reduce((s, sale) => s + (sale.total || 0), 0);
        const prevOrders = prevSales.length;
        const prevQty = prevSales.reduce((s, sale) => s + (sale.items?.reduce((a, i) => a + (i.qty || 0), 0) || 0), 0);

        return {
            revenue, orders, qtySold, totalStock,
            revenueDelta: trendPct(revenue, prevRevenue),
            ordersDelta: trendPct(orders, prevOrders),
            qtyDelta: trendPct(qtySold, prevQty),
        };
    }, [filteredSales, prevSales, products]);

    // Trend line series
    const timeSeries = useMemo(() =>
        buildTimeSeries(sales, timeRange, activeMetric, selectedProduct),
        [sales, timeRange, activeMetric, selectedProduct]
    );

    // Best sellers
    const bestSellers = useMemo(() => {
        const map = {};
        filteredSales.forEach(sale => {
            sale.items?.forEach(item => {
                const key = item.name || item.id;
                map[key] = (map[key] || 0) + (item.qty || 0);
            });
        });
        return Object.entries(map)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 5);
    }, [filteredSales]);

    // Weekday distribution
    const weekdayData = useMemo(() => {
        const arr = [0, 0, 0, 0, 0, 0, 0]; // Mon..Sun
        filteredSales.forEach(sale => {
            const d = sale.date?.toDate?.();
            if (!d) return;
            const dow = d.getDay(); // 0=Sun
            const idx = dow === 0 ? 6 : dow - 1; // Mon=0..Sun=6
            arr[idx] += sale.total || 0;
        });
        return arr;
    }, [filteredSales]);

    // Daily Profit for the last 7 days
    const dailyProfitData = useMemo(() => {
        const result = [];
        const now = new Date();
        for (let i = 6; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i, 0, 0, 0, 0);
            const dEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i, 23, 59, 59, 999);

            // Filter sales on this specific day
            const daySales = sales.filter(s => {
                const sDate = s.date?.toDate?.();
                return sDate && sDate >= d && sDate <= dEnd;
            });

            // Calculate gross profit: total sale revenue - buying cost
            let profit = 0;
            daySales.forEach(sale => {
                let saleProfit = 0;
                sale.items?.forEach(item => {
                    const prod = products.find(p => p.id === item.id);
                    const buyPrice = item.buyPrice !== undefined ? item.buyPrice : (prod?.buyPrice || 0);
                    const sellPrice = item.price || 0;
                    saleProfit += item.qty * (sellPrice - buyPrice);
                });
                profit += saleProfit;
            });

            result.push({
                date: d,
                label: d.toLocaleDateString('id-ID', { weekday: 'short' }),
                dateStr: `${d.getDate()}/${d.getMonth() + 1}`,
                value: profit
            });
        }
        return result;
    }, [sales, products]);

    // Product list for filter
    const productOptions = useMemo(() => {
        const names = new Map();
        products.forEach(p => names.set(p.id, p.name));
        return Array.from(names.entries()).map(([id, name]) => ({ id, name }));
    }, [products]);

    const hasData = filteredSales.length > 0;

    return (
        <main className="page-canvas">
            {/* Header */}
            <div className="page-header">
                <div>
                    <h1 className="page-title">Analytics</h1>
                    <p className="page-subtitle">Visualisasi performa penjualan dan stok bisnis Anda.</p>
                </div>
            </div>

            {/* ── Global Filters ── */}
            <div className="analytics-filters">
                <div className="analytics-filter-group">
                    <div className="analytics-filter-tabs">
                        {TIME_RANGES.map(r => (
                            <button
                                key={r}
                                className={`analytics-filter-tab${timeRange === r ? ' active' : ''}`}
                                onClick={() => setTimeRange(r)}
                            >
                                {r}
                            </button>
                        ))}
                    </div>
                    <select
                        className="analytics-product-select"
                        value={selectedProduct}
                        onChange={e => setSelectedProduct(e.target.value)}
                    >
                        <option value="all">All Products</option>
                        {productOptions.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* ── KPI Cards ── */}
            <div className="grid-4 mb-xl">
                {/* Revenue */}
                <div className="kpi-card">
                    <div className="kpi-card-header">
                        <span className="kpi-card-label">Revenue</span>
                        <div className="kpi-card-icon"><span className="material-symbols-outlined">attach_money</span></div>
                    </div>
                    {loading ? <Skeleton style={{ height: 36, width: '70%', marginBottom: 8 }} /> : (
                        <>
                            <div className="kpi-card-value">{fmtRp(kpis.revenue)}</div>
                            <div className="kpi-card-trend neutral">
                                <DeltaBadge pct={kpis.revenueDelta} />
                                <span style={{ color: 'var(--color-on-surface-variant)', fontSize: 12 }}>vs sebelumnya</span>
                            </div>
                        </>
                    )}
                </div>
                {/* Orders */}
                <div className="kpi-card">
                    <div className="kpi-card-header">
                        <span className="kpi-card-label">Orders</span>
                        <div className="kpi-card-icon"><span className="material-symbols-outlined">receipt_long</span></div>
                    </div>
                    {loading ? <Skeleton style={{ height: 36, width: '50%', marginBottom: 8 }} /> : (
                        <>
                            <div className="kpi-card-value">{kpis.orders.toLocaleString('id-ID')}</div>
                            <div className="kpi-card-trend neutral">
                                <DeltaBadge pct={kpis.ordersDelta} />
                                <span style={{ color: 'var(--color-on-surface-variant)', fontSize: 12 }}>vs sebelumnya</span>
                            </div>
                        </>
                    )}
                </div>
                {/* Qty Sold */}
                <div className="kpi-card">
                    <div className="kpi-card-header">
                        <span className="kpi-card-label">Quantity Sold</span>
                        <div className="kpi-card-icon"><span className="material-symbols-outlined">egg</span></div>
                    </div>
                    {loading ? <Skeleton style={{ height: 36, width: '60%', marginBottom: 8 }} /> : (
                        <>
                            <div className="kpi-card-value">{kpis.qtySold.toLocaleString('id-ID')} <span style={{ fontSize: 14, fontWeight: 400, color: 'var(--color-on-surface-variant)' }}>pcs</span></div>
                            <div className="kpi-card-trend neutral">
                                <DeltaBadge pct={kpis.qtyDelta} />
                                <span style={{ color: 'var(--color-on-surface-variant)', fontSize: 12 }}>vs sebelumnya</span>
                            </div>
                        </>
                    )}
                </div>
                {/* Stock */}
                <div className="kpi-card">
                    <div className="kpi-card-header">
                        <span className="kpi-card-label">Current Stock</span>
                        <div className="kpi-card-icon"><span className="material-symbols-outlined">inventory_2</span></div>
                    </div>
                    {loading ? <Skeleton style={{ height: 36, width: '60%', marginBottom: 8 }} /> : (
                        <>
                            <div className="kpi-card-value">{kpis.totalStock.toLocaleString('id-ID')} <span style={{ fontSize: 14, fontWeight: 400, color: 'var(--color-on-surface-variant)' }}>pcs</span></div>
                            <div className="kpi-card-trend neutral">
                                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>warehouse</span>
                                Total semua produk
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* ── Trend Chart ── */}
            <div className="card mb-xl">
                <div className="card-header">
                    <span className="card-title">Trend Metrik</span>
                    <div className="analytics-metric-tabs">
                        <button
                            className={`analytics-metric-tab${activeMetric === 'revenue' ? ' active' : ''}`}
                            onClick={() => setActiveMetric('revenue')}
                        >Revenue</button>
                        <button
                            className={`analytics-metric-tab${activeMetric === 'qty' ? ' active' : ''}`}
                            onClick={() => setActiveMetric('qty')}
                        >Qty Sold</button>
                    </div>
                </div>
                <div className="card-body" style={{ padding: 'var(--space-md) var(--space-lg) var(--space-lg)' }}>
                    {loading ? (
                        <Skeleton style={{ height: 220, borderRadius: 8 }} />
                    ) : !hasData ? (
                        <div className="analytics-empty-state">
                            <span className="material-symbols-outlined">bar_chart_off</span>
                            <p>Tidak ada data penjualan pada periode ini.</p>
                            <span>Coba ubah rentang waktu yang dipilih.</span>
                        </div>
                    ) : (
                        <LineChart data={timeSeries} metric={activeMetric} />
                    )}
                </div>
            </div>

            {/* ── Bottom Grid: Best Sellers + Weekday ── */}
            <div className="analytics-bottom-grid">
                {/* Best Selling */}
                <div className="card">
                    <div className="card-header">
                        <span className="card-title">Best Selling Products</span>
                        <span style={{ fontSize: 12, color: 'var(--color-on-surface-variant)' }}>by Qty Sold</span>
                    </div>
                    <div className="card-body" style={{ padding: 'var(--space-md) var(--space-lg) var(--space-lg)' }}>
                        {loading ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                {[1, 2, 3].map(i => <Skeleton key={i} style={{ height: 28 }} />)}
                            </div>
                        ) : bestSellers.length === 0 ? (
                            <div className="analytics-empty-state">
                                <span className="material-symbols-outlined">trending_flat</span>
                                <p>Belum ada data penjualan.</p>
                            </div>
                        ) : (
                            <HorizBarChart data={bestSellers} />
                        )}
                    </div>
                </div>

                {/* Sales by Weekday */}
                <div className="card">
                    <div className="card-header">
                        <span className="card-title">Penjualan per Hari</span>
                        <span style={{ fontSize: 12, color: 'var(--color-on-surface-variant)' }}>Revenue</span>
                    </div>
                    <div className="card-body" style={{ padding: 'var(--space-md) var(--space-lg) var(--space-lg)' }}>
                        {loading ? (
                            <Skeleton style={{ height: 180, borderRadius: 8 }} />
                        ) : !hasData ? (
                            <div className="analytics-empty-state">
                                <span className="material-symbols-outlined">calendar_today</span>
                                <p>Belum ada data.</p>
                            </div>
                        ) : (
                            <WeekdayChart data={weekdayData} />
                        )}
                    </div>
                </div>

                {/* Daily Profit (Last 7 Days) */}
                <div className="card">
                    <div className="card-header">
                        <span className="card-title">Keuntungan 7 Hari Terakhir</span>
                        <span style={{ fontSize: 12, color: 'var(--color-on-surface-variant)' }}>Gross Profit</span>
                    </div>
                    <div className="card-body" style={{ padding: 'var(--space-md) var(--space-lg) var(--space-lg)' }}>
                        {loading ? (
                            <Skeleton style={{ height: 180, borderRadius: 8 }} />
                        ) : dailyProfitData.length === 0 ? (
                            <div className="analytics-empty-state">
                                <span className="material-symbols-outlined">trending_flat</span>
                                <p>Belum ada data keuntungan.</p>
                            </div>
                        ) : (
                            <DailyProfitChart data={dailyProfitData} />
                        )}
                    </div>
                </div>
            </div>
        </main>
    );
}
