const express = require('express');
const session = require('express-session');
const cors = require('cors');
const Firebird = require('node-firebird');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3100;

// Autentificare
const AUTH_USER = process.env.AUDIT_USER || 'star';
const AUTH_PASS = process.env.AUDIT_PASS || 'Star2026.,';

app.use(session({
    secret: 'audit-amanet-secret-2026',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Middleware autentificare
function requireAuth(req, res, next) {
    if (req.session && req.session.authenticated) return next();
    if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Neautorizat' });
    res.redirect('/login');
}

// Pagina login
app.get('/login', (req, res) => {
    if (req.session && req.session.authenticated) return res.redirect('/');
    res.send(getLoginPage());
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (username === AUTH_USER && password === AUTH_PASS) {
        req.session.authenticated = true;
        res.redirect('/');
    } else {
        res.send(getLoginPage('Utilizator sau parola incorecta!'));
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

function getLoginPage(error) {
    return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Login - Audit Amanet</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Tahoma',sans-serif;background:#c0c0c0;height:100vh;display:flex;align-items:center;justify-content:center}
.login-box{background:#c0c0c0;border:3px outset #dfdfdf;width:380px;box-shadow:5px 5px 20px rgba(0,0,0,0.3)}
.login-header{background:linear-gradient(to right,#0078d4,#00a8e8);color:white;padding:10px 16px;font-weight:bold;font-size:14px}
.login-body{padding:25px 20px}
.login-icon{text-align:center;font-size:48px;margin-bottom:15px}
.form-group{margin-bottom:12px}
.form-group label{display:block;font-weight:bold;font-size:11px;margin-bottom:4px}
.form-group input{width:100%;padding:6px 10px;font-size:12px;border:2px inset #d0d0d0;font-family:Tahoma}
.login-btn{width:100%;padding:8px;font-size:13px;font-weight:bold;border:1px solid #000;cursor:pointer;background:linear-gradient(to bottom,#0078d4,#0060b0);color:white;margin-top:8px}
.error{background:#f8d7da;color:#721c24;border:1px solid #dc3545;padding:8px;font-size:11px;margin-bottom:12px;text-align:center}
</style></head><body>
<div class="login-box">
<div class="login-header">&#128202; Audit Amanet - Autentificare</div>
<div class="login-body">
<div class="login-icon">&#128274;</div>
${error ? '<div class="error">' + error + '</div>' : ''}
<form method="POST" action="/login">
<div class="form-group"><label>Utilizator:</label><input type="text" name="username" autofocus required></div>
<div class="form-group"><label>Parola:</label><input type="password" name="password" required></div>
<button type="submit" class="login-btn">&#128273; AUTENTIFICARE</button>
</form></div></div></body></html>`;
}

// Fisiere statice DOAR dupa autentificare
app.use(requireAuth, express.static(__dirname));

// === FISIER PENTRU REZOLVARI MANUALE ===
const rezolvariPath = path.join(__dirname, 'rezolvari_audit.json');

function citesteRezolvari() {
  try {
    if (fs.existsSync(rezolvariPath)) {
      return JSON.parse(fs.readFileSync(rezolvariPath, 'utf8'));
    }
  } catch (e) {
    console.error('Eroare citire rezolvari:', e.message);
  }
  return [];
}

function salveazaRezolvari(rezolvari) {
  try {
    fs.writeFileSync(rezolvariPath, JSON.stringify(rezolvari, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('Eroare salvare rezolvari:', e.message);
    return false;
  }
}

const configPath = path.join(__dirname, 'CONFIG-FIREBIRD.ini');
let dbConfig = {
  host: process.env.FB_HOST || 'localhost',
  port: parseInt(process.env.FB_PORT) || 3050,
  database: process.env.FB_DATABASE || 'C:\\Users\\Mac\\Desktop\\09.12\\Data\\amanet.fdb',
  user: process.env.FB_USER || 'SYSDBA',
  password: process.env.FB_PASS || ''
};
let magazine = [];

if (fs.existsSync(configPath)) {
  const configContent = fs.readFileSync(configPath, 'utf8');
  const lines = configContent.split('\n');
  
  lines.forEach(line => {
    line = line.trim();
    if (line.startsWith(';') || line.startsWith('[')) return;
    
    if (line.includes('=')) {
      const [key, ...valueParts] = line.split('=');
      const value = valueParts.join('=').trim().replace(/\r/g, '');
      
      if (key.trim() === 'Host') dbConfig.host = value;
      if (key.trim() === 'Port') dbConfig.port = parseInt(value) || 3050;
      if (key.trim() === 'Path') dbConfig.database = value;
      if (key.trim() === 'User') dbConfig.user = value;
      if (key.trim() === 'Password') dbConfig.password = value;
    }
  });
  
  console.log(`Configurare incarcata din ${configPath}`);
} else {
  console.log('[WARN] CONFIG-FIREBIRD.ini nu exista, folosesc valori implicite');
}

console.log(`Conectare la: ${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`);
console.log(`User: ${dbConfig.user}, Password: ${dbConfig.password ? '***' : 'LIPSA!'}`);

function getConnection() {
  return new Promise((resolve, reject) => {
    const options = {
      host: dbConfig.host,
      port: dbConfig.port,
      database: dbConfig.database,
      user: dbConfig.user,
      password: dbConfig.password,
      lowercase_keys: false,
      role: null,
      pageSize: 4096
    };
    Firebird.attach(options, (err, db) => {
      if (err) {
        console.error('Eroare conexiune Firebird:', err.message);
        reject(err);
      }
      else resolve(db);
    });
  });
}

function query(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, result) => {
      if (err) reject(err);
      else resolve(result || []);
    });
  });
}

async function loadMagazine() {
  try {
    const db = await getConnection();
    const rows = await query(db, 'SELECT ID_MAGAZIN, DENUMIRE FROM MAGAZINE ORDER BY ID_MAGAZIN');
    db.detach();
    
    magazine = rows.map(r => ({
      id: r.ID_MAGAZIN,
      nume: r.DENUMIRE
    }));
    
    console.log(`Magazine incarcate: ${magazine.length}`);
    magazine.forEach(m => console.log(`  - ID=${m.id}: ${m.nume}`));
    
  } catch (error) {
    console.error('Eroare incarcare magazine:', error.message);
  }
}

loadMagazine();

app.get('/api/magazine', async (req, res) => {
  try {
    const db = await getConnection();
    const rows = await query(db, 'SELECT ID_MAGAZIN, DENUMIRE, ADRESA FROM MAGAZINE ORDER BY ID_MAGAZIN');
    db.detach();
    
    res.json({
      success: true,
      magazine: rows.map(r => ({
        id: r.ID_MAGAZIN,
        nume: r.DENUMIRE,
        adresa: r.ADRESA
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===========================================================================
// REZOLVARI MANUALE - Marcheaza unde au plecat produsele "pierdute"
// ===========================================================================

// GET - Lista toate rezolvarile
app.get('/api/audit/rezolvari', (req, res) => {
  const rezolvari = citesteRezolvari();
  res.json({ success: true, total: rezolvari.length, rezolvari });
});

// POST - Adauga/actualizeaza o rezolvare manuala
app.post('/api/audit/rezolva', (req, res) => {
  console.log('\n========================================');
  console.log('REZOLVARE MANUALA AUDIT');
  console.log('========================================');
  
  try {
    const { cod, magazin_sursa, denumire, pret_intrare, destinatie, explicatie, data_iesire } = req.body;
    
    if (!cod || !magazin_sursa) {
      return res.status(400).json({ success: false, error: 'Cod si magazin_sursa sunt obligatorii' });
    }
    
    const rezolvari = citesteRezolvari();
    
    // Verificam daca exista deja
    const existingIndex = rezolvari.findIndex(r => r.cod === cod && r.magazin_sursa === magazin_sursa);
    
    const rezolvare = {
      cod,
      magazin_sursa,
      denumire: denumire || '',
      pret_intrare: pret_intrare || 0,
      destinatie: destinatie || 'NECUNOSCUT',
      explicatie: explicatie || '',
      data_iesire: data_iesire || null,
      data_rezolvare: new Date().toISOString(),
      rezolvat_de: 'MANUAL'
    };
    
    if (existingIndex >= 0) {
      rezolvari[existingIndex] = rezolvare;
      console.log(`Actualizat: ${cod} din ${magazin_sursa} -> ${destinatie}`);
    } else {
      rezolvari.push(rezolvare);
      console.log(`Adaugat: ${cod} din ${magazin_sursa} -> ${destinatie}`);
    }
    
    if (salveazaRezolvari(rezolvari)) {
      res.json({ success: true, message: 'Rezolvare salvata', rezolvare });
    } else {
      res.status(500).json({ success: false, error: 'Eroare la salvare' });
    }
    
  } catch (error) {
    console.error('Eroare:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST - Rezolva mai multe produse odata
app.post('/api/audit/rezolva-multiple', (req, res) => {
  console.log('\n========================================');
  console.log('REZOLVARE MULTIPLA AUDIT');
  console.log('========================================');
  
  try {
    const { produse, destinatie, explicatie } = req.body;
    
    if (!produse || !Array.isArray(produse) || produse.length === 0) {
      return res.status(400).json({ success: false, error: 'Lista de produse este obligatorie' });
    }
    
    const rezolvari = citesteRezolvari();
    let adaugate = 0, actualizate = 0;
    
    for (const produs of produse) {
      const existingIndex = rezolvari.findIndex(r => r.cod === produs.cod && r.magazin_sursa === produs.magazin_sursa);
      
      const rezolvare = {
        cod: produs.cod,
        magazin_sursa: produs.magazin_sursa,
        denumire: produs.denumire || '',
        pret_intrare: produs.pret_intrare || 0,
        destinatie: destinatie || produs.destinatie || 'NECUNOSCUT',
        explicatie: explicatie || produs.explicatie || '',
        data_iesire: produs.data || null,
        data_rezolvare: new Date().toISOString(),
        rezolvat_de: 'MANUAL'
      };
      
      if (existingIndex >= 0) {
        rezolvari[existingIndex] = rezolvare;
        actualizate++;
      } else {
        rezolvari.push(rezolvare);
        adaugate++;
      }
    }
    
    if (salveazaRezolvari(rezolvari)) {
      console.log(`Rezolvate: ${adaugate} adaugate, ${actualizate} actualizate`);
      res.json({ success: true, message: `${adaugate} adaugate, ${actualizate} actualizate`, total: rezolvari.length });
    } else {
      res.status(500).json({ success: false, error: 'Eroare la salvare' });
    }
    
  } catch (error) {
    console.error('Eroare:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE - Sterge o rezolvare (daca vrei sa o repui in lista)
app.delete('/api/audit/rezolvare/:cod/:magazin', (req, res) => {
  try {
    const { cod, magazin } = req.params;
    const rezolvari = citesteRezolvari();
    
    const newRezolvari = rezolvari.filter(r => !(r.cod === cod && r.magazin_sursa === magazin));
    
    if (newRezolvari.length < rezolvari.length) {
      salveazaRezolvari(newRezolvari);
      res.json({ success: true, message: 'Rezolvare stearsa' });
    } else {
      res.status(404).json({ success: false, error: 'Rezolvare negasita' });
    }
    
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/audit/verificare', async (req, res) => {
  console.log('\n========================================');
  console.log('AUDIT TRANSFERURI');
  console.log('========================================');
  
  try {
    const { dataStart, dataStop, magazinSursa, magazinDest } = req.body;
    
    console.log(`Perioada: ${dataStart} - ${dataStop}`);
    console.log(`Sursa: ${magazinSursa || 'TOATE'}`);
    console.log(`Destinatie: ${magazinDest || 'TOATE'}`);
    
    const db = await getConnection();
    
    const rezultate = {
      iesiri: [],
      intrari: [],
      pierdute: [],
      gasite: [],
      posibile: [],
      inTranzit: []
    };
    
    const magazineSursa = magazinSursa ? magazine.filter(m => m.nume === magazinSursa) : magazine;
    
    for (const mag of magazineSursa) {
      console.log(`\nCitire IESIRI din ${mag.nume} (ID=${mag.id})`);
      
      const bonuri = await query(db, 
        `SELECT ID_BON, NR_BON, DATA_BON FROM BONURIIESIRE 
         WHERE ID_MAGAZIN = ? AND DATA_BON >= ? AND DATA_BON <= ?`,
        [mag.id, dataStart, dataStop]);
      console.log(`  Bonuri iesire: ${bonuri.length}`);
      
      for (const bon of bonuri) {
        const detalii = await query(db,
          `SELECT b.ID_PRODUS, b.CANTITATE, b.PRET_INTRARE, b.PRET_IESIRE, 
                  COALESCE(b.GREUTATE, 0) as GREUTATE, p.COD, p.DENUMIRE 
           FROM BONIESIRI b 
           INNER JOIN PRODUSE p ON p.ID_PRODUS = b.ID_PRODUS 
           WHERE b.ID_BON = ? AND b.ID_MAGAZIN = ?`,
          [bon.ID_BON, mag.id]);
        
        for (const prod of detalii) {
          rezultate.iesiri.push({
            magazin_sursa: mag.nume,
            magazin_sursa_id: mag.id,
            nr_bon: bon.NR_BON,
            data: bon.DATA_BON,
            cod: prod.COD,
            denumire: prod.DENUMIRE,
            cantitate: prod.CANTITATE,
            pret_intrare: prod.PRET_INTRARE,
            pret_iesire: prod.PRET_IESIRE,
            greutate: prod.GREUTATE || 0
          });
        }
      }
    }
    
    console.log(`\nTOTAL IESIRI: ${rezultate.iesiri.length}`);
    
    const magazineDest = magazinDest ? magazine.filter(m => m.nume === magazinDest) : magazine;
    
    for (const mag of magazineDest) {
      console.log(`\nCitire INTRARI din ${mag.nume} (ID=${mag.id})`);
      
      const bonuri = await query(db,
        `SELECT ID_BON, NR_BON, DATA_BON FROM BONURIPRIMIRE 
         WHERE ID_MAGAZIN = ? AND DATA_BON >= ? AND DATA_BON <= ?`,
        [mag.id, dataStart, dataStop]);
      
      for (const bon of bonuri) {
        const detalii = await query(db,
          `SELECT b.ID_PRODUS, b.CANTITATE, b.PRET_INTRARE, b.PRET_IESIRE, 
                  COALESCE(b.GREUTATE, 0) as GREUTATE, p.COD, p.DENUMIRE 
           FROM BONINTRARI b 
           INNER JOIN PRODUSE p ON p.ID_PRODUS = b.ID_PRODUS 
           WHERE b.ID_BON = ? AND b.ID_MAGAZIN = ?`,
          [bon.ID_BON, mag.id]);
        
        for (const prod of detalii) {
          rezultate.intrari.push({
            magazin_destinatie: mag.nume,
            magazin_destinatie_id: mag.id,
            nr_bon: bon.NR_BON,
            data: bon.DATA_BON,
            cod: prod.COD,
            denumire: prod.DENUMIRE,
            cantitate: prod.CANTITATE,
            pret_intrare: prod.PRET_INTRARE,
            pret_iesire: prod.PRET_IESIRE,
            greutate: prod.GREUTATE || 0
          });
        }
      }
    }
    
    // === CAUTAM SI IN VANZARI (produse vandute direct fara receptie) ===
    console.log(`\nCitire VANZARI din toate magazinele...`);
    rezultate.vanzari = [];
    
    for (const mag of magazine) {
      const vanzari = await query(db,
        `SELECT c.NR_BONCASA, c.DATA_BONCASA, c.VALOARE,
                p.COD, p.DENUMIRE, p.PRET_INTRARE, p.PRET_IESIRE, 
                COALESCE(p.GREUTATE, 0) as GREUTATE, p.ID_MAGAZIN
         FROM CASAIESIRI e
         INNER JOIN CASAMARCAT c ON c.ID_BONCASA = e.ID_BONCASA AND c.ID_MAGAZIN = e.ID_MAGAZIN
         INNER JOIN PRODUSE p ON p.ID_PRODUS = e.ID_PRODUS AND p.ID_MAGAZIN = e.ID_MAGAZIN
         WHERE e.ID_MAGAZIN = ? AND c.DATA_BONCASA >= ? AND c.DATA_BONCASA <= ?`,
        [mag.id, dataStart, dataStop]);
      
      for (const v of vanzari) {
        rezultate.vanzari.push({
          magazin_vanzare: mag.nume,
          magazin_vanzare_id: mag.id,
          nr_bon: v.NR_BONCASA,
          data: v.DATA_BONCASA,
          cod: v.COD,
          denumire: v.DENUMIRE,
          pret_intrare: v.PRET_INTRARE,
          pret_iesire: v.PRET_IESIRE,
          greutate: v.GREUTATE || 0
        });
      }
    }
    console.log(`  Vanzari totale: ${rezultate.vanzari.length}`);
    
    // === FUNCTIE DE MATCHING ===
    // COD OBLIGATORIU: Trebuie minim 70% similaritate pentru orice potrivire!
    function calculeazaMatch(iesire, candidat, tipCandidat) {
      let score = 0;
      let matchDetails = [];
      
      // === VERIFICARE OBLIGATORIE: COD SIMILAR (minim 70%) ===
      const codResult = coduriSimilare(iesire.cod, candidat.cod);
      
      // FARA COD SIMILAR = NU E MATCH VALID!
      if (!codResult.similar || codResult.score < 70) {
        return { score: 0, matchDetails: [], acelasiMagazin: false, codInvalid: true };
      }
      
      // Cod valid - adaugam scorul
      score += codResult.score;
      matchDetails.push(`cod_${codResult.score}`);
      
      // === VERIFICARE OBLIGATORIE: PRET_INTRARE IDENTIC ===
      const difPret = Math.abs(candidat.pret_intrare - iesire.pret_intrare);
      if (difPret >= 1) {
        // Pret DIFERIT = NU POATE FI ACELASI PRODUS!
        return { score: 0, matchDetails: ['PRET_DIFERIT'], acelasiMagazin: false, pretInvalid: true };
      }
      // Pret identic - continuam
      matchDetails.push('pret_OK');
      
      // === MATCHING BONUS: DENUMIRE SIMILARA ===
      const simDenumire = similaritate(iesire.denumire, candidat.denumire);
      if (simDenumire >= 0.5) {
        score += Math.floor(simDenumire * 30);
        matchDetails.push(`denumire_${Math.floor(simDenumire * 100)}%`);
      }
      
      // === MATCHING BONUS: GREUTATE (pentru bijuterii) ===
      const matchGreutate = iesire.greutate > 0 && candidat.greutate > 0 && 
                            Math.abs(candidat.greutate - iesire.greutate) < 0.01;
      if (matchGreutate) {
        score += 50;
        matchDetails.push('greutate_exact');
      }
      
      // === MATCHING BONUS: PRET IESIRE (vanzare) ===
      if (candidat.pret_iesire && Math.abs(candidat.pret_iesire - iesire.pret_iesire) < 1) {
        score += 20;
        matchDetails.push('pret_iesire');
      }
      
      // === BONUS: Acelasi magazin (produs returnat) ===
      const acelasiMagazin = (tipCandidat === 'intrare' && candidat.magazin_destinatie_id === iesire.magazin_sursa_id) ||
                            (tipCandidat === 'vanzare' && candidat.magazin_vanzare_id === iesire.magazin_sursa_id);
      if (acelasiMagazin) {
        matchDetails.push('RETURNAT');
      }
      
      return { score, matchDetails, acelasiMagazin, codInvalid: false };
    }
    
    // === CREARE INDEXURI PENTRU CAUTARE RAPIDA ===
    console.log('Creare indexuri pentru cautare rapida...');
    
    // Index dupa COD BAZA pentru intrari
    const indexIntrariCod = {};
    rezultate.intrari.forEach(intrare => {
      const codBaza = getCodBaza(intrare.cod);
      if (!indexIntrariCod[codBaza]) indexIntrariCod[codBaza] = [];
      indexIntrariCod[codBaza].push(intrare);
    });
    
    // Index dupa PRET_INTRARE pentru intrari (rotunjit)
    const indexIntrariPret = {};
    rezultate.intrari.forEach(intrare => {
      const pretKey = Math.round(intrare.pret_intrare);
      if (!indexIntrariPret[pretKey]) indexIntrariPret[pretKey] = [];
      indexIntrariPret[pretKey].push(intrare);
    });
    
    // Index dupa COD BAZA pentru vanzari
    const indexVanzariCod = {};
    rezultate.vanzari.forEach(vanzare => {
      const codBaza = getCodBaza(vanzare.cod);
      if (!indexVanzariCod[codBaza]) indexVanzariCod[codBaza] = [];
      indexVanzariCod[codBaza].push(vanzare);
    });
    
    // Index dupa PRET_INTRARE pentru vanzari
    const indexVanzariPret = {};
    rezultate.vanzari.forEach(vanzare => {
      const pretKey = Math.round(vanzare.pret_intrare);
      if (!indexVanzariPret[pretKey]) indexVanzariPret[pretKey] = [];
      indexVanzariPret[pretKey].push(vanzare);
    });
    
    console.log('Indexuri create. Procesare iesiri...');
    
    // === PROCESARE IESIRI (OPTIMIZAT) ===
    for (const iesire of rezultate.iesiri) {
      let bestMatch = null;
      let bestScore = 0;
      let bestType = null;
      let bestMagazin = null;
      let bestAcelasiMagazin = false;
      
      const dataIesire = new Date(iesire.data);
      const codBazaIesire = getCodBaza(iesire.cod);
      const pretKeyIesire = Math.round(iesire.pret_intrare);
      
      // === ETAPA 1: CAUTARE RAPIDA PE COD ===
      // Cautam doar in intrari/vanzari cu cod similar (foarte rapid)
      const candidatiCod = [
        ...(indexIntrariCod[codBazaIesire] || []).map(c => ({...c, tip: 'intrare'})),
        ...(indexVanzariCod[codBazaIesire] || []).map(c => ({...c, tip: 'vanzare'}))
      ];
      
      for (const candidat of candidatiCod) {
        const dataCand = new Date(candidat.data);
        const zileDif = Math.floor((dataCand - dataIesire) / (1000 * 60 * 60 * 24));
        if (zileDif < 0 || zileDif > (candidat.tip === 'vanzare' ? 30 : 14)) continue;
        
        const match = calculeazaMatch(iesire, candidat, candidat.tip);
        if (match.score > bestScore) {
          bestScore = match.score;
          bestMatch = candidat;
          bestMatch.matchDetails = match.matchDetails.join(', ');
          bestType = candidat.tip === 'intrare' ? 'INTRARE_NIR' : 'VANDUT';
          bestMagazin = candidat.tip === 'intrare' ? candidat.magazin_destinatie : candidat.magazin_vanzare;
          bestAcelasiMagazin = match.acelasiMagazin;
        }
      }
      
      // === ETAPA 2: DOAR DACA NU AM GASIT - CAUTARE PE PRET ===
      if (bestScore < 100) {
        const candidatiPret = [
          ...(indexIntrariPret[pretKeyIesire] || []).map(c => ({...c, tip: 'intrare'})),
          ...(indexIntrariPret[pretKeyIesire - 1] || []).map(c => ({...c, tip: 'intrare'})),
          ...(indexIntrariPret[pretKeyIesire + 1] || []).map(c => ({...c, tip: 'intrare'})),
          ...(indexVanzariPret[pretKeyIesire] || []).map(c => ({...c, tip: 'vanzare'})),
          ...(indexVanzariPret[pretKeyIesire - 1] || []).map(c => ({...c, tip: 'vanzare'})),
          ...(indexVanzariPret[pretKeyIesire + 1] || []).map(c => ({...c, tip: 'vanzare'}))
        ];
        
        for (const candidat of candidatiPret) {
          const dataCand = new Date(candidat.data);
          const zileDif = Math.floor((dataCand - dataIesire) / (1000 * 60 * 60 * 24));
          if (zileDif < 0 || zileDif > (candidat.tip === 'vanzare' ? 30 : 14)) continue;
          
          const match = calculeazaMatch(iesire, candidat, candidat.tip);
          if (match.score > bestScore) {
            bestScore = match.score;
            bestMatch = candidat;
            bestMatch.matchDetails = match.matchDetails.join(', ');
            bestType = candidat.tip === 'intrare' ? 'INTRARE_NIR' : 'VANDUT';
            bestMagazin = candidat.tip === 'intrare' ? candidat.magazin_destinatie : candidat.magazin_vanzare;
            bestAcelasiMagazin = match.acelasiMagazin;
          }
        }
      }
      
      // === CLASIFICARE REZULTAT ===
      // Praguri: GASIT >= 80 (pret identic + cod >= 70% = transfer complet)
      // POSIBIL >= 70 (cazuri limita de verificat manual)
      if (bestMatch && bestScore >= 80) {
        // Pret identic + cod similar >= 70% = TRANSFER COMPLET
        rezultate.gasite.push({
          ...iesire,
          magazin_destinatie: bestMagazin,
          cod_destinatie: bestMatch.cod,
          denumire_destinatie: bestMatch.denumire,
          greutate_destinatie: bestMatch.greutate,
          data_receptie: bestMatch.data,
          match_score: bestScore,
          match_details: bestMatch.matchDetails,
          tip_gasire: bestType,
          returnat_acelasi_magazin: bestAcelasiMagazin,
          status: bestAcelasiMagazin ? 'RETURNAT' : 'GASIT'
        });
      } else if (bestMatch && bestScore >= 70) {
        // Cazuri limita - de verificat manual
        rezultate.posibile.push({
          ...iesire,
          magazin_destinatie: bestMagazin,
          cod_destinatie: bestMatch.cod,
          denumire_destinatie: bestMatch.denumire,
          greutate_destinatie: bestMatch.greutate,
          data_receptie: bestMatch.data,
          match_score: bestScore,
          match_details: bestMatch.matchDetails,
          tip_gasire: bestType,
          returnat_acelasi_magazin: bestAcelasiMagazin,
          status: 'POSIBIL'
        });
      } else {
        const zileDeLaPlecare = Math.floor((new Date() - dataIesire) / (1000 * 60 * 60 * 24));
        
        // Daca a trecut cel putin 1 zi si nu s-a gasit = PIERDUT
        if (zileDeLaPlecare < 1) {
          rezultate.inTranzit.push({ ...iesire, zile: zileDeLaPlecare, status: 'IN TRANZIT' });
        } else {
          rezultate.pierdute.push({ ...iesire, zile: zileDeLaPlecare, status: 'NEGASIT' });
        }
      }
    }
    
    db.detach();
    
    // === VERIFICAM REZOLVARILE MANUALE ===
    const rezolvariManuale = citesteRezolvari();
    rezultate.rezolvateManual = [];
    
    // Filtram pierdutele - excludem cele rezolvate manual
    const pierduteNerezolvate = rezultate.pierdute.filter(p => {
      const rezolvare = rezolvariManuale.find(r => 
        r.cod === p.cod && r.magazin_sursa === p.magazin_sursa
      );
      
      if (rezolvare) {
        // Mutam in categoria "rezolvate manual"
        rezultate.rezolvateManual.push({
          ...p,
          destinatie_manuala: rezolvare.destinatie,
          explicatie_manuala: rezolvare.explicatie,
          data_rezolvare: rezolvare.data_rezolvare,
          status: 'REZOLVAT_MANUAL'
        });
        return false; // Excludem din pierdute
      }
      return true; // Ramane in pierdute
    });
    
    rezultate.pierdute = pierduteNerezolvate;
    
    // Separam gasite in categorii
    const gasiteAltMagazin = rezultate.gasite.filter(g => !g.returnat_acelasi_magazin);
    const returnateAcelasiMagazin = rezultate.gasite.filter(g => g.returnat_acelasi_magazin);
    
    console.log(`Rezultate:`);
    console.log(`  - Gasite in alt magazin: ${gasiteAltMagazin.length}`);
    console.log(`  - Returnate in acelasi magazin: ${returnateAcelasiMagazin.length}`);
    console.log(`  - Posibile: ${rezultate.posibile.length}`);
    console.log(`  - In tranzit: ${rezultate.inTranzit.length}`);
    console.log(`  - Pierdute: ${rezultate.pierdute.length}`);
    console.log(`  - Rezolvate manual: ${rezultate.rezolvateManual.length}`);
    
    res.json({
      success: true,
      iesiri_totale: rezultate.iesiri.length,
      intrari_totale: rezultate.intrari.length,
      vanzari_totale: rezultate.vanzari.length,
      gasite: gasiteAltMagazin,
      returnate: returnateAcelasiMagazin,
      posibile: rezultate.posibile,
      inTranzit: rezultate.inTranzit,
      pierdute: rezultate.pierdute,
      rezolvateManual: rezultate.rezolvateManual,
      sumar: {
        gasite_alt_magazin: gasiteAltMagazin.length,
        returnate_acelasi_magazin: returnateAcelasiMagazin.length,
        posibile: rezultate.posibile.length,
        in_tranzit: rezultate.inTranzit.length,
        pierdute: rezultate.pierdute.length,
        rezolvate_manual: rezultate.rezolvateManual.length
      }
    });
    
  } catch (error) {
    console.error('Eroare:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===========================================================================
// PRODUSE DISPARUTE - Produse cu STOC=0 fara aviz de iesire, cautate in alte magazine
// ===========================================================================
app.post('/api/produse-disparute', async (req, res) => {
  console.log('\n========================================');
  console.log('PRODUSE DISPARUTE (fara aviz)');
  console.log('========================================');
  
  try {
    const { magazin, denumire, cod } = req.body;
    
    if (!magazin) {
      return res.status(400).json({ success: false, error: 'Magazin lipsa' });
    }
    
    const db = await getConnection();
    const magSursa = magazine.find(m => m.nume === magazin);
    
    if (!magSursa) {
      db.detach();
      return res.status(400).json({ success: false, error: 'Magazin invalid' });
    }
    
    console.log(`Caut produse disparute din ${magazin} (ID=${magSursa.id})`);
    
    // Gaseste produse cu STOC=0, fara aviz de iesire (dispuse probabil prin alte metode)
    let sqlProduse = `
      SELECT p.ID_PRODUS, p.COD, p.DENUMIRE, p.PRET_INTRARE, p.PRET_IESIRE, 
             COALESCE(p.GREUTATE, 0) as GREUTATE, p.STOC
      FROM PRODUSE p
      WHERE p.ID_MAGAZIN = ? AND p.STOC = 0
        AND NOT EXISTS (SELECT 1 FROM BONIESIRI b WHERE b.ID_PRODUS = p.ID_PRODUS AND b.ID_MAGAZIN = p.ID_MAGAZIN)
    `;
    const params = [magSursa.id];
    
    if (denumire) {
      sqlProduse += ` AND UPPER(p.DENUMIRE) LIKE ?`;
      params.push('%' + denumire.toUpperCase() + '%');
    }
    if (cod) {
      sqlProduse += ` AND UPPER(p.COD) LIKE ?`;
      params.push('%' + cod.toUpperCase() + '%');
    }
    
    sqlProduse += ` ORDER BY p.PRET_INTRARE DESC`;
    
    const produseDisparute = await query(db, sqlProduse, params);
    console.log(`Gasit ${produseDisparute.length} produse disparute`);
    
    const rezultate = [];
    
    for (const prod of produseDisparute) {
      // Cautam produse similare in ALTE magazine
      const candidati = [];
      
      for (const mag of magazine) {
        if (mag.id === magSursa.id) continue; // Nu in acelasi magazin
        
        // Cautam dupa PRET_INTRARE exact sau apropiat
        const similare = await query(db, `
          SELECT p.ID_PRODUS, p.COD, p.DENUMIRE, p.PRET_INTRARE, p.PRET_IESIRE, 
                 COALESCE(p.GREUTATE, 0) as GREUTATE, p.STOC, p.ID_MAGAZIN
          FROM PRODUSE p
          WHERE p.ID_MAGAZIN = ? 
            AND ABS(p.PRET_INTRARE - ?) < 1
        `, [mag.id, prod.PRET_INTRARE]);
        
        for (const sim of similare) {
          // Calculam scor de similaritate pe denumire
          const simDenumire = similaritate(prod.DENUMIRE, sim.DENUMIRE);
          
          // Match daca: denumire similara (>50%) SAU greutate identica
          const matchGreutate = prod.GREUTATE > 0 && sim.GREUTATE > 0 && 
                                Math.abs(prod.GREUTATE - sim.GREUTATE) < 0.01;
          
          if (simDenumire >= 0.5 || matchGreutate) {
            candidati.push({
              magazin_gasit: mag.nume,
              cod_gasit: sim.COD,
              denumire_gasit: sim.DENUMIRE,
              pret_gasit: sim.PRET_INTRARE,
              stoc_gasit: sim.STOC,
              similaritate_denumire: Math.round(simDenumire * 100),
              match_greutate: matchGreutate
            });
          }
        }
      }
      
      // Sortam candidatii dupa similaritate
      candidati.sort((a, b) => b.similaritate_denumire - a.similaritate_denumire);
      
      rezultate.push({
        cod: prod.COD,
        denumire: prod.DENUMIRE,
        pret_intrare: prod.PRET_INTRARE,
        greutate: prod.GREUTATE || 0,
        gasit_in: candidati.slice(0, 3) // Top 3 candidati
      });
    }
    
    db.detach();
    
    console.log(`Verificat ${rezultate.length} produse, ${rezultate.filter(r => r.gasit_in.length > 0).length} au candidati`);
    
    res.json({
      success: true,
      magazin: magazin,
      total: rezultate.length,
      cu_candidati: rezultate.filter(r => r.gasit_in.length > 0).length,
      produse: rezultate
    });
    
  } catch (error) {
    console.error('Eroare:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

function similaritate(s1, s2) {
  if (!s1 || !s2) return 0;
  const a = s1.toLowerCase().trim();
  const b = s2.toLowerCase().trim();
  if (a === b) return 1;
  
  const wordsA = a.split(/\s+/);
  const wordsB = b.split(/\s+/);
  let matchedWords = 0;
  
  for (const wordA of wordsA) {
    if (wordA.length < 3) continue;
    for (const wordB of wordsB) {
      if (wordB.length < 3) continue;
      if (wordA === wordB || wordA.includes(wordB) || wordB.includes(wordA)) {
        matchedWords++;
        break;
      }
    }
  }
  
  const totalWords = Math.max(wordsA.filter(w => w.length >= 3).length, wordsB.filter(w => w.length >= 3).length);
  if (totalWords === 0) return 0;
  
  return matchedWords / totalWords;
}

function getCodBaza(cod) {
  if (!cod) return '';
  cod = cod.toString().trim();
  
  const match = cod.match(/^(\d+)/);
  if (match) return match[1];
  
  const parts = cod.split('.');
  if (parts.length > 1) {
    return parts.slice(0, -1).join('.');
  }
  
  return cod;
}

function coduriSimilare(cod1, cod2) {
  if (!cod1 || !cod2) return { similar: false, score: 0 };
  
  const c1 = cod1.toString().toLowerCase().trim();
  const c2 = cod2.toString().toLowerCase().trim();
  
  if (c1 === c2) return { similar: true, score: 100 };
  
  if (c1.startsWith(c2) || c2.startsWith(c1)) return { similar: true, score: 90 };
  
  const baza1 = getCodBaza(c1);
  const baza2 = getCodBaza(c2);
  
  if (baza1 && baza2 && baza1 === baza2) return { similar: true, score: 85 };
  
  if (baza1.length >= 4 && baza2.length >= 4) {
    if (baza1.startsWith(baza2.substring(0, 4)) || baza2.startsWith(baza1.substring(0, 4))) {
      return { similar: true, score: 70 };
    }
  }
  
  if (c1.includes(c2) || c2.includes(c1)) return { similar: true, score: 60 };
  
  return { similar: false, score: 0 };
}

app.post('/api/birou/cauta', async (req, res) => {
  console.log('\n========================================');
  console.log('BIROU INFORMATII - CAUTARE');
  console.log('========================================');
  
  try {
    const { cod, client, cnp, magazin } = req.body;
    
    if (!cod && !client && !cnp) {
      return res.status(400).json({ success: false, error: 'Trebuie specificat cod, client sau CNP' });
    }
    
    const db = await getConnection();
    const rezultate = [];
    const magazineFiltrate = magazin ? magazine.filter(m => m.nume === magazin) : magazine;
    
    for (const mag of magazineFiltrate) {
      console.log(`Cautare in ${mag.nume} (ID=${mag.id})`);
      
      if (cod) {
        const gajuri = await query(db,
          `SELECT g.*, c.NR_CONTRACT, c.DATA_CONTRACT, c.VALOARE, c.STARE as STARE_CONTRACT,
                  cl.CLIENT, cl.CNP, cl.ADRESA, cl.SERIA, cl.NR, cl.TEL
           FROM GAJURI g
           LEFT JOIN CONTRACTE c ON c.ID_CONTRACT = g.ID_CONTRACT AND c.ID_MAGAZIN = g.ID_MAGAZIN
           LEFT JOIN CLIENTI cl ON cl.ID_CLIENT = c.ID_CLIENT
           WHERE g.ID_MAGAZIN = ? AND UPPER(g.COD) LIKE ?`,
          [mag.id, '%' + cod.toUpperCase() + '%']);
        
        for (const gaj of gajuri) {
          rezultate.push({
            magazin: mag.nume,
            cod: gaj.COD,
            denumire: gaj.DENUMIRE,
            um: gaj.UM,
            cantitate: gaj.CANT || 1,
            pret: gaj.PRET || 0,
            greutate: gaj.GREUTATE,
            titlu: gaj.TITLU,
            descriere: gaj.DESCRIERE,
            stare: getStareText(gaj.STARE_CONTRACT),
            contract: gaj.NR_CONTRACT ? {
              nr_contract: gaj.NR_CONTRACT,
              client: gaj.CLIENT || 'Necunoscut',
              cnp: gaj.CNP || '',
              adresa: gaj.ADRESA || '',
              seria: gaj.SERIA || '',
              nr_ci: gaj.NR || '',
              tel: gaj.TEL || '',
              data_contract: gaj.DATA_CONTRACT,
              valoare: gaj.VALOARE || 0,
              stare: getStareText(gaj.STARE_CONTRACT)
            } : null
          });
        }
        
      } else if (client || cnp) {
        let sqlWhere = '';
        let params = [mag.id];
        
        if (client) {
          sqlWhere = `UPPER(cl.CLIENT) LIKE ?`;
          params.push('%' + client.toUpperCase() + '%');
        } else {
          sqlWhere = `cl.CNP = ?`;
          params.push(cnp);
        }
        
        const contracte = await query(db,
          `SELECT c.*, cl.CLIENT, cl.CNP, cl.ADRESA, cl.SERIA, cl.NR, cl.TEL
           FROM CONTRACTE c
           INNER JOIN CLIENTI cl ON cl.ID_CLIENT = c.ID_CLIENT
           WHERE c.ID_MAGAZIN = ? AND ${sqlWhere}`,
          params);
        
        for (const contract of contracte) {
          rezultate.push({
            magazin: mag.nume,
            stare: getStareText(contract.STARE),
            contract: {
              nr_contract: contract.NR_CONTRACT,
              client: contract.CLIENT || 'Necunoscut',
              cnp: contract.CNP || '',
              adresa: contract.ADRESA || '',
              seria: contract.SERIA || '',
              nr_ci: contract.NR || '',
              tel: contract.TEL || '',
              data_contract: contract.DATA_CONTRACT,
              valoare: contract.VALOARE || 0,
              durata: contract.DURATA || 0,
              data_scadenta: contract.DATA_SCADENTA,
              stare: getStareText(contract.STARE),
              stare_cod: contract.STARE
            }
          });
        }
      }
    }
    
    db.detach();
    console.log(`Total rezultate: ${rezultate.length}`);
    
    res.json({ success: true, rezultate: rezultate, total: rezultate.length });
    
  } catch (error) {
    console.error('Eroare:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

function getStareText(stare) {
  if (stare === 'N') return 'neonorat';
  if (stare === 'O' || stare === 'PO') return 'onorat';
  if (stare === 'X') return 'cesionat';
  if (stare === 'D' || stare === 'DA' || stare === 'P' || stare === 'PA') return 'derulare';
  return 'derulare';
}

app.post('/api/birou/detalii-contract', async (req, res) => {
  console.log('\n========================================');
  console.log('DETALII CONTRACT');
  console.log('========================================');
  
  try {
    const { magazin, nrContract } = req.body;
    
    if (!magazin || !nrContract) {
      return res.status(400).json({ success: false, error: 'Magazin sau nr contract lipsa' });
    }
    
    const mag = magazine.find(m => m.nume === magazin);
    if (!mag) {
      return res.status(404).json({ success: false, error: 'Magazin negasit' });
    }
    
    const db = await getConnection();
    
    const contracte = await query(db,
      `SELECT c.*, cl.CLIENT, cl.CNP, cl.ADRESA, cl.SERIA, cl.NR, cl.TEL
       FROM CONTRACTE c
       INNER JOIN CLIENTI cl ON cl.ID_CLIENT = c.ID_CLIENT
       WHERE c.ID_MAGAZIN = ? AND c.NR_CONTRACT = ?`,
      [mag.id, nrContract]);
    
    if (contracte.length === 0) {
      db.detach();
      return res.status(404).json({ success: false, error: 'Contract negasit' });
    }
    
    const contract = contracte[0];
    
    const gajuri = await query(db,
      `SELECT * FROM GAJURI WHERE ID_CONTRACT = ? AND ID_MAGAZIN = ?`,
      [contract.ID_CONTRACT, mag.id]);
    
    const aditionale = await query(db,
      `SELECT * FROM ADITIONALE WHERE ID_CONTRACT = ? AND ID_MAGAZIN = ? ORDER BY DATA_ADITIONAL DESC`,
      [contract.ID_CONTRACT, mag.id]);
    
    db.detach();
    
    const rezultat = {
      nr_contract: contract.NR_CONTRACT,
      client: contract.CLIENT || 'Necunoscut',
      cnp: contract.CNP || '',
      adresa: contract.ADRESA || '',
      seria: contract.SERIA || '',
      nr_ci: contract.NR || '',
      tel: contract.TEL || '',
      data_contract: contract.DATA_CONTRACT,
      valoare: contract.VALOARE || 0,
      durata: contract.DURATA || 0,
      prelungiri: aditionale.length,
      prelungiri_detalii: aditionale.map(p => ({
        data: p.DATA_ADITIONAL,
        ora: p.ORA_ACHITARE,
        zile: p.DURATA,
        valoare: p.VALOARE,
        comision: p.COMISION,
        venituri: p.VENITURI,
        avans: p.AVANS,
        data_achitare: p.DATA_ACHITARE,
        chitanta: p.CHITANTA,
        nr_DI: p.NR_DI
      })),
      data_scadenta: contract.DATA_SCADENTA,
      data_cesiune: contract.DATA_CESIUNE || null,
      compr: contract.COMPR || 0,
      penpr: contract.PENPR || 0,
      stare: getStareText(contract.STARE),
      stare_cod: contract.STARE,
      gajuri: gajuri.map(g => ({
        cod: g.COD,
        denumire: g.DENUMIRE,
        um: g.UM,
        cant: g.CANT,
        pret: g.PRET,
        greutate: g.GREUTATE,
        titlu: g.TITLU,
        descriere: g.DESCRIERE
      }))
    };
    
    res.json({ success: true, contract: rezultat });
    
  } catch (error) {
    console.error('Eroare:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/stocuri/valori', async (req, res) => {
  console.log('\n========================================');
  console.log('VALORI STOCURI - TOATE MAGAZINELE');
  console.log('========================================');
  
  try {
    const db = await getConnection();
    const rezultate = [];
    
    for (const mag of magazine) {
      console.log(`Calculez valori pentru ${mag.nume}`);
      
      const produse = await query(db,
        `SELECT PRET_INTRARE, PRET_IESIRE FROM PRODUSE WHERE ID_MAGAZIN = ? AND STOC > 0`,
        [mag.id]);
      
      let total_intrare = 0;
      let total_iesire = 0;
      
      produse.forEach(p => {
        total_intrare += (p.PRET_INTRARE || 0);
        total_iesire += (p.PRET_IESIRE || 0);
      });
      
      rezultate.push({
        magazin: mag.nume,
        nr_produse: produse.length,
        total_intrare: total_intrare,
        total_iesire: total_iesire
      });
    }
    
    db.detach();
    
    res.json({ success: true, magazine: rezultate });
    
  } catch (error) {
    console.error('Eroare:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/stocuri/cauta', async (req, res) => {
  console.log('\n========================================');
  console.log('CAUTARE PRODUSE IN STOCURI');
  console.log('========================================');
  
  try {
    const { cautare, magazin } = req.body;
    
    if (!cautare) {
      return res.status(400).json({ success: false, error: 'Cautare lipsa' });
    }
    
    const db = await getConnection();
    const peStoc = [];      // VERDE - produse pe stoc
    const faraStoc = [];    // ROSU - produse fara stoc
    const magazineFiltrate = magazin ? magazine.filter(m => m.nume === magazin) : magazine;
    
    for (const mag of magazineFiltrate) {
      // Cautam in COD doar daca textul e suficient de scurt (COD are max 8-10 char)
      const cautareUpper = cautare.toUpperCase();
      let sqlCautare, paramsCautare;
      
      if (cautare.length <= 6) {
        // Cautare si in COD si in DENUMIRE
        sqlCautare = `SELECT * FROM PRODUSE 
           WHERE ID_MAGAZIN = ? AND (UPPER(COD) LIKE ? OR UPPER(DENUMIRE) LIKE ?)
           ORDER BY STOC DESC, DENUMIRE`;
        paramsCautare = [mag.id, '%' + cautareUpper + '%', '%' + cautareUpper + '%'];
      } else {
        // Cautare doar in DENUMIRE (textul e prea lung pentru COD)
        sqlCautare = `SELECT * FROM PRODUSE 
           WHERE ID_MAGAZIN = ? AND UPPER(DENUMIRE) LIKE ?
           ORDER BY STOC DESC, DENUMIRE`;
        paramsCautare = [mag.id, '%' + cautareUpper + '%'];
      }
      
      const produse = await query(db, sqlCautare, paramsCautare);
      
      for (const prod of produse) {
        const item = {
          magazin: mag.nume,
          cod: prod.COD,
          denumire: prod.DENUMIRE,
          categorie: prod.CATEGORIE,
          pret_intrare: prod.PRET_INTRARE || 0,
          pret_iesire: prod.PRET_IESIRE || 0,
          cantitate: prod.CANTITATE || 1,
          stoc: prod.STOC || 0,
          data: prod.DATA_INTRARE,
          stare: prod.STARE || 'AC',
          greutate: prod.GREUTATE || 0,
          titlu: prod.TITLU || ''
        };
        
        // Separam pe stoc (verde) si fara stoc (rosu)
        if ((prod.STOC || 0) > 0) {
          peStoc.push(item);
        } else {
          faraStoc.push(item);
        }
      }
    }
    
    db.detach();
    
    // Sortam: pe stoc dupa magazin, apoi denumire
    peStoc.sort((a, b) => a.magazin.localeCompare(b.magazin) || a.denumire.localeCompare(b.denumire));
    faraStoc.sort((a, b) => a.magazin.localeCompare(b.magazin) || a.denumire.localeCompare(b.denumire));
    
    console.log(`Gasite: ${peStoc.length} pe stoc (verde), ${faraStoc.length} fara stoc (rosu)`);
    
    res.json({ 
      success: true, 
      peStoc: peStoc,           // VERDE - pe stoc
      faraStoc: faraStoc,       // ROSU - fara stoc
      totalPeStoc: peStoc.length,
      totalFaraStoc: faraStoc.length,
      total: peStoc.length + faraStoc.length,
      // Pentru compatibilitate cu codul vechi
      rezultate: [...peStoc, ...faraStoc]
    });
    
  } catch (error) {
    console.error('Eroare:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===========================================================================
// CAUTARE VANZARI - Cauta in bonuri de vanzare (casa de marcat) dupa pret
// ===========================================================================
app.post('/api/vanzari/cauta-pret', async (req, res) => {
  console.log('\n========================================');
  console.log('CAUTARE VANZARI DUPA PRET');
  console.log('========================================');
  
  try {
    const { pret_intrare, denumire, dataStart, dataStop, excludeMagazin } = req.body;
    
    if (!pret_intrare) {
      return res.status(400).json({ success: false, error: 'Pret intrare lipsa' });
    }
    
    const db = await getConnection();
    const rezultate = [];
    
    for (const mag of magazine) {
      // Excludem magazinul sursa daca e specificat
      if (excludeMagazin && mag.nume === excludeMagazin) continue;
      
      let sqlVanzari = `
        SELECT c.NR_BONCASA, c.DATA_BONCASA, c.VALOARE,
               p.COD, p.DENUMIRE, p.PRET_INTRARE, p.PRET_IESIRE, p.ID_MAGAZIN
        FROM CASAIESIRI e
        INNER JOIN CASAMARCAT c ON c.ID_BONCASA = e.ID_BONCASA AND c.ID_MAGAZIN = e.ID_MAGAZIN
        INNER JOIN PRODUSE p ON p.ID_PRODUS = e.ID_PRODUS AND p.ID_MAGAZIN = e.ID_MAGAZIN
        WHERE e.ID_MAGAZIN = ?
          AND ABS(p.PRET_INTRARE - ?) < 1
      `;
      const params = [mag.id, pret_intrare];
      
      if (denumire) {
        sqlVanzari += ` AND UPPER(p.DENUMIRE) LIKE ?`;
        params.push('%' + denumire.toUpperCase() + '%');
      }
      
      if (dataStart) {
        sqlVanzari += ` AND c.DATA_BONCASA >= ?`;
        params.push(dataStart);
      }
      
      if (dataStop) {
        sqlVanzari += ` AND c.DATA_BONCASA <= ?`;
        params.push(dataStop);
      }
      
      sqlVanzari += ` ORDER BY c.DATA_BONCASA DESC`;
      
      const vanzari = await query(db, sqlVanzari, params);
      
      for (const v of vanzari) {
        rezultate.push({
          magazin: mag.nume,
          nr_bon: v.NR_BONCASA,
          data_vanzare: v.DATA_BONCASA,
          cod: v.COD,
          denumire: v.DENUMIRE,
          pret_intrare: v.PRET_INTRARE,
          pret_vanzare: v.PRET_IESIRE,
          valoare_bon: v.VALOARE
        });
      }
    }
    
    db.detach();
    
    console.log(`Gasite ${rezultate.length} vanzari cu pret_intrare ~${pret_intrare} RON`);
    
    res.json({
      success: true,
      pret_cautat: pret_intrare,
      total: rezultate.length,
      vanzari: rezultate
    });
    
  } catch (error) {
    console.error('Eroare:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/registru-casa', async (req, res) => {
  console.log('\n========================================');
  console.log('REGISTRU CASA');
  console.log('========================================');
  
  try {
    const { magazin, data } = req.body;
    
    if (!magazin || !data) {
      return res.status(400).json({ success: false, error: 'Magazin sau data lipsa' });
    }
    
    const mag = magazine.find(m => m.nume === magazin);
    if (!mag) {
      return res.status(404).json({ success: false, error: 'Magazin negasit' });
    }
    
    const db = await getConnection();
    const operatiuni = [];
    let total_imprumut = 0, total_comision = 0, total_vanzari = 0;
    let total_incasari = 0, total_plati = 0, total_card = 0;
    
    const actecasa = await query(db,
      `SELECT * FROM ACTECASA WHERE ID_MAGAZIN = ? AND DATA_ACT = ?`,
      [mag.id, data]);
    
    actecasa.forEach(act => {
      const op = {
        id_act: act.ID_ACT,
        tip_act: act.TIP_ACT,
        document: `${act.TIP_ACT} nr. ${act.NR_ACT}`,
        data: act.DATA_ACT,
        explicatii: act.EXPLICATII,
        imprumut: 0, comision: 0, vanzari: 0, incasari: 0, plati: 0, card: 0
      };
      
      if (act.TIP_ACT === 'DI') {
        op.incasari = act.VALOARE || 0;
        total_incasari += op.incasari;
      } else if (act.TIP_ACT === 'DP') {
        op.plati = act.VALOARE || 0;
        total_plati += op.plati;
      }
      
      operatiuni.push(op);
    });
    
    const casaamanet = await query(db,
      `SELECT * FROM CASAAMANET WHERE ID_MAGAZIN = ? AND DATA_ACT = ? ORDER BY TIP_ACT, NR_ACT`,
      [mag.id, data]);
    
    casaamanet.forEach(act => {
      const op = {
        id_act: act.ID_ACT,
        tip_act: act.TIP_ACT,
        document: `${act.TIP_ACT} nr. ${act.NR_ACT}`,
        data: act.DATA_ACT,
        explicatii: act.EXPLICATII,
        imprumut: act.IMPRUMUT || 0,
        comision: (act.COMISION || 0) + (act.PENALITATI || 0),
        vanzari: 0, incasari: 0, plati: 0, card: 0
      };
      
      if (act.TIP_ACT === 'DI') {
        op.incasari = act.VALOARE || 0;
        total_incasari += op.incasari;
      } else if (act.TIP_ACT === 'DP') {
        op.plati = act.VALOARE || 0;
        total_plati += op.plati;
      }
      
      total_imprumut += op.imprumut;
      total_comision += op.comision;
      operatiuni.push(op);
    });
    
    const casamarcat = await query(db,
      `SELECT * FROM CASAMARCAT WHERE ID_MAGAZIN = ? AND CAST(DATA_BONCASA AS DATE) = ? ORDER BY NR_BONCASA`,
      [mag.id, data]);
    
    for (const bon of casamarcat) {
      const produse = await query(db,
        `SELECT p.DENUMIRE, p.COD, p.GREUTATE, p.TITLU 
         FROM CASAIESIRI e 
         INNER JOIN PRODUSE p ON p.ID_PRODUS = e.ID_PRODUS AND p.ID_MAGAZIN = e.ID_MAGAZIN
         WHERE e.ID_BONCASA = ? AND e.ID_MAGAZIN = ?`,
        [bon.ID_BONCASA, mag.id]);
      
      let expl = produse.map(p => 
        p.GREUTATE && p.GREUTATE > 0 
          ? `${p.DENUMIRE} ${p.GREUTATE} gr ${p.TITLU} k ${p.COD}`
          : `${p.DENUMIRE} ${p.COD}`
      ).join(', ');
      
      const op = {
        id_act: bon.ID_BONCASA,
        tip_act: 'BF',
        document: `BF nr. ${bon.NR_BONCASA}`,
        data: bon.DATA_BONCASA,
        explicatii: expl,
        imprumut: 0, comision: 0, vanzari: 0, incasari: 0, plati: 0, card: 0
      };
      
      const cardValue = bon.CARD || 0;
      const valoare = bon.VALOARE || 0;
      
      if (cardValue > 0) {
        if (cardValue >= valoare) {
          op.card = cardValue;
          total_card += cardValue;
        } else {
          op.vanzari = valoare - cardValue;
          op.incasari = valoare - cardValue;
          op.card = cardValue;
          total_vanzari += op.vanzari;
          total_incasari += op.incasari;
          total_card += cardValue;
        }
      } else {
        op.vanzari = valoare;
        op.incasari = valoare;
        total_vanzari += valoare;
        total_incasari += valoare;
      }
      
      operatiuni.push(op);
    }
    
    const casa = await query(db,
      `SELECT * FROM CASA WHERE ID_MAGAZIN = ? AND DATA_CASA = ?`,
      [mag.id, data]);
    
    db.detach();
    
    const sold_initial = casa.length > 0 ? (casa[0].SOLD_INITIAL || 0) : 0;
    const sold_final = sold_initial + total_incasari - total_plati;
    
    res.json({
      success: true,
      registru: {
        sold_initial: sold_initial,
        total_incasari: total_incasari,
        total_plati: total_plati,
        total_card: total_card,
        sold_final: sold_final,
        operatiuni: operatiuni
      }
    });
    
  } catch (error) {
    console.error('Eroare:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/operatiuni-amanet', async (req, res) => {
  console.log('\n========================================');
  console.log('OPERATIUNI AMANET');
  console.log('========================================');
  
  try {
    const { magazin, data } = req.body;
    
    if (!magazin || !data) {
      return res.status(400).json({ success: false, error: 'Magazin sau data lipsa' });
    }
    
    const mag = magazine.find(m => m.nume === magazin);
    if (!mag) {
      return res.status(404).json({ success: false, error: 'Magazin negasit' });
    }
    
    const db = await getConnection();
    const operatiuni = [];
    let total_imprumut = 0, total_comision = 0, total_penalitati = 0;
    let total_incasari = 0, total_plati = 0;
    
    const casaamanet = await query(db,
      `SELECT * FROM CASAAMANET WHERE ID_MAGAZIN = ? AND DATA_ACT = ? ORDER BY TIP_ACT, NR_ACT`,
      [mag.id, data]);
    
    casaamanet.forEach(act => {
      const tipOperatie = (act.TIP_OPERATIE || '').toLowerCase();
      const op = {
        id_act: act.ID_ACT,
        id_contract: act.ID_CONTRACT,
        tip_act: act.TIP_ACT,
        document: `${act.TIP_ACT || 'OP'} nr. ${act.NR_ACT || 0}`,
        data: act.DATA_ACT,
        explicatii: act.EXPLICATII || '',
        imprumut: 0,
        comision: 0,
        penalitati: 0,
        incasari: 0,
        plati: 0
      };
      
      if (tipOperatie === 'incasare') {
        op.imprumut = act.IMPRUMUT || 0;
        op.comision = act.COMISION || 0;
        op.penalitati = act.PENALITATI || 0;
        op.incasari = act.VALOARE || 0;
        
        total_imprumut += op.imprumut;
        total_comision += op.comision;
        total_penalitati += op.penalitati;
        total_incasari += op.incasari;
      } else {
        op.plati = act.VALOARE || 0;
        total_plati += op.plati;
      }
      
      operatiuni.push(op);
    });
    
    db.detach();
    
    console.log(`Operatiuni: ${operatiuni.length}, Imp: ${total_imprumut}, Com: ${total_comision}, Pen: ${total_penalitati}, Inc: ${total_incasari}, Plati: ${total_plati}`);
    
    res.json({
      success: true,
      operatiuni: {
        total_imprumut, total_comision, total_penalitati,
        total_incasari, total_plati,
        operatiuni: operatiuni
      }
    });
    
  } catch (error) {
    console.error('Eroare:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/detalii-operatiune', async (req, res) => {
  console.log('\n========================================');
  console.log('DETALII OPERATIUNE');
  console.log('========================================');
  
  try {
    const { magazin, idAct, tipAct } = req.body;
    
    if (!magazin || !idAct) {
      return res.status(400).json({ success: false, error: 'Magazin sau id_act lipsa' });
    }
    
    const mag = magazine.find(m => m.nume === magazin);
    if (!mag) {
      return res.status(404).json({ success: false, error: 'Magazin negasit' });
    }
    
    const db = await getConnection();
    
    let operatiune = [];
    let sursa = 'CASAAMANET';
    
    if (tipAct === 'BF') {
      operatiune = await query(db, `SELECT * FROM CASAMARCAT WHERE ID_BONCASA = ? AND ID_MAGAZIN = ?`, [idAct, mag.id]);
      sursa = 'CASAMARCAT';
    } else if (tipAct === 'CASAAMANET' || !tipAct) {
      operatiune = await query(db, `SELECT * FROM CASAAMANET WHERE ID_ACT = ? AND ID_MAGAZIN = ?`, [idAct, mag.id]);
      sursa = 'CASAAMANET';
    } else {
      operatiune = await query(db, `SELECT * FROM ACTECASA WHERE ID_ACT = ? AND ID_MAGAZIN = ?`, [idAct, mag.id]);
      sursa = 'ACTECASA';
    }
    
    console.log(`Sursa: ${sursa}, ID: ${idAct}, Magazin: ${mag.id}`);
    
    if (operatiune.length === 0) {
      db.detach();
      return res.status(404).json({ success: false, error: 'Operatiune negasita' });
    }
    
    const op = operatiune[0];
    
    const tipOperatie = (op.TIP_OPERATIE || '').toLowerCase();
    const detalii = {
      document: sursa === 'CASAMARCAT' ? `BF nr. ${op.NR_BONCASA}` : `${op.TIP_ACT || 'OP'} nr. ${op.NR_ACT || 0}`,
      tip_operatie: tipOperatie === 'incasare' ? 'ÎNCASARE' : 'PLATĂ',
      data: op.DATA_ACT || op.DATA_BONCASA,
      explicatii: op.EXPLICATII || '',
      valoare: op.VALOARE || 0,
      imprumut: tipOperatie === 'incasare' ? (op.IMPRUMUT || 0) : 0,
      comision: tipOperatie === 'incasare' ? (op.COMISION || 0) : 0,
      penalitati: tipOperatie === 'incasare' ? (op.PENALITATI || 0) : 0,
      contract: null,
      gajuri: []
    };
    
    let idContract = op.ID_CONTRACT;
    let nrContractDinExplicatii = null;
    
    console.log(`ID_CONTRACT din operatiune: ${idContract}, EXPLICATII: ${op.EXPLICATII}`);
    
    if (op.EXPLICATII) {
      const match = op.EXPLICATII.match(/contract\s*(\d+)/i);
      if (match) {
        nrContractDinExplicatii = parseInt(match[1]);
        console.log(`Extras NR_CONTRACT din explicatii: ${nrContractDinExplicatii}`);
      }
    }
    
    if (idContract || nrContractDinExplicatii) {
      try {
        let contracte = [];
        
        if (nrContractDinExplicatii) {
          console.log(`Caut contract cu NR_CONTRACT=${nrContractDinExplicatii} (din explicatii)`);
          contracte = await query(db, 
            `SELECT c.*, cl.CLIENT, cl.ADRESA, cl.SERIA, cl.NR, cl.CNP, cl.TEL 
             FROM CONTRACTE c 
             LEFT JOIN CLIENTI cl ON cl.ID_CLIENT = c.ID_CLIENT 
             WHERE c.NR_CONTRACT = ? AND c.ID_MAGAZIN = ?`,
            [nrContractDinExplicatii, mag.id]);
          console.log(`Rezultat NR_CONTRACT cu magazin: ${contracte.length} contracte`);
          
          if (contracte.length === 0) {
            contracte = await query(db, 
              `SELECT c.*, cl.CLIENT, cl.ADRESA, cl.SERIA, cl.NR, cl.CNP, cl.TEL 
               FROM CONTRACTE c 
               LEFT JOIN CLIENTI cl ON cl.ID_CLIENT = c.ID_CLIENT 
               WHERE c.NR_CONTRACT = ?`,
              [nrContractDinExplicatii]);
            console.log(`Rezultat NR_CONTRACT fara magazin: ${contracte.length} contracte`);
          }
          
          if (contracte.length > 0) {
            idContract = contracte[0].ID_CONTRACT;
          }
        }
        
        if (contracte.length === 0 && idContract) {
          console.log(`Caut contract cu ID_CONTRACT=${idContract}`);
          contracte = await query(db, 
            `SELECT c.*, cl.CLIENT, cl.ADRESA, cl.SERIA, cl.NR, cl.CNP, cl.TEL 
             FROM CONTRACTE c 
             LEFT JOIN CLIENTI cl ON cl.ID_CLIENT = c.ID_CLIENT 
             WHERE c.ID_CONTRACT = ?`,
            [idContract]);
          console.log(`Rezultat ID_CONTRACT: ${contracte.length} contracte`);
        }
        
        if (contracte.length === 0 && nrContractDinExplicatii) {
          console.log(`FINAL: Nu am gasit contractul ${nrContractDinExplicatii}`);
          contracte = await query(db, 
            `SELECT c.*, cl.CLIENT, cl.ADRESA, cl.SERIA, cl.NR, cl.CNP, cl.TEL 
             FROM CONTRACTE c 
             LEFT JOIN CLIENTI cl ON cl.ID_CLIENT = c.ID_CLIENT 
             WHERE c.NR_CONTRACT = ? AND c.ID_MAGAZIN = ?`,
            [nrContractDinExplicatii, mag.id]);
          
          if (contracte.length > 0) {
            idContract = contracte[0].ID_CONTRACT;
          }
        }
        
        if (contracte.length > 0) {
          const contract = contracte[0];
          
          let stareText = '';
          switch(contract.STARE) {
            case 'AC': stareText = 'ACTIV'; break;
            case 'NO': stareText = 'NEONORAT'; break;
            case 'AR': stareText = 'ARHIVAT'; break;
            case 'VD': stareText = 'VANDUT'; break;
            default: stareText = contract.STARE || '';
          }
          
          detalii.contract = {
            id_contract: contract.ID_CONTRACT,
            nr_contract: contract.NR_CONTRACT,
            data_contract: contract.DATA_CONTRACT,
            data_scadenta: contract.DATA_SCADENTA,
            data_limita: contract.DATA_LIMITA,
            data_achitare: contract.DATA_ACHITARE,
            durata: contract.DURATA || 0,
            valoare: contract.VALOARE || 0,
            compr: contract.COMPR || 0,
            penpr: contract.PENPR || 0,
            avans: contract.AVANS || 0,
            venituri: contract.VENITURI || 0,
            comision_incasat: contract.COMISION || 0,
            penalitati_incasate: contract.PENALITATI || 0,
            stare: stareText,
            stare_cod: contract.STARE,
            client: contract.CLIENT || 'Necunoscut',
            adresa: contract.ADRESA || '',
            seria: contract.SERIA || '',
            nr: contract.NR || '',
            cnp: contract.CNP || '',
            tel: contract.TEL || ''
          };
          
          const gajuri = await query(db,
            `SELECT * FROM GAJURI WHERE ID_CONTRACT = ? AND ID_MAGAZIN = ?`,
            [contract.ID_CONTRACT, mag.id]);
          
          detalii.gajuri = gajuri.map(g => ({
            cod: g.COD || '',
            denumire: g.DENUMIRE || '',
            um: g.UM || 'BUC',
            cant: g.CANT || 1,
            pret: g.PRET || 0,
            greutate: g.GREUTATE || 0,
            titlu: g.TITLU || '',
            descriere: g.DESCRIERE || '',
            stare: g.STARE || ''
          }));
        }
      } catch (err) {
        console.log('Eroare citire contract:', err.message);
      }
    }
    
    db.detach();
    
    console.log(`Detalii pentru ${detalii.document}`);
    
    res.json({ success: true, detalii: detalii });
    
  } catch (error) {
    console.error('Eroare:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/solduri-magazine', async (req, res) => {
  console.log('\n========================================');
  console.log('SOLDURI MAGAZINE');
  console.log('========================================');
  
  try {
    const { data } = req.body;
    
    if (!data) {
      return res.status(400).json({ success: false, error: 'Data lipsa' });
    }
    
    const db = await getConnection();
    const solduri = [];
    
    for (const mag of magazine) {
      // Prima incercare: cauta pentru data selectata
      let casa = await query(db,
        `SELECT * FROM CASA WHERE ID_MAGAZIN = ? AND DATA_CASA = ?`,
        [mag.id, data]);
      
      let dataGasita = data;
      
      // Daca nu gaseste, cauta ultima zi cu date (max 30 zile inapoi)
      if (casa.length === 0) {
        const ultimaCasa = await query(db,
          `SELECT FIRST 1 * FROM CASA 
           WHERE ID_MAGAZIN = ? AND DATA_CASA <= ? 
           ORDER BY DATA_CASA DESC`,
          [mag.id, data]);
        
        if (ultimaCasa.length > 0) {
          casa = ultimaCasa;
          dataGasita = ultimaCasa[0].DATA_CASA;
        }
      }
      
      if (casa.length > 0) {
        const c = casa[0];
        solduri.push({
          magazin: mag.nume,
          data_sold: dataGasita,
          sold_initial: c.SOLD_INITIAL || 0,
          incasari: c.INCASARI || 0,
          plati: c.PLATI || 0,
          card: c.CARD || 0,
          sold_final: c.SOLD_FINAL || 0,
          imprumut: c.IMPRUMUT || 0,
          comision: c.COMISION || 0,
          vanzari: c.VANZARI || 0
        });
      } else {
        solduri.push({
          magazin: mag.nume,
          data_sold: null,
          sold_initial: 0, incasari: 0, plati: 0, card: 0,
          sold_final: 0, imprumut: 0, comision: 0, vanzari: 0
        });
      }
    }
    
    db.detach();
    
    res.json({ success: true, solduri: solduri, data_ceruta: data });
    
  } catch (error) {
    console.error('Eroare:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/interdicii/cnp', async (req, res) => {
  try {
    const { cnp, client, adresa, status } = req.body;
    const db = await getConnection();
    
    if (req.method === 'POST' && cnp) {
      await query(db, 
        `INSERT INTO INTERDICTIICNP (CNP, CLIENT, ADRESA, STATUS) VALUES (?, ?, ?, ?)`,
        [cnp, client || '', adresa || '', status || 'ACTIV']);
    }
    
    const rows = await query(db, 'SELECT * FROM INTERDICTIICNP ORDER BY ID_CNP DESC');
    db.detach();
    
    res.json({ success: true, interdicii: rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/interdicii/gaj', async (req, res) => {
  try {
    const { imei, status } = req.body;
    const db = await getConnection();
    
    if (req.method === 'POST' && imei) {
      await query(db, 
        `INSERT INTO INTERDICTIIGAJ (IMEI, STATUS) VALUES (?, ?)`,
        [imei, status || 'ACTIV']);
    }
    
    const rows = await query(db, 'SELECT * FROM INTERDICTIIGAJ ORDER BY ID_GAJ DESC');
    db.detach();
    
    res.json({ success: true, interdicii: rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/interdicii/verifica/:cnp', async (req, res) => {
  try {
    const { cnp } = req.params;
    const db = await getConnection();
    
    const rows = await query(db, 
      `SELECT * FROM INTERDICTIICNP WHERE CNP = ? AND STATUS = 'ACTIV'`,
      [cnp]);
    
    db.detach();
    
    res.json({ 
      success: true, 
      interdictie: rows.length > 0,
      detalii: rows.length > 0 ? rows[0] : null
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========================================
// GAJURI IN CUSTODIE - Valoare in timp real
// ========================================
app.get('/api/gajuri-custodie', async (req, res) => {
  console.log('\n========================================');
  console.log('GAJURI IN CUSTODIE - TOATE MAGAZINELE');
  console.log('========================================');
  
  try {
    const db = await getConnection();
    const rezultate = [];
    let totalGeneralValoare = 0;
    let totalGeneralGreutate = 0;
    let totalGeneralContracte = 0;
    let totalGeneralGajuri = 0;
    
    for (const mag of magazine) {
      console.log(`Citire gajuri custodie din ${mag.nume}`);
      
      // Contracte active (in derulare) - ALINIAT CU DELPHI
      // DATA_SCADENTA se ia din ultima aditionale (daca exista), altfel din contract
      const contracte = await query(db,
        `SELECT c.ID_CONTRACT, c.NR_CONTRACT, c.DATA_CONTRACT,
                COALESCE(
                  (SELECT FIRST 1 ad.DATA_SCADENTA FROM ADITIONALE ad 
                   WHERE ad.ID_CONTRACT = c.ID_CONTRACT AND ad.ID_MAGAZIN = c.ID_MAGAZIN 
                   ORDER BY ad.DATA_ADITIONAL DESC),
                  c.DATA_SCADENTA
                ) AS DATA_SCADENTA,
                c.VALOARE, c.DURATA, c.STARE,
                cl.CLIENT, cl.CNP
         FROM CONTRACTE c
         LEFT JOIN CLIENTI cl ON cl.ID_CLIENT = c.ID_CLIENT
         WHERE c.ID_MAGAZIN = ? AND c.STARE IN ('D', 'DA', 'P', 'PA', 'N')
         ORDER BY 4`,
        [mag.id]);
      
      let magazinValoare = 0;
      let magazinGreutate = 0;
      let magazinGajuri = 0;
      const contracteDetaliate = [];
      
      for (const contract of contracte) {
        // Gajuri pentru fiecare contract - TOATE gajurile active (C, V, D)
        const gajuri = await query(db,
          `SELECT g.COD, g.DENUMIRE, g.UM, g.CANT, g.PRET, g.GREUTATE, g.TITLU, g.DESCRIERE
           FROM GAJURI g
           WHERE g.ID_CONTRACT = ? AND g.ID_MAGAZIN = ? 
             AND g.STARE IN ('C', 'V', 'D')`,
          [contract.ID_CONTRACT, mag.id]);
        
        let contractGreutate = 0;
        let contractValoare = 0;
        
        const gajuriDetaliate = gajuri.map(g => {
          const cant = g.CANT || 1;
          const greutate = g.GREUTATE || 0;
          const pret = g.PRET || 0;
          // Ca in Delphi: CANT * GREUTATE si CANT * PRET
          contractGreutate += cant * greutate;
          contractValoare += cant * pret;
          magazinGajuri++;
          return {
            cod: g.COD || '',
            denumire: g.DENUMIRE || '',
            um: g.UM || 'BUC',
            cant: cant,
            pret: pret,
            valoare: cant * pret,
            greutate: greutate,
            titlu: g.TITLU || '',
            descriere: g.DESCRIERE || ''
          };
        });
        
        magazinValoare += contractValoare;  // Valoarea gajurilor, nu a contractului
        magazinGreutate += contractGreutate;
        
        // Calculam zile ramase
        const azi = new Date();
        const scadenta = new Date(contract.DATA_SCADENTA);
        const zileRamase = Math.ceil((scadenta - azi) / (1000 * 60 * 60 * 24));
        
        contracteDetaliate.push({
          id_contract: contract.ID_CONTRACT,
          nr_contract: contract.NR_CONTRACT,
          data_contract: contract.DATA_CONTRACT,
          data_scadenta: contract.DATA_SCADENTA,
          zile_ramase: zileRamase,
          valoare_imprumut: contract.VALOARE || 0,
          client: contract.CLIENT || 'Necunoscut',
          cnp: contract.CNP || '',
          stare: contract.STARE,
          gajuri: gajuriDetaliate,
          total_greutate: contractGreutate,
          total_valoare_gajuri: contractValoare
        });
      }
      
      totalGeneralValoare += magazinValoare;
      totalGeneralGreutate += magazinGreutate;
      totalGeneralContracte += contracte.length;
      totalGeneralGajuri += magazinGajuri;
      
      rezultate.push({
        magazin: mag.nume,
        magazin_id: mag.id,
        nr_contracte: contracte.length,
        nr_gajuri: magazinGajuri,
        total_valoare: magazinValoare,
        total_greutate: magazinGreutate,
        contracte: contracteDetaliate
      });
    }
    
    db.detach();
    
    console.log(`Total: ${totalGeneralContracte} contracte, ${totalGeneralGajuri} gajuri, ${totalGeneralValoare.toFixed(2)} RON`);
    
    res.json({
      success: true,
      magazine: rezultate,
      totaluri: {
        contracte: totalGeneralContracte,
        gajuri: totalGeneralGajuri,
        valoare: totalGeneralValoare,
        greutate: totalGeneralGreutate
      }
    });
    
  } catch (error) {
    console.error('Eroare:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Cautare IMEI/Serie in gajuri - este sau a fost in stoc
app.post('/api/gajuri-custodie/cauta', async (req, res) => {
  console.log('\n========================================');
  console.log('CAUTARE IMEI/SERIE IN GAJURI');
  console.log('========================================');
  
  try {
    const { cautare } = req.body;
    
    if (!cautare || cautare.length < 3) {
      return res.status(400).json({ success: false, error: 'Introdu minim 3 caractere' });
    }
    
    console.log(`Cautare: "${cautare}"`);
    
    const db = await getConnection();
    const rezultate = [];
    
    // Cautam in toate magazinele
    for (const mag of magazine) {
      // Cautam in GAJURI (descriere contine IMEI/serie)
      const gajuri = await query(db,
        `SELECT g.*, c.NR_CONTRACT, c.DATA_CONTRACT, c.DATA_SCADENTA, c.STARE as STARE_CONTRACT,
                c.VALOARE as VALOARE_CONTRACT, cl.CLIENT, cl.CNP
         FROM GAJURI g
         INNER JOIN CONTRACTE c ON c.ID_CONTRACT = g.ID_CONTRACT AND c.ID_MAGAZIN = g.ID_MAGAZIN
         LEFT JOIN CLIENTI cl ON cl.ID_CLIENT = c.ID_CLIENT
         WHERE g.ID_MAGAZIN = ? 
           AND (UPPER(g.DESCRIERE) LIKE ? OR UPPER(g.COD) LIKE ? OR UPPER(g.DENUMIRE) LIKE ?)`,
        [mag.id, '%' + cautare.toUpperCase() + '%', '%' + cautare.toUpperCase() + '%', '%' + cautare.toUpperCase() + '%']);
      
      for (const gaj of gajuri) {
        // In custodie = gaj activ (C,V,D) + contract activ (D,DA,P,PA,N)
        const stariGajCustodie = ['C', 'V', 'D'];
        const stariContractCustodie = ['D', 'DA', 'P', 'PA', 'N'];
        const inCustodie = stariGajCustodie.includes(gaj.STARE) && stariContractCustodie.includes(gaj.STARE_CONTRACT);
        rezultate.push({
          sursa: 'GAJURI',
          magazin: mag.nume,
          pe_stoc: inCustodie,
          in_custodie: inCustodie,
          stare_gaj: gaj.STARE,
          cod: gaj.COD || '',
          denumire: gaj.DENUMIRE || '',
          descriere: gaj.DESCRIERE || '',
          greutate: gaj.GREUTATE || 0,
          titlu: gaj.TITLU || '',
          pret: gaj.PRET || 0,
          nr_contract: gaj.NR_CONTRACT,
          data_contract: gaj.DATA_CONTRACT,
          data_scadenta: gaj.DATA_SCADENTA,
          stare_contract: gaj.STARE_CONTRACT,
          valoare_contract: gaj.VALOARE_CONTRACT || 0,
          client: gaj.CLIENT || 'Necunoscut',
          cnp: gaj.CNP || ''
        });
      }
    }
    
    db.detach();
    
    // Sortam: pe stoc primul
    rezultate.sort((a, b) => {
      if (a.pe_stoc && !b.pe_stoc) return -1;
      if (!a.pe_stoc && b.pe_stoc) return 1;
      return a.magazin.localeCompare(b.magazin);
    });
    
    const peStocCount = rezultate.filter(r => r.pe_stoc).length;
    const istoricCount = rezultate.filter(r => !r.pe_stoc).length;
    
    console.log(`Gasit: ${peStocCount} pe stoc, ${istoricCount} istoric`);
    
    res.json({
      success: true,
      rezultate: rezultate,
      pe_stoc: peStocCount,
      istoric: istoricCount,
      total: rezultate.length
    });
    
  } catch (error) {
    console.error('Eroare:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Gajuri custodie pentru un singur magazin (mai rapid)
app.post('/api/gajuri-custodie/magazin', async (req, res) => {
  try {
    const { magazin } = req.body;
    
    const mag = magazine.find(m => m.nume === magazin);
    if (!mag) {
      return res.status(404).json({ success: false, error: 'Magazin negasit' });
    }
    
    const db = await getConnection();
    
    const contracte = await query(db,
      `SELECT c.ID_CONTRACT, c.NR_CONTRACT, c.DATA_CONTRACT,
              COALESCE(
                (SELECT FIRST 1 ad.DATA_SCADENTA FROM ADITIONALE ad 
                 WHERE ad.ID_CONTRACT = c.ID_CONTRACT AND ad.ID_MAGAZIN = c.ID_MAGAZIN 
                 ORDER BY ad.DATA_ADITIONAL DESC),
                c.DATA_SCADENTA
              ) AS DATA_SCADENTA,
              c.VALOARE, c.STARE,
              cl.CLIENT, cl.CNP
       FROM CONTRACTE c
       LEFT JOIN CLIENTI cl ON cl.ID_CLIENT = c.ID_CLIENT
       WHERE c.ID_MAGAZIN = ? AND c.STARE IN ('D', 'DA', 'P', 'PA', 'N')
       ORDER BY 4`,
      [mag.id]);
    
    let totalValoare = 0;
    let totalGreutate = 0;
    let totalGajuri = 0;
    const contracteDetaliate = [];
    
    for (const contract of contracte) {
      // TOATE gajurile active (C, V, D)
      const gajuri = await query(db,
        `SELECT g.COD, g.DENUMIRE, g.CANT, g.PRET, g.GREUTATE, g.TITLU
         FROM GAJURI g
         WHERE g.ID_CONTRACT = ? AND g.ID_MAGAZIN = ? 
           AND g.STARE IN ('C', 'V', 'D')`,
        [contract.ID_CONTRACT, mag.id]);
      
      let contractGreutate = 0;
      let contractValoare = 0;
      const gajuriSimple = gajuri.map(g => {
        const cant = g.CANT || 1;
        const pret = g.PRET || 0;
        const greutate = g.GREUTATE || 0;
        // Ca in Delphi: CANT * GREUTATE si CANT * PRET
        contractGreutate += cant * greutate;
        contractValoare += cant * pret;
        totalGajuri++;
        return {
          cod: g.COD || '',
          denumire: g.DENUMIRE || '',
          pret: pret,
          valoare: cant * pret,
          greutate: greutate,
          titlu: g.TITLU || ''
        };
      });
      
      totalValoare += contractValoare;  // Valoarea gajurilor
      totalGreutate += contractGreutate;
      
      const azi = new Date();
      const scadenta = new Date(contract.DATA_SCADENTA);
      const zileRamase = Math.ceil((scadenta - azi) / (1000 * 60 * 60 * 24));
      
      contracteDetaliate.push({
        nr_contract: contract.NR_CONTRACT,
        data_scadenta: contract.DATA_SCADENTA,
        zile_ramase: zileRamase,
        valoare: contract.VALOARE || 0,
        client: contract.CLIENT || 'Necunoscut',
        gajuri: gajuriSimple
      });
    }
    
    db.detach();
    
    res.json({
      success: true,
      magazin: mag.nume,
      nr_contracte: contracte.length,
      nr_gajuri: totalGajuri,
      total_valoare: totalValoare,
      total_greutate: totalGreutate,
      contracte: contracteDetaliate
    });
    
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/test', async (req, res) => {
  try {
    const db = await getConnection();
    const count = await query(db, 'SELECT COUNT(*) as CNT FROM MAGAZINE');
    db.detach();
    
    res.json({
      success: true,
      message: 'API Audit Transferuri Firebird functioneaza',
      database: `${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`,
      magazine: magazine.length,
      magazine_list: magazine
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/totaluri', async (req, res) => {
  console.log('\n========================================');
  console.log('TOTALURI GLOBALE - TOATE MAGAZINELE');
  console.log('========================================');
  
  try {
    const db = await getConnection();
    
    const totalContracte = await query(db, 
      `SELECT m.DENUMIRE as MAGAZIN, COUNT(*) as NR, SUM(c.VALOARE) as VALOARE
       FROM CONTRACTE c
       INNER JOIN MAGAZINE m ON m.ID_MAGAZIN = c.ID_MAGAZIN
       WHERE c.STARE IN ('D','DA','P','PA')
       GROUP BY m.DENUMIRE, m.ID_MAGAZIN
       ORDER BY m.ID_MAGAZIN`);
    
    const totalGajuri = await query(db,
      `SELECT m.DENUMIRE as MAGAZIN, COUNT(*) as NR
       FROM GAJURI g
       INNER JOIN MAGAZINE m ON m.ID_MAGAZIN = g.ID_MAGAZIN
       WHERE g.STARE = 'D'
       GROUP BY m.DENUMIRE, m.ID_MAGAZIN
       ORDER BY m.ID_MAGAZIN`);
    
    const totalProduse = await query(db,
      `SELECT m.DENUMIRE as MAGAZIN, COUNT(*) as NR, SUM(p.PRET_IESIRE) as VALOARE
       FROM PRODUSE p
       INNER JOIN MAGAZINE m ON m.ID_MAGAZIN = p.ID_MAGAZIN
       WHERE p.STOC > 0
       GROUP BY m.DENUMIRE, m.ID_MAGAZIN
       ORDER BY m.ID_MAGAZIN`);
    
    db.detach();
    
    res.json({
      success: true,
      contracte_derulare: totalContracte,
      gajuri_active: totalGajuri,
      produse_stoc: totalProduse
    });
    
  } catch (error) {
    console.error('Eroare:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n========================================`);
  console.log(`  API AUDIT TRANSFERURI - FIREBIRD`);
  console.log(`========================================`);
  console.log(`Server: http://localhost:${PORT}`);
  console.log(`Database: ${dbConfig.host}:${dbConfig.port}`);
  console.log(`\nEndpoints:`);
  console.log(`  GET  /api/magazine - lista magazine`);
  console.log(`  GET  /api/totaluri - totaluri globale`);
  console.log(`  POST /api/audit/verificare - verifica transferuri`);
  console.log(`  POST /api/birou/cauta - cauta contracte`);
  console.log(`  POST /api/birou/detalii-contract - detalii contract`);
  console.log(`  GET  /api/stocuri/valori - valori stocuri`);
  console.log(`  POST /api/stocuri/cauta - cauta produse`);
  console.log(`  POST /api/registru-casa - registru casa`);
  console.log(`  POST /api/operatiuni-amanet - operatiuni amanet`);
  console.log(`  POST /api/solduri-magazine - solduri magazine`);
  console.log(`  POST /api/interdicii/cnp - adauga/lista interdicii CNP`);
  console.log(`  POST /api/interdicii/gaj - adauga/lista interdicii IMEI`);
  console.log(`  GET  /api/interdicii/verifica/:cnp - verifica CNP`);
  console.log(`  GET  /api/test - test API`);
  console.log(`========================================\n`);
});

