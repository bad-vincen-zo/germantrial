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
    fetchWords();
    // Sync direct assessment checkbox state on load
    const toggleInput = document.getElementById("direct-assess-toggle");
    if (toggleInput) {
        directAssessmentMode = toggleInput.checked;
    }
    // Initialize icons
    if (window.lucide) {
        lucide.createIcons();
    }
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
    
    if (window.lucide) {
        lucide.createIcons();
    }
}

window.toggleTheme = toggleTheme;

// State for Chapters
let appChapters = [];
let selectedFilterChapter = "All";

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

function renderChapterDropdowns() {
    const addSelect = document.getElementById("add-chapter-select");
    const filterSelect = document.getElementById("filter-chapter-select");

    if (addSelect) {
        addSelect.innerHTML = "";
        appChapters.forEach(ch => {
            const opt = document.createElement("option");
            opt.value = ch.name;
            opt.innerText = ch.name;
            addSelect.appendChild(opt);
        });
    }

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
    }
}

function handleChapterFilterChange(selectElement) {
    selectedFilterChapter = selectElement.value;
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
        const chapterName = word.chapter_name || "General";
        tr.innerHTML = `
            <td>${formatGermanWordHTML(word.german)}</td>
            <td>${escapeHTML(word.english)}</td>
            <td><span class="deck-badge" style="font-size: 0.78rem; padding: 4px 10px;">${escapeHTML(chapterName)}</span></td>
            <td>
                <button class="action-icon-btn play-btn" onclick="speakGerman('${escapeJS(word.german)}')" title="Listen to pronunciation">
                    <i data-lucide="volume-2"></i>
                </button>
            </td>
            <td class="actions-col">
                <div class="actions-cell-wrapper">
                    <button class="action-icon-btn edit-btn" onclick="openEditModal('${escapeJS(word.german)}', '${escapeJS(word.english)}')" title="Edit Word">
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

    if (window.lucide) {
        lucide.createIcons();
    }
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
    
    const german = germanInput.value.trim();
    const english = englishInput.value.trim();
    const chapterName = addChapterSelect ? addChapterSelect.value : "General";

    if (!german || !english) return;

    try {
        const response = await fetch("/api/words", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ german, english, chapter_name: chapterName })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.detail || "Failed to add word");
        }

        germanInput.value = "";
        englishInput.value = "";
        germanInput.focus();

        showToast(`Successfully added "${german}" to chapter '${chapterName}'!`, "success");
        await fetchChapters();
        await fetchWords();
        
    } catch (error) {
        showToast(error.message, "error");
    }
}

// Edit Modal Functions
function openEditModal(german, english) {
    document.getElementById("edit-old-german").value = german;
    document.getElementById("edit-german-input").value = german;
    document.getElementById("edit-english-input").value = english;
    
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

    if (!new_german || !new_english) return;

    try {
        const response = await fetch("/api/words", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ old_german, new_german, new_english })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.detail || "Failed to update word");
        }

        closeEditModal();
        showToast(`Successfully updated word!`, "success");
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
            word.english.toLowerCase().includes(query);
        const wordChapter = (word.chapter_name || "General").toLowerCase();
        const matchesChapter = selectedFilterChapter === "All" || wordChapter === selectedFilterChapter.toLowerCase();
        return matchesQuery && matchesChapter;
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
        card.innerHTML = `
            <div class="chapter-card-header">
                <div class="chapter-card-title"><i data-lucide="folder" style="margin-right:6px;"></i> ${escapeHTML(ch.name)}</div>
                <span class="chapter-card-count">${ch.word_count || 0} words</span>
            </div>
            <p style="font-size:0.88rem; color:var(--text-secondary); margin-top:8px;">${escapeHTML(ch.description || "No description provided.")}</p>
            <div style="margin-top:16px; display:flex; gap:8px;">
                <button type="button" class="secondary-btn btn-sm" style="flex:1;" onclick="filterByChapter('${escapeJS(ch.name)}')">
                    <i data-lucide="filter"></i> View Words
                </button>
            </div>
        `;
        container.appendChild(card);
    });

    if (window.lucide) lucide.createIcons();
}

function filterByChapter(chapterName) {
    selectedFilterChapter = chapterName;
    const filterSelect = document.getElementById("filter-chapter-select");
    if (filterSelect) filterSelect.value = chapterName;
    switchTab("manage");
    handleSearch();
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

    if (window.lucide) lucide.createIcons();
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
    if (window.lucide) lucide.createIcons();
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

    if (window.lucide) lucide.createIcons();

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

    if (!fileInput.files || !fileInput.files[0]) return;

    const file = fileInput.files[0];
    const formData = new FormData();
    formData.append("file", file);

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
        
        await fetchWords();
    } catch (error) {
        showToast(error.message, "error");
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `<i data-lucide="upload-cloud"></i> Upload &amp; Import`;
        if (window.lucide) lucide.createIcons();
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

    if (!rawTextInput || !submitBtn) return;

    const text = rawTextInput.value.trim();
    if (!text) {
        showToast("Please paste some vocabulary text to import.", "error");
        return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = `<i data-lucide="loader-2"></i> Importing...`;
    if (window.lucide) lucide.createIcons();

    try {
        const response = await fetch("/api/words/import-text", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.detail || "Failed to import text");
        }

        showToast(`Imported ${data.added} words (${data.duplicates} duplicates skipped)`, "success");
        
        // Reset text area
        rawTextInput.value = "";
        
        await fetchWords();
    } catch (error) {
        showToast(error.message, "error");
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `<i data-lucide="check-circle-2"></i> Parse &amp; Import Text`;
        if (window.lucide) lucide.createIcons();
    }
}


