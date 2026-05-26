const express = require('express');
const axios   = require('axios');
const app     = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const FONNTE_TOKEN = process.env.FONNTE_TOKEN;

const TOKO = {
  'nk'     : 'Toko Nasional Kitchen',
  'tdm'    : 'Toko Perabot Mama TDM',
  'oesapa' : 'Toko Perabot Mama Oesapa',
  'kefa'   : 'Toko Perabot Mamaku Kefamenanu'
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

function getTanggal(isKemarin) {
  const now = new Date();
  const wib = new Date(now.getTime() + (8 * 60 * 60 * 1000));
  if (isKemarin) wib.setDate(wib.getDate() - 1);
  return wib.toLocaleDateString('id-ID', {
    weekday: 'long', year: 'numeric',
    month: 'long', day: 'numeric'
  });
}

function buatLaporan(data, namaToko) {
  const isKemarin = data.kemarin === true;
  const tgl       = getTanggal(isKemarin);
  const labelTgl  = isKemarin ? `📅 *${tgl}* _(kemarin)_` : `📅 *${tgl}*`;

  const k1     = parseInt(data.k1 || 0);
  const k2     = parseInt(data.k2 || 0);
  const k3     = parseInt(data.k3 || 0);
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
🏪 *${namaToko}*
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

function parseData(text) {
  const data = {};
  const lines = text.trim().toLowerCase().split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed === 'kemarin') { data.kemarin = true; continue; }
    if (TOKO[trimmed]) { data.toko = trimmed; continue; }
    const parts = trimmed.split(/\s+/);
    if (parts.length >= 2) {
      const key = parts[0];
      const val = parts[1].replace(/[^0-9]/g, '');
      if (val) data[key] = val;
    }
  }
  return data;
}

const PANDUAN = `📋 *Cara pakai bot laporan:*

Baris 1: *kode toko*
Baris 2: ketik *kemarin* (opsional)
Baris berikutnya: data angka

*Kode toko:*
• nk = Nasional Kitchen
• tdm = Perabot Mama TDM
• oesapa = Perabot Mama Oesapa
• kefa = Perabot Mamaku Kefamenanu

*Contoh:*
\`\`\`
nk
k1 29812000
k2 11087000
tunai 26326500
debit 14254500
kredit 318000
ecer 23298000
grosir 17601000
\`\`\`

*Field tersedia:*
k1 k2 k3 = kassa
tunai debit kredit = metode bayar
ecer grosir = jenis penjualan`;

app.get('/', (_, res) => res.send('Bot laporan aktif ✅'));
app.get('/webhook', (_, res) => res.send('Webhook aktif ✅'));

app.post('/webhook', async (req, res) => {
  res.sendStatus(200);
  try {
    const body    = req.body || {};
    const sender  = body.sender || body.from || body.phone || null;
    const message = body.message || body.text || body.msg || '';
    if (!sender || !message) return;

    const msg = message.trim().toLowerCase();

    if (['halo','hi','hello','help','bantuan','mulai'].includes(msg)) {
      await kirimWA(sender, PANDUAN);
      return;
    }

    const data = parseData(message);
    const adaData = data.k1 || data.k2 || data.k3 ||
                    data.tunai || data.debit || data.kredit ||
                    data.ecer || data.grosir;

    if (!adaData) {
      await kirimWA(sender, '❓ Format tidak dikenali.\n\nKirim *halo* untuk melihat panduan.');
      return;
    }

    // Tentukan nama toko
    const kodeToko = data.toko || 'nk';
    const namaToko = TOKO[kodeToko] || TOKO['nk'];

    const laporan = buatLaporan(data, namaToko);
    await kirimWA(sender, laporan);

  } catch (e) {
    console.error('Error:', e.message);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🤖 Bot aktif di port ${PORT}!`));
