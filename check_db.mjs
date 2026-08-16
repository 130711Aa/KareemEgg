import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, collection, getDocs } from 'firebase/firestore';

const firebaseConfig = {
    apiKey: "AIzaSyDiN72MemulwLnhjcZvs1mEGScHf8RziOY",
    authDomain: "kareeemegg.firebaseapp.com",
    projectId: "kareeemegg",
    storageBucket: "kareeemegg.firebasestorage.app",
    messagingSenderId: "347473812639",
    appId: "1:347473812639:web:f06ca2d65b8fbbb06296aa",
};
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Helper
const rp = (n) => `Rp ${Number(n || 0).toLocaleString('id-ID')}`;

// ─── 1. Saldo Awal ────────────────────────────────────────────────────────────
const settingsSnap = await getDoc(doc(db, 'settings', 'initial_balances'));
const initBal = settingsSnap.exists() ? settingsSnap.data() : {};
const initialCap = Object.values(initBal).reduce((s, v) => s + (v || 0), 0);
console.log('\n=== SALDO AWAL ===');
Object.entries(initBal).forEach(([k, v]) => console.log(`  ${k}: ${rp(v)}`));
console.log(`  TOTAL: ${rp(initialCap)}`);

// ─── 2. Produk ───────────────────────────────────────────────────────────────
const prodSnap = await getDocs(collection(db, 'products'));
const products = prodSnap.docs.map(d => ({ id: d.id, ...d.data() }));
console.log('\n=== PRODUK (stok × hargaBeli) ===');
let inventoryValue = 0;
products.forEach(p => {
    const iv = (p.stock || 0) * (p.buyPrice || 0);
    inventoryValue += iv;
    console.log(`  ${p.name}: stok=${p.stock}, buyPrice=${rp(p.buyPrice)}, sellPrice=${rp(p.sellPrice)}, nilai_stok=${rp(iv)}`);
});
console.log(`  TOTAL INVENTORY VALUE: ${rp(inventoryValue)}`);

// ─── 3. Semua Transaksi ────────────────────────────────────────────────────
const txnSnap = await getDocs(collection(db, 'transactions'));
const transactions = txnSnap.docs.map(d => ({ id: d.id, ...d.data() }));
console.log('\n=== SEMUA TRANSAKSI ===');
let totalIncome = 0, totalExpense = 0, totalCapIn = 0, totalCapOut = 0;
let totalCash = initialCap;
transactions.forEach(t => {
    if (t.status !== 'Completed') return;
    const amt = t.amount || 0;
    if (t.type === 'income') { totalIncome += amt; totalCash += amt; }
    if (t.type === 'expense') { totalExpense += amt; totalCash -= amt; }
    if (t.type === 'capital_in') { totalCapIn += amt; totalCash += amt; }
    if (t.type === 'capital_out') { totalCapOut += amt; totalCash -= amt; }
    console.log(`  [${t.type.toUpperCase()}] ${rp(amt)} | cat: ${t.category || '-'} | ket: ${t.description || '-'}`);
});
console.log(`\nTotalCash (saldo uang sekarang): ${rp(totalCash)}`);
console.log(`InventoryValue (stok sisa): ${rp(inventoryValue)}`);
const totalAssets = totalCash + inventoryValue;
console.log(`TOTAL ASET: ${rp(totalAssets)}`);

// ─── 4. Modal ─────────────────────────────────────────────────────────────
const currInv = initialCap + totalCapIn - totalCapOut;
console.log(`\nModal/Investasi (currInv): ${rp(currInv)}`);
console.log(`  = saldo_awal(${rp(initialCap)}) + kapital_masuk(${rp(totalCapIn)}) - kapital_keluar(${rp(totalCapOut)})`);

// ─── 5. Net Profit (cara app) ────────────────────────────────────────────
const netProfitApp = totalAssets - currInv;
console.log(`\nNET PROFIT (cara app) = TotalAset - Modal = ${rp(netProfitApp)}`);

// ─── 6. Net Profit cara user (Income - Expense) ──────────────────────────
const netCashflow = totalIncome - totalExpense;
console.log(`\n=== CARA INCOME STATEMENT ===`);
console.log(`  Total Income (penjualan): ${rp(totalIncome)}`);
console.log(`  Total Expense: ${rp(totalExpense)}`);
console.log(`  Net Cashflow (Income - Expense): ${rp(netCashflow)}`);

// ─── 7. COGS dari sales ──────────────────────────────────────────────────
const salesSnap = await getDocs(collection(db, 'sales'));
const sales = salesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
console.log('\n=== DATA PENJUALAN ===');
let totalRevenue = 0, totalCOGS = 0, totalQtySold = 0;
sales.forEach(s => {
    const rev = s.total || 0;
    totalRevenue += rev;
    s.items?.forEach(item => {
        const prod = products.find(p => p.id === item.id);
        const buyPr = item.buyPrice !== undefined ? item.buyPrice : (prod?.buyPrice || 0);
        const cogs = (item.qty || 0) * buyPr;
        totalCOGS += cogs;
        totalQtySold += item.qty || 0;
    });
    const dateStr = s.date?.toDate?.()?.toLocaleDateString('id-ID') || '?';
    console.log(`  [${dateStr}] Total: ${rp(rev)} | Items: ${s.items?.map(i => `${i.name} x${i.qty}`).join(', ')}`);
});

const grossProfit = totalRevenue - totalCOGS;
const netProfitIS = grossProfit - totalExpense; // income statement way
console.log(`\nTotal Revenue: ${rp(totalRevenue)}`);
console.log(`Total COGS (qty × buyPrice): ${rp(totalCOGS)}`);
console.log(`Gross Profit (Revenue - COGS): ${rp(grossProfit)}`);
console.log(`Total Expense (OpEx): ${rp(totalExpense)}`);
console.log(`Net Profit Income Statement (GrossProfit - OpEx): ${rp(netProfitIS)}`);

// ─── 8. Rekonsiliasi ─────────────────────────────────────────────────────
console.log('\n=== REKONSILIASI SELISIH ===');
console.log(`Net Profit App (Balance Sheet):       ${rp(netProfitApp)}`);
console.log(`Net Profit User (Margin × Qty = ${43} × ${3500}): ${rp(43 * 3500)}`);
console.log(`Selisih:                              ${rp(netProfitApp - 43 * 3500)}`);
console.log(`\nKemungkinan penyebab selisih:`);
console.log(`  + InventoryValue stok sisa:         ${rp(inventoryValue)}`);
console.log(`  - Expense (sudah masuk ke COGS?):   ${rp(totalExpense)}`);
console.log(`  + CapitalIn (tambahan modal):        ${rp(totalCapIn)}`);

process.exit(0);
