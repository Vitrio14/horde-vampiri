// Stati delle cartelle attive nelle varie sezioni
let currentQuestsFolder = null;
let currentDocsFolder = null;
let currentNotesFolder = null;
let currentMediaFolder = null;
let currentPlayersFolder = null;
let currentCommandsFolder = null;
let currentAdminFolder = null;

/** Formatta numeri in stile italiano: 10000 → 10.000 */
function formatNumber(n) {
    const num = Number(n);
    if (isNaN(num)) return '0';
    return num.toLocaleString('it-IT');
}

/** Ordina array di oggetti per un campo testo in ordine alfabetico italiano (case-insensitive) */
function sortAlpha(arr, key = 'name') {
    return arr.slice().sort((a, b) => {
        const va = (a[key] != null ? String(a[key]) : '').trim();
        const vb = (b[key] != null ? String(b[key]) : '').trim();
        return va.localeCompare(vb, 'it', { sensitivity: 'base' });
    });
}

/** Formatta data/ora ISO in stile italiano leggibile: 05/10/2026, 22:15 */
function formatDateTime(iso) {
    if (!iso) return '';
    try {
        const d = new Date(iso);
        if (isNaN(d.getTime())) return '';
        return d.toLocaleString('it-IT', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (e) {
        return '';
    }
}

function login() {

    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    if (email !== 'gm.vampiri@horde.it') {

        alert('Accesso non autorizzato');

        return;
    }

    auth.signInWithEmailAndPassword(email, password)

        .then((userCredential) => {

            const user = userCredential.user;

            if (user.email !== 'gm.vampiri@horde.it') {

                auth.signOut();

                alert('Utente non autorizzato');

                return;
            }

            document.getElementById('login-page')
                .classList.add('hidden');

            document.getElementById('dashboard')
                .classList.remove('hidden');

            loadQuests();
            loadDocs();
            loadNotes();
            loadMedia();
            loadCommands();
            loadGlobalLinks();
            loadPlayers();
            loadRitoPlayers();
            loadFrammentiEvents();
            loadFrammenti();
            updateWeekRangeHints();
        })

        .catch((error) => {

            alert(
                'Errore Login: ' + error.message
            );

        });
}

function logout() {
    auth.signOut();
    location.reload();
}

function showSection(id) {
    document.querySelectorAll('.panel').forEach(panel => {
        panel.classList.remove('active');
    });

    document.getElementById(id).classList.add('active');
}

/* FUNZIONE GESTIONE CARTELLE */

function addFolder(type) {
    Swal.fire({
        title: 'Nuova Cartella',
        html: `
            <input
                id="folder-name"
                class="swal2-input"
                placeholder="Nome Cartella"
            >
        `,
        confirmButtonText: 'Crea Cartella',
        background: '#131a25',
        preConfirm: () => {
            return document.getElementById('folder-name').value;
        }
    }).then((result) => {
        if (result.isConfirmed && result.value) {
            db.collection('folders').add({
                name: result.value,
                type: type
            }).then(() => {
                showToast('Cartella creata');
            });
        }
    });
}

/* QUEST */

function openQuestModal(editId = null, existing = null) {
    if (!currentQuestsFolder && !editId) {
        Swal.fire({
            icon: 'warning',
            title: 'Attenzione',
            text: 'Seleziona o crea prima una cartella per poter aggiungere una Quest!',
            background: '#131a25'
        });
        return;
    }

    db.collection('players').get().then(snapshot => {
        let playerOptions = '<option value="">Nessun Player</option>';
        const playersList = [];
        snapshot.forEach(doc => {
            playersList.push(doc.data());
        });
        sortAlpha(playersList, 'name').forEach(p => {
            const sel = (existing && existing.player === p.name) ? 'selected' : '';
            playerOptions += `<option value="${p.name}" ${sel}>${p.name}</option>`;
        });

        const isEdit = !!editId;
        const titleVal = existing ? (existing.title || '') : '';
        const detailsVal = existing ? (existing.details || '') : '';
        const dynastyVal = existing ? (existing.dynasty || '') : '';
        const statusVal = existing ? (existing.status || 'todo') : 'todo';
        const docLinkVal = existing ? (existing.documentLink || '') : '';

        const statusOptions = ['todo', 'progress', 'done'].map(s => {
            const labels = { todo: 'Da Fare', progress: 'In Corso', done: 'Completata' };
            return `<option value="${s}" ${statusVal === s ? 'selected' : ''}>${labels[s]}</option>`;
        }).join('');

        Swal.fire({
            title: isEdit ? 'Modifica Quest' : 'Nuova Quest',
            html: `
                <input id="quest-title" class="swal2-input" placeholder="Titolo Quest" value="${titleVal.replace(/"/g, '&quot;')}">
                <textarea id="quest-details" class="swal2-textarea" placeholder="Dettagli Quest (Scrivi i vari step premendo Invio per andare a capo)">${detailsVal}</textarea>
                <input id="quest-dynasty" class="swal2-input" placeholder="Dinastia interessata" value="${dynastyVal.replace(/"/g, '&quot;')}">
                <select id="quest-player" class="swal2-select">${playerOptions}</select>
                <select id="quest-status" class="swal2-select">${statusOptions}</select>

                <label style="display:block; text-align:left; margin: 12px 0 4px 4px; color: #a0a0a0; font-size:13px; font-weight:600;">
                    Documento collegato (opzionale)
                </label>
                <input id="quest-doc-link" class="swal2-input" placeholder="Link Google Docs oppure URL PDF" value="${docLinkVal.replace(/"/g, '&quot;')}">

                <label style="display:block; text-align:left; margin: 12px 0 4px 4px; color: #a0a0a0; font-size:13px; font-weight:600;">
                    Oppure carica un file dal PC (PDF / immagine)
                </label>
                <input type="file" id="quest-file" accept="image/*,.pdf,application/pdf" class="swal2-input" style="padding:10px;cursor:pointer;">
                <p style="font-size:12px; color:#6b7280; margin-top:-4px; text-align:left; padding-left:4px;">
                    Max ~900 KB. Se carichi un file, sostituisce il link sopra.
                </p>
            `,
            confirmButtonText: isEdit ? 'Salva modifiche' : 'Crea Quest',
            background: '#131a25',
            preConfirm: () => {
                const title = document.getElementById('quest-title').value;
                const details = document.getElementById('quest-details').value;
                const dynasty = document.getElementById('quest-dynasty').value;
                const player = document.getElementById('quest-player').value;
                const status = document.getElementById('quest-status').value;
                let documentLink = (document.getElementById('quest-doc-link').value || '').trim();
                const fileInput = document.getElementById('quest-file');
                const file = fileInput && fileInput.files && fileInput.files[0];

                if (!title) {
                    Swal.showValidationMessage('Inserisci un titolo');
                    return false;
                }

                if (file) {
                    if (file.size > 900 * 1024) {
                        Swal.showValidationMessage('File troppo grande (max ~900 KB)');
                        return false;
                    }
                    return new Promise((resolve) => {
                        const reader = new FileReader();
                        reader.onload = () => resolve({
                            title, details, dynasty, player, status,
                            documentLink: reader.result
                        });
                        reader.onerror = () => {
                            Swal.showValidationMessage('Errore lettura file');
                            resolve(false);
                        };
                        reader.readAsDataURL(file);
                    });
                }

                return { title, details, dynasty, player, status, documentLink };
            }
        }).then((result) => {
            if (!result.isConfirmed || !result.value) return;

            const data = {
                title: result.value.title,
                details: result.value.details,
                dynasty: result.value.dynasty,
                player: result.value.player,
                status: result.value.status
            };
            if (result.value.documentLink) {
                data.documentLink = result.value.documentLink;
            } else if (isEdit) {
                data.documentLink = '';
            }

            if (isEdit) {
                db.collection('quests').doc(editId).update(data).then(() => {
                    showToast('Quest aggiornata');
                });
            } else {
                data.folderId = currentQuestsFolder.id;
                db.collection('quests').add(data).then(() => {
                    showToast('Quest creata');
                });
            }
        });
    });
}

function editQuest(questId) {
    db.collection('quests').doc(questId).get().then(doc => {
        if (!doc.exists) return;
        openQuestModal(questId, doc.data());
    });
}

function loadQuests() {
    const container = document.getElementById('quest-list');

    // Ascolto real-time sia delle cartelle che delle quest
    db.collection('folders').where('type', '==', 'quests').onSnapshot(foldersSnapshot => {
        db.collection('quests').onSnapshot(questsSnapshot => {
            container.innerHTML = '';

            if (currentQuestsFolder) {
                // Vista interna alla cartella: Mostra bottone per tornare indietro
                container.innerHTML += `
                    <div class="card folder-card back-card" onclick="currentQuestsFolder = null; loadQuests();" style="border-color: #ef4444; cursor: pointer;">
                        <h3><i class="fa-solid fa-arrow-left"></i> Torna alle Cartelle</h3>
                        <p style="margin-top: 8px;">Cartella attiva: <b>${currentQuestsFolder.name}</b></p>
                    </div>
                `;

                const questItems = [];
                questsSnapshot.forEach(doc => {
                    const q = doc.data();
                    if (q.folderId === currentQuestsFolder.id) {
                        questItems.push({ id: doc.id, ...q });
                    }
                });
                sortAlpha(questItems, 'title').forEach(q => {
                        // Converte i dettagli separati da invio in comodi step strutturati
                        let stepsHTML = '';
                        if (q.details) {
                            const steps = q.details.split('\n').filter(s => s.trim() !== '');
                            stepsHTML = steps.map((step, index) => `<li><b>Step ${index + 1}:</b> ${step}</li>`).join('');
                        } else {
                            stepsHTML = '<li>Nessun dettaglio inserito</li>';
                        }

                        const cardId = `quest-card-${q.id}`;
                        let docButtonHTML = '';
                        if (q.documentLink) {
                            docButtonHTML = `
                                <button class="open-doc-btn" data-open-src="${cardId}" style="margin-bottom:10px;width:100%;">
                                    <i class="fa-solid fa-file"></i> Apri Documento
                                </button>
                            `;
                        }

                        container.innerHTML += `
                            <div class="card" id="${cardId}">
                                <h3>${q.title}</h3>
                                
                                <div class="quest-steps-box">
                                    <ul style="list-style: none; padding: 0;">
                                        ${stepsHTML}
                                    </ul>
                                </div>

                                <p style="margin-top: 10px;">
                                    <b>Dinastia:</b> ${q.dynasty || 'Nessuna'}
                                </p>

                                <p>
                                    <b>Player Assegnato:</b> ${q.player || 'Nessuno'}
                                </p>

                                <div class="status ${q.status}">
                                    ${q.status}
                                </div>

                                ${docButtonHTML}

                                <div class="action-buttons">
                                    <button
                                        class="edit-btn"
                                        onclick="editQuest('${q.id}')"
                                    >
                                        Modifica
                                    </button>
                                    <button
                                        class="delete-btn"
                                        onclick="confirmDelete('quests', '${q.id}', loadQuests)"
                                    >
                                        Elimina
                                    </button>
                                </div>
                            </div>
                        `;

                        if (q.documentLink) {
                            setTimeout(() => {
                                const el = document.getElementById(cardId);
                                if (el) el.setAttribute('data-content-src', q.documentLink);
                            }, 0);
                        }
                });

                // Listener per aprire documenti quest
                container.querySelectorAll('[data-open-src]').forEach(btn => {
                    btn.onclick = function(e) {
                        e.preventDefault();
                        const id = this.getAttribute('data-open-src');
                        const card = document.getElementById(id);
                        if (card) {
                            const src = card.getAttribute('data-content-src');
                            if (src) openDocumentViewer(src);
                        }
                    };
                });
            } else {
                // Vista principale: mostra l'elenco delle cartelle disponibili
                const folderItems = [];
                foldersSnapshot.forEach(fDoc => {
                    folderItems.push({ id: fDoc.id, ...fDoc.data() });
                });
                sortAlpha(folderItems, 'name').forEach(f => {
                    container.innerHTML += `
                        <div class="card folder-card" style="border-color: #f59e0b; cursor: pointer;" onclick="currentQuestsFolder = {id: '${f.id}', name: '${f.name}'}; loadQuests();">
                            <h3><i class="fa-solid fa-folder" style="color: #f59e0b; margin-right: 8px;"></i> ${f.name}</h3>
                            <p>Apri per visualizzare le quest</p>
                            <div class="action-buttons" onclick="event.stopPropagation();" style="margin-top: 15px;">
                                <button class="delete-btn" style="padding: 6px; font-size: 13px;" onclick="confirmDelete('folders', '${f.id}', loadQuests)">
                                    Elimina Cartella
                                </button>
                            </div>
                        </div>
                    `;
                });
            }
        });
    });
}

/* DOCUMENTI */

function addDoc() {
    if (!currentDocsFolder) {
        Swal.fire({
            icon: 'warning',
            title: 'Attenzione',
            text: 'Seleziona o crea prima una cartella per poter aggiungere un documento!',
            background: '#131a25'
        });
        return;
    }

    Swal.fire({
        title: 'Nuovo Documento',
        html: `
            <input id="doc-title" class="swal2-input" placeholder="Titolo">
            <input id="doc-link" class="swal2-input" placeholder="Link Google Docs oppure URL PDF">
            <label style="display:block; text-align:left; margin: 12px 0 4px 4px; color: #a0a0a0; font-size:13px; font-weight:600;">
                Oppure carica un file dal PC (PDF / immagine)
            </label>
            <input type="file" id="doc-file" accept="image/*,.pdf,application/pdf" class="swal2-input" style="padding:10px;cursor:pointer;">
            <p style="font-size:12px; color:#6b7280; margin-top:-4px; text-align:left; padding-left:4px;">
                Max ~900 KB. Se carichi un file, sostituisce il link sopra.
            </p>
        `,
        confirmButtonText: 'Salva',
        background: '#131a25',
        preConfirm: () => {
            const title = document.getElementById('doc-title').value;
            let link = (document.getElementById('doc-link').value || '').trim();
            const fileInput = document.getElementById('doc-file');
            const file = fileInput && fileInput.files && fileInput.files[0];

            if (!title) {
                Swal.showValidationMessage('Inserisci un titolo');
                return false;
            }
            if (!link && !file) {
                Swal.showValidationMessage('Inserisci un link oppure carica un file');
                return false;
            }

            if (file) {
                if (file.size > 900 * 1024) {
                    Swal.showValidationMessage('File troppo grande (max ~900 KB)');
                    return false;
                }
                return new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve({ title, link: reader.result });
                    reader.onerror = () => {
                        Swal.showValidationMessage('Errore lettura file');
                        resolve(false);
                    };
                    reader.readAsDataURL(file);
                });
            }
            return { title, link };
        }
    }).then((result) => {
        if (result.isConfirmed && result.value) {
            db.collection('docs').add({
                title: result.value.title,
                link: result.value.link,
                folderId: currentDocsFolder.id
            }).then(() => {
                showToast('Documento aggiunto');
            });
        }
    });
}

function loadDocs() {
    const container = document.getElementById('docs-list');

    db.collection('folders').where('type', '==', 'docs').onSnapshot(foldersSnapshot => {
        db.collection('docs').onSnapshot(docsSnapshot => {
            container.innerHTML = '';

            if (currentDocsFolder) {
                container.innerHTML += `
                    <div class="card folder-card back-card" onclick="currentDocsFolder = null; loadDocs();" style="border-color: #ef4444; cursor: pointer;">
                        <h3><i class="fa-solid fa-arrow-left"></i> Torna alle Cartelle</h3>
                        <p style="margin-top: 8px;">Cartella attiva: <b>${currentDocsFolder.name}</b></p>
                    </div>
                `;

                const docItems = [];
                docsSnapshot.forEach(doc => {
                    const d = doc.data();
                    if (d.folderId === currentDocsFolder.id) {
                        docItems.push({ id: doc.id, ...d });
                    }
                });
                sortAlpha(docItems, 'title').forEach(d => {
                        const cardId = `doc-card-${d.id}`;
                        container.innerHTML += `
                            <div class="card" id="${cardId}">
                                <h3>${d.title}</h3>
                                <button 
                                    class="open-doc-btn"
                                    data-open-src="${cardId}"
                                    style="margin-bottom:8px;width:100%;"
                                >
                                    <i class="fa-solid fa-file"></i> Apri Documento
                                </button>
                                <button 
                                    class="delete-btn"
                                    onclick="deleteDoc('${d.id}')"
                                >
                                    <i class="fa-solid fa-trash"></i> Elimina
                                </button>
                            </div>
                        `;
                        setTimeout(() => {
                            const el = document.getElementById(cardId);
                            if (el && d.link) el.setAttribute('data-content-src', d.link);
                        }, 0);
                });

                container.querySelectorAll('[data-open-src]').forEach(btn => {
                    btn.onclick = function(e) {
                        e.preventDefault();
                        const id = this.getAttribute('data-open-src');
                        const card = document.getElementById(id);
                        if (card) {
                            const src = card.getAttribute('data-content-src');
                            if (src) openDocumentViewer(src);
                        }
                    };
                });
            } else {
                const folderItems = [];
                foldersSnapshot.forEach(fDoc => {
                    folderItems.push({ id: fDoc.id, ...fDoc.data() });
                });
                sortAlpha(folderItems, 'name').forEach(f => {
                    container.innerHTML += `
                        <div class="card folder-card" style="border-color: #f59e0b; cursor: pointer;" onclick="currentDocsFolder = {id: '${f.id}', name: '${f.name}'}; loadDocs();">
                            <h3><i class="fa-solid fa-folder" style="color: #f59e0b; margin-right: 8px;"></i> ${f.name}</h3>
                            <p>Apri per visualizzare i documenti</p>
                            <div class="action-buttons" onclick="event.stopPropagation();" style="margin-top: 15px;">
                                <button class="delete-btn" style="padding: 6px; font-size: 13px;" onclick="confirmDelete('folders', '${f.id}', loadDocs)">
                                    Elimina Cartella
                                </button>
                            </div>
                        </div>
                    `;
                });
            }
        });
    });
}

/* NOTES */

function addNote() {
    if (!currentNotesFolder) {
        Swal.fire({
            icon: 'warning',
            title: 'Attenzione',
            text: 'Seleziona o crea prima una cartella per poter aggiungere una nota!',
            background: '#131a25'
        });
        return;
    }

    Swal.fire({

        title: 'Nuova Nota',

        html: `

            <textarea
                id="note-content"
                class="swal2-textarea"
                placeholder="Scrivi nota..."
            ></textarea>

        `,

        confirmButtonText: 'Salva',

        background: '#131a25',

        preConfirm: () => {

            return {

                note:
                    document.getElementById(
                        'note-content'
                    ).value
            };
        }

    }).then((result) => {

        if (result.isConfirmed) {

            db.collection('notes').add({

                note: result.value.note,
                folderId: currentNotesFolder.id

            }).then(() => {

                showToast(
                    'Nota aggiunta'
                );
            });
        }
    });
}

function loadNotes() {
    const container = document.getElementById('notes-list');

    db.collection('folders').where('type', '==', 'notes').onSnapshot(foldersSnapshot => {
        db.collection('notes').onSnapshot(notesSnapshot => {
            container.innerHTML = '';

            if (currentNotesFolder) {
                container.innerHTML += `
                    <div class="card folder-card back-card" onclick="currentNotesFolder = null; loadNotes();" style="border-color: #ef4444; cursor: pointer;">
                        <h3><i class="fa-solid fa-arrow-left"></i> Torna alle Cartelle</h3>
                        <p style="margin-top: 8px;">Cartella attiva: <b>${currentNotesFolder.name}</b></p>
                    </div>
                `;

                const noteItems = [];
                notesSnapshot.forEach(doc => {
                    const n = doc.data();
                    if (n.folderId === currentNotesFolder.id) {
                        noteItems.push({ id: doc.id, ...n });
                    }
                });
                sortAlpha(noteItems, 'note').forEach(n => {
                        container.innerHTML += `
                            <div class="card">
                                <p>${n.note}</p>
                                <div class="action-buttons">
                                    <button
                                        class="delete-btn"
                                        onclick="confirmDelete('notes', '${n.id}', loadNotes)"
                                    >
                                        Elimina
                                    </button>
                                </div>
                            </div>
                        `;
                });
            } else {
                const folderItems = [];
                foldersSnapshot.forEach(fDoc => {
                    folderItems.push({ id: fDoc.id, ...fDoc.data() });
                });
                sortAlpha(folderItems, 'name').forEach(f => {
                    container.innerHTML += `
                        <div class="card folder-card" style="border-color: #f59e0b; cursor: pointer;" onclick="currentNotesFolder = {id: '${f.id}', name: '${f.name}'}; loadNotes();">
                            <h3><i class="fa-solid fa-folder" style="color: #f59e0b; margin-right: 8px;"></i> ${f.name}</h3>
                            <p>Apri per visualizzare le note</p>
                            <div class="action-buttons" onclick="event.stopPropagation();" style="margin-top: 15px;">
                                <button class="delete-btn" style="padding: 6px; font-size: 13px;" onclick="confirmDelete('folders', '${f.id}', loadNotes)">
                                    Elimina Cartella
                                </button>
                            </div>
                        </div>
                    `;
                });
            }
        });
    });
}

/* MEDIA */

function addMedia() {
    if (!currentMediaFolder) {
        Swal.fire({
            icon: 'warning',
            title: 'Attenzione',
            text: 'Seleziona o crea prima una cartella per poter aggiungere contenuti all\'archivio!',
            background: '#131a25'
        });
        return;
    }

    Swal.fire({
        title: 'Nuovo Contenuto',
        html: `
            <input id="media-title" class="swal2-input" placeholder="Titolo">
            <textarea id="media-content" class="swal2-textarea" placeholder="Testo oppure URL (immagine / PDF / Google Docs)"></textarea>
            <label style="display:block; text-align:left; margin: 14px 0 6px 4px; color: #a0a0a0; font-size:13px; font-weight:600;">
                Oppure carica un file dal PC (immagine o PDF)
            </label>
            <input type="file" id="media-file" accept="image/*,.pdf,application/pdf" class="swal2-input" style="padding:10px;cursor:pointer;">
            <p style="font-size:12px; color:#6b7280; margin-top:-4px; text-align:left; padding-left:4px;">
                Il file viene salvato nel database (senza Storage). Max ~900 KB.
            </p>
        `,
        confirmButtonText: 'Salva',
        background: '#131a25',
        preConfirm: () => {
            const title = document.getElementById('media-title').value;
            const textContent = document.getElementById('media-content').value;
            const fileInput = document.getElementById('media-file');
            const file = fileInput && fileInput.files && fileInput.files[0];

            if (!title) {
                Swal.showValidationMessage('Inserisci un titolo');
                return false;
            }

            if (file) {
                if (file.size > 900 * 1024) {
                    Swal.showValidationMessage('File troppo grande (max ~900 KB)');
                    return false;
                }
                return new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve({ title, content: reader.result });
                    reader.onerror = () => {
                        Swal.showValidationMessage('Errore lettura file');
                        resolve(false);
                    };
                    reader.readAsDataURL(file);
                });
            }

            return { title, content: textContent };
        }
    }).then((result) => {
        if (result.isConfirmed && result.value) {
            db.collection('media').add({
                title: result.value.title,
                content: result.value.content,
                folderId: currentMediaFolder.id
            }).then(() => {
                showToast('Contenuto aggiunto');
            });
        }
    });
}

function loadMedia() {
    const container = document.getElementById('media-list');

    db.collection('folders').where('type', '==', 'media').onSnapshot(foldersSnapshot => {
        db.collection('media').onSnapshot(mediaSnapshot => {
            container.innerHTML = '';

            if (currentMediaFolder) {
                container.innerHTML += `
                    <div class="card folder-card back-card" onclick="currentMediaFolder = null; loadMedia();" style="border-color: #ef4444; cursor: pointer;">
                        <h3><i class="fa-solid fa-arrow-left"></i> Torna alle Cartelle</h3>
                        <p style="margin-top: 8px;">Cartella attiva: <b>${currentMediaFolder.name}</b></p>
                    </div>
                `;

                const mediaItems = [];
                mediaSnapshot.forEach(doc => {
                    const m = doc.data();
                    if (m.folderId === currentMediaFolder.id) {
                        mediaItems.push({ id: doc.id, ...m });
                    }
                });
                sortAlpha(mediaItems, 'title').forEach(m => {
                        let mediaHTML = '';
                        const content = m.content || '';
                        const isDataImage = content.startsWith('data:image/');
                        const isDataPdf = content.startsWith('data:application/pdf');
                        const isUrlImage = /\.(png|jpe?g|gif|webp|bmp|svg)(\?|$)/i.test(content) ||
                                           (content.includes('https://') && !content.includes('.pdf') && !content.startsWith('data:'));
                        const isPdfLike = /\.pdf(\?|$)/i.test(content) || content.includes('docs.google.com') || content.includes('drive.google.com') || isDataPdf;

                        const cardId = `media-card-${m.id}`;

                        if (isDataImage || isUrlImage) {
                            mediaHTML = `<img src="${content}" class="media-image" style="cursor:pointer;" data-open-src="${cardId}">`;
                        } else if (isPdfLike) {
                            mediaHTML = `<p style="color:#a0a0a0;font-size:13px;margin-bottom:8px;"><i class="fa-solid fa-file-pdf"></i> Documento PDF / Google Docs</p>`;
                        } else if (content) {
                            mediaHTML = `<p>${content}</p>`;
                        }

                        const openBtn = content ? `
                            <button class="open-doc-btn" data-open-src="${cardId}" style="margin-bottom:8px;width:100%;">
                                <i class="fa-solid fa-expand"></i> Apri a schermo
                            </button>
                        ` : '';

                        container.innerHTML += `
                            <div class="card" id="${cardId}">
                                <h3>${m.title}</h3>
                                ${mediaHTML}
                                ${openBtn}
                                <div class="action-buttons">
                                    <button class="delete-btn" onclick="confirmDelete('media', '${m.id}', loadMedia)">
                                        Elimina
                                    </button>
                                </div>
                            </div>
                        `;

                        setTimeout(() => {
                            const el = document.getElementById(cardId);
                            if (el) el.setAttribute('data-content-src', content);
                        }, 0);
                });

                container.querySelectorAll('[data-open-src]').forEach(btn => {
                    btn.onclick = function(e) {
                        e.preventDefault();
                        const id = this.getAttribute('data-open-src');
                        const card = document.getElementById(id);
                        if (card) {
                            const src = card.getAttribute('data-content-src');
                            if (src) openDocumentViewer(src);
                        }
                    };
                });
            } else {
                const folderItems = [];
                foldersSnapshot.forEach(fDoc => {
                    folderItems.push({ id: fDoc.id, ...fDoc.data() });
                });
                sortAlpha(folderItems, 'name').forEach(f => {
                    container.innerHTML += `
                        <div class="card folder-card" style="border-color: #f59e0b; cursor: pointer;" onclick="currentMediaFolder = {id: '${f.id}', name: '${f.name}'}; loadMedia();">
                            <h3><i class="fa-solid fa-folder" style="color: #f59e0b; margin-right: 8px;"></i> ${f.name}</h3>
                            <p>Apri per visualizzare l'archivio</p>
                            <div class="action-buttons" onclick="event.stopPropagation();" style="margin-top: 15px;">
                                <button class="delete-btn" style="padding: 6px; font-size: 13px;" onclick="confirmDelete('folders', '${f.id}', loadMedia)">
                                    Elimina Cartella
                                </button>
                            </div>
                        </div>
                    `;
                });
            }
        });
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

/* COMMANDS */

function addCommand() {
    if (!currentCommandsFolder) {
        Swal.fire({
            icon: 'warning',
            title: 'Attenzione',
            text: 'Seleziona o crea prima una cartella per poter aggiungere un comando!',
            background: '#131a25'
        });
        return;
    }

    Swal.fire({
        title: 'Nuovo Comando',
        html: `
            <input
                id="command-name"
                class="swal2-input"
                placeholder="/comando"
            >
            <textarea
                id="command-description"
                class="swal2-textarea"
                placeholder="Descrizione comando"
            ></textarea>
        `,
        confirmButtonText: 'Salva',
        background: '#131a25',
        preConfirm: () => {
            return {
                command: document.getElementById('command-name').value,
                description: document.getElementById('command-description').value
            };
        }
    }).then((result) => {
        if (result.isConfirmed) {
            db.collection('commands').add({
                command: result.value.command,
                description: result.value.description,
                folderId: currentCommandsFolder.id
            }).then(() => {
                showToast('Comando aggiunto');
            });
        }
    });
}

function loadCommands() {
    const container = document.getElementById('commands-list');

    db.collection('folders').where('type', '==', 'commands').onSnapshot(foldersSnapshot => {
        db.collection('commands').onSnapshot(commandsSnapshot => {
            container.innerHTML = '';

            if (currentCommandsFolder) {
                container.innerHTML += `
                    <div class="card folder-card back-card" onclick="currentCommandsFolder = null; loadCommands();" style="border-color: #ef4444; cursor: pointer;">
                        <h3><i class="fa-solid fa-arrow-left"></i> Torna alle Cartelle</h3>
                        <p style="margin-top: 8px;">Cartella attiva: <b>${currentCommandsFolder.name}</b></p>
                    </div>
                `;

                const cmdItems = [];
                commandsSnapshot.forEach(doc => {
                    const c = doc.data();
                    if (c.folderId === currentCommandsFolder.id) {
                        cmdItems.push({ id: doc.id, ...c });
                    }
                });
                sortAlpha(cmdItems, 'command').forEach(c => {
                        container.innerHTML += `
                            <div class="card">
                                <h3>${c.command}</h3>
                                <p>${c.description}</p>
                                <div class="action-buttons">
                                    <button
                                        class="delete-btn"
                                        onclick="confirmDelete('commands', '${c.id}', loadCommands)"
                                    >
                                        Elimina
                                    </button>
                                </div>
                            </div>
                        `;
                });
            } else {
                const folderItems = [];
                foldersSnapshot.forEach(fDoc => {
                    folderItems.push({ id: fDoc.id, ...fDoc.data() });
                });
                sortAlpha(folderItems, 'name').forEach(f => {
                    container.innerHTML += `
                        <div class="card folder-card" style="border-color: #f59e0b; cursor: pointer;" onclick="currentCommandsFolder = {id: '${f.id}', name: '${f.name}'}; loadCommands();">
                            <h3><i class="fa-solid fa-folder" style="color: #f59e0b; margin-right: 8px;"></i> ${f.name}</h3>
                            <p>Apri per visualizzare i comandi</p>
                            <div class="action-buttons" onclick="event.stopPropagation();" style="margin-top: 15px;">
                                <button class="delete-btn" style="padding: 6px; font-size: 13px;" onclick="confirmDelete('folders', '${f.id}', loadCommands)">
                                    Elimina Cartella
                                </button>
                            </div>
                        </div>
                    `;
                });
            }
        });
    });
}

/* ADMIN LINKS */

function saveGlobalLink() {
    if (!currentAdminFolder) {
        Swal.fire({
            icon: 'warning',
            title: 'Attenzione',
            text: 'Seleziona o crea prima una cartella per poter aggiungere un link!',
            background: '#131a25'
        });
        return;
    }

    Swal.fire({
        title: 'Nuovo Link',
        html: `
            <input
                id="link-title"
                class="swal2-input"
                placeholder="Titolo"
            >
            <input
                id="link-url"
                class="swal2-input"
                placeholder="https://..."
            >
        `,
        confirmButtonText: 'Salva',
        background: '#131a25',
        preConfirm: () => {
            return {
                title: document.getElementById('link-title').value,
                link: document.getElementById('link-url').value
            };
        }
    }).then((result) => {
        if (result.isConfirmed) {
            db.collection('globalLinks').add({
                title: result.value.title,
                link: result.value.link,
                folderId: currentAdminFolder.id
            }).then(() => {
                showToast('Link salvato');
            });
        }
    });
}

function loadGlobalLinks() {
    const container = document.getElementById('global-links');

    db.collection('folders').where('type', '==', 'admin').onSnapshot(foldersSnapshot => {
        db.collection('globalLinks').onSnapshot(linksSnapshot => {
            container.innerHTML = '';

            if (currentAdminFolder) {
                container.innerHTML += `
                    <div class="card folder-card back-card" onclick="currentAdminFolder = null; loadGlobalLinks();" style="border-color: #ef4444; cursor: pointer;">
                        <h3><i class="fa-solid fa-arrow-left"></i> Torna alle Cartelle</h3>
                        <p style="margin-top: 8px;">Cartella attiva: <b>${currentAdminFolder.name}</b></p>
                    </div>
                `;

                const linkItems = [];
                linksSnapshot.forEach(doc => {
                    const l = doc.data();
                    if (l.folderId === currentAdminFolder.id) {
                        linkItems.push({ id: doc.id, ...l });
                    }
                });
                sortAlpha(linkItems, 'title').forEach(l => {
                        container.innerHTML += `
                            <div class="card">
                                <h3>${l.title}</h3>
                                <a
                                    href="${l.link}"
                                    target="_blank"
                                    class="link-btn"
                                >
                                    APRI LINK
                                </a>
                                <div class="action-buttons">
                                    <button
                                        class="delete-btn"
                                        onclick="confirmDelete('globalLinks', '${l.id}', loadGlobalLinks)"
                                    >
                                        Elimina
                                    </button>
                                </div>
                            </div>
                        `;
                });
            } else {
                const folderItems = [];
                foldersSnapshot.forEach(fDoc => {
                    folderItems.push({ id: fDoc.id, ...fDoc.data() });
                });
                sortAlpha(folderItems, 'name').forEach(f => {
                    container.innerHTML += `
                        <div class="card folder-card" style="border-color: #f59e0b; cursor: pointer;" onclick="currentAdminFolder = {id: '${f.id}', name: '${f.name}'}; loadGlobalLinks();">
                            <h3><i class="fa-solid fa-folder" style="color: #f59e0b; margin-right: 8px;"></i> ${f.name}</h3>
                            <p>Apri per visualizzare i link</p>
                            <div class="action-buttons" onclick="event.stopPropagation();" style="margin-top: 15px;">
                                <button class="delete-btn" style="padding: 6px; font-size: 13px;" onclick="confirmDelete('folders', '${f.id}', loadGlobalLinks)">
                                    Elimina Cartella
                                </button>
                            </div>
                        </div>
                    `;
                });
            }
        });
    });
}

function openGoogleDoc(link) {
    openDocumentViewer(link);
}

/** Viewer quasi a schermo intero per Google Docs, PDF, immagini e data-URL */
function openDocumentViewer(link) {
    if (!link) return;

    let src = String(link).trim();

    // Google Docs / Drive → preview
    if (src.includes('docs.google.com') || src.includes('drive.google.com')) {
        src = src
            .replace('/edit', '/preview')
            .replace('/view', '/preview');
        if (src.includes('/file/d/') && !src.includes('/preview')) {
            src = src.replace(/\/view.*$/, '/preview');
        }
    }

    const isImage = /\.(png|jpe?g|gif|webp|bmp|svg)(\?|$)/i.test(src) ||
                    src.startsWith('data:image/');

    let contentHtml = '';
    if (isImage) {
        contentHtml = `
            <div style="width:100%;height:85vh;display:flex;align-items:center;justify-content:center;background:#0a0a0a;overflow:auto;">
                <img src="${src}" style="max-width:100%;max-height:100%;object-fit:contain;border-radius:8px;" alt="Anteprima">
            </div>
        `;
    } else {
        contentHtml = `
            <iframe
                src="${src}"
                style="width:100%;height:85vh;border:none;background:#fff;border-radius:8px;"
                allow="fullscreen"
                allowfullscreen
            ></iframe>
        `;
    }

    Swal.fire({
        width: '96%',
        padding: '0.5rem',
        html: contentHtml,
        showCloseButton: true,
        showConfirmButton: false,
        background: '#0b0f19',
        customClass: {
            popup: 'swal-fullscreen-viewer',
            htmlContainer: 'swal-viewer-html'
        },
        didOpen: () => {
            const popup = document.querySelector('.swal-fullscreen-viewer');
            if (popup) {
                popup.style.border = '1px solid rgba(197,160,89,0.25)';
                popup.style.borderRadius = '12px';
                popup.style.overflow = 'hidden';
            }
        }
    });
}

function deleteDoc(id) {

    Swal.fire({

        title: 'Eliminare documento?',

        text: 'Questa azione è irreversibile',

        icon: 'warning',

        showCancelButton: true,

        confirmButtonText: 'Elimina',

        cancelButtonText: 'Annulla',

        confirmButtonColor: '#ef4444'

    }).then((result) => {

        if (result.isConfirmed) {

            db.collection('docs')
                .doc(id)
                .delete()
                .then(() => {

                    showToast(
                        'Documento eliminato'
                    );
                });
        }
    });
}

function confirmDelete(collection, id, reloadFunction) {

    Swal.fire({

        title: 'Conferma eliminazione',

        text: 'Questa azione non può essere annullata',

        icon: 'warning',

        showCancelButton: true,

        confirmButtonColor: '#ef4444',

        cancelButtonColor: '#b91c1c',

        confirmButtonText: 'Elimina',

        cancelButtonText: 'Annulla'

    }).then((result) => {

        if (result.isConfirmed) {

            db.collection(collection)
                .doc(id)
                .delete()
                .then(() => {

                    showToast('Elemento eliminato');
                });
        }
    });
}

function showToast(text) {

    Toastify({

        text: text,

        duration: 3000,

        gravity: 'top',

        position: 'right',

        style: {

            background:
                'linear-gradient(to right,#ef4444,#b91c1c)',

            borderRadius: '12px'
        }

    }).showToast();
}

/* PLAYERS */

function addPlayer() {
    if (!currentPlayersFolder) {
        Swal.fire({
            icon: 'warning',
            title: 'Attenzione',
            text: 'Seleziona o crea prima una cartella per poter aggiungere un player!',
            background: '#131a25'
        });
        return;
    }

    Swal.fire({
        title: 'Nuovo Player',
        html: `
            <input
                id="player-name"
                class="swal2-input"
                placeholder="Nome Player"
            >
            <label style="display:block; text-align:left; margin: 8px 0 4px 4px; color: #a0a0a0; font-size:13px; font-weight:600;">
                Grado / Status
            </label>
            <select id="player-grado" class="swal2-select">
                <option value="">— Nessuno —</option>
                <option value="Ekaton">Ekaton</option>
                <option value="Mentore">Mentore</option>
                <option value="Adulta">Adulta</option>
                <option value="Adulto">Adulto</option>
                <option value="Neonata">Neonata</option>
                <option value="Neonato">Neonato</option>
                <option value="Ospite">Ospite</option>
            </select>
            <textarea
                id="player-notes"
                class="swal2-textarea"
                placeholder="Note Player"
            ></textarea>
        `,
        confirmButtonText: 'Crea Player',
        background: '#131a25',
        preConfirm: () => {
            const name = document.getElementById('player-name').value;
            if (!name || !name.trim()) {
                Swal.showValidationMessage('Inserisci un nome');
                return false;
            }
            return {
                name: name.trim(),
                notes: document.getElementById('player-notes').value,
                grado: document.getElementById('player-grado').value || ''
            };
        }
    }).then((result) => {
        if (result.isConfirmed) {
            db.collection('players').add({
                name: result.value.name,
                notes: result.value.notes,
                grado: result.value.grado,
                quests: [],
                folderId: currentPlayersFolder.id
            }).then(() => {
                showToast('Player creato');
            });
        }
    });
}

function loadPlayers() {
    const container = document.getElementById('players-list');

    db.collection('folders').where('type', '==', 'players').onSnapshot(foldersSnapshot => {
        db.collection('players').onSnapshot(playersSnapshot => {
            container.innerHTML = '';

            if (currentPlayersFolder) {
                container.innerHTML += `
                    <div class="card folder-card back-card" onclick="currentPlayersFolder = null; loadPlayers();" style="border-color: #ef4444; cursor: pointer;">
                        <h3><i class="fa-solid fa-arrow-left"></i> Torna alle Cartelle</h3>
                        <p style="margin-top: 8px;">Cartella attiva: <b>${currentPlayersFolder.name}</b></p>
                    </div>
                `;

                const playerItems = [];
                playersSnapshot.forEach(doc => {
                    const p = doc.data();
                    // Esclusi da Giocatori: rito / uscita ospitato → solo in "Uscite & Riti"
                    const exitType = p.exitType || (p.ritoDellaCarne ? 'rito' : (p.uscitaOspitato ? 'uscita_ospitato' : null));
                    if (exitType) return;
                    if (p.folderId === currentPlayersFolder.id) {
                        playerItems.push({ id: doc.id, ...p });
                    }
                });
                sortAlpha(playerItems, 'name').forEach(p => {
                        let activeQuestsHTML = '';
                        if (p.quests && p.quests.length > 0) {
                            const sortedQuests = p.quests.slice().sort((a, b) => String(a).localeCompare(String(b), 'it', { sensitivity: 'base' }));
                            activeQuestsHTML = sortedQuests.map(q => `<span class="status progress" style="margin: 2px;">${q}</span>`).join(' ');
                        } else {
                            activeQuestsHTML = '<span style="color: var(--muted); font-size:13px;">Nessuna quest attiva</span>';
                        }

                        const exitType = p.exitType || (p.ritoDellaCarne ? 'rito' : (p.uscitaOspitato ? 'uscita_ospitato' : null));
                        const isExit = !!exitType;
                        const cardClass = isExit
                            ? (exitType === 'uscita_ospitato' ? 'card card-uscita' : 'card card-rito')
                            : 'card';
                        let exitBadge = '';
                        if (exitType === 'rito') {
                            const d = p.exitDate || p.ritoDate;
                            exitBadge = `<div class="status rito-status" title="Ha lasciato la dinastia"><i class="fa-solid fa-skull"></i> Rito della Carne${d ? ' · ' + new Date(d).toLocaleDateString('it-IT') : ''}${p.memoriaCancellata ? ' · 🧠×' : ''}</div>`;
                        } else if (exitType === 'uscita_ospitato') {
                            const d = p.exitDate;
                            exitBadge = `<div class="status uscita-status" title="Uscita ospitato"><i class="fa-solid fa-door-open"></i> Uscita Ospitato${d ? ' · ' + new Date(d).toLocaleDateString('it-IT') : ''}${p.memoriaCancellata ? ' · 🧠×' : ''}</div>`;
                        }
                        if (p.exitNotes) {
                            const safeNotes = String(p.exitNotes).replace(/</g, '&lt;');
                            exitBadge += `<p class="exit-notes-preview" title="Note uscita"><i class="fa-solid fa-note-sticky"></i> ${safeNotes.slice(0, 80)}${safeNotes.length > 80 ? '…' : ''}</p>`;
                        }

                        const gradoBadge = p.grado
                            ? `<div class="status grado-status grado-${String(p.grado).toLowerCase()}">${p.grado}</div>`
                            : '';

                        container.innerHTML += `
                            <div class="${cardClass}">
                                <h3>${p.name}</h3>
                                ${gradoBadge}
                                ${exitBadge}
                                <p>${p.notes || 'Nessuna nota'}</p>
                                <div style="margin-top:10px;">
                                    <b>Quest Attive:</b><br>${activeQuestsHTML}
                                </div>
                                <div class="action-buttons action-buttons-icons">
                                    <button
                                        class="edit-btn"
                                        onclick="openPlayerModal('${p.id}')"
                                    >
                                        Apri
                                    </button>
                                    <button
                                        class="btn-frammenti"
                                        onclick="openPlayerFrammentiModal('${p.id}', '${(p.name || '').replace(/'/g, "\\'")}')"
                                        title="Resoconto Frammenti"
                                    >
                                        🔮
                                    </button>
                                    <button
                                        class="btn-move-player"
                                        onclick="movePlayerToFolder('${p.id}')"
                                        title="Sposta in un'altra cartella"
                                    >
                                        📂
                                    </button>
                                    <button
                                        class="delete-btn btn-icon-only"
                                        onclick="confirmDelete('players', '${p.id}', loadPlayers)"
                                        title="Elimina player"
                                    >
                                        🗑️
                                    </button>
                                </div>
                            </div>
                        `;

                });
            } else {
                // ID cartelle esistenti (tipo players)
                const validFolderIds = new Set();
                const folderIdList = [];
                foldersSnapshot.forEach(fDoc => {
                    validFolderIds.add(fDoc.id);
                    folderIdList.push(fDoc.id);
                });

                // Contatori: TUTTI i player attivi (no rito/uscita)
                const countByFolder = {};
                // Adulto = Adulta+Adulto, Neonato = Neonata+Neonato (badge resta distinto)
                const countByGrado = {
                    Ekaton: 0,
                    Mentore: 0,
                    Adulto: 0,
                    Neonato: 0,
                    Ospite: 0,
                    '': 0
                };
                let totalActive = 0;
                const orphanIds = [];

                playersSnapshot.forEach(doc => {
                    const p = doc.data();
                    const exitType = p.exitType || (p.ritoDellaCarne ? 'rito' : (p.uscitaOspitato ? 'uscita_ospitato' : null));
                    if (exitType) return;

                    totalActive++;

                    const fid = p.folderId || '';
                    if (fid && validFolderIds.has(fid)) {
                        countByFolder[fid] = (countByFolder[fid] || 0) + 1;
                    } else {
                        orphanIds.push(doc.id);
                    }

                    const g = (p.grado || '').trim();
                    if (g === 'Ekaton') countByGrado.Ekaton++;
                    else if (g === 'Mentore') countByGrado.Mentore++;
                    else if (g === 'Adulta' || g === 'Adulto') countByGrado.Adulto++;
                    else if (g === 'Neonata' || g === 'Neonato') countByGrado.Neonato++;
                    else if (g === 'Ospite') countByGrado.Ospite++;
                    else countByGrado['']++;
                });

                // Auto-riparazione: se c'è esattamente 1 cartella e ci sono orfani, li riassegna
                if (orphanIds.length > 0 && folderIdList.length === 1) {
                    const onlyFolder = folderIdList[0];
                    const batch = db.batch();
                    orphanIds.forEach(pid => {
                        batch.update(db.collection('players').doc(pid), { folderId: onlyFolder });
                    });
                    batch.commit().then(() => {
                        showToast(orphanIds.length + ' player riassegnati alla cartella');
                        // onSnapshot ricaricherà da solo
                    }).catch(() => {});
                    // Mostra conteggi provvisori includendo gli orfani nella cartella unica
                    countByFolder[onlyFolder] = (countByFolder[onlyFolder] || 0) + orphanIds.length;
                    orphanIds.length = 0;
                }

                // Legenda: Adulto e Neonato aggregati; maschio/femmina resta sulla targhetta del player
                const gradoOrder = [
                    { key: 'Ekaton', label: 'Ekaton', cls: 'grado-ekaton' },
                    { key: 'Mentore', label: 'Mentore', cls: 'grado-mentore' },
                    { key: 'Adulto', label: 'Adulto', cls: 'grado-adulto' },
                    { key: 'Neonato', label: 'Neonato', cls: 'grado-neonato' },
                    { key: 'Ospite', label: 'Ospite', cls: 'grado-ospite' },
                    { key: '', label: 'Senza grado', cls: 'grado-none' }
                ];
                let legendChips = gradoOrder.map(g => {
                    const n = countByGrado[g.key] || 0;
                    if (n === 0) return '';
                    return `<span class="players-legend-chip ${g.cls}"><b>${g.label}</b> ${n}</span>`;
                }).filter(Boolean).join('');

                const orphanHint = orphanIds.length > 0
                    ? `<button type="button" class="players-legend-chip grado-none" style="cursor:pointer;font:inherit;"
                        onclick="repairOrphanPlayers()"
                        title="Clicca per assegnare questi player a una cartella">
                        Da assegnare: ${orphanIds.length} — sistema
                      </button>`
                    : '';

                container.innerHTML += `
                    <div class="players-legend-bar" style="grid-column: 1 / -1;">
                        <div class="players-legend-total">
                            <i class="fa-solid fa-users"></i>
                            <span>Totale attivi: <b>${formatNumber(totalActive)}</b></span>
                        </div>
                        <div class="players-legend-chips">
                            ${legendChips || '<span class="players-legend-chip grado-none">Nessun player</span>'}
                            ${orphanHint}
                        </div>
                    </div>
                `;

                const folderItems = [];
                foldersSnapshot.forEach(fDoc => {
                    folderItems.push({ id: fDoc.id, ...fDoc.data() });
                });
                sortAlpha(folderItems, 'name').forEach(f => {
                    const n = countByFolder[f.id] || 0;
                    const countLabel = n === 1 ? '1 player' : (n + ' player');
                    container.innerHTML += `
                        <div class="card folder-card" style="border-color: #f59e0b; cursor: pointer;" onclick="currentPlayersFolder = {id: '${f.id}', name: '${f.name}'}; loadPlayers();">
                            <h3><i class="fa-solid fa-folder" style="color: #f59e0b; margin-right: 8px;"></i> ${f.name}</h3>
                            <p>Apri per visualizzare i player</p>
                            <div class="status folder-count-badge">${countLabel}</div>
                            <div class="action-buttons" onclick="event.stopPropagation();" style="margin-top: 15px;">
                                <button class="delete-btn" style="padding: 6px; font-size: 13px;" onclick="deletePlayersFolder('${f.id}', '${String(f.name).replace(/'/g, "\\'")}')">
                                    Elimina Cartella
                                </button>
                            </div>
                        </div>
                    `;
                });
            }
        });
    });
}

function openPlayerModal(playerId) {

    db.collection('players')
        .doc(playerId)
        .get()
        .then(playerDoc => {

            if (!playerDoc.exists) return;
            const player = playerDoc.data();
            const exitType = player.exitType || (player.ritoDellaCarne ? 'rito' : (player.uscitaOspitato ? 'uscita_ospitato' : null));
            const isExit = !!exitType;

            db.collection('quests').get().then(snapshot => {

                let questOptions = '';
                const questList = [];
                snapshot.forEach(qDoc => {
                    questList.push(qDoc.data());
                });
                sortAlpha(questList, 'title').forEach(q => {
                    const selected =
                        player.quests &&
                        player.quests.includes(q.title)
                            ? 'selected'
                            : '';

                    questOptions += `
                        <option
                            value="${q.title}"
                            ${selected}
                        >
                            ${q.title}
                        </option>
                    `;
                });

                let exitInfo = '';
                if (isExit) {
                    const label = exitType === 'uscita_ospitato' ? 'Uscita Ospitato' : 'Rito della Carne';
                    const color = exitType === 'uscita_ospitato' ? '#38bdf8' : '#a78bfa';
                    const d = player.exitDate || player.ritoDate;
                    const mem = player.memoriaCancellata
                        ? '<br><span style="color:#f87171;">🧠× Memoria cancellata</span>'
                        : '';
                    const notes = player.exitNotes
                        ? `<br><small style="color:#9ca3af;"><i>${String(player.exitNotes).replace(/</g,'&lt;')}</i></small>`
                        : '';
                    exitInfo = `<div style="margin:10px 0 14px;padding:10px 12px;background:rgba(139,92,246,0.1);border:1px solid rgba(139,92,246,0.3);border-left:3px solid ${color};text-align:left;">
                            <b style="color:${color};">${exitType === 'uscita_ospitato' ? '🚪' : '💀'} ${label}</b>
                            <br><small style="color:#9ca3af;">${d ? 'Data: ' + new Date(d).toLocaleString('it-IT') : 'Data non registrata'}. Frammenti e storico restano intatti.</small>
                            ${mem}${notes}
                       </div>`;
                } else {
                    exitInfo = `<div style="margin:10px 0 14px;text-align:left;display:flex;flex-direction:column;gap:8px;">
                            <button type="button" id="btn-reg-rito" class="swal2-styled" style="background:transparent;border:1px solid #a78bfa;color:#a78bfa;width:100%;padding:10px;cursor:pointer;font-weight:700;text-transform:uppercase;letter-spacing:1px;">
                                💀 Registra Rito della Carne
                            </button>
                            <button type="button" id="btn-reg-uscita" class="swal2-styled" style="background:transparent;border:1px solid #38bdf8;color:#38bdf8;width:100%;padding:10px;cursor:pointer;font-weight:700;text-transform:uppercase;letter-spacing:1px;">
                                🚪 Registra Uscita Ospitato
                            </button>
                            <p style="font-size:12px;color:#9ca3af;margin:0;">Puoi aggiungere note e segnare la cancellazione memoria (RP). I dati restano salvati.</p>
                       </div>`;
                }

                const titleSuffix = exitType === 'rito' ? ' · Fuori dinastia'
                    : (exitType === 'uscita_ospitato' ? ' · Uscita ospitato' : '');

                const gradoVal = player.grado || '';
                const gradoOptions = ['', 'Ekaton', 'Mentore', 'Adulta', 'Adulto', 'Neonata', 'Neonato', 'Ospite']
                    .map(g => {
                        const label = g || '— Nessuno —';
                        return `<option value="${g}" ${gradoVal === g ? 'selected' : ''}>${label}</option>`;
                    }).join('');

                Swal.fire({
                    title: player.name + titleSuffix,
                    html: `
                        ${exitInfo}
                        <label style="display:block; text-align:left; margin: 8px 0 4px 4px; color: #a0a0a0; font-size:13px; font-weight:600;">
                            Grado / Status
                        </label>
                        <select id="player-grado-edit" class="swal2-select">
                            ${gradoOptions}
                        </select>

                        <textarea
                            id="player-notes-edit"
                            class="swal2-textarea"
                            placeholder="Note"
                        >${player.notes || ''}</textarea>

                        <label style="display:block; text-align:left; margin: 10px 0 5px 12px; color: var(--muted); font-size:14px; font-weight:600;">Seleziona Quest Attive dal Database:</label>
                        <select
                            id="player-quests"
                            class="swal2-select"
                            multiple
                            style="height:200px;"
                        >
                            ${questOptions}
                        </select>

                        <div style="margin-top:12px;text-align:left;">
                            <button type="button" id="btn-move-from-modal" class="swal2-styled" style="background:transparent;border:1px solid #c5a059;color:#c5a059;width:100%;padding:10px;cursor:pointer;font-weight:700;text-transform:uppercase;letter-spacing:1px;">
                                📂 Sposta in altra cartella
                            </button>
                        </div>
                    `,
                    width: 700,
                    confirmButtonText: 'Salva',
                    showCancelButton: true,
                    cancelButtonText: 'Chiudi',
                    background: '#131a25',
                    didOpen: () => {
                        const btnRito = document.getElementById('btn-reg-rito');
                        if (btnRito) {
                            btnRito.addEventListener('click', () => {
                                Swal.close();
                                registerPlayerExit(playerId, player.name, 'rito');
                            });
                        }
                        const btnUscita = document.getElementById('btn-reg-uscita');
                        if (btnUscita) {
                            btnUscita.addEventListener('click', () => {
                                Swal.close();
                                registerPlayerExit(playerId, player.name, 'uscita_ospitato');
                            });
                        }
                        const btnMove = document.getElementById('btn-move-from-modal');
                        if (btnMove) {
                            btnMove.addEventListener('click', () => {
                                Swal.close();
                                movePlayerToFolder(playerId);
                            });
                        }
                    },
                    preConfirm: () => {
                        const selectedQuests =
                            Array.from(
                                document.getElementById('player-quests').selectedOptions
                            ).map(option => option.value);
                        return {
                            notes: document.getElementById('player-notes-edit').value,
                            quests: selectedQuests,
                            grado: document.getElementById('player-grado-edit').value || ''
                        };
                    }
                }).then((result) => {
                    if (result.isConfirmed) {
                        db.collection('players')
                            .doc(playerId)
                            .update({
                                notes: result.value.notes,
                                quests: result.value.quests,
                                grado: result.value.grado
                            })
                            .then(() => {
                                showToast('Player aggiornato');
                            });
                    }
                });
            });
        });
}

/** Sposta un player in un'altra cartella (tipo players). Ideale per Ospiti → dinastia. */
function movePlayerToFolder(playerId) {
    Promise.all([
        db.collection('players').doc(playerId).get(),
        db.collection('folders').where('type', '==', 'players').get()
    ]).then(([playerDoc, foldersSnap]) => {
        if (!playerDoc.exists) {
            showToast('Player non trovato');
            return;
        }
        const player = playerDoc.data();
        const folders = [];
        foldersSnap.forEach(f => folders.push({ id: f.id, ...f.data() }));
        sortAlpha(folders, 'name');

        if (folders.length === 0) {
            Swal.fire({
                icon: 'info',
                title: 'Nessuna cartella',
                text: 'Crea prima almeno una cartella in Giocatori.',
                background: '#131a25'
            });
            return;
        }

        let opts = '';
        folders.forEach(f => {
            const sel = f.id === player.folderId ? 'selected' : '';
            opts += `<option value="${f.id}" ${sel}>${f.name}</option>`;
        });

        Swal.fire({
            title: 'Sposta player',
            html: `
                <p style="text-align:left;color:#a0a0a0;margin-bottom:10px;">
                    <b style="color:#c5a059;">${player.name || 'Player'}</b> — scegli la cartella di destinazione.
                </p>
                <select id="move-folder-select" class="swal2-select">${opts}</select>
            `,
            confirmButtonText: 'Sposta',
            showCancelButton: true,
            cancelButtonText: 'Annulla',
            background: '#131a25',
            preConfirm: () => {
                const folderId = document.getElementById('move-folder-select').value;
                if (!folderId) {
                    Swal.showValidationMessage('Seleziona una cartella');
                    return false;
                }
                // Verifica che la cartella esista ancora nella lista
                if (!folders.some(f => f.id === folderId)) {
                    Swal.showValidationMessage('Cartella non valida');
                    return false;
                }
                if (folderId === player.folderId) {
                    Swal.showValidationMessage('Il player è già in questa cartella');
                    return false;
                }
                return folderId;
            }
        }).then(result => {
            if (!result.isConfirmed || !result.value) return;
            const folderId = result.value;
            const dest = folders.find(f => f.id === folderId);
            // Scrive SOLO l'id reale della cartella Firestore (non il nome)
            db.collection('players').doc(playerId).update({ folderId: folderId }).then(() => {
                showToast('Spostato in «' + (dest ? dest.name : 'cartella') + '»');
                if (typeof loadPlayers === 'function') loadPlayers();
                if (typeof loadRitoPlayers === 'function') loadRitoPlayers();
            }).catch(err => {
                showToast('Errore spostamento: ' + (err.message || 'sconosciuto'));
            });
        });
    });
}

/**
 * Riassegna tutti i player attivi senza cartella valida a una cartella scelta.
 */
function repairOrphanPlayers() {
    Promise.all([
        db.collection('players').get(),
        db.collection('folders').where('type', '==', 'players').get()
    ]).then(([playersSnap, foldersSnap]) => {
        const folders = [];
        const validIds = new Set();
        foldersSnap.forEach(f => {
            folders.push({ id: f.id, ...f.data() });
            validIds.add(f.id);
        });
        sortAlpha(folders, 'name');

        if (folders.length === 0) {
            Swal.fire({
                icon: 'warning',
                title: 'Nessuna cartella',
                text: 'Crea prima una cartella in Giocatori.',
                background: '#131a25'
            });
            return;
        }

        const orphans = [];
        playersSnap.forEach(doc => {
            const p = doc.data();
            const exitType = p.exitType || (p.ritoDellaCarne ? 'rito' : (p.uscitaOspitato ? 'uscita_ospitato' : null));
            if (exitType) return;
            const fid = p.folderId || '';
            if (!fid || !validIds.has(fid)) {
                orphans.push({ id: doc.id, name: p.name || doc.id });
            }
        });

        if (orphans.length === 0) {
            showToast('Nessun player da sistemare');
            return;
        }

        let opts = folders.map(f => `<option value="${f.id}">${f.name}</option>`).join('');

        Swal.fire({
            title: 'Sistema player senza cartella',
            html: `
                <p style="text-align:left;color:#a0a0a0;margin-bottom:10px;">
                    <b style="color:#c5a059;">${orphans.length}</b> player non risultano in una cartella valida
                    (cartella eliminata o id non aggiornato). Scegli dove assegnarli.
                </p>
                <select id="repair-folder-select" class="swal2-select">${opts}</select>
            `,
            confirmButtonText: 'Assegna tutti',
            showCancelButton: true,
            cancelButtonText: 'Annulla',
            background: '#131a25',
            preConfirm: () => {
                const folderId = document.getElementById('repair-folder-select').value;
                if (!folderId || !validIds.has(folderId)) {
                    Swal.showValidationMessage('Seleziona una cartella valida');
                    return false;
                }
                return folderId;
            }
        }).then(result => {
            if (!result.isConfirmed || !result.value) return;
            const folderId = result.value;
            const dest = folders.find(f => f.id === folderId);
            const batch = db.batch();
            orphans.forEach(o => {
                batch.update(db.collection('players').doc(o.id), { folderId: folderId });
            });
            batch.commit().then(() => {
                showToast(orphans.length + ' player assegnati a «' + (dest ? dest.name : 'cartella') + '»');
            }).catch(err => {
                showToast('Errore: ' + (err.message || 'sconosciuto'));
            });
        });
    });
}

/**
 * Elimina una cartella Giocatori: se contiene player, chiede dove spostarli prima.
 * Così non restano folderId orfani.
 */
function deletePlayersFolder(folderId, folderName) {
    Promise.all([
        db.collection('players').get(),
        db.collection('folders').where('type', '==', 'players').get()
    ]).then(([playersSnap, foldersSnap]) => {
        const folders = [];
        foldersSnap.forEach(f => {
            if (f.id !== folderId) folders.push({ id: f.id, ...f.data() });
        });
        sortAlpha(folders, 'name');

        const inFolder = [];
        playersSnap.forEach(doc => {
            const p = doc.data();
            if (p.folderId === folderId) {
                inFolder.push({ id: doc.id, name: p.name || doc.id });
            }
        });

        if (inFolder.length === 0) {
            // Cartella vuota: elimina direttamente
            Swal.fire({
                title: 'Eliminare cartella?',
                text: '«' + (folderName || 'Cartella') + '» è vuota. Confermi?',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#ef4444',
                confirmButtonText: 'Elimina',
                cancelButtonText: 'Annulla',
                background: '#131a25'
            }).then(result => {
                if (!result.isConfirmed) return;
                db.collection('folders').doc(folderId).delete().then(() => {
                    showToast('Cartella eliminata');
                    if (currentPlayersFolder && currentPlayersFolder.id === folderId) {
                        currentPlayersFolder = null;
                    }
                });
            });
            return;
        }

        if (folders.length === 0) {
            Swal.fire({
                icon: 'warning',
                title: 'Impossibile eliminare',
                html: `La cartella contiene <b>${inFolder.length}</b> player e non ci sono altre cartelle dove spostarli.<br>
                       Crea prima un’altra cartella, oppure sposta/elimina i player.`,
                background: '#131a25'
            });
            return;
        }

        let opts = folders.map(f => `<option value="${f.id}">${f.name}</option>`).join('');

        Swal.fire({
            title: 'Elimina cartella con player',
            html: `
                <p style="text-align:left;color:#a0a0a0;margin-bottom:10px;">
                    «<b style="color:#c5a059;">${folderName || 'Cartella'}</b>» contiene
                    <b>${inFolder.length}</b> player. Prima di eliminarla, scegli dove spostarli
                    (il grado Ospite/Adulto ecc. non cambia).
                </p>
                <select id="delete-folder-dest" class="swal2-select">${opts}</select>
            `,
            confirmButtonText: 'Sposta ed elimina',
            showCancelButton: true,
            cancelButtonText: 'Annulla',
            confirmButtonColor: '#ef4444',
            background: '#131a25',
            preConfirm: () => {
                const destId = document.getElementById('delete-folder-dest').value;
                if (!destId || !folders.some(f => f.id === destId)) {
                    Swal.showValidationMessage('Seleziona una cartella di destinazione');
                    return false;
                }
                return destId;
            }
        }).then(result => {
            if (!result.isConfirmed || !result.value) return;
            const destId = result.value;
            const dest = folders.find(f => f.id === destId);
            const batch = db.batch();
            inFolder.forEach(p => {
                batch.update(db.collection('players').doc(p.id), { folderId: destId });
            });
            batch.delete(db.collection('folders').doc(folderId));
            batch.commit().then(() => {
                showToast(inFolder.length + ' player spostati in «' + (dest ? dest.name : 'cartella') + '» · cartella eliminata');
                if (currentPlayersFolder && currentPlayersFolder.id === folderId) {
                    currentPlayersFolder = null;
                }
            }).catch(err => {
                showToast('Errore: ' + (err.message || 'sconosciuto'));
            });
        });
    });
}

/**
 * Registra uscita: Rito della Carne oppure Uscita Ospitato.
 * - exitNotes: note libere
 * - memoriaCancellata: flag RP (il personaggio non ricorda nulla) — NON cancella dati dal DB
 * Frammenti, quest e note restano intatti.
 * @param {'rito'|'uscita_ospitato'} type
 */
function registerPlayerExit(playerId, playerName, type) {
    const isRito = type === 'rito';
    const title = isRito ? 'Rito della Carne' : 'Uscita Ospitato';
    const accent = isRito ? '#a78bfa' : '#38bdf8';
    const desc = isRito
        ? "Segna l'uscita dalla <b>dinastia</b>."
        : 'Segna la fine del periodo da <b>ospitato</b>.';

    Swal.fire({
        title: title,
        html: `
            <p style="text-align:left;line-height:1.55;color:#d1d5db;">
                Confermi <b style="color:${accent};">${title}</b> per
                <b style="color:#c5a059;">${(playerName || 'questo player').replace(/</g, '&lt;')}</b>?
            </p>
            <p style="text-align:left;font-size:0.9rem;color:#9ca3af;margin-top:8px;">
                ${desc} Scompare dalle cartelle <b>Giocatori</b> (Vampiri/Ospiti) e resta solo in <b>Uscite &amp; Riti</b>. Frammenti, quest e note restano salvati.
            </p>
            <label style="display:block;text-align:left;margin:14px 0 4px;color:#c5a059;font-size:13px;font-weight:600;">
                Note sull'uscita
            </label>
            <textarea id="exit-notes" class="swal2-textarea" placeholder="Motivo, dettagli RP, chi ha assistito…" style="min-height:90px;"></textarea>
            <label style="display:flex;align-items:flex-start;gap:10px;margin-top:12px;cursor:pointer;color:#f87171;font-size:13px;font-weight:600;text-align:left;">
                <input type="checkbox" id="exit-memoria" checked style="width:auto;margin:3px 0 0;accent-color:#ef4444;flex-shrink:0;">
                <span>🧠 Cancellazione memoria (RP)<br>
                <small style="color:#9ca3af;font-weight:400;">Il personaggio non ricorderà nulla. I dati nel gestionale restano intatti.</small>
                </span>
            </label>
        `,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Conferma',
        cancelButtonText: 'Annulla',
        confirmButtonColor: isRito ? '#7c3aed' : '#0284c7',
        background: '#131a25',
        preConfirm: () => {
            return {
                notes: (document.getElementById('exit-notes').value || '').trim(),
                memoria: !!(document.getElementById('exit-memoria') && document.getElementById('exit-memoria').checked)
            };
        }
    }).then(result => {
        if (!result.isConfirmed || !result.value) return;

        const { notes, memoria } = result.value;
        const exitDate = new Date().toISOString();

        // Flag uscita + esci dalla cartella Giocatori (resta solo in Uscite & Riti)
        db.collection('players').doc(playerId).get().then(snap => {
            const prev = snap.exists ? (snap.data() || {}) : {};
            const prevFolderId = prev.folderId || null;
            return db.collection('players').doc(playerId).update({
                exitType: type,
                exitDate,
                exitNotes: notes,
                memoriaCancellata: !!memoria,
                ritoDellaCarne: isRito,
                uscitaOspitato: !isRito,
                ritoDate: isRito ? exitDate : null,
                previousFolderId: prevFolderId,
                folderId: null
            });
        }).then(() => {
            showToast(title + ' registrato per ' + (playerName || 'player'));
            if (typeof loadPlayers === 'function') loadPlayers();
            if (typeof loadRitoPlayers === 'function') loadRitoPlayers();
        });
    });
}

/** @deprecated usa registerPlayerExit(..., 'rito') */
function registerRitoDellaCarne(playerId, playerName) {
    registerPlayerExit(playerId, playerName, 'rito');
}

/** Annulla flag uscita/rito senza toccare i dati storici */
function undoPlayerExit(playerId, playerName) {
    Swal.fire({
        title: 'Annullare uscita?',
        text: 'Il player torna nelle cartelle Giocatori (cartella precedente). Frammenti e storico restano invariati.',
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Annulla uscita',
        cancelButtonText: 'Chiudi',
        background: '#131a25'
    }).then(result => {
        if (!result.isConfirmed) return;
        db.collection('players').doc(playerId).get().then(snap => {
            const prev = snap.exists ? (snap.data() || {}) : {};
            const restoreFolder = prev.previousFolderId || prev.folderId || null;
            return db.collection('players').doc(playerId).update({
                exitType: null,
                exitDate: null,
                exitNotes: null,
                memoriaCancellata: false,
                ritoDellaCarne: false,
                uscitaOspitato: false,
                ritoDate: null,
                folderId: restoreFolder,
                previousFolderId: null
            });
        }).then(() => {
            showToast('Uscita annullata — ' + (playerName || 'player') + ' torna in Giocatori');
            if (typeof loadPlayers === 'function') loadPlayers();
            if (typeof loadRitoPlayers === 'function') loadRitoPlayers();
        });
    });
}

function undoRitoDellaCarne(playerId, playerName) {
    undoPlayerExit(playerId, playerName);
}

/** Sezione dedicata: player con Rito della Carne o Uscita Ospitato */
function loadRitoPlayers() {
    const container = document.getElementById('rito-list');
    if (!container) return;

    db.collection('players').onSnapshot(playersSnapshot => {
        const items = [];
        playersSnapshot.forEach(doc => {
            const p = doc.data();
            const exitType = p.exitType || (p.ritoDellaCarne ? 'rito' : (p.uscitaOspitato ? 'uscita_ospitato' : null));
            if (exitType) items.push({ id: doc.id, ...p, _exitType: exitType });
        });
        sortAlpha(items, 'name');
        container.innerHTML = '';

        if (items.length === 0) {
            container.innerHTML = `
                <p style="color:var(--text-dim);padding:16px;">
                    Nessuna uscita registrata.
                    Da Giocatori → Apri player → «Rito della Carne» o «Uscita Ospitato».
                </p>`;
            return;
        }

        items.forEach(p => {
            let activeQuestsHTML = '';
            if (p.quests && p.quests.length > 0) {
                const sortedQuests = p.quests.slice().sort((a, b) => String(a).localeCompare(String(b), 'it', { sensitivity: 'base' }));
                activeQuestsHTML = sortedQuests.map(q => `<span class="status progress" style="margin: 2px;">${q}</span>`).join(' ');
            } else {
                activeQuestsHTML = '<span style="color: var(--muted); font-size:13px;">Nessuna quest attiva</span>';
            }
            const exitType = p._exitType;
            const isUscita = exitType === 'uscita_ospitato';
            const d = p.exitDate || p.ritoDate;
            const dateLabel = d
                ? new Date(d).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })
                : '—';
            const badgeClass = isUscita ? 'uscita-status' : 'rito-status';
            const badgeText = isUscita
                ? `🚪 Uscita Ospitato · ${dateLabel}`
                : `💀 Rito della Carne · ${dateLabel}`;
            const memBadge = p.memoriaCancellata
                ? `<div class="status memoria-status">🧠× Memoria cancellata</div>`
                : '';
            const notesHtml = p.exitNotes
                ? `<p class="exit-notes-preview"><i class="fa-solid fa-note-sticky"></i> ${String(p.exitNotes).replace(/</g,'&lt;')}</p>`
                : '';
            const cardClass = isUscita ? 'card card-uscita' : 'card card-rito';
            const safeName = (p.name || '').replace(/'/g, "\\'");

            const gradoBadgeRito = p.grado
                ? `<div class="status grado-status grado-${String(p.grado).toLowerCase()}">${p.grado}</div>`
                : '';

            container.innerHTML += `
                <div class="${cardClass}">
                    <h3>${p.name}</h3>
                    ${gradoBadgeRito}
                    <div class="status ${badgeClass}">${badgeText}</div>
                    ${memBadge}
                    ${notesHtml}
                    <p>${p.notes || 'Nessuna nota'}</p>
                    <div style="margin-top:10px;">
                        <b>Quest Attive:</b><br>${activeQuestsHTML}
                    </div>
                    <div class="action-buttons action-buttons-icons">
                        <button class="edit-btn" onclick="openPlayerModal('${p.id}')">Apri</button>
                        <button class="btn-frammenti" onclick="openPlayerFrammentiModal('${p.id}', '${safeName}')" title="Resoconto Frammenti">🔮</button>
                        <button class="btn-move-player" onclick="movePlayerToFolder('${p.id}')" title="Sposta cartella">📂</button>
                        <button class="edit-btn" style="border-color:#a78bfa;color:#a78bfa;" onclick="undoPlayerExit('${p.id}', '${safeName}')" title="Annulla uscita">↩</button>
                        <button class="delete-btn btn-icon-only" onclick="confirmDelete('players', '${p.id}', loadRitoPlayers)" title="Elimina">🗑️</button>
                    </div>
                </div>
            `;
        });
    });
}


/* ========== FRAMMENTI ========== */

/** ========== CONFIG SETTIMANA (inizio personalizzabile) ==========
 * startDay: 0=Dom, 1=Lun, 2=Mar, 3=Mer, 4=Gio, 5=Ven, 6=Sab
 * Default: 1 (Lunedì → Domenica). Es. 5 = Venerdì → Giovedì successivo.
 */
const WEEK_DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
const WEEK_DAY_NAMES_FULL = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];

function loadWeekConfig() {
    try {
        const raw = localStorage.getItem('hordeWeekConfig');
        if (raw) {
            const parsed = JSON.parse(raw);
            const sd = Number(parsed.startDay);
            if (!isNaN(sd) && sd >= 0 && sd <= 6) return { startDay: sd };
        }
    } catch (e) {}
    return { startDay: 1 }; // Lunedì di default
}

function saveWeekConfig(cfg) {
    localStorage.setItem('hordeWeekConfig', JSON.stringify(cfg));
}

let weekConfig = loadWeekConfig();

function getWeekStartDay() {
    const sd = Number(weekConfig && weekConfig.startDay);
    return (!isNaN(sd) && sd >= 0 && sd <= 6) ? sd : 1;
}

function getWeekRangeHintText() {
    const start = getWeekStartDay();
    const end = (start + 6) % 7;
    return `(${WEEK_DAY_NAMES[start]}–${WEEK_DAY_NAMES[end]})`;
}

function updateWeekRangeHints() {
    const hint = document.getElementById('week-range-hint');
    if (hint) hint.textContent = getWeekRangeHintText();
}

/** Settimana = giorno di inizio 00:00 → giorno di inizio+6 23:59:59 (locale) */
function getWeekBounds(dateInput) {
    const d = dateInput ? new Date(dateInput) : new Date();
    if (isNaN(d.getTime())) return getWeekBounds(new Date());
    const startDay = getWeekStartDay();
    const day = d.getDay(); // 0=Dom … 6=Sab
    // distanza all'indietro fino al giorno di inizio configurato
    const diff = (day - startDay + 7) % 7;
    const start = new Date(d);
    start.setDate(d.getDate() - diff);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    const y = start.getFullYear();
    const m = String(start.getMonth() + 1).padStart(2, '0');
    const dd = String(start.getDate()).padStart(2, '0');
    const key = `${y}-${m}-${dd}`; // data del giorno di inizio settimana
    return { start, end, key };
}

function formatWeekLabel(boundsOrKey) {
    let b;
    if (typeof boundsOrKey === 'string') {
        // Interpreta la chiave come giorno di inizio della settimana
        const parts = boundsOrKey.split('-');
        if (parts.length === 3) {
            const start = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 0, 0, 0, 0);
            const end = new Date(start);
            end.setDate(start.getDate() + 6);
            end.setHours(23, 59, 59, 999);
            b = { start, end, key: boundsOrKey };
        } else {
            b = getWeekBounds(boundsOrKey + 'T12:00:00');
        }
    } else {
        b = boundsOrKey;
    }
    const fmt = (dt) => {
        const g = new Date(dt);
        return `${String(g.getDate()).padStart(2,'0')}/${String(g.getMonth()+1).padStart(2,'0')}/${g.getFullYear()}`;
    };
    return `${fmt(b.start)} → ${fmt(b.end)}`;
}

/** Modal: scegli da quale giorno inizia la settimana (es. Venerdì → Giovedì) */
function configureWeekStart() {
    const current = getWeekStartDay();
    const options = WEEK_DAY_NAMES_FULL.map((name, i) => {
        const endName = WEEK_DAY_NAMES_FULL[(i + 6) % 7];
        const sel = i === current ? 'selected' : '';
        return `<option value="${i}" ${sel}>${name} → ${endName}</option>`;
    }).join('');
    const preview = formatWeekLabel(getWeekBounds());

    Swal.fire({
        title: '⚙️ Configura settimana',
        html: `
            <p style="text-align:left;font-size:13px;color:#a0a0a0;margin:0 0 12px 4px;line-height:1.5;">
                Scegli il <b style="color:#a78bfa;">giorno di inizio</b> della settimana RP.
                La settimana dura sempre 7 giorni (fino al giorno precedente della settimana successiva).
            </p>
            <p style="text-align:left;font-size:12px;color:#9ca3af;margin:0 0 10px 4px;">
                Anteprima settimana corrente: <b style="color:#c5a059;">${preview}</b>
            </p>
            <label style="display:block;text-align:left;margin:8px 0 4px 4px;color:#a0a0a0;font-size:13px;font-weight:600;">
                Inizio settimana
            </label>
            <select id="week-start-day" class="swal2-select">${options}</select>
            <p style="text-align:left;font-size:11px;color:#6b7280;margin:10px 4px 0;line-height:1.4;">
                Esempio: Venerdì → Giovedì = settimana da ven. 25 a gio. 1 (poi di nuovo da ven. 2).
                I filtri e le etichette usano questa impostazione. I dati già salvati restano con la loro weekKey originale.
            </p>
        `,
        confirmButtonText: 'Salva',
        showCancelButton: true,
        cancelButtonText: 'Annulla',
        background: '#131a25',
        preConfirm: () => {
            const v = parseInt(document.getElementById('week-start-day').value, 10);
            if (isNaN(v) || v < 0 || v > 6) {
                Swal.showValidationMessage('Seleziona un giorno valido');
                return false;
            }
            return { startDay: v };
        }
    }).then((result) => {
        if (!result.isConfirmed || !result.value) return;
        weekConfig = { startDay: result.value.startDay };
        saveWeekConfig(weekConfig);
        updateWeekRangeHints();
        refreshFrammentiWeekSelect();
        renderFrammentiEventsList();
        if (typeof renderFrammentiList === 'function' && _frammentiAllItems) {
            renderFrammentiList(_frammentiAllItems);
        }
        updateFrammentiWeekLabel();
        const w = getWeekBounds();
        showToast('Settimana impostata: ' + WEEK_DAY_NAMES_FULL[weekConfig.startDay] + ' → ' + WEEK_DAY_NAMES_FULL[(weekConfig.startDay + 6) % 7] + ' (' + formatWeekLabel(w) + ')');
    });
}

function weekKeyFromItem(f) {
    if (f.weekKey) return f.weekKey;
    if (f.createdAt) return getWeekBounds(f.createdAt).key;
    return getWeekBounds().key;
}

/** Filtro settimana corrente nella UI ('current' | 'all' | weekKey) */
let frammentiWeekFilter = 'current';
let _frammentiUnsub = null;
let _frammentiEventsUnsub = null;
let _frammentiAllItems = [];
let _frammentiAllEvents = [];

function weekKeyFromEvent(e) {
    if (e && e.weekKey) return e.weekKey;
    if (e && e.createdAt) return getWeekBounds(e.createdAt).key;
    return getWeekBounds().key;
}

/**
 * Rollover automatico: eventi NON ripetibili ancora APERTI (status !== 'concluso')
 * che appartengono a una settimana passata vengono spostati nella settimana corrente.
 * Anche le assegnazioni ancora da consegnare (non_consegnato) legate a quegli eventi
 * aggiornano weekKey / weekStart / weekEnd, così restano visibili nei filtri "settimana corrente"
 * sia nella lista eventi sia nei log player.
 * Gli eventi conclusi e le consegne già fatte restano archiviati nella settimana originale.
 */
let _rolloverInProgress = false;
function rolloverOpenEventsToCurrentWeek() {
    if (_rolloverInProgress) return;
    const week = getWeekBounds();
    const currentKey = week.key;
    const events = _frammentiAllEvents || [];
    const items = _frammentiAllItems || [];

    const eventsToMove = events.filter(e => {
        if (e.repeatable) return false;
        if (e.status === 'concluso') return false;
        return weekKeyFromEvent(e) !== currentKey;
    });

    // Eventi aperti (anche ripetibili) le cui assegnazioni pending sono su weekKey vecchia
    const openEventIds = new Set();
    const openEventNames = new Set();
    events.forEach(e => {
        if (e.status === 'concluso') return;
        openEventIds.add(e.id);
        if (e.name) openEventNames.add(String(e.name).trim().toLowerCase());
    });

    const itemsToMove = items.filter(f => {
        if (f.status === 'consegnato') return false;
        if (weekKeyFromItem(f) === currentKey) return false;
        const byId = f.eventId && openEventIds.has(f.eventId);
        const byName = f.eventName && openEventNames.has(String(f.eventName).trim().toLowerCase());
        return byId || byName;
    });

    if (eventsToMove.length === 0 && itemsToMove.length === 0) return;

    _rolloverInProgress = true;
    const payload = {
        weekKey: currentKey,
        weekStart: week.start.toISOString(),
        weekEnd: week.end.toISOString()
    };

    const ops = [];
    eventsToMove.forEach(e => {
        ops.push(db.collection('frammentiEvents').doc(e.id).update(payload));
    });
    itemsToMove.forEach(f => {
        ops.push(db.collection('frammenti').doc(f.id).update(payload));
    });

    Promise.all(ops).then(() => {
        const nEv = eventsToMove.length;
        const nAs = itemsToMove.length;
        if (nEv > 0 || nAs > 0) {
            const parts = [];
            if (nEv > 0) parts.push(nEv + (nEv === 1 ? ' evento aperto' : ' eventi aperti'));
            if (nAs > 0) parts.push(nAs + (nAs === 1 ? ' assegnazione da consegnare' : ' assegnazioni da consegnare'));
            showToast('Rollover settimana: ' + parts.join(' + ') + ' → ' + formatWeekLabel(week));
        }
    }).catch(err => {
        console.error('Errore rollover settimana:', err);
    }).finally(() => {
        _rolloverInProgress = false;
    });
}

function addFrammentoEvent() {
    const weekNow = getWeekBounds();
    const weekLabel = formatWeekLabel(weekNow);

    db.collection('frammentiPresets').get().then(snap => {
        const presets = [];
        snap.forEach(doc => presets.push({ id: doc.id, ...doc.data() }));
        presets.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'it'));

        let presetOptions = '<option value="__custom__">Quantità personalizzata</option>';
        presets.forEach(p => {
            const q = Number(p.quantity) || 0;
            presetOptions += `<option value="${p.id}" data-qty="${q}" data-name="${(p.name || '').replace(/"/g, '&quot;')}">${(p.name || '—')} — ${formatNumber(q)} fr.</option>`;
        });

        Swal.fire({
            title: 'Nuovo Evento Frammenti',
            html: `
                <p style="text-align:left;font-size:12px;color:#a0a0a0;margin:0 0 8px 4px;">
                    Settimana evento: <b style="color:#a78bfa;">${weekLabel}</b>
                </p>
                <input id="event-name" class="swal2-input" placeholder="Nome Evento / Categoria">
                <label style="display:block;text-align:left;margin:8px 0 4px 4px;color:#a0a0a0;font-size:13px;font-weight:600;">
                    Preset frammenti
                </label>
                <select id="event-preset" class="swal2-select" onchange="onEventPresetChange()">
                    ${presetOptions}
                </select>
                <input id="event-qty" class="swal2-input" type="number" min="1" value="1" placeholder="Quantità frammenti">
                <p style="text-align:left;font-size:11px;color:#6b7280;margin:-6px 4px 8px;line-height:1.4;">
                    Scegli un preset oppure “Quantità personalizzata” e inserisci il numero a mano.
                    ${presets.length === 0 ? '<br><span style="color:#fbbf24;">Nessun preset: usa “Gestisci Preset” per crearne.</span>' : ''}
                </p>
                <label style="display:flex;align-items:center;gap:10px;text-align:left;margin:12px 4px 4px;color:#e0e0e0;font-size:13px;font-weight:600;cursor:pointer;">
                    <input type="checkbox" id="event-repeatable" style="width:18px;height:18px;accent-color:#8b5cf6;cursor:pointer;">
                    Evento ripetibile
                </label>
                <p style="text-align:left;font-size:11px;color:#9ca3af;margin:4px 4px 0;line-height:1.4;">
                    Se attivo resta disponibile ogni settimana (non si archivia), si può assegnare più volte allo stesso player e i punti si sommano.
                </p>
            `,
            confirmButtonText: 'Crea Evento',
            background: '#131a25',
            didOpen: () => {
                // se c'è almeno un preset, lascia custom di default; qty editabile
                onEventPresetChange();
            },
            preConfirm: () => {
                const name = (document.getElementById('event-name').value || '').trim();
                const quantity = parseInt(document.getElementById('event-qty').value, 10);
                const repeatable = !!(document.getElementById('event-repeatable') && document.getElementById('event-repeatable').checked);
                if (!name) {
                    Swal.showValidationMessage('Inserisci un nome evento');
                    return false;
                }
                if (!quantity || quantity < 1) {
                    Swal.showValidationMessage('Inserisci una quantità valida (≥ 1)');
                    return false;
                }
                return { name, quantity, repeatable };
            }
        }).then((result) => {
            if (result.isConfirmed && result.value) {
                const week = getWeekBounds();
                db.collection('frammentiEvents').add({
                    name: result.value.name,
                    quantity: result.value.quantity,
                    repeatable: !!result.value.repeatable,
                    status: 'aperto',
                    weekKey: week.key,
                    weekStart: week.start.toISOString(),
                    weekEnd: week.end.toISOString(),
                    createdAt: new Date().toISOString()
                }).then(() => {
                    const label = result.value.repeatable
                        ? 'Evento ripetibile creato'
                        : 'Evento creato (sett. ' + formatWeekLabel(week.key) + ')';
                    showToast(label);
                });
            }
        });
    }).catch(() => {
        // fallback senza preset se Firestore fallisce
        Swal.fire({
            title: 'Nuovo Evento Frammenti',
            html: `
                <p style="text-align:left;font-size:12px;color:#a0a0a0;margin:0 0 8px 4px;">
                    Settimana evento: <b style="color:#a78bfa;">${weekLabel}</b>
                </p>
                <input id="event-name" class="swal2-input" placeholder="Nome Evento / Categoria">
                <input id="event-qty" class="swal2-input" type="number" min="1" value="1" placeholder="Quantità frammenti">
                <label style="display:flex;align-items:center;gap:10px;text-align:left;margin:12px 4px 4px;color:#e0e0e0;font-size:13px;font-weight:600;cursor:pointer;">
                    <input type="checkbox" id="event-repeatable" style="width:18px;height:18px;accent-color:#8b5cf6;cursor:pointer;">
                    Evento ripetibile
                </label>
            `,
            confirmButtonText: 'Crea Evento',
            background: '#131a25',
            preConfirm: () => {
                const name = (document.getElementById('event-name').value || '').trim();
                const quantity = parseInt(document.getElementById('event-qty').value, 10);
                const repeatable = !!(document.getElementById('event-repeatable') && document.getElementById('event-repeatable').checked);
                if (!name) { Swal.showValidationMessage('Inserisci un nome evento'); return false; }
                if (!quantity || quantity < 1) { Swal.showValidationMessage('Inserisci una quantità valida (≥ 1)'); return false; }
                return { name, quantity, repeatable };
            }
        }).then((result) => {
            if (result.isConfirmed && result.value) {
                const week = getWeekBounds();
                db.collection('frammentiEvents').add({
                    name: result.value.name,
                    quantity: result.value.quantity,
                    repeatable: !!result.value.repeatable,
                    status: 'aperto',
                    weekKey: week.key,
                    weekStart: week.start.toISOString(),
                    weekEnd: week.end.toISOString(),
                    createdAt: new Date().toISOString()
                }).then(() => showToast('Evento creato'));
            }
        });
    });
}

function onEventPresetChange() {
    const sel = document.getElementById('event-preset');
    const qtyInput = document.getElementById('event-qty');
    const nameInput = document.getElementById('event-name');
    if (!sel || !qtyInput) return;
    const opt = sel.options[sel.selectedIndex];
    if (!opt || opt.value === '__custom__') {
        qtyInput.removeAttribute('readonly');
        qtyInput.style.opacity = '1';
        return;
    }
    const q = parseInt(opt.getAttribute('data-qty'), 10);
    if (q > 0) qtyInput.value = q;
    // opzionale: precompila nome se vuoto
    if (nameInput && !(nameInput.value || '').trim()) {
        const n = opt.getAttribute('data-name');
        if (n) nameInput.value = n;
    }
}

/** Gestione preset frammenti (Nome + Quantità) — collection Firestore frammentiPresets */
function manageFrammentiPresets() {
    db.collection('frammentiPresets').get().then(snap => {
        const presets = [];
        snap.forEach(doc => presets.push({ id: doc.id, ...doc.data() }));
        presets.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'it'));

        let listHtml = '';
        if (presets.length === 0) {
            listHtml = '<p style="color:#a0a0a0;padding:8px 4px;">Nessun preset. Aggiungine uno sotto.</p>';
        } else {
            listHtml = presets.map(p => {
                const safeName = (p.name || '').replace(/'/g, "\\'");
                return `<div class="frammenti-preset-item">
                    <div><b>${p.name || '—'}</b><br><span style="color:#a0a0a0;font-size:0.85rem;">${formatNumber(p.quantity || 0)} frammenti</span></div>
                    <button type="button" class="delete-btn" style="padding:6px 10px;font-size:0.7rem;"
                        onclick="deleteFrammentiPreset('${p.id}')">Elimina</button>
                </div>`;
            }).join('');
        }

        Swal.fire({
            title: '🎛 Gestisci Preset Frammenti',
            width: 560,
            background: '#131a25',
            showConfirmButton: true,
            confirmButtonText: 'Chiudi',
            html: `
                <div style="text-align:left;">
                    <p style="font-size:12px;color:#a0a0a0;margin:0 0 10px;line-height:1.45;">
                        Crea preset (nome + quantità). Quando aggiungi un <b>Nuovo Evento</b> puoi selezionarli
                        oppure usare una quantità personalizzata.
                    </p>
                    <div class="frammenti-preset-list" id="preset-list-box">${listHtml}</div>
                    <hr style="border:none;border-top:1px solid rgba(255,255,255,0.08);margin:16px 0;">
                    <p style="color:#c5a059;font-size:13px;font-weight:600;margin-bottom:8px;">+ Nuovo preset</p>
                    <input id="preset-name" class="swal2-input" placeholder="Nome (es. Evento standard, Boss, Mini)">
                    <input id="preset-qty" class="swal2-input" type="number" min="1" value="10" placeholder="Quantità">
                    <button type="button" onclick="saveNewFrammentiPreset()"
                        style="width:100%;margin-top:6px;border-color:#f59e0b;color:#fbbf24;">
                        <i class="fa-solid fa-plus"></i> Aggiungi preset
                    </button>
                </div>
            `
        });
    });
}

function saveNewFrammentiPreset() {
    const name = (document.getElementById('preset-name')?.value || '').trim();
    const quantity = parseInt(document.getElementById('preset-qty')?.value, 10);
    if (!name) {
        showToast('Inserisci un nome per il preset');
        return;
    }
    if (!quantity || quantity < 1) {
        showToast('Inserisci una quantità valida (≥ 1)');
        return;
    }
    db.collection('frammentiPresets').add({
        name,
        quantity,
        createdAt: new Date().toISOString()
    }).then(() => {
        showToast('Preset salvato');
        manageFrammentiPresets(); // riapri lista aggiornata
    });
}

function deleteFrammentiPreset(id) {
    Swal.fire({
        title: 'Eliminare preset?',
        text: 'Non influisce sugli eventi già creati.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Elimina',
        cancelButtonText: 'Annulla',
        confirmButtonColor: '#ef4444',
        background: '#131a25'
    }).then(result => {
        if (!result.isConfirmed) return;
        db.collection('frammentiPresets').doc(id).delete().then(() => {
            showToast('Preset eliminato');
            manageFrammentiPresets();
        });
    });
}

function loadFrammentiEvents() {
    const container = document.getElementById('frammenti-events-list');
    if (!container) return;

    if (_frammentiEventsUnsub) {
        try { _frammentiEventsUnsub(); } catch (e) {}
        _frammentiEventsUnsub = null;
    }

    _frammentiEventsUnsub = db.collection('frammentiEvents').onSnapshot(snapshot => {
        const items = [];
        snapshot.forEach(doc => items.push({ id: doc.id, ...doc.data() }));
        _frammentiAllEvents = items;
        // Sposta eventi aperti (non ripetibili) e assegnazioni pending alla settimana corrente
        rolloverOpenEventsToCurrentWeek();
        refreshFrammentiWeekSelect();
        renderFrammentiEventsList();
    });
}

/** Conta assegnazioni consegnate / totali per un evento (da _frammentiAllItems) */
function getEventDeliveryStats(eventId, eventName) {
    let total = 0;
    let cons = 0;
    const players = new Set();
    (_frammentiAllItems || []).forEach(f => {
        const match = (f.eventId && f.eventId === eventId) ||
                      (!f.eventId && f.eventName === eventName);
        if (!match) return;
        total += 1;
        if (f.status === 'consegnato') cons += 1;
        if (f.playerName) players.add(f.playerName);
    });
    return { total, cons, uniquePlayers: players.size };
}

/**
 * Per evento ripetibile: quante volte ogni player ha partecipato + qty totale.
 * Ritorna array ordinato [{ playerName, times, qty, cons, non }]
 */
function getRepeatablePlayerCounts(eventId, eventName) {
    const map = {};
    (_frammentiAllItems || []).forEach(f => {
        const match = (f.eventId && f.eventId === eventId) ||
                      (!f.eventId && f.eventName === eventName);
        if (!match) return;
        const name = f.playerName || '—';
        if (!map[name]) map[name] = { playerName: name, times: 0, qty: 0, cons: 0, non: 0 };
        const qty = Number(f.quantity) || 0;
        map[name].times += 1;
        map[name].qty += qty;
        if (f.status === 'consegnato') map[name].cons += qty;
        else map[name].non += qty;
    });
    return Object.values(map).sort((a, b) => a.playerName.localeCompare(b.playerName, 'it', { sensitivity: 'base' }));
}

/**
 * Per un player: contatori eventi ripetibili { eventName, times, qty, cons, non, eventId }
 */
function getPlayerRepeatableEventCounts(playerName, items) {
    const source = items || _frammentiAllItems || [];
    const map = {};
    source.forEach(f => {
        if (f.playerName !== playerName) return;
        // Conta come ripetibile se flag sull'assegnazione O sull'evento
        let isRep = !!f.repeatable;
        if (!isRep && f.eventId && _frammentiAllEvents) {
            const ev = (_frammentiAllEvents || []).find(e => e.id === f.eventId);
            if (ev && ev.repeatable) isRep = true;
        }
        if (!isRep && f.eventName && _frammentiAllEvents) {
            const target = String(f.eventName).trim().toLowerCase();
            const ev = (_frammentiAllEvents || []).find(e => String(e.name || '').trim().toLowerCase() === target);
            if (ev && ev.repeatable) isRep = true;
        }
        if (!isRep) return;
        const name = f.eventName || 'Sconosciuto';
        if (!map[name]) map[name] = { eventName: name, eventId: f.eventId || null, times: 0, qty: 0, cons: 0, non: 0 };
        const qty = Number(f.quantity) || 0;
        map[name].times += 1;
        map[name].qty += qty;
        if (f.status === 'consegnato') map[name].cons += qty;
        else map[name].non += qty;
        if (!map[name].eventId && f.eventId) map[name].eventId = f.eventId;
    });
    return Object.values(map).sort((a, b) => a.eventName.localeCompare(b.eventName, 'it', { sensitivity: 'base' }));
}

/**
 * Stato evento: Concluso solo se status === 'concluso', altrimenti Aperto.
 * Cerca per id e poi per nome (case-insensitive). Mai restituisce null.
 */
function resolveEventStatusLabel(eventId, eventName) {
    const events = _frammentiAllEvents || [];
    let ev = null;
    if (eventId) {
        ev = events.find(e => e.id === eventId);
    }
    if (!ev && eventName) {
        const target = String(eventName).trim().toLowerCase();
        ev = events.find(e => String(e.name || '').trim().toLowerCase() === target);
    }
    if (!ev) return 'Aperto';
    return ev.status === 'concluso' ? 'Concluso' : 'Aperto';
}

/** Render card evento (filtri settimana applicati a monte) */
function buildEventCardHTML(e) {
    const wk = weekKeyFromEvent(e);
    const weekBadge = `<span class="week-badge">${formatWeekLabel(wk)}</span>`;
    const safeName = (e.name || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
    const isCurrent = wk === getWeekBounds().key;
    const isRepeatable = !!e.repeatable;
    const archiveTag = (!isRepeatable && !isCurrent)
        ? `<span class="week-badge" style="background:rgba(107,114,128,0.2);border-color:rgba(107,114,128,0.4);color:#9ca3af;">Archiviato</span>`
        : '';
    const repeatBadge = isRepeatable
        ? `<span class="week-badge" style="background:rgba(139,92,246,0.18);border-color:rgba(139,92,246,0.45);color:#a78bfa;">Ripetibile</span>`
        : '';
    const isConcluso = e.status === 'concluso';
    const statusBadge = isConcluso
        ? `<span class="week-badge" style="background:rgba(46,204,113,0.15);border-color:rgba(46,204,113,0.4);color:#2ecc71;">Concluso</span>`
        : `<span class="week-badge" style="background:rgba(197,160,89,0.12);border-color:rgba(197,160,89,0.35);color:#c5a059;">Aperto</span>`;
    const conclusoLabel = isConcluso ? 'Riapri' : 'Concludi';
    const conclusoStyle = isConcluso
        ? 'border-color:#c5a059;color:#c5a059;'
        : 'border-color:#2ecc71;color:#2ecc71;';

    const stats = getEventDeliveryStats(e.id, e.name);
    let deliveryBadge = '';
    if (stats.total > 0) {
        const allDone = stats.cons === stats.total;
        const color = allDone ? '#2ecc71' : (stats.cons === 0 ? '#e74c3c' : '#f59e0b');
        const bg = allDone ? 'rgba(46,204,113,0.15)' : (stats.cons === 0 ? 'rgba(231,76,60,0.12)' : 'rgba(245,158,11,0.12)');
        const border = allDone ? 'rgba(46,204,113,0.4)' : (stats.cons === 0 ? 'rgba(231,76,60,0.35)' : 'rgba(245,158,11,0.4)');
        deliveryBadge = `<span class="week-badge event-delivery-badge" style="background:${bg};border-color:${border};color:${color};font-weight:700;" title="Consegne: ${stats.cons} su ${stats.total} assegnazioni">${stats.cons}/${stats.total}</span>`;
    } else {
        deliveryBadge = `<span class="week-badge event-delivery-badge" style="background:rgba(107,114,128,0.15);border-color:rgba(107,114,128,0.35);color:#9ca3af;" title="Nessuna assegnazione">0/0</span>`;
    }

    // Contatore volte (utile soprattutto per eventi ripetibili)
    let timesBadge = '';
    if (isRepeatable) {
        const nPlayers = stats.uniquePlayers || 0;
        const nTimes = stats.total || 0;
        timesBadge = `<span class="week-badge" style="background:rgba(139,92,246,0.2);border-color:rgba(139,92,246,0.5);color:#c4b5fd;font-weight:700;" title="Partecipazioni totali all'evento ripetibile">${nTimes} volte · ${nPlayers} player</span>`;
    }

    return `
        <div class="card event-card ${isConcluso ? 'event-concluso' : ''} ${isRepeatable ? 'event-repeatable' : ''}">
            <h3>${e.name}</h3>
            <p><b>Frammenti per assegnazione:</b> ${formatNumber(e.quantity)}</p>
            ${isRepeatable ? '<p style="font-size:0.8rem;color:#a78bfa;margin-bottom:6px;">Si può assegnare più volte · i punti si sommano</p>' : ''}
            <div class="event-badges">${deliveryBadge} ${timesBadge} ${repeatBadge} ${weekBadge} ${statusBadge} ${archiveTag}</div>
            <div class="action-buttons event-actions">
                <button class="edit-btn btn-assign-plus" onclick="addFrammentoForEvent('${e.id}')" title="Assegna frammenti a questo evento">
                    ➕
                </button>
                <button class="edit-btn" onclick="openEventFrammentiView('${e.id}', '${safeName}')" title="Partecipanti e consegne">
                    <i class="fa-solid fa-eye"></i> Partecipanti
                </button>
                <button class="edit-btn" style="${conclusoStyle}" onclick="toggleEventConcluso('${e.id}', '${isConcluso ? 'aperto' : 'concluso'}')" title="${conclusoLabel} evento">
                    <i class="fa-solid fa-${isConcluso ? 'rotate-left' : 'flag-checkered'}"></i> ${conclusoLabel}
                </button>
                <button class="delete-btn" onclick="confirmDelete('frammentiEvents', '${e.id}', loadFrammentiEvents)">
                    Elimina
                </button>
            </div>
        </div>
    `;
}

function renderFrammentiEventsList() {
    const container = document.getElementById('frammenti-events-list');
    const conclusiContainer = document.getElementById('frammenti-events-conclusi-list');
    const repContainer = document.getElementById('frammenti-events-repeatable-list');
    const repConclusiContainer = document.getElementById('frammenti-events-repeatable-conclusi-list');
    if (!container) return;

    const items = _frammentiAllEvents || [];
    const normal = items.filter(e => !e.repeatable);
    const repeatable = items.filter(e => !!e.repeatable);

    const applyWeekFilter = (list, { includeOpenCarry = false } = {}) => {
        if (frammentiWeekFilter === 'current') {
            const ck = getWeekBounds().key;
            return list.filter(e => {
                if (weekKeyFromEvent(e) === ck) return true;
                // Carry-over UI: eventi ancora aperti restano visibili nella settimana corrente
                // anche se la weekKey non è ancora aggiornata dal rollover
                if (includeOpenCarry && e.status !== 'concluso') return true;
                return false;
            });
        }
        if (frammentiWeekFilter !== 'all') {
            return list.filter(e => weekKeyFromEvent(e) === frammentiWeekFilter);
        }
        return list.slice();
    };

    let filteredNormal = applyWeekFilter(normal, { includeOpenCarry: true });
    filteredNormal = sortAlpha(filteredNormal, 'name');

    const activeNormal = filteredNormal.filter(e => e.status !== 'concluso');
    // I conclusi restano solo nella loro settimana (niente carry)
    const closedNormalSorted = sortAlpha(
        applyWeekFilter(normal.filter(e => e.status === 'concluso')),
        'name'
    );

    const sortedRep = sortAlpha(repeatable, 'name');
    const activeRep = sortedRep.filter(e => e.status !== 'concluso');
    const closedRep = sortedRep.filter(e => e.status === 'concluso');

    const emptyMsg = (kind) => {
        if (kind === 'active-week') {
            return frammentiWeekFilter === 'all'
                ? 'Nessun evento settimanale attivo. Usa “+ Nuovo Evento” oppure concludi quelli aperti.'
                : 'Nessun evento settimanale attivo in questa settimana.';
        }
        if (kind === 'closed-week') {
            return frammentiWeekFilter === 'all'
                ? 'Nessun evento settimanale concluso.'
                : 'Nessun evento settimanale concluso in questa settimana.';
        }
        if (kind === 'active-rep') return 'Nessun evento ripetibile attivo. In creazione attiva il flag “Evento ripetibile”.';
        return 'Nessun evento ripetibile concluso.';
    };

    const fill = (el, list, emptyKind) => {
        if (!el) return;
        el.innerHTML = '';
        if (list.length === 0) {
            el.innerHTML = `<p style="color:var(--text-dim);padding:10px;">${emptyMsg(emptyKind)}</p>`;
        } else {
            list.forEach(e => { el.innerHTML += buildEventCardHTML(e); });
        }
    };

    fill(container, activeNormal, 'active-week');
    fill(conclusiContainer, closedNormalSorted, 'closed-week');
    fill(repContainer, activeRep, 'active-rep');
    fill(repConclusiContainer, closedRep, 'closed-rep');

    // Mini-riepiloghi sulle sezioni
    const sectionDelivery = (list) => {
        let tot = 0, cons = 0;
        list.forEach(e => {
            const s = getEventDeliveryStats(e.id, e.name);
            tot += s.total;
            cons += s.cons;
        });
        return { tot, cons };
    };

    const weekHintBase = (() => {
        if (frammentiWeekFilter === 'all') return '(tutte)';
        if (frammentiWeekFilter === 'current') {
            const w = getWeekBounds();
            return `(sett. ${formatWeekLabel(w)})`;
        }
        return `(sett. ${formatWeekLabel(frammentiWeekFilter)})`;
    })();

    const setHint = (sel, count, delivery, prefix) => {
        const el = document.querySelector(sel);
        if (!el) return;
        const delPart = delivery.tot > 0 ? ` · consegne ${delivery.cons}/${delivery.tot}` : '';
        const countPart = count === 1 ? '1 evento' : `${count} eventi`;
        const p = prefix || '';
        el.textContent = `${p}${p ? ' · ' : ''}${countPart}${delPart}`;
    };

    const dActive = sectionDelivery(activeNormal);
    const dClosed = sectionDelivery(closedNormalSorted);
    const dRepA = sectionDelivery(activeRep);
    const dRepC = sectionDelivery(closedRep);

    setHint('#frammenti-events-filter-hint', activeNormal.length, dActive, weekHintBase);
    setHint('#frammenti-events-conclusi-filter-hint', closedNormalSorted.length, dClosed, weekHintBase);

    const repActiveHint = document.getElementById('frammenti-rep-active-hint');
    if (repActiveHint) {
        const del = dRepA.tot > 0 ? ` · consegne ${dRepA.cons}/${dRepA.tot}` : '';
        const c = activeRep.length === 1 ? '1 evento' : `${activeRep.length} eventi`;
        repActiveHint.textContent = `(restano attivi ogni settimana) · ${c}${del}`;
    }
    const repClosedHint = document.getElementById('frammenti-rep-closed-hint');
    if (repClosedHint) {
        const del = dRepC.tot > 0 ? ` · consegne ${dRepC.cons}/${dRepC.tot}` : '';
        const c = closedRep.length === 1 ? '1 evento' : `${closedRep.length} eventi`;
        repClosedHint.textContent = `${c}${del}`;
    }
}

/** Occhio sull'evento: settimana + giocatori che hanno ricevuto frammenti per questo evento */
/** Costruisce riga tabella partecipanti evento (consegna singola + checkbox multi) */
function buildEventParticipantRow(p, eventId, eventName) {
    const isCons = p.status === 'consegnato';
    const st = isCons
        ? '<span style="color:#2ecc71;font-weight:600;">Consegnato</span>'
        : '<span style="color:#e74c3c;font-weight:600;">Da consegnare</span>';
    const nextStatus = isCons ? 'non_consegnato' : 'consegnato';
    const btnLabel = isCons ? 'Annulla consegna' : 'Consegna';
    const btnColor = isCons ? '#e74c3c' : '#2ecc71';
    const safeEvent = (eventName || '').replace(/'/g, "\\'");
    // Checkbox solo per i da consegnare (selezione multipla)
    const checkCell = isCons
        ? '<td></td>'
        : `<td style="width:36px;text-align:center;">
            <input type="checkbox" class="event-fr-check" value="${p.id}"
                style="width:auto;margin:0;accent-color:#2ecc71;cursor:pointer;transform:scale(1.15);">
           </td>`;
    const when = formatDateTime(p.createdAt);
    const whenHtml = when
        ? `<br><small style="color:#a78bfa;"><i class="fa-regular fa-clock"></i> ${when}</small>`
        : '';
    return `<tr>
        ${checkCell}
        <td><b>${p.playerName}</b>${whenHtml}${p.note ? `<br><small style="color:#a0a0a0;">${p.note}</small>` : ''}</td>
        <td>${formatNumber(p.quantity)}</td>
        <td>${st}</td>
        <td>
            <button type="button"
                onclick="toggleSingleFrammentoStatus('${p.id}', '${nextStatus}', '${eventId}', '${safeEvent}')"
                style="padding:6px 10px;font-size:0.7rem;border:1px solid ${btnColor};color:${btnColor};background:transparent;cursor:pointer;border-radius:0;text-transform:uppercase;">
                ${btnLabel}
            </button>
        </td>
    </tr>`;
}

/** Aggiorna le tabelle partecipanti nel modal evento in base al flag “mostra consegnati” */
function refreshEventFrammentiViewRows() {
    const showCons = !!(document.getElementById('event-fr-show-consegnati') || {}).checked;
    window._eventFrammentiShowConsegnati = showCons;
    const data = window._eventFrammentiData;
    if (!data) return;

    const { pending, delivered, eventId, eventName } = data;
    const tbodyPending = document.getElementById('event-fr-tbody-pending');
    const tbodyCons = document.getElementById('event-fr-tbody-consegnati');
    const sectionCons = document.getElementById('event-fr-section-consegnati');
    const hintPending = document.getElementById('event-fr-hint-pending');
    const batchBar = document.getElementById('event-fr-batch-bar');
    const selectAll = document.getElementById('event-fr-select-all');

    if (tbodyPending) {
        if (pending.length === 0) {
            tbodyPending.innerHTML = '<tr><td colspan="5" style="color:#a0a0a0;">Nessun frammento da consegnare.</td></tr>';
        } else {
            tbodyPending.innerHTML = pending.map(p => buildEventParticipantRow(p, eventId, eventName)).join('');
        }
    }
    if (hintPending) {
        hintPending.textContent = pending.length
            ? `(${pending.length} da consegnare)`
            : '(nessuno in sospeso)';
    }
    if (batchBar) {
        batchBar.style.display = pending.length > 0 ? 'flex' : 'none';
    }
    if (selectAll) {
        selectAll.checked = false;
    }
    if (sectionCons) {
        sectionCons.style.display = showCons ? 'block' : 'none';
    }
    if (tbodyCons && showCons) {
        if (delivered.length === 0) {
            tbodyCons.innerHTML = '<tr><td colspan="5" style="color:#a0a0a0;">Nessuna consegna registrata.</td></tr>';
        } else {
            tbodyCons.innerHTML = delivered.map(p => buildEventParticipantRow(p, eventId, eventName)).join('');
        }
    }
}

function openEventFrammentiView(eventId, eventName) {
    Promise.all([
        db.collection('frammentiEvents').doc(eventId).get(),
        db.collection('frammenti').get()
    ]).then(([eventDoc, frSnap]) => {
        const ev = eventDoc.exists ? eventDoc.data() : {};
        const wk = ev.weekKey || (ev.createdAt ? getWeekBounds(ev.createdAt).key : null);
        const weekLabel = wk ? formatWeekLabel(wk) : '—';
        const eventStatus = ev.status === 'concluso' ? 'Concluso' : 'Aperto';

        const participants = [];
        let totalQty = 0, totalCons = 0, totalNon = 0;

        frSnap.forEach(doc => {
            const f = doc.data();
            const match = (f.eventId && f.eventId === eventId) ||
                          (!f.eventId && f.eventName === eventName);
            if (!match) return;
            const qty = Number(f.quantity) || 0;
            totalQty += qty;
            if (f.status === 'consegnato') totalCons += qty;
            else totalNon += qty;
            participants.push({
                id: doc.id,
                playerName: f.playerName || '—',
                quantity: qty,
                status: f.status || 'non_consegnato',
                note: f.note || '',
                weekKey: weekKeyFromItem(f),
                createdAt: f.createdAt || ''
            });
        });

        participants.sort((a, b) => String(a.playerName || '').localeCompare(String(b.playerName || ''), 'it', { sensitivity: 'base' }));

        const pending = participants.filter(p => p.status !== 'consegnato');
        const delivered = participants.filter(p => p.status === 'consegnato');

        window._eventFrammentiData = { pending, delivered, eventId, eventName, participants };
        const showCons = !!window._eventFrammentiShowConsegnati;

        let rowsPending = '';
        if (pending.length === 0) {
            rowsPending = participants.length === 0
                ? '<tr><td colspan="5" style="color:#a0a0a0;">Nessun giocatore assegnato. Usa ➕ sulla card evento.</td></tr>'
                : '<tr><td colspan="5" style="color:#a0a0a0;">Nessun frammento da consegnare — tutto consegnato.</td></tr>';
        } else {
            rowsPending = pending.map(p => buildEventParticipantRow(p, eventId, eventName)).join('');
        }

        let rowsCons = '';
        if (delivered.length === 0) {
            rowsCons = '<tr><td colspan="5" style="color:#a0a0a0;">Nessuna consegna registrata.</td></tr>';
        } else {
            rowsCons = delivered.map(p => buildEventParticipantRow(p, eventId, eventName)).join('');
        }

        const safeEventName = (eventName || '').replace(/'/g, "\\'");
        const batchBarDisplay = pending.length > 0 ? 'flex' : 'none';

        const isRep = !!ev.repeatable;
        const byPlayerAgg = {};
        participants.forEach(p => {
            if (!byPlayerAgg[p.playerName]) byPlayerAgg[p.playerName] = { qty: 0, times: 0 };
            byPlayerAgg[p.playerName].qty += p.quantity;
            byPlayerAgg[p.playerName].times += 1;
        });
        let sumRows = '';
        Object.keys(byPlayerAgg).sort().forEach(name => {
            const a = byPlayerAgg[name];
            sumRows += `<tr>
                <td>${name}</td>
                <td style="color:#a78bfa;font-weight:700;">${a.times}×</td>
                <td>${formatNumber(a.qty)}</td>
            </tr>`;
        });

        Swal.fire({
            title: '👁 ' + eventName,
            width: 700,
            background: '#131a25',
            showConfirmButton: true,
            confirmButtonText: 'Chiudi',
            html: `
                <div style="text-align:left;">
                    <p style="margin-bottom:6px;color:#a0a0a0;font-size:13px;">
                        <b style="color:#a78bfa;">Settimana:</b> ${weekLabel}
                        &nbsp;·&nbsp; <b>Stato evento:</b> ${eventStatus}
                        ${isRep ? '&nbsp;·&nbsp; <b style="color:#a78bfa;">Evento ripetibile</b>' : ''}
                    </p>
                    ${isRep ? `<p style="margin-bottom:10px;font-size:12px;color:#a78bfa;">I punti si sommano a ogni assegnazione. Puoi assegnarlo più volte allo stesso player.</p>` : ''}
                    <p style="margin-bottom:12px;color:#a0a0a0;font-size:13px;">
                        Quantità per assegnazione: <b>${formatNumber(ev.quantity || 0)}</b> frammenti
                    </p>
                    <div class="frammenti-recap-total" style="margin-bottom:14px;">
                        Assegnazioni: <b>${participants.length}</b>
                        &nbsp;·&nbsp; Tot. ${formatNumber(totalQty)} fr.
                        &nbsp;·&nbsp; <span style="color:#2ecc71;">${formatNumber(totalCons)} cons.</span>
                        &nbsp;·&nbsp; <span style="color:#e74c3c;">${formatNumber(totalNon)} da consegnare</span>
                    </div>
                    ${isRep && sumRows ? `
                    <p style="margin-bottom:6px;color:#a78bfa;font-size:13px;font-weight:600;">Contatore ripetizioni per player</p>
                    <table class="frammenti-recap-table" style="margin-bottom:14px;">
                        <thead><tr><th>Player</th><th>Volte</th><th>Tot. frammenti</th></tr></thead>
                        <tbody>${sumRows}</tbody>
                    </table>
                    ` : ''}

                    <div style="margin:12px 0 14px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                        <label style="display:inline-flex;align-items:center;gap:8px;cursor:pointer;color:#c5a059;font-size:13px;font-weight:600;user-select:none;">
                            <input type="checkbox" id="event-fr-show-consegnati" ${showCons ? 'checked' : ''}
                                onchange="refreshEventFrammentiViewRows()"
                                style="width:auto;margin:0;accent-color:#2ecc71;cursor:pointer;">
                            Mostra già consegnati
                            <span style="color:#9ca3af;font-weight:400;">(${delivered.length})</span>
                        </label>
                    </div>

                    <p style="margin-bottom:8px;color:#e74c3c;font-size:13px;font-weight:600;">
                        Da consegnare <span id="event-fr-hint-pending" style="font-weight:400;color:#a0a0a0;">(${pending.length} da consegnare)</span>
                    </p>

                    <div id="event-fr-batch-bar" style="display:${batchBarDisplay};flex-wrap:wrap;align-items:center;gap:10px;margin-bottom:12px;">
                        <button type="button" onclick="toggleEventFrSelectAll()"
                            style="padding:8px 12px;font-size:0.72rem;border:1px solid #c5a059;color:#c5a059;background:transparent;cursor:pointer;text-transform:uppercase;">
                            <i class="fa-solid fa-check-double"></i> Seleziona / deseleziona tutti
                        </button>
                        <button type="button" onclick="deliverSelectedFrammenti('${eventId}', '${safeEventName}')"
                            style="padding:8px 12px;font-size:0.72rem;border:1px solid #2ecc71;color:#2ecc71;background:transparent;cursor:pointer;text-transform:uppercase;">
                            <i class="fa-solid fa-check"></i> Consegna selezionati
                        </button>
                        <button type="button" onclick="deliverAllPendingFrammenti('${eventId}', '${safeEventName}')"
                            style="padding:8px 12px;font-size:0.72rem;border:1px solid #8b5cf6;color:#a78bfa;background:transparent;cursor:pointer;text-transform:uppercase;">
                            <i class="fa-solid fa-bolt"></i> Consegna tutti
                        </button>
                    </div>

                    <table class="frammenti-recap-table">
                        <thead>
                            <tr>
                                <th style="width:36px;text-align:center;">
                                    <input type="checkbox" id="event-fr-select-all" title="Seleziona tutti"
                                        onclick="toggleEventFrSelectAll(this.checked)"
                                        style="width:auto;margin:0;accent-color:#2ecc71;cursor:pointer;transform:scale(1.15);">
                                </th>
                                <th>Player</th>
                                <th>Qty</th>
                                <th>Stato</th>
                                <th>Azione</th>
                            </tr>
                        </thead>
                        <tbody id="event-fr-tbody-pending">${rowsPending}</tbody>
                    </table>

                    <div id="event-fr-section-consegnati" style="display:${showCons ? 'block' : 'none'};margin-top:18px;">
                        <p style="margin-bottom:8px;color:#2ecc71;font-size:13px;font-weight:600;">
                            Già consegnati <span style="font-weight:400;color:#a0a0a0;">(${delivered.length})</span>
                        </p>
                        <table class="frammenti-recap-table">
                            <thead>
                                <tr>
                                    <th style="width:36px;"></th>
                                    <th>Player</th>
                                    <th>Qty</th>
                                    <th>Stato</th>
                                    <th>Azione</th>
                                </tr>
                            </thead>
                            <tbody id="event-fr-tbody-consegnati">${rowsCons}</tbody>
                        </table>
                    </div>
                </div>
            `
        });
    });
}

/** Seleziona / deseleziona tutte le checkbox “da consegnare” nel modal evento */
function toggleEventFrSelectAll(forceChecked) {
    const boxes = document.querySelectorAll('.event-fr-check');
    if (!boxes.length) return;
    let checked;
    if (typeof forceChecked === 'boolean') {
        checked = forceChecked;
    } else {
        const anyUnchecked = Array.from(boxes).some(b => !b.checked);
        checked = anyUnchecked;
    }
    boxes.forEach(b => { b.checked = checked; });
    const selectAll = document.getElementById('event-fr-select-all');
    if (selectAll) selectAll.checked = checked;
}

/** Consegna in batch gli ID selezionati (checkbox) */
function deliverSelectedFrammenti(eventId, eventName) {
    const boxes = document.querySelectorAll('.event-fr-check:checked');
    const ids = Array.from(boxes).map(b => b.value).filter(Boolean);
    if (ids.length === 0) {
        Swal.fire({
            icon: 'info',
            title: 'Nessuna selezione',
            text: 'Seleziona almeno un player da consegnare (checkbox a sinistra).',
            background: '#131a25'
        });
        return;
    }
    Swal.fire({
        title: 'Consegnare selezionati?',
        text: `Stai per segnare ${ids.length} assegnazion${ids.length === 1 ? 'e' : 'i'} come consegnat${ids.length === 1 ? 'a' : 'e'}.`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Consegna',
        cancelButtonText: 'Annulla',
        confirmButtonColor: '#2ecc71',
        background: '#131a25'
    }).then(result => {
        if (!result.isConfirmed) return;
        const updates = ids.map(id =>
            db.collection('frammenti').doc(id).update({ status: 'consegnato' })
        );
        Promise.all(updates).then(() => {
            showToast(ids.length === 1
                ? '1 assegnazione consegnata'
                : ids.length + ' assegnazioni consegnate');
            openEventFrammentiView(eventId, eventName);
        }).catch(err => {
            showToast('Errore durante la consegna');
            console.error(err);
        });
    });
}

/** Consegna tutte le assegnazioni ancora in sospeso per questo evento */
function deliverAllPendingFrammenti(eventId, eventName) {
    const data = window._eventFrammentiData;
    if (!data || !data.pending || data.pending.length === 0) {
        Swal.fire({
            icon: 'info',
            title: 'Niente da consegnare',
            text: 'Non ci sono assegnazioni in sospeso per questo evento.',
            background: '#131a25'
        });
        return;
    }
    const ids = data.pending.map(p => p.id);
    Swal.fire({
        title: 'Consegnare tutti?',
        text: `Stai per segnare tutte le ${ids.length} assegnazioni in sospeso come consegnate.`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Consegna tutti',
        cancelButtonText: 'Annulla',
        confirmButtonColor: '#8b5cf6',
        background: '#131a25'
    }).then(result => {
        if (!result.isConfirmed) return;
        const updates = ids.map(id =>
            db.collection('frammenti').doc(id).update({ status: 'consegnato' })
        );
        Promise.all(updates).then(() => {
            showToast(ids.length === 1
                ? '1 assegnazione consegnata'
                : 'Tutte le ' + ids.length + ' assegnazioni consegnate');
            openEventFrammentiView(eventId, eventName);
        }).catch(err => {
            showToast('Errore durante la consegna');
            console.error(err);
        });
    });
}

/** Consegna / annulla consegna di un singolo player (dalla vista evento) */
function toggleSingleFrammentoStatus(frammentoId, nextStatus, eventId, eventName) {
    db.collection('frammenti').doc(frammentoId).update({ status: nextStatus }).then(() => {
        showToast(nextStatus === 'consegnato' ? 'Frammenti consegnati al player' : 'Consegna annullata');
        openEventFrammentiView(eventId, eventName);
    });
}

/** Marca evento come concluso o lo riapre */
function toggleEventConcluso(eventId, nextStatus) {
    db.collection('frammentiEvents').doc(eventId).update({ status: nextStatus }).then(() => {
        showToast(nextStatus === 'concluso' ? 'Evento segnato come concluso' : 'Evento riaperto');
    });
}

/**
 * Assegna frammenti partendo dalla card di un evento specifico.
 * - Evento non ripetibile: in lista solo i player NON ancora assegnati a questo evento.
 * - Evento ripetibile: tutti i player (si può riassegnare).
 * Player divisi in due liste: Vampiri e Ospiti (solo quelle cartelle).
 */
function addFrammentoForEvent(eventId) {
    if (!eventId) return;

    Promise.all([
        db.collection('players').get(),
        db.collection('frammentiEvents').doc(eventId).get(),
        db.collection('frammenti').get(),
        db.collection('folders').where('type', '==', 'players').get()
    ]).then(([playersSnap, eventDoc, frammentiSnap, foldersSnap]) => {
        if (!eventDoc.exists) {
            Swal.fire({ icon: 'error', title: 'Errore', text: 'Evento non trovato.', background: '#131a25' });
            return;
        }

        const ev = { id: eventDoc.id, ...eventDoc.data() };
        const isRepeatable = !!ev.repeatable;

        // Cartelle: match flessibile sul nome
        // Vampiri → nome con "vamp"
        // Ospiti  → nome con "ospit" (ospiti, ospite, ospitato…)
        const folderNames = [];
        let vampiriFolderIds = [];
        let ospitiFolderIds = [];
        foldersSnap.forEach(doc => {
            const raw = String((doc.data() || {}).name || '').trim();
            const name = raw.toLowerCase();
            folderNames.push(raw || '(senza nome)');
            if (/vamp/.test(name)) vampiriFolderIds.push(doc.id);
            if (/ospit/.test(name)) ospitiFolderIds.push(doc.id);
        });
        const vampiriSet = new Set(vampiriFolderIds);
        const ospitiSet = new Set(ospitiFolderIds);

        // Player già assegnati (solo non ripetibili)
        const alreadyAssigned = new Set();
        if (!isRepeatable) {
            const evNameNorm = String(ev.name || '').trim().toLowerCase();
            frammentiSnap.forEach(doc => {
                const f = doc.data();
                const byId = f.eventId && f.eventId === eventId;
                const byName = f.eventName && String(f.eventName).trim().toLowerCase() === evNameNorm;
                if ((byId || byName) && f.playerName) {
                    alreadyAssigned.add(String(f.playerName).trim().toLowerCase());
                }
            });
        }

        const vampiri = [];
        const ospiti = [];
        playersSnap.forEach(doc => {
            const p = doc.data();
            if (!p.name) return;
            // escludi uscite registrate (rito / uscita ospitato)
            if (p.exitType === 'rito' || p.exitType === 'uscita_ospitato' || p.rito === true) return;
            if (!isRepeatable) {
                const key = String(p.name).trim().toLowerCase();
                if (alreadyAssigned.has(key)) return;
            }
            const item = { id: doc.id, ...p };
            if (p.folderId && vampiriSet.has(p.folderId)) {
                vampiri.push(item);
            } else if (p.folderId && ospitiSet.has(p.folderId)) {
                ospiti.push(item);
            }
        });
        sortAlpha(vampiri, 'name');
        sortAlpha(ospiti, 'name');

        if (playersSnap.empty) {
            Swal.fire({
                icon: 'warning',
                title: 'Attenzione',
                text: 'Nessun giocatore presente. Aggiungine uno nella sezione Giocatori.',
                background: '#131a25'
            });
            return;
        }

        if (vampiriFolderIds.length === 0 && ospitiFolderIds.length === 0) {
            Swal.fire({
                icon: 'warning',
                title: 'Cartelle non trovate',
                html: `<p style="text-align:left;">Non trovo cartelle <b>Vampiri</b> o <b>Ospiti</b> (type players).<br>
                    Cartelle attuali:<br><code style="color:#c5a059;">${folderNames.join(', ') || 'nessuna'}</code><br><br>
                    Rinomina le cartelle includendo “Vampiri” e “Ospiti” nel nome.</p>`,
                background: '#131a25'
            });
            return;
        }

        if (vampiri.length === 0 && ospiti.length === 0) {
            const msg = !isRepeatable && alreadyAssigned.size > 0
                ? 'Tutti i player di Vampiri/Ospiti sono già assegnati a questo evento.'
                : 'Nessun player nelle cartelle Vampiri o Ospiti.';
            Swal.fire({ icon: 'info', title: 'Nessun player', text: msg, background: '#131a25' });
            return;
        }

        function optsHtml(list) {
            if (!list.length) {
                return '<option disabled value="">— nessuno —</option>';
            }
            return list.map(p =>
                `<option value="${String(p.name).replace(/"/g, '&quot;')}">${p.name}</option>`
            ).join('');
        }

        // Sempre entrambe le sezioni visibili
        const vampiriBlock = `
            <label style="display:block;text-align:left;margin:12px 0 4px 4px;color:#c5a059;font-size:13px;font-weight:700;">
                🧛 Vampiri <span style="color:#9ca3af;font-weight:400;">(${vampiri.length})</span>
            </label>
            <select id="fr-player-vampiri" class="swal2-select" multiple size="${Math.min(7, Math.max(3, vampiri.length || 3))}" style="height:auto !important;min-height:100px;">
                ${optsHtml(vampiri)}
            </select>
        `;
        const ospitiBlock = `
            <label style="display:block;text-align:left;margin:14px 0 4px 4px;color:#38bdf8;font-size:13px;font-weight:700;">
                🚪 Ospiti <span style="color:#9ca3af;font-weight:400;">(${ospiti.length})</span>
            </label>
            <select id="fr-player-ospiti" class="swal2-select" multiple size="${Math.min(7, Math.max(3, ospiti.length || 3))}" style="height:auto !important;min-height:100px;">
                ${optsHtml(ospiti)}
            </select>
        `;

        const weekNow = getWeekBounds();
        const weekLabel = formatWeekLabel(weekNow);
        const repHint = isRepeatable
            ? '<span style="color:#a78bfa;">Evento ripetibile — puoi assegnare di nuovo gli stessi player</span>'
            : '<span style="color:#c5a059;">Evento non ripetibile — solo player non ancora assegnati</span>';
        const excludedHint = (!isRepeatable && alreadyAssigned.size > 0)
            ? `<p style="text-align:left;font-size:12px;color:#9ca3af;margin:0 0 8px 4px;">Già assegnati e nascosti: <b>${alreadyAssigned.size}</b></p>`
            : '';

        Swal.fire({
            title: 'Assegna — ' + (ev.name || 'Evento'),
            html: `
                <p style="text-align:left;font-size:12px;color:#a0a0a0;margin:0 0 8px 4px;">
                    Settimana attuale: <b style="color:#a78bfa;">${weekLabel}</b><br>
                    Quantità: <b style="color:#c5a059;">${formatNumber(ev.quantity || 0)}</b> frammenti<br>
                    ${repHint}
                </p>
                ${excludedHint}
                <p style="text-align:left;font-size:11px;color:#6b7280;margin:0 0 4px 4px;">
                    Seleziona da una o entrambe le liste (Ctrl / Cmd per multipla)
                </p>
                ${vampiriBlock}
                ${ospitiBlock}
                <textarea id="fr-note" class="swal2-textarea" placeholder="Note opzionali (uguali per tutti i selezionati)"></textarea>
            `,
            confirmButtonText: 'Assegna',
            background: '#131a25',
            preConfirm: () => {
                const selV = document.getElementById('fr-player-vampiri');
                const selO = document.getElementById('fr-player-ospiti');
                const fromV = selV ? Array.from(selV.selectedOptions).map(o => o.value).filter(Boolean) : [];
                const fromO = selO ? Array.from(selO.selectedOptions).map(o => o.value).filter(Boolean) : [];
                const selectedPlayers = [...fromV, ...fromO];
                const note = (document.getElementById('fr-note').value || '').trim();
                if (selectedPlayers.length === 0) {
                    Swal.showValidationMessage('Seleziona almeno un vampiro o un ospite');
                    return false;
                }
                const week = getWeekBounds();
                return {
                    players: selectedPlayers,
                    eventId: ev.id,
                    eventName: ev.name,
                    quantity: ev.quantity,
                    repeatable: isRepeatable,
                    note,
                    weekKey: week.key,
                    weekStart: week.start.toISOString(),
                    weekEnd: week.end.toISOString()
                };
            }
        }).then((result) => {
            if (!result.isConfirmed || !result.value) return;
            const base = result.value;
            const createdAt = new Date().toISOString();
            const adds = base.players.map(playerName =>
                db.collection('frammenti').add({
                    playerName,
                    eventId: base.eventId,
                    eventName: base.eventName,
                    quantity: base.quantity,
                    repeatable: !!base.repeatable,
                    status: 'non_consegnato',
                    note: base.note,
                    weekKey: base.weekKey,
                    weekStart: base.weekStart,
                    weekEnd: base.weekEnd,
                    createdAt
                })
            );
            Promise.all(adds).then(() => {
                const n = base.players.length;
                showToast(n + (n === 1 ? ' assegnazione creata' : ' assegnazioni create') + ' (sett. ' + formatWeekLabel(base.weekKey) + ')');
            });
        });
    }).catch(err => {
        console.error(err);
        Swal.fire({ icon: 'error', title: 'Errore', text: 'Impossibile caricare i dati per l\'assegnazione.', background: '#131a25' });
    });
}


function addFrammento() {
    Promise.all([
        db.collection('players').get(),
        db.collection('frammentiEvents').get()
    ]).then(([playersSnap, eventsSnap]) => {
        let playerOptions = '';
        const playersList = [];
        playersSnap.forEach(doc => {
            const p = doc.data();
            if (p.name) playersList.push(p);
        });
        sortAlpha(playersList, 'name').forEach(p => {
            playerOptions += `<option value="${p.name.replace(/"/g, '&quot;')}">${p.name}</option>`;
        });

        let eventOptions = '<option value="">Seleziona evento</option>';
        const eventsMap = {};
        const eventsList = [];
        eventsSnap.forEach(doc => {
            const e = doc.data();
            eventsMap[doc.id] = e;
            eventsList.push({ id: doc.id, ...e });
        });
        sortAlpha(eventsList, 'name').forEach(e => {
            const repTag = e.repeatable ? ' · ripetibile' : '';
            eventOptions += `<option value="${e.id}">${e.name} (${formatNumber(e.quantity)} fr.${repTag})</option>`;
        });

        if (playersSnap.empty) {
            Swal.fire({ icon: 'warning', title: 'Attenzione', text: 'Nessun giocatore presente. Aggiungine uno nella sezione Giocatori.', background: '#131a25' });
            return;
        }
        if (eventsSnap.empty) {
            Swal.fire({ icon: 'warning', title: 'Attenzione', text: 'Nessun evento presente. Crea prima un evento.', background: '#131a25' });
            return;
        }

        const weekNow = getWeekBounds();
        const weekLabel = formatWeekLabel(weekNow);

        Swal.fire({
            title: 'Assegna Frammenti',
            html: `
                <p style="text-align:left;font-size:12px;color:#a0a0a0;margin:0 0 8px 4px;">
                    Settimana attuale: <b style="color:#a78bfa;">${weekLabel}</b>
                </p>
                <label style="display:block;text-align:left;margin:8px 0 4px 4px;color:#a0a0a0;font-size:13px;font-weight:600;">
                    Vampiri (tieni Ctrl / Cmd per selezionarne più di uno)
                </label>
                <select id="fr-player" class="swal2-select" multiple size="6" style="height:auto !important;min-height:140px;">
                    ${playerOptions}
                </select>
                <label style="display:block;text-align:left;margin:8px 0 4px 4px;color:#a0a0a0;font-size:13px;font-weight:600;">Evento / Categoria</label>
                <select id="fr-event" class="swal2-select">${eventOptions}</select>
                <textarea id="fr-note" class="swal2-textarea" placeholder="Note opzionali (uguali per tutti i selezionati)"></textarea>
            `,
            confirmButtonText: 'Assegna',
            background: '#131a25',
            preConfirm: () => {
                const playerSelect = document.getElementById('fr-player');
                const selectedPlayers = Array.from(playerSelect.selectedOptions).map(o => o.value).filter(Boolean);
                const eventId = document.getElementById('fr-event').value;
                const note = (document.getElementById('fr-note').value || '').trim();
                if (selectedPlayers.length === 0) {
                    Swal.showValidationMessage('Seleziona almeno un vampiro');
                    return false;
                }
                if (!eventId) {
                    Swal.showValidationMessage('Seleziona un evento');
                    return false;
                }
                const ev = eventsMap[eventId];
                const week = getWeekBounds();
                return {
                    players: selectedPlayers,
                    eventId,
                    eventName: ev.name,
                    quantity: ev.quantity,
                    repeatable: !!ev.repeatable,
                    status: 'non_consegnato',
                    note,
                    weekKey: week.key,
                    weekStart: week.start.toISOString(),
                    weekEnd: week.end.toISOString()
                };
            }
        }).then((result) => {
            if (!result.isConfirmed || !result.value) return;
            const base = result.value;
            const createdAt = new Date().toISOString();
            const adds = base.players.map(playerName =>
                db.collection('frammenti').add({
                    playerName,
                    eventId: base.eventId,
                    eventName: base.eventName,
                    quantity: base.quantity,
                    repeatable: !!base.repeatable,
                    status: 'non_consegnato',
                    note: base.note,
                    weekKey: base.weekKey,
                    weekStart: base.weekStart,
                    weekEnd: base.weekEnd,
                    createdAt
                })
            );
            Promise.all(adds).then(() => {
                const n = base.players.length;
                showToast(n + (n === 1 ? ' assegnazione creata' : ' assegnazioni create') + ' (sett. ' + formatWeekLabel(base.weekKey) + ')');
            });
        });
    });
}

function onFrammentiWeekChange() {
    const sel = document.getElementById('frammenti-week-select');
    if (!sel) return;
    frammentiWeekFilter = sel.value;
    renderFrammentiEventsList();
    renderFrammentiList(_frammentiAllItems);
    updateFrammentiWeekLabel();
}

function updateFrammentiWeekLabel() {
    const labelEl = document.getElementById('frammenti-week-label');
    const hintEl = document.getElementById('frammenti-filter-hint');
    if (!labelEl) return;

    let hintText = '';
    if (frammentiWeekFilter === 'all') {
        labelEl.textContent = 'Log completo di tutte le settimane (anche archiviate)';
        hintText = '(tutte)';
    } else if (frammentiWeekFilter === 'current') {
        const w = getWeekBounds();
        labelEl.textContent = formatWeekLabel(w) + ' — settimana attiva';
        hintText = `(sett. ${formatWeekLabel(w)})`;
    } else {
        labelEl.textContent = formatWeekLabel(frammentiWeekFilter) + ' — archivio';
        hintText = `(sett. ${formatWeekLabel(frammentiWeekFilter)})`;
    }
    if (hintEl) hintEl.textContent = hintText;
    // I mini-riepiloghi (eventi + consegne) li scrive renderFrammentiEventsList
}

/** Unisce settimane da assegnazioni + eventi per il selettore */
function refreshFrammentiWeekSelect() {
    const sel = document.getElementById('frammenti-week-select');
    if (!sel) return;
    const currentVal = sel.value || frammentiWeekFilter || 'current';
    const weeks = new Set();
    (_frammentiAllItems || []).forEach(f => weeks.add(weekKeyFromItem(f)));
    (_frammentiAllEvents || []).forEach(e => weeks.add(weekKeyFromEvent(e)));
    const sorted = Array.from(weeks).sort().reverse();
    const currentKey = getWeekBounds().key;

    let html = `<option value="current">Settimana corrente (${formatWeekLabel(currentKey)})</option>`;
    html += `<option value="all">Tutte le settimane (log completo)</option>`;
    sorted.forEach(k => {
        if (k === currentKey) return;
        html += `<option value="${k}">${formatWeekLabel(k)} — archivio</option>`;
    });
    sel.innerHTML = html;
    if ([...sel.options].some(o => o.value === currentVal)) {
        sel.value = currentVal;
        frammentiWeekFilter = currentVal;
    } else {
        sel.value = 'current';
        frammentiWeekFilter = 'current';
    }
    updateFrammentiWeekLabel();
}

function renderFrammentiList(items) {
    const container = document.getElementById('frammenti-list');
    if (!container) return;

    // Eventi ancora aperti (per carry delle assegnazioni pending)
    const openEventIds = new Set();
    const openEventNames = new Set();
    (_frammentiAllEvents || []).forEach(e => {
        if (e.status === 'concluso') return;
        openEventIds.add(e.id);
        if (e.name) openEventNames.add(String(e.name).trim().toLowerCase());
    });

    let filtered = items.slice();
    if (frammentiWeekFilter === 'current') {
        const ck = getWeekBounds().key;
        filtered = items.filter(f => {
            if (weekKeyFromItem(f) === ck) return true;
            // Carry: assegnazioni non consegnate di eventi ancora aperti restano in vista "corrente"
            if (f.status === 'consegnato') return false;
            const byId = f.eventId && openEventIds.has(f.eventId);
            const byName = f.eventName && openEventNames.has(String(f.eventName).trim().toLowerCase());
            return byId || byName;
        });
    } else if (frammentiWeekFilter !== 'all') {
        filtered = items.filter(f => weekKeyFromItem(f) === frammentiWeekFilter);
    }

    // Di default solo da consegnare (lista nascosta in UI; coerente con le altre viste)
    if (!window._frammentiListShowConsegnati) {
        filtered = filtered.filter(f => f.status !== 'consegnato');
    }

    filtered = sortAlpha(filtered, 'playerName');

    container.innerHTML = '';
    if (filtered.length === 0) {
        container.innerHTML = '<p style="color:var(--text-dim);padding:10px;">Nessuna assegnazione da consegnare in questa settimana. Usa ➕ sulla card evento oppure cambia filtro settimana.</p>';
        return;
    }

    filtered.forEach(f => {
        const statusLabel = f.status === 'consegnato' ? 'Consegnato' : 'Da consegnare';
        const statusClass = f.status === 'consegnato' ? 'consegnato' : 'non_consegnato';
        const toggleLabel = f.status === 'consegnato' ? 'Segna non consegnato' : 'Segna consegnato';
        const nextStatus = f.status === 'consegnato' ? 'non_consegnato' : 'consegnato';
        const wk = weekKeyFromItem(f);
        const weekBadge = `<span class="week-badge">${formatWeekLabel(wk)}</span>`;

        const whenAssign = formatDateTime(f.createdAt);
        const whenLine = whenAssign
            ? `<p style="font-size:0.8rem;color:#a78bfa;"><i class="fa-regular fa-clock"></i> Assegnato: ${whenAssign}</p>`
            : '';
        container.innerHTML += `
            <div class="card">
                <h3>${f.playerName || '—'}</h3>
                <p><b>Evento:</b> ${f.eventName || '—'}</p>
                <p><b>Quantità:</b> ${formatNumber(f.quantity || 0)} frammenti</p>
                ${whenLine}
                ${f.note ? `<p style="font-size:0.85rem;color:var(--text-dim);"><i>${f.note}</i></p>` : ''}
                ${weekBadge}
                <div class="status ${statusClass}">${statusLabel}</div>
                <div class="action-buttons">
                    <button class="edit-btn" onclick="toggleFrammentoStatus('${f.id}', '${nextStatus}')">
                        ${toggleLabel}
                    </button>
                    <button class="delete-btn" onclick="confirmDelete('frammenti', '${f.id}', loadFrammenti)">
                        Elimina
                    </button>
                </div>
            </div>
        `;
    });
}

function loadFrammenti() {
    const container = document.getElementById('frammenti-list');
    if (!container) return;

    if (_frammentiUnsub) {
        try { _frammentiUnsub(); } catch (e) {}
        _frammentiUnsub = null;
    }

    _frammentiUnsub = db.collection('frammenti').onSnapshot(snapshot => {
        const items = [];
        snapshot.forEach(doc => items.push({ id: doc.id, ...doc.data() }));
        _frammentiAllItems = items;
        // Dopo aver i dati assegnazioni, completa il rollover (eventi + pending)
        rolloverOpenEventsToCurrentWeek();
        refreshFrammentiWeekSelect();
        renderFrammentiList(items);
        if (typeof renderFrammentiEventsList === 'function') {
            renderFrammentiEventsList();
        }
    });
}

function toggleFrammentoStatus(id, nextStatus) {
    db.collection('frammenti').doc(id).update({ status: nextStatus }).then(() => {
        showToast(nextStatus === 'consegnato' ? 'Segnato come consegnato' : 'Segnato come non consegnato');
    });
}

/** Recap completo: per player, per categoria (evento), per settimana */
function buildRecapTablesFromItems(items) {
    const byPlayer = {};
    const byEvent = {};
    const byWeek = {};

    items.forEach(f => {
        const qty = Number(f.quantity) || 0;
        const player = f.playerName || 'Sconosciuto';
        const event = f.eventName || 'Sconosciuto';
        const wk = weekKeyFromItem(f);
        const isCons = f.status === 'consegnato';

        if (!byPlayer[player]) byPlayer[player] = { qty: 0, cons: 0, non: 0 };
        byPlayer[player].qty += qty;
        if (isCons) byPlayer[player].cons += qty; else byPlayer[player].non += qty;

        if (!byEvent[event]) byEvent[event] = { qty: 0, cons: 0, non: 0, eventId: f.eventId || null };
        byEvent[event].qty += qty;
        if (isCons) byEvent[event].cons += qty; else byEvent[event].non += qty;
        if (!byEvent[event].eventId && f.eventId) byEvent[event].eventId = f.eventId;

        if (!byWeek[wk]) byWeek[wk] = { qty: 0, cons: 0, non: 0 };
        byWeek[wk].qty += qty;
        if (isCons) byWeek[wk].cons += qty; else byWeek[wk].non += qty;
    });

    let playerRows = '';
    Object.keys(byPlayer).sort((a, b) => a.localeCompare(b, 'it', { sensitivity: 'base' })).forEach(name => {
        const p = byPlayer[name];
        playerRows += `<tr>
            <td>${name}</td>
            <td>${formatNumber(p.qty)}</td>
            <td style="color:#2ecc71;">${formatNumber(p.cons)}</td>
            <td style="color:#e74c3c;">${formatNumber(p.non)}</td>
        </tr>`;
    });
    if (!playerRows) playerRows = '<tr><td colspan="4" style="color:#a0a0a0;">Nessun dato</td></tr>';

    let eventRows = '';
    Object.keys(byEvent).sort((a, b) => a.localeCompare(b, 'it', { sensitivity: 'base' })).forEach(name => {
        const e = byEvent[name];
        const evStatus = resolveEventStatusLabel(e.eventId || null, name);
        const statusCell = evStatus === 'Concluso'
            ? '<span style="color:#2ecc71;font-weight:600;">Concluso</span>'
            : '<span style="color:#c5a059;font-weight:600;">Aperto</span>';
        eventRows += `<tr>
            <td>${name}<br><small>${statusCell}</small></td>
            <td>${formatNumber(e.qty)}</td>
            <td style="color:#2ecc71;">${formatNumber(e.cons)}</td>
            <td style="color:#e74c3c;">${formatNumber(e.non)}</td>
        </tr>`;
    });
    if (!eventRows) eventRows = '<tr><td colspan="4" style="color:#a0a0a0;">Nessun dato</td></tr>';

    let weekRows = '';
    Object.keys(byWeek).sort().reverse().forEach(wk => {
        const w = byWeek[wk];
        weekRows += `<tr>
            <td>${formatWeekLabel(wk)}</td>
            <td>${formatNumber(w.qty)}</td>
            <td style="color:#2ecc71;">${formatNumber(w.cons)}</td>
            <td style="color:#e74c3c;">${formatNumber(w.non)}</td>
        </tr>`;
    });
    if (!weekRows) weekRows = '<tr><td colspan="4" style="color:#a0a0a0;">Nessun dato</td></tr>';

    return { playerRows, eventRows, weekRows };
}

function filterRecapItemsByWeek(items, filterVal) {
    if (filterVal === 'all') return items.slice();
    if (filterVal === 'current') {
        const ck = getWeekBounds().key;
        const openEventIds = new Set();
        const openEventNames = new Set();
        (_frammentiAllEvents || []).forEach(e => {
            if (e.status === 'concluso') return;
            openEventIds.add(e.id);
            if (e.name) openEventNames.add(String(e.name).trim().toLowerCase());
        });
        return items.filter(f => {
            if (weekKeyFromItem(f) === ck) return true;
            if (f.status === 'consegnato') return false;
            const byId = f.eventId && openEventIds.has(f.eventId);
            const byName = f.eventName && openEventNames.has(String(f.eventName).trim().toLowerCase());
            return byId || byName;
        });
    }
    return items.filter(f => weekKeyFromItem(f) === filterVal);
}

function refreshRecapCompletoTables(filterVal) {
    const items = window._recapFrammentiItems || [];
    const filtered = filterRecapItemsByWeek(items, filterVal);
    const { playerRows, eventRows, weekRows } = buildRecapTablesFromItems(filtered);
    const p = document.getElementById('recap-tbody-players');
    const e = document.getElementById('recap-tbody-events');
    const w = document.getElementById('recap-tbody-weeks');
    if (p) p.innerHTML = playerRows;
    if (e) e.innerHTML = eventRows;
    if (w) w.innerHTML = weekRows;
}

function openFrammentiRecapCompleto() {
    db.collection('frammenti').get().then(snapshot => {
        const items = [];
        snapshot.forEach(doc => items.push({ id: doc.id, ...doc.data() }));

        if (items.length === 0) {
            Swal.fire({ icon: 'info', title: 'Recap Frammenti', text: 'Nessun frammento registrato.', background: '#131a25' });
            return;
        }

        window._recapFrammentiItems = items;

        const weeks = new Set();
        items.forEach(f => weeks.add(weekKeyFromItem(f)));
        const sortedWeeks = Array.from(weeks).sort().reverse();
        const currentKey = getWeekBounds().key;

        let weekOpts = `<option value="current">Settimana corrente (${formatWeekLabel(currentKey)})</option>`;
        weekOpts += `<option value="all" selected>Totale (tutte le settimane)</option>`;
        sortedWeeks.forEach(k => {
            if (k === currentKey) return;
            weekOpts += `<option value="${k}">${formatWeekLabel(k)}</option>`;
        });

        const { playerRows, eventRows, weekRows } = buildRecapTablesFromItems(items);

        Swal.fire({
            title: '📊 Recap Completo Frammenti',
            width: 720,
            background: '#131a25',
            showConfirmButton: true,
            confirmButtonText: 'Chiudi',
            html: `
                <div style="text-align:left;max-height:72vh;overflow-y:auto;">
                    <div style="margin-bottom:16px;display:flex;flex-wrap:wrap;align-items:center;gap:10px;">
                        <label style="color:#c5a059;font-size:13px;font-weight:600;">Filtra settimana:</label>
                        <select id="recap-week-filter" class="swal2-select" style="width:auto;min-width:240px;margin:0;" onchange="refreshRecapCompletoTables(this.value)">
                            ${weekOpts}
                        </select>
                    </div>

                    <div class="frammenti-recap-section">
                        <h4>Per Vampiro / Player</h4>
                        <table class="frammenti-recap-table">
                            <thead><tr><th>Player</th><th>Tot.</th><th>Consegnati</th><th>Non cons.</th></tr></thead>
                            <tbody id="recap-tbody-players">${playerRows}</tbody>
                        </table>
                    </div>

                    <div class="frammenti-recap-section">
                        <h4>Per Categoria / Evento</h4>
                        <table class="frammenti-recap-table">
                            <thead><tr><th>Evento</th><th>Tot.</th><th>Consegnati</th><th>Non cons.</th></tr></thead>
                            <tbody id="recap-tbody-events">${eventRows}</tbody>
                        </table>
                    </div>

                    <div class="frammenti-recap-section">
                        <h4>Per Settimana</h4>
                        <table class="frammenti-recap-table">
                            <thead><tr><th>Settimana</th><th>Tot.</th><th>Consegnati</th><th>Non cons.</th></tr></thead>
                            <tbody id="recap-tbody-weeks">${weekRows}</tbody>
                        </table>
                    </div>
                </div>
            `
        });
    });
}

/** Rimuove un'assegnazione sbagliata dal log del player */
function removePlayerFrammento(frammentoId, playerName, playerId) {
    Swal.fire({
        title: 'Rimuovere assegnazione?',
        text: 'Questa azione elimina i frammenti di questo evento per il player. Non si può annullare.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Rimuovi',
        cancelButtonText: 'Annulla',
        confirmButtonColor: '#ef4444',
        background: '#131a25'
    }).then(result => {
        if (!result.isConfirmed) return;
        db.collection('frammenti').doc(frammentoId).delete().then(() => {
            showToast('Assegnazione rimossa');
            // Riapri mantenendo il filtro settimana scelto
            const keepFilter = (window._playerFrammentiFilter != null)
                ? window._playerFrammentiFilter
                : 'current';
            openPlayerFrammentiModal(playerId, playerName, keepFilter);
        });
    });
}

/** Filtra items player per settimana (current | all | weekKey).
 *  In "current" include anche assegnazioni non consegnate legate a eventi ancora aperti
 *  (anche se la weekKey non è ancora aggiornata dal rollover). */
function filterPlayerFrammentiByWeek(items, filterVal) {
    if (filterVal === 'all') return items.slice();
    if (filterVal === 'current') {
        const ck = getWeekBounds().key;
        const openEventIds = new Set();
        const openEventNames = new Set();
        (_frammentiAllEvents || []).forEach(e => {
            if (e.status === 'concluso') return;
            openEventIds.add(e.id);
            if (e.name) openEventNames.add(String(e.name).trim().toLowerCase());
        });
        return items.filter(f => {
            if (weekKeyFromItem(f) === ck) return true;
            if (f.status === 'consegnato') return false;
            const byId = f.eventId && openEventIds.has(f.eventId);
            const byName = f.eventName && openEventNames.has(String(f.eventName).trim().toLowerCase());
            return byId || byName;
        });
    }
    return items.filter(f => weekKeyFromItem(f) === filterVal);
}

/** Costruisce HTML tabelle + dettaglio per il modal player (dati già filtrati per settimana).
 *  showConsegnati: se false (default) il dettaglio mostra solo “da consegnare”. */
function buildPlayerFrammentiContent(items, playerId, playerName, showConsegnati) {
    const byEvent = {};
    const byWeek = {};
    let totalAll = 0;
    let totalConsegnati = 0;
    let totalNon = 0;
    const rows = [];
    const showCons = !!showConsegnati;

    items.forEach(f => {
        const qty = Number(f.quantity) || 0;
        const name = f.eventName || 'Sconosciuto';
        const wk = weekKeyFromItem(f);

        if (!byEvent[name]) byEvent[name] = { qty: 0, consegnati: 0, non: 0, times: 0, repeatable: !!f.repeatable };
        byEvent[name].qty += qty;
        byEvent[name].times += 1;
        if (f.repeatable) byEvent[name].repeatable = true;
        if (f.status === 'consegnato') {
            byEvent[name].consegnati += qty;
            totalConsegnati += qty;
        } else {
            byEvent[name].non += qty;
            totalNon += qty;
        }
        totalAll += qty;

        if (!byWeek[wk]) byWeek[wk] = { qty: 0, consegnati: 0, non: 0 };
        byWeek[wk].qty += qty;
        if (f.status === 'consegnato') byWeek[wk].consegnati += qty;
        else byWeek[wk].non += qty;

        rows.push({ id: f.id, ...f, weekKey: wk });
    });

    let tableRows = '';
    const eventNames = Object.keys(byEvent).sort((a, b) => a.localeCompare(b, 'it', { sensitivity: 'base' }));
    if (eventNames.length === 0) {
        tableRows = '<tr><td colspan="4" style="color:#a0a0a0;">Nessun frammento in questo filtro</td></tr>';
    } else {
        eventNames.forEach(name => {
            const e = byEvent[name];
            const sample = items.find(x => (x.eventName || 'Sconosciuto') === name);
            const evStatus = resolveEventStatusLabel(sample && sample.eventId, name);
            const statusCell = evStatus === 'Concluso'
                ? '<span style="color:#2ecc71;font-weight:600;">Concluso</span>'
                : '<span style="color:#c5a059;font-weight:600;">Aperto</span>';
            let isRepEv = !!e.repeatable;
            if (!isRepEv && sample && sample.repeatable) isRepEv = true;
            if (!isRepEv) {
                const evs = _frammentiAllEvents || [];
                const found = evs.find(ev =>
                    (sample && sample.eventId && ev.id === sample.eventId) ||
                    String(ev.name || '').trim().toLowerCase() === String(name).trim().toLowerCase()
                );
                if (found && found.repeatable) isRepEv = true;
            }
            const timesCell = isRepEv
                ? `<br><small style="color:#a78bfa;font-weight:700;">${e.times}× volte</small>`
                : (e.times > 1 ? `<br><small style="color:#a78bfa;">${e.times}×</small>` : '');
            tableRows += `
                <tr>
                    <td>${name}${timesCell}<br><small>${statusCell}</small></td>
                    <td>${formatNumber(e.qty)}</td>
                    <td style="color:#2ecc71;">${formatNumber(e.consegnati)}</td>
                    <td style="color:#e74c3c;">${formatNumber(e.non)}</td>
                </tr>
            `;
        });
    }

    let weekTable = '';
    const weekKeys = Object.keys(byWeek).sort().reverse();
    if (weekKeys.length === 0) {
        weekTable = '<tr><td colspan="4" style="color:#a0a0a0;">—</td></tr>';
    } else {
        weekKeys.forEach(wk => {
            const w = byWeek[wk];
            weekTable += `
                <tr>
                    <td>${formatWeekLabel(wk)}</td>
                    <td>${formatNumber(w.qty)}</td>
                    <td style="color:#2ecc71;">${formatNumber(w.consegnati)}</td>
                    <td style="color:#e74c3c;">${formatNumber(w.non)}</td>
                </tr>
            `;
        });
    }

    // Dettaglio: di default solo da consegnare; se flag attivo, sezione separata per i consegnati
    const pendingRows = rows.filter(f => f.status !== 'consegnato');
    const deliveredRows = rows.filter(f => f.status === 'consegnato');
    pendingRows.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    deliveredRows.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    const safePlayer = (playerName || '').replace(/'/g, "\\'");

    function rowHtml(f) {
        const st = f.status === 'consegnato'
            ? '<span class="status consegnato" style="margin:0;">Consegnato</span>'
            : '<span class="status non_consegnato" style="margin:0;">Da consegnare</span>';
        const repTag = f.repeatable
            ? ' <span style="color:#a78bfa;font-size:0.7rem;">(ripetibile)</span>'
            : '';
        const evStatus = resolveEventStatusLabel(f.eventId, f.eventName);
        const evStatusHtml = evStatus === 'Concluso'
            ? ' <span style="color:#2ecc71;font-size:0.7rem;font-weight:600;">· Concluso</span>'
            : ' <span style="color:#c5a059;font-size:0.7rem;font-weight:600;">· Aperto</span>';
        const whenAssign = formatDateTime(f.createdAt);
        const whenHtml = whenAssign
            ? `<br><small style="color:#a78bfa;"><i class="fa-regular fa-clock"></i> Assegnato: ${whenAssign}</small>`
            : '';
        return `<li style="margin-bottom:8px;padding-bottom:6px;border-bottom:1px dashed rgba(255,255,255,0.06);display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">
            <div>
                <b>${f.eventName || '—'}</b>${repTag}${evStatusHtml} — ${formatNumber(f.quantity)} fr. ${st}
                <br><small style="color:#a78bfa;">Sett. ${formatWeekLabel(f.weekKey)}</small>
                ${whenHtml}
                ${f.note ? `<br><small style="color:#a0a0a0;">${f.note}</small>` : ''}
            </div>
            <button type="button"
                onclick="removePlayerFrammento('${f.id}', '${safePlayer}', '${playerId}')"
                title="Rimuovi questa assegnazione"
                style="flex-shrink:0;padding:6px 10px;font-size:0.65rem;border:1px dashed #e74c3c;color:#e74c3c;background:transparent;cursor:pointer;text-transform:uppercase;">
                Rimuovi
            </button>
        </li>`;
    }

    let detailList = '';
    if (pendingRows.length === 0 && deliveredRows.length === 0) {
        detailList = '<li style="color:#a0a0a0;">Nessuna assegnazione in questo filtro</li>';
    } else {
        detailList += `<li style="list-style:none;margin-bottom:10px;padding:0;border:none;">
            <p style="margin:0 0 6px;color:#e74c3c;font-size:13px;font-weight:600;">Da consegnare (${pendingRows.length})</p>
        </li>`;
        if (pendingRows.length === 0) {
            detailList += '<li style="color:#a0a0a0;">Nessun frammento da consegnare</li>';
        } else {
            detailList += pendingRows.map(rowHtml).join('');
        }
        if (showCons) {
            detailList += `<li style="list-style:none;margin:14px 0 6px;padding:0;border:none;">
                <p style="margin:0;color:#2ecc71;font-size:13px;font-weight:600;">Già consegnati (${deliveredRows.length})</p>
            </li>`;
            if (deliveredRows.length === 0) {
                detailList += '<li style="color:#a0a0a0;">Nessuna consegna registrata</li>';
            } else {
                detailList += deliveredRows.map(rowHtml).join('');
            }
        }
    }

    // Contatore eventi ripetibili per questo player (su items filtrati)
    const repCounts = getPlayerRepeatableEventCounts(playerName, items);
    let repCountsHtml = '';
    if (repCounts.length > 0) {
        const repRows = repCounts.map(r => {
            const volteLabel = r.times === 1 ? '1 volta' : (r.times + ' volte');
            return `<tr>
                <td>${r.eventName}</td>
                <td style="color:#a78bfa;font-weight:700;">${volteLabel}</td>
                <td>${formatNumber(r.qty)}</td>
                <td style="color:#2ecc71;">${formatNumber(r.cons)}</td>
                <td style="color:#e74c3c;">${formatNumber(r.non)}</td>
            </tr>`;
        }).join('');
        repCountsHtml = `
            <div class="frammenti-recap-section" style="margin-top:8px;">
                <p style="margin:12px 0 8px;color:#a78bfa;font-size:13px;font-weight:600;">
                    <i class="fa-solid fa-rotate"></i> Eventi ripetibili — contatore volte
                </p>
                <table class="frammenti-recap-table">
                    <thead>
                        <tr>
                            <th>Evento</th>
                            <th>Volte</th>
                            <th>Tot. fr.</th>
                            <th>Cons.</th>
                            <th>Da cons.</th>
                        </tr>
                    </thead>
                    <tbody>${repRows}</tbody>
                </table>
            </div>`;
    }

    return {
        tableRows,
        weekTable,
        detailList,
        totalAll,
        totalConsegnati,
        totalNon,
        pendingCount: pendingRows.length,
        deliveredCount: deliveredRows.length,
        repCountsHtml
    };
}

/** Aggiorna tabelle/dettaglio del modal player senza richiuderlo */
function refreshPlayerFrammentiModal(filterVal) {
    if (filterVal != null) window._playerFrammentiFilter = filterVal;
    const items = window._playerFrammentiItems || [];
    const playerId = window._playerFrammentiPlayerId;
    const playerName = window._playerFrammentiPlayerName || '';
    const weekFilter = window._playerFrammentiFilter || 'current';
    const showConsEl = document.getElementById('player-fr-show-consegnati');
    const showCons = showConsEl ? !!showConsEl.checked : !!window._playerFrammentiShowConsegnati;
    window._playerFrammentiShowConsegnati = showCons;

    const filtered = filterPlayerFrammentiByWeek(items, weekFilter);
    const c = buildPlayerFrammentiContent(filtered, playerId, playerName, showCons);

    const elEvents = document.getElementById('player-fr-tbody-events');
    const elWeeks = document.getElementById('player-fr-tbody-weeks');
    const elDetail = document.getElementById('player-fr-detail-list');
    const elTotal = document.getElementById('player-fr-total');
    const elConsCount = document.getElementById('player-fr-cons-count');
    const elRep = document.getElementById('player-fr-rep-counts');
    if (elEvents) elEvents.innerHTML = c.tableRows;
    if (elWeeks) elWeeks.innerHTML = c.weekTable;
    if (elDetail) elDetail.innerHTML = c.detailList;
    if (elConsCount) elConsCount.textContent = '(' + c.deliveredCount + ')';
    if (elRep) elRep.innerHTML = c.repCountsHtml || '';
    if (elTotal) {
        elTotal.innerHTML = `
            Totale: ${formatNumber(c.totalAll)} frammenti
            &nbsp;·&nbsp; <span style="color:#2ecc71;">${formatNumber(c.totalConsegnati)} consegnati</span>
            &nbsp;·&nbsp; <span style="color:#e74c3c;">${formatNumber(c.totalNon)} da consegnare</span>
        `;
    }
}

/**
 * Modal frammenti del singolo player.
 * @param {string} playerId
 * @param {string} playerName
 * @param {string} [initialFilter='current'] - 'current' | 'all' | weekKey
 */
function openPlayerFrammentiModal(playerId, playerName, initialFilter) {
    db.collection('frammenti').get().then(snapshot => {
        const items = [];
        snapshot.forEach(doc => {
            const f = doc.data();
            if (f.playerName !== playerName) return;
            items.push({ id: doc.id, ...f });
        });

        if (items.length === 0) {
            Swal.fire({
                icon: 'info',
                title: '🔮 Frammenti — ' + playerName,
                text: 'Nessun frammento registrato per questo player.',
                background: '#131a25'
            });
            return;
        }

        window._playerFrammentiItems = items;
        window._playerFrammentiPlayerId = playerId;
        window._playerFrammentiPlayerName = playerName;

        const weeks = new Set();
        items.forEach(f => weeks.add(weekKeyFromItem(f)));
        const sortedWeeks = Array.from(weeks).sort().reverse();
        const currentKey = getWeekBounds().key;

        let preferred = initialFilter || 'current';
        // Se il filtro preferito non ha senso (es. weekKey non presente), fallback a current
        if (preferred !== 'all' && preferred !== 'current' && !weeks.has(preferred)) {
            preferred = 'current';
        }
        window._playerFrammentiFilter = preferred;

        let weekOpts = `<option value="current"${preferred === 'current' ? ' selected' : ''}>Settimana corrente (${formatWeekLabel(currentKey)})</option>`;
        weekOpts += `<option value="all"${preferred === 'all' ? ' selected' : ''}>Tutte le settimane (storico)</option>`;
        sortedWeeks.forEach(k => {
            if (k === currentKey) return;
            weekOpts += `<option value="${k}"${preferred === k ? ' selected' : ''}>${formatWeekLabel(k)} — archivio</option>`;
        });

        const showCons = !!window._playerFrammentiShowConsegnati;
        const filtered = filterPlayerFrammentiByWeek(items, preferred);
        const c = buildPlayerFrammentiContent(filtered, playerId, playerName, showCons);

        Swal.fire({
            title: '🔮 Frammenti — ' + playerName,
            width: 680,
            background: '#131a25',
            showConfirmButton: true,
            confirmButtonText: 'Chiudi',
            html: `
                <div style="text-align:left;">
                    <div style="margin-bottom:16px;display:flex;flex-wrap:wrap;align-items:center;gap:10px;">
                        <label style="color:#c5a059;font-size:13px;font-weight:600;">
                            <i class="fa-solid fa-calendar-week"></i> Filtra settimana:
                        </label>
                        <select id="player-fr-week-filter" class="swal2-select" style="width:auto;min-width:240px;margin:0;"
                            onchange="refreshPlayerFrammentiModal(this.value)">
                            ${weekOpts}
                        </select>
                    </div>

                    <p style="margin-bottom:8px;color:#a0a0a0;font-size:13px;">Riepilogo per categoria / evento</p>
                    <table class="frammenti-recap-table">
                        <thead>
                            <tr>
                                <th>Evento</th>
                                <th>Tot.</th>
                                <th>Consegnati</th>
                                <th>Da cons.</th>
                            </tr>
                        </thead>
                        <tbody id="player-fr-tbody-events">${c.tableRows}</tbody>
                    </table>

                    <p style="margin:16px 0 8px;color:#a0a0a0;font-size:13px;">Riepilogo per settimana</p>
                    <table class="frammenti-recap-table">
                        <thead>
                            <tr>
                                <th>Settimana</th>
                                <th>Tot.</th>
                                <th>Consegnati</th>
                                <th>Da cons.</th>
                            </tr>
                        </thead>
                        <tbody id="player-fr-tbody-weeks">${c.weekTable}</tbody>
                    </table>

                    <div class="frammenti-recap-total" id="player-fr-total">
                        Totale: ${formatNumber(c.totalAll)} frammenti
                        &nbsp;·&nbsp; <span style="color:#2ecc71;">${formatNumber(c.totalConsegnati)} consegnati</span>
                        &nbsp;·&nbsp; <span style="color:#e74c3c;">${formatNumber(c.totalNon)} da consegnare</span>
                    </div>

                    <div style="margin:16px 0 10px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                        <label style="display:inline-flex;align-items:center;gap:8px;cursor:pointer;color:#c5a059;font-size:13px;font-weight:600;user-select:none;">
                            <input type="checkbox" id="player-fr-show-consegnati" ${showCons ? 'checked' : ''}
                                onchange="refreshPlayerFrammentiModal()"
                                style="width:auto;margin:0;accent-color:#2ecc71;cursor:pointer;">
                            Mostra già consegnati
                            <span id="player-fr-cons-count" style="color:#9ca3af;font-weight:400;">(${c.deliveredCount})</span>
                        </label>
                    </div>

                    <div id="player-fr-rep-counts">${c.repCountsHtml || ''}</div>

                    <p style="margin:8px 0 8px;color:#a0a0a0;font-size:13px;">Dettaglio assegnazioni (log)</p>
                    <ul id="player-fr-detail-list" class="frammenti-recap-scroll" style="list-style:none;padding:0;">${c.detailList}</ul>
                </div>
            `
        });
    });
}



auth.onAuthStateChanged(user => {

    if (user && user.email === 'gm.vampiri@horde.it') {

        document.getElementById('login-page')
            .classList.add('hidden');

        document.getElementById('dashboard')
            .classList.remove('hidden');

        loadQuests();
        loadDocs();
        loadNotes();
        loadMedia();
        loadCommands();
        loadGlobalLinks();
        loadPlayers();
        loadRitoPlayers();
        loadFrammentiEvents();
        loadFrammenti();
        updateWeekRangeHints();

    } else {

        document.getElementById('login-page')
            .classList.remove('hidden');

        document.getElementById('dashboard')
            .classList.add('hidden');
    }
});
