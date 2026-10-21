import { tPlural } from '@starhold/i18n';
import type { Locale, Translate } from '@starhold/i18n';
import type { GameEvent, PlayerView } from '@starhold/engine';
import { bagText, playerName, resourceName, sectorLabel } from './format.ts';

export type BattleEvent = Extract<GameEvent, { type: 'battle' }>;
export type BattleVariant = 'conquered' | 'won' | 'lost';

/** Which battle message fits: conquered if the sector fell, else won if the defence lost more. */
export function battleVariant(event: BattleEvent): BattleVariant {
  if (event.conquered) return 'conquered';
  return event.defenderLosses > event.attackerLosses ? 'won' : 'lost';
}

/** A one-line, localised description of any game event. */
export function eventText(
  event: GameEvent,
  view: PlayerView,
  t: Translate,
  locale: Locale,
): string {
  const name = (id: string) => playerName(view, id);
  const sector = (id: string) => sectorLabel(view, id, t);

  switch (event.type) {
    case 'turnStarted':
      return t('event.turnStarted', { player: name(event.player), round: event.round });
    case 'homeBonus':
      return t('event.homeBonus', {
        player: name(event.player),
        resource: resourceName(event.resource, t),
      });
    case 'diceRolled': {
      const [a, b] = event.dice;
      return t('event.diceRolled', { player: name(event.player), dice: `${a} + ${b} = ${a + b}` });
    }
    case 'produced': {
      const lines = Object.entries(event.gains)
        .map(([id, gains]) => ({ id, text: bagText(gains, t) }))
        .filter((line) => line.text !== '')
        .map((line) => t('event.produced', { player: name(line.id), resources: line.text }));
      return lines.length === 0 ? t('event.producedNothing') : lines.join('; ');
    }
    case 'discarded':
      return tPlural(t, locale, 'event.discarded', event.count, { player: name(event.player) });
    case 'pirateMoved':
      return t('event.pirateMoved', { player: name(event.player), sector: sector(event.to) });
    case 'stolen': {
      const params = { thief: name(event.thief), victim: name(event.victim) };
      return event.resource === null
        ? t('event.stolen.hidden', params)
        : t('event.stolen.known', { ...params, resource: resourceName(event.resource, t) });
    }
    case 'bankTraded':
      return t('event.bankTraded', {
        player: name(event.player),
        giveCount: event.giveCount,
        give: resourceName(event.give, t),
        get: resourceName(event.get, t),
      });
    case 'tradeOffered':
      return t('event.tradeOffered', {
        player: name(event.offer.from),
        give: bagText(event.offer.give, t),
        want: bagText(event.offer.want, t),
      });
    case 'tradeResponded':
      return t(event.accept ? 'event.tradeResponded.accept' : 'event.tradeResponded.decline', {
        player: name(event.player),
      });
    case 'traded':
      return t('event.traded', {
        a: name(event.a),
        b: name(event.b),
        aGave: bagText(event.aGave, t),
        bGave: bagText(event.bGave, t),
      });
    case 'tradeCancelled':
      return t('event.tradeCancelled');
    case 'built':
      return t(`event.built.${event.what}`, {
        player: name(event.player),
        sector: sector(event.at),
      });
    case 'expanded':
      return tPlural(t, locale, 'event.expanded', event.count, {
        player: name(event.player),
        from: sector(event.from),
        to: sector(event.to),
      });
    case 'fortified':
      return tPlural(t, locale, 'event.fortified', event.count, {
        player: name(event.player),
        from: sector(event.from),
        to: sector(event.to),
      });
    case 'battle':
      return t(`event.battle.${battleVariant(event)}`, {
        attacker: name(event.attacker),
        defender: name(event.defender),
        to: sector(event.to),
        attackRoll: event.attackRoll.join(', '),
        defendRoll: event.defendRoll.join(', '),
        attackerLosses: event.attackerLosses,
        defenderLosses: event.defenderLosses,
      });
    case 'awardChanged': {
      const outcome = event.player === null ? 'lost' : 'gained';
      return t(`event.awardChanged.${event.award}.${outcome}`, {
        player: event.player === null ? '' : name(event.player),
      });
    }
    case 'gameOver':
      return t(`event.gameOver.${event.reason}`, { player: name(event.winner) });
  }
}
