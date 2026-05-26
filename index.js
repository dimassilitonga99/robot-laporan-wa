const express = require('express');
const axios   = require('axios');
const app     = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const FONNTE_TOKEN = process.env.FONNTE_TOKEN;

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

function buatLaporan(data) {
  // Cek apakah laporan untuk kemarin
  const isKemarin = data.kemarin === true;

  const now = new Date();
  // Tambah offset WIB (UTC+8)
  const wib = new Date(now.getTime() + (8 * 60 * 60 * 1000));
  if (isKemarin) wib.setDate(wib.getDate() - 1);

  const tgl = wib.toLocaleDateString('id-ID', {
    weekday: 'long', year: 'numeric',
    month: 'long', day: 'numeric',
    timeZone: 'Asia/Makassar'
  });

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

  const labelTgl = isKemarin ? `📅 *${tgl}* _(kemarin)_` : `📅 *${tgl}*`;

  return `━━━━━━━━━━━━━━━━━━
📊 *LAPORAN PENJUALAN*
🏪 *Toko Nasional Kitchen*
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
    // Deteksi kata "kemarin" di baris mana saja
    if (trimmed === 'kemarin') {
      data.kemarin = true;
      continue;
    }
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

Ketik dan kirim data seperti ini:

\`\`\`
k1 29812000
k2 11087000
tunai 26326500
debit 14254500
kredit 318000
ecer 23298000
grosir 17601000
\`\`\`

*Keterangan:*
• k1, k2, k3 = kassa 1, 2, 3
• tunai, debit, kredit = metode bayar
• ecer, grosir = jenis penjualan

Kirim angka tanpa titik/koma.
Bot langsung buatkan laporan! 🚀`;

app.get('/', (_, res) => res.send('Bot laporan aktif ✅'));
app.get('/webhook', (_, res) => res.send('Webhook aktif ✅'));

app.post('/webhook', async (req, res) => {
  res.sendStatus(200);
  try {
    const body   = req.body || {};
    const sender  = body.sender || body.from || body.phone || null;
    const message = body.message || body.text || body.msg || '';

    if (!sender || !message) return;

    const msg = message.trim().toLowerCase();

    // Panduan
    if (msg === 'halo' || msg === 'hi' || msg === 'hello' || msg === 'help' || msg === 'bantuan') {
      await kirimWA(sender, PANDUAN);
      return;
    }

    // Cek apakah pesan berisi data laporan
    const data = parseData(message);
    const adaData = data.k1 || data.k2 || data.k3 ||
                    data.tunai || data.debit || data.kredit ||
                    data.ecer || data.grosir;

    if (adaData) {
      const laporan = buatLaporan(data);
      await kirimWA(sender, laporan);
    } else {
      await kirimWA(sender, '❓ Format tidak dikenali.\n\nKirim *halo* untuk melihat panduan cara pakai.');
    }

  } catch (e) {
    console.error('Error:', e.message);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🤖 Bot aktif di port ${PORT}!`));
