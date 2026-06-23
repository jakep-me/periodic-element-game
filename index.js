/**
 * Periodic Table Matching Game - Advanced Server Core (Patched v1.1)
 * Architecture: Node.js, Express, Socket.io
 * Security Patches: Player count strict enforcement (4-5 players), Host authorization validation
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    pingTimeout: 60000,
    pingInterval: 25000
});

app.use(express.static(path.join(__dirname, 'public')));

const PROTO_ELEMENTS = [
    {"num": 1, "symbol": "H", "ko": "수소", "en": "Hydrogen", "period": 1, "group": 1},
    {"num": 2, "symbol": "He", "ko": "헬륨", "en": "Helium", "period": 1, "group": 18},
    {"num": 3, "symbol": "Li", "ko": "리튬", "en": "Lithium", "period": 2, "group": 1},
    {"num": 4, "symbol": "Be", "ko": "베릴륨", "en": "Beryllium", "period": 2, "group": 2},
    {"num": 5, "symbol": "B", "ko": "붕소", "en": "Boron", "period": 2, "group": 13},
    {"num": 6, "symbol": "C", "ko": "탄소", "en": "Carbon", "period": 2, "group": 14},
    {"num": 7, "symbol": "N", "ko": "질소", "en": "Nitrogen", "period": 2, "group": 15},
    {"num": 8, "symbol": "O", "ko": "산소", "en": "Oxygen", "period": 2, "group": 16},
    {"num": 9, "symbol": "F", "ko": "플루오린", "en": "Fluorine", "period": 2, "group": 17},
    {"num": 10, "symbol": "Ne", "ko": "네온", "en": "Neon", "period": 2, "group": 18},
    {"num": 11, "symbol": "Na", "ko": "나트륨", "en": "Sodium", "period": 3, "group": 1},
    {"num": 12, "symbol": "Mg", "ko": "마그네슘", "en": "Magnesium", "period": 3, "group": 2},
    {"num": 13, "symbol": "Al", "ko": "알루미늄", "en": "Aluminum", "period": 3, "group": 13},
    {"num": 14, "symbol": "Si", "ko": "규소", "en": "Silicon", "period": 3, "group": 14},
    {"num": 15, "symbol": "P", "ko": "인", "en": "Phosphorus", "period": 3, "group": 15},
    {"num": 16, "symbol": "S", "ko": "황", "en": "Sulfur", "period": 3, "group": 16},
    {"num": 17, "symbol": "Cl", "ko": "염소", "en": "Chlorine", "period": 3, "group": 17},
    {"num": 18, "symbol": "Ar", "ko": "아르곤", "en": "Argon", "period": 3, "group": 18},
    {"num": 19, "symbol": "K", "ko": "칼륨", "en": "Potassium", "period": 4, "group": 1},
    {"num": 20, "symbol": "Ca", "ko": "칼슘", "en": "Calcium", "period": 4, "group": 2},
    {"num": 21, "symbol": "Sc", "ko": "스칸듐", "en": "Scandium", "period": 4, "group": 3},
    {"num": 22, "symbol": "Ti", "ko": "티타늄", "en": "Titanium", "period": 4, "group": 4},
    {"num": 23, "symbol": "V", "ko": "바나듐", "en": "Vanadium", "period": 4, "group": 5},
    {"num": 24, "symbol": "Cr", "ko": "크롬", "en": "Chromium", "period": 4, "group": 6},
    {"num": 25, "symbol": "Mn", "ko": "망가니즈", "en": "Manganese", "period": 4, "group": 7}
];

const activeRooms = new Map();

class GameRoom {
    constructor(roomId, maxPlayers = 5) {
        this.roomId = roomId;
        this.maxPlayers = 5; // 최대 인원 5명 고정
        this.players = [];
        this.turnIndex = 0;
        this.gameStarted = false;
        this.matchedElements = [];
        this.historyLogs = [];
        this.aiTimer = null;
    }

    addLog(message) {
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = `[${timestamp}] ${message}`;
        this.historyLogs.push(logEntry);
        if (this.historyLogs.length > 40) this.historyLogs.shift();
        io.to(this.roomId).emit('sys_log', logEntry);
    }

    broadcastState() {
        io.to(this.roomId).emit('room_state_update', {
            roomId: this.roomId,
            maxPlayers: this.maxPlayers,
            players: this.players.map(p => ({
                id: p.id,
                name: p.name,
                cardCount: p.cards.length,
                isAI: p.isAI
            })),
            turnIndex: this.turnIndex,
            gameStarted: this.gameStarted,
            matchedElements: this.matchedElements
        });

        this.players.forEach(p => {
            if (!p.isAI && p.socketId) {
                io.to(p.socketId).emit('personal_cards_sync', p.cards);
            }
        });
    }

    generateDeck() {
        let deck = [];
        PROTO_ELEMENTS.forEach(el => {
            deck.push({ id: `card_${el.num}_ko_${crypto.randomBytes(2).toString('hex')}`, num: el.num, symbol: el.symbol, name: el.ko, lang: 'ko' });
            deck.push({ id: `card_${el.num}_en_${crypto.randomBytes(2).toString('hex')}`, num: el.num, symbol: el.symbol, name: el.en, lang: 'en' });
        });
        deck.push({ id: `card_999_joker`, num: 999, symbol: "JK", name: "JOKER 🃏", lang: 'joker' });

        for (let i = deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [deck[i], deck[j]] = [deck[j], deck[i]];
        }
        return deck;
    }

    filterInitialPairs(cards, playerObject) {
        let matched = true;
        while (matched) {
            matched = false;
            for (let i = 0; i < cards.length; i++) {
                for (let j = i + 1; j < cards.length; j++) {
                    if (cards[i].num === cards[j].num && cards[i].lang !== cards[j].lang && cards[i].num !== 999) {
                        const elementNum = cards[i].num;
                        const elData = PROTO_ELEMENTS.find(e => e.num === elementNum);
                        this.matchedElements.push(elementNum);
                        
                        this.addLog(`${playerObject.name}님이 분배 패에서 [${elData.symbol} - ${elData.ko}/${elData.en}] 소거 완료.`);
                        
                        cards.splice(j, 1);
                        cards.splice(i, 1);
                        matched = true;
                        break;
                    }
                }
                if (matched) break;
            }
        }
        return cards;
    }

    initializeGame() {
        // 엄격한 규칙 준수: 인원수가 정확히 4명 또는 5명일 때만 작동 명시
        if (this.players.length !== 4 && this.players.length !== 5) return false;
        
        this.gameStarted = true;
        this.matchedElements = [];
        
        let deck = this.generateDeck();
        let pCount = this.players.length;

        let idx = 0;
        while (deck.length > 0) {
            this.players[idx % pCount].cards.push(deck.pop());
            idx++;
        }

        this.players.forEach(p => {
            p.cards = this.filterInitialPairs(p.cards, p);
        });

        this.turnIndex = 0;
        this.addLog(`게임 세션 기동 완료. (${pCount}인 체제 분배 완료)`);
        
        this.broadcastState();
        this.checkGameEndCondition();

        if (this.gameStarted && this.players[this.turnIndex].isAI) {
            this.scheduleAITurn();
        }
        return true;
    }

    executeCardRobbery(thiefId, victimId, targetCardId) {
        const thief = this.players.find(p => p.id === thiefId);
        const victim = this.players.find(p => p.id === victimId);

        if (!thief || !victim || thief.cards.length === 0 || victim.cards.length === 0) return false;

        let cardIdx = -1;
        if (targetCardId === 'random' || !targetCardId) {
            cardIdx = Math.floor(Math.random() * victim.cards.length);
        } else {
            cardIdx = victim.cards.findIndex(c => c.id === targetCardId);
        }

        if (cardIdx === -1) return false;

        const stolenCard = victim.cards.splice(cardIdx, 1)[0];
        thief.cards.push(stolenCard);

        this.addLog(`${thief.name}가 ${victim.name}의 카드 1장을 탈취했습니다.`);

        let hasPair = false;
        for (let i = 0; i < thief.cards.length; i++) {
            for (let j = i + 1; j < thief.cards.length; j++) {
                if (thief.cards[i].num === thief.cards[j].num && thief.cards[i].lang !== thief.cards[j].lang && thief.cards[i].num !== 999) {
                    const matchedNum = thief.cards[i].num;
                    const elData = PROTO_ELEMENTS.find(e => e.num === matchedNum);
                    this.matchedElements.push(matchedNum);
                    
                    this.addLog(`✨ 결합 성공: [${elData.symbol} - ${elData.ko}/${elData.en}]`);
                    
                    thief.cards.splice(j, 1);
                    thief.cards.splice(i, 1);
                    hasPair = true;
                    break;
                }
            }
            if (hasPair) break;
        }

        io.to(this.roomId).emit('animation_rob_trigger', {
            thiefId: thief.id,
            victimId: victim.id,
            cardId: stolenCard.id,
            isMatched: hasPair,
            elementNum: hasPair ? this.matchedElements[this.matchedElements.length - 1] : null
        });

        if (this.checkGameEndCondition()) return true;

        this.proceedToNextTurn();
        return true;
    }

    proceedToNextTurn() {
        if (!this.gameStarted) return;
        
        let attempts = 0;
        do {
            this.turnIndex = (this.turnIndex + 1) % this.players.length;
            attempts++;
        } while (this.players[this.turnIndex].cards.length === 0 && attempts < this.players.length);

        this.broadcastState();

        if (this.players[this.turnIndex].isAI) {
            this.scheduleAITurn();
        }
    }

    scheduleAITurn() {
        if (this.aiTimer) clearTimeout(this.aiTimer);
        this.aiTimer = setTimeout(() => {
            if (!this.gameStarted) return;
            
            let victimIdx = (this.turnIndex - 1 + this.players.length) % this.players.length;
            while (this.players[victimIdx].cards.length === 0 && victimIdx !== this.turnIndex) {
                victimIdx = (victimIdx - 1 + this.players.length) % this.players.length;
            }

            if (victimIdx === this.turnIndex) {
                this.proceedToNextTurn();
                return;
            }

            const aiPlayer = this.players[this.turnIndex];
            const victimPlayer = this.players[victimIdx];
            
            this.executeCardRobbery(aiPlayer.id, victimPlayer.id, 'random');
        }, 3000); 
    }

    checkGameEndCondition() {
        let winner = null;
        for (let p of this.players) {
            if (p.cards.length === 0) {
                winner = p;
                break;
            }
        }

        if (winner) {
            let loser = this.players.find(p => p.cards.some(c => c.num === 999));
            if (!loser) loser = { name: "조커 미보유자 격리 오류" };

            io.to(this.roomId).emit('game_over_broadcast', {
                winner: winner.name,
                loser: loser.name,
                matchedCount: this.matchedElements.length
            });

            this.gameStarted = false;
            if (this.aiTimer) clearTimeout(this.aiTimer);
            return true;
        }
        return false;
    }
}

io.on('connection', (socket) => {
    let currentRoomId = null;
    let playerUniqueId = null;

    socket.on('req_create_room', (data) => {
        const roomId = crypto.randomBytes(3).toString('hex').toUpperCase();
        const room = new GameRoom(roomId);
        activeRooms.set(roomId, room);
        socket.emit('res_create_room', { roomId });
    });

    socket.on('req_join_room', (data) => {
        const { roomId, name } = data;
        const room = activeRooms.get(roomId);

        if (!room) {
            return socket.emit('err_toast', "존재하지 않는 방 주소입니다.");
        }
        if (room.gameStarted) {
            return socket.emit('err_toast', "이미 레이스가 시작된 배틀룸입니다.");
        }
        if (room.players.length >= room.maxPlayers) {
            return socket.emit('err_toast', "방 최대 인원(5명)에 도달했습니다.");
        }

        playerUniqueId = `usr_${crypto.randomBytes(4).toString('hex')}`;
        const newPlayer = {
            id: playerUniqueId,
            name: name || `에이전트_${Math.floor(Math.random()*1000)}`,
            cards: [],
            isAI: false,
            socketId: socket.id
        };

        room.players.push(newPlayer);
        currentRoomId = roomId;
        
        socket.join(roomId);
        socket.emit('login_success', { myId: playerUniqueId, roomId });
        
        room.addLog(`${newPlayer.name} 에이전트 결착 대기열 등록.`);
        room.broadcastState();
    });

    socket.on('req_add_ai', () => {
        if (!currentRoomId) return;
        const room = activeRooms.get(currentRoomId);
        if (!room || room.gameStarted || room.players.length >= room.maxPlayers) return;

        // 인계 권한 보안 체크 (방장만 AI 추가가 가능하도록 한정)
        if (room.players[0].id !== playerUniqueId) {
            return socket.emit('err_toast', "AI 모듈 제어 권한은 오직 방장에게만 귀속됩니다.");
        }

        const aiId = `ai_${crypto.randomBytes(4).toString('hex')}`;
        const aiPlayer = {
            id: aiId,
            name: `AI_Bot_${room.players.length + 1}`,
            cards: [],
            isAI: true,
            socketId: null
        };

        room.players.push(aiPlayer);
        room.addLog(`${aiPlayer.name} 연산 모듈 강제 할당 완료.`);
        room.broadcastState();
    });

    socket.on('req_start_game', () => {
        if (!currentRoomId) return;
        const room = activeRooms.get(currentRoomId);
        if (!room || room.gameStarted) return;

        // 방장 권한 보안 패치: 배열의 최초 개설자(0번째) 아이디와 요청자 아이디 일치 검증
        if (room.players[0].id !== playerUniqueId) {
            return socket.emit('err_toast', "방장이 아닌 플레이어는 배틀 아레나를 기동할 수 없습니다.");
        }

        // 인원수 조건 엄격 제한 패치: 무조건 정확히 4명 또는 5명 조건 만족 스캔
        if (room.players.length !== 4 && room.players.length !== 5) {
            return socket.emit('err_toast', `공정성 시스템 위반: 현재 인원은 ${room.players.length}명입니다. 매칭 스케일은 오직 4명 또는 5인 체제에서만 정상 성립됩니다.`);
        }

        room.initializeGame();
    });

    socket.on('req_rob_card', (data) => {
        if (!currentRoomId || !playerUniqueId) return;
        const room = activeRooms.get(currentRoomId);
        if (!room || !room.gameStarted) return;

        const activePlayer = room.players[room.turnIndex];
        if (activePlayer.id !== playerUniqueId) {
            return socket.emit('err_toast', "현재 당신의 연산 턴 제어 타이밍이 아닙니다.");
        }

        let expectedVictimIdx = (room.turnIndex - 1 + room.players.length) % room.players.length;
        while (room.players[expectedVictimIdx].cards.length === 0 && expectedVictimIdx !== room.turnIndex) {
            expectedVictimIdx = (expectedVictimIdx - 1 + room.players.length) % room.players.length;
        }

        const targetVictim = room.players[expectedVictimIdx];
        if (targetVictim.id !== data.victimId) {
            return socket.emit('err_toast', "체인 규칙 위반: 오직 직전 순서 유저의 자원만 조준 강탈할 수 있습니다.");
        }

        room.executeCardRobbery(playerUniqueId, data.victimId, data.cardId);
    });

    socket.on('disconnect', () => {
        if (currentRoomId) {
            const room = activeRooms.get(currentRoomId);
            if (room) {
                room.players = room.players.filter(p => p.socketId !== socket.id);
                room.addLog("에이전트 이탈 감지. 채널 인프라 재정렬화 스캔 가동.");
                
                if (room.players.filter(p => !p.isAI).length === 0) {
                    if (room.aiTimer) clearTimeout(room.aiTimer);
                    activeRooms.delete(currentRoomId);
                } else {
                    room.broadcastState();
                }
            }
        }
    });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`Periodic Core Application Layer Node Running on Port ${PORT}`);
});
