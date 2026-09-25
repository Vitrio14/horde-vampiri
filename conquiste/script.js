import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, doc, setDoc, onSnapshot, collection, addDoc, getDocs, deleteDoc, updateDoc, query, orderBy, limit, increment, where } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// 1. CONFIGURAZIONE FIREBASE
const firebaseConfig = {
  apiKey: "AIzaSyCnac92fjhqj7Hq2BVFL86KSwwjCvxsZYY",
  authDomain: "conquiste-horde.firebaseapp.com",
  projectId: "conquiste-horde",
  storageBucket: "conquiste-horde.firebasestorage.app",
  messagingSenderId: "323624294367",
  appId: "1:323624294367:web:848ef538fae4f74be6966a",
  measurementId: "G-8GZPN15VH4"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// --- SISTEMA UI CUSTOM (TOAST E MODAL) ---
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerText = message;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s ease forwards';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

let confirmAction = null;
function showConfirmModal(title, message, onConfirm) {
    document.getElementById('modal-title').innerText = title;
    document.getElementById('modal-message').innerText = message;
    confirmAction = onConfirm;
    document.getElementById('custom-modal-overlay').style.display = 'flex';
}

document.getElementById('modal-btn-cancel').addEventListener('click', () => {
    document.getElementById('custom-modal-overlay').style.display = 'none';
    confirmAction = null;
});

document.getElementById('modal-btn-confirm').addEventListener('click', () => {
    document.getElementById('custom-modal-overlay').style.display = 'none';
    if (confirmAction) confirmAction();
    confirmAction = null;
});

// --- SISTEMA LOG OPERATIVO ---
async function logActivity(message) {
    if (!currentUser && !auth.currentUser) return;
    const utente = currentUser ? currentUser.nome : (auth.currentUser?.email || "Sconosciuto");
    try {
        await addDoc(collection(db, "activity_log"), {
            testo: message,
            utente: utente,
            timestamp: new Date()
        });
    } catch (e) { console.error("Errore log:", e); }
}

let activityLogCache = [];

function renderAdminActivityLog(filter = "") {
    const adminBox = document.getElementById('admin-activity-log');
    if (!adminBox) return;
    const f = (filter || "").toLowerCase();
    const filtered = activityLogCache.filter(item => {
        if (!f) return true;
        return (item.testo || "").toLowerCase().includes(f) || (item.utente || "").toLowerCase().includes(f);
    });
    if (filtered.length === 0) {
        adminBox.innerHTML = '<p style="font-size:0.8rem; color:var(--text-secondary); text-align:center;">Nessun movimento utente trovato.</p>';
        return;
    }
    // GESTIONE: audit utenti — chi ha fatto cosa
    adminBox.innerHTML = filtered.map(item => {
        const date = item.timestamp ? item.timestamp.toDate() : new Date();
        const timeString = date.toLocaleDateString('it-IT') + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        const chi = item.utente || 'Sconosciuto';
        return `
            <div class="log-item">
                <span class="log-time">[${timeString}]</span>
                <div style="margin-top:4px;">
                    <b style="color:var(--accent-gold);">${chi}</b>
                    <span style="color:var(--text-secondary);"> ha eseguito:</span>
                    <div style="margin-top:4px;">${item.testo}</div>
                </div>
            </div>
        `;
    }).join('');
}

function avviaAscoltoLog() {
    const q = query(collection(db, "activity_log"), orderBy("timestamp", "desc"), limit(100));
    onSnapshot(q, (snapshot) => {
        activityLogCache = [];
        snapshot.forEach((docSnap) => {
            activityLogCache.push({ id: docSnap.id, ...docSnap.data() });
        });

        // ATTIVITÀ RECENTI (Territori): log operativo come sempre (conquiste, fazioni, risorse)
        const box = document.getElementById('activity-log-content');
        if (box) {
            box.innerHTML = '';
            activityLogCache.slice(0, 50).forEach((data) => {
                const date = data.timestamp ? data.timestamp.toDate() : new Date();
                const timeString = date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                box.innerHTML += `
                    <div class="log-item">
                        <span class="log-time">[${timeString}]</span><br>
                        ${data.testo}
                    </div>
                `;
            });
        }

        // GESTIONE: log utenti (chi ha fatto l'azione)
        const searchVal = document.getElementById('search-admin-log')?.value || '';
        renderAdminActivityLog(searchVal);
    });
}

// Filtro log in gestione
document.getElementById('search-admin-log')?.addEventListener('input', (e) => {
    renderAdminActivityLog(e.target.value);
});


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

// UI Login
const loginOverlay = document.getElementById('login-overlay');
const appContainer = document.getElementById('app-container');

// --- AUTH CUSTOM + GESTORE ---
let currentUser = null; // { nome, codice, permessi:[], isAdmin:false }
let listenersStarted = false;
let listaUtenti = [];

const SEZIONI = ['conquiste', 'punti', 'risorse', 'gestione'];

function applyPermissions() {
    if (!currentUser) return;
    const isAdmin = currentUser.isAdmin;
    // Compatibilità: vecchio permesso "tattiche" → nuovo "punti"
    let perm = currentUser.permessi || [];
    if (perm.includes('tattiche') && !perm.includes('punti')) {
        perm = [...perm, 'punti'];
    }

    document.querySelectorAll('.tab-btn').forEach(btn => {
        const target = btn.getAttribute('data-target');
        if (target === 'gestione') {
            btn.style.display = isAdmin ? '' : 'none';
        } else if (target) {
            btn.style.display = (isAdmin || perm.includes(target)) ? '' : 'none';
        }
    });

    // Se la tab attiva non è più visibile, vai alla prima permessa
    const activeBtn = document.querySelector('.tab-btn.active');
    if (activeBtn && activeBtn.style.display === 'none') {
        const first = document.querySelector('.tab-btn:not([style*="display: none"])');
        if (first) first.click();
    }
}

function startAllListeners() {
    if (listenersStarted) return;
    listenersStarted = true;
    avviaAscoltoDati();
    avviaAscoltoPunti();
    avviaAscoltoLog();
    avviaAscoltoUtenti();
}

// Switch login UI
document.getElementById('link-login-gestore')?.addEventListener('click', () => {
    document.getElementById('login-membro-box').style.display = 'none';
    document.getElementById('login-gestore-box').style.display = 'block';
    document.getElementById('login-admin-password')?.focus();
});
document.getElementById('link-login-membro')?.addEventListener('click', () => {
    document.getElementById('login-gestore-box').style.display = 'none';
    document.getElementById('login-membro-box').style.display = 'block';
    document.getElementById('login-codice')?.focus();
});

// Login membro (codice + password)
document.getElementById('btn-login').addEventListener('click', async () => {
    const codice = (document.getElementById('login-codice')?.value || '').trim();
    const password = (document.getElementById('login-password')?.value || '').trim();
    if (!codice || codice.length !== 4 || !/^\d{4}$/.test(codice)) {
        return showToast("Inserisci un codice a 4 cifre valido.", "error");
    }
    if (!password) return showToast("Inserisci la password.", "error");

    try {
        const q = query(collection(db, "membri"), where("codice", "==", codice));
        const snap = await getDocs(q);
        let found = null;
        snap.forEach(d => {
            const data = d.data();
            if (data.password === password) found = { id: d.id, ...data };
        });
        if (!found) return showToast("Codice o password errati.", "error");

        currentUser = {
            nome: found.nome || found.id,
            codice: found.codice,
            permessi: Array.isArray(found.permessi) ? found.permessi : ['conquiste'],
            isAdmin: false
        };
        loginOverlay.style.display = 'none';
        appContainer.style.display = 'flex';
        startAllListeners();
        applyPermissions();
        showToast(`Benvenuto, ${currentUser.nome}.`, "success");
        logActivity(`🔑 Accesso effettuato.`);
        document.getElementById('login-codice').value = '';
        document.getElementById('login-password').value = '';
    } catch (e) {
        console.error(e);
        showToast("Errore durante l'accesso.", "error");
    }
});

// Login gestore (Firebase Auth)
document.getElementById('btn-login-gestore').addEventListener('click', async () => {
    const password = (document.getElementById('login-admin-password')?.value || '').trim();
    if (!password) return showToast("Inserisci la password gestore.", "error");
    try {
        await signInWithEmailAndPassword(auth, "vampiri.gestore@horde.it", password);
        // onAuthStateChanged gestisce il resto
    } catch (e) {
        showToast("Credenziali Gestore errate.", "error");
    }
});

// Enter key support
document.getElementById('login-password')?.addEventListener('keypress', e => { if (e.key === 'Enter') document.getElementById('btn-login').click(); });
document.getElementById('login-admin-password')?.addEventListener('keypress', e => { if (e.key === 'Enter') document.getElementById('btn-login-gestore').click(); });
document.getElementById('login-codice')?.addEventListener('keypress', e => { if (e.key === 'Enter') document.getElementById('login-password')?.focus(); });

// Firebase Auth solo per gestore
onAuthStateChanged(auth, (user) => {
    if (user && user.email === "vampiri.gestore@horde.it") {
        currentUser = {
            nome: "GESTORE",
            isAdmin: true,
            permessi: SEZIONI
        };
        loginOverlay.style.display = 'none';
        appContainer.style.display = 'flex';
        startAllListeners();
        applyPermissions();
        // Vai a gestione se admin
        const tabG = document.getElementById('tab-gestione');
        if (tabG) { tabG.style.display = ''; tabG.click(); }
        showToast("Accesso Gestore eseguito.", "success");
        logActivity(`🔑 Accesso Gestore effettuato.`);
    } else if (!user && currentUser && currentUser.isAdmin) {
        // logout gestore
        currentUser = null;
        loginOverlay.style.display = 'flex';
        appContainer.style.display = 'none';
    }
});

document.getElementById('btn-logout').addEventListener('click', async () => {
    currentUser = null;
    try { await signOut(auth); } catch(e) {}
    loginOverlay.style.display = 'flex';
    appContainer.style.display = 'none';
    // reset login UI
    document.getElementById('login-gestore-box').style.display = 'none';
    document.getElementById('login-membro-box').style.display = 'block';
    showToast("Sessione chiusa.", "info");
});

// --- GESTIONE UTENTI (solo admin) ---
function avviaAscoltoUtenti() {
    onSnapshot(collection(db, "membri"), (snap) => {
        listaUtenti = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderAdminUtenti();
    });
}

function renderAdminUtenti() {
    const tbody = document.getElementById('admin-utenti-body');
    if (!tbody) return;
    tbody.innerHTML = listaUtenti.map(u => {
        const perms = Array.isArray(u.permessi) ? u.permessi.join(', ') : '—';
        return `<tr>
            <td><b>${u.nome || u.id}</b></td>
            <td style="font-family:monospace;">${u.codice || '—'}</td>
            <td style="font-size:0.75rem;" title="${perms}">${perms}</td>
            <td>
                <button class="btn-status btn-attesa" style="padding:4px 8px; font-size:0.65rem; margin:2px;" data-edit="${u.id}">Modifica</button>
                <button class="btn-status btn-completata" style="padding:4px 8px; font-size:0.65rem; margin:2px; background:#7f1d1d; border-color:#7f1d1d; color:#fff;" data-del="${u.id}">Elimina</button>
            </td>
        </tr>`;
    }).join('') || '<tr><td colspan="4" style="padding:15px; text-align:center; opacity:0.5;">Nessun utente</td></tr>';
}

document.getElementById('admin-utenti-body')?.addEventListener('click', async (e) => {
    const editId = e.target.getAttribute('data-edit');
    const delId = e.target.getAttribute('data-del');
    if (editId) {
        const u = listaUtenti.find(x => x.id === editId);
        if (!u) return;
        document.getElementById('admin-user-nome').value = u.nome || u.id;
        document.getElementById('admin-user-grado').value = u.grado || '';
        document.getElementById('admin-user-codice').value = u.codice || '';
        document.getElementById('admin-user-password').value = u.password || '';
        document.querySelectorAll('.perm-check').forEach(cb => {
            cb.checked = Array.isArray(u.permessi) && u.permessi.includes(cb.value);
        });
        showToast("Dati caricati. Modifica e premi Salva.", "info");
    }
    if (delId) {
        showConfirmModal("Elimina utente", "Vuoi eliminare questo utente?", async () => {
            await deleteDoc(doc(db, "membri", delId));
            logActivity(`🗑️ Utente <b>${delId}</b> eliminato.`);
            showToast("Utente eliminato.", "success");
        });
    }
});

document.getElementById('btn-salva-utente')?.addEventListener('click', async () => {
    if (!currentUser?.isAdmin) return showToast("Solo il gestore può creare utenti.", "error");
    const nome = document.getElementById('admin-user-nome').value.trim();
    const grado = document.getElementById('admin-user-grado').value.trim();
    const codice = document.getElementById('admin-user-codice').value.trim();
    const password = document.getElementById('admin-user-password').value.trim();
    if (!nome) return showToast("Nome obbligatorio.", "error");
    if (codice && (codice.length !== 4 || !/^\d{4}$/.test(codice))) {
        return showToast("Il codice deve essere di 4 cifre.", "error");
    }
    const permessi = [];
    document.querySelectorAll('.perm-check:checked').forEach(cb => permessi.push(cb.value));
    if (permessi.length === 0) permessi.push('conquiste');

    // Unicità codice
    if (codice) {
        const q = query(collection(db, "membri"), where("codice", "==", codice));
        const snap = await getDocs(q);
        let conflict = false;
        snap.forEach(d => { if (d.id !== nome) conflict = true; });
        if (conflict) return showToast("Questo codice è già in uso.", "error");
    }

    const data = { nome, grado, permessi };
    if (codice) data.codice = codice;
    if (password) data.password = password;

    await setDoc(doc(db, "membri", nome), data, { merge: true });
    logActivity(`👤 Utente <b>${nome}</b> creato/aggiornato (permessi: ${permessi.join(', ')}).`);
    document.getElementById('admin-user-nome').value = '';
    document.getElementById('admin-user-grado').value = '';
    document.getElementById('admin-user-codice').value = '';
    document.getElementById('admin-user-password').value = '';
    document.querySelectorAll('.perm-check').forEach(cb => {
        cb.checked = ['conquiste','punti'].includes(cb.value);
    });
    showToast("Utente salvato.", "success");
});

// DATI FAZIONI
const fazioniDef = [
    { id: "ghoul", name: "Ghoul", color: "#03e903" },
    { id: "rsg", name: "Ghoul RSG", color: "#006400" },
    { id: "lycan", name: "Lycan", color: "#808080" },
    { id: "bloodbound", name: "Bloodbound", color: "#404040" },
    { id: "wulfing", name: "Wulfing", color: "#D3D3D3" },
    { id: "kitzune", name: "Kitzune", color: "#FFA500" },
    { id: "onimaru", name: "Onimaru", color: "#FFFF00" },
    { id: "inugami", name: "Inugami", color: "#DAA520" },
    { id: "vampiri", name: "Vampiri", color: "#ff0000" },
    { id: "noctis", name: "Noctis Aeterna", color: "#8B0000" },
    { id: "demoni", name: "Demoni", color: "#5500ff" },
    { id: "aeterna", name: "Aeterna Mortis", color: "#4B0082" }
];

let globalData = { territori: {}, punti: {}, anelli: {} };

// TABS NAVIGAZIONE
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const target = btn.getAttribute('data-target');
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.view-area').forEach(v => v.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('view-' + target).classList.add('active');
    });
});

// GENERAZIONE GRIGLIA TERRITORI
const griglia = document.getElementById('griglia');
const righe = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K'];
let fazioneAttiva = null;

for (let i = 0; i < righe.length; i++) {
    for (let j = 1; j <= 11; j++) {
        const cellaId = `${righe[i]}${j}`;
        const div = document.createElement('div');
        div.classList.add('cella'); div.id = cellaId; 
        div.innerHTML = `<div class="cella-id">${cellaId}</div><div class="cella-icons" id="icons_${cellaId}"></div>`;
        div.addEventListener('click', () => conquistaTerritorio(cellaId));
        griglia.appendChild(div);
    }
}

// SELEZIONE CARDS FAZIONI
document.querySelectorAll('.faction-card').forEach(card => {
    card.addEventListener('click', (e) => {
        document.querySelectorAll('.faction-card').forEach(c => c.classList.remove('attiva'));
        card.classList.add('attiva');
        fazioneAttiva = { id: card.dataset.id, colore: card.dataset.color };
    });
});

async function conquistaTerritorio(cellaId) {
    if (!fazioneAttiva) { showToast("Seleziona una fazione prima di cliccare!", "error"); return; }
    if (!currentUser && !auth.currentUser) return;
    
    const oldOwnerId = globalData.territori[cellaId];
    if (oldOwnerId === fazioneAttiva.id) return; // Stessa fazione, nessun cambiamento

    try {
        // Aggiorna Territorio
        await setDoc(doc(db, "territori", cellaId), {
            owner: fazioneAttiva.id, color: fazioneAttiva.colore, timestamp: new Date()
        });

        // Auto-deduzione anello (solo se la fazione non è Nessuno)
        if (fazioneAttiva.id !== 'nessuno') {
            await setDoc(doc(db, "sistema", "anelli"), {
                [fazioneAttiva.id]: increment(-1)
            }, { merge: true });
        }

        // Costruzione Log Conquista
        const nomeNuova = fazioneAttiva.id === 'nessuno' ? 'Territorio Reso Neutrale' : (fazioniDef.find(f => f.id === fazioneAttiva.id)?.name || fazioneAttiva.id);
        let msgLog = '';

        if (fazioneAttiva.id === 'nessuno') {
            msgLog = `🏳️ Il quadrante <b>${cellaId}</b> è tornato neutrale.`;
        } else {
            msgLog = `🗺️ <b>${nomeNuova}</b> ha conquistato il quadrante <b>${cellaId}</b>`;
            if (oldOwnerId && oldOwnerId !== 'nessuno') {
                const nomeVecchia = fazioniDef.find(f => f.id === oldOwnerId)?.name || oldOwnerId;
                msgLog += ` (sottraendolo a ${nomeVecchia})`;
            }

            // Cerca risorse in quel quadrante
            let risorseTrovate = [];
            for (const pId in globalData.punti) {
                const p = globalData.punti[pId];
                if (p.quadrante && p.quadrante.toUpperCase().trim() === cellaId) {
                    risorseTrovate.push(p.nome);
                }
            }
            if (risorseTrovate.length > 0) {
                msgLog += `, ottenendo: <i>${risorseTrovate.join(', ')}</i>`;
            }
        }

        logActivity(msgLog + ".");

    } catch (e) { console.error(e); }
}

// ASCOLTO DATI DA FIREBASE
function avviaAscoltoDati() {
    // Ascolto territori
    document.querySelectorAll('.cella').forEach(cella => {
        onSnapshot(doc(db, "territori", cella.id), (docSnap) => {
            if (docSnap.exists()) {
                const dati = docSnap.data();
                cella.style.backgroundColor = dati.color;
                globalData.territori[cella.id] = dati.owner;
            } else {
                cella.style.backgroundColor = 'transparent';
                globalData.territori[cella.id] = 'nessuno';
            }
            ricalcolaDati();
        });
    });

    // Ascolto punti interesse
    onSnapshot(collection(db, "punti_interesse"), (snapshot) => {
        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            globalData.punti[docSnap.id] = data;
            const inp = document.getElementById(`quad_${docSnap.id}`);
            if (inp) inp.value = data.quadrante || "";
        });
        ricalcolaDati();
    });

    // Ascolto Anelli
    onSnapshot(doc(db, "sistema", "anelli"), (docSnap) => {
        if (docSnap.exists()) {
            globalData.anelli = docSnap.data();
            // Aggiorna gli input nella vista Database
            fazioniDef.forEach(f => {
                if (f.id !== 'nessuno') {
                    const inp = document.getElementById(`anelli_${f.id}`);
                    if (inp) inp.value = globalData.anelli[f.id] || 0;
                }
            });
        } else {
            globalData.anelli = {};
        }
        ricalcolaDati();
    });
}

// MOTORE: AGGIORNA MAPPA, LEGENDA E CLASSIFICA (CON NUOVO PUNTEGGIO)
function ricalcolaDati() {
    document.querySelectorAll('.cella-icons').forEach(c => c.innerHTML = ''); 
    for (const pId in globalData.punti) {
        const p = globalData.punti[pId];
        if (p.quadrante && p.quadrante.trim() !== '') {
            const q = p.quadrante.toUpperCase().trim();
            const iconContainer = document.getElementById(`icons_${q}`);
            if (iconContainer) {
                const icon = p.type === 'mat' ? '⛏️' : (p.type === 'mer' ? '💰' : '🔮');
                iconContainer.innerHTML += `<span>${icon}</span>`;
            }
        }
    }

    const stats = {};
    fazioniDef.forEach(f => { 
        stats[f.id] = { 
            nome: f.name, colore: f.color, 
            terr: 0, mat: 0, mer: 0, alt: 0,
            anelli: globalData.anelli[f.id] || 0,
            matNames: [], merNames: [], altNames: [],
            punteggio: 0
        }; 
    });
    stats["nessuno"] = { nome: "Neutrale", colore: "#334155", terr: 0, mat: 0, mer: 0, alt: 0, anelli: 0, matNames: [], merNames: [], altNames: [], punteggio: 0 };

    for (const cella in globalData.territori) { 
        const owner = globalData.territori[cella];
        if (stats[owner]) stats[owner].terr++; 
    }
    
    for (const pId in globalData.punti) {
        const p = globalData.punti[pId];
        if (p.quadrante && p.quadrante.trim() !== '') {
            const q = p.quadrante.toUpperCase().trim();
            const ownerDelQuadrante = globalData.territori[q];
            
            if (ownerDelQuadrante && ownerDelQuadrante !== 'nessuno' && stats[ownerDelQuadrante]) {
                if (p.type === 'mat') { stats[ownerDelQuadrante].mat++; stats[ownerDelQuadrante].matNames.push(p.nome); }
                if (p.type === 'mer') { stats[ownerDelQuadrante].mer++; stats[ownerDelQuadrante].merNames.push(p.nome); }
                if (p.type === 'alt') { stats[ownerDelQuadrante].alt++; stats[ownerDelQuadrante].altNames.push(p.nome); }
            }
        }
    }

    let classifica = [];
    for (const fId in stats) {
        if (fId !== 'nessuno' && (stats[fId].terr > 0 || stats[fId].mat > 0 || stats[fId].mer > 0 || stats[fId].alt > 0 || stats[fId].anelli > 0)) {
            // Punteggio: base 1, con mercante 2 (+1), con materiale 3 (+2), con altare 4 (+3)
            stats[fId].punteggio = (stats[fId].terr * 1) + (stats[fId].mer * 1) + (stats[fId].mat * 2) + (stats[fId].alt * 3);
            classifica.push(stats[fId]);
        }
    }

    // Ordina per Punteggio decrescente, a parità per numero territori
    classifica.sort((a, b) => b.punteggio - a.punteggio || b.terr - a.terr);

    const cont = document.getElementById('stats-content');
    cont.innerHTML = '';

    let conquistati = classifica.reduce((sum, f) => sum + f.terr, 0);
    let liberi = 121 - conquistati;

    cont.innerHTML += `
        <div style="background: rgba(255,255,255,0.05); padding: 15px; border-radius: 8px; margin-bottom: 20px; text-align: center; border: 1px dashed var(--glass-border); box-shadow: inset 0 0 10px rgba(0,0,0,0.5);">
            <span style="color: var(--text-secondary); font-size: 0.85rem; text-transform: uppercase; letter-spacing: 1px; font-weight: bold;">Territori Liberi</span><br>
            <span style="font-family: 'Rajdhani'; font-size: 2.2rem; color: #fff; text-shadow: 0 0 15px rgba(255,255,255,0.6);">${liberi}</span> 
            <span style="color: var(--text-secondary); font-size: 1rem;">/ 121</span>
        </div>
    `;

    if (classifica.length === 0) {
        cont.innerHTML += '<p style="font-size:0.8rem; color:var(--text-secondary); text-align:center;">Nessun dominio stabilito.</p>';
        return;
    }

    classifica.forEach((s, index) => {
        let medaglia = '';
        if (index === 0) medaglia = '<span style="font-size: 1.2rem; text-shadow: 0 0 5px gold;">🥇</span>';
        else if (index === 1) medaglia = '<span style="font-size: 1.2rem; text-shadow: 0 0 5px silver;">🥈</span>';
        else if (index === 2) medaglia = '<span style="font-size: 1.2rem; text-shadow: 0 0 5px #cd7f32;">🥉</span>';
        else medaglia = `<span style="font-size: 0.9rem; color: var(--text-secondary); width: 22px; display: inline-block; text-align: center; font-family: 'Rajdhani';">${index + 1}°</span>`;

        let dettagli = '';
        if (s.matNames.length > 0) dettagli += `<div class="stat-details"><b>⛏️ Materiali:</b> ${s.matNames.join(', ')}</div>`;
        if (s.merNames.length > 0) dettagli += `<div class="stat-details"><b>💰 Mercanti:</b> ${s.merNames.join(', ')}</div>`;
        if (s.altNames.length > 0) dettagli += `<div class="stat-details"><b>🔮 Altari:</b> ${s.altNames.join(', ')}</div>`;

        cont.innerHTML += `
        <div class="stat-row">
            <div style="display: flex; justify-content: space-between; width: 100%; align-items: center;">
                <div class="stat-faction-name" style="color: ${s.colore}; display: flex; align-items: center; gap: 8px;">
                    ${medaglia} ${s.nome}
                </div>
                <div class="stat-values">
                    <span title="Punti Dominio">🏆 <b>${s.punteggio}</b></span>
                    <span title="Anelli">💍 <b>${s.anelli}</b></span>
                    <span title="Quadranti">🗺️ <b>${s.terr}</b></span>
                    <span title="Aree Raccolta">⛏️ ${s.mat}</span>
                    <span title="Mercanti">💰 ${s.mer}</span>
                    <span title="Altari">🔮 ${s.alt}</span>
                </div>
            </div>
            ${dettagli}
        </div>`;
    });
}

// --- PUNTI CONQUISTA (MAPPA INTERATTIVA + ZOOM) ---
let puntiCache = [];
let editingPuntoId = null;

// Zoom / pan state
let mapZoom = 1;
let mapPanX = 0;
let mapPanY = 0;
let isPanning = false;
let panStartX = 0, panStartY = 0, panOriginX = 0, panOriginY = 0;
const ZOOM_MIN = 1;   // non si può rimpicciolire sotto il 100%
const ZOOM_MAX = 4;
const ZOOM_STEP = 0.25;
const MAP_SIZE = 900; // lato del riquadro mappa in px

function clampMapPan() {
    // A zoom 1: pan bloccato a 0. A zoom > 1: non mostrare mai bordi vuoti.
    const minPan = MAP_SIZE * (1 - mapZoom); // es. zoom 2 → -900
    const maxPan = 0;
    mapPanX = Math.min(maxPan, Math.max(minPan, mapPanX));
    mapPanY = Math.min(maxPan, Math.max(minPan, mapPanY));
}

function applyMapTransform() {
    clampMapPan();
    const inner = document.getElementById('punti-map-inner');
    if (!inner) return;
    inner.style.transform = `translate(${mapPanX}px, ${mapPanY}px) scale(${mapZoom})`;

    // Blip fuori dallo scale: riposiziona in pixel interi (sempre nitidi)
    positionPuntiBlips();

    const label = document.getElementById('zoom-level-label');
    if (label) label.textContent = Math.round(mapZoom * 100) + '%';
    const btnOut = document.getElementById('btn-zoom-out');
    if (btnOut) {
        btnOut.disabled = mapZoom <= ZOOM_MIN + 0.001;
    }
}

function setMapZoom(z, centerX, centerY) {
    const wrapper = document.getElementById('wrapper-punti');
    if (!wrapper) return;
    const prev = mapZoom;
    mapZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
    if (Math.abs(mapZoom - prev) < 0.001) {
        applyMapTransform();
        return;
    }
    const rect = wrapper.getBoundingClientRect();
    const cx = centerX != null ? centerX : rect.width / 2;
    const cy = centerY != null ? centerY : rect.height / 2;
    const mapX = (cx - mapPanX) / prev;
    const mapY = (cy - mapPanY) / prev;
    mapPanX = cx - mapX * mapZoom;
    mapPanY = cy - mapY * mapZoom;
    applyMapTransform();
}

function initPuntiGrid() {
    const layer = document.getElementById('punti-grid-layer');
    if (!layer || layer.children.length > 0) return;
    // Solo linee griglia, senza lettere/numeri nei quadranti
    for (let r = 0; r < 11; r++) {
        for (let c = 1; c <= 11; c++) {
            const cell = document.createElement('div');
            cell.className = 'punti-grid-cell';
            layer.appendChild(cell);
        }
    }
}

function getQuadranteCenter(quadrante) {
    const q = (quadrante || "").toUpperCase().trim();
    const match = q.match(/^([A-K])(\d{1,2})$/);
    if (!match) return { x: 50, y: 50 };
    const row = match[1].charCodeAt(0) - 65;
    const col = parseInt(match[2], 10) - 1;
    if (row < 0 || row > 10 || col < 0 || col > 10) return { x: 50, y: 50 };
    const cell = 100 / 11;
    return { x: col * cell + cell / 2, y: row * cell + cell / 2 };
}

function getPuntoPercent(p) {
    let x = p.x, y = p.y;
    if (x == null || y == null || isNaN(x) || isNaN(y)) {
        const c = getQuadranteCenter(p.quadrante);
        x = c.x; y = c.y;
    }
    return { x: Number(x), y: Number(y) };
}

/** % mappa (0–100) → pixel sullo schermo (zoom + pan), arrotondati */
function mapPercentToScreen(pctX, pctY) {
    const mapX = (pctX / 100) * MAP_SIZE;
    const mapY = (pctY / 100) * MAP_SIZE;
    return {
        x: Math.round(mapX * mapZoom + mapPanX),
        y: Math.round(mapY * mapZoom + mapPanY)
    };
}

function positionPuntiBlips() {
    const layer = document.getElementById('punti-blips-layer');
    if (!layer) return;
    layer.querySelectorAll('.blip-marker').forEach(div => {
        const pctX = parseFloat(div.dataset.pctX);
        const pctY = parseFloat(div.dataset.pctY);
        if (isNaN(pctX) || isNaN(pctY)) return;
        const pos = mapPercentToScreen(pctX, pctY);
        div.style.left = pos.x + 'px';
        div.style.top = pos.y + 'px';
    });
}

function renderPuntiBlips() {
    const layer = document.getElementById('punti-blips-layer');
    if (!layer) return;
    layer.innerHTML = '';
    puntiCache.forEach(p => {
        const { x, y } = getPuntoPercent(p);
        const ownedClass = p.owned ? 'owned' : 'missing';
        const div = document.createElement('div');
        div.className = `blip-marker ${ownedClass}`;
        div.dataset.id = p.id;
        div.dataset.pctX = String(x);
        div.dataset.pctY = String(y);
        const pos = mapPercentToScreen(x, y);
        div.style.left = pos.x + 'px';
        div.style.top = pos.y + 'px';
        div.innerHTML = `
            <div class="blip-icon"></div>
            <div class="blip-label">${p.nome || 'Punto'} (${p.quadrante || '?'})</div>
        `;
        div.addEventListener('click', (e) => {
            e.stopPropagation();
            togglePuntoOwned(p.id);
        });
        layer.appendChild(div);
    });
}

function renderPuntiLista() {
    const box = document.getElementById('punti-lista');
    const stats = document.getElementById('punti-stats');
    if (!box) return;
    if (puntiCache.length === 0) {
        box.innerHTML = '<p class="punti-empty">Nessun punto ancora. Aggiungine uno!</p>';
        if (stats) stats.innerHTML = '';
        return;
    }
    const owned = puntiCache.filter(p => p.owned).length;
    const missing = puntiCache.length - owned;
    if (stats) stats.innerHTML = `<b>${owned}</b> posseduti · <b>${missing}</b> mancanti · Tot. <b>${puntiCache.length}</b>`;

    box.innerHTML = puntiCache
        .slice()
        .sort((a, b) => (a.quadrante || '').localeCompare(b.quadrante || '') || (a.nome || '').localeCompare(b.nome || ''))
        .map(p => {
            const cls = p.owned ? 'owned' : 'missing';
            const stato = p.owned ? '✅ Posseduto' : '❌ Mancante';
            return `
            <div class="punto-item ${cls}" data-id="${p.id}">
                <div class="punto-item-header">
                    <span class="punto-item-name" title="${p.nome || ''}">${p.nome || 'Senza nome'}</span>
                    <div class="punto-item-actions">
                        <button class="btn-toggle-owned" data-id="${p.id}" title="Cambia stato">${p.owned ? '−' : '+'}</button>
                        <button class="btn-edit-punto" data-id="${p.id}" title="Modifica">✏️</button>
                        <button class="btn-del-punto" data-id="${p.id}" title="Elimina">🗑️</button>
                    </div>
                </div>
                <div class="punto-item-meta">${p.quadrante || '—'} · ${stato}</div>
            </div>`;
        }).join('');
}

function resetPuntoForm() {
    editingPuntoId = null;
    const nome = document.getElementById('punto-nome');
    const quad = document.getElementById('punto-quadrante');
    const owned = document.getElementById('punto-owned');
    const px = document.getElementById('punto-x');
    const py = document.getElementById('punto-y');
    const hint = document.getElementById('punto-pos-hint');
    const btn = document.getElementById('btn-salva-punto');
    const annulla = document.getElementById('btn-annulla-punto');
    if (nome) nome.value = '';
    if (quad) quad.value = '';
    if (owned) owned.checked = false;
    if (px) px.value = '';
    if (py) py.value = '';
    if (hint) hint.textContent = 'Posizione blip: clicca sulla mappa (opzionale)';
    if (btn) btn.textContent = 'Aggiungi Punto';
    if (annulla) annulla.style.display = 'none';
}

async function togglePuntoOwned(id) {
    const p = puntiCache.find(x => x.id === id);
    if (!p || (!currentUser && !auth.currentUser)) return;
    try {
        await updateDoc(doc(db, "punti_conquista", id), { owned: !p.owned });
        logActivity(`📍 Punto <b>${p.nome}</b> (${p.quadrante}) marcato come ${!p.owned ? 'posseduto' : 'mancante'}.`);
        showToast(!p.owned ? "Punto segnato come posseduto." : "Punto segnato come mancante.", "success");
    } catch (e) { console.error(e); showToast("Errore aggiornamento.", "error"); }
}

function avviaAscoltoPunti() {
    initPuntiGrid();
    applyMapTransform();
    onSnapshot(collection(db, "punti_conquista"), (snapshot) => {
        puntiCache = [];
        snapshot.forEach(docSnap => {
            puntiCache.push({ id: docSnap.id, ...docSnap.data() });
        });
        renderPuntiBlips();
        renderPuntiLista();
    });
}

// Coordinate click tenendo conto di zoom e pan
function mapClickToPercent(clientX, clientY) {
    const wrapper = document.getElementById('wrapper-punti');
    if (!wrapper) return { x: 50, y: 50 };
    const rect = wrapper.getBoundingClientRect();
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;
    // Inverso di translate + scale
    const mapX = (localX - mapPanX) / mapZoom;
    const mapY = (localY - mapPanY) / mapZoom;
    const x = (mapX / rect.width) * 100 * mapZoom / mapZoom; // mapX is in unscaled px relative to 900
    // mapX is in the coordinate system of the unscaled inner (0..width)
    const pctX = (mapX / 900) * 100;
    const pctY = (mapY / 900) * 100;
    return {
        x: Math.max(0, Math.min(100, pctX)),
        y: Math.max(0, Math.min(100, pctY))
    };
}

// Click per posizionare blip (solo se non stiamo pannando)
let didPan = false;
document.getElementById('punti-click-overlay')?.addEventListener('click', (e) => {
    if (didPan) { didPan = false; return; }
    const pos = mapClickToPercent(e.clientX, e.clientY);
    document.getElementById('punto-x').value = pos.x.toFixed(2);
    document.getElementById('punto-y').value = pos.y.toFixed(2);
    const hint = document.getElementById('punto-pos-hint');
    if (hint) hint.textContent = `Blip impostato: ${pos.x.toFixed(1)}% , ${pos.y.toFixed(1)}%`;
    showToast("Posizione blip impostata.", "info");
});

// Zoom buttons
document.getElementById('btn-zoom-in')?.addEventListener('click', () => setMapZoom(mapZoom + ZOOM_STEP));
document.getElementById('btn-zoom-out')?.addEventListener('click', () => setMapZoom(mapZoom - ZOOM_STEP));
document.getElementById('btn-zoom-reset')?.addEventListener('click', () => {
    mapZoom = 1; mapPanX = 0; mapPanY = 0; applyMapTransform();
});

// Rotella mouse
document.getElementById('wrapper-punti')?.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const delta = e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
    setMapZoom(mapZoom + delta, cx, cy);
}, { passive: false });

// Drag per pan
document.getElementById('wrapper-punti')?.addEventListener('mousedown', (e) => {
    // Solo tasto sinistro, e non su un blip
    if (e.button !== 0) return;
    if (e.target.closest('.blip-marker')) return;
    isPanning = true;
    didPan = false;
    panStartX = e.clientX;
    panStartY = e.clientY;
    panOriginX = mapPanX;
    panOriginY = mapPanY;
});
window.addEventListener('mousemove', (e) => {
    if (!isPanning) return;
    const dx = e.clientX - panStartX;
    const dy = e.clientY - panStartY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) didPan = true;
    mapPanX = panOriginX + dx;
    mapPanY = panOriginY + dy;
    applyMapTransform();
});
window.addEventListener('mouseup', () => { isPanning = false; });

document.getElementById('btn-salva-punto')?.addEventListener('click', async () => {
    if (!currentUser && !auth.currentUser) return showToast("Devi essere autenticato.", "error");
    const nome = (document.getElementById('punto-nome')?.value || '').trim();
    const quadrante = (document.getElementById('punto-quadrante')?.value || '').trim().toUpperCase();
    const owned = !!document.getElementById('punto-owned')?.checked;
    let x = document.getElementById('punto-x')?.value;
    let y = document.getElementById('punto-y')?.value;
    x = x !== '' && x != null ? parseFloat(x) : null;
    y = y !== '' && y != null ? parseFloat(y) : null;

    if (!nome) return showToast("Inserisci il nome del punto.", "error");
    if (quadrante && !/^[A-K]\d{1,2}$/i.test(quadrante)) {
        return showToast("Quadrante non valido (es. A1, C4, K11).", "error");
    }

    const data = { nome, quadrante: quadrante || '', owned, timestamp: new Date() };
    if (x != null && y != null && !isNaN(x) && !isNaN(y)) {
        data.x = x;
        data.y = y;
    }

    try {
        if (editingPuntoId) {
            await updateDoc(doc(db, "punti_conquista", editingPuntoId), data);
            logActivity(`📍 Punto <b>${nome}</b> aggiornato.`);
            showToast("Punto aggiornato.", "success");
        } else {
            await addDoc(collection(db, "punti_conquista"), data);
            logActivity(`📍 Nuovo punto conquista: <b>${nome}</b> (${quadrante || 'n/d'}) – ${owned ? 'posseduto' : 'mancante'}.`);
            showToast("Punto aggiunto!", "success");
        }
        resetPuntoForm();
    } catch (e) {
        console.error(e);
        showToast("Errore durante il salvataggio.", "error");
    }
});

document.getElementById('btn-annulla-punto')?.addEventListener('click', () => {
    resetPuntoForm();
});

document.getElementById('punti-lista')?.addEventListener('click', async (e) => {
    const toggleId = e.target.closest('.btn-toggle-owned')?.getAttribute('data-id');
    const editId = e.target.closest('.btn-edit-punto')?.getAttribute('data-id');
    const delId = e.target.closest('.btn-del-punto')?.getAttribute('data-id');

    if (toggleId) {
        await togglePuntoOwned(toggleId);
        return;
    }
    if (editId) {
        const p = puntiCache.find(x => x.id === editId);
        if (!p) return;
        editingPuntoId = editId;
        document.getElementById('punto-nome').value = p.nome || '';
        document.getElementById('punto-quadrante').value = p.quadrante || '';
        document.getElementById('punto-owned').checked = !!p.owned;
        document.getElementById('punto-x').value = p.x != null ? p.x : '';
        document.getElementById('punto-y').value = p.y != null ? p.y : '';
        const hint = document.getElementById('punto-pos-hint');
        if (hint) {
            hint.textContent = p.x != null
                ? `Blip attuale: ${Number(p.x).toFixed(1)}% , ${Number(p.y).toFixed(1)}%`
                : 'Posizione blip: clicca sulla mappa (opzionale)';
        }
        document.getElementById('btn-salva-punto').textContent = 'Salva modifiche';
        const annulla = document.getElementById('btn-annulla-punto');
        if (annulla) annulla.style.display = '';
        showToast("Modifica e premi Salva.", "info");
        return;
    }
    if (delId) {
        const p = puntiCache.find(x => x.id === delId);
        showConfirmModal("Elimina punto", `Vuoi eliminare il punto "${p?.nome || delId}"?`, async () => {
            await deleteDoc(doc(db, "punti_conquista", delId));
            logActivity(`🗑️ Punto conquista <b>${p?.nome || delId}</b> eliminato.`);
            showToast("Punto eliminato.", "success");
            if (editingPuntoId === delId) resetPuntoForm();
        });
    }
});


// GENERAZIONE UI DATABASE RISORSE E ANELLI A GRIGLIA
const materiali = [ { id: 'mat_oro', nome: 'Oro' }, { id: 'mat_rame', nome: 'Rame' }, { id: 'mat_cotone', nome: 'Cotone' },  { id: 'mat_dmt', nome: 'DMT' }, { id: 'mat_zolfo', nome: 'Zolfo' }, { id: 'mat_grafite', nome: 'Grafite' }, { id: 'mat_carbone', nome: 'Carbone' }, { id: 'mat_cromo', nome: 'Cromo' }, { id: 'mat_salnitro', nome: 'Salnitro' }, { id: 'mat_magnete', nome: 'Magnete' }, { id: 'mat_piombo', nome: 'Piombo' }, { id: 'mat_tabacco', nome: 'Tabacco' }, { id: 'mat_azoto', nome: 'Azoto' }, { id: 'mat_marijuana', nome: 'Marijuana' } ];
const mercanti = [ { id: 'mer_rame', nome: 'Rame' }, { id: 'mer_piombo', nome: 'Piombo' }, { id: 'mer_carbone', nome: 'Carbone' }, { id: 'mer_pile', nome: 'Pile' }, { id: 'mer_cartine', nome: 'Cartine' }, { id: 'mer_grafite', nome: 'Grafite' }, { id: 'mer_tessuto', nome: 'Tessuto' }, { id: 'mer_vetro', nome: 'Vetro' }, { id: 'mer_alcool', nome: 'Alcool' }, { id: 'mer_elettrici', nome: 'Elettrici' } ];
const altari = [ { id: 'alt_motel', nome: 'Altare Motel' }, { id: 'alt_rovine', nome: 'Altare Rovine' }, { id: 'alt_antenne', nome: 'Altare Antenne' },];

function creaCardRisorsa(item, tipo) {
    const div = document.createElement('div');
    div.className = 'resource-card';
    const icon = tipo === 'mat' ? '⛏️' : (tipo === 'mer' ? '💰' : '🔮');
    div.innerHTML = `
        <div class="res-card-header">
            <span class="res-icon">${icon}</span>
            <span class="res-title">${item.nome}</span>
        </div>
        <input type="text" id="quad_${item.id}" class="res-input" placeholder="Quadrante (es. B4)">
    `;
    return div;
}

function creaCardAnello(fazione) {
    const div = document.createElement('div');
    div.className = 'resource-card';
    div.innerHTML = `
        <div class="res-card-header">
            <span class="res-icon" style="text-shadow: 0 0 10px rgba(255,255,255,0.5);">💍</span>
            <span class="res-title" style="color: ${fazione.color};">${fazione.name}</span>
        </div>
        <input type="number" id="anelli_${fazione.id}" class="res-input" placeholder="Q.tà" value="0">
    `;
    return div;
}

materiali.forEach(m => document.getElementById('grid-materiali').appendChild(creaCardRisorsa(m, 'mat')));
mercanti.forEach(m => document.getElementById('grid-mercanti').appendChild(creaCardRisorsa(m, 'mer')));
altari.forEach(a => document.getElementById('grid-altari').appendChild(creaCardRisorsa(a, 'alt')));

fazioniDef.forEach(f => {
    if(f.id !== 'nessuno') document.getElementById('grid-anelli').appendChild(creaCardAnello(f));
});

document.getElementById('btn-salva-risorse').addEventListener('click', async () => {
    if (!currentUser && !auth.currentUser) {
        showToast("Azione negata. Utente non autenticato.", "error");
        return;
    }
    const tutti = [...materiali.map(m => ({...m, tipo: 'mat'})), ...mercanti.map(m => ({...m, tipo: 'mer'})), ...altari.map(a => ({...a, tipo: 'alt'}))];
    
    try {
        // Salva Materiali, Mercanti e Altari
        for (let i of tutti) {
            const val = document.getElementById(`quad_${i.id}`).value.trim();
            await setDoc(doc(db, "punti_interesse", i.id), { nome: i.nome, quadrante: val, type: i.tipo });
        }

        // Salva Anelli
        const anelliDaSalvare = {};
        fazioniDef.forEach(f => {
            if (f.id !== 'nessuno') {
                const val = parseInt(document.getElementById(`anelli_${f.id}`).value) || 0;
                anelliDaSalvare[f.id] = val;
            }
        });
        await setDoc(doc(db, "sistema", "anelli"), anelliDaSalvare, { merge: true });

        logActivity(`🗄️ Il Database Generale (Punti e Anelli) è stato sincronizzato.`);
        showToast("Database Sincronizzato con successo!", "success");
    } catch (error) {
        showToast("Errore durante la sincronizzazione.", "error");
        console.error(error);
    }
});