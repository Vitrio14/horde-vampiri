// ==========================================
// LOGICA DELLO STATO DI MANUTENZIONE
// ==========================================
(function() {
    const manutenzioneDiv = document.getElementById('schermata-manutenzione');
    
    function controllaStatoManutenzione() {
        // Carica il file status.txt dal server evitando la cache del browser
        fetch('status.txt?t=' + new Date().getTime())
            .then(response => {
                if (!response.ok) throw new Error('File status non trovato');
                return response.text();
            })
            .then(stato => {
                const statoPulito = stato.trim().toLowerCase();
                
                if (statoPulito === 'on') {
                    manutenzioneDiv.style.display = 'flex'; // Attiva la schermata per tutti
                } else {
                    manutenzioneDiv.style.display = 'none'; // Nasconde la schermata
                }
            })
            .catch(err => {
                console.log('Errore controllo manutenzione:', err);
            });
    }

    // Controllo iniziale immediato
    controllaStatoManutenzione();

    // Controllo automatico ogni 5 secondi
    setInterval(controllaStatoManutenzione, 5000);
})();


// ==========================================
// CONFIGURAZIONE E LOGICA PRINCIPALE FIREBASE
// ==========================================

// CONFIGURAZIONE FIREBASE - Incolla qui le tue chiavi del progetto
const firebaseConfig = {
  apiKey: "AIzaSyCc0vz3ZSC6zNqsdP5IGYCMJckeycvABX8",
  authDomain: "bg-vampiri.firebaseapp.com",
  projectId: "bg-vampiri",
  storageBucket: "bg-vampiri.firebasestorage.app",
  messagingSenderId: "618361142168",
  appId: "1:618361142168:web:a81ad9d4a530c33c6fc9ed",
  measurementId: "G-EMHJW2WKJ5"
};

// Inizializzazione Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

const GM_EMAIL = 'gm.vampiri@horde.it';
let deviceToken = '';
let gmSnapshotUnsubscribe = null;

// Riferimenti elementi del DOM
const loadingPanel = document.getElementById('loadingPanel');
const bgFormPanel = document.getElementById('bgFormPanel');
const bgLockedPanel = document.getElementById('bgLockedPanel');
const gmAuthPanel = document.getElementById('gmAuthPanel');
const gmDashboardPanel = document.getElementById('gmDashboardPanel');

const userStatusContainer = document.getElementById('userStatusContainer');
const lockedStatusBanner = document.getElementById('lockedStatusBanner');
const lockedContentPreview = document.getElementById('lockedContentPreview');
const btnTogglePlayerPreview = document.getElementById('btnTogglePlayerPreview');
const gmListContainer = document.getElementById('gmListContainer');
const bgForm = document.getElementById('bgForm');

// ELEMENTI DEL POP-UP CUSTOM
const customPopup = document.getElementById('customPopup');
const popupTitle = document.getElementById('popupTitle');
const popupMessage = document.getElementById('popupMessage');
const btnPopupClose = document.getElementById('btnPopupClose');
let currentPopupCallback = null;

// FUNZIONE PER INVIARE WEBHOOK A DISCORD (AGGIORNATA PER SUPPORTARE IL TAG ESTERNO ALL'EMBED)
function sendDiscordWebhook(url, contentText, embedTitle, embedDescription, embedColor, embedFields) {
    const payload = {
        content: contentText,
        embeds: [{
            author: {
                name: "Arpie",
                icon_url: "https://i.postimg.cc/VLKZxsKd/Logo-vampiri-Modificata.png"
            },
            title: embedTitle,
            description: embedDescription,
            color: embedColor,
            fields: embedFields,
            image: {
                url: "https://i.postimg.cc/13TCzChX/Banner.png"
            },
            footer: {
                text: "Le arpie",
                icon_url: "https://i.postimg.cc/VLKZxsKd/Logo-vampiri-Modificata.png"
            },
            timestamp: new Date().toISOString()
        }]
    };

    fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
    }).catch(err => console.error("Errore Invio Webhook Discord:", err));
}

// Webhook per invio file scaricabili (PDF / TXT / DOCX) generati dal GM
// Usa lo stesso canale delle notifiche nuovo background; cambia l'URL se serve un canale dedicato
const WEBHOOK_DOWNLOAD = "https://discord.com/api/webhooks/1556447932125810698/aZwlTl_Q0m6h0xFrldpbhjj78MvMzGzudlbLb7WW91a7RJraGLa7_laXG1F4EYdchtOY";

// Invia un file (Blob) via webhook Discord
function sendFileToDiscordWebhook(fileBlob, fileName, contentText, embedTitle, embedDescription, embedColor, embedFields) {
    const formData = new FormData();
    const payload = {
        content: contentText,
        embeds: [{
            author: {
                name: "Arpie",
                icon_url: "https://i.postimg.cc/VLKZxsKd/Logo-vampiri-Modificata.png"
            },
            title: embedTitle,
            description: embedDescription,
            color: embedColor,
            fields: embedFields || [],
            footer: {
                text: "Le arpie • Download Background",
                icon_url: "https://i.postimg.cc/VLKZxsKd/Logo-vampiri-Modificata.png"
            },
            timestamp: new Date().toISOString()
        }]
    };
    formData.append('payload_json', JSON.stringify(payload));
    formData.append('files[0]', fileBlob, fileName);
    return fetch(WEBHOOK_DOWNLOAD, {
        method: 'POST',
        body: formData
    }).catch(err => {
        console.error("Errore Invio File Webhook Discord:", err);
        throw err;
    });
}

// FUNZIONE PER EMETTERE NOTIFICHE / POP-UP CUSTOM
function triggerChronicaAlert(title, message, callback = null) {
    popupTitle.innerText = title;
    popupMessage.innerText = message;
    currentPopupCallback = callback;
    customPopup.classList.add('active');
}

btnPopupClose.addEventListener('click', () => {
    customPopup.classList.remove('active');
    if (currentPopupCallback) {
        currentPopupCallback();
        currentPopupCallback = null;
    }
});

// Gestione espansione e collasso visivo del background lato giocatore
btnTogglePlayerPreview.addEventListener('click', () => {
    if (lockedContentPreview.classList.contains('hidden')) {
        lockedContentPreview.classList.remove('hidden');
        btnTogglePlayerPreview.innerText = 'Nascondi Background';
    } else {
        lockedContentPreview.classList.add('hidden');
        btnTogglePlayerPreview.innerText = 'Visualizza Background';
    }
});

// AGGIUNTA EVENTO INVIO TRAMITE TASTO INVIO PER IL LOGIN GM
document.getElementById('gmPassword').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        document.getElementById('btnLoginGM').click();
    }
});

// GESTIONE IDENTIFICAZIONE HARDWARE / BROWSER SENZA LOGIN UTENTE
function initDeviceIdentification() {
    let token = localStorage.getItem('sanguis_device_uid');
    if (!token) {
        token = 'vmp_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36) + Math.random().toString(36).substring(2, 15);
        localStorage.setItem('sanguis_device_uid', token);
    }
    deviceToken = token;
}

// Controllo dello stato iniziale della pagina e sessioni persistenti GM
auth.onAuthStateChanged(user => {
    if (user && user.email === GM_EMAIL) {
        switchPanel(gmDashboardPanel);
        loadGmDashboard();
    } else {
        if (gmSnapshotUnsubscribe) {
            gmSnapshotUnsubscribe();
            gmSnapshotUnsubscribe = null;
        }
        initDeviceIdentification();
        checkBackgroundStatus();
    }
});

// Controlla se questo specifico PC ha già salvato un documento su Firestore
function checkBackgroundStatus() {
    switchPanel(loadingPanel);
    
    if (!deviceToken) {
        initDeviceIdentification();
    }

    db.collection('backgrounds').doc(deviceToken).get().then(doc => {
        if (doc.exists) {
            const data = doc.data();
            handlePlayerBackgroundState(data);
        } else {
            userStatusContainer.classList.add('hidden');
            switchPanel(bgFormPanel);
            bgForm.reset();
        }
    }).catch(error => {
        console.error("Errore allineamento database: ", error);
        switchPanel(bgFormPanel);
    });
}

// Gestione Visibilità Schermate
function switchPanel(targetPanel) {
    loadingPanel.classList.add('hidden');
    bgFormPanel.classList.add('hidden');
    bgLockedPanel.classList.add('hidden');
    gmAuthPanel.classList.add('hidden');
    gmDashboardPanel.classList.add('hidden');

    targetPanel.classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// NAVIGAZIONE INTERFACCIA INTERNA PORTALE GM
document.getElementById('btnGoToLoginGM').addEventListener('click', () => switchPanel(gmAuthPanel));
document.getElementById('btnGoToLoginGM2').addEventListener('click', () => switchPanel(gmAuthPanel));
document.getElementById('btnBackToPlayer').addEventListener('click', () => checkBackgroundStatus());

// ELABORAZIONE AUTOMATICA DEGLI STATI PER IL GIOCATORE CORRENTE
function handlePlayerBackgroundState(data) {
    const dataInvio = data.submittedAt ? data.submittedAt.toDate().toLocaleString('it-IT') : 'Data non registrata';
    const gmNameMod = data.reviewedBy ? ` (da ${data.reviewedBy})` : '';
    const gmNameNote = data.reviewedBy ? ` (${data.reviewedBy})` : '';
    
    if (data.status === 'da_revisionare' || data.status === 'approvato') {
        let bannerHTML = '';
        if(data.status === 'da_revisionare') {
            bannerHTML = `<div class="status-banner status-da_revisionare">Inviato il ${dataInvio} — IN FASE DI REVISIONE</div>`;
        } else {
            bannerHTML = `<div class="status-banner status-approvato">Inviato il ${dataInvio} — BACKGROUND APPROVATO${gmNameMod}</div>`;
        }
        
        lockedStatusBanner.innerHTML = bannerHTML;
        renderPreview(data, lockedContentPreview);
        
        // Reset visualizzazione iniziale (chiusa per impostazione predefinita)
        lockedContentPreview.classList.add('hidden');
        btnTogglePlayerPreview.innerText = 'Visualizza Background';
        
        switchPanel(bgLockedPanel);

    } else if (data.status === 'da_modificare') {
        userStatusContainer.classList.remove('hidden');
        userStatusContainer.innerHTML = `
            <div class="status-banner status-da_modificare">Richiesta di Modifica necessaria${gmNameMod}</div>
            <div class="feedback-box"><strong>Nota del Game Master${gmNameNote} da risolvere:</strong> ${data.feedback || 'Rivedi i campi compilati.'}</div>
            <br>
        `;
        populateFormFields(data);
        switchPanel(bgFormPanel);
    }
}

function populateFormFields(data) {
    document.getElementById('discordUser').value = data.discordUser || '';
    document.getElementById('charName').value = data.name || '';
    document.getElementById('shadowName').value = data.shadowName || '';
    document.getElementById('history').value = data.history || '';
    document.getElementById('events').value = data.events || '';
    document.getElementById('arrival').value = data.arrival || '';
    document.getElementById('bonds').value = data.bonds || '';
    document.getElementById('character').value = data.character || '';
    document.getElementById('objectives').value = data.objectives || '';
    document.getElementById('fears').value = data.fears || '';
}

// COSTRUZIONE DI PREVIEW STRUTTURATA IN BOX VOCE PER VOCE
function renderPreview(data, targetElement) {
    targetElement.innerHTML = `
        <div class="voice-box"><strong>Nome Utente Discord</strong><p>${data.discordUser || 'Non specificato'}</p></div>
        <div class="voice-box"><strong>Nome Personaggio</strong><p>${data.name}</p></div>
        <div class="voice-box"><strong>Nome Ombra</strong><p>${data.shadowName}</p></div>
        <div class="voice-box"><strong>Storia del Personaggio (Il Passato)</strong><p>${data.history}</p></div>
        <div class="voice-box"><strong>Eventi Significativi</strong><p>${data.events}</p></div>
        <div class="voice-box"><strong>Arrivo sull'Isola</strong><p>${data.arrival}</p></div>
        <div class="voice-box"><strong>Legami</strong><p>${data.bonds}</p></div>
        <div class="voice-box"><strong>Carattere</strong><p>${data.character}</p></div>
        <div class="voice-box"><strong>Obiettivi</strong><p>${data.objectives}</p></div>
        <div class="voice-box"><strong>Paure</strong><p>${data.fears}</p></div>
    `;
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

// SALVATAGGIO E INVIO DEFINITIVO BACKGROUND LEGATO AL DISPOSITIVO
bgForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!deviceToken) return;

    document.getElementById('btnSubmitBg').disabled = true;

    const finalPayload = {
        deviceId: deviceToken,
        discordUser: document.getElementById('discordUser').value.trim(),
        name: document.getElementById('charName').value.trim(),
        shadowName: document.getElementById('shadowName').value.trim(),
        history: document.getElementById('history').value.trim(),
        events: document.getElementById('events').value.trim(),
        arrival: document.getElementById('arrival').value.trim(),
        bonds: document.getElementById('bonds').value.trim(),
        character: document.getElementById('character').value.trim(),
        objectives: document.getElementById('objectives').value.trim(),
        fears: document.getElementById('fears').value.trim(),
        status: 'da_revisionare',
        submittedAt: firebase.firestore.FieldValue.serverTimestamp(),
        feedback: '',
        reviewedBy: null
    };

    db.collection('backgrounds').doc(deviceToken).set(finalPayload)
        .then(() => {
            
            // WEBHOOK INVIO BACKGROUND (Ora con tag ruolo GM all'esterno dell'embed)
            sendDiscordWebhook(
                "https://discord.com/api/webhooks/1525137419567890635/48cnj0-0COKJ5EEjkKuMHba0KIGlghz8O4G0D8mLND-mhEjINUa3BMBexxQoVKpwLPMY",
                "<@&1284193565194326189>", // Tag ruolo GM fuori dall'embed
                "Horde V5 | Nuovo Background Ricevuto",
                "È stato inviato un nuovo background in attesa di revisione da parte di un GM, collegati al seguente link: https://horde-vampiri.vitriotv.com/bg/.",
                0x8b0000, 
                [
                    { name: "👤 Discord User", value: finalPayload.discordUser, inline: true },
                    { name: "🦇 Nome Personaggio", value: finalPayload.name, inline: true },
                    { name: "🌑 Nome Ombra", value: finalPayload.shadowName, inline: true }
                ]
            );

            triggerChronicaAlert('Background inviato', 'Il tuo background è stato inviato con successo.', () => {
                checkBackgroundStatus();
            });
        })
        .catch(error => {
            triggerChronicaAlert('Errore', 'Qualcosa è andato storto: ' + error.message);
            document.getElementById('btnSubmitBg').disabled = false;
        });
});

// FLUSSO ACCESSO RISERVATO AL GENERAL MASTER
document.getElementById('btnLoginGM').addEventListener('click', () => {
    const password = document.getElementById('gmPassword').value;

    if (!password) {
        triggerChronicaAlert('Accesso negato', 'Inserisci la password di accesso.');
        return;
    }

    switchPanel(loadingPanel);

    auth.signInWithEmailAndPassword(GM_EMAIL, password)
        .then(() => {
            document.getElementById('gmPassword').value = '';
        })
        .catch(error => {
            triggerChronicaAlert('Respinto', 'Le arpie respingono il tuo potere: ' + error.message);
            switchPanel(gmAuthPanel);
        });
});

document.getElementById('btnLogOutAction').addEventListener('click', () => {
    auth.signOut();
});

// ==========================================
// DASHBOARD GM — TAB + VISTA DETTAGLIO
// ==========================================
let allBackgroundsCache = [];
let currentGmTab = 'da_revisionare';
let currentDetailDocId = null;

const gmListView = document.getElementById('gmListView');
const gmDetailView = document.getElementById('gmDetailView');
const gmDetailContent = document.getElementById('gmDetailContent');

// Tab click handlers
document.querySelectorAll('.gm-tab').forEach(tabBtn => {
    tabBtn.addEventListener('click', () => {
        document.querySelectorAll('.gm-tab').forEach(t => t.classList.remove('active'));
        tabBtn.classList.add('active');
        currentGmTab = tabBtn.getAttribute('data-tab');
        renderGmList();
    });
});

// Torna alla lista dalla vista dettaglio
document.getElementById('btnBackToList').addEventListener('click', () => {
    showGmListView();
});

function showGmListView() {
    gmDetailView.classList.add('hidden');
    gmListView.classList.remove('hidden');
    currentDetailDocId = null;
}

function showGmDetailView() {
    gmListView.classList.add('hidden');
    gmDetailView.classList.remove('hidden');
}

// CARICAMENTO IN DIRETTA DEI BACKGROUND RICEVUTI
function loadGmDashboard() {
    if (gmSnapshotUnsubscribe) gmSnapshotUnsubscribe();

    showGmListView();
    currentGmTab = 'da_revisionare';
    document.querySelectorAll('.gm-tab').forEach(t => t.classList.remove('active'));
    document.getElementById('tabDaRevisionare').classList.add('active');

    gmSnapshotUnsubscribe = db.collection('backgrounds').orderBy('submittedAt', 'desc').onSnapshot(snapshot => {
        allBackgroundsCache = [];
        snapshot.forEach(doc => {
            allBackgroundsCache.push({ id: doc.id, ...doc.data() });
        });
        updateTabCounts();
        renderGmList();

        if (currentDetailDocId) {
            const stillExists = allBackgroundsCache.find(b => b.id === currentDetailDocId);
            if (stillExists) {
                openGmDetail(currentDetailDocId);
            } else {
                showGmListView();
            }
        }
    }, error => {
        console.error("Errore di caricamento dati GM: ", error);
    });
}

function updateTabCounts() {
    const countRev = allBackgroundsCache.filter(b => b.status === 'da_revisionare').length;
    const countMod = allBackgroundsCache.filter(b => b.status === 'da_modificare').length;
    const countApp = allBackgroundsCache.filter(b => b.status === 'approvato').length;

    document.getElementById('countDaRevisionare').innerText = countRev;
    document.getElementById('countDaModificare').innerText = countMod;
    document.getElementById('countApprovati').innerText = countApp;
}

function renderGmList() {
    gmListContainer.innerHTML = '';

    const filtered = allBackgroundsCache.filter(b => b.status === currentGmTab);

    if (filtered.length === 0) {
        let emptyMsg = 'Nessun background in questa sezione.';
        if (currentGmTab === 'da_revisionare') emptyMsg = 'Nessun background in attesa di revisione.';
        if (currentGmTab === 'da_modificare') emptyMsg = 'Nessun background con richieste di modifica.';
        if (currentGmTab === 'approvato') emptyMsg = 'Nessun background approvato.';
        gmListContainer.innerHTML = '<p style="color: var(--text-dim); text-align:center; padding: 20px;">' + emptyMsg + '</p>';
        return;
    }

    filtered.forEach(data => {
        const docId = data.id;
        const dataInvio = data.submittedAt ? data.submittedAt.toDate().toLocaleString('it-IT') : 'Data Sconosciuta';
        const userDiscord = data.discordUser || 'N/A';
        const reviewerText = data.reviewedBy ? ' — Gestito da: <strong>' + data.reviewedBy + '</strong>' : '';

        let statusBadge = '';
        if (data.status === 'approvato') statusBadge = '<span style="color:var(--success-green);">[APPROVATO]</span>';
        if (data.status === 'da_revisionare') statusBadge = '<span style="color:var(--gold-accent);">[DA REVISIONARE]</span>';
        if (data.status === 'da_modificare') statusBadge = '<span style="color:var(--withdraw-red);">[DA MODIFICARE]</span>';

        const bgItem = document.createElement('div');
        bgItem.className = 'bg-item';
        bgItem.setAttribute('id', 'item_' + docId);
        bgItem.setAttribute('data-discord', userDiscord);
        bgItem.setAttribute('data-char', data.name || '');

        const charLabel = (data.name || 'Senza nome') + ' (Ombra: ' + (data.shadowName || '-') + ') ' + statusBadge;
        bgItem.innerHTML =
            '<div class="bg-item-header">' +
                '<div class="bg-item-info">' +
                    '<h3>' + charLabel + '</h3>' +
                    '<div class="bg-meta">Discord: <strong>' + userDiscord + '</strong> — Ricevuto il: ' + dataInvio + reviewerText + '</div>' +
                '</div>' +
                '<button class="btn" onclick="openGmDetail(\'' + docId + '\')" style="width: auto; padding: 10px 24px; font-size: 0.75rem;">Visualizza</button>' +
            '</div>';
        gmListContainer.appendChild(bgItem);
    });
}

// Apre la vista dettaglio a pagina intera
window.openGmDetail = function(docId) {
    const data = allBackgroundsCache.find(b => b.id === docId);
    if (!data) return;

    currentDetailDocId = docId;
    const dataInvio = data.submittedAt ? data.submittedAt.toDate().toLocaleString('it-IT') : 'Data Sconosciuta';
    const userDiscord = data.discordUser || 'N/A';

    let bannerHTML = '';
    if (data.status === 'da_revisionare') {
        bannerHTML = '<div class="status-banner status-da_revisionare">Inviato il ' + dataInvio + ' — IN FASE DI REVISIONE</div>';
    } else if (data.status === 'approvato') {
        bannerHTML = '<div class="status-banner status-approvato">Inviato il ' + dataInvio + ' — BACKGROUND APPROVATO' + (data.reviewedBy ? ' (da ' + data.reviewedBy + ')' : '') + '</div>';
    } else if (data.status === 'da_modificare') {
        bannerHTML = '<div class="status-banner status-da_modificare">Richiesta di Modifica necessaria' + (data.reviewedBy ? ' (da ' + data.reviewedBy + ')' : '') + '</div>';
    }

    const feedbackBox = data.feedback
        ? '<div class="feedback-box" style="margin-bottom:15px;"><strong>Nota Attuale in Archivio' + (data.reviewedBy ? ' (GM: ' + data.reviewedBy + ')' : '') + ':</strong> ' + data.feedback + '</div>'
        : '';

    gmDetailContent.innerHTML =
        bannerHTML +
        '<div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:20px;">' +
            '<h3 style="margin-bottom:0;">' + (data.name || 'Senza nome') + ' — Ombra: ' + (data.shadowName || '-') + '</h3>' +
            '<div style="display:flex; gap:8px; flex-wrap:wrap;">' +
                '<button class="btn btn-pdf" onclick="generateBackgroundPdf(\'' + docId + '\')" style="width:auto; padding:10px 14px; font-size:0.7rem;">Scarica PDF</button>' +
                '<button class="btn btn-txt" onclick="generateBackgroundTxt(\'' + docId + '\')" style="width:auto; padding:10px 14px; font-size:0.7rem;">Scarica TXT</button>' +
                '<button class="btn btn-word" onclick="generateBackgroundDocx(\'' + docId + '\')" style="width:auto; padding:10px 14px; font-size:0.7rem;">Scarica Word</button>' +
                '<button class="btn btn-discord" onclick="openSendToDiscordChooser(\'' + docId + '\')" style="width:auto; padding:10px 14px; font-size:0.7rem;">Invia a Discord</button>' +
            '</div>' +
        '</div>' +
        '<div class="voice-box"><strong>Nome Utente Discord</strong><p>' + userDiscord + '</p></div>' +
        '<div class="voice-box"><strong>Nome Personaggio</strong><p>' + (data.name || '-') + '</p></div>' +
        '<div class="voice-box"><strong>Nome Ombra</strong><p>' + (data.shadowName || '-') + '</p></div>' +
        '<div class="voice-box"><strong>Storia del Personaggio (Il Passato)</strong><p>' + (data.history || '-') + '</p></div>' +
        '<div class="voice-box"><strong>Eventi Significativi</strong><p>' + (data.events || '-') + '</p></div>' +
        '<div class="voice-box"><strong>Arrivo sull\'Isola</strong><p>' + (data.arrival || '-') + '</p></div>' +
        '<div class="voice-box"><strong>Legami</strong><p>' + (data.bonds || '-') + '</p></div>' +
        '<div class="voice-box"><strong>Carattere</strong><p>' + (data.character || '-') + '</p></div>' +
        '<div class="voice-box"><strong>Obiettivi</strong><p>' + (data.objectives || '-') + '</p></div>' +
        '<div class="voice-box"><strong>Paure</strong><p>' + (data.fears || '-') + '</p></div>' +
        feedbackBox +
        '<div class="gm-actions">' +
            '<label style="font-size:0.75rem; margin-bottom:8px; color: var(--gold-accent); font-weight: bold;">Firma GM (Obbligatorio)</label>' +
            '<input type="text" id="gmSignature_detail" placeholder="Inserisci il tuo nome GM..." value="' + (data.reviewedBy || '') + '" style="margin-bottom: 15px;">' +
            '<label style="font-size:0.75rem; margin-bottom:8px;">Istruzioni di Modifica / Commento di Rifiuto</label>' +
            '<textarea id="feedback_detail" placeholder="Specifica qui cosa l\'utente deve correggere sul suo PC..." style="margin-bottom: 15px;">' + (data.feedback || '') + '</textarea>' +
            '<div class="gm-buttons-group">' +
                '<button class="btn btn-approve" onclick="reviewBackground(\'' + docId + '\', \'approvato\')">Approva Background</button>' +
                '<button class="btn btn-reject" onclick="reviewBackground(\'' + docId + '\', \'da_modificare\')">Richiedi Modifiche</button>' +
            '</div>' +
            '<div class="gm-buttons-group" style="margin-top:12px;">' +
                '<button class="btn btn-pdf" onclick="generateBackgroundPdf(\'' + docId + '\')">Scarica PDF</button>' +
                '<button class="btn btn-txt" onclick="generateBackgroundTxt(\'' + docId + '\')">Scarica TXT</button>' +
                '<button class="btn btn-word" onclick="generateBackgroundDocx(\'' + docId + '\')">Scarica Word</button>' +
                '<button class="btn btn-discord" onclick="openSendToDiscordChooser(\'' + docId + '\')">Invia a Discord</button>' +
            '</div>' +
        '</div>';

    showGmDetailView();
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

// EMISSIONE DELLA SENTENZA DEL GM
window.reviewBackground = function(docId, nextStatus) {
    const feedbackEl = document.getElementById('feedback_detail') || document.getElementById('feedback_' + docId);
    const signatureEl = document.getElementById('gmSignature_detail') || document.getElementById('gmSignature_' + docId);

    const feedbackText = feedbackEl ? feedbackEl.value.trim() : '';
    const gmSignature = signatureEl ? signatureEl.value.trim() : '';

    if (!gmSignature) {
        triggerChronicaAlert('Firma Mancante', 'Devi inserire il tuo nome GM prima di confermare l\'azione.');
        return;
    }

    if (nextStatus === 'da_modificare' && !feedbackText) {
        triggerChronicaAlert('Nota mancante', 'Devi inserire una nota scritta per spiegare al giocatore le modifiche da apportare.');
        return;
    }

    const data = allBackgroundsCache.find(b => b.id === docId);
    const userDiscord = data ? (data.discordUser || 'Sconosciuto') : 'Sconosciuto';
    const charName = data ? (data.name || 'Sconosciuto') : 'Sconosciuto';

    const updateData = {
        status: nextStatus,
        feedback: nextStatus === 'approvato' ? '' : feedbackText,
        reviewedBy: gmSignature
    };

    db.collection('backgrounds').doc(docId).update(updateData)
        .then(() => {
            const isApproved = nextStatus === 'approvato';
            const embedFields = [
                { name: "Discord User", value: userDiscord, inline: true },
                { name: "Nome Personaggio", value: charName, inline: true },
                { name: "Esito", value: isApproved ? "Approvato" : "Da Modificare", inline: false }
            ];

            let embedDescription = 'Il GameMaster **' + gmSignature + '** ha completato la revisione.';

            if (isApproved) {
                embedDescription += '\n\n**Il tuo background è stato accettato. Non ci sono altre azioni da compiere.**';
            } else {
                embedDescription += '\n\n**Sono richieste delle modifiche.**\nCollegati al sito per correggere e rinviare: https://horde-vampiri.vitriotv.com/bg/';
                embedFields.push({ name: "Note/Istruzioni dal GM", value: feedbackText, inline: false });
            }

            sendDiscordWebhook(
                "https://discord.com/api/webhooks/1525137091573317724/HpEhlcQz7NF4csUT92wJiu_xKGnPK2-hiYk4C0eTqkJQFl6h11gdFt9mfCICcqy80jlH",
                '<@' + userDiscord + '>',
                isApproved ? "Horde V5 | Background Approvato" : "Horde V5 | Richiesta Modifiche Background",
                embedDescription,
                isApproved ? 0x2ecc71 : 0xe74c3c,
                embedFields
            );

            triggerChronicaAlert('Stato modificato', 'Il giocatore è stato informato della decisione presa.', () => {
                if (nextStatus === 'approvato') {
                    currentGmTab = 'approvato';
                    document.querySelectorAll('.gm-tab').forEach(t => t.classList.remove('active'));
                    document.getElementById('tabApprovati').classList.add('active');
                } else if (nextStatus === 'da_modificare') {
                    currentGmTab = 'da_modificare';
                    document.querySelectorAll('.gm-tab').forEach(t => t.classList.remove('active'));
                    document.getElementById('tabDaModificare').classList.add('active');
                }
                showGmListView();
            });
        })
        .catch(error => {
            triggerChronicaAlert('Errore Di Registro', 'Impossibile aggiornare lo stato: ' + error.message);
        });
};


// ==========================================
// GENERAZIONE FILE BACKGROUND (PDF / TXT / DOCX) — PORTALE GM
// ==========================================

function buildBackgroundPlainText(data) {
    const dataInvio = data.submittedAt ? data.submittedAt.toDate().toLocaleString('it-IT') : 'Data non registrata';
    const statusLabel = {
        'da_revisionare': 'In revisione',
        'approvato': 'Approvato',
        'da_modificare': 'Da modificare'
    }[data.status] || data.status;

    const lines = [
        '═══════════════════════════════════════════════════════════════',
        '  BACKGROUND PERSONAGGIO — HORDE RP V5',
        '  Gestionale BG Vampiri',
        '═══════════════════════════════════════════════════════════════',
        '',
        'Discord: ' + (data.discordUser || 'N/A'),
        'Inviato: ' + dataInvio,
        'Stato: ' + statusLabel,
        'Generato il: ' + new Date().toLocaleString('it-IT'),
        '',
        '───────────────────────────────────────────────────────────────',
        'NOME PERSONAGGIO',
        '───────────────────────────────────────────────────────────────',
        (data.name || '—'),
        '',
        '───────────────────────────────────────────────────────────────',
        'NOME OMBRA',
        '───────────────────────────────────────────────────────────────',
        (data.shadowName || '—'),
        '',
        '───────────────────────────────────────────────────────────────',
        'NOME UTENTE DISCORD',
        '───────────────────────────────────────────────────────────────',
        (data.discordUser || '—'),
        '',
        '───────────────────────────────────────────────────────────────',
        'STORIA DEL PERSONAGGIO (IL PASSATO)',
        '───────────────────────────────────────────────────────────────',
        (data.history || '—'),
        '',
        '───────────────────────────────────────────────────────────────',
        'EVENTI SIGNIFICATIVI',
        '───────────────────────────────────────────────────────────────',
        (data.events || '—'),
        '',
        '───────────────────────────────────────────────────────────────',
        "ARRIVO SULL'ISOLA",
        '───────────────────────────────────────────────────────────────',
        (data.arrival || '—'),
        '',
        '───────────────────────────────────────────────────────────────',
        'LEGAMI',
        '───────────────────────────────────────────────────────────────',
        (data.bonds || '—'),
        '',
        '───────────────────────────────────────────────────────────────',
        'CARATTERE',
        '───────────────────────────────────────────────────────────────',
        (data.character || '—'),
        '',
        '───────────────────────────────────────────────────────────────',
        'OBIETTIVI',
        '───────────────────────────────────────────────────────────────',
        (data.objectives || '—'),
        '',
        '───────────────────────────────────────────────────────────────',
        'PAURE',
        '───────────────────────────────────────────────────────────────',
        (data.fears || '—'),
        ''
    ];

    if (data.feedback) {
        lines.push(
            '───────────────────────────────────────────────────────────────',
            'NOTA DEL GAME MASTER' + (data.reviewedBy ? ' (' + data.reviewedBy + ')' : ''),
            '───────────────────────────────────────────────────────────────',
            data.feedback,
            ''
        );
    }

    lines.push(
        '═══════════════════════════════════════════════════════════════',
        'BG Vampiri di ' + ((data.name && String(data.name).trim()) ? String(data.name).trim() : 'Senza nome') + ' — solo a scopo ludico — Horde V5 — Sviluppato da Vitrio',
        '═══════════════════════════════════════════════════════════════'
    );

    return lines.join('\n');
}

function getSafeFileName(data, extension) {
    const safeName = (data.name || 'background').replace(/[^a-zA-Z0-9àèéìòù_\- ]/gi, '').trim().replace(/\s+/g, '_').substring(0, 40);
    return 'BG_Vampiri_' + safeName + '_HordeV5.' + extension;
}

function downloadBlob(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    setTimeout(function() {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 150);
}

// Costruisce il Blob del formato richiesto (senza scaricare/inviare)
function buildBackgroundBlob(docId, format) {
    return new Promise(function(resolve, reject) {
        const data = allBackgroundsCache.find(b => b.id === docId);
        if (!data) {
            reject(new Error('Background non trovato.'));
            return;
        }

        if (format === 'txt') {
            const text = buildBackgroundPlainText(data);
            const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
            resolve({ blob: blob, fileName: getSafeFileName(data, 'txt'), data: data, label: 'TXT' });
            return;
        }

        if (format === 'docx') {
            if (typeof docxLite === 'undefined' || !docxLite.build) {
                reject(new Error('docx-lite non è caricato. Ricarica la pagina e riprova.'));
                return;
            }
            const text = buildBackgroundPlainText(data);
            const title = 'Background — ' + (data.name || 'Personaggio') + ' | Horde RP V5';
            const blob = docxLite.build(title, text);
            resolve({ blob: blob, fileName: getSafeFileName(data, 'docx'), data: data, label: 'Word (DOCX)' });
            return;
        }

        if (format === 'pdf') {
            if (typeof window.jspdf === 'undefined' || !window.jspdf.jsPDF) {
                reject(new Error('jsPDF non è caricato. Ricarica la pagina e riprova.'));
                return;
            }
            // PDF is async because of logo; we reuse the existing logic via a helper
            buildPdfBlob(data).then(function(blob) {
                resolve({ blob: blob, fileName: getSafeFileName(data, 'pdf'), data: data, label: 'PDF' });
            }).catch(reject);
            return;
        }

        reject(new Error('Formato non supportato: ' + format));
    });
}

// --- Scarica solo sul PC ---
window.generateBackgroundTxt = function(docId) {
    buildBackgroundBlob(docId, 'txt').then(function(res) {
        downloadBlob(res.blob, res.fileName);
        triggerChronicaAlert('TXT scaricato', 'Il file TXT è stato scaricato correttamente.');
    }).catch(function(err) {
        triggerChronicaAlert('Errore', err.message || String(err));
    });
};

window.generateBackgroundDocx = function(docId) {
    buildBackgroundBlob(docId, 'docx').then(function(res) {
        downloadBlob(res.blob, res.fileName);
        triggerChronicaAlert('Word scaricato', 'Il file Word (DOCX) è stato scaricato correttamente.');
    }).catch(function(err) {
        triggerChronicaAlert('Errore', err.message || String(err));
    });
};

// Chooser per invio a Discord
window.openSendToDiscordChooser = function(docId) {
    const data = allBackgroundsCache.find(b => b.id === docId);
    if (!data) {
        triggerChronicaAlert('Errore', 'Background non trovato.');
        return;
    }

    // Usiamo il popup custom per chiedere il formato
    popupTitle.innerText = 'Invia file a Discord';
    popupMessage.innerHTML = 'Scegli il formato del background da inviare sul canale Discord:<br><br>' +
        '<div style="display:flex; flex-direction:column; gap:10px; margin-top:12px;">' +
            '<button class="btn btn-pdf" id="choosePdf" style="width:100%;">PDF</button>' +
            '<button class="btn btn-txt" id="chooseTxt" style="width:100%;">TXT</button>' +
            '<button class="btn btn-word" id="chooseDocx" style="width:100%;">Word (DOCX)</button>' +
        '</div>';
    currentPopupCallback = null;
    customPopup.classList.add('active');

    // Sostituiamo temporaneamente i listener del bottone Chiudi e dei formati
    const btnClose = document.getElementById('btnPopupClose');
    const oldCloseHandler = btnClose.onclick;

    function cleanup() {
        customPopup.classList.remove('active');
        btnClose.onclick = oldCloseHandler;
        ['choosePdf','chooseTxt','chooseDocx'].forEach(function(id) {
            const el = document.getElementById(id);
            if (el) el.onclick = null;
        });
    }

    btnClose.onclick = function() { cleanup(); };

    document.getElementById('choosePdf').onclick = function() {
        cleanup();
        sendBackgroundToDiscord(docId, 'pdf');
    };
    document.getElementById('chooseTxt').onclick = function() {
        cleanup();
        sendBackgroundToDiscord(docId, 'txt');
    };
    document.getElementById('chooseDocx').onclick = function() {
        cleanup();
        sendBackgroundToDiscord(docId, 'docx');
    };
};

function sendBackgroundToDiscord(docId, format) {
    triggerChronicaAlert('Invio in corso', 'Sto generando il file e lo sto inviando a Discord...');
    buildBackgroundBlob(docId, format).then(function(res) {
        const charName = res.data.name || 'Senza nome';
        const userDiscord = res.data.discordUser || 'N/A';
        return sendFileToDiscordWebhook(
            res.blob,
            res.fileName,
            '📥 **Background richiesto in download** — Formato: **' + res.label + '**',
            'Horde V5 | Download Background (' + res.label + ')',
            'È stato generato e allegato il background in formato **' + res.label + '**.\n\nPuoi scaricare il file direttamente da questo messaggio.',
            0xc5a059,
            [
                { name: '👤 Discord User', value: userDiscord, inline: true },
                { name: '🦇 Nome Personaggio', value: charName, inline: true },
                { name: '📄 Formato', value: res.label, inline: true },
                { name: '📁 Nome File', value: res.fileName, inline: false }
            ]
        ).then(function() {
            triggerChronicaAlert('Inviato a Discord', 'Il file ' + res.label + ' è stato inviato correttamente sul canale.');
        });
    }).catch(function(err) {
        triggerChronicaAlert('Errore', err.message || String(err));
    });
}

// Helper PDF -> Blob (estratto dalla logica originale)
function buildPdfBlob(data) {
    return new Promise(function(resolve, reject) {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const marginLeft = 18;
        const marginRight = 18;
        const contentWidth = pageWidth - marginLeft - marginRight;
        const marginTop = 18;
        const marginBottom = 22;

        const gold = [197, 160, 89];
        const blood = [139, 0, 0];
        const darkText = [40, 40, 40];
        const muted = [90, 90, 90];

        let y = marginTop;

        function ensureSpace(needed) {
            if (y + needed > pageHeight - marginBottom) {
                doc.addPage();
                y = marginTop;
                return true;
            }
            return false;
        }

        function drawFooter() {
            const footerY = pageHeight - 12;
            doc.setDrawColor(...blood);
            doc.setLineWidth(0.3);
            doc.line(marginLeft, footerY - 6, pageWidth - marginRight, footerY - 6);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7);
            doc.setTextColor(...muted);
            const charName = (data.name && String(data.name).trim()) ? String(data.name).trim() : 'Senza nome';
            const footerText = 'BG Vampiri di ' + charName + ' - solo a scopo ludico - Horde V5 - Sviluppato da Vitrio';
            doc.text(footerText, pageWidth / 2, footerY, { align: 'center' });
        }

        const logoUrl = '../assets/logo.png';
        const logoW = 28;
        const logoH = 28;

        function renderContent(logoImgData) {
            if (logoImgData) {
                try {
                    const logoX = (pageWidth - logoW) / 2;
                    doc.addImage(logoImgData, 'PNG', logoX, y, logoW, logoH);
                    y += logoH + 6;
                } catch (e) {
                    console.warn('Logo non aggiunto al PDF:', e);
                }
            }

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(16);
            doc.setTextColor(...gold);
            doc.text('BACKGROUND PERSONAGGIO', pageWidth / 2, y, { align: 'center' });
            y += 7;

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(10);
            doc.setTextColor(...muted);
            doc.text('Horde RP V5 — Gestionale BG Vampiri', pageWidth / 2, y, { align: 'center' });
            y += 5;

            doc.setDrawColor(...blood);
            doc.setLineWidth(0.6);
            doc.line(marginLeft + 20, y, pageWidth - marginRight - 20, y);
            y += 8;

            const dataInvio = data.submittedAt ? data.submittedAt.toDate().toLocaleString('it-IT') : 'Data non registrata';
            const dataGenerazione = new Date().toLocaleString('it-IT');
            const statusLabel = {
                'da_revisionare': 'In revisione',
                'approvato': 'Approvato',
                'da_modificare': 'Da modificare'
            }[data.status] || data.status;

            doc.setFontSize(8);
            doc.setTextColor(...muted);
            doc.text('Discord: ' + (data.discordUser || 'N/A') + '  |  Inviato: ' + dataInvio + '  |  Stato: ' + statusLabel, pageWidth / 2, y, { align: 'center' });
            y += 5;
            doc.text('PDF generato il: ' + dataGenerazione, pageWidth / 2, y, { align: 'center' });
            y += 10;

            const sections = [
                { title: 'Nome Personaggio', value: data.name },
                { title: 'Nome Ombra', value: data.shadowName },
                { title: 'Nome Utente Discord', value: data.discordUser },
                { title: 'Storia del Personaggio (Il Passato)', value: data.history },
                { title: 'Eventi Significativi', value: data.events },
                { title: "Arrivo sull'Isola", value: data.arrival },
                { title: 'Legami', value: data.bonds },
                { title: 'Carattere', value: data.character },
                { title: 'Obiettivi', value: data.objectives },
                { title: 'Paure', value: data.fears }
            ];

            if (data.feedback) {
                sections.push({ title: 'Nota del Game Master' + (data.reviewedBy ? ' (' + data.reviewedBy + ')' : ''), value: data.feedback });
            }

            sections.forEach(function(sec) {
                const value = (sec.value && String(sec.value).trim()) ? String(sec.value).trim() : '—';
                const titleLines = doc.splitTextToSize(sec.title, contentWidth);
                const valueLines = doc.splitTextToSize(value, contentWidth);

                const blockHeight = 5 + (titleLines.length * 4.5) + 2 + (valueLines.length * 4.2) + 6;
                ensureSpace(Math.min(blockHeight, 40));

                doc.setFont('helvetica', 'bold');
                doc.setFontSize(10);
                doc.setTextColor(...blood);
                doc.text(titleLines, marginLeft, y);
                y += titleLines.length * 4.5 + 1.5;

                doc.setDrawColor(...gold);
                doc.setLineWidth(0.25);
                doc.line(marginLeft, y, marginLeft + 40, y);
                y += 3.5;

                doc.setFont('helvetica', 'normal');
                doc.setFontSize(9);
                doc.setTextColor(...darkText);

                valueLines.forEach(function(line) {
                    ensureSpace(5);
                    doc.text(line, marginLeft, y);
                    y += 4.2;
                });

                y += 5;
            });

            const totalPages = doc.internal.getNumberOfPages();
            for (let i = 1; i <= totalPages; i++) {
                doc.setPage(i);
                drawFooter();
                doc.setFontSize(7);
                doc.setTextColor(...muted);
                doc.text('Pagina ' + i + ' / ' + totalPages, pageWidth - marginRight, pageHeight - 6, { align: 'right' });
            }

            resolve(doc.output('blob'));
        }

        const img = new Image();
        img.crossOrigin = 'anonymous';
        let done = false;

        function safeRender(logoData) {
            if (done) return;
            done = true;
            try {
                renderContent(logoData);
            } catch (e) {
                reject(e);
            }
        }

        img.onload = function() {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = img.naturalWidth || img.width;
                canvas.height = img.naturalHeight || img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                const dataUrl = canvas.toDataURL('image/png');
                safeRender(dataUrl);
            } catch (err) {
                console.warn('Conversione logo fallita:', err);
                safeRender(null);
            }
        };

        img.onerror = function() {
            console.warn('Logo non raggiungibile, PDF senza logo.');
            safeRender(null);
        };

        setTimeout(function() {
            if (!done) {
                img.onload = null;
                img.onerror = null;
                safeRender(null);
            }
        }, 2500);

        img.src = logoUrl;
    });
}

// --- PDF: solo download locale ---
window.generateBackgroundPdf = function(docId) {
    buildBackgroundBlob(docId, 'pdf').then(function(res) {
        downloadBlob(res.blob, res.fileName);
        triggerChronicaAlert('PDF scaricato', 'Il PDF del background è stato scaricato correttamente.');
    }).catch(function(err) {
        triggerChronicaAlert('Errore', err.message || String(err));
    });
};

