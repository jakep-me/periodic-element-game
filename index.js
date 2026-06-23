const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

app.use(express.static(path.join(__dirname, 'public')));

// 주기율표 1~50번 데이터 정의
const elements = [
    {"num": 1, "ko": "수소", "en": "Hydrogen"}, {"num": 2, "ko": "헬륨", "en": "Helium"},
    {"num": 3, "ko": "리튬", "en": "Lithium"}, {"num": 4, "ko": "베릴륨", "en": "Beryllium"},
    {"num": 5, "ko": "붕소", "en": "Boron"}, {"num": 6, "ko": "탄소", "en": "Carbon"},
    {"num": 7, "ko": "질소", "en": "Nitrogen"}, {"num": 8, "ko": "산소", "en": "Oxygen"},
    {"num": 9, "ko": "플루오린", "en": "Fluorine"}, {"num": 10, "ko": "네온", "en": "Neon"},
    {"num": 11, "ko": "나트륨", "en": "Sodium"}, {"num": 12, "ko": "마그네슘", "en": "Magnesium"},
    {"num": 13, "ko": "알루미늄", "en": "Aluminum"}, {"num": 14, "ko": "규소", "en": "Silicon"},
    {"num": 15, "ko": "인", "en": "Phosphorus"}, {"num": 16, "ko": "황", "en": "Sulfur"},
    {"num": 17, "ko": "염소", "en": "Chlorine"}, {"num": 18, "ko": "아르곤", "en": "Argon"},
    {"num": 19, "ko": "칼륨", "en": "Potassium"}, {"num": 20, "ko": "칼슘", "en": "Calcium"},
    {"num": 21, "ko": "스칸듐", "en": "Scandium"}, {"num": 22, "ko": "티타늄", "en": "Titanium"},
    {"num": 23, "ko": "바나듐", "en": "Vanadium"}, {"num": 24, "ko": "크롬", "en": "Chromium"},
    {"num": 25, "ko": "망가니즈", "en": "Manganese"}, {"num": 26, "ko": "철", "en": "Iron"},
    {"num": 27, "ko": "코발트", "en": "Cobalt"}, {"num": 28, "ko": "니켈", "en": "Nickel"},
    {"num": 29, "ko": "구리", "en": "Copper"}, {"num": 30, "ko": "아연", "en": "Zinc"},
    {"num": 31, "ko": "갈륨", "en": "Gallium"}, {"num": 32, "ko": "게르마늄", "en": "Germanium"},
    {"num": 33, "ko": "비소", "en": "Arsenic"}, {"num": 34, "ko": "셀레늄", "en": "Selenium"},
    {"num": 35, "ko": "브로민", "en": "Bromine"}, {"num": 36, "ko": "크립톤", "en": "Krypton"},
    {"num": 37, "ko": "루비듐", "en": "Rubidium"}, {"num": 38, "ko": "스트론튬", "en": "Strontium"},
    {"num": 39, "ko": "이트륨", "en": "Yttrium"}, {"num": 40, "ko": "지르코늄", "en": "Zirconium"},
    {"num": 41, "ko": "나이오븀", "en": "Niobium"}, {"num": 42, "ko": "몰리브데넘", "en": "Molybdenum"},
    {"num": 43, "ko": "테크네튬", "en": "Technetium"}, {"num": 44, "ko": "루테늄", "en": "Ruthenium"},
    {"num": 45, "ko": "로듐", "en": "Rhodium"}, {"num": 46, "ko": "팔라듐", "en": "Palladium"},
    {"num": 47, "ko": "은", "en": "Silver"}, {"num": 48, "ko": "카드뮴", "en": "Cadmium"},
    {"num": 49, "ko": "인듐", "en": "Indium"}, {"num": 50, "ko": "주석", "en": "Tin"}
];

let gameState = {
    players: [], // { id, name, cards, isAI }
    turnIndex: 0,
    gameStarted: false
};

// 카드 덱 생성 및 셔플 함수
function createAndShuffleDeck() {
    let deck = [];
    elements.forEach(el => {
        deck.push({ num: el.num, name: el.ko, lang: 'ko' });
        deck.push({ num: el.num, name: el.en, lang: 'en' });
    });
    deck.push({ num: 999, name: "JOKER 🃏", lang: 'joker' }); // 조커 추가

    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}

// 자기 패에서 매칭되는 카드 자동 제거 함수
function removePairs(cards) {
    let checked = [];
    let toRemove = new Set();
    
    for (let i = 0; i < cards.length; i++) {
        for (let j = i + 1; j < cards.length; j++) {
            if (cards[i].num === cards[j].num && cards[i].lang !== cards[j].lang && cards[i].num !== 999) {
                toRemove.add(i);
                toRemove.add(j);
                break;
            }
        }
    }
    return cards.filter((_, idx) => !toRemove.has(idx));
}

function checkGameOver() {
    for (let p of gameState.players) {
        if (p.cards.length === 0) {
            let loser = gameState.players.find(pl => pl.cards.some(c => c.num === 999));
            io.emit('gameOver', { winner: p.name, loser: loser ? loser.name : "알 수 없음" });
            gameState.gameStarted = false;
            gameState.players = [];
            return true;
        }
    }
    return false;
}

function nextTurn() {
    gameState.turnIndex = (gameState.turnIndex + 1) % gameState.players.length;
    io.emit('updateState', gameState);

    // AI 턴 처리
    const currentFeedback = gameState.players[gameState.turnIndex];
    if (currentFeedback && currentFeedback.isAI && gameState.gameStarted) {
        setTimeout(() => {
            handleAITurn();
        }, 2000); // 2초 대기 후 실행
        return;
    }
}

function handleAITurn() {
    if (!gameState.gameStarted) return;
    
    let targetIndex = (gameState.turnIndex - 1 + gameState.players.length) % gameState.players.length;
    let targetPlayer = gameState.players[targetIndex];
    let aiPlayer = gameState.players[gameState.turnIndex];

    if (targetPlayer && targetPlayer.cards.length > 0 && aiPlayer) {
        let randIdx = Math.floor(Math.random() * targetPlayer.cards.length);
        let stolenCard = targetPlayer.cards.splice(randIdx, 1)[0];
        aiPlayer.cards.push(stolenCard);
        
        aiPlayer.cards = removePairs(aiPlayer.cards);
        
        io.emit('log', `${aiPlayer.name}가 ${targetPlayer.name}의 카드를 1장 훔쳤습니다.`);
        
        if (checkGameOver()) return;
        nextTurn();
    } else {
        nextTurn();
    }
}

io.on('connection', (socket) => {
    socket.on('joinGame', (name) => {
        if (gameState.gameStarted) return;
        gameState.players.push({ id: socket.id, name: name, cards: [], isAI: false });
        io.emit('updateState', gameState);
    });

    socket.on('addAI', () => {
        if (gameState.gameStarted || gameState.players.length >= 5) return;
        const aiCount = gameState.players.filter(p => p.isAI).length + 1;
        gameState.players.push({ id: `ai_${Date.now()}`, name: `인공지능 봇 ${aiCount}`, cards: [], isAI: true });
        io.emit('updateState', gameState);
    });

    socket.on('startGame', () => {
        if (gameState.players.length < 2 || gameState.gameStarted) return;
        
        gameState.gameStarted = true;
        let deck = createAndShuffleDeck();
        
        // 카드 공정하게 분배
        let idx = 0;
        while (deck.length > 0) {
            gameState.players[idx % gameState.players.length].cards.push(deck.pop());
            idx++;
        }
        
        // 초기 매칭 자동 제거
        gameState.players.forEach(p => {
            p.cards = removePairs(p.cards);
        });
        
        gameState.turnIndex = 0;
        io.emit('gameStarted', gameState);
        io.emit('log', "게임이 시작되었습니다! 카드가 분배되고 일치하는 원소가 자동 제거되었습니다.");
        
        if (checkGameOver()) return;
    });

    socket.on('drawCard', () => {
        let currentPlayer = gameState.players[gameState.turnIndex];
        if (!currentPlayer || currentPlayer.id !== socket.id) return;

        let targetIndex = (gameState.turnIndex - 1 + gameState.players.length) % gameState.players.length;
        let targetPlayer = gameState.players[targetIndex];

        if (targetPlayer && targetPlayer.cards.length > 0) {
            let randIdx = Math.floor(Math.random() * targetPlayer.cards.length);
            let stolenCard = targetPlayer.cards.splice(randIdx, 1)[0];
            currentPlayer.cards.push(stolenCard);
            
            currentPlayer.cards = removePairs(currentPlayer.cards);
            
            io.emit('log', `${currentPlayer.name}가 ${targetPlayer.name}의 카드를 1장 뽑았습니다.`);
            
            if (checkGameOver()) return;
            nextTurn();
        }
    });

    socket.on('disconnect', () => {
        gameState.players = gameState.players.filter(p => p.id !== socket.id);
        if (gameState.players.filter(p => !p.isAI).length === 0) {
            gameState.gameStarted = false;
            gameState.players = [];
        }
        io.emit('updateState', gameState);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
