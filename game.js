const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Game State
let isPaused = false;
let isGameOver = false;
let frameCount = 0;

// Inputs
const keys = { w: false, a: false, s: false, d: false };
window.addEventListener('keydown', e => { if (keys.hasOwnProperty(e.key.toLowerCase())) keys[e.key.toLowerCase()] = true; });
window.addEventListener('keyup', e => { if (keys.hasOwnProperty(e.key.toLowerCase())) keys[e.key.toLowerCase()] = false; });
window.addEventListener('keydown', e => { if (e.key === 'ArrowUp') keys.w = true; if (e.key === 'ArrowDown') keys.s = true; if (e.key === 'ArrowLeft') keys.a = true; if (e.key === 'ArrowRight') keys.d = true; });
window.addEventListener('keyup', e => { if (e.key === 'ArrowUp') keys.w = false; if (e.key === 'ArrowDown') keys.s = false; if (e.key === 'ArrowLeft') keys.a = false; if (e.key === 'ArrowRight') keys.d = false; });

// --- PLAYER & STATS SYSTEM ---
const player = {
    x: canvas.width / 2, y: canvas.height / 2, size: 12,
    hp: 100, exp: 0, level: 1, nextExp: 10
};

// Detailed Modifiable Stats
const stats = {
    maxHp: 100,
    moveSpeed: 2.5,
    pickupRadius: 50,
    
    // Combat
    damage: 10,
    attackCooldown: 60, // Frames between attacks
    projectileSpeed: 6,
    projectiles: 1,      // How many shots per attack
    pierce: 0,          // How many enemies a bullet goes through before breaking
    bulletSize: 4
};

// Lists
let enemies = [];
let projectiles = [];
let expGems = [];
let damageTexts = [];

// --- DETAILED POWER-UP SYSTEM ---
const upgradePool = [
    { id: 'dmg', name: 'Sharpened Steel', desc: '+5 Base Damage', apply: () => stats.damage += 5 },
    { id: 'haste', name: 'Adrenaline Rush', desc: '-10% Attack Cooldown', apply: () => stats.attackCooldown = Math.max(10, stats.attackCooldown * 0.9) },
    { id: 'multi', name: 'Split Shot', desc: '+1 Projectile per attack', apply: () => stats.projectiles += 1 },
    { id: 'speed', name: 'Swift Boots', desc: '+15% Movement Speed', apply: () => stats.moveSpeed *= 1.15 },
    { id: 'pierce', name: 'Ghost Forging', desc: '+1 Projectile Pierce', apply: () => stats.pierce += 1 },
    { id: 'magnet', name: 'Void Magnet', desc: '+25% Experience Pickup Radius', apply: () => stats.pickupRadius *= 1.25 },
    { id: 'size', name: 'Heavy Caliber', desc: '+50% Projectile Size & +2 Damage', apply: () => { stats.bulletSize *= 1.5; stats.damage += 2; } },
    { id: 'vitality', name: 'Giant\'s Heart', desc: '+20 Max HP and Heal to Full', apply: () => { stats.maxHp += 20; player.hp = stats.maxHp; } }
];

// --- CORE FUNCTIONS ---
function spawnEnemy() {
    // Spawn just outside the screen
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.max(canvas.width, canvas.height) / 2 + 50;
    
    // Scale enemy HP with time
    const hpScale = 10 + (frameCount / 600); 

    enemies.push({
        x: player.x + Math.cos(angle) * distance,
        y: player.y + Math.sin(angle) * distance,
        size: 10, speed: 1 + Math.random() * 0.5 + (frameCount / 3600), hp: hpScale, maxHp: hpScale
    });
}

function shoot() {
    if (enemies.length === 0) return;
    
    // Find closest enemy
    let closestDist = Infinity;
    let target = null;
    enemies.forEach(e => {
        const dist = Math.hypot(e.x - player.x, e.y - player.y);
        if (dist < closestDist) { closestDist = dist; target = e; }
    });

    if (!target) return;

    // Calculate base angle
    const angleToTarget = Math.atan2(target.y - player.y, target.x - player.x);

    // Fire based on projectile count
    for (let i = 0; i < stats.projectiles; i++) {
        // Spread projectiles slightly if there are multiple
        const spread = (stats.projectiles > 1) ? ((i - (stats.projectiles - 1) / 2) * 0.2) : 0;
        
        projectiles.push({
            x: player.x, y: player.y,
            vx: Math.cos(angleToTarget + spread) * stats.projectileSpeed,
            vy: Math.sin(angleToTarget + spread) * stats.projectileSpeed,
            pierceLeft: stats.pierce,
            hitEnemies: new Set() // Prevent hitting the same enemy twice per frame
        });
    }
}

function levelUp() {
    isPaused = true;
    player.level++;
    player.exp -= player.nextExp;
    player.nextExp = Math.floor(player.nextExp * 1.5); // Exponential requirement

    document.getElementById('level-val').innerText = player.level;
    document.getElementById('level-up-menu').classList.remove('hidden');
    
    const choicesDiv = document.getElementById('upgrade-choices');
    choicesDiv.innerHTML = '';

    // Pick 3 random distinct upgrades
    let shuffled = [...upgradePool].sort(() => 0.5 - Math.random());
    let choices = shuffled.slice(0, 3);

    choices.forEach(upgrade => {
        const card = document.createElement('div');
        card.className = 'upgrade-card';
        card.innerHTML = `<div class="upgrade-title">${upgrade.name}</div><div class="upgrade-desc">${upgrade.desc}</div>`;
        card.onclick = () => {
            upgrade.apply();
            document.getElementById('level-up-menu').classList.add('hidden');
            isPaused = false;
            updateUI();
            loop(); // Resume loop
        };
        choicesDiv.appendChild(card);
    });
}

function updateUI() {
    document.getElementById('hp-bar').style.width = Math.max(0, (player.hp / stats.maxHp) * 100) + '%';
    document.getElementById('exp-bar').style.width = (player.exp / player.nextExp) * 100 + '%';
}

function gameOver() {
    isGameOver = true;
    document.getElementById('final-level').innerText = player.level;
    document.getElementById('game-over-menu').classList.remove('hidden');
}

// --- GAME LOOP ---
function update() {
    if (isPaused || isGameOver) return;
    frameCount++;

    // 1. Player Movement
    let dx = 0, dy = 0;
    if (keys.w) dy -= 1; if (keys.s) dy += 1;
    if (keys.a) dx -= 1; if (keys.d) dx += 1;
    if (dx !== 0 && dy !== 0) { dx *= 0.707; dy *= 0.707; } // Normalize diagonal
    
    player.x += dx * stats.moveSpeed;
    player.y += dy * stats.moveSpeed;

    // Keep player in bounds
    player.x = Math.max(player.size, Math.min(canvas.width - player.size, player.x));
    player.y = Math.max(player.size, Math.min(canvas.height - player.size, player.y));

    // 2. Shooting
    if (frameCount % Math.floor(stats.attackCooldown) === 0) shoot();

    // 3. Enemies & Collision
    if (frameCount % Math.max(10, 60 - Math.floor(frameCount/600)) === 0) spawnEnemy();

    for (let i = enemies.length - 1; i >= 0; i--) {
        let e = enemies[i];
        // Move towards player
        let angle = Math.atan2(player.y - e.y, player.x - e.x);
        e.x += Math.cos(angle) * e.speed;
        e.y += Math.sin(angle) * e.speed;

        // Hit Player?
        if (Math.hypot(player.x - e.x, player.y - e.y) < player.size + e.size) {
            player.hp -= 0.5; // Constant damage contact
            if (player.hp <= 0) gameOver();
        }
    }

    // 4. Projectiles vs Enemies
    for (let i = projectiles.length - 1; i >= 0; i--) {
        let p = projectiles[i];
        p.x += p.vx;
        p.y += p.vy;

        // Out of bounds
        if (p.x < 0 || p.x > canvas.width || p.y < 0 || p.y > canvas.height) {
            projectiles.splice(i, 1);
            continue;
        }

        for (let j = enemies.length - 1; j >= 0; j--) {
            let e = enemies[j];
            if (!p.hitEnemies.has(e) && Math.hypot(p.x - e.x, p.y - e.y) < stats.bulletSize + e.size) {
                p.hitEnemies.add(e);
                e.hp -= stats.damage;

                // Simple Damage Number Text
                damageTexts.push({ x: e.x, y: e.y, text: stats.damage, alpha: 1 });

                if (e.hp <= 0) {
                    expGems.push({ x: e.x, y: e.y, val: 1 });
                    enemies.splice(j, 1);
                }

                if (p.pierceLeft > 0) { p.pierceLeft--; } 
                else { projectiles.splice(i, 1); break; }
            }
        }
    }

    // 5. Exp Gems
    for (let i = expGems.length - 1; i >= 0; i--) {
        let g = expGems[i];
        let dist = Math.hypot(player.x - g.x, player.y - g.y);
        
        // Magnet effect
        if (dist < stats.pickupRadius) {
            // Move gem to player quickly
            let angle = Math.atan2(player.y - g.y, player.x - g.x);
            g.x += Math.cos(angle) * 8;
            g.y += Math.sin(angle) * 8;
            
            if (dist < player.size) {
                player.exp += g.val;
                expGems.splice(i, 1);
                if (player.exp >= player.nextExp) levelUp();
            }
        }
    }

    // 6. Floating Damage Texts fade
    for (let i = damageTexts.length -1; i >= 0; i--) {
        damageTexts[i].y -= 0.5;
        damageTexts[i].alpha -= 0.02;
        if (damageTexts[i].alpha <= 0) damageTexts.splice(i, 1);
    }

    updateUI();
}

function draw() {
    // Clear screen
    ctx.fillStyle = '#222';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw Gems (Small Green Diamonds)
    ctx.fillStyle = '#44ff44';
    expGems.forEach(g => {
        ctx.beginPath();
        ctx.arc(g.x, g.y, 4, 0, Math.PI * 2);
        ctx.fill();
    });

    // Draw Player (Blue Square)
    ctx.fillStyle = '#4444ff';
    ctx.fillRect(player.x - player.size, player.y - player.size, player.size * 2, player.size * 2);

    // Draw Enemies (Red Squares)
    ctx.fillStyle = '#ff4444';
    enemies.forEach(e => {
        ctx.fillRect(e.x - e.size, e.y - e.size, e.size * 2, e.size * 2);
    });

    // Draw Projectiles (Yellow Circles)
    ctx.fillStyle = '#ffff44';
    projectiles.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, stats.bulletSize, 0, Math.PI * 2);
        ctx.fill();
    });

    // Draw Damage Texts
    ctx.font = '12px monospace';
    damageTexts.forEach(dt => {
        ctx.fillStyle = `rgba(255, 255, 255, ${dt.alpha})`;
        ctx.fillText(dt.text, dt.x, dt.y);
    });
}

function loop() {
    update();
    draw();
    if (!isPaused && !isGameOver) {
        requestAnimationFrame(loop);
    }
}

// Start Game
updateUI();
loop();