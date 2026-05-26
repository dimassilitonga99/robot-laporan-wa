const express = require('express');
const axios   = require('axios');
const app     = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const GEMINI_KEY   = process.env.GEMINI_KEY;
const FONNTE_TOKEN = process.env.FONNTE_TOKEN;
const GEMINI_URL   = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`;

async function kirimWA(target, message) {
  await axios.post('https://api.fonnte.com/send',
    { target, message },
    { headers: { Authorization: FONNTE_TOKEN } }
  );
}

app.post('/webhook', async (req, res) => {
  res.sendStatus(200);
  const { sender, message, image } = req.body;
  if (!sender) return;

  try {
    let parts = [];

    if (image && image.length > 0) {
      const imgResp = await axios.get(image, { responseType: 'arraybuffer' });
      const b64  = Buffer.from(imgResp.data).toString('base64');
      const mime = imgResp.headers['content-type'] || 'image/jpeg';
      parts = [
        { inline_data: { mime_type: mime, data: b64 } },
        { text: `Kamu adalah asisten laporan toko. Baca semua data penjualan dari gambar ini dengan teliti. Lalu susun laporan WhatsApp yang rapi dengan format berikut:

━━━━━━━━━━━━━━━━━━
📊 *LAPORAN PENJUALAN*
━━━━━━━━━━━━━━━━━━
🏪 *Toko:* [nama toko]
📅 *Tanggal:* [tanggal]

💰 *PENJUALAN PER KASSA*
• Kassa 1: Rp [jumlah]
• Kassa 2: Rp [jumlah]

📦 *TOTAL KESELURUHAN*
Rp [total]

💳 *METODE BAYAR*
• Tunai: Rp [jumlah]
• Debit: Rp [jumlah]
• Kredit: Rp [jumlah]

🛒 *JENIS PENJUALAN*
• Ecer: Rp [jumlah]
• Grosir: Rp [jumlah]
━━━━━━━━━━━━━━━━━━
_Laporan otomatis_

Jika ada data yang tidak terbaca, tulis "tidak terbaca". Jangan tambahkan teks lain di luar format.` }
      ];
    } else if (message) {
      if (message.toLowerCase().includes('halo') || message.toLowerCase().includes('hi')) {
        await kirimWA(sender, '👋 Halo! Kirim foto struk/laporan kasir kamu, saya akan buatkan laporannya otomatis dalam hitungan detik! 📊');
        return;
      }
      parts = [{ text: `Kamu adalah asisten laporan toko. Pengguna mengirim teks: "${message}". Balas dengan ramah dan minta mereka kirim foto struk kasir.` }];
    } else return;

    const aiResp = await axios.post(GEMINI_URL, {
      contents: [{ parts }]
    });

    const reply = aiResp.data.candidates?.[0]?.content?.parts?.[0]?.text
      || 'Maaf, tidak dapat membaca gambar. Coba kirim ulang foto yang lebih terang.';
    await kirimWA(sender, reply);

  } catch (e) {
    console.error(e?.response?.data || e.message);
    await kirimWA(sender, '❌ Gagal memproses. Pastikan foto cukup terang dan coba kirim ulang.');
  }
});

app.get('/', (_, res) => res.send('Bot laporan aktif ✅'));
app.get('/webhook', (_, res) => res.send('Webhook aktif ✅'));
app.listen(process.env.PORT || 3000, () => console.log('🤖 Bot aktif!'));
