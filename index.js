const express = require('express');
const axios   = require('axios');
const app     = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const FONNTE_TOKEN = process.env.FONNTE_TOKEN;
const GEMINI_KEY   = process.env.GEMINI_KEY;
const GEMINI_URL   = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + GEMINI_KEY;

const sesi = {};

const TOKO_LIST = [
  { kode: 'nk',     nama: 'Nasional Kitchen' },
  { kode: 'tdm',    nama: 'Perabot Mama TDM' },
  { kode: 'oesapa', nama: 'Perabot Mama Oesapa' },
  { kode: 'kefa',   nama: 'Perabot Mamaku Kefamenanu' }
];

const TOKO = {};
TOKO_LIST.forEach(function(t) { TOKO[t.kode] = t.nama; });

async function kirimWA(target, message) {
  try {
    await axios.post('https://api.fonnte.com/send',
      { target: target, message: message },
      { headers: { Authorization: FONNTE_TOKEN } }
    );
  } catch (e) {
    console.error('Gagal kirim:', e.message);
  }
}

function formatRupiah(angka) {
  var n = parseInt(angka) || 0;
  if (n === 0) return 'Rp. -';
  return 'Rp. ' + n.toLocaleString('id-ID');
}

function formatRupiahPlain(angka) {
  return 'Rp ' + (parseInt(angka) || 0).toLocaleString('id-ID');
}

function getSapaan(namaToko) {
  var jam = new Date(Date.now() + 8 * 60 * 60 * 1000).getUTCHours();
  var w = 'Malam';
  if (jam >= 5 && jam < 11) w = 'Pagi';
  else if (jam >= 11 && jam < 15) w = 'Siang';
  else if (jam >= 15 && jam < 19) w = 'Sore';
  return 'Selamat ' + w + ' Team ' + namaToko;
}

function getTanggal(isKemarin) {
  var wib = new Date(Date.now() + 8 * 60 * 60 * 1000);
  if (isKemarin) wib.setDate(wib.getDate() - 1);
  return wib.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}

async function bacaFotoGemini(imageUrl, prompt) {
  var imgResp = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 15000 });
  var b64  = Buffer.from(imgResp.data).toString('base64');
  var mime = imgResp.headers['content-type'] || 'image/jpeg';
  var resp = await axios.post(GEMINI_URL, {
    contents: [{ parts: [
      { inline_data: { mime_type: mime, data: b64 } },
      { text: prompt }
    ]}]
  }, { timeout: 30000 });
  return resp.data.candidates[0].content.parts[0].text || '';
}

function promptPenjualan(namaToko, isKemarin) {
  var tgl = getTanggal(isKemarin);
  var ket = isKemarin ? ' _(kemarin)_' : '';
  return 'Kamu asisten laporan toko. Baca data penjualan dari gambar ini untuk toko "' + namaToko + '" tanggal ' + tgl + '.\n' +
    'Buat laporan WhatsApp format ini PERSIS:\n\n' +
    '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n' +
    '\ud83d\udcca *LAPORAN PENJUALAN*\n' +
    '\ud83c\udfe6 *Toko ' + namaToko + '*\n' +
    '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n' +
    '\ud83d\udcc5 *' + tgl + '*' + ket + '\n\n' +
    '\ud83d\udcb0 *PENJUALAN PER KASSA*\n' +
    '\u2022 Kassa 1 : [nilai atau -]\n' +
    '\u2022 Kassa 2 : [nilai atau -]\n\n' +
    '\ud83d\udce6 *TOTAL KESELURUHAN*\n[total]\n\n' +
    '\ud83d\udcb3 *METODE PEMBAYARAN*\n' +
    '\u2022 Tunai  : [nilai atau -]\n' +
    '\u2022 Debit  : [nilai atau -]\n' +
    '\u2022 Kredit : [nilai atau -]\n\n' +
    '\ud83d\uded2 *JENIS PENJUALAN*\n' +
    '\u2022 Ecer   : [nilai atau -]\n' +
    '\u2022 Grosir : [nilai atau -]\n' +
    '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n' +
    '_Laporan otomatis_\n\nGunakan format Rp X.XXX.XXX. Jangan tambah teks lain.';
}

function promptHarga(namaToko, isKemarin) {
  var tgl = getTanggal(isKemarin);
  var sapaan = getSapaan(namaToko);
  var hari = isKemarin ? 'Kemarin' : 'Ini';
  var ket = isKemarin ? ' _(kemarin)_' : '';
  return 'Kamu asisten laporan toko. Baca data harga barang dari gambar ini untuk toko "' + namaToko + '".\n' +
    'Buat laporan WhatsApp format ini:\n\n' +
    sapaan + '\n\n' +
    'Harga Barang Untuk Hari ' + hari + ' *' + tgl + '*' + ket + '\n\n' +
    '\ud83c\udd95 *Barang Yang Baru:*\n\u2022 [nama barang]\n\n' +
    '\ud83d\udcc8 *Barang Yang Naik Harga:*\n\u2022 [nama barang]\n\n' +
    '\ud83d\udcc9 *Barang Yang Turun Harga:*\n\u2022 [nama barang]\n\n' +
    'Nota Semuanya Sudah Diinput Di Sistem, Bisa Langsung Di Print Barcodenya Ya.\n\n' +
    'Mohon Dicek Kembali Fisik Barang Dengan Yang Di Input Disistem, Jika Ada Yang Tidak Sesuai Mohon Di Konfirmasi Lagi. Terima Kasih\ud83d\ude4f\ud83c\udffc\n\n' +
    'Hapus bagian yang tidak ada datanya. Jangan tambah teks lain.';
}

function promptMarket(isKemarin) {
  var tgl = getTanggal(isKemarin);
  var ket = isKemarin ? ' _(kemarin)_' : '';
  return 'Kamu asisten laporan toko. Baca data penjualan marketplace dari gambar ini tanggal ' + tgl + '.\n' +
    'Buat laporan format ini PERSIS:\n\n' +
    '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n' +
    '\ud83d\udecd\ufe0f *Total Penjualan Marketplace*\n*Perabot Mama*\n' +
    '\ud83d\udcc5 Periode ' + tgl + ket + '\n' +
    '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n' +
    '\ud83c\udfe6 *Per Toko*\n' +
    '\u2022 Toko Perabot Mama Oesapa : [nilai]\n' +
    '\u2022 Toko Perabot Mama TDM    : [nilai]\n' +
    '\u2022 Toko Central Perabot     : [nilai]\n' +
    '\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n' +
    '\ud83d\udcb0 *Total* : [total]\n\n' +
    '\ud83d\udcf1 *Per Channel Penjualan*\n' +
    '\u2022 Penjualan via WA        : [nilai]\n' +
    '\u2022 Penjualan via Shopee    : [nilai]\n' +
    '\u2022 Penjualan via Tiktok    : [nilai]\n' +
    '\u2022 Penjualan via Tokopedia : [nilai]\n' +
    '\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n' +
    '\ud83d\udcb0 *Total Penjualan* : [total]\n\n' +
    '\ud83d\udcb3 *Metode Pembayaran*\n' +
    '\u2022 Tunai/CASH : [nilai]\n' +
    '\u2022 Debit/TF   : [nilai]\n' +
    '\u2022 Credit     : [nilai]\n' +
    '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n' +
    '[nomor nota jika ada]\n_Laporan otomatis_\n\nJangan tambah teks lain.';
}

var MSG_MENU_UTAMA =
  '\ud83e\udd16 *Bot Laporan Toko*\n' +
  '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n' +
  'Pilih menu:\n\n' +
  '*1.* \ud83d\udcca Laporan Penjualan\n' +
  '*2.* \ud83c\udff7\ufe0f Laporan Harga Barang\n' +
  '*3.* \ud83d\udecd\ufe0f Laporan Marketplace\n\n' +
  '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n' +
  'Balas *1*, *2*, atau *3*';

function MSG_PILIH_TOKO(menu) {
  var nm = menu === 1 ? 'Laporan Penjualan' : menu === 2 ? 'Laporan Harga Barang' : 'Laporan Marketplace';
  var em = menu === 1 ? '\ud83d\udcca' : menu === 2 ? '\ud83c\udff7\ufe0f' : '\ud83d\udecd\ufe0f';
  return em + ' *' + nm + '*\n' +
    '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n' +
    'Pilih toko:\n\n' +
    '*1.* Nasional Kitchen\n' +
    '*2.* Perabot Mama TDM\n' +
    '*3.* Perabot Mama Oesapa\n' +
    '*4.* Perabot Mamaku Kefamenanu\n\n' +
    'Balas *0* untuk kembali';
}

function MSG_PILIH_HARI(nama) {
  return '\ud83c\udfe6 *' + nama + '*\n' +
    '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n' +
    'Laporan untuk:\n\n' +
    '*1.* \ud83d\udcc5 Hari ini\n' +
    '*2.* \ud83d\udcc5 Kemarin\n\n' +
    'Balas *0* untuk kembali';
}

function MSG_SIAP_INPUT(nama, isKemarin, menu) {
  var tgl = getTanggal(isKemarin);
  var ket = isKemarin ? ' _(kemarin)_' : '';
  var contoh = '';
  if (menu === 1) contoh = 'k1 29000000\nk2 11000000\ntunai 26000000\ndebit 14000000\nkredit 0\necer 23000000\ngrosir 17000000';
  else if (menu === 2) contoh = '---baru---\nNama barang baru\n---naik---\nNama barang naik\n---turun---\nNama barang turun';
  else contoh = 'oesapa 0\ntdm 0\ncentral 21061000\nwa 21061000\nshopee 0\ntiktok 0\ntokopedia 0\ntunai 304000\ndebit 20757000\nkredit 0\nnota 019 (009383/CPK/05/26)';

  return '\u2705 *Siap!*\n' +
    '\ud83c\udfe6 ' + nama + '\n' +
    '\ud83d\udcc5 ' + tgl + ket + '\n' +
    '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n' +
    'Pilih cara input:\n\n' +
    '\ud83d\udcf8 *Kirim FOTO* struk/layar kasir\n' +
    '_atau_\n' +
    '\u2328\ufe0f *Ketik data* manual:\n\n' +
    contoh + '\n\n' +
    'Balas *0* untuk batal.';
}

function buatLaporanPenjualan(text, namaToko, isKemarin) {
  var tgl = getTanggal(isKemarin);
  var ket = isKemarin ? ' _(kemarin)_' : '';
  var d = {};
  text.trim().toLowerCase().split('\n').forEach(function(line) {
    var p = line.trim().split(/\s+/);
    if (p.length >= 2) { var v = p[1].replace(/[^0-9]/g, ''); if (v) d[p[0]] = v; }
  });
  var k1 = parseInt(d.k1 || 0), k2 = parseInt(d.k2 || 0), k3 = parseInt(d.k3 || 0);
  var total = k1 + k2 + k3;
  var kassa = '';
  if (k1) kassa += '\u2022 Kassa 1 : ' + formatRupiahPlain(k1) + '\n';
  if (k2) kassa += '\u2022 Kassa 2 : ' + formatRupiahPlain(k2) + '\n';
  if (k3) kassa += '\u2022 Kassa 3 : ' + formatRupiahPlain(k3) + '\n';
  if (!kassa) kassa = '\u2022 -\n';
  return '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n' +
    '\ud83d\udcca *LAPORAN PENJUALAN*\n' +
    '\ud83c\udfe6 *Toko ' + namaToko + '*\n' +
    '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n' +
    '\ud83d\udcc5 *' + tgl + '*' + ket + '\n\n' +
    '\ud83d\udcb0 *PENJUALAN PER KASSA*\n' + kassa + '\n' +
    '\ud83d\udce6 *TOTAL KESELURUHAN*\n' + formatRupiahPlain(total) + '\n\n' +
    '\ud83d\udcb3 *METODE PEMBAYARAN*\n' +
    '\u2022 Tunai  : ' + formatRupiahPlain(parseInt(d.tunai || 0)) + '\n' +
    '\u2022 Debit  : ' + formatRupiahPlain(parseInt(d.debit || 0)) + '\n' +
    '\u2022 Kredit : ' + formatRupiahPlain(parseInt(d.kredit || 0)) + '\n\n' +
    '\ud83d\uded2 *JENIS PENJUALAN*\n' +
    '\u2022 Ecer   : ' + formatRupiahPlain(parseInt(d.ecer || 0)) + '\n' +
    '\u2022 Grosir : ' + formatRupiahPlain(parseInt(d.grosir || 0)) + '\n' +
    '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n' +
    '_Laporan otomatis_';
}

function buatLaporanHarga(text, namaToko, isKemarin) {
  var tgl = getTanggal(isKemarin);
  var sapaan = getSapaan(namaToko);
  var hari = isKemarin ? 'Kemarin' : 'Ini';
  var ket = isKemarin ? ' _(kemarin)_' : '';
  var d = { baru: [], naik: [], turun: [], note: [] };
  var mode = null;
  text.trim().split('\n').forEach(function(line) {
    var t = line.trim(), l = t.toLowerCase();
    if (!t) return;
    if (l.indexOf('---baru---') >= 0 || l === 'baru') { mode = 'baru'; return; }
    if (l.indexOf('---naik---') >= 0 || l === 'naik') { mode = 'naik'; return; }
    if (l.indexOf('---turun---') >= 0 || l === 'turun') { mode = 'turun'; return; }
    if (l.indexOf('---note---') >= 0 || l === 'note') { mode = 'note'; return; }
    if (mode) d[mode].push(t);
  });
  var catatan = 'Nota Semuanya Sudah Diinput Di Sistem, Bisa Langsung Di Print Barcodenya Ya.\n\nMohon Dicek Kembali Fisik Barang Dengan Yang Di Input Disistem, Jika Ada Yang Tidak Sesuai Mohon Di Konfirmasi Lagi. Terima Kasih\ud83d\ude4f\ud83c\udffc';
  var msg = sapaan + '\n\nHarga Barang Untuk Hari ' + hari + ' *' + tgl + '*' + ket + '\n';
  if (d.baru.length > 0) { msg += '\n\ud83c\udd95 *Barang Yang Baru:*\n'; d.baru.forEach(function(b) { msg += '\u2022 ' + b + '\n'; }); }
  if (d.naik.length > 0) { msg += '\n\ud83d\udcc8 *Barang Yang Naik Harga:*\n'; d.naik.forEach(function(b) { msg += '\u2022 ' + b + '\n'; }); }
  if (d.turun.length > 0) { msg += '\n\ud83d\udcc9 *Barang Yang Turun Harga:*\n'; d.turun.forEach(function(b) { msg += '\u2022 ' + b + '\n'; }); }
  if (d.note.length > 0) { msg += '\n\ud83d\udcdd *Catatan Tambahan:*\n'; d.note.forEach(function(b) { msg += b + '\n'; }); }
  msg += '\n' + catatan;
  return msg;
}

function buatLaporanMarket(text, isKemarin) {
  var tgl = getTanggal(isKemarin);
  var ket = isKemarin ? ' _(kemarin)_' : '';
  var d = { oesapa: 0, tdm: 0, central: 0, wa: 0, shopee: 0, tiktok: 0, tokopedia: 0, tunai: 0, debit: 0, kredit: 0, nota: [] };
  text.trim().toLowerCase().split('\n').forEach(function(line) {
    var t = line.trim();
    if (!t) return;
    if (t.indexOf('nota ') === 0) { d.nota.push(line.trim().substring(5)); return; }
    var p = t.split(/\s+/);
    if (p.length >= 2 && p[0] in d) d[p[0]] = parseInt(p.slice(1).join('').replace(/[^0-9]/g, '')) || 0;
  });
  var totalToko = d.oesapa + d.tdm + d.central;
  var totalCh = d.wa + d.shopee + d.tiktok + d.tokopedia;
  var notaMsg = '';
  if (d.nota.length > 0) { notaMsg = '\n'; d.nota.forEach(function(n) { notaMsg += '- Nomor Nota ' + n + '\n'; }); }
  return '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n' +
    '\ud83d\udecd\ufe0f *Total Penjualan Marketplace*\n*Perabot Mama*\n' +
    '\ud83d\udcc5 Periode ' + tgl + ket + '\n' +
    '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n' +
    '\ud83c\udfe6 *Per Toko*\n' +
    '\u2022 Toko Perabot Mama Oesapa : ' + formatRupiah(d.oesapa) + '\n' +
    '\u2022 Toko Perabot Mama TDM    : ' + formatRupiah(d.tdm) + '\n' +
    '\u2022 Toko Central Perabot     : ' + formatRupiah(d.central) + '\n' +
    '\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n' +
    '\ud83d\udcb0 *Total* : ' + formatRupiah(totalToko) + '\n\n' +
    '\ud83d\udcf1 *Per Channel Penjualan*\n' +
    '\u2022 Penjualan via WA        : ' + formatRupiah(d.wa) + '\n' +
    '\u2022 Penjualan via Shopee    : ' + formatRupiah(d.shopee) + '\n' +
    '\u2022 Penjualan via Tiktok    : ' + formatRupiah(d.tiktok) + '\n' +
    '\u2022 Penjualan via Tokopedia : ' + formatRupiah(d.tokopedia) + '\n' +
    '\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n' +
    '\ud83d\udcb0 *Total Penjualan* : ' + formatRupiah(totalCh) + '\n\n' +
    '\ud83d\udcb3 *Metode Pembayaran*\n' +
    '\u2022 Tunai/CASH : ' + formatRupiah(d.tunai) + '\n' +
    '\u2022 Debit/TF   : ' + formatRupiah(d.debit) + '\n' +
    '\u2022 Credit     : ' + formatRupiah(d.kredit) + '\n' +
    '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n' +
    notaMsg + '_Laporan otomatis_';
}

app.get('/', function(req, res) { res.send('Bot laporan aktif'); });
app.get('/webhook', function(req, res) { res.send('Webhook aktif'); });

app.post('/webhook', async function(req, res) {
  res.sendStatus(200);
  try {
    var body    = req.body || {};
    var sender  = body.sender || body.from || body.phone || null;
    var message = body.message || body.text || body.msg || '';
    var image   = body.image || body.file || body.media || '';
    if (!sender) return;

    var msg = message.trim();
    var low = msg.toLowerCase();

    if (low === '0' || low === 'batal' || low === 'menu' || low === 'halo' || low === 'hi' || low === 'mulai' || low === 'start') {
      sesi[sender] = {};
      await kirimWA(sender, MSG_MENU_UTAMA);
      return;
    }

    if (!sesi[sender]) sesi[sender] = {};
    var s = sesi[sender];

    if (!s.menu) {
      if (msg === '1' || msg === '2' || msg === '3') {
        s.menu = parseInt(msg);
        if (s.menu === 3) {
          await kirimWA(sender, MSG_PILIH_HARI('Marketplace Perabot Mama'));
        } else {
          await kirimWA(sender, MSG_PILIH_TOKO(s.menu));
        }
      } else {
        await kirimWA(sender, MSG_MENU_UTAMA);
      }
      return;
    }

    if (s.menu !== 3 && !s.toko) {
      var idx = parseInt(msg) - 1;
      if (idx >= 0 && idx < TOKO_LIST.length) {
        s.toko = TOKO_LIST[idx].kode;
        await kirimWA(sender, MSG_PILIH_HARI(TOKO_LIST[idx].nama));
      } else {
        await kirimWA(sender, MSG_PILIH_TOKO(s.menu));
      }
      return;
    }

    if (s.kemarin === undefined) {
      if (msg === '1') s.kemarin = false;
      else if (msg === '2') s.kemarin = true;
      else {
        var nm = s.menu === 3 ? 'Marketplace Perabot Mama' : TOKO[s.toko];
        await kirimWA(sender, MSG_PILIH_HARI(nm));
        return;
      }
      var nm2 = s.menu === 3 ? 'Marketplace Perabot Mama' : TOKO[s.toko];
      await kirimWA(sender, MSG_SIAP_INPUT(nm2, s.kemarin, s.menu));
      return;
    }

    var nama = s.menu === 3 ? 'Marketplace Perabot Mama' : TOKO[s.toko];
    var laporan = '';

    if (image && image.length > 0) {
      await kirimWA(sender, 'Foto diterima, sedang diproses... silakan tunggu');
      try {
        var prompt = '';
        if (s.menu === 1) prompt = promptPenjualan(nama, s.kemarin);
        if (s.menu === 2) prompt = promptHarga(nama, s.kemarin);
        if (s.menu === 3) prompt = promptMarket(s.kemarin);
        laporan = await bacaFotoGemini(image, prompt);
      } catch(e) {
        console.error('Gemini error:', e.message);
        await kirimWA(sender, 'Gagal baca foto. Coba kirim ulang foto yang lebih terang, atau ketik data manual.');
        return;
      }
    } else if (msg) {
      if (s.menu === 1) laporan = buatLaporanPenjualan(msg, nama, s.kemarin);
      if (s.menu === 2) laporan = buatLaporanHarga(msg, nama, s.kemarin);
      if (s.menu === 3) laporan = buatLaporanMarket(msg, s.kemarin);
    } else {
      return;
    }

    if (laporan) {
      await kirimWA(sender, laporan);
      sesi[sender] = {};
      setTimeout(async function() {
        await kirimWA(sender, 'Laporan selesai! Kirim *menu* untuk laporan berikutnya.');
      }, 1000);
    }

  } catch (e) {
    console.error('Error:', e.message);
  }
});

var PORT = process.env.PORT || 3000;
app.listen(PORT, function() { console.log('Bot aktif di port ' + PORT); });
