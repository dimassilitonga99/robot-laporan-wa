const express = require('express');
const axios   = require('axios');
const app     = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const FONNTE_TOKEN = process.env.FONNTE_TOKEN;

const TOKO = {
  'nk'     : 'Nasional Kitchen',
  'tdm'    : 'Perabot Mama TDM',
  'oesapa' : 'Perabot Mama Oesapa',
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
  return 'Rp ' + parseInt(angka).toLocaleString('id-ID');
}

function getSapaan(namaToko) {
  // WIB = UTC+8
  const jam = new Date(Date.now() + 8 * 60 * 60 * 1000).getUTCHours();
  let waktu;
  if (jam >= 5  && jam < 11) waktu = 'Pagi';
  else if (jam >= 11 && jam < 15) waktu = 'Siang';
  else if (jam >= 15 && jam < 19) waktu = 'Sore';
  else waktu = 'Malam';
  return `Selamat ${waktu} Team ${namaToko}`;
}

function getTanggal(isKemarin) {
  const wib = new Date(Date.now() + 8 * 60 * 60 * 1000);
  if (isKemarin) wib.setDate(wib.getDate() - 1);
  return wib.toLocaleDateString('id-ID', {
    weekday: 'long', year: 'numeric',
    month: 'long', day: 'numeric'
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
  if (k1) kassamsg += `• Kassa 1 : ${formatRupiah(k1)}\n`;
  if (k2) kassamsg += `• Kassa 2 : ${formatRupiah(k2)}\n`;
  if (k3) kassamsg += `• Kassa 3 : ${formatRupiah(k3)}\n`;
  if (!kassamsg) kassamsg = '• -\n';

  return `━━━━━━━━━━━━━━━━━━
📊 *LAPORAN PENJUALAN*
🏪 *Toko ${namaToko}*
━━━━━━━━━━━━━━━━━━
${labelTgl}

💰 *PENJUALAN PER KASSA*
${kassamsg}
📦 *TOTAL KESELURUHAN*
${formatRupiah(total)}

💳 *METODE PEMBAYARAN*
• Tunai  : ${formatRupiah(tunai)}
• Debit  : ${formatRupiah(debit)}
• Kredit : ${formatRupiah(kredit)}

🛒 *JENIS PENJUALAN*
• Ecer   : ${formatRupiah(ecer)}
• Grosir : ${formatRupiah(grosir)}
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

    // Baris pertama: "harga nk" dll
    if (lower.startsWith('harga ')) {
      const kode = lower.replace('harga ', '').trim();
      if (TOKO[kode]) data.toko = kode;
      continue;
    }

    // Deteksi kemarin
    if (lower === 'kemarin') { data.kemarin = true; continue; }

    // Separator section
    if (lower.includes('---baru---')   || lower === 'baru:' || lower === 'baru')   { mode = 'baru';  continue; }
    if (lower.includes('---naik---')   || lower === 'naik:' || lower === 'naik')   { mode = 'naik';  continue; }
    if (lower.includes('---turun---')  || lower === 'turun:'|| lower === 'turun')  { mode = 'turun'; continue; }
    if (lower.includes('---note---')   || lower === 'note:' || lower === 'note' || lower === 'catatan:') { mode = 'note'; continue; }

    if (mode && data[mode] !== undefined) {
      data[mode].push(trimmed);
    }
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

  if (data.baru.length > 0) {
    msg += `\n🆕 *Barang Yang Baru:*\n`;
    data.baru.forEach(b => msg += `• ${b}\n`);
  }
  if (data.naik.length > 0) {
    msg += `\n📈 *Barang Yang Naik Harga:*\n`;
    data.naik.forEach(b => msg += `• ${b}\n`);
  }
  if (data.turun.length > 0) {
    msg += `\n📉 *Barang Yang Turun Harga:*\n`;
    data.turun.forEach(b => msg += `• ${b}\n`);
  }
  if (data.note.length > 0) {
    msg += `\n📝 *Catatan Tambahan:*\n`;
    data.note.forEach(b => msg += `${b}\n`);
  }

  msg += `\n${catatanTetap}`;
  return msg;
}

// ── PANDUAN ────────────────────────────────────────────
const PANDUAN = `🤖 *Bot Laporan Toko*

Pilih menu yang diinginkan:

━━━━━━━━━━━━━━━━━━
📊 *MENU 1 — Laporan Penjualan*
Ketik kode toko + data angka:
\`nk / tdm / oesapa / kefa\`

Contoh:
_nk_
_k1 29812000_
_k2 11087000_
_tunai 26326500_
_debit 14254500_
_kredit 318000_
_ecer 23298000_
_grosir 17601000_

Tambah baris _kemarin_ untuk laporan kemarin.

━━━━━━━━━━━━━━━━━━
🏷️ *MENU 2 — Laporan Harga Barang*
Ketik \`harga [kode toko]\` di baris 1:

Contoh:
_harga nk_
_---baru---_
_Nama barang baru_
_---naik---_
_Nama barang naik_
_---turun---_
_Nama barang turun_
_---note---_
_Catatan tambahan_

━━━━━━━━━━━━━━━━━━
*Kode toko:*
• nk = Nasional Kitchen
• tdm = Perabot Mama TDM
• oesapa = Perabot Mama Oesapa
• kefa = Perabot Mamaku Kefamenanu`;

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

    const msg   = message.trim().toLowerCase();
    const lines = message.trim().toLowerCase().split('\n');
    const baris1 = lines[0].trim();

    // Panduan
    if (['halo','hi','hello','help','bantuan','mulai','menu'].includes(msg)) {
      await kirimWA(sender, PANDUAN);
      return;
    }

    // Menu 2: Laporan Harga
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
      const laporan = buatLaporanPenjualan(data);
      await kirimWA(sender, laporan);
    } else {
      await kirimWA(sender, '❓ Format tidak dikenali.\n\nKirim *halo* atau *menu* untuk melihat panduan.');
    }

  } catch (e) {
    console.error('Error:', e.message);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🤖 Bot aktif di port ${PORT}!`));
