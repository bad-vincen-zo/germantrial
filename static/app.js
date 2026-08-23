// State Management
let allWords = [];
let filteredWords = [];
let quizQueue = [];
let quizIndex = 0;
let sessionTotalReviews = 0;
let sessionCorrectReviews = 0;
let isCardFlipped = false;
let directAssessmentMode = false;

// Practice Cards Mode State
let currentCardMode = 'trial'; // 'trial' or 'practice'
let practiceDeck = [];
let practiceDeckIndex = 0;
let practiceDeckNum = 1;
let practiceAnswers = [];

// Icon Refresh Helper
function refreshIcons() {
    if (typeof window !== "undefined" && window.lucide && typeof window.lucide.createIcons === "function") {
        window.lucide.createIcons();
    }
}

// Initialize Page
document.addEventListener("DOMContentLoaded", () => {
    initTheme();

    const themeBtn = document.getElementById("theme-toggle-btn");
    if (themeBtn) {
        themeBtn.addEventListener("click", (e) => {
            e.preventDefault();
            toggleTheme();
        });
    }

    fetchChapters();
    fetchTopics();
    fetchWords();
    // Sync direct assessment checkbox state on load
    const toggleInput = document.getElementById("direct-assess-toggle");
    if (toggleInput) {
        directAssessmentMode = toggleInput.checked;
    }
    // Initialize icons
    refreshIcons();
});

// ── Theme Switcher ────────────────────────────────────────────────────────────
let lastThemeToggleTimestamp = 0;

function initTheme() {
    const savedTheme = localStorage.getItem("theme") || "dark";
    applyTheme(savedTheme);
}

function toggleTheme() {
    const now = Date.now();
    if (now - lastThemeToggleTimestamp < 250) {
        return; // Prevent rapid double execution
    }
    lastThemeToggleTimestamp = now;

    const isLight = document.documentElement.getAttribute("data-theme") === "light" || document.body.classList.contains("light-theme");
    const newTheme = isLight ? "dark" : "light";
    applyTheme(newTheme);
    localStorage.setItem("theme", newTheme);
}

function applyTheme(theme) {
    if (theme === "light") {
        document.documentElement.setAttribute("data-theme", "light");
        document.body.setAttribute("data-theme", "light");
        document.documentElement.classList.add("light-theme");
        document.body.classList.add("light-theme");
    } else {
        document.documentElement.setAttribute("data-theme", "dark");
        document.body.setAttribute("data-theme", "dark");
        document.documentElement.classList.remove("light-theme");
        document.body.classList.remove("light-theme");
    }

    const iconContainer = document.getElementById("theme-icon-container");
    const textEl = document.getElementById("theme-text");
    
    if (theme === "light") {
        if (iconContainer) iconContainer.innerHTML = `<i data-lucide="moon"></i>`;
        if (textEl) textEl.textContent = "Dark Mode";
    } else {
        if (iconContainer) iconContainer.innerHTML = `<i data-lucide="sun"></i>`;
        if (textEl) textEl.textContent = "Light Mode";
    }
    
    refreshIcons();
}

window.toggleTheme = toggleTheme;

// State for Chapters & Subheadings
let appChapters = [];
let appTopics = [];
let selectedFilterChapter = "All";
let selectedFilterSubheading = "All";

async function fetchChapters() {
    try {
        const res = await fetch("/api/chapters");
        if (!res.ok) return;
        appChapters = await res.json();
        renderChapterDropdowns();
    } catch (e) {
        console.error("Error fetching chapters:", e);
    }
}

async function fetchTopics() {
    try {
        const res = await fetch("/api/topics");
        if (!res.ok) return;
        appTopics = await res.json();
        renderTopicDropdowns();
    } catch (e) {
        console.error("Error fetching topics:", e);
    }
}

function renderTopicDropdowns() {
    const importTopicSelect = document.getElementById("import-topic-select");
    const addTopicSelect = document.getElementById("add-topic-select");
    const populate = (sel) => {
        if (!sel) return;
        sel.innerHTML = '<option value="">None / No Topic</option>';
        if (Array.isArray(appTopics)) {
            appTopics.forEach(t => {
                const opt = document.createElement("option");
                opt.value = t.name;
                opt.textContent = t.name;
                sel.appendChild(opt);
            });
        }
    };
    populate(importTopicSelect);
    populate(addTopicSelect);
}

function renderTopicsTab() {
    const container = document.getElementById("topics-grid-container");
    if (!container) return;
    if (!appTopics || appTopics.length === 0) {
        container.innerHTML = `<p class="upload-desc">No topics created yet.</p>`;
        return;
    }
    container.innerHTML = "";
    appTopics.forEach(top => {
        const card = document.createElement("div");
        card.className = "chapter-card animate-fade-in";
        card.innerHTML = `
            <div class="chapter-card-header">
                <div class="chapter-card-title"><i data-lucide="tag" style="margin-right:6px;"></i> ${escapeHTML(top.name)}</div>
                <span class="chapter-card-count">${top.word_count || 0} words</span>
            </div>
            <p style="font-size:0.88rem; color:var(--text-secondary); margin-top:8px;">${escapeHTML(top.description || "No description provided.")}</p>
        `;
        container.appendChild(card);
    });
    refreshIcons();
}

function getSubheadingsForChapter(chapterName) {
    if (!chapterName) return [];
    const found = appChapters.find(c => c.name.toLowerCase() === chapterName.trim().toLowerCase());
    return found ? (found.subheadings || []) : [];
}

function populateSubheadingsSelect(selectEl, chapterName, selectedVal = "") {
    if (!selectEl) return;
    const subheadings = getSubheadingsForChapter(chapterName);
    selectEl.innerHTML = '<option value="">None / No Subheading</option>';
    subheadings.forEach(s => {
        const opt = document.createElement("option");
        opt.value = s.name;
        opt.innerText = s.name;
        if (s.name === selectedVal) opt.selected = true;
        selectEl.appendChild(opt);
    });
    if (selectedVal && !subheadings.some(s => s.name === selectedVal)) {
        const customOpt = document.createElement("option");
        customOpt.value = selectedVal;
        customOpt.innerText = selectedVal;
        customOpt.selected = true;
        selectEl.appendChild(customOpt);
    }
}

function handleAddChapterChange(chapterName) {
    const subSelect = document.getElementById("add-subheading-select");
    populateSubheadingsSelect(subSelect, chapterName);
}

function handleImportChapterChange(chapterName) {
    const subSelect = document.getElementById("import-subheading-select");
    populateSubheadingsSelect(subSelect, chapterName);
}

function handleEditChapterChange(chapterName) {
    const subSelect = document.getElementById("edit-subheading-select");
    populateSubheadingsSelect(subSelect, chapterName);
}

function renderChapterDropdowns() {
    const addSelect = document.getElementById("add-chapter-select");
    const importSelect = document.getElementById("import-chapter-select");
    const filterSelect = document.getElementById("filter-chapter-select");
    const editSelect = document.getElementById("edit-chapter-select");

    const populateChapters = (sel) => {
        if (!sel) return;
        const currentVal = sel.value || "General";
        sel.innerHTML = "";
        appChapters.forEach(ch => {
            const opt = document.createElement("option");
            opt.value = ch.name;
            opt.innerText = ch.name;
            sel.appendChild(opt);
        });
        if (currentVal) sel.value = currentVal;
    };

    populateChapters(addSelect);
    populateChapters(importSelect);
    populateChapters(editSelect);

    if (addSelect) handleAddChapterChange(addSelect.value);
    if (importSelect) handleImportChapterChange(importSelect.value);

    if (filterSelect) {
        filterSelect.innerHTML = '<option value="All">All Chapters</option>';
        appChapters.forEach(ch => {
            const opt = document.createElement("option");
            opt.value = ch.name;
            opt.innerText = `${ch.name} (${ch.word_count || 0})`;
            if (ch.name.toLowerCase() === selectedFilterChapter.toLowerCase()) {
                opt.selected = true;
            }
            filterSelect.appendChild(opt);
        });
        updateFilterSubheadingSelect(selectedFilterChapter);
    }
}

function updateFilterSubheadingSelect(chapterName) {
    const subFilterSelect = document.getElementById("filter-subheading-select");
    if (!subFilterSelect) return;

    if (!chapterName || chapterName === "All") {
        subFilterSelect.style.display = "none";
        selectedFilterSubheading = "All";
        return;
    }

    const subheadings = getSubheadingsForChapter(chapterName);
    if (subheadings.length === 0) {
        subFilterSelect.style.display = "none";
        selectedFilterSubheading = "All";
        return;
    }

    subFilterSelect.style.display = "inline-block";
    subFilterSelect.innerHTML = '<option value="All">All Subheadings</option>';
    subheadings.forEach(s => {
        const opt = document.createElement("option");
        opt.value = s.name;
        opt.innerText = `${s.name} (${s.word_count || 0})`;
        if (s.name.toLowerCase() === selectedFilterSubheading.toLowerCase()) {
            opt.selected = true;
        }
        subFilterSelect.appendChild(opt);
    });
}

function handleChapterFilterChange(selectElement) {
    selectedFilterChapter = selectElement.value;
    selectedFilterSubheading = "All";
    updateFilterSubheadingSelect(selectedFilterChapter);
    handleSearch();
}

function handleSubheadingFilterChange(selectElement) {
    selectedFilterSubheading = selectElement.value;
    handleSearch();
}

// Fetch Vocabulary from Server
async function fetchWords() {
    try {
        const response = await fetch("/api/words");
        if (!response.ok) throw new Error("Failed to load vocabulary");
        
        allWords = await response.json();
        handleSearch();
        updateStats();
        
        if (document.getElementById("content-practice").classList.contains("hidden") === false) {
            resetQuiz();
        }
    } catch (error) {
        console.error("Error fetching words:", error);
        showToast("Error loading vocabulary. Please try refreshing.", "error");
    }
}

// A1 German Gender Detection & Styling Helpers
function getGenderClass(germanText) {
    if (!germanText) return "";
    const lower = germanText.trim().toLowerCase();
    if (lower.startsWith("der ") || lower.includes(" der ")) return "gender-masculine";
    if (lower.startsWith("die ") || lower.includes(" die ")) return "gender-feminine";
    if (lower.startsWith("das ") || lower.includes(" das ")) return "gender-neuter";
    return "";
}

function formatGermanWordHTML(germanText) {
    const escaped = escapeHTML(germanText);
    const genderClass = getGenderClass(germanText);
    if (genderClass) {
        return `<span class="german-word-formatted ${genderClass}">${escaped}</span>`;
    }
    return `<span>${escaped}</span>`;
}

// Render the main table
function renderVocabTable() {
    const tbody = document.getElementById("vocab-table-body");
    const emptyState = document.getElementById("empty-state");
    tbody.innerHTML = "";
    
    if (filteredWords.length === 0) {
        emptyState.style.display = "flex";
        return;
    } else {
        emptyState.style.display = "none";
    }

    filteredWords.forEach(word => {
        const tr = document.createElement("tr");
        tr.className = "animate-fade-in";
        const subBadge = word.subheading ? `<span class="badge subheading-badge" style="font-size:0.72rem; padding:2px 8px; border-radius:12px; background:rgba(56, 189, 248, 0.18); color:#7dd3fc; margin-left:6px; font-weight:600; display:inline-flex; align-items:center; gap:3px;"><i data-lucide="list-tree" style="width:10px; height:10px;"></i>${escapeHTML(word.subheading)}</span>` : "";

        tr.innerHTML = `
            <td>${formatGermanWordHTML(word.german)} ${subBadge}</td>
            <td>${escapeHTML(word.english)}</td>
            <td>
                <button class="action-icon-btn play-btn" onclick="speakGerman('${escapeJS(word.german)}')" title="Listen to pronunciation">
                    <i data-lucide="volume-2"></i>
                </button>
            </td>
            <td class="actions-col">
                <div class="actions-cell-wrapper">
                    <button class="action-icon-btn edit-btn" onclick="openEditModal('${escapeJS(word.german)}', '${escapeJS(word.english)}', '${escapeJS(word.chapter_name || 'General')}', '${escapeJS(word.subheading || '')}')" title="Edit Word">
                        <i data-lucide="edit-3"></i>
                    </button>
                    <button class="action-icon-btn delete-btn" onclick="deleteWord('${escapeJS(word.german)}')" title="Delete Word">
                        <i data-lucide="trash-2"></i>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });

    refreshIcons();
}

// Update stats cards
function updateStats() {
    document.getElementById("total-words-count").innerText = allWords.length;
    document.getElementById("session-count").innerText = sessionTotalReviews;
    
    if (sessionTotalReviews === 0) {
        document.getElementById("mastery-rate").innerText = "0%";
    } else {
        const rate = Math.round((sessionCorrectReviews / sessionTotalReviews) * 100);
        document.getElementById("mastery-rate").innerText = `${rate}%`;
    }
}

// Add word handler
async function handleAddWord(event) {
    event.preventDefault();
    const germanInput = document.getElementById("german-input");
    const englishInput = document.getElementById("english-input");
    const addChapterSelect = document.getElementById("add-chapter-select");
    const addSubheadingSelect = document.getElementById("add-subheading-select");
    
    const german = germanInput.value.trim();
    const english = englishInput.value.trim();
    const chapterName = addChapterSelect ? addChapterSelect.value : "General";
    const subheading = addSubheadingSelect ? addSubheadingSelect.value : "";

    if (!german || !english) return;

    try {
        const response = await fetch("/api/words", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ german, english, chapter_name: chapterName, subheading })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.detail || "Failed to add word");
        }

        germanInput.value = "";
        englishInput.value = "";
        germanInput.focus();

        const subMsg = subheading ? ` [${subheading}]` : "";
        showToast(`Successfully added "${german}" to chapter '${chapterName}'${subMsg}!`, "success");
        await fetchChapters();
        await fetchWords();
        
    } catch (error) {
        showToast(error.message, "error");
    }
}

// Edit Modal Functions
function openEditModal(german, english, chapter = "General", subheading = "") {
    document.getElementById("edit-old-german").value = german;
    document.getElementById("edit-german-input").value = german;
    document.getElementById("edit-english-input").value = english;
    
    const chapterSel = document.getElementById("edit-chapter-select");
    const subSel = document.getElementById("edit-subheading-select");
    
    if (chapterSel) {
        chapterSel.value = chapter;
        populateSubheadingsSelect(subSel, chapter, subheading);
    }

    document.getElementById("edit-modal").classList.add("open");
}

function closeEditModal() {
    document.getElementById("edit-modal").classList.remove("open");
}

async function handleEditWordSubmit(event) {
    event.preventDefault();
    const old_german = document.getElementById("edit-old-german").value;
    const new_german = document.getElementById("edit-german-input").value.trim();
    const new_english = document.getElementById("edit-english-input").value.trim();
    const chapterSel = document.getElementById("edit-chapter-select");
    const subSel = document.getElementById("edit-subheading-select");
    const chapter_name = chapterSel ? chapterSel.value : "General";
    const subheading = subSel ? subSel.value : "";

    if (!new_german || !new_english) return;

    try {
        const response = await fetch("/api/words", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ old_german, new_german, new_english, chapter_name, subheading })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.detail || "Failed to update word");
        }

        closeEditModal();
        showToast(`Successfully updated word!`, "success");
        await fetchChapters();
        await fetchWords();
        
    } catch (error) {
        showToast(error.message, "error");
    }
}

// Delete Word
async function deleteWord(german) {
    if (!confirm(`Are you sure you want to delete "${german}"?`)) return;

    try {
        const response = await fetch(`/api/words?german=${encodeURIComponent(german)}`, {
            method: "DELETE"
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.detail || "Failed to delete word");
        }

        showToast(`Deleted vocabulary word.`, "success");
        await fetchChapters();
        await fetchWords();
        
    } catch (error) {
        showToast(error.message, "error");
    }
}

// Search / Filtering
function handleSearch() {
    const queryEl = document.getElementById("search-input");
    const query = queryEl ? queryEl.value.toLowerCase().trim() : "";

    filteredWords = allWords.filter(word => {
        const matchesQuery = !query || 
            word.german.toLowerCase().includes(query) || 
            word.english.toLowerCase().includes(query) ||
            (word.subheading && word.subheading.toLowerCase().includes(query)) ||
            (word.chapter_name && word.chapter_name.toLowerCase().includes(query));
        const wordChapter = (word.chapter_name || "General").toLowerCase();
        const matchesChapter = selectedFilterChapter === "All" || wordChapter === selectedFilterChapter.toLowerCase();
        const wordSubheading = (word.subheading || "").toLowerCase();
        const matchesSubheading = selectedFilterSubheading === "All" || (selectedFilterSubheading === "" ? !wordSubheading : wordSubheading === selectedFilterSubheading.toLowerCase());
        return matchesQuery && matchesChapter && matchesSubheading;
    });

    renderVocabTable();
}

// Tab Navigation logic
function switchTab(tabId) {
    const tabs = ["manage", "practice", "stats", "chapters"];
    
    tabs.forEach(id => {
        const btn = document.getElementById(`tab-${id}`);
        const content = document.getElementById(`content-${id}`);
        if (btn) btn.classList.remove("active");
        if (content) content.classList.add("hidden");
    });

    const activeBtn = document.getElementById(`tab-${tabId}`);
    const activeContent = document.getElementById(`content-${tabId}`);
    if (activeBtn) activeBtn.classList.add("active");
    if (activeContent) activeContent.classList.remove("hidden");

    if (tabId === "practice") {
        if (currentCardMode === "trial") {
            resetQuiz();
        } else {
            resetPracticeSession();
        }
    } else if (tabId === "stats") {
        renderStatsDashboard();
    } else if (tabId === "chapters") {
        renderChaptersTab();
    }
}

// ── Chapters & Topics Sub-tab Switcher ──────────────────────────────────────
let currentChapterSubTab = "chapters"; // 'chapters' or 'topics'

function switchChapterSubTab(subTab) {
    currentChapterSubTab = subTab;
    const chaptersBtn = document.getElementById("chapter-subtab-chapters");
    const topicsBtn = document.getElementById("chapter-subtab-topics");
    const chaptersView = document.getElementById("chapters-subview-chapters");
    const topicsView = document.getElementById("chapters-subview-topics");

    if (!chaptersBtn || !topicsBtn || !chaptersView || !topicsView) return;

    if (subTab === "chapters") {
        chaptersBtn.classList.add("active");
        topicsBtn.classList.remove("active");
        chaptersView.style.display = "block";
        topicsView.style.display = "none";
        renderChaptersTab();
    } else {
        topicsBtn.classList.add("active");
        chaptersBtn.classList.remove("active");
        topicsView.style.display = "block";
        chaptersView.style.display = "none";
        renderTopicsTab();
    }

    refreshIcons();
}

// Chapters Tab Renderer
function renderChaptersTab() {
    const container = document.getElementById("chapters-grid-container");
    if (!container) return;

    if (appChapters.length === 0) {
        container.innerHTML = `<p class="upload-desc">No chapters created yet. Click "Add Chapter" to create one!</p>`;
        return;
    }

    container.innerHTML = "";
    appChapters.forEach(ch => {
        const card = document.createElement("div");
        card.className = "chapter-card animate-fade-in";
        const isGeneral = ch.name.toLowerCase() === "general";
        const subheadings = ch.subheadings || [];
        
        card.innerHTML = `
            <div class="chapter-card-header">
                <div class="chapter-card-title"><i data-lucide="folder" style="margin-right:6px;"></i> ${escapeHTML(ch.name)}</div>
                <span class="chapter-card-count">${ch.word_count || 0} words</span>
            </div>
            <p style="font-size:0.88rem; color:var(--text-secondary); margin-top:8px;">${escapeHTML(ch.description || "No description provided.")}</p>

            <!-- Subheadings Section -->
            <div class="chapter-subheadings-section" style="margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--border-color); flex: 1;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                    <span style="font-size:0.82rem; font-weight:700; color:var(--text-secondary); display:flex; align-items:center; gap:5px;">
                        <i data-lucide="list-tree" style="width:14px; height:14px; color:#38bdf8;"></i> Subheadings (${subheadings.length})
                    </span>
                    <button type="button" class="btn-xs" style="background:transparent; border:1px dashed rgba(99,102,241,0.4); color:var(--accent-primary); padding:3px 8px; border-radius:12px; font-size:0.75rem; font-weight:600; cursor:pointer;" onclick="openManageSubheadingsModal('${escapeJS(ch.name)}')">
                        <i data-lucide="plus" style="width:10px; height:10px;"></i> Manage / Add
                    </button>
                </div>
                <div class="subheadings-chips-container" style="display:flex; flex-wrap:wrap; gap:6px;">
                    ${subheadings.length > 0 ? subheadings.map(s => `
                        <span class="subheading-chip" onclick="filterByChapterAndSubheading('${escapeJS(ch.name)}', '${escapeJS(s.name)}')" title="Filter words in ${escapeHTML(s.name)}" style="display:inline-flex; align-items:center; gap:4px; font-size:0.75rem; font-weight:600; padding:3px 8px; border-radius:12px; background:rgba(56,189,248,0.12); color:#38bdf8; border:1px solid rgba(56,189,248,0.25); cursor:pointer; transition:all 0.15s ease;">
                            <span>${escapeHTML(s.name)}</span>
                            <span style="opacity:0.75; font-size:0.7rem;">(${s.word_count || 0})</span>
                        </span>
                    `).join('') : `
                        <span style="font-size:0.78rem; color:var(--text-muted); font-style:italic;">No subheadings yet. Click "Manage / Add" to create one!</span>
                    `}
                </div>
            </div>

            <div class="chapter-actions-row" style="margin-top:16px; display:flex; gap:8px; align-items:center;">
                <button type="button" class="secondary-btn btn-sm" style="flex:1;" onclick="filterByChapter('${escapeJS(ch.name)}')">
                    <i data-lucide="filter"></i> View Words
                </button>
                <button type="button" class="action-icon-btn add-btn" onclick="openAddWordsToChapterModal('${escapeJS(ch.name)}')" title="Add Words to Chapter">
                    <i data-lucide="plus-circle"></i>
                </button>
                <button type="button" class="action-icon-btn edit-btn" onclick="openEditChapterModal('${escapeJS(ch.name)}', '${escapeJS(ch.description || '')}')" title="Edit Chapter">
                    <i data-lucide="edit-3"></i>
                </button>
                ${!isGeneral ? `
                <button type="button" class="action-icon-btn delete-btn" onclick="deleteChapter('${escapeJS(ch.name)}')" title="Delete Chapter">
                    <i data-lucide="trash-2"></i>
                </button>
                ` : `
                <button type="button" class="action-icon-btn delete-btn" style="opacity:0.35; cursor:not-allowed;" disabled title="Default 'General' chapter cannot be deleted">
                    <i data-lucide="trash-2"></i>
                </button>
                `}
            </div>
        `;
        container.appendChild(card);
    });

    refreshIcons();
}

function filterByChapter(chapterName) {
    selectedFilterChapter = chapterName;
    selectedFilterSubheading = "All";
    const filterSelect = document.getElementById("filter-chapter-select");
    if (filterSelect) filterSelect.value = chapterName;
    updateFilterSubheadingSelect(chapterName);
    switchTab("manage");
    handleSearch();
}

function filterByChapterAndSubheading(chapterName, subheadingName) {
    selectedFilterChapter = chapterName;
    selectedFilterSubheading = subheadingName;
    const filterSelect = document.getElementById("filter-chapter-select");
    if (filterSelect) filterSelect.value = chapterName;
    updateFilterSubheadingSelect(chapterName);
    const subFilterSelect = document.getElementById("filter-subheading-select");
    if (subFilterSelect) subFilterSelect.value = subheadingName;
    switchTab("manage");
    handleSearch();
}

// ── Manage Subheadings Modal Logic ──────────────────────────────────────────
let currentManageSubheadingsChapter = "";

function openManageSubheadingsModal(chapterName) {
    currentManageSubheadingsChapter = chapterName;
    const modal = document.getElementById("manage-subheadings-modal");
    const titleEl = document.getElementById("manage-subheadings-title");
    const hiddenInput = document.getElementById("manage-subheadings-chapter-hidden");
    const nameInput = document.getElementById("subheading-name-input");
    const descInput = document.getElementById("subheading-desc-input");

    if (titleEl) titleEl.innerHTML = `<i data-lucide="list-tree"></i> Subheadings for "${escapeHTML(chapterName)}"`;
    if (hiddenInput) hiddenInput.value = chapterName;
    if (nameInput) nameInput.value = "";
    if (descInput) descInput.value = "";

    renderManageSubheadingsList(chapterName);

    if (modal) {
        modal.classList.add("open");
        modal.classList.add("active");
        refreshIcons();
    }
}

function closeManageSubheadingsModal() {
    const modal = document.getElementById("manage-subheadings-modal");
    if (modal) {
        modal.classList.remove("open");
        modal.classList.remove("active");
    }
}

function renderManageSubheadingsList(chapterName) {
    const container = document.getElementById("chapter-subheadings-list");
    if (!container) return;
    container.innerHTML = "";

    const subheadings = getSubheadingsForChapter(chapterName);
    if (subheadings.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding:12px; color:var(--text-muted); font-size:0.85rem; font-style:italic;">No subheadings in this chapter yet.</div>`;
        return;
    }

    subheadings.forEach(sub => {
        const itemRow = document.createElement("div");
        itemRow.style.cssText = "display:flex; align-items:center; justify-content:space-between; padding:5px 8px; border-radius:var(--border-radius-sm); background:rgba(255,255,255,0.03); border:1px solid var(--border-color);";
        itemRow.innerHTML = `
            <div style="flex:1; min-width:0; margin-right:6px;">
                <div style="font-weight:700; font-size:0.82rem; color:var(--text-primary); display:flex; align-items:center; gap:5px;">
                    <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHTML(sub.name)}</span>
                    <span style="font-size:0.7rem; color:#38bdf8; background:rgba(56,189,248,0.12); padding:1px 5px; border-radius:8px; white-space:nowrap;">${sub.word_count || 0} words</span>
                </div>
                ${sub.description ? `<div style="font-size:0.72rem; color:var(--text-muted); margin-top:1px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHTML(sub.description)}</div>` : ''}
            </div>
            <div style="display:flex; gap:4px; align-items:center; flex-shrink:0;">
                <button type="button" class="btn-xs" style="background:rgba(56,189,248,0.16); border:1px solid rgba(56,189,248,0.3); color:#38bdf8; padding:2px 6px; border-radius:8px; font-size:0.7rem; font-weight:600; cursor:pointer; display:inline-flex; align-items:center; gap:2px;" onclick="closeManageSubheadingsModal(); openAddWordsToChapterModal('${escapeJS(chapterName)}', '${escapeJS(sub.name)}')" title="Add / Assign words to this subheading">
                    <i data-lucide="plus-circle" style="width:11px; height:11px;"></i> Add Words
                </button>
                <button type="button" class="action-icon-btn edit-btn" style="width:24px; height:24px;" onclick="openEditSubheadingModal('${escapeJS(chapterName)}', '${escapeJS(sub.name)}', '${escapeJS(sub.description || '')}')" title="Edit Subheading">
                    <i data-lucide="edit-3" style="width:12px; height:12px;"></i>
                </button>
                <button type="button" class="action-icon-btn delete-btn" style="width:24px; height:24px;" onclick="deleteSubheading('${escapeJS(chapterName)}', '${escapeJS(sub.name)}')" title="Delete Subheading">
                    <i data-lucide="trash-2" style="width:12px; height:12px;"></i>
                </button>
            </div>
        `;
        container.appendChild(itemRow);
    });

    refreshIcons();
}

async function handleAddSubheadingSubmit(event) {
    if (event) event.preventDefault();
    const nameInput = document.getElementById("subheading-name-input");
    const descInput = document.getElementById("subheading-desc-input");
    const chapterName = currentManageSubheadingsChapter;

    if (!nameInput || !chapterName) return;
    const name = nameInput.value.trim();
    const description = descInput ? descInput.value.trim() : "";

    if (!name) {
        showToast("Subheading name cannot be empty.", "error");
        return;
    }

    try {
        const response = await fetch("/api/subheadings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chapter_name: chapterName, name, description })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || "Failed to create subheading");

        nameInput.value = "";
        if (descInput) descInput.value = "";
        showToast(`Created subheading '${name}' in '${chapterName}'!`, "success");

        await fetchChapters();
        renderManageSubheadingsList(chapterName);
        renderChaptersTab();
    } catch (err) {
        showToast(err.message, "error");
    }
}

// ── Edit Subheading Modal Functions ──────────────────────────────────────────
function openEditSubheadingModal(chapterName, oldName, description) {
    const modal = document.getElementById("edit-subheading-modal");
    const chapterInput = document.getElementById("edit-subheading-chapter-hidden");
    const oldNameInput = document.getElementById("edit-subheading-old-name");
    const nameInput = document.getElementById("edit-subheading-name-input");
    const descInput = document.getElementById("edit-subheading-desc-input");

    if (!modal || !chapterInput || !oldNameInput || !nameInput || !descInput) return;

    chapterInput.value = chapterName;
    oldNameInput.value = oldName;
    nameInput.value = oldName;
    descInput.value = description || "";

    modal.classList.add("open");
    modal.classList.add("active");
    setTimeout(() => { nameInput.focus(); }, 60);
}

function closeEditSubheadingModal() {
    const modal = document.getElementById("edit-subheading-modal");
    if (modal) {
        modal.classList.remove("open");
        modal.classList.remove("active");
    }
}

async function handleEditSubheadingSubmit(event) {
    if (event) event.preventDefault();
    const chapterInput = document.getElementById("edit-subheading-chapter-hidden");
    const oldNameInput = document.getElementById("edit-subheading-old-name");
    const nameInput = document.getElementById("edit-subheading-name-input");
    const descInput = document.getElementById("edit-subheading-desc-input");

    if (!chapterInput || !oldNameInput || !nameInput || !descInput) return;

    const chapter_name = chapterInput.value.trim();
    const old_name = oldNameInput.value.trim();
    const new_name = nameInput.value.trim();
    const description = descInput.value.trim();

    if (!new_name) {
        showToast("Subheading name cannot be empty.", "error");
        return;
    }

    try {
        const response = await fetch("/api/subheadings", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chapter_name, old_name, new_name, description })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || "Failed to update subheading");

        closeEditSubheadingModal();
        showToast(data.message || `Subheading updated to '${new_name}'!`, "success");

        if (selectedFilterSubheading === old_name) {
            selectedFilterSubheading = new_name;
        }

        await fetchChapters();
        await fetchWords();
        renderManageSubheadingsList(chapter_name);
        renderChaptersTab();
    } catch (err) {
        showToast(err.message, "error");
    }
}

async function deleteSubheading(chapterName, name) {
    if (!confirm(`Are you sure you want to delete subheading "${name}" from chapter "${chapterName}"?`)) return;

    try {
        const response = await fetch(`/api/subheadings?chapter_name=${encodeURIComponent(chapterName)}&name=${encodeURIComponent(name)}`, {
            method: "DELETE"
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || "Failed to delete subheading");

        showToast(data.message || `Deleted subheading '${name}'.`, "success");

        if (selectedFilterSubheading === name) {
            selectedFilterSubheading = "All";
        }

        await fetchChapters();
        await fetchWords();
        renderManageSubheadingsList(chapterName);
        renderChaptersTab();
    } catch (err) {
        showToast(err.message, "error");
    }
}

// ── Add Content / Words to Chapter Modal Logic ─────────────────────────────
let currentTargetChapterName = "";
let currentChapterContentMode = "new"; // 'new' or 'existing'
let existingChapterWordsSelected = new Set();

function openAddWordsToChapterModal(chapterName, defaultSubheading = "") {
    currentTargetChapterName = chapterName;
    const modal = document.getElementById("add-words-to-chapter-modal");
    const titleEl = document.getElementById("chapter-modal-title");
    const hiddenInput = document.getElementById("target-chapter-name-hidden");

    if (titleEl) titleEl.innerHTML = `<i data-lucide="folder-plus"></i> Add Words to "${escapeHTML(chapterName)}"`;
    if (hiddenInput) hiddenInput.value = chapterName;

    // Populate subheading dropdown for new word in chapter
    const subSelect = document.getElementById("chapter-new-subheading-select");
    if (subSelect) {
        populateSubheadingsSelect(subSelect, chapterName, defaultSubheading);
    }

    // Populate subheading dropdown for existing words assignment
    const existSubSelect = document.getElementById("chapter-existing-subheading-select");
    if (existSubSelect) {
        populateSubheadingsSelect(existSubSelect, chapterName, defaultSubheading);
    }

    // Populate topic dropdown for new word in chapter
    const topicSelect = document.getElementById("chapter-new-topic-select");
    if (topicSelect) {
        topicSelect.innerHTML = `<option value="">None / No Topic</option>`;
        if (Array.isArray(appTopics)) {
            appTopics.forEach(t => {
                const opt = document.createElement("option");
                opt.value = t.name;
                opt.textContent = t.name;
                topicSelect.appendChild(opt);
            });
        }
    }

    // Reset inputs
    const newGerman = document.getElementById("chapter-new-german");
    const newEnglish = document.getElementById("chapter-new-english");
    const pasteText = document.getElementById("chapter-paste-text");
    if (newGerman) newGerman.value = "";
    if (newEnglish) newEnglish.value = "";
    if (pasteText) pasteText.value = "";

    existingChapterWordsSelected.clear();
    switchChapterContentMode("new");

    if (modal) {
        modal.classList.add("open");
        modal.classList.add("active");
        refreshIcons();
    }
}

function closeAddWordsToChapterModal() {
    const modal = document.getElementById("add-words-to-chapter-modal");
    if (modal) {
        modal.classList.remove("open");
        modal.classList.remove("active");
    }
}

function switchChapterContentMode(mode) {
    currentChapterContentMode = mode;
    const btnNew = document.getElementById("chapter-tab-btn-new");
    const btnExisting = document.getElementById("chapter-tab-btn-existing");
    const viewNew = document.getElementById("chapter-content-mode-new");
    const viewExisting = document.getElementById("chapter-content-mode-existing");

    if (mode === "new") {
        if (btnNew) btnNew.classList.add("active");
        if (btnExisting) btnExisting.classList.remove("active");
        if (viewNew) viewNew.style.display = "block";
        if (viewExisting) viewExisting.style.display = "none";
    } else {
        if (btnExisting) btnExisting.classList.add("active");
        if (btnNew) btnNew.classList.remove("active");
        if (viewExisting) viewExisting.style.display = "block";
        if (viewNew) viewNew.style.display = "none";
        renderChapterExistingWordsList();
    }
}

function renderChapterExistingWordsList() {
    const listContainer = document.getElementById("chapter-existing-words-list");
    const searchInput = document.getElementById("chapter-existing-search");
    const query = searchInput ? searchInput.value.toLowerCase().trim() : "";

    if (!listContainer) return;
    listContainer.innerHTML = "";

    const availableWords = allWords.filter(w => {
        if (!query) return true;
        return w.german.toLowerCase().includes(query) || w.english.toLowerCase().includes(query);
    });

    if (availableWords.length === 0) {
        listContainer.innerHTML = `<div style="text-align:center; padding:16px; color:var(--text-muted); font-size:0.85rem;">No words found matching "${escapeHTML(query)}".</div>`;
        return;
    }

    availableWords.forEach(w => {
        const itemRow = document.createElement("label");
        itemRow.style.cssText = "display:flex; align-items:center; gap:10px; padding:6px 10px; border-radius:6px; cursor:pointer; background:rgba(255,255,255,0.03);";
        
        const isAlreadyInChapter = (w.chapter_name || "").toLowerCase() === currentTargetChapterName.toLowerCase();
        const isChecked = isAlreadyInChapter || existingChapterWordsSelected.has(w.german);

        itemRow.innerHTML = `
            <input type="checkbox" value="${escapeHTML(w.german)}" ${isChecked ? 'checked' : ''} style="cursor:pointer;" onchange="handleChapterWordCheckboxChange(this)">
            <span style="font-weight:600; flex:1;">${escapeHTML(w.german)} <span style="font-weight:400; color:var(--text-muted);">— ${escapeHTML(w.english)}</span></span>
            ${w.subheading ? `<span style="font-size:0.75rem; color:#38bdf8; background:rgba(56,189,248,0.15); padding:1px 6px; border-radius:10px;">${escapeHTML(w.subheading)}</span>` : ''}
            ${w.chapter_name ? `<span style="font-size:0.75rem; color:#60a5fa; background:rgba(59,130,246,0.15); padding:1px 6px; border-radius:10px;">${escapeHTML(w.chapter_name)}</span>` : ''}
            ${w.topic_name ? `<span style="font-size:0.75rem; color:#a78bfa; background:rgba(124,58,237,0.15); padding:1px 6px; border-radius:10px;">${escapeHTML(w.topic_name)}</span>` : ''}
        `;
        listContainer.appendChild(itemRow);
    });
}

function filterChapterExistingWords() {
    renderChapterExistingWordsList();
}

function handleChapterWordCheckboxChange(cb) {
    if (cb.checked) {
        existingChapterWordsSelected.add(cb.value);
    } else {
        existingChapterWordsSelected.delete(cb.value);
    }
}

function toggleSelectAllChapterWords() {
    const listContainer = document.getElementById("chapter-existing-words-list");
    if (!listContainer) return;
    const checkboxes = listContainer.querySelectorAll("input[type='checkbox']");
    const anyUnchecked = Array.from(checkboxes).some(cb => !cb.checked);

    checkboxes.forEach(cb => {
        cb.checked = anyUnchecked;
        if (anyUnchecked) {
            existingChapterWordsSelected.add(cb.value);
        } else {
            existingChapterWordsSelected.delete(cb.value);
        }
    });
}

async function handleChapterAddWordsSubmit(event) {
    event.preventDefault();
    const newGerman = document.getElementById("chapter-new-german");
    const newEnglish = document.getElementById("chapter-new-english");
    const subSelect = document.getElementById("chapter-new-subheading-select");
    const topicSelect = document.getElementById("chapter-new-topic-select");
    const pasteText = document.getElementById("chapter-paste-text");
    const submitBtn = document.getElementById("chapter-add-words-btn");

    const german = newGerman ? newGerman.value.trim() : "";
    const english = newEnglish ? newEnglish.value.trim() : "";
    const subheading = subSelect ? subSelect.value.trim() : "";
    const topic = topicSelect ? topicSelect.value.trim() : "";
    const pasted = pasteText ? pasteText.value.trim() : "";

    if (!german && !pasted) {
        showToast("Please enter a single word or paste vocabulary lines.", "error");
        return;
    }

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = `<i data-lucide="loader-2"></i> Saving...`;
    }

    try {
        let addedCount = 0;
        if (pasted) {
            const res = await fetch("/api/words/import-text", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text: pasted, chapter_name: currentTargetChapterName, subheading, topic_name: topic })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || "Failed to import words");
            addedCount += (data.added || 0);
        }

        if (german && english) {
            const res = await fetch("/api/words", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ german, english, chapter_name: currentTargetChapterName, subheading, topic_name: topic })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || "Failed to add word");
            addedCount += 1;
        }

        closeAddWordsToChapterModal();
        showToast(`Saved to chapter '${currentTargetChapterName}'!`, "success");

        await fetchChapters();
        await fetchTopics();
        await fetchWords();
        renderChaptersTab();
    } catch (err) {
        showToast(err.message, "error");
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = `<i data-lucide="plus-circle"></i> Save to Chapter`;
            refreshIcons();
        }
    }
}

async function submitAssignExistingToChapter() {
    if (existingChapterWordsSelected.size === 0) {
        showToast("Please select at least one word from the list.", "error");
        return;
    }

    const existSubSelect = document.getElementById("chapter-existing-subheading-select");
    const chosenSubheading = existSubSelect ? existSubSelect.value.trim() : "";
    const words = Array.from(existingChapterWordsSelected);

    try {
        let response;
        if (chosenSubheading) {
            response = await fetch("/api/subheadings/assign-words", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ chapter_name: currentTargetChapterName, subheading: chosenSubheading, words })
            });
        } else {
            response = await fetch("/api/chapters/assign-words", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ chapter_name: currentTargetChapterName, words })
            });
        }

        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || "Failed to assign words");

        closeAddWordsToChapterModal();
        showToast(data.message || `Assigned words to '${currentTargetChapterName}'!`, "success");

        await fetchChapters();
        await fetchTopics();
        await fetchWords();
        renderChaptersTab();
    } catch (err) {
        showToast(err.message, "error");
    }
}

// Add Chapter Modal Functions
function openAddChapterModal() {
    const modal = document.getElementById("add-chapter-modal");
    if (modal) modal.classList.add("open");
}

function closeAddChapterModal() {
    const modal = document.getElementById("add-chapter-modal");
    if (modal) modal.classList.remove("open");
}

async function handleAddChapterSubmit(event) {
    event.preventDefault();
    const nameInput = document.getElementById("chapter-name-input");
    const descInput = document.getElementById("chapter-desc-input");
    if (!nameInput) return;

    const name = nameInput.value.trim();
    const description = descInput ? descInput.value.trim() : "";

    if (!name) return;

    try {
        const response = await fetch("/api/chapters", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, description })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || "Failed to create chapter");

        nameInput.value = "";
        if (descInput) descInput.value = "";
        closeAddChapterModal();

        showToast(`Successfully created chapter '${name}'!`, "success");
        await fetchChapters();
        renderChaptersTab();
    } catch (err) {
        showToast(err.message, "error");
    }
}

// Edit Chapter Modal Functions
function openEditChapterModal(name, description) {
    const modal = document.getElementById("edit-chapter-modal");
    const oldNameInput = document.getElementById("edit-chapter-old-name");
    const nameInput = document.getElementById("edit-chapter-name-input");
    const descInput = document.getElementById("edit-chapter-desc-input");

    if (!modal || !oldNameInput || !nameInput || !descInput) return;

    oldNameInput.value = name;
    nameInput.value = name;
    descInput.value = description || "";

    modal.classList.add("open");
}

function closeEditChapterModal() {
    const modal = document.getElementById("edit-chapter-modal");
    if (modal) modal.classList.remove("open");
}

async function handleEditChapterSubmit(event) {
    event.preventDefault();
    const oldNameInput = document.getElementById("edit-chapter-old-name");
    const nameInput = document.getElementById("edit-chapter-name-input");
    const descInput = document.getElementById("edit-chapter-desc-input");

    if (!oldNameInput || !nameInput || !descInput) return;

    const old_name = oldNameInput.value.trim();
    const new_name = nameInput.value.trim();
    const description = descInput.value.trim();

    if (!new_name) {
        showToast("Chapter name cannot be empty.", "error");
        return;
    }

    try {
        const response = await fetch("/api/chapters", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ old_name, new_name, description })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || "Failed to update chapter");

        closeEditChapterModal();
        showToast(data.message || `Chapter '${new_name}' updated successfully!`, "success");

        if (selectedFilterChapter === old_name) {
            selectedFilterChapter = new_name;
        }

        await fetchChapters();
        await fetchWords();
        renderChaptersTab();
    } catch (err) {
        showToast(err.message, "error");
    }
}

// Delete Chapter Handler
async function deleteChapter(name) {
    if (!name) return;
    if (name.toLowerCase() === "general") {
        showToast("The default 'General' chapter cannot be deleted.", "error");
        return;
    }

    const confirmed = confirm(`Are you sure you want to delete chapter '${name}'?\n\nAny vocabulary words assigned to '${name}' will be safely moved to 'General'.`);
    if (!confirmed) return;

    try {
        const response = await fetch(`/api/chapters?name=${encodeURIComponent(name)}`, {
            method: "DELETE"
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || "Failed to delete chapter");

        showToast(data.message || `Chapter '${name}' deleted successfully.`, "success");

        if (selectedFilterChapter === name) {
            selectedFilterChapter = "All";
        }

        await fetchChapters();
        await fetchWords();
        renderChaptersTab();
    } catch (err) {
        showToast(err.message, "error");
    }
}

// Close modals when clicking on dark backdrop
window.addEventListener("click", (e) => {
    if (e.target && e.target.classList && e.target.classList.contains("modal")) {
        e.target.classList.remove("open");
        e.target.classList.remove("active");
    }
});

// Dedicated Practice Stats Dashboard Renderer
function renderStatsDashboard() {
    const tbody = document.getElementById("stats-table-body");
    const emptyState = document.getElementById("stats-empty-state");
    if (!tbody) return;

    // Calculate global stats across all words
    let totalAsked = 0;
    let totalCorrect = 0;
    let totalWrong = 0;

    allWords.forEach(w => {
        totalAsked += (w.times_asked || 0);
        totalCorrect += (w.times_correct || 0);
        totalWrong += (w.times_wrong || 0);
    });

    const overallRate = totalAsked > 0 ? Math.round((totalCorrect / totalAsked) * 100) : 0;

    document.getElementById("stats-total-asked").innerText = totalAsked;
    document.getElementById("stats-total-correct").innerText = totalCorrect;
    document.getElementById("stats-total-wrong").innerText = totalWrong;
    document.getElementById("stats-overall-rate").innerText = `${overallRate}%`;

    // Filter words
    const query = (document.getElementById("stats-search-input")?.value || "").toLowerCase().trim();
    const filter = document.getElementById("stats-filter-select")?.value || "all";

    const filtered = allWords.filter(word => {
        const matchesQuery = !query || 
            word.german.toLowerCase().includes(query) || 
            word.english.toLowerCase().includes(query);
        
        if (!matchesQuery) return false;

        const asked = word.times_asked || 0;
        const correct = word.times_correct || 0;
        const rate = asked > 0 ? Math.round((correct / asked) * 100) : -1;

        if (filter === "mastered") return asked > 0 && rate >= 80;
        if (filter === "practicing") return asked > 0 && rate >= 50 && rate < 80;
        if (filter === "review") return asked > 0 && rate < 50;
        if (filter === "unpracticed") return asked === 0;

        return true;
    });

    // Sort words (Default: times_asked in descending order)
    const sortMode = document.getElementById("stats-sort-select")?.value || "asked-desc";

    filtered.sort((a, b) => {
        const askedA = a.times_asked || 0;
        const askedB = b.times_asked || 0;
        const correctA = a.times_correct || 0;
        const correctB = b.times_correct || 0;
        const rateA = askedA > 0 ? (correctA / askedA) : -1;
        const rateB = askedB > 0 ? (correctB / askedB) : -1;

        if (sortMode === "asked-desc") {
            return askedB - askedA;
        } else if (sortMode === "asked-asc") {
            return askedA - askedB;
        } else if (sortMode === "rate-desc") {
            return rateB - rateA;
        } else if (sortMode === "rate-asc") {
            return rateA - rateB;
        } else if (sortMode === "name-asc") {
            return a.german.localeCompare(b.german);
        }
        return askedB - askedA;
    });

    tbody.innerHTML = "";

    if (filtered.length === 0) {
        if (emptyState) emptyState.style.display = "flex";
        return;
    } else {
        if (emptyState) emptyState.style.display = "none";
    }

    filtered.forEach(word => {
        const tr = document.createElement("tr");
        tr.className = "animate-fade-in";

        const asked = word.times_asked || 0;
        const correct = word.times_correct || 0;
        const wrong = word.times_wrong || 0;
        const rate = asked > 0 ? Math.round((correct / asked) * 100) : 0;

        let statusBadge = "";
        if (asked === 0) {
            statusBadge = `<span class="status-pill unpracticed">Unpracticed</span>`;
        } else if (rate >= 80) {
            statusBadge = `<span class="status-pill mastered"><i data-lucide="check-circle-2"></i> Mastered</span>`;
        } else if (rate >= 50) {
            statusBadge = `<span class="status-pill practicing"><i data-lucide="zap"></i> Practicing</span>`;
        } else {
            statusBadge = `<span class="status-pill review"><i data-lucide="alert-circle"></i> Needs Review</span>`;
        }

        const rateDisplay = asked > 0 ? 
            `<div class="rate-progress-wrapper">
                <span class="rate-text">${rate}%</span>
                <div class="rate-bar-bg"><div class="rate-bar-fill ${rate >= 70 ? 'high' : 'low'}" style="width: ${rate}%;"></div></div>
            </div>` : 
            `<span class="text-muted">-</span>`;

        tr.innerHTML = `
            <td><strong>${formatGermanWordHTML(word.german)}</strong></td>
            <td>${escapeHTML(word.english)}</td>
            <td><code>${asked}</code></td>
            <td><strong class="text-correct">${correct}</strong></td>
            <td><strong class="text-incorrect">${wrong}</strong></td>
            <td>${rateDisplay}</td>
            <td>${statusBadge}</td>
            <td>
                <button class="action-icon-btn play-btn" onclick="speakGerman('${escapeJS(word.german)}')" title="Listen">
                    <i data-lucide="volume-2"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    refreshIcons();
}

function handleStatsSearch() {
    renderStatsDashboard();
}

// ── Mode Switcher (Trial Cards vs Practice Cards) ──────────────────────────
function switchCardMode(mode) {
    currentCardMode = mode;
    const trialBtn = document.getElementById("mode-btn-trial");
    const practiceBtn = document.getElementById("mode-btn-practice");
    const trialContainer = document.getElementById("trial-mode-container");
    const practiceContainer = document.getElementById("practice-mode-container");

    if (!trialBtn || !practiceBtn || !trialContainer || !practiceContainer) return;

    if (mode === "trial") {
        trialBtn.classList.add("active");
        practiceBtn.classList.remove("active");
        trialContainer.style.display = "block";
        practiceContainer.style.display = "none";
        resetQuiz();
    } else {
        practiceBtn.classList.add("active");
        trialBtn.classList.remove("active");
        practiceContainer.style.display = "block";
        trialContainer.style.display = "none";
        resetPracticeSession();
    }
    refreshIcons();
}

// ── Practice Cards Mode Logic (Decks of 10, No Flip) ────────────────────────
function resetPracticeSession() {
    practiceDeckNum = 1;
    startNewPracticeDeck();
}

function startNewPracticeDeck() {
    const cardView = document.getElementById("practice-card-view");
    const summaryView = document.getElementById("practice-summary-view");

    if (!cardView || !summaryView) return;

    if (allWords.length === 0) {
        document.getElementById("practice-front-word").innerText = "No words saved!";
        document.getElementById("deck-badge-info").innerText = "Deck 0 • Card 0 of 0";
        document.getElementById("practice-card-num").innerText = "0";
        document.getElementById("practice-total-num").innerText = "0";
        document.getElementById("practice-progress-fill").style.width = "0%";
        return;
    }

    // Select 10 random words from allWords
    const shuffled = [...allWords].sort(() => Math.random() - 0.5);
    practiceDeck = shuffled.slice(0, Math.min(10, shuffled.length));
    practiceDeckIndex = 0;
    practiceAnswers = [];

    // Show card view, hide summary view
    cardView.style.display = "block";
    summaryView.style.display = "none";

    showPracticeCard();
}

function showPracticeCard() {
    if (practiceDeck.length === 0) return;

    const currentWord = practiceDeck[practiceDeckIndex];
    const directionSelect = document.getElementById("practice-direction");
    const direction = directionSelect ? directionSelect.value : "de-en";

    const frontWordEl = document.getElementById("practice-front-word");
    const badgeEl = document.getElementById("practice-card-badge");
    const deckInfoEl = document.getElementById("deck-badge-info");
    const cardNumEl = document.getElementById("practice-card-num");
    const totalNumEl = document.getElementById("practice-total-num");
    const progressFill = document.getElementById("practice-progress-fill");
    const inputEl = document.getElementById("practice-user-input");

    const isGermanFront = direction === "de-en";
    if (isGermanFront) {
        frontWordEl.innerHTML = formatGermanWordHTML(currentWord.german);
    } else {
        frontWordEl.innerText = currentWord.english;
    }
    badgeEl.innerText = isGermanFront ? "GERMAN" : "ENGLISH";

    const totalInDeck = practiceDeck.length;
    const currentCard = practiceDeckIndex + 1;

    deckInfoEl.innerText = `Deck ${practiceDeckNum} • Card ${currentCard} of ${totalInDeck}`;
    cardNumEl.innerText = currentCard;
    totalNumEl.innerText = totalInDeck;

    const percent = ((practiceDeckIndex) / totalInDeck) * 100;
    progressFill.style.width = `${percent}%`;
}

// Record practice stats to server database
async function recordPracticeResult(german, isCorrect) {
    if (!german) return;
    try {
        await fetch("/api/words/practice-result", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ german, is_correct: isCorrect })
        });
    } catch (e) {
        console.error("Failed to record practice stats:", e);
    }
}

function slideToNextPracticeCard(onComplete) {
    const wrapper = document.querySelector("#practice-card-view .flashcard-wrapper");
    const buttons = document.getElementById("practice-assessment-buttons");

    if (buttons) {
        buttons.classList.add("disabled");
    }

    if (!wrapper) {
        onComplete();
        if (buttons) buttons.classList.remove("disabled");
        return;
    }

    // 1. Slide current practice card out to the left
    wrapper.classList.remove("slide-in");
    wrapper.classList.add("slide-out");

    // 2. Wait for slide-out animation (280ms) to complete off-screen
    setTimeout(() => {
        wrapper.classList.remove("slide-out");

        // Execute state update & show new card content off-screen
        onComplete();

        // Slide new practice card in from the right
        wrapper.classList.add("slide-in");

        setTimeout(() => {
            wrapper.classList.remove("slide-in");
            if (buttons) buttons.classList.remove("disabled");
        }, 350);
    }, 280);
}

function handlePracticeAssess(isCorrect) {
    if (practiceDeck.length === 0 || practiceDeckIndex >= practiceDeck.length) return;

    const directionSelect = document.getElementById("practice-direction");
    const direction = directionSelect ? directionSelect.value : "de-en";
    const currentWord = practiceDeck[practiceDeckIndex];

    const isGermanFront = direction === "de-en";
    const promptText = isGermanFront ? currentWord.german : currentWord.english;
    const targetText = isGermanFront ? currentWord.english : currentWord.german;

    // Record practice result in database
    recordPracticeResult(currentWord.german, isCorrect);

    // Update global session stats
    sessionTotalReviews++;
    if (isCorrect) sessionCorrectReviews++;
    updateStats();

    // Record answer assessment
    practiceAnswers.push({
        index: practiceDeckIndex + 1,
        prompt: promptText,
        target: targetText,
        isCorrect: isCorrect,
        germanWord: currentWord.german
    });

    // Use sliding animation to advance to the next practice card or summary view
    slideToNextPracticeCard(() => {
        practiceDeckIndex++;

        if (practiceDeckIndex >= practiceDeck.length) {
            showDeckSummary();
        } else {
            showPracticeCard();
        }
    });
}

function showDeckSummary() {
    const cardView = document.getElementById("practice-card-view");
    const summaryView = document.getElementById("practice-summary-view");
    const tbody = document.getElementById("summary-table-body");
    const scoreBadge = document.getElementById("summary-score-badge");

    if (!cardView || !summaryView || !tbody || !scoreBadge) return;

    const correctCount = practiceAnswers.filter(a => a.isCorrect).length;
    const totalCount = practiceAnswers.length;
    const percentage = Math.round((correctCount / totalCount) * 100);

    scoreBadge.innerText = `Deck ${practiceDeckNum} Score: ${correctCount} / ${totalCount} (${percentage}%)`;
    scoreBadge.className = percentage >= 70 ? "summary-score-badge pass" : "summary-score-badge review";

    tbody.innerHTML = "";

    practiceAnswers.forEach(ans => {
        const tr = document.createElement("tr");
        tr.className = ans.isCorrect ? "summary-row-correct" : "summary-row-incorrect";

        const statusIcon = ans.isCorrect ? 
            `<span class="badge-status success"><i data-lucide="check-circle-2"></i> Answered</span>` : 
            `<span class="badge-status fail"><i data-lucide="help-circle"></i> Don't know</span>`;

        tr.innerHTML = `
            <td><strong>${ans.index}</strong></td>
            <td>${escapeHTML(ans.prompt)}</td>
            <td><strong>${escapeHTML(ans.target)}</strong></td>
            <td>${statusIcon}</td>
            <td>
                <button type="button" class="action-icon-btn play-btn" onclick="speakGerman('${escapeJS(ans.germanWord)}')" title="Listen">
                    <i data-lucide="volume-2"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    cardView.style.display = "none";
    summaryView.style.display = "block";

    refreshIcons();

    // Scroll smoothly to summary top
    summaryView.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function nextPracticeDeck() {
    practiceDeckNum++;
    startNewPracticeDeck();
}

function speakPracticeWord(event) {
    if (event) event.stopPropagation();
    if (practiceDeck.length === 0 || practiceDeckIndex >= practiceDeck.length) return;
    const currentWord = practiceDeck[practiceDeckIndex];
    if (currentWord && currentWord.german) {
        speakGerman(currentWord.german);
    }
}

// Flashcard Practice Mode Logic
function resetQuiz() {
    if (allWords.length === 0) {
        document.getElementById("card-front-word").innerText = "No words saved!";
        document.getElementById("card-back-word").innerText = "Add words in the Manager tab.";
        document.getElementById("current-card-num").innerText = "0";
        document.getElementById("total-card-num").innerText = "0";
        document.getElementById("quiz-progress-fill").style.width = "0%";
        document.getElementById("assessment-buttons").classList.add("disabled");
        return;
    }

    // Shuffle vocabulary list
    quizQueue = [...allWords].sort(() => Math.random() - 0.5);
    quizIndex = 0;
    
    showCard();
}

function showCard() {
    isCardFlipped = false;
    const cardElement = document.getElementById("flashcard");
    cardElement.classList.remove("flipped");

    const studyDirection = document.getElementById("study-direction").value;
    const currentWord = quizQueue[quizIndex];

    const currentCardNum = document.getElementById("current-card-num");
    const totalCardNum = document.getElementById("total-card-num");
    const progressFill = document.getElementById("quiz-progress-fill");
    
    currentCardNum.innerText = quizIndex + 1;
    totalCardNum.innerText = quizQueue.length;
    
    const progressPercent = (quizIndex / quizQueue.length) * 100;
    progressFill.style.width = `${progressPercent}%`;

    // Enable/disable assessment buttons based on direct assessment mode
    if (directAssessmentMode) {
        document.getElementById("assessment-buttons").classList.remove("disabled");
    } else {
        document.getElementById("assessment-buttons").classList.add("disabled");
    }

    // Update hint text based on mode
    const cardHint = document.querySelector(".card-hint");
    if (cardHint) {
        cardHint.innerText = "Click to flip & see answer";
    }

    // Populate word contents based on direction
    const frontWord = document.getElementById("card-front-word");
    const backWord = document.getElementById("card-back-word");

    if (studyDirection === "de-en") {
        frontWord.innerHTML = formatGermanWordHTML(currentWord.german);
        backWord.innerText = currentWord.english;
        // Set badges
        document.querySelector(".card-badge").innerText = "GERMAN";
        document.querySelector(".card-badge-back").innerText = "ENGLISH";
    } else {
        frontWord.innerText = currentWord.english;
        backWord.innerHTML = formatGermanWordHTML(currentWord.german);
        // Set badges
        document.querySelector(".card-badge").innerText = "ENGLISH";
        document.querySelector(".card-badge-back").innerText = "GERMAN";
    }
}

function flipCard() {
    if (quizQueue.length === 0) return;

    const cardElement = document.getElementById("flashcard");
    isCardFlipped = !isCardFlipped;
    
    if (isCardFlipped) {
        cardElement.classList.add("flipped");
        // Enable response buttons once flipped (answer visible)
        document.getElementById("assessment-buttons").classList.remove("disabled");
    } else {
        cardElement.classList.remove("flipped");
        if (!directAssessmentMode) {
            document.getElementById("assessment-buttons").classList.add("disabled");
        }
    }
}

function slideToNextCard() {
    if (quizQueue.length === 0) return;

    const wrapper = document.querySelector(".flashcard-wrapper");
    const cardElement = document.getElementById("flashcard");
    const assessmentButtons = document.getElementById("assessment-buttons");

    if (assessmentButtons) {
        assessmentButtons.classList.add("disabled");
    }

    if (!wrapper) return;

    // Freeze 3D flip rotation transition immediately so card slides out as-is without flipping
    if (cardElement) {
        cardElement.style.transition = "none";
    }

    // 1. Slide current card out to the left
    wrapper.classList.remove("slide-in");
    wrapper.classList.add("slide-out");

    // 2. Wait for slide-out animation (280ms) to complete off-screen
    setTimeout(() => {
        // Reset flip state instantly while hidden off-screen (no 3D flip animation occurs)
        if (cardElement) {
            cardElement.classList.remove("flipped");
            isCardFlipped = false;
        }

        wrapper.classList.remove("slide-out");

        quizIndex++;
        if (quizIndex >= quizQueue.length) {
            showCompletion();
            if (cardElement) {
                setTimeout(() => { cardElement.style.transition = ""; }, 80);
            }
        } else {
            showCard();
            
            // Slide next card in from the right
            wrapper.classList.add("slide-in");

            // Restore 3D flip transition after slide-in starts so normal user clicks can flip again
            setTimeout(() => {
                if (cardElement) {
                    cardElement.style.transition = "";
                }
            }, 80);

            setTimeout(() => {
                wrapper.classList.remove("slide-in");
            }, 350);
        }
    }, 280);
}

function handleDirectAssessToggle() {
    const toggleInput = document.getElementById("direct-assess-toggle");
    directAssessmentMode = toggleInput ? toggleInput.checked : false;
    
    // Hint text is always the same (card click always flips)
    const cardHint = document.querySelector(".card-hint");
    if (cardHint) {
        cardHint.innerText = "Click to flip & see answer";
    }

    // If switching TO direct mode while card is already flipped, unflip it first
    if (directAssessmentMode && isCardFlipped) {
        isCardFlipped = false;
        document.getElementById("flashcard").classList.remove("flipped");
    }

    // Update assessment buttons visibility/disabled state for current card
    if (quizQueue.length > 0) {
        const assessmentButtons = document.getElementById("assessment-buttons");
        if (directAssessmentMode || isCardFlipped) {
            assessmentButtons.classList.remove("disabled");
        } else {
            assessmentButtons.classList.add("disabled");
        }
    }
}

function handleCardReview(isCorrect) {
    const currentWord = quizQueue[quizIndex];
    if (currentWord) {
        recordPracticeResult(currentWord.german, isCorrect);
    }

    sessionTotalReviews++;
    if (isCorrect) sessionCorrectReviews++;
    
    updateStats();

    // Slide card out to next card (instead of flipping back in place)
    slideToNextCard();
}

function showCompletion() {
    const progressFill = document.getElementById("quiz-progress-fill");
    progressFill.style.width = "100%";

    showToast("Great job! You finished the card deck. 🎉", "success");
    
    const cardElement = document.getElementById("flashcard");
    cardElement.classList.remove("flipped");
    document.getElementById("card-front-word").innerText = "Deck Finished! 🎉";
    document.getElementById("card-back-word").innerText = "All vocabulary items reviewed.";
    document.getElementById("assessment-buttons").classList.add("disabled");
}

// Text-to-Speech Pronunciation
function speakGerman(text) {
    if (!("speechSynthesis" in window)) {
        showToast("Text-to-speech not supported in this browser.", "error");
        return;
    }

    // Cancel current speaking if any
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "de-DE";
    
    // Attempt to set a high quality native German voice if available
    const voices = window.speechSynthesis.getVoices();
    const germanVoice = voices.find(voice => voice.lang.startsWith("de"));
    if (germanVoice) {
        utterance.voice = germanVoice;
    }

    window.speechSynthesis.speak(utterance);
}

// Speak German Word from back of flashcard (avoid card flip click)
function speakGermanWord(event) {
    event.stopPropagation(); // Avoid flipping the card again
    const currentWord = quizQueue[quizIndex];
    if (currentWord) {
        speakGerman(currentWord.german);
    }
}

// Basic Toast Notifications
function showToast(message, type = "success") {
    // Create toast container if it doesn't exist
    let container = document.getElementById("toast-container");
    if (!container) {
        container = document.createElement("div");
        container.id = "toast-container";
        // Styling Toast Container — centred at top
        Object.assign(container.style, {
            position: "fixed",
            top: "24px",
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "8px",
            zIndex: 1000
        });
        document.body.appendChild(container);

    }

    const toast = document.createElement("div");
    toast.className = `toast ${type} animate-fade-in`;
    toast.innerText = message;

    // Style toast item
    const typeColor = type === "success" ? "var(--accent-green)" : "var(--accent-red)";
    Object.assign(toast.style, {
        background: "#ffffff",
        backdropFilter: "none",
        border: `1px solid ${typeColor}`,
        color: "#000000",
        padding: "12px 24px",
        borderRadius: "var(--border-radius-sm)",
        fontSize: "0.9rem",
        fontWeight: "500",
        boxShadow: "0 8px 16px rgba(0,0,0,0.3)",
        animation: "fadeIn 0.3s ease, fadeOut 0.3s ease 2.7s forwards"
    });

    // Create fade out keyframes style in page if not exist
    if (!document.getElementById("toast-keyframes")) {
        const style = document.createElement("style");
        style.id = "toast-keyframes";
        style.innerHTML = `
            @keyframes fadeOut {
                from { opacity: 1; transform: translateY(0); }
                to { opacity: 0; transform: translateY(6px); }
            }
        `;
        document.head.appendChild(style);
    }

    container.appendChild(toast);

    setTimeout(() => {
        toast.remove();
        if (container.children.length === 0) {
            container.remove();
        }
    }, 3000);
}

// Helpers
function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
}

function escapeJS(str) {
    return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"');
}

// File Upload Logic
function handleFileSelected(event) {
    const fileInput = event.target;
    const submitBtn = document.getElementById("upload-submit-btn");
    const filenameLabel = document.getElementById("dropzone-filename");

    if (fileInput.files && fileInput.files[0]) {
        const file = fileInput.files[0];
        filenameLabel.innerText = file.name;
        submitBtn.disabled = false;
    } else {
        filenameLabel.innerText = "Choose or drag .txt file";
        submitBtn.disabled = true;
    }
}

async function handleFileUpload(event) {
    event.preventDefault();
    const fileInput = document.getElementById("txt-file-input");
    const submitBtn = document.getElementById("upload-submit-btn");
    const importChapterSelect = document.getElementById("import-chapter-select");
    const importSubheadingSelect = document.getElementById("import-subheading-select");
    const importTopicSelect = document.getElementById("import-topic-select");

    if (!fileInput.files || !fileInput.files[0]) return;

    const file = fileInput.files[0];
    const targetChapter = importChapterSelect ? (importChapterSelect.value || "General") : ((selectedFilterChapter && selectedFilterChapter !== "All") ? selectedFilterChapter : "General");
    const targetSubheading = importSubheadingSelect ? importSubheadingSelect.value : "";
    const targetTopic = importTopicSelect ? importTopicSelect.value : "";
    const formData = new FormData();
    formData.append("file", file);
    formData.append("chapter_name", targetChapter);
    if (targetSubheading) {
        formData.append("subheading", targetSubheading);
    }
    if (targetTopic) {
        formData.append("topic_name", targetTopic);
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = `<i data-lucide="loader-2"></i> Uploading...`;

    try {
        const response = await fetch("/api/words/upload", {
            method: "POST",
            body: formData
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.detail || "Failed to upload file");
        }

        showToast(`Imported ${data.added} words (${data.duplicates} duplicates skipped)`, "success");
        
        // Reset file input & UI
        fileInput.value = "";
        document.getElementById("dropzone-filename").innerText = "Choose or drag .txt file";
        
        await fetchChapters();
        await fetchTopics();
        await fetchWords();
    } catch (error) {
        showToast(error.message, "error");
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `<i data-lucide="upload-cloud"></i> Upload &amp; Import`;
        refreshIcons();
    }
}

// Import Sub-Tab Switcher (.TXT File vs Paste Text)
function switchImportSubTab(tabName) {
    const fileTabBtn = document.getElementById("import-subtab-file");
    const textTabBtn = document.getElementById("import-subtab-text");
    const fileSection = document.getElementById("import-section-file");
    const textSection = document.getElementById("import-section-text");

    if (!fileTabBtn || !textTabBtn || !fileSection || !textSection) return;

    if (tabName === "file") {
        fileTabBtn.classList.add("active");
        textTabBtn.classList.remove("active");
        fileSection.style.display = "block";
        textSection.style.display = "none";
    } else {
        textTabBtn.classList.add("active");
        fileTabBtn.classList.remove("active");
        textSection.style.display = "block";
        fileSection.style.display = "none";
    }
}

// Paste Text Batch Import Handler
async function handleTextImport(event) {
    event.preventDefault();
    const rawTextInput = document.getElementById("raw-text-input");
    const submitBtn = document.getElementById("text-import-submit-btn");
    const importChapterSelect = document.getElementById("import-chapter-select");
    const importSubheadingSelect = document.getElementById("import-subheading-select");
    const importTopicSelect = document.getElementById("import-topic-select");

    if (!rawTextInput || !submitBtn) return;

    const text = rawTextInput.value.trim();
    if (!text) {
        showToast("Please paste some vocabulary text to import.", "error");
        return;
    }

    const targetChapter = importChapterSelect ? (importChapterSelect.value || "General") : ((selectedFilterChapter && selectedFilterChapter !== "All") ? selectedFilterChapter : "General");
    const targetSubheading = importSubheadingSelect ? importSubheadingSelect.value : "";
    const targetTopic = importTopicSelect ? importTopicSelect.value : "";

    submitBtn.disabled = true;
    submitBtn.innerHTML = `<i data-lucide="loader-2"></i> Importing...`;
    refreshIcons();

    try {
        const response = await fetch("/api/words/import-text", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text, chapter_name: targetChapter, subheading: targetSubheading, topic_name: targetTopic })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.detail || "Failed to import text");
        }

        showToast(`Imported ${data.added} words (${data.duplicates} duplicates skipped)`, "success");
        
        // Reset text area
        rawTextInput.value = "";
        
        await fetchChapters();
        await fetchTopics();
        await fetchWords();
    } catch (error) {
        showToast(error.message, "error");
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `<i data-lucide="check-circle-2"></i> Parse &amp; Import Text`;
        refreshIcons();
    }
}


