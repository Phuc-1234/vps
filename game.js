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

// Helper: Distance from a point to a line segment
function distToSegment(x, y, x1, y1, x2, y2) {
    let A = x - x1;
    let B = y - y1;
    let C = x2 - x1;
    let D = y2 - y1;
    let dot = A * C + B * D;
    let lenSq = C * C + D * D;
    let param = -1;
    if (lenSq !== 0) param = dot / lenSq;
    let xx, yy;
    if (param < 0) { xx = x1; yy = y1; }
    else if (param > 1) { xx = x2; yy = y2; }
    else { xx = x1 + param * C; yy = y1 + param * D; }
    let dx = x - xx;
    let dy = y - yy;
    return Math.hypot(dx, dy);
}

// --- PLAYER & CORE STATS ---
const player = {
    x: canvas.width / 2, y: canvas.height / 2, size: 12,
    hp: 100, maxHp: 100, exp: 0, level: 1, nextExp: DIFFICULTY.BASE_EXP_REQUIRED,
    moveSpeed: 2.5, pickupRadius: 60
};

// --- WEAPONS & PASSIVES SYSTEM ---
const weapons = {
    blaster: { level: 1, damage: 10, cooldown: 50, speed: 7, pierce: 0, mult: 1, size: 4 },
    aura: { level: 0, damage: 3, radius: 70, cooldown: 30 },
    orbitals: { level: 0, damage: 15, count: 1, speed: 0.05, radius: 60, angle: 0 },
    lightning: { level: 0, damage: 40, cooldown: 120, count: 1 },
    glaive: { level: 0, damage: 25, cooldown: 180, speed: 6, count: 1 }, // Bouncing projectiles
    ooze: { level: 0, damage: 5, radius: 45, cooldown: 90, duration: 240 }, // Dropped lingering puddles
    // 10 new creative weapons
    blackhole: { level: 0, damage: 2, radius: 60, cooldown: 240, duration: 180 },
    vortex: { level: 0, damage: 12, count: 1, radius: 60, speed: 0.03, angle: 0 },
    tesla: { level: 0, damage: 35, cooldown: 160 },
    timewarp: { level: 0, radius: 100, cooldown: 300, duration: 150 },
    meteor: { level: 0, damage: 120, cooldown: 220, radius: 80 },
    laser: { level: 0, damage: 5, cooldown: 160, duration: 60 },
    drone: { level: 0, damage: 8, cooldown: 120, count: 1 },
    frostnova: { level: 0, radius: 160, cooldown: 260, duration: 90 },
    harpoon: { level: 0, damage: 18, cooldown: 150, count: 3 },
    goldmine: { level: 0, damage: 25, cooldown: 200 }
};

const passives = {
    vampirism: false, // Heal on kills
    frostbite: false, // Halve enemy speed on hit
    cull: false,      // Instakill under 15% HP
    kinetic: false    // Knockback + damage on getting hit
};

// Lists
let enemies = [];
let projectiles = [];
let expGems = [];
let damageTexts = [];
let lightningStrikes = []; 
let glaives = [];
let puddles = [];
// 10 New Weapon Lists
let blackholes = [];
let vortexBarriers = [];
let pylons = [];
let timeBubbles = [];
let meteors = [];
let lasers = [];
let drones = [];
let freezeWaves = [];
let harpoons = [];
let goldMines = [];

function spawnVortexBarriers() {
    vortexBarriers = [];
    if (weapons.vortex.level === 0) return;
    for (let i = 0; i < weapons.vortex.count; i++) {
        vortexBarriers.push({
            angle: (i * (Math.PI * 2) / weapons.vortex.count)
        });
    }
}

function spawnDrones() {
    drones = [];
    if (weapons.drone.level === 0) return;
    for (let i = 0; i < weapons.drone.count; i++) {
        drones.push({
            angle: (i * Math.PI * 2) / weapons.drone.count,
            x: player.x,
            y: player.y,
            cooldown: 0
        });
    }
}

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
    
    // Glaive Upgrades
    { id: 'g_unlock', name: 'Spectral Glaive', desc: 'Fires a bouncing blade that pierces', req: () => weapons.glaive.level === 0, apply: () => weapons.glaive.level = 1 },
    { id: 'g_up', name: 'Glaive Ricochet', desc: '+1 Bouncing Glaive & +10 Dmg', req: () => weapons.glaive.level > 0, apply: () => { weapons.glaive.count++; weapons.glaive.damage += 10; weapons.glaive.level++; } },

    // Ooze Upgrades
    { id: 'z_unlock', name: 'Caustic Ooze', desc: 'Leaves toxic puddles behind you', req: () => weapons.ooze.level === 0, apply: () => weapons.ooze.level = 1 },
    { id: 'z_up', name: 'Deep Sludge', desc: 'Puddles are larger and last longer', req: () => weapons.ooze.level > 0, apply: () => { weapons.ooze.radius += 15; weapons.ooze.duration += 60; weapons.ooze.damage += 3; weapons.ooze.level++; } },

    // 10 new creative weapons
    { id: 'bh_unlock', name: 'Singularity', desc: 'Creates a mini black hole pulling enemies in', req: () => weapons.blackhole.level === 0, apply: () => weapons.blackhole.level = 1 },
    { id: 'bh_up', name: 'Supermassive', desc: 'Larger pull radius and higher damage', req: () => weapons.blackhole.level > 0, apply: () => { weapons.blackhole.radius += 20; weapons.blackhole.damage += 2; weapons.blackhole.level++; } },

    { id: 'v_unlock', name: 'Vortex Barrier', desc: 'Rotating shield panels that deflect enemies', req: () => weapons.vortex.level === 0, apply: () => { weapons.vortex.level = 1; spawnVortexBarriers(); } },
    { id: 'v_up', name: 'Iron Ring', desc: '+1 shield barrier & faster rotation', req: () => weapons.vortex.level > 0, apply: () => { weapons.vortex.count++; weapons.vortex.speed += 0.01; weapons.vortex.level++; spawnVortexBarriers(); } },

    { id: 't_unlock', name: 'Tesla Pylon', desc: 'Drops pylons; arcs electricity between you and them', req: () => weapons.tesla.level === 0, apply: () => weapons.tesla.level = 1 },
    { id: 't_up', name: 'High Voltage', desc: 'Tesla arcs deal double damage', req: () => weapons.tesla.level > 0, apply: () => { weapons.tesla.damage += 30; weapons.tesla.level++; } },

    { id: 'tw_unlock', name: 'Chronoshift', desc: 'Emits zones that slow down enemy actions', req: () => weapons.timewarp.level === 0, apply: () => weapons.timewarp.level = 1 },
    { id: 'tw_up', name: 'Temporal Rift', desc: 'Larger slow zones that last longer', req: () => weapons.timewarp.level > 0, apply: () => { weapons.timewarp.radius += 30; weapons.timewarp.duration += 60; weapons.timewarp.level++; } },

    { id: 'm_unlock', name: 'Starfall', desc: 'Calls down meteors on thick clusters', req: () => weapons.meteor.level === 0, apply: () => weapons.meteor.level = 1 },
    { id: 'm_up', name: 'Armageddon', desc: '+40% Meteor explosion radius & +50 damage', req: () => weapons.meteor.level > 0, apply: () => { weapons.meteor.radius *= 1.4; weapons.meteor.damage += 50; weapons.meteor.level++; } },

    { id: 'ls_unlock', name: 'Prismatic Beam', desc: 'Fires a continuous piercing laser sweep', req: () => weapons.laser.level === 0, apply: () => weapons.laser.level = 1 },
    { id: 'ls_up', name: 'Neutron Beam', desc: 'Longer laser duration and +3 damage per tick', req: () => weapons.laser.level > 0, apply: () => { weapons.laser.duration += 30; weapons.laser.damage += 3; weapons.laser.level++; } },

    { id: 'dr_unlock', name: 'Interceptor Drone', desc: 'Summons a helper drone that shoots targets', req: () => weapons.drone.level === 0, apply: () => { weapons.drone.level = 1; spawnDrones(); } },
    { id: 'dr_up', name: 'Drone Squadron', desc: '+1 Drone & +5 drone damage', req: () => weapons.drone.level > 0, apply: () => { weapons.drone.count++; weapons.drone.damage += 5; weapons.drone.level++; spawnDrones(); } },

    { id: 'fn_unlock', name: 'Frost Nova', desc: 'Periodically freezes all nearby enemies in place', req: () => weapons.frostnova.level === 0, apply: () => weapons.frostnova.level = 1 },
    { id: 'fn_up', name: 'Deep Freeze', desc: 'Freeze radius and duration increased', req: () => weapons.frostnova.level > 0, apply: () => { weapons.frostnova.radius += 50; weapons.frostnova.duration += 30; weapons.frostnova.level++; } },

    { id: 'hp_unlock', name: 'Chain Harpoon', desc: 'Fires harpoons to bundle groups of enemies together', req: () => weapons.harpoon.level === 0, apply: () => weapons.harpoon.level = 1 },
    { id: 'hp_up', name: 'Grapple Net', desc: 'Harpoons target +2 more enemies', req: () => weapons.harpoon.level > 0, apply: () => { weapons.harpoon.count += 2; weapons.harpoon.level++; } },

    { id: 'gm_unlock', name: 'Gold Mine', desc: 'Drops gold chests that detonate into valuable coin shrapnel', req: () => weapons.goldmine.level === 0, apply: () => weapons.goldmine.level = 1 },
    { id: 'gm_up', name: 'El Dorado', desc: 'Chest explosion deals double damage and coins pierce', req: () => weapons.goldmine.level > 0, apply: () => { weapons.goldmine.damage += 30; weapons.goldmine.level++; } },

    // Creative Passives
    { id: 'p_frost', name: 'Frostbite', desc: 'Damaging enemies halves their speed', req: () => !passives.frostbite, apply: () => passives.frostbite = true },
    { id: 'p_cull', name: 'Executioner', desc: 'Insta-kills enemies under 15% HP', req: () => !passives.cull, apply: () => passives.cull = true },
    { id: 'p_kinetic', name: 'Kinetic Plating', desc: 'Taking damage blasts enemies away', req: () => !passives.kinetic, apply: () => passives.kinetic = true },
    { id: 'p_vamp', name: 'Vampirism', desc: 'Heal 1 HP for every 15 enemies killed', req: () => !passives.vampirism, apply: () => passives.vampirism = true },
    { id: 'p_magnet', name: 'Gravity Well', desc: '+50% Exp Pickup Radius', apply: () => player.pickupRadius *= 1.5 },
    { id: 'p_speed', name: 'Hyperdrive', desc: '+20% Movement Speed', apply: () => player.moveSpeed *= 1.2 }
];

// --- CORE FUNCTIONS ---
function spawnEnemy() {
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.max(canvas.width, canvas.height) / 2 + 50;
    
    // EXPONENTIAL DIFFICULTY CURVE (Using user's external config)
    const minutes = frameCount / 3600;
    const hpScale = DIFFICULTY.BASE_ENEMY_HP + Math.pow(minutes * DIFFICULTY.ENEMY_HP_SCALING, DIFFICULTY.ENEMY_HP_EXPONENT);
    const speedScale = DIFFICULTY.BASE_ENEMY_SPEED + (minutes * DIFFICULTY.ENEMY_SPEED_SCALING) + (Math.random() * DIFFICULTY.ENEMY_SPEED_RANDOM);

    // Pick type
    let roll = Math.random();
    let type = "normal";
    let size = 10;
    let hp = hpScale;
    let speed = speedScale;
    
    if (roll < 0.15) {
        type = "splitter";
        size = 13;
        hp = hpScale * 1.4;
    } else if (roll < 0.30) {
        type = "charger";
        size = 14;
        hp = hpScale * 1.8;
        speed = speedScale * 0.7;
    } else if (roll < 0.42) {
        type = "spiker";
        size = 10;
        hp = hpScale * 1.2;
    }

    enemies.push({
        x: player.x + Math.cos(angle) * distance,
        y: player.y + Math.sin(angle) * distance,
        size: size,
        speed: speed,
        hp: hp,
        maxHp: hp,
        type: type,
        chilledTimer: 0,
        frozenTimer: 0,
        // Charger fields
        state: "follow",
        stateTimer: 120 + Math.random() * 60,
        targetX: 0,
        targetY: 0,
        chargeAngle: 0,
        // Spiker fields
        spikeExtended: false,
        spikeTimer: 60 + Math.random() * 120
    });
}

function handleEnemyDeath(e) {
    expGems.push({ x: e.x, y: e.y, val: DIFFICULTY.EXP_GEM_VALUE });
    enemiesKilled++;
    
    if (passives.vampirism && enemiesKilled % 15 === 0) {
        player.hp = Math.min(player.maxHp, player.hp + 1);
    }

    // Splitter logic: spawn 2 minis
    if (e.type === "splitter") {
        for (let k = 0; k < 2; k++) {
            enemies.push({
                x: e.x + (Math.random() * 20 - 10),
                y: e.y + (Math.random() * 20 - 10),
                size: 7,
                speed: e.speed * 1.4,
                hp: e.maxHp * 0.4,
                maxHp: e.maxHp * 0.4,
                type: "mini",
                chilledTimer: 0,
                frozenTimer: 0,
                state: "follow",
                stateTimer: 0,
                targetX: 0,
                targetY: 0,
                chargeAngle: 0,
                spikeExtended: false,
                spikeTimer: 0
            });
        }
    }
}

function applyDamage(e, dmg, type = "normal") {
    // Frostbite Logic
    if (passives.frostbite) e.chilledTimer = 120; // 2 seconds of slow

    // Charger shield during charge state
    if (e.type === "charger" && e.state === "charge") {
        dmg = dmg * 0.2; // 80% damage reduction
    }

    e.hp -= dmg;
    let txtStr = Math.floor(dmg);
    
    // Cull (Executioner) Logic
    if (passives.cull && e.hp > 0 && e.hp <= e.maxHp * 0.15) {
        e.hp = 0;
        txtStr = "CULL";
    }

    damageTexts.push({ x: e.x, y: e.y, text: txtStr, alpha: 1, type: txtStr === "CULL" ? "cull" : type });
    
    if (e.hp <= 0) {
        handleEnemyDeath(e);
        return true; 
    }
    return false;
}

function levelUp() {
    isPaused = true;
    player.level++;
    player.exp -= player.nextExp;
    player.nextExp = Math.floor(player.nextExp * DIFFICULTY.EXP_SCALING_FACTOR); 

    document.getElementById('level-val').innerText = player.level;
    document.getElementById('level-up-menu').classList.remove('hidden');
    
    const choicesDiv = document.getElementById('upgrade-choices');
    choicesDiv.innerHTML = '';

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
                    angle: angle + spread,
                    hitPlayer: false
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
                if (Math.hypot(ox - enemies[j].x, oy - enemies[j].y) < 15) {
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

    // -- Glaives (Bouncing) --
    if (weapons.glaive.level > 0 && frameCount % weapons.glaive.cooldown === 0) {
        for (let i = 0; i < weapons.glaive.count; i++) {
            const angle = Math.random() * Math.PI * 2;
            glaives.push({
                x: player.x, y: player.y,
                vx: Math.cos(angle) * weapons.glaive.speed,
                vy: Math.sin(angle) * weapons.glaive.speed,
                life: 300, 
                lastHitMap: new Map() 
            });
        }
    }

    for (let i = glaives.length - 1; i >= 0; i--) {
        let g = glaives[i];
        g.x += g.vx;
        g.y += g.vy;
        g.life--;

        if (g.x < 0 || g.x > canvas.width) g.vx *= -1;
        if (g.y < 0 || g.y > canvas.height) g.vy *= -1;

        for (let j = enemies.length - 1; j >= 0; j--) {
            let e = enemies[j];
            if (Math.hypot(g.x - e.x, g.y - e.y) < 20 + e.size) {
                if (!g.lastHitMap.has(e) || frameCount - g.lastHitMap.get(e) > 30) {
                    g.lastHitMap.set(e, frameCount);
                    if (applyDamage(e, weapons.glaive.damage)) enemies.splice(j, 1);
                }
            }
        }

        if (g.life <= 0) glaives.splice(i, 1);
    }

    // -- Ooze Puddles and Fire Puddles --
    if (weapons.ooze.level > 0 && frameCount % weapons.ooze.cooldown === 0) {
        puddles.push({ x: player.x, y: player.y, life: weapons.ooze.duration, maxLife: weapons.ooze.duration, isFire: false });
    }

    for (let i = puddles.length - 1; i >= 0; i--) {
        let p = puddles[i];
        p.life--;
        
        if (frameCount % 15 === 0) {
            let dmgVal = p.isFire ? weapons.meteor.damage * 0.12 : weapons.ooze.damage;
            let radius = p.isFire ? p.radius : weapons.ooze.radius;
            for (let j = enemies.length - 1; j >= 0; j--) {
                if (Math.hypot(p.x - enemies[j].x, p.y - enemies[j].y) < radius) {
                    if (applyDamage(enemies[j], dmgVal, p.isFire ? "fire" : "normal")) enemies.splice(j, 1);
                }
            }
        }
        if (p.life <= 0) puddles.splice(i, 1);
    }

    // -- Black Hole --
    if (weapons.blackhole.level > 0 && frameCount % weapons.blackhole.cooldown === 0) {
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * 100 + 50;
        blackholes.push({
            x: player.x + Math.cos(angle) * dist,
            y: player.y + Math.sin(angle) * dist,
            life: weapons.blackhole.duration,
            maxLife: weapons.blackhole.duration,
            radius: weapons.blackhole.radius
        });
    }

    for (let i = blackholes.length - 1; i >= 0; i--) {
        let bh = blackholes[i];
        bh.life--;
        
        enemies.forEach(e => {
            let dist = Math.hypot(bh.x - e.x, bh.y - e.y);
            if (dist < bh.radius * 2.5) {
                let force = (1 - dist / (bh.radius * 2.5)) * 2.0;
                let pullAngle = Math.atan2(bh.y - e.y, bh.x - e.x);
                e.x += Math.cos(pullAngle) * force;
                e.y += Math.sin(pullAngle) * force;
            }
        });

        if (frameCount % 10 === 0) {
            for (let j = enemies.length - 1; j >= 0; j--) {
                let e = enemies[j];
                if (Math.hypot(bh.x - e.x, bh.y - e.y) < bh.radius) {
                    if (applyDamage(e, weapons.blackhole.damage)) {
                        enemies.splice(j, 1);
                    }
                }
            }
        }

        if (bh.life <= 0) blackholes.splice(i, 1);
    }

    // -- Vortex Barrier --
    if (weapons.vortex.level > 0) {
        weapons.vortex.angle += weapons.vortex.speed;
        vortexBarriers.forEach((vb, idx) => {
            const angle = weapons.vortex.angle + (idx * (Math.PI * 2 / weapons.vortex.count));
            vb.x = player.x + Math.cos(angle) * weapons.vortex.radius;
            vb.y = player.y + Math.sin(angle) * weapons.vortex.radius;
            vb.angle = angle;
            
            for (let j = enemies.length - 1; j >= 0; j--) {
                let e = enemies[j];
                if (Math.hypot(vb.x - e.x, vb.y - e.y) < 20 + e.size) {
                    const kbAngle = Math.atan2(e.y - vb.y, e.x - vb.x);
                    e.x += Math.cos(kbAngle) * 20;
                    e.y += Math.sin(kbAngle) * 20;
                    
                    if (applyDamage(e, weapons.vortex.damage)) {
                        enemies.splice(j, 1);
                    }
                }
            }
        });
    }

    // -- Tesla Pylon --
    if (weapons.tesla.level > 0) {
        if (frameCount % weapons.tesla.cooldown === 0) {
            pylons.push({
                x: player.x,
                y: player.y,
                life: 360
            });
        }
        
        for (let i = pylons.length - 1; i >= 0; i--) {
            let py = pylons[i];
            py.life--;
            
            if (frameCount % 12 === 0) {
                let distToPlayer = Math.hypot(player.x - py.x, player.y - py.y);
                if (distToPlayer > 50 && distToPlayer < 400) {
                    lightningStrikes.push({
                        x: py.x,
                        y: py.y,
                        tx: player.x,
                        ty: player.y,
                        alpha: 1,
                        isTesla: true
                    });
                    
                    for (let j = enemies.length - 1; j >= 0; j--) {
                        let e = enemies[j];
                        let d = distToSegment(e.x, e.y, py.x, py.y, player.x, player.y);
                        if (d < e.size + 15) {
                            if (applyDamage(e, weapons.tesla.damage)) {
                                enemies.splice(j, 1);
                            }
                        }
                    }
                }
            }
            
            if (py.life <= 0) pylons.splice(i, 1);
        }
    }

    // -- Time Warp --
    if (weapons.timewarp.level > 0 && frameCount % weapons.timewarp.cooldown === 0) {
        timeBubbles.push({
            x: player.x,
            y: player.y,
            radius: weapons.timewarp.radius,
            life: weapons.timewarp.duration,
            maxLife: weapons.timewarp.duration
        });
    }

    for (let i = timeBubbles.length - 1; i >= 0; i--) {
        let tb = timeBubbles[i];
        tb.life--;
        if (tb.life <= 0) timeBubbles.splice(i, 1);
    }

    // -- Meteor Strike --
    if (weapons.meteor.level > 0 && frameCount % weapons.meteor.cooldown === 0 && enemies.length > 0) {
        let target = enemies[Math.floor(Math.random() * enemies.length)];
        meteors.push({
            tx: target.x,
            ty: target.y,
            x: target.x + 100,
            y: target.y - 300,
            progress: 0,
            radius: weapons.meteor.radius,
            damage: weapons.meteor.damage
        });
    }

    for (let i = meteors.length - 1; i >= 0; i--) {
        let m = meteors[i];
        m.progress += 0.04;
        
        m.x = m.tx + 100 * (1 - m.progress);
        m.y = m.ty - 300 * (1 - m.progress);
        
        if (m.progress >= 1.0) {
            for (let j = enemies.length - 1; j >= 0; j--) {
                let e = enemies[j];
                if (Math.hypot(m.tx - e.x, m.ty - e.y) < m.radius) {
                    if (applyDamage(e, m.damage, "meteor")) {
                        enemies.splice(j, 1);
                    }
                }
            }
            
            puddles.push({
                x: m.tx,
                y: m.ty,
                life: 90,
                maxLife: 90,
                radius: m.radius * 0.6,
                isFire: true
            });
            
            meteors.splice(i, 1);
        }
    }

    // -- Beam Laser --
    if (weapons.laser.level > 0 && frameCount % weapons.laser.cooldown === 0) {
        let angle = Math.random() * Math.PI * 2;
        lasers.push({
            angle: angle,
            life: weapons.laser.duration,
            maxLife: weapons.laser.duration,
            damage: weapons.laser.damage
        });
    }

    for (let i = lasers.length - 1; i >= 0; i--) {
        let las = lasers[i];
        las.life--;
        las.angle += 0.015;
        
        let lx = player.x + Math.cos(las.angle) * 800;
        let ly = player.y + Math.sin(las.angle) * 800;
        
        if (frameCount % 6 === 0) {
            for (let j = enemies.length - 1; j >= 0; j--) {
                let e = enemies[j];
                let dist = distToSegment(e.x, e.y, player.x, player.y, lx, ly);
                if (dist < e.size + 12) {
                    if (applyDamage(e, las.damage, "laser")) {
                        enemies.splice(j, 1);
                    }
                }
            }
        }
        
        if (las.life <= 0) lasers.splice(i, 1);
    }

    // -- Drones --
    if (weapons.drone.level > 0) {
        drones.forEach((dr, idx) => {
            let targetAngle = frameCount * 0.02 + idx * (Math.PI * 2 / weapons.drone.count);
            let tx = player.x + Math.cos(targetAngle) * 50;
            let ty = player.y + Math.sin(targetAngle) * 50;
            
            dr.x += (tx - dr.x) * 0.1;
            dr.y += (ty - dr.y) * 0.1;
            dr.cooldown--;
            
            if (dr.cooldown <= 0 && enemies.length > 0) {
                let closest = enemies.reduce((closest, e) => {
                    let dist = Math.hypot(e.x - dr.x, e.y - dr.y);
                    return (dist < closest.dist) ? {e, dist} : closest;
                }, {e: null, dist: 250}).e;
                
                if (closest) {
                    dr.cooldown = weapons.drone.cooldown;
                    projectiles.push({
                        x: dr.x, y: dr.y,
                        vx: ((closest.x - dr.x) / Math.hypot(closest.x - dr.x, closest.y - dr.y)) * 8,
                        vy: ((closest.y - dr.y) / Math.hypot(closest.x - dr.x, closest.y - dr.y)) * 8,
                        pierceLeft: 0,
                        hitEnemies: new Set(),
                        angle: Math.atan2(closest.y - dr.y, closest.x - dr.x),
                        isDroneLaser: true,
                        hitPlayer: false
                    });
                }
            }
        });
    }

    // -- Frost Nova --
    if (weapons.frostnova.level > 0 && frameCount % weapons.frostnova.cooldown === 0) {
        freezeWaves.push({
            x: player.x,
            y: player.y,
            radius: 10,
            maxRadius: weapons.frostnova.radius,
            duration: weapons.frostnova.duration
        });
        
        enemies.forEach(e => {
            if (Math.hypot(player.x - e.x, player.y - e.y) < weapons.frostnova.radius) {
                e.frozenTimer = weapons.frostnova.duration;
            }
        });
    }

    for (let i = freezeWaves.length - 1; i >= 0; i--) {
        let fw = freezeWaves[i];
        fw.radius += 8;
        if (fw.radius >= fw.maxRadius) {
            freezeWaves.splice(i, 1);
        }
    }

    // -- Chain Harpoon --
    if (weapons.harpoon.level > 0 && frameCount % weapons.harpoon.cooldown === 0 && enemies.length > 1) {
        let anchor = enemies[Math.floor(Math.random() * enemies.length)];
        let chainList = [anchor];
        
        let available = enemies.filter(e => e !== anchor);
        for (let c = 1; c < weapons.harpoon.count; c++) {
            if (available.length === 0) break;
            let last = chainList[chainList.length - 1];
            let nearestIdx = available.reduce((best, curr, idx) => {
                let dist = Math.hypot(curr.x - last.x, curr.y - last.y);
                return dist < best.dist ? {idx, dist} : best;
            }, {idx: -1, dist: Infinity}).idx;
            
            if (nearestIdx > -1) {
                chainList.push(available[nearestIdx]);
                available.splice(nearestIdx, 1);
            }
        }
        
        if (chainList.length > 1) {
            let avgX = chainList.reduce((sum, e) => sum + e.x, 0) / chainList.length;
            let avgY = chainList.reduce((sum, e) => sum + e.y, 0) / chainList.length;
            
            chainList.forEach(e => {
                e.x += (avgX - e.x) * 0.7;
                e.y += (avgY - e.y) * 0.7;
                applyDamage(e, weapons.harpoon.damage, "harpoon");
            });
            
            for (let i = 0; i < chainList.length - 1; i++) {
                harpoons.push({
                    x1: chainList[i].x,
                    y1: chainList[i].y,
                    x2: chainList[i + 1].x,
                    y2: chainList[i + 1].y,
                    life: 25
                });
            }
        }
    }

    for (let i = harpoons.length - 1; i >= 0; i--) {
        harpoons[i].life--;
        if (harpoons[i].life <= 0) harpoons.splice(i, 1);
    }

    // -- Gold Mine --
    if (weapons.goldmine.level > 0 && frameCount % weapons.goldmine.cooldown === 0) {
        goldMines.push({
            x: player.x + (Math.random() * 240 - 120),
            y: player.y + (Math.random() * 240 - 120),
            size: 14
        });
    }

    for (let i = goldMines.length - 1; i >= 0; i--) {
        let gm = goldMines[i];
        if (Math.hypot(player.x - gm.x, player.y - gm.y) < player.size + gm.size) {
            for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
                projectiles.push({
                    x: gm.x,
                    y: gm.y,
                    vx: Math.cos(angle) * 6,
                    vy: Math.sin(angle) * 6,
                    pierceLeft: weapons.goldmine.level > 1 ? 2 : 0,
                    hitEnemies: new Set(),
                    angle: angle,
                    isCoin: true,
                    damage: weapons.goldmine.damage,
                    hitPlayer: false
                });
            }
            
            for (let c = 0; c < 3; c++) {
                expGems.push({
                    x: gm.x + (Math.random() * 20 - 10),
                    y: gm.y + (Math.random() * 20 - 10),
                    val: DIFFICULTY.EXP_GEM_VALUE
                });
            }
            
            goldMines.splice(i, 1);
        }
    }

    // 4. Enemy Movement & Player Collision
    for (let i = enemies.length - 1; i >= 0; i--) {
        let e = enemies[i];
        
        // Frostbite chill & Frost Nova freeze logic
        let currentSpeed = e.speed;
        if (e.frozenTimer > 0) {
            currentSpeed = 0;
            e.frozenTimer--;
        } else if (e.chilledTimer > 0) {
            currentSpeed *= 0.5;
            e.chilledTimer--;
        }

        // Check if inside Time Warp bubble
        let timeSlow = 1.0;
        for (let tb of timeBubbles) {
            if (Math.hypot(e.x - tb.x, e.y - tb.y) < tb.radius) {
                timeSlow = 0.2; // 80% slow
                break;
            }
        }
        currentSpeed *= timeSlow;

        let angle = Math.atan2(player.y - e.y, player.x - e.x);
        
        // Custom movement based on type
        if (e.type === "charger") {
            e.stateTimer--;
            if (e.state === "follow") {
                e.x += Math.cos(angle) * currentSpeed;
                e.y += Math.sin(angle) * currentSpeed;
                if (e.stateTimer <= 0) {
                    e.state = "windup";
                    e.stateTimer = 45; 
                }
            } else if (e.state === "windup") {
                // Flash and stay still
                if (e.stateTimer <= 0) {
                    e.state = "charge";
                    e.stateTimer = 35; 
                    e.chargeAngle = angle; 
                }
            } else if (e.state === "charge") {
                e.x += Math.cos(e.chargeAngle) * (currentSpeed * 3.5);
                e.y += Math.sin(e.chargeAngle) * (currentSpeed * 3.5);
                if (e.stateTimer <= 0) {
                    e.state = "cooldown";
                    e.stateTimer = 60; 
                }
            } else if (e.state === "cooldown") {
                e.x += Math.cos(angle) * (currentSpeed * 0.25);
                e.y += Math.sin(angle) * (currentSpeed * 0.25);
                if (e.stateTimer <= 0) {
                    e.state = "follow";
                    e.stateTimer = 150 + Math.random() * 60;
                }
            }
        } else {
            // normal, mini, splitter, spiker follow player
            e.x += Math.cos(angle) * currentSpeed;
            e.y += Math.sin(angle) * currentSpeed;
            
            if (e.type === "spiker") {
                e.spikeTimer--;
                if (e.spikeTimer <= 0) {
                    e.spikeExtended = !e.spikeExtended;
                    e.spikeTimer = 125;
                }
            }
        }

        if (Math.hypot(player.x - e.x, player.y - e.y) < player.size + e.size) {
            // Kinetic Plating Logic
            if (passives.kinetic) {
                e.x -= Math.cos(angle) * 100;
                e.y -= Math.sin(angle) * 100;
                if (applyDamage(e, 25)) { enemies.splice(i, 1); continue; }
            }

            let contactDamage = DIFFICULTY.ENEMY_CONTACT_DAMAGE;
            if (e.type === "charger" && e.state === "charge") {
                contactDamage *= 2.5; 
            } else if (e.type === "spiker" && e.spikeExtended) {
                contactDamage *= 1.6;
            }

            player.hp -= contactDamage; 
            if (player.hp <= 0) gameOver();
        }
    }

    // 5. Blaster Projectiles
    for (let i = projectiles.length - 1; i >= 0; i--) {
        let p = projectiles[i];
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < 0 || p.x > canvas.width || p.y < 0 || p.y > canvas.height) { projectiles.splice(i, 1); continue; }

        if (p.hitPlayer) {
            if (Math.hypot(p.x - player.x, p.y - player.y) < player.size + 4) {
                player.hp -= 4; 
                projectiles.splice(i, 1);
                if (player.hp <= 0) gameOver();
                continue;
            }
        } else {
            for (let j = enemies.length - 1; j >= 0; j--) {
                let e = enemies[j];
                let hitRadius = (p.isCoin ? 8 : p.isDroneLaser ? 6 : weapons.blaster.size * 1.5) + e.size;
                if (!p.hitEnemies.has(e) && Math.hypot(p.x - e.x, p.y - e.y) < hitRadius) {
                    p.hitEnemies.add(e);
                    
                    if (e.type === "spiker" && e.spikeExtended && !p.isCoin && !p.isDroneLaser) {
                        p.vx *= -1.2;
                        p.vy *= -1.2;
                        p.hitPlayer = true;
                        p.hitEnemies.clear();
                        break; 
                    }

                    let dmg = p.isCoin ? (p.damage || 20) : (p.isDroneLaser ? weapons.drone.damage : weapons.blaster.damage);
                    if (applyDamage(e, dmg)) enemies.splice(j, 1);

                    if (p.pierceLeft > 0) { p.pierceLeft--; } 
                    else { projectiles.splice(i, 1); break; }
                }
            }
        }
    }

    // 6. Exp Gems & Magnetism
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

    // 7. Cleanup Visuals (Texts & Lightning)
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

    // 1. Draw Puddles and Fires
    puddles.forEach(p => {
        let fade = p.life / p.maxLife;
        ctx.save(); ctx.translate(p.x, p.y);
        
        if (p.isFire) {
            ctx.fillStyle = `rgba(255, 60, 0, ${0.4 * fade})`;
            ctx.beginPath(); ctx.arc(0, 0, p.radius, 0, Math.PI * 2); ctx.fill();
            
            ctx.fillStyle = `rgba(255, 180, 0, ${0.6 * fade})`;
            ctx.beginPath(); ctx.arc(0, 0, p.radius * 0.6, 0, Math.PI * 2); ctx.fill();
            
            ctx.fillStyle = `rgba(255, 255, 255, ${0.8 * fade})`;
            ctx.beginPath(); ctx.arc(0, 0, p.radius * 0.2, 0, Math.PI * 2); ctx.fill();
        } else {
            ctx.fillStyle = `rgba(50, 150, 0, ${0.4 * fade})`;
            ctx.beginPath(); ctx.arc(0, 0, weapons.ooze.radius, 0, Math.PI * 2); ctx.fill();
            
            ctx.strokeStyle = `rgba(100, 255, 50, ${0.6 * fade})`;
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(-2, -2, weapons.ooze.radius * 0.7, 0, Math.PI * 2); ctx.stroke();
            
            let bOffset = Math.sin(frameCount * 0.1) * 2;
            ctx.fillStyle = `rgba(150, 255, 100, ${0.8 * fade})`;
            ctx.beginPath(); ctx.arc(weapons.ooze.radius * 0.3, weapons.ooze.radius * 0.3 + bOffset, 4, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(-weapons.ooze.radius * 0.4, -weapons.ooze.radius * 0.2 - bOffset, 6, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
    });

    // 2. Draw Aura
    if (weapons.aura.level > 0) {
        ctx.fillStyle = `rgba(0, 200, 255, ${0.1 + Math.sin(frameCount * 0.1) * 0.05})`;
        ctx.beginPath(); ctx.arc(player.x, player.y, weapons.aura.radius, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(0, 200, 255, 0.3)';
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    // Draw Vortex Barriers
    if (weapons.vortex.level > 0) {
        vortexBarriers.forEach(vb => {
            ctx.save();
            ctx.translate(vb.x, vb.y);
            ctx.rotate(vb.angle + Math.PI / 2);
            ctx.fillStyle = 'rgba(0, 255, 100, 0.4)';
            ctx.fillRect(-15, -4, 30, 8);
            ctx.strokeStyle = '#00ff66';
            ctx.lineWidth = 2;
            ctx.strokeRect(-15, -4, 30, 8);
            ctx.fillStyle = '#ffffff';
            ctx.beginPath(); ctx.arc(-12, 0, 2, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(12, 0, 2, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = 'rgba(0, 255, 100, 0.8)';
            ctx.beginPath();
            ctx.moveTo(-10, -8 + Math.sin(frameCount * 0.2) * 2);
            ctx.lineTo(10, -8 + Math.sin(frameCount * 0.2) * 2);
            ctx.stroke();
            ctx.restore();
        });
    }

    // Draw Black Holes
    blackholes.forEach(bh => {
        let progress = bh.life / bh.maxLife;
        ctx.save();
        ctx.translate(bh.x, bh.y);
        ctx.rotate(-frameCount * 0.05); 
        
        ctx.fillStyle = `rgba(100, 0, 150, ${0.15 * progress})`;
        ctx.beginPath(); ctx.arc(0, 0, bh.radius * 2, 0, Math.PI * 2); ctx.fill();
        
        let grad = ctx.createRadialGradient(0, 0, 5, 0, 0, bh.radius);
        grad.addColorStop(0, 'rgba(0, 0, 0, 1)');
        grad.addColorStop(0.3, 'rgba(128, 0, 255, 0.8)');
        grad.addColorStop(1, 'rgba(0, 255, 255, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(0, 0, bh.radius, 0, Math.PI * 2); ctx.fill();
        
        ctx.fillStyle = `rgba(0, 0, 0, ${progress})`;
        ctx.beginPath(); ctx.arc(0, 0, bh.radius * 0.35, 0, Math.PI * 2); ctx.fill();
        
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-bh.radius * 0.8, 0); ctx.lineTo(bh.radius * 0.8, 0);
        ctx.stroke();
        
        ctx.restore();
    });

    // Draw Pylons
    pylons.forEach(py => {
        ctx.save();
        ctx.translate(py.x, py.y);
        ctx.fillStyle = '#666';
        ctx.beginPath();
        ctx.moveTo(-10, 15); ctx.lineTo(10, 15); ctx.lineTo(0, -15);
        ctx.closePath(); ctx.fill();
        
        ctx.fillStyle = '#999';
        ctx.fillRect(-6, -2, 12, 4);
        ctx.fillRect(-4, 4, 8, 4);
        
        ctx.fillStyle = (frameCount % 20 < 10) ? '#00ffff' : '#0088ff';
        ctx.beginPath(); ctx.arc(0, -15, 6, 0, Math.PI * 2); ctx.fill();
        
        ctx.strokeStyle = 'rgba(0, 255, 255, 0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(0, -15, 10 + (frameCount % 15), 0, Math.PI * 2);
        ctx.stroke();
        
        ctx.restore();
    });

    // Draw Time Warp Bubbles
    timeBubbles.forEach(tb => {
        let progress = tb.life / tb.maxLife;
        ctx.save();
        ctx.translate(tb.x, tb.y);
        
        ctx.fillStyle = `rgba(0, 200, 255, ${0.08 * progress})`;
        ctx.beginPath(); ctx.arc(0, 0, tb.radius, 0, Math.PI * 2); ctx.fill();
        
        ctx.strokeStyle = `rgba(0, 255, 255, ${0.4 * progress})`;
        ctx.setLineDash([5, 5]);
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, tb.radius, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
        
        ctx.strokeStyle = `rgba(0, 200, 255, ${0.3 * progress})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        let handAngle = (frameCount * 0.02) % (Math.PI * 2);
        ctx.lineTo(Math.cos(handAngle) * (tb.radius * 0.8), Math.sin(handAngle) * (tb.radius * 0.8));
        ctx.stroke();
        
        ctx.fillStyle = '#00ffff';
        ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fill();
        
        ctx.restore();
    });

    // Draw Meteors
    meteors.forEach(m => {
        ctx.save();
        
        ctx.strokeStyle = `rgba(255, 0, 0, ${0.5 * m.progress})`;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(m.tx, m.ty, m.radius * (1 - m.progress), 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(m.tx - 10, m.ty); ctx.lineTo(m.tx + 10, m.ty); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(m.tx, m.ty - 10); ctx.lineTo(m.tx, m.ty + 10); ctx.stroke();
        
        ctx.translate(m.x, m.y);
        ctx.rotate(Math.PI / 4 + frameCount * 0.1);
        
        let grad = ctx.createLinearGradient(0, 0, 30, 30);
        grad.addColorStop(0, 'rgba(255, 100, 0, 0.8)');
        grad.addColorStop(1, 'rgba(255, 0, 0, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 35, 35);
        
        ctx.fillStyle = '#555';
        ctx.beginPath();
        ctx.moveTo(-15, 0); ctx.lineTo(-10, -12); ctx.lineTo(12, -8); ctx.lineTo(15, 5); ctx.lineTo(0, 15);
        ctx.closePath(); ctx.fill();
        
        ctx.fillStyle = '#ff3300';
        ctx.beginPath(); ctx.arc(-2, -2, 4, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(4, 4, 2, 0, Math.PI * 2); ctx.fill();
        
        ctx.restore();
    });

    // Draw Beam Lasers
    lasers.forEach(las => {
        let progress = las.life / las.maxLife;
        ctx.save();
        ctx.strokeStyle = `rgba(255, 0, 100, ${0.8 * progress})`;
        ctx.shadowColor = '#ff00ff';
        ctx.shadowBlur = 10;
        ctx.lineWidth = 8;
        
        ctx.beginPath();
        ctx.moveTo(player.x, player.y);
        ctx.lineTo(player.x + Math.cos(las.angle) * 800, player.y + Math.sin(las.angle) * 800);
        ctx.stroke();
        
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(player.x, player.y);
        ctx.lineTo(player.x + Math.cos(las.angle) * 800, player.y + Math.sin(las.angle) * 800);
        ctx.stroke();
        
        ctx.shadowBlur = 0;
        ctx.restore();
    });

    // Draw Drones
    if (weapons.drone.level > 0) {
        drones.forEach(dr => {
            ctx.save();
            ctx.translate(dr.x, dr.y);
            ctx.rotate(frameCount * 0.05);
            
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            for (let i = 0; i < 6; i++) {
                let angle = i * Math.PI / 3;
                let x = Math.cos(angle) * 6;
                let y = Math.sin(angle) * 6;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.closePath(); ctx.fill();
            
            ctx.fillStyle = '#00ff00';
            ctx.beginPath(); ctx.arc(0, 0, 2, 0, Math.PI * 2); ctx.fill();
            
            ctx.strokeStyle = '#aaa';
            ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(-6, -4); ctx.lineTo(-10, -2); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(-6, 4); ctx.lineTo(-10, 2); ctx.stroke();
            
            ctx.restore();
        });
    }

    // Draw Freeze Waves
    freezeWaves.forEach(fw => {
        let progress = fw.radius / fw.maxRadius;
        ctx.save();
        ctx.strokeStyle = `rgba(0, 200, 255, ${0.8 * (1 - progress)})`;
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(fw.x, fw.y, fw.radius, 0, Math.PI * 2); ctx.stroke();
        
        ctx.strokeStyle = `rgba(255, 255, 255, ${0.5 * (1 - progress)})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(fw.x, fw.y, fw.radius * 0.8, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
    });

    // Draw Harpoon Chains
    harpoons.forEach(h => {
        ctx.save();
        ctx.strokeStyle = `rgba(200, 200, 200, ${h.life / 25})`;
        ctx.lineWidth = 3;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(h.x1, h.y1);
        ctx.lineTo(h.x2, h.y2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
    });

    // Draw Gold Mines
    goldMines.forEach(gm => {
        ctx.save();
        ctx.translate(gm.x, gm.y);
        
        ctx.fillStyle = '#8B4513'; 
        ctx.fillRect(-10, -6, 20, 14);
        
        ctx.fillStyle = '#A0522D'; 
        ctx.beginPath(); ctx.arc(0, -6, 10, Math.PI, 0); ctx.fill();
        
        ctx.fillStyle = '#FFD700'; 
        ctx.fillRect(-2, -2, 4, 4);
        ctx.fillRect(-8, -6, 2, 14);
        ctx.fillRect(6, -6, 2, 14);
        
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.beginPath();
        let pulse = Math.sin(frameCount * 0.15) * 6;
        ctx.moveTo(0, -10 - pulse); ctx.lineTo(0, -10 + pulse);
        ctx.moveTo(-pulse, -10); ctx.lineTo(pulse, -10);
        ctx.stroke();
        
        ctx.restore();
    });

    // 3. Draw EXP Gems (4 Shapes)
    expGems.forEach(g => {
        ctx.save(); ctx.translate(g.x, g.y);
        ctx.fillStyle = '#118811'; ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(6, 0); ctx.lineTo(0, 6); ctx.lineTo(-6, 0); ctx.fill();
        ctx.fillStyle = '#44ff44'; ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(4, 0); ctx.lineTo(0, 4); ctx.lineTo(-4, 0); ctx.fill();
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(0, -2, 1.5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#003300'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(0, 6); ctx.lineTo(6, 0); ctx.stroke();
        ctx.restore();
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

    // 5. Draw Orbitals (4 Shapes)
    if (weapons.orbitals.level > 0) {
        for (let i = 0; i < weapons.orbitals.count; i++) {
            const angle = weapons.orbitals.angle + (i * (Math.PI * 2 / weapons.orbitals.count));
            const ox = player.x + Math.cos(angle) * weapons.orbitals.radius;
            const oy = player.y + Math.sin(angle) * weapons.orbitals.radius;
            
            ctx.save(); ctx.translate(ox, oy); ctx.rotate(weapons.orbitals.angle * 3);
            ctx.fillStyle = 'rgba(200, 200, 200, 0.4)'; ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#aaaaff';
            ctx.beginPath(); ctx.moveTo(-10, -2); ctx.lineTo(10, 0); ctx.lineTo(-10, 2); ctx.fill();
            ctx.beginPath(); ctx.moveTo(-2, -10); ctx.lineTo(0, 10); ctx.lineTo(2, -10); ctx.fill();
            ctx.restore();
        }
    }

    // 6. Draw Glaives (4 Shapes)
    glaives.forEach(g => {
        ctx.save(); ctx.translate(g.x, g.y); ctx.rotate(frameCount * 0.2);
        ctx.fillStyle = '#444'; ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#00ffff'; ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#eee';
        ctx.beginPath(); ctx.moveTo(-12, 0); ctx.lineTo(-24, -10); ctx.lineTo(-8, -8); ctx.fill(); 
        ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(24, 10); ctx.lineTo(8, 8); ctx.fill();    
        ctx.restore();
    });

    // 7. Draw Enemies - Changes colors dynamically by type
    enemies.forEach(e => {
        ctx.save(); ctx.translate(e.x, e.y);
        
        let bodyColor = e.chilledTimer > 0 ? '#4488cc' : '#aa2222'; 
        if (e.frozenTimer > 0) bodyColor = '#88ddff'; 
        
        if (e.type === "splitter") {
            ctx.fillStyle = e.frozenTimer > 0 ? '#88ddff' : (e.chilledTimer > 0 ? '#6688cc' : '#9933ff');
            ctx.beginPath();
            let wobble = Math.sin(frameCount * 0.1 + e.x) * 2;
            ctx.arc(0, wobble, e.size, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.beginPath(); ctx.arc(-2, wobble - 2, 4, 0, Math.PI * 2); ctx.fill();
            
            ctx.fillStyle = '#000000';
            ctx.beginPath(); ctx.arc(2, wobble + 1, 2, 0, Math.PI * 2); ctx.fill();
        } else if (e.type === "mini") {
            ctx.fillStyle = e.frozenTimer > 0 ? '#88ddff' : (e.chilledTimer > 0 ? '#5577aa' : '#bb55ff');
            ctx.beginPath();
            ctx.arc(0, 0, e.size, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.fillStyle = '#000';
            ctx.beginPath(); ctx.arc(1, 0, 1.5, 0, Math.PI * 2); ctx.fill();
        } else if (e.type === "charger") {
            ctx.rotate(Math.atan2(player.y - e.y, player.x - e.x));
            ctx.fillStyle = e.frozenTimer > 0 ? '#88ddff' : (e.chilledTimer > 0 ? '#5588bb' : '#ff6600');
            ctx.beginPath();
            ctx.moveTo(e.size, 0);
            ctx.lineTo(-e.size, -e.size * 0.8);
            ctx.lineTo(-e.size, e.size * 0.8);
            ctx.closePath();
            ctx.fill();
            
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(e.size, -2); ctx.lineTo(e.size + 6, -6);
            ctx.moveTo(e.size, 2); ctx.lineTo(e.size + 6, 6);
            ctx.stroke();
            
            ctx.fillStyle = '#333';
            ctx.fillRect(-e.size * 0.4, -e.size * 0.4, 4, e.size * 0.8);
            
            if (e.state === "charge") {
                ctx.fillStyle = (frameCount % 6 < 3) ? '#ff0000' : '#ffff00';
                ctx.beginPath();
                ctx.moveTo(-e.size, 0);
                ctx.lineTo(-e.size - 12, -6);
                ctx.lineTo(-e.size - 12, 6);
                ctx.closePath(); ctx.fill();
            } else if (e.state === "windup") {
                if (frameCount % 10 < 5) {
                    ctx.fillStyle = 'rgba(255, 0, 0, 0.4)';
                    ctx.beginPath(); ctx.arc(0, 0, e.size * 1.5, 0, Math.PI * 2); ctx.fill();
                }
            }
        } else if (e.type === "spiker") {
            ctx.fillStyle = e.frozenTimer > 0 ? '#88ddff' : (e.chilledTimer > 0 ? '#447788' : '#778899');
            ctx.beginPath(); ctx.arc(0, 0, e.size, 0, Math.PI * 2); ctx.fill();
            
            let spikeLen = e.spikeExtended ? 8 : 2;
            ctx.strokeStyle = e.spikeExtended ? '#ff3388' : '#bbbbbb';
            ctx.lineWidth = 2;
            for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
                ctx.beginPath();
                ctx.moveTo(Math.cos(angle) * e.size, Math.sin(angle) * e.size);
                ctx.lineTo(Math.cos(angle) * (e.size + spikeLen), Math.sin(angle) * (e.size + spikeLen));
                ctx.stroke();
            }
            
            ctx.fillStyle = e.spikeExtended ? '#ff0055' : '#444';
            ctx.beginPath(); ctx.arc(0, 0, e.size * 0.4, 0, Math.PI * 2); ctx.fill();
        } else {
            ctx.fillStyle = bodyColor; ctx.beginPath(); ctx.arc(0, 0, e.size, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#ffaaaa'; ctx.fillRect(-e.size * 0.5, -e.size * 0.4, e.size * 0.3, e.size * 0.3); ctx.fillRect(e.size * 0.2, -e.size * 0.4, e.size * 0.3, e.size * 0.3); 
            ctx.fillStyle = '#330000'; ctx.fillRect(-e.size * 0.6, e.size * 0.2, e.size * 1.2, e.size * 0.4);
            ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1; ctx.beginPath();
            ctx.moveTo(-e.size * 0.5, e.size * 0.2); ctx.lineTo(-e.size * 0.2, e.size * 0.5); ctx.lineTo(0, e.size * 0.2); ctx.lineTo(e.size * 0.2, e.size * 0.5); ctx.lineTo(e.size * 0.5, e.size * 0.2); ctx.stroke();
        }
        ctx.restore();
    });

    // 8. Draw Projectiles
    projectiles.forEach(p => {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.angle); 
        if (p.isDroneLaser) {
            ctx.fillStyle = 'rgba(0, 255, 0, 0.4)'; ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(0, 0, 2, 0, Math.PI * 2); ctx.fill();
        } else if (p.isCoin) {
            ctx.fillStyle = 'rgba(255, 215, 0, 0.6)'; ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#ffff00'; ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fill();
        } else {
            ctx.fillStyle = 'rgba(255, 255, 0, 0.4)'; ctx.beginPath(); ctx.arc(0, 0, weapons.blaster.size * 1.5, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(0, 0, weapons.blaster.size * 0.7, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = '#ffff00'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(-weapons.blaster.size * 2, 0); ctx.lineTo(weapons.blaster.size * 2, 0); ctx.stroke(); 
            ctx.beginPath(); ctx.moveTo(0, -weapons.blaster.size * 2); ctx.lineTo(0, weapons.blaster.size * 2); ctx.stroke(); 
        }
        ctx.restore();
    });

    // 9. Draw Lightning Strikes
    lightningStrikes.forEach(ls => {
        if (ls.isTesla) {
            ctx.strokeStyle = `rgba(100, 200, 255, ${ls.alpha})`;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(ls.x, ls.y);
            let segments = 5;
            for (let i = 1; i <= segments; i++) {
                let t = i / segments;
                let targetX = ls.x + (ls.tx - ls.x) * t;
                let targetY = ls.y + (ls.ty - ls.y) * t;
                if (i < segments) {
                    targetX += (Math.random() * 20 - 10);
                    targetY += (Math.random() * 20 - 10);
                }
                ctx.lineTo(targetX, targetY);
            }
            ctx.stroke();
        } else {
            ctx.strokeStyle = `rgba(200, 255, 255, ${ls.alpha})`;
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(ls.x + (Math.random()*40-20), ls.y - 400); 
            ctx.lineTo(ls.x + (Math.random()*20-10), ls.y - 200);
            ctx.lineTo(ls.x, ls.y);
            ctx.stroke();
            
            ctx.fillStyle = `rgba(255, 255, 255, ${ls.alpha})`;
            ctx.beginPath(); ctx.arc(ls.x, ls.y, 15, 0, Math.PI*2); ctx.fill();
        }
    });

    // 10. Draw Damage Texts
    ctx.font = 'bold 14px monospace';
    damageTexts.forEach(dt => {
        ctx.fillStyle = dt.type === "cull" ? `rgba(255, 50, 255, ${dt.alpha})` : `rgba(255, 255, 255, ${dt.alpha})`;
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