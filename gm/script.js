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
        snapshot.forEach(doc => {
            const p = doc.data();
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

                questsSnapshot.forEach(doc => {
                    const q = doc.data();
                    if (q.folderId === currentQuestsFolder.id) {
                        // Converte i dettagli separati da invio in comodi step strutturati
                        let stepsHTML = '';
                        if (q.details) {
                            const steps = q.details.split('\n').filter(s => s.trim() !== '');
                            stepsHTML = steps.map((step, index) => `<li><b>Step ${index + 1}:</b> ${step}</li>`).join('');
                        } else {
                            stepsHTML = '<li>Nessun dettaglio inserito</li>';
                        }

                        const cardId = `quest-card-${doc.id}`;
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
                                        onclick="editQuest('${doc.id}')"
                                    >
                                        Modifica
                                    </button>
                                    <button
                                        class="delete-btn"
                                        onclick="confirmDelete('quests', '${doc.id}', loadQuests)"
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
                foldersSnapshot.forEach(fDoc => {
                    const f = fDoc.data();
                    container.innerHTML += `
                        <div class="card folder-card" style="border-color: #f59e0b; cursor: pointer;" onclick="currentQuestsFolder = {id: '${fDoc.id}', name: '${f.name}'}; loadQuests();">
                            <h3><i class="fa-solid fa-folder" style="color: #f59e0b; margin-right: 8px;"></i> ${f.name}</h3>
                            <p>Apri per visualizzare le quest</p>
                            <div class="action-buttons" onclick="event.stopPropagation();" style="margin-top: 15px;">
                                <button class="delete-btn" style="padding: 6px; font-size: 13px;" onclick="confirmDelete('folders', '${fDoc.id}', loadQuests)">
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

                docsSnapshot.forEach(doc => {
                    const d = doc.data();
                    if (d.folderId === currentDocsFolder.id) {
                        const cardId = `doc-card-${doc.id}`;
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
                                    onclick="deleteDoc('${doc.id}')"
                                >
                                    <i class="fa-solid fa-trash"></i> Elimina
                                </button>
                            </div>
                        `;
                        setTimeout(() => {
                            const el = document.getElementById(cardId);
                            if (el && d.link) el.setAttribute('data-content-src', d.link);
                        }, 0);
                    }
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
                foldersSnapshot.forEach(fDoc => {
                    const f = fDoc.data();
                    container.innerHTML += `
                        <div class="card folder-card" style="border-color: #f59e0b; cursor: pointer;" onclick="currentDocsFolder = {id: '${fDoc.id}', name: '${f.name}'}; loadDocs();">
                            <h3><i class="fa-solid fa-folder" style="color: #f59e0b; margin-right: 8px;"></i> ${f.name}</h3>
                            <p>Apri per visualizzare i documenti</p>
                            <div class="action-buttons" onclick="event.stopPropagation();" style="margin-top: 15px;">
                                <button class="delete-btn" style="padding: 6px; font-size: 13px;" onclick="confirmDelete('folders', '${fDoc.id}', loadDocs)">
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

                notesSnapshot.forEach(doc => {
                    const n = doc.data();
                    if (n.folderId === currentNotesFolder.id) {
                        container.innerHTML += `
                            <div class="card">
                                <p>${n.note}</p>
                                <div class="action-buttons">
                                    <button
                                        class="delete-btn"
                                        onclick="confirmDelete('notes', '${doc.id}', loadNotes)"
                                    >
                                        Elimina
                                    </button>
                                </div>
                            </div>
                        `;
                    }
                });
            } else {
                foldersSnapshot.forEach(fDoc => {
                    const f = fDoc.data();
                    container.innerHTML += `
                        <div class="card folder-card" style="border-color: #f59e0b; cursor: pointer;" onclick="currentNotesFolder = {id: '${fDoc.id}', name: '${f.name}'}; loadNotes();">
                            <h3><i class="fa-solid fa-folder" style="color: #f59e0b; margin-right: 8px;"></i> ${f.name}</h3>
                            <p>Apri per visualizzare le note</p>
                            <div class="action-buttons" onclick="event.stopPropagation();" style="margin-top: 15px;">
                                <button class="delete-btn" style="padding: 6px; font-size: 13px;" onclick="confirmDelete('folders', '${fDoc.id}', loadNotes)">
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

                mediaSnapshot.forEach(doc => {
                    const m = doc.data();
                    if (m.folderId === currentMediaFolder.id) {
                        let mediaHTML = '';
                        const content = m.content || '';
                        const isDataImage = content.startsWith('data:image/');
                        const isDataPdf = content.startsWith('data:application/pdf');
                        const isUrlImage = /\.(png|jpe?g|gif|webp|bmp|svg)(\?|$)/i.test(content) ||
                                           (content.includes('https://') && !content.includes('.pdf') && !content.startsWith('data:'));
                        const isPdfLike = /\.pdf(\?|$)/i.test(content) || content.includes('docs.google.com') || content.includes('drive.google.com') || isDataPdf;

                        const cardId = `media-card-${doc.id}`;

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
                                    <button class="delete-btn" onclick="confirmDelete('media', '${doc.id}', loadMedia)">
                                        Elimina
                                    </button>
                                </div>
                            </div>
                        `;

                        setTimeout(() => {
                            const el = document.getElementById(cardId);
                            if (el) el.setAttribute('data-content-src', content);
                        }, 0);
                    }
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
                foldersSnapshot.forEach(fDoc => {
                    const f = fDoc.data();
                    container.innerHTML += `
                        <div class="card folder-card" style="border-color: #f59e0b; cursor: pointer;" onclick="currentMediaFolder = {id: '${fDoc.id}', name: '${f.name}'}; loadMedia();">
                            <h3><i class="fa-solid fa-folder" style="color: #f59e0b; margin-right: 8px;"></i> ${f.name}</h3>
                            <p>Apri per visualizzare l'archivio</p>
                            <div class="action-buttons" onclick="event.stopPropagation();" style="margin-top: 15px;">
                                <button class="delete-btn" style="padding: 6px; font-size: 13px;" onclick="confirmDelete('folders', '${fDoc.id}', loadMedia)">
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

                commandsSnapshot.forEach(doc => {
                    const c = doc.data();
                    if (c.folderId === currentCommandsFolder.id) {
                        container.innerHTML += `
                            <div class="card">
                                <h3>${c.command}</h3>
                                <p>${c.description}</p>
                                <div class="action-buttons">
                                    <button
                                        class="delete-btn"
                                        onclick="confirmDelete('commands', '${doc.id}', loadCommands)"
                                    >
                                        Elimina
                                    </button>
                                </div>
                            </div>
                        `;
                    }
                });
            } else {
                foldersSnapshot.forEach(fDoc => {
                    const f = fDoc.data();
                    container.innerHTML += `
                        <div class="card folder-card" style="border-color: #f59e0b; cursor: pointer;" onclick="currentCommandsFolder = {id: '${fDoc.id}', name: '${f.name}'}; loadCommands();">
                            <h3><i class="fa-solid fa-folder" style="color: #f59e0b; margin-right: 8px;"></i> ${f.name}</h3>
                            <p>Apri per visualizzare i comandi</p>
                            <div class="action-buttons" onclick="event.stopPropagation();" style="margin-top: 15px;">
                                <button class="delete-btn" style="padding: 6px; font-size: 13px;" onclick="confirmDelete('folders', '${fDoc.id}', loadCommands)">
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

                linksSnapshot.forEach(doc => {
                    const l = doc.data();
                    if (l.folderId === currentAdminFolder.id) {
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
                                        onclick="confirmDelete('globalLinks', '${doc.id}', loadGlobalLinks)"
                                    >
                                        Elimina
                                    </button>
                                </div>
                            </div>
                        `;
                    }
                });
            } else {
                foldersSnapshot.forEach(fDoc => {
                    const f = fDoc.data();
                    container.innerHTML += `
                        <div class="card folder-card" style="border-color: #f59e0b; cursor: pointer;" onclick="currentAdminFolder = {id: '${fDoc.id}', name: '${f.name}'}; loadGlobalLinks();">
                            <h3><i class="fa-solid fa-folder" style="color: #f59e0b; margin-right: 8px;"></i> ${f.name}</h3>
                            <p>Apri per visualizzare i link</p>
                            <div class="action-buttons" onclick="event.stopPropagation();" style="margin-top: 15px;">
                                <button class="delete-btn" style="padding: 6px; font-size: 13px;" onclick="confirmDelete('folders', '${fDoc.id}', loadGlobalLinks)">
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
            <textarea
                id="player-notes"
                class="swal2-textarea"
                placeholder="Note Player"
            ></textarea>
        `,
        confirmButtonText: 'Crea Player',
        background: '#131a25',
        preConfirm: () => {
            return {
                name: document.getElementById('player-name').value,
                notes: document.getElementById('player-notes').value
            };
        }
    }).then((result) => {
        if (result.isConfirmed) {
            db.collection('players').add({
                name: result.value.name,
                notes: result.value.notes,
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

                playersSnapshot.forEach(doc => {
                    const p = doc.data();
                    if (p.folderId === currentPlayersFolder.id) {
                        let activeQuestsHTML = '';
                        if (p.quests && p.quests.length > 0) {
                            activeQuestsHTML = p.quests.map(q => `<span class="status progress" style="margin: 2px;">${q}</span>`).join(' ');
                        } else {
                            activeQuestsHTML = '<span style="color: var(--muted); font-size:13px;">Nessuna quest attiva</span>';
                        }

                        container.innerHTML += `
                            <div class="card">
                                <h3>${p.name}</h3>
                                <p>${p.notes || 'Nessuna nota'}</p>
                                <div style="margin-top:10px;">
                                    <b>Quest Attive:</b><br>${activeQuestsHTML}
                                </div>
                                <div class="action-buttons">
                                    <button
                                        class="edit-btn"
                                        onclick="openPlayerModal('${doc.id}')"
                                    >
                                        Apri
                                    </button>
                                    <button
                                        class="btn-frammenti"
                                        onclick="openPlayerFrammentiModal('${doc.id}', '${(p.name || '').replace(/'/g, "\\'")}')"
                                        title="Resoconto Frammenti"
                                    >
                                        🔮
                                    </button>
                                    <button
                                        class="delete-btn"
                                        onclick="confirmDelete('players', '${doc.id}', loadPlayers)"
                                    >
                                        Elimina
                                    </button>
                                </div>
                            </div>
                        `;
                    }
                });
            } else {
                foldersSnapshot.forEach(fDoc => {
                    const f = fDoc.data();
                    container.innerHTML += `
                        <div class="card folder-card" style="border-color: #f59e0b; cursor: pointer;" onclick="currentPlayersFolder = {id: '${fDoc.id}', name: '${f.name}'}; loadPlayers();">
                            <h3><i class="fa-solid fa-folder" style="color: #f59e0b; margin-right: 8px;"></i> ${f.name}</h3>
                            <p>Apri per visualizzare i player</p>
                            <div class="action-buttons" onclick="event.stopPropagation();" style="margin-top: 15px;">
                                <button class="delete-btn" style="padding: 6px; font-size: 13px;" onclick="confirmDelete('folders', '${fDoc.id}', loadPlayers)">
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

            const player = playerDoc.data();

            // Recupera dinamicamente le quest correnti dal database delle quest
            db.collection('quests').get().then(snapshot => {

                let questOptions = '';

                snapshot.forEach(qDoc => {

                    const q = qDoc.data();

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

                Swal.fire({

                    title: player.name,

                    html: `

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

                    `,

                    width: 700,

                    confirmButtonText: 'Salva',

                    background: '#131a25',

                    preConfirm: () => {

                        const selectedQuests =
                            Array.from(
                                document.getElementById(
                                    'player-quests'
                                ).selectedOptions
                            ).map(option => option.value);

                        return {

                            notes:
                                document.getElementById(
                                    'player-notes-edit'
                                ).value,

                            quests:
                                selectedQuests
                        };
                    }

                }).then((result) => {

                    if (result.isConfirmed) {

                        db.collection('players')
                            .doc(playerId)
                            .update({

                                notes: result.value.notes,
                                quests: result.value.quests

                            })
                            .then(() => {

                                showToast(
                                    'Player aggiornato'
                                );
                            });
                    }
                });

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
        refreshFrammentiWeekSelect();
        renderFrammentiEventsList();
    });
}

/** Render eventi filtrati per settimana (corrente / passata / tutte) */
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

    return `
        <div class="card event-card ${isConcluso ? 'event-concluso' : ''} ${isRepeatable ? 'event-repeatable' : ''}">
            <h3>${e.name}</h3>
            <p><b>Frammenti per assegnazione:</b> ${formatNumber(e.quantity)}</p>
            ${isRepeatable ? '<p style="font-size:0.8rem;color:#a78bfa;margin-bottom:6px;">Si può assegnare più volte · i punti si sommano</p>' : ''}
            <div class="event-badges">${repeatBadge} ${weekBadge} ${statusBadge} ${archiveTag}</div>
            <div class="action-buttons event-actions">
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
    const repContainer = document.getElementById('frammenti-events-repeatable-list');
    if (!container) return;

    const items = _frammentiAllEvents || [];
    const normal = items.filter(e => !e.repeatable);
    const repeatable = items.filter(e => !!e.repeatable);

    let filteredNormal = normal.slice();
    if (frammentiWeekFilter === 'current') {
        const ck = getWeekBounds().key;
        filteredNormal = normal.filter(e => weekKeyFromEvent(e) === ck);
    } else if (frammentiWeekFilter !== 'all') {
        filteredNormal = normal.filter(e => weekKeyFromEvent(e) === frammentiWeekFilter);
    }
    filteredNormal.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    repeatable.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

    container.innerHTML = '';
    if (filteredNormal.length === 0) {
        const msg = frammentiWeekFilter === 'all'
            ? 'Nessun evento settimanale. Usa “+ Nuovo Evento”.'
            : 'Nessun evento settimanale in questa settimana (archiviato o non ancora creato).';
        container.innerHTML = `<p style="color:var(--text-dim);padding:10px;">${msg}</p>`;
    } else {
        filteredNormal.forEach(e => {
            container.innerHTML += buildEventCardHTML(e);
        });
    }

    if (repContainer) {
        repContainer.innerHTML = '';
        if (repeatable.length === 0) {
            repContainer.innerHTML = '<p style="color:var(--text-dim);padding:10px;">Nessun evento ripetibile. In creazione attiva il flag “Evento ripetibile”.</p>';
        } else {
            repeatable.forEach(e => {
                repContainer.innerHTML += buildEventCardHTML(e);
            });
        }
    }
}

/** Occhio sull'evento: settimana + giocatori che hanno ricevuto frammenti per questo evento */
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

        participants.sort((a, b) => (a.playerName || '').localeCompare(b.playerName || ''));

        let rows = '';
        if (participants.length === 0) {
            rows = '<tr><td colspan="4" style="color:#a0a0a0;">Nessun giocatore assegnato. Usa “+ Assegna Frammenti”.</td></tr>';
        } else {
            participants.forEach(p => {
                const isCons = p.status === 'consegnato';
                const st = isCons
                    ? '<span style="color:#2ecc71;font-weight:600;">Consegnato</span>'
                    : '<span style="color:#e74c3c;font-weight:600;">Non consegnato</span>';
                const nextStatus = isCons ? 'non_consegnato' : 'consegnato';
                const btnLabel = isCons ? 'Annulla consegna' : 'Consegna';
                const btnColor = isCons ? '#e74c3c' : '#2ecc71';
                const safePlayer = (p.playerName || '').replace(/'/g, "\\'");
                rows += `<tr>
                    <td><b>${p.playerName}</b>${p.note ? `<br><small style="color:#a0a0a0;">${p.note}</small>` : ''}</td>
                    <td>${formatNumber(p.quantity)}</td>
                    <td>${st}</td>
                    <td>
                        <button type="button"
                            onclick="toggleSingleFrammentoStatus('${p.id}', '${nextStatus}', '${eventId}', '${(eventName || '').replace(/'/g, "\\'")}')"
                            style="padding:6px 10px;font-size:0.7rem;border:1px solid ${btnColor};color:${btnColor};background:transparent;cursor:pointer;border-radius:0;text-transform:uppercase;">
                            ${btnLabel}
                        </button>
                    </td>
                </tr>`;
            });
        }

        const isRep = !!ev.repeatable;
        // Totali per player (utile se ripetibile e assegnato più volte)
        const byPlayerSum = {};
        participants.forEach(p => {
            if (!byPlayerSum[p.playerName]) byPlayerSum[p.playerName] = 0;
            byPlayerSum[p.playerName] += p.quantity;
        });
        let sumRows = '';
        Object.keys(byPlayerSum).sort().forEach(name => {
            sumRows += `<tr><td>${name}</td><td>${formatNumber(byPlayerSum[name])}</td></tr>`;
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
                        &nbsp;·&nbsp; <span style="color:#e74c3c;">${formatNumber(totalNon)} non</span>
                    </div>
                    ${isRep && sumRows ? `
                    <p style="margin-bottom:6px;color:#a0a0a0;font-size:13px;">Totale sommabile per player</p>
                    <table class="frammenti-recap-table" style="margin-bottom:14px;">
                        <thead><tr><th>Player</th><th>Tot. frammenti</th></tr></thead>
                        <tbody>${sumRows}</tbody>
                    </table>
                    ` : ''}
                    <p style="margin-bottom:8px;color:#a0a0a0;font-size:13px;">Dettaglio assegnazioni — consegna singola</p>
                    <table class="frammenti-recap-table">
                        <thead>
                            <tr>
                                <th>Player</th>
                                <th>Qty</th>
                                <th>Stato</th>
                                <th>Azione</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            `
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

function addFrammento() {
    Promise.all([
        db.collection('players').get(),
        db.collection('frammentiEvents').get()
    ]).then(([playersSnap, eventsSnap]) => {
        let playerOptions = '';
        playersSnap.forEach(doc => {
            const p = doc.data();
            if (p.name) {
                playerOptions += `<option value="${p.name.replace(/"/g, '&quot;')}">${p.name}</option>`;
            }
        });

        let eventOptions = '<option value="">Seleziona evento</option>';
        const eventsMap = {};
        eventsSnap.forEach(doc => {
            const e = doc.data();
            eventsMap[doc.id] = e;
            const repTag = e.repeatable ? ' · ripetibile' : '';
            eventOptions += `<option value="${doc.id}">${e.name} (${formatNumber(e.quantity)} fr.${repTag})</option>`;
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
    const eventsHintEl = document.getElementById('frammenti-events-filter-hint');
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
    if (eventsHintEl) eventsHintEl.textContent = hintText;
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

    let filtered = items.slice();
    if (frammentiWeekFilter === 'current') {
        const ck = getWeekBounds().key;
        filtered = items.filter(f => weekKeyFromItem(f) === ck);
    } else if (frammentiWeekFilter !== 'all') {
        filtered = items.filter(f => weekKeyFromItem(f) === frammentiWeekFilter);
    }

    filtered.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

    container.innerHTML = '';
    if (filtered.length === 0) {
        container.innerHTML = '<p style="color:var(--text-dim);padding:10px;">Nessuna assegnazione in questa settimana. Usa “+ Assegna Frammenti” oppure cambia filtro settimana.</p>';
        return;
    }

    filtered.forEach(f => {
        const statusLabel = f.status === 'consegnato' ? 'Consegnato' : 'Non consegnato';
        const statusClass = f.status === 'consegnato' ? 'consegnato' : 'non_consegnato';
        const toggleLabel = f.status === 'consegnato' ? 'Segna non consegnato' : 'Segna consegnato';
        const nextStatus = f.status === 'consegnato' ? 'non_consegnato' : 'consegnato';
        const wk = weekKeyFromItem(f);
        const weekBadge = `<span class="week-badge">${formatWeekLabel(wk)}</span>`;

        container.innerHTML += `
            <div class="card">
                <h3>${f.playerName || '—'}</h3>
                <p><b>Evento:</b> ${f.eventName || '—'}</p>
                <p><b>Quantità:</b> ${formatNumber(f.quantity || 0)} frammenti</p>
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
        refreshFrammentiWeekSelect();
        renderFrammentiList(items);
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

        if (!byEvent[event]) byEvent[event] = { qty: 0, cons: 0, non: 0 };
        byEvent[event].qty += qty;
        if (isCons) byEvent[event].cons += qty; else byEvent[event].non += qty;

        if (!byWeek[wk]) byWeek[wk] = { qty: 0, cons: 0, non: 0 };
        byWeek[wk].qty += qty;
        if (isCons) byWeek[wk].cons += qty; else byWeek[wk].non += qty;
    });

    let playerRows = '';
    Object.keys(byPlayer).sort((a, b) => byPlayer[b].qty - byPlayer[a].qty).forEach(name => {
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
    Object.keys(byEvent).sort((a, b) => byEvent[b].qty - byEvent[a].qty).forEach(name => {
        const e = byEvent[name];
        eventRows += `<tr>
            <td>${name}</td>
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
        return items.filter(f => weekKeyFromItem(f) === ck);
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

/** Filtra items player per settimana (current | all | weekKey) */
function filterPlayerFrammentiByWeek(items, filterVal) {
    if (filterVal === 'all') return items.slice();
    if (filterVal === 'current') {
        const ck = getWeekBounds().key;
        return items.filter(f => weekKeyFromItem(f) === ck);
    }
    return items.filter(f => weekKeyFromItem(f) === filterVal);
}

/** Costruisce HTML tabelle + dettaglio per il modal player (dati già filtrati) */
function buildPlayerFrammentiContent(items, playerId, playerName) {
    const byEvent = {};
    const byWeek = {};
    let totalAll = 0;
    let totalConsegnati = 0;
    let totalNon = 0;
    const rows = [];

    items.forEach(f => {
        const qty = Number(f.quantity) || 0;
        const name = f.eventName || 'Sconosciuto';
        const wk = weekKeyFromItem(f);

        if (!byEvent[name]) byEvent[name] = { qty: 0, consegnati: 0, non: 0 };
        byEvent[name].qty += qty;
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
    const eventNames = Object.keys(byEvent).sort((a, b) => byEvent[b].qty - byEvent[a].qty);
    if (eventNames.length === 0) {
        tableRows = '<tr><td colspan="4" style="color:#a0a0a0;">Nessun frammento in questo filtro</td></tr>';
    } else {
        eventNames.forEach(name => {
            const e = byEvent[name];
            tableRows += `
                <tr>
                    <td>${name}</td>
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

    let detailList = '';
    if (rows.length > 0) {
        rows.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        const safePlayer = (playerName || '').replace(/'/g, "\\'");
        detailList = rows.map(f => {
            const st = f.status === 'consegnato'
                ? '<span class="status consegnato" style="margin:0;">Consegnato</span>'
                : '<span class="status non_consegnato" style="margin:0;">Non consegnato</span>';
            const repTag = f.repeatable
                ? ' <span style="color:#a78bfa;font-size:0.7rem;">(ripetibile)</span>'
                : '';
            return `<li style="margin-bottom:8px;padding-bottom:6px;border-bottom:1px dashed rgba(255,255,255,0.06);display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">
                <div>
                    <b>${f.eventName || '—'}</b>${repTag} — ${formatNumber(f.quantity)} fr. ${st}
                    <br><small style="color:#a78bfa;">Sett. ${formatWeekLabel(f.weekKey)}</small>
                    ${f.note ? `<br><small style="color:#a0a0a0;">${f.note}</small>` : ''}
                </div>
                <button type="button"
                    onclick="removePlayerFrammento('${f.id}', '${safePlayer}', '${playerId}')"
                    title="Rimuovi questa assegnazione"
                    style="flex-shrink:0;padding:6px 10px;font-size:0.65rem;border:1px dashed #e74c3c;color:#e74c3c;background:transparent;cursor:pointer;text-transform:uppercase;">
                    Rimuovi
                </button>
            </li>`;
        }).join('');
    } else {
        detailList = '<li style="color:#a0a0a0;">Nessuna assegnazione in questo filtro</li>';
    }

    return {
        tableRows,
        weekTable,
        detailList,
        totalAll,
        totalConsegnati,
        totalNon
    };
}

/** Aggiorna tabelle/dettaglio del modal player senza richiuderlo */
function refreshPlayerFrammentiModal(filterVal) {
    window._playerFrammentiFilter = filterVal;
    const items = window._playerFrammentiItems || [];
    const playerId = window._playerFrammentiPlayerId;
    const playerName = window._playerFrammentiPlayerName || '';
    const filtered = filterPlayerFrammentiByWeek(items, filterVal);
    const c = buildPlayerFrammentiContent(filtered, playerId, playerName);

    const elEvents = document.getElementById('player-fr-tbody-events');
    const elWeeks = document.getElementById('player-fr-tbody-weeks');
    const elDetail = document.getElementById('player-fr-detail-list');
    const elTotal = document.getElementById('player-fr-total');
    if (elEvents) elEvents.innerHTML = c.tableRows;
    if (elWeeks) elWeeks.innerHTML = c.weekTable;
    if (elDetail) elDetail.innerHTML = c.detailList;
    if (elTotal) {
        elTotal.innerHTML = `
            Totale: ${formatNumber(c.totalAll)} frammenti
            &nbsp;·&nbsp; <span style="color:#2ecc71;">${formatNumber(c.totalConsegnati)} consegnati</span>
            &nbsp;·&nbsp; <span style="color:#e74c3c;">${formatNumber(c.totalNon)} non consegnati</span>
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

        const filtered = filterPlayerFrammentiByWeek(items, preferred);
        const c = buildPlayerFrammentiContent(filtered, playerId, playerName);

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
                                <th>Non cons.</th>
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
                                <th>Non cons.</th>
                            </tr>
                        </thead>
                        <tbody id="player-fr-tbody-weeks">${c.weekTable}</tbody>
                    </table>

                    <div class="frammenti-recap-total" id="player-fr-total">
                        Totale: ${formatNumber(c.totalAll)} frammenti
                        &nbsp;·&nbsp; <span style="color:#2ecc71;">${formatNumber(c.totalConsegnati)} consegnati</span>
                        &nbsp;·&nbsp; <span style="color:#e74c3c;">${formatNumber(c.totalNon)} non consegnati</span>
                    </div>
                    <p style="margin:18px 0 8px;color:#a0a0a0;font-size:13px;">Dettaglio assegnazioni (log)</p>
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
