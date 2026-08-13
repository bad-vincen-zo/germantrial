// State Management
let allWords = [];
let filteredWords = [];
let quizQueue = [];
let quizIndex = 0;
let sessionTotalReviews = 0;
let sessionCorrectReviews = 0;
let isCardFlipped = false;
let directAssessmentMode = false;

// Initialize Page
document.addEventListener("DOMContentLoaded", () => {
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

// Fetch Vocabulary from Server
async function fetchWords() {
    try {
        const response = await fetch("/api/words");
        if (!response.ok) throw new Error("Failed to load vocabulary");
        
        allWords = await response.json();
        filteredWords = [...allWords];
        
        renderVocabTable();
        updateStats();
        
        // Reset quiz when list changes
        if (document.getElementById("content-practice").classList.contains("hidden") === false) {
            resetQuiz();
        }
    } catch (error) {
        console.error("Error fetching words:", error);
        showToast("Error loading vocabulary. Please try refreshing.", "error");
    }
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
        tr.innerHTML = `
            <td>${escapeHTML(word.german)}</td>
            <td>${escapeHTML(word.english)}</td>
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
    
    const german = germanInput.value.strip ? germanInput.value.strip() : germanInput.value.trim();
    const english = englishInput.value.strip ? englishInput.value.strip() : englishInput.value.trim();

    if (!german || !english) return;

    try {
        const response = await fetch("/api/words", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ german, english })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.detail || "Failed to add word");
        }

        germanInput.value = "";
        englishInput.value = "";
        germanInput.focus();
        
        showToast(`Successfully added "${german}"!`, "success");
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
    const query = document.getElementById("search-input").value.toLowerCase().trim();
    if (!query) {
        filteredWords = [...allWords];
    } else {
        filteredWords = allWords.filter(word => 
            word.german.toLowerCase().includes(query) || 
            word.english.toLowerCase().includes(query)
        );
    }
    renderVocabTable();
}

// Tab Navigation logic
function switchTab(tabId) {
    // Buttons
    document.getElementById("tab-manage").classList.remove("active");
    document.getElementById("tab-practice").classList.remove("active");
    document.getElementById(`tab-${tabId}`).classList.add("active");

    // Contents
    document.getElementById("content-manage").classList.add("hidden");
    document.getElementById("content-practice").classList.add("hidden");
    document.getElementById(`content-${tabId}`).classList.remove("hidden");

    if (tabId === "practice") {
        resetQuiz();
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
        frontWord.innerText = currentWord.german;
        backWord.innerText = currentWord.english;
        // Set badges
        document.querySelector(".card-badge").innerText = "GERMAN";
        document.querySelector(".card-badge-back").innerText = "ENGLISH";
    } else {
        frontWord.innerText = currentWord.english;
        backWord.innerText = currentWord.german;
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

    // Slide current card out to the left
    wrapper.classList.add("slide-out");

    setTimeout(() => {
        wrapper.classList.remove("slide-out");

        quizIndex++;
        if (quizIndex >= quizQueue.length) {
            showCompletion();
        } else {
            showCard();
            // Slide next card in from the right
            wrapper.classList.add("slide-in");
            setTimeout(() => wrapper.classList.remove("slide-in"), 350);
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
    sessionTotalReviews++;
    if (isCorrect) sessionCorrectReviews++;
    
    updateStats();

    // In direct assessment mode, always slide to the next card (always show German/front face)
    if (directAssessmentMode) {
        document.getElementById("assessment-buttons").classList.add("disabled");

        // If card is currently showing the back (English), snap it back to front instantly
        // so the slide-out always shows the German side, never the English side
        if (isCardFlipped) {
            const cardElement = document.getElementById("flashcard");
            // Temporarily disable the flip transition so the snap is instant
            cardElement.style.transition = "none";
            cardElement.classList.remove("flipped");
            isCardFlipped = false;
            // Force a reflow so the browser applies the instant change before sliding
            void cardElement.offsetWidth;
            // Restore the transition for future flips
            cardElement.style.transition = "";
        }

        slideToNextCard();
        return;
    }

    if (isCorrect) {
        // Clear card texts immediately to show blank card
        document.getElementById("card-front-word").innerText = "";
        document.getElementById("card-back-word").innerText = "";
        
        // Temporarily disable buttons
        document.getElementById("assessment-buttons").classList.add("disabled");

        const cardElement = document.getElementById("flashcard");
        
        if (isCardFlipped) {
            // Flipped: show blank front face rotating in
            isCardFlipped = false;
            cardElement.classList.remove("flipped");
            
            setTimeout(() => {
                quizIndex++;
                if (quizIndex >= quizQueue.length) {
                    showCompletion();
                } else {
                    showCard();
                }
            }, 300); // Wait 300ms (halfway through the 600ms flip animation) before showing next card
        } else {
            // Flip to back (blank) first
            cardElement.classList.add("flipped");
            
            setTimeout(() => {
                quizIndex++;
                if (quizIndex >= quizQueue.length) {
                    showCompletion();
                } else {
                    showCard();
                }
            }, 300); // Wait 300ms before loading next card (which flips back to front)
        }
    } else {
        // For "Forgot it" (incorrect review)
        document.getElementById("assessment-buttons").classList.add("disabled");
        const cardElement = document.getElementById("flashcard");
        if (isCardFlipped) {
            isCardFlipped = false;
            cardElement.classList.remove("flipped");
            setTimeout(() => {
                quizIndex++;
                if (quizIndex >= quizQueue.length) {
                    showCompletion();
                } else {
                    showCard();
                }
            }, 300);
        } else {
            quizIndex++;
            if (quizIndex >= quizQueue.length) {
                showCompletion();
            } else {
                showCard();
            }
        }
    }
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
