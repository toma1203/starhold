export interface BattleLosses {
  attackerLosses: number;
  defenderLosses: number;
}

const descending = (a: number, b: number): number => b - a;

/**
 * Pure dice resolution. Both sides are sorted high to low and compared pairwise for as many
 * pairs as the shorter side has; the attacker wins a pair only by rolling strictly higher, so
 * ties go to the defender. A starbase defender adds 1 to its single highest die. The inputs
 * are never modified.
 */
export function resolveBattle(
  attack: readonly number[],
  defend: readonly number[],
  defenderBonus: boolean,
): BattleLosses {
  const attackDice = [...attack].sort(descending);
  const defendDice = [...defend].sort(descending);
  if (defenderBonus && defendDice.length > 0) defendDice[0] = (defendDice[0] as number) + 1;
  let attackerLosses = 0;
  let defenderLosses = 0;
  for (let i = 0; i < Math.min(attackDice.length, defendDice.length); i++) {
    if ((attackDice[i] as number) > (defendDice[i] as number)) defenderLosses += 1;
    else attackerLosses += 1;
  }
  return { attackerLosses, defenderLosses };
}
