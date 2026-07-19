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
    const overlay = document.querySelector('.overlay');
    if (!overlay) return;
    
    // Base design resolution
    const baseWidth = 1920;
    const baseHeight = 1080;
    
    // Calculate uniform scale to fit exactly in the window
    const scale = Math.min(window.innerWidth / baseWidth, window.innerHeight / baseHeight);
    
    // Apply transform (centering is handled by body flex layout in theme.css)
    overlay.style.transform = `scale(${scale})`;
    overlay.style.transformOrigin = 'center center';
}

window.addEventListener('resize', applyScaling);
document.addEventListener('DOMContentLoaded', applyScaling);
applyScaling(); // Run immediately in case script loads late
