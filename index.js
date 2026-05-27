const express = require('express');
const axios   = require('axios');
const app     = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const FONNTE_TOKEN = process.env.FONNTE_TOKEN;

// State sesi per nomor pengirim
// { menu, toko, kemarin }
const sesi = {};

const TOKO_LIST = [
  { kode: 'nk',     nama: 'Nasional Kitchen' },
  { kode: 'tdm',    nama: 'Perabot Mama TDM' },
  { kode: 'oesapa', nama: 'Perabot Mama Oesapa' },
  { kode: 'kefa',   nama: 'Perabot Mamaku Kefamenanu' }
];

const TOKO = {};
TOKO_LIST.forEach(t => TOKO[t.kode] = t.nama);

async function kirimWA(target, message) {
  try {
    await axios.post('https://api.fonnte.com/send',
      { target, message },
      { headers: { Authorization: FONNTE_TOKEN } }
    );
  } catch (e) {
    console.error('Gagal kirim:', e?.response?.data || e.message);
  }
}

function formatRupiah(angka) {
  const n = parseInt(angka) || 0;
  return n === 0 ? 'Rp. -' : 'Rp. ' + n.toLocaleString('id-ID');
}

function formatRupiahPlain(angka) {
  return 'Rp ' + (parseInt(angka)||0).toLocaleString('id-ID');
}

function getSapaan(namaToko) {
  const jam = new Date(Date.now() + 8*60*60*1000).getUTCHours();
  let w = jam>=5&&jam<11?'Pagi':jam>=11&&jam<15?'Siang':jam>=15&&jam<19?'Sore':'Malam';
  return `Selamat ${w} Team ${namaToko}`;
}

function getTanggal(isKemarin) {
  const wib = new Date(Date.now() + 8*60*60*1000);
  if (isKemarin) wib.setDate(wib.getDate()-1);
  return wib.toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'});
}

// ── PESAN MENU ────────────────────────────────────────
const MSG_MENU_UTAMA = `🤖 *Bot Laporan Toko*
━━━━━━━━━━━━━━━━━━
Pilih menu:

*1.* 📊 Laporan Penjualan
*2.* 🏷️ Laporan Harga Barang
*3.* 🛍️ Laporan Marketplace

━━━━━━━━━━━━━━━━━━
Balas dengan angka *1*, *2*, atau *3*`;

function MSG_PILIH_TOKO(menu) {
  const emoji = menu===1?'📊':menu===2?'🏷️':'🛍️';
  const nama  = menu===1?'Laporan Penjualan':menu===2?'Laporan Harga Barang':'Laporan Marketplace';
  return `${emoji} *${nama}*
━━━━━━━━━━━━━━━━━━
Pilih toko:

*1.* Nasional Kitchen
*2.* Perabot Mama TDM
*3.* Perabot Mama Oesapa
*4.* Perabot Mamaku Kefamenanu

━━━━━━━━━━━━━━━━━━
Balas *0* untuk kembali ke menu utama`;
}

const MSG_PILIH_HARI = (namaToko) =>
`🏪 *${namaToko}*
━━━━━━━━━━━━━━━━━━
Laporan untuk:

*1.* 📅 Hari ini
*2.* 📅 Kemarin

━━━━━━━━━━━━━━━━━━
Balas *0* untuk kembali`;

// Format contoh per menu
function MSG_FORMAT_PENJUALAN(namaToko, isKemarin) {
  const tgl = getTanggal(isKemarin);
  return `📊 *Laporan Penjualan*
🏪 ${namaToko}
📅 ${tgl}
━━━━━━━━━━━━━━━━━━
Kirim data seperti contoh berikut (hapus yang tidak ada):

\`\`\`
k1 29000000
k2 11000000
k3 0
tunai 26000000
debit 14000000
kredit 0
ecer 23000000
grosir 17000000
\`\`\`

Isi angka tanpa titik/koma.
Balas *0* untuk batal.`;
}

function MSG_FORMAT_HARGA(namaToko, isKemarin) {
  const tgl = getTanggal(isKemarin);
  return `🏷️ *Laporan Harga Barang*
🏪 ${namaToko}
📅 ${tgl}
━━━━━━━━━━━━━━━━━━
Kirim data seperti contoh berikut:

\`\`\`
---baru---
Nama barang baru 1
Nama barang baru 2
---naik---
Nama barang naik harga
---turun---
Nama barang turun harga
---note---
Catatan tambahan (opsional)
\`\`\`

Bagian yang kosong boleh dihapus.
Balas *0* untuk batal.`;
}

function MSG_FORMAT_MARKET(isKemarin) {
  const tgl = getTanggal(isKemarin);
  return `🛍️ *Laporan Marketplace*
📅 ${tgl}
━━━━━━━━━━━━━━━━━━
Kirim data seperti contoh berikut:

\`\`\`
oesapa 0
tdm 0
central 21061000
wa 21061000
shopee 0
tiktok 0
tokopedia 0
tunai 304000
debit 20757000
kredit 0
nota 019 (009383/CPK/05/26)
nota 019 (009389/CPK/05/26)
\`\`\`

Isi 0 untuk yang kosong.
Balas *0* untuk batal.`;
}

// ── PROSES DATA ───────────────────────────────────────
function buatLaporanPenjualan(text, namaToko, isKemarin) {
  const tgl      = getTanggal(isKemarin);
  const labelTgl = isKemarin ? `📅 *${tgl}* _(kemarin)_` : `📅 *${tgl}*`;
  const d = {};
  text.trim().toLowerCase().split('\n').forEach(line => {
    const p = line.trim().split(/\s+/);
    if (p.length>=2) { const v=p[1].replace(/[^0-9]/g,''); if(v) d[p[0]]=v; }
  });
  const k1=parseInt(d.k1||0), k2=parseInt(d.k2||0), k3=parseInt(d.k3||0);
  const total=k1+k2+k3;
  let kassa='';
  if(k1) kassa+=`• Kassa 1 : ${formatRupiahPlain(k1)}\n`;
  if(k2) kassa+=`• Kassa 2 : ${formatRupiahPlain(k2)}\n`;
  if(k3) kassa+=`• Kassa 3 : ${formatRupiahPlain(k3)}\n`;
  if(!kassa) kassa='• -\n';
  return `━━━━━━━━━━━━━━━━━━
📊 *LAPORAN PENJUALAN*
🏪 *Toko ${namaToko}*
━━━━━━━━━━━━━━━━━━
${labelTgl}

💰 *PENJUALAN PER KASSA*
${kassa}
📦 *TOTAL KESELURUHAN*
${formatRupiahPlain(total)}

💳 *METODE PEMBAYARAN*
• Tunai  : ${formatRupiahPlain(parseInt(d.tunai||0))}
• Debit  : ${formatRupiahPlain(parseInt(d.debit||0))}
• Kredit : ${formatRupiahPlain(parseInt(d.kredit||0))}

🛒 *JENIS PENJUALAN*
• Ecer   : ${formatRupiahPlain(parseInt(d.ecer||0))}
• Grosir : ${formatRupiahPlain(parseInt(d.grosir||0))}
━━━━━━━━━━━━━━━━━━
_Laporan otomatis_`;
}

function buatLaporanHarga(text, namaToko, isKemarin) {
  const tgl      = getTanggal(isKemarin);
  const labelTgl = isKemarin ? `*${tgl}* _(kemarin)_` : `*${tgl}*`;
  const sapaan   = getSapaan(namaToko);
  const d        = { baru:[], naik:[], turun:[], note:[] };
  let mode = null;
  text.trim().split('\n').forEach(line => {
    const t = line.trim(), l = t.toLowerCase();
    if (!t) return;
    if (l.includes('---baru---')  || l==='baru')  { mode='baru';  return; }
    if (l.includes('---naik---')  || l==='naik')  { mode='naik';  return; }
    if (l.includes('---turun---') || l==='turun') { mode='turun'; return; }
    if (l.includes('---note---')  || l==='note')  { mode='note';  return; }
    if (mode) d[mode].push(t);
  });
  const catatan = `Nota Semuanya Sudah Diinput Di Sistem, Bisa Langsung Di Print Barcodenya Ya.\n\nMohon Dicek Kembali Fisik Barang Dengan Yang Di Input Disistem, Jika Ada Yang Tidak Sesuai Mohon Di Konfirmasi Lagi. Terima Kasih🙏🏻`;
  let msg = `${sapaan}\n\nHarga Barang Untuk Hari ${isKemarin?'Kemarin':'Ini'} ${labelTgl}\n`;
  if(d.baru.length>0)  { msg+=`\n🆕 *Barang Yang Baru:*\n`;        d.baru.forEach(b=>msg+=`• ${b}\n`); }
  if(d.naik.length>0)  { msg+=`\n📈 *Barang Yang Naik Harga:*\n`;  d.naik.forEach(b=>msg+=`• ${b}\n`); }
  if(d.turun.length>0) { msg+=`\n📉 *Barang Yang Turun Harga:*\n`; d.turun.forEach(b=>msg+=`• ${b}\n`); }
  if(d.note.length>0)  { msg+=`\n📝 *Catatan Tambahan:*\n`;        d.note.forEach(b=>msg+=`${b}\n`); }
  msg+=`\n${catatan}`;
  return msg;
}

function buatLaporanMarket(text, isKemarin) {
  const tgl      = getTanggal(isKemarin);
  const labelTgl = isKemarin ? `${tgl} _(kemarin)_` : tgl;
  const d = { oesapa:0,tdm:0,central:0,wa:0,shopee:0,tiktok:0,tokopedia:0,tunai:0,debit:0,kredit:0,nota:[] };
  text.trim().toLowerCase().split('\n').forEach(line => {
    const t = line.trim();
    if (!t) return;
    if (t.startsWith('nota ')) { d.nota.push(line.trim().substring(5)); return; }
    const p = t.split(/\s+/);
    if (p.length>=2 && p[0] in d) d[p[0]] = parseInt(p.slice(1).join('').replace(/[^0-9]/g,''))||0;
  });
  const totalToko = d.oesapa+d.tdm+d.central;
  const totalCh   = d.wa+d.shopee+d.tiktok+d.tokopedia;
  let notaMsg = '';
  if(d.nota.length>0) { notaMsg='\n'; d.nota.forEach(n=>notaMsg+=`- Nomor Nota ${n}\n`); }
  return `━━━━━━━━━━━━━━━━━━━━━━
🛍️ *Total Penjualan Marketplace*
*Perabot Mama*
📅 Periode ${labelTgl}
━━━━━━━━━━━━━━━━━━━━━━
🏪 *Per Toko*
• Toko Perabot Mama Oesapa : ${formatRupiah(d.oesapa)}
• Toko Perabot Mama TDM    : ${formatRupiah(d.tdm)}
• Toko Central Perabot     : ${formatRupiah(d.central)}
──────────────────────
💰 *Total* : ${formatRupiah(totalToko)}

📱 *Per Channel Penjualan*
• Penjualan via WA        : ${formatRupiah(d.wa)}
• Penjualan via Shopee    : ${formatRupiah(d.shopee)}
• Penjualan via Tiktok    : ${formatRupiah(d.tiktok)}
• Penjualan via Tokopedia : ${formatRupiah(d.tokopedia)}
──────────────────────
💰 *Total Penjualan* : ${formatRupiah(totalCh)}

💳 *Metode Pembayaran*
• Tunai/CASH : ${formatRupiah(d.tunai)}
• Debit/TF   : ${formatRupiah(d.debit)}
• Credit     : ${formatRupiah(d.kredit)}
━━━━━━━━━━━━━━━━━━━━━━${notaMsg}_Laporan otomatis_`;
}

// ── WEBHOOK ────────────────────────────────────────────
app.get('/', (_,res) => res.send('Bot laporan aktif ✅'));
app.get('/webhook', (_,res) => res.send('Webhook aktif ✅'));

app.post('/webhook', async (req, res) => {
  res.sendStatus(200);
  try {
    const body    = req.body || {};
    const sender  = body.sender || body.from || body.phone || null;
    const message = body.message || body.text || body.msg || '';
    if (!sender || !message) return;

    const msg = message.trim();
    const low = msg.toLowerCase();

    // Reset / menu utama
    if (['0','batal','menu','halo','hi','mulai','start'].includes(low)) {
      sesi[sender] = {};
      await kirimWA(sender, MSG_MENU_UTAMA);
      return;
    }

    // Inisiasi sesi jika belum ada
    if (!sesi[sender]) sesi[sender] = {};
    const s = sesi[sender];

    // ── LEVEL 1: Pilih menu ──
    if (!s.menu) {
      if (msg === '1') { s.menu = 1; await kirimWA(sender, MSG_PILIH_TOKO(1)); return; }
      if (msg === '2') { s.menu = 2; await kirimWA(sender, MSG_PILIH_TOKO(2)); return; }
      if (msg === '3') { s.menu = 3; s.toko = 'market';
        await kirimWA(sender, MSG_PILIH_HARI('Marketplace Perabot Mama')); return; }
      await kirimWA(sender, MSG_MENU_UTAMA); return;
    }

    // ── LEVEL 2: Pilih toko (menu 1 & 2) ──
    if (s.menu !== 3 && !s.toko) {
      const idx = parseInt(msg) - 1;
      if (idx >= 0 && idx < TOKO_LIST.length) {
        s.toko = TOKO_LIST[idx].kode;
        await kirimWA(sender, MSG_PILIH_HARI(TOKO_LIST[idx].nama));
      } else {
        await kirimWA(sender, MSG_PILIH_TOKO(s.menu));
      }
      return;
    }

    // ── LEVEL 3: Pilih hari ──
    if (s.kemarin === undefined) {
      if (msg === '1') { s.kemarin = false; }
      else if (msg === '2') { s.kemarin = true; }
      else {
        const namaToko = s.toko === 'market' ? 'Marketplace Perabot Mama' : TOKO[s.toko];
        await kirimWA(sender, MSG_PILIH_HARI(namaToko)); return;
      }
      // Kirim contoh format sesuai menu
      const nama = s.toko === 'market' ? 'Marketplace' : TOKO[s.toko];
      if (s.menu === 1) await kirimWA(sender, MSG_FORMAT_PENJUALAN(nama, s.kemarin));
      if (s.menu === 2) await kirimWA(sender, MSG_FORMAT_HARGA(nama, s.kemarin));
      if (s.menu === 3) await kirimWA(sender, MSG_FORMAT_MARKET(s.kemarin));
      return;
    }

    // ── LEVEL 4: Terima data & buat laporan ──
    let laporan = '';
    const nama = s.toko === 'market' ? 'Marketplace' : TOKO[s.toko];
    if (s.menu === 1) laporan = buatLaporanPenjualan(msg, nama, s.kemarin);
    if (s.menu === 2) laporan = buatLaporanHarga(msg, nama, s.kemarin);
    if (s.menu === 3) laporan = buatLaporanMarket(msg, s.kemarin);

    await kirimWA(sender, laporan);

    // Reset sesi setelah laporan selesai
    sesi[sender] = {};
    // Tawarkan kembali ke menu
    setTimeout(async () => {
      await kirimWA(sender, `✅ Laporan selesai!\n\nKirim *menu* untuk laporan berikutnya.`);
    }, 1000);

  } catch (e) {
    console.error('Error:', e.message);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🤖 Bot aktif di port ${PORT}!`));
