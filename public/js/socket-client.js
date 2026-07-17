const socket = io();

let gameState = {};

// When server sends state update
socket.on('state:update', (state) => {
    gameState = state;
    window.gameState = state;
    if (typeof window.onStateUpdate === 'function') {
        window.onStateUpdate(state);
    }
});

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
