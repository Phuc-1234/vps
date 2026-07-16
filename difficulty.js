// Game Difficulty Constants
const DIFFICULTY = {
    // Enemy HP Scaling
    BASE_ENEMY_HP: 10,
    ENEMY_HP_SCALING: 2,
    ENEMY_HP_EXPONENT: 2,

    // Enemy Speed Scaling
    BASE_ENEMY_SPEED: 0.5,
    ENEMY_SPEED_SCALING: 0.1,
    ENEMY_SPEED_RANDOM: 0.4,

    // Enemy Spawning Rate (in frames: 60 frames = 1 second)
    BASE_SPAWN_RATE: 40,       // Starting spawn interval (lower = faster spawn)
    MIN_SPAWN_RATE: 3,         // Maximum spawn speed limit
    SPAWN_RATE_DIVISOR: 220,   // Rate of difficulty ramping (lower = ramps faster)
    SPAWN_RATE_EXPONENT: 1.07,  // Ramping curve exponent

    // Player Combat/Survival Parameters
    ENEMY_CONTACT_DAMAGE: 0.3, // Damage taken per frame of contact with enemy

    // Player Experience Parameters
    BASE_EXP_REQUIRED: 10,
    EXP_SCALING_FACTOR: 1.2,
    EXP_GEM_VALUE: 2
};
