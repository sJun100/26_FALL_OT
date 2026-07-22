function sortCards(cards) {
    return cards.sort((a, b) => {
        if (a.type !== b.type) return a.type.localeCompare(b.type);
        return a.card_id.localeCompare(b.card_id, undefined, { numeric: true, sensitivity: 'base' });
    });
}

const socket = io();

let gameState = {};
let lastRound = null;

// When server sends state update
socket.on('state:update', (state) => {
    gameState = state;
    window.gameState = state;
    if (typeof window.onStateUpdate === 'function') {
        window.onStateUpdate(state);
    }

    // Round Transition Animation
    if (!window.isAdmin && lastRound !== null && state.current_round && state.current_round != lastRound) {
        showRoundTransition(state.current_round);
    }
    lastRound = state.current_round;
});

function showRoundTransition(round) {
    let overlay = document.getElementById('roundTransitionOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'roundTransitionOverlay';
        overlay.className = 'round-transition-overlay';
        overlay.innerHTML = `<h1 class="round-transition-text" id="roundTransitionText">ROUND ${round}</h1>`;
        document.body.appendChild(overlay);
    } else {
        document.getElementById('roundTransitionText').innerText = `ROUND ${round}`;
    }
    
    overlay.classList.add('active');
    const text = document.getElementById('roundTransitionText');
    text.classList.remove('animate');
    void text.offsetWidth; // trigger reflow
    text.classList.add('animate');
    
    setTimeout(() => {
        overlay.classList.remove('active');
    }, 3500);
}

// Request initial state on connect
socket.on('connect', () => {
    socket.emit('getState');
    // 연결 상태 표시 업데이트
    const dot = document.getElementById('connectionDot');
    if (dot) {
        dot.classList.remove('disconnected');
    }
});

// 연결 해제 시 표시 업데이트
socket.on('disconnect', () => {
    const dot = document.getElementById('connectionDot');
    if (dot) {
        dot.classList.add('disconnected');
    }
});

// Phase sync (e.g. forced transition)
socket.on('sync:phase', (phase) => {
    if (typeof window.onPhaseSync === 'function') {
        window.onPhaseSync(phase);
    }
});

socket.on('sync:card_exchanged', (data) => {
    // Optionally trigger alert for theft success
    if (typeof window.onCardExchanged === 'function') {
        window.onCardExchanged(data);
    }
});

// Responsive Scaling (Option 3)
function applyScaling() {
    // Disabled fixed scaling to allow native fullscreen without margins
}

window.addEventListener('resize', applyScaling);
document.addEventListener('DOMContentLoaded', applyScaling);
applyScaling(); // Run immediately in case script loads late
