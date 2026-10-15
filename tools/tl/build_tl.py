# Builds books/tl.json (Twenty Thousand Leagues under the Sea) from the parsed, annotated and
# hand-labelled chapters, plus the reading guide and the book's own extras: the voyage map with the
# leagues travelled, the depths reached and the Nautilus fact card. Every anchor is found by searching
# the text itself, so each fact appears only once the reader has reached it.
import json, math, re, sys
from tfind import find, W, CH

d = json.load(open('labelled.json'))
chs, spk = d['chs'], d['spk']
chs[21]['s'] = '“Ægri Somnia”'
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
  "The commander says he has broken with humanity and its laws. They may move freely on board but may never leave, since they know his secret. He names himself Captain Nemo and shows Aronnax his ship: a library of 12,000 books, a saloon of paintings and a museum of marine treasures."),
 ("How does the Nautilus work? Nemo explains.",
  "Nemo shows his instruments and explains that the Nautilus runs entirely on electricity, made with elements drawn from sea water. It lights, heats and drives the ship at up to fifty miles an hour, and serves a small boat stowed in the hull."),
 ("The vessel's measurements, and some of its secrets.",
  "Nemo describes the Nautilus: 232 feet long, 26 feet wide, 1,500 tons, with a double hull and tanks that let it dive and rise. He built it in secret on a desert island from parts ordered all over the world. Its collision with the Scotia was an accident."),
 ("The voyage proper begins near Japan. Watch the ocean through the saloon windows.",
  "The Nautilus takes its bearings off Japan and follows the Kuro-Scivo, a warm current Aronnax calls the Black River. The saloon panels open on the lit sea, and Ned and Conseil share Aronnax's wonder at the life outside."),
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
  "Crossing the reef-strewn Torres Strait, the Nautilus runs aground near the island of Gilboa. Nemo calmly waits for the full-moon tide, and Aronnax gets permission for the three of them to go ashore meanwhile."),
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
  "Near Ceylon, Nemo invites them to visit the pearl banks of Manaar and casually asks if they fear sharks. Aronnax explains to his friends how pearls form, while trying to hide his own nerves."),
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
  "The Nautilus crosses the still, weed-choked Sargasso Sea and heads far south. In the South Atlantic it dives to an astonishing 16,000 yards, and Nemo photographs the sea floor."),
 ("Ned sees whales. What does Nemo think of hunting?",
  "Ned longs to hunt the southern whales, but Nemo refuses to kill for nothing. When savage cachalots attack the whales, Nemo drives the Nautilus's steel spur through them in a bloody massacre. Ned calls it butchery, and his resentment of Nemo grows."),
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
 ("Off the Bahamas, tales of giant poulps.",
  "The friends argue about legends of giant poulps (squid). Then a pack of them attacks and one jams the propeller. The crew fight them on the platform with axes; a sailor is seized and carried off crying for help in French, and Nemo weeps for him."),
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
 (14, 'Crespo Island', 'North Pacific', 'An invitation to hunt.', 'A small island in the North Pacific; its “forests” are under the sea.', ''),
 (17, 'The Pacific', 'Towards the south seas', 'Crossing the Pacific.', 'The deep Pacific, past Hawaii towards the south seas.', ''),
 (18, 'Vanikoro', 'Santa Cruz Islands', 'At the islands where La Pérouse disappeared.', 'Islands in the south-west Pacific, ringed with coral reefs.', 'The French explorer La Pérouse vanished in 1788; his wrecks at Vanikoro were identified decades later by Peter Dillon and Dumont d’Urville.'),
 (19, 'Torres Strait', 'Between Australia and New Guinea', 'Threading a dangerous strait.', 'The reef-strewn strait between Australia and New Guinea, feared by sailors.', ''),
 (20, 'Gilboa Island', 'Off New Guinea', 'Ashore on a tropical island.', 'A wooded island near the stranded Nautilus, with fruit, birds and game.', ''),
 (22, 'Beneath the Pacific', 'January', 'Confined, then a new task for Aronnax.', 'The Nautilus heads west towards the Indian Ocean.', ''),
 (23, 'The coral cemetery', 'Sea floor', 'A burial on the sea floor.', 'A coral forest on the sea floor where Nemo’s crew bury their dead.', ''),
 (24, 'The Indian Ocean', 'Part Two', 'Into the Indian Ocean.', 'The Indian Ocean, past Keeling Island towards Ceylon.', ''),
 (25, 'Ceylon', 'Bank of Manaar', 'Off Ceylon’s pearl banks.', 'The Gulf of Manaar off Ceylon (Sri Lanka), famous for its pearl oysters.', 'Pearl diving off Ceylon was dangerous, poorly paid work, done on a single breath.'),
 (27, 'The Red Sea', 'Towards Suez', 'Up the Red Sea.', 'The long, narrow Red Sea, bordered by Arabia and Africa.', 'The Suez Canal was being dug as Verne wrote; it opened in November 1869.'),
 (28, 'The Arabian Tunnel', 'Under the Isthmus of Suez', 'Through a secret tunnel.', 'An underground channel Nemo found beneath the Isthmus of Suez. It is Verne’s invention.', ''),
 (29, 'The Grecian Archipelago', 'Eastern Mediterranean', 'Among the Greek islands.', 'The islands of the eastern Mediterranean, from Crete to Santorini.', 'Crete was in revolt against Ottoman rule in 1866 to 1869, which explains Nemo’s gold.'),
 (30, 'The Mediterranean', 'Two days', 'Racing through the Mediterranean.', 'The enclosed sea Nemo dislikes, crossed at speed.', ''),
 (31, 'Vigo Bay', 'North-west Spain', 'In the bay of the sunken galleons.', 'A bay on the north-west coast of Spain.', 'In 1702 an Anglo-Dutch fleet attacked a Spanish treasure fleet sheltering here; the legend of gold on the bottom of Vigo Bay is real.'),
 (32, 'Atlantis', 'Atlantic floor', 'A night walk to a lost city.', 'The ruins of a drowned city on the Atlantic floor.', 'Plato described Atlantis, a great island that sank into the sea. Verne places it in the Atlantic west of Spain.'),
 (33, 'The hidden volcano', 'Atlantic', 'Inside an extinct volcano.', 'A crater harbour reached by an undersea passage, where Nemo mines coal.', ''),
 (34, 'The Sargasso Sea', 'Central Atlantic', 'Across a sea of weed.', 'A calm region of the Atlantic covered with floating sargassum weed.', ''),
 (35, 'The South Atlantic', 'Heading south', 'Whales and cachalots.', 'The southern ocean, rich in whales.', ''),
 (36, 'The ice barrier', 'Antarctic', 'Blocked by ice.', 'The edge of the Antarctic pack ice, where earlier explorers turned back.', ''),
 (37, 'The South Pole', '21 March 1868', 'At the bottom of the world.', 'Open sea and rocky land beyond the ice, as Verne imagined the pole.', 'No one actually reached the South Pole until Amundsen in 1911, and it lies on a high frozen plateau, not by the sea.'),
 (38, 'Under the ice', 'Trapped', 'Trapped under the ice.', 'A tunnel of ice that closes around the Nautilus.', ''),
 (40, 'Cape Horn to the Amazon', 'South America', 'North along South America.', 'From the tip of South America to the mouth of the Amazon.', ''),
 (41, 'The Bahamas', 'Caribbean', 'Among the Bahamas.', 'Steep undersea cliffs off the Bahamas, home of the giant squid.', 'Giant squid were thought legendary in Verne’s day; the first were photographed alive only in 2004.'),
 (42, 'The Gulf Stream', 'North Atlantic', 'Riding the Gulf Stream.', 'The warm current that runs from the Gulf of Mexico up the American coast and across the Atlantic.', ''),
 (43, 'Off Ireland', 'North Atlantic', 'Over a famous wreck.', 'The Atlantic off the coast of Ireland.', 'The French ship Le Vengeur du Peuple sank on 1 June 1794 fighting the British fleet; her crew’s last cry became a patriotic legend.'),
 (44, 'Off the coast of Europe', 'English Channel', 'A warship gives chase.', 'The approaches to the English Channel.', ''),
 (45, 'The Maelstrom', 'Coast of Norway', 'Escape, and the whirlpool.', 'A notorious tidal whirlpool off the Lofoten Islands in Norway.', 'The Moskstraumen is a real and powerful tidal current; writers such as Edgar Allan Poe made it legendary.'),
 (46, 'The Lofoten Islands', 'Norway', 'After the whirlpool.', 'Islands off northern Norway, where fishermen find the survivors.', ''),
]
scenes, gscenes, places = [], [], {}
for ch, label, sub, sset, desc, ctx in SC:
    scenes.append([ch - 1, 0, 0, label, sub])
    gscenes.append({'set': sset, 'sum': G[ch - 1][1].split('. ')[0] + '.'})
    places[label] = {'desc': desc, 'ctx': ctx}

# ---------------- people, cast and character map ----------------
people = {
 'Professor Aronnax': {'look': '', 'about': [[1, 'Pierre Aronnax, assistant professor at the Paris Museum of Natural History and an expert on the ocean depths; he tells the story.'], [6, 'A prisoner on the Nautilus, torn between scientific wonder and the wish to be free.'], [43, 'Comes to see Nemo as both admirable and terrible.']]},
 'Conseil': {'look': '', 'about': [[2, 'Aronnax’s servant: a devoted, unflappable Flemish young man who accompanies him everywhere.'], [6, 'Will not leave his master, even in the sea at night.'], [12, 'Classifies every living thing he sees, though he cannot tell one fish from another by sight.']]},
 'Ned Land': {'look': 'About forty, over six feet tall, strongly built, grave and quiet, but violent when contradicted, with a bold look.', 'about': [[3, 'A Canadian harpooner, the best on the frigate and the only one who doubts the monster exists.'], [8, 'Hates captivity and longs for fresh meat and dry land.'], [28, 'Never stops planning to escape.']]},
 'Captain Nemo': {'look': 'Tall, with a large forehead, straight nose, clearly cut mouth, fine teeth and long, fine hands; black, cold, confident eyes and pale skin. He could be thirty-five or fifty.', 'about': [[9, 'Commander of the Nautilus, a brilliant engineer and scholar who has broken with humanity.'], [25, 'Shows compassion for the poor and the oppressed.'], [43, 'Carries a deep hatred of one nation, and a private grief.']]},
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
a_aron = at(r'I had just returned from a scientific research', 2)
a_cons = at(r'Conseil was my servant', 3)
a_ned = at(r'Ned Land was about forty years of age', 4)
a_farr = at(r'Commander Farragut\?', 3)
a_nemo = at(r'I am nothing to you but Captain Nemo', 10)
a_crew = at(r'eight strong men, with masked faces', 7)
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
 ['Conseil', 'Ned Land', 'friends; Conseil calms Ned', cpw(at(r'Calm yourself, friend Ned', 8))],
 ['Captain Nemo', 'Professor Aronnax', 'captor and host; they share a love of the sea', cpw(a_nemo)],
 ['Captain Nemo', 'Ned Land', 'captor; Ned’s constant enemy', cpw(a_nemo)],
 ['Captain Nemo', 'The crew', 'their commander; they speak an unknown language', cpw(a_nemo)],
]
cast['The crew'] = 'The men of the Nautilus, loyal to Nemo, who speak a language no one can identify.'

# ---------------- background notes ----------------
context = [
 [0, 'The author', 'Jules Verne (1828–1905) published Twenty Thousand Leagues under the Sea as a magazine serial in 1869–70. This is an early public-domain English translation, shorter in places than the French original.'],
 [0, 'What the title means', 'The 20,000 leagues are the distance travelled under the sea, not the depth. A league here is about 4 kilometres (2.5 miles), so the voyage covers some 80,000 km, about twice round the world.'],
 [1, 'Narwhals', 'The narwhal is a real Arctic whale whose males grow a long spiral tusk. Aronnax imagines a gigantic one strong enough to pierce a ship.'],
 [3, 'Units at sea', 'A fathom is 6 feet (1.8 m); a cable is a tenth of a nautical mile; a knot is one nautical mile an hour. The translation mixes miles, yards, feet and fathoms.'],
 [7, 'Mobilis in mobili', 'The ship’s Latin motto means roughly “moving in the moving element”: free within the sea.'],
 [10, 'Electricity in the 1860s', 'When Verne wrote, electricity was a new science, used mostly for the telegraph. A ship powered entirely by it was a bold leap of imagination.'],
 [12, 'Classifying life', 'Conseil names animals by branch, class, order and genus, the system of classification naturalists used, which Aronnax had taught him.'],
 [17, 'La Pérouse', 'Jean-François de La Pérouse led a French voyage of exploration that vanished in 1788. Its fate was a famous mystery for decades.'],
 [26, 'The Suez Canal', 'The canal linking the Mediterranean and the Red Sea was built by Ferdinand de Lesseps and opened in 1869, the year this book began to appear.'],
 [31, 'Atlantis', 'Plato’s legend of a rich island that sank into the sea in a single day. Verne lets his characters find its ruins.'],
 [42, 'The transatlantic cable', 'The first lasting telegraph cable between Ireland and Newfoundland was laid by the ship Great Eastern in 1866.'],
 [44, 'Who is Nemo?', 'In this book Verne never reveals Nemo’s nationality or past. “Nemo” is Latin for “no one”.'],
]

# ---------------- extras: the voyage, depths and the Nautilus ----------------
def proj(lat, lon):
    x = lon + 120
    if x < 0: x += 360
    return [round(x, 1), round(80 - lat, 1)]
VOY = [  # name, lat, lon, anchor, mode, note, quote phrase found near the anchor
 ('New York', 40.7, -74.0, at(r'dark waters of the Atlantic', 3), 'ship', 'The Abraham Lincoln sets out to hunt the monster.', ''),
 ('Cape Horn', -56.0, -67.3, at(r'doubled Cape Horn', 5), 'ship', 'The frigate rounds the tip of South America into the Pacific.', ''),
 ('Off Japan', 31.25, 136.7, at(r'31° 15′ north latitude', 5), 'ship', 'Months of search in the North Pacific; here the frigate meets the “monster”.', '31° 15′ north latitude and 136° 42′ east longitude'),
 ('Off Japan', 33.0, 140.5, at(r'yellowed by the Japanese coast', 13), 'nautilus', 'The Nautilus takes its starting bearings off Japan.', 'slightly yellowed by the Japanese coast'),
 ('Crespo Island', 32.67, -157.83, at(r'32° 40′ north lat', 14), 'nautilus', 'Its “forests” are under the sea.', 'in 32° 40′ north lat. and 157° 50′ west long.'),
 ('Hawaii', 19.6, -155.5, at(r'sighted the Sandwich Islands', 17), 'nautilus', 'The Sandwich Islands, now Hawaii.', 'We had then gone 4,860 leagues from our starting-point.'),
 ('Tuamotu Islands', -18.5, -136.5, at(r'Island of Clermont-Tonnere', 18), 'nautilus', 'The “dangerous group” of low coral islands.', ''),
 ('Vanikoro', -11.65, 166.9, at(r'“Vanikoro\.”', 18), 'nautilus', 'Where La Pérouse was wrecked.', ''),
 ('Torres Strait', -9.9, 142.5, at(r'steered for the Island of Gilboa', 19), 'nautilus', 'The Nautilus runs aground on the reefs.', ''),
 ('Keeling Island', -12.08, 94.55, at(r'we observed Keeling Island', 24), 'nautilus', 'A coral island in the Indian Ocean.', '12° 5′ S. lat., and 94° 33′ long., we observed Keeling Island'),
 ('Ceylon', 8.9, 79.5, at(r'nearing the island of Ceylon', 25), 'nautilus', 'The pearl banks of Manaar.', 'we were nearing the island of Ceylon'),
 ('Laccadives', 11.0, 72.0, at(r'We had made 16,220 miles', 27), 'nautilus', 'Heading for the Red Sea.', 'We had made 16,220 miles, or 7,500 (French) leagues'),
 ('Red Sea', 21.5, 39.2, at(r'in 21° 30′ N\. lat\.', 28), 'nautilus', 'Off Djeddah, on the Arabian coast.', 'in 21° 30′ N. lat., the Nautilus floated on the surface of the sea'),
 ('Arabian Tunnel', 31.2, 32.3, at(r'turning to me, said: “The Mediterranean!”', 28), 'nautilus', 'Under the Isthmus of Suez into the Mediterranean.', '“The Mediterranean!”'),
 ('Santorini', 36.4, 25.4, at(r'Near the Island of Santorin', 29), 'nautilus', 'Boiling water over an undersea volcano.', 'Near the Island of Santorin'),
 ('Gibraltar', 35.95, -5.6, at(r'crossed the Straits of Gibraltar', 30), 'nautilus', 'Out of the Mediterranean in forty-eight hours.', 'we had crossed the Straits of Gibraltar by sunrise on the 18th'),
 ('Vigo Bay', 42.25, -8.8, at(r'we are in that Vigo Bay', 31), 'nautilus', 'The sunken treasure galleons.', 'we are in that Vigo Bay'),
 ('Atlantis', 33.0, -20.0, at(r'traced the one word: ATLANTIS', 32), 'nautilus', 'The drowned city. Its position is approximate.', 'ATLANTIS'),
 ('Sargasso Sea', 30.0, -50.0, at(r'called the Sargasso Sea', 34), 'nautilus', 'A sea of floating weed.', ''),
 ('The great dive', -45.62, -37.88, at(r'45° 37′ S\. lat', 34), 'nautilus', 'Where the Nautilus dives 16,000 yards.', '45° 37′ S. lat., and 37° 53′ W. long.'),
 ('The ice barrier', -67.65, -51.5, at(r'51° 30′ long\. and 67° 39′', 36), 'nautilus', 'Blocked by the Antarctic ice.', '51° 30′ long. and 67° 39′ of S. lat.'),
 ('South Pole', -89.5, -45.0, at(r'“The South Pole!” replied Captain Nemo', 37), 'nautilus', 'Reached on 21 March 1868.', '“The South Pole!” replied Captain Nemo'),
 ('Cape Horn', -56.0, -67.3, at(r'shaped for Cape Horn', 40), 'nautilus', 'Back round the tip of South America.', 'the course shaped for Cape Horn'),
 ('The Amazon', 0.0, -50.0, at(r'mouth of the Amazon River', 40), 'nautilus', 'Off the vast mouth of the Amazon.', 'land appeared at the mouth of the Amazon River'),
 ('The Bahamas', 25.0, -77.3, at(r'archipelago of the Bahamas', 41), 'nautilus', 'Where the giant poulps attack.', 'The land nearest us was the archipelago of the Bahamas.'),
 ('Newfoundland', 44.5, -50.0, at(r'Bank of Newfoundland', 43), 'nautilus', 'Over the transatlantic cable.', 'the extreme south of the Bank of Newfoundland'),
 ('The Avenger', 47.4, -17.47, at(r'latitude 47° 24′, longitude 17° 28′', 43), 'nautilus', 'The wreck of the French warship.', 'in latitude 47° 24′, longitude 17° 28′'),
 ('The Maelstrom', 67.8, 12.8, at(r'dangerous coast of Norway', 45), 'nautilus', 'The whirlpool off the Lofoten Islands.', 'We were then upon the dangerous coast of Norway.'),
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
 (at(r'We had then gone 4,860 leagues', 17), 4860, 'We had then gone 4,860 leagues from our starting-point.'),
 (at(r'5,250 French leagues', 19), 5250, 'we had made 11,340 miles, or 5,250 French leagues'),
 (at(r'We had made 16,220 miles', 27), 7500, 'We had made 16,220 miles, or 7,500 (French) leagues'),
 (at(r'about 13,000 leagues', 34), 13000, 'We had then made about 13,000 leagues'),
 (at(r'We had travelled 17,000 leagues', 41), 17000, 'We had travelled 17,000 leagues'),
 (at(r'I have crossed 20,000 leagues', 46), 20000, 'I have crossed 20,000 leagues'),
]
for i, n, q in LEAGUES: check(q, i)
voyage['leagues'] = [[sent_end(i), n, q] for i, n, q in LEAGUES]
DEPTH = [  # anchor, metres, quote, note
 (at(r'a depth of a hundred and five yards', 15), 96, 'We were at a depth of a hundred and five yards', 'Walking on the sea floor off Crespo Island.', 'Sea-floor walk, Crespo'),
 (at(r'it kept at a depth of 1,000 yards', 17), 914, 'it kept at a depth of 1,000 yards', 'Cruising the deep Pacific.', 'Deep Pacific cruise'),
 (at(r'attained a depth of about three hundred yards', 23), 274, 'we had attained a depth of about three hundred yards', 'The walk to the coral cemetery.', 'Coral cemetery walk'),
 (at(r'bottom of the Atlantic at a depth of 150 fathoms', 32), 274, 'we set foot on the bottom of the Atlantic at a depth of 150 fathoms', 'The night walk to Atlantis.', 'Night walk to Atlantis'),
 (at(r'a depth of 16,000 yards', 34), 14630, 'We had attained a depth of 16,000 yards (four leagues)', 'The great dive in the South Atlantic: deeper than the deepest real ocean trench, about 11,000 metres.', 'The great dive'),
 (at(r'rested on the ice at a depth of 350 yards', 39), 320, 'rested on the ice at a depth of 350 yards', 'Trapped beneath the Antarctic ice.', 'Under the Antarctic ice'),
 (at(r'at a depth of more than 1,400 fathoms', 43), 2560, 'at a depth of more than 1,400 fathoms', 'Over the transatlantic telegraph cable.', 'Over the Atlantic cable'),
]
for i, m, q, n, l in DEPTH: check(q, i)
depths = [[sent_end(i), m, q, n, l] for i, m, q, n, l in DEPTH]
VESSEL = [  # anchor, label, value, note
 (at(r'Twelve thousand, M\. Aronnax', 10), 'Library', '12,000 books', 'Nemo’s only ties to the world above.'),
 (at(r'This agent is electricity', 11), 'Power', 'Electricity', 'Made on board, from the sea itself.'),
 (at(r'A speed of fifty miles an hour', 11), 'Top speed', '50 miles an hour', ''),
 (at(r'exactly 232 feet', 12), 'Length', '232 feet (70 m)', 'Shaped like a cigar, with conical ends.'),
 (at(r'maximum breadth is twenty-six feet', 12), 'Breadth', '26 feet (8 m)', ''),
 (at(r'or weighs 1500 tons', 12), 'Weight', '1,500 tons', 'Sinks or floats by filling and emptying its tanks.'),
 (at(r'composed of two hulls', 12), 'Hull', 'Double, of steel plates', 'Joined by T-shaped irons, strong as a solid block.'),
 (at(r'I had set up my workshops upon a desert island', 12), 'Built', 'In secret, on a desert island', 'From parts ordered from many countries under false names.'),
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
