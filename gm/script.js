// Stati delle cartelle attive nelle varie sezioni
let currentQuestsFolder = null;
let currentDocsFolder = null;
let currentNotesFolder = null;
let currentMediaFolder = null;
let currentPlayersFolder = null;
let currentCommandsFolder = null;
let currentAdminFolder = null;

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

    } else {

        document.getElementById('login-page')
            .classList.remove('hidden');

        document.getElementById('dashboard')
            .classList.add('hidden');
    }
});