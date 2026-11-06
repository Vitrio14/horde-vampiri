import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, doc, updateDoc, setDoc, deleteDoc, query, orderBy, limit, getDocs, getDoc, where, writeBatch, startAfter } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// --- CONFIGURAZIONE FIREBASE ---
const firebaseConfig = {
  apiKey: "AIzaSyAHm6VlxgUKnzZAj26EpgS6OWf21zDZ8vw",
  authDomain: "vampiri-horde.firebaseapp.com",
  projectId: "vampiri-horde",
  storageBucket: "vampiri-horde.firebasestorage.app",
  messagingSenderId: "932023666220",
  appId: "1:932023666220:web:5be5ea97be350173d83389",
  measurementId: "G-YY4822S6JQ"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// --- VARIABILI GLOBALI ---
let vendite = [];
let venditeMateriali = []; 
let inventarioDati = [];
let logs = [];
let saldoLogs = [];
let systemLogs = []; // log di sistema globali (auth, admin, scritture)
let saldoGlobale = 0;
let listaVampiri = [];
let calendarioAvvento = [];
let calendarioMesi = [];
let comunicazioni = [];
let documenti = [];
let itemImagesLib = []; // { id, fileName, dataUrl, size, createdAt }
let tipiMateriale = []; // { id, nome, prezzoUnitario, percPropria, percDinastia, percEkaton, sezioni:[], attivo }
let alberoNodi = []; // { id, nome, cognome, clan, anno, parentId, foto, note, ordine, morto, reietto, ritoCarne, createdAt }
let richiesteMembri = []; // { id, nome, grado, codice, password, stato, timestamp }
let _cachedClientIp = null;
let _ipFetchPromise = null;


// Utente loggato corrente (null se non autenticato)
let currentUser = null; // { nome, grado, codice, password, permessi: [], permessiAdmin: [], isAdmin: false }
Object.defineProperty(window, 'currentUser', {
    get() { return currentUser; },
    set(v) { currentUser = v; }
});
let listenersStarted = false;

const VALORE_UNITARIO = 30; // fallback legacy

// Sezioni disponibili e mapping nav
const SEZIONI = {
    albero: { id: 'albero', label: 'Albero' },
    generale: { id: 'generale', label: 'Generale' },
    vendite: { id: 'vendite', label: 'Vendite' },
    materiali: { id: 'materiali', label: 'Vendita Materiali' },
    saldo: { id: 'saldo', label: 'Saldo' },
    calcolo: { id: 'calcolo', label: 'Calcolo' },
    inventario: { id: 'inventario', label: 'Inventario' },
    calendario: { id: 'calendario', label: 'Calendario' },
    gestione: { id: 'gestione', label: 'Gestione' },
    foto: { id: 'foto', label: 'Foto' }
};

/** Sottosezioni del pannello Gestione assegnabili ai membri dal gestore */
const ADMIN_VIEWS = {
    comunicazioni: { id: 'comunicazioni', label: 'Comunicazioni & Link' },
    membri: { id: 'membri', label: 'Gestione Membri' },
    'storico-vendite': { id: 'storico-vendite', label: 'Storico Vendite' },
    classifiche: { id: 'classifiche', label: 'Classifiche' },
    finanze: { id: 'finanze', label: 'Gestione Finanze' },
    inventario: { id: 'inventario', label: 'Gestione Inventario' },
    materiali: { id: 'materiali', label: 'Tipi Materiale' },
    albero: { id: 'albero', label: 'Albero Genealogico' },
    calendario: { id: 'calendario', label: 'Calendario' }
    // 'permessi-gestione' NON è assegnabile — solo gestore Firebase
};

/** True se l'utente corrente è gestore pieno o ha almeno un permesso admin */
function canAccessGestione() {
    if (!currentUser) return false;
    if (currentUser.isAdmin) return true;
    return Array.isArray(currentUser.permessiAdmin) && currentUser.permessiAdmin.length > 0;
}

/** True se può usare una specifica sottosezione di Gestione */
function hasAdminPerm(viewId) {
    if (!currentUser) return false;
    if (currentUser.isAdmin) return true;
    return Array.isArray(currentUser.permessiAdmin) && currentUser.permessiAdmin.includes(viewId);
}
window.hasAdminPerm = hasAdminPerm;
window.canAccessGestione = canAccessGestione;

// --- UTILS ---
const fmt = (n) => {
    if (n === undefined || n === null) return "0";
    return new Intl.NumberFormat('it-IT').format(n);
};

// --- FUNZIONE NOTIFICA ---
const vampireToast = (msg, icon = 'info') => {
    const Toast = Swal.mixin({
        toast: true, 
        position: 'top-end', 
        showConfirmButton: false, 
        timer: 3000, 
        timerProgressBar: true,
        background: '#121212', 
        color: '#e0e0e0', 
        iconColor: icon === 'success' ? '#2ecc71' : (icon === 'error' ? '#e74c3c' : '#c5a059')
    });
    Toast.fire({ icon: icon, title: msg });
};
window.vampireToast = vampireToast;

// --- CACHE SESSIONE (riduce letture a refresh/login ripetuti) ---
const FS_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minuti
function fsCacheGet(key) {
    try {
        const raw = sessionStorage.getItem('vamp_fs_' + key);
        if (!raw) return null;
        const obj = JSON.parse(raw);
        if (!obj || !obj.t || (Date.now() - obj.t) > FS_CACHE_TTL_MS) return null;
        return obj.data;
    } catch (_) { return null; }
}
function fsCacheSet(key, data) {
    try {
        sessionStorage.setItem('vamp_fs_' + key, JSON.stringify({ t: Date.now(), data }));
    } catch (_) {}
}


// --- LOG DI SISTEMA (auth, admin, scritture) ---
async function resolveClientIp() {
    if (_cachedClientIp) return _cachedClientIp;
    if (_ipFetchPromise) return _ipFetchPromise;
    _ipFetchPromise = (async () => {
        try {
            const ctrl = new AbortController();
            const t = setTimeout(() => ctrl.abort(), 2500);
            const res = await fetch('https://api.ipify.org?format=json', { signal: ctrl.signal });
            clearTimeout(t);
            if (res.ok) {
                const j = await res.json();
                _cachedClientIp = (j && j.ip) ? String(j.ip) : 'sconosciuto';
            } else {
                _cachedClientIp = 'sconosciuto';
            }
        } catch (_) {
            _cachedClientIp = 'sconosciuto';
        }
        return _cachedClientIp;
    })();
    return _ipFetchPromise;
}

/**
 * Registra un evento nel log di sistema (non blocca l'UI se fallisce).
 */
/**
 * Log di sistema leggero: non blocca l'UI.
 * - IP in cache dopo la prima chiamata
 * - scrittura Firestore in background (fire-and-forget)
 * - meta limitata per non gonfiare i documenti
 */
function logSystemEvent(tipo, azione, dettagli, meta = null, opts = {}) {
    // Cattura contesto subito (prima che currentUser cambi su logout)
    const utente = (opts.utente != null)
        ? opts.utente
        : (currentUser?.nome || 'Anonimo');
    const ruolo = (opts.ruolo != null)
        ? opts.ruolo
        : (currentUser?.isAdmin ? 'gestore' : (currentUser ? 'membro' : 'anonimo'));
    const ua = (typeof navigator !== 'undefined' && navigator.userAgent) ? navigator.userAgent.slice(0, 200) : '';
    let metaSafe = null;
    if (meta && typeof meta === 'object') {
        try {
            const s = JSON.stringify(meta);
            metaSafe = s.length > 800 ? { _truncated: true, preview: s.slice(0, 400) } : meta;
        } catch (_) {
            metaSafe = null;
        }
    }
    const base = {
        timestamp: Date.now(),
        tipo: String(tipo || 'altro').slice(0, 40),
        azione: String(azione || 'evento').slice(0, 60),
        utente: String(utente).slice(0, 80),
        ruolo: String(ruolo).slice(0, 20),
        dettagli: String(dettagli || '').slice(0, 600),
        userAgent: ua,
        meta: metaSafe
    };
    // Background: non awaitato dai caller
    (async () => {
        try {
            const ip = await resolveClientIp();
            await addDoc(collection(db, 'system_logs'), { ...base, ip: ip || 'sconosciuto' });
        } catch (err) {
            console.warn('[system_logs] scrittura fallita:', err?.code || err?.message || err);
        }
    })();
}
window.logSystemEvent = logSystemEvent;

// --- GESTIONE AUTENTICAZIONE ---
window.unlockSite = async () => {
    const codice = (document.getElementById('global-codice')?.value || "").trim();
    const passInput = (document.getElementById('global-pass')?.value || "").trim();
    
    if(!codice || codice.length !== 4 || !/^\d{4}$/.test(codice)) {
        return vampireToast("Inserire un codice a 4 cifre valido.", "error");
    }
    if(!passInput) return vampireToast("Inserire la password per procedere.", "error");

    try {
        // Cerca membro con quel codice
        const q = query(collection(db, "membri"), where("codice", "==", codice));
        const snap = await getDocs(q);
        
        if (snap.empty) {
            logSystemEvent('auth', 'login_fallito', `Login membro fallito: codice ${codice} non riconosciuto`, { codice }, { utente: `codice:${codice}`, ruolo: 'anonimo' });
            return vampireToast("Accesso negato. Codice non riconosciuto.", "error");
        }

        let found = null;
        snap.forEach(d => {
            const data = d.data();
            if (data.password === passInput) {
                found = { id: d.id, ...data };
            }
        });

        if (!found) {
            logSystemEvent('auth', 'login_fallito', `Login membro fallito: password errata per codice ${codice}`, { codice }, { utente: `codice:${codice}`, ruolo: 'anonimo' });
            return vampireToast("Accesso negato. Password errata.", "error");
        }

        if (found.sospeso === true) {
            const motivoSos = (found.motivoSospensione || '').trim() || 'Nessun motivo specificato';
            logSystemEvent('auth', 'login_fallito', `Login bloccato: membro sospeso ${found.nome}. Motivo: ${motivoSos}`, { codice, nome: found.nome, motivo: motivoSos }, { utente: found.nome, ruolo: 'membro' });
            await Swal.fire({
                title: 'Accesso sospeso',
                html: `<p style="font-size:0.95rem;line-height:1.5;margin:0;">Accesso sospeso per: <strong style="color:#e74c3c;">${String(motivoSos).replace(/</g,'&lt;')}</strong></p>`,
                icon: 'error',
                confirmButtonColor: '#8b0000',
                background: '#111',
                color: '#fff',
                confirmButtonText: 'Ho capito'
            });
            return;
        }

        // Login membro riuscito
        currentUser = {
            nome: found.nome,
            grado: found.grado || "",
            codice: found.codice,
            password: found.password,
            permessi: Array.isArray(found.permessi) ? found.permessi : ["generale"],
            permessiAdmin: Array.isArray(found.permessiAdmin) ? found.permessiAdmin : [],
            isAdmin: false
        };

        // Salva sessione leggera
        try { localStorage.setItem('vamp_session', JSON.stringify({ codice, ts: Date.now() })); } catch(e){}

        document.getElementById('global-lock').style.display = 'none';
        document.getElementById('admin-content').style.display = 'none';
        
        if (!listenersStarted) {
            startFirestoreListeners();
            listenersStarted = true;
        }
        
        applyPermissions();
        const firstPerm = currentUser.permessi.find(p => SEZIONI[p] && p !== 'gestione' && p !== 'foto') || 'generale';
        window.showSection(firstPerm);
        logSystemEvent('auth', 'login', `Login membro riuscito: ${currentUser.nome} (${currentUser.grado || 'n/d'})`, { codice: currentUser.codice, grado: currentUser.grado, permessi: currentUser.permessi });
        vampireToast(`Benvenuto, ${currentUser.nome}.`, "success");
        
        // Pulisci campi
        document.getElementById('global-codice').value = "";
        document.getElementById('global-pass').value = "";
    } catch (error) {
        console.error(error);
        vampireToast("Errore durante l'accesso.", "error");
    }
};

window.logoutVampiro = async () => {
    const res = await Swal.fire({
        title: 'Abbandonare la sessione?',
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#8b0000',
        background: '#111',
        color: '#fff'
    });
    if(res.isConfirmed) {
        const who = currentUser?.nome || 'Anonimo';
        const ruolo = currentUser?.isAdmin ? 'gestore' : 'membro';
        logSystemEvent('auth', 'logout', `Logout: ${who}`, null, { utente: who, ruolo });
        currentUser = null;
        try { localStorage.removeItem('vamp_session'); } catch(e){}
        // Se era admin Firebase, esci anche da lì
        try { await signOut(auth); } catch(e){}
        location.reload();
    }
};

window.checkAccess = async () => {
    const passInput = document.getElementById('admin-pass').value;
    const email = "vampiri.gestore@horde.it";

    if(!passInput) return vampireToast("Inserire la password gestore.", "error");

    try {
        await signInWithEmailAndPassword(auth, email, passInput);
        // onAuthStateChanged gestirà il resto
        logSystemEvent('auth', 'login_gestore', 'Login gestore riuscito (pannello gestione)', { email }, { utente: 'GESTORE', ruolo: 'gestore' });
        vampireToast("Accesso Gestore garantito.", "success");
    } catch (error) {
        logSystemEvent('auth', 'login_fallito', 'Login gestore fallito (pannello gestione)', { email }, { utente: 'GESTORE', ruolo: 'anonimo' });
        vampireToast("Credenziali Gestore errate.", "error");
    }
};

// --- Switch tra login membro / gestore / registrazione sulla schermata principale ---
function _hideAllLoginBoxes() {
    const ids = ['login-membro-box', 'login-gestore-box', 'login-registrazione-box'];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
}

window.mostraLoginGestore = () => {
    _hideAllLoginBoxes();
    document.getElementById('login-gestore-box').style.display = 'block';
    setTimeout(() => document.getElementById('global-admin-pass')?.focus(), 50);
};

window.mostraLoginMembro = () => {
    _hideAllLoginBoxes();
    document.getElementById('login-membro-box').style.display = 'block';
    setTimeout(() => document.getElementById('global-codice')?.focus(), 50);
};

window.mostraRegistrazioneMembro = () => {
    _hideAllLoginBoxes();
    const box = document.getElementById('login-registrazione-box');
    if (box) box.style.display = 'block';
    const g = document.getElementById('reg-grado');
    if (g) g.value = 'Neonato';
    setTimeout(() => document.getElementById('reg-nome')?.focus(), 50);
};

/** Permessi standard per un nuovo Neonato (tutte le sezioni membro + extra foto) */
const PERMESSI_NUOVO_MEMBRO = [
    'albero', 'generale', 'vendite', 'materiali',
    'saldo', 'calcolo', 'inventario', 'calendario', 'foto'
];

/**
 * Registrazione pubblica: crea profilo in membri con grado Neonato e permessi completi.
 * Controlla unicità nome, codice e password.
 */
window.registraRichiestaMembro = async () => {
    const nome = (document.getElementById('reg-nome')?.value || '').trim();
    const grado = 'Neonato';
    const codice = (document.getElementById('reg-codice')?.value || '').trim();
    const password = (document.getElementById('reg-password')?.value || '').trim();

    if (!nome) return vampireToast('Inserisci il nome.', 'error');
    if (nome.length < 2) return vampireToast('Il nome deve avere almeno 2 caratteri.', 'error');
    if (!codice || codice.length !== 4 || !/^\d{4}$/.test(codice)) {
        return vampireToast('Il codice deve essere esattamente 4 cifre numeriche.', 'error');
    }
    if (!password) return vampireToast('Inserisci una password numerica.', 'error');
    if (!/^\d+$/.test(password)) {
        return vampireToast('La password deve essere solo numerica.', 'error');
    }
    if (password.length < 4) {
        return vampireToast('La password deve avere almeno 4 cifre.', 'error');
    }

    const btn = document.querySelector('#login-registrazione-box button');
    if (btn) { btn.disabled = true; btn.textContent = 'Invio in corso...'; }

    try {
        // Nome già membro?
        try {
            const existingDoc = await getDoc(doc(db, 'membri', nome));
            if (existingDoc.exists()) {
                return vampireToast('Questo nome è già registrato come membro. Scegline un altro.', 'error');
            }
        } catch (e) {
            console.warn('check nome', e);
        }

        // Codice già in uso tra i membri
        try {
            const qCod = query(collection(db, 'membri'), where('codice', '==', codice));
            const snapCod = await getDocs(qCod);
            if (!snapCod.empty) {
                return vampireToast('Questo codice è già usato. Scegline un altro.', 'error');
            }
        } catch (e) {
            console.warn('check codice', e);
        }

        // Nota: niente full-scan su membri per password (troppo costoso in letture).
        // Unicità garantita su nome (doc id) e codice (query where).

        // Duplicati in richieste pending — solo pending, limitato
        try {
            const reqSnap = await getDocs(query(
                collection(db, 'richieste_membri'),
                where('stato', '==', 'pending'),
                limit(100)
            ));
            let dupNome = false, dupCod = false;
            reqSnap.forEach(d => {
                const r = d.data() || {};
                if (String(r.nome || '') === nome) dupNome = true;
                if (String(r.codice || '') === codice) dupCod = true;
            });
            if (dupNome) return vampireToast('Esiste già una richiesta in attesa con questo nome.', 'error');
            if (dupCod) return vampireToast('Questo codice è già usato in una richiesta in attesa.', 'error');
        } catch (e) {
            // Se manca indice o rules: non bloccare la richiesta
            console.warn('check richieste esistenti', e);
        }

        await addDoc(collection(db, 'richieste_membri'), {
            nome,
            grado,
            codice,
            password,
            stato: 'pending',
            timestamp: Date.now()
        });

        try {
            logSystemEvent('membro', 'richiesta_credenziali', `Richiesta accesso inviata: ${nome} (Neonato)`, {
                nome, codice
            }, { utente: nome, ruolo: 'anonimo' });
        } catch (_) {}

        ['reg-nome', 'reg-codice', 'reg-password'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        const g = document.getElementById('reg-grado');
        if (g) g.value = 'Neonato';

        const guidaUrl = 'https://docs.google.com/document/d/1vSXHmDLpVMzRoNS0kCvdsoXwqgBKENyd/edit?usp=sharing&ouid=101888068339212887667&rtpof=true&sd=true';

        await Swal.fire({
            title: 'Richiesta inviata',
            icon: 'info',
            html: `
                <p style="margin-bottom:12px;font-size:0.9rem;">La tua richiesta è stata inviata al <strong style="color:#c5a059;">gestore</strong>.</p>
                <p style="margin-bottom:12px;font-size:0.85rem;line-height:1.45;">
                    <strong>Non puoi ancora accedere</strong>: il gestore deve prima <strong style="color:#c5a059;">accettare</strong> la richiesta.
                    Solo dopo l'approvazione il tuo account sarà attivo e potrai entrare con codice e password.
                </p>
                <div style="background:rgba(0,0,0,0.35);border:1px solid rgba(197,160,89,0.35);border-radius:8px;padding:14px;text-align:left;margin-bottom:14px;font-size:0.85rem;">
                    <div style="margin-bottom:6px;"><strong style="color:#c5a059;">Nome:</strong> ${String(nome).replace(/</g,'&lt;')}</div>
                    <div style="margin-bottom:6px;"><strong style="color:#c5a059;">Grado:</strong> Neonato</div>
                    <div style="margin-bottom:6px;"><strong style="color:#c5a059;">Codice:</strong> <span style="font-family:monospace;letter-spacing:2px;font-size:1.05rem;">${codice}</span></div>
                    <div><strong style="color:#c5a059;">Password:</strong> <span style="font-family:monospace;letter-spacing:1px;">${String(password).replace(/</g,'&lt;')}</span></div>
                </div>
                <p style="font-size:0.8rem;opacity:0.9;margin-bottom:10px;"><strong>Memorizza e salva</strong> questi dati: ti serviranno quando il gestore avrà accettato.</p>
                <p style="font-size:0.8rem;margin-bottom:4px;">Nel frattempo leggi la guida del gestionale, è un passaggio obbligatorio:</p>
                <p style="margin-bottom:8px;"><a href="${guidaUrl}" target="_blank" rel="noopener" style="color:#c5a059;font-weight:700;text-decoration:underline;">Apri la guida del gestionale</a></p>
            `,
            confirmButtonText: 'Torna al login',
            confirmButtonColor: '#8b0000',
            background: '#111',
            color: '#fff',
            allowOutsideClick: false,
            heightAuto: false,
            didOpen: () => {
                const c = document.querySelector('.swal2-container');
                if (c) c.style.zIndex = '100000';
            }
        });

        window.mostraLoginMembro();
        const codEl = document.getElementById('global-codice');
        const passEl = document.getElementById('global-pass');
        if (codEl) codEl.value = '';
        if (passEl) passEl.value = '';
        setTimeout(() => codEl?.focus(), 80);
    } catch (err) {
        console.error('[registraRichiestaMembro]', err);
        const code = err?.code || '';
        const msg = String(err?.message || err || '');
        if (code === 'permission-denied' || msg.includes('permission') || msg.includes('Missing or insufficient')) {
            vampireToast('Permesso negato su Firestore: aggiungi le regole per la collezione richieste_membri.', 'error');
            await Swal.fire({
                title: 'Errore permessi Firebase',
                icon: 'error',
                html: `<p style="font-size:0.85rem;line-height:1.45;">La scrittura su <code>richieste_membri</code> è bloccata dalle Security Rules.</p>
                <p style="font-size:0.8rem;margin-top:10px;text-align:left;">Aggiungi in Firebase Console → Firestore → Rules:</p>
                <pre style="text-align:left;font-size:0.7rem;background:#000;padding:10px;overflow:auto;">match /richieste_membri/{doc} {
  allow read, create: if true;
  allow update, delete: if true;
}</pre>`,
                confirmButtonColor: '#8b0000',
                background: '#111',
                color: '#fff'
            });
        } else {
            vampireToast('Errore durante la richiesta: ' + (msg || code || 'sconosciuto'), 'error');
        }
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Registra richiesta'; }
    }
};

window.unlockGestore = async () => {
    const passInput = (document.getElementById('global-admin-pass')?.value || "").trim();
    const email = "vampiri.gestore@horde.it";

    if(!passInput) return vampireToast("Inserire la password gestore.", "error");

    try {
        await signInWithEmailAndPassword(auth, email, passInput);
        // onAuthStateChanged si occupa del resto (mostra pannello admin)
        logSystemEvent('auth', 'login_gestore', 'Login gestore riuscito (schermata principale)', { email }, { utente: 'GESTORE', ruolo: 'gestore' });
        vampireToast("Accesso Gestore garantito.", "success");
    } catch (error) {
        logSystemEvent('auth', 'login_fallito', 'Login gestore fallito: credenziali errate', { email }, { utente: 'GESTORE', ruolo: 'anonimo' });
        vampireToast("Credenziali Gestore errate.", "error");
    }
};

// Applica visibilità nav e form in base ai permessi
function applyPermissions() {
    if (!currentUser) return;

    const isAdmin = currentUser.isAdmin;
    const perm = currentUser.permessi || [];
    const canGest = canAccessGestione();

    // Nav links interni
    document.querySelectorAll('.nav-link[onclick]').forEach(link => {
        const onclick = link.getAttribute('onclick') || "";
        let sectionId = null;
        if (onclick.includes("showSection('")) {
            sectionId = onclick.match(/showSection\('([^']+)'\)/)?.[1];
        }
        if (sectionId === 'gestione') {
            // Gestore pieno OPPURE membro con almeno un permesso admin assegnato
            link.style.display = canGest ? '' : 'none';
        } else if (sectionId) {
            link.style.display = (isAdmin || perm.includes(sectionId)) ? '' : 'none';
        }
    });

    // Bottone Foto (flottante) — unico extra rimasto
    const fotoBtn = document.getElementById('btn-foto-float');
    if (fotoBtn) {
        fotoBtn.style.display = (isAdmin || perm.includes('foto')) ? 'flex' : 'none';
    }

    // Nascondi i select "Vampiro" personali se non admin (usa currentUser automaticamente)
    const personalSelectIds = ['vamp-nome', 'mat-vamp-nome', 'saldo-nome', 'inv-user-name', 'calc-search-name'];
    personalSelectIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            const formGroup = el.closest('.form-group');
            if (formGroup) {
                formGroup.style.display = isAdmin ? '' : 'none';
            }
            // Se non admin e c'è currentUser, pre-setta il valore (per sicurezza)
            if (!isAdmin && currentUser.nome) {
                el.value = currentUser.nome;
            }
        }
    });

    // Per calcolo: se non admin, forziamo il nome e nascondiamo il periodo se vuoi, ma lasciamo
    if (!isAdmin && document.getElementById('calc-search-name')) {
        document.getElementById('calc-search-name').value = currentUser.nome;
    }
}

onAuthStateChanged(auth, (user) => {
    if (user) {
        if (user.email === "vampiri.gestore@horde.it") {
            currentUser = {
                nome: "GESTORE",
                grado: "Originario",
                isAdmin: true,
                permessi: Object.keys(SEZIONI)
            };
            document.getElementById('global-lock').style.display = 'none';
            document.getElementById('login-container-gestione').style.display = 'none';
            document.getElementById('admin-content').style.display = 'block';
            
            if (!listenersStarted) {
                startFirestoreListeners();
                listenersStarted = true;
            }
            
            applyPermissions();
            // Solo Generale al login (anche gestore): dati pesanti on-demand
            window.showSection('generale');
            try { renderVampiriLists?.(); renderDinamici?.(); } catch (_) {}
        }
        // Non gestiamo più vampiri@horde.it
    } else {
        // Solo se non c'è currentUser membro
        if (!currentUser || currentUser.isAdmin) {
            document.getElementById('global-lock').style.display = 'flex';
            document.getElementById('admin-content').style.display = 'none';
            const loginGest = document.getElementById('login-container-gestione');
            if(loginGest) {
                loginGest.style.display = 'flex';
                loginGest.style.justifyContent = 'center';
                loginGest.style.alignItems = 'center';
            }
            currentUser = null;
        }
    }
});

function refreshAdminUI() {
    window.renderAdminTable(); 
    window.renderArchivioGestione(); 
    window.renderAdminLogs(); 
    window.renderAdminSaldoLogs();
    window.renderAdminMateriali(); 
    if (typeof window.renderAdminTipiMateriale === 'function') window.renderAdminTipiMateriale();
    if (typeof window.renderAdminAlbero === 'function') window.renderAdminAlbero();
    if (typeof window.popolaSelectPermessiGestione === 'function') window.popolaSelectPermessiGestione();
    if (typeof window.renderAdminPermessiGestioneTable === 'function') window.renderAdminPermessiGestioneTable();
    if (typeof window.renderAdminClassifiche === 'function') window.renderAdminClassifiche({ refreshWeeks: true });
    if (typeof window.filterAdminMenuCards === 'function') window.filterAdminMenuCards();
    if (typeof window.renderAdminCalendario === 'function') window.renderAdminCalendario();
    renderVampiriLists(); 
    renderDinamici(); 
    aggiornaStats(); 
}

window.logoutAdmin = async () => {
    const res = await Swal.fire({
        title: 'Chiudere la sessione?',
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#8b0000',
        background: '#111',
        color: '#fff'
    });
    
    if(res.isConfirmed) {
        logSystemEvent('auth', 'logout', 'Logout gestore', null, { utente: 'GESTORE', ruolo: 'gestore' });
        currentUser = null;
        try { localStorage.removeItem('vamp_session'); } catch(e){}
        await signOut(auth);
        vampireToast("Sessione chiusa correttamente.", "info");
        setTimeout(() => { location.reload(); }, 800);
    }
};

// --- LOGICA SEZIONI ---
window.showSection = (id) => {
    const prevId = document.querySelector('.section.active')?.id || null;

    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    const target = document.getElementById(id);
    if (target) target.classList.add('active');
    const link = Array.from(document.querySelectorAll('.nav-link')).find(l => l.getAttribute('onclick')?.includes(id));
    if (link) link.classList.add('active');
    window.scrollTo(0, 0);

    // Stacca listener della sezione precedente (tiene i dati in memoria)
    if (typeof window.releaseSectionData === 'function' && prevId && prevId !== id) {
        window.releaseSectionData(prevId, id);
    }
    // Attacca solo i dati della sezione corrente
    if (typeof window.ensureSectionData === 'function') {
        window.ensureSectionData(id);
    }

    // Niente storico massivo in navigazione (Top 3 = solo settimana live)
    if (typeof window.refreshActiveSectionUI === 'function') {
        scheduleUI(() => window.refreshActiveSectionUI());
    }

    if (id === 'gestione') {
        setupGestionePanelForCurrentUser();
        if (typeof window.filterAdminMenuCards === 'function') window.filterAdminMenuCards();
    }

    if (id === 'albero') {
        if (window._alberoDirty || !document.getElementById('albero-tree-root')?.querySelector('.albero-nodo, .albero-roots-row')) {
            window._alberoDirty = false;
            if (typeof window.renderAlbero === 'function') window.renderAlbero({ forceCenter: true });
        } else {
            setTimeout(() => {
                if (typeof centerAlberoView === 'function') centerAlberoView();
            }, 40);
        }
    }
};

/** Mostra/nasconde login gestore vs pannello admin filtrato in base ai permessi */
function setupGestionePanelForCurrentUser() {
    const loginBox = document.getElementById('login-container-gestione');
    const adminContent = document.getElementById('admin-content');
    if (!loginBox || !adminContent) return;

    if (currentUser?.isAdmin) {
        // Gestore Firebase: pannello completo
        loginBox.style.display = 'none';
        adminContent.style.display = 'block';
        filterAdminMenuCards();
        return;
    }

    if (canAccessGestione()) {
        // Membro con permessi admin delegati
        loginBox.style.display = 'none';
        adminContent.style.display = 'block';
        // Torna al menu griglia
        document.querySelectorAll('.admin-sub-view').forEach(v => v.style.display = 'none');
        const menu = document.getElementById('admin-dashboard-menu');
        if (menu) menu.style.display = 'grid';
        filterAdminMenuCards();
        return;
    }

    // Nessun permesso: mostra form login gestore (Firebase)
    loginBox.style.display = 'flex';
    adminContent.style.display = 'none';
}

/** Filtra le card del menu Gestione in base a permessiAdmin (o tutte se isAdmin) */
function filterAdminMenuCards() {
    document.querySelectorAll('.admin-menu-card[data-admin-view]').forEach(card => {
        const viewId = card.getAttribute('data-admin-view');
        if (!viewId) return;
        // Solo il gestore pieno vede la card "Permessi Gestione"
        if (viewId === 'permessi-gestione' || viewId === 'backup' || viewId === 'richieste-membri') {
            card.style.display = currentUser?.isAdmin ? '' : 'none';
            return;
        }
        card.style.display = hasAdminPerm(viewId) ? '' : 'none';
    });
}
window.filterAdminMenuCards = filterAdminMenuCards;
window.setupGestionePanelForCurrentUser = setupGestionePanelForCurrentUser;

// --- GESTIONE DINAMICA ---
window.addDinamico = async (col) => {
    const pref = col === 'comunicazioni' ? 'adm-com-' : 'adm-doc-';
    const titolo = document.getElementById(pref + 'titolo').value.trim();
    const desc = document.getElementById(pref + 'desc').value.trim();
    const link = document.getElementById(pref + 'link').value.trim();
    const firma = document.getElementById(pref + 'firma').value.trim() || "Vitrio";

    if(!titolo || !desc) return vampireToast("Titolo e descrizione obbligatori", "error");
    await addDoc(collection(db, col), { titolo, desc, link, firma, timestamp: Date.now() });
    logSystemEvent('dinamico', 'crea', `Pubblicato ${col}: "${titolo}"`, { col, titolo, firma });
    document.getElementById(pref + 'titolo').value = "";
    document.getElementById(pref + 'desc').value = "";
    document.getElementById(pref + 'link').value = "";
    document.getElementById(pref + 'firma').value = "";
    vampireToast("Elemento pubblicato con successo!", "success");
};

window.delDinamico = async (col, id) => {
    const res = await Swal.fire({ title: 'Rimuovere?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#8b0000', background: '#111', color: '#fff' });
    if(res.isConfirmed) {
        await deleteDoc(doc(db, col, id));
        logSystemEvent('dinamico', 'elimina', `Rimosso elemento da ${col} (id ${id})`, { col, id });
        vampireToast("Elemento rimosso correttamente.", "success");
    }
};

function renderDinamici() {
    const comBox = document.getElementById('comunicazioni-box');
    if(comBox) comBox.innerHTML = comunicazioni.map(c => `
        <div class="dyn-item">
            <span class="dyn-title">${c.titolo}</span>
            <span class="dyn-desc">${c.desc}</span>
            ${c.link ? `<a href="${c.link}" target="_blank" class="photo-link" style="margin-bottom:5px; font-size:0.6rem">APRI LINK</a>` : ''}
            <span class="dyn-signature">- Annuncio inviato da ${c.firma}</span>
        </div>`).join('');

    const docBox = document.getElementById('documenti-box');
    if(docBox) docBox.innerHTML = documenti.map(d => `
        <div class="dyn-item">
            <span class="dyn-title">${d.titolo}</span>
            <span class="dyn-desc">${d.desc}</span>
            ${d.link ? `<a href="${d.link}" target="_blank" class="photo-link" style="font-size:0.7rem">APRI DOCUMENTO</a>` : ''}
            <span class="dyn-signature" style="margin-top:4px">Caricato da: ${d.firma}</span>
        </div>`).join('');

    const admComList = document.getElementById('adm-com-list');
    if(admComList) admComList.innerHTML = comunicazioni.map(c => `
        <div style="font-size:0.7rem; border-bottom:1px solid #333; padding:5px; display:flex; justify-content:space-between; align-items:center;">
            <span>${c.titolo}</span><button class="btn-delete" onclick="delDinamico('comunicazioni','${c.id}')">X</button>
        </div>`).join('');

    const admDocList = document.getElementById('adm-doc-list');
    if(admDocList) admDocList.innerHTML = documenti.map(d => `
        <div style="font-size:0.7rem; border-bottom:1px solid #333; padding:5px; display:flex; justify-content:space-between; align-items:center;">
            <span>${d.titolo}</span><button class="btn-delete" onclick="delDinamico('documenti','${d.id}')">X</button>
        </div>`).join('');
}

// --- GESTIONE MEMBRI ---
window.aggiungiVampiro = async () => {
    const nome = document.getElementById('admin-vamp-nome').value.trim();
    const grado = document.getElementById('admin-vamp-grado').value.trim();
    const codice = (document.getElementById('admin-vamp-codice')?.value || "").trim();
    const password = (document.getElementById('admin-vamp-password')?.value || "").trim();
    
    if(!nome || !grado) return vampireToast("Inserisci nome e grado", "error");
    if(codice && (codice.length !== 4 || !/^\d{4}$/.test(codice))) {
        return vampireToast("Il codice deve essere esattamente 4 cifre numeriche.", "error");
    }
    
    // Raccogli permessi
    const permessi = [];
    document.querySelectorAll('.perm-check:checked').forEach(cb => permessi.push(cb.value));
    if(permessi.length === 0) permessi.push('generale');

    // Controlla unicità codice se fornito
    if(codice) {
        const q = query(collection(db, "membri"), where("codice", "==", codice));
        const snap = await getDocs(q);
        let conflict = false;
        snap.forEach(d => {
            if(d.id !== nome) conflict = true;
        });
        if(conflict) return vampireToast("Questo codice è già assegnato ad un altro membro.", "error");
    }

    const data = { nome, grado, permessi };
    if(codice) data.codice = codice;
    if(password) data.password = password;
    // Se è un nuovo salvataggio / aggiornamento da form, non archivia; lascia lo stato esistente se merge
    // (per riattivare un sospeso usare esplicitamente riattivaVampiro)

    await setDoc(doc(db, "membri", nome), data, { merge: true });
    logSystemEvent('membro', 'salva', `Membro salvato/aggiornato: ${nome} (${grado})`, { nome, grado, permessi: data.permessi, codice: !!codice });
    document.getElementById('admin-vamp-nome').value = "";
    document.getElementById('admin-vamp-grado').value = "";
    if(document.getElementById('admin-vamp-codice')) document.getElementById('admin-vamp-codice').value = "";
    if(document.getElementById('admin-vamp-password')) document.getElementById('admin-vamp-password').value = "";
    // Reset checkboxes a default
    document.querySelectorAll('.perm-check').forEach(cb => {
        cb.checked = ['albero','generale','vendite','materiali','saldo','inventario','calendario'].includes(cb.value);
    });
    
    vampireToast("Membro salvato correttamente.", "success");
};

/** Tutti i membri (sospesi inclusi: restano in liste e selettori) */
function membriAttivi() {
    return listaVampiri.slice();
}

/** Membri con accesso sospeso */
function membriSospesi() {
    return listaVampiri.filter(v => v.sospeso === true);
}

// --- PERMESSI GESTIONE (delega sottosezioni admin ai membri) ---
window.popolaSelectPermessiGestione = function() {
    const sel = document.getElementById('adm-perm-gest-membro');
    if (!sel) return;
    const current = sel.value;
    const opts = membriAttivi()
        .slice()
        .sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'it'))
        .map(v => `<option value="${String(v.nome).replace(/"/g, '&quot;')}">${v.nome}</option>`)
        .join('');
    sel.innerHTML = `<option value="">— Seleziona membro —</option>` + opts;
    if (current) sel.value = current;
};

window.onSelectMembroPermessiGestione = function() {
    const nome = (document.getElementById('adm-perm-gest-membro')?.value || '').trim();
    const box = document.getElementById('adm-perm-gest-checkboxes');
    if (!box) return;
    const v = listaVampiri.find(x => x.nome === nome);
    const assigned = (v && Array.isArray(v.permessiAdmin)) ? v.permessiAdmin : [];
    box.querySelectorAll('.perm-admin-check').forEach(cb => {
        cb.checked = assigned.includes(cb.value);
    });
    const info = document.getElementById('adm-perm-gest-info');
    if (info) {
        info.textContent = nome
            ? `${assigned.length} tab Gestione abilitate per ${nome}.`
            : 'Seleziona un membro per vedere/modificare le tab di Gestione abilitate.';
    }
};

window.salvaPermessiGestioneMembro = async function() {
    if (!currentUser || !currentUser.isAdmin) {
        return vampireToast('Solo il gestore può assegnare i permessi di Gestione.', 'error');
    }
    const nome = (document.getElementById('adm-perm-gest-membro')?.value || '').trim();
    if (!nome) return vampireToast('Seleziona un membro.', 'error');
    const permessiAdmin = [];
    document.querySelectorAll('.perm-admin-check:checked').forEach(cb => {
        if (ADMIN_VIEWS[cb.value]) permessiAdmin.push(cb.value);
    });
    try {
        await setDoc(doc(db, 'membri', nome), {
            permessiAdmin,
            permessiAdminAggiornatiAt: Date.now(),
            permessiAdminDa: currentUser.nome || 'GESTORE'
        }, { merge: true });
        logSystemEvent('admin', 'permessi_gestione', `Permessi Gestione aggiornati per ${nome}: ${permessiAdmin.join(', ') || 'nessuno'}`, { nome, permessiAdmin });
        vampireToast(`Permessi Gestione aggiornati per ${nome} (${permessiAdmin.length} tab).`, 'success');
        window.onSelectMembroPermessiGestione();
        if (typeof window.renderAdminPermessiGestioneTable === 'function') {
            window.renderAdminPermessiGestioneTable();
        }
    } catch (err) {
        console.error(err);
        vampireToast('Errore salvataggio permessi.', 'error');
    }
};

window.renderAdminPermessiGestioneTable = function() {
    const tbody = document.getElementById('admin-permessi-gestione-body');
    if (!tbody) return;
    const search = (document.getElementById('search-admin-permessi-gest')?.value || '').toLowerCase().trim();
    let list = membriAttivi();
    if (search) {
        list = list.filter(v =>
            (v.nome || '').toLowerCase().includes(search) ||
            (Array.isArray(v.permessiAdmin) ? v.permessiAdmin.join(' ') : '').toLowerCase().includes(search)
        );
    }
    list = [...list].sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'it'));
    tbody.innerHTML = list.map(v => {
        const perms = Array.isArray(v.permessiAdmin) ? v.permessiAdmin : [];
        const labels = perms.map(p => ADMIN_VIEWS[p]?.label || p);
        const chips = labels.length
            ? labels.map(l => `<span class="rango-count-chip" style="min-width:auto;padding:4px 8px;margin:2px;"><span class="rango-count-label" style="margin:0;">${l}</span></span>`).join('')
            : '<span style="opacity:0.4;font-size:0.7rem;">Nessuna tab Gestione</span>';
        const safeName = String(v.nome || '').replace(/'/g, "\\'");
        return `<tr>
            <td><strong>${v.nome}</strong></td>
            <td style="text-align:left;">${chips}</td>
            <td>
                <button class="btn-delete" style="border-color:var(--gold-accent);color:var(--gold-accent);"
                    onclick="document.getElementById('adm-perm-gest-membro').value='${safeName}';window.onSelectMembroPermessiGestione();">
                    Modifica
                </button>
            </td>
        </tr>`;
    }).join('') || '<tr><td colspan="3" style="opacity:0.5;text-align:center;">Nessun membro trovato.</td></tr>';
};

window.sospendiVampiro = async (id) => {
    if (!hasAdminPerm('membri')) {
        return vampireToast("Non hai il permesso Gestione Membri.", "error");
    }
    const v = listaVampiri.find(x => x.nome === id);
    if (!v) return vampireToast("Membro non trovato.", "error");
    if (v.sospeso === true) return vampireToast("Questo membro è già sospeso.", "info");

    const res = await Swal.fire({
        title: 'Sospendere accesso?',
        html: `<p style="margin-bottom:12px;font-size:0.85rem;">Stai per sospendere l'accesso di <strong style="color:#c5a059">${v.nome}</strong>.<br>
        Resterà in Generale e nei selettori (in rosso), ma non potrà più accedere.<br>
        <span style="color:#aaa;font-size:0.75rem;">Al login vedrà il motivo della sospensione.</span></p>
        <label style="display:block;text-align:left;font-size:0.7rem;color:#c5a059;margin-bottom:6px;">Motivo sospensione *</label>`,
        input: 'text',
        inputPlaceholder: 'es. Violazione regole, Assenza prolungata...',
        inputAttributes: { maxlength: 200 },
        showCancelButton: true,
        confirmButtonText: 'Sospendi',
        cancelButtonText: 'Annulla',
        confirmButtonColor: '#8b0000',
        background: '#111',
        color: '#fff',
        inputValidator: (value) => {
            if (!value || !value.trim()) return 'Il motivo è obbligatorio.';
            return null;
        }
    });
    if (!res.isConfirmed) return;
    const motivo = (res.value || '').trim();
    try {
        await setDoc(doc(db, "membri", id), {
            sospeso: true,
            motivoSospensione: motivo,
            dataSospensione: Date.now(),
            sospesoDa: currentUser.nome || 'GESTORE',
            archiviato: false
        }, { merge: true });
        logSystemEvent('membro', 'sospendi', `Sospeso membro ${id}. Motivo: ${motivo}`, { id, motivo });
        vampireToast(`${id} sospeso. Motivo: ${motivo}`, "success");
    } catch (err) {
        console.error(err);
        vampireToast("Errore durante la sospensione.", "error");
    }
};

window.riattivaVampiro = async (id) => {
    if (!hasAdminPerm('membri')) {
        return vampireToast("Non hai il permesso Gestione Membri.", "error");
    }
    const res = await Swal.fire({
        title: 'Riattivare accesso?',
        text: 'Il membro potrà di nuovo accedere con codice e password.',
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#2ecc71',
        background: '#111',
        color: '#fff',
        confirmButtonText: 'Riattiva',
        cancelButtonText: 'Annulla'
    });
    if (!res.isConfirmed) return;
    try {
        await setDoc(doc(db, "membri", id), {
            sospeso: false,
            motivoSospensione: '',
            dataSospensione: null,
            riattivatoAt: Date.now(),
            archiviato: false
        }, { merge: true });
        logSystemEvent('membro', 'riattiva', `Riattivato membro ${id}`, { id });
        vampireToast(`${id} riattivato: accesso di nuovo consentito.`, "success");
    } catch (err) {
        console.error(err);
        vampireToast("Errore durante la riattivazione.", "error");
    }
};

window.eliminaVampiro = async (id) => {
    const res = await Swal.fire({
        title: 'Eliminare definitivamente?',
        html: 'Questa azione <strong>cancella il documento membro</strong>.<br>Lo storico vendite resta, ma il profilo sparisce del tutto.<br><span style="color:#aaa;font-size:0.75rem;">Preferisci sospendere l\'accesso se non vuoi eliminare il profilo.</span>',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#8b0000',
        background: '#111',
        color: '#fff',
        confirmButtonText: 'Elimina per sempre'
    });
    if(res.isConfirmed) {
        await deleteDoc(doc(db, "membri", id));
        logSystemEvent('membro', 'elimina', `Eliminato definitivamente membro ${id}`, { id });
        vampireToast("Vampiro rimosso dal registro.", "success");
    }
};

// Carica dati membro nei campi per modifica
window.caricaMembroPerEdit = (nome) => {
    const v = listaVampiri.find(x => x.nome === nome);
    if(!v) return;
    document.getElementById('admin-vamp-nome').value = v.nome || "";
    document.getElementById('admin-vamp-grado').value = v.grado || "";
    if(document.getElementById('admin-vamp-codice')) document.getElementById('admin-vamp-codice').value = v.codice || "";
    if(document.getElementById('admin-vamp-password')) document.getElementById('admin-vamp-password').value = v.password || "";
    document.querySelectorAll('.perm-check').forEach(cb => {
        cb.checked = Array.isArray(v.permessi) ? v.permessi.includes(cb.value) : false;
    });
    vampireToast("Dati caricati. Modifica e premi Aggiungi/Aggiorna.", "info");
};

function contaGradiMembri() {
    // Contatori su tutti i membri (sospesi inclusi)
    // Unificati M/F: Ekaton | Mentori | Adulti | Neonati
    const keys = [
        { label: 'Ekaton', match: ['ekaton', 'originario', 'originaria'] },
        { label: 'Mentori', match: ['mentore', 'mentori'] },
        { label: 'Adulti', match: ['adulto', 'adulta', 'adulti'] },
        { label: 'Neonati', match: ['neonato', 'neonata', 'neonati'] }
    ];
    const counts = {};
    keys.forEach(k => { counts[k.label] = 0; });
    membriAttivi().forEach(v => {
        const g = (v.grado || '').toLowerCase().trim();
        for (const k of keys) {
            if (k.match.includes(g)) {
                counts[k.label]++;
                break; // un solo bucket per membro
            }
        }
    });
    return keys.map(k => ({ label: k.label, count: counts[k.label] }));
}

function htmlContatoriRanghi(compact) {
    const rows = contaGradiMembri();
    const total = membriAttivi().length;
    const chips = rows.map(r =>
        `<span class="rango-count-chip"><span class="rango-count-label">${r.label}</span><strong class="rango-count-num">${r.count}</strong></span>`
    ).join('');
    const tot = `<span class="rango-count-chip rango-count-tot"><span class="rango-count-label">Totale</span><strong class="rango-count-num">${total}</strong></span>`;
    return `<div class="rango-count-wrap${compact ? ' is-compact' : ''}">${chips}${tot}</div>`;
}

function renderVampiriLists() {
    // Ordine gradi: Originario → Originaria → Mentore → Adulto → Adulta → Neonato → Neonata
    // Ordine gradi: Ekaton → Mentore → Adulto/a → Neonato/a (M/F stesso livello)
    const ordineGradi = {
        'ekaton': 1,
        'originario': 1,
        'originaria': 1,
        'mentore': 2,
        'mentori': 2,
        'adulto': 3,
        'adulta': 3,
        'adulti': 3,
        'neonato': 4,
        'neonata': 4,
        'neonati': 4,
        'anziano': 5, // legacy
        'anziana': 5
    };
    listaVampiri.sort((a, b) => {
        const ga = ordineGradi[(a.grado || "").toLowerCase().trim()] || 99;
        const gb = ordineGradi[(b.grado || "").toLowerCase().trim()] || 99;
        if (ga !== gb) return ga - gb;
        return (a.nome || "").localeCompare(b.nome || "", 'it');
    });

    const attivi = membriAttivi();

    // Contatori ranghi (Generale + Admin Membri) — tutti i membri
    const counterGen = document.getElementById('membri-ranghi-counter');
    if (counterGen) counterGen.innerHTML = htmlContatoriRanghi(true);
    const counterAdm = document.getElementById('admin-membri-ranghi-counter');
    if (counterAdm) counterAdm.innerHTML = htmlContatoriRanghi(false);

    // Lista Generale: tutti i membri; sospesi in rosso
    const listaDinamica = document.getElementById('lista-membri-dinamica');
    if (listaDinamica) {
        listaDinamica.innerHTML = attivi.length
            ? attivi.map(v => {
                const isSos = v.sospeso === true;
                const col = isSos ? 'var(--withdraw-red)' : 'var(--text-light)';
                const badge = isSos ? ' <span style="font-size:0.65rem;text-transform:uppercase;letter-spacing:0.5px;">(sospeso)</span>' : '';
                return `<p style="font-size: 0.8rem; color: ${col}; margin-bottom: 5px;"><strong>${v.nome}:</strong> ${v.grado || ''}${badge}</p>`;
            }).join('')
            : '<p style="font-size:0.75rem; opacity:0.5;">Nessun membro.</p>';
    }

    // Select: tutti i membri (sospesi restano selezionabili)
    const selects = document.querySelectorAll('.vampiro-select-list');
    const options = `<option value="">-- Seleziona Vampiro --</option>` + attivi.map(v => {
        const label = v.sospeso === true ? `${v.nome} (sospeso)` : v.nome;
        return `<option value="${v.nome}">${label}</option>`;
    }).join('');
    selects.forEach(s => { 
        const currentVal = s.value; 
        s.innerHTML = options; 
        s.value = currentVal; 
        if (currentUser && !currentUser.isAdmin && ['vamp-nome','mat-vamp-nome','saldo-nome','inv-user-name','calc-search-name'].includes(s.id)) {
            s.value = currentUser.nome;
        }
    });

    window.renderAdminMembriTable();
    if (typeof window.popolaSelectPermessiGestione === 'function') window.popolaSelectPermessiGestione();
    if (typeof window.renderAdminPermessiGestioneTable === 'function') window.renderAdminPermessiGestioneTable();
    
    if (currentUser) applyPermissions();
}

/** Tabella admin membri (tutti, con stato sospensione) */
window.renderAdminMembriTable = function() {
    const tbody = document.getElementById('admin-vampiri-body');
    if (!tbody) return;
    const search = (document.getElementById('search-admin-membri')?.value || '').toLowerCase().trim();
    let list = membriAttivi();
    if (search) {
        list = list.filter(v =>
            (v.nome || '').toLowerCase().includes(search) ||
            (v.grado || '').toLowerCase().includes(search) ||
            String(v.codice || '').toLowerCase().includes(search) ||
            (v.motivoSospensione || '').toLowerCase().includes(search)
        );
    }
    tbody.innerHTML = list.map(v => {
        const isSos = v.sospeso === true;
        const cod = v.codice ? v.codice : '<span style="opacity:0.4">—</span>';
        const perms = Array.isArray(v.permessi) ? v.permessi.length + ' sez.' : '0';
        const safeName = String(v.nome || '').replace(/'/g, "\'");
        const motivoSafe = String(v.motivoSospensione || '').replace(/</g,'&lt;');
        const nomeCell = isSos
            ? `<strong style="color:var(--withdraw-red);">${v.nome}</strong><br><span style="font-size:0.6rem;color:var(--withdraw-red);">Sospeso${motivoSafe ? ': ' + motivoSafe : ''}</span>`
            : v.nome;
        const btnSos = isSos
            ? `<button class="btn-delete" style="border-color:var(--success-green);color:var(--success-green);margin-right:4px;" onclick="window.riattivaVampiro('${safeName}')">Riattiva</button>`
            : `<button class="btn-delete" style="border-color:#e67e22;color:#e67e22;margin-right:4px;" onclick="window.sospendiVampiro('${safeName}')">Sospendi</button>`;
        return `<tr style="${isSos ? 'background:rgba(231,76,60,0.06);' : ''}">
            <td style="text-align:left;">${nomeCell}</td>
            <td>${v.grado || ''}</td>
            <td style="font-family:monospace;">${cod}</td>
            <td style="font-size:0.65rem;">${perms}</td>
            <td style="white-space:nowrap;">
                <button class="btn-delete" style="border-color:var(--gold-accent);color:var(--gold-accent);margin-right:4px;" onclick="window.caricaMembroPerEdit('${safeName}')">Modifica</button>
                ${btnSos}
                <button class="btn-delete" onclick="window.eliminaVampiro('${safeName}')">Elimina</button>
            </td>
        </tr>`;
    }).join('') || '<tr><td colspan="5" style="opacity:0.5;text-align:center;">Nessun membro trovato.</td></tr>';
};

// --- POPOLA FILTRO MATERIALI ---
function popolaFiltroMateriali() {
    const matTipi = [...new Set(venditeMateriali.map(m => (m.materiale || "").trim()))].filter(Boolean).sort();
    const filterEl = document.getElementById('filter-tipo-mat');
    const adminFilterEl = document.getElementById('filter-admin-tipo-mat');

    const optionsHTML = `<option value="">Tutti i Materiali</option>` + matTipi.map(t => `<option value="${t}">${t}</option>`).join('');

    if(filterEl) {
        const currentVal = filterEl.value;
        filterEl.innerHTML = optionsHTML;
        filterEl.value = currentVal;
    }
    if(adminFilterEl) {
        const currentVal = adminFilterEl.value;
        adminFilterEl.innerHTML = optionsHTML;
        adminFilterEl.value = currentVal;
    }
}

// --- LOGICA VENDITA MATERIALI ---
window.toggleTipoVendita = () => {
    const tipo = document.getElementById('mat-tipo-vendita').value;
    const prUnEl = document.getElementById('mat-prezzo-un');
    const accordoContainer = document.getElementById('mat-accordo-container');
    const accordoCheckbox = document.getElementById('mat-accordo');
    
    if (prUnEl) {
        if (tipo === 'mercante-75') {
            prUnEl.value = 75;
            prUnEl.readOnly = true;
            prUnEl.style.opacity = "0.7";
            if (accordoContainer) accordoContainer.style.display = "block";
        } else if (tipo === 'mercante-100') {
            prUnEl.value = 100;
            prUnEl.readOnly = true;
            prUnEl.style.opacity = "0.7";
            if (accordoContainer) accordoContainer.style.display = "block";
        } else {
            prUnEl.value = "";
            prUnEl.readOnly = false;
            prUnEl.style.opacity = "1";
            prUnEl.placeholder = "Inserisci Prezzo";
            if (accordoContainer) accordoContainer.style.display = "none";
            if (accordoCheckbox) accordoCheckbox.checked = false;
        }
    }
    window.updateMatTot();
};

window.updateMatTot = () => {
    const qtyEl = document.getElementById('mat-qty');
    const unEl = document.getElementById('mat-prezzo-un'); 
    const totEl = document.getElementById('mat-prezzo-tot');
    
    if(qtyEl && unEl && totEl) {
        const qty = parseFloat(qtyEl.value) || 0;
        const un = parseFloat(unEl.value) || 0;
        totEl.value = (qty * un).toFixed(0);
    }
};

window.registraVenditaMateriali = async () => {
    try {
        const nomeEl = document.getElementById('mat-vamp-nome');
        const tipoSel = document.getElementById('mat-tipo-select');
        const acqEl = document.getElementById('mat-acquirente');
        const qtyEl = document.getElementById('mat-qty');
        const fotoEl = document.getElementById('mat-foto');

        let nome = (currentUser && !currentUser.isAdmin) ? currentUser.nome : (nomeEl ? nomeEl.value : "");
        const tipoId = tipoSel ? tipoSel.value : "";
        const acquirente = acqEl ? acqEl.value.trim() : "N/D";
        const qty = parseFloat(qtyEl?.value);

        if (!nome || !tipoId || isNaN(qty) || qty <= 0) {
            return vampireToast("Seleziona materiale, vampiro e quantità validi.", "error");
        }

        const cfg = tipiMateriale.find(t => t.id === tipoId);
        if (!cfg) return vampireToast("Materiale non trovato in configurazione.", "error");

        const prezzoUn = Number(cfg.prezzoUnitario) || 0;
        const percPro = Number(cfg.percPropria) ?? 40;
        const percDin = Number(cfg.percDinastia) ?? (100 - percPro);
        const percEkaton = Number(cfg.percEkaton) ?? 50;
        if (prezzoUn <= 0) return vampireToast("Prezzo unitario non valido per questo materiale.", "error");

        const prezzoTot = qty * prezzoUn;
        const vPro = (prezzoTot * percPro) / 100;
        const vDin = (prezzoTot * percDin) / 100;
        const ekaton = vDin * (percEkaton / 100);
        const foto = (fotoEl && fotoEl.value) ? fotoEl.value : "#";

        const now = new Date();
        const matEntry = {
            vampiro: nome,
            materiale: cfg.nome,
            tipoMaterialeId: tipoId,
            acquirente: acquirente || "N/D",
            qty,
            prezzoUn,
            prezzoTot,
            pPro: percPro,
            pDin: percDin,
            pEkaton: percEkaton,
            vPro,
            vDin,
            ekaton,
            timestamp: Date.now(),
            dataStr: now.toLocaleDateString('it-IT'),
            ora: now.toLocaleTimeString('it-IT'),
            settimanaEtichetta: getWeekYearKey(now)
        };
        await addDoc(collection(db, "vendite_materiali"), matEntry);
        logSystemEvent('materiali', 'registra', `Vendita materiali: ${matEntry.vampiro || '?'} · ${matEntry.materiale || '?'} x${matEntry.qty || 0} → ${matEntry.acquirente || '?'}`, { vampiro: matEntry.vampiro, materiale: matEntry.materiale, qty: matEntry.qty, acquirente: matEntry.acquirente });
        forceRefreshAfterWrite('materiali');

        vampireToast("Vendita registrata correttamente.", "success");
        if (qtyEl) qtyEl.value = "";
        if (fotoEl) fotoEl.value = "";
        if (tipoSel) tipoSel.value = "";
        if (acqEl) acqEl.value = "";
        window.updateMatPreview();
    } catch (error) {
        console.error("Errore salvataggio materiali: ", error);
        vampireToast("Errore durante la registrazione.", "error");
    }
};

window.renderMateriali = () => {
    const tbody = document.getElementById('lista-materiali');
    if(!tbody) return;
    const searchInput = document.getElementById('search-materiali');
    const search = searchInput ? searchInput.value.toLowerCase() : "";
    const tipoFilterElement = document.getElementById('filter-tipo-mat');
    const tipoFilter = tipoFilterElement ? tipoFilterElement.value.toLowerCase() : "";
    const week = getWeekYearKey(new Date());

    tbody.innerHTML = venditeMateriali
        .filter(m => m.settimanaEtichetta === week && 
            (tipoFilter === "" || (m.materiale || "").toLowerCase() === tipoFilter) &&
            ((m.vampiro || "").toLowerCase().includes(search) || 
            (m.materiale || "").toLowerCase().includes(search) || 
            (m.acquirente || "").toLowerCase().includes(search)
        ))
        .sort((a,b) => b.timestamp - a.timestamp)
        .map(m => `
        <tr>
            <td style="font-size:0.7rem;"><span class="ts-label">${m.dataStr || ''}</span> <br> <strong>${m.ora || ''}</strong></td>
            <td>${m.vampiro || ''}</td>
            <td style="color:var(--gold-accent)">${m.materiale || ''}</td>
            <td>${m.acquirente || ''}</td>
            <td>${fmt(m.qty)}</td>
            <td style="color:var(--gold-dim)">${fmt(m.prezzoTot)} cr</td>
            <td style="color:var(--withdraw-red)">${fmt(m.vDin)} cr</td>
            <td style="color:var(--success-green)">${fmt(m.vPro)} cr</td>
            <td><a href="${m.foto}" target="_blank" class="photo-link">FOTO</a></td>
        </tr>`).join('');
    
    aggiornaStatsMateriali();
};

function aggiornaStatsMateriali() {
    const week = getWeekYearKey(new Date());
    const curr = venditeMateriali.filter(m => m.settimanaEtichetta === week);
    if(document.getElementById('mat-tot-qty-sett')) document.getElementById('mat-tot-qty-sett').innerText = fmt(curr.reduce((a,b) => a + (b.qty || 0), 0));
    if(document.getElementById('mat-tot-crediti-sett')) document.getElementById('mat-tot-crediti-sett').innerText = fmt(curr.reduce((a,b) => a + (b.prezzoTot || 0), 0)) + " cr";
    if(document.getElementById('mat-tot-dinastia-sett')) document.getElementById('mat-tot-dinastia-sett').innerText = fmt(curr.reduce((a,b) => a + (b.vDin || 0), 0)) + " cr";
    if(document.getElementById('mat-tot-count-sett')) document.getElementById('mat-tot-count-sett').innerText = curr.length;
}

// --- LOGICA ADMIN MATERIALI ---
window.renderAdminMateriali = () => {
    let container = document.getElementById('admin-materiali-container');
    if(!container) {
        const adminContent = document.getElementById('admin-content');
        if(adminContent) {
            const wrapper = document.createElement('div');
            wrapper.className = "vamp-card";
            wrapper.innerHTML = `
                <h2>Archivio Database Vendita Materiali</h2>
                <div class="search-box" style="display:flex; gap:10px; margin-bottom: 10px;">
                    <input type="text" id="search-admin-mat" placeholder="Filtra vampiro, materiale o acquirente..." onkeyup="window.renderAdminMateriali()">
                    <select id="filter-admin-tipo-mat" onchange="window.renderAdminMateriali()" style="padding: 10px; background: #1a1a1a; color: #e0e0e0; border: 1px solid #333; border-radius: 5px;">
                        <option value="">Tutti i Materiali</option>
                    </select>
                </div>
                <div class="scroll-container" id="admin-materiali-container" style="max-height: 400px;"></div>
            `;
            const logOutBtn = adminContent.querySelector('button[onclick="window.logoutAdmin()"]');
            if(logOutBtn) {
                adminContent.insertBefore(wrapper, logOutBtn);
            } else {
                adminContent.appendChild(wrapper);
            }
            container = document.getElementById('admin-materiali-container');
            popolaFiltroMateriali();
        } else {
            return;
        }
    }

    const searchInput = document.getElementById('search-admin-mat');
    const searchTerm = searchInput ? searchInput.value.toLowerCase() : "";
    const filterInput = document.getElementById('filter-admin-tipo-mat');
    const filterTerm = filterInput ? filterInput.value.toLowerCase() : "";

    const weekSelMat = document.getElementById('archivio-week-select')?.value || '';
    const gruppi = {};
    (venditeMateriali || []).forEach(m => {
        if (weekSelMat && m.settimanaEtichetta !== weekSelMat) return;
        if(!gruppi[m.settimanaEtichetta]) gruppi[m.settimanaEtichetta] = [];
        gruppi[m.settimanaEtichetta].push(m);
    });

    container.innerHTML = Object.keys(gruppi).sort().reverse().map(key => {
        const filtered = gruppi[key].filter(m => 
            (filterTerm === "" || (m.materiale || "").toLowerCase() === filterTerm) &&
            ((m.vampiro || "").toLowerCase().includes(searchTerm) || 
            (m.materiale || "").toLowerCase().includes(searchTerm) ||
            (m.acquirente || "").toLowerCase().includes(searchTerm))
        ).sort((a,b) => b.timestamp - a.timestamp);

        if(filtered.length === 0 && (searchTerm !== "" || filterTerm !== "")) return "";
        if(filtered.length === 0) return "";
        const range = getWeekRangeLabel(key);
        const weekTotalQty = filtered.reduce((sum, m) => sum + (m.qty || 0), 0);
        const weekTotalCr = filtered.reduce((sum, m) => sum + (m.prezzoTot || 0), 0);
        const weekTotalDin = filtered.reduce((sum, m) => sum + (m.vDin || 0), 0);
        
        return `<div class="week-archive-block">
            <div class="week-title">${range} | Transazioni: ${filtered.length} | Qty: <span style="color: var(--gold-dim);">${fmt(weekTotalQty)}x</span> | Valore Tot: <span style="color: var(--gold-dim);">${fmt(weekTotalCr)} cr</span> | Quota Dinastia: <span style="color: var(--gold-dim);">${fmt(weekTotalDin)} cr</span></div>
            <div style="overflow-x:auto;">
                <table>
                    <thead><tr><th>Data/Ora</th><th>Vampiro</th><th>Materiale</th><th>Acquirente</th><th>Qty</th><th>Totale (cr)</th><th>Propria (cr)</th><th>Dinastia (cr)</th><th>Azione</th></tr></thead>
                    <tbody>${filtered.map(m => `
                        <tr>
                            <td style="font-size:0.65rem"><span class="ts-label">${m.dataStr || ''}</span><br><strong>${m.ora || ''}</strong></td>
                            <td>${m.vampiro || ''}</td>
                            <td style="color: var(--gold-accent);">${m.materiale || ''}</td>
                            <td>${m.acquirente || ''}</td>
                            <td style="color: var(--gold-dim);">${fmt(m.qty)}</td>
                            <td>${fmt(m.prezzoTot)}</td>
                            <td>${fmt(m.vPro)} cr</td>
                            <td>${fmt(m.vDin)} cr</td>
                            <td><button class="btn-delete" onclick="window.adminDeleteMat('${m.id}')">X</button></td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>
        </div>`;
    }).join('');
};

window.adminDeleteMat = async (id) => {
    const res = await Swal.fire({ title: 'Elimina transazione materiale?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#8b0000', background: '#111' });
    if(res.isConfirmed) { 
        await deleteDoc(doc(db, "vendite_materiali", id));
        logSystemEvent('materiali', 'elimina', `Eliminata vendita materiali id ${id}`, { id }); 
        vampireToast("Record rimosso con successo.", "success"); 
    }
};

// --- CLASSIFICHE VENDITE / MATERIALI (separate) ---
function renderClassifiche() {
    const currentWeek = getWeekYearKey(new Date());
    const buildRank = (rows, nameKey, qtyKey, creditKey) => {
        const map = {};
        rows.forEach(r => {
            if (r.settimanaEtichetta !== currentWeek) return;
            const nome = r[nameKey];
            if (!nome) return;
            if (!map[nome]) map[nome] = { qty: 0, crediti: 0 };
            map[nome].qty += (r[qtyKey] || 0);
            map[nome].crediti += (r[creditKey] || 0);
        });
        return Object.entries(map).sort((a,b)=>b[1].qty-a[1].qty||b[1].crediti-a[1].crediti).slice(0,3);
    };
    const rankVendSett = buildRank(vendite, 'nome', 'qty', 'dinastia');
    const rankMatSett = buildRank(venditeMateriali, 'vampiro', 'qty', 'vDin');
    const generateHtml = (arr, unitLabel) => {
        if (!arr.length) return "<p style='font-size:0.7rem; opacity:0.3; text-align:center;'>Nessun dato</p>";
        return arr.map((item, index) => `
            <div class="rank-item ${index < 3 ? 'rank-top' + (index + 1) : ''}">
                <span style="font-weight:600;">${index + 1}. ${item[0]}</span>
                <div style="text-align: right; line-height: 1.2;">
                    <strong style="display:block; color: var(--gold-dim); font-size:0.75rem;">${fmt(item[1].qty)}x ${unitLabel}</strong>
                    <small style="color:var(--gold-accent); font-size:0.6rem; text-transform:uppercase;">${fmt(item[1].crediti)} cr dinastia</small>
                </div>
            </div>`).join('');
    };
    const elSett = document.getElementById('top-settimana-box');
    const elMatSett = document.getElementById('top-mat-settimana-box');
    if (elSett) elSett.innerHTML = generateHtml(rankVendSett, 'qty');
    if (elMatSett) elMatSett.innerHTML = generateHtml(rankMatSett, 'mat');
}

window.movimentoSaldo = async () => {
    let nome = (currentUser && !currentUser.isAdmin) ? currentUser.nome : document.getElementById('saldo-nome').value;
    const importo = parseInt(document.getElementById('saldo-importo').value);
    const azione = document.getElementById('saldo-azione').value;
    const motivo = document.getElementById('saldo-motivo').value;
    if(!nome || !importo || !motivo) return vampireToast("Compila tutti i campi richiesti.", "error");
    const nuovoSaldo = azione === "preleva" ? saldoGlobale - importo : saldoGlobale + importo;
    if(nuovoSaldo < 0) return vampireToast("Saldo insufficiente!", "error");
    const now = new Date();
    await setDoc(doc(db, "config", "saldo"), { valore: nuovoSaldo }, { merge: true });
    const logEntry = {
        utente: nome, tipo: azione, qty: importo, motivo, timestamp: Date.now(),
        dataStr: now.toLocaleDateString('it-IT'), ora: now.toLocaleTimeString('it-IT')
    };
    await addDoc(collection(db, "saldo_logs"), logEntry);
    logSystemEvent('saldo', logEntry.azione || 'movimento', `Saldo ${logEntry.azione || ''}: ${logEntry.nome || '?'} · ${logEntry.importo || 0} cr · ${logEntry.motivo || ''}`, { nome: logEntry.nome, importo: logEntry.importo, azione: logEntry.azione });
    // Aggiornamento ottimistico: UI subito, senza attendere idle del listener
    saldoGlobale = nuovoSaldo;
    saldoLogs = [logEntry, ...saldoLogs].slice(0, 80);
    forceRefreshAfterWrite('saldo');
    vampireToast(`Operazione di ${azione} completata.`, "success");
    document.getElementById('saldo-importo').value = ""; document.getElementById('saldo-motivo').value = "";
};

window.renderSaldoLogs = () => {
    const box = document.getElementById('saldo-logs-box');
    if(!box) return;
    const searchTerm = document.getElementById('search-saldo-logs').value.toLowerCase();
    box.innerHTML = saldoLogs.filter(l => (l.utente || "").toLowerCase().includes(searchTerm) || (l.motivo || "").toLowerCase().includes(searchTerm))
        .map(l => `
        <div class="log-entry">
            <div class="log-main">
                <span><strong>${l.utente || ''}</strong> <span style="color: ${l.tipo === 'preleva' ? 'var(--withdraw-red)' : 'var(--success-green)'}">${l.tipo || ''}</span> <span style="color: var(--gold-dim);">${fmt(l.qty)}</span> cr</span>
                <span class="log-time">${l.dataStr || ''} ${l.ora || ''}</span>
            </div>
            <div class="log-causale">Motivo: ${l.motivo || ''}</div>
        </div>`).join('');
};

function popolaFiltroSettimane() {
    const filter = document.getElementById('calc-period-filter');
    if (!filter) return;
    const valCorrente = filter.value;
    const currentWeek = getWeekYearKey(new Date());
    // Unione leggera senza allocare array intermedi enormi
    const set = new Set();
    for (let i = 0; i < vendite.length; i++) {
        const k = vendite[i].settimanaEtichetta;
        if (k) set.add(k);
    }
    for (let i = 0; i < venditeMateriali.length; i++) {
        const k = venditeMateriali[i].settimanaEtichetta;
        if (k) set.add(k);
    }
    // Settimane passate (esclude la corrente: già coperta da "Settimana Corrente")
    const settimanePassate = [...set].filter(s => s !== currentWeek).sort().reverse();

    let options = `<option value="current">Settimana Corrente</option>`;
    settimanePassate.forEach(s => {
        const range = getWeekRangeLabel(s);
        options += `<option value="${s}">${range} (${s})</option>`;
    });
    options += `<option value="all">Totale Storico</option>`;
    filter.innerHTML = options;
    // Ripristina selezione se ancora valida, altrimenti corrente
    if (valCorrente && [...filter.options].some(o => o.value === valCorrente)) {
        filter.value = valCorrente;
    } else {
        filter.value = 'current';
    }
}

window.eseguiCalcolo = () => {
    let nomeInput = (currentUser && !currentUser.isAdmin) ? currentUser.nome : document.getElementById('calc-search-name').value;
    const periodo = document.getElementById('calc-period-filter').value;
    if (!nomeInput) return vampireToast("Seleziona un vampiro per il calcolo.", "error");

    const resBox = document.getElementById('calc-result');
    const weekKey = (periodo === 'current') ? getWeekYearKey(new Date()) : (periodo === 'all' ? null : periodo);

    // Un solo passaggio: filtra + aggrega (niente reduce multipli)
    const filtratiCarbonio = [];
    let totQtyVendite = 0, totCrVendite = 0, totProVendite = 0, totDinVendite = 0, totEkVendite = 0;
    for (let i = 0; i < vendite.length; i++) {
        const v = vendite[i];
        if (v.nome !== nomeInput) continue;
        if (weekKey && v.settimanaEtichetta !== weekKey) continue;
        filtratiCarbonio.push(v);
        const tot = v.totale || 0;
        totQtyVendite += v.qty || 0;
        totCrVendite += tot;
        totProVendite += (v.propria != null ? v.propria : tot * 0.4);
        totDinVendite += (v.dinastia != null ? v.dinastia : tot * 0.6);
        totEkVendite += calcEkatonFromRecord(v);
    }

    const filtratiMateriali = [];
    let totQtyMat = 0, totCrMat = 0, totVampMat = 0, totDinMat = 0, totEkMat = 0;
    for (let i = 0; i < venditeMateriali.length; i++) {
        const m = venditeMateriali[i];
        if (m.vampiro !== nomeInput) continue;
        if (weekKey && m.settimanaEtichetta !== weekKey) continue;
        filtratiMateriali.push(m);
        totQtyMat += m.qty || 0;
        totCrMat += m.prezzoTot || 0;
        totVampMat += m.vPro || 0;
        totDinMat += m.vDin || 0;
        totEkMat += calcEkatonFromRecord({
            ekaton: m.ekaton,
            dinastia: m.vDin,
            vDin: m.vDin,
            pEkaton: m.pEkaton
        });
    }

    if (filtratiCarbonio.length === 0 && filtratiMateriali.length === 0) {
        resBox.style.display = "none";
        return vampireToast("Nessun record trovato per i parametri scelti.", "error");
    }

    document.getElementById('calc-res-nome').innerText = nomeInput.toUpperCase();

    const elQty = document.getElementById('calc-res-qty');
    if (elQty) elQty.innerText = fmt(totQtyVendite);
    const elTot = document.getElementById('calc-res-tot');
    if (elTot) elTot.innerText = fmt(totCrVendite) + " cr";
    const elPro = document.getElementById('calc-res-vamp');
    if (elPro) elPro.innerText = fmt(totProVendite) + " cr";
    const elDin = document.getElementById('calc-res-din');
    if (elDin) elDin.innerText = fmt(totDinVendite) + " cr";
    const elEk = document.getElementById('calc-res-ekaton');
    if (elEk) elEk.innerText = fmt(totEkVendite) + " cr";
    const elCnt = document.getElementById('calc-res-count');
    if (elCnt) elCnt.innerText = filtratiCarbonio.length;

    const elMQty = document.getElementById('calc-res-mat-qty');
    if (elMQty) elMQty.innerText = fmt(totQtyMat);
    const elMTot = document.getElementById('calc-res-mat-tot');
    if (elMTot) elMTot.innerText = fmt(totCrMat) + " cr";
    const elMPro = document.getElementById('calc-res-mat-vamp');
    if (elMPro) elMPro.innerText = fmt(totVampMat) + " cr";
    const elMDin = document.getElementById('calc-res-mat-din');
    if (elMDin) elMDin.innerText = fmt(totDinMat) + " cr";
    const elMEk = document.getElementById('calc-res-mat-ekaton');
    if (elMEk) elMEk.innerText = fmt(totEkMat) + " cr";
    const elMCnt = document.getElementById('calc-res-mat-count');
    if (elMCnt) elMCnt.innerText = filtratiMateriali.length;

    filtratiCarbonio.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    filtratiMateriali.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    let listaHtmlVendite = '';
    for (let i = 0; i < filtratiCarbonio.length; i++) {
        const v = filtratiCarbonio[i];
        listaHtmlVendite += `<div style="border-bottom: 1px solid #222; padding: 5px 0; display: flex; justify-content: space-between;">
            <span>[VEND] ${v.materiale || '—'} · ${v.dataStr || ''} (${v.ora || ''})</span>
            <span style="color: var(--gold-dim);">${v.qty || 0}x - ${fmt(v.totale || 0)} cr</span>
        </div>`;
    }
    let listaHtmlMateriali = '';
    for (let i = 0; i < filtratiMateriali.length; i++) {
        const m = filtratiMateriali[i];
        listaHtmlMateriali += `<div style="border-bottom: 1px solid #222; padding: 5px 0; display: flex; justify-content: space-between;">
            <span>[MAT] ${m.materiale || 'Materiale'} · ${m.dataStr || ''} (${m.ora || ''})</span>
            <span style="color: var(--gold-dim);">${m.qty || 0}x - ${fmt(m.prezzoTot || 0)} cr</span>
        </div>`;
    }

    document.getElementById('calc-res-lista-dettaglio').innerHTML =
        (listaHtmlVendite ? "<strong>Dettaglio Vendite:</strong>" + listaHtmlVendite : "") +
        (listaHtmlMateriali ? "<br><strong>Dettaglio Vendita Materiali:</strong>" + listaHtmlMateriali : "");

    resBox.style.display = "block";
    vampireToast("Resoconto generato con successo.", "success");
};

window.registraVendita = async () => {
    let nome = (currentUser && !currentUser.isAdmin) ? currentUser.nome : document.getElementById('vamp-nome').value;
    const tipoId = document.getElementById('vamp-tipo-mat')?.value || "";
    const qty = parseInt(document.getElementById('vamp-qty').value);
    const foto = document.getElementById('vamp-foto').value || "#";
    const note = document.getElementById('vamp-note').value || "";
    if(!nome || !qty || qty <= 0) return vampireToast("Dati incompleti per la registrazione.", "error");

    let cfg = tipiMateriale.find(t => t.id === tipoId);
    // Fallback legacy Carbonio se nessun tipo selezionato / non configurato
    if (!cfg) {
        cfg = {
            nome: "Carbonio",
            prezzoUnitario: VALORE_UNITARIO,
            percPropria: 40,
            percDinastia: 60,
            percEkaton: 50
        };
    }

    const prezzoUn = Number(cfg.prezzoUnitario) || VALORE_UNITARIO;
    const percPro = Number(cfg.percPropria) ?? 40;
    const percDin = Number(cfg.percDinastia) ?? (100 - percPro);
    const percEkaton = Number(cfg.percEkaton) ?? 50;
    const tot = qty * prezzoUn;
    const propria = tot * (percPro / 100);
    const dinastia = tot * (percDin / 100);
    const ekaton = dinastia * (percEkaton / 100);

    const now = new Date();
    const vendEntry = {
        nome,
        materiale: cfg.nome || "Carbonio",
        tipoMaterialeId: tipoId || null,
        qty,
        prezzoUn,
        foto,
        note,
        totale: tot,
        propria,
        dinastia,
        ekaton,
        pPro: percPro,
        pDin: percDin,
        pEkaton: percEkaton,
        timestamp: Date.now(),
        dataStr: now.toLocaleDateString('it-IT'),
        ora: now.toLocaleTimeString('it-IT'),
        settimanaEtichetta: getWeekYearKey(now)
    };
    await addDoc(collection(db, "vendite"), vendEntry);
    logSystemEvent('vendita', 'registra', `Vendita: ${vendEntry.vampiro || '?'} · ${vendEntry.materiale || vendEntry.tipo || '?'} x${vendEntry.qty || 0}`, { vampiro: vendEntry.vampiro, qty: vendEntry.qty, totale: vendEntry.totale });
    forceRefreshAfterWrite('vendite');
    vampireToast("Vendita sigillata nel registro.", "success");
    document.getElementById('vamp-qty').value = "";
    document.getElementById('vamp-note').value = "";
    document.getElementById('vamp-foto').value = "";
    window.updateVenditaPreview();
};

window.renderVendite = () => {
    const lista = document.getElementById('lista-vendite');
    if(!lista) return;
    const searchTerm = document.getElementById('search-vendite').value.toLowerCase();
    const key = getWeekYearKey(new Date());
    lista.innerHTML = vendite.filter(v => v.settimanaEtichetta === key && (
            (v.nome || "").toLowerCase().includes(searchTerm) ||
            (v.materiale || "").toLowerCase().includes(searchTerm) ||
            (v.note && v.note.toLowerCase().includes(searchTerm))
        ))
        .sort((a,b) => b.timestamp - a.timestamp)
        .map(v => `
        <tr>
            <td><span class="ts-label">${v.dataStr || ''}</span><strong>${v.ora || ''}</strong></td>
            <td>${v.nome || ''}</td>
            <td style="color:var(--gold-accent)">${v.materiale || 'Carbonio'}</td>
            <td style="color: var(--gold-dim);">${fmt(v.qty)}x</td>
            <td style="color: var(--gold-dim);">${fmt(v.totale)}</td>
            <td style="color:var(--success-green)">${fmt(v.propria)}</td>
            <td style="color:var(--gold-accent)">${fmt(v.dinastia)}</td>
            <td style="font-size: 0.7rem; opacity: 0.6;">${v.note || '-'}</td>
            <td><a href="${v.foto}" target="_blank" class="photo-link">PROVA</a></td>
        </tr>`).join('');
};

window.renderInventario = () => {
    const searchTerm = document.getElementById('search-inventario').value.toLowerCase();
    [1, 2, 3].forEach(n => {
        const container = document.getElementById(`display-inv-${n}`);
        if(container) {
            container.className = "inv-grid-container"; 
            container.innerHTML = inventarioDati
                .filter(i => i.id && i.categoria === `Inventario ${n}` && i.id.toLowerCase().includes(searchTerm))
                .sort((a,b) => a.id.localeCompare(b.id))
                .map(i => `
                    <div class="inv-box" onclick="window.openInvQuickAction('${i.id}')">
                        <span class="inv-qty-badge" style="background: var(--gold-accent); color: #000;">${fmt(i.qty)}</span>
                        <img class="inv-img" src="${i.foto || 'https://via.placeholder.com/100/121212/8b0000?text=?'}" 
                             onerror="this.src='https://via.placeholder.com/100/121212/8b0000?text=?'">
                        <span class="inv-name">${i.id}</span>
                    </div>`).join('');
        }
    });
};

window.openInvQuickAction = async (itemID) => {
    let utente = (currentUser && !currentUser.isAdmin) ? currentUser.nome : document.getElementById('inv-user-name').value;
    if(!utente) return vampireToast("Identificati prima di operare!", "error");
    const item = inventarioDati.find(i => i.id === itemID);
    if (!item) return vampireToast("Oggetto non trovato.", "error");

    const { value: formValues } = await Swal.fire({
        title: itemID,
        html: `
            <div style="color:#aaa; font-size:0.8rem; margin-bottom:18px; text-transform:uppercase;">Disponibilità: <strong style="color:#c5a059">${item.qty}</strong></div>
            <input type="hidden" id="swal-action" value="prendi">
            <div style="display:flex; gap:10px; justify-content:center; margin-bottom:16px;">
                <button type="button" id="swal-btn-preleva"
                    style="flex:1; padding:12px 10px; cursor:pointer; font-family:inherit; font-size:0.8rem; font-weight:700; letter-spacing:1px; text-transform:uppercase; background:rgba(231,76,60,0.28); color:#e74c3c; border:2px solid #e74c3c; border-radius:8px; box-shadow:0 0 12px rgba(231,76,60,0.35);">
                    − Preleva
                </button>
                <button type="button" id="swal-btn-deposita"
                    style="flex:1; padding:12px 10px; cursor:pointer; font-family:inherit; font-size:0.8rem; font-weight:700; letter-spacing:1px; text-transform:uppercase; background:rgba(46,204,113,0.1); color:#2ecc71; border:2px solid rgba(46,204,113,0.45); border-radius:8px;">
                    + Deposita
                </button>
            </div>
            <input id="swal-qty" type="number" class="swal2-input" placeholder="Quantità" min="1" style="margin-bottom:8px;">
            <input id="swal-motivo" type="text" class="swal2-input" placeholder="Causale">
        `,
        background: '#121212',
        color: '#e0e0e0',
        showCancelButton: true,
        confirmButtonColor: '#8b0000',
        confirmButtonText: 'Conferma',
        cancelButtonText: 'Annulla',
        didOpen: () => {
            const actionEl = document.getElementById('swal-action');
            const btnPre = document.getElementById('swal-btn-preleva');
            const btnDep = document.getElementById('swal-btn-deposita');
            const selectAction = (action) => {
                actionEl.value = action;
                if (action === 'prendi') {
                    btnPre.style.background = 'rgba(231,76,60,0.28)';
                    btnPre.style.borderColor = '#e74c3c';
                    btnPre.style.boxShadow = '0 0 12px rgba(231,76,60,0.35)';
                    btnDep.style.background = 'rgba(46,204,113,0.1)';
                    btnDep.style.borderColor = 'rgba(46,204,113,0.45)';
                    btnDep.style.boxShadow = 'none';
                } else {
                    btnDep.style.background = 'rgba(46,204,113,0.28)';
                    btnDep.style.borderColor = '#2ecc71';
                    btnDep.style.boxShadow = '0 0 12px rgba(46,204,113,0.35)';
                    btnPre.style.background = 'rgba(231,76,60,0.1)';
                    btnPre.style.borderColor = 'rgba(231,76,60,0.45)';
                    btnPre.style.boxShadow = 'none';
                }
            };
            btnPre.addEventListener('click', (e) => { e.preventDefault(); selectAction('prendi'); });
            btnDep.addEventListener('click', (e) => { e.preventDefault(); selectAction('deposita'); });
            selectAction('prendi');
            setTimeout(() => document.getElementById('swal-qty')?.focus(), 50);
        },
        preConfirm: () => {
            const action = document.getElementById('swal-action')?.value || 'prendi';
            const qty = parseInt(document.getElementById('swal-qty')?.value, 10);
            const motivo = (document.getElementById('swal-motivo')?.value || '').trim();
            if (!qty || qty <= 0) {
                Swal.showValidationMessage('Inserisci una quantità valida.');
                return false;
            }
            if (!motivo) {
                Swal.showValidationMessage('Inserisci la causale.');
                return false;
            }
            return { action, qty, motivo };
        }
    });

    if (formValues) {
        const { action, qty, motivo } = formValues;
        const newQty = action === "prendi" ? item.qty - qty : item.qty + qty;
        if (newQty < 0) return vampireToast("Scorte insufficienti nel deposito.", "error");
        const now = new Date();
        await updateDoc(doc(db, "inventario", itemID), { qty: newQty });
        const logEntry = {
            utente, tipo: action, item: itemID, qty, motivo, timestamp: Date.now(),
            dataStr: now.toLocaleDateString('it-IT'), ora: now.toLocaleTimeString('it-IT')
        };
        await addDoc(collection(db, "logs"), logEntry);
        logSystemEvent('inventario', logEntry.azione || 'movimento', `Inventario: ${logEntry.user || '?'} · ${logEntry.item || '?'} · ${logEntry.azione || ''} ${logEntry.qty || ''}`, { user: logEntry.user, item: logEntry.item, azione: logEntry.azione, qty: logEntry.qty });
        // Ottimistico: qty + log subito in memoria e in UI
        const idx = inventarioDati.findIndex(i => i.id === itemID);
        if (idx >= 0) inventarioDati[idx] = { ...inventarioDati[idx], qty: newQty };
        logs = [logEntry, ...logs].slice(0, 80);
        forceRefreshAfterWrite('inventario');
        vampireToast(`Oggetto ${action === 'prendi' ? 'prelevato' : 'depositato'} con successo.`, "success");
    }
};

window.renderLogs = () => {
    const logElement = document.getElementById('inv-logs');
    if(!logElement) return;
    const searchTerm = document.getElementById('search-logs').value.toLowerCase();
    logElement.innerHTML = logs.filter(l => (l.utente || "").toLowerCase().includes(searchTerm) || (l.item || "").toLowerCase().includes(searchTerm) || (l.motivo && l.motivo.toLowerCase().includes(searchTerm)))
        .map(l => `
        <div class="log-entry">
            <div class="log-main">
                <span><strong>${l.utente || ''}</strong> <span style="color: ${l.tipo === 'prendi' ? 'var(--withdraw-red)' : 'var(--success-green)'}">${l.tipo || ''}</span> <span style="color: var(--gold-dim); font-weight: bold;">${fmt(l.qty)}x</span> ${l.item || ''}</span>
                <span class="log-time">${l.dataStr || ''} ${l.ora || ''}</span>
            </div>
            <div class="log-causale">Motivo: ${l.motivo || 'N/D'}</div>
        </div>`).join('');
};

window.adminUpdateSaldo = async () => {
    const v = parseInt(document.getElementById('admin-saldo-val').value);
    if (isNaN(v)) return vampireToast("Valore non valido.", "error");
    await setDoc(doc(db, "config", "saldo"), { valore: v }, { merge: true });
    logSystemEvent('saldo', 'correzione', `Saldo forzato a ${v} cr (admin)`, { valore: v });
    saldoGlobale = v;
    forceRefreshAfterWrite('saldo');
    vampireToast("Saldo globale aggiornato manualmente.", "success");
};

window.resetFormInventarioAdmin = () => {
    const editEl = document.getElementById('admin-item-edit-id');
    if (editEl) editEl.value = "";
    const nameEl = document.getElementById('admin-item-name');
    if (nameEl) {
        nameEl.value = "";
        nameEl.readOnly = false;
    }
    if (document.getElementById('admin-item-qty')) document.getElementById('admin-item-qty').value = "0";
    if (document.getElementById('admin-item-cat')) document.getElementById('admin-item-cat').value = "Inventario 1";
    const sel = document.getElementById('admin-item-foto');
    if (sel) sel.value = "";
    const btn = document.getElementById('admin-item-save-btn');
    if (btn) btn.textContent = "Aggiungi";
};

window.caricaItemPerEdit = (itemId) => {
    const item = inventarioDati.find(i => i.id === itemId);
    if (!item) return vampireToast("Oggetto non trovato.", "error");

    let editEl = document.getElementById('admin-item-edit-id');
    if (!editEl) {
        editEl = document.createElement('input');
        editEl.type = 'hidden';
        editEl.id = 'admin-item-edit-id';
        const formArea = document.getElementById('admin-item-name')?.closest('.vamp-card');
        if (formArea) formArea.appendChild(editEl);
        else document.body.appendChild(editEl);
    }
    editEl.value = item.id;

    const nameEl = document.getElementById('admin-item-name');
    if (nameEl) {
        nameEl.value = item.id;
        nameEl.readOnly = false;
    }
    if (document.getElementById('admin-item-qty')) document.getElementById('admin-item-qty').value = item.qty ?? 0;
    if (document.getElementById('admin-item-cat')) {
        document.getElementById('admin-item-cat').value = item.categoria || "Inventario 1";
    }

    const fotoSel = document.getElementById('admin-item-foto');
    if (fotoSel) {
        let matched = "";
        if (item.imageFileName) {
            const byName = itemImagesLib.find(x => x.fileName === item.imageFileName);
            if (byName) matched = byName.id;
        }
        if (!matched && item.foto) {
            const byUrl = itemImagesLib.find(x => x.dataUrl === item.foto);
            if (byUrl) matched = byUrl.id;
        }
        fotoSel.value = matched;
    }

    const btn = document.getElementById('admin-item-save-btn');
    if (btn) btn.textContent = "Salva modifiche";
    vampireToast("Dati caricati. Modifica e premi Salva modifiche.", "info");
    nameEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
};

window.adminUpdateItem = async () => {
    const n = document.getElementById('admin-item-name').value.trim();
    const c = document.getElementById('admin-item-cat').value;
    const imgId = document.getElementById('admin-item-foto')?.value || "";
    const q = parseInt(document.getElementById('admin-item-qty').value) || 0;
    const editId = (document.getElementById('admin-item-edit-id')?.value || "").trim();

    if (!n) return vampireToast("Nome obbligatorio.", "error");

    let foto = "https://via.placeholder.com/100/121212/8b0000?text=?";
    let imageFileName = "";
    if (imgId) {
        const found = itemImagesLib.find(x => x.id === imgId);
        if (found) {
            foto = found.dataUrl || foto;
            imageFileName = found.fileName || "";
        }
    } else if (editId) {
        const existing = inventarioDati.find(i => i.id === editId);
        if (existing) {
            if (existing.foto) foto = existing.foto;
            if (existing.imageFileName) imageFileName = existing.imageFileName;
        }
    }

    try {
        if (editId && editId !== n) {
            await setDoc(doc(db, "inventario", n), { qty: q, categoria: c, foto, imageFileName });
            await deleteDoc(doc(db, "inventario", editId));
            logSystemEvent('inventario', 'rinomina', `Inventario: "${editId}" → "${n}" (qty ${q})`, { da: editId, a: n, qty: q, categoria: c });
            vampireToast(`Oggetto rinominato in "${n}" e aggiornato.`, "success");
        } else {
            await setDoc(doc(db, "inventario", n), { qty: q, categoria: c, foto, imageFileName }, { merge: true });
            logSystemEvent('inventario', editId ? 'modifica' : 'crea', `Inventario ${editId ? 'aggiornato' : 'aggiunto'}: ${n} (qty ${q}, ${c})`, { nome: n, qty: q, categoria: c });
            vampireToast(editId ? "Elemento inventario aggiornato." : "Elemento inventario aggiunto.", "success");
        }
        window.resetFormInventarioAdmin();
    } catch (err) {
        console.error(err);
        vampireToast("Errore salvataggio: " + (err.message || err), "error");
    }
};

window.adminUpdateQty = async (item, val) => {
    await updateDoc(doc(db, "inventario", item), { qty: parseInt(val) });
    logSystemEvent('inventario', 'qty', `Inventario qty: ${item} → ${val}`, { item, qty: parseInt(val) });
    vampireToast(`Quantità di ${item} modificata.`, "success");
};

window.adminDeleteItem = async (item) => {
    const res = await Swal.fire({ title: 'Eliminare?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#8b0000', background: '#111' });
    if(res.isConfirmed) { 
        await deleteDoc(doc(db, "inventario", item));
        logSystemEvent('inventario', 'elimina', `Eliminato oggetto inventario ${item}`, { item }); 
        if ((document.getElementById('admin-item-edit-id')?.value || '') === item) {
            window.resetFormInventarioAdmin();
        }
        vampireToast("Oggetto eliminato dal database.", "success"); 
    }
};

window.adminDeleteVendita = async (id) => {
    const res = await Swal.fire({ title: 'Elimina Vendita', icon: 'question', showCancelButton: true, confirmButtonColor: '#8b0000', background: '#111' });
    if(res.isConfirmed) { 
        await deleteDoc(doc(db, "vendite", id));
        logSystemEvent('vendita', 'elimina', `Eliminata vendita id ${id}`, { id }); 
        vampireToast("Record di vendita eliminato.", "success"); 
    }
};

window.adminDeleteLog = async (id) => {
    const res = await Swal.fire({ title: 'Elimina Log', icon: 'warning', showCancelButton: true, confirmButtonColor: '#8b0000', background: '#111' });
    if(res.isConfirmed) { 
        await deleteDoc(doc(db, "logs", id));
        logSystemEvent('admin', 'elimina_log_inv', `Eliminato log inventario ${id}`, { id }); 
        vampireToast("Log di movimento epurato.", "success"); 
    }
};

window.adminDeleteSaldoLog = async (id) => {
    const res = await Swal.fire({ title: 'Rimuovi Log Saldo?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#8b0000', background: '#111' });
    if(res.isConfirmed) { 
        await deleteDoc(doc(db, "saldo_logs", id));
        logSystemEvent('admin', 'elimina_log_saldo', `Eliminato log saldo ${id}`, { id }); 
        vampireToast("Log transazione rimosso.", "success"); 
    }
};

window.renderAdminTable = () => {
    const tbody = document.getElementById('admin-table-body');
    if(!tbody) return;
    const searchTerm = (document.getElementById('search-admin-inv')?.value || '').toLowerCase();
    const safeId = (id) => String(id).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    tbody.innerHTML = inventarioDati.filter(i => i.id && i.id.toLowerCase().includes(searchTerm)).sort((a,b) => a.id.localeCompare(b.id))
        .map(i => {
            const sid = safeId(i.id);
            return `<tr>
                <td>${i.id}</td>
                <td>${i.categoria || ''}</td>
                <td><input type="number" value="${i.qty}" onchange="window.adminUpdateQty('${sid}', this.value)" style="width:80px; text-align:center;"></td>
                <td style="white-space:nowrap;">
                    <button class="btn-delete" style="border-color:var(--gold-accent);color:var(--gold-accent);margin-right:6px;" onclick="window.caricaItemPerEdit('${sid}')">MODIFICA</button>
                    <button class="btn-delete" onclick="window.adminDeleteItem('${sid}')">ELIMINA</button>
                </td>
            </tr>`;
        }).join('') || '<tr><td colspan="4" style="opacity:0.5;text-align:center;">Nessun oggetto in inventario.</td></tr>';
};

window.renderAdminLogs = () => {
    const logBox = document.getElementById('admin-logs-box');
    if(!logBox) return;
    const searchTerm = document.getElementById('search-admin-logs').value.toLowerCase();
    logBox.innerHTML = logs.filter(l => (l.utente || "").toLowerCase().includes(searchTerm) || (l.item || "").toLowerCase().includes(searchTerm))
        .map(l => `
        <div class="log-entry">
            <div class="log-main">
                <span><strong>${l.utente || ''}</strong> <span>${l.tipo || ''}</span> <span style="color: var(--gold-dim);">${fmt(l.qty)}</span>x ${l.item || ''}</span>
                <div style="display:flex; align-items:center; gap:10px;">
                    <span class="log-time">${l.dataStr || ''} ${l.ora || ''}</span>
                    <button class="btn-delete" onclick="window.adminDeleteLog('${l.id}')">ELIMINA</button>
                </div>
            </div>
            <div class="log-causale">${l.motivo || ''}</div>
        </div>`).join('');
};

window.renderAdminSaldoLogs = () => {
    const logBox = document.getElementById('admin-saldo-logs-box');
    if(!logBox) return;
    const searchTerm = document.getElementById('search-admin-saldo-logs').value.toLowerCase();
    logBox.innerHTML = saldoLogs.filter(l => (l.utente || "").toLowerCase().includes(searchTerm) || (l.motivo || "").toLowerCase().includes(searchTerm))
        .map(l => `
        <div class="log-entry">
            <div class="log-main">
                <span><strong>${l.utente || ''}</strong> <span>${l.tipo || ''}</span> <span style="color: var(--gold-dim); font-weight: bold;">${fmt(l.qty)}</span> cr</span>
                <div style="display:flex; align-items:center; gap:10px;">
                    <span class="log-time">${l.dataStr || ''} ${l.ora || ''}</span>
                    <button class="btn-delete" onclick="window.adminDeleteSaldoLog('${l.id}')">X</button>
                </div>
            </div>
            <div class="log-causale">${l.motivo || ''}</div>
        </div>`).join('');
};

window.renderArchivioGestione = () => {
    const searchEl = document.getElementById('search-admin-archivio');
    const searchTerm = (searchEl?.value || '').toLowerCase();
    const container = document.getElementById('admin-archivio-container');
    if(!container) return;
    const weekSel = document.getElementById('archivio-week-select')?.value || getWeekYearKey(new Date());
    const gruppi = {};
    (vendite || []).forEach(v => {
        if (weekSel && v.settimanaEtichetta !== weekSel) return;
        if(!gruppi[v.settimanaEtichetta]) gruppi[v.settimanaEtichetta] = [];
        gruppi[v.settimanaEtichetta].push(v);
    });
    const keys = Object.keys(gruppi).sort().reverse();
    if (!keys.length) {
        container.innerHTML = '<p style="opacity:0.6;padding:16px;text-align:center;">Nessuna vendita per questa settimana. Premi «Carica settimana» se non è quella corrente.</p>';
        return;
    }
    container.innerHTML = keys.map(key => {
        const filtered = gruppi[key].filter(v =>
            (v.nome || "").toLowerCase().includes(searchTerm) ||
            (v.materiale || "").toLowerCase().includes(searchTerm) ||
            (v.note && v.note.toLowerCase().includes(searchTerm))
        ).sort((a,b) => b.timestamp - a.timestamp);
        if(filtered.length === 0 && searchTerm !== "") return "";
        const range = getWeekRangeLabel(key);
        const weekTotalQty = filtered.reduce((sum, v) => sum + (v.qty || 0), 0);
        const weekTotalDinastia = filtered.reduce((sum, v) => sum + (v.dinastia || 0), 0);
        const weekTotalEkaton = filtered.reduce((sum, v) => sum + calcEkatonFromRecord(v), 0);
        
        return `<div class="week-archive-block">
            <div class="week-title">${range} | Vendite: ${filtered.length} | Qty: <span style="color: var(--gold-dim);">${fmt(weekTotalQty)}x</span> | Dinastia: <span style="color: var(--gold-dim);">${fmt(weekTotalDinastia)} cr</span> | Ekaton: <span style="color: var(--gold-dim);">${fmt(Math.floor(weekTotalEkaton))} cr</span></div>
            <div style="overflow-x:auto;"><table><thead><tr><th>Data/Ora</th><th>Vampiro</th><th>Materiale</th><th>Qty</th><th>Propria</th><th>Dinastia</th><th>Ekaton</th><th>Note</th><th>Azione</th></tr></thead>
            <tbody>${filtered.map(v => `<tr>
                <td style="font-size:0.65rem">${v.dataStr || ''}<br>${v.ora || ''}</td>
                <td>${v.nome || ''}</td>
                <td style="color:var(--gold-accent)">${v.materiale || '—'}</td>
                <td style="color: var(--gold-dim);">${fmt(v.qty)}</td>
                <td>${fmt(v.propria)}</td>
                <td>${fmt(v.dinastia)}</td>
                <td style="color:var(--gold-dim)">${fmt(Math.floor(calcEkatonFromRecord(v)))}</td>
                <td style="font-size:0.7rem;">${v.note || '-'}</td>
                <td><button class="btn-delete" onclick="window.adminDeleteVendita('${v.id}')">X</button></td>
            </tr>`).join('')}</tbody></table></div></div>`;
    }).join('');
};

window.popolaSelectOggetti = () => {
    const select = document.getElementById('inv-select-item');
    if(select) select.innerHTML = inventarioDati.sort((a,b) => a.id.localeCompare(b.id)).map(i => `<option value="${i.id}">${i.id}</option>`).join('');
};

// --- TIME UTILS ---
// Settimana ISO: lunedì 00:00 → domenica 23:59.
// A mezzanotte tra domenica e lunedì cambia la chiave settimana:
// le sezioni Vendite / Vendita Materiali mostrano solo la settimana corrente
// (effetto "reset"), mentre i record restano in Firestore e compaiono nello Storico.
function getWeekYearKey(date) {
    const d = new Date(date.getTime());
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    const yearStart = new Date(d.getFullYear(), 0, 1);
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return d.getFullYear() + "-W" + weekNo.toString().padStart(2, '0');
}

function getWeekRangeLabel(weekKey) {
    if(!weekKey) return "N/D";
    const [year, week] = weekKey.split('-W');
    const simple = new Date(year, 0, 1 + (week - 1) * 7);
    const ISOweekStart = new Date(simple); 
    ISOweekStart.setDate(simple.getDate() - (simple.getDay() || 7) + 1);
    const ISOweekEnd = new Date(ISOweekStart); 
    ISOweekEnd.setDate(ISOweekStart.getDate() + 6);
    return `${ISOweekStart.toLocaleDateString('it-IT', {day:'2-digit', month:'short'})} - ${ISOweekEnd.toLocaleDateString('it-IT', {day:'2-digit', month:'short'})}`;
}


// --- ADMIN CLASSIFICHE (solo Top 3 per settimana) ---
window.popolaSelectSettimaneClassifiche = function() {
    const sel = document.getElementById('adm-class-settimana');
    if (!sel) return;
    const current = sel.value;
    const keys = new Set();
    const currentWeek = getWeekYearKey(new Date());
    keys.add(currentWeek);
    (vendite || []).forEach(v => { if (v.settimanaEtichetta) keys.add(v.settimanaEtichetta); });
    (venditeMateriali || []).forEach(m => { if (m.settimanaEtichetta) keys.add(m.settimanaEtichetta); });
    try {
        const d = new Date();
        for (let i = 1; i <= 16; i++) {
            d.setDate(d.getDate() - 7);
            keys.add(getWeekYearKey(new Date(d)));
        }
    } catch (_) {}
    const sorted = [...keys].sort((a, b) => b.localeCompare(a));
    let opts = [
        `<option value="__corrente__">Settimana corrente (${getWeekRangeLabel(currentWeek)})</option>`
    ];
    sorted.forEach(k => {
        if (k === currentWeek) return; // già in __corrente__
        opts.push(`<option value="${k}">${getWeekRangeLabel(k)}</option>`);
    });
    sel.innerHTML = opts.join('');
    if (current && [...sel.options].some(o => o.value === current)) {
        sel.value = current;
    } else {
        sel.value = '__corrente__';
    }
};

/**
 * Costruisce classifica aggregata per nome.
 * @param {Array} rows
 * @param {string} nameKey
 * @param {string} qtyKey
 * @param {string} creditKey
 * @param {string|null} weekKey  null = tutte le settimane (sempre)
 * @param {'qty'|'crediti'} sortBy
 */
function buildRankList(rows, nameKey, qtyKey, creditKey, weekKey, sortBy) {
    const map = {};
    (rows || []).forEach(r => {
        if (weekKey && r.settimanaEtichetta !== weekKey) return;
        const nome = r[nameKey];
        if (!nome) return;
        if (!map[nome]) map[nome] = { qty: 0, crediti: 0, count: 0 };
        map[nome].qty += (Number(r[qtyKey]) || 0);
        map[nome].crediti += (Number(r[creditKey]) || 0);
        map[nome].count += 1;
    });
    const arr = Object.entries(map).map(([nome, s]) => ({ nome, ...s }));
    if (sortBy === 'crediti') {
        arr.sort((a, b) => b.crediti - a.crediti || b.qty - a.qty || a.nome.localeCompare(b.nome, 'it'));
    } else {
        arr.sort((a, b) => b.qty - a.qty || b.crediti - a.crediti || a.nome.localeCompare(b.nome, 'it'));
    }
    return arr.slice(0, 3); // solo Top 3
}

function rankTableHtml(arr, unitLabel) {
    if (!arr.length) {
        return `<tr><td colspan="5" style="opacity:0.5;text-align:center;">Nessun dato per i filtri scelti.</td></tr>`;
    }
    return arr.map((item, index) => {
        const pos = index + 1;
        const medal = pos === 1 ? '🥇' : pos === 2 ? '🥈' : pos === 3 ? '🥉' : pos;
        const rowStyle = pos <= 3 ? 'color:var(--gold-accent);font-weight:700;' : '';
        return `<tr style="${rowStyle}">
            <td style="text-align:center;white-space:nowrap;">${medal}</td>
            <td style="text-align:left;"><strong>${item.nome}</strong></td>
            <td>${fmt(item.qty)} ${unitLabel}</td>
            <td>${fmt(item.crediti)} cr</td>
            <td>${fmt(item.count)}</td>
        </tr>`;
    }).join('');
}

window.onAdminClassSettimanaChange = async function() {
    const v = document.getElementById('adm-class-settimana')?.value || '__corrente__';
    if (v && v !== '__corrente__' && v !== '__sempre__') {
        await window.loadStoricoWeek?.(v);
    }
    window.renderAdminClassifiche();
};

window.renderAdminClassifiche = function(opts = {}) {
    // opts.refreshWeeks: forza ripopolamento elenco settimane (apertura tab / nuovi dati)
    if (opts.refreshWeeks || !document.getElementById('adm-class-settimana')?.options?.length) {
        window.popolaSelectSettimaneClassifiche();
    }

    const tipo = (document.getElementById('adm-class-tipo')?.value || 'entrambi');
    const periodoRaw = (document.getElementById('adm-class-settimana')?.value || '__corrente__');
    const sortBy = (document.getElementById('adm-class-sort')?.value || 'qty');
    const search = (document.getElementById('adm-class-search')?.value || '').toLowerCase().trim();

    let weekKey = null;
    let periodoLabel = 'Migliori di sempre';
    if (periodoRaw === '__sempre__') {
        // disabilitato: usa solo settimana (evita storico massivo)
        weekKey = getWeekYearKey(new Date());
        periodoLabel = 'Settimana corrente · ' + getWeekRangeLabel(weekKey);
    } else if (periodoRaw === '__corrente__') {
        weekKey = getWeekYearKey(new Date());
        periodoLabel = 'Settimana corrente · ' + getWeekRangeLabel(weekKey);
    } else {
        weekKey = periodoRaw;
        periodoLabel = getWeekRangeLabel(weekKey) + ' · ' + weekKey;
    }

    const info = document.getElementById('adm-class-periodo-info');
    if (info) info.textContent = periodoLabel;

    const filterName = (list) => {
        if (!search) return list;
        return list.filter(x => (x.nome || '').toLowerCase().includes(search));
    };

    // Vendite
    const boxVend = document.getElementById('adm-class-vendite-wrap');
    const bodyVend = document.getElementById('adm-class-vendite-body');
    if (boxVend) boxVend.style.display = (tipo === 'materiali') ? 'none' : '';
    if (bodyVend && tipo !== 'materiali') {
        let rank = buildRankList(vendite, 'nome', 'qty', 'dinastia', weekKey, sortBy);
        rank = filterName(rank);
        bodyVend.innerHTML = rankTableHtml(rank, 'qty');
        const meta = document.getElementById('adm-class-vendite-meta');
        if (meta) {
            const totQ = rank.reduce((s, r) => s + r.qty, 0);
            const totC = rank.reduce((s, r) => s + r.crediti, 0);
            meta.textContent = `${rank.length} in classifica · ${fmt(totQ)} qty · ${fmt(totC)} cr dinastia`;
        }
    }

    // Materiali
    const boxMat = document.getElementById('adm-class-materiali-wrap');
    const bodyMat = document.getElementById('adm-class-materiali-body');
    if (boxMat) boxMat.style.display = (tipo === 'vendite') ? 'none' : '';
    if (bodyMat && tipo !== 'vendite') {
        let rank = buildRankList(venditeMateriali, 'vampiro', 'qty', 'vDin', weekKey, sortBy);
        rank = filterName(rank);
        bodyMat.innerHTML = rankTableHtml(rank, 'mat');
        const meta = document.getElementById('adm-class-materiali-meta');
        if (meta) {
            const totQ = rank.reduce((s, r) => s + r.qty, 0);
            const totC = rank.reduce((s, r) => s + r.crediti, 0);
            meta.textContent = `${rank.length} in classifica · ${fmt(totQ)} mat · ${fmt(totC)} cr dinastia`;
        }
    }
};


function calcEkatonFromRecord(v) {
    if (v.ekaton != null && !isNaN(v.ekaton)) return Number(v.ekaton);
    const din = Number(v.dinastia || v.vDin || 0);
    const pEk = (v.pEkaton != null) ? Number(v.pEkaton) : 50;
    return din * (pEk / 100);
}

function aggiornaStats() {
    const currentWeekKey = getWeekYearKey(new Date());
    const correnti = vendite.filter(v => v.settimanaEtichetta === currentWeekKey);
    const totaleDinastiaSettimana = correnti.reduce((acc, curr) => acc + (curr.dinastia || 0), 0);
    const totaleEkatonSett = correnti.reduce((acc, curr) => acc + calcEkatonFromRecord(curr), 0);
    const totaleQtySett = correnti.reduce((acc, curr) => acc + (curr.qty || 0), 0);
    const dinastiaStorico = vendite.reduce((acc, curr) => acc + (curr.dinastia || 0), 0);
    const ekatonStorico = vendite.reduce((acc, curr) => acc + calcEkatonFromRecord(curr), 0);
    
    if(document.getElementById('tot-dinastia-sett')) document.getElementById('tot-dinastia-sett').innerText = fmt(totaleDinastiaSettimana) + " cr";
    if(document.getElementById('tot-ekaton-sett')) document.getElementById('tot-ekaton-sett').innerText = fmt(Math.floor(totaleEkatonSett)) + " cr";
    if(document.getElementById('tot-qty-sett')) document.getElementById('tot-qty-sett').innerText = fmt(totaleQtySett) + "x";
    if(document.getElementById('tot-count-sett')) document.getElementById('tot-count-sett').innerText = correnti.length;

    if(document.getElementById('admin-tot-qty-storico')) document.getElementById('admin-tot-qty-storico').innerText = fmt(vendite.reduce((acc, curr) => acc + (curr.qty || 0), 0)) + "x";
    if(document.getElementById('admin-tot-dinastia-storico')) document.getElementById('admin-tot-dinastia-storico').innerText = fmt(dinastiaStorico) + " cr";
    if(document.getElementById('admin-tot-ekaton-storico')) document.getElementById('admin-tot-ekaton-storico').innerText = fmt(Math.floor(ekatonStorico)) + " cr";
    if(document.getElementById('admin-tot-count-storico')) document.getElementById('admin-tot-count-storico').innerText = vendite.length;

    const matQtyStorico = venditeMateriali.reduce((acc, curr) => acc + (curr.qty || 0), 0);
    const matCreditiStorico = venditeMateriali.reduce((acc, curr) => acc + (curr.prezzoTot || 0), 0);
    const matDinastiaStorico = venditeMateriali.reduce((acc, curr) => acc + (curr.vDin || 0), 0);

    if(document.getElementById('admin-tot-mat-qty-storico')) document.getElementById('admin-tot-mat-qty-storico').innerText = fmt(matQtyStorico) + "x";
    if(document.getElementById('admin-tot-mat-crediti-storico')) document.getElementById('admin-tot-mat-crediti-storico').innerText = fmt(matCreditiStorico) + " cr";
    if(document.getElementById('admin-tot-mat-dinastia-storico')) document.getElementById('admin-tot-mat-dinastia-storico').innerText = fmt(matDinastiaStorico) + " cr";
    if(document.getElementById('admin-tot-mat-count-storico')) document.getElementById('admin-tot-mat-count-storico').innerText = venditeMateriali.length;
}

// --- INITIALIZATION & SNAPSHOTS ---
function isSectionActive(id) {
    return !!document.getElementById(id)?.classList.contains('active');
}
function isAdminVisible() {
    return document.getElementById('admin-content')?.style.display === 'block';
}
/**
 * Esegue lavoro UI senza bloccare il thread principale.
 * @param {Function} fn
 * @param {number|{delay?:number, priority?:'high'|'normal'}} [opts]
 *  - priority 'high' (default per aggiornamenti log/sezione attiva): requestAnimationFrame / setTimeout(0)
 *  - priority 'normal' (render pesanti): requestIdleCallback con timeout breve
 */
function scheduleUI(fn, opts = 0) {
    let delay = 0;
    let priority = 'high';
    if (typeof opts === 'number') {
        delay = opts;
        priority = opts > 0 ? 'normal' : 'high';
    } else if (opts && typeof opts === 'object') {
        delay = opts.delay || 0;
        priority = opts.priority || 'high';
    }
    const run = () => {
        try { fn(); } catch (e) { console.error(e); }
    };
    const start = () => {
        if (priority === 'normal' && typeof requestIdleCallback === 'function') {
            requestIdleCallback(run, { timeout: 250 });
        } else if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(() => { try { fn(); } catch (e) { console.error(e); } });
        } else {
            setTimeout(run, 0);
        }
    };
    if (delay > 0) setTimeout(start, delay);
    else start();
}

/** Forza refresh immediato di log/liste della sezione attiva (dopo scrittura locale) */
function forceRefreshAfterWrite(kind) {
    scheduleUI(() => {
        if (kind === 'saldo' || kind === 'all') {
            if (isSectionActive('saldo')) window.renderSaldoLogs?.();
            if (isAdminVisible()) window.renderAdminSaldoLogs?.();
            const el = document.getElementById('tot-saldo-globale');
            if (el) el.innerText = fmt(saldoGlobale) + ' cr';
        }
        if (kind === 'inventario' || kind === 'all') {
            if (isSectionActive('inventario')) {
                window.renderInventario?.();
                window.renderLogs?.();
                window.popolaSelectOggetti?.();
            }
            if (isAdminVisible()) {
                window.renderAdminTable?.();
                window.renderAdminLogs?.();
            }
        }
        if (kind === 'vendite' || kind === 'all') {
            if (isSectionActive('vendite')) window.renderVendite?.();
            if (isSectionActive('generale')) renderClassifiche?.();
            aggiornaStats?.();
            popolaFiltroSettimane?.();
        }
        if (kind === 'materiali' || kind === 'all') {
            if (isSectionActive('materiali')) window.renderMateriali?.();
            if (isSectionActive('generale')) renderClassifiche?.();
            aggiornaStats?.();
            popolaFiltroSettimane?.();
        }
    }, { priority: 'high' });
}

/** Render della sola sezione attualmente aperta (evita lag all'avvio) */
window.refreshActiveSectionUI = () => {
    const active = document.querySelector('.section.active')?.id;
    if (!active) return;
    switch (active) {
        case 'generale':
            renderDinamici();
            renderClassifiche();
            renderVampiriLists();
            break;
        case 'vendite':
            window.renderVendite?.();
            aggiornaStats?.();
            break;
        case 'materiali':
            window.renderMateriali?.();
            aggiornaStats?.();
            break;
        case 'saldo':
            window.renderSaldoLogs?.();
            break;
        case 'inventario':
            window.renderInventario?.();
            window.renderLogs?.();
            window.popolaSelectOggetti?.();
            break;
        case 'calendario':
            window.renderCalendarioSezione?.();
            break;
case 'albero':
            if (window._alberoDirty) {
                window._alberoDirty = false;
                window.renderAlbero?.({ forceCenter: true });
            }
            break;
        case 'calcolo':
            popolaFiltroSettimane?.();
            break;
        case 'gestione':
            break;
        default:
            break;
    }
};

function startFirestoreListeners() {
    // =====================================================================
    // OTTIMIZZAZIONE FIRESTORE (v2)
    // - Login: SOLO core Generale (membri, comunicazioni, documenti, saldo,
    //   vendite/materiali settimana)
    // - Altre sezioni: attach on-demand + detach all'uscita
    // - Dati restano in memoria → rientro sezione istantaneo, zero lag
    // =====================================================================

    const _unsubs = {
        inventario: null,
        logs: null,
        saldoLogs: null,
        calendarioAvvento: null,
        calendarioMesi: null,
        albero: null,
        tipiMateriale: null,
        richieste: null,
        systemLogs: null
    };

    // Ref-count: quanti "contenuti" tengono aperto un listener (sezione o admin view)
    const _refs = {
        inventario: 0,
        logs: 0,
        saldoLogs: 0,
        calendario: 0,
        albero: 0,
        tipiMateriale: 0,
        richieste: 0,
        systemLogs: 0
    };
    // Cache one-shot: evita onSnapshot continui (ogni update = letture)
    const _onceLoaded = {
        inventario: false,
        logs: false,
        saldoLogs: false,
        calendario: false,
        albero: false,
        tipiMateriale: false,
        richieste: false
    };

    function _safeUnsub(key) {
        const fn = _unsubs[key];
        if (typeof fn === 'function') {
            try { fn(); } catch (_) {}
        }
        _unsubs[key] = null;
    }

    function _acquire(key, attachFn) {
        _refs[key] = (_refs[key] || 0) + 1;
        if (_refs[key] === 1) attachFn();
    }

    function _release(key, unsubKeys) {
        _refs[key] = Math.max(0, (_refs[key] || 0) - 1);
        if (_refs[key] === 0) {
            (unsubKeys || [key]).forEach(k => _safeUnsub(k));
        }
    }

    // ---- listener settimanali vendite (CORE, restano sempre) ----
    let _unsubVendite = null;
    let _unsubMat = null;
    let _liveWeekKey = null;

    function attachWeeklyVenditeListeners() {
        const weekKey = getWeekYearKey(new Date());
        // Re-attach solo se cambia settimana (non a ogni login ripetuto nella stessa week)
        if (_liveWeekKey === weekKey && typeof _unsubVendite === 'function' && typeof _unsubMat === 'function') return;
        if (typeof _unsubVendite === 'function') { try { _unsubVendite(); } catch (_) {} }
        if (typeof _unsubMat === 'function') { try { _unsubMat(); } catch (_) {} }
        _liveWeekKey = weekKey;

        const applyVendite = (snapshot) => {
            const live = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            const hist = (vendite || []).filter(v => v.settimanaEtichetta && v.settimanaEtichetta !== weekKey);
            const byId = new Map(hist.map(v => [v.id, v]));
            live.forEach(v => byId.set(v.id, v));
            vendite = [...byId.values()].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
            scheduleUI(() => {
                popolaFiltroSettimane?.();
                if (isSectionActive('vendite')) window.renderVendite?.();
                if (isSectionActive('generale')) renderClassifiche?.();
                aggiornaStats?.();
            });
        };
        const applyMateriali = (snapshot) => {
            const live = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            const hist = (venditeMateriali || []).filter(m => m.settimanaEtichetta && m.settimanaEtichetta !== weekKey);
            const byId = new Map(hist.map(m => [m.id, m]));
            live.forEach(m => byId.set(m.id, m));
            venditeMateriali = [...byId.values()].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
            scheduleUI(() => {
                popolaFiltroSettimane?.();
                if (isSectionActive('materiali')) window.renderMateriali?.();
                if (isSectionActive('generale')) renderClassifiche?.();
                aggiornaStats?.();
            });
        };

        // Live: solo settimana corrente (max 100). Nuove vendite di chiunque = 1 lettura a tutti i client connessi.
        _unsubVendite = onSnapshot(
            query(collection(db, "vendite"), where("settimanaEtichetta", "==", weekKey), limit(100)),
            applyVendite,
            (err) => console.warn('[vendite live]', err?.code || err)
        );
        _unsubMat = onSnapshot(
            query(collection(db, "vendite_materiali"), where("settimanaEtichetta", "==", weekKey), limit(100)),
            applyMateriali,
            (err) => console.warn('[materiali live]', err?.code || err)
        );
    }

    setInterval(() => {
        try {
            const k = getWeekYearKey(new Date());
            if (_liveWeekKey && k !== _liveWeekKey) attachWeeklyVenditeListeners();
        } catch (_) {}
    }, 60000);

    // ========== CORE LIVE (onSnapshot) ==========
    // Aggiornamento immediato tra utenti. Costo: 1 lettura per doc al primo attach,
    // poi solo i documenti che cambiano (non tutto di nuovo).
    onSnapshot(collection(db, "membri"), (snap) => {
        listaVampiri = snap.docs.map(d => d.data());
        scheduleUI(() => {
            renderVampiriLists();
            if (isSectionActive('generale')) renderClassifiche?.();
        });
    }, (err) => console.warn('[membri live]', err?.code || err));

    onSnapshot(
        query(collection(db, "comunicazioni"), orderBy("timestamp", "desc"), limit(30)),
        (snap) => {
            comunicazioni = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            if (isSectionActive('generale') || isAdminVisible()) scheduleUI(() => renderDinamici());
        },
        (err) => {
            // fallback senza orderBy se manca indice
            onSnapshot(
                query(collection(db, "comunicazioni"), limit(30)),
                (snap) => {
                    comunicazioni = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                    scheduleUI(() => renderDinamici());
                },
                (e2) => console.warn('[comunicazioni]', e2)
            );
        }
    );

    onSnapshot(
        query(collection(db, "documenti"), orderBy("timestamp", "desc"), limit(30)),
        (snap) => {
            documenti = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            if (isSectionActive('generale') || isAdminVisible()) scheduleUI(() => renderDinamici());
        },
        (err) => {
            onSnapshot(
                query(collection(db, "documenti"), limit(30)),
                (snap) => {
                    documenti = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                    scheduleUI(() => renderDinamici());
                },
                (e2) => console.warn('[documenti]', e2)
            );
        }
    );

    onSnapshot(doc(db, "config", "saldo"), (docSnap) => {
        if (docSnap.exists()) {
            const v = docSnap.data()?.valore;
            saldoGlobale = (typeof v === 'number') ? v : (parseFloat(v) || 0);
        } else {
            saldoGlobale = 0;
        }
        scheduleUI(() => {
            const el = document.getElementById('tot-saldo-globale');
            if (el) el.innerText = fmt(saldoGlobale) + ' cr';
        }, { priority: 'high' });
    }, (err) => console.warn('[saldo live]', err?.code || err));

    attachWeeklyVenditeListeners();

    function attachTipiMateriale() {
        if (_unsubs.tipiMateriale) return;
        _unsubs.tipiMateriale = onSnapshot(collection(db, "tipi_materiale"), (snapshot) => {
            tipiMateriale = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            scheduleUI(() => {
                if (typeof window.popolaSelectTipiMateriale === 'function') window.popolaSelectTipiMateriale();
                if (typeof window.renderAdminTipiMateriale === 'function') window.renderAdminTipiMateriale();
                if (document.getElementById('vamp-tipo-mat')) window.onVenditaTipoChange?.();
                if (document.getElementById('mat-tipo-select')) window.onMatTipoChange?.();
            });
        }, (err) => console.warn('[tipi_materiale]', err));
    }

    function attachInventario() {
        if (_unsubs.inventario) return;
        _unsubs.inventario = onSnapshot(collection(db, "inventario"), (snapshot) => {
            inventarioDati = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            scheduleUI(() => {
                window.renderInventario?.();
                window.popolaSelectOggetti?.();
                if (isAdminVisible()) window.renderAdminTable?.();
            });
        }, (err) => console.warn('[inventario]', err));
    }

    function attachLogs() {
        if (_unsubs.logs) return;
        _unsubs.logs = onSnapshot(
            query(collection(db, "logs"), orderBy("timestamp", "desc"), limit(50)),
            (snap) => {
                logs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                scheduleUI(() => {
                    window.renderLogs?.();
                    if (isAdminVisible()) window.renderAdminLogs?.();
                });
            },
            (err) => {
                _unsubs.logs = onSnapshot(
                    query(collection(db, "logs"), limit(50)),
                    (snap) => {
                        logs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                        scheduleUI(() => { window.renderLogs?.(); if (isAdminVisible()) window.renderAdminLogs?.(); });
                    },
                    (e2) => console.warn('[logs]', e2)
                );
            }
        );
    }

    function attachSaldoLogs() {
        if (_unsubs.saldoLogs) return;
        _unsubs.saldoLogs = onSnapshot(
            query(collection(db, "saldo_logs"), orderBy("timestamp", "desc"), limit(50)),
            (snap) => {
                saldoLogs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                scheduleUI(() => {
                    window.renderSaldoLogs?.();
                    if (isAdminVisible()) window.renderAdminSaldoLogs?.();
                });
            },
            (err) => {
                _unsubs.saldoLogs = onSnapshot(
                    query(collection(db, "saldo_logs"), limit(50)),
                    (snap) => {
                        saldoLogs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                        scheduleUI(() => { window.renderSaldoLogs?.(); if (isAdminVisible()) window.renderAdminSaldoLogs?.(); });
                    },
                    (e2) => console.warn('[saldo_logs]', e2)
                );
            }
        );
    }

    function attachCalendario() {
        if (_unsubs.calendarioAvvento || _unsubs.calendarioMesi) return;
        _unsubs.calendarioAvvento = onSnapshot(collection(db, "calendario_avvento"), (snapshot) => {
            calendarioAvvento = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            scheduleUI(() => {
                if (isSectionActive('calendario') || isAdminVisible()) {
                    window.renderCalendarioSezione?.();
                    window.renderAdminCalendario?.();
                }
            });
        }, (err) => console.warn('[calendario_avvento]', err));
        _unsubs.calendarioMesi = onSnapshot(collection(db, "calendario_mesi"), (snapshot) => {
            calendarioMesi = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            scheduleUI(() => {
                if (isSectionActive('calendario') || isAdminVisible()) {
                    window.renderCalendarioSezione?.();
                    window.renderAdminCalendario?.();
                }
            });
        }, (err) => console.warn('[calendario_mesi]', err));
    }

    function attachAlbero() {
        if (_unsubs.albero) return;
        _unsubs.albero = onSnapshot(collection(db, "albero_genealogico"), (snapshot) => {
            alberoNodi = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            window._alberoDirty = true;
            scheduleUI(() => {
                if (isSectionActive('albero')) window.renderAlbero?.({ preservePan: true });
                if (isAdminVisible()) {
                    window.renderAdminAlbero?.();
                    window.popolaSelectParentAlbero?.();
                }
            });
        }, (err) => console.warn('[albero]', err));
    }

    function attachRichieste() {
        if (!currentUser?.isAdmin) return;
        if (_unsubs.richieste) return;
        _unsubs.richieste = onSnapshot(
            query(collection(db, "richieste_membri"), where("stato", "==", "pending"), limit(50)),
            (snap) => {
                const pendingNow = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                const byId = new Map((richiesteMembri || []).map(r => [r.id, r]));
                for (const [id, r] of [...byId.entries()]) {
                    if ((r.stato || 'pending') === 'pending' && !pendingNow.find(x => x.id === id)) byId.delete(id);
                }
                pendingNow.forEach(r => byId.set(r.id, r));
                richiesteMembri = [...byId.values()];
                try {
                    const pending = richiesteMembri.filter(r => (r.stato || 'pending') === 'pending').length;
                    document.querySelectorAll('.admin-menu-card[data-admin-view="richieste-membri"] h3').forEach(h => {
                        h.textContent = pending > 0 ? `📩 Richieste Membri (${pending})` : '📩 Richieste Membri';
                    });
                    const view = document.getElementById('admin-view-richieste-membri');
                    if (view && view.style.display !== 'none' && typeof window.renderAdminRichiesteMembri === 'function') {
                        window.renderAdminRichiesteMembri();
                    }
                } catch (e) { console.warn('[richieste_membri] ui', e); }
            },
            (err) => console.error('[richieste_membri]', err)
        );
    }

    function attachSystemLogs() {
        // Solo da Backup on-demand (troppo rumoroso in live)
        return;
    }

    /** Dipendenze per sezione membro */
    const SECTION_DEPS = {
        generale: [],
        vendite: ['tipiMateriale'],
        materiali: ['tipiMateriale'],
        calcolo: ['tipiMateriale'],
        saldo: ['saldoLogs'],
        inventario: ['inventario', 'logs'],
        calendario: ['calendario'],
        albero: ['albero'],
        gestione: []
    };

    const ATTACH = {
        tipiMateriale: attachTipiMateriale,
        inventario: attachInventario,
        logs: attachLogs,
        saldoLogs: attachSaldoLogs,
        calendario: attachCalendario,
        albero: attachAlbero,
        richieste: attachRichieste,
        systemLogs: attachSystemLogs
    };

    const UNSUB_KEYS = {
        tipiMateriale: ['tipiMateriale'],
        inventario: ['inventario'],
        logs: ['logs'],
        saldoLogs: ['saldoLogs'],
        calendario: ['calendarioAvvento', 'calendarioMesi'],
        albero: ['albero'],
        richieste: ['richieste'],
        systemLogs: ['systemLogs']
    };

    let _activeSectionDeps = new Set();
    let _activeAdminDeps = new Set();

    function _syncDeps(wantedSet, isAdminBucket) {
        const current = isAdminBucket ? _activeAdminDeps : _activeSectionDeps;
        for (const k of [...current]) {
            if (!wantedSet.has(k)) {
                _release(k, UNSUB_KEYS[k]);
                current.delete(k);
            }
        }
        for (const k of wantedSet) {
            if (!current.has(k)) {
                const fn = ATTACH[k];
                if (fn) _acquire(k, fn);
                current.add(k);
            }
        }
        if (isAdminBucket) _activeAdminDeps = current;
        else _activeSectionDeps = current;
    }

    window.ensureSectionData = function(sectionId, adminViewId) {
        const id = sectionId || document.querySelector('.section.active')?.id;
        if (!id) return;

        if (id === 'gestione') {
            const wanted = new Set();
            // Niente listener al solo menu: solo quando apri la sotto-vista
            if (adminViewId === 'inventario' || adminViewId === 'finanze') {
                wanted.add('inventario');
                wanted.add('logs');
                wanted.add('saldoLogs');
            }
            if (adminViewId === 'materiali') wanted.add('tipiMateriale');
            if (adminViewId === 'albero') wanted.add('albero');
            if (adminViewId === 'calendario') wanted.add('calendario');
            if (adminViewId === 'richieste-membri') wanted.add('richieste');
            if (adminViewId === 'classifiche') {
                // Solo dati già in memoria (settimana corrente). Altre settimane: on-demand al cambio filtro.
            }
            _syncDeps(wanted, true);
            return;
        }

        const deps = SECTION_DEPS[id] || [];
        _syncDeps(new Set(deps), false);
    };

    window.releaseSectionData = function(prevId, nextId) {
        // Nessun detach: listener restano per tutta la sessione (live senza ri-letture)
    };

    window.ensureAdminViewData = function(viewId) {
        window.ensureSectionData('gestione', viewId);
    };

    window.releaseAdminViewData = function() {
        // Non staccare: se riapri la stessa tab Gestione non rilegge tutto
    };

    console.info('[Firestore] Core Generale attivo. Sezioni: attach/detach on-demand.');
}

// ---- Lazy load: immagini inventario + storico vendite/materiali ----
// ---- Lazy load: immagini inventario + storico vendite/materiali ----
let itemImagesLoaded = false;
let itemImagesLoading = null;
window.loadItemImagesOnce = async function() {
    if (itemImagesLoaded) return itemImagesLib;
    if (itemImagesLoading) return itemImagesLoading;
    itemImagesLoading = (async () => {
        try {
            const snap = await getDocs(collection(db, 'item_images'));
            itemImagesLib = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            itemImagesLoaded = true;
            scheduleUI(() => {
                window.renderItemImagesLibrary?.();
                window.renderItemImageSelects?.();
            });
        } catch (err) {
            console.warn('[item_images] load', err);
        } finally {
            itemImagesLoading = null;
        }
        return itemImagesLib;
    })();
    return itemImagesLoading;
};

let storicoVenditeLoaded = false;
let storicoMaterialiLoaded = false;
window.loadStoricoVenditeIfNeeded = async function() {
    // DISATTIVATO: non scaricare mai 500+ documenti in automatico.
    // Usa loadStoricoWeek(settimana) solo quando serve (storico / classifiche filtro).
    storicoVenditeLoaded = true;
    return vendite;
};

window.loadStoricoMaterialiIfNeeded = async function() {
    storicoMaterialiLoaded = true;
    return venditeMateriali;
};

// --- LIBRERIA IMMAGINI PNG (Firestore base64, multi-upload, no Storage) ---
const MAX_ITEM_IMAGE_BYTES = 400 * 1024;

window.renderItemImageSelects = function() {
    const sel = document.getElementById('admin-item-foto');
    if (!sel) return;
    const prev = sel.value;
    const sorted = [...itemImagesLib].sort((a, b) => (a.fileName || '').localeCompare(b.fileName || '', undefined, { sensitivity: 'base' }));
    sel.innerHTML = '<option value="">— Nessuna / placeholder —</option>' +
        sorted.map(img => `<option value="${img.id}">${img.fileName || img.id}</option>`).join('');
    if (prev && [...sel.options].some(o => o.value === prev)) sel.value = prev;
};

window.renderItemImagesLibrary = function() {
    const grid = document.getElementById('item-images-grid');
    if (!grid) return;
    if (!itemImagesLib.length) {
        grid.innerHTML = '<p style="grid-column:1/-1; font-size:0.75rem; color:#777; font-style:italic;">Nessuna immagine caricata.</p>';
        return;
    }
    const sorted = [...itemImagesLib].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    grid.innerHTML = sorted.map(img => {
        const name = (img.fileName || 'file.png').replace(/</g, '&lt;');
        return `<div style="position:relative; background:rgba(0,0,0,0.5); border:1px solid #333; border-radius:4px; overflow:hidden; text-align:center;">
            <div style="height:72px; display:flex; align-items:center; justify-content:center; padding:6px;">
                <img src="${img.dataUrl || ''}" alt="" style="max-height:100%; max-width:100%; object-fit:contain;">
            </div>
            <div style="padding:6px; border-top:1px solid #333; font-size:0.6rem; color:var(--gold-accent); word-break:break-all;">${name}</div>
            <button type="button" class="btn-delete" style="position:absolute; top:4px; right:4px; padding:2px 6px;" onclick="window.deleteItemImage('${img.id}', '${name.replace(/'/g, "\\'")}')">X</button>
        </div>`;
    }).join('');
};

window.deleteItemImage = async function(id, name) {
    const res = await Swal.fire({
        title: 'Eliminare immagine?',
        text: name || '',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#8b0000',
        background: '#111',
        color: '#fff'
    });
    if (!res.isConfirmed) return;
    try {
        await deleteDoc(doc(db, 'item_images', id));
        logSystemEvent('inventario', 'elimina_immagine', `Eliminata immagine inventario ${id}`, { id });
        vampireToast('Immagine rimossa dalla libreria.', 'success');
    } catch (err) {
        vampireToast('Errore: ' + (err.message || err), 'error');
    }
};

function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Lettura fallita: ' + file.name));
        reader.readAsDataURL(file);
    });
}

/** Stima byte binari da data URL base64 */
function dataUrlBinarySize(dataUrl) {
    if (!dataUrl || typeof dataUrl !== 'string') return 0;
    const i = dataUrl.indexOf(',');
    const b64 = i >= 0 ? dataUrl.slice(i + 1) : dataUrl;
    // padding base64
    const pad = (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0);
    return Math.max(0, Math.floor((b64.length * 3) / 4) - pad);
}

/**
 * Comprimi un'immagine (File o dataURL) sotto maxBytes ridimensionando su canvas.
 * Restituisce { dataUrl, size, width, height, scaled }.
 */
async function compressImageToMaxBytes(source, maxBytes = MAX_ITEM_IMAGE_BYTES) {
    let bitmap;
    if (typeof source === 'string' && source.startsWith('data:')) {
        const res = await fetch(source);
        const blob = await res.blob();
        bitmap = await createImageBitmap(blob);
    } else if (source instanceof Blob || source instanceof File) {
        bitmap = await createImageBitmap(source);
    } else {
        throw new Error('Sorgente immagine non valida');
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { alpha: true });
    let scale = 1;
    let dataUrl = '';
    let size = Infinity;
    const maxW = 512; // cap lato lungo per inventario
    const startScale = Math.min(1, maxW / Math.max(bitmap.width, bitmap.height, 1));
    scale = startScale;

    for (let attempt = 0; attempt < 12; attempt++) {
        const w = Math.max(1, Math.round(bitmap.width * scale));
        const h = Math.max(1, Math.round(bitmap.height * scale));
        canvas.width = w;
        canvas.height = h;
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(bitmap, 0, 0, w, h);
        // PNG lossless: solo lo scale riduce peso; se ancora troppo, scala ancora
        dataUrl = canvas.toDataURL('image/png');
        size = dataUrlBinarySize(dataUrl);
        if (size <= maxBytes) {
            try { bitmap.close?.(); } catch (_) {}
            return { dataUrl, size, width: w, height: h, scaled: scale < 0.999 };
        }
        scale *= 0.82;
    }
    try { bitmap.close?.(); } catch (_) {}
    return { dataUrl, size, width: canvas.width, height: canvas.height, scaled: true };
}

/**
 * Ottimizza tutte le immagini già in libreria (item_images) sopra il limite
 * e aggiorna gli oggetti inventario che usano quelle foto (campo foto / imageFileName).
 */
window.ottimizzaImmaginiEsistenti = async function() {
    try {
        if (!hasAdminPerm('inventario')) {
            return vampireToast('Non hai il permesso Gestione Inventario.', 'error');
        }
        if (!itemImagesLib.length) {
            return vampireToast('Nessuna immagine in libreria da ottimizzare.', 'info');
        }

        const statusEl = document.getElementById('item-image-status');
        const btn = document.getElementById('item-image-optimize-btn');
        const prevHtml = btn ? btn.innerHTML : '';
        if (btn) { btn.disabled = true; btn.textContent = 'Ottimizzo...'; }
        if (statusEl) {
            statusEl.style.display = 'block';
            statusEl.textContent = 'Analisi immagini in corso...';
        }

        const overLimit = itemImagesLib.filter(img => {
            const s = img.size || dataUrlBinarySize(img.dataUrl);
            return s > MAX_ITEM_IMAGE_BYTES && img.dataUrl;
        });

        if (!overLimit.length) {
            if (btn) { btn.disabled = false; btn.innerHTML = prevHtml || 'Ottimizza immagini esistenti + aggiorna item'; }
            if (statusEl) statusEl.textContent = 'Tutte le immagini sono già sotto i 400 KB.';
            return vampireToast('Nessuna immagine da comprimere (già ok).', 'info');
        }

        let ok = 0, fail = 0, savedBytes = 0;
        const updatedByFileName = {}; // fileName -> new dataUrl
        const updatedByOldUrl = {}; // old dataUrl -> new dataUrl

        for (let i = 0; i < overLimit.length; i++) {
            const img = overLimit[i];
            const label = img.fileName || img.id;
            if (btn) btn.textContent = `Ottimizzo ${i + 1}/${overLimit.length}`;
            if (statusEl) statusEl.textContent = `Comprimo ${i + 1}/${overLimit.length}: ${label}`;
            try {
                const before = img.size || dataUrlBinarySize(img.dataUrl);
                const result = await compressImageToMaxBytes(img.dataUrl, MAX_ITEM_IMAGE_BYTES);
                if (!result.dataUrl) throw new Error('Compressione vuota');
                await setDoc(doc(db, 'item_images', img.id), {
                    dataUrl: result.dataUrl,
                    size: result.size,
                    optimizedAt: Date.now(),
                    width: result.width,
                    height: result.height
                }, { merge: true });
                if (img.fileName) updatedByFileName[img.fileName] = result.dataUrl;
                if (img.dataUrl) updatedByOldUrl[img.dataUrl] = result.dataUrl;
                savedBytes += Math.max(0, before - result.size);
                ok++;
            } catch (err) {
                fail++;
                console.error('[ottimizza]', img.fileName, err);
            }
        }

        // Aggiorna item inventario che referenziano le immagini ottimizzate
        let itemsUpdated = 0;
        if (ok > 0 && Array.isArray(inventarioDati) && inventarioDati.length) {
            if (statusEl) statusEl.textContent = 'Aggiorno oggetti inventario...';
            for (const item of inventarioDati) {
                const id = item.id || item.nome;
                if (!id) continue;
                let newFoto = null;
                if (item.imageFileName && updatedByFileName[item.imageFileName]) {
                    newFoto = updatedByFileName[item.imageFileName];
                } else if (item.foto && updatedByOldUrl[item.foto]) {
                    newFoto = updatedByOldUrl[item.foto];
                }
                if (!newFoto) continue;
                try {
                    await setDoc(doc(db, 'inventario', id), { foto: newFoto }, { merge: true });
                    itemsUpdated++;
                } catch (err) {
                    console.error('[ottimizza item]', id, err);
                }
            }
        }

        if (btn) { btn.disabled = false; btn.innerHTML = prevHtml || 'Ottimizza immagini esistenti + aggiorna item'; }
        const kb = Math.round(savedBytes / 1024);
        const msg = `Ottimizzate ${ok} immagini (−${kb} KB)${itemsUpdated ? `, ${itemsUpdated} item aggiornati` : ''}${fail ? `, ${fail} errori` : ''}.`;
        if (statusEl) statusEl.textContent = msg;
        if (ok > 0) vampireToast(msg, 'success');
        else vampireToast(fail ? 'Ottimizzazione fallita. Vedi console (F12).' : 'Niente da fare.', fail ? 'error' : 'info');
    } catch (err) {
        console.error(err);
        vampireToast('Errore ottimizzazione: ' + (err.message || err), 'error');
        const btn = document.getElementById('item-image-optimize-btn');
        if (btn) { btn.disabled = false; btn.textContent = 'Ottimizza immagini esistenti + aggiorna item'; }
    }
};

window.uploadItemImagesFromInput = async function() {
    console.log('[Vampiri] upload immagini', { isAdmin: currentUser?.isAdmin });
    try {
        if (!hasAdminPerm('inventario')) {
            return vampireToast('Non hai il permesso Gestione Inventario.', 'error');
        }
        const fileInput = document.getElementById('item-image-file');
        const files = fileInput?.files ? Array.from(fileInput.files) : [];
        if (!files.length) return vampireToast('Seleziona uno o più file PNG.', 'error');

        const btn = document.getElementById('item-image-upload-btn');
        const statusEl = document.getElementById('item-image-status');
        const prevHtml = btn ? btn.innerHTML : '';
        if (btn) { btn.disabled = true; btn.textContent = 'Carico...'; }
        if (statusEl) { statusEl.style.display = 'block'; statusEl.textContent = 'Caricamento in corso...'; }

        let ok = 0, skip = 0, fail = 0;
        const existing = new Set(itemImagesLib.map(i => (i.fileName || '').toLowerCase()));

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            if (btn) btn.textContent = `${i + 1}/${files.length}`;
            if (statusEl) statusEl.textContent = `Carico ${i + 1}/${files.length}: ${file.name}`;

            const isPng = file.type === 'image/png' || /\.png$/i.test(file.name);
            if (!isPng) { skip++; continue; }
            const baseName = file.name.replace(/[^\w.\-()+ ]+/g, '_');
            if (existing.has(baseName.toLowerCase())) {
                vampireToast(`"${baseName}" già in libreria, saltato.`, 'info');
                skip++;
                continue;
            }
            try {
                let dataUrl, size = file.size;
                if (file.size > MAX_ITEM_IMAGE_BYTES) {
                    if (statusEl) statusEl.textContent = `Ottimizzo ${file.name} (${Math.round(file.size/1024)} KB)...`;
                    const compressed = await compressImageToMaxBytes(file, MAX_ITEM_IMAGE_BYTES);
                    dataUrl = compressed.dataUrl;
                    size = compressed.size;
                    if (size > MAX_ITEM_IMAGE_BYTES) {
                        vampireToast(`"${file.name}" ancora troppo grande dopo compressione (${Math.round(size/1024)} KB).`, 'error');
                        skip++;
                        continue;
                    }
                } else {
                    dataUrl = await readFileAsDataURL(file);
                }
                await addDoc(collection(db, 'item_images'), {
                    fileName: baseName,
                    dataUrl,
                    size,
                    createdAt: Date.now()
                });
                itemImagesLoaded = false;
                itemImagesLib = [];
                logSystemEvent('inventario', 'upload_img', `Immagine inventario caricata: ${baseName}`, { fileName: baseName, size });
                existing.add(baseName.toLowerCase());
                ok++;
            } catch (err) {
                fail++;
                console.error(err);
                const msg = err?.message || String(err);
                if (String(err?.code || '').includes('permission') || msg.toLowerCase().includes('permission')) {
                    vampireToast('Permesso negato su item_images. Controlla le regole Firestore.', 'error');
                } else {
                    vampireToast(`Errore su "${file.name}": ${msg}`, 'error');
                }
            }
        }

        if (fileInput) fileInput.value = '';
        if (btn) { btn.disabled = false; btn.innerHTML = prevHtml || 'Carica PNG'; }
        if (statusEl) {
            statusEl.textContent = ok > 0
                ? `Completato: ${ok} caricate${skip ? ', ' + skip + ' saltate' : ''}.`
                : 'Nessuna immagine nuova caricata.';
        }
        if (ok > 0) vampireToast(`Caricate ${ok} immagini${skip ? ' (' + skip + ' saltate)' : ''}.`, 'success');
        else if (skip && !fail) vampireToast('Nessuna nuova immagine (già presenti o non valide).', 'info');
        else if (fail) vampireToast('Caricamento fallito. Vedi console (F12).', 'error');
    } catch (err) {
        console.error(err);
        vampireToast('Errore upload: ' + (err.message || err), 'error');
        const btn = document.getElementById('item-image-upload-btn');
        if (btn) { btn.disabled = false; btn.textContent = 'Carica PNG'; }
    }
};

// --- TIPI MATERIALE (config admin) ---
// % Propria e % Dinastia sono entrambe modificabili (si completano a 100)
window.syncPercFromPropria = () => {
    const pro = parseFloat(document.getElementById('adm-mat-perc-pro')?.value);
    const dinEl = document.getElementById('adm-mat-perc-din');
    if (dinEl && !isNaN(pro)) dinEl.value = Math.max(0, Math.min(100, 100 - pro));
};
window.syncPercFromDinastia = () => {
    const din = parseFloat(document.getElementById('adm-mat-perc-din')?.value);
    const proEl = document.getElementById('adm-mat-perc-pro');
    if (proEl && !isNaN(din)) proEl.value = Math.max(0, Math.min(100, 100 - din));
};
window.syncPercDinastia = window.syncPercFromPropria;

window.resetFormTipoMateriale = () => {
    const ids = ['adm-mat-nome','adm-mat-prezzo','adm-mat-edit-id'];
    ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    if (document.getElementById('adm-mat-perc-pro')) document.getElementById('adm-mat-perc-pro').value = 40;
    if (document.getElementById('adm-mat-perc-din')) document.getElementById('adm-mat-perc-din').value = 60;
    if (document.getElementById('adm-mat-perc-ekaton')) document.getElementById('adm-mat-perc-ekaton').value = 50;
    if (document.getElementById('adm-mat-sez-vendite')) document.getElementById('adm-mat-sez-vendite').checked = true;
    if (document.getElementById('adm-mat-sez-materiali')) document.getElementById('adm-mat-sez-materiali').checked = true;
};

window.salvaTipoMateriale = async () => {
    const nome = (document.getElementById('adm-mat-nome')?.value || '').trim();
    const prezzo = parseFloat(document.getElementById('adm-mat-prezzo')?.value);
    let percPro = parseFloat(document.getElementById('adm-mat-perc-pro')?.value);
    let percDin = parseFloat(document.getElementById('adm-mat-perc-din')?.value);
    const percEkaton = parseFloat(document.getElementById('adm-mat-perc-ekaton')?.value);
    const sezVendite = !!document.getElementById('adm-mat-sez-vendite')?.checked;
    const sezMateriali = !!document.getElementById('adm-mat-sez-materiali')?.checked;
    const editId = (document.getElementById('adm-mat-edit-id')?.value || '').trim();

    if (!nome) return vampireToast('Nome materiale obbligatorio.', 'error');
    if (isNaN(prezzo) || prezzo < 0) return vampireToast('Prezzo unitario non valido.', 'error');
    if (isNaN(percPro) || percPro < 0 || percPro > 100) return vampireToast('% Propria non valida (0-100).', 'error');
    if (isNaN(percDin) || percDin < 0 || percDin > 100) return vampireToast('% Dinastia non valida (0-100).', 'error');
    if (isNaN(percEkaton) || percEkaton < 0 || percEkaton > 100) return vampireToast('% Ekaton non valida (0-100).', 'error');
    // Se non sommano a 100, normalizza mantenendo i valori relativi
    const sumPerc = percPro + percDin;
    if (Math.abs(sumPerc - 100) > 0.01) {
        if (sumPerc <= 0) {
            percPro = 40; percDin = 60;
        } else {
            // Preferisci i valori inseriti: se l'utente ha modificato entrambi, ribilancia sul totale
            percPro = Math.round((percPro / sumPerc) * 1000) / 10;
            percDin = Math.round((100 - percPro) * 10) / 10;
        }
        vampireToast(`Percentuali ribilanciate a ${percPro}% / ${percDin}% (totale 100%).`, 'info');
    }
    if (!sezVendite && !sezMateriali) return vampireToast('Seleziona almeno una sezione di visibilità.', 'error');

    const sezioni = [];
    if (sezVendite) sezioni.push('vendite');
    if (sezMateriali) sezioni.push('materiali');

    const data = {
        nome,
        prezzoUnitario: prezzo,
        percPropria: percPro,
        percDinastia: percDin,
        percEkaton,
        sezioni,
        attivo: true,
        updatedAt: Date.now()
    };

    try {
        if (editId) {
            await setDoc(doc(db, 'tipi_materiale', editId), data, { merge: true });
            logSystemEvent('materiali', 'modifica_tipo', 'Tipo materiale aggiornato', null);
        vampireToast('Tipo materiale aggiornato.', 'success');
        } else {
            data.createdAt = Date.now();
            await addDoc(collection(db, 'tipi_materiale'), data);
            logSystemEvent('materiali', 'crea_tipo', 'Tipo materiale creato', null);
        vampireToast('Tipo materiale creato.', 'success');
        }
        window.resetFormTipoMateriale();
    } catch (err) {
        console.error(err);
        vampireToast('Errore salvataggio: ' + (err.message || err), 'error');
    }
};

window.caricaTipoMaterialePerEdit = (id) => {
    const t = tipiMateriale.find(x => x.id === id);
    if (!t) return;
    document.getElementById('adm-mat-edit-id').value = t.id;
    document.getElementById('adm-mat-nome').value = t.nome || '';
    document.getElementById('adm-mat-prezzo').value = t.prezzoUnitario ?? '';
    document.getElementById('adm-mat-perc-pro').value = t.percPropria ?? 40;
    document.getElementById('adm-mat-perc-din').value = t.percDinastia ?? 60;
    document.getElementById('adm-mat-perc-ekaton').value = t.percEkaton ?? 50;
    document.getElementById('adm-mat-sez-vendite').checked = (t.sezioni || []).includes('vendite');
    document.getElementById('adm-mat-sez-materiali').checked = (t.sezioni || []).includes('materiali');
    vampireToast('Dati caricati. Modifica e premi Salva Tipo.', 'info');
};

window.eliminaTipoMateriale = async (id) => {
    const res = await Swal.fire({
        title: 'Eliminare questo tipo?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#8b0000',
        background: '#111',
        color: '#fff'
    });
    if (!res.isConfirmed) return;
    try {
        await deleteDoc(doc(db, 'tipi_materiale', id));
        logSystemEvent('materiali', 'elimina_tipo', `Eliminato tipo materiale ${id}`, { id });
        vampireToast('Tipo rimosso.', 'success');
    } catch (err) {
        vampireToast('Errore: ' + (err.message || err), 'error');
    }
};

window.renderAdminTipiMateriale = () => {
    const tbody = document.getElementById('admin-tipi-materiale-body');
    if (!tbody) return;
    const sorted = [...tipiMateriale].sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'it'));
    tbody.innerHTML = sorted.map(t => {
        const sez = (t.sezioni || []).map(s => s === 'vendite' ? 'Vendite' : 'Materiali').join(', ') || '—';
        return `<tr>
            <td><strong>${t.nome || ''}</strong></td>
            <td style="color:var(--gold-dim)">${fmt(t.prezzoUnitario)} cr</td>
            <td>${t.percPropria ?? 0}% / ${t.percDinastia ?? 0}%</td>
            <td>${t.percEkaton ?? 50}%</td>
            <td style="font-size:0.65rem;">${sez}</td>
            <td>
                <button class="btn-delete" style="border-color:var(--gold-accent);color:var(--gold-accent);margin-right:4px;" onclick="window.caricaTipoMaterialePerEdit('${t.id}')">Modifica</button>
                <button class="btn-delete" onclick="window.eliminaTipoMateriale('${t.id}')">Elimina</button>
            </td>
        </tr>`;
    }).join('') || '<tr><td colspan="6" style="opacity:0.5;text-align:center;">Nessun tipo configurato. Aggiungine uno sopra.</td></tr>';
};

window.popolaSelectTipiMateriale = () => {
    const venditeSel = document.getElementById('vamp-tipo-mat');
    const matSel = document.getElementById('mat-tipo-select');
    const attivi = tipiMateriale.filter(t => t.attivo !== false);

    if (venditeSel) {
        const prev = venditeSel.value;
        const opts = attivi.filter(t => (t.sezioni || []).includes('vendite'))
            .sort((a,b) => (a.nome||'').localeCompare(b.nome||'', 'it'));
        venditeSel.innerHTML = '<option value="">— Seleziona —</option>' +
            opts.map(t => `<option value="${t.id}">${t.nome} (${fmt(t.prezzoUnitario)} cr)</option>`).join('');
        if (prev && [...venditeSel.options].some(o => o.value === prev)) venditeSel.value = prev;
        window.updateVenditaPreview();
    }
    if (matSel) {
        const prev = matSel.value;
        const opts = attivi.filter(t => (t.sezioni || []).includes('materiali'))
            .sort((a,b) => (a.nome||'').localeCompare(b.nome||'', 'it'));
        matSel.innerHTML = '<option value="">— Seleziona materiale —</option>' +
            opts.map(t => `<option value="${t.id}">${t.nome} (${fmt(t.prezzoUnitario)} cr)</option>`).join('');
        if (prev && [...matSel.options].some(o => o.value === prev)) matSel.value = prev;
        window.updateMatPreview();
    }
};

window.onVenditaTipoChange = () => window.updateVenditaPreview();
window.onMatTipoChange = () => window.updateMatPreview();

window.updateVenditaPreview = () => {
    const tipoId = document.getElementById('vamp-tipo-mat')?.value || '';
    const qty = parseFloat(document.getElementById('vamp-qty')?.value) || 0;
    const cfg = tipiMateriale.find(t => t.id === tipoId);
    const unEl = document.getElementById('vamp-preview-un');
    const totEl = document.getElementById('vamp-preview-tot');
    const proEl = document.getElementById('vamp-preview-pro');
    const dinEl = document.getElementById('vamp-preview-din');
    if (!cfg) {
        if (unEl) unEl.textContent = '—';
        if (totEl) totEl.textContent = '—';
        if (proEl) proEl.textContent = '—';
        if (dinEl) dinEl.textContent = '—';
        return;
    }
    const un = Number(cfg.prezzoUnitario) || 0;
    const tot = un * qty;
    const pro = tot * ((Number(cfg.percPropria) || 0) / 100);
    const din = tot * ((Number(cfg.percDinastia) || 0) / 100);
    const ek = din * ((Number(cfg.percEkaton) || 50) / 100);
    if (unEl) unEl.textContent = fmt(un) + ' cr';
    if (totEl) totEl.textContent = fmt(tot) + ' cr';
    if (proEl) proEl.textContent = fmt(pro) + ' cr';
    if (dinEl) dinEl.textContent = fmt(din) + ' / ' + fmt(ek) + ' cr';
};

window.updateMatPreview = () => {
    const tipoId = document.getElementById('mat-tipo-select')?.value || '';
    const qty = parseFloat(document.getElementById('mat-qty')?.value) || 0;
    const cfg = tipiMateriale.find(t => t.id === tipoId);
    const unEl = document.getElementById('mat-preview-un');
    const totEl = document.getElementById('mat-preview-tot');
    const splitEl = document.getElementById('mat-preview-split');
    if (!cfg) {
        if (unEl) unEl.textContent = '—';
        if (totEl) totEl.textContent = '—';
        if (splitEl) splitEl.textContent = '—';
        return;
    }
    const un = Number(cfg.prezzoUnitario) || 0;
    const tot = un * qty;
    const pro = tot * ((Number(cfg.percPropria) || 0) / 100);
    const din = tot * ((Number(cfg.percDinastia) || 0) / 100);
    const ek = din * ((Number(cfg.percEkaton) || 50) / 100);
    if (unEl) unEl.textContent = fmt(un) + ' cr';
    if (totEl) totEl.textContent = fmt(tot) + ' cr';
    if (splitEl) splitEl.textContent = `${fmt(pro)} / ${fmt(din)} / ${fmt(ek)}`;
};

// Legacy stubs (vecchi controlli rimossi dall'UI)
window.toggleTipoVendita = () => {};
window.updateMatTot = () => window.updateMatPreview();





// --- PROTEZIONE INTERFACCIA ---
document.addEventListener('contextmenu', event => event.preventDefault());

document.onkeydown = function(e) {
    if (e.keyCode == 123) return false; 
    if (e.ctrlKey && e.shiftKey && e.keyCode == 'I'.charCodeAt(0)) return false; 
    if (e.ctrlKey && e.shiftKey && e.keyCode == 'C'.charCodeAt(0)) return false; 
    if (e.ctrlKey && e.shiftKey && e.keyCode == 'J'.charCodeAt(0)) return false; 
    if (e.ctrlKey && e.keyCode == 'U'.charCodeAt(0)) return false; 
};

// --- ALBERO GENEALOGICO (layout a coordinate + SVG) ---
const PLACEHOLDER_FOTO = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='72' height='72' viewBox='0 0 72 72'%3E%3Crect fill='%231a1a1a' width='72' height='72'/%3E%3Ccircle cx='36' cy='28' r='12' fill='%23c5a059' opacity='0.4'/%3E%3Cpath d='M12 62c0-13 11-24 24-24s24 11 24 24' fill='%23c5a059' opacity='0.35'/%3E%3C/svg%3E";

function alberoNomeCompleto(n) {
    if (!n) return '—';
    return [n.nome, n.cognome].filter(Boolean).join(' ') || n.id || '—';
}

window.popolaSelectParentAlbero = () => {
    const editId = (document.getElementById('adm-albero-edit-id')?.value || '').trim();
    const opts = alberoNodi
        .filter(n => n.id !== editId)
        .sort((a, b) => alberoNomeCompleto(a).localeCompare(alberoNomeCompleto(b), 'it'));
    const optionsHtml = opts.map(n => `<option value="${n.id}" data-search="${alberoNomeCompleto(n).toLowerCase()} ${(n.clan || '').toLowerCase()}">${alberoNomeCompleto(n)}</option>`).join('');

    const selects = [
        { id: 'adm-albero-parent', empty: '— Nessuno (è una radice) —' },
        { id: 'adm-albero-parent2', empty: '— Nessuno —' },
        { id: 'adm-albero-spouse', empty: '— Nessuno —' }
    ];
    selects.forEach(({ id, empty }) => {
        const sel = document.getElementById(id);
        if (!sel) return;
        const prev = sel.value;
        sel.innerHTML = `<option value="">${empty}</option>` + optionsHtml;
        if (prev && [...sel.options].some(o => o.value === prev)) sel.value = prev;
    });

    const fratSel = document.getElementById('adm-albero-fratelli');
    if (fratSel) {
        const prevMulti = [...fratSel.selectedOptions].map(o => o.value);
        fratSel.innerHTML = optionsHtml;
        prevMulti.forEach(v => {
            const opt = [...fratSel.options].find(o => o.value === v);
            if (opt) opt.selected = true;
        });
        if (typeof window.filtraSelectFratelliAlbero === 'function') {
            window.filtraSelectFratelliAlbero();
        }
    }
};

window.filtraSelectFratelliAlbero = () => {
    const searchEl = document.getElementById('adm-albero-fratelli-search');
    const fratSel = document.getElementById('adm-albero-fratelli');
    if (!fratSel) return;
    const q = (searchEl?.value || '').trim().toLowerCase();
    [...fratSel.options].forEach(opt => {
        const hay = (opt.getAttribute('data-search') || opt.textContent || '').toLowerCase();
        opt.hidden = q ? !hay.includes(q) : false;
    });
};

window.resetFormAlbero = () => {
    ['adm-albero-nome','adm-albero-cognome','adm-albero-clan','adm-albero-anno','adm-albero-foto-url','adm-albero-note','adm-albero-edit-id','adm-albero-relazione'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    if (document.getElementById('adm-albero-ordine')) document.getElementById('adm-albero-ordine').value = '0';
    ['adm-albero-parent','adm-albero-parent2','adm-albero-spouse'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    const fratSel = document.getElementById('adm-albero-fratelli');
    if (fratSel) [...fratSel.options].forEach(o => { o.selected = false; });
    const fileInput = document.getElementById('adm-albero-foto-file');
    if (fileInput) fileInput.value = '';
    window.popolaSelectParentAlbero();
};

window.caricaNodoAlberoPerEdit = (id) => {
    const n = alberoNodi.find(x => x.id === id);
    if (!n) return vampireToast('Nodo non trovato.', 'error');
    document.getElementById('adm-albero-edit-id').value = n.id;
    document.getElementById('adm-albero-nome').value = n.nome || '';
    document.getElementById('adm-albero-cognome').value = n.cognome || '';
    document.getElementById('adm-albero-clan').value = n.clan || '';
    document.getElementById('adm-albero-anno').value = n.anno || '';
    document.getElementById('adm-albero-ordine').value = n.ordine ?? 0;
    document.getElementById('adm-albero-foto-url').value = n.foto || '';
    document.getElementById('adm-albero-note').value = n.note || '';
    document.getElementById('adm-albero-relazione').value = n.relazione || '';
    window.popolaSelectParentAlbero();
    if (document.getElementById('adm-albero-parent')) document.getElementById('adm-albero-parent').value = n.parentId || '';
    if (document.getElementById('adm-albero-parent2')) document.getElementById('adm-albero-parent2').value = n.parent2Id || '';
    if (document.getElementById('adm-albero-spouse')) document.getElementById('adm-albero-spouse').value = n.spouseId || '';
    const fratSel = document.getElementById('adm-albero-fratelli');
    if (fratSel && Array.isArray(n.fratelliIds)) {
        [...fratSel.options].forEach(o => { o.selected = n.fratelliIds.includes(o.value); });
    }
    document.getElementById('adm-albero-nome')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
};

window.salvaNodoAlbero = async () => {
    if (!hasAdminPerm('albero')) return vampireToast('Non hai il permesso Albero Genealogico.', 'error');
    const nome = (document.getElementById('adm-albero-nome')?.value || '').trim();
    const cognome = (document.getElementById('adm-albero-cognome')?.value || '').trim();
    const clan = (document.getElementById('adm-albero-clan')?.value || '').trim();
    const anno = (document.getElementById('adm-albero-anno')?.value || '').trim();
    const parentId = (document.getElementById('adm-albero-parent')?.value || '').trim() || null;
    const parent2Id = (document.getElementById('adm-albero-parent2')?.value || '').trim() || null;
    const spouseId = (document.getElementById('adm-albero-spouse')?.value || '').trim() || null;
    const relazione = (document.getElementById('adm-albero-relazione')?.value || '').trim();
    const ordine = parseInt(document.getElementById('adm-albero-ordine')?.value, 10) || 0;
    const note = (document.getElementById('adm-albero-note')?.value || '').trim();
    let foto = (document.getElementById('adm-albero-foto-url')?.value || '').trim();
    const editId = (document.getElementById('adm-albero-edit-id')?.value || '').trim();
    const fileInput = document.getElementById('adm-albero-foto-file');
    const fratelliSel = document.getElementById('adm-albero-fratelli');
    const fratelliIds = fratelliSel
        ? [...fratelliSel.selectedOptions].map(o => o.value).filter(Boolean)
        : [];

    if (!nome && !cognome) return vampireToast('Inserisci almeno il nome.', 'error');
    if (parentId && parent2Id && parentId === parent2Id) {
        return vampireToast('Genitore principale e secondo genitore non possono essere la stessa persona.', 'error');
    }
    if (spouseId && (spouseId === parentId || spouseId === parent2Id)) {
        return vampireToast('Il coniuge non può essere anche un genitore della stessa persona.', 'error');
    }
    if (editId && (parentId === editId || parent2Id === editId || spouseId === editId)) {
        return vampireToast('Una persona non può essere genitore o coniuge di se stessa.', 'error');
    }
    if (editId && fratelliIds.includes(editId)) {
        return vampireToast('Non puoi selezionare te stesso come fratello.', 'error');
    }
    if (spouseId && fratelliIds.includes(spouseId)) {
        return vampireToast('Il coniuge non può essere anche nella lista fratelli.', 'error');
    }

    let relazioneFinal = relazione;
    if (!relazioneFinal) {
        relazioneFinal = parentId ? 'Figlio' : 'Originario';
    }

    if (parentId) {
        const fratelli = alberoNodi.filter(n => n.parentId === parentId && n.id !== editId);
        if (fratelli.length) {
            const nomi = fratelli.map(f => alberoNomeCompleto(f)).join(', ');
            setTimeout(() => vampireToast(`Fratelli/sorelle con stesso genitore: ${nomi}`, 'info'), 600);
        }
    }

    try {
        if (fileInput?.files?.length) {
            const file = fileInput.files[0];
            if (file.size > 450 * 1024) {
                return vampireToast('Foto troppo grande (max ~450 KB). Usa URL o comprimi.', 'error');
            }
            foto = await readFileAsDataURL(file);
        }

        if (editId && !foto) {
            const existing = alberoNodi.find(x => x.id === editId);
            if (existing?.foto) foto = existing.foto;
        }

        const data = {
            nome,
            cognome,
            clan,
            anno,
            parentId,
            parent2Id,
            spouseId,
            fratelliIds,
            relazione: relazioneFinal,
            ordine,
            note,
            foto: foto || '',
            updatedAt: Date.now()
        };

        if (editId) {
            await setDoc(doc(db, 'albero_genealogico', editId), data, { merge: true });
            logSystemEvent('albero', 'modifica', `Aggiornato nodo albero: ${nome} ${cognome}`.trim(), { id: editId, nome, cognome });
            vampireToast('Nodo aggiornato.', 'success');
        } else {
            data.createdAt = Date.now();
            await addDoc(collection(db, 'albero_genealogico'), data);
            logSystemEvent('albero', 'crea', `Aggiunto nodo albero: ${nome} ${cognome}`.trim(), { nome, cognome, parentId });
            vampireToast('Nodo aggiunto all\'albero.', 'success');
        }
        window.resetFormAlbero();
    } catch (err) {
        console.error(err);
        vampireToast('Errore: ' + (err.message || err), 'error');
    }
};

window.eliminaNodoAlbero = async (id) => {
    const res = await Swal.fire({
        title: 'Eliminare questo nodo?',
        text: 'I discendenti restano ma senza legame.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#8b0000',
        background: '#111',
        color: '#fff'
    });
    if (!res.isConfirmed) return;
    try {
        await deleteDoc(doc(db, 'albero_genealogico', id));
        logSystemEvent('albero', 'elimina', `Eliminato nodo albero ${id}`, { id });
        vampireToast('Nodo rimosso.', 'success');
    } catch (err) {
        vampireToast('Errore: ' + (err.message || err), 'error');
    }
};

window.toggleStatoAlbero = async (id, field) => {
    if (!hasAdminPerm('albero')) return vampireToast('Non hai il permesso Albero Genealogico.', 'error');
    const n = alberoNodi.find(x => x.id === id);
    if (!n) return;
    const next = !n[field];
    try {
        await setDoc(doc(db, 'albero_genealogico', id), { [field]: next, updatedAt: Date.now() }, { merge: true });
        logSystemEvent('albero', 'stato', `${field} → ${next} per ${alberoNomeCompleto(n)}`, { id, field, next });
    } catch (err) {
        vampireToast('Errore: ' + (err.message || err), 'error');
    }
};

window.renderAdminAlbero = () => {
    const tbody = document.getElementById('admin-albero-body');
    if (!tbody) return;
    const search = (document.getElementById('search-admin-albero')?.value || '').toLowerCase().trim();
    let sorted = [...alberoNodi].sort((a, b) => (a.ordine ?? 0) - (b.ordine ?? 0) || alberoNomeCompleto(a).localeCompare(alberoNomeCompleto(b), 'it'));
    if (search) {
        sorted = sorted.filter(n => {
            const full = alberoNomeCompleto(n).toLowerCase();
            const p1 = n.parentId ? alberoNomeCompleto(alberoNodi.find(x => x.id === n.parentId)) : '';
            const p2 = n.parent2Id ? alberoNomeCompleto(alberoNodi.find(x => x.id === n.parent2Id)) : '';
            const spouse = n.spouseId ? alberoNomeCompleto(alberoNodi.find(x => x.id === n.spouseId)) : '';
            return full.includes(search) ||
                (n.clan || '').toLowerCase().includes(search) ||
                (n.relazione || '').toLowerCase().includes(search) ||
                p1.toLowerCase().includes(search) ||
                p2.toLowerCase().includes(search) ||
                spouse.toLowerCase().includes(search);
        });
    }
    tbody.innerHTML = sorted.map(n => {
        const full = alberoNomeCompleto(n);
        const p1 = n.parentId ? alberoNomeCompleto(alberoNodi.find(x => x.id === n.parentId)) : '';
        const p2 = n.parent2Id ? alberoNomeCompleto(alberoNodi.find(x => x.id === n.parent2Id)) : '';
        const parents = [p1, p2].filter(Boolean).join(' + ') || '—';
        const spouse = n.spouseId ? alberoNomeCompleto(alberoNodi.find(x => x.id === n.spouseId)) : '—';
        const fotoSrc = n.foto || PLACEHOLDER_FOTO;
        const isMorto = !!n.morto;
        const isReietto = !!n.reietto;
        const isRito = !!n.ritoCarne;
        const statiBadges = [
            isMorto ? '<span class="stato-badge stato-morto" title="Morto">💀 Morto</span>' : '',
            isReietto ? '<span class="stato-badge stato-reietto" title="Reietto">🐀 Reietto</span>' : '',
            isRito ? '<span class="stato-badge stato-rito" title="Rito della Carne">🥩 Rito Carne</span>' : ''
        ].filter(Boolean).join(' ');
        return `<tr>
            <td><img src="${fotoSrc}" alt="" loading="lazy" decoding="async" onerror="this.src='${PLACEHOLDER_FOTO}'"></td>
            <td>
                <strong>${full}</strong><br>
                <span style="opacity:0.6;font-size:0.6rem;">${n.clan || ''}</span>
                ${statiBadges ? `<div class="stati-admin-row">${statiBadges}</div>` : ''}
            </td>
            <td style="font-size:0.65rem;color:var(--gold-dim);">${n.relazione || '—'}</td>
            <td style="font-size:0.65rem;">${parents}</td>
            <td style="font-size:0.65rem;">${spouse}</td>
            <td style="white-space:nowrap;">
                <button type="button" class="btn-stato ${isMorto ? 'is-active' : ''}" title="${isMorto ? 'Rimuovi Morto' : 'Segna come Morto'}" onclick="window.toggleStatoAlbero('${n.id}','morto')">💀</button>
                <button type="button" class="btn-stato ${isReietto ? 'is-active' : ''}" title="${isReietto ? 'Rimuovi Reietto' : 'Segna come Reietto'}" onclick="window.toggleStatoAlbero('${n.id}','reietto')">🐀</button>
                <button type="button" class="btn-stato ${isRito ? 'is-active' : ''}" title="${isRito ? 'Rimuovi Rito della Carne' : 'Segna Rito della Carne'}" onclick="window.toggleStatoAlbero('${n.id}','ritoCarne')">🥩</button>
                <button class="btn-delete" style="border-color:var(--gold-accent);color:var(--gold-accent);margin-right:4px;" onclick="window.caricaNodoAlberoPerEdit('${n.id}')">Modifica</button>
                <button class="btn-delete" onclick="window.eliminaNodoAlbero('${n.id}')">Elimina</button>
            </td>
        </tr>`;
    }).join('') || '<tr><td colspan="6" style="opacity:0.5;text-align:center;">Nessun nodo trovato.</td></tr>';
};

/* ============================================================
   LAYOUT ENGINE v5 — sottoalberi: i figli stanno SOTTO il genitore
   Appartenenza chiara per posizione + colore linea famiglia
   ============================================================ */
const ALBERO_LAYOUT = {
    NODE_W: 108,
    NODE_H: 152,
    H_GAP: 14,       // tra fratelli / sottoalberi affiancati
    V_GAP: 68,       // tra genitore e figli
    COUPLE_GAP: 8,
    PAD: 28,
    FOREST_GAP: 36   // tra alberi radice distinti
};

/** Palette linee per famiglia (ciclo) — aiuta a distinguere i rami */
const ALBERO_EDGE_COLORS = [
    '#c5a059', '#e74c3c', '#5dade2', '#58d68d',
    '#af7ac5', '#f5b041', '#48c9b0', '#ec7063'
];

const alberoCollapsed = new Set();
let alberoCollapseSeeded = true;

function alberoSeedCollapsedDefault(nodes) {
    alberoCollapsed.clear();
    if (!nodes || !nodes.length) return;
    const byId = Object.create(null);
    nodes.forEach(n => { byId[n.id] = n; });
    nodes.forEach(n => {
        if (n.parentId && byId[n.parentId]) alberoCollapsed.add(n.parentId);
        if (n.parent2Id && byId[n.parent2Id]) alberoCollapsed.add(n.parent2Id);
    });
}

function alberoEscape(s) {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function alberoSortNodes(arr) {
    return arr.slice().sort((a, b) =>
        (a.ordine ?? 0) - (b.ordine ?? 0) ||
        alberoNomeCompleto(a).localeCompare(alberoNomeCompleto(b), 'it')
    );
}

/**
 * Unità = persona singola oppure coppia (coniugi).
 * I figli si agganciano all'unità del genitore e vengono centrati sotto di essa.
 */

/** Indice relazioni per le card (genitori, figli, fratelli, coniuge) */
function alberoBuildRelIndex(nodes) {
    const byId = Object.create(null);
    nodes.forEach(n => { byId[n.id] = n; });

    const childrenOf = Object.create(null);
    nodes.forEach(n => {
        [n.parentId, n.parent2Id].forEach(pid => {
            if (pid && byId[pid]) {
                if (!childrenOf[pid]) childrenOf[pid] = [];
                if (!childrenOf[pid].includes(n)) childrenOf[pid].push(n);
            }
        });
    });
    Object.keys(childrenOf).forEach(k => {
        childrenOf[k] = alberoSortNodes(childrenOf[k]);
    });

    const rels = Object.create(null);
    nodes.forEach(n => {
        const parents = [];
        if (n.parentId && byId[n.parentId]) parents.push(byId[n.parentId]);
        if (n.parent2Id && byId[n.parent2Id] && n.parent2Id !== n.parentId) parents.push(byId[n.parent2Id]);

        const spouse = (n.spouseId && byId[n.spouseId]) ? byId[n.spouseId] : null;
        const children = childrenOf[n.id] || [];

        // Fratelli: stesso parentId / parent2Id, oppure fratelliIds espliciti
        const sibSet = new Set();
        const addSibsFromParent = (pid) => {
            if (!pid || !childrenOf[pid]) return;
            childrenOf[pid].forEach(s => {
                if (s.id !== n.id) sibSet.add(s.id);
            });
        };
        addSibsFromParent(n.parentId);
        addSibsFromParent(n.parent2Id);
        if (Array.isArray(n.fratelliIds)) {
            n.fratelliIds.forEach(fid => {
                if (fid !== n.id && byId[fid]) sibSet.add(fid);
            });
        }
        const siblings = alberoSortNodes([...sibSet].map(id => byId[id]).filter(Boolean));

        rels[n.id] = {
            parents: parents.map(alberoNomeCompleto),
            spouse: spouse ? alberoNomeCompleto(spouse) : null,
            children: children.map(alberoNomeCompleto),
            siblings: siblings.map(alberoNomeCompleto)
        };
    });
    return rels;
}

function alberoFormatRelList(names, maxShow) {
    maxShow = maxShow || 2;
    if (!names || !names.length) return '';
    if (names.length <= maxShow) return names.join(', ');
    return names.slice(0, maxShow).join(', ') + ' +' + (names.length - maxShow);
}

function alberoComputeLayout(nodes) {
    const L = ALBERO_LAYOUT;
    if (!nodes || !nodes.length) {
        return { width: 400, height: 200, nodes: [], edges: [], couples: [] };
    }

    const relIndex = alberoBuildRelIndex(nodes);
    const byId = Object.create(null);
    nodes.forEach(n => { byId[n.id] = n; });

    // --- Costruisci unità (coppie / singoli) ---
    const used = new Set();
    const units = []; // { id, members, personIds:Set, children:[], parent:null, ...layout }
    const personToUnit = Object.create(null);

    function makeUnit(members) {
        const u = {
            id: 'u_' + members.map(m => m.id).join('_'),
            members,
            personIds: new Set(members.map(m => m.id)),
            children: [],
            parent: null,
            // layout
            x: 0, y: 0, width: 0, height: 0,
            headW: 0, headH: L.NODE_H, headX: 0, headY: 0,
            collapsed: false,
            colorIdx: 0
        };
        units.push(u);
        members.forEach(m => { personToUnit[m.id] = u; });
        return u;
    }

    alberoSortNodes(nodes).forEach(n => {
        if (used.has(n.id)) return;
        const sp = n.spouseId && byId[n.spouseId] ? byId[n.spouseId] : null;
        if (sp && !used.has(sp.id)
            && n.parentId !== sp.id && sp.parentId !== n.id) {
            used.add(n.id);
            used.add(sp.id);
            makeUnit(alberoSortNodes([n, sp]));
        } else {
            used.add(n.id);
            makeUnit([n]);
        }
    });

    // --- Collegamenti genitore → figlio (via parentId) ---
    nodes.forEach(n => {
        if (!n.parentId || !byId[n.parentId]) return;
        const childU = personToUnit[n.id];
        const parentU = personToUnit[n.parentId];
        if (!childU || !parentU || childU === parentU) return;

        // evita cicli
        let p = parentU;
        const seen = new Set();
        while (p) {
            if (p === childU || seen.has(p.id)) return;
            seen.add(p.id);
            p = p.parent;
        }

        if (!parentU.children.includes(childU)) {
            parentU.children.push(childU);
            childU.parent = parentU;
        }
    });

    // Ordina figli
    units.forEach(u => {
        u.children.sort((a, b) => {
            const na = a.members[0], nb = b.members[0];
            return (na.ordine ?? 0) - (nb.ordine ?? 0) ||
                alberoNomeCompleto(na).localeCompare(alberoNomeCompleto(nb), 'it');
        });
    });

    const roots = units.filter(u => !u.parent);

    // --- Layout ricorsivo: misura ---
    function measure(u, visiting) {
        visiting = visiting || new Set();
        if (visiting.has(u.id)) {
            u.width = L.NODE_W;
            u.height = L.NODE_H;
            u.headW = L.NODE_W;
            u._kids = [];
            return;
        }
        visiting.add(u.id);

        u.collapsed = u.members.some(m => alberoCollapsed.has(m.id));
        u.headW = u.members.length === 2
            ? L.NODE_W * 2 + L.COUPLE_GAP
            : L.NODE_W;
        u.headH = L.NODE_H;

        const kids = u.collapsed ? [] : u.children.filter(c => !visiting.has(c.id));
        kids.forEach(c => measure(c, visiting));
        u._kids = kids;

        if (!kids.length) {
            u.width = u.headW;
            u.height = u.headH;
            return;
        }
        const kidsW = kids.reduce((s, c, i) => s + c.width + (i ? L.H_GAP : 0), 0);
        u.width = Math.max(u.headW, kidsW);
        const kidsH = Math.max(...kids.map(c => c.height));
        u.height = u.headH + L.V_GAP + kidsH;
    }

    // --- Layout ricorsivo: posiziona ---
    function place(u, x, y, colorIdx) {
        u.x = x;
        u.y = y;
        u.colorIdx = colorIdx;
        u.headX = x + (u.width - u.headW) / 2;
        u.headY = y;

        const kids = u._kids || [];
        if (!kids.length) return;

        const kidsW = kids.reduce((s, c, i) => s + c.width + (i ? L.H_GAP : 0), 0);
        let cx = x + (u.width - kidsW) / 2;
        const cy = y + u.headH + L.V_GAP;

        kids.forEach((c, i) => {
            // ogni sotto-famiglia ha un colore derivato
            place(c, cx, cy, (colorIdx + 1 + i) % ALBERO_EDGE_COLORS.length);
            cx += c.width + L.H_GAP;
        });
    }

    const placedUnits = new Set();
    function markPlaced(u) {
        placedUnits.add(u.id);
        (u._kids || []).forEach(markPlaced);
    }

    roots.forEach((r, i) => measure(r));
    let xOff = L.PAD;
    roots.forEach((r, i) => {
        place(r, xOff, L.PAD, i % ALBERO_EDGE_COLORS.length);
        markPlaced(r);
        xOff += r.width + L.FOREST_GAP;
    });

    // Unità isolate non raggiunte
    units.forEach(u => {
        if (placedUnits.has(u.id)) return;
        measure(u);
        place(u, xOff, L.PAD, 0);
        markPlaced(u);
        xOff += u.width + L.FOREST_GAP;
    });

    // --- Card positions ---
    const placed = [];
    const couples = [];
    const unitBox = Object.create(null); // personId -> {cx, top, bottom, colorIdx}

    units.forEach(u => {
        if (!placedUnits.has(u.id)) return;

        const hasKids = u.children.length > 0;
        const childCount = u.children.length;
        const collapsed = u.collapsed;

        if (u.members.length === 2) {
            const a = u.members[0];
            const b = u.members[1];
            const ax = u.headX;
            const bx = u.headX + L.NODE_W + L.COUPLE_GAP;
            const y = u.headY;
            placed.push({
                id: a.id, x: ax, y, w: L.NODE_W, h: L.NODE_H, data: a,
                hasKids, childCount, collapsed, role: 'left', rels: relIndex[a.id] || null
            });
            placed.push({
                id: b.id, x: bx, y, w: L.NODE_W, h: L.NODE_H, data: b,
                hasKids, childCount, collapsed, role: 'right', rels: relIndex[b.id] || null
            });
            couples.push({
                x1: ax + L.NODE_W,
                x2: bx,
                y: y + L.NODE_H * 0.4
            });
            const cx = u.headX + u.headW / 2;
            const box = { cx, top: y, bottom: y + L.NODE_H, colorIdx: u.colorIdx };
            unitBox[a.id] = unitBox[b.id] = box;
        } else if (u.members.length === 1) {
            const m = u.members[0];
            const y = u.headY;
            placed.push({
                id: m.id, x: u.headX, y, w: L.NODE_W, h: L.NODE_H, data: m,
                hasKids, childCount, collapsed, role: 'single', rels: relIndex[m.id] || null
            });
            unitBox[m.id] = {
                cx: u.headX + L.NODE_W / 2,
                top: y,
                bottom: y + L.NODE_H,
                colorIdx: u.colorIdx
            };
        }
    });

    // --- Edge per ogni unità genitore → i suoi _kids (già centrati sotto) ---
    const edges = [];
    units.forEach(u => {
        const kids = u._kids || [];
        if (!kids.length) return;
        const parentCx = u.headX + u.headW / 2;
        const parentBottom = u.headY + L.NODE_H;
        const drops = kids.map(k => ({
            x: k.headX + k.headW / 2,
            y: k.headY
        })).sort((a, b) => a.x - b.x);

        const barY = parentBottom + (drops[0].y - parentBottom) * 0.5;
        const xs = drops.map(d => d.x).concat([parentCx]);
        const barX1 = Math.min(...xs);
        const barX2 = Math.max(...xs);

        edges.push({
            kind: 'family',
            color: ALBERO_EDGE_COLORS[u.colorIdx % ALBERO_EDGE_COLORS.length],
            parentX: parentCx,
            parentY: parentBottom,
            barY,
            barX1,
            barX2,
            drops
        });
    });

    let finalW = L.PAD;
    let finalH = L.PAD;
    placed.forEach(p => {
        finalW = Math.max(finalW, p.x + p.w + L.PAD);
        finalH = Math.max(finalH, p.y + p.h + L.PAD);
    });

    return {
        width: Math.ceil(Math.max(finalW, 280)),
        height: Math.ceil(Math.max(finalH, 160)),
        nodes: placed,
        edges,
        couples
    };
}

function alberoCardHtml(nMeta) {
    const n = nMeta.data;
    const fotoSrc = n.foto || PLACEHOLDER_FOTO;
    const morto = n.morto ? ' is-morto' : '';
    const reietto = n.reietto ? ' is-reietto' : '';
    const badges = [];
    if (n.morto) badges.push('<span title="Morto">💀</span>');
    if (n.reietto) badges.push('<span title="Reietto">🐀</span>');
    if (n.ritoCarne) badges.push('<span title="Rito della Carne">🥩</span>');
    const childHint = nMeta.childCount ? ` (${nMeta.childCount})` : '';
    const collapseBtn = nMeta.hasKids
        ? `<button type="button" class="albero-collapse-btn ${nMeta.collapsed ? 'is-closed' : 'is-open'}" data-collapse-id="${alberoEscape(n.id)}" title="${nMeta.collapsed ? 'Espandi' + childHint : 'Comprimi'}">${nMeta.collapsed ? '+' : '−'}</button>`
        : '';

    // Relazioni compatte (tooltip con elenco completo)
    const r = nMeta.rels || {};
    const famLines = [];
    if (r.parents && r.parents.length) {
        famLines.push(`<div class="nodo-fam" title="Genitori: ${alberoEscape(r.parents.join(', '))}">↑ ${alberoEscape(alberoFormatRelList(r.parents, 2))}</div>`);
    }
    if (r.spouse) {
        famLines.push(`<div class="nodo-fam nodo-fam-spouse" title="Coniuge: ${alberoEscape(r.spouse)}">♥ ${alberoEscape(r.spouse)}</div>`);
    }
    if (r.children && r.children.length) {
        famLines.push(`<div class="nodo-fam" title="Figli (${r.children.length}): ${alberoEscape(r.children.join(', '))}">↓ ${alberoEscape(alberoFormatRelList(r.children, 2))}</div>`);
    }
    if (r.siblings && r.siblings.length) {
        famLines.push(`<div class="nodo-fam" title="Fratelli/Sorelle (${r.siblings.length}): ${alberoEscape(r.siblings.join(', '))}">⇄ ${alberoEscape(alberoFormatRelList(r.siblings, 2))}</div>`);
    }

    return `<div class="albero-nodo${morto}${reietto}" data-id="${alberoEscape(n.id)}" style="left:${Math.round(nMeta.x)}px;top:${Math.round(nMeta.y)}px;width:${nMeta.w}px;height:${nMeta.h}px;">
        ${collapseBtn}
        <div class="nodo-foto-wrap"><img class="nodo-foto" src="${alberoEscape(fotoSrc)}" alt="" loading="lazy" decoding="async" onerror="this.src='${PLACEHOLDER_FOTO}'"></div>
        <div class="nodo-nome">${alberoEscape(n.nome || '—')}</div>
        <div class="nodo-cognome">${alberoEscape(n.cognome || '')}</div>
        ${n.clan ? `<div class="nodo-clan">${alberoEscape(n.clan)}</div>` : ''}
        ${n.anno ? `<div class="nodo-anno">${alberoEscape(n.anno)}</div>` : ''}
        ${n.relazione ? `<div class="nodo-relazione">${alberoEscape(n.relazione)}</div>` : ''}
        ${famLines.length ? `<div class="nodo-fam-box">${famLines.join('')}</div>` : ''}
        ${badges.length ? `<div class="nodo-stati">${badges.join('')}</div>` : ''}
    </div>`;
}

function alberoSvgEdges(layout) {
    const parts = [];
    (layout.edges || []).forEach(e => {
        const color = e.color || '#c5a059';
        const style = `stroke="${color}"`;
        if (e.kind === 'family') {
            const px = +e.parentX, py = +e.parentY, by = +e.barY;
            // stelo
            parts.push(`<path class="albero-edge-parent" ${style} d="M ${px.toFixed(1)} ${py.toFixed(1)} V ${by.toFixed(1)}" fill="none"/>`);
            // barra continua genitore ↔ figli
            const bx1 = +e.barX1, bx2 = +e.barX2;
            if (Math.abs(bx2 - bx1) > 0.5) {
                parts.push(`<path class="albero-edge-parent albero-edge-bar" ${style} d="M ${bx1.toFixed(1)} ${by.toFixed(1)} H ${bx2.toFixed(1)}" fill="none"/>`);
            }
            // discese
            (e.drops || []).forEach(d => {
                parts.push(`<path class="albero-edge-parent" ${style} d="M ${(+d.x).toFixed(1)} ${by.toFixed(1)} V ${(+d.y).toFixed(1)}" fill="none"/>`);
            });
        }
    });
    (layout.couples || []).forEach(c => {
        const mid = (c.x1 + c.x2) / 2;
        parts.push(`<line class="albero-edge-spouse" x1="${c.x1}" y1="${c.y}" x2="${c.x2}" y2="${c.y}"/>`);
        parts.push(`<text class="albero-heart-svg" x="${mid}" y="${c.y - 4}" text-anchor="middle">♥</text>`);
    });
    return parts.join('');
}

function buildAlberoTree(nodes) {
    if (!nodes || !nodes.length) {
        return '<p class="albero-empty">Albero vuoto. Il gestore può aggiungere nodi da Gestione → Albero Genealogico.</p>';
    }

    const layout = alberoComputeLayout(nodes);
    const cards = layout.nodes.map(alberoCardHtml).join('');
    const svg = `<svg class="albero-edges-svg" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}" xmlns="http://www.w3.org/2000/svg">${alberoSvgEdges(layout)}</svg>`;

    return `<div class="albero-canvas" style="width:${layout.width}px;height:${layout.height}px;" data-w="${layout.width}" data-h="${layout.height}">
        ${svg}
        <div class="albero-nodes-layer">${cards}</div>
    </div>`;
}

// --- PAN / ZOOM ---
let alberoPan = { x: 0, y: 0, scale: 1, dragging: false, startX: 0, startY: 0, originX: 0, originY: 0, inited: false, userMoved: false };
let alberoLastSignature = '';
let alberoCenterTimer = null;

function applyAlberoTransform() {
    const el = document.getElementById('albero-container');
    if (!el) return;
    el.style.transform = `translate(${alberoPan.x}px, ${alberoPan.y}px) scale(${alberoPan.scale})`;
}

function centerAlberoView() {
    const viewport = document.getElementById('albero-viewport');
    const container = document.getElementById('albero-container');
    const canvas = container?.querySelector('.albero-canvas');
    if (!viewport || !container) return;

    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    const cw = canvas ? (parseFloat(canvas.dataset.w) || canvas.offsetWidth) : container.scrollWidth;
    const ch = canvas ? (parseFloat(canvas.dataset.h) || canvas.offsetHeight) : container.scrollHeight;

    // Adatta l'albero al riquadro (usa quasi tutto lo spazio disponibile)
    const margin = 8;
    const sx = (vw - margin * 2) / Math.max(cw, 1);
    const sy = (vh - margin * 2) / Math.max(ch, 1);
    // Preferisci scala più alta: fino a 1.25x se l'albero è piccolo
    const scaleFit = Math.min(1.25, Math.max(0.1, Math.min(sx, sy)));
    alberoPan.scale = scaleFit;
    alberoPan.x = Math.round((vw - cw * scaleFit) / 2);
    alberoPan.y = Math.round((vh - ch * scaleFit) / 2);
    alberoPan.userMoved = false;
    applyAlberoTransform();
    updateAlberoZoomLabel();
}

function centerAlberoViewReliable() {
    clearTimeout(alberoCenterTimer);
    centerAlberoView();
    alberoCenterTimer = setTimeout(() => centerAlberoView(), 80);
    // Wait for images
    const container = document.getElementById('albero-container');
    if (!container) return;
    const imgs = container.querySelectorAll('img');
    let pending = 0;
    imgs.forEach(img => {
        if (img.complete) return;
        pending++;
        img.addEventListener('load', () => {
            pending--;
            if (pending <= 0 && !alberoPan.userMoved) centerAlberoView();
        }, { once: true });
        img.addEventListener('error', () => {
            pending--;
            if (pending <= 0 && !alberoPan.userMoved) centerAlberoView();
        }, { once: true });
    });
}

function alberoDataSignature(nodes) {
    return nodes.map(n => [
        n.id, n.parentId || '', n.parent2Id || '', n.spouseId || '',
        n.ordine ?? 0, n.nome || '', n.cognome || '', n.morto ? 1 : 0, n.reietto ? 1 : 0,
        (n.fratelliIds || []).join(','), n.foto ? 1 : 0, n.relazione || ''
    ].join(':')).sort().join('|') + '#c:' + [...alberoCollapsed].sort().join(',');
}

function updateAlberoZoomLabel() {
    const el = document.getElementById('albero-zoom-label');
    if (el) el.textContent = Math.round(alberoPan.scale * 100) + '%';
}

function initAlberoPanZoom() {
    const viewport = document.getElementById('albero-viewport');
    if (!viewport || alberoPan.inited) return;
    alberoPan.inited = true;

    viewport.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        if (e.target.closest('.albero-collapse-btn, button, a, input')) return;
        alberoPan.dragging = true;
        alberoPan.startX = e.clientX;
        alberoPan.startY = e.clientY;
        alberoPan.originX = alberoPan.x;
        alberoPan.originY = alberoPan.y;
        viewport.classList.add('is-dragging');
        try { viewport.setPointerCapture(e.pointerId); } catch (_) {}
    });

    viewport.addEventListener('pointermove', (e) => {
        if (!alberoPan.dragging) return;
        alberoPan.x = alberoPan.originX + (e.clientX - alberoPan.startX);
        alberoPan.y = alberoPan.originY + (e.clientY - alberoPan.startY);
        alberoPan.userMoved = true;
        applyAlberoTransform();
    });

    const endDrag = (e) => {
        if (!alberoPan.dragging) return;
        alberoPan.dragging = false;
        viewport.classList.remove('is-dragging');
        try { viewport.releasePointerCapture?.(e.pointerId); } catch (_) {}
    };
    viewport.addEventListener('pointerup', endDrag);
    viewport.addEventListener('pointercancel', endDrag);
    viewport.addEventListener('lostpointercapture', endDrag);

    viewport.addEventListener('wheel', (e) => {
        e.preventDefault();
        const rect = viewport.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const oldScale = alberoPan.scale;
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        const newScale = Math.min(2.8, Math.max(0.2, oldScale * delta));
        alberoPan.x = mx - (mx - alberoPan.x) * (newScale / oldScale);
        alberoPan.y = my - (my - alberoPan.y) * (newScale / oldScale);
        alberoPan.scale = newScale;
        alberoPan.userMoved = true;
        applyAlberoTransform();
        updateAlberoZoomLabel();
    }, { passive: false });

    viewport.addEventListener('dblclick', (e) => {
        if (e.target.closest('.albero-collapse-btn, button')) return;
        e.preventDefault();
        alberoPan.userMoved = false;
        centerAlberoViewReliable();
    });

    // Collapse / expand
    viewport.addEventListener('click', (e) => {
        const btn = e.target.closest('.albero-collapse-btn');
        if (!btn) return;
        e.stopPropagation();
        const id = btn.getAttribute('data-collapse-id');
        if (!id) return;
        if (alberoCollapsed.has(id)) alberoCollapsed.delete(id);
        else alberoCollapsed.add(id);
        window.renderAlbero({ forceCenter: true });
    });
}

window.alberoZoom = function(dir) {
    const viewport = document.getElementById('albero-viewport');
    if (!viewport) return;
    const rect = viewport.getBoundingClientRect();
    const mx = rect.width / 2;
    const my = rect.height / 2;
    const oldScale = alberoPan.scale;
    const newScale = Math.min(2.8, Math.max(0.2, oldScale * (dir > 0 ? 1.15 : 0.87)));
    alberoPan.x = mx - (mx - alberoPan.x) * (newScale / oldScale);
    alberoPan.y = my - (my - alberoPan.y) * (newScale / oldScale);
    alberoPan.scale = newScale;
    alberoPan.userMoved = true;
    applyAlberoTransform();
    updateAlberoZoomLabel();
};

window.alberoFitView = function() {
    alberoPan.userMoved = false;
    centerAlberoViewReliable();
};

window.alberoExpandAll = function() {
    alberoCollapsed.clear();
    window.renderAlbero({ forceCenter: true });
};

window.alberoCollapseAll = function() {
    alberoSeedCollapsedDefault(alberoNodi || []);
    window.renderAlbero({ forceCenter: true });
};

window.renderAlbero = (opts = {}) => {
    const root = document.getElementById('albero-tree-root');
    if (!root) return;

    const sig = alberoDataSignature(alberoNodi);
    const dataChanged = sig !== alberoLastSignature;
    if (!dataChanged && !opts.forceCenter && root.querySelector('.albero-canvas, .albero-empty')) {
        if (opts.forceCenter) centerAlberoViewReliable();
        return;
    }
    alberoLastSignature = sig;

    root.innerHTML = buildAlberoTree(alberoNodi);
    initAlberoPanZoom();

    // All'apertura e al cambio dati: fit completo nel riquadro
    if (opts.forceCenter || !opts.preservePan || !alberoPan.userMoved) {
        centerAlberoViewReliable();
    } else {
        applyAlberoTransform();
        updateAlberoZoomLabel();
    }
};

window.downloadAlberoPNG = async () => {
    const container = document.getElementById('albero-container');
    if (!container) return vampireToast('Contenitore albero non trovato.', 'error');
    if (typeof html2canvas !== 'function') {
        return vampireToast('Libreria html2canvas non caricata. Ricarica la pagina.', 'error');
    }
    try {
        vampireToast('Generazione PNG in corso...', 'info');
        const section = document.getElementById('albero');
        const wasHidden = section && !section.classList.contains('active');
        if (wasHidden) {
            document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
            section.classList.add('active');
        }
        const prevTransform = container.style.transform;
        container.style.transform = 'translate(0,0) scale(1)';
        await new Promise(r => setTimeout(r, 200));

        const canvas = await html2canvas(container, {
            backgroundColor: '#1a1510',
            scale: 2,
            useCORS: true,
            allowTaint: true,
            logging: false
        });

        container.style.transform = prevTransform || `translate(${alberoPan.x}px, ${alberoPan.y}px) scale(${alberoPan.scale})`;

        if (wasHidden) section.classList.remove('active');

        const link = document.createElement('a');
        link.download = 'albero-genealogico-vampiri-' + new Date().toISOString().slice(0, 10) + '.png';
        link.href = canvas.toDataURL('image/png');
        link.click();
        vampireToast('PNG scaricato!', 'success');
    } catch (err) {
        console.error(err);
        const container2 = document.getElementById('albero-container');
        if (container2) container2.style.transform = `translate(${alberoPan.x}px, ${alberoPan.y}px) scale(${alberoPan.scale})`;
        vampireToast('Errore generazione PNG: ' + (err.message || err), 'error');
    }
};




// ========== RICHIESTE MEMBRI (approvazione gestore) ==========
window.renderAdminRichiesteMembri = async function() {
    if (!(richiesteMembri && richiesteMembri.length)) {
        try {
            const snap = await getDocs(collection(db, 'richieste_membri'));
            richiesteMembri = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch (e) {
            console.warn('[renderAdminRichieste] fetch', e);
        }
    }

    const tbody = document.getElementById('admin-richieste-membri-body');
    if (!tbody) return;
    const list = [...(richiesteMembri || [])].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    const pending = list.filter(r => (r.stato || 'pending') === 'pending');
    const countEl = document.getElementById('richieste-count');
    if (countEl) {
        countEl.textContent = `${pending.length} in attesa` + (list.length ? ` · ${list.length} totali caricate` : '');
    }
    if (!list.length) {
        tbody.innerHTML = '<tr><td colspan="7" style="opacity:0.5;text-align:center;padding:24px;">Nessuna richiesta.</td></tr>';
        return;
    }
    const fmtD = (ts) => {
        try {
            return new Date(ts).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        } catch (_) { return '—'; }
    };
    const statoBadge = (s) => {
        const st = s || 'pending';
        if (st === 'pending') return '<span style="color:#f59e0b;font-weight:700;">In attesa</span>';
        if (st === 'accepted') return '<span style="color:#2ecc71;font-weight:700;">Accettata</span>';
        if (st === 'rejected') return '<span style="color:#e74c3c;font-weight:700;">Rifiutata</span>';
        return st;
    };
    tbody.innerHTML = list.map(r => {
        const isPending = (r.stato || 'pending') === 'pending';
        const actions = isPending
            ? `<button type="button" class="btn-delete" style="border-color:var(--success-green);color:var(--success-green);" onclick="window.accettaRichiestaMembro('${r.id}')">Accetta</button>
               <button type="button" class="btn-delete" onclick="window.rifiutaRichiestaMembro('${r.id}')">Rifiuta</button>`
            : `<button type="button" class="btn-delete" onclick="window.eliminaRichiestaMembro('${r.id}')">X</button>`;
        return `<tr>
            <td style="white-space:nowrap;font-family:monospace;font-size:0.72rem;">${fmtD(r.timestamp)}</td>
            <td style="text-align:left;font-weight:700;">${String(r.nome || '—').replace(/</g,'&lt;')}</td>
            <td>${String(r.grado || 'Neonato').replace(/</g,'&lt;')}</td>
            <td style="font-family:monospace;letter-spacing:1px;">${String(r.codice || '—').replace(/</g,'&lt;')}</td>
            <td style="font-family:monospace;">${String(r.password || '—').replace(/</g,'&lt;')}</td>
            <td>${statoBadge(r.stato)}</td>
            <td style="white-space:nowrap;">${actions}</td>
        </tr>`;
    }).join('');
};

window.accettaRichiestaMembro = async function(id) {
    if (!currentUser?.isAdmin && !hasAdminPerm('richieste-membri') && !hasAdminPerm('membri')) {
        // gestore pieno o chi ha membri
        if (!currentUser?.isAdmin) return vampireToast('Solo il gestore può accettare le richieste.', 'error');
    }
    const r = (richiesteMembri || []).find(x => x.id === id);
    if (!r) return vampireToast('Richiesta non trovata.', 'error');
    if ((r.stato || 'pending') !== 'pending') return vampireToast('Richiesta già gestita.', 'error');

    const conf = await Swal.fire({
        title: 'Accettare ' + (r.nome || '') + '?',
        text: 'Verrà creato il membro Neonato con i permessi standard.',
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#2ecc71',
        cancelButtonColor: '#555',
        confirmButtonText: 'Accetta',
        background: '#111',
        color: '#fff'
    });
    if (!conf.isConfirmed) return;

    try {
        const nome = String(r.nome || '').trim();
        const codice = String(r.codice || '').trim();
        const password = String(r.password || '').trim();
        if (!nome) return vampireToast('Nome mancante nella richiesta.', 'error');

        const existing = await getDoc(doc(db, 'membri', nome));
        if (existing.exists()) {
            return vampireToast('Esiste già un membro con questo nome. Rifiuta o risolvi il conflitto.', 'error');
        }
        const qCod = query(collection(db, 'membri'), where('codice', '==', codice));
        const snapCod = await getDocs(qCod);
        if (!snapCod.empty) {
            return vampireToast('Il codice della richiesta è già in uso da un membro.', 'error');
        }

        await setDoc(doc(db, 'membri', nome), {
            nome,
            grado: r.grado || 'Neonato',
            codice,
            password,
            permessi: [...PERMESSI_NUOVO_MEMBRO],
            permessiAdmin: [],
            creatoDaRichiesta: true,
            creatoAt: Date.now(),
            accettatoAt: Date.now(),
            accettatoDa: currentUser?.nome || 'GESTORE'
        });
        await updateDoc(doc(db, 'richieste_membri', id), {
            stato: 'accepted',
            gestitoAt: Date.now(),
            gestitoDa: currentUser?.nome || 'GESTORE'
        });
        logSystemEvent('membro', 'richiesta_accettata', `Richiesta accettata: ${nome}`, { nome, codice, id });
        vampireToast(`Membro ${nome} creato e abilitato all'accesso.`, 'success');
        window.renderAdminRichiesteMembri();
    } catch (err) {
        console.error(err);
        vampireToast('Errore accettazione: ' + (err.message || err), 'error');
    }
};

window.rifiutaRichiestaMembro = async function(id) {
    if (!currentUser?.isAdmin) return vampireToast('Solo il gestore può rifiutare le richieste.', 'error');
    const r = (richiesteMembri || []).find(x => x.id === id);
    if (!r) return vampireToast('Richiesta non trovata.', 'error');
    const conf = await Swal.fire({
        title: 'Rifiutare richiesta?',
        text: r.nome || '',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#8b0000',
        background: '#111',
        color: '#fff',
        confirmButtonText: 'Rifiuta'
    });
    if (!conf.isConfirmed) return;
    try {
        await updateDoc(doc(db, 'richieste_membri', id), {
            stato: 'rejected',
            gestitoAt: Date.now(),
            gestitoDa: currentUser?.nome || 'GESTORE'
        });
        logSystemEvent('membro', 'richiesta_rifiutata', `Richiesta rifiutata: ${r.nome || id}`, { id, nome: r.nome });
        vampireToast('Richiesta rifiutata.', 'info');
        window.renderAdminRichiesteMembri();
    } catch (err) {
        vampireToast('Errore: ' + (err.message || err), 'error');
    }
};

window.eliminaRichiestaMembro = async function(id) {
    if (!currentUser?.isAdmin) return vampireToast('Solo il gestore può eliminare le richieste.', 'error');
    const conf = await Swal.fire({
        title: 'Eliminare record richiesta?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#8b0000',
        background: '#111',
        color: '#fff'
    });
    if (!conf.isConfirmed) return;
    try {
        await deleteDoc(doc(db, 'richieste_membri', id));
        vampireToast('Richiesta eliminata.', 'success');
        window.renderAdminRichiesteMembri();
    } catch (err) {
        vampireToast('Errore: ' + (err.message || err), 'error');
    }
};



// ========== STORICO SETTIMANA + BACKUP ==========
const _loadedArchivioWeeks = new Set();
let _backupDocs = [];
const BACKUP_COLS_WITH_WEEK = new Set(['vendite', 'vendite_materiali']);

function _backupCollectWeekKeys() {
    const keys = new Set();
    const cur = (typeof getWeekYearKey === 'function') ? getWeekYearKey(new Date()) : null;
    if (cur) keys.add(cur);
    (vendite || []).forEach(v => { if (v.settimanaEtichetta) keys.add(v.settimanaEtichetta); });
    (venditeMateriali || []).forEach(m => { if (m.settimanaEtichetta) keys.add(m.settimanaEtichetta); });
    // ultime ~26 settimane anche senza dati in memoria
    try {
        const d = new Date();
        for (let i = 0; i < 26; i++) {
            if (typeof getWeekYearKey === 'function') keys.add(getWeekYearKey(new Date(d)));
            d.setDate(d.getDate() - 7);
        }
    } catch (_) {}
    return [...keys].filter(Boolean).sort().reverse();
}

function _backupLabelWeek(k) {
    const cur = (typeof getWeekYearKey === 'function') ? getWeekYearKey(new Date()) : '';
    const base = (typeof getWeekRangeLabel === 'function') ? getWeekRangeLabel(k) : k;
    return base + (k === cur ? ' · corrente' : '');
}

window.setupArchivioWeekSelect = function() {
    const sel = document.getElementById('archivio-week-select');
    if (!sel) return;
    const sorted = _backupCollectWeekKeys();
    const current = (typeof getWeekYearKey === 'function') ? getWeekYearKey(new Date()) : sorted[0];
    const prev = sel.value;
    sel.innerHTML = sorted.map(k =>
        `<option value="${k}">${_backupLabelWeek(k)}</option>`
    ).join('');
    sel.value = sorted.includes(prev) ? prev : current;
};

window.onArchivioWeekChange = function() {
    window.renderArchivioGestione?.();
    window.renderAdminMateriali?.();
};

window.loadArchivioWeekFromSelect = async function() {
    const week = document.getElementById('archivio-week-select')?.value;
    if (!week) return vampireToast('Seleziona una settimana.', 'error');
    await window.loadStoricoWeek(week);
    window.renderArchivioGestione?.();
    window.renderAdminMateriali?.();
    vampireToast('Settimana caricata.', 'success');
};

window.loadStoricoWeek = async function(weekKey) {
    if (!weekKey) return;
    try {
        const [sv, sm] = await Promise.all([
            getDocs(query(collection(db, 'vendite'), where('settimanaEtichetta', '==', weekKey), limit(150))),
            getDocs(query(collection(db, 'vendite_materiali'), where('settimanaEtichetta', '==', weekKey), limit(150)))
        ]);
        const byV = new Map((vendite || []).map(v => [v.id, v]));
        sv.docs.forEach(d => byV.set(d.id, { id: d.id, ...d.data() }));
        vendite = [...byV.values()];
        const byM = new Map((venditeMateriali || []).map(m => [m.id, m]));
        sm.docs.forEach(d => byM.set(d.id, { id: d.id, ...d.data() }));
        venditeMateriali = [...byM.values()];
        _loadedArchivioWeeks.add(weekKey);
    } catch (err) {
        console.warn('[loadStoricoWeek]', err);
        vampireToast('Errore: ' + (err.message || err), 'error');
    }
};

window.initBackupPanel = function() {
    _backupDocs = [];
    const st = document.getElementById('backup-status');
    if (st) st.textContent = '';
    const tb = document.getElementById('backup-tbody');
    if (tb) tb.innerHTML = '<tr><td style="opacity:0.5;text-align:center;padding:24px;">Seleziona collezione e carica.</td></tr>';
    const thead = document.getElementById('backup-thead');
    if (thead) thead.innerHTML = '<th>Anteprima</th>';
    window.onBackupCollectionChange();
};

window.onBackupCollectionChange = function() {
    const col = document.getElementById('backup-collection')?.value || 'vendite';
    const wrap = document.getElementById('backup-week-wrap');
    const weekSel = document.getElementById('backup-week');
    const showWeek = BACKUP_COLS_WITH_WEEK.has(col);
    if (wrap) wrap.style.display = showWeek ? '' : 'none';
    if (weekSel && showWeek) {
        const sorted = _backupCollectWeekKeys();
        const prev = weekSel.value;
        weekSel.innerHTML = '<option value="">— Tutte le settimane —</option>' +
            sorted.map(k => `<option value="${k}">${_backupLabelWeek(k)}</option>`).join('');
        if (prev && sorted.includes(prev)) weekSel.value = prev;
    }
};

window.backupLoadPreview = async function(full = false) {
    if (!currentUser?.isAdmin) return vampireToast('Solo il gestore.', 'error');
    const col = document.getElementById('backup-collection')?.value || 'vendite';
    const week = document.getElementById('backup-week')?.value || '';
    const lim = Math.min(2000, Math.max(50, Number(document.getElementById('backup-limit')?.value) || 500));
    const st = document.getElementById('backup-status');
    if (st) st.textContent = full ? 'Caricamento completo…' : 'Anteprima…';
    try {
        const pageSize = full ? 400 : lim;
        let all = [];
        let lastDoc = null;
        let pages = 0;
        const maxPages = full ? 50 : 1;
        const useTs = ['system_logs', 'logs', 'saldo_logs', 'comunicazioni', 'documenti', 'richieste_membri', 'vendite', 'vendite_materiali'].includes(col);
        while (pages < maxPages) {
            const parts = [];
            if (BACKUP_COLS_WITH_WEEK.has(col) && week) {
                parts.push(where('settimanaEtichetta', '==', week));
            }
            if (useTs) parts.push(orderBy('timestamp', 'desc'));
            if (lastDoc) parts.push(startAfter(lastDoc));
            parts.push(limit(pageSize));
            const snap = await getDocs(query(collection(db, col), ...parts));
            if (snap.empty) break;
            snap.docs.forEach(d => all.push({ id: d.id, ...d.data() }));
            lastDoc = snap.docs[snap.docs.length - 1];
            pages++;
            if (st) st.textContent = `Caricati ${all.length}…`;
            if (!full || snap.docs.length < pageSize) break;
        }
        if (BACKUP_COLS_WITH_WEEK.has(col) && week) {
            all = all.filter(d => d.settimanaEtichetta === week);
        }
        _backupDocs = all;
        window.renderBackupPreview();
        if (st) st.textContent = `${_backupDocs.length} documenti` + (full ? ' (completo)' : ' (anteprima)') + (week ? ` · ${week}` : '');
        vampireToast(_backupDocs.length + ' documenti pronti.', 'success');
    } catch (err) {
        console.error('[backupLoad]', err);
        if (st) st.textContent = 'Errore';
        vampireToast('Errore caricamento: ' + (err.message || err), 'error');
    }
};

window.renderBackupPreview = function() {
    const thead = document.getElementById('backup-thead');
    const tbody = document.getElementById('backup-tbody');
    if (!thead || !tbody) return;
    if (!_backupDocs.length) {
        thead.innerHTML = '<th>Anteprima</th>';
        tbody.innerHTML = '<tr><td style="opacity:0.5;text-align:center;padding:24px;">Nessun documento.</td></tr>';
        return;
    }
    const keyCount = {};
    _backupDocs.slice(0, 40).forEach(d => {
        Object.keys(d).forEach(k => { keyCount[k] = (keyCount[k] || 0) + 1; });
    });
    const preferred = ['id', 'timestamp', 'settimanaEtichetta', 'nome', 'vampiro', 'materiale', 'qty', 'azione', 'tipo', 'utente', 'dettagli', 'stato', 'grado', 'codice'];
    const keys = [...new Set([
        ...preferred.filter(k => keyCount[k]),
        ...Object.keys(keyCount).sort((a, b) => keyCount[b] - keyCount[a])
    ])].filter(k => k !== 'meta' && k !== 'userAgent' && k !== 'dataUrl').slice(0, 8);

    thead.innerHTML = keys.map(k => `<th>${k}</th>`).join('');
    tbody.innerHTML = _backupDocs.slice(0, 100).map(docu => {
        return '<tr>' + keys.map(k => {
            let v = docu[k];
            if (v == null) v = '';
            else if (typeof v === 'object') v = JSON.stringify(v).slice(0, 80);
            else v = String(v);
            if (k === 'timestamp' && /^\d{10,}$/.test(v)) {
                try { v = new Date(Number(v)).toLocaleString('it-IT'); } catch (_) {}
            }
            return `<td style="text-align:left;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${String(v).replace(/</g, '&lt;').slice(0, 60)}</td>`;
        }).join('') + '</tr>';
    }).join('') + (_backupDocs.length > 100
        ? `<tr><td colspan="${keys.length}" style="opacity:0.6;text-align:center;">… +${_backupDocs.length - 100} nell'export</td></tr>`
        : '');
};

function _backupToCSV(rows) {
    if (!rows.length) return '';
    const keys = [...new Set(rows.flatMap(r => Object.keys(r)))].filter(k => k !== 'dataUrl' || rows.length < 20);
    const esc = (v) => {
        if (v == null) return '""';
        if (typeof v === 'object') v = JSON.stringify(v);
        return '"' + String(v).replace(/"/g, '""') + '"';
    };
    return '\uFEFF' + [keys.map(esc).join(',')].concat(rows.map(r => keys.map(k => esc(r[k])).join(','))).join('\n');
}

window.backupDownloadCSV = function() {
    if (!_backupDocs.length) return vampireToast('Carica prima i dati.', 'error');
    const col = document.getElementById('backup-collection')?.value || 'backup';
    const week = document.getElementById('backup-week')?.value || '';
    const blob = new Blob([_backupToCSV(_backupDocs)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `backup-${col}${week ? '-' + week : ''}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    vampireToast(`CSV: ${_backupDocs.length} righe.`, 'success');
};

window.backupDeleteFiltered = async function() {
    if (!currentUser?.isAdmin) return vampireToast('Solo il gestore.', 'error');
    if (!_backupDocs.length) return vampireToast('Carica prima i documenti.', 'error');
    const col = document.getElementById('backup-collection')?.value || '';
    const promptText = col === 'membri' ? 'ELIMINA MEMBRI' : 'ELIMINA';
    const conf = await Swal.fire({
        title: `Eliminare ${_backupDocs.length} documenti?`,
        html: `<p>Collezione: <strong style="color:#c5a059;">${col}</strong></p><p>Digita <strong>${promptText}</strong></p>`,
        input: 'text',
        showCancelButton: true,
        confirmButtonColor: '#8b0000',
        background: '#111',
        color: '#fff'
    });
    if (!conf.isConfirmed || conf.value !== promptText) return vampireToast('Annullato.', 'info');
    const ids = _backupDocs.map(d => d.id).filter(Boolean);
    let done = 0;
    const st = document.getElementById('backup-status');
    try {
        for (let i = 0; i < ids.length; i += 400) {
            const chunk = ids.slice(i, i + 400);
            const batch = writeBatch(db);
            chunk.forEach(id => batch.delete(doc(db, col, id)));
            await batch.commit();
            done += chunk.length;
            if (st) st.textContent = `Eliminati ${done}/${ids.length}…`;
        }
        const idSet = new Set(ids);
        if (col === 'vendite') vendite = (vendite || []).filter(v => !idSet.has(v.id));
        if (col === 'vendite_materiali') venditeMateriali = (venditeMateriali || []).filter(v => !idSet.has(v.id));
        if (col === 'system_logs') systemLogs = (systemLogs || []).filter(v => !idSet.has(v.id));
        if (col === 'logs') logs = (logs || []).filter(v => !idSet.has(v.id));
        if (col === 'saldo_logs') saldoLogs = (saldoLogs || []).filter(v => !idSet.has(v.id));
        vampireToast(`Eliminati ${done} da ${col}.`, 'success');
        _backupDocs = [];
        window.renderBackupPreview();
        if (st) st.textContent = `Eliminati ${done}.`;
    } catch (err) {
        vampireToast('Errore: ' + (err.message || err) + (done ? ` (ok ${done})` : ''), 'error');
    }
};

console.info('[Backup] modulo attivo: onBackupCollectionChange, backupLoadPreview, initBackupPanel');

// ========== LOG DI SISTEMA (UI + filtri) ==========
function formatSystemLogDate(ts) {
    if (!ts) return '—';
    try {
        return new Date(ts).toLocaleString('it-IT', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit', second: '2-digit'
        });
    } catch (_) {
        return String(ts);
    }
}

window.renderSystemLogs = function() {
    const tbody = document.getElementById('system-logs-body');
    if (!tbody) return;

    const qText = (document.getElementById('syslog-search')?.value || '').toLowerCase().trim();
    const qTipo = (document.getElementById('syslog-tipo')?.value || '').trim();
    const qUser = (document.getElementById('syslog-utente')?.value || '').toLowerCase().trim();
    const qFrom = document.getElementById('syslog-from')?.value || '';
    const qTo = document.getElementById('syslog-to')?.value || '';

    let fromTs = 0, toTs = Infinity;
    if (qFrom) {
        const d = new Date(qFrom + 'T00:00:00');
        if (!isNaN(d)) fromTs = d.getTime();
    }
    if (qTo) {
        const d = new Date(qTo + 'T23:59:59');
        if (!isNaN(d)) toTs = d.getTime();
    }

    let list = Array.isArray(systemLogs) ? [...systemLogs] : [];
    list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    list = list.filter(e => {
        const ts = e.timestamp || 0;
        if (ts < fromTs || ts > toTs) return false;
        if (qTipo && e.tipo !== qTipo) return false;
        if (qUser && !(String(e.utente || '').toLowerCase().includes(qUser))) return false;
        if (qText) {
            const blob = [
                e.tipo, e.azione, e.utente, e.ruolo, e.dettagli, e.ip, e.userAgent,
                e.meta ? JSON.stringify(e.meta) : ''
            ].join(' ').toLowerCase();
            if (!blob.includes(qText)) return false;
        }
        return true;
    });

    const countEl = document.getElementById('syslog-count');
    if (countEl) countEl.textContent = `${list.length} eventi` + (list.length !== systemLogs.length ? ` (su ${systemLogs.length} caricati)` : '');

    if (!list.length) {
        tbody.innerHTML = '<tr><td colspan="7" style="opacity:0.5;text-align:center;padding:24px;">Nessun evento corrisponde ai filtri.</td></tr>';
        return;
    }

    const tipoColor = {
        auth: '#60a5fa', admin: '#c5a059', membro: '#e8a0bf', vendita: '#2ecc71',
        materiali: '#947a44', inventario: '#a78bfa', saldo: '#f59e0b', albero: '#34d399',
        calendario: '#c084fc', dinamico: '#38bdf8', altro: '#9ca3af'
    };

    tbody.innerHTML = list.map(e => {
        const col = tipoColor[e.tipo] || '#9ca3af';
        const metaStr = e.meta ? `<details style="margin-top:4px;"><summary style="cursor:pointer;font-size:0.65rem;color:#888;">meta</summary><pre style="font-size:0.6rem;white-space:pre-wrap;max-width:280px;margin:4px 0 0;opacity:0.8;">${String(JSON.stringify(e.meta, null, 0)).replace(/</g,'&lt;').slice(0,500)}</pre></details>` : '';
        const uaShort = (e.userAgent || '').slice(0, 48) + ((e.userAgent || '').length > 48 ? '…' : '');
        return `<tr>
            <td style="white-space:nowrap;font-family:monospace;font-size:0.72rem;">${formatSystemLogDate(e.timestamp)}</td>
            <td><span style="display:inline-block;padding:2px 8px;border:1px solid ${col};color:${col};border-radius:4px;font-size:0.65rem;text-transform:uppercase;letter-spacing:0.5px;">${e.tipo || '—'}</span></td>
            <td style="font-size:0.75rem;font-weight:700;color:var(--gold-accent);">${e.azione || '—'}</td>
            <td style="text-align:left;">
                <strong>${e.utente || '—'}</strong>
                <span style="display:block;font-size:0.6rem;opacity:0.55;text-transform:uppercase;">${e.ruolo || ''}</span>
            </td>
            <td style="text-align:left;font-size:0.78rem;max-width:340px;">${(e.dettagli || '—').replace(/</g,'&lt;')}${metaStr}</td>
            <td style="font-family:monospace;font-size:0.72rem;white-space:nowrap;">${e.ip || '—'}</td>
            <td style="font-size:0.6rem;opacity:0.55;max-width:140px;overflow:hidden;text-overflow:ellipsis;" title="${(e.userAgent || '').replace(/"/g,'&quot;')}">${uaShort || '—'}</td>
        </tr>`;
    }).join('');
};

window.resetSystemLogFilters = function() {
    ['syslog-search','syslog-tipo','syslog-utente','syslog-from','syslog-to'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    window.renderSystemLogs();
};

window.exportSystemLogsCSV = function() {
    const qText = (document.getElementById('syslog-search')?.value || '').toLowerCase().trim();
    const qTipo = (document.getElementById('syslog-tipo')?.value || '').trim();
    const qUser = (document.getElementById('syslog-utente')?.value || '').toLowerCase().trim();
    const qFrom = document.getElementById('syslog-from')?.value || '';
    const qTo = document.getElementById('syslog-to')?.value || '';
    let fromTs = 0, toTs = Infinity;
    if (qFrom) { const d = new Date(qFrom + 'T00:00:00'); if (!isNaN(d)) fromTs = d.getTime(); }
    if (qTo) { const d = new Date(qTo + 'T23:59:59'); if (!isNaN(d)) toTs = d.getTime(); }
    let list = [...(systemLogs || [])].sort((a,b)=>(b.timestamp||0)-(a.timestamp||0));
    list = list.filter(e => {
        const ts = e.timestamp || 0;
        if (ts < fromTs || ts > toTs) return false;
        if (qTipo && e.tipo !== qTipo) return false;
        if (qUser && !(String(e.utente||'').toLowerCase().includes(qUser))) return false;
        if (qText) {
            const blob = [e.tipo,e.azione,e.utente,e.ruolo,e.dettagli,e.ip,e.userAgent].join(' ').toLowerCase();
            if (!blob.includes(qText)) return false;
        }
        return true;
    });
    const rows = [['Data','Tipo','Azione','Utente','Ruolo','Dettagli','IP','UserAgent']];
    list.forEach(e => {
        rows.push([
            formatSystemLogDate(e.timestamp),
            e.tipo||'', e.azione||'', e.utente||'', e.ruolo||'',
            (e.dettagli||'').replace(/\n/g,' '),
            e.ip||'', (e.userAgent||'').replace(/,/g,';')
        ]);
    });
    const csv = rows.map(r => r.map(c => '"' + String(c).replace(/"/g,'""') + '"').join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'system-logs-' + new Date().toISOString().slice(0,10) + '.csv';
    a.click();
    URL.revokeObjectURL(a.href);
    vampireToast('CSV esportato (' + list.length + ' righe).', 'success');
};



// ========== CALENDARIO (Avvento + Mesi multi-anno) ==========
const CAL_MESI_NOMI = ['', 'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];

/** Anno visualizzato (membri) e anno in modifica (admin) */
let calAnnoView = null;   // null = anno corrente
let calAnnoAdmin = null;

function calOggi() {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() + 1, day: d.getDate() };
}

function calAnnoCorrente() {
    return new Date().getFullYear();
}

/** Lista anni disponibili: da dati + corrente ± range */
function calAnniDisponibili() {
    const set = new Set();
    const yNow = calAnnoCorrente();
    for (let y = yNow - 1; y <= yNow + 3; y++) set.add(y);
    (calendarioMesi || []).forEach(e => {
        const a = Number(e.anno);
        if (a >= 2000 && a <= 2100) set.add(a);
    });
    return [...set].sort((a, b) => a - b);
}

function getCalAnnoView() {
    if (calAnnoView == null) calAnnoView = calAnnoCorrente();
    return calAnnoView;
}

function getCalAnnoAdmin() {
    if (calAnnoAdmin == null) calAnnoAdmin = calAnnoCorrente();
    return calAnnoAdmin;
}

function escapeHtmlCal(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function popolaSelectAnniCalendario() {
    const anni = calAnniDisponibili();
    const yView = getCalAnnoView();
    const yAdm = getCalAnnoAdmin();
    const selView = document.getElementById('cal-anno-view');
    if (selView) {
        const cur = selView.value;
        selView.innerHTML = anni.map(y =>
            `<option value="${y}">${y}${y === calAnnoCorrente() ? ' · corrente' : ''}</option>`
        ).join('');
        selView.value = String(anni.includes(Number(cur)) ? cur : yView);
        calAnnoView = Number(selView.value);
    }
    const selAdm = document.getElementById('adm-cal-anno');
    if (selAdm) {
        const cur = selAdm.value;
        // Admin: stessi anni + possibilità di aggiungere anno futuro non ancora in lista
        const extra = [...anni];
        const yMax = Math.max(...anni, calAnnoCorrente());
        for (let y = yMax + 1; y <= yMax + 2; y++) {
            if (!extra.includes(y)) extra.push(y);
        }
        selAdm.innerHTML = extra.map(y =>
            `<option value="${y}">${y}${y === calAnnoCorrente() ? ' · corrente' : ''}</option>`
        ).join('');
        selAdm.value = String(extra.includes(Number(cur)) ? cur : yAdm);
        calAnnoAdmin = Number(selAdm.value);
    }
    // Aggiorna label tab
    const tabMe = document.getElementById('cal-tab-mesi');
    if (tabMe) tabMe.textContent = `📆 Calendario ${getCalAnnoView()}`;
    const tabAdm = document.getElementById('adm-cal-tab-mesi');
    if (tabAdm) tabAdm.textContent = `📆 Mesi ${getCalAnnoAdmin()}`;
    const labelAdm = document.getElementById('adm-cal-mesi-title');
    if (labelAdm) labelAdm.textContent = `Mese ${getCalAnnoAdmin()}`;
}

window.onCalAnnoViewChange = function() {
    const v = Number(document.getElementById('cal-anno-view')?.value);
    if (v) calAnnoView = v;
    const tabMe = document.getElementById('cal-tab-mesi');
    if (tabMe) tabMe.textContent = `📆 Calendario ${getCalAnnoView()}`;
    renderMesiGrid(calOggi());
};

window.onCalAnnoAdminChange = function() {
    const v = Number(document.getElementById('adm-cal-anno')?.value);
    if (v) calAnnoAdmin = v;
    const tabAdm = document.getElementById('adm-cal-tab-mesi');
    if (tabAdm) tabAdm.textContent = `📆 Mesi ${getCalAnnoAdmin()}`;
    const labelAdm = document.getElementById('adm-cal-mesi-title');
    if (labelAdm) labelAdm.textContent = `Mese ${getCalAnnoAdmin()}`;
    window.resetFormMese();
    window.renderAdminCalendario();
};

window.switchCalendarioTab = function(tab) {
    const av = document.getElementById('cal-panel-avvento');
    const me = document.getElementById('cal-panel-mesi');
    const bAv = document.getElementById('cal-tab-avvento');
    const bMe = document.getElementById('cal-tab-mesi');
    if (!av || !me) return;
    const isAv = tab === 'avvento';
    av.style.display = isAv ? 'block' : 'none';
    me.style.display = isAv ? 'none' : 'block';
    if (bAv) bAv.classList.toggle('is-active', isAv);
    if (bMe) bMe.classList.toggle('is-active', !isAv);
    try { localStorage.setItem('cal_tab', tab); } catch (_) {}
    window.renderCalendarioSezione();
};

window.renderCalendarioSezione = function() {
    const oggi = calOggi();
    const live = document.getElementById('cal-live-date');
    if (live) {
        live.textContent = new Date().toLocaleDateString('it-IT', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    }
    popolaSelectAnniCalendario();
    renderAvventoGrid(oggi);
    renderMesiGrid(oggi);
};

function renderAvventoGrid(oggi) {
    const grid = document.getElementById('cal-avvento-grid');
    if (!grid) return;
    const q = (document.getElementById('cal-avvento-search')?.value || '').toLowerCase().trim();
    const byDay = {};
    (calendarioAvvento || []).forEach(e => {
        const g = Number(e.giorno);
        if (g >= 1 && g <= 31) byDay[g] = e;
    });
    let html = '';
    for (let g = 1; g <= 31; g++) {
        const e = byDay[g] || {};
        const titolo = e.titolo || '';
        const premio = e.premio || '';
        const foto = e.fotoUrl || '';
        const blob = `${titolo} ${premio} ${e.note || ''}`.toLowerCase();
        if (q && !blob.includes(q) && String(g) !== q) continue;
        const isToday = oggi.m === 12 && oggi.day === g;
        const hasContent = !!(foto || premio || titolo);
        html += `<div class="cal-day-card${isToday ? ' is-today' : ''}${hasContent ? ' has-content' : ''}" data-day="${g}">
            <div class="cal-day-num">${g}</div>
            <div class="cal-day-media">${foto ? `<img src="${String(foto).replace(/"/g,'&quot;')}" alt="" loading="lazy" onerror="this.style.display='none'">` : `<div class="cal-day-empty">🦇</div>`}</div>
            <div class="cal-day-body">
                ${titolo ? `<div class="cal-day-title">${escapeHtmlCal(titolo)}</div>` : ''}
                ${premio ? `<div class="cal-day-premio">🎁 ${escapeHtmlCal(premio)}</div>` : `<div class="cal-day-premio muted">—</div>`}
            </div>
            ${isToday ? '<span class="cal-badge-oggi">Oggi</span>' : ''}
        </div>`;
    }
    grid.innerHTML = html || '<p class="cal-empty">Nessun giorno corrisponde al filtro.</p>';
}

const _calMeseFotoIdx = {};

function renderMesiGrid(oggi) {
    const grid = document.getElementById('cal-mesi-grid');
    if (!grid) return;
    const anno = getCalAnnoView();
    const q = (document.getElementById('cal-mesi-search')?.value || '').toLowerCase().trim();
    const byMese = {};
    (calendarioMesi || []).forEach(e => {
        if (Number(e.anno) !== anno) return;
        const m = Number(e.mese);
        if (m >= 1 && m <= 12) byMese[m] = e;
    });
    let html = '';
    for (let m = 1; m <= 12; m++) {
        const e = byMese[m] || {};
        const nome = e.nome || CAL_MESI_NOMI[m];
        const fotos = Array.isArray(e.foto) ? e.foto.filter(f => f && f.url) : [];
        if (q && !nome.toLowerCase().includes(q) && !String(m).includes(q)) continue;
        const isCurrentMonth = oggi.y === anno && oggi.m === m;
        const isPast = (oggi.y > anno) || (oggi.y === anno && oggi.m > m);
        const idxKey = `${anno}-${m}`;
        const idx = Math.min(_calMeseFotoIdx[idxKey] || 0, Math.max(0, fotos.length - 1));
        _calMeseFotoIdx[idxKey] = idx;
        const cur = fotos[idx];
        const multi = fotos.length > 1;
        html += `<div class="cal-mese-card${isCurrentMonth ? ' is-current' : ''}${isPast ? ' is-past' : ''}" data-mese="${m}">
            <div class="cal-mese-head"><span class="cal-mese-nome">${escapeHtmlCal(nome)}</span><span class="cal-mese-num">${anno}</span></div>
            <div class="cal-mese-media">
                ${cur ? `<img src="${String(cur.url).replace(/"/g,'&quot;')}" alt="" loading="lazy" onerror="this.style.display='none'">` : `<div class="cal-day-empty">🌙</div>`}
                ${multi ? `<button type="button" class="cal-foto-nav prev" onclick="window.calMeseFotoNav(${m}, -1)" aria-label="Foto precedente">‹</button>
                    <button type="button" class="cal-foto-nav next" onclick="window.calMeseFotoNav(${m}, 1)" aria-label="Foto successiva">›</button>
                    <span class="cal-foto-dots">${idx + 1}/${fotos.length}</span>` : ''}
            </div>
            ${cur && cur.caption ? `<div class="cal-mese-caption">${escapeHtmlCal(cur.caption)}</div>` : ''}
            ${isCurrentMonth ? `<span class="cal-badge-oggi">Mese corrente · giorno ${oggi.day}</span>` : ''}
        </div>`;
    }
    grid.innerHTML = html || '<p class="cal-empty">Nessun mese corrisponde al filtro.</p>';
}

window.calMeseFotoNav = function(mese, delta) {
    const anno = getCalAnnoView();
    const e = (calendarioMesi || []).find(x => Number(x.mese) === mese && Number(x.anno) === anno);
    const fotos = e && Array.isArray(e.foto) ? e.foto.filter(f => f && f.url) : [];
    if (!fotos.length) return;
    const idxKey = `${anno}-${mese}`;
    const cur = _calMeseFotoIdx[idxKey] || 0;
    _calMeseFotoIdx[idxKey] = (cur + delta + fotos.length) % fotos.length;
    renderMesiGrid(calOggi());
};

window.switchAdminCalTab = function(tab) {
    const av = document.getElementById('adm-cal-avvento');
    const me = document.getElementById('adm-cal-mesi');
    const bAv = document.getElementById('adm-cal-tab-avvento');
    const bMe = document.getElementById('adm-cal-tab-mesi');
    if (!av || !me) return;
    const isAv = tab === 'avvento';
    av.style.display = isAv ? 'block' : 'none';
    me.style.display = isAv ? 'none' : 'block';
    if (bAv) bAv.classList.toggle('is-active', isAv);
    if (bMe) bMe.classList.toggle('is-active', !isAv);
};

window.renderAdminCalendario = function() {
    popolaSelectAnniCalendario();
    const tbody = document.getElementById('adm-cal-avvento-body');
    if (tbody) {
        const byDay = {};
        (calendarioAvvento || []).forEach(e => { byDay[Number(e.giorno)] = e; });
        let rows = '';
        for (let g = 1; g <= 31; g++) {
            const e = byDay[g];
            if (!e) {
                rows += `<tr><td>${g}</td><td colspan="3" style="opacity:0.4;">— vuoto —</td>
                <td><button type="button" class="btn-delete" style="border-color:var(--gold-accent);color:var(--gold-accent);" onclick="window.caricaAvventoGiorno(${g})">Modifica</button></td></tr>`;
                continue;
            }
            const thumb = e.fotoUrl ? `<img src="${String(e.fotoUrl).replace(/"/g,'&quot;')}" style="width:36px;height:36px;object-fit:cover;border-radius:4px;" onerror="this.style.display='none'">` : '—';
            rows += `<tr>
                <td><strong>${g}</strong></td>
                <td>${thumb}</td>
                <td style="text-align:left;">${escapeHtmlCal(e.titolo || '—')}<br><span style="opacity:0.6;font-size:0.65rem;">${escapeHtmlCal(e.premio || '')}</span></td>
                <td style="font-size:0.65rem;max-width:120px;word-break:break-word;">${escapeHtmlCal(e.note || '')}</td>
                <td style="white-space:nowrap;">
                    <button type="button" class="btn-delete" style="border-color:var(--gold-accent);color:var(--gold-accent);" onclick="window.caricaAvventoGiorno(${g})">Modifica</button>
                    <button type="button" class="btn-delete" onclick="window.eliminaAvventoGiorno('${e.id}')">X</button>
                </td>
            </tr>`;
        }
        tbody.innerHTML = rows;
    }
    const tbodyM = document.getElementById('adm-cal-mesi-body');
    if (tbodyM) {
        const anno = getCalAnnoAdmin();
        const byMese = {};
        (calendarioMesi || []).forEach(e => {
            if (Number(e.anno) !== anno) return;
            byMese[Number(e.mese)] = e;
        });
        let rows = '';
        for (let m = 1; m <= 12; m++) {
            const e = byMese[m];
            const nome = (e && e.nome) || CAL_MESI_NOMI[m];
            const fotos = (e && Array.isArray(e.foto)) ? e.foto.filter(f => f && f.url) : [];
            const thumbs = fotos.slice(0, 3).map(f => `<img src="${String(f.url).replace(/"/g,'&quot;')}" style="width:28px;height:28px;object-fit:cover;border-radius:3px;margin:1px;" onerror="this.style.display='none'">`).join('') || '—';
            rows += `<tr>
                <td><strong>${CAL_MESI_NOMI[m]}</strong></td>
                <td style="text-align:left;">${escapeHtmlCal(nome)}</td>
                <td>${thumbs}${fotos.length > 3 ? ` <span style="opacity:0.6;">+${fotos.length-3}</span>` : ''}</td>
                <td>${fotos.length}</td>
                <td style="white-space:nowrap;">
                    <button type="button" class="btn-delete" style="border-color:var(--gold-accent);color:var(--gold-accent);" onclick="window.caricaMeseCal(${m})">Modifica</button>
                    ${e ? `<button type="button" class="btn-delete" onclick="window.eliminaMeseCal('${e.id}')">X</button>` : ''}
                </td>
            </tr>`;
        }
        tbodyM.innerHTML = rows;
    }
};

window.caricaAvventoGiorno = function(giorno) {
    const e = (calendarioAvvento || []).find(x => Number(x.giorno) === Number(giorno));
    document.getElementById('adm-av-giorno').value = String(giorno);
    document.getElementById('adm-av-titolo').value = e?.titolo || '';
    document.getElementById('adm-av-premio').value = e?.premio || '';
    document.getElementById('adm-av-foto').value = e?.fotoUrl || '';
    document.getElementById('adm-av-note').value = e?.note || '';
    document.getElementById('adm-av-edit-id').value = e?.id || '';
    window.switchAdminCalTab('avvento');
};

window.resetFormAvvento = function() {
    ['adm-av-titolo','adm-av-premio','adm-av-foto','adm-av-note','adm-av-edit-id'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
};

window.salvaAvventoGiorno = async function() {
    if (!hasAdminPerm('calendario') && !currentUser?.isAdmin) return vampireToast('Non hai il permesso Calendario.', 'error');
    const giorno = Number(document.getElementById('adm-av-giorno')?.value);
    if (!giorno || giorno < 1 || giorno > 31) return vampireToast('Seleziona un giorno valido (1-31).', 'error');
    const data = {
        giorno,
        titolo: (document.getElementById('adm-av-titolo')?.value || '').trim(),
        premio: (document.getElementById('adm-av-premio')?.value || '').trim(),
        fotoUrl: (document.getElementById('adm-av-foto')?.value || '').trim(),
        note: (document.getElementById('adm-av-note')?.value || '').trim(),
        updatedAt: Date.now()
    };
    try {
        await setDoc(doc(db, 'calendario_avvento', String(giorno)), data, { merge: true });
        logSystemEvent('calendario', 'avvento_salva', `Avvento giorno ${giorno}`, { giorno });
        vampireToast(`Giorno ${giorno} salvato.`, 'success');
        window.resetFormAvvento();
    } catch (err) {
        vampireToast('Errore: ' + (err.message || err), 'error');
    }
};

window.eliminaAvventoGiorno = async function(id) {
    if (!hasAdminPerm('calendario') && !currentUser?.isAdmin) return vampireToast('Non hai il permesso Calendario.', 'error');
    const res = await Swal.fire({ title: 'Rimuovere giorno avvento?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#8b0000', background: '#111', color: '#fff' });
    if (!res.isConfirmed) return;
    try {
        await deleteDoc(doc(db, 'calendario_avvento', id));
        logSystemEvent('calendario', 'avvento_elimina', `Eliminato giorno avvento ${id}`, { id });
        vampireToast('Giorno rimosso.', 'success');
    } catch (err) {
        vampireToast('Errore: ' + (err.message || err), 'error');
    }
};

let _admMeseFotoTemp = [];

window.caricaMeseCal = function(mese) {
    const anno = getCalAnnoAdmin();
    const e = (calendarioMesi || []).find(x => Number(x.mese) === Number(mese) && Number(x.anno) === anno);
    document.getElementById('adm-mese-num').value = String(mese);
    document.getElementById('adm-mese-nome').value = e?.nome || CAL_MESI_NOMI[mese];
    document.getElementById('adm-mese-edit-id').value = e?.id || '';
    _admMeseFotoTemp = (e && Array.isArray(e.foto)) ? e.foto.map(f => ({ url: f.url || '', caption: f.caption || '' })) : [];
    renderAdmMeseFotoTemp();
    window.switchAdminCalTab('mesi');
};

window.resetFormMese = function() {
    const n = document.getElementById('adm-mese-nome'); if (n) n.value = '';
    const e = document.getElementById('adm-mese-edit-id'); if (e) e.value = '';
    const u = document.getElementById('adm-mese-foto-url'); if (u) u.value = '';
    const c = document.getElementById('adm-mese-foto-caption'); if (c) c.value = '';
    _admMeseFotoTemp = [];
    renderAdmMeseFotoTemp();
};

function renderAdmMeseFotoTemp() {
    const box = document.getElementById('adm-mese-foto-lista');
    if (!box) return;
    if (!_admMeseFotoTemp.length) {
        box.innerHTML = '<p style="opacity:0.5;font-size:0.75rem;">Nessuna foto. Aggiungine una sotto.</p>';
        return;
    }
    box.innerHTML = _admMeseFotoTemp.map((f, i) => `
        <div class="adm-cal-foto-row">
            <img src="${String(f.url).replace(/"/g,'&quot;')}" alt="" onerror="this.style.opacity=0.2">
            <div style="flex:1;min-width:0;">
                <div style="font-size:0.7rem;word-break:break-all;opacity:0.8;">${escapeHtmlCal(f.url)}</div>
                <div style="font-size:0.75rem;color:var(--gold-dim);">${escapeHtmlCal(f.caption || '—')}</div>
            </div>
            <button type="button" class="btn-delete" onclick="window.rimuoviFotoMeseTemp(${i})">X</button>
        </div>`).join('');
}

window.aggiungiFotoMeseTemp = function() {
    const url = (document.getElementById('adm-mese-foto-url')?.value || '').trim();
    const caption = (document.getElementById('adm-mese-foto-caption')?.value || '').trim();
    if (!url) return vampireToast('Inserisci URL foto.', 'error');
    _admMeseFotoTemp.push({ url, caption });
    document.getElementById('adm-mese-foto-url').value = '';
    document.getElementById('adm-mese-foto-caption').value = '';
    renderAdmMeseFotoTemp();
};

window.rimuoviFotoMeseTemp = function(i) {
    _admMeseFotoTemp.splice(i, 1);
    renderAdmMeseFotoTemp();
};

window.salvaMeseCal = async function() {
    if (!hasAdminPerm('calendario') && !currentUser?.isAdmin) return vampireToast('Non hai il permesso Calendario.', 'error');
    const mese = Number(document.getElementById('adm-mese-num')?.value);
    if (!mese || mese < 1 || mese > 12) return vampireToast('Seleziona un mese valido.', 'error');
    const anno = getCalAnnoAdmin();
    const nome = (document.getElementById('adm-mese-nome')?.value || '').trim() || CAL_MESI_NOMI[mese];
    const data = { anno, mese, nome, foto: _admMeseFotoTemp.filter(f => f.url), updatedAt: Date.now() };
    try {
        const id = `${anno}-${String(mese).padStart(2, '0')}`;
        await setDoc(doc(db, 'calendario_mesi', id), data, { merge: true });
        logSystemEvent('calendario', 'mese_salva', `Mese ${CAL_MESI_NOMI[mese]} ${anno}`, { anno, mese, nFoto: data.foto.length });
        vampireToast(`${CAL_MESI_NOMI[mese]} ${anno} salvato.`, 'success');
        window.resetFormMese();
    } catch (err) {
        vampireToast('Errore: ' + (err.message || err), 'error');
    }
};

window.eliminaMeseCal = async function(id) {
    if (!hasAdminPerm('calendario') && !currentUser?.isAdmin) return vampireToast('Non hai il permesso Calendario.', 'error');
    const res = await Swal.fire({ title: 'Rimuovere dati del mese?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#8b0000', background: '#111', color: '#fff' });
    if (!res.isConfirmed) return;
    try {
        await deleteDoc(doc(db, 'calendario_mesi', id));
        logSystemEvent('calendario', 'mese_elimina', `Eliminato mese ${id}`, { id });
        vampireToast('Mese rimosso.', 'success');
    } catch (err) {
        vampireToast('Errore: ' + (err.message || err), 'error');
    }
};

setInterval(() => {
    if (typeof isSectionActive === 'function' && isSectionActive('calendario')) window.renderCalendarioSezione?.();
}, 60000);
