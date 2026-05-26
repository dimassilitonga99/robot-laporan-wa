const express = require('express');
const axios   = require('axios');
const app     = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const GEMINI_KEY   = process.env.GEMINI_KEY;
const FONNTE_TOKEN = process.env.FONNTE_TOKEN;
const GEMINI_URL   = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`;

async function kirimWA(target, message) {
  try {
    await axios.post('https://api.fonnte.com/send',
      { target, message },
      { headers: { Authorization: FONNTE_TOKEN } }
    );
    console.log('Pesan terkirim ke:', target);
  } catch (e) {
    console.error('Gagal kirim WA:', e?.response?.data || e.message);
  }
}

app.get('/', (_, res) => res.send('Bot laporan aktif ✅'));
app.get('/webhook', (_, res) => res.send('Webhook aktif ✅'));

app.post('/webhook', async (req, res) => {
  // Langsung balas 200 supaya Fonnte tidak timeout
  res.sendStatus(200);

  try {
    console.log('Data masuk dari Fonnte:', JSON.stringify(req.body));

    // Fonnte bisa kirim berbagai format — tangani semua
    const body = req.body || {};
    
    // Ambil nomor pengirim dari berbagai kemungkinan field
    const sender = body.sender || body.from || body.phone || 
                   body.participant || body.data?.sender || null;
    
    // Ambil pesan teks
    const message = body.message || body.text || body.msg || 
                    body.data?.message || '';
    
    // Ambil URL gambar/foto
    const image = body.image || body.file || body.media || 
                  body.data?.image || body.url || '';

    console.log('Sender:', sender, '| Pesan:', message, '| Gambar:', image ? 'ada' : 'tidak ada');

    if (!sender) {
      console.log('Tidak ada sender, skip.');
      return;
    }

    let parts = [];

    if (image && image.length > 0) {
      // Ada foto — baca dengan Gemini
      console.log('Memproses foto dari:', image);
      const imgResp = await axios.get(image, { 
        responseType: 'arraybuffer',
        timeout: 15000
      });
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
    } else if (message && message.trim().length > 0) {
      // Pesan teks biasa
      const msg = message.toLowerCase().trim();
      if (msg === 'halo' || msg === 'hi' || msg === 'hello') {
        await kirimWA(sender, '👋 Halo! Kirim foto struk/laporan kasir kamu, saya akan buatkan laporannya otomatis dalam hitungan detik! 📊');
        return;
      }
      parts = [{ text: `Kamu adalah asisten laporan toko. Pengguna mengirim: "${message}". Balas singkat dan minta mereka kirim foto struk kasir.` }];
    } else {
      console.log('Tidak ada pesan atau gambar, skip.');
      return;
    }

    // Kirim ke Gemini
    const aiResp = await axios.post(GEMINI_URL, {
      contents: [{ parts }]
    }, { timeout: 30000 });

    const reply = aiResp.data.candidates?.[0]?.content?.parts?.[0]?.text
      || 'Maaf, tidak dapat membaca. Coba kirim ulang foto yang lebih terang.';
    
    await kirimWA(sender, reply);

  } catch (e) {
    console.error('Error proses webhook:', e?.response?.data || e.message);
    const sender = req.body?.sender || req.body?.from || req.body?.phone || null;
    if (sender) {
      await kirimWA(sender, '❌ Gagal memproses. Coba kirim ulang foto yang lebih terang.');
    }
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🤖 Bot aktif di port ${PORT}!`));
