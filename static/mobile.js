/**
 * Wortschatz Mobile App Script
 * Optimized for Smartphones & Touch Browsers
 */

// Global State
let allWords = [];
let filteredWords = [];
let appChapters = [];
let activeChapterFilter = "All";

let currentDeck = [];
let currentCardIndex = 0;
let isCardFlipped = false;

// Quiz State
let quizQuestion = null;
let quizOptions = [];
let quizScore = 0;
let quizTotal = 0;

// Swipe Gesture Tracking
let touchStartX = 0;
let touchStartY = 0;

// Safe icon refresher
function refreshIcons() {
    if (typeof window !== "undefined" && window.lucide && typeof window.lucide.createIcons === "function") {
        window.lucide.createIcons();
    }
}

// ── Initialize App ────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
    initTheme();
    initTouchGestures();
    loadAppData();
});

// ── Theme Management ──────────────────────────────────────────────────────────
function initTheme() {
    const savedTheme = localStorage.getItem("theme") || "dark";
    applyTheme(savedTheme);
}

function toggleTheme() {
    const isLight = document.documentElement.getAttribute("data-theme") === "light";
    const nextTheme = isLight ? "dark" : "light";
    applyTheme(nextTheme);
    localStorage.setItem("theme", nextTheme);
}

function applyTheme(theme) {
    if (theme === "light") {
        document.documentElement.setAttribute("data-theme", "light");
        document.body.setAttribute("data-theme", "light");
    } else {
        document.documentElement.setAttribute("data-theme", "dark");
        document.body.setAttribute("data-theme", "dark");
    }
    const themeBtn = document.getElementById("mobile-theme-btn");
    if (themeBtn) {
        themeBtn.innerHTML = `<i data-lucide="${theme === 'light' ? 'moon' : 'sun'}" style="width:17px; height:17px;"></i>`;
    }
    refreshIcons();
}

// ── Data Fetching ─────────────────────────────────────────────────────────────
async function loadAppData() {
    try {
        const [wordsRes, chaptersRes] = await Promise.all([
            fetch("/api/words"),
            fetch("/api/chapters")
        ]);

        if (wordsRes.ok) {
            allWords = await wordsRes.json();
            filteredWords = [...allWords];
        }

        if (chaptersRes.ok) {
            appChapters = await chaptersRes.json();
            renderChapterPills();
            renderChaptersTab();
            populateAddChapterDropdown();
        }

        buildDeck();
        renderVocabList();
        generateQuizQuestion();
        refreshIcons();
    } catch (e) {
        console.error("Error loading mobile data:", e);
        showToast("Error loading vocabulary data");
    }
}

// ── Navigation Tabs ───────────────────────────────────────────────────────────
function switchTab(tabId) {
    // Hide all tabs
    document.querySelectorAll(".mobile-tab-view").forEach(tab => tab.classList.remove("active"));
    document.querySelectorAll(".bottom-tab-btn").forEach(btn => btn.classList.remove("active"));

    const activeView = document.getElementById(`view-${tabId}`);
    const activeBtn = document.getElementById(`tab-${tabId}`);

    if (activeView) activeView.classList.add("active");
    if (activeBtn) activeBtn.classList.add("active");

    if (tabId === "flashcards") {
        updateCardUI();
    } else if (tabId === "vocab") {
        renderVocabList();
    } else if (tabId === "quiz") {
        if (!quizQuestion) generateQuizQuestion();
    } else if (tabId === "chapters") {
        renderChaptersTab();
    }

    refreshIcons();
}

// ── Chapter Pills Filter Bar ──────────────────────────────────────────────────
function renderChapterPills() {
    const pillContainer = document.getElementById("chapter-pills-container");
    if (!pillContainer) return;

    pillContainer.innerHTML = "";

    // "All" Pill
    const allPill = document.createElement("button");
    allPill.className = `filter-pill ${activeChapterFilter === "All" ? "active" : ""}`;
    allPill.textContent = `All (${allWords.length})`;
    allPill.onclick = () => selectChapterFilter("All");
    pillContainer.appendChild(allPill);

    // Chapter Pills
    appChapters.forEach(ch => {
        const pill = document.createElement("button");
        pill.className = `filter-pill ${activeChapterFilter === ch.name ? "active" : ""}`;
        pill.textContent = `${ch.name} (${ch.word_count || 0})`;
        pill.onclick = () => selectChapterFilter(ch.name);
        pillContainer.appendChild(pill);
    });
}

function selectChapterFilter(chapterName) {
    activeChapterFilter = chapterName;
    renderChapterPills();

    if (chapterName === "All") {
        filteredWords = [...allWords];
    } else {
        filteredWords = allWords.filter(w => (w.chapter_name || "General").toLowerCase() === chapterName.toLowerCase());
    }

    buildDeck();
    renderVocabList();
    generateQuizQuestion();
    showToast(`Filtered by ${chapterName}`);
}

// ── Tab 1: Flashcards Engine ──────────────────────────────────────────────────
function buildDeck() {
    currentDeck = [...filteredWords];
    // Shuffle deck
    for (let i = currentDeck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [currentDeck[i], currentDeck[j]] = [currentDeck[j], currentDeck[i]];
    }
    currentCardIndex = 0;
    isCardFlipped = false;
    updateCardUI();
}

function updateCardUI() {
    const cardScene = document.getElementById("flashcard-scene");
    const progressFill = document.getElementById("card-progress-fill");
    const counterText = document.getElementById("card-counter-text");
    const frontWord = document.getElementById("card-front-word");
    const backWord = document.getElementById("card-back-word");
    const frontSub = document.getElementById("card-front-sub");
    const backSub = document.getElementById("card-back-sub");
    const chapterTag = document.getElementById("card-chapter-tag");

    if (currentDeck.length === 0) {
        if (frontWord) frontWord.textContent = "No Words";
        if (backWord) backWord.textContent = "Add words or select another chapter";
        if (frontSub) frontSub.textContent = "";
        if (backSub) backSub.textContent = "";
        if (counterText) counterText.textContent = "0 / 0";
        if (progressFill) progressFill.style.width = "0%";
        return;
    }

    const word = currentDeck[currentCardIndex];
    if (cardScene) cardScene.classList.remove("flipped");
    isCardFlipped = false;

    if (frontWord) {
        frontWord.innerHTML = formatGermanText(word.german);
    }
    if (backWord) {
        backWord.textContent = word.english;
    }
    if (frontSub) {
        frontSub.textContent = word.subheading ? `📌 ${word.subheading}` : "";
    }
    if (backSub) {
        backSub.textContent = word.chapter_name ? `📁 ${word.chapter_name}` : "General";
    }
    if (chapterTag) {
        chapterTag.textContent = word.chapter_name || "General";
    }

    const progressPct = Math.round(((currentCardIndex + 1) / currentDeck.length) * 100);
    if (progressFill) progressFill.style.width = `${progressPct}%`;
    if (counterText) counterText.textContent = `${currentCardIndex + 1} / ${currentDeck.length}`;

    refreshIcons();
}

function flipCard() {
    const cardScene = document.getElementById("flashcard-scene");
    if (!cardScene || currentDeck.length === 0) return;
    isCardFlipped = !isCardFlipped;
    cardScene.classList.toggle("flipped", isCardFlipped);
}

function nextCard(wasCorrect) {
    if (currentDeck.length === 0) return;

    const currentWord = currentDeck[currentCardIndex];
    if (currentWord) {
        // Asynchronously report result to server
        fetch("/api/practice/answer", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ german: currentWord.german, is_correct: wasCorrect })
        }).catch(err => console.log("Practice sync note:", err));
    }

    currentCardIndex = (currentCardIndex + 1) % currentDeck.length;
    updateCardUI();
}

// ── Touch / Swipe Gesture Handlers ────────────────────────────────────────────
function initTouchGestures() {
    const cardScene = document.getElementById("flashcard-scene");
    if (!cardScene) return;

    cardScene.addEventListener("touchstart", (e) => {
        touchStartX = e.changedTouches[0].screenX;
        touchStartY = e.changedTouches[0].screenY;
    }, { passive: true });

    cardScene.addEventListener("touchend", (e) => {
        const touchEndX = e.changedTouches[0].screenX;
        const touchEndY = e.changedTouches[0].screenY;
        handleSwipeGesture(touchStartX, touchStartY, touchEndX, touchEndY);
    }, { passive: true });
}

function handleSwipeGesture(startX, startY, endX, endY) {
    const diffX = endX - startX;
    const diffY = endY - startY;

    // Check if horizontal swipe
    if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 40) {
        if (diffX > 0) {
            // Swiped Right -> Mark Correct
            nextCard(true);
        } else {
            // Swiped Left -> Mark Wrong/Review
            nextCard(false);
        }
    }
}

// ── German Audio Pronunciation ────────────────────────────────────────────────
function speakGerman(text, e) {
    if (e) e.stopPropagation();
    if (!('speechSynthesis' in window)) {
        showToast("Audio speech not supported in this browser");
        return;
    }

    window.speechSynthesis.cancel();
    const cleanWord = text.replace(/^(der|die|das)\s+/i, "").trim();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "de-DE";
    utter.rate = 0.9;
    window.speechSynthesis.speak(utter);
}

function speakCurrentCard(e) {
    if (currentDeck.length === 0) return;
    const word = currentDeck[currentCardIndex];
    if (word) speakGerman(word.german, e);
}

// ── Article Coloring Helper ───────────────────────────────────────────────────
function formatGermanText(german) {
    if (!german) return "";
    const lower = german.trim().toLowerCase();
    if (lower.startsWith("der ")) {
        return `<span class="gender-der">der</span> ${escapeHTML(german.slice(4))}`;
    } else if (lower.startsWith("die ")) {
        return `<span class="gender-die">die</span> ${escapeHTML(german.slice(4))}`;
    } else if (lower.startsWith("das ")) {
        return `<span class="gender-das">das</span> ${escapeHTML(german.slice(4))}`;
    }
    return escapeHTML(german);
}

function escapeHTML(str) {
    if (!str) return "";
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ── Tab 2: Vocab List & Search ────────────────────────────────────────────────
function renderVocabList() {
    const listContainer = document.getElementById("mobile-word-list");
    const searchInput = document.getElementById("vocab-search-input");
    const countBadge = document.getElementById("vocab-count-badge");

    if (!listContainer) return;

    const query = (searchInput && typeof searchInput.value === "string") ? searchInput.value.toLowerCase().trim() : "";
    const wordsToDisplay = filteredWords.filter(w => {
        if (!query) return true;
        const g = (w.german || "").toLowerCase();
        const e = (w.english || "").toLowerCase();
        return g.includes(query) || e.includes(query);
    });

    if (countBadge) {
        countBadge.textContent = `${wordsToDisplay.length} words`;
    }

    if (wordsToDisplay.length === 0) {
        listContainer.innerHTML = `
            <div style="text-align:center; padding:30px 10px; color:var(--text-muted);">
                <i data-lucide="search-x" style="width:36px; height:36px; margin-bottom:8px; opacity:0.5;"></i>
                <p>No words found matching "${escapeHTML(query)}"</p>
            </div>
        `;
        refreshIcons();
        return;
    }

    listContainer.innerHTML = wordsToDisplay.slice(0, 150).map(w => `
        <div class="mobile-word-card">
            <div class="word-info-col">
                <div class="word-german-row">
                    ${formatGermanText(w.german)}
                </div>
                <div class="word-english-row">
                    ${escapeHTML(w.english)}
                </div>
                <div class="word-meta-badges">
                    ${w.chapter_name ? `<span class="mini-badge">📁 ${escapeHTML(w.chapter_name)}</span>` : ''}
                    ${w.subheading ? `<span class="mini-badge">📌 ${escapeHTML(w.subheading)}</span>` : ''}
                </div>
            </div>
            <button class="header-icon-btn" onclick="speakGerman('${escapeJS(w.german)}', event)" title="Listen">
                <i data-lucide="volume-2"></i>
            </button>
        </div>
    `).join("");

    refreshIcons();
}

function handleVocabSearch() {
    renderVocabList();
}

function escapeJS(str) {
    if (!str) return "";
    return str.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/"/g, '\\"');
}

// ── Tab 3: Quiz Engine ────────────────────────────────────────────────────────
function generateQuizQuestion() {
    const questionEl = document.getElementById("quiz-german-prompt");
    const optionsGrid = document.getElementById("quiz-options-grid");
    const scoreEl = document.getElementById("quiz-score-display");

    if (filteredWords.length < 4) {
        if (questionEl) questionEl.textContent = "Need at least 4 words";
        if (optionsGrid) optionsGrid.innerHTML = `<p style="text-align:center; color:var(--text-muted); padding:20px;">Please add more vocabulary to practice quiz mode.</p>`;
        return;
    }

    const randIdx = Math.floor(Math.random() * filteredWords.length);
    quizQuestion = filteredWords[randIdx];

    // Pick 3 random distractor words
    const distractors = filteredWords.filter(w => w.german !== quizQuestion.german);
    const shuffledDistractors = distractors.sort(() => 0.5 - Math.random()).slice(0, 3);
    quizOptions = [quizQuestion, ...shuffledDistractors].sort(() => 0.5 - Math.random());

    if (questionEl) {
        questionEl.innerHTML = formatGermanText(quizQuestion.german);
    }

    if (scoreEl) {
        scoreEl.textContent = `Score: ${quizScore} / ${quizTotal}`;
    }

    if (optionsGrid) {
        optionsGrid.innerHTML = quizOptions.map((opt, i) => `
            <button class="quiz-option-btn" onclick="handleQuizAnswer(${i}, this)">
                <span>${escapeHTML(opt.english)}</span>
                <span class="quiz-icon-holder"><i data-lucide="circle" style="width:16px; height:16px; opacity:0.3;"></i></span>
            </button>
        `).join("");
    }

    refreshIcons();
}

function handleQuizAnswer(index, btnEl) {
    const chosen = quizOptions[index];
    const isCorrect = chosen.german === quizQuestion.german;
    quizTotal++;

    const iconHolder = btnEl.querySelector(".quiz-icon-holder");

    if (isCorrect) {
        quizScore++;
        btnEl.classList.add("selected-correct");
        if (iconHolder) {
            iconHolder.innerHTML = `<i data-lucide="check-circle-2" style="width:16px; height:16px;"></i>`;
        }
    } else {
        btnEl.classList.add("selected-wrong");
        if (iconHolder) {
            iconHolder.innerHTML = `<i data-lucide="x-circle" style="width:16px; height:16px;"></i>`;
        }
    }

    const scoreEl = document.getElementById("quiz-score-display");
    if (scoreEl) {
        scoreEl.textContent = `Score: ${quizScore} / ${quizTotal}`;
    }

    refreshIcons();

    // Disable all options during brief feedback delay
    document.querySelectorAll(".quiz-option-btn").forEach(b => b.disabled = true);

    setTimeout(() => {
        generateQuizQuestion();
    }, 1000);
}

// ── Tab 4: Chapters ───────────────────────────────────────────────────────────
function renderChaptersTab() {
    const container = document.getElementById("mobile-chapters-list");
    if (!container) return;

    if (appChapters.length === 0) {
        container.innerHTML = `<p style="text-align:center; color:var(--text-muted); padding:30px;">No chapters found.</p>`;
        return;
    }

    container.innerHTML = appChapters.map(ch => `
        <div class="mobile-chapter-card">
            <div class="chapter-card-top">
                <div class="chapter-title"><i data-lucide="folder" style="width:16px; height:16px; vertical-align:middle; margin-right:4px;"></i> ${escapeHTML(ch.name)}</div>
                <span class="chapter-badge">${ch.word_count || 0} words</span>
            </div>
            ${ch.description ? `<p style="font-size:0.82rem; color:var(--text-secondary);">${escapeHTML(ch.description)}</p>` : ''}
            <button class="chapter-practice-btn" onclick="practiceChapterDirectly('${escapeJS(ch.name)}')">
                <i data-lucide="play" style="width:14px; height:14px;"></i> Practice This Chapter
            </button>
        </div>
    `).join("");

    refreshIcons();
}

function practiceChapterDirectly(chapterName) {
    selectChapterFilter(chapterName);
    switchTab("flashcards");
}

// ── Tab 5: Quick Add Word ─────────────────────────────────────────────────────
function populateAddChapterDropdown() {
    const selectEl = document.getElementById("mobile-add-chapter");
    if (!selectEl) return;

    selectEl.innerHTML = "";
    appChapters.forEach(ch => {
        const opt = document.createElement("option");
        opt.value = ch.name;
        opt.textContent = ch.name;
        selectEl.appendChild(opt);
    });
}

async function handleMobileAddSubmit(event) {
    event.preventDefault();
    const germanInput = document.getElementById("mobile-add-german");
    const englishInput = document.getElementById("mobile-add-english");
    const chapterSelect = document.getElementById("mobile-add-chapter");
    const subheadingInput = document.getElementById("mobile-add-subheading");
    const submitBtn = document.getElementById("mobile-add-submit-btn");

    if (!germanInput || !englishInput) return;

    const german = germanInput.value.trim();
    const english = englishInput.value.trim();
    const chapter_name = chapterSelect ? chapterSelect.value : "General";
    const subheading = subheadingInput ? subheadingInput.value.trim() : "";

    if (!german || !english) {
        showToast("Please enter both German and English text.");
        return;
    }

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = `<i data-lucide="loader-2"></i> Adding...`;
        refreshIcons();
    }

    try {
        const res = await fetch("/api/words", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ german, english, chapter_name, subheading })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Failed to add word");

        showToast(`Saved "${german}"!`);
        germanInput.value = "";
        englishInput.value = "";
        if (subheadingInput) subheadingInput.value = "";

        await loadAppData();
        switchTab("vocab");
    } catch (err) {
        showToast(err.message);
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = `<i data-lucide="plus-circle"></i> Save Vocabulary Word`;
            refreshIcons();
        }
    }
}

// ── Toast Notifications ───────────────────────────────────────────────────────
let toastTimer = null;
function showToast(msg) {
    let toast = document.getElementById("mobile-toast");
    if (!toast) {
        toast = document.createElement("div");
        toast.id = "mobile-toast";
        toast.className = "mobile-toast";
        document.body.appendChild(toast);
    }

    toast.textContent = msg;
    toast.classList.add("show");

    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        toast.classList.remove("show");
    }, 2400);
}
