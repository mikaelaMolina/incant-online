import type { EnemySpec } from '../schemas/enemySpec';

export type AttackKind = 'strike' | 'projectile' | 'slam';

/** How an archetype fights. EnemySpec supplies the numbers (hp, speed, damage…); this supplies the style. */
export interface ArchetypeProfile {
  label: string;
  attack: AttackKind;
  /** Distance at which the enemy starts an attack. */
  attackRange: number;
  /** Ranged enemies back away when the Incanter is closer than this. */
  keepAway: number;
  /** Telegraph time before the hit lands, then recovery. */
  windup: number;
  recovery: number;
  cooldown: number;
  /** strike: arc half-angle (rad) and reach. slam: radius around the impact point. */
  arcHalfAngle: number;
  reach: number;
  slamRadius: number;
  projectileSpeed: number;
  knockback: number;
  /** 0 = full knockback when hit, 1 = immovable. */
  poise: number;
  height: number;
  radius: number;
  fleeDuration: number;
  /** Telegraph / health bar accent. */
  color: string;
  /** Preferred animation clip names, most preferred first (case-insensitive regex). */
  clips: { attack: string[]; move: string[] };
}

export const ARCHETYPES: Record<EnemySpec['archetype'], ArchetypeProfile> = {
  melee: {
    label: 'melee',
    attack: 'strike',
    attackRange: 1.9,
    keepAway: 0,
    windup: 0.45,
    recovery: 0.45,
    cooldown: 1.2,
    arcHalfAngle: (55 * Math.PI) / 180,
    reach: 2.3,
    slamRadius: 0,
    projectileSpeed: 0,
    knockback: 4,
    poise: 0,
    height: 1.75,
    radius: 0.4,
    fleeDuration: 3,
    color: '#ff5a4a',
    clips: { attack: ['sword_attack$', 'dagger_attack$', 'sword_attackfast', '^bite_inplace$', 'bite_front', 'punch'], move: ['run_weapon', 'run', '^walk$', 'flying'] },
  },
  ranged: {
    label: 'ranged',
    attack: 'projectile',
    attackRange: 13,
    keepAway: 6,
    windup: 0.7,
    recovery: 0.5,
    cooldown: 2.2,
    arcHalfAngle: 0,
    reach: 0,
    slamRadius: 0,
    projectileSpeed: 11,
    knockback: 2,
    poise: 0,
    height: 1.7,
    radius: 0.38,
    fleeDuration: 3.5,
    color: '#ffb340',
    clips: { attack: ['bow_shoot', 'spell1', 'staff_attack', '^bite_inplace$', 'bite_front', '^yes$', 'punch'], move: ['run_weapon', 'run', '^walk$', 'flying'] },
  },
  tank: {
    label: 'tank',
    attack: 'slam',
    attackRange: 2.6,
    keepAway: 0,
    windup: 1.0,
    recovery: 0.8,
    cooldown: 2.4,
    arcHalfAngle: 0,
    reach: 1.6,
    slamRadius: 2.6,
    projectileSpeed: 0,
    knockback: 9,
    poise: 0.85,
    height: 2.4,
    radius: 0.6,
    fleeDuration: 2,
    color: '#b07cff',
    clips: { attack: ['sword_attack$', '^bite_inplace$', 'bite_front', 'punch'], move: ['walk', 'run', 'flying'] },
  },
  // Bosses fight like tanks for now; phases arrive with the boss task.
  boss: {
    label: 'boss',
    attack: 'slam',
    attackRange: 3,
    keepAway: 0,
    windup: 0.9,
    recovery: 0.7,
    cooldown: 2,
    arcHalfAngle: 0,
    reach: 2,
    slamRadius: 3.4,
    projectileSpeed: 0,
    knockback: 11,
    poise: 0.95,
    height: 3.2,
    radius: 0.8,
    fleeDuration: 0,
    color: '#ff3d7f',
    clips: { attack: ['sword_attack$', '^bite_inplace$', 'bite_front', 'punch'], move: ['walk', 'run', 'flying'] },
  },
};
