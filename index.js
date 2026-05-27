const express = require('express');
const axios   = require('axios');
const app     = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const FONNTE_TOKEN = process.env.FONNTE_TOKEN;
const GEMINI_KEY   = process.env.GEMINI_KEY;
const GEMINI_URL   = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`;

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
  } catch (e) { console.error('Gagal kirim:', e?.response?.data || e.message); }
}

function formatRupiah(angka) {
  const n = parseInt(angka)||0;
  return n===0 ? 'Rp. -' : 'Rp. '+n.toLocaleString('id-ID');
}
function formatRupiahPlain(angka) {
  return 'Rp '+(parseInt(angka)||0).toLocaleString('id-ID');
}
function getSapaan(namaToko) {
  const jam = new Date(Date.now()+8*60*60*1000).getUTCHours();
  const w = jam>=5&&jam<11?'Pagi':jam>=11&&jam<15?'Siang':jam>=15&&jam<19?'Sore':'Malam';
  return `Selamat ${w} Team ${namaToko}`;
}
function getTanggal(isKemarin) {
  const wib = new Date(Date.now()+8*60*60*1000);
  if (isKemarin) wib.setDate(wib.getDate()-1);
  return wib.toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'});
}

// ── GEMINI: baca foto ─────────────────────────────────
async function bacaFotoGemini(imageUrl, prompt) {
  const imgResp = await axios.get(imageUrl, { responseType:'arraybuffer', timeout:15000 });
  const b64  = Buffer.from(imgResp.data).toString('base64');
  const mime = imgResp.headers['content-type'] || 'image/jpeg';
  const resp = await axios.post(GEMINI_URL, {
    contents: [{ parts: [
      { inline_data: { mime_type: mime, data: b64 } },
      { text: prompt }
    ]}]
  }, { timeout: 30000 });
  return resp.data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// Prompt per menu
function promptPenjualan(namaToko, isKemarin) {
  const tgl = getTanggal(isKemarin);
  return `Kamu asisten laporan toko. Baca data penjualan dari gambar ini untuk toko "${namaToko}" tanggal ${tgl}.
Ekstrak data dan buat laporan WhatsApp format ini PERSIS:

━━━━━━━━━━━━━━━━━━
📊 *LAPORAN PENJUALAN*
🏪 *Toko ${namaToko}*
━━━━━━━━━━━━━━━━━━
📅 *${tgl}*${isKemarin?' _(kemarin)_':''}

💰 *PENJUALAN PER KASSA*
• Kassa 1 : [nilai atau -]
• Kassa 2 : [nilai atau -]

📦 *TOTAL KESELURUHAN*
[total]

💳 *METODE PEMBAYARAN*
• Tunai  : [nilai atau -]
• Debit  : [nilai atau -]
• Kredit : [nilai atau -]

🛒 *JENIS PENJUALAN*
• Ecer   : [nilai atau -]
• Grosir : [nilai atau -]
━━━━━━━━━━━━━━━━━━
_Laporan otomatis_

Gunakan format Rp X.XXX.XXX untuk angka. Jangan tambah teks lain.`;
}

function promptHarga(namaToko, isKemarin) {
  const tgl = getTanggal(isKemarin);
  const sapaan = getSapaan(namaToko);
  return `Kamu asisten laporan toko. Baca data harga barang dari gambar ini untuk toko "${namaToko}" tanggal ${tgl}.
Buat laporan WhatsApp format ini:

${sapaan}

Harga Barang Untuk Hari ${isKemarin?'Kemarin':'Ini'} *${tgl}*${isKemarin?' _(kemarin)_':''}

🆕 *Barang Yang Baru:*
• [nama barang] (jika ada, jika tidak ada hapus bagian ini)

📈 *Barang Yang Naik Harga:*
• [nama barang] (jika ada, jika tidak ada hapus bagian ini)

📉 *Barang Yang Turun Harga:*
• [nama barang] (jika ada, jika tidak ada hapus bagian ini)

Nota Semuanya Sudah Diinput Di Sistem, Bisa Langsung Di Print Barcodenya Ya.

Mohon Dicek Kembali Fisik Barang Dengan Yang Di Input Disistem, Jika Ada Yang Tidak Sesuai Mohon Di Konfirmasi Lagi. Terima Kasih🙏🏻

Jangan tambah teks lain di luar format.`;
}

function promptMarket(isKemarin) {
  const tgl = getTanggal(isKemarin);
  return `Kamu asisten laporan toko. Baca data penjualan marketplace dari gambar ini tanggal ${tgl}.
Buat laporan WhatsApp format ini PERSIS:

━━━━━━━━━━━━━━━━━━━━━━
🛍️ *Total Penjualan Marketplace*
*Perabot Mama*
📅 Periode ${tgl}${isKemarin?' _(kemarin)_':''}
━━━━━━━━━━━━━━━━━━━━━━
🏪 *Per Toko*
• Toko Perabot Mama Oesapa : [nilai atau Rp. -]
• Toko Perabot Mama TDM    : [nilai atau Rp. -]
• Toko Central Perabot     : [nilai atau Rp. -]
──────────────────────
💰 *Total* : [total]

📱 *Per Channel Penjualan*
• Penjualan via WA        : [nilai atau Rp. -]
• Penjualan via Shopee    : [nilai atau Rp. -]
• Penjualan via Tiktok    : [nilai atau Rp. -]
• Penjualan via Tokopedia : [nilai atau Rp. -]
──────────────────────
💰 *Total Penjualan* : [total]

💳 *Metode Pembayaran*
• Tunai/CASH : [nilai atau Rp. -]
• Debit/TF   : [nilai atau Rp. -]
• Credit     : [nilai atau Rp. -]
━━━━━━━━━━━━━━━━━━━━━━
[nomor nota jika ada, format: - Nomor Nota XXX]
_Laporan otomatis_

Jangan tambah teks lain di luar format.`;
}

// ── PESAN NAVIGASI ────────────────────────────────────
const MSG_MENU_UTAMA = `🤖 *Bot Laporan Toko*
━━━━━━━━━━━━━━━━━━
Pilih menu:

*1.* 📊 Laporan Penjualan
*2.* 🏷️ Laporan Harga Barang
*3.* 🛍️ Laporan Marketplace

━━━━━━━━━━━━━━━━━━
Balas *1*, *2*, atau *3*`;

function MSG_PILIH_TOKO(menu) {
  const nm = menu===1?'Laporan Penjualan':menu===2?'Laporan Harga Barang':'Laporan Marketplace';
  const em = menu===1?'📊':menu===2?'🏷️':'🛍️';
  return `${em} *${nm}*
━━━━━━━━━━━━━━━━━━
Pilih toko:

*1.* Nasional Kitchen
*2.* Perabot Mama TDM
*3.* Perabot Mama Oesapa
*4.* Perabot Mamaku Kefamenanu

Balas *0* untuk kembali`;
}

const MSG_PILIH_HARI = (nama) =>
`🏪 *${nama}*
━━━━━━━━━━━━━━━━━━
Laporan untuk:

*1.* 📅 Hari ini
*2.* 📅 Kemarin

Balas *0* untuk kembali`;

function MSG_SIAP_INPUT(nama, isKemarin, menu) {
  const tgl = getTanggal(isKemarin);
  const contoh = menu===1
    ? `k1 29000000\nk2 11000000\ntunai 26000000\ndebit 14000000\nkredit 0\necer 23000000\ngrosir 17000000`
    : menu===2
    ? `---baru---\nNama barang baru\n---naik---\nNama barang naik\n---turun---\nNama barang turun`
    : `oesapa 0\ntdm 0\ncentral 21061000\nwa 21061000\nshopee 0\ntiktok 0\ntokopedia 0\ntunai 304000\ndebit 20757000\nkredit 0\nnota 019 (009383/CPK/05/26)`;

  return `✅ *Siap!*
🏪 ${nama}
📅 ${tgl}${isKemarin?' _(kemarin)_':''}
━━━━━━━━━━━━━━━━━━
Pilih cara input:

📸 *Kirim FOTO* struk/layar kasir
_atau_
⌨️ *Ketik data* manual:

\`\`\`
${contoh}
\`\`\`

Balas *0* untuk batal.`;
}

// ── PROSES DATA MANUAL ────────────────────────────────
function buatLaporanPenjualan(text, namaToko, isKemarin) {
  const tgl = getTanggal(isKemarin);
  const d = {};
  text.trim().toLowerCase().split('\n').forEach(line => {
    const p = line.trim().split(/\s+/);
    if (p.length>=2) { const v=p[1].replace(/[^0-9]/g,''); if(v) d[p[0]]=v; }
  });
  const k1=parseInt(d.k1||0),k2=parseInt(d.k2||0),k3=parseInt(d.k3||0),total=k1+k2+k3;
  let kassa='';
  if(k1) kassa+=`• Kassa 1 : ${formatRupiahPlain(k1)}\n`;
  if(k2) kassa+=`• Kassa 2 : ${formatRupiahPlain(k2)}\n`;
  if(k3) kassa+=`• Kassa 3 : ${formatRupiahPlain(k3)}\n`;
  if(!kassa) kassa='• -\n';
  return `━━━━━━━━━━━━━━━━━━
📊 *LAPORAN PENJUALAN*
🏪 *Toko ${namaToko}*
━━━━━━━━━━━━━━━━━━
📅 *${tgl}*${isKemarin?' _(kemarin)_':''}

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
  const tgl=getTanggal(isKemarin), sapaan=getSapaan(namaToko);
  const d={baru:[],naik:[],turun:[],note:[]};
  let mode=null;
  text.trim().split('\n').forEach(line=>{
    const t=line.trim(),l=t.toLowerCase();
    if(!t) return;
    if(l.includes('---baru---')||l==='baru'){mode='baru';return;}
    if(l.includes('---naik---')||l==='naik'){mode='naik';return;}
    if(l.includes('---turun---')||l==='turun'){mode='turun';return;}
    if(l.includes('---note---')||l==='note'){mode='note';return;}
    if(mode) d[mode].push(t);
  });
  const catatan=`Nota Semuanya Sudah Diinput Di Sistem, Bisa Langsung Di Print Barcodenya Ya.\n\nMohon Dicek Kembali Fisik Barang Dengan Yang Di Input Disistem, Jika Ada Yang Tidak Sesuai Mohon Di Konfirmasi Lagi. Terima Kasih🙏🏻`;
  let msg=`${sapaan}\n\nHarga Barang Untuk Hari ${isKemarin?'Kemarin':'Ini'} *${tgl}*${isKemarin?' _(kemarin)_':''}\n`;
  if(d.baru.length>0){msg+=`\n🆕 *Barang Yang Baru:*\n`;d.baru.forEach(b=>msg+=`• ${b}\n`);}
  if(d.naik.length>0){msg+=`\n📈 *Barang Yang Naik Harga:*\n`;d.naik.forEach(b=>msg+=`• ${b}\n`);}
  if(d.turun.length>0){msg+=`\n📉 *Barang Yang Turun Harga:*\n`;d.turun.forEach(b=>msg+=`• ${b}\n`);}
  if(d.note.length>0){msg+=`\n📝 *Catatan Tambahan:*\n`;d.note.forEach(b=>msg+=`${b}\n`);}
  msg+=`\n${catatan}`;
  return msg;
}

function buatLaporanMarket(text, isKemarin) {
  const tgl=getTanggal(isKemarin);
  const d={oesapa:0,tdm:0,central:0,wa:0,shopee:0,tiktok:0,tokopedia:0,tunai:0,debit:0,kredit:0,nota:[]};
  text.trim().toLowerCase().split('\n').forEach(line=>{
    const t=line.trim();
    if(!t) return;
    if(t.startsWith('nota ')){d.nota.push(line.trim().substring(5));return;}
    const p=t.split(/\s+/);
    if(p.length>=2&&p[0] in d) d[p[0]]=parseInt(p.slice(1).join('').replace(/[^0-9]/g,''))||0;
  });
  const totalToko=d.oesapa+d.tdm+d.central, totalCh=d.wa+d.shopee+d.tiktok+d.tokopedia;
  let notaMsg='';
  if(d.nota.length>0){notaMsg='\n';d.nota.forEach(n=>notaMsg+=`- Nomor Nota ${n}\n`);}
  return `━━━━━━━━━━━━━━━━━━━━━━
🛍️ *Total Penjualan Marketplace*
*Perabot Mama*
📅 Periode ${tgl}${isKemarin?' _(kemarin)_':''}
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
    const image   = body.image   || body.file || body.media || '';
    if (!sender) return;

    const msg = message.trim();
    const low = msg.toLowerCase();

    // Reset
    if (['0','batal','menu','halo','hi','mulai','start'].includes(low)) {
      sesi[sender] = {};
      await kirimWA(sender, MSG_MENU_UTAMA);
      return;
    }

    if (!sesi[sender]) sesi[sender] = {};
    const s = sesi[sender];

    // ── LEVEL 1: Pilih menu ──
    if (!s.menu) {
      if (msg==='1'||msg==='2'||msg==='3') {
        s.menu = parseInt(msg);
        if (s.menu===3) {
          await kirimWA(sender, MSG_PILIH_HARI('Marketplace Perabot Mama'));
        } else {
          await kirimWA(sender, MSG_PILIH_TOKO(s.menu));
        }
      } else {
        await kirimWA(sender, MSG_MENU_UTAMA);
      }
      return;
    }

    // ── LEVEL 2: Pilih toko (menu 1 & 2) ──
    if (s.menu!==3 && !s.toko) {
      const idx = parseInt(msg)-1;
      if (idx>=0 && idx 0) {
      // Proses foto dengan Gemini
      await kirimWA(sender, '📸 Foto diterima, sedang diproses... ⏳');
      try {
        let prompt = '';
        if (s.menu===1) prompt = promptPenjualan(nama, s.kemarin);
        if (s.menu===2) prompt = promptHarga(nama, s.kemarin);
        if (s.menu===3) prompt = promptMarket(s.kemarin);
        laporan = await bacaFotoGemini(image, prompt);
      } catch(e) {
        console.error('Gemini error:', e?.response?.data || e.message);
        await kirimWA(sender, '❌ Gagal baca foto. Coba kirim ulang foto yang lebih terang, atau ketik data manual.');
        return;
      }
    } else if (msg) {
      // Proses data manual
      if (s.menu===1) laporan = buatLaporanPenjualan(msg, nama, s.kemarin);
      if (s.menu===2) laporan = buatLaporanHarga(msg, nama, s.kemarin);
      if (s.menu===3) laporan = buatLaporanMarket(msg, s.kemarin);
    } else {
      return;
    }

    if (laporan) {
      await kirimWA(sender, laporan);
      sesi[sender] = {};
      setTimeout(async()=>{
        await kirimWA(sender, '✅ Laporan selesai!\n\nKirim *menu* untuk laporan berikutnya.');
      }, 1000);
    }

  } catch (e) {
    console.error('Error:', e.message);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🤖 Bot aktif di port ${PORT}!`));
