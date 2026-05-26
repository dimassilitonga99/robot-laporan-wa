const express = require('express');
const axios   = require('axios');
const app     = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const FONNTE_TOKEN = process.env.FONNTE_TOKEN;

const TOKO = {
  'nk'     : 'Nasional Kitchen',
  'tdm'    : 'Perabot Mama TDM',
  'osp' : 'Perabot Mama Oesapa',
  'kefa'   : 'Perabot Mamaku Kefamenanu'
};

async function kirimWA(target, message) {
  try {
    await axios.post('https://api.fonnte.com/send',
      { target, message },
      { headers: { Authorization: FONNTE_TOKEN } }
    );
  } catch (e) {
    console.error('Gagal kirim WA:', e?.response?.data || e.message);
  }
}

function formatRupiah(angka) {
  const n = parseInt(angka) || 0;
  if (n === 0) return 'Rp. -';
  return 'Rp. ' + n.toLocaleString('id-ID');
}

function formatRupiahPlain(angka) {
  return 'Rp ' + (parseInt(angka) || 0).toLocaleString('id-ID');
}

function getSapaan(namaToko) {
  const jam = new Date(Date.now() + 8 * 60 * 60 * 1000).getUTCHours();
  let waktu;
  if      (jam >= 5  && jam < 11) waktu = 'Pagi';
  else if (jam >= 11 && jam < 15) waktu = 'Siang';
  else if (jam >= 15 && jam < 18) waktu = 'Sore';
  else waktu = 'Malam';
  return `Selamat ${waktu} Team ${namaToko}`;
}

function getTanggal(isKemarin) {
  const wib = new Date(Date.now() + 8 * 60 * 60 * 1000);
  if (isKemarin) wib.setDate(wib.getDate() - 1);
  return wib.toLocaleDateString('id-ID', {
    day: 'numeric', month: 'long', year: 'numeric'
  });
}

// ── MENU 1: Laporan Penjualan ──────────────────────────
function parseDataPenjualan(text) {
  const data = {};
  const lines = text.trim().toLowerCase().split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed === 'kemarin') { data.kemarin = true; continue; }
    if (TOKO[trimmed]) { data.toko = trimmed; continue; }
    const parts = trimmed.split(/\s+/);
    if (parts.length >= 2) {
      const val = parts[1].replace(/[^0-9]/g, '');
      if (val) data[parts[0]] = val;
    }
  }
  return data;
}

function buatLaporanPenjualan(data) {
  const isKemarin = data.kemarin === true;
  const tgl       = getTanggal(isKemarin);
  const labelTgl  = isKemarin ? `📅 *${tgl}* _(kemarin)_` : `📅 *${tgl}*`;
  const kodeToko  = data.toko || 'nk';
  const namaToko  = TOKO[kodeToko] || TOKO['nk'];

  const k1 = parseInt(data.k1 || 0);
  const k2 = parseInt(data.k2 || 0);
  const k3 = parseInt(data.k3 || 0);
  const total  = k1 + k2 + k3;
  const tunai  = parseInt(data.tunai  || 0);
  const debit  = parseInt(data.debit  || 0);
  const kredit = parseInt(data.kredit || 0);
  const ecer   = parseInt(data.ecer   || 0);
  const grosir = parseInt(data.grosir || 0);

  let kassamsg = '';
  if (k1) kassamsg += `• Kassa 1 : ${formatRupiahPlain(k1)}\n`;
  if (k2) kassamsg += `• Kassa 2 : ${formatRupiahPlain(k2)}\n`;
  if (k3) kassamsg += `• Kassa 3 : ${formatRupiahPlain(k3)}\n`;
  if (!kassamsg) kassamsg = '• -\n';

  return `━━━━━━━━━━━━━━━━━━
📊 *LAPORAN PENJUALAN HARIAN*
🏪 *Toko ${namaToko}*
━━━━━━━━━━━━━━━━━━
${labelTgl}

💰 *PENJUALAN PER KASSA*
${kassamsg}
📦 *TOTAL KESELURUHAN*
${formatRupiahPlain(total)}

💳 *METODE PEMBAYARAN*
• Tunai  : ${formatRupiahPlain(tunai)}
• Debit  : ${formatRupiahPlain(debit)}
• Kredit : ${formatRupiahPlain(kredit)}

🛒 *JENIS PENJUALAN*
• Ecer   : ${formatRupiahPlain(ecer)}
• Grosir : ${formatRupiahPlain(grosir)}
━━━━━━━━━━━━━━━━━━
_Laporan otomatis_`;
}

// ── MENU 2: Laporan Harga Barang ──────────────────────
function parseDataHarga(text) {
  const lines = text.trim().split('\n');
  const data  = { toko: 'nk', kemarin: false, baru: [], naik: [], turun: [], note: [] };
  let mode = null;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const lower = trimmed.toLowerCase();
    if (lower.startsWith('harga ')) {
      const kode = lower.replace('harga ', '').trim();
      if (TOKO[kode]) data.toko = kode;
      continue;
    }
    if (lower === 'kemarin') { data.kemarin = true; continue; }
    if (lower.includes('---baru---')  || lower === 'baru:'  || lower === 'baru')  { mode = 'baru';  continue; }
    if (lower.includes('---naik---')  || lower === 'naik:'  || lower === 'naik')  { mode = 'naik';  continue; }
    if (lower.includes('---turun---') || lower === 'turun:' || lower === 'turun') { mode = 'turun'; continue; }
    if (lower.includes('---note---')  || lower === 'note:'  || lower === 'note' || lower === 'catatan:') { mode = 'note'; continue; }
    if (mode && data[mode] !== undefined) data[mode].push(trimmed);
  }
  return data;
}

function buatLaporanHarga(data) {
  const namaToko  = TOKO[data.toko] || TOKO['nk'];
  const isKemarin = data.kemarin === true;
  const sapaan    = getSapaan(namaToko);
  const tgl       = getTanggal(isKemarin);
  const labelTgl  = isKemarin ? `*${tgl}* _(kemarin)_` : `*${tgl}*`;
  const catatanTetap = `Nota Semuanya Sudah Diinput Di Sistem, Bisa Langsung Di Print Barcodenya Ya.\n\nMohon Dicek Kembali Fisik Barang Dengan Yang Di Input Disistem, Jika Ada Yang Tidak Sesuai Mohon Di Konfirmasi Lagi. Terima Kasih🙏🏻`;

  let msg = `${sapaan}\n\n`;
  msg += `Harga Barang Untuk Hari ${isKemarin ? 'Kemarin' : 'Ini'} ${labelTgl}\n`;
  if (data.baru.length > 0)  { msg += `\n🆕 *Barang Yang Baru:*\n`;         data.baru.forEach(b  => msg += `• ${b}\n`); }
  if (data.naik.length > 0)  { msg += `\n📈 *Barang Yang Naik Harga:*\n`;   data.naik.forEach(b  => msg += `• ${b}\n`); }
  if (data.turun.length > 0) { msg += `\n📉 *Barang Yang Turun Harga:*\n`;  data.turun.forEach(b => msg += `• ${b}\n`); }
  if (data.note.length > 0)  { msg += `\n📝 *Catatan Tambahan:*\n`;         data.note.forEach(b  => msg += `${b}\n`); }
  msg += `\n${catatanTetap}`;
  return msg;
}

// ── MENU 3: Laporan Marketplace ───────────────────────
function parseDataMarket(text) {
  const data = {
    kemarin: false,
    oesapa: 0, tdm: 0, central: 0,
    wa: 0, shopee: 0, tiktok: 0, tokopedia: 0,
    tunai: 0, debit: 0, kredit: 0,
    nota: []
  };
  const lines = text.trim().toLowerCase().split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed === 'market') continue;
    if (trimmed === 'kemarin') { data.kemarin = true; continue; }
    // nota bisa punya spasi, ambil setelah kata "nota "
    if (trimmed.startsWith('nota ')) {
      data.nota.push(line.trim().substring(5));
      continue;
    }
    const parts = trimmed.split(/\s+/);
    if (parts.length >= 2) {
      const key = parts[0];
      const val = parseInt(parts.slice(1).join('').replace(/[^0-9]/g, '')) || 0;
      if (key in data) data[key] = val;
    }
  }
  return data;
}

function buatLaporanMarket(data) {
  const isKemarin = data.kemarin === true;
  const tgl       = getTanggal(isKemarin);
  const labelTgl  = isKemarin ? `${tgl} _(kemarin)_` : tgl;

  const totalToko   = data.oesapa + data.tdm + data.central;
  const totalChannel = data.wa + data.shopee + data.tiktok + data.tokopedia;
  const totalBayar  = data.tunai + data.debit + data.kredit;

  let notaMsg = '';
  if (data.nota.length > 0) {
    notaMsg = '\n';
    data.nota.forEach(n => notaMsg += `- Nomor Nota ${n}\n`);
  }

  return `━━━━━━━━━━━━━━━━━━━━━━
🛍️ *Total Penjualan Marketplace*
*Perabot Mama*
📅 Periode ${labelTgl}
━━━━━━━━━━━━━━━━━━━━━━
🏪 *Per Toko*
• Toko Perabot Mama Oesapa : ${formatRupiah(data.oesapa)}
• Toko Perabot Mama TDM    : ${formatRupiah(data.tdm)}
• Toko Central Perabot     : ${formatRupiah(data.central)}
──────────────────────
💰 *Total* : ${formatRupiah(totalToko)}

📱 *Per Channel Penjualan*
• Penjualan via WA       : ${formatRupiah(data.wa)}
• Penjualan via Shopee   : ${formatRupiah(data.shopee)}
• Penjualan via Tiktok   : ${formatRupiah(data.tiktok)}
• Penjualan via Tokopedia: ${formatRupiah(data.tokopedia)}
──────────────────────
💰 *Total Penjualan* : ${formatRupiah(totalChannel)}

💳 *Metode Pembayaran*
• Tunai/CASH  : ${formatRupiah(data.tunai)}
• Debit/TF    : ${formatRupiah(data.debit)}
• Credit      : ${formatRupiah(data.kredit)}
━━━━━━━━━━━━━━━━━━━━━━${notaMsg}_Laporan otomatis_`;
}

// ── PANDUAN ────────────────────────────────────────────
const PANDUAN = `🤖 *Bot Laporan Toko*
Ada 3 menu tersedia:

━━━━━━━━━━━━━━━━━━
📊 *MENU 1 — Laporan Penjualan*
Contoh:
_nk_
_k1 29812000_
_k2 11087000_
_tunai 26326500_
_debit 14254500_
_kredit 318000_
_ecer 23298000_
_grosir 17601000_

━━━━━━━━━━━━━━━━━━
🏷️ *MENU 2 — Laporan Harga Barang*
Contoh:
_harga nk_
_---baru---_
_Nama barang_
_---naik---_
_Nama barang_
_---turun---_
_Nama barang_

━━━━━━━━━━━━━━━━━━
🛍️ *MENU 3 — Laporan Marketplace*
Contoh:
_market_
_oesapa 0_
_tdm 0_
_central 21061000_
_wa 21061000_
_shopee 0_
_tiktok 0_
_tokopedia 0_
_tunai 304000_
_debit 20757000_
_kredit 0_
_nota 019 (009383/CPK/05/26)_

━━━━━━━━━━━━━━━━━━
*Kode toko (menu 1 & 2):*
• nk = Nasional Kitchen
• tdm = Perabot Mama TDM
• osp = Perabot Mama Oesapa
• kefa = Perabot Mamaku Kefamenanu

Tambah _kemarin_ di baris ke-2 untuk laporan kemarin.`;

// ── WEBHOOK ────────────────────────────────────────────
app.get('/', (_, res) => res.send('Bot laporan aktif ✅'));
app.get('/webhook', (_, res) => res.send('Webhook aktif ✅'));

app.post('/webhook', async (req, res) => {
  res.sendStatus(200);
  try {
    const body    = req.body || {};
    const sender  = body.sender || body.from || body.phone || null;
    const message = body.message || body.text || body.msg || '';
    if (!sender || !message) return;

    const msg    = message.trim().toLowerCase();
    const baris1 = msg.split('\n')[0].trim();

    // Panduan
   if (['halo','hi','hello','help','bantuan','mulai','menu','bot','laporan','start','p','info','hallo','halo pantek','tai','we','setan'].includes(msg)) {
      await kirimWA(sender, PANDUAN);
      return;
    }

    // Menu 3: Marketplace
    if (baris1 === 'market') {
      const data    = parseDataMarket(message);
      const laporan = buatLaporanMarket(data);
      await kirimWA(sender, laporan);
      return;
    }

    // Menu 2: Harga Barang
    if (baris1.startsWith('harga')) {
      const data    = parseDataHarga(message);
      const laporan = buatLaporanHarga(data);
      await kirimWA(sender, laporan);
      return;
    }

    // Menu 1: Laporan Penjualan
    const data    = parseDataPenjualan(message);
    const adaData = data.k1 || data.k2 || data.k3 ||
                    data.tunai || data.debit || data.kredit ||
                    data.ecer  || data.grosir;
    if (adaData) {
      await kirimWA(sender, buatLaporanPenjualan(data));
    } else {
      await kirimWA(sender, '❓ Format tidak dikenali lu ketik yang benar bego.\n\nKirim *menu* untuk melihat panduan.');
    }

  } catch (e) {
    console.error('Error:', e.message);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🤖 Bot aktif di port ${PORT}!`));
