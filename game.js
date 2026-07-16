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
    attackCooldown: 60,
    projectileSpeed: 6,
    projectiles: 1,      
    pierce: 0,          
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
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.max(canvas.width, canvas.height) / 2 + 50;
    const hpScale = 10 + (frameCount / 600); 

    enemies.push({
        x: player.x + Math.cos(angle) * distance,
        y: player.y + Math.sin(angle) * distance,
        size: 10, speed: 1 + Math.random() * 0.5 + (frameCount / 3600), hp: hpScale, maxHp: hpScale
    });
}

function shoot() {
    if (enemies.length === 0) return;
    
    let closestDist = Infinity;
    let target = null;
    enemies.forEach(e => {
        const dist = Math.hypot(e.x - player.x, e.y - player.y);
        if (dist < closestDist) { closestDist = dist; target = e; }
    });

    if (!target) return;

    const angleToTarget = Math.atan2(target.y - player.y, target.x - player.x);

    for (let i = 0; i < stats.projectiles; i++) {
        const spread = (stats.projectiles > 1) ? ((i - (stats.projectiles - 1) / 2) * 0.2) : 0;
        
        projectiles.push({
            x: player.x, y: player.y,
            vx: Math.cos(angleToTarget + spread) * stats.projectileSpeed,
            vy: Math.sin(angleToTarget + spread) * stats.projectileSpeed,
            pierceLeft: stats.pierce,
            hitEnemies: new Set(),
            angle: angleToTarget + spread // Save angle for drawing rotation
        });
    }
}

function levelUp() {
    isPaused = true;
    player.level++;
    player.exp -= player.nextExp;
    player.nextExp = Math.floor(player.nextExp * 1.5); 

    document.getElementById('level-val').innerText = player.level;
    document.getElementById('level-up-menu').classList.remove('hidden');
    
    const choicesDiv = document.getElementById('upgrade-choices');
    choicesDiv.innerHTML = '';

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
            loop(); 
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
    if (dx !== 0 && dy !== 0) { dx *= 0.707; dy *= 0.707; } 
    
    player.x += dx * stats.moveSpeed;
    player.y += dy * stats.moveSpeed;
    player.x = Math.max(player.size, Math.min(canvas.width - player.size, player.x));
    player.y = Math.max(player.size, Math.min(canvas.height - player.size, player.y));

    // 2. Shooting
    if (frameCount % Math.floor(stats.attackCooldown) === 0) shoot();

    // 3. Enemies & Collision
    if (frameCount % Math.max(10, 60 - Math.floor(frameCount/600)) === 0) spawnEnemy();

    for (let i = enemies.length - 1; i >= 0; i--) {
        let e = enemies[i];
        let angle = Math.atan2(player.y - e.y, player.x - e.x);
        e.x += Math.cos(angle) * e.speed;
        e.y += Math.sin(angle) * e.speed;

        if (Math.hypot(player.x - e.x, player.y - e.y) < player.size + e.size) {
            player.hp -= 0.5;
            if (player.hp <= 0) gameOver();
        }
    }

    // 4. Projectiles vs Enemies
    for (let i = projectiles.length - 1; i >= 0; i--) {
        let p = projectiles[i];
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < 0 || p.x > canvas.width || p.y < 0 || p.y > canvas.height) {
            projectiles.splice(i, 1);
            continue;
        }

        for (let j = enemies.length - 1; j >= 0; j--) {
            let e = enemies[j];
            if (!p.hitEnemies.has(e) && Math.hypot(p.x - e.x, p.y - e.y) < stats.bulletSize * 1.5 + e.size) {
                p.hitEnemies.add(e);
                e.hp -= stats.damage;
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
        
        if (dist < stats.pickupRadius) {
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

    // 6. Floating Damage Texts
    for (let i = damageTexts.length -1; i >= 0; i--) {
        damageTexts[i].y -= 0.5;
        damageTexts[i].alpha -= 0.02;
        if (damageTexts[i].alpha <= 0) damageTexts.splice(i, 1);
    }

    updateUI();
}

// --- COMPLEX DRAWING LOGIC ---
function draw() {
    ctx.fillStyle = '#222';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 1. Draw EXP Gems (4 Shapes: Base Diamond, Inner Core, Highlight, Shadow)
    expGems.forEach(g => {
        ctx.save();
        ctx.translate(g.x, g.y);
        
        // Shape 1: Base Diamond
        ctx.fillStyle = '#118811';
        ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(6, 0); ctx.lineTo(0, 6); ctx.lineTo(-6, 0); ctx.fill();
        
        // Shape 2: Bright Inner Core
        ctx.fillStyle = '#44ff44';
        ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(4, 0); ctx.lineTo(0, 4); ctx.lineTo(-4, 0); ctx.fill();
        
        // Shape 3: White Highlight (top corner)
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(0, -2, 1.5, 0, Math.PI * 2); ctx.fill();
        
        // Shape 4: Bottom Shadow Border
        ctx.strokeStyle = '#003300';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(0, 6); ctx.lineTo(6, 0); ctx.stroke();
        
        ctx.restore();
    });

    // 2. Draw Player (5 Shapes: Chassis, Left Wing, Right Wing, Cockpit, Engine Glow)
    ctx.save();
    ctx.translate(player.x, player.y);
    
    // Shape 1: Main Chassis
    ctx.fillStyle = '#4444ff';
    ctx.fillRect(-player.size, -player.size * 0.8, player.size * 2, player.size * 1.6);
    
    // Shape 2 & 3: Wings
    ctx.fillStyle = '#2222bb';
    ctx.beginPath(); ctx.moveTo(-player.size, -player.size * 0.5); ctx.lineTo(-player.size - 6, player.size); ctx.lineTo(-player.size, player.size); ctx.fill(); // Left Wing
    ctx.beginPath(); ctx.moveTo(player.size, -player.size * 0.5); ctx.lineTo(player.size + 6, player.size); ctx.lineTo(player.size, player.size); ctx.fill(); // Right Wing
    
    // Shape 4: Cockpit Window
    ctx.fillStyle = '#88ccff';
    ctx.beginPath(); ctx.arc(0, -player.size * 0.2, player.size * 0.4, 0, Math.PI * 2); ctx.fill();
    
    // Shape 5: Engine Thruster Glow (Flickers based on frameCount)
    ctx.fillStyle = (frameCount % 10 < 5) ? '#ffaa00' : '#ff4400';
    ctx.beginPath(); ctx.moveTo(-4, player.size * 0.8); ctx.lineTo(0, player.size * 1.5); ctx.lineTo(4, player.size * 0.8); ctx.fill();
    
    ctx.restore();

    // 3. Draw Enemies (5 Shapes: Body, Left Eye, Right Eye, Mouth, Teeth)
    enemies.forEach(e => {
        ctx.save();
        ctx.translate(e.x, e.y);
        
        // Shape 1: Monster Body
        ctx.fillStyle = '#aa2222';
        ctx.beginPath(); ctx.arc(0, 0, e.size, 0, Math.PI * 2); ctx.fill();
        
        // Shape 2 & 3: Red Glowing Eyes
        ctx.fillStyle = '#ffaaaa';
        ctx.fillRect(-e.size * 0.5, -e.size * 0.4, e.size * 0.3, e.size * 0.3); // Left Eye
        ctx.fillRect(e.size * 0.2, -e.size * 0.4, e.size * 0.3, e.size * 0.3); // Right Eye
        
        // Shape 4: Dark Mouth
        ctx.fillStyle = '#330000';
        ctx.fillRect(-e.size * 0.6, e.size * 0.2, e.size * 1.2, e.size * 0.4);
        
        // Shape 5: Sharp Teeth line
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-e.size * 0.5, e.size * 0.2);
        ctx.lineTo(-e.size * 0.2, e.size * 0.5);
        ctx.lineTo(0, e.size * 0.2);
        ctx.lineTo(e.size * 0.2, e.size * 0.5);
        ctx.lineTo(e.size * 0.5, e.size * 0.2);
        ctx.stroke();
        
        ctx.restore();
    });

    // 4. Draw Projectiles (4 Shapes: Outer Aura, Core, Horizontal Spike, Vertical Spike)
    projectiles.forEach(p => {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle); // Rotate to face direction of travel
        
        // Shape 1: Outer Aura Glow
        ctx.fillStyle = 'rgba(255, 255, 0, 0.4)';
        ctx.beginPath(); ctx.arc(0, 0, stats.bulletSize * 1.5, 0, Math.PI * 2); ctx.fill();
        
        // Shape 2: Solid Core
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(0, 0, stats.bulletSize * 0.7, 0, Math.PI * 2); ctx.fill();
        
        // Shape 3 & 4: Energy Spikes (Cross shape)
        ctx.strokeStyle = '#ffff00';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-stats.bulletSize * 2, 0); ctx.lineTo(stats.bulletSize * 2, 0); ctx.stroke(); // Horizontal
        ctx.beginPath(); ctx.moveTo(0, -stats.bulletSize * 2); ctx.lineTo(0, stats.bulletSize * 2); ctx.stroke(); // Vertical
        
        ctx.restore();
    });

    // Draw Damage Texts (Remains standard text)
    ctx.font = 'bold 14px monospace';
    damageTexts.forEach(dt => {
        ctx.fillStyle = `rgba(255, 255, 255, ${dt.alpha})`;
        // Small shadow for legibility
        ctx.shadowColor = "black";
        ctx.shadowBlur = 4;
        ctx.fillText(dt.text, dt.x - 5, dt.y);
        ctx.shadowBlur = 0; // reset
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