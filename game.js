const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Game State
let isPaused = false;
let isGameOver = false;
let frameCount = 0;
let enemiesKilled = 0;

// Inputs
const keys = { w: false, a: false, s: false, d: false };
window.addEventListener('keydown', e => { if (keys.hasOwnProperty(e.key.toLowerCase())) keys[e.key.toLowerCase()] = true; });
window.addEventListener('keyup', e => { if (keys.hasOwnProperty(e.key.toLowerCase())) keys[e.key.toLowerCase()] = false; });
window.addEventListener('keydown', e => { if (e.key === 'ArrowUp') keys.w = true; if (e.key === 'ArrowDown') keys.s = true; if (e.key === 'ArrowLeft') keys.a = true; if (e.key === 'ArrowRight') keys.d = true; });
window.addEventListener('keyup', e => { if (e.key === 'ArrowUp') keys.w = false; if (e.key === 'ArrowDown') keys.s = false; if (e.key === 'ArrowLeft') keys.a = false; if (e.key === 'ArrowRight') keys.d = false; });

// --- PLAYER & CORE STATS ---
const player = {
    x: canvas.width / 2, y: canvas.height / 2, size: 12,
    hp: 100, maxHp: 100, exp: 0, level: 1, nextExp: 10,
    moveSpeed: 2.5, pickupRadius: 60
};

// --- WEAPONS & PASSIVES SYSTEM ---
const weapons = {
    blaster: { level: 1, damage: 10, cooldown: 50, speed: 7, pierce: 0, mult: 1, size: 4 },
    aura: { level: 0, damage: 3, radius: 70, cooldown: 30 },
    orbitals: { level: 0, damage: 15, count: 1, speed: 0.05, radius: 60, angle: 0 },
    lightning: { level: 0, damage: 40, cooldown: 120, count: 1 }
};

const passives = {
    explodeChance: 0, // Chance for enemies to explode on death
    vampirism: false  // Heal on kills
};

// Lists
let enemies = [];
let projectiles = [];
let expGems = [];
let damageTexts = [];
let explosions = [];
let lightningStrikes = []; // For visual effects

// --- UPGRADE POOL ---
const upgradePool = [
    // Blaster Upgrades
    { id: 'b_multi', name: 'Twin Blasters', desc: '+1 Blaster Projectile & +3 Dmg', apply: () => { weapons.blaster.mult++; weapons.blaster.damage += 3; } },
    { id: 'b_pierce', name: 'Ghost Ammo', desc: 'Blaster shots pierce 1 extra enemy', apply: () => weapons.blaster.pierce++ },
    
    // Aura Upgrades
    { id: 'a_unlock', name: 'Static Field', desc: 'Damaging electric aura around you', req: () => weapons.aura.level === 0, apply: () => weapons.aura.level = 1 },
    { id: 'a_up', name: 'Intense Field', desc: 'Aura size and damage increased', req: () => weapons.aura.level > 0, apply: () => { weapons.aura.radius += 20; weapons.aura.damage += 3; weapons.aura.level++; } },
    
    // Orbital Upgrades
    { id: 'o_unlock', name: 'Drone Blades', desc: 'A sharp blade orbits your ship', req: () => weapons.orbitals.level === 0, apply: () => weapons.orbitals.level = 1 },
    { id: 'o_up', name: 'Swarm Blades', desc: '+1 Orbital Blade & Faster Spin', req: () => weapons.orbitals.level > 0, apply: () => { weapons.orbitals.count++; weapons.orbitals.speed *= 1.25; weapons.orbitals.damage += 5; weapons.orbitals.level++; } },
    
    // Lightning Upgrades
    { id: 'l_unlock', name: 'Thor\'s Wrath', desc: 'Periodically smites a random enemy', req: () => weapons.lightning.level === 0, apply: () => weapons.lightning.level = 1 },
    { id: 'l_up', name: 'Chain Lightning', desc: '+1 Lightning Strike Target', req: () => weapons.lightning.level > 0, apply: () => { weapons.lightning.count++; weapons.lightning.damage+=10; weapons.lightning.level++; } },
    
    // Creative Passives
    { id: 'p_explode', name: 'Combustion', desc: '+10% chance for enemies to explode on death', apply: () => passives.explodeChance += 0.1 },
    { id: 'p_vamp', name: 'Vampirism', desc: 'Heal 1 HP for every 15 enemies killed', req: () => !passives.vampirism, apply: () => passives.vampirism = true },
    { id: 'p_magnet', name: 'Gravity Well', desc: '+50% Exp Pickup Radius', apply: () => player.pickupRadius *= 1.5 },
    { id: 'p_speed', name: 'Hyperdrive', desc: '+20% Movement Speed', apply: () => player.moveSpeed *= 1.2 }
];

// --- CORE FUNCTIONS ---
function spawnEnemy() {
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.max(canvas.width, canvas.height) / 2 + 50;
    
    // EXPONENTIAL DIFFICULTY CURVE
    const minutes = frameCount / 3600; // 60 fps = 1 min every 3600 frames
    const hpScale = DIFFICULTY.BASE_ENEMY_HP + Math.pow(minutes * DIFFICULTY.ENEMY_HP_SCALING, DIFFICULTY.ENEMY_HP_EXPONENT);
    const speedScale = DIFFICULTY.BASE_ENEMY_SPEED + (minutes * DIFFICULTY.ENEMY_SPEED_SCALING) + (Math.random() * DIFFICULTY.ENEMY_SPEED_RANDOM);

    enemies.push({
        x: player.x + Math.cos(angle) * distance,
        y: player.y + Math.sin(angle) * distance,
        size: 10, speed: speedScale, hp: hpScale, maxHp: hpScale
    });
}

function handleEnemyDeath(e) {
    expGems.push({ x: e.x, y: e.y, val: 1 });
    enemiesKilled++;
    
    // Vampirism
    if (passives.vampirism && enemiesKilled % 15 === 0) {
        player.hp = Math.min(player.maxHp, player.hp + 1);
    }
    
    // Combustion (Explosion)
    if (Math.random() < passives.explodeChance) {
        explosions.push({ x: e.x, y: e.y, radius: 5, maxRadius: 60, damage: 25, active: true });
    }
}

function applyDamage(e, dmg) {
    e.hp -= dmg;
    damageTexts.push({ x: e.x, y: e.y, text: Math.floor(dmg), alpha: 1 });
    if (e.hp <= 0) {
        handleEnemyDeath(e);
        return true; // Indicates death
    }
    return false;
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

    // Filter valid upgrades, shuffle, pick 3
    let validUpgrades = upgradePool.filter(u => !u.req || u.req());
    let shuffled = validUpgrades.sort(() => 0.5 - Math.random());
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
    document.getElementById('hp-bar').style.width = Math.max(0, (player.hp / player.maxHp) * 100) + '%';
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
    
    player.x += dx * player.moveSpeed;
    player.y += dy * player.moveSpeed;
    player.x = Math.max(player.size, Math.min(canvas.width - player.size, player.x));
    player.y = Math.max(player.size, Math.min(canvas.height - player.size, player.y));

    // 2. Exponential Enemy Spawning
    const spawnRate = Math.max(
        DIFFICULTY.MIN_SPAWN_RATE,
        DIFFICULTY.BASE_SPAWN_RATE - Math.floor(Math.pow(frameCount / DIFFICULTY.SPAWN_RATE_DIVISOR, DIFFICULTY.SPAWN_RATE_EXPONENT))
    );
    if (frameCount % spawnRate === 0) spawnEnemy();

    // 3. WEAPON LOGIC
    
    // -- Blaster --
    if (frameCount % weapons.blaster.cooldown === 0 && enemies.length > 0) {
        let target = enemies.reduce((closest, e) => {
            let dist = Math.hypot(e.x - player.x, e.y - player.y);
            return (dist < closest.dist) ? {e, dist} : closest;
        }, {e: null, dist: Infinity}).e;

        if (target) {
            const angle = Math.atan2(target.y - player.y, target.x - player.x);
            for (let i = 0; i < weapons.blaster.mult; i++) {
                const spread = (weapons.blaster.mult > 1) ? ((i - (weapons.blaster.mult - 1) / 2) * 0.2) : 0;
                projectiles.push({
                    x: player.x, y: player.y,
                    vx: Math.cos(angle + spread) * weapons.blaster.speed,
                    vy: Math.sin(angle + spread) * weapons.blaster.speed,
                    pierceLeft: weapons.blaster.pierce,
                    hitEnemies: new Set(),
                    angle: angle + spread
                });
            }
        }
    }

    // -- Aura --
    if (weapons.aura.level > 0 && frameCount % weapons.aura.cooldown === 0) {
        for (let i = enemies.length - 1; i >= 0; i--) {
            if (Math.hypot(player.x - enemies[i].x, player.y - enemies[i].y) < weapons.aura.radius) {
                if (applyDamage(enemies[i], weapons.aura.damage)) enemies.splice(i, 1);
            }
        }
    }

    // -- Orbitals --
    if (weapons.orbitals.level > 0) {
        weapons.orbitals.angle += weapons.orbitals.speed;
        for (let i = 0; i < weapons.orbitals.count; i++) {
            const angle = weapons.orbitals.angle + (i * (Math.PI * 2 / weapons.orbitals.count));
            const ox = player.x + Math.cos(angle) * weapons.orbitals.radius;
            const oy = player.y + Math.sin(angle) * weapons.orbitals.radius;
            
            for (let j = enemies.length - 1; j >= 0; j--) {
                if (Math.hypot(ox - enemies[j].x, oy - enemies[j].y) < 15) { // Orbital hit radius
                    if (applyDamage(enemies[j], weapons.orbitals.damage)) enemies.splice(j, 1);
                }
            }
        }
    }

    // -- Lightning --
    if (weapons.lightning.level > 0 && frameCount % weapons.lightning.cooldown === 0 && enemies.length > 0) {
        let targets = [...enemies].sort(() => 0.5 - Math.random()).slice(0, weapons.lightning.count);
        targets.forEach(target => {
            lightningStrikes.push({ x: target.x, y: target.y, alpha: 1 });
            let idx = enemies.indexOf(target);
            if (idx > -1) {
                if (applyDamage(enemies[idx], weapons.lightning.damage)) enemies.splice(idx, 1);
            }
        });
    }

    // 4. Enemy Movement & Player Collision
    for (let i = enemies.length - 1; i >= 0; i--) {
        let e = enemies[i];
        let angle = Math.atan2(player.y - e.y, player.x - e.x);
        e.x += Math.cos(angle) * e.speed;
        e.y += Math.sin(angle) * e.speed;

        if (Math.hypot(player.x - e.x, player.y - e.y) < player.size + e.size) {
            player.hp -= DIFFICULTY.ENEMY_CONTACT_DAMAGE; // Contact damage
            if (player.hp <= 0) gameOver();
        }
    }

    // 5. Blaster Projectiles
    for (let i = projectiles.length - 1; i >= 0; i--) {
        let p = projectiles[i];
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < 0 || p.x > canvas.width || p.y < 0 || p.y > canvas.height) { projectiles.splice(i, 1); continue; }

        for (let j = enemies.length - 1; j >= 0; j--) {
            let e = enemies[j];
            if (!p.hitEnemies.has(e) && Math.hypot(p.x - e.x, p.y - e.y) < weapons.blaster.size * 1.5 + e.size) {
                p.hitEnemies.add(e);
                if (applyDamage(e, weapons.blaster.damage)) enemies.splice(j, 1);

                if (p.pierceLeft > 0) { p.pierceLeft--; } 
                else { projectiles.splice(i, 1); break; }
            }
        }
    }

    // 6. Explosions (from Combustion)
    for (let i = explosions.length - 1; i >= 0; i--) {
        let ex = explosions[i];
        if (ex.active) {
            ex.radius += 4;
            // Damage enemies caught in blast
            for (let j = enemies.length - 1; j >= 0; j--) {
                if (Math.hypot(ex.x - enemies[j].x, ex.y - enemies[j].y) < ex.radius + enemies[j].size) {
                    // Slight knockback & damage, apply once per explosion via quick flag
                    if (!enemies[j].hitByEx) {
                        enemies[j].hitByEx = true; // Temporary flag
                        if (applyDamage(enemies[j], ex.damage)) enemies.splice(j, 1);
                    }
                }
            }
            if (ex.radius >= ex.maxRadius) {
                ex.active = false;
                // Cleanup temp flags
                enemies.forEach(en => en.hitByEx = false);
            }
        } else {
            explosions.splice(i, 1);
        }
    }

    // 7. Exp Gems & Magnetism
    for (let i = expGems.length - 1; i >= 0; i--) {
        let g = expGems[i];
        let dist = Math.hypot(player.x - g.x, player.y - g.y);
        
        if (dist < player.pickupRadius) {
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

    // 8. Cleanup Visuals (Texts & Lightning)
    for (let i = damageTexts.length -1; i >= 0; i--) {
        damageTexts[i].y -= 0.5;
        damageTexts[i].alpha -= 0.02;
        if (damageTexts[i].alpha <= 0) damageTexts.splice(i, 1);
    }
    for (let i = lightningStrikes.length -1; i >= 0; i--) {
        lightningStrikes[i].alpha -= 0.05;
        if (lightningStrikes[i].alpha <= 0) lightningStrikes.splice(i, 1);
    }

    updateUI();
}

// --- COMPLEX DRAWING LOGIC ---
function draw() {
    ctx.fillStyle = '#222';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 1. Draw Aura
    if (weapons.aura.level > 0) {
        ctx.fillStyle = `rgba(0, 200, 255, ${0.1 + Math.sin(frameCount * 0.1) * 0.05})`;
        ctx.beginPath(); ctx.arc(player.x, player.y, weapons.aura.radius, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(0, 200, 255, 0.3)';
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    // 2. Draw EXP Gems (4 Shapes)
    expGems.forEach(g => {
        ctx.save(); ctx.translate(g.x, g.y);
        ctx.fillStyle = '#118811'; ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(6, 0); ctx.lineTo(0, 6); ctx.lineTo(-6, 0); ctx.fill();
        ctx.fillStyle = '#44ff44'; ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(4, 0); ctx.lineTo(0, 4); ctx.lineTo(-4, 0); ctx.fill();
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(0, -2, 1.5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#003300'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(0, 6); ctx.lineTo(6, 0); ctx.stroke();
        ctx.restore();
    });

    // 3. Draw Explosions
    explosions.forEach(ex => {
        ctx.fillStyle = `rgba(255, 100, 0, ${1 - (ex.radius / ex.maxRadius)})`;
        ctx.beginPath(); ctx.arc(ex.x, ex.y, ex.radius, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = `rgba(255, 200, 0, ${1 - (ex.radius / ex.maxRadius)})`;
        ctx.stroke();
    });

    // 4. Draw Player (5 Shapes)
    ctx.save(); ctx.translate(player.x, player.y);
    ctx.fillStyle = '#4444ff'; ctx.fillRect(-player.size, -player.size * 0.8, player.size * 2, player.size * 1.6);
    ctx.fillStyle = '#2222bb';
    ctx.beginPath(); ctx.moveTo(-player.size, -player.size * 0.5); ctx.lineTo(-player.size - 6, player.size); ctx.lineTo(-player.size, player.size); ctx.fill(); 
    ctx.beginPath(); ctx.moveTo(player.size, -player.size * 0.5); ctx.lineTo(player.size + 6, player.size); ctx.lineTo(player.size, player.size); ctx.fill(); 
    ctx.fillStyle = '#88ccff'; ctx.beginPath(); ctx.arc(0, -player.size * 0.2, player.size * 0.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = (frameCount % 10 < 5) ? '#ffaa00' : '#ff4400';
    ctx.beginPath(); ctx.moveTo(-4, player.size * 0.8); ctx.lineTo(0, player.size * 1.5); ctx.lineTo(4, player.size * 0.8); ctx.fill();
    ctx.restore();

    // 5. Draw Orbitals (4 Shapes: Aura, Core, Blade1, Blade2)
    if (weapons.orbitals.level > 0) {
        for (let i = 0; i < weapons.orbitals.count; i++) {
            const angle = weapons.orbitals.angle + (i * (Math.PI * 2 / weapons.orbitals.count));
            const ox = player.x + Math.cos(angle) * weapons.orbitals.radius;
            const oy = player.y + Math.sin(angle) * weapons.orbitals.radius;
            
            ctx.save(); ctx.translate(ox, oy); ctx.rotate(weapons.orbitals.angle * 3); // Spin on its own axis
            ctx.fillStyle = 'rgba(200, 200, 200, 0.4)'; ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#aaaaff';
            ctx.beginPath(); ctx.moveTo(-10, -2); ctx.lineTo(10, 0); ctx.lineTo(-10, 2); ctx.fill();
            ctx.beginPath(); ctx.moveTo(-2, -10); ctx.lineTo(0, 10); ctx.lineTo(2, -10); ctx.fill();
            ctx.restore();
        }
    }

    // 6. Draw Enemies (5 Shapes)
    enemies.forEach(e => {
        ctx.save(); ctx.translate(e.x, e.y);
        ctx.fillStyle = '#aa2222'; ctx.beginPath(); ctx.arc(0, 0, e.size, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffaaaa'; ctx.fillRect(-e.size * 0.5, -e.size * 0.4, e.size * 0.3, e.size * 0.3); ctx.fillRect(e.size * 0.2, -e.size * 0.4, e.size * 0.3, e.size * 0.3); 
        ctx.fillStyle = '#330000'; ctx.fillRect(-e.size * 0.6, e.size * 0.2, e.size * 1.2, e.size * 0.4);
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1; ctx.beginPath();
        ctx.moveTo(-e.size * 0.5, e.size * 0.2); ctx.lineTo(-e.size * 0.2, e.size * 0.5); ctx.lineTo(0, e.size * 0.2); ctx.lineTo(e.size * 0.2, e.size * 0.5); ctx.lineTo(e.size * 0.5, e.size * 0.2); ctx.stroke();
        ctx.restore();
    });

    // 7. Draw Projectiles (4 Shapes)
    projectiles.forEach(p => {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.angle); 
        ctx.fillStyle = 'rgba(255, 255, 0, 0.4)'; ctx.beginPath(); ctx.arc(0, 0, weapons.blaster.size * 1.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(0, 0, weapons.blaster.size * 0.7, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#ffff00'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-weapons.blaster.size * 2, 0); ctx.lineTo(weapons.blaster.size * 2, 0); ctx.stroke(); 
        ctx.beginPath(); ctx.moveTo(0, -weapons.blaster.size * 2); ctx.lineTo(0, weapons.blaster.size * 2); ctx.stroke(); 
        ctx.restore();
    });

    // 8. Draw Lightning Strikes (Multi-segment lines)
    lightningStrikes.forEach(ls => {
        ctx.strokeStyle = `rgba(200, 255, 255, ${ls.alpha})`;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(ls.x + (Math.random()*40-20), ls.y - 400); // Start high up
        ctx.lineTo(ls.x + (Math.random()*20-10), ls.y - 200);
        ctx.lineTo(ls.x, ls.y);
        ctx.stroke();
        
        ctx.fillStyle = `rgba(255, 255, 255, ${ls.alpha})`;
        ctx.beginPath(); ctx.arc(ls.x, ls.y, 15, 0, Math.PI*2); ctx.fill();
    });

    // 9. Draw Damage Texts
    ctx.font = 'bold 14px monospace';
    damageTexts.forEach(dt => {
        ctx.fillStyle = `rgba(255, 255, 255, ${dt.alpha})`;
        ctx.shadowColor = "black"; ctx.shadowBlur = 4;
        ctx.fillText(dt.text, dt.x - 5, dt.y);
        ctx.shadowBlur = 0; 
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