import type { MessageKey } from './en.ts';

/**
 * Croatian dictionary. Must define exactly the keys of `en` (a missing or extra key is a compile error).
 * Event messages use the present tense so they work for any player gender, and never decline
 * the parameters (nicknames, resources and sectors are inserted as given).
 */
export const hr: Record<MessageKey, string> = {
  // Engine errors (ErrorCode)
  'err.notYourTurn': 'Nisi na potezu.',
  'err.wrongPhase': 'To sada nije moguće.',
  'err.insufficientResources': 'Nemaš dovoljno resursa.',
  'err.invalidSector': 'Taj sektor nije valjan za ovu akciju.',
  'err.notOwned': 'Taj sektor nije tvoj.',
  'err.notAdjacent': 'Sektori moraju biti susjedni.',
  'err.notConnected': 'Sektori moraju biti povezani preko tvog teritorija.',
  'err.invalidCount': 'Nevaljan broj flota.',
  'err.invalidDice': 'Nevaljan broj kockica.',
  'err.homeProtected': 'Matični sustavi su zaštićeni.',
  'err.noOffer': 'Nema otvorene ponude za trgovinu.',
  'err.invalidTrade': 'Ta trgovina nije valjana.',
  'err.gameOver': 'Igra je završena.',

  // Room errors (RoomErrorCode)
  'err.roomNotFound': 'Soba nije pronađena. Možda je istekla.',
  'err.roomFull': 'Soba je puna.',
  'err.gameStarted': 'Igra je već počela.',
  'err.notHost': 'To može samo domaćin.',
  'err.badRequest': 'Nevaljan zahtjev.',
  'err.rateLimited': 'Uspori, previše zahtjeva.',
  'err.serverFull': 'Server je pun. Pokušaj ponovno kasnije.',
  'err.notEnoughPlayers': 'Za početak su potrebna najmanje 2 igrača.',
  'err.offline': 'Nisi povezan — provjeri vezu.',

  // Room closed (room:closed reasons)
  'room.closed.expired': 'Ova soba je istekla.',
  'room.closed.serverRestart': 'Server se ponovno pokreće. Pokušaj se ponovno spojiti za trenutak.',
  'room.closed.replaced': 'Ova igra je otvorena u drugoj kartici ili na drugom uređaju.',
  'room.closed.gone':
    'Ova igra više ne postoji — soba je istekla ili je poslužitelj ponovno pokrenut.',

  // Home screen
  'home.title': 'Starhold',
  'home.tagline': 'Gradi, trguj i osvoji galaksiju.',
  'home.nickname': 'Nadimak',
  'home.create': 'Stvori sobu',
  'home.join': 'Uđi u sobu',
  'home.code': 'Kod sobe',

  // Lobby
  'lobby.room': 'Soba {code}',
  'lobby.players': 'Igrači',
  'lobby.copyLink': 'Kopiraj link za poziv',
  'lobby.linkCopied': 'Link je kopiran',
  'lobby.addBot': 'Dodaj bota',
  'lobby.botEasy': 'Lagani',
  'lobby.botNormal': 'Normalni',
  'lobby.remove': 'Ukloni',
  'lobby.start': 'Pokreni igru',
  'lobby.waiting': 'Čeka se da domaćin pokrene igru…',
  'lobby.settingsTarget': 'Bodova za pobjedu',
  'lobby.settingsTimer': 'Timer poteza',
  'lobby.host': 'Domaćin',
  'lobby.you': 'Ti',
  'lobby.needPlayers': 'Potrebna su najmanje 2 igrača.',
  'lobby.leave': 'Napusti sobu',
  'lobby.inviteLink': 'Poveznica za poziv',

  // Game screen
  'game.phase.homeBonus': 'Bonus matičnog sustava',
  'game.phase.roll': 'Bacanje',
  'game.phase.discard': 'Odbacivanje',
  'game.phase.pirate': 'Pirati',
  'game.phase.main': 'Glavna faza',
  'game.phase.finished': 'Kraj igre',
  'game.round': 'Runda {round}',
  'game.roll': 'Baci kockice',
  'game.endTurn': 'Završi potez',
  'game.build': 'Gradi',
  'game.buildFleet': 'Izgradi flotu',
  'game.buildColony': 'Izgradi koloniju',
  'game.buildStarbase': 'Izgradi zvjezdanu bazu',
  'game.bankTrade': 'Trgovina s bankom',
  'game.offerTrade': 'Ponudi trgovinu',
  'game.give': 'Daješ',
  'game.want': 'Tražiš',
  'game.rate': 'Omjer {rate}:1',
  'game.accept': 'Prihvati',
  'game.decline': 'Odbij',
  'game.confirm': 'Potvrdi',
  'game.cancel': 'Odustani',
  'game.attack': 'Napadni',
  'game.expand': 'Proširi se',
  'game.fortify': 'Pregrupiraj',
  'game.dice': 'Kockice',
  'game.moveCount': 'Broj flota za premještanje',
  'game.discardTitle': 'Odbaci karte',
  'game.discardHint': 'Imaš previše karata. Odaberi karte za odbacivanje (potrebno: {count}).',
  'game.pirateHint':
    'Pomakni piratski brod u drugi sektor koji nije matični sustav, a zatim ukradi nasumičnu kartu njegovu vlasniku.',
  'game.homeBonusTitle': 'Bonus matičnog sustava: odaberi resurs',
  'game.yourTurn': 'Tvoj potez',
  'game.waitingFor': 'Čeka se {player}…',
  'game.timerValue': 'Preostalo vrijeme: {seconds} s',
  'game.afk': 'Nije tu (igra bot)',
  'game.disconnected': 'Veza prekinuta',
  'game.reconnecting': 'Ponovno povezivanje…',
  'game.loading': 'Učitavanje…',
  'game.vp': 'Bodovi pobjede',
  'game.cards': 'Karte',
  'game.fleets': 'Flote',
  'game.largestEmpire': 'Najveće carstvo',
  'game.warlord': 'Ratni vođa',

  // Game screen: panels, actions and dialogs
  'game.actions': 'Akcije',
  'game.players': 'Igrači',
  'game.log': 'Dnevnik',
  'game.logEmpty': 'Još se ništa nije dogodilo.',
  'game.lastRoll': 'Zadnje bacanje: {dice}',
  'game.selectHint': 'Odaberi jedan od svojih sektora za gradnju ili odredište na karti.',
  'game.reason.colonySite': 'Treba zauzet sektor bez kolonije (ne matični sustav).',
  'game.reason.starbaseSite': 'Treba kolonija koju možeš nadograditi.',
  'game.chooseAction': 'Što želiš učiniti?',
  'game.route': '{from} → {to}',
  'game.fortifyEnds': 'Pregrupiranje završava tvoj potez.',
  'game.more': 'Više: {resource}',
  'game.less': 'Manje: {resource}',
  'game.discardChosen': 'Odabrano {chosen} od {count}',
  'game.trade.title': 'Trgovina',
  'game.trade.players': 'S igračima',
  'game.trade.send': 'Pošalji ponudu',
  'game.offer.incoming': '{player} ti nudi {give} za {want}',
  'game.offer.yours': 'Tvoja ponuda: {give} za {want}',
  'game.offer.accepted': 'prihvaćeno',
  'game.offer.declined': 'odbijeno',
  'game.offer.pending': 'čeka se',
  'game.offer.status': '{player}: {status}',
  'game.offer.tradeWith': 'Trguj s igračem {player}',
  'game.offer.withdraw': 'Povuci ponudu',
  'game.offer.youAccepted': 'Prihvaćeno. Čeka se potvrda ponuditelja…',
  'game.offer.youDeclined': 'Tvoj odgovor: odbijeno.',
  'game.offer.cannotAfford': 'Nemaš dovoljno resursa za ovu ponudu.',
  'game.attack.captureChance': 'Šansa za osvajanje: {percent}%',
  'game.attack.roundChance': 'Šansa za pobjedu u jednoj rundi: {percent}%',
  'game.attack.moveOnConquest': 'Flote za preseljenje ako osvojiš',
  'game.attack.waiting': 'Čeka se rezultat…',
  'game.attack.attackerDice': 'Kockice napadača',
  'game.attack.defenderDice': 'Kockice branitelja',
  'game.attack.losses':
    'Izgubljene flote, napadač / branitelj: {attackerLosses} / {defenderLosses}',
  'game.attack.result.conquered': 'Sektor je osvojen!',
  'game.attack.result.won': 'Bitka je dobivena, ali sektor se drži.',
  'game.attack.result.lost': 'Obrana je izdržala.',
  'game.attack.again': 'Napadni ponovno',

  // Event log
  'event.turnStarted': 'Potez igrača {player}, runda {round}',
  'event.homeBonus': '{player} dobiva bonus matičnog sustava: {resource}',
  'event.diceRolled': '{player} baca {dice}',
  'event.produced': '{player} proizvodi {resources}',
  'event.producedNothing': 'Ništa nije proizvedeno.',
  'event.discarded.one': '{player} odbacuje {count} kartu',
  'event.discarded.few': '{player} odbacuje {count} karte',
  'event.discarded.other': '{player} odbacuje {count} karata',
  'event.pirateMoved': '{player} pomiče piratski brod u sektor {sector}',
  'event.stolen.known': '{thief} krade kartu od igrača {victim}: {resource}',
  'event.stolen.hidden': '{thief} krade kartu od igrača {victim}',
  'event.bankTraded': '{player} mijenja u banci: {giveCount} × {give} → {get}',
  'event.tradeOffered': '{player} nudi {give} u zamjenu za {want}',
  'event.tradeResponded.accept': '{player} prihvaća ponudu',
  'event.tradeResponded.decline': '{player} odbija ponudu',
  'event.traded': '{a} i {b} trguju: {a} daje {aGave}, {b} daje {bGave}',
  'event.tradeCancelled': 'Ponuda za trgovinu više nije otvorena.',
  'event.built.fleet': '{player} gradi flotu u sektoru {sector}',
  'event.built.colony': '{player} gradi koloniju u sektoru {sector}',
  'event.built.starbase': '{player} gradi zvjezdanu bazu u sektoru {sector}',
  'event.expanded.one': '{player} se širi: šalje {count} flotu iz {from} u {to}',
  'event.expanded.few': '{player} se širi: šalje {count} flote iz {from} u {to}',
  'event.expanded.other': '{player} se širi: šalje {count} flota iz {from} u {to}',
  'event.fortified.one': '{player} premješta {count} flotu iz {from} u {to}',
  'event.fortified.few': '{player} premješta {count} flote iz {from} u {to}',
  'event.fortified.other': '{player} premješta {count} flota iz {from} u {to}',
  'event.battle.won':
    '{attacker} napada {defender} u sektoru {to} i pobjeđuje u bitci ({attackRoll} naspram {defendRoll}). Izgubljene flote, napadač / branitelj: {attackerLosses} / {defenderLosses}',
  'event.battle.lost':
    '{attacker} napada {defender} u sektoru {to}, ali obrana drži ({attackRoll} naspram {defendRoll}). Izgubljene flote, napadač / branitelj: {attackerLosses} / {defenderLosses}',
  'event.battle.conquered':
    '{attacker} osvaja sektor {to} od igrača {defender} ({attackRoll} naspram {defendRoll}). Izgubljene flote, napadač / branitelj: {attackerLosses} / {defenderLosses}',
  'event.awardChanged.largestEmpire.gained': '{player} sada ima Najveće carstvo (+2)',
  'event.awardChanged.largestEmpire.lost': 'Nitko više nema Najveće carstvo',
  'event.awardChanged.warlord.gained': '{player} je sada Ratni vođa (+2)',
  'event.awardChanged.warlord.lost': 'Nitko više nije Ratni vođa',
  'event.gameOver.target': '{player} dosiže cilj i pobjeđuje u igri!',
  'event.gameOver.roundLimit': 'Dosegnut je limit rundi. {player} pobjeđuje po bodovima!',

  // End screen
  'end.winner': '{player} pobjeđuje!',
  'end.rematch': 'Revanš',
  'end.home': 'Natrag na početnu',
  'end.ranking': 'Konačni poredak',
  'end.reasonTarget': 'Dosegnut je cilj pobjede.',
  'end.reasonRoundLimit': 'Dosegnut je limit rundi. Pobjeđuje tko ima najviše bodova.',
  'end.rank': 'Mjesto',
  'end.player': 'Igrač',
  'end.sectors': 'Sektori',
  'end.conquests': 'Osvajanja',

  // Pages: rules
  'pages.rules.title': 'Kako igrati',
  'pages.rules.intro':
    'Starhold je igra za 2 do 4 zapovjednika. Zauzimaj sektore heksagonalne galaksije, skupljaj resurse, trguj s protivnicima i bori se za prevlast. Pobjeđuje prvi zapovjednik koji dosegne cilj.',
  'pages.rules.goal.title': 'Cilj',
  'pages.rules.goal.body':
    'Osvajaj bodove pobjede. Kolonija vrijedi 1 bod, zvjezdana baza 2, a dvije posebne nagrade donose po 2. Pobjeđuje prvi zapovjednik koji dosegne cilj; cilj je 6, 8 ili 10 bodova i bira se u postavkama sobe. Ako nitko ne stigne do cilja u 60 rundi, pobjeđuje igrač s najviše bodova, a izjednačenje se rješava brojem sektora, zatim brojem flota, a na kraju redoslijedom poteza (pobjeđuje igrač koji je ranije na redu).',
  'pages.rules.goal.timing':
    'Pobjeđuješ čim u svom potezu nakon bilo koje akcije dosegneš cilj. Ako ga dosegneš tijekom tuđeg poteza, pobjeđuješ na početku svog sljedećeg poteza, ako ga i dalje imaš.',
  'pages.rules.map.title': 'Galaksija',
  'pages.rules.map.body':
    'Karta je heksagonalna mreža sektora. Resursni sektori proizvode Metal, Energiju, Kristale ili Biomasu i nose broj od 2 do 12. Maglice ne proizvode ništa, ali su i dalje teritorij. Svaki zapovjednik kreće iz matičnog sustava. Neki resursni sektori imaju trgovačku stanicu koja ti daje povoljniji tečaj u banci.',
  'pages.rules.start.title': 'Početak',
  'pages.rules.start.body':
    'Tvoj matični sustav je kolonija s 3 flote, a na početku imaš po jedan od svakog resursa. Matične sustave nikad nije moguće napasti, pa nitko ne ispada iz igre. Na početku svakog tvog poteza matični sustav ti daje 1 resurs po izboru.',
  'pages.rules.roll.title': 'Bacanje kockica',
  'pages.rules.roll.body':
    'Svaki potez počinje bacanjem dviju kockica. Svaki sektor označen izbačenim brojem isplaćuje svog vlasnika, osim ako se na njemu nalazi piratski brod: zauzeti sektor daje 1 resurs, a kolonija i zvjezdana baza po 2.',
  'pages.rules.pirates.title': 'Pirati (kad padne 7)',
  'pages.rules.pirates.body':
    'Kad padne 7, ništa se ne proizvodi. Svatko tko ima više od 7 karata mora odbaciti polovicu, zaokruženo prema dolje. Svi biraju istodobno, a nakon 30 sekundi igra umjesto tebe bira nasumično. Zatim igrač na potezu pomiče piratski brod u drugi sektor koji nije matični sustav i krade jednu nasumičnu kartu vlasniku tog sektora, ako ga ima. Sektor s piratima ne proizvodi ništa.',
  'pages.rules.trade.title': 'Trgovina',
  'pages.rules.trade.bank':
    'U banci predaješ 4 ista resursa za 1 po izboru, a samo 3 ako posjeduješ trgovačku stanicu.',
  'pages.rules.trade.players':
    'S drugim igračima ponude daje samo igrač na potezu: reci što daješ i što tražiš. Ostali prihvaćaju ili odbijaju, a ti dogovor potvrđuješ s jednim od onih koji su prihvatili. Ponuda vrijedi dok je ne povučeš ili dok ti ne završi potez.',
  'pages.rules.build.title': 'Gradnja',
  'pages.rules.build.fleet': 'Flota: Metal + Energija. Dodaje jednu flotu u bilo koji tvoj sektor.',
  'pages.rules.build.colony':
    'Kolonija: Metal + Energija + Kristali + Biomasa. Pretvara zauzeti sektor u koloniju. Vrijedi 1 bod i proizvodi 2.',
  'pages.rules.build.starbase':
    'Zvjezdana baza: 3 metala + 2 kristala. Nadograđuje koloniju. Ukupno vrijedi 2 boda, proizvodi 2 i jača obranu.',
  'pages.rules.build.rule': 'Svaki tvoj sektor uvijek mora imati barem 1 flotu.',
  'pages.rules.expand.title': 'Širenje',
  'pages.rules.expand.body':
    'Iz sektora s najmanje 2 flote pošalji dio flota (barem 1 ostaje) u susjedni sektor koji nikome ne pripada, resursni ili maglicu. Taj sektor postaje tvoj.',
  'pages.rules.attack.title': 'Napad',
  'pages.rules.attack.body':
    'Iz sektora s najmanje 2 flote napadni susjedni protivnički sektor (nikad matični sustav). Biraš baciti od 1 do 3 kockice, ali uvijek manje nego što imaš flota. Branitelj baca do 2 kockice, najviše koliko ima flota. Zvjezdana baza dodaje 1 najvišoj kockici branitelja. Kockice se poredaju i uspoređuju u parovima: veća pobjeđuje, izjednačenje dobiva branitelj, a gubitnik svakog para gubi jednu flotu.',
  'pages.rules.attack.conquest':
    'Ako branitelju ponestane flota, osvajaš sektor i u njega premještaš najmanje onoliko flota koliko si kockica bacio, a najviše sve osim jedne. Osvojena kolonija postaje tvoja, a osvojena zvjezdana baza spušta se na koloniju. Prvim osvojenim sektorom u potezu kradeš jednu nasumičnu kartu od branitelja. Napadati možeš koliko god puta želiš.',
  'pages.rules.fortify.title': 'Pregrupiranje',
  'pages.rules.fortify.body':
    'Jednom po potezu možeš premjestiti flote iz jednog svog sektora u drugi svoj sektor koji je s njim povezan preko tvog teritorija, tako da barem 1 flota ostane. Pregrupiranje ili gumb Završi potez završava tvoj potez.',
  'pages.rules.awards.title': 'Nagrade',
  'pages.rules.awards.largestEmpire':
    'Najveće carstvo (+2): pripada zapovjedniku s najviše sektora, a najmanje 5. Preuzimaš ga kad imaš strogo više sektora od trenutnog nositelja, a gubiš ga ako padneš ispod 5 ili te netko pretekne.',
  'pages.rules.awards.warlord':
    'Ratni vođa (+2): pripada prvom zapovjedniku koji osvoji 3 protivnička sektora. Širenje u prazne sektore ne računa se. Drugi zapovjednik ga preuzima kad strogo premaši broj osvajanja nositelja.',
  'pages.rules.online.title': 'Igra preko interneta',
  'pages.rules.online.body':
    'Potezi su vremenski ograničeni: 60, 90 ili 120 sekundi, što određuje domaćin. Kad vrijeme istekne, bot dovršava tvoj potez. Nakon dva uzastopna isteka ili ako izgubiš vezu, označen si kao odsutan i bot igra umjesto tebe dok ne odigraš akciju ili se ponovno ne povežeš. Botovi imaju dvije razine: Lagani i Normalni.',

  // Pages: privacy
  'pages.privacy.title': 'Privatnost',
  'pages.privacy.intro': 'Starhold prikuplja što je manje moguće.',
  'pages.privacy.memory':
    'Tvoj nadimak čuva se u memoriji servera samo dok soba postoji i nestaje zajedno s njom.',
  'pages.privacy.storage':
    'Nasumični token, tvoj nadimak, odabrani jezik i postavka zvuka (isključen ili uključen) spremaju se u localStorage tvog preglednika. Ostaju na tvom uređaju i omogućuju ti povratak u igru.',
  'pages.privacy.none': 'Nema korisničkih računa, analitike, oglasa ni kolačića za praćenje.',
  'pages.privacy.logs': 'Zapisi servera ne sadrže nadimke.',
  'pages.privacy.contact':
    'Pitanja ili nedoumice? Otvori issue na github.com/toma1203/starhold/issues.',

  // Pages: credits
  'pages.credits.title': 'Zasluge',
  'pages.credits.author': 'Autor: toma1203.',
  'pages.credits.built': 'Izrađeno u tehnologijama: TypeScript, React, Vite, Node.js i Socket.IO.',
  'pages.credits.art': 'Sva grafika i svi zvukovi su originalni.',
  'pages.credits.license': 'Sva prava pridržana.',

  // Pages: not found
  'pages.notFound.title': 'Izgubljeno u svemiru',
  'pages.notFound.body': 'Ova stranica ne postoji.',
  'pages.notFound.back': 'Natrag na početnu',

  // Common
  'common.close': 'Zatvori',
  'common.back': 'Natrag',
  'common.language': 'Jezik',
  'common.lang.en': 'English',
  'common.lang.hr': 'Hrvatski',
  'common.mute': 'Isključi zvuk',
  'common.unmute': 'Uključi zvuk',
  'common.reload': 'Učitaj ponovno',
  'common.retry': 'Pokušaj ponovno',
  'common.somethingWrong': 'Nešto je pošlo po zlu.',
  'common.serverRestarted': 'Server je ponovno pokrenut, partija je prekinuta.',
  'common.seconds': '{count} s',
  'common.points.one': '{count} bod',
  'common.points.few': '{count} boda',
  'common.points.other': '{count} bodova',

  // Galaxy map
  'map.title': 'Galaktička karta',
  'map.resetView': 'Poništi prikaz',
  'map.sector.resource': '{resource} {number}',
  'map.yours': 'vaš',
  'map.ownedBy': 'vlasnik: {player}',
  'map.sector.homeOf': 'Matični sustav ({name})',
  'map.unclaimed': 'slobodan',
  'map.fleets.one': '{count} flota',
  'map.fleets.few': '{count} flote',
  'map.fleets.other': '{count} flota',
  'map.target': 'moguće odredište',

  // Theme: space
  'theme.space.resource.metal': 'Metal',
  'theme.space.resource.energy': 'Energija',
  'theme.space.resource.crystal': 'Kristali',
  'theme.space.resource.biomass': 'Biomasa',
  'theme.space.unit.fleet': 'Flota',
  'theme.space.unit.colony': 'Kolonija',
  'theme.space.unit.starbase': 'Zvjezdana baza',
  'theme.space.unit.pirates': 'Pirati',
  'theme.space.sector.nebula': 'Maglica',
  'theme.space.sector.home': 'Matični sustav',
  'theme.space.sector.tradeStation': 'Trgovačka stanica',
  'theme.space.title': 'Svemir',
};
