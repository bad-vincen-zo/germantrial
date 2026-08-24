/**
 * Wortschatz Mobile App Script
 * Figma Task Management & Vocabulary Studio
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

// Stats Tracking
let sessionTotalCards = 0;
let sessionMasteredCards = 0;

// Safe Icon Refresh
function refreshIcons() {
    if (typeof window !== "undefined" && window.lucide && typeof window.lucide.createIcons === "function") {
        window.lucide.createIcons();
    }
}

// ── Initialize App ────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
    initTheme();
    renderCalendarStrip();
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
        themeBtn.innerHTML = `<i data-lucide="${theme === 'light' ? 'moon' : 'sun'}" style="width:18px; height:18px;"></i>`;
    }
    refreshIcons();
}

// ── Calendar Strip Renderer (Figma Screen 3) ──────────────────────────────────
function renderCalendarStrip() {
    const container = document.getElementById("calendar-strip");
    if (!container) return;

    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    
    const today = new Date();
    container.innerHTML = "";

    // Generate 5 days around today (-2 to +2)
    for (let i = -2; i <= 2; i++) {
        const d = new Date();
        d.setDate(today.getDate() + i);

        const isToday = i === 0;
        const pill = document.createElement("div");
        pill.className = `calendar-day-pill ${isToday ? "active" : ""}`;
        pill.onclick = () => {
            document.querySelectorAll(".calendar-day-pill").forEach(el => el.classList.remove("active"));
            pill.classList.add("active");
            buildDeck();
        };

        pill.innerHTML = `
            <span class="cal-month">${months[d.getMonth()]}</span>
            <span class="cal-num">${d.getDate()}</span>
            <span class="cal-weekday">${days[d.getDay()]}</span>
        `;
        container.appendChild(pill);
    }
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
            populateAddChapterDropdown();
        }

        renderHomeDashboard();
        buildDeck();
        renderVocabList();
        generateQuizQuestion();
        refreshIcons();
    } catch (e) {
        console.error("Error loading mobile data:", e);
        showToast("Error loading vocabulary data");
    }
}

// ── Home Dashboard Renderer (Figma Screen 2) ──────────────────────────────────
function renderHomeDashboard() {
    // 1. Calculate Mastery / Goal Percentage
    const total = allWords.length || 1;
    const progressRate = sessionTotalCards > 0 
        ? Math.min(100, Math.round((sessionMasteredCards / sessionTotalCards) * 100))
        : (allWords.length > 0 ? 85 : 0);

    const radialBar = document.getElementById("home-radial-bar");
    const radialText = document.getElementById("home-radial-percent");
    if (radialBar && radialText) {
        radialText.innerText = `${progressRate}%`;
        const circumference = 201; // 2 * PI * 32
        const offset = circumference - (circumference * progressRate) / 100;
        radialBar.style.strokeDashoffset = offset;
    }

    // 2. Populate In Progress Decks (Horizontal Scroll)
    const inprogressScroll = document.getElementById("home-inprogress-scroll");
    const inprogressCount = document.getElementById("home-inprogress-count");
    if (inprogressScroll) {
        const activeDecks = [
            { title: "Daily Flashcard Drill", tag: "Daily Study", color: "pink", progress: 75, count: allWords.length },
            { title: "Essential A1 Basics", tag: "A1 Basics", color: "cyan", progress: 60, count: Math.min(15, allWords.length) },
            { title: "Vocabulary Retention", tag: "Review Deck", color: "amber", progress: 40, count: Math.min(25, allWords.length) }
        ];

        if (inprogressCount) inprogressCount.innerText = activeDecks.length;

        inprogressScroll.innerHTML = "";
        activeDecks.forEach(deck => {
            const card = document.createElement("div");
            card.className = "inprogress-card";
            card.onclick = () => switchTab('cards');
            card.innerHTML = `
                <div class="inprogress-top">
                    <span class="inprogress-cat-badge ${deck.color}">${deck.tag}</span>
                    <i data-lucide="play-circle" style="width:18px; height:18px; color:var(--accent-purple);"></i>
                </div>
                <div class="inprogress-title">${escapeHTML(deck.title)}</div>
                <div class="inprogress-bottom">
                    <div class="inprogress-meta">
                        <span>${deck.count} Words</span>
                        <span>${deck.progress}%</span>
                    </div>
                    <div class="inprogress-bar-track">
                        <div class="inprogress-bar-fill" style="width: ${deck.progress}%;"></div>
                    </div>
                </div>
            `;
            inprogressScroll.appendChild(card);
        });
    }

    // 3. Populate Task Groups / Chapters List
    const taskGroupsList = document.getElementById("home-task-groups-list");
    const groupsCount = document.getElementById("home-groups-count");
    if (taskGroupsList) {
        const groups = appChapters.length > 0 ? appChapters : [
            { name: "General Vocabulary", word_count: allWords.length || 10 },
            { name: "A1 Basics", word_count: 14 },
            { name: "Daily Conversation", word_count: 22 }
        ];

        if (groupsCount) groupsCount.innerText = groups.length;

        taskGroupsList.innerHTML = "";
        const iconClasses = ["purple", "coral", "emerald", "amber"];

        groups.forEach((g, idx) => {
            const colorClass = iconClasses[idx % iconClasses.length];
            const pct = Math.min(95, 45 + (idx * 15) % 50);
            const circumference = 94; // 2 * PI * 15
            const offset = circumference - (circumference * pct) / 100;

            const item = document.createElement("div");
            item.className = "task-group-item";
            item.onclick = () => {
                activeChapterFilter = g.name;
                buildDeck();
                switchTab('cards');
            };

            item.innerHTML = `
                <div class="group-left">
                    <div class="group-icon-box ${colorClass}">
                        <i data-lucide="folder-kanban" style="width:20px; height:20px;"></i>
                    </div>
                    <div class="group-info">
                        <div class="group-title">${escapeHTML(g.name)}</div>
                        <div class="group-count">${g.word_count || 0} Tasks &amp; Words</div>
                    </div>
                </div>
                <div class="group-ring-wrap">
                    <svg class="group-ring-svg" viewBox="0 0 38 38">
                        <circle class="group-ring-bg" cx="19" cy="19" r="15"></circle>
                        <circle class="group-ring-bar" cx="19" cy="19" r="15" stroke-dasharray="94" stroke-dashoffset="${offset}"></circle>
                    </svg>
                    <span class="group-ring-text">${pct}%</span>
                </div>
            `;
            taskGroupsList.appendChild(item);
        });
    }

    refreshIcons();
}

// ── Navigation Tabs ───────────────────────────────────────────────────────────
function switchTab(tabId) {
    const tabs = ["home", "cards", "vocab", "quiz", "add"];
    
    tabs.forEach(id => {
        const view = document.getElementById(`view-${id}`);
        const btn = document.getElementById(`tab-${id}`);
        if (view) view.classList.remove("active");
        if (btn) btn.classList.remove("active");
    });

    const activeView = document.getElementById(`view-${tabId}`);
    const activeBtn = document.getElementById(`tab-${tabId}`);
    if (activeView) activeView.classList.add("active");
    if (activeBtn) activeBtn.classList.add("active");

    if (tabId === "home") {
        renderHomeDashboard();
    } else if (tabId === "cards") {
        buildDeck();
    } else if (tabId === "vocab") {
        renderVocabList();
    } else if (tabId === "quiz") {
        generateQuizQuestion();
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
    refreshIcons();
}

// ── Chapter Pills Filter Bar ──────────────────────────────────────────────────
function renderChapterPills() {
    const container = document.getElementById("chapter-pills-container");
    if (!container) return;

    container.innerHTML = "";

    const allPill = document.createElement("button");
    allPill.className = `filter-pill ${activeChapterFilter === "All" ? "active" : ""}`;
    allPill.innerText = "All Decks";
    allPill.onclick = () => {
        activeChapterFilter = "All";
        renderChapterPills();
        buildDeck();
    };
    container.appendChild(allPill);

    appChapters.forEach(ch => {
        const pill = document.createElement("button");
        pill.className = `filter-pill ${activeChapterFilter === ch.name ? "active" : ""}`;
        pill.innerText = ch.name;
        pill.onclick = () => {
            activeChapterFilter = ch.name;
            renderChapterPills();
            buildDeck();
        };
        container.appendChild(pill);
    });
}

// ── Flashcards Engine ─────────────────────────────────────────────────────────
function buildDeck() {
    let source = allWords;
    if (activeChapterFilter !== "All") {
        source = allWords.filter(w => (w.chapter_name || "General").toLowerCase() === activeChapterFilter.toLowerCase());
    }

    currentDeck = [...source];
    // Shuffle
    for (let i = currentDeck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [currentDeck[i], currentDeck[j]] = [currentDeck[j], currentDeck[i]];
    }

    currentCardIndex = 0;
    isCardFlipped = false;
    renderCurrentCard();
}

function renderCurrentCard() {
    const scene = document.getElementById("flashcard-scene");
    const inner = scene ? scene.querySelector(".flip-card-inner") : null;
    if (inner) inner.classList.remove("is-flipped");
    isCardFlipped = false;

    const counter = document.getElementById("card-counter-text");
    const fill = document.getElementById("card-progress-fill");
    
    if (currentDeck.length === 0) {
        if (counter) counter.innerText = "0 / 0";
        if (fill) fill.style.width = "0%";
        document.getElementById("card-front-word").innerText = "No Cards";
        document.getElementById("card-front-sub").innerText = "Add words to start studying";
        document.getElementById("card-back-word").innerText = "Empty Deck";
        document.getElementById("card-back-sub").innerText = "";
        return;
    }

    const currentWord = currentDeck[currentCardIndex];
    const total = currentDeck.length;
    const progress = Math.round(((currentCardIndex + 1) / total) * 100);

    if (counter) counter.innerText = `${currentCardIndex + 1} / ${total}`;
    if (fill) fill.style.width = `${progress}%`;

    // Front (German)
    const frontWord = document.getElementById("card-front-word");
    const frontSub = document.getElementById("card-front-sub");
    const chapterTag = document.getElementById("card-chapter-tag");

    frontWord.innerHTML = formatGermanWordHTML(currentWord.german);
    frontSub.innerText = currentWord.subheading ? `• ${currentWord.subheading}` : "";
    if (chapterTag) chapterTag.innerText = currentWord.chapter_name || "General";

    // Back (English)
    const backWord = document.getElementById("card-back-word");
    const backSub = document.getElementById("card-back-sub");
    backWord.innerText = currentWord.english;
    backSub.innerText = currentWord.german;

    refreshIcons();
}

function flipCard() {
    const scene = document.getElementById("flashcard-scene");
    const inner = scene ? scene.querySelector(".flip-card-inner") : null;
    if (inner) {
        isCardFlipped = !isCardFlipped;
        inner.classList.toggle("is-flipped", isCardFlipped);
    }
}

function nextCard(mastered = true) {
    if (currentDeck.length === 0) return;

    sessionTotalCards++;
    if (mastered) sessionMasteredCards++;

    currentCardIndex = (currentCardIndex + 1) % currentDeck.length;
    renderCurrentCard();
}

function speakCurrentCard(e) {
    if (e) e.stopPropagation();
    if (currentDeck.length === 0) return;
    const word = currentDeck[currentCardIndex];
    if (word && word.german) {
        speakGerman(word.german);
    }
}

// ── Vocabulary Directory ──────────────────────────────────────────────────────
function renderVocabList() {
    const list = document.getElementById("mobile-word-list");
    const countBadge = document.getElementById("vocab-count-badge");
    if (!list) return;

    list.innerHTML = "";
    if (countBadge) countBadge.innerText = `${filteredWords.length} words`;

    if (filteredWords.length === 0) {
        list.innerHTML = `<div style="text-align:center; padding:40px 20px; color:var(--text-muted);">No vocabulary words found.</div>`;
        return;
    }

    filteredWords.forEach(w => {
        const item = document.createElement("div");
        item.className = "mobile-word-item";
        const tag = w.chapter_name ? `<span class="mobile-word-tag">${escapeHTML(w.chapter_name)}</span>` : "";

        item.innerHTML = `
            <div class="mobile-word-info">
                <div class="mobile-word-german">
                    ${formatGermanWordHTML(w.german)}
                    ${tag}
                </div>
                <div class="mobile-word-english">${escapeHTML(w.english)}</div>
            </div>
            <button type="button" class="card-speaker-btn" onclick="speakGerman('${escapeJS(w.german)}')" title="Listen">
                <i data-lucide="volume-2" style="width:16px; height:16px;"></i>
            </button>
        `;
        list.appendChild(item);
    });

    refreshIcons();
}

function handleVocabSearch() {
    const query = document.getElementById("vocab-search-input").value.toLowerCase().trim();
    if (!query) {
        filteredWords = [...allWords];
    } else {
        filteredWords = allWords.filter(w => 
            w.german.toLowerCase().includes(query) ||
            w.english.toLowerCase().includes(query) ||
            (w.chapter_name && w.chapter_name.toLowerCase().includes(query)) ||
            (w.subheading && w.subheading.toLowerCase().includes(query))
        );
    }
    renderVocabList();
}

// ── Speed Quiz Mode ───────────────────────────────────────────────────────────
function generateQuizQuestion() {
    const prompt = document.getElementById("quiz-german-prompt");
    const optionsGrid = document.getElementById("quiz-options-grid");
    const scoreDisplay = document.getElementById("quiz-score-display");
    if (!prompt || !optionsGrid) return;

    if (scoreDisplay) scoreDisplay.innerText = `Score: ${quizScore} / ${quizTotal}`;

    if (allWords.length < 2) {
        prompt.innerText = "Need at least 2 words";
        optionsGrid.innerHTML = `<div style="text-align:center; color:var(--text-muted); padding:20px;">Please add more vocabulary to practice quiz.</div>`;
        return;
    }

    // Pick random question word
    quizQuestion = allWords[Math.floor(Math.random() * allWords.length)];
    prompt.innerHTML = formatGermanWordHTML(quizQuestion.german);

    // Pick 3 distractors
    const distractors = allWords.filter(w => w.german !== quizQuestion.german);
    const shuffledDistractors = distractors.sort(() => 0.5 - Math.random()).slice(0, 3);
    
    quizOptions = [quizQuestion, ...shuffledDistractors].sort(() => 0.5 - Math.random());

    optionsGrid.innerHTML = "";
    quizOptions.forEach(opt => {
        const btn = document.createElement("button");
        btn.className = "quiz-option-btn";
        btn.innerText = opt.english;
        btn.onclick = () => handleQuizAnswer(btn, opt.english === quizQuestion.english);
        optionsGrid.appendChild(btn);
    });
}

function handleQuizAnswer(btn, isCorrect) {
    quizTotal++;
    if (isCorrect) {
        quizScore++;
        btn.classList.add("correct");
        showToast("Correct! 🎉");
    } else {
        btn.classList.add("wrong");
        showToast("Not quite! Keep going 💪");
    }

    const scoreDisplay = document.getElementById("quiz-score-display");
    if (scoreDisplay) scoreDisplay.innerText = `Score: ${quizScore} / ${quizTotal}`;

    setTimeout(() => {
        generateQuizQuestion();
    }, 900);
}

// ── Quick Add Word ────────────────────────────────────────────────────────────
function populateAddChapterDropdown() {
    const sel = document.getElementById("mobile-add-chapter");
    if (!sel) return;

    sel.innerHTML = `<option value="General">General Vocabulary</option>`;
    appChapters.forEach(c => {
        if (c.name.toLowerCase() !== "general") {
            const opt = document.createElement("option");
            opt.value = c.name;
            opt.innerText = c.name;
            sel.appendChild(opt);
        }
    });
}

async function handleMobileAddSubmit(e) {
    e.preventDefault();
    const german = document.getElementById("mobile-add-german").value.trim();
    const english = document.getElementById("mobile-add-english").value.trim();
    const chapter = document.getElementById("mobile-add-chapter").value || "General";
    const subheading = document.getElementById("mobile-add-subheading").value.trim();

    if (!german || !english) return;

    try {
        const res = await fetch("/api/words", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ german, english, chapter_name: chapter, subheading })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Failed to save word");

        document.getElementById("mobile-add-german").value = "";
        document.getElementById("mobile-add-english").value = "";
        document.getElementById("mobile-add-subheading").value = "";

        showToast(`Saved "${german}"! ✨`);
        await loadAppData();
        switchTab("vocab");
    } catch (err) {
        showToast(err.message || "Error adding word");
    }
}

// ── German Pronunciation Audio (TTS) ──────────────────────────────────────────
function speakGerman(text) {
    if (!text || typeof window === "undefined" || !window.speechSynthesis) return;
    try {
        window.speechSynthesis.cancel();
        let clean = text.replace(/^(der|die|das)\s+/i, "").trim();
        const utterance = new SpeechSynthesisUtterance(clean || text);
        utterance.lang = "de-DE";
        utterance.rate = 0.9;
        window.speechSynthesis.speak(utterance);
    } catch (e) {
        console.warn("Speech synthesis error:", e);
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatGermanWordHTML(german) {
    if (!german) return "";
    const lower = german.trim().toLowerCase();
    let genderClass = "";
    if (lower.startsWith("der ") || lower.includes(" der ")) genderClass = "gender-der";
    else if (lower.startsWith("die ") || lower.includes(" die ")) genderClass = "gender-die";
    else if (lower.startsWith("das ") || lower.includes(" das ")) genderClass = "gender-das";

    return `<span class="${genderClass}">${escapeHTML(german)}</span>`;
}

function escapeHTML(str) {
    if (!str) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function escapeJS(str) {
    if (!str) return "";
    return String(str).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function showToast(msg) {
    const toast = document.getElementById("mobile-toast");
    if (!toast) return;
    toast.innerText = msg;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 2200);
}
