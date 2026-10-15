# Builds books/tl.json (Twenty Thousand Leagues Under the Seas, tr. F. P. Walter) from the parsed and
# annotated chapters, plus the reading guide and the book's own extras: the voyage map with the
# leagues travelled, the depths reached and the Nautilus fact card. Every anchor is found by searching
# the text itself, so each fact appears only once the reader has reached it.
import json, math, re, sys
from tfind import find, W, CH

d = json.load(open('annotated.json'))
chs = d['chs']
for c in chs: c['r'] = [[] for _ in c['p']]  # speaker cues are no longer used; the cast comes from the map below
spk = ['Professor Aronnax', 'Conseil', 'Ned Land', 'Captain Nemo', 'Commander Farragut', 'The crew']
N = len(W)

def at(pat, ch=1, n=0):
    hits = [h for h in find(pat, 0, 5000) if h[1] >= ch]
    if len(hits) <= n: sys.exit(f'anchor not found: {pat!r} (from ch{ch})')
    return hits[n][0]
def sent_end(i):
    while i < N - 1 and not re.search(r'[.!?]["”’)]*$', W[i]): i += 1
    return i
def check(q, i):
    win = ' '.join(W[max(0, i - 60):i + 80])
    if q not in win: sys.exit(f'quote not near anchor: {q!r} @ {i}: {" ".join(W[i-8:i+12])}')
# global word index -> [chapter, paragraph, word]
para_starts = []
k = 0
for ci, c in enumerate(chs):
    for pi, p in enumerate(c['p']): para_starts.append((k, ci, pi)); k += len(p.split(' '))
def cpw(i):
    lo = max(j for j in range(len(para_starts)) if para_starts[j][0] <= i)
    s, ci, pi = para_starts[lo]; return [ci, pi, i - s]

# ---------------- chapter guide ----------------
G = [
 ("1866. Ships all over the world report a huge, fast, sometimes glowing “thing” in the sea. Watch how the mystery grows.",
  "In 1866 ships report an enormous spindle-shaped object, faster than any whale and sometimes phosphorescent. When the Moravian strikes an uncharted “rock” and the Scotia is holed below the waterline, the public demands that the seas be rid of this monster."),
 ("Meet the narrator, a French natural scientist, as the world argues over what the monster is.",
  "Pierre Aronnax, assistant professor at the Paris Museum of Natural History, is in New York when the debate peaks. Asked for his opinion, he argues it is most likely a gigantic narwhal of enormous strength. The United States fits out the frigate Abraham Lincoln to hunt it and invites him aboard."),
 ("Aronnax has moments to decide whether to sail. Meet his servant, Conseil.",
  "Aronnax accepts at once and tells his devoted, unflappable servant Conseil to pack. They are welcomed aboard the Abraham Lincoln by Commander Farragut, and the frigate steams out of New York into the Atlantic."),
 ("Meet the frigate's harpooner, the one man aboard who doubts the monster exists.",
  "Ned Land, a Canadian harpooner without equal, is the only sceptic on board. Aronnax argues from the crushing pressure of the deep that any animal living there must be immensely strong, and Ned half concedes."),
 ("Months of searching. Watch the crew's hopes and patience run down.",
  "The frigate rounds Cape Horn and searches the Pacific for months without result. The crew grow discouraged and Farragut agrees to give up after three more days. On the last evening, Ned Land sights the creature."),
 ("The chase begins. Watch how fast the “monster” is, and how it behaves.",
  "The glowing creature easily outpaces the frigate at full steam and seems to toy with it. Ned's harpoon strikes it but glances off. In the night it charges; the shock throws Aronnax into the sea."),
 ("Aronnax is in the water at night. Who comes to help, and what is the “whale” really?",
  "Conseil jumps in after his master and keeps him afloat. Ned, also thrown overboard, has found refuge on the monster itself, which turns out to be made of riveted iron plates: a submarine boat. Masked men emerge and drag the three of them inside."),
 ("Prisoners in a dark cell aboard an unknown vessel. Notice the language the crew speak.",
  "Locked in a dark iron cell, they are visited by two men who hear their story in French, English, German and Latin without answering a word. A meal is brought, and they fall into a deep sleep."),
 ("Hunger and confinement test Ned's temper.",
  "They wake hungry and short of air as the vessel surfaces to breathe. When the steward finally comes, Ned leaps at his throat, and a voice suddenly addresses them in perfect French."),
 ("Meet the commander of the submarine, and hear his terms.",
  "The commander says he has broken with humanity and its laws. They may move freely on board but may never leave, since they know his secret. He names himself Captain Nemo, serves Aronnax a breakfast made entirely from the sea, and speaks of his love for the ocean."),
 ("A tour of the Nautilus begins.",
  "Nemo shows Aronnax his ship: a library of 12,000 books, a lounge with masterpieces of painting, sheet music and a piano-organ, and a museum of shells, corals and pearls gathered from every sea."),
 ("How does the Nautilus work? Nemo explains.",
  "Nemo shows his instruments and explains that the Nautilus runs entirely on electricity, made with elements drawn from sea water. It lights, heats and drives the ship at up to fifty miles an hour, and serves a small boat stowed in the hull."),
 ("The vessel's measurements, and some of its secrets.",
  "Nemo describes the Nautilus: 70 metres long, 8 metres wide, 1,500 metric tons, with a double hull and tanks that let it dive and rise. He built it in secret on a desert island from parts ordered all over the world. Its collision with the Scotia was an accident."),
 ("The voyage proper begins near Japan. Watch the ocean through the saloon windows.",
  "The Nautilus takes its bearings off Japan and follows the Kuroshio, the warm Black Current. The lounge panels open on the lit sea, and Ned and Conseil share Aronnax's wonder at the life outside."),
 ("Nemo invites them hunting. Where, and how?",
  "Nemo invites them to hunt in the forests of Crespo Island. Ned hopes for dry land, but the forests are under the sea. Nemo explains the diving apparatus and the air-guns with electric bullets that make the trip possible."),
 ("Aronnax walks on the sea floor for the first time.",
  "Ned refuses the diving suit, but Aronnax and Conseil follow Nemo across bright sands on the sea floor, a world of light and colour, until they reach the dark edge of the submarine forest."),
 ("The underwater forest, and the dangers in it.",
  "They wander among the strange upright plants of the submarine forest. Nemo shoots a sea otter, and on the way back the walkers lie flat on the sea floor while two great sharks pass over them."),
 ("Across the Pacific. Nemo speaks about the sea.",
  "Nemo speaks of the sea's living power. The Nautilus dives deep, passes Hawaii and comes upon a ship sunk only hours before, its dead still aboard."),
 ("A famous lost expedition, and the place where it ended.",
  "After the Tuamotu Islands, the Nautilus reaches Vanikoro, where the French explorer La Pérouse was wrecked. Nemo reveals that he found the last wreck and La Pérouse's papers, and says he hopes he and his men will lie in a coral grave like his."),
 ("A strait full of reefs.",
  "Crossing the reef-strewn Torres Strait, the Nautilus runs aground near Gueboroa Island. Nemo calmly waits for the full-moon tide, and Aronnax gets permission for the three of them to go ashore meanwhile."),
 ("On land for the first time in months. Notice what Ned is after.",
  "On the island they gather coconuts and bread-fruit, shoot pigeons, a bird of paradise and a wild pig, and feast. As they talk about not going back, a stone lands at their feet."),
 ("Islanders on the shore. How will Nemo respond?",
  "Papuan islanders chase them back to the stranded ship and surround it in canoes. Nemo is unconcerned. When they try to climb aboard, the iron rail throws them back with an electric shock, and at the promised hour the tide lifts the Nautilus free."),
 ("Something happens that Nemo does not want seen.",
  "Nemo grows agitated after watching something through his glass and has his prisoners locked up. They eat, and fall into a heavy, drugged sleep."),
 ("A wounded crewman, and Nemo's private cemetery.",
  "Aronnax, who once practised as a doctor, examines a crewman with a fatal head wound. The next day the crew bury him in a coral cemetery on the sea floor, and Nemo, close to tears, calls it a resting place safe from “sharks and men”."),
 ("Part Two opens in the Indian Ocean. A strange sea at night.",
  "Aronnax reflects on Nemo's hatred of mankind. The Nautilus crosses the Indian Ocean past Keeling Island, and one night passes through a “milk sea” whitened by countless tiny glowing creatures."),
 ("Nemo invites them to a pearl fishery. And mentions sharks.",
  "Near Ceylon, Nemo invites them to visit the pearl fisheries in the Gulf of Mannar and casually asks if they fear sharks. Aronnax explains to his friends how pearls form, while trying to hide his own nerves."),
 ("On the pearl bank. Watch Nemo with a poor diver.",
  "On the sea floor Nemo shows them a gigantic oyster with a priceless pearl he is letting grow. They watch a poor Indian pearl-diver at work. When a shark attacks him, Nemo fights it with a dagger, Ned kills it with his harpoon, and Nemo revives the diver and gives him a bag of pearls."),
 ("The Red Sea, and where Nemo means to go next.",
  "The Nautilus enters the Red Sea. Nemo talks of its history and of the Suez Canal being dug, then reveals that he has found an underground passage beneath the isthmus to the Mediterranean, the “Arabian Tunnel”."),
 ("A dugong hunt, then a passage under the land.",
  "Ned is allowed to harpoon a dugong. That night Nemo steers the Nautilus himself through the dark Arabian Tunnel, and in under twenty minutes they are in the Mediterranean."),
 ("Europe is near. Ned has a plan, and a swimmer appears.",
  "Ned urges escape now that Europe is close; Aronnax agrees to wait for the right chance. Off Crete a diver swims up to the window and Nemo sends him a chest of gold. The Nautilus then crosses boiling water near Santorini's undersea volcano."),
 ("A fast passage. Why the hurry?",
  "Nemo, who dislikes this enclosed sea, crosses the Mediterranean in two days, mostly at depth, and Ned gets no chance to escape. They pass the Strait of Gibraltar into the Atlantic."),
 ("Ned's escape is set for tonight. And Nemo has something to show.",
  "Ned plans their escape for that night off Portugal. But Nemo stops in Vigo Bay, tells the story of the Spanish treasure galleons sunk there in 1702, and shows his crew gathering the gold from the wrecks. Aronnax realises where Nemo's millions go: to oppressed peoples."),
 ("A night walk on the sea floor, to somewhere extraordinary.",
  "Nemo takes Aronnax on a night walk across the Atlantic floor towards a distant glow. They climb an undersea volcano and look down on the ruins of a drowned city. Nemo writes one word on the rock: ATLANTIS."),
 ("A hidden harbour, and how the Nautilus refuels.",
  "The Nautilus surfaces inside the crater of an extinct volcano, reached by an undersea tunnel. Here Nemo's men mine coal for the ship's power. The three friends explore the crater; Ned finds honey and dreams of escape."),
 ("A sea of weed, then a record-breaking dive.",
  "The Nautilus crosses the still, weed-choked Sargasso Sea and heads far south. In the South Atlantic it dives to an astonishing 16,000 metres, and Nemo photographs the sea floor."),
 ("Ned sees whales. What does Nemo think of hunting?",
  "Ned longs to hunt the southern whales, but Nemo refuses to kill for nothing. When savage sperm whales attack the baleen whales, Nemo drives the Nautilus's steel spur through them in a bloody massacre. Ned calls it butchery, and his resentment of Nemo grows."),
 ("Ice everywhere, and a goal no one has reached.",
  "Heading south, the Nautilus is surrounded by ice. Nemo announces he will reach the South Pole by passing under the ice barrier, reasoning that there is open sea beyond. After a long passage beneath it, he appears at dawn: “The sea is open!”"),
 ("Will they reach the pole? Watch the sky.",
  "Beyond the ice lie open sea, rocky land, and crowds of seals and birds. After days of fog the sun appears at noon on 21 March 1868, and Nemo takes possession of the South Pole, unfurling a black flag with a gold N."),
 ("Leaving the pole, something goes wrong.",
  "On the way back an overturning iceberg pins the Nautilus beneath the ice. They free the ship and enter a tunnel of ice, only to find it closed at both ends: they are trapped."),
 ("Trapped in the ice, with little air.",
  "With air for only two days, crew and prisoners take turns digging through the ice in diving suits, while Nemo uses jets of boiling water to stop the sea freezing round the hull. As the air runs out the Nautilus breaks through the thinned ice to the surface."),
 ("Free again. Ned plans for home.",
  "Saved, the three friends pledge themselves to one another. The Nautilus rounds Cape Horn and runs north along South America, past the mouth of the Amazon, and Ned hopes for a chance near the American coast."),
 ("Off the Bahamas, tales of giant devilfish.",
  "The friends argue about legends of giant devilfish (squid). Then a pack of them attacks and one jams the propeller. The crew fight them on the platform with axes; a sailor is seized and carried off crying for help in French, and Nemo weeps for him."),
 ("Ned can't bear it any longer. Aronnax confronts Nemo.",
  "Ned, desperate, asks Aronnax to speak to Nemo. Nemo coldly repeats that they will never leave. A violent storm off the American coast ends any chance of escape, and the Nautilus turns east."),
 ("Off Ireland, Nemo visits a wreck on an anniversary.",
  "Crossing the Atlantic, Aronnax sees the transatlantic telegraph cable on the sea floor. Off the coast of Ireland, Nemo shows him the wreck of the Avenger, a French warship that sank fighting rather than surrender, seventy-four years before to the day."),
 ("A warship appears. What will Nemo do?",
  "A warship of unknown nationality fires on the Nautilus, and Ned hopes for rescue. Nemo raises his black flag and, ignoring Aronnax's pleas, rams and sinks the ship with everyone aboard. Afterwards he kneels, weeping, before a portrait of a woman and two children."),
 ("The friends prepare to escape.",
  "Horrified, the three decide to flee. Aronnax hears Nemo at the organ and his last words: “Almighty God! enough! enough!” As they launch the boat off Norway, the Nautilus is caught in the Maelstrom and the boat is torn loose into the whirlpool."),
 ("How it ends.",
  "Aronnax wakes in a fisherman's hut on the Lofoten Islands with Ned and Conseil. He does not know whether the Nautilus survived, and hopes that Nemo has found peace. He alone, with Nemo, can say what lies under the sea."),
]
assert len(G) == len(chs), (len(G), len(chs))

# ---------------- scenes and places ----------------
SC = [  # chapter (1-based), label, sub, setting, place description, background
 (1, 'The world’s oceans', '1866', 'Ships everywhere report a mysterious sea monster.', 'Sea lanes across the Atlantic and Pacific, where the sightings and collisions are reported.', ''),
 (2, 'New York', 'Spring 1867', 'Aronnax waits in New York as the debate rages.', 'Aronnax stays at the Fifth Avenue Hotel after an expedition to Nebraska.', ''),
 (3, 'Aboard the Abraham Lincoln', 'US frigate', 'Aboard the frigate hunting the monster.', 'A fast American frigate, fitted out to hunt the monster under Commander Farragut.', ''),
 (7, 'Adrift in the Pacific', 'Night', 'Thrown into the sea at night.', 'The open Pacific, far from land, where the frigate lost sight of them.', ''),
 (8, 'Aboard the Nautilus', 'Prisoners', 'Prisoners aboard an unknown submarine.', 'Captain Nemo’s electric submarine: library, saloon, museum and engine room, under the sea.', 'Real submarines of the 1860s were small, hand-cranked and dangerous; Verne imagined one decades ahead of its time.'),
 (15, 'Crespo Island', 'North Pacific', 'An invitation to hunt.', 'A small island in the North Pacific; its “forests” are under the sea.', ''),
 (18, 'The Pacific', 'Towards the south seas', 'Crossing the Pacific.', 'The deep Pacific, past Hawaii towards the south seas.', ''),
 (19, 'Vanikoro', 'Santa Cruz Islands', 'At the islands where La Pérouse disappeared.', 'Islands in the south-west Pacific, ringed with coral reefs.', 'The French explorer La Pérouse vanished in 1788; his wrecks at Vanikoro were identified decades later by Peter Dillon and Dumont d’Urville.'),
 (20, 'Torres Strait', 'Between Australia and New Guinea', 'Threading a dangerous strait.', 'The reef-strewn strait between Australia and New Guinea, feared by sailors.', ''),
 (21, 'Gueboroa Island', 'Off New Guinea', 'Ashore on a tropical island.', 'A wooded island near the stranded Nautilus, with fruit, birds and game.', ''),
 (23, 'Beneath the Pacific', 'January', 'Confined, then a new task for Aronnax.', 'The Nautilus heads west towards the Indian Ocean.', ''),
 (24, 'The coral cemetery', 'Sea floor', 'A burial on the sea floor.', 'A coral forest on the sea floor where Nemo’s crew bury their dead.', ''),
 (25, 'The Indian Ocean', 'Part Two', 'Into the Indian Ocean.', 'The Indian Ocean, past Keeling Island towards Ceylon.', ''),
 (26, 'Ceylon', 'Gulf of Mannar', 'Off Ceylon’s pearl banks.', 'The Gulf of Mannar off Ceylon (Sri Lanka), famous for its pearl oysters.', 'Pearl diving off Ceylon was dangerous, poorly paid work, done on a single breath.'),
 (28, 'The Red Sea', 'Towards Suez', 'Up the Red Sea.', 'The long, narrow Red Sea, bordered by Arabia and Africa.', 'The Suez Canal was being dug as Verne wrote; it opened in November 1869.'),
 (29, 'The Arabian Tunnel', 'Under the Isthmus of Suez', 'Through a secret tunnel.', 'An underground channel Nemo found beneath the Isthmus of Suez. It is Verne’s invention.', ''),
 (30, 'The Grecian Archipelago', 'Eastern Mediterranean', 'Among the Greek islands.', 'The islands of the eastern Mediterranean, from Crete to Santorini.', 'Crete was in revolt against Ottoman rule in 1866 to 1869, which explains Nemo’s gold.'),
 (31, 'The Mediterranean', 'Two days', 'Racing through the Mediterranean.', 'The enclosed sea Nemo dislikes, crossed at speed.', ''),
 (32, 'Vigo Bay', 'North-west Spain', 'In the bay of the sunken galleons.', 'A bay on the north-west coast of Spain.', 'In 1702 an Anglo-Dutch fleet attacked a Spanish treasure fleet sheltering here; the legend of gold on the bottom of Vigo Bay is real.'),
 (33, 'Atlantis', 'Atlantic floor', 'A night walk to a lost city.', 'The ruins of a drowned city on the Atlantic floor.', 'Plato described Atlantis, a great island that sank into the sea. Verne places it in the Atlantic west of Spain.'),
 (34, 'The hidden volcano', 'Atlantic', 'Inside an extinct volcano.', 'A crater harbour reached by an undersea passage, where Nemo mines coal.', ''),
 (35, 'The Sargasso Sea', 'Central Atlantic', 'Across a sea of weed.', 'A calm region of the Atlantic covered with floating sargassum weed.', ''),
 (36, 'The South Atlantic', 'Heading south', 'Sperm whales and baleen whales.', 'The southern ocean, rich in whales.', ''),
 (37, 'The ice barrier', 'Antarctic', 'Blocked by ice.', 'The edge of the Antarctic pack ice, where earlier explorers turned back.', ''),
 (38, 'The South Pole', '21 March 1868', 'At the bottom of the world.', 'Open sea and rocky land beyond the ice, as Verne imagined the pole.', 'No one actually reached the South Pole until Amundsen in 1911, and it lies on a high frozen plateau, not by the sea.'),
 (39, 'Under the ice', 'Trapped', 'Trapped under the ice.', 'A tunnel of ice that closes around the Nautilus.', ''),
 (41, 'Cape Horn to the Amazon', 'South America', 'North along South America.', 'From the tip of South America to the mouth of the Amazon.', ''),
 (42, 'The Bahamas', 'Caribbean', 'Among the Bahamas.', 'Steep undersea cliffs off the Bahamas, home of the giant squid.', 'Giant squid were thought legendary in Verne’s day; the first were photographed alive only in 2004.'),
 (43, 'The Gulf Stream', 'North Atlantic', 'Riding the Gulf Stream.', 'The warm current that runs from the Gulf of Mexico up the American coast and across the Atlantic.', ''),
 (44, 'Off Ireland', 'North Atlantic', 'Over a famous wreck.', 'The Atlantic off the coast of Ireland.', 'The French ship Le Vengeur du Peuple (the Avenger in the book) sank on 1 June 1794 fighting the British fleet; her crew’s last cry became a patriotic legend.'),
 (45, 'Off the coast of Europe', 'English Channel', 'A warship gives chase.', 'The approaches to the English Channel.', ''),
 (46, 'The Maelstrom', 'Coast of Norway', 'Escape, and the whirlpool.', 'A notorious tidal whirlpool off the Lofoten Islands in Norway.', 'The Moskstraumen is a real and powerful tidal current; writers such as Edgar Allan Poe made it legendary.'),
 (47, 'The Lofoten Islands', 'Norway', 'After the whirlpool.', 'Islands off northern Norway, where fishermen find the survivors.', ''),
]
scenes, gscenes, places = [], [], {}
for ch, label, sub, sset, desc, ctx in SC:
    scenes.append([ch - 1, 0, 0, label, sub])
    gscenes.append({'set': sset, 'sum': G[ch - 1][1].split('. ')[0] + '.'})
    places[label] = {'desc': desc, 'ctx': ctx}

# ---------------- people, cast and character map ----------------
people = {
 'Professor Aronnax': {'look': '', 'about': [[1, 'Pierre Aronnax, assistant professor at the Paris Museum of Natural History and an expert on the ocean depths; he tells the story.'], [6, 'A prisoner on the Nautilus, torn between scientific wonder and the wish to be free.'], [44, 'Comes to see Nemo as both admirable and terrible.']]},
 'Conseil': {'look': '', 'about': [[2, 'Aronnax’s servant: a devoted, unflappable Flemish young man who accompanies him everywhere.'], [6, 'Will not leave his master, even in the sea at night.'], [13, 'Classifies every living thing he sees, though he cannot tell one fish from another by sight.']]},
 'Ned Land': {'look': 'About forty, over six feet tall, strongly built, grave and quiet, but violent when contradicted, with a bold look.', 'about': [[3, 'A Canadian harpooner, the best on the frigate and the only one who doubts the monster exists.'], [8, 'Hates captivity and longs for fresh meat and dry land.'], [29, 'Never stops planning to escape.']]},
 'Captain Nemo': {'look': 'Tall, with a large forehead, straight nose, clearly cut mouth, fine teeth and long, fine hands; black, cold, confident eyes and pale skin. He could be thirty-five or fifty.', 'about': [[9, 'Commander of the Nautilus, a brilliant engineer and scholar who has broken with humanity.'], [26, 'Shows compassion for the poor and the oppressed.'], [44, 'Carries a deep hatred of one nation, and a private grief.']]},
 'Commander Farragut': {'look': '', 'about': [[3, 'Commander of the frigate Abraham Lincoln, absolutely convinced the monster exists.']]},
}
cast = {
 'Professor Aronnax': 'The narrator: a French professor of natural history and expert on the deep sea.',
 'Conseil': 'Aronnax’s calm, devoted servant, forever classifying living things.',
 'Ned Land': 'A Canadian harpooner: strong, blunt, impatient, and set on escape.',
 'Captain Nemo': 'The mysterious commander of the Nautilus, at war with the world above the waves.',
 'Commander Farragut': 'Commander of the US frigate Abraham Lincoln, which hunts the monster.',
 'The engineer': 'The engineer of the Abraham Lincoln.',
}
a_aron = at(r'I had returned from a scientific undertaking', 2)
a_cons = at(r'Conseil was my manservant', 3)
a_ned = at(r'Ned Land was about forty years old', 4)
a_farr = at(r'“Commander Farragut\?”', 3)
a_nemo = at(r'I’m simply Captain Nemo', 10)
a_crew = at(r'eight strapping fellows appeared', 7)
nodes = [
 ['Professor Aronnax', 'Prof. Aronnax', 50, 46, cpw(a_aron)],
 ['Conseil', 'Conseil', 24, 70, cpw(a_cons)],
 ['Ned Land', 'Ned Land', 76, 70, cpw(a_ned)],
 ['Commander Farragut', 'Cmdr. Farragut', 78, 16, cpw(a_farr)],
 ['Captain Nemo', 'Captain Nemo', 22, 18, cpw(a_nemo)],
 ['The crew', 'The crew', 50, 90, cpw(a_crew)],
]
edges = [
 ['Conseil', 'Professor Aronnax', 'his devoted servant', cpw(a_cons)],
 ['Ned Land', 'Professor Aronnax', 'shipmate, then fellow prisoner and friend', cpw(a_ned)],
 ['Commander Farragut', 'Professor Aronnax', 'his host on the frigate', cpw(a_farr)],
 ['Commander Farragut', 'Ned Land', 'hired Ned as harpooner', cpw(a_ned)],
 ['Conseil', 'Ned Land', 'friends; Conseil calms Ned', cpw(at(r'“Calm down, Ned,”', 8))],
 ['Captain Nemo', 'Professor Aronnax', 'captor and host; they share a love of the sea', cpw(a_nemo)],
 ['Captain Nemo', 'Ned Land', 'captor; Ned’s constant enemy', cpw(a_nemo)],
 ['Captain Nemo', 'The crew', 'their commander; they speak an unknown language', cpw(a_nemo)],
]
cast['The crew'] = 'The men of the Nautilus, loyal to Nemo, who speak a language no one can identify.'

# ---------------- background notes ----------------
context = [
 [0, 'The author', 'Jules Verne (1828–1905) published Twenty Thousand Leagues under the Sea as a magazine serial in 1869–70. This is F. P. Walter’s complete, unabridged translation (1999), made from the original French editions of 1869–71.'],
 [0, 'What the title means', 'The 20,000 leagues are the distance travelled under the sea, not the depth. A league here is about 4 kilometres (2.5 miles), so the voyage covers some 80,000 km, about twice round the world.'],
 [1, 'Narwhals', 'The narwhal is a real Arctic whale whose males grow a long spiral tusk. Aronnax imagines a gigantic one strong enough to pierce a ship.'],
 [3, 'Units at sea', 'A fathom is 6 feet (1.8 m); a cable is a tenth of a nautical mile; a knot is one nautical mile an hour. This translation keeps Verne’s metric units: a metre is about 3.3 feet, and a kilometre about 0.6 miles.'],
 [7, 'Mobilis in mobili', 'The ship’s Latin motto means roughly “moving in the moving element”: free within the sea.'],
 [11, 'Electricity in the 1860s', 'When Verne wrote, electricity was a new science, used mostly for the telegraph. A ship powered entirely by it was a bold leap of imagination.'],
 [13, 'Classifying life', 'Conseil names animals by branch, class, order and genus, the system of classification naturalists used, which Aronnax had taught him.'],
 [18, 'La Pérouse', 'Jean-François de La Pérouse led a French voyage of exploration that vanished in 1788. Its fate was a famous mystery for decades.'],
 [27, 'The Suez Canal', 'The canal linking the Mediterranean and the Red Sea was built by Ferdinand de Lesseps and opened in 1869, the year this book began to appear.'],
 [32, 'Atlantis', 'Plato’s legend of a rich island that sank into the sea in a single day. Verne lets his characters find its ruins.'],
 [43, 'The transatlantic cable', 'The first lasting telegraph cable between Ireland and Newfoundland was laid by the ship Great Eastern in 1866.'],
 [45, 'Who is Nemo?', 'In this book Verne never reveals Nemo’s nationality or past. “Nemo” is Latin for “no one”.'],
]

# ---------------- extras: the voyage, depths and the Nautilus ----------------
def proj(lat, lon):
    x = lon + 120
    if x < 0: x += 360
    return [round(x, 1), round(80 - lat, 1)]
VOY = [  # name, lat, lon, anchor, mode, note, quote phrase found near the anchor
 ('New York', 40.7, -74.0, at(r'dark waters of the Atlantic', 3), 'ship', 'The Abraham Lincoln sets out to hunt the monster.', ''),
 ('Cape Horn', -56.0, -67.3, at(r'maneuvered instead to double Cape Horn', 5), 'ship', 'The frigate rounds the tip of South America into the Pacific.', ''),
 ('Off Japan', 31.25, 136.7, at(r'latitude 31 degrees 15′ north', 5), 'ship', 'Months of search in the North Pacific; here the frigate meets the “monster”.', 'latitude 31 degrees 15′ north and longitude 136 degrees 42′ east'),
 ('Off Japan', 33.0, 140.5, at(r'yellowish near the landing places of Japan', 14), 'nautilus', 'The Nautilus takes its starting bearings off Japan.', 'a little yellowish near the landing places of Japan'),
 ('Crespo Island', 32.67, -167.83, at(r'latitude 32 degrees 40′ north', 15), 'nautilus', 'Its “forests” are under the sea.', 'latitude 32 degrees 40′ north and longitude 167 degrees 50′ west'),
 ('Hawaii', 19.6, -155.5, at(r'in sight of the Hawaiian Islands', 18), 'nautilus', 'The Hawaiian Islands, where Captain Cook died.', 'By then we had fared 4,860 leagues from our starting point.'),
 ('Tuamotu Islands', -18.5, -136.5, at(r'we raised the Tuamotu Islands', 19), 'nautilus', 'The “dangerous group” of low coral islands.', ''),
 ('Vanikoro', -11.65, 166.9, at(r'just one word: “Vanikoro\.”', 19), 'nautilus', 'Where La Pérouse was wrecked.', ''),
 ('Torres Strait', -9.9, 142.5, at(r'Gueboroa Island', 21), 'nautilus', 'The Nautilus runs aground on the reefs.', ''),
 ('Keeling Island', -12.08, 94.55, at(r'we raised Keeling Island', 25), 'nautilus', 'A coral island in the Indian Ocean.', 'we raised Keeling Island'),
 ('Ceylon', 8.9, 79.5, at(r'we were off the island of Ceylon', 26), 'nautilus', 'The pearl fisheries of the Gulf of Mannar.', 'we were off the island of Ceylon'),
 ('Laccadives', 11.0, 72.0, at(r'we had fared 16,220 miles', 28), 'nautilus', 'Heading for the Red Sea.', 'we had fared 16,220 miles, or 7,500 leagues'),
 ('Red Sea', 21.5, 39.2, at(r'latitude 21 degrees 30′ north', 29), 'nautilus', 'Off Jidda, on the Arabian coast.', 'at latitude 21 degrees 30′ north, the Nautilus was afloat on the surface'),
 ('Arabian Tunnel', 31.2, 32.3, at(r'“The Mediterranean,” he told me', 29), 'nautilus', 'Under the Isthmus of Suez into the Mediterranean.', '“The Mediterranean,” he told me.'),
 ('Santorini', 36.4, 25.4, at(r'Near the island of Santorini', 30), 'nautilus', 'Boiling water over an undersea volcano.', 'Near the island of Santorini'),
 ('Gibraltar', 35.95, -5.6, at(r'cleared the Strait of Gibraltar', 31), 'nautilus', 'Out of the Mediterranean in forty-eight hours.', 'we cleared the Strait of Gibraltar by sunrise on the 18th'),
 ('Vigo Bay', 42.25, -8.8, at(r'the galleons entered the Bay of Vigo', 32), 'nautilus', 'The sunken treasure galleons.', 'the galleons entered the Bay of Vigo'),
 ('Atlantis', 33.0, -20.0, at(r'scrawled this one word: ATLANTIS', 33), 'nautilus', 'The drowned city. Its position is approximate.', 'ATLANTIS'),
 ('Sargasso Sea', 30.0, -50.0, at(r'called the Sargasso Sea', 35), 'nautilus', 'A sea of floating weed.', ''),
 ('The great dive', -45.62, -37.88, at(r'latitude 45 degrees 37′ south', 35), 'nautilus', 'Where the Nautilus dives 16,000 metres.', 'latitude 45 degrees 37′ south and longitude 37 degrees 53′ west'),
 ('The ice barrier', -67.65, -51.5, at(r'longitude 51 degrees 30′ and latitude 67 degrees 39′', 37), 'nautilus', 'Blocked by the Antarctic ice.', 'longitude 51 degrees 30′ and latitude 67 degrees 39′ south'),
 ('South Pole', -89.5, -45.0, at(r'“The South Pole!” Captain Nemo replied', 38), 'nautilus', 'Reached on 21 March 1868.', '“The South Pole!” Captain Nemo replied'),
 ('Cape Horn', -56.0, -67.3, at(r'the promontory of Cape Horn', 41), 'nautilus', 'Back round the tip of South America.', 'the promontory of Cape Horn'),
 ('The Amazon', 0.0, -50.0, at(r'mouth of the Amazon River', 41), 'nautilus', 'Off the vast mouth of the Amazon.', 'the shore reappeared at the mouth of the Amazon River'),
 ('The Bahamas', 25.0, -77.3, at(r'island group of the Bahamas', 42), 'nautilus', 'Where the giant devilfish attack.', 'The nearest land was the island group of the Bahamas'),
 ('Newfoundland', 44.5, -50.0, at(r'Grand Banks of Newfoundland', 44), 'nautilus', 'Over the transatlantic cable.', 'off the southern tip of the Grand Banks of Newfoundland'),
 ('The Avenger', 47.4, -17.47, at(r'latitude 47 degrees 24′ and longitude 17 degrees 28′', 44), 'nautilus', 'The wreck of the French warship.', 'latitude 47 degrees 24′ and longitude 17 degrees 28′'),
 ('The Maelstrom', 67.8, 12.8, at(r'off the Norwegian coast', 46), 'nautilus', 'The whirlpool off the Lofoten Islands.', 'Were we lying in the dangerous waterways off the Norwegian coast?'),
]
for v in VOY:
    if v[6]: check(v[6], v[3])
voyage = {'w': 360, 'h': 172, 'route': [[n, *proj(la, lo), i, mode, note, q] for n, la, lo, i, mode, note, q in VOY]}
# world coastline (Natural Earth 1:110m via world-atlas), projected with the map cut at 120°W
topo = json.load(open('countries-110m.json'))
sx, sy = topo['transform']['scale']; tx, ty = topo['transform']['translate']
arcs = []
for a in topo['arcs']:
    x = y = 0; pts = []
    for dx, dy in a: x += dx; y += dy; pts.append((x * sx + tx, y * sy + ty))
    arcs.append(pts)
def ring(idx):
    out = []
    for kk in idx:
        p = arcs[kk] if kk >= 0 else arcs[~kk][::-1]
        out += p[1:] if out else p
    return out
def simplify(pts, eps):
    if len(pts) < 3: return pts
    a, b = pts[0], pts[-1]; dmax, idx = 0, 0
    for i in range(1, len(pts) - 1):
        p = pts[i]
        dd = abs((b[0]-a[0])*(a[1]-p[1]) - (a[0]-p[0])*(b[1]-a[1])) / (math.hypot(b[0]-a[0], b[1]-a[1]) or 1)
        if dd > dmax: dmax, idx = dd, i
    if dmax > eps: return simplify(pts[:idx + 1], eps)[:-1] + simplify(pts[idx:], eps)
    return [a, b]
land = []
for g in topo['objects']['countries']['geometries']:
    polys = g['arcs'] if g['type'] == 'MultiPolygon' else ([g['arcs']] if g['type'] == 'Polygon' else [])
    for poly in polys:
        r = ring(poly[0])
        full = [(lon + 120, 80 - lat) for lon, lat in r]
        mid = len(full) // 2  # a closed ring has no chord to measure against, so simplify it in two halves
        pts = simplify(full[:mid + 1], 0.35)[:-1] + simplify(full[mid:], 0.35)
        pts = [(round(x, 1), round(y, 1)) for x, y in pts]
        xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
        if len(pts) < 4 or (max(xs) - min(xs) < 1.2 and max(ys) - min(ys) < 1.2): continue
        land.append('M' + 'L'.join(f'{x:g},{y:g}' for x, y in pts) + 'Z')
voyage['land'] = ''.join(land)
LEAGUES = [  # Verne's own running totals
 (at(r'we had fared 4,860 leagues', 18), 4860, 'By then we had fared 4,860 leagues from our starting point.'),
 (at(r'hence 5,250 leagues', 20), 5250, 'we had fared 11,340 miles, hence 5,250 leagues'),
 (at(r'we had fared 16,220 miles', 28), 7500, 'we had fared 16,220 miles, or 7,500 leagues'),
 (at(r'fared nearly 13,000 leagues', 35), 13000, 'By then we had fared nearly 13,000 leagues'),
 (at(r'We had fared 17,000 leagues', 42), 17000, 'We had fared 17,000 leagues'),
 (at(r'I’ve cleared 20,000 leagues', 47), 20000, 'I’ve cleared 20,000 leagues'),
]
for i, n, q in LEAGUES: check(q, i)
voyage['leagues'] = [[sent_end(i), n, q] for i, n, q in LEAGUES]
DEPTH = [  # anchor, metres, quote, note, label
 (at(r'We reached a depth of 100 meters', 16), 100, 'We reached a depth of 100 meters', 'Walking on the sea floor off Crespo Island.', 'Sea-floor walk, Crespo'),
 (at(r'sitting at a depth of 1,000 meters', 18), 1000, 'it was sitting at a depth of 1,000 meters', 'Cruising the deep Pacific.', 'Deep Pacific cruise'),
 (at(r'we reached a depth of about 300 meters', 24), 300, 'we reached a depth of about 300 meters', 'The walk to the coral cemetery.', 'Coral cemetery walk'),
 (at(r'floor of the Atlantic, 300 meters down', 33), 300, 'we set foot on the floor of the Atlantic, 300 meters down', 'The night walk to Atlantis.', 'Night walk to Atlantis'),
 (at(r'We reached a depth of 16,000 meters', 35), 16000, 'We reached a depth of 16,000 meters', 'The great dive in the South Atlantic: deeper than the deepest real ocean trench, about 11,000 metres.', 'The great dive'),
 (at(r'icy bottom at a depth of 350 meters', 40), 350, 'rested on the icy bottom at a depth of 350 meters', 'Trapped beneath the Antarctic ice.', 'Under the Antarctic ice'),
 (at(r'2,800 meters down', 44), 2800, '2,800 meters down, that I spotted this cable', 'Over the transatlantic telegraph cable.', 'Over the Atlantic cable'),
]
for i, m, q, n, l in DEPTH: check(q, i)
depths = [[sent_end(i), m, q, n, l] for i, m, q, n, l in DEPTH]
VESSEL = [  # anchor, label, value, note
 (at(r'“12,000, Professor Aronnax', 11), 'Library', '12,000 books', 'Nemo’s only remaining ties with dry land.'),
 (at(r'This force is electricity', 12), 'Power', 'Electricity', 'Made on board, from the sea itself.'),
 (at(r'A speed of fifty miles per hour', 12), 'Top speed', '50 miles an hour', ''),
 (at(r'exactly seventy meters', 13), 'Length', '70 metres (230 feet)', 'Shaped like a cigar, with conical ends.'),
 (at(r'breadth of beam is eight meters', 13), 'Breadth', '8 metres (26 feet)', ''),
 (at(r'or weighs 1,500 metric tons', 13), 'Weight', '1,500 metric tons', 'Sinks or floats by filling and emptying its tanks.'),
 (at(r'made up of two hulls', 13), 'Hull', 'Double, of steel', 'The two hulls are joined so firmly they act as one solid block.'),
 (at(r'I set up my workshops on a deserted islet', 13), 'Built', 'In secret, on a deserted island', 'From parts ordered from many countries under false names.'),
]
vessel = [[sent_end(i), l, v, n] for i, l, v, n in VESSEL]

# ---------------- assemble ----------------
out = {
 'chs': chs, 'spk': spk, 'scenes': scenes, 'dict': d['dict'], 'pre': d['pre'],
 'map': {'nodes': nodes, 'edges': edges}, 'cast': cast,
 'guide': {'chapters': [{'pre': p, 'sum': s} for p, s in G], 'scenes': gscenes, 'people': people, 'places': places,
           'context': context, 'voyage': voyage, 'depths': depths, 'vessel': vessel},
}
json.dump(out, open('/home/user/Fixate/books/tl.json', 'w'), ensure_ascii=False, separators=(',', ':'))
import os
print('words', N, '| scenes', len(scenes), '| voyage stops', len(VOY), '| land chars', len(voyage['land']), '| size', os.path.getsize('/home/user/Fixate/books/tl.json'))
