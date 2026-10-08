import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, doc, updateDoc, setDoc, deleteDoc, query, orderBy, limit, getDocs, where } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
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
let dungeonDati = [];
let conquisteDati = [];
let saldoGlobale = 0;
let listaVampiri = [];
let comunicazioni = [];
let documenti = [];
let itemImagesLib = []; // { id, fileName, dataUrl, size, createdAt }
let tipiMateriale = []; // { id, nome, prezzoUnitario, percPropria, percDinastia, percEkaton, sezioni:[], attivo }
let alberoNodi = []; // { id, nome, cognome, clan, anno, parentId, foto, note, ordine, createdAt }
let tipiLavoro = []; // { id, nome, sblocchi: [{ livello, item, ingredienti, strumenti }], createdAt }
let lavoriMembri = []; // { id, vampiro, lavoroId, lavoroNome, livello } — più record per stesso vampiro

let squadraDungeonTemp = [];
let squadraConquistaTemp = [];

// Utente loggato corrente (null se non autenticato)
let currentUser = null; // { nome, grado, codice, password, permessi: [], isAdmin: false }
let listenersStarted = false;

const VALORE_UNITARIO = 30; // fallback legacy

// Sezioni disponibili e mapping nav
const SEZIONI = {
    albero: { id: 'albero', label: 'Albero' },
    generale: { id: 'generale', label: 'Generale' },
    lavori: { id: 'lavori', label: 'Lavori' },
    vendite: { id: 'vendite', label: 'Vendite' },
    materiali: { id: 'materiali', label: 'Vendita Materiali' },
    saldo: { id: 'saldo', label: 'Saldo' },
    calcolo: { id: 'calcolo', label: 'Calcolo' },
    inventario: { id: 'inventario', label: 'Inventario' },
    dungeon: { id: 'dungeon', label: 'Dungeon' },
    conquiste: { id: 'conquiste', label: 'Conquiste' },
    gestione: { id: 'gestione', label: 'Gestione' },
    foto: { id: 'foto', label: 'Foto' }
};

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
            return vampireToast("Accesso negato. Password errata.", "error");
        }

        if (found.archiviato === true) {
            return vampireToast("Questo membro risulta archiviato (uscito dalla dinastia). Accesso non consentito.", "error");
        }

        // Login membro riuscito
        currentUser = {
            nome: found.nome,
            grado: found.grado || "",
            codice: found.codice,
            password: found.password,
            permessi: Array.isArray(found.permessi) ? found.permessi : ["generale"],
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
        vampireToast("Accesso Gestore garantito.", "success");
    } catch (error) {
        vampireToast("Credenziali Gestore errate.", "error");
    }
};

// --- Switch tra login membro / gestore sulla schermata principale ---
window.mostraLoginGestore = () => {
    document.getElementById('login-membro-box').style.display = 'none';
    document.getElementById('login-gestore-box').style.display = 'block';
    setTimeout(() => document.getElementById('global-admin-pass')?.focus(), 50);
};

window.mostraLoginMembro = () => {
    document.getElementById('login-gestore-box').style.display = 'none';
    document.getElementById('login-membro-box').style.display = 'block';
    setTimeout(() => document.getElementById('global-codice')?.focus(), 50);
};

window.unlockGestore = async () => {
    const passInput = (document.getElementById('global-admin-pass')?.value || "").trim();
    const email = "vampiri.gestore@horde.it";

    if(!passInput) return vampireToast("Inserire la password gestore.", "error");

    try {
        await signInWithEmailAndPassword(auth, email, passInput);
        // onAuthStateChanged si occupa del resto (mostra pannello admin)
        vampireToast("Accesso Gestore garantito.", "success");
    } catch (error) {
        vampireToast("Credenziali Gestore errate.", "error");
    }
};

// Applica visibilità nav e form in base ai permessi
function applyPermissions() {
    if (!currentUser) return;

    const isAdmin = currentUser.isAdmin;
    const perm = currentUser.permessi || [];

    // Nav links interni
    document.querySelectorAll('.nav-link[onclick]').forEach(link => {
        const onclick = link.getAttribute('onclick') || "";
        let sectionId = null;
        if (onclick.includes("showSection('")) {
            sectionId = onclick.match(/showSection\('([^']+)'\)/)?.[1];
        }
        if (sectionId === 'gestione') {
            link.style.display = isAdmin ? '' : 'none';
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
            window.showSection('gestione'); 
            refreshAdminUI();
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
    window.renderAdminDungeon(); 
    window.renderAdminConquiste();
    window.renderAdminMateriali(); 
    if (typeof window.renderAdminTipiMateriale === 'function') window.renderAdminTipiMateriale();
    if (typeof window.renderAdminAlbero === 'function') window.renderAdminAlbero();
    if (typeof window.renderAdminLavoriMembri === 'function') window.renderAdminLavoriMembri();
    if (typeof window.renderAdminTipiLavoro === 'function') window.renderAdminTipiLavoro();
    if (typeof window.popolaSelectTipiLavoro === 'function') window.popolaSelectTipiLavoro();
    renderVampiriLists(); 
    renderDinamici(); 
    if (typeof window.renderSezioneLavori === 'function' && isSectionActive('lavori')) window.renderSezioneLavori();
    aggiornaStats(); 
    aggiornaStatsDungeon();
    aggiornaStatsConquiste();
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
        currentUser = null;
        try { localStorage.removeItem('vamp_session'); } catch(e){}
        await signOut(auth);
        vampireToast("Sessione chiusa correttamente.", "info");
        setTimeout(() => { location.reload(); }, 800);
    }
};

// --- LOGICA SEZIONI ---
window.showSection = (id) => {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    const target = document.getElementById(id);
    if (target) target.classList.add('active');
    const link = Array.from(document.querySelectorAll('.nav-link')).find(l => l.getAttribute('onclick')?.includes(id));
    if (link) link.classList.add('active');
    window.scrollTo(0, 0);

    // Disegna la sezione solo quando la apri (dati già in memoria)
    if (typeof window.refreshActiveSectionUI === 'function') {
        scheduleUI(() => window.refreshActiveSectionUI());
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

// --- GESTIONE DINAMICA ---
window.addDinamico = async (col) => {
    const pref = col === 'comunicazioni' ? 'adm-com-' : 'adm-doc-';
    const titolo = document.getElementById(pref + 'titolo').value.trim();
    const desc = document.getElementById(pref + 'desc').value.trim();
    const link = document.getElementById(pref + 'link').value.trim();
    const firma = document.getElementById(pref + 'firma').value.trim() || "Vitrio";

    if(!titolo || !desc) return vampireToast("Titolo e descrizione obbligatori", "error");
    await addDoc(collection(db, col), { titolo, desc, link, firma, timestamp: Date.now() });
    
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
    // (per ripristino usare esplicitamente ripristinaVampiro)

    await setDoc(doc(db, "membri", nome), data, { merge: true });
    
    document.getElementById('admin-vamp-nome').value = "";
    document.getElementById('admin-vamp-grado').value = "";
    if(document.getElementById('admin-vamp-codice')) document.getElementById('admin-vamp-codice').value = "";
    if(document.getElementById('admin-vamp-password')) document.getElementById('admin-vamp-password').value = "";
    // Reset checkboxes a default
    document.querySelectorAll('.perm-check').forEach(cb => {
        cb.checked = ['albero','generale','lavori','vendite','materiali','saldo','inventario','dungeon','conquiste'].includes(cb.value);
    });
    
    vampireToast("Membro salvato correttamente.", "success");
};

/** Membri non archiviati (attivi in dinastia) */
function membriAttivi() {
    return listaVampiri.filter(v => v.archiviato !== true);
}

/** Membri archiviati (usciti) */
function membriArchiviati() {
    return listaVampiri.filter(v => v.archiviato === true);
}

window.archiviaVampiro = async (id) => {
    if (!currentUser || !currentUser.isAdmin) {
        return vampireToast("Solo il gestore può archiviare membri.", "error");
    }
    const v = listaVampiri.find(x => x.nome === id);
    if (!v) return vampireToast("Membro non trovato.", "error");
    if (v.archiviato === true) return vampireToast("Questo membro è già archiviato.", "info");

    const res = await Swal.fire({
        title: 'Archiviare membro?',
        html: `<p style="margin-bottom:12px;font-size:0.85rem;">Stai per archiviare <strong style="color:#c5a059">${v.nome}</strong>.<br>
        Non comparirà più in Generale né nei selettori.<br>
        <span style="color:#aaa;font-size:0.75rem;">Lo storico vendite/materiali resta intatto.</span></p>
        <label style="display:block;text-align:left;font-size:0.7rem;color:#c5a059;margin-bottom:6px;">Motivo archiviazione *</label>`,
        input: 'text',
        inputPlaceholder: 'es. Uscito dalla dinastia, Inattivo, Trasferimento...',
        inputAttributes: { maxlength: 200 },
        showCancelButton: true,
        confirmButtonText: 'Archivia',
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
            archiviato: true,
            motivoArchivio: motivo,
            dataArchivio: Date.now(),
            aggiornatoArchivioDa: currentUser.nome || 'GESTORE'
        }, { merge: true });
        vampireToast(`${id} archiviato. Motivo: ${motivo}`, "success");
    } catch (err) {
        console.error(err);
        vampireToast("Errore durante l'archiviazione.", "error");
    }
};

window.ripristinaVampiro = async (id) => {
    if (!currentUser || !currentUser.isAdmin) {
        return vampireToast("Solo il gestore può ripristinare membri.", "error");
    }
    const res = await Swal.fire({
        title: 'Ripristinare membro?',
        text: 'Tornerà visibile in Generale e nei selettori.',
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#2ecc71',
        background: '#111',
        color: '#fff',
        confirmButtonText: 'Ripristina',
        cancelButtonText: 'Annulla'
    });
    if (!res.isConfirmed) return;
    try {
        await setDoc(doc(db, "membri", id), {
            archiviato: false,
            motivoArchivio: '',
            dataArchivio: null,
            ripristinatoAt: Date.now()
        }, { merge: true });
        vampireToast(`${id} ripristinato tra i membri attivi.`, "success");
    } catch (err) {
        console.error(err);
        vampireToast("Errore durante il ripristino.", "error");
    }
};

window.eliminaVampiro = async (id) => {
    const res = await Swal.fire({
        title: 'Eliminare definitivamente?',
        html: 'Questa azione <strong>cancella il documento membro</strong>.<br>Lo storico vendite resta, ma il profilo sparisce del tutto.<br><span style="color:#aaa;font-size:0.75rem;">Preferisci archiviare se vuoi solo nasconderlo.</span>',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#8b0000',
        background: '#111',
        color: '#fff',
        confirmButtonText: 'Elimina per sempre'
    });
    if(res.isConfirmed) {
        await deleteDoc(doc(db, "membri", id));
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
    // Contatori solo sui membri ATTIVI (non archiviati)
    const keys = [
        { label: 'Originario', match: ['originario'] },
        { label: 'Originaria', match: ['originaria'] },
        { label: 'Mentore', match: ['mentore'] },
        { label: 'Adulta', match: ['adulta'] },
        { label: 'Adulto', match: ['adulto', 'adulti'] },
        { label: 'Neonata', match: ['neonata'] },
        { label: 'Neonato', match: ['neonato'] }
    ];
    const counts = {};
    keys.forEach(k => { counts[k.label] = 0; });
    membriAttivi().forEach(v => {
        const g = (v.grado || '').toLowerCase().trim();
        keys.forEach(k => {
            if (k.match.includes(g)) counts[k.label]++;
        });
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

function htmlContatoreArchiviati() {
    const n = membriArchiviati().length;
    return `<div class="rango-count-wrap">
        <span class="rango-count-chip rango-count-tot" style="border-left-color:var(--withdraw-red);">
            <span class="rango-count-label">Archiviati</span>
            <strong class="rango-count-num">${n}</strong>
        </span>
    </div>`;
}

function renderVampiriLists() {
    // Ordine gradi: Originario → Originaria → Mentore → Adulto → Adulta → Neonato → Neonata
    const ordineGradi = {
        'originario': 1,
        'originaria': 2,
        'mentore': 3,
        'adulto': 4,
        'adulta': 5,
        'neonato': 6,
        'neonata': 7,
        'anziano': 8, // legacy
        'anziana': 9
    };
    listaVampiri.sort((a, b) => {
        const ga = ordineGradi[(a.grado || "").toLowerCase().trim()] || 99;
        const gb = ordineGradi[(b.grado || "").toLowerCase().trim()] || 99;
        if (ga !== gb) return ga - gb;
        return (a.nome || "").localeCompare(b.nome || "", 'it');
    });

    const attivi = membriAttivi();

    // Contatori ranghi (Generale + Admin Membri) — solo attivi
    const counterGen = document.getElementById('membri-ranghi-counter');
    if (counterGen) counterGen.innerHTML = htmlContatoriRanghi(true);
    const counterAdm = document.getElementById('admin-membri-ranghi-counter');
    if (counterAdm) counterAdm.innerHTML = htmlContatoriRanghi(false);
    const counterArch = document.getElementById('admin-archiviati-counter');
    if (counterArch) counterArch.innerHTML = htmlContatoreArchiviati();

    // Lista Generale: solo membri attivi
    const listaDinamica = document.getElementById('lista-membri-dinamica');
    if (listaDinamica) {
        listaDinamica.innerHTML = attivi.length
            ? attivi.map(v => `<p style="font-size: 0.8rem; color: var(--text-light); margin-bottom: 5px;"><strong>${v.nome}:</strong> ${v.grado}</p>`).join('')
            : '<p style="font-size:0.75rem; opacity:0.5;">Nessun membro attivo.</p>';
    }

    // Select: solo membri attivi (storico vendite resta per nome)
    const selects = document.querySelectorAll('.vampiro-select-list');
    const options = `<option value="">-- Seleziona Vampiro --</option>` + attivi.map(v => `<option value="${v.nome}">${v.nome}</option>`).join('');
    selects.forEach(s => { 
        const currentVal = s.value; 
        s.innerHTML = options; 
        s.value = currentVal; 
        if (currentUser && !currentUser.isAdmin && ['vamp-nome','mat-vamp-nome','saldo-nome','inv-user-name','calc-search-name'].includes(s.id)) {
            s.value = currentUser.nome;
        }
    });

    window.renderAdminMembriTable();
    if (typeof window.renderAdminArchiviatiTable === 'function') window.renderAdminArchiviatiTable();
    
    if (currentUser) applyPermissions();
}

/** Tabella admin membri ATTIVI con filtro ricerca */
window.renderAdminMembriTable = function() {
    const tbody = document.getElementById('admin-vampiri-body');
    if (!tbody) return;
    const search = (document.getElementById('search-admin-membri')?.value || '').toLowerCase().trim();
    let list = membriAttivi();
    if (search) {
        list = list.filter(v =>
            (v.nome || '').toLowerCase().includes(search) ||
            (v.grado || '').toLowerCase().includes(search) ||
            String(v.codice || '').toLowerCase().includes(search)
        );
    }
    tbody.innerHTML = list.map(v => {
        const cod = v.codice ? v.codice : '<span style="opacity:0.4">—</span>';
        const perms = Array.isArray(v.permessi) ? v.permessi.length + ' sez.' : '0';
        const safeName = String(v.nome || '').replace(/'/g, "\\'");
        return `<tr>
            <td>${v.nome}</td>
            <td>${v.grado || ''}</td>
            <td style="font-family:monospace;">${cod}</td>
            <td style="font-size:0.65rem;">${perms}</td>
            <td style="white-space:nowrap;">
                <button class="btn-delete" style="border-color:var(--gold-accent);color:var(--gold-accent);margin-right:4px;" onclick="window.caricaMembroPerEdit('${safeName}')">Modifica</button>
                <button class="btn-delete" style="border-color:#e67e22;color:#e67e22;margin-right:4px;" onclick="window.archiviaVampiro('${safeName}')">Archivia</button>
                <button class="btn-delete" onclick="window.eliminaVampiro('${safeName}')">Elimina</button>
            </td>
        </tr>`;
    }).join('') || '<tr><td colspan="5" style="opacity:0.5;text-align:center;">Nessun membro attivo trovato.</td></tr>';
};

/** Tabella admin membri ARCHIVIATI */
window.renderAdminArchiviatiTable = function() {
    const tbody = document.getElementById('admin-archiviati-body');
    if (!tbody) return;
    const search = (document.getElementById('search-admin-archiviati')?.value || '').toLowerCase().trim();
    let list = membriArchiviati();
    if (search) {
        list = list.filter(v =>
            (v.nome || '').toLowerCase().includes(search) ||
            (v.grado || '').toLowerCase().includes(search) ||
            (v.motivoArchivio || '').toLowerCase().includes(search) ||
            String(v.codice || '').toLowerCase().includes(search)
        );
    }
    list = [...list].sort((a, b) => (b.dataArchivio || 0) - (a.dataArchivio || 0));
    tbody.innerHTML = list.map(v => {
        const safeName = String(v.nome || '').replace(/'/g, "\\'");
        const motivo = v.motivoArchivio || '—';
        let dataStr = '—';
        if (v.dataArchivio) {
            try {
                dataStr = new Date(v.dataArchivio).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
            } catch (_) {}
        }
        return `<tr>
            <td><strong>${v.nome}</strong></td>
            <td>${v.grado || ''}</td>
            <td style="font-size:0.65rem; max-width:180px; word-break:break-word;" title="${String(motivo).replace(/"/g, '&quot;')}">${motivo}</td>
            <td style="font-size:0.65rem; font-family:monospace;">${dataStr}</td>
            <td style="white-space:nowrap;">
                <button class="btn-delete" style="border-color:var(--success-green);color:var(--success-green);margin-right:4px;" onclick="window.ripristinaVampiro('${safeName}')">Ripristina</button>
                <button class="btn-delete" onclick="window.eliminaVampiro('${safeName}')">Elimina</button>
            </td>
        </tr>`;
    }).join('') || '<tr><td colspan="5" style="opacity:0.5;text-align:center;">Nessun membro archiviato.</td></tr>';
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
        venditeMateriali = [matEntry, ...venditeMateriali];
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

    const gruppi = {};
    venditeMateriali.forEach(m => { 
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
        vampireToast("Record rimosso con successo.", "success"); 
    }
};

// --- LOGICA MORSI ---
// --- LOGICA DUNGEON ---
window.aggiungiMembroSquadra = () => {
    const nome = document.getElementById('dungeon-select-membro').value;
    if(!nome) return;
    if(squadraDungeonTemp.includes(nome)) return vampireToast("Membro già in squadra.", "error");
    squadraDungeonTemp.push(nome);
    renderSquadraTemp();
};

function renderSquadraTemp() {
    const box = document.getElementById('squadra-temporanea');
    if(!box) return;
    box.innerHTML = squadraDungeonTemp.map(n => `
        <div class="status-badge status-attivo" style="display:flex; align-items:center; gap:8px;">
            ${n} <span onclick="window.rimuoviMembroSquadra('${n}')" style="cursor:pointer; font-weight:bold;">×</span>
        </div>`).join('');
}

window.rimuoviMembroSquadra = (nome) => {
    squadraDungeonTemp = squadraDungeonTemp.filter(n => n !== nome);
    renderSquadraTemp();
};

window.avviaDungeon = async () => {
    const livello = document.getElementById('dungeon-livello').value;
    const esito = document.getElementById('dungeon-esito').value;
    const bottino = (document.getElementById('dungeon-bottino')?.value || '').trim();
    if(squadraDungeonTemp.length === 0) return vampireToast("Seleziona almeno un membro.", "error");

    const now = new Date();
    const oraInizio = Date.now();
    await addDoc(collection(db, "dungeon"), {
        squadra: squadraDungeonTemp,
        livello: livello,
        esito: esito,
        bottino: bottino,
        inizio: oraInizio,
        scadenza: oraInizio + (30 * 60 * 1000),
        dataStr: now.toLocaleDateString('it-IT'),
        oraStr: now.toLocaleTimeString('it-IT')
    });

    squadraDungeonTemp = [];
    renderSquadraTemp();
    if (document.getElementById('dungeon-bottino')) document.getElementById('dungeon-bottino').value = '';
    vampireToast("Incursione registrata con successo.", "success");
};

window.renderDungeon = () => {
    updateDungeonTimers();
    aggiornaStatsDungeon();
};

function aggiornaStatsDungeon() {
    const total = dungeonDati.length;
    const success = dungeonDati.filter(d => d.esito === 'successo').length;
    const fail = dungeonDati.filter(d => d.esito === 'fallimento').length;

    if(document.getElementById('stat-dungeon-tot')) document.getElementById('stat-dungeon-tot').innerText = total;
    if(document.getElementById('stat-dungeon-vittorie')) document.getElementById('stat-dungeon-vittorie').innerText = success;
    if(document.getElementById('stat-dungeon-sconfitte')) document.getElementById('stat-dungeon-sconfitte').innerText = fail;

    if(document.getElementById('admin-stat-dungeon-tot')) document.getElementById('admin-stat-dungeon-tot').innerText = total;
    if(document.getElementById('admin-stat-dungeon-vittorie')) document.getElementById('admin-stat-dungeon-vittorie').innerText = success;
    if(document.getElementById('admin-stat-dungeon-sconfitte')) document.getElementById('admin-stat-dungeon-sconfitte').innerText = fail;
}

function updateDungeonTimers() {
    const tbody = document.getElementById('lista-dungeon');
    if(!tbody) return;
    const searchTerm = document.getElementById('search-dungeon').value.toLowerCase();

    tbody.innerHTML = dungeonDati
        .filter(d => {
            const sq = (d.squadra || []).join(' ').toLowerCase();
            const liv = (d.livello || '').toString();
            const bot = (d.bottino || '').toLowerCase();
            return sq.includes(searchTerm) || liv.includes(searchTerm) || bot.includes(searchTerm);
        })
        .sort((a,b) => b.inizio - a.inizio)
        .map(d => {
            const oraAttuale = Date.now();
            const diff = (d.scadenza || 0) - oraAttuale;
            let timerHTML = "";

            if(diff > 0) {
                const min = Math.floor(diff / 60000);
                const sec = Math.floor((diff % 60000) / 1000);
                timerHTML = `<span class="status-badge status-attivo">${min}m ${sec}s</span>`;
            } else {
                timerHTML = `<span class="status-badge status-passato">Concluso</span>`;
            }

            const esitoText = d.esito ? d.esito.toUpperCase() : "N/D";
            const esitoClass = d.esito === 'successo' ? 'status-attivo' : 'status-passato';
            const bottinoText = d.bottino ? d.bottino : '—';

            return `
                <tr>
                    <td><span class="ts-label">${d.dataStr || ''}</span> <strong>${(d.squadra || []).join(', ')}</strong></td>
                    <td>Livello ${d.livello || '?'}</td>
                    <td><span class="status-badge ${esitoClass}">${esitoText}</span></td>
                    <td style="font-size:0.75rem; color:var(--gold-dim); max-width:180px; word-break:break-word;">${bottinoText}</td>
                    <td>${timerHTML}</td>
                    <td style="font-size:0.7rem; opacity:0.6;">${d.oraStr || new Date(d.inizio || 0).toLocaleTimeString()}</td>
                </tr>`;
        }).join('');
}

setInterval(updateDungeonTimers, 1000);

// --- LOGICA CONQUISTE ---
window.aggiungiMembroConquista = () => {
    const nome = document.getElementById('conquista-select-membro').value;
    if(!nome) return;
    if(squadraConquistaTemp.includes(nome)) return vampireToast("Membro già in squadra.", "error");
    squadraConquistaTemp.push(nome);
    renderSquadraConquistaTemp();
};

function renderSquadraConquistaTemp() {
    const box = document.getElementById('squadra-conquista-temporanea');
    if(!box) return;
    box.innerHTML = squadraConquistaTemp.map(n => `
        <div class="status-badge status-attivo" style="display:flex; align-items:center; gap:8px; border-color: var(--gold-accent);">
            ${n} <span onclick="window.rimuoviMembroConquista('${n}')" style="cursor:pointer; font-weight:bold;">×</span>
        </div>`).join('');
}

window.rimuoviMembroConquista = (nome) => {
    squadraConquistaTemp = squadraConquistaTemp.filter(n => n !== nome);
    renderSquadraConquistaTemp();
};

window.registraConquista = async () => {
    const zona = document.getElementById('conquista-zona').value.trim();
    const esito = document.getElementById('conquista-esito').value;
    const bottino = (document.getElementById('conquista-bottino')?.value || '').trim();
    if(squadraConquistaTemp.length === 0 || !zona) return vampireToast("Inserire squadra e zona.", "error");

    const now = new Date();
    await addDoc(collection(db, "conquiste"), {
        squadra: squadraConquistaTemp,
        zona: zona,
        esito: esito,
        bottino: bottino,
        timestamp: Date.now(),
        dataStr: now.toLocaleDateString('it-IT') + " " + now.toLocaleTimeString('it-IT')
    });

    squadraConquistaTemp = [];
    document.getElementById('conquista-zona').value = "";
    if (document.getElementById('conquista-bottino')) document.getElementById('conquista-bottino').value = '';
    renderSquadraConquistaTemp();
    vampireToast("Operazione di conquista registrata.", "success");
};

window.renderConquiste = () => {
    const tbody = document.getElementById('lista-conquiste');
    if(!tbody) return;
    const searchTerm = document.getElementById('search-conquiste').value.toLowerCase();

    tbody.innerHTML = conquisteDati
        .filter(c => {
            const sq = (c.squadra || []).join(' ').toLowerCase();
            const zona = (c.zona || '').toLowerCase();
            const bot = (c.bottino || '').toLowerCase();
            return sq.includes(searchTerm) || zona.includes(searchTerm) || bot.includes(searchTerm);
        })
        .sort((a,b) => b.timestamp - a.timestamp)
        .map(c => {
            const esitoText = c.esito ? c.esito.toUpperCase() : "N/D";
            const esitoClass = c.esito === 'successo' ? 'status-attivo' : 'status-passato';
            const bottinoText = c.bottino ? c.bottino : '—';
            return `
            <tr>
                <td style="font-size:0.7rem;">${c.dataStr || ''}</td>
                <td>${(c.squadra || []).join(', ')}</td>
                <td style="color: var(--gold-accent);">${c.zona || ''}</td>
                <td><span class="status-badge ${esitoClass}">${esitoText}</span></td>
                <td style="font-size:0.75rem; color:var(--gold-dim); max-width:180px; word-break:break-word;">${bottinoText}</td>
            </tr>`;
        }).join('');

    aggiornaStatsConquiste();
};

function aggiornaStatsConquiste() {
    const total = conquisteDati.length;
    const success = conquisteDati.filter(c => c.esito === 'successo').length;
    const fail = conquisteDati.filter(c => c.esito === 'fallimento').length;

    if(document.getElementById('stat-conquista-tot')) document.getElementById('stat-conquista-tot').innerText = total;
    if(document.getElementById('stat-conquista-vittorie')) document.getElementById('stat-conquista-vittorie').innerText = success;
    if(document.getElementById('stat-conquista-sconfitte')) document.getElementById('stat-conquista-sconfitte').innerText = fail;

    if(document.getElementById('admin-stat-conquista-tot')) document.getElementById('admin-stat-conquista-tot').innerText = total;
    if(document.getElementById('admin-stat-conquista-vittorie')) document.getElementById('admin-stat-conquista-vittorie').innerText = success;
    if(document.getElementById('admin-stat-conquista-sconfitte')) document.getElementById('admin-stat-conquista-sconfitte').innerText = fail;
}

// --- LOGICA ADMIN ---
window.renderAdminDungeon = () => {
    const container = document.getElementById('admin-dungeon-body');
    if(!container) return;
    const searchTerm = document.getElementById('search-admin-dungeon').value.toLowerCase();

    container.innerHTML = dungeonDati
        .filter(d => {
            const sq = (d.squadra || []).join(' ').toLowerCase();
            const liv = (d.livello || '').toString();
            const bot = (d.bottino || '').toLowerCase();
            return sq.includes(searchTerm) || liv.includes(searchTerm) || bot.includes(searchTerm);
        })
        .sort((a,b) => b.inizio - a.inizio)
        .map(d => {
            const esitoText = d.esito ? d.esito.toUpperCase() : "N/D";
            const bottinoText = d.bottino ? d.bottino : '—';
            return `
            <tr>
                <td style="font-size:0.65rem;">${d.dataStr || ''}<br>${d.oraStr || ''}</td>
                <td>${(d.squadra || []).join(', ')}</td>
                <td>Liv ${d.livello || ''}</td>
                <td><small>${esitoText}</small></td>
                <td style="font-size:0.65rem; color:var(--gold-dim); max-width:140px; word-break:break-word;">${bottinoText}</td>
                <td><button class="btn-delete" onclick="window.adminDeleteDungeon('${d.id}')">X</button></td>
            </tr>`;
        }).join('');
};

window.adminDeleteDungeon = async (id) => {
    const res = await Swal.fire({ title: 'Eliminare Dungeon?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#8b0000', background: '#111' });
    if(res.isConfirmed) {
        await deleteDoc(doc(db, "dungeon", id));
        vampireToast("Dungeon eliminato.", "success");
    }
};

window.renderAdminConquiste = () => {
    const container = document.getElementById('admin-conquiste-body');
    if(!container) return;
    const searchTerm = document.getElementById('search-admin-conquiste').value.toLowerCase();

    container.innerHTML = conquisteDati
        .filter(c => {
            const sq = (c.squadra || []).join(' ').toLowerCase();
            const zona = (c.zona || '').toLowerCase();
            const bot = (c.bottino || '').toLowerCase();
            return sq.includes(searchTerm) || zona.includes(searchTerm) || bot.includes(searchTerm);
        })
        .sort((a,b) => b.timestamp - a.timestamp)
        .map(c => {
            const esitoText = c.esito ? c.esito.toUpperCase() : "N/D";
            const bottinoText = c.bottino ? c.bottino : '—';
            return `
            <tr>
                <td style="font-size:0.65rem;">${c.dataStr || ''}</td>
                <td>${(c.squadra || []).join(', ')}</td>
                <td>${c.zona || ''}</td>
                <td><small>${esitoText}</small></td>
                <td style="font-size:0.65rem; color:var(--gold-dim); max-width:140px; word-break:break-word;">${bottinoText}</td>
                <td><button class="btn-delete" onclick="window.adminDeleteConquista('${c.id}')">X</button></td>
            </tr>`;
        }).join('');
};

window.adminDeleteConquista = async (id) => {
    const res = await Swal.fire({ title: 'Eliminare Conquista?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#8b0000', background: '#111' });
    if(res.isConfirmed) {
        await deleteDoc(doc(db, "conquiste", id));
        vampireToast("Conquista eliminata.", "success");
    }
};


// --- CLASSIFICHE VENDITE / MATERIALI (separate) ---
function renderClassifiche() {
    const currentWeek = getWeekYearKey(new Date());

    const buildRank = (rows, nameKey, qtyKey, creditKey, weekOnly) => {
        const map = {};
        rows.forEach(r => {
            if (weekOnly && r.settimanaEtichetta !== currentWeek) return;
            const nome = r[nameKey];
            if (!nome) return;
            if (!map[nome]) map[nome] = { qty: 0, crediti: 0 };
            map[nome].qty += (r[qtyKey] || 0);
            map[nome].crediti += (r[creditKey] || 0);
        });
        return Object.entries(map).sort((a, b) => b[1].qty - a[1].qty || b[1].crediti - a[1].crediti);
    };

    const rankVendSett = buildRank(vendite, 'nome', 'qty', 'dinastia', true);
    const rankVendSempre = buildRank(vendite, 'nome', 'qty', 'dinastia', false)
        .sort((a, b) => b[1].crediti - a[1].crediti || b[1].qty - a[1].qty);
    const rankMatSett = buildRank(venditeMateriali, 'vampiro', 'qty', 'vDin', true);
    const rankMatSempre = buildRank(venditeMateriali, 'vampiro', 'qty', 'vDin', false)
        .sort((a, b) => b[1].crediti - a[1].crediti || b[1].qty - a[1].qty);

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
    const elSempre = document.getElementById('top-sempre-box');
    const elMatSett = document.getElementById('top-mat-settimana-box');
    const elMatSempre = document.getElementById('top-mat-sempre-box');
    if (elSett) elSett.innerHTML = generateHtml(rankVendSett, 'qty');
    if (elSempre) elSempre.innerHTML = generateHtml(rankVendSempre, 'qty');
    if (elMatSett) elMatSett.innerHTML = generateHtml(rankMatSett, 'mat');
    if (elMatSempre) elMatSempre.innerHTML = generateHtml(rankMatSempre, 'mat');
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
    vendite = [vendEntry, ...vendite];
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
                        <img class="inv-img" src="${i.foto || 'https://via.placeholder.com/100/121212/8b0000?text=?'}" loading="lazy" decoding="async" width="100" height="100"
                             onerror="this.onerror=null;this.src='https://via.placeholder.com/100/121212/8b0000?text=?'">
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
            vampireToast(`Oggetto rinominato in "${n}" e aggiornato.`, "success");
        } else {
            await setDoc(doc(db, "inventario", n), { qty: q, categoria: c, foto, imageFileName }, { merge: true });
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
    vampireToast(`Quantità di ${item} modificata.`, "success");
};

window.adminDeleteItem = async (item) => {
    const res = await Swal.fire({ title: 'Eliminare?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#8b0000', background: '#111' });
    if(res.isConfirmed) { 
        await deleteDoc(doc(db, "inventario", item)); 
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
        vampireToast("Record di vendita eliminato.", "success"); 
    }
};

window.adminDeleteLog = async (id) => {
    const res = await Swal.fire({ title: 'Elimina Log', icon: 'warning', showCancelButton: true, confirmButtonColor: '#8b0000', background: '#111' });
    if(res.isConfirmed) { 
        await deleteDoc(doc(db, "logs", id)); 
        vampireToast("Log di movimento epurato.", "success"); 
    }
};

window.adminDeleteSaldoLog = async (id) => {
    const res = await Swal.fire({ title: 'Rimuovi Log Saldo?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#8b0000', background: '#111' });
    if(res.isConfirmed) { 
        await deleteDoc(doc(db, "saldo_logs", id)); 
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
    const searchTerm = document.getElementById('search-admin-archivio').value.toLowerCase();
    const container = document.getElementById('admin-archivio-container');
    if(!container) return;
    const gruppi = {};
    vendite.forEach(v => { if(!gruppi[v.settimanaEtichetta]) gruppi[v.settimanaEtichetta] = []; gruppi[v.settimanaEtichetta].push(v); });
    container.innerHTML = Object.keys(gruppi).sort().reverse().map(key => {
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
let _uiQueue = [];
let _uiScheduled = false;
function scheduleUI(fn, opts = 0) {
    if (typeof fn !== 'function') return;
    let delay = 0;
    let priority = 'high';
    if (typeof opts === 'number') {
        delay = opts;
        priority = opts > 0 ? 'normal' : 'high';
    } else if (opts && typeof opts === 'object') {
        delay = opts.delay || 0;
        priority = opts.priority || 'high';
    }
    // High priority: run ASAP (writes / active section)
    if (priority === 'high' && delay === 0) {
        if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(() => { try { fn(); } catch (e) { console.error(e); } });
        } else {
            setTimeout(() => { try { fn(); } catch (e) { console.error(e); } }, 0);
        }
        return;
    }
    // Normal / delayed: debounce batch to avoid snapshot storms
    _uiQueue.push(fn);
    if (_uiScheduled) return;
    _uiScheduled = true;
    const wait = delay > 0 ? delay : 40;
    setTimeout(() => {
        const batch = _uiQueue.slice();
        _uiQueue = [];
        _uiScheduled = false;
        const run = () => {
            const seen = new Set();
            batch.forEach(f => {
                if (seen.has(f)) return;
                seen.add(f);
                try { f(); } catch (e) { console.error(e); }
            });
        };
        if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 400 });
        else run();
    }, wait);
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
        case 'lavori':
            if (typeof window.ricaricaLavoriFromDb === 'function') {
                window.ricaricaLavoriFromDb().catch(() => {
                    if (typeof window.renderSezioneLavori === 'function') window.renderSezioneLavori();
                });
            } else if (typeof window.renderSezioneLavori === 'function') {
                window.renderSezioneLavori();
            }
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
        case 'dungeon':
            window.renderDungeon?.();
            break;
        case 'conquiste':
            window.renderConquiste?.();
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
    // --- FASE 1: essenziale subito (login / select / generale leggero) ---
    onSnapshot(collection(db, "membri"), (snap) => {
        listaVampiri = snap.docs.map(doc => doc.data());
        scheduleUI(() => {
            renderVampiriLists();
            if (isSectionActive('lavori') && typeof window.renderSezioneLavori === 'function') window.renderSezioneLavori();
        });
    });

    onSnapshot(collection(db, "tipi_lavoro"), (snap) => {
        tipiLavoro = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        console.log('[lavori] tipi_lavoro caricati:', tipiLavoro.length);
        // refresh immediato (non solo idle) così gestore vede i dati
        try {
            if (typeof window.popolaSelectTipiLavoro === 'function') window.popolaSelectTipiLavoro();
            if (typeof window.renderAdminTipiLavoro === 'function') window.renderAdminTipiLavoro();
            if (typeof window.renderAdminLavoriMembri === 'function') window.renderAdminLavoriMembri();
            if (isSectionActive('lavori') && typeof window.renderSezioneLavori === 'function') window.renderSezioneLavori();
        } catch (e) { console.error('[lavori] render tipi', e); }
    }, (err) => {
        console.error('[lavori] onSnapshot tipi_lavoro', err);
        vampireToast('Errore lettura tipi lavoro: ' + (err.code || err.message || err), 'error');
    });

    onSnapshot(collection(db, "lavori_membri"), (snap) => {
        lavoriMembri = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        console.log('[lavori] lavori_membri caricati:', lavoriMembri.length);
        try {
            if (typeof window.renderAdminLavoriMembri === 'function') window.renderAdminLavoriMembri();
            if (isSectionActive('lavori') && typeof window.renderSezioneLavori === 'function') window.renderSezioneLavori();
        } catch (e) { console.error('[lavori] render membri', e); }
    }, (err) => {
        console.error('[lavori] onSnapshot lavori_membri', err);
        vampireToast('Errore lettura assegnazioni lavori: ' + (err.code || err.message || err), 'error');
    });

    onSnapshot(collection(db, "tipi_materiale"), (snapshot) => {
        tipiMateriale = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        scheduleUI(() => {
            window.popolaSelectTipiMateriale?.();
            if (isAdminVisible()) window.renderAdminTipiMateriale?.();
        });
    });

    onSnapshot(doc(db, "config", "saldo"), (docSnap) => {
        if (docSnap.exists()) { saldoGlobale = docSnap.data().valore; }
        else { saldoGlobale = 0; setDoc(doc(db, "config", "saldo"), { valore: 0 }); }
        // Aggiornamento immediato (no idle): numero saldo sempre coerente
        const el = document.getElementById('tot-saldo-globale');
        if (el) el.innerText = fmt(saldoGlobale) + " cr";
        const adm = document.getElementById('admin-saldo-val');
        if (adm && document.activeElement !== adm) adm.value = saldoGlobale;
    });

    onSnapshot(query(collection(db, "comunicazioni"), orderBy("timestamp", "desc")), (snap) => {
        comunicazioni = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (isSectionActive('generale') || isAdminVisible()) scheduleUI(() => renderDinamici());
    });
    onSnapshot(query(collection(db, "documenti"), orderBy("timestamp", "desc")), (snap) => {
        documenti = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (isSectionActive('generale') || isAdminVisible()) scheduleUI(() => renderDinamici());
    });

    // --- FASE 2: dati pesanti (dopo un attimo, così la UI non si congela) ---
    setTimeout(() => {
        onSnapshot(collection(db, "vendite"), (snapshot) => {
            vendite = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const hot = isSectionActive('vendite') || isSectionActive('generale') || isSectionActive('calcolo');
            scheduleUI(() => {
                popolaFiltroSettimane?.();
                if (hot) {
                    if (isSectionActive('vendite')) window.renderVendite?.();
                    if (isSectionActive('generale')) renderClassifiche?.();
                    aggiornaStats?.();
                } else {
                    aggiornaStats?.();
                }
                if (isAdminVisible()) window.renderArchivioGestione?.();
            }, { priority: hot ? 'high' : 'normal' });
        });

        onSnapshot(collection(db, "vendite_materiali"), (snapshot) => {
            venditeMateriali = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const hot = isSectionActive('materiali') || isSectionActive('generale') || isSectionActive('calcolo');
            scheduleUI(() => {
                popolaFiltroMateriali?.();
                popolaFiltroSettimane?.();
                if (hot) {
                    if (isSectionActive('materiali')) window.renderMateriali?.();
                    if (isSectionActive('generale')) renderClassifiche?.();
                    aggiornaStats?.();
                } else {
                    aggiornaStats?.();
                }
                if (isAdminVisible()) window.renderAdminMateriali?.();
            }, { priority: hot ? 'high' : 'normal' });
        });

        onSnapshot(collection(db, "inventario"), (snapshot) => {
            inventarioDati = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const prio = (isSectionActive('inventario') || isAdminVisible()) ? 'high' : 'normal';
            scheduleUI(() => {
                if (isSectionActive('inventario')) {
                    window.renderInventario?.();
                    window.renderLogs?.();
                    window.popolaSelectOggetti?.();
                }
                if (isAdminVisible()) window.renderAdminTable?.();
            }, { priority: prio });
        });
    }, 80);

    // --- FASE 3: secondari ---
    setTimeout(() => {
        onSnapshot(collection(db, "dungeon"), (snapshot) => {
            dungeonDati = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            scheduleUI(() => {
                if (isSectionActive('dungeon')) window.renderDungeon?.();
                if (isAdminVisible()) window.renderAdminDungeon?.();
            });
        });

        onSnapshot(collection(db, "conquiste"), (snapshot) => {
            conquisteDati = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            scheduleUI(() => {
                if (isSectionActive('conquiste')) window.renderConquiste?.();
                if (isAdminVisible()) window.renderAdminConquiste?.();
            });
        });

        const applyLogsSnap = (snapshot) => {
            logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            // Ordina in client se manca timestamp su qualche doc
            logs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
            scheduleUI(() => {
                if (isSectionActive('inventario')) window.renderLogs?.();
                if (isAdminVisible()) window.renderAdminLogs?.();
            }, { priority: 'high' });
        };
        onSnapshot(
            query(collection(db, "logs"), orderBy("timestamp", "desc"), limit(80)),
            applyLogsSnap,
            (err) => {
                console.warn('[logs] orderBy fallito, fallback senza orderBy:', err?.code || err);
                onSnapshot(query(collection(db, "logs"), limit(80)), applyLogsSnap);
            }
        );

        const applySaldoLogsSnap = (snapshot) => {
            saldoLogs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            saldoLogs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
            scheduleUI(() => {
                if (isSectionActive('saldo')) window.renderSaldoLogs?.();
                if (isAdminVisible()) window.renderAdminSaldoLogs?.();
            }, { priority: 'high' });
        };
        onSnapshot(
            query(collection(db, "saldo_logs"), orderBy("timestamp", "desc"), limit(80)),
            applySaldoLogsSnap,
            (err) => {
                console.warn('[saldo_logs] orderBy fallito, fallback senza orderBy:', err?.code || err);
                onSnapshot(query(collection(db, "saldo_logs"), limit(80)), applySaldoLogsSnap);
            }
        );

        // Albero: solo dati in memoria finché non apri la tab
        onSnapshot(collection(db, "albero_genealogico"), (snapshot) => {
            alberoNodi = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            window._alberoDirty = true;
            if (isSectionActive('albero')) {
                scheduleUI(() => window.renderAlbero?.({ preservePan: true }));
            }
            if (isAdminVisible()) {
                scheduleUI(() => {
                    window.renderAdminAlbero?.();
                    window.popolaSelectParentAlbero?.();
                });
            }
        });
    }, 200);

    // --- FASE 4: immagini inventario (base64 = le più pesanti) ---
    setTimeout(() => {
        onSnapshot(collection(db, "item_images"), (snapshot) => {
            itemImagesLib = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            // Non renderizzare la griglia finché non sei in gestione inventario
            scheduleUI(() => {
                if (isAdminVisible() && document.getElementById('admin-view-inventario')?.style.display !== 'none') {
                    window.renderItemImagesLibrary?.();
                }
                window.renderItemImageSelects?.();
            }, 50);
        });
    }, 400);
}



// --- LIBRERIA IMMAGINI (compressione + ottimizzazione) ---
const MAX_ITEM_IMAGE_BYTES = 400 * 1024;
const ITEM_IMAGE_MAX_SIDE = 256;
const ITEM_IMAGE_JPEG_QUALITY = 0.72;
const ITEM_IMAGE_SKIP_IF_UNDER = 45 * 1024;

function compressImageSource(source, maxSide, quality) {
    maxSide = maxSide || ITEM_IMAGE_MAX_SIDE;
    quality = quality == null ? ITEM_IMAGE_JPEG_QUALITY : quality;
    return new Promise(function (resolve, reject) {
        const img = new Image();
        let objectUrl = null;
        img.onload = function () {
            try {
                if (objectUrl) URL.revokeObjectURL(objectUrl);
                const w = img.naturalWidth || img.width;
                const h = img.naturalHeight || img.height;
                if (!w || !h) { reject(new Error('Dimensioni immagine non valide')); return; }
                let scale = 1;
                if (w > maxSide || h > maxSide) scale = maxSide / Math.max(w, h);
                const nw = Math.max(1, Math.round(w * scale));
                const nh = Math.max(1, Math.round(h * scale));
                const canvas = document.createElement('canvas');
                canvas.width = nw; canvas.height = nh;
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#121212';
                ctx.fillRect(0, 0, nw, nh);
                ctx.drawImage(img, 0, 0, nw, nh);
                const dataUrl = canvas.toDataURL('image/jpeg', quality);
                const b64 = dataUrl.indexOf(',') >= 0 ? dataUrl.split(',')[1] : dataUrl;
                const sizeApprox = Math.round((b64.length * 3) / 4);
                resolve({ dataUrl, sizeApprox, width: nw, height: nh });
            } catch (e) {
                if (objectUrl) URL.revokeObjectURL(objectUrl);
                reject(e);
            }
        };
        img.onerror = function () {
            if (objectUrl) URL.revokeObjectURL(objectUrl);
            reject(new Error('Impossibile caricare immagine'));
        };
        if (typeof source === 'string') img.src = source;
        else if (source && (source instanceof Blob || source instanceof File)) {
            objectUrl = URL.createObjectURL(source);
            img.src = objectUrl;
        } else reject(new Error('Sorgente immagine non supportata'));
    });
}

function estimateDataUrlBytes(dataUrl) {
    if (!dataUrl || typeof dataUrl !== 'string') return 0;
    const b64 = dataUrl.indexOf(',') >= 0 ? dataUrl.split(',')[1] : dataUrl;
    return Math.round((b64.length * 3) / 4);
}

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
        const name = (img.fileName || 'file.jpg').replace(/</g, '&lt;');
        const bytes = img.size || estimateDataUrlBytes(img.dataUrl);
        const kb = bytes ? Math.round(bytes / 1024) + ' KB' : '';
        return `<div style="position:relative; background:rgba(0,0,0,0.5); border:1px solid #333; border-radius:4px; overflow:hidden; text-align:center;">
            <div style="height:72px; display:flex; align-items:center; justify-content:center; padding:6px;">
                <img src="${img.dataUrl || ''}" alt="" loading="lazy" decoding="async" style="max-height:100%; max-width:100%; object-fit:contain;">
            </div>
            <div style="padding:6px; border-top:1px solid #333; font-size:0.6rem; color:var(--gold-accent); word-break:break-all;">${name}</div>
            ${kb ? `<div style="font-size:0.55rem; color:#888; padding:0 6px 4px;">${kb}</div>` : ''}
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
        vampireToast('Immagine rimossa dalla libreria.', 'success');
    } catch (err) {
        vampireToast('Errore: ' + (err.message || err), 'error');
    }
};

window.uploadItemImagesFromInput = async function() {
    try {
        if (!currentUser || !currentUser.isAdmin) {
            return vampireToast('Solo il gestore può caricare immagini.', 'error');
        }
        const fileInput = document.getElementById('item-image-file');
        const files = fileInput?.files ? Array.from(fileInput.files) : [];
        if (!files.length) return vampireToast('Seleziona uno o più file immagine (PNG/JPG).', 'error');

        const btn = document.getElementById('item-image-upload-btn');
        const statusEl = document.getElementById('item-image-status');
        const prevHtml = btn ? btn.innerHTML : '';
        if (btn) { btn.disabled = true; btn.textContent = 'Comprimo...'; }
        if (statusEl) { statusEl.style.display = 'block'; statusEl.textContent = 'Compressione e caricamento...'; }

        let ok = 0, skip = 0, fail = 0;
        const existing = new Set(itemImagesLib.map(i => (i.fileName || '').toLowerCase()));

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            if (btn) btn.textContent = `${i + 1}/${files.length}`;
            if (statusEl) statusEl.textContent = `Comprimo ${i + 1}/${files.length}: ${file.name}`;

            const isImg = (file.type && file.type.startsWith('image/')) || /\.(png|jpe?g|webp|gif)$/i.test(file.name);
            if (!isImg) { skip++; continue; }
            if (file.size > 8 * 1024 * 1024) {
                vampireToast(`"${file.name}" troppo grande (max 8 MB).`, 'error');
                skip++; continue;
            }
            const baseName = file.name.replace(/\.(png|jpe?g|webp|gif)$/i, '').replace(/[^\w.\-()+ ]+/g, '_') + '.jpg';
            if (existing.has(baseName.toLowerCase()) || existing.has(file.name.toLowerCase())) {
                vampireToast(`"${baseName}" già in libreria, saltato.`, 'info');
                skip++; continue;
            }
            try {
                let compressed = await compressImageSource(file, ITEM_IMAGE_MAX_SIDE, ITEM_IMAGE_JPEG_QUALITY);
                if (compressed.sizeApprox > MAX_ITEM_IMAGE_BYTES) {
                    compressed = await compressImageSource(file, 192, 0.55);
                }
                if (compressed.sizeApprox > MAX_ITEM_IMAGE_BYTES) {
                    vampireToast(`"${file.name}" ancora troppo grande dopo compressione.`, 'error');
                    skip++; continue;
                }
                await addDoc(collection(db, 'item_images'), {
                    fileName: baseName,
                    dataUrl: compressed.dataUrl,
                    size: compressed.sizeApprox,
                    width: compressed.width,
                    height: compressed.height,
                    optimized: true,
                    createdAt: Date.now()
                });
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
        if (btn) { btn.disabled = false; btn.innerHTML = prevHtml || 'Carica e comprimi'; }
        if (statusEl) {
            statusEl.textContent = ok > 0
                ? `Completato: ${ok} caricate (comresse)${skip ? ', ' + skip + ' saltate' : ''}.`
                : 'Nessuna immagine nuova caricata.';
        }
        if (ok > 0) vampireToast(`Caricate ${ok} immagini ottimizzate${skip ? ' (' + skip + ' saltate)' : ''}.`, 'success');
        else if (skip && !fail) vampireToast('Nessuna nuova immagine (già presenti o non valide).', 'info');
        else if (fail) vampireToast('Caricamento fallito. Vedi console (F12).', 'error');
    } catch (err) {
        console.error(err);
        vampireToast('Errore upload: ' + (err.message || err), 'error');
        const btn = document.getElementById('item-image-upload-btn');
        if (btn) { btn.disabled = false; btn.textContent = 'Carica e comprimi'; }
    }
};

/** Comprime immagini già in libreria e aggiorna inventario collegato */
window.optimizeExistingItemImages = async function() {
    const statusEl = document.getElementById('item-image-status');
    const btn = document.getElementById('item-image-optimize-btn');
    try {
        if (statusEl) { statusEl.style.display = 'block'; statusEl.textContent = 'Preparazione ottimizzazione...'; }
        vampireToast('Avvio ottimizzazione immagini...', 'info');

        if (!currentUser || !currentUser.isAdmin) {
            vampireToast('Solo il gestore può ottimizzare le immagini.', 'error');
            if (statusEl) statusEl.textContent = 'Errore: non sei gestore.';
            return;
        }
        if (!auth.currentUser) {
            vampireToast('Sessione gestore non attiva. Rieffettua il login gestore.', 'error');
            if (statusEl) statusEl.textContent = 'Errore: auth gestore assente.';
            return;
        }

        let list = [...itemImagesLib];
        if (!list.length) {
            if (statusEl) statusEl.textContent = 'Carico libreria da Firestore...';
            const snap = await getDocs(collection(db, 'item_images'));
            list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        }
        if (!list.length) {
            vampireToast('Nessuna immagine in libreria.', 'info');
            if (statusEl) statusEl.textContent = 'Libreria vuota.';
            return;
        }

        const conf = await Swal.fire({
            title: 'Ottimizza immagini?',
            text: `Comprimerò fino a ${list.length} immagini (max ${ITEM_IMAGE_MAX_SIDE}px JPEG) e aggiornerò l'inventario collegato.`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonColor: '#8b0000',
            background: '#111',
            color: '#fff'
        });
        if (!conf.isConfirmed) {
            if (statusEl) statusEl.textContent = 'Annullato.';
            return;
        }

        const prevHtml = btn ? btn.innerHTML : '';
        if (btn) { btn.disabled = true; btn.textContent = 'Ottimizzo...'; }

        let done = 0, skipped = 0, failed = 0, bytesSaved = 0;
        const mapOldToNew = {};
        let firstPermError = null;

        for (let i = 0; i < list.length; i++) {
            const rec = list[i];
            if (!rec || !rec.dataUrl) { skipped++; continue; }
            if (statusEl) statusEl.textContent = `Ottimizzo ${i + 1}/${list.length}: ${rec.fileName || rec.id}`;
            if (btn) btn.textContent = `${i + 1}/${list.length}`;

            const oldSize = rec.size || estimateDataUrlBytes(rec.dataUrl);
            if (rec.optimized && oldSize > 0 && oldSize < ITEM_IMAGE_SKIP_IF_UNDER) {
                skipped++; continue;
            }
            try {
                const out = await compressImageSource(rec.dataUrl, ITEM_IMAGE_MAX_SIDE, ITEM_IMAGE_JPEG_QUALITY);
                if (out.sizeApprox >= oldSize * 0.95 && oldSize < MAX_ITEM_IMAGE_BYTES) {
                    if (!rec.optimized) {
                        await setDoc(doc(db, 'item_images', rec.id), { optimized: true, size: oldSize }, { merge: true });
                    }
                    skipped++; continue;
                }
                const newFileName = (rec.fileName || 'img').replace(/\.(png|jpe?g|webp|gif)$/i, '') + '.jpg';
                await setDoc(doc(db, 'item_images', rec.id), {
                    fileName: newFileName,
                    dataUrl: out.dataUrl,
                    size: out.sizeApprox,
                    width: out.width,
                    height: out.height,
                    optimized: true,
                    optimizedAt: Date.now()
                }, { merge: true });
                mapOldToNew[rec.dataUrl] = out.dataUrl;
                mapOldToNew['fn:' + (rec.fileName || '').toLowerCase()] = out.dataUrl;
                mapOldToNew['fn:' + newFileName.toLowerCase()] = out.dataUrl;
                bytesSaved += Math.max(0, oldSize - out.sizeApprox);
                done++;
            } catch (err) {
                console.error('optimize image', rec.id, err);
                failed++;
                const em = String(err?.code || err?.message || err);
                if (!firstPermError && em.toLowerCase().includes('permission')) firstPermError = em;
            }
            await new Promise(r => setTimeout(r, 20));
        }

        // Aggiorna inventario (documenti con foto = dataUrl o imageFileName)
        let invUpdated = 0;
        try {
            const invSnap = await getDocs(collection(db, 'inventario'));
            for (const d of invSnap.docs) {
                const data = d.data() || {};
                let newUrl = null;
                if (data.foto && mapOldToNew[data.foto]) newUrl = mapOldToNew[data.foto];
                else if (data.imageFileName) {
                    const fn = String(data.imageFileName).toLowerCase();
                    if (mapOldToNew['fn:' + fn]) newUrl = mapOldToNew['fn:' + fn];
                    else {
                        const base = fn.replace(/\.(png|jpe?g|webp|gif)$/i, '');
                        if (mapOldToNew['fn:' + base + '.jpg']) newUrl = mapOldToNew['fn:' + base + '.jpg'];
                        if (mapOldToNew['fn:' + base + '.png']) newUrl = mapOldToNew['fn:' + base + '.png'];
                    }
                }
                if (newUrl) {
                    const patch = { foto: newUrl };
                    if (data.imageFileName) {
                        patch.imageFileName = String(data.imageFileName).replace(/\.(png|jpe?g|webp|gif)$/i, '') + '.jpg';
                    }
                    await updateDoc(doc(db, 'inventario', d.id), patch);
                    invUpdated++;
                }
            }
        } catch (errInv) {
            console.warn('update inventario after optimize', errInv);
        }

        if (btn) { btn.disabled = false; btn.innerHTML = prevHtml || 'Ottimizza immagini esistenti + aggiorna item'; }
        let summary = `Fatto: ${done} ottimizzate, ${skipped} già ok, ${failed} errori. Item aggiornati: ${invUpdated}. Risparmiati ~${Math.round(bytesSaved / 1024)} KB.`;
        if (firstPermError) summary += ' | PERMESSO NEGATO su item_images.';
        if (statusEl) statusEl.textContent = summary;
        if (firstPermError) vampireToast('Permesso negato su item_images. Login gestore obbligatorio.', 'error');
        else vampireToast(`Ottimizzazione: ${done} img · ~${Math.round(bytesSaved / 1024)} KB · ${invUpdated} item`, failed ? 'error' : 'success');
    } catch (err) {
        console.error(err);
        vampireToast('Errore: ' + (err.message || err), 'error');
        if (statusEl) statusEl.textContent = 'Errore: ' + (err.message || err);
        if (btn) { btn.disabled = false; btn.textContent = 'Ottimizza immagini esistenti + aggiorna item'; }
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
            vampireToast('Tipo materiale aggiornato.', 'success');
        } else {
            data.createdAt = Date.now();
            await addDoc(collection(db, 'tipi_materiale'), data);
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




// =========================================================
// --- GESTIONE LAVORI (tipi, sblocchi+ingredienti, multi-job) ---
// =========================================================

/** Buffer sblocchi in form admin: { livello, item, ingredienti, strumenti } */
let sblocchiTemp = [];
let sbloccoEditIdx = -1;

const escHtml = (str) => String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

window.popolaSelectTipiLavoro = function() {
    const sel = document.getElementById('adm-lavoro-tipo');
    if (sel) {
        const prev = sel.value;
        const sorted = [...tipiLavoro].sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'it'));
        sel.innerHTML = '<option value="">— Seleziona lavoro —</option>' +
            sorted.map(t => `<option value="${t.id}">${escHtml(t.nome || t.id)}</option>`).join('');
        if (prev && [...sel.options].some(o => o.value === prev)) sel.value = prev;
    }
    const filtro = document.getElementById('lavori-filtro-tipo');
    if (filtro) {
        const prev = filtro.value;
        const sorted = [...tipiLavoro].sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'it'));
        filtro.innerHTML = '<option value="">— Tutti i lavori —</option>' +
            sorted.map(t => `<option value="${t.id}">${escHtml(t.nome || t.id)}</option>`).join('');
        if (prev && [...filtro.options].some(o => o.value === prev)) filtro.value = prev;
    }
};

function syncSbloccoFormBtn() {
    const btn = document.getElementById('adm-sblocco-btn');
    if (!btn) return;
    if (sbloccoEditIdx >= 0) {
        btn.textContent = '💾 Aggiorna livello';
    } else {
        btn.textContent = '+ Aggiungi livello';
    }
}

function renderSblocchiTempLista() {
    const box = document.getElementById('adm-sblocchi-lista');
    if (!box) return;
    if (!sblocchiTemp.length) {
        box.innerHTML = '<p style="opacity:0.5;font-size:0.7rem;margin:0;padding:6px 0;">Nessuno sblocco. Aggiungi livelli dal form.</p>';
        return;
    }
    const sorted = [...sblocchiTemp].sort((a, b) => a.livello - b.livello);
    box.innerHTML = sorted.map((s) => {
        const realIdx = sblocchiTemp.indexOf(s);
        const editing = realIdx === sbloccoEditIdx;
        return `<div class="adm-sblocco-row${editing ? ' is-editing' : ''}">
            <div class="adm-sblocco-main">
                <span class="adm-sblocco-lv">Lv ${s.livello}</span>
                <span class="adm-sblocco-item">${escHtml(s.item) || '—'}</span>
                ${s.ingredienti ? `<span class="adm-sblocco-ing">🧪 ${escHtml(s.ingredienti)}</span>` : ''}
                ${s.strumenti ? `<span class="adm-sblocco-ing">🔧 ${escHtml(s.strumenti)}</span>` : ''}
            </div>
            <div class="adm-sblocco-actions">
                <button type="button" class="btn-delete" style="border-color:var(--gold-accent);color:var(--gold-accent);" onclick="window.caricaSbloccoTempPerEdit(${realIdx})">Modifica</button>
                <button type="button" class="btn-delete" onclick="window.rimuoviSbloccoTemp(${realIdx})">X</button>
            </div>
        </div>`;
    }).join('');
}

window.caricaSbloccoTempPerEdit = function(idx) {
    if (idx < 0 || idx >= sblocchiTemp.length) return;
    const s = sblocchiTemp[idx];
    sbloccoEditIdx = idx;
    const livEl = document.getElementById('adm-sblocco-livello');
    const itemEl = document.getElementById('adm-sblocco-item');
    const ingEl = document.getElementById('adm-sblocco-ingredienti');
    const strEl = document.getElementById('adm-sblocco-strumenti');
    if (livEl) livEl.value = String(s.livello ?? 1);
    if (itemEl) { itemEl.value = s.item || ''; itemEl.focus(); }
    if (ingEl) ingEl.value = s.ingredienti || '';
    if (strEl) strEl.value = s.strumenti || '';
    syncSbloccoFormBtn();
    renderSblocchiTempLista();
    vampireToast(`Modifica Lv ${s.livello}: aggiorna e conferma.`, 'info');
};

window.annullaEditSbloccoTemp = function() {
    sbloccoEditIdx = -1;
    const itemEl = document.getElementById('adm-sblocco-item');
    const ingEl = document.getElementById('adm-sblocco-ingredienti');
    const strEl = document.getElementById('adm-sblocco-strumenti');
    if (itemEl) itemEl.value = '';
    if (ingEl) ingEl.value = '';
    if (strEl) strEl.value = '';
    syncSbloccoFormBtn();
    renderSblocchiTempLista();
};

window.aggiungiSbloccoTemp = function() {
    const livEl = document.getElementById('adm-sblocco-livello');
    const itemEl = document.getElementById('adm-sblocco-item');
    const ingEl = document.getElementById('adm-sblocco-ingredienti');
    const strEl = document.getElementById('adm-sblocco-strumenti');
    const livello = parseInt(livEl?.value, 10);
    const item = (itemEl?.value || '').trim();
    const ingredienti = (ingEl?.value || '').trim();
    const strumenti = (strEl?.value || '').trim();
    if (!livello || livello < 1) return vampireToast('Livello non valido (min 1).', 'error');
    if (!item) return vampireToast('Inserisci cosa si sblocca.', 'error');

    const payload = { livello, item, ingredienti, strumenti };

    if (sbloccoEditIdx >= 0 && sbloccoEditIdx < sblocchiTemp.length) {
        // Aggiorna solo la riga in modifica (stesso o altro livello ok: più item per livello ammessi)
        sblocchiTemp[sbloccoEditIdx] = payload;
        vampireToast(`Voce aggiornata (Lv ${livello}).`, 'success');
        sbloccoEditIdx = -1;
    } else {
        // Sempre nuova voce: puoi avere più item allo stesso livello
        sblocchiTemp.push(payload);
        const nStesso = sblocchiTemp.filter(s => s.livello === livello).length;
        vampireToast(
            nStesso > 1
                ? `Aggiunto (Lv ${livello}, ${nStesso} item a questo livello).`
                : `Sblocco Lv ${livello} aggiunto.`,
            'success'
        );
    }
    if (itemEl) itemEl.value = '';
    if (ingEl) ingEl.value = '';
    if (strEl) strEl.value = '';
    // Resta sullo stesso livello per aggiungere un altro item facilmente
    if (livEl) livEl.value = String(livello);
    syncSbloccoFormBtn();
    renderSblocchiTempLista();
};

window.rimuoviSbloccoTemp = function(idx) {
    if (idx < 0 || idx >= sblocchiTemp.length) return;
    if (sbloccoEditIdx === idx) sbloccoEditIdx = -1;
    else if (sbloccoEditIdx > idx) sbloccoEditIdx -= 1;
    sblocchiTemp.splice(idx, 1);
    syncSbloccoFormBtn();
    renderSblocchiTempLista();
};

window.resetFormTipoLavoro = function() {
    const nome = document.getElementById('adm-tipo-lavoro-nome');
    const editId = document.getElementById('adm-tipo-lavoro-edit-id');
    if (nome) nome.value = '';
    if (editId) editId.value = '';
    sblocchiTemp = [];
    sbloccoEditIdx = -1;
    const livEl = document.getElementById('adm-sblocco-livello');
    const itemEl = document.getElementById('adm-sblocco-item');
    const ingEl = document.getElementById('adm-sblocco-ingredienti');
    const strEl = document.getElementById('adm-sblocco-strumenti');
    if (livEl) livEl.value = '1';
    if (itemEl) itemEl.value = '';
    if (ingEl) ingEl.value = '';
    if (strEl) strEl.value = '';
    syncSbloccoFormBtn();
    renderSblocchiTempLista();
};

window.salvaTipoLavoro = async function() {
    if (!currentUser || !currentUser.isAdmin) return vampireToast('Solo il gestore può modificare i lavori.', 'error');
    const nome = (document.getElementById('adm-tipo-lavoro-nome')?.value || '').trim();
    const editId = (document.getElementById('adm-tipo-lavoro-edit-id')?.value || '').trim();
    if (!nome) return vampireToast('Inserisci il nome del lavoro.', 'error');

    const data = {
        nome,
        sblocchi: [...sblocchiTemp]
            .map(s => ({
                livello: Number(s.livello) || 1,
                item: String(s.item || ''),
                ingredienti: String(s.ingredienti || ''),
                strumenti: String(s.strumenti || '')
            }))
            .sort((a, b) => a.livello - b.livello),
        updatedAt: Date.now()
    };

    try {
        if (editId) {
            await setDoc(doc(db, 'tipi_lavoro', editId), data, { merge: true });
            const daAggiornare = lavoriMembri.filter(m => m.lavoroId === editId);
            for (const m of daAggiornare) {
                if (m.lavoroNome !== nome) {
                    await updateDoc(doc(db, 'lavori_membri', m.id), { lavoroNome: nome });
                }
            }
            vampireToast('Tipo lavoro aggiornato.', 'success');
        } else {
            data.createdAt = Date.now();
            await addDoc(collection(db, 'tipi_lavoro'), data);
            vampireToast('Tipo lavoro creato.', 'success');
        }
        window.resetFormTipoLavoro();
        // onSnapshot aggiorna, ma forziamo subito UI
        setTimeout(() => {
            if (typeof window.renderAdminTipiLavoro === 'function') window.renderAdminTipiLavoro();
            if (typeof window.popolaSelectTipiLavoro === 'function') window.popolaSelectTipiLavoro();
        }, 150);
    } catch (err) {
        console.error(err);
        vampireToast('Errore: ' + (err.message || err), 'error');
    }
};

window.caricaTipoLavoroPerEdit = function(id) {
    const t = tipiLavoro.find(x => x.id === id);
    if (!t) return;
    document.getElementById('adm-tipo-lavoro-edit-id').value = t.id;
    document.getElementById('adm-tipo-lavoro-nome').value = t.nome || '';
    sblocchiTemp = Array.isArray(t.sblocchi)
        ? t.sblocchi.map(s => ({
            livello: Number(s.livello) || 1,
            item: String(s.item || ''),
            ingredienti: String(s.ingredienti || ''),
            strumenti: String(s.strumenti || '')
        }))
        : [];
    sbloccoEditIdx = -1;
    syncSbloccoFormBtn();
    renderSblocchiTempLista();
    document.getElementById('adm-tipo-lavoro-nome')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    vampireToast('Tipo caricato. Modifica livelli e premi Salva Tipo.', 'info');
};

window.eliminaTipoLavoro = async function(id) {
    const res = await Swal.fire({
        title: 'Eliminare questo tipo di lavoro?',
        text: 'Le assegnazioni ai membri restano ma il tipo sparisce dalla lista.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#8b0000',
        background: '#111',
        color: '#fff'
    });
    if (!res.isConfirmed) return;
    try {
        await deleteDoc(doc(db, 'tipi_lavoro', id));
        vampireToast('Tipo lavoro eliminato.', 'success');
        const editId = document.getElementById('adm-tipo-lavoro-edit-id');
        if (editId && editId.value === id) window.resetFormTipoLavoro();
    } catch (err) {
        vampireToast('Errore: ' + (err.message || err), 'error');
    }
};


/** Ricarica forzata da Firestore (utile se il gestore non vede i dati) */
window.ricaricaLavoriFromDb = async function() {
    try {
        const [snapTipi, snapMembri] = await Promise.all([
            getDocs(collection(db, 'tipi_lavoro')),
            getDocs(collection(db, 'lavori_membri'))
        ]);
        tipiLavoro = snapTipi.docs.map(d => ({ id: d.id, ...d.data() }));
        lavoriMembri = snapMembri.docs.map(d => ({ id: d.id, ...d.data() }));
        console.log('[lavori] ricarica forzata', tipiLavoro.length, lavoriMembri.length);
        if (typeof window.popolaSelectTipiLavoro === 'function') window.popolaSelectTipiLavoro();
        if (typeof window.renderAdminTipiLavoro === 'function') window.renderAdminTipiLavoro();
        if (typeof window.renderAdminLavoriMembri === 'function') window.renderAdminLavoriMembri();
        if (typeof window.renderSezioneLavori === 'function') window.renderSezioneLavori();
        return { tipi: tipiLavoro.length, membri: lavoriMembri.length };
    } catch (err) {
        console.error('[lavori] ricarica', err);
        vampireToast('Errore ricarica lavori: ' + (err.code || err.message || err), 'error');
        throw err;
    }
};

window.renderAdminTipiLavoro = function() {
    const tbody = document.getElementById('admin-tipi-lavoro-body');
    if (!tbody) return;
    const search = (document.getElementById('search-admin-tipi-lavoro')?.value || '').toLowerCase().trim();
    let sorted = [...tipiLavoro].sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'it'));
    if (search) {
        sorted = sorted.filter(t => {
            if ((t.nome || '').toLowerCase().includes(search)) return true;
            const sbl = Array.isArray(t.sblocchi) ? t.sblocchi : [];
            return sbl.some(s =>
                (s.item || '').toLowerCase().includes(search) ||
                (s.ingredienti || '').toLowerCase().includes(search) ||
                (s.strumenti || '').toLowerCase().includes(search) ||
                String(s.livello || '').includes(search)
            );
        });
    }
    tbody.innerHTML = sorted.map(t => {
        const sbl = Array.isArray(t.sblocchi) ? [...t.sblocchi].sort((a, b) => a.livello - b.livello) : [];
        const sblHtml = sbl.length
            ? sbl.map(s => {
                const extra = [];
                if (s.ingredienti) extra.push('🧪 ' + escHtml(s.ingredienti));
                if (s.strumenti) extra.push('🔧 ' + escHtml(s.strumenti));
                const extraHtml = extra.length ? ` <span style="opacity:0.65;font-size:0.6rem;">(${extra.join(' · ')})</span>` : '';
                return `<span style="display:inline-block;margin:2px 4px 2px 0;padding:2px 7px;background:rgba(197,160,89,0.1);border:1px solid rgba(197,160,89,0.25);border-radius:4px;font-size:0.62rem;"><b>Lv${s.livello}</b> ${escHtml(s.item) || '—'}${extraHtml}</span>`;
            }).join('')
            : '<span style="opacity:0.4;">Nessuno</span>';
        return `<tr>
            <td><strong>${escHtml(t.nome) || '—'}</strong></td>
            <td style="text-align:left;">${sblHtml}</td>
            <td>
                <button class="btn-delete" style="border-color:var(--gold-accent);color:var(--gold-accent);margin-right:4px;" onclick="window.caricaTipoLavoroPerEdit('${t.id}')">Modifica</button>
                <button class="btn-delete" onclick="window.eliminaTipoLavoro('${t.id}')">Elimina</button>
            </td>
        </tr>`;
    }).join('') || '<tr><td colspan="3" style="opacity:0.5;text-align:center;">Nessun tipo di lavoro trovato.</td></tr>';
};

// --- Assegnazioni membri (multi-job) ---

window.salvaLavoroMembro = async function() {
    if (!currentUser || !currentUser.isAdmin) return vampireToast('Solo il gestore può assegnare lavori.', 'error');
    const vamp = (document.getElementById('adm-lavoro-vamp')?.value || '').trim();
    const lavoroId = (document.getElementById('adm-lavoro-tipo')?.value || '').trim();
    const livello = parseInt(document.getElementById('adm-lavoro-livello')?.value, 10);
    const editId = (document.getElementById('adm-lavoro-edit-id')?.value || '').trim();

    if (!vamp) return vampireToast('Seleziona un vampiro.', 'error');
    if (!lavoroId) return vampireToast('Seleziona un lavoro.', 'error');
    if (!livello || livello < 1) return vampireToast('Livello non valido (min 1).', 'error');

    const tipo = tipiLavoro.find(t => t.id === lavoroId);
    if (!tipo) return vampireToast('Tipo lavoro non trovato.', 'error');

    const data = {
        vampiro: vamp,
        lavoroId,
        lavoroNome: tipo.nome || '',
        livello,
        updatedAt: Date.now()
    };

    try {
        if (editId) {
            await setDoc(doc(db, 'lavori_membri', editId), data, { merge: true });
            vampireToast('Assegnazione aggiornata.', 'success');
        } else {
            const sameJob = lavoriMembri.find(m =>
                (m.vampiro || '').toLowerCase() === vamp.toLowerCase() && m.lavoroId === lavoroId
            );
            if (sameJob) {
                await setDoc(doc(db, 'lavori_membri', sameJob.id), data, { merge: true });
                vampireToast('Livello del lavoro aggiornato.', 'success');
            } else {
                data.createdAt = Date.now();
                await addDoc(collection(db, 'lavori_membri'), data);
                vampireToast('Lavoro assegnato.', 'success');
            }
        }
        document.getElementById('adm-lavoro-edit-id').value = '';
        document.getElementById('adm-lavoro-tipo').value = '';
        document.getElementById('adm-lavoro-livello').value = '1';
        setTimeout(() => {
            if (typeof window.renderAdminLavoriMembri === 'function') window.renderAdminLavoriMembri();
            if (typeof window.renderSezioneLavori === 'function') window.renderSezioneLavori();
        }, 150);
    } catch (err) {
        console.error(err);
        vampireToast('Errore salvataggio lavoro: ' + (err.code || err.message || err), 'error');
    }
};

window.caricaLavoroMembroPerEdit = function(id) {
    const m = lavoriMembri.find(x => x.id === id);
    if (!m) return;
    document.getElementById('adm-lavoro-edit-id').value = m.id;
    document.getElementById('adm-lavoro-vamp').value = m.vampiro || '';
    window.popolaSelectTipiLavoro();
    document.getElementById('adm-lavoro-tipo').value = m.lavoroId || '';
    document.getElementById('adm-lavoro-livello').value = m.livello ?? 1;
    vampireToast('Dati caricati. Modifica e premi Salva.', 'info');
};

window.eliminaLavoroMembro = async function(id) {
    const res = await Swal.fire({
        title: 'Rimuovere questo lavoro dal membro?',
        text: 'Gli altri lavori del membro restano.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#8b0000',
        background: '#111',
        color: '#fff'
    });
    if (!res.isConfirmed) return;
    try {
        await deleteDoc(doc(db, 'lavori_membri', id));
        vampireToast('Assegnazione rimossa.', 'success');
    } catch (err) {
        vampireToast('Errore: ' + (err.message || err), 'error');
    }
};

window.cambiaLivelloLavoro = async function(id, delta) {
    if (!currentUser || !currentUser.isAdmin) return;
    const m = lavoriMembri.find(x => x.id === id);
    if (!m) return;
    const nuovo = Math.max(1, (Number(m.livello) || 1) + delta);
    if (nuovo === m.livello) return;
    try {
        await updateDoc(doc(db, 'lavori_membri', id), { livello: nuovo, updatedAt: Date.now() });
        vampireToast(`${m.vampiro} · ${m.lavoroNome}: livello ${nuovo}`, 'success');
    } catch (err) {
        vampireToast('Errore: ' + (err.message || err), 'error');
    }
};

window.renderAdminLavoriMembri = function() {
    const tbody = document.getElementById('admin-lavori-membri-body');
    if (!tbody) return;
    const search = (document.getElementById('search-admin-lavori')?.value || '').toLowerCase().trim();
    let list = [...lavoriMembri];
    if (search) {
        list = list.filter(m =>
            (m.vampiro || '').toLowerCase().includes(search) ||
            (m.lavoroNome || '').toLowerCase().includes(search)
        );
    }
    list.sort((a, b) => {
        const n = (a.vampiro || '').localeCompare(b.vampiro || '', 'it');
        if (n !== 0) return n;
        return (a.lavoroNome || '').localeCompare(b.lavoroNome || '', 'it');
    });
    tbody.innerHTML = list.map(m => `
        <tr>
            <td><strong>${escHtml(m.vampiro) || '—'}</strong></td>
            <td style="color:var(--gold-accent)">${escHtml(m.lavoroNome) || '—'}</td>
            <td style="font-size:1rem; font-weight:700;">${m.livello ?? 1}</td>
            <td style="white-space:nowrap;">
                <button class="btn-delete" style="border-color:var(--success-green);color:var(--success-green);margin-right:3px;" onclick="window.cambiaLivelloLavoro('${m.id}', 1)">▲ +</button>
                <button class="btn-delete" style="border-color:var(--gold-dim);color:var(--gold-dim);margin-right:3px;" onclick="window.cambiaLivelloLavoro('${m.id}', -1)">▼ −</button>
                <button class="btn-delete" style="border-color:var(--gold-accent);color:var(--gold-accent);margin-right:3px;" onclick="window.caricaLavoroMembroPerEdit('${m.id}')">Modifica</button>
                <button class="btn-delete" onclick="window.eliminaLavoroMembro('${m.id}')">Elimina</button>
            </td>
        </tr>
    `).join('') || '<tr><td colspan="4" style="opacity:0.5;text-align:center;">Nessuna assegnazione.</td></tr>';
};

function getSblocchiPerLivello(lavoroId, livello) {
    const tipo = tipiLavoro.find(t => t.id === lavoroId);
    if (!tipo || !Array.isArray(tipo.sblocchi)) return [];
    const liv = Number(livello) || 0;
    return [...tipo.sblocchi]
        .filter(s => Number(s.livello) <= liv)
        .sort((a, b) => a.livello - b.livello);
}

function getTuttiSblocchi(lavoroId) {
    const tipo = tipiLavoro.find(t => t.id === lavoroId);
    if (!tipo || !Array.isArray(tipo.sblocchi)) return [];
    return [...tipo.sblocchi].sort((a, b) => a.livello - b.livello);
}

/** Popup con box oro separati + ingredienti */
window.mostraSblocchiLavoro = function(membroId) {
    const m = lavoriMembri.find(x => x.id === membroId);
    if (!m) return vampireToast('Assegnazione non trovata.', 'error');
    const sblocchi = getSblocchiPerLivello(m.lavoroId, m.livello);
    const tipo = tipiLavoro.find(t => t.id === m.lavoroId);

    let cards;
    if (!sblocchi.length) {
        cards = '<div class="sbx"><div class="sbx-value" style="opacity:0.6;">Nessuno sblocco fino a questo livello.</div></div>';
    } else {
        cards = sblocchi.map(s => {
            const item = escHtml(s.item) || '—';
            const ing = s.ingredienti
                ? escHtml(s.ingredienti)
                : '<span style="opacity:0.5;font-style:italic;">Non indicato</span>';
            const str = s.strumenti
                ? escHtml(s.strumenti)
                : '<span style="opacity:0.5;font-style:italic;">Non indicato</span>';
            return (
                '<div class="sbx">' +
                  '<div class="sbx-label">Livello ' + (Number(s.livello) || 1) + '</div>' +
                  '<div class="sbx-value">' + item + '</div>' +
                  '<div class="sbx-sep"></div>' +
                  '<div class="sbx-label">Ingredienti / cosa serve</div>' +
                  '<div class="sbx-value sbx-ing">' + ing + '</div>' +
                  '<div class="sbx-sep"></div>' +
                  '<div class="sbx-label">Strumenti necessari</div>' +
                  '<div class="sbx-value sbx-ing">' + str + '</div>' +
                '</div>'
            );
        }).join('');
    }

    Swal.fire({
        title: escHtml(m.vampiro || 'Membro'),
        html:
            '<div class="sbx-head"><strong>' + escHtml(m.lavoroNome || tipo?.nome || '—') +
            '</strong> · Lv ' + (m.livello ?? 1) + '</div>' +
            '<div class="sbx-list">' + cards + '</div>',
        background: '#0e0e0e',
        color: '#e0e0e0',
        width: 300,
        confirmButtonColor: '#8b0000',
        confirmButtonText: 'Chiudi',
        customClass: { popup: 'swal-sblocchi-popup' }
    });
};

window.renderSezioneLavori = function() {
    window.popolaSelectTipiLavoro();

    const listaBox = document.getElementById('lavori-membri-lista');
    const mieiBox = document.getElementById('lavori-miei-box');
    const catalogo = document.getElementById('lavori-catalogo');
    if (!catalogo) return;

    const nomeUser = currentUser && !currentUser.isAdmin ? currentUser.nome : null;
    const search = (document.getElementById('search-lavori-membri')?.value || '').toLowerCase().trim();

    // --- Lista membri con lavori ---
    if (listaBox) {
        const byVamp = {};
        lavoriMembri.forEach(m => {
            const key = m.vampiro || '—';
            if (!byVamp[key]) byVamp[key] = [];
            byVamp[key].push(m);
        });
        let nomi = Object.keys(byVamp).sort((a, b) => a.localeCompare(b, 'it'));
        if (search) {
            nomi = nomi.filter(n => {
                if (n.toLowerCase().includes(search)) return true;
                return byVamp[n].some(j => (j.lavoroNome || '').toLowerCase().includes(search));
            });
        }
        if (!nomi.length) {
            listaBox.innerHTML = '<p class="lavori-empty">Nessun lavoro assegnato ai membri.</p>';
        } else {
            listaBox.innerHTML = nomi.map(nome => {
                const jobs = byVamp[nome].sort((a, b) => (a.lavoroNome || '').localeCompare(b.lavoroNome || '', 'it'));
                const isMe = nomeUser && nome.toLowerCase() === nomeUser.toLowerCase();
                const chips = jobs.map(m => `
                    <button type="button" class="lavoro-chip" title="Vedi sblocchi fino al tuo livello"
                        onclick="window.mostraSblocchiLavoro('${m.id}')">
                        <span class="lavoro-chip-name">${escHtml(m.lavoroNome) || '—'}</span>
                        <span class="lavoro-chip-lv">Lv ${m.livello ?? 1}</span>
                    </button>
                `).join('');
                return `
                    <div class="lavori-membro-row${isMe ? ' is-me' : ''}">
                        <div class="lavori-membro-nome">${escHtml(nome)}${isMe ? ' <span class="lavori-tu">tu</span>' : ''}</div>
                        <div class="lavori-membro-chips">${chips}</div>
                    </div>`;
            }).join('');
        }
    }

    // --- I miei lavori (se loggato come membro) ---
    const miei = nomeUser
        ? lavoriMembri.filter(m => (m.vampiro || '').toLowerCase() === nomeUser.toLowerCase())
        : [];
    if (mieiBox) {
        if (!nomeUser) {
            mieiBox.innerHTML = '';
        } else if (!miei.length) {
            mieiBox.innerHTML = '<p class="lavori-empty">Non hai ancora un lavoro assegnato.</p>';
        } else {
            mieiBox.innerHTML = '<div class="lavori-miei-grid">' + miei.map(m => `
                <div class="lavori-mio-card" onclick="window.focusLavoroCatalogo('${m.lavoroId}')">
                    <div class="lavori-mio-nome">${escHtml(m.lavoroNome) || '—'}</div>
                    <div class="lavori-mio-lv">Livello ${m.livello ?? 1}</div>
                </div>
            `).join('') + '</div>';
        }
    }

    // --- Catalogo: solo badge livelli cliccabili ---
    const filtroId = document.getElementById('lavori-filtro-tipo')?.value || '';
    let tipi = [...tipiLavoro].sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'it'));
    if (filtroId) tipi = tipi.filter(t => t.id === filtroId);

    if (!tipi.length) {
        catalogo.innerHTML = '<p class="lavori-empty">Nessun lavoro configurato dal gestore.</p>';
        return;
    }

    const mieiIds = new Set(miei.map(m => m.lavoroId));
    const mioLivelloByJob = {};
    miei.forEach(m => { mioLivelloByJob[m.lavoroId] = Number(m.livello) || 1; });

    catalogo.innerHTML = tipi.map(t => {
        const isMine = mieiIds.has(t.id);
        const myLv = mioLivelloByJob[t.id] || 0;
        const sbl = getTuttiSblocchi(t.id);
        // Un pulsante per livello (anche se ci sono più item)
        const byLv = {};
        sbl.forEach(s => {
            const lv = Number(s.livello) || 1;
            if (!byLv[lv]) byLv[lv] = 0;
            byLv[lv]++;
        });
        const livelliUnici = Object.keys(byLv).map(Number).sort((a, b) => a - b);
        const levelsHtml = livelliUnici.length
            ? livelliUnici.map(lv => {
                const unlocked = isMine && lv <= myLv;
                const count = byLv[lv];
                return `
                    <button type="button"
                        class="lavoro-lv-btn${unlocked ? ' is-unlocked' : ''}"
                        onclick="window.mostraDettaglioLivello('${t.id}', ${lv})"
                        title="${count} item a questo livello">
                        Lv ${lv}${count > 1 ? ` <span class="lv-count">×${count}</span>` : ''}
                        ${unlocked ? '<span class="dot-ok"></span>' : ''}
                    </button>`;
            }).join('')
            : '<span class="lavori-empty" style="padding:0;">Nessun livello</span>';

        return `
            <div class="lavoro-tipo-card${isMine ? ' is-mine' : ''}" id="lavoro-card-${t.id}">
                <div class="lavoro-tipo-title">
                    <h3>${escHtml(t.nome) || '—'}</h3>
                    ${isMine ? `<span class="lavoro-tipo-mine-tag">Tuo · Lv ${myLv}</span>` : ''}
                </div>
                <p class="lavoro-hint">Clicca un livello per vedere oggetto, ingredienti e strumenti</p>
                <div class="lavoro-lv-row">${levelsHtml}</div>
            </div>`;
    }).join('');
};

/** Dettaglio singolo livello: oggetto + ingredienti in box oro */
window.mostraDettaglioLivello = function(lavoroId, livello) {
    const tipo = tipiLavoro.find(t => t.id === lavoroId);
    if (!tipo) return vampireToast('Lavoro non trovato.', 'error');
    const items = (Array.isArray(tipo.sblocchi) ? tipo.sblocchi : [])
        .filter(x => Number(x.livello) === Number(livello))
        .sort((a, b) => String(a.item || '').localeCompare(String(b.item || ''), 'it'));
    if (!items.length) return vampireToast('Nessuno sblocco a questo livello.', 'error');

    const nomeUser = currentUser && !currentUser.isAdmin ? currentUser.nome : null;
    let mioLv = 0;
    if (nomeUser) {
        const mine = lavoriMembri.find(m =>
            (m.vampiro || '').toLowerCase() === nomeUser.toLowerCase() && m.lavoroId === lavoroId
        );
        if (mine) mioLv = Number(mine.livello) || 0;
    }
    const unlocked = mioLv > 0 && Number(livello) <= mioLv;

    const cards = items.map(s => {
        const item = escHtml(s.item) || '—';
        const ing = s.ingredienti
            ? escHtml(s.ingredienti)
            : '<span style="opacity:0.5;font-style:italic;">Non indicato</span>';
        const str = s.strumenti
            ? escHtml(s.strumenti)
            : '<span style="opacity:0.5;font-style:italic;">Non indicato</span>';
        return (
            '<div class="sbx">' +
              '<div class="sbx-label">Cosa ottiene</div>' +
              '<div class="sbx-value">' + item + '</div>' +
              '<div class="sbx-sep"></div>' +
              '<div class="sbx-label">Ingredienti / cosa serve</div>' +
              '<div class="sbx-value sbx-ing">' + ing + '</div>' +
              '<div class="sbx-sep"></div>' +
              '<div class="sbx-label">Strumenti necessari</div>' +
              '<div class="sbx-value sbx-ing">' + str + '</div>' +
            '</div>'
        );
    }).join('');

    Swal.fire({
        title: escHtml(tipo.nome || 'Lavoro'),
        html:
            '<div class="sbx-head">Livello ' + (Number(livello) || 1) +
            ' · ' + items.length + ' item' +
            (unlocked ? ' · <span style="color:#2ecc71">Sbloccato</span>' : '') +
            '</div>' +
            '<div class="sbx-list">' + cards + '</div>',
        background: '#0e0e0e',
        color: '#e0e0e0',
        width: 300,
        confirmButtonColor: '#8b0000',
        confirmButtonText: 'Chiudi',
        customClass: { popup: 'swal-sblocchi-popup' }
    });
};

window.focusLavoroCatalogo = function(lavoroId) {
    const filtro = document.getElementById('lavori-filtro-tipo');
    if (filtro) filtro.value = lavoroId || '';
    window.renderSezioneLavori();
    setTimeout(() => {
        document.getElementById('lavoro-card-' + lavoroId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
};


// Listener refresh: anche sezione lavori
// (già in onSnapshot tipi_lavoro / lavori_membri — aggiungiamo renderSezioneLavori)

if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        try { renderSblocchiTempLista(); } catch (e) {}
    });
}


// --- PROTEZIONE INTERFACCIA ---
document.addEventListener('contextmenu', event => event.preventDefault());

document.onkeydown = function(e) {
    if (e.keyCode == 123) return false; 
    if (e.ctrlKey && e.shiftKey && e.keyCode == 'I'.charCodeAt(0)) return false; 
    if (e.ctrlKey && e.shiftKey && e.keyCode == 'C'.charCodeAt(0)) return false; 
    if (e.ctrlKey && e.shiftKey && e.keyCode == 'J'.charCodeAt(0)) return false; 
    if (e.ctrlKey && e.keyCode == 'U'.charCodeAt(0)) return false; 
};

setInterval(function() {
    debugger;
}, 100);
// --- ALBERO GENEALOGICO ---
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

    // Multi-select fratelli
    const fratSel = document.getElementById('adm-albero-fratelli');
    if (fratSel) {
        const prevMulti = [...fratSel.selectedOptions].map(o => o.value);
        fratSel.innerHTML = optionsHtml;
        prevMulti.forEach(v => {
            const opt = [...fratSel.options].find(o => o.value === v);
            if (opt) opt.selected = true;
        });
        // Applica filtro ricerca se presente
        if (typeof window.filtraSelectFratelliAlbero === 'function') {
            window.filtraSelectFratelliAlbero();
        }
    }
};

/** Filtra le opzioni del multi-select Fratelli in base al testo di ricerca */
window.filtraSelectFratelliAlbero = () => {
    const searchEl = document.getElementById('adm-albero-fratelli-search');
    const fratSel = document.getElementById('adm-albero-fratelli');
    if (!fratSel) return;
    const q = (searchEl?.value || '').trim().toLowerCase();
    [...fratSel.options].forEach(opt => {
        if (!q) {
            opt.hidden = false;
            opt.style.display = '';
            return;
        }
        const hay = (opt.getAttribute('data-search') || opt.textContent || '').toLowerCase();
        const match = hay.includes(q);
        opt.hidden = !match;
        opt.style.display = match ? '' : 'none';
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
    const searchFrat = document.getElementById('adm-albero-fratelli-search');
    if (searchFrat) searchFrat.value = '';
    const fileEl = document.getElementById('adm-albero-foto-file');
    if (fileEl) fileEl.value = '';
    window.popolaSelectParentAlbero();
};

window.salvaNodoAlbero = async () => {
    if (!currentUser || !currentUser.isAdmin) return vampireToast('Solo il gestore può modificare l\'albero.', 'error');
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

    // Etichetta automatica se manca: radice → Originario, con genitore → Figlio
    let relazioneFinal = relazione;
    if (!relazioneFinal) {
        relazioneFinal = parentId ? 'Figlio' : 'Originario';
    }

    // Avviso utile: altri figli dello stesso genitore = fratelli
    if (parentId) {
        const fratelli = alberoNodi.filter(n => n.parentId === parentId && n.id !== editId);
        if (fratelli.length) {
            const nomi = fratelli.map(f => alberoNomeCompleto(f)).join(', ');
            // solo info, non blocca
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

        // Se stiamo modificando e c'era già una foto base64 e non ne carichiamo una nuova/URL, mantienila
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
            vampireToast('Nodo aggiornato.', 'success');
        } else {
            data.createdAt = Date.now();
            await addDoc(collection(db, 'albero_genealogico'), data);
            vampireToast('Nodo aggiunto all\'albero.', 'success');
        }
        window.resetFormAlbero();
    } catch (err) {
        console.error(err);
        vampireToast('Errore: ' + (err.message || err), 'error');
    }
};

window.caricaNodoAlberoPerEdit = (id) => {
    const n = alberoNodi.find(x => x.id === id);
    if (!n) return;
    document.getElementById('adm-albero-edit-id').value = n.id;
    document.getElementById('adm-albero-nome').value = n.nome || '';
    document.getElementById('adm-albero-cognome').value = n.cognome || '';
    document.getElementById('adm-albero-clan').value = n.clan || '';
    document.getElementById('adm-albero-anno').value = n.anno || '';
    document.getElementById('adm-albero-ordine').value = n.ordine ?? 0;
    document.getElementById('adm-albero-note').value = n.note || '';
    document.getElementById('adm-albero-foto-url').value = (n.foto && !n.foto.startsWith('data:')) ? n.foto : '';
    if (document.getElementById('adm-albero-relazione')) {
        document.getElementById('adm-albero-relazione').value = n.relazione || '';
    }
    window.popolaSelectParentAlbero();
    if (document.getElementById('adm-albero-parent')) document.getElementById('adm-albero-parent').value = n.parentId || '';
    if (document.getElementById('adm-albero-parent2')) document.getElementById('adm-albero-parent2').value = n.parent2Id || '';
    if (document.getElementById('adm-albero-spouse')) document.getElementById('adm-albero-spouse').value = n.spouseId || '';
    const fratSel = document.getElementById('adm-albero-fratelli');
    if (fratSel) {
        const ids = Array.isArray(n.fratelliIds) ? n.fratelliIds : [];
        [...fratSel.options].forEach(o => { o.selected = ids.includes(o.value); });
    }
    vampireToast('Dati caricati. Modifica e premi Salva persona.', 'info');
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
        vampireToast('Nodo rimosso.', 'success');
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
                (n.nome || '').toLowerCase().includes(search) ||
                (n.cognome || '').toLowerCase().includes(search) ||
                (n.clan || '').toLowerCase().includes(search) ||
                (n.relazione || '').toLowerCase().includes(search) ||
                (n.note || '').toLowerCase().includes(search) ||
                (n.anno || '').toLowerCase().includes(search) ||
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
        return `<tr>
            <td><img src="${fotoSrc}" alt="" loading="lazy" decoding="async" onerror="this.src='${PLACEHOLDER_FOTO}'"></td>
            <td><strong>${full}</strong><br><span style="opacity:0.6;font-size:0.6rem;">${n.clan || ''}</span></td>
            <td style="font-size:0.65rem;color:var(--gold-dim);">${n.relazione || '—'}</td>
            <td style="font-size:0.65rem;">${parents}</td>
            <td style="font-size:0.65rem;">${spouse}</td>
            <td>
                <button class="btn-delete" style="border-color:var(--gold-accent);color:var(--gold-accent);margin-right:4px;" onclick="window.caricaNodoAlberoPerEdit('${n.id}')">Modifica</button>
                <button class="btn-delete" onclick="window.eliminaNodoAlbero('${n.id}')">Elimina</button>
            </td>
        </tr>`;
    }).join('') || '<tr><td colspan="6" style="opacity:0.5;text-align:center;">Nessun nodo trovato.</td></tr>';
};

function buildAlberoTree(nodes) {
    const byId = {};
    nodes.forEach(n => { byId[n.id] = n; });

    // Grafo fratelli (bidirezionale): stesso parentId + fratelliIds dichiarati
    const sibAdj = {};
    nodes.forEach(n => { sibAdj[n.id] = new Set(); });
    nodes.forEach(n => {
        const listed = Array.isArray(n.fratelliIds) ? n.fratelliIds : [];
        listed.forEach(fid => {
            if (!byId[fid] || fid === n.id) return;
            sibAdj[n.id].add(fid);
            sibAdj[fid].add(n.id);
        });
    });
    // Stesso genitore principale = fratelli automatici
    const byParent = {};
    nodes.forEach(n => {
        const pid = n.parentId || '__root__';
        if (!byParent[pid]) byParent[pid] = [];
        byParent[pid].push(n);
    });
    Object.keys(byParent).forEach(k => {
        const list = byParent[k];
        list.sort((a, b) => (a.ordine ?? 0) - (b.ordine ?? 0) || alberoNomeCompleto(a).localeCompare(alberoNomeCompleto(b), 'it'));
        if (k === '__root__') return;
        for (let i = 0; i < list.length; i++) {
            for (let j = i + 1; j < list.length; j++) {
                sibAdj[list[i].id].add(list[j].id);
                sibAdj[list[j].id].add(list[i].id);
            }
        }
    });

    function siblingGroupOf(id) {
        const group = [];
        const seen = new Set();
        const stack = [id];
        while (stack.length) {
            const cur = stack.pop();
            if (seen.has(cur) || !byId[cur]) continue;
            seen.add(cur);
            group.push(byId[cur]);
            (sibAdj[cur] || new Set()).forEach(nb => {
                if (!seen.has(nb)) stack.push(nb);
            });
        }
        group.sort((a, b) => (a.ordine ?? 0) - (b.ordine ?? 0) || alberoNomeCompleto(a).localeCompare(alberoNomeCompleto(b), 'it'));
        return group;
    }

    const rendered = new Set();

    function siblingLabel(siblings) {
        if (siblings.length < 2) return '';
        return `<div class="albero-siblings-label">Fratelli / Sorelle (${siblings.length})</div>`;
    }

    function cardHtml(n, extraClass) {
        const fotoSrc = n.foto || PLACEHOLDER_FOTO;
        const p1 = n.parentId ? byId[n.parentId] : null;
        const p2 = n.parent2Id ? byId[n.parent2Id] : null;
        const parentHint = [p1, p2].filter(Boolean).map(alberoNomeCompleto).join(' · ');
        const sibs = siblingGroupOf(n.id).filter(s => s.id !== n.id);
        const sibHint = sibs.length
            ? `<div class="nodo-siblings">⇄ ${sibs.map(s => s.nome || alberoNomeCompleto(s)).join(', ')}</div>`
            : '';
        return `<div class="albero-nodo ${extraClass || ''}" data-id="${n.id}">
            <span class="nodo-bat" title="Vampiro">🦇</span>
            <img class="nodo-foto" src="${fotoSrc}" alt="" loading="lazy" decoding="async" onerror="this.src='${PLACEHOLDER_FOTO}'">
            <div class="nodo-nome">${n.nome || ''}</div>
            <div class="nodo-cognome">${n.cognome || ''}</div>
            ${n.relazione ? `<div class="nodo-relazione">${n.relazione}</div>` : ''}
            ${n.clan ? `<div class="nodo-clan">${n.clan}</div>` : ''}
            ${n.anno ? `<div class="nodo-anno">${n.anno}</div>` : ''}
            ${n.note ? `<div class="nodo-note" title="${String(n.note).replace(/"/g, '&quot;')}">${n.note}</div>` : ''}
            ${parentHint ? `<div class="nodo-parents">↳ figlio/a di ${parentHint}</div>` : ''}
            ${sibHint}
        </div>`;
    }

    function renderPersonUnit(n) {
        if (rendered.has(n.id)) return '';
        rendered.add(n.id);

        const spouse = n.spouseId ? byId[n.spouseId] : null;
        let pairSpouse = null;
        if (spouse && !rendered.has(spouse.id)) {
            pairSpouse = spouse;
            rendered.add(spouse.id);
        }

        let unit = '';
        if (pairSpouse) {
            unit = `<div class="albero-couple">
                ${cardHtml(n)}
                <div class="albero-heart" title="Coniugi / Compagni">♥</div>
                ${cardHtml(pairSpouse, 'nodo-spouse')}
            </div>`;
        } else {
            unit = cardHtml(n);
        }

        // Figli REALI (hanno questo genitore) — la barra e gli steli li collegano al padre
        const trueKidMap = {};
        (byParent[n.id] || []).forEach(k => { trueKidMap[k.id] = k; });
        if (pairSpouse) {
            (byParent[pairSpouse.id] || []).forEach(k => { trueKidMap[k.id] = k; });
        }
        const trueKids = Object.values(trueKidMap).sort((a, b) =>
            (a.ordine ?? 0) - (b.ordine ?? 0) || alberoNomeCompleto(a).localeCompare(alberoNomeCompleto(b), 'it')
        );

        // Fratelli dichiarati SENZA questo genitore: stessa riga, ma staccati (niente legame al padre)
        const detachedMap = {};
        trueKids.forEach(k => {
            siblingGroupOf(k.id).forEach(s => {
                if (rendered.has(s.id) || trueKidMap[s.id]) return;
                const isChildOfThis = s.parentId === n.id || (pairSpouse && s.parentId === pairSpouse.id);
                if (isChildOfThis) return;
                detachedMap[s.id] = s;
            });
        });
        const detached = Object.values(detachedMap).sort((a, b) =>
            (a.ordine ?? 0) - (b.ordine ?? 0) || alberoNomeCompleto(a).localeCompare(alberoNomeCompleto(b), 'it')
        );

        let html = `<div class="albero-branch">
            <div class="albero-node-wrap">${unit}</div>`;

        if (trueKids.length || detached.length) {
            if (trueKids.length) {
                html += `<div class="albero-stem"></div>`;
            }
            const rowPeers = [...trueKids, ...detached];
            html += `<div class="albero-children">
                ${siblingLabel(rowPeers)}
                <div class="albero-children-row">`;
            if (trueKids.length) {
                html += `<div class="albero-true-kids-group">
                    <div class="albero-children-bar"></div>
                    <div class="albero-true-kids-row">`;
                trueKids.forEach(k => {
                    html += `<div class="albero-child-slot">
                        <div class="albero-child-stem"></div>
                        ${renderPersonUnit(k)}
                    </div>`;
                });
                html += `</div></div>`;
            }
            if (detached.length) {
                html += `<div class="albero-peer-link" title="Fratelli / stesso livello">⇄</div>`;
                html += `<div class="albero-detached-group">
                    <div class="albero-children-bar albero-bar-invisible"></div>
                    <div class="albero-detached-row">`;
                detached.forEach(k => {
                    html += `<div class="albero-child-slot albero-detached-sibling">
                        <div class="albero-child-stem albero-stem-invisible"></div>
                        ${renderPersonUnit(k)}
                    </div>`;
                });
                html += `</div></div>`;
            }
            html += `</div></div>`;
        }
        html += `</div>`;
        return html;
    }

    /** Solo radici (senza genitore valido) sulla stessa riga — non tira su i figli di altri */
    function renderSiblingRow(seedList) {
        const rowMap = {};
        seedList.forEach(n => {
            siblingGroupOf(n.id).forEach(s => {
                if (rendered.has(s.id)) return;
                // Solo chi non ha genitore (o genitore inesistente): non spostare chi è figlio di qualcuno
                if (s.parentId && byId[s.parentId]) return;
                rowMap[s.id] = s;
            });
        });
        const row = Object.values(rowMap).sort((a, b) =>
            (a.ordine ?? 0) - (b.ordine ?? 0) || alberoNomeCompleto(a).localeCompare(alberoNomeCompleto(b), 'it')
        );
        if (!row.length) return '';
        let html = '';
        if (row.length > 1) {
            html += `<div class="albero-children" style="margin-bottom:12px;">
                ${siblingLabel(row)}
                <div class="albero-children-bar"></div>
                <div class="albero-children-row">`;
            row.forEach(k => {
                html += `<div class="albero-child-slot">${renderPersonUnit(k)}</div>`;
            });
            html += `</div></div>`;
        } else {
            html += renderPersonUnit(row[0]);
        }
        return html;
    }

    if (!nodes.length) {
        return '<p style="text-align:center;opacity:0.5;padding:40px;">Albero vuoto. Il gestore può aggiungere nodi da Gestione → Albero Genealogico.</p>';
    }

    const roots = byParent['__root__'] || [];
    const orphanIds = new Set(nodes.filter(n => n.parentId && !byId[n.parentId]).map(n => n.id));
    const extraRoots = nodes.filter(n => orphanIds.has(n.id));

    if (!roots.length && !extraRoots.length) {
        return '<p style="text-align:center;opacity:0.6;padding:30px;">Nodi presenti ma senza legami validi. Controlla i genitori in Gestione.</p>';
    }

    let out = '<div class="albero-title-clan">Clan Drakòvič · Dè Lùne</div>';
    out += '<div class="albero-legend">♥ Coniugi &nbsp;·&nbsp; ⇄ Fratelli/Sorelle (anche senza stessi genitori) &nbsp;·&nbsp; ↳ Figlio/a di</div>';
    out += '<div class="albero-roots-row">';

    // Radici "differite": senza genitore ma fratelli di qualcuno che HA un genitore
    // → non in cima: andranno staccati sulla riga dei fratelli sotto quel genitore
    function isDeferredRoot(n) {
        if (n.parentId && byId[n.parentId]) return false;
        return siblingGroupOf(n.id).some(s => s.id !== n.id && s.parentId && byId[s.parentId]);
    }

    const rootSeeds = [...roots, ...extraRoots].filter(r => !isDeferredRoot(r));
    const rootSeenGroup = new Set();
    rootSeeds.forEach(r => {
        if (rendered.has(r.id) || rootSeenGroup.has(r.id)) return;
        const group = siblingGroupOf(r.id);
        group.forEach(g => rootSeenGroup.add(g.id));
        out += renderSiblingRow(group);
    });

    // Nodi mai disegnati (es. differiti se il fratello genitorato non era raggiungibile)
    nodes.forEach(n => {
        if (!rendered.has(n.id)) out += renderPersonUnit(n);
    });

    out += '</div>';
    return out;
}

// --- PAN / ZOOM ALBERO ---
let alberoPan = { x: 0, y: 0, scale: 1, dragging: false, startX: 0, startY: 0, originX: 0, originY: 0, inited: false, userMoved: false };
let alberoCenterTimer = null;
let alberoLastSignature = '';
window._alberoDirty = true;

function applyAlberoTransform() {
    const el = document.getElementById('albero-container');
    if (!el) return;
    el.style.transform = `translate(${alberoPan.x}px, ${alberoPan.y}px) scale(${alberoPan.scale})`;
}

function measureAlberoContentSize(content) {
    const treeRoot = document.getElementById('albero-tree-root');
    let cw = 0, ch = 0;
    if (treeRoot) {
        cw = Math.max(treeRoot.scrollWidth || 0, treeRoot.offsetWidth || 0);
        ch = Math.max(treeRoot.scrollHeight || 0, treeRoot.offsetHeight || 0);
    }
    const cs = window.getComputedStyle(content);
    const padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
    const padY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
    cw = Math.max(cw + padX, content.scrollWidth || 0, content.offsetWidth || 0);
    ch = Math.max(ch + padY, content.scrollHeight || 0, content.offsetHeight || 0);
    return { cw: Math.ceil(cw), ch: Math.ceil(ch) };
}

function centerAlberoView() {
    const viewport = document.getElementById('albero-viewport');
    const content = document.getElementById('albero-container');
    if (!viewport || !content) return;
    if (!document.getElementById('albero')?.classList.contains('active')) return;

    alberoPan.scale = 1;
    content.style.transform = 'translate(0px, 0px) scale(1)';

    requestAnimationFrame(() => {
        const vw = viewport.clientWidth;
        const vh = viewport.clientHeight;
        if (vw < 20 || vh < 20) return;
        const { cw, ch } = measureAlberoContentSize(content);
        const pad = 24;
        // Sempre scala 1 all'apertura: box leggibili subito (niente rimpicciolimento)
        alberoPan.scale = 1;
        // Centra in orizzontale rispetto alla larghezza reale dell'albero
        alberoPan.x = Math.round((vw - cw) / 2);
        // Parte sempre dall'alto (radice / primo nodo)
        alberoPan.y = pad;
        alberoPan.userMoved = false;
        applyAlberoTransform();
    });
}

/** Un solo centraggio + un ritocco leggero se le foto finiscono di caricare */
function centerAlberoViewReliable() {
    if (alberoCenterTimer) clearTimeout(alberoCenterTimer);
    centerAlberoView();
    alberoCenterTimer = setTimeout(() => centerAlberoView(), 120);

    const content = document.getElementById('albero-container');
    if (!content) return;
    let pending = 0;
    content.querySelectorAll('img').forEach(img => {
        if (img.complete) return;
        pending++;
        img.addEventListener('load', () => {
            pending--;
            if (pending <= 0 && !alberoPan.userMoved) centerAlberoView();
        }, { once: true });
    });
}

function alberoDataSignature(nodes) {
    // Firma leggera senza base64 foto (evita lag e confronti enormi)
    return nodes.map(n => [
        n.id, n.nome, n.cognome, n.clan, n.anno, n.parentId, n.parent2Id,
        n.spouseId, (Array.isArray(n.fratelliIds) ? n.fratelliIds.join(',') : ''),
        n.relazione, n.ordine, n.foto ? (n.foto.length + ':' + n.foto.slice(0, 24)) : ''
    ].join('|')).join('~');
}

function initAlberoPanZoom() {
    const viewport = document.getElementById('albero-viewport');
    if (!viewport || alberoPan.inited) return;
    alberoPan.inited = true;

    viewport.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        alberoPan.dragging = true;
        alberoPan.startX = e.clientX;
        alberoPan.startY = e.clientY;
        alberoPan.originX = alberoPan.x;
        alberoPan.originY = alberoPan.y;
        viewport.classList.add('is-dragging');
        viewport.setPointerCapture?.(e.pointerId);
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
        const newScale = Math.min(2.5, Math.max(0.35, oldScale * delta));
        alberoPan.x = mx - (mx - alberoPan.x) * (newScale / oldScale);
        alberoPan.y = my - (my - alberoPan.y) * (newScale / oldScale);
        alberoPan.scale = newScale;
        alberoPan.userMoved = true;
        applyAlberoTransform();
    }, { passive: false });

    viewport.addEventListener('dblclick', (e) => {
        e.preventDefault();
        alberoPan.scale = 1;
        alberoPan.userMoved = false;
        centerAlberoViewReliable();
    });
}

/**
 * @param {{ preservePan?: boolean, forceCenter?: boolean }} opts
 */
window.renderAlbero = (opts = {}) => {
    const root = document.getElementById('albero-tree-root');
    if (!root) return;

    const sig = alberoDataSignature(alberoNodi);
    const dataChanged = sig !== alberoLastSignature;
    if (!dataChanged && !opts.forceCenter && root.querySelector('.albero-nodo, .albero-roots-row, p')) {
        // Nessun cambio dati: evita reflow / scatti
        if (opts.forceCenter) centerAlberoViewReliable();
        return;
    }
    alberoLastSignature = sig;

    root.innerHTML = buildAlberoTree(alberoNodi);
    initAlberoPanZoom();

    if (opts.forceCenter || !opts.preservePan || !alberoPan.userMoved) {
        centerAlberoViewReliable();
    } else {
        // Mantieni posizione corrente dopo update dati
        applyAlberoTransform();
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
        // Temporarily reset transform so full tree is captured cleanly
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
        link.download = 'albero-genealogico-vampiri-' + new Date().toISOString().slice(0,10) + '.png';
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
