/**
 * English source dictionary. Flat dotted keys; `hr.ts` must provide every key (compile error otherwise).
 *
 * Placeholders are `{name}`. Names/lists/sectors are passed in already formatted by the client.
 * Messages that mention a resource never decline it (Croatian grammar): the resource is shown
 * after a colon or an arrow, or in a preformatted list.
 *
 * Counted messages come in `.one` / `.few` / `.other` triples for use with `plural()`:
 * `plural(locale, n, { one: t(`${k}.one`, p), few: t(`${k}.few`, p), other: t(`${k}.other`, p) })`.
 * English has no "few" form, so `.few` repeats `.other`.
 */
export const en = {
  // Engine errors (ErrorCode)
  'err.notYourTurn': "It's not your turn.",
  'err.wrongPhase': "You can't do that right now.",
  'err.insufficientResources': 'Not enough resources.',
  'err.invalidSector': "That sector can't be used for this action.",
  'err.notOwned': "You don't own that sector.",
  'err.notAdjacent': 'The sectors must be next to each other.',
  'err.notConnected': 'The sectors must be linked through your own territory.',
  'err.invalidCount': 'Invalid number of fleets.',
  'err.invalidDice': 'Invalid number of dice.',
  'err.homeProtected': 'Home systems are protected.',
  'err.noOffer': 'There is no open trade offer.',
  'err.invalidTrade': "That trade isn't valid.",
  'err.gameOver': 'The game is over.',

  // Room errors (RoomErrorCode)
  'err.roomNotFound': 'Room not found. It may have expired.',
  'err.roomFull': 'This room is full.',
  'err.gameStarted': 'The game has already started.',
  'err.notHost': 'Only the host can do that.',
  'err.badRequest': 'Invalid request.',
  'err.rateLimited': 'Slow down, too many requests.',
  'err.serverFull': 'The server is full. Please try again later.',
  'err.notEnoughPlayers': 'At least 2 players are needed to start.',
  'err.offline': "You're offline — check your connection.",

  // Room closed (room:closed reasons)
  'room.closed.expired': 'This room expired.',
  'room.closed.serverRestart': 'The server is restarting. Please reconnect in a moment.',
  'room.closed.replaced': 'This game was opened in another tab or device.',

  // Home screen
  'home.title': 'Starhold',
  'home.tagline': 'Build, trade and conquer the galaxy.',
  'home.nickname': 'Nickname',
  'home.create': 'Create room',
  'home.join': 'Join room',
  'home.code': 'Room code',

  // Lobby
  'lobby.room': 'Room {code}',
  'lobby.players': 'Players',
  'lobby.copyLink': 'Copy invite link',
  'lobby.linkCopied': 'Link copied',
  'lobby.addBot': 'Add bot',
  'lobby.botEasy': 'Easy',
  'lobby.botNormal': 'Normal',
  'lobby.remove': 'Remove',
  'lobby.start': 'Start game',
  'lobby.waiting': 'Waiting for the host to start the game…',
  'lobby.settingsTarget': 'Victory points to win',
  'lobby.settingsTimer': 'Turn timer',
  'lobby.host': 'Host',
  'lobby.you': 'You',
  'lobby.needPlayers': 'At least 2 players are needed.',
  'lobby.leave': 'Leave room',
  'lobby.inviteLink': 'Invite link',

  // Game screen
  'game.phase.homeBonus': 'Home bonus',
  'game.phase.roll': 'Roll',
  'game.phase.discard': 'Discard',
  'game.phase.pirate': 'Pirates',
  'game.phase.main': 'Main phase',
  'game.phase.finished': 'Game over',
  'game.round': 'Round {round}',
  'game.roll': 'Roll dice',
  'game.endTurn': 'End turn',
  'game.build': 'Build',
  'game.buildFleet': 'Build fleet',
  'game.buildColony': 'Build colony',
  'game.buildStarbase': 'Build starbase',
  'game.bankTrade': 'Trade with bank',
  'game.offerTrade': 'Offer trade',
  'game.give': 'You give',
  'game.want': 'You want',
  'game.rate': 'Rate {rate}:1',
  'game.accept': 'Accept',
  'game.decline': 'Decline',
  'game.confirm': 'Confirm',
  'game.cancel': 'Cancel',
  'game.attack': 'Attack',
  'game.expand': 'Expand',
  'game.fortify': 'Fortify',
  'game.dice': 'Dice',
  'game.moveCount': 'Fleets to move',
  'game.discardTitle': 'Discard cards',
  'game.discardHint': 'You hold too many cards. Choose the cards to discard (needed: {count}).',
  'game.pirateHint':
    'Move the pirate ship to another sector that is not a home system, then steal a random card from its owner.',
  'game.homeBonusTitle': 'Home system bonus: choose a resource',
  'game.yourTurn': 'Your turn',
  'game.waitingFor': 'Waiting for {player}…',
  'game.timerValue': 'Time left: {seconds} s',
  'game.afk': 'Away (a bot is playing)',
  'game.disconnected': 'Disconnected',
  'game.reconnecting': 'Reconnecting…',
  'game.loading': 'Loading…',
  'game.vp': 'Victory points',
  'game.cards': 'Cards',
  'game.fleets': 'Fleets',
  'game.largestEmpire': 'Largest Empire',
  'game.warlord': 'Warlord',

  // Game screen: panels, actions and dialogs
  'game.actions': 'Actions',
  'game.players': 'Players',
  'game.log': 'Log',
  'game.logEmpty': 'Nothing has happened yet.',
  'game.lastRoll': 'Last roll: {dice}',
  'game.selectHint': 'Select one of your sectors to build, or pick a destination on the map.',
  'game.reason.colonySite': 'Needs a claimed sector without a colony (not a home system).',
  'game.reason.starbaseSite': 'Needs a colony to upgrade.',
  'game.chooseAction': 'What do you want to do?',
  'game.route': '{from} → {to}',
  'game.fortifyEnds': 'Fortifying ends your turn.',
  'game.more': 'More: {resource}',
  'game.less': 'Fewer: {resource}',
  'game.discardChosen': 'Selected {chosen} of {count}',
  'game.trade.title': 'Trade',
  'game.trade.players': 'With players',
  'game.trade.send': 'Send offer',
  'game.offer.incoming': '{player} offers you {give} for {want}',
  'game.offer.yours': 'Your offer: {give} for {want}',
  'game.offer.accepted': 'accepted',
  'game.offer.declined': 'declined',
  'game.offer.pending': 'waiting',
  'game.offer.status': '{player}: {status}',
  'game.offer.tradeWith': 'Trade with {player}',
  'game.offer.withdraw': 'Withdraw offer',
  'game.offer.youAccepted': 'You accepted. Waiting for the offerer to confirm…',
  'game.offer.youDeclined': 'You declined this offer.',
  'game.offer.cannotAfford': "You can't afford this offer.",
  'game.attack.captureChance': 'Chance to capture: {percent}%',
  'game.attack.roundChance': 'Chance to win one round: {percent}%',
  'game.attack.moveOnConquest': 'Fleets to move in if you conquer',
  'game.attack.waiting': 'Waiting for the result…',
  'game.attack.attackerDice': 'Attacker dice',
  'game.attack.defenderDice': 'Defender dice',
  'game.attack.losses': 'Fleets lost, attacker / defender: {attackerLosses} / {defenderLosses}',
  'game.attack.result.conquered': 'Sector conquered!',
  'game.attack.result.won': 'You won the fight. The sector holds.',
  'game.attack.result.lost': 'The defence held.',
  'game.attack.again': 'Attack again',

  // Event log. Params are listed per group.
  // turnStarted: player, round
  'event.turnStarted': "{player}'s turn, round {round}",
  // homeBonus: player, resource
  'event.homeBonus': '{player} receives a home system bonus: {resource}',
  // diceRolled: player, dice (e.g. "3 + 4 = 7")
  'event.diceRolled': '{player} rolls {dice}',
  // produced: player, resources (e.g. "2 Metal, 1 Energy"); producedNothing: no params
  'event.produced': '{player} produces {resources}',
  'event.producedNothing': 'Nothing was produced.',
  // discarded: player, count
  'event.discarded.one': '{player} discards {count} card',
  'event.discarded.few': '{player} discards {count} cards',
  'event.discarded.other': '{player} discards {count} cards',
  // pirateMoved: player, sector
  'event.pirateMoved': '{player} moves the pirate ship to {sector}',
  // stolen: thief, victim, resource (known only to those involved)
  'event.stolen.known': '{thief} steals a card from {victim}: {resource}',
  'event.stolen.hidden': '{thief} steals a card from {victim}',
  // bankTraded: player, giveCount, give, get
  'event.bankTraded': '{player} trades with the bank: {giveCount} × {give} → {get}',
  // tradeOffered: player, give, want (preformatted lists)
  'event.tradeOffered': '{player} offers {give} in exchange for {want}',
  // tradeResponded: player
  'event.tradeResponded.accept': '{player} accepts the offer',
  'event.tradeResponded.decline': '{player} declines the offer',
  // traded: a, b, aGave, bGave (preformatted lists)
  'event.traded': '{a} and {b} trade: {a} gives {aGave}, {b} gives {bGave}',
  'event.tradeCancelled': 'The trade offer is no longer open.',
  // built: player, sector
  'event.built.fleet': '{player} builds a fleet in {sector}',
  'event.built.colony': '{player} builds a colony in {sector}',
  'event.built.starbase': '{player} builds a starbase in {sector}',
  // expanded / fortified: player, count, from, to
  'event.expanded.one': '{player} expands with {count} fleet from {from} to {to}',
  'event.expanded.few': '{player} expands with {count} fleets from {from} to {to}',
  'event.expanded.other': '{player} expands with {count} fleets from {from} to {to}',
  'event.fortified.one': '{player} moves {count} fleet from {from} to {to}',
  'event.fortified.few': '{player} moves {count} fleets from {from} to {to}',
  'event.fortified.other': '{player} moves {count} fleets from {from} to {to}',
  // battle: attacker, defender, to, attackRoll, defendRoll (e.g. "6, 4"), attackerLosses, defenderLosses
  // Pick conquered if the sector fell, else won if the defender lost more fleets, else lost.
  'event.battle.won':
    '{attacker} wins the fight against {defender} at {to} ({attackRoll} vs {defendRoll}). Fleets lost, attacker / defender: {attackerLosses} / {defenderLosses}',
  'event.battle.lost':
    '{defender} holds {to} against {attacker} ({attackRoll} vs {defendRoll}). Fleets lost, attacker / defender: {attackerLosses} / {defenderLosses}',
  'event.battle.conquered':
    '{attacker} conquers {to} from {defender} ({attackRoll} vs {defendRoll}). Fleets lost, attacker / defender: {attackerLosses} / {defenderLosses}',
  // awardChanged: gained has player; lost (nobody holds it any more) has no params
  'event.awardChanged.largestEmpire.gained': '{player} now holds the Largest Empire (+2)',
  'event.awardChanged.largestEmpire.lost': 'Nobody holds the Largest Empire any more',
  'event.awardChanged.warlord.gained': '{player} is now the Warlord (+2)',
  'event.awardChanged.warlord.lost': 'Nobody is the Warlord any more',
  // gameOver: player
  'event.gameOver.target': '{player} reaches the victory target and wins the game!',
  'event.gameOver.roundLimit': 'The round limit is reached. {player} wins on points!',

  // End screen
  'end.winner': '{player} wins!',
  'end.rematch': 'Rematch',
  'end.home': 'Back to start',
  'end.ranking': 'Final ranking',
  'end.reasonTarget': 'The victory target was reached.',
  'end.reasonRoundLimit': 'The round limit was reached. The most points win.',
  'end.rank': 'Rank',
  'end.player': 'Player',
  'end.sectors': 'Sectors',
  'end.conquests': 'Conquests',

  // Pages: rules
  'pages.rules.title': 'How to play',
  'pages.rules.intro':
    'Starhold is a game for 2 to 4 commanders. Claim sectors of a hexagonal galaxy, gather resources, trade with rivals and fight for control. The first commander to reach the victory target wins.',
  'pages.rules.goal.title': 'Goal',
  'pages.rules.goal.body':
    'Earn victory points. A colony is worth 1 point, a starbase 2, and two special awards add 2 each. The first commander to reach the target wins; the target is 6, 8 or 10 points and is chosen in the room settings. If nobody gets there within 60 rounds, the player with the most points wins, with ties settled by sector count and then by fleets.',
  'pages.rules.goal.timing':
    'You win as soon as you hold the target after any action on your own turn. If you reach it during someone else’s turn, you win at the start of your next turn, provided you still have it.',
  'pages.rules.map.title': 'The galaxy',
  'pages.rules.map.body':
    'The map is a hexagonal grid of sectors. Resource sectors produce Metal, Energy, Crystal or Biomass and carry a number from 2 to 12. Nebulae produce nothing, but they are still territory. Each commander starts in a home system. A few resource sectors hold a trade station, which gives you a better rate at the bank.',
  'pages.rules.start.title': 'Setup',
  'pages.rules.start.body':
    'Your home system is a colony with 3 fleets, and you begin with one of each resource. Home systems can never be attacked, so nobody is ever eliminated. At the start of each of your turns, your home system hands you 1 resource of your choice.',
  'pages.rules.roll.title': 'Rolling the dice',
  'pages.rules.roll.body':
    'Every turn starts with a roll of two dice. Each sector marked with the rolled number pays its owner, unless the pirate ship is parked there: 1 resource for a claimed sector, 2 for a colony or a starbase.',
  'pages.rules.pirates.title': 'Pirates (rolling a 7)',
  'pages.rules.pirates.body':
    'On a 7 nothing is produced. Anyone holding more than 7 cards must discard half of them, rounded down. Everyone chooses at the same time, and after 30 seconds the game picks for you at random. Then the active player moves the pirate ship to a different sector that is not a home system and steals one random card from that sector’s owner, if there is one. A sector with the pirates on it produces nothing.',
  'pages.rules.trade.title': 'Trading',
  'pages.rules.trade.bank':
    'With the bank you hand in 4 identical resources for 1 of your choice, or only 3 if you own a trade station.',
  'pages.rules.trade.players':
    'With other players, only the active player makes offers: say what you give and what you want. The others accept or decline, and you confirm the deal with one of those who accepted. An offer stays open until you withdraw it or your turn ends.',
  'pages.rules.build.title': 'Building',
  'pages.rules.build.fleet': 'Fleet: Metal + Energy. Adds one fleet to any sector you own.',
  'pages.rules.build.colony':
    'Colony: Metal + Energy + Crystal + Biomass. Turns a claimed sector into a colony. Worth 1 point and produces 2.',
  'pages.rules.build.starbase':
    'Starbase: 3 Metal + 2 Crystal. Upgrades a colony. Worth 2 points in total, produces 2 and strengthens the defence.',
  'pages.rules.build.rule': 'Each sector you own must always keep at least 1 fleet.',
  'pages.rules.expand.title': 'Expanding',
  'pages.rules.expand.body':
    'From a sector with at least 2 fleets, send some of them (at least 1 stays behind) to a neighbouring sector that nobody owns, resource or nebula. That sector is now yours.',
  'pages.rules.attack.title': 'Attacking',
  'pages.rules.attack.body':
    'From a sector with at least 2 fleets, attack a neighbouring enemy sector (never a home system). You choose to roll from 1 up to 3 dice, but always fewer than your fleets. The defender rolls up to 2 dice, never more than their fleets. A starbase adds 1 to the defender’s highest die. The dice are sorted and compared in pairs: the higher die wins, ties go to the defender, and the loser of each pair loses one fleet.',
  'pages.rules.attack.conquest':
    'If the defender runs out of fleets, you conquer the sector and move in anywhere from the number of dice you rolled up to all but one of your fleets there. A conquered colony becomes yours, and a conquered starbase is reduced to a colony. The first sector you conquer in a turn also lets you steal one random card from the defender. You may keep attacking as often as you like.',
  'pages.rules.fortify.title': 'Fortifying',
  'pages.rules.fortify.body':
    'Once per turn you may move fleets from one of your sectors to another of your sectors that is linked to it through your own territory, leaving at least 1 behind. Fortifying, or pressing End turn, finishes your turn.',
  'pages.rules.awards.title': 'Awards',
  'pages.rules.awards.largestEmpire':
    'Largest Empire (+2): held by the commander with the most sectors, and at least 5. You take it by having strictly more than the current holder, and you lose it if you drop below 5 or someone passes you.',
  'pages.rules.awards.warlord':
    'Warlord (+2): goes to the first commander to conquer 3 enemy sectors. Expanding into empty sectors does not count. Another commander takes it by strictly passing the holder’s total.',
  'pages.rules.online.title': 'Playing online',
  'pages.rules.online.body':
    'Turns are timed: 60, 90 or 120 seconds, set by the host. When time runs out, a bot finishes your turn. After two timeouts in a row, or if you lose your connection, you are marked away and a bot plays for you until you act or reconnect. Bots come in two levels, Easy and Normal.',

  // Pages: privacy
  'pages.privacy.title': 'Privacy',
  'pages.privacy.intro': 'Starhold collects as little as possible.',
  'pages.privacy.memory':
    'Your nickname is held in server memory only while your room exists, and it is gone with the room.',
  'pages.privacy.storage':
    'A random token, your nickname, your language and your mute preference are stored in your browser’s localStorage. They stay on your device and let you rejoin a game.',
  'pages.privacy.none': 'There are no accounts, no analytics, no ads and no tracking cookies.',
  'pages.privacy.logs': 'Server logs contain no nicknames.',
  'pages.privacy.contact':
    'Questions or concerns? Open an issue at github.com/toma1203/starhold/issues.',

  // Pages: credits
  'pages.credits.title': 'Credits',
  'pages.credits.author': 'Created by toma1203.',
  'pages.credits.built': 'Built with TypeScript, React, Vite, Node.js and Socket.IO.',
  'pages.credits.art': 'All art and sound are original.',
  'pages.credits.license': 'All rights reserved.',

  // Pages: not found
  'pages.notFound.title': 'Lost in space',
  'pages.notFound.body': 'This page does not exist.',
  'pages.notFound.back': 'Back to start',

  // Common
  'common.close': 'Close',
  'common.back': 'Back',
  'common.language': 'Language',
  'common.lang.en': 'English',
  'common.lang.hr': 'Hrvatski',
  'common.mute': 'Mute sound',
  'common.unmute': 'Unmute sound',
  'common.reload': 'Reload',
  'common.retry': 'Try again',
  'common.somethingWrong': 'Something went wrong.',
  'common.serverRestarted': 'The server restarted and the game was interrupted.',
  'common.seconds': '{count} s',
  'common.points.one': '{count} point',
  'common.points.few': '{count} points',
  'common.points.other': '{count} points',

  // Galaxy map
  'map.title': 'Galaxy map',
  'map.resetView': 'Reset view',
  'map.sector.resource': '{resource} {number}',
  'map.yours': 'yours',
  'map.ownedBy': 'owned by {player}',
  'map.unclaimed': 'unclaimed',
  'map.sector.homeOf': 'Home system ({name})',
  'map.fleets.one': '{count} fleet',
  'map.fleets.few': '{count} fleets',
  'map.fleets.other': '{count} fleets',
  'map.target': 'valid target',

  // Theme: space
  'theme.space.resource.metal': 'Metal',
  'theme.space.resource.energy': 'Energy',
  'theme.space.resource.crystal': 'Crystal',
  'theme.space.resource.biomass': 'Biomass',
  'theme.space.unit.fleet': 'Fleet',
  'theme.space.unit.colony': 'Colony',
  'theme.space.unit.starbase': 'Starbase',
  'theme.space.unit.pirates': 'Pirates',
  'theme.space.sector.nebula': 'Nebula',
  'theme.space.sector.home': 'Home system',
  'theme.space.sector.tradeStation': 'Trade station',
  'theme.space.title': 'Space',
} as const;

export type MessageKey = keyof typeof en;
