const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Connect to SQLite DB
const dbPath = path.join(__dirname, 'database.db');
const db = new sqlite3.Database(dbPath);

// ──────────────────────────────────────────────
// Load JSON data
// ──────────────────────────────────────────────
const answersData = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'answers.json'), 'utf8'));
const hintsData = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'hints.json'), 'utf8'));

// ──────────────────────────────────────────────
// Parse CSV resources at startup
// ──────────────────────────────────────────────
function parseCSV(filePath) {
    const raw = fs.readFileSync(filePath, 'utf8').replace(/\r/g, '');
    const lines = raw.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim());
    return lines.slice(1).map(line => {
        const values = line.split(',').map(v => v.trim());
        const obj = {};
        headers.forEach((h, i) => obj[h] = values[i]);
        return obj;
    });
}

// Bone card map: { "1-A": { skull: 2, torso: 1, leg: 0, tail: 0 }, ... }
const boneCardMap = {};
const boneCardRows = parseCSV(path.join(__dirname, 'data', 'treasure_bone_cards.csv'));
boneCardRows.forEach(row => {
    boneCardMap[row['card name']] = {
        skull: parseInt(row['skull bone']) || 0,
        torso: parseInt(row['torso bone']) || 0,
        leg:   parseInt(row['leg bone']) || 0,
        tail:  parseInt(row['tail bone']) || 0
    };
});

// Sack rewards map: { "1": { "A. Torso-Focused Sack": { skull:3, torso:7, leg:4, tail:1 }, ... }, "2": { ... } }
const sackRewardsMap = {};
const sackRows = parseCSV(path.join(__dirname, 'data', 'excavator_rewards.csv'));
sackRows.forEach(row => {
    const round = row['round'];
    if (!sackRewardsMap[round]) sackRewardsMap[round] = {};
    sackRewardsMap[round][row['sack']] = {
        skull: parseInt(row['skull bone']) || 0,
        torso: parseInt(row['torso bone']) || 0,
        leg:   parseInt(row['leg bone']) || 0,
        tail:  parseInt(row['tail bone']) || 0
    };
});

console.log(`Loaded ${Object.keys(boneCardMap).length} bone cards, ${Object.keys(sackRewardsMap).length} rounds of sack rewards.`);

// ──────────────────────────────────────────────
// Initialize Database Schema
// ──────────────────────────────────────────────
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS classes (
        class_id INTEGER PRIMARY KEY,
        skull_count INTEGER DEFAULT 0,
        torso_count INTEGER DEFAULT 0,
        leg_count INTEGER DEFAULT 0,
        tail_count INTEGER DEFAULT 0
    )`);

    const stmt = db.prepare(`INSERT OR IGNORE INTO classes (class_id) VALUES (?)`);
    [27, 28, 29, 30, 31].forEach(id => stmt.run(id));
    stmt.finalize();

    db.run(`CREATE TABLE IF NOT EXISTS game_state (
        key TEXT PRIMARY KEY,
        value TEXT
    )`);

    db.run(`INSERT OR IGNORE INTO game_state (key, value) VALUES ('current_round', '1')`);
    db.run(`INSERT OR IGNORE INTO game_state (key, value) VALUES ('current_phase', '1')`);

    db.run(`CREATE TABLE IF NOT EXISTS cards_registry (
        card_id TEXT PRIMARY KEY,
        round INTEGER,
        type TEXT,
        owner_class_id INTEGER,
        status TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS restoration_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        class_id INTEGER,
        round INTEGER,
        skull_sub INTEGER,
        torso_sub INTEGER,
        leg_sub INTEGER,
        tail_sub INTEGER,
        error_rate REAL,
        is_locked INTEGER DEFAULT 0
    )`);

    // Schema migration for older databases
    db.run(`ALTER TABLE restoration_history ADD COLUMN is_locked INTEGER DEFAULT 0`, (err) => {
        // Ignore error if column already exists
    });

    db.run(`CREATE TABLE IF NOT EXISTS game_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        log_text TEXT
    )`);
});

const phaseNames = {1:'Plan', 2:'Mission', 3:'Return', 4:'Restoration', 5:'Submission'};

function logEvent(role, message) {
    db.all(`SELECT key, value FROM game_state`, [], (err, rows) => {
        let round = '?', phase = '?';
        if (rows) {
            rows.forEach(r => {
                if(r.key === 'current_round') round = r.value;
                if(r.key === 'current_phase') phase = r.value;
            });
        }
        const now = new Date();
        const kstOffset = 9 * 60 * 60 * 1000;
        const kstTime = new Date(now.getTime() + kstOffset);
        const timestamp = kstTime.toISOString().replace('T', ' ').substring(0, 19);
        const pName = phaseNames[phase] || 'System';
        const logLine = `[${timestamp}] [Round ${round}] [${pName}] [${role}] ${message}`;
        db.run(`INSERT INTO game_logs (log_text) VALUES (?)`, [logLine]);
        console.log(logLine);
    });
}

// ──────────────────────────────────────────────
// Helper: get full game state
// FIX for C-08: include RELEASED hint cards from ALL rounds
// ──────────────────────────────────────────────
function getFullState(callback) {
    let state = {};
    db.all(`SELECT * FROM game_state`, [], (err, stateRows) => {
        if (err || !stateRows) stateRows = [];
        stateRows.forEach(row => state[row.key] = row.value);
        db.all(`SELECT * FROM classes`, [], (err, classRows) => {
            state.classes = classRows || [];
            const currentRound = parseInt(state.current_round || 1);
            // Current round: ALL cards. Previous rounds: only RELEASED cards (so hints persist).
            db.all(
                `SELECT * FROM cards_registry WHERE round = ? OR (status = 'RELEASED' AND round < ?)`,
                [currentRound, currentRound],
                (err, cardRows) => {
                    state.cards = cardRows || [];
                    // Also fetch latest restoration submissions per class for current round
                    db.all(
                        `SELECT r.* FROM restoration_history r
                         INNER JOIN (
                             SELECT class_id, round, MAX(id) as max_id
                             FROM restoration_history
                             GROUP BY class_id, round
                         ) latest ON r.id = latest.max_id
                         ORDER BY r.round, r.error_rate ASC`,
                        [],
                        (err, restorationRows) => {
                            state.restorations = restorationRows || [];
                            // Include sack info for current round
                            state.sacks = sackRewardsMap[currentRound.toString()] || {};
                            state.excavatorDistribution = excavatorDistribution;
                            callback(state);
                        }
                    );
                }
            );
        });
    });
}

// ──────────────────────────────────────────────
// Socket.io event handlers
// ──────────────────────────────────────────────

// ── Timer system (C-05) ──
let timerInterval = null;
let timerRemaining = 0;
let timerRunning = false;
let excavatorDistribution = {};

io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    // ── Initial state ──
    socket.on('getState', () => {
        getFullState(state => socket.emit('state:update', state));
    });

    // ── Hint serving (FIX for C-01) ──
    socket.on('getHints', (classId) => {
        const classHints = hintsData[classId.toString()] || {};
        socket.emit('hints:data', classHints);
    });

    // ══════════════════════════════════════════
    // Admin (Client X) Events
    // ══════════════════════════════════════════

    socket.on('admin:setPhase', (phase) => {
        logEvent('Admin', `Changed Phase to ${phase}`);
        if (phase == 1) excavatorDistribution = {};
        db.run(`UPDATE game_state SET value = ? WHERE key = 'current_phase'`, [phase.toString()], () => {
            if (phase == 4) {
                // FIX for C-03: use boneCardMap for accurate bone distribution
                getFullState(state => {
                    const currentRound = parseInt(state.current_round);
                    db.all(`SELECT * FROM cards_registry WHERE round = ? AND status != 'RELEASED'`, [currentRound], (err, cards) => {
                        if (!cards) cards = [];
                        const updates = [];
                        cards.forEach(card => {
                            if (card.type === 'BONE') {
                                const bones = boneCardMap[card.card_id];
                                if (bones) {
                                    updates.push({ classId: card.owner_class_id, bones });
                                } else {
                                    console.warn(`Unknown bone card: ${card.card_id}`);
                                }
                            }
                        });

                        db.serialize(() => {
                            updates.forEach(u => {
                                if (u.bones.skull > 0)
                                    db.run(`UPDATE classes SET skull_count = skull_count + ? WHERE class_id = ?`, [u.bones.skull, u.classId]);
                                if (u.bones.torso > 0)
                                    db.run(`UPDATE classes SET torso_count = torso_count + ? WHERE class_id = ?`, [u.bones.torso, u.classId]);
                                if (u.bones.leg > 0)
                                    db.run(`UPDATE classes SET leg_count = leg_count + ? WHERE class_id = ?`, [u.bones.leg, u.classId]);
                                if (u.bones.tail > 0)
                                    db.run(`UPDATE classes SET tail_count = tail_count + ? WHERE class_id = ?`, [u.bones.tail, u.classId]);
                            });

                            db.run(`UPDATE cards_registry SET status = 'RELEASED' WHERE round = ? AND status != 'RELEASED'`, [currentRound], () => {
                                io.emit('sync:phase', parseInt(phase));
                                getFullState(newState => io.emit('state:update', newState));
                            });
                        });
                    });
                });
            } else {
                io.emit('sync:phase', parseInt(phase));
                getFullState(newState => io.emit('state:update', newState));
            }
        });
    });

    socket.on('admin:setRound', (round) => {
        logEvent('Admin', `Changed Round to ${round}`);
        db.run(`UPDATE game_state SET value = ? WHERE key = 'current_round'`, [round.toString()], () => {
            // Also reset phase to 1 when changing round
            db.run(`UPDATE game_state SET value = '1' WHERE key = 'current_phase'`, () => {
                getFullState(state => io.emit('state:update', state));
            });
        });
    });

    // FIX for M-06: floor check prevents negative bone counts
    socket.on('admin:updateBones', (data) => {
        const { class_id, boneType, amount } = data;
        const p_amount = parseInt(amount) || 0;
        logEvent('Admin', `Manually updated Class ${class_id} ${boneType} bone amount to ${p_amount}`);
        const cols = { 'H': 'skull_count', 'B': 'torso_count', 'L': 'leg_count', 'T': 'tail_count' };
        const col = cols[boneType];
        if (col) {
            db.run(`UPDATE classes SET ${col} = MAX(0, ?) WHERE class_id = ?`, [p_amount, parseInt(class_id)], () => {
                getFullState(state => io.emit('state:update', state));
            });
        }
    });

    // ── Alert system (for H-02) ──
    socket.on('admin:sendAlert', (message) => {
        io.emit('admin:alertMessage', message);
    });

    socket.on('admin:closeAlert', () => {
        io.emit('admin:closeAlert');
    });

    // ── Timer system (C-05) ──
    socket.on('admin:startTimer', (minutes) => {
        logEvent('Admin', `Started timer for ${minutes} minutes`);
        timerRemaining = parseInt(minutes) * 60;
        timerRunning = true;
        if (timerInterval) clearInterval(timerInterval);
        timerInterval = setInterval(() => {
            if (timerRemaining > 0) {
                timerRemaining--;
                io.emit('timer:tick', { remaining: timerRemaining, running: true });
            } else {
                if (timerInterval) clearInterval(timerInterval);
                timerRunning = false;
                logEvent('System', `Timer ended`);
                io.emit('timer:tick', { remaining: 0, running: false });
            }
        }, 1000);
        io.emit('timer:tick', { remaining: timerRemaining, running: true });
    });

    socket.on('admin:stopTimer', () => {
        logEvent('Admin', `Stopped timer at ${Math.floor(timerRemaining / 60)}m ${timerRemaining % 60}s remaining`);
        timerRunning = false;
        if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
        io.emit('timer:tick', { remaining: timerRemaining, running: false });
    });

    socket.on('getTimer', () => {
        socket.emit('timer:tick', { remaining: timerRemaining, running: timerRunning });
    });

    // ── Result Reveal (C-07) ──
    socket.on('admin:revealResults', (data) => {
        logEvent('Admin', `Revealed rankings`);
        const { round, isFinal } = data;
        db.all(
            `SELECT class_id, error_rate FROM restoration_history WHERE round = ? AND is_locked = 1 ORDER BY error_rate DESC`,
            [round],
            (err, rows) => {
                if (rows && rows.length > 0) {
                    io.emit('reveal:show', { results: rows, isFinal: isFinal });
                }
            }
        );
    });

    socket.on('admin:hideResults', () => {
        io.emit('reveal:hide');
    });

    // ── Approval workflow -> Lock workflow (Task 14) ──
    socket.on('admin:lockRestoration', (data) => {
        const { class_id, round } = data;
        logEvent('Admin', `Locked Class ${class_id} fossil submission`);
        db.get(`SELECT MAX(id) as maxid FROM restoration_history WHERE class_id = ? AND round = ?`, [class_id, round], (err, row) => {
            if (err) console.error("Lock select err:", err);
            if(row && row.maxid) {
                db.run(`UPDATE restoration_history SET is_locked = 1 WHERE id = ?`, [row.maxid], (updateErr) => {
                    if (updateErr) console.error("Lock update err:", updateErr);
                    getFullState(state => io.emit('state:update', state));
                });
            }
        });
    });

    socket.on('admin:unlockRestoration', (data) => {
        const { class_id, round } = data;
        logEvent('Admin', `Unlocked Class ${class_id} fossil submission`);
        db.get(`SELECT MAX(id) as maxid FROM restoration_history WHERE class_id = ? AND round = ?`, [class_id, round], (err, row) => {
            if (err) console.error("Unlock select err:", err);
            if(row && row.maxid) {
                db.run(`UPDATE restoration_history SET is_locked = 0 WHERE id = ?`, [row.maxid], (updateErr) => {
                    if (updateErr) console.error("Unlock update err:", updateErr);
                    getFullState(state => io.emit('state:update', state));
                });
            }
        });
    });

    socket.on('admin:overrideRestoration', (data) => {
        const { class_id, round, H, B, L, T } = data;
        logEvent('Admin', `Overrode Class ${class_id} fossil submission (H:${H}, B:${B}, L:${L}, T:${T})`);
        const target = answersData[class_id.toString()];
        if (!target) return;
        const N = target.H + target.B + target.L + target.T;
        const E = Math.abs(H - target.H) + Math.abs(B - target.B) + Math.abs(L - target.L) + Math.abs(T - target.T);
        const error_rate = parseFloat(((E / N) * 100).toFixed(2));

        db.run(`DELETE FROM restoration_history WHERE class_id = ? AND round = ?`, [class_id, round], () => {
            db.run(
                `INSERT INTO restoration_history (class_id, round, skull_sub, torso_sub, leg_sub, tail_sub, error_rate, is_locked)
                 VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
                [class_id, round, H, B, L, T, error_rate],
                () => getFullState(state => io.emit('state:update', state))
            );
        });
    });

    // ══════════════════════════════════════════
    // Client C (Researcher) Events
    // ══════════════════════════════════════════

    socket.on('clientC:addCards', (data) => {
        const { card_ids, owner_class_id } = data;
        if (!Array.isArray(card_ids)) return;
        
        getFullState(state => {
            const currentRound = parseInt(state.current_round);
            const classHints = hintsData[owner_class_id.toString()] || {};
            let errors = [];
            let successes = 0;
            
            db.serialize(() => {
                const stmt = db.prepare(`INSERT INTO cards_registry (card_id, round, type, owner_class_id, status) VALUES (?, ?, ?, ?, 'PENDING')`);
                
                // Fetch all registered cards to check duplicates
                db.all(`SELECT card_id FROM cards_registry`, [], (err, registeredCards) => {
                    const registeredIds = new Set((registeredCards || []).map(c => c.card_id));
                    
                    for (let card_id of card_ids) {
                        card_id = card_id.trim();
                        if (!card_id) continue;
                        
                        let isBone = !!boneCardMap[card_id];
                        let isHint = !!classHints[card_id];
                        
                        // 1. Check existence
                        if (!isBone && !isHint) {
                            const msg = `${card_id}: Invalid card ID.`;
                            errors.push(msg);
                            logEvent('Researcher', `Class ${owner_class_id} attempted to register "${card_id}" (FAILED: ${msg})`);
                            continue;
                        }
                        
                        // 2. Check round match
                        const cardRound = parseInt(card_id.split('-')[0]);
                        if (cardRound !== currentRound) {
                            const msg = `${card_id}: Card not available for the current round.`;
                            errors.push(msg);
                            logEvent('Researcher', `Class ${owner_class_id} attempted to register "${card_id}" (FAILED: ${msg})`);
                            continue;
                        }
                        
                        // 3. Check duplicate
                        if (registeredIds.has(card_id)) {
                            const msg = `${card_id}: Card is already registered.`;
                            errors.push(msg);
                            logEvent('Researcher', `Class ${owner_class_id} attempted to register "${card_id}" (FAILED: ${msg})`);
                            continue;
                        }
                        
                        // Valid! Insert
                        const type = isBone ? 'BONE' : 'HINT';
                        logEvent('Researcher', `Class ${owner_class_id} registered ${type === 'BONE' ? 'Bone' : 'Hint'} Card "${card_id}" (SUCCESS)`);
                        stmt.run([card_id, currentRound, type, parseInt(owner_class_id)]);
                        registeredIds.add(card_id);
                        successes++;
                    }
                    stmt.finalize(() => {
                        getFullState(newState => io.emit('state:update', newState));
                        socket.emit('clientC:addCardsResult', { successes, errors });
                    });
                });
            });
        });
    });

    socket.on('clientC:deleteCard', (card_id) => {
        db.run(`DELETE FROM cards_registry WHERE card_id = ? AND status = 'PENDING'`, [card_id], () => {
            getFullState(state => io.emit('state:update', state));
        });
    });

    // ══════════════════════════════════════════
    // Client D (Smuggler) Events
    // ══════════════════════════════════════════

    socket.on('clientD:exchangeCards', (data) => {
        const { my_card_id, target_card_id, my_class_id, target_class_id } = data;
        logEvent('Smuggler', `Class ${my_class_id} (Card ${my_card_id}) exchanged with Class ${target_class_id} (Card ${target_card_id})`);
        db.serialize(() => {
            db.run(`UPDATE cards_registry SET owner_class_id = ?, status = 'LOCKED' WHERE card_id = ?`,
                [parseInt(target_class_id), my_card_id]);
            db.run(`UPDATE cards_registry SET owner_class_id = ?, status = 'LOCKED' WHERE card_id = ?`,
                [parseInt(my_class_id), target_card_id],
                () => {
                    io.emit('sync:card_exchanged', { class_id: my_class_id });
                    getFullState(state => io.emit('state:update', state));
                }
            );
        });
    });

    // ══════════════════════════════════════════
    // Client B (Excavator) Events
    // FIX for C-04: use parsed CSV data with round-awareness
    // ══════════════════════════════════════════

    socket.on('clientB:submitDraft', (data) => {
        const { draftResults, round } = data;
        if (!draftResults || typeof draftResults !== 'object' || Array.isArray(draftResults)) return;
        logEvent('Excavator', `Submitted bone distribution for Round ${round}`);
        const roundStr = (round || '1').toString();
        const roundSacks = sackRewardsMap[roundStr];

        if (!roundSacks) {
            console.error(`No sack rewards found for round ${roundStr}`);
            return;
        }
        
        excavatorDistribution = draftResults;

        db.serialize(() => {
            for (const [class_id, sackName] of Object.entries(draftResults)) {
                const bones = roundSacks[sackName];
                if (bones) {
                    if (bones.skull > 0)
                        db.run(`UPDATE classes SET skull_count = skull_count + ? WHERE class_id = ?`, [bones.skull, parseInt(class_id)]);
                    if (bones.torso > 0)
                        db.run(`UPDATE classes SET torso_count = torso_count + ? WHERE class_id = ?`, [bones.torso, parseInt(class_id)]);
                    if (bones.leg > 0)
                        db.run(`UPDATE classes SET leg_count = leg_count + ? WHERE class_id = ?`, [bones.leg, parseInt(class_id)]);
                    if (bones.tail > 0)
                        db.run(`UPDATE classes SET tail_count = tail_count + ? WHERE class_id = ?`, [bones.tail, parseInt(class_id)]);
                } else {
                    console.warn(`Unknown sack "${sackName}" for round ${roundStr}`);
                }
            }
            getFullState(state => io.emit('state:update', state));
        });
    });

    // ══════════════════════════════════════════
    // Client A (Dashboard) Events
    // FIX for H-04: upsert instead of blind insert
    // ══════════════════════════════════════════

    socket.on('clientA:submitRestoration', (data) => {
        const { class_id, round, H, B, L, T } = data;
        const p_H = parseInt(H) || 0;
        const p_B = parseInt(B) || 0;
        const p_L = parseInt(L) || 0;
        const p_T = parseInt(T) || 0;
        logEvent('Class', `Class ${class_id} submitted Fossil Restoration (H:${p_H}, B:${p_B}, L:${p_L}, T:${p_T})`);
        const target = answersData[class_id.toString()];
        if (!target) return;

        const N = target.H + target.B + target.L + target.T;
        const E = Math.abs(p_H - target.H) + Math.abs(p_B - target.B) + Math.abs(p_L - target.L) + Math.abs(p_T - target.T);
        const error_rate = parseFloat(((E / N) * 100).toFixed(2));

        // Check if an unapproved submission already exists for this class+round
        db.get(
            `SELECT id, is_locked FROM restoration_history WHERE class_id = ? AND round = ? ORDER BY id DESC LIMIT 1`,
            [parseInt(class_id), parseInt(round)],
            (err, existing) => {
                if (existing) {
                    if (existing.is_locked === 1) return; // Do not update if it is already locked
                    // Update existing unapproved submission
                    db.run(
                        `UPDATE restoration_history SET skull_sub=?, torso_sub=?, leg_sub=?, tail_sub=?, error_rate=?
                         WHERE id=?`,
                        [p_H, p_B, p_L, p_T, error_rate, existing.id],
                        () => getFullState(state => io.emit('state:update', state))
                    );
                } else {
                    // Insert new
                    db.run(
                        `INSERT INTO restoration_history (class_id, round, skull_sub, torso_sub, leg_sub, tail_sub, error_rate)
                         VALUES (?, ?, ?, ?, ?, ?, ?)`,
                        [parseInt(class_id), parseInt(round), p_H, p_B, p_L, p_T, error_rate],
                        () => getFullState(state => io.emit('state:update', state))
                    );
                }
            }
        );
    });
});

// ──────────────────────────────────────────────
// REST API: CSV Export (FIX for M-01)
// ──────────────────────────────────────────────
app.get('/api/export', (req, res) => {
    db.all(`SELECT log_text FROM game_logs ORDER BY id ASC`, [], (err, rows) => {
        if (err) return res.status(500).send('DB error');
        const logContent = (rows || []).map(r => r.log_text).join('\n');
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename=game_events.log');
        res.send(logContent);
    });
});

// ──────────────────────────────────────────────
// REST API: DB Reset (FIX for M-02)
// ──────────────────────────────────────────────
app.post('/api/reset', (req, res) => {
    logEvent('System', 'Game data reset initialized');
    db.serialize(() => {
        db.run(`DELETE FROM cards_registry`);
        db.run(`DROP TABLE IF EXISTS restoration_history`, () => {
            db.run(`CREATE TABLE restoration_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                class_id INTEGER,
                round INTEGER,
                skull_sub INTEGER,
                torso_sub INTEGER,
                leg_sub INTEGER,
                tail_sub INTEGER,
                error_rate REAL,
                is_locked INTEGER DEFAULT 0
            )`);
        });
        db.run(`DELETE FROM game_logs`);
        db.run(`UPDATE classes SET skull_count=0, torso_count=0, leg_count=0, tail_count=0`);
        db.run(`UPDATE game_state SET value='1' WHERE key='current_round'`);
        db.run(`UPDATE game_state SET value='1' WHERE key='current_phase'`, () => {
            getFullState(state => io.emit('state:update', state));
            res.json({ success: true });
        });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
