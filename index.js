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

var sesi = {};
var DATA_BARANG = [];
var EXCEL_PATH  = path.join(__dirname, 'harga_barang.xlsx');

function loadExcel() {
  try {
    if (!fs.existsSync(EXCEL_PATH)) { console.log('File tidak ditemukan!'); return; }
    var wb   = xlsx.readFile(EXCEL_PATH);
    var ws   = wb.Sheets[wb.SheetNames[0]];
    var rows = xlsx.utils.sheet_to_json(ws);
    DATA_BARANG = rows.map(function(r) {
      return {
        kode  : String(r['Kode Item']   || '').trim().toUpperCase(),
        nama  : String(r['Nama Item']   || '').trim().toUpperCase(),
        jenis : String(r['Jenis']       || '').trim(),
        merek : String(r['Merek']       || '').trim(),
        satuan: String(r['Satuan']      || '').trim(),
        ecer  : parseInt(r['Harga Ecer']   || 0),
        ambil : parseInt(r['Harga Ambil']  || 0),
        stok  : parseInt(r['Stok']         || 0)
      };
    });
    console.log('Data loaded: ' + DATA_BARANG.length + ' item');
  } catch(e) { console.error('Gagal load:', e.message); }
}

function saveExcel() {
  try {
    var rows = DATA_BARANG.map(function(d) {
      return { 'Kode Item': d.kode, 'Nama Item': d.nama, 'Jenis': d.jenis, 'Merek': d.merek, 'Satuan': d.satuan, 'Harga Ecer': d.ecer, 'Harga Ambil': d.ambil, 'Stok': d.stok };
    });
    var wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(rows), 'Data Barang');
    xlsx.writeFile(wb, EXCEL_PATH);
    return true;
  } catch(e) { console.error('Gagal save:', e.message); return false; }
}

loadExcel();

function cariBarang(keyword) {
  var q = keyword.trim().toUpperCase();
  var byKode = DATA_BARANG.filter(function(d) { return d.kode === q; });
  if (byKode.length > 0) return byKode;
  var words = q.split(/\s+/);
  return DATA_BARANG.filter(function(d) {
    return words.every(function(w) { return d.nama.indexOf(w) >= 0 || d.kode.indexOf(w) >= 0; });
  });
}

function formatRp(angka) {
  if (!angka || angka === 0) return 'Rp -';
  return 'Rp ' + parseInt(angka).toLocaleString('id-ID');
}

function formatHasil(items) {
  if (items.length === 0) return 'Barang tidak ditemukan.\n\nCoba kata kunci berbeda.\nContoh: _cari periuk eagle 20_';
  if (items.length === 1) {
    var d = items[0];
    return '\ud83c\udff7\ufe0f *Detail Barang*\n\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n' +
      '\ud83d\udd16 *Kode*   : ' + d.kode + '\n' +
      '\ud83d\udce6 *Nama*   : ' + d.nama + '\n' +
      '\ud83c\udff7\ufe0f *Jenis*  : ' + d.jenis + '\n' +
      '\ud83c\udfd7\ufe0f *Merek*  : ' + d.merek + '\n' +
      '\ud83d\udccf *Satuan* : ' + d.satuan + '\n' +
      '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n' +
      '\ud83d\udcb0 *Harga Ecer*  : ' + formatRp(d.ecer) + '\n' +
      '\ud83d\udcb0 *Harga Ambil* : ' + formatRp(d.ambil 6 pcs) + '\n' +
      '\ud83d\udcca *Stok*        : ' + (d.stok > 0 ? d.stok + ' ' + d.satuan : 'Kosong') + '\n' +
      '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501';
  }
  if (items.length > 10) return 'Ditemukan *' + items.length + ' barang*. Terlalu banyak.\n\nCoba lebih spesifik:\n_cari periuk eagle 20 cm_';
  var msg = '\ud83d\udd0d *Ditemukan ' + items.length + ' barang:*\n\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n';
  items.forEach(function(d, i) {
    msg += (i+1) + '. *' + d.nama + '*\n   \ud83d\udd16 ' + d.kode + ' | ' + d.satuan + '\n   \ud83d\udcb0 Ecer: ' + formatRp(d.ecer) + ' | Ambil: ' + formatRp(d.ambil) + '\n   \ud83d\udcca Stok: ' + (d.stok > 0 ? d.stok + ' ' + d.satuan : 'Kosong') + '\n';
    if (i < items.length-1) msg += '\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n';
  });
  return msg + '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501';
}

function updateStok(kode, jumlah) {
  var k = kode.trim().toUpperCase();
  for (var i = 0; i < DATA_BARANG.length; i++) {
    if (DATA_BARANG[i].kode === k) { DATA_BARANG[i].stok = jumlah; saveExcel(); return DATA_BARANG[i]; }
  }
  return null;
}

var TOKO_LIST = [
  { kode: 'nk', nama: 'Nasional Kitchen' },
  { kode: 'tdm', nama: 'Perabot Mama TDM' },
  { kode: 'oesapa', nama: 'Perabot Mama Oesapa' },
  { kode: 'kefa', nama: 'Perabot Mamaku Kefamenanu' }
];
var TOKO = {};
TOKO_LIST.forEach(function(t) { TOKO[t.kode] = t.nama; });

async function kirimWA(target, message) {
  try { await axios.post('https://api.fonnte.com/send', { target: target, message: message }, { headers: { Authorization: FONNTE_TOKEN } }); }
  catch(e) { console.error('Gagal kirim:', e.message); }
}

function fRp(n) { var v = parseInt(n)||0; return v===0?'Rp. -':'Rp. '+v.toLocaleString('id-ID'); }
function fRpP(n) { return 'Rp '+(parseInt(n)||0).toLocaleString('id-ID'); }
function sapaan(nm) { var j=new Date(Date.now()+8*3600000).getUTCHours(); return 'Selamat '+(j>=5&&j<11?'Pagi':j>=11&&j<15?'Siang':j>=15&&j<19?'Sore':'Malam')+' Team '+nm; }
function tgl(kem) { var d=new Date(Date.now()+8*3600000); if(kem) d.setDate(d.getDate()-1); return d.toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'}); }

async function gemini(url, prompt) {
  var r = await axios.get(url, { responseType:'arraybuffer', timeout:15000 });
  var resp = await axios.post(GEMINI_URL, { contents:[{ parts:[{ inline_data:{ mime_type: r.headers['content-type']||'image/jpeg', data: Buffer.from(r.data).toString('base64') } },{ text:prompt }]}]}, { timeout:30000 });
  return resp.data.candidates[0].content.parts[0].text||'';
}

var MENU = '\ud83e\udd16 *Bot Laporan & Harga Toko*\n\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\nPilih menu:\n\n*1.* \ud83d\udcca Laporan Penjualan\n*2.* \ud83c\udff7\ufe0f Laporan Harga Barang\n*3.* \ud83d\udecd\ufe0f Laporan Marketplace\n*4.* \ud83d\udd0d Cari Harga Barang\n\n\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\nAtau langsung ketik:\n\u2022 _cari periuk eagle 20_\n\u2022 _cari NN00036_\n\u2022 _stok NN00036 25_';

function mPilihToko(m) { return (m===1?'\ud83d\udcca':m===2?'\ud83c\udff7\ufe0f':'\ud83d\udecd\ufe0f')+' *'+(m===1?'Laporan Penjualan':m===2?'Laporan Harga Barang':'Laporan Marketplace')+'*\n\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\nPilih toko:\n\n*1.* Nasional Kitchen\n*2.* Perabot Mama TDM\n*3.* Perabot Mama Oesapa\n*4.* Perabot Mamaku Kefamenanu\n\nBalas *0* untuk kembali'; }
function mPilihHari(nm) { return '\ud83c\udfe6 *'+nm+'*\n\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\nLaporan untuk:\n\n*1.* \ud83d\udcc5 Hari ini\n*2.* \ud83d\udcc5 Kemarin\n\nBalas *0* untuk kembali'; }

function mSiap(nm, kem, menu) {
  var t = tgl(kem), k = kem?' _(kemarin)_':'';
  var c = menu===1?'k1 29000000\nk2 11000000\ntunai 26000000\ndebit 14000000\nkredit 0\necer 23000000\ngrosir 17000000':menu===2?'---baru---\nNama barang baru\n---naik---\nNama barang naik\n---turun---\nNama barang turun':'oesapa 0\ntdm 0\ncentral 21061000\nwa 21061000\nshopee 0\ntiktok 0\ntokopedia 0\ntunai 304000\ndebit 20757000\nkredit 0\nnota 019 (009383/CPK/05/26)';
  return '\u2705 *Siap!*\n\ud83c\udfe6 '+nm+'\n\ud83d\udcc5 '+t+k+'\n\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\nKirim FOTO atau ketik:\n\n'+c+'\n\nBalas *0* untuk batal.';
}

function lPenjualan(text, nm, kem) {
  var t=tgl(kem), k=kem?' _(kemarin)_':'', d={};
  text.trim().toLowerCase().split('\n').forEach(function(l) { var p=l.trim().split(/\s+/); if(p.length>=2){var v=p[1].replace(/[^0-9]/g,'');if(v)d[p[0]]=v;} });
  var k1=parseInt(d.k1||0),k2=parseInt(d.k2||0),k3=parseInt(d.k3||0),tot=k1+k2+k3;
  var ks=''; if(k1)ks+='\u2022 Kassa 1 : '+fRpP(k1)+'\n'; if(k2)ks+='\u2022 Kassa 2 : '+fRpP(k2)+'\n'; if(k3)ks+='\u2022 Kassa 3 : '+fRpP(k3)+'\n'; if(!ks)ks='\u2022 -\n';
  return '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n\ud83d\udcca *LAPORAN PENJUALAN*\n\ud83c\udfe6 *Toko '+nm+'*\n\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n\ud83d\udcc5 *'+t+'*'+k+'\n\n\ud83d\udcb0 *PENJUALAN PER KASSA*\n'+ks+'\n\ud83d\udce6 *TOTAL KESELURUHAN*\n'+fRpP(tot)+'\n\n\ud83d\udcb3 *METODE PEMBAYARAN*\n\u2022 Tunai  : '+fRpP(parseInt(d.tunai||0))+'\n\u2022 Debit  : '+fRpP(parseInt(d.debit||0))+'\n\u2022 Kredit : '+fRpP(parseInt(d.kredit||0))+'\n\n\ud83d\uded2 *JENIS PENJUALAN*\n\u2022 Ecer   : '+fRpP(parseInt(d.ecer||0))+'\n\u2022 Grosir : '+fRpP(parseInt(d.grosir||0))+'\n\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n_Laporan otomatis_';
}

function lHarga(text, nm, kem) {
  var t=tgl(kem), s=sapaan(nm), h=kem?'Kemarin':'Ini', k=kem?' _(kemarin)_':'';
  var d={baru:[],naik:[],turun:[],note:[]}, mode=null;
  text.trim().split('\n').forEach(function(l){ var tr=l.trim(),lo=tr.toLowerCase(); if(!tr)return; if(lo.indexOf('---baru---')>=0||lo==='baru'){mode='baru';return;} if(lo.indexOf('---naik---')>=0||lo==='naik'){mode='naik';return;} if(lo.indexOf('---turun---')>=0||lo==='turun'){mode='turun';return;} if(lo.indexOf('---note---')>=0||lo==='note'){mode='note';return;} if(mode)d[mode].push(tr); });
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
  text.trim().toLowerCase().split('\n').forEach(function(l){ var tr=l.trim(); if(!tr)return; if(tr.indexOf('nota ')===0){d.nota.push(l.trim().substring(5));return;} var p=tr.split(/\s+/); if(p.length>=2&&p[0] in d)d[p[0]]=parseInt(p.slice(1).join('').replace(/[^0-9]/g,''))||0; });
  var tToko=d.oesapa+d.tdm+d.central, tCh=d.wa+d.shopee+d.tiktok+d.tokopedia, nota='';
  if(d.nota.length>0){nota='\n';d.nota.forEach(function(n){nota+='- Nomor Nota '+n+'\n';});}
  return '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n\ud83d\udecd\ufe0f *Total Penjualan Marketplace*\n*Perabot Mama*\n\ud83d\udcc5 Periode '+t+k+'\n\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n\ud83c\udfe6 *Per Toko*\n\u2022 Toko Perabot Mama Oesapa : '+fRp(d.oesapa)+'\n\u2022 Toko Perabot Mama TDM    : '+fRp(d.tdm)+'\n\u2022 Toko Central Perabot     : '+fRp(d.central)+'\n\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\ud83d\udcb0 *Total* : '+fRp(tToko)+'\n\n\ud83d\udcf1 *Per Channel*\n\u2022 WA        : '+fRp(d.wa)+'\n\u2022 Shopee    : '+fRp(d.shopee)+'\n\u2022 Tiktok    : '+fRp(d.tiktok)+'\n\u2022 Tokopedia : '+fRp(d.tokopedia)+'\n\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\ud83d\udcb0 *Total Penjualan* : '+fRp(tCh)+'\n\n\ud83d\udcb3 *Metode Bayar*\n\u2022 Tunai/CASH : '+fRp(d.tunai)+'\n\u2022 Debit/TF   : '+fRp(d.debit)+'\n\u2022 Credit     : '+fRp(d.kredit)+'\n\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n'+nota+'_Laporan otomatis_';
}

app.get('/', function(req,res){res.send('Bot aktif');});
app.get('/webhook', function(req,res){res.send('Webhook aktif');});
app.get('/reload', function(req,res){loadExcel();res.send('Reloaded: '+DATA_BARANG.length+' item');});

app.post('/webhook', async function(req,res){
  res.sendStatus(200);
  try {
    var body=req.body||{}, sender=body.sender||body.from||body.phone||null, message=body.message||body.text||body.msg||'', image=body.image||body.file||body.media||'';
    if(!sender) return;
    var msg=message.trim(), low=msg.toLowerCase();

    if(low.startsWith('cari ')){ var k=msg.substring(5).trim(); if(!k){await kirimWA(sender,'Contoh: _cari periuk eagle 20_');return;} await kirimWA(sender,formatHasil(cariBarang(k))); return; }
    if(low.startsWith('stok ')){ var pts=msg.substring(5).trim().split(/\s+/); if(pts.length<2){await kirimWA(sender,'Format: _stok [kode] [jumlah]_');return;} var jml=parseInt(pts[1]); if(isNaN(jml)){await kirimWA(sender,'Jumlah harus angka');return;} var itm=updateStok(pts[0],jml); if(!itm){await kirimWA(sender,'Kode '+pts[0]+' tidak ditemukan');return;} await kirimWA(sender,'\u2705 Stok diperbarui!\n\ud83d\udd16 '+itm.kode+'\n\ud83d\udce6 '+itm.nama+'\n\ud83d\udcca Stok: *'+jml+' '+itm.satuan+'*'); return; }

    if(['0','batal','menu','halo','hi','mulai','start'].includes(low)){ sesi[sender]={}; await kirimWA(sender,MENU); return; }

    if(!sesi[sender]) sesi[sender]={};
    var s=sesi[sender];

    if(!s.menu){
      if(msg==='1'||msg==='2'||msg==='3'){ s.menu=parseInt(msg); await kirimWA(sender,s.menu===3?mPilihHari('Marketplace Perabot Mama'):mPilihToko(s.menu)); }
      else if(msg==='4'){ sesi[sender]={}; await kirimWA(sender,'\ud83d\udd0d *Cari Harga Barang*\n\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\nKetik:\n\u2022 _cari periuk eagle 20_\n\u2022 _cari NN00036_\n\nUpdate stok:\n\u2022 _stok NN00036 25_\n\nBalas *0* untuk kembali.'); }
      else await kirimWA(sender,MENU);
      return;
    }

    if(s.menu!==3&&!s.toko){ var idx=parseInt(msg)-1; if(idx>=0&&idx<TOKO_LIST.length){s.toko=TOKO_LIST[idx].kode;await kirimWA(sender,mPilihHari(TOKO_LIST[idx].nama));}else await kirimWA(sender,mPilihToko(s.menu)); return; }

    if(s.kemarin===undefined){ if(msg==='1')s.kemarin=false; else if(msg==='2')s.kemarin=true; else{await kirimWA(sender,mPilihHari(s.menu===3?'Marketplace Perabot Mama':TOKO[s.toko]));return;} await kirimWA(sender,mSiap(s.menu===3?'Marketplace Perabot Mama':TOKO[s.toko],s.kemarin,s.menu)); return; }

    var nama=s.menu===3?'Marketplace Perabot Mama':TOKO[s.toko], laporan='';
    if(image&&image.length>0){
      await kirimWA(sender,'Foto diterima, sedang diproses...');
      try {
        var pr=s.menu===1?'Baca data penjualan toko "'+nama+'" tanggal '+tgl(s.kemarin)+'. Buat laporan format WhatsApp lengkap dengan emoji, kassa, total, metode bayar, jenis penjualan. Format rupiah Rp X.XXX.XXX.':s.menu===2?'Baca data harga barang toko "'+nama+'" tanggal '+tgl(s.kemarin)+'. Buat laporan WhatsApp dengan sapaan, barang baru/naik/turun harga, dan catatan tetap.':'Baca data marketplace tanggal '+tgl(s.kemarin)+'. Buat laporan WhatsApp dengan per toko, channel, metode bayar.';
        laporan=await gemini(image,pr);
      } catch(e){ console.error('Gemini:',e.message); await kirimWA(sender,'Gagal baca foto. Coba ketik manual.'); return; }
    } else if(msg){
      if(s.menu===1) laporan=lPenjualan(msg,nama,s.kemarin);
      if(s.menu===2) laporan=lHarga(msg,nama,s.kemarin);
      if(s.menu===3) laporan=lMarket(msg,s.kemarin);
    } else return;

    if(laporan){ await kirimWA(sender,laporan); sesi[sender]={}; setTimeout(async function(){await kirimWA(sender,'Selesai! Kirim *menu* untuk laporan berikutnya.');},1000); }
  } catch(e){ console.error('Error:',e.message); }
});

var PORT=process.env.PORT||3000;
app.listen(PORT,function(){console.log('Bot aktif di port '+PORT);});
