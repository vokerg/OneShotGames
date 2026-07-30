export const COMBAT_STANCES = Object.freeze({
  RETURN_FIRE: 'returnFire',
  HOLD_FIRE: 'holdFire',
  FIRE_AT_WILL: 'fireAtWill',
  DEFENSIVE: 'defensive',
  AGGRESSIVE: 'aggressive',
  HOLD_POSITION: 'holdPosition',
});

export const DEFAULT_COMBAT_STANCE = COMBAT_STANCES.FIRE_AT_WILL;

export const COMBAT_STANCE_VALUES = Object.freeze(Object.values(COMBAT_STANCES));
