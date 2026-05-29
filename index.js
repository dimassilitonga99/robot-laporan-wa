const express  = require('express');
const axios    = require('axios');
const xlsx     = require('xlsx');
const path     = require('path');
const fs       = require('fs');
const app      = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const FONNTE_TOKEN = process.env.FONNTE_TOKEN;
const GEMINI_KEY   = process.env.GEMINI_KEY;
const GEMINI_URL   = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + GEMINI_KEY;

// ── AKSES KONTROL ─────────────────────────────────────
const ADMIN       = '6285829278962';
const MEMBER_FILE = path.join(__dirname, 'members.json');
const KONTAK_FILE = path.join(__dirname, 'kontak.json');

function loadMembers() {
  try { if (fs.existsSync(MEMBER_FILE)) return JSON.parse(fs.readFileSync(MEMBER_FILE, 'utf8')); } catch(e) {}
  return ['6285253949803','6285737005301','6285211988252','6281383924057','6282235572821','6287841617474','6281584937710'];
}
function saveMembers(m) {
  try { fs.writeFileSync(MEMBER_FILE, JSON.stringify(m, null, 2)); return true; } catch(e) { return false; }
}

function loadKontak() {
  try { if (fs.existsSync(KONTAK_FILE)) return JSON.parse(fs.readFileSync(KONTAK_FILE, 'utf8')); } catch(e) {}
  return {
    '6285253949803': 'Pak Security Marthen',
    '6285737005301': 'Kak Bagas Pacar Beda Agama',
    '6285211988252': 'Kak Admin Marketplace',
    '6281383924057': 'Kak Fajar (Buka Mas Fajar Kefa)',
    '6282235572821': 'Kak yang Saya Tidak Tau Namanya',
    '6287841617474': 'Mas Awin Gacor',
    '6281584937710': 'Kak Safira',
    '6282266026564': 'Mas Abi Mustafa',
    '6285829278962': 'Admin'
  };
}
function saveKontak(k) {
  try { fs.writeFileSync(KONTAK_FILE, JSON.stringify(k, null, 2)); return true; } catch(e) { return false; }
}

var MEMBERS = loadMembers();
var KONTAK  = loadKontak();

function isAdmin(n) { return n === ADMIN; }
function isMember(n) { return MEMBERS.indexOf(n) >= 0 || n === ADMIN; }
function getNama(n) { return KONTAK[n] || null; }

function getSapaan(nomor) {
  var jam = new Date(Date.now() + 8*3600000).getUTCHours();
  var waktu = jam>=5&&jam<11?'Pagi':jam>=11&&jam<15?'Siang':jam>=15&&jam<19?'Sore':'Malam';
  var nama = getNama(nomor);
  if (nama) return 'Selamat ' + waktu + ', *' + nama + '*! \ud83d\ude0a';
  return 'Selamat ' + waktu + '! \ud83d\ude0a';
}

// Nomor yang sudah disapa di sesi ini (reset tiap restart)
var sudahDisapa = {};

// ── DATA BARANG 5 TOKO ────────────────────────────────
var DATA_BARANG = [];
var EXCEL_PATH  = path.join(__dirname, 'harga_barang_5toko.xlsx');

var TOKO_COLS = {
  nk    : { ecer: 'Ecer NK',     ambil: 'Ambil NK',     stok: 'Stok NK'     },
  tdm   : { ecer: 'Ecer TDM',    ambil: 'Ambil TDM',    stok: 'Stok TDM'    },
  oesapa: { ecer: 'Ecer Oesapa', ambil: 'Ambil Oesapa', stok: 'Stok Oesapa' },
  kefa  : { ecer: 'Ecer Kefa',   ambil: 'Ambil Kefa',   stok: 'Stok Kefa'   },
  cp    : { ecer: 'Ecer CP',     ambil: 'Ambil CP',     stok: 'Stok CP'     }
};

var NAMA_TOKO = {
  nk    : 'Nasional Kitchen',
  tdm   : 'Perabot Mama TDM',
  oesapa: 'Perabot Mama Oesapa',
  kefa  : 'Perabot Mamaku Kefamenanu',
  cp    : 'Central Perabot'
};

var TOKO_LIST = [
  { kode: 'nk',     nama: 'Nasional Kitchen' },
  { kode: 'tdm',    nama: 'Perabot Mama TDM' },
  { kode: 'oesapa', nama: 'Perabot Mama Oesapa' },
  { kode: 'kefa',   nama: 'Perabot Mamaku Kefamenanu' },
  { kode: 'cp',     nama: 'Central Perabot' }
];
var TOKO = {};
TOKO_LIST.forEach(function(t) { TOKO[t.kode] = t.nama; });

function loadExcel() {
  try {
    if (!fs.existsSync(EXCEL_PATH)) { console.log('File tidak ditemukan!'); return; }
    var wb   = xlsx.readFile(EXCEL_PATH);
    var ws   = wb.Sheets[wb.SheetNames[0]];
    var rows = xlsx.utils.sheet_to_json(ws, { defval: 0, range: 1 });
    DATA_BARANG = rows.map(function(r) {
      var item = {
        kode  : String(r['Kode Item'] || '').trim().toUpperCase(),
        nama  : String(r['Nama Item'] || '').trim().toUpperCase(),
        jenis : String(r['Jenis']     || '').trim(),
        merek : String(r['Merek']     || '').trim(),
        satuan: String(r['Satuan']    || '').trim(),
        harga : {}
      };
      Object.keys(TOKO_COLS).forEach(function(kode) {
        var c = TOKO_COLS[kode];
        item.harga[kode] = {
          ecer : parseFloat(r[c.ecer]  || 0) || 0,
          ambil: parseFloat(r[c.ambil] || 0) || 0,
          stok : parseInt(r[c.stok]    || 0) || 0
        };
      });
      return item;
    }).filter(function(d) { return d.kode && d.kode !== 'UNDEFINED' && d.kode !== '0'; });
    console.log('Data loaded: ' + DATA_BARANG.length + ' item');
  } catch(e) { console.error('Gagal load:', e.message); }
}

function saveExcel() {
  try {
    var rows = DATA_BARANG.map(function(d) {
      var row = { 'Kode Item': d.kode, 'Nama Item': d.nama, 'Jenis': d.jenis, 'Merek': d.merek, 'Satuan': d.satuan };
      Object.keys(TOKO_COLS).forEach(function(kode) {
        var c = TOKO_COLS[kode];
        row[c.ecer]  = d.harga[kode].ecer;
        row[c.ambil] = d.harga[kode].ambil;
        row[c.stok]  = d.harga[kode].stok;
      });
      return row;
    });
    var wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(rows), 'Data Barang');
    xlsx.writeFile(wb, EXCEL_PATH);
    return true;
  } catch(e) { console.error('Gagal save:', e.message); return false; }
}

loadExcel();

// ── CARI BARANG ───────────────────────────────────────
function cariBarang(keyword) {
  var q = keyword.trim().toUpperCase();
  var byKode = DATA_BARANG.filter(function(d) { return d.kode === q; });
  if (byKode.length > 0) return byKode;
  var words = q.split(/\s+/);
  return DATA_BARANG.filter(function(d) {
    return words.every(function(w) { return d.nama.indexOf(w) >= 0 || d.kode.indexOf(w) >= 0; });
  });
}

function formatRp(n) {
  var v = parseFloat(n) || 0;
  return v === 0 ? 'Rp -' : 'Rp ' + v.toLocaleString('id-ID');
}

function formatHasil(items, tokoKode) {
  if (items.length === 0) return '\u274c Barang tidak ditemukan.\n\nCoba kata kunci berbeda.\nContoh: _dandang eagle 20_';
  var namaToko = NAMA_TOKO[tokoKode] || '-';
  if (items.length === 1) {
    var d = items[0];
    var h = d.harga[tokoKode];
    return '\ud83c\udff7\ufe0f *Detail Barang*\n\ud83c\udfe6 *' + namaToko + '*\n' +
      '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n' +
      '\ud83d\udd16 *Kode*   : ' + d.kode + '\n' +
      '\ud83d\udce6 *Nama*   : ' + d.nama + '\n' +
      '\ud83c\udff7\ufe0f *Jenis*  : ' + (d.jenis||'-') + '\n' +
      '\ud83c\udfd7\ufe0f *Merek*  : ' + (d.merek||'-') + '\n' +
      '\ud83d\udccf *Satuan* : ' + d.satuan + '\n' +
      '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n' +
      '\ud83d\udcb0 *Harga Ecer*  : ' + formatRp(h.ecer) + '\n' +
      '\ud83d\udcb0 *Harga Ambil* : ' + formatRp(h.ambil) + '\n' +
      '\ud83d\udcca *Stok*        : ' + (h.stok > 0 ? h.stok + ' ' + d.satuan : 'Kosong') + '\n' +
      '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501';
  }
  if (items.length > 10) return '\u26a0\ufe0f Ditemukan *' + items.length + ' barang*. Terlalu banyak.\n\nCoba lebih spesifik.';
  var msg = '\ud83d\udd0d *Ditemukan ' + items.length + ' barang*\n\ud83c\udfe6 *' + namaToko + '*\n\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n';
  items.forEach(function(d, i) {
    var h = d.harga[tokoKode];
    msg += (i+1) + '. *' + d.nama + '*\n   \ud83d\udd16 ' + d.kode + ' | ' + d.satuan + '\n   \ud83d\udcb0 Ecer: ' + formatRp(h.ecer) + ' | Ambil: ' + formatRp(h.ambil) + '\n   \ud83d\udcca Stok: ' + (h.stok > 0 ? h.stok+' '+d.satuan : 'Kosong') + '\n';
    if (i < items.length-1) msg += '\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n';
  });
  return msg + '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501';
}

function updateStok(kode, tokoKode, jumlah) {
  var k = kode.trim().toUpperCase();
  for (var i = 0; i < DATA_BARANG.length; i++) {
    if (DATA_BARANG[i].kode === k) { DATA_BARANG[i].harga[tokoKode].stok = jumlah; saveExcel(); return DATA_BARANG[i]; }
  }
  return null;
}

async function kirimWA(target, message) {
  try { await axios.post('https://api.fonnte.com/send', { target: target, message: message }, { headers: { Authorization: FONNTE_TOKEN } }); }
  catch(e) { console.error('Gagal kirim:', e.message); }
}

function fRp(n) { var v=parseFloat(n)||0; return v===0?'Rp. -':'Rp. '+v.toLocaleString('id-ID'); }
function fRpP(n) { return 'Rp '+(parseFloat(n)||0).toLocaleString('id-ID'); }
function sapaanTim(nm) { var j=new Date(Date.now()+8*3600000).getUTCHours(); return 'Selamat '+(j>=5&&j<11?'Pagi':j>=11&&j<15?'Siang':j>=15&&j<19?'Sore':'Malam')+' Team '+nm; }
function tgl(kem) { var d=new Date(Date.now()+8*3600000); if(kem) d.setDate(d.getDate()-1); return d.toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'}); }

async function gemini(url, prompt) {
  var r = await axios.get(url, { responseType:'arraybuffer', timeout:15000 });
  var resp = await axios.post(GEMINI_URL, { contents:[{ parts:[{ inline_data:{ mime_type: r.headers['content-type']||'image/jpeg', data: Buffer.from(r.data).toString('base64') }},{ text:prompt }]}]}, { timeout:30000 });
  return resp.data.candidates[0].content.parts[0].text||'';
}

var sesi = {};

// ── MENU ──────────────────────────────────────────────
function getMenu(nomor) {
  var nama = getNama(nomor);
  var base = '\ud83e\udd16 *Bot Laporan & Harga Toko*\n\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\nPilih menu:\n\n*1.* \ud83d\udcca Laporan Penjualan\n*2.* \ud83c\udff7\ufe0f Laporan Harga Barang\n*3.* \ud83d\udecd\ufe0f Laporan Marketplace';
  if (isMember(nomor)) {
    base += '\n*4.* \ud83d\udd0d Cari Harga Barang\n\n\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\nAtau langsung ketik:\n\u2022 _cari dandang eagle 20_\n\u2022 _cari NN00001_\n\u2022 _stok nk NN00001 10_';
  } else {
    base += '\n\n\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501';
  }
  if (isAdmin(nomor)) {
    base += '\n\n\ud83d\udc51 *Perintah Admin:*\n\u2022 _daftar 6281234567890_\n\u2022 _hapus 6281234567890_\n\u2022 _listmember_\n\u2022 _namakontak 6281234567890 Nama Lengkap_\n\u2022 _listkontak_';
  }
  return base;
}

var MSG_PILIH_TOKO_CARI =
  '\ud83d\udd0d *Cari Harga Barang*\n\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\nPilih toko:\n\n*1.* Nasional Kitchen\n*2.* Perabot Mama TDM\n*3.* Perabot Mama Oesapa\n*4.* Perabot Mamaku Kefamenanu\n*5.* Central Perabot\n\nBalas *0* untuk kembali';

function MSG_SIAP_CARI(namaToko) {
  return '\ud83d\udd0d *Cari Harga Barang*\n\ud83c\udfe6 *' + namaToko + '*\n\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\nKetik nama atau kode barang:\n\n\u2022 _dandang eagle 20_\n\u2022 _NN00001_\n\u2022 _golden sunkist_\n\nBalas *0* untuk kembali ke menu.';
}

function mPilihToko(m) {
  return (m===1?'\ud83d\udcca':m===2?'\ud83c\udff7\ufe0f':'\ud83d\udecd\ufe0f')+' *'+(m===1?'Laporan Penjualan':m===2?'Laporan Harga Barang':'Laporan Marketplace')+'*\n\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\nPilih toko:\n\n*1.* Nasional Kitchen\n*2.* Perabot Mama TDM\n*3.* Perabot Mama Oesapa\n*4.* Perabot Mamaku Kefamenanu\n*5.* Central Perabot\n\nBalas *0* untuk kembali';
}

function mPilihHari(nm) { return '\ud83c\udfe6 *'+nm+'*\n\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\nLaporan untuk:\n\n*1.* \ud83d\udcc5 Hari ini\n*2.* \ud83d\udcc5 Kemarin\n\nBalas *0* untuk kembali'; }

function mSiap(nm, kem, menu) {
  var t=tgl(kem), k=kem?' _(kemarin)_':'';
  var c=menu===1?'k1 29000000\nk2 11000000\ntunai 26000000\ndebit 14000000\nkredit 0\necer 23000000\ngrosir 17000000':menu===2?'---baru---\nNama barang baru\n---naik---\nNama barang naik\n---turun---\nNama barang turun':'oesapa 0\ntdm 0\ncentral 21061000\nwa 21061000\nshopee 0\ntiktok 0\ntokopedia 0\ntunai 304000\ndebit 20757000\nkredit 0\nnota 019 (009383/CPK/05/26)';
  return '\u2705 *Siap!*\n\ud83c\udfe6 '+nm+'\n\ud83d\udcc5 '+t+k+'\n\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\nKirim FOTO atau ketik:\n\n'+c+'\n\nBalas *0* untuk batal.';
}

// ── LAPORAN ───────────────────────────────────────────
function lPenjualan(text, nm, kem) {
  var t=tgl(kem), k=kem?' _(kemarin)_':'', d={};
  text.trim().toLowerCase().split('\n').forEach(function(l){var p=l.trim().split(/\s+/);if(p.length>=2){var v=p[1].replace(/[^0-9]/g,'');if(v)d[p[0]]=v;}});
  var k1=parseFloat(d.k1||0),k2=parseFloat(d.k2||0),k3=parseFloat(d.k3||0),tot=k1+k2+k3;
  var ks=''; if(k1)ks+='\u2022 Kassa 1 : '+fRpP(k1)+'\n'; if(k2)ks+='\u2022 Kassa 2 : '+fRpP(k2)+'\n'; if(k3)ks+='\u2022 Kassa 3 : '+fRpP(k3)+'\n'; if(!ks)ks='\u2022 -\n';
  return '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n\ud83d\udcca *LAPORAN PENJUALAN*\n\ud83c\udfe6 *Toko '+nm+'*\n\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n\ud83d\udcc5 *'+t+'*'+k+'\n\n\ud83d\udcb0 *PENJUALAN PER KASSA*\n'+ks+'\n\ud83d\udce6 *TOTAL KESELURUHAN*\n'+fRpP(tot)+'\n\n\ud83d\udcb3 *METODE PEMBAYARAN*\n\u2022 Tunai  : '+fRpP(parseFloat(d.tunai||0))+'\n\u2022 Debit  : '+fRpP(parseFloat(d.debit||0))+'\n\u2022 Kredit : '+fRpP(parseFloat(d.kredit||0))+'\n\n\ud83d\uded2 *JENIS PENJUALAN*\n\u2022 Ecer   : '+fRpP(parseFloat(d.ecer||0))+'\n\u2022 Grosir : '+fRpP(parseFloat(d.grosir||0))+'\n\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n_Laporan otomatis_';
}

function lHarga(text, nm, kem) {
  var t=tgl(kem), s=sapaanTim(nm), h=kem?'Kemarin':'Ini', k=kem?' _(kemarin)_':'';
  var d={baru:[],naik:[],turun:[],note:[]}, mode=null;
  text.trim().split('\n').forEach(function(l){var tr=l.trim(),lo=tr.toLowerCase();if(!tr)return;if(lo.indexOf('---baru---')>=0||lo==='baru'){mode='baru';return;}if(lo.indexOf('---naik---')>=0||lo==='naik'){mode='naik';return;}if(lo.indexOf('---turun---')>=0||lo==='turun'){mode='turun';return;}if(lo.indexOf('---note---')>=0||lo==='note'){mode='note';return;}if(mode)d[mode].push(tr);});
  var cat='Nota Semuanya Sudah Diinput Di Sistem, Bisa Langsung Di Print Barcodenya Ya.\n\nMohon Dicek Kembali Fisik Barang Dengan Yang Di Input Disistem, Jika Ada Yang Tidak Sesuai Mohon Di Konfirmasi Lagi. Terima Kasih\ud83d\ude4f\ud83c\udffc';
  var msg=s+'\n\nHarga Barang Untuk Hari '+h+' *'+t+'*'+k+'\n';
  if(d.baru.length>0){msg+='\n\ud83c\udd95 *Barang Yang Baru:*\n';d.baru.forEach(function(b){msg+='\u2022 '+b+'\n';});}
  if(d.naik.length>0){msg+='\n\ud83d\udcc8 *Barang Yang Naik Harga:*\n';d.naik.forEach(function(b){msg+='\u2022 '+b+'\n';});}
  if(d.turun.length>0){msg+='\n\ud83d\udcc9 *Barang Yang Turun Harga:*\n';d.turun.forEach(function(b){msg+='\u2022 '+b+'\n';});}
  if(d.note.length>0){msg+='\n\ud83d\udcdd *Catatan:*\n';d.note.forEach(function(b){msg+=b+'\n';});}
  return msg+'\n'+cat;
}

function lMarket(text, kem) {
  var t=tgl(kem), k=kem?' _(kemarin)_':'';
  var d={oesapa:0,tdm:0,central:0,wa:0,shopee:0,tiktok:0,tokopedia:0,tunai:0,debit:0,kredit:0,nota:[]};
  text.trim().toLowerCase().split('\n').forEach(function(l){var tr=l.trim();if(!tr)return;if(tr.indexOf('nota ')===0){d.nota.push(l.trim().substring(5));return;}var p=tr.split(/\s+/);if(p.length>=2&&p[0] in d)d[p[0]]=parseFloat(p.slice(1).join('').replace(/[^0-9]/g,''))||0;});
  var tT=d.oesapa+d.tdm+d.central, tC=d.wa+d.shopee+d.tiktok+d.tokopedia, nt='';
  if(d.nota.length>0){nt='\n';d.nota.forEach(function(n){nt+='- Nomor Nota '+n+'\n';});}
  return '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n\ud83d\udecd\ufe0f *Total Penjualan Marketplace*\n*Perabot Mama*\n\ud83d\udcc5 Periode '+t+k+'\n\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n\ud83c\udfe6 *Per Toko*\n\u2022 Toko Perabot Mama Oesapa : '+fRp(d.oesapa)+'\n\u2022 Toko Perabot Mama TDM    : '+fRp(d.tdm)+'\n\u2022 Toko Central Perabot     : '+fRp(d.central)+'\n\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\ud83d\udcb0 *Total* : '+fRp(tT)+'\n\n\ud83d\udcf1 *Per Channel*\n\u2022 WA        : '+fRp(d.wa)+'\n\u2022 Shopee    : '+fRp(d.shopee)+'\n\u2022 Tiktok    : '+fRp(d.tiktok)+'\n\u2022 Tokopedia : '+fRp(d.tokopedia)+'\n\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\ud83d\udcb0 *Total Penjualan* : '+fRp(tC)+'\n\n\ud83d\udcb3 *Metode Bayar*\n\u2022 Tunai/CASH : '+fRp(d.tunai)+'\n\u2022 Debit/TF   : '+fRp(d.debit)+'\n\u2022 Credit     : '+fRp(d.kredit)+'\n\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n'+nt+'_Laporan otomatis_';
}

// ── ROUTES ────────────────────────────────────────────
app.get('/', function(req,res){res.send('Bot aktif');});
app.get('/webhook', function(req,res){res.send('Webhook aktif');});
app.get('/reload', function(req,res){loadExcel();res.send('Reloaded: '+DATA_BARANG.length+' item');});

app.post('/webhook', async function(req,res){
  res.sendStatus(200);
  try {
    var body=req.body||{}, sender=body.sender||body.from||body.phone||null, message=body.message||body.text||body.msg||'', image=body.image||body.file||body.media||'';
    if(!sender) return;
    var msg=message.trim(), low=msg.toLowerCase();

    // ── SAPAAN PERTAMA KALI ──
    if(!sudahDisapa[sender]) {
      sudahDisapa[sender] = true;
      var sapMsg = getSapaan(sender);
      await kirimWA(sender, sapMsg + '\n\nKirim *menu* untuk melihat pilihan yang tersedia.');
      // Kalau pesan pertamanya sudah "menu" atau "halo", lanjut proses
      if(!['menu','halo','hi','mulai','start'].includes(low)) return;
    }

    // ── ADMIN ──
    if(isAdmin(sender)) {
      if(low.startsWith('daftar ')) {
        var nb=msg.substring(7).trim().replace(/[^0-9]/g,'');
        if(!nb){await kirimWA(sender,'Format: _daftar 6281234567890_');return;}
        if(MEMBERS.indexOf(nb)>=0){await kirimWA(sender,'\u26a0\ufe0f Nomor *'+nb+'* sudah terdaftar.');return;}
        MEMBERS.push(nb); saveMembers(MEMBERS);
        await kirimWA(sender,'\u2705 Nomor *'+nb+'* berhasil didaftarkan!\nTotal member: '+MEMBERS.length); return;
      }
      if(low.startsWith('hapus ')) {
        var nh=msg.substring(6).trim().replace(/[^0-9]/g,'');
        var ih=MEMBERS.indexOf(nh);
        if(ih===-1){await kirimWA(sender,'\u274c Nomor *'+nh+'* tidak ditemukan.');return;}
        MEMBERS.splice(ih,1); saveMembers(MEMBERS);
        await kirimWA(sender,'\u2705 Nomor *'+nh+'* berhasil dihapus!\nTotal member: '+MEMBERS.length); return;
      }
      if(low==='listmember') {
        var lst='\ud83d\udc65 *Daftar Member ('+MEMBERS.length+'):*\n\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n';
        MEMBERS.forEach(function(m,i){lst+=(i+1)+'. '+m+' — '+(KONTAK[m]||'(belum ada nama)')+'\n';});
        lst+='\n\ud83d\udc51 Admin: '+ADMIN;
        await kirimWA(sender,lst); return;
      }
      // Daftarkan/edit nama kontak: namakontak 6281234567890 Nama Lengkap
      if(low.startsWith('namakontak ')) {
        var parts = msg.substring(11).trim().split(/\s+/);
        if(parts.length < 2){await kirimWA(sender,'Format: _namakontak 6281234567890 Nama Lengkap_');return;}
        var nomorKontak = parts[0].replace(/[^0-9]/g,'');
        var namaKontak  = parts.slice(1).join(' ');
        KONTAK[nomorKontak] = namaKontak;
        saveKontak(KONTAK);
        await kirimWA(sender,'\u2705 Nama kontak disimpan!\n\ud83d\udcf1 *'+nomorKontak+'*\n\ud83d\udc64 Nama: *'+namaKontak+'*');
        return;
      }
      if(low==='listkontak') {
        var kkeys = Object.keys(KONTAK);
        var klst = '\ud83d\udcd2 *Daftar Kontak ('+kkeys.length+'):*\n\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n';
        kkeys.forEach(function(k,i){ klst += (i+1)+'. '+k+'\n   \ud83d\udc64 '+KONTAK[k]+'\n'; });
        await kirimWA(sender, klst); return;
      }
    }

    // ── DETEKSI SAPAAN (kapan saja, awal/tengah/akhir chat) ──
    var kataKataAwal = low.split(/[\s,!?.]+/)[0];
    var KATA_SAPAAN = [
      'halo','hai','hi','hello','hey','hei','holla','ola',
      'selamat','pagi','siang','sore','malam','met',
      'assalamu','assalamualaikum','waalaikumsalam','waalaikum',
      'permisi','maaf','excuse','hei','howdy','yo','sup'
    ];
    var isSapaan = KATA_SAPAAN.some(function(k) {
      return low === k || low.startsWith(k + ' ') || low.startsWith(k + ',') || low.startsWith(k + '!');
    });

    if (isSapaan) {
      var jam2 = new Date(Date.now() + 8*3600000).getUTCHours();
      var waktu2 = jam2>=5&&jam2<11?'Pagi':jam2>=11&&jam2<15?'Siang':jam2>=15&&jam2<19?'Sore':'Malam';
      var nama2 = getNama(sender);
      var balasanSapaan = nama2
        ? 'Selamat ' + waktu2 + ' juga, *' + nama2 + '*! \ud83d\ude0a\n\nAda yang bisa saya bantu?\nKirim *menu* untuk melihat pilihan.'
        : 'Selamat ' + waktu2 + ' juga! \ud83d\ude0a\n\nAda yang bisa saya bantu?\nKirim *menu* untuk melihat pilihan.';
      await kirimWA(sender, balasanSapaan);
      return;
    }

    // ── CARI LANGSUNG ──
    if(low.startsWith('cari ')) {
      var kw=msg.substring(5).trim();
      if(!kw){await kirimWA(sender,'Contoh: _cari dandang eagle 20_');return;}
      var s0=sesi[sender]||{};
      if(s0.mode==='cari'&&s0.tokoKari){
        await kirimWA(sender,formatHasil(cariBarang(kw),s0.tokoKari));
      } else {
        sesi[sender]={ mode:'cari', pendingKw: kw };
        await kirimWA(sender,MSG_PILIH_TOKO_CARI);
      }
      return;
    }

    // ── UPDATE STOK ──
    if(low.startsWith('stok ')) {
      var pts=msg.substring(5).trim().split(/\s+/);
      if(pts.length<3){await kirimWA(sender,'Format: _stok [toko] [kode] [jumlah]_\nContoh: _stok nk NN00001 10_\n\nKode: nk / tdm / oesapa / kefa / cp');return;}
      var tkS=pts[0].toLowerCase(), kdS=pts[1], jmlS=parseInt(pts[2]);
      if(!TOKO_COLS[tkS]){await kirimWA(sender,'Kode toko tidak valid.\nGunakan: nk, tdm, oesapa, kefa, cp');return;}
      if(isNaN(jmlS)){await kirimWA(sender,'Jumlah harus angka');return;}
      var itmS=updateStok(kdS,tkS,jmlS);
      if(!itmS){await kirimWA(sender,'\u274c Kode *'+kdS+'* tidak ditemukan.');return;}
      await kirimWA(sender,'\u2705 Stok diperbarui!\n\ud83c\udfe6 '+NAMA_TOKO[tkS]+'\n\ud83d\udd16 '+itmS.kode+'\n\ud83d\udce6 '+itmS.nama+'\n\ud83d\udcca Stok baru: *'+jmlS+' '+itmS.satuan+'*');
      return;
    }

    // ── RESET ──
    if(['0','batal','menu','halo','hi','mulai','start'].includes(low)){
      sesi[sender]={}; await kirimWA(sender,getMenu(sender)); return;
    }

    if(!sesi[sender]) sesi[sender]={};
    var s=sesi[sender];

    // ── MODE CARI: pilih toko ──
    if(s.mode==='cari'&&!s.tokoKari) {
      var ci=parseInt(msg)-1;
      if(ci>=0&&ci<TOKO_LIST.length){
        s.tokoKari=TOKO_LIST[ci].kode;
        if(s.pendingKw){
          await kirimWA(sender,formatHasil(cariBarang(s.pendingKw),s.tokoKari));
          delete s.pendingKw;
          setTimeout(async function(){ await kirimWA(sender,'\ud83d\udd0d Cari lagi di *'+NAMA_TOKO[s.tokoKari]+'*?\nKetik nama/kode atau *0* kembali ke menu.'); },800);
        } else {
          await kirimWA(sender,MSG_SIAP_CARI(TOKO_LIST[ci].nama));
        }
      } else { await kirimWA(sender,MSG_PILIH_TOKO_CARI); }
      return;
    }

    // ── MODE CARI: terima keyword ──
    if(s.mode==='cari'&&s.tokoKari) {
      if(!msg) return;
      await kirimWA(sender,formatHasil(cariBarang(msg),s.tokoKari));
      setTimeout(async function(){ await kirimWA(sender,'\ud83d\udd0d Cari lagi di *'+NAMA_TOKO[s.tokoKari]+'*?\nKetik nama/kode atau *0* kembali ke menu.'); },800);
      return;
    }

    // ── LEVEL 1: Pilih menu ──
    if(!s.menu) {
      if(msg==='1'||msg==='2'||msg==='3'){
        s.menu=parseInt(msg);
        await kirimWA(sender,s.menu===3?mPilihHari('Marketplace Perabot Mama'):mPilihToko(s.menu));
      } else if(msg==='4'){
        if(!isMember(sender)){await kirimWA(sender,'\ud83d\udeab *Akses Ditolak*\n\nFitur ini hanya untuk member terdaftar.');return;}
        sesi[sender]={ mode:'cari' };
        await kirimWA(sender,MSG_PILIH_TOKO_CARI);
      } else { await kirimWA(sender,getMenu(sender)); }
      return;
    }

    // ── LEVEL 2: Pilih toko ──
    if(s.menu!==3&&!s.toko){
      var ti=parseInt(msg)-1;
      if(ti>=0&&ti<TOKO_LIST.length){s.toko=TOKO_LIST[ti].kode;await kirimWA(sender,mPilihHari(TOKO_LIST[ti].nama));}
      else await kirimWA(sender,mPilihToko(s.menu));
      return;
    }

    // ── LEVEL 3: Pilih hari ──
    if(s.kemarin===undefined){
      if(msg==='1') s.kemarin=false;
      else if(msg==='2') s.kemarin=true;
      else{await kirimWA(sender,mPilihHari(s.menu===3?'Marketplace Perabot Mama':TOKO[s.toko]));return;}
      await kirimWA(sender,mSiap(s.menu===3?'Marketplace Perabot Mama':TOKO[s.toko],s.kemarin,s.menu));
      return;
    }

    // ── LEVEL 4: Terima data / foto ──
    var nama2=s.menu===3?'Marketplace Perabot Mama':TOKO[s.toko], laporan='';
    if(image&&image.length>0){
      await kirimWA(sender,'Foto diterima, sedang diproses...');
      try {
        var pr2=s.menu===1?'Baca data penjualan toko "'+nama2+'" tanggal '+tgl(s.kemarin)+'. Buat laporan lengkap WhatsApp dengan emoji, kassa, total, metode bayar, jenis penjualan. Format rupiah Rp X.XXX.XXX.':s.menu===2?'Baca data harga barang toko "'+nama2+'" tanggal '+tgl(s.kemarin)+'. Buat laporan WhatsApp dengan sapaan sesuai jam, barang baru/naik/turun harga.':'Baca data marketplace tanggal '+tgl(s.kemarin)+'. Buat laporan WhatsApp per toko, channel, metode bayar.';
        laporan=await gemini(image,pr2);
      } catch(e){console.error('Gemini:',e.message);await kirimWA(sender,'Gagal baca foto. Coba ketik manual.');return;}
    } else if(msg){
      if(s.menu===1) laporan=lPenjualan(msg,nama2,s.kemarin);
      if(s.menu===2) laporan=lHarga(msg,nama2,s.kemarin);
      if(s.menu===3) laporan=lMarket(msg,s.kemarin);
    } else return;

    if(laporan){
      await kirimWA(sender,laporan);
      sesi[sender]={};
      setTimeout(async function(){await kirimWA(sender,'Selesai! Kirim *menu* untuk laporan berikutnya.');},1000);
    }

  } catch(e){ console.error('Error:',e.message); }
});

var PORT=process.env.PORT||3000;
app.listen(PORT,function(){console.log('Bot aktif di port '+PORT);});
