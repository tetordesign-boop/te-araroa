// Places chosen by hand, added to the points of interest by pois.mjs: the trail's iconic spots ("lieux cultes")
// and the Lord of the Rings and Hobbit filming locations near it. Each is found in OpenStreetMap by name
// (`find`: the exact names it may carry, and optionally the OSM tag that must match), or upgrades a place the map
// data already has (`upgrade`: its kind and name), so the position always comes from the map, never typed in.
// `max`: how far from the trail it may be (metres). Texts are short, in French and English.
const LOTR = "https://www.newzealand.com/nz/feature/the-lord-of-the-rings-trilogy-filming-locations/";
const HOBBIT = "https://www.newzealand.com/nz/feature/the-hobbit-trilogy-filming-locations/";

export const CURATED = [
  // ---------------------------------------------------------------- iconic spots
  {
    slug: "kerr-bay", t: "icon", n: "Kerr Bay", find: { names: ["Kerr Bay"] }, max: 3000,
    fr: "Le ponton de St Arnaud sur le lac Rotoiti, face aux montagnes. De grandes anguilles viennent sous les planches.",
    en: "St Arnaud's jetty on Lake Rotoiti, facing the mountains. Big eels gather under the boards.",
  },
  {
    slug: "blue-lake", t: "icon", n: "Rotomairewhenua / Blue Lake", find: { names: ["Rotomairewhenua / Blue Lake", "Rotomairewhenua", "Blue Lake", "Blue Lake / Rotomairewhenua", "Rotomairewhenua/Blue Lake"], tag: ["natural", "water"] }, max: 3000,
    fr: "L'eau douce la plus claire jamais mesurée au monde, jusqu'à 80 m de visibilité. Lac sacré pour Ngāti Apa : on ne s'y baigne pas et on ne touche pas l'eau.",
    en: "The clearest fresh water ever measured, up to 80 m visibility. Sacred to Ngāti Apa: no swimming, and don't touch the water.",
    src: "https://www.doc.govt.nz/parks-and-recreation/places-to-go/nelson-tasman/places/nelson-lakes-national-park/things-to-do/rotomairewhenua-blue-lake/",
  },
  {
    slug: "lake-constance", t: "icon", n: "Lake Constance", find: { names: ["Lake Constance"], tag: ["natural", "water"] }, max: 3000,
    fr: "Le lac au pied du Waiau Pass : le sentier le contourne par une vire raide avant la montée au col.",
    en: "The lake below Waiau Pass: the route sidles steeply around it before the climb to the pass.",
  },
  {
    slug: "waiau-pass", t: "icon", upgrade: { t: "pass", name: "^Waiau Pass$" },
    fr: "Le grand col alpin des Nelson Lakes, environ 1 870 m. À ne passer que par beau temps.",
    en: "The big alpine pass of the Nelson Lakes, about 1,870 m. Only crossed in good weather.",
  },
  {
    slug: "goat-pass", t: "icon", upgrade: { t: "pass", name: "^Goat Pass$" },
    fr: "Le col du Coast to Coast, la course qui traverse l'île en courant, pédalant et pagayant.",
    en: "The pass of the Coast to Coast, the race that crosses the island running, cycling and paddling.",
  },
  {
    slug: "devils-punchbowl", t: "icon", upgrade: { t: "fall", name: "Devil'?s Punchbowl" },
    fr: "Une chute de 131 m à dix minutes du village d'Arthur's Pass, où les kea, perroquets de montagne, rôdent autour des voitures.",
    en: "A 131 m waterfall ten minutes from Arthur's Pass village, where kea, the mountain parrots, prowl around the cars.",
  },
  {
    slug: "stag-saddle", t: "icon", upgrade: { t: "pass", name: "^Stag Saddle$" },
    fr: "Le point le plus haut de tout le Te Araroa, 1 925 m, avec le lac Tekapo en contrebas.",
    en: "The highest point of the whole Te Araroa, 1,925 m, with Lake Tekapo below.",
  },
  {
    slug: "good-shepherd", t: "icon", n: "Church of the Good Shepherd", find: { names: ["Church of the Good Shepherd"] }, max: 3000,
    fr: "La petite église de pierre de 1935 au bord du lac Tekapo, sous l'un des ciels nocturnes les plus purs du monde.",
    en: "The little 1935 stone church on Lake Tekapo, under one of the clearest night skies in the world.",
  },
  {
    slug: "breast-hill", t: "icon", upgrade: { t: "peak", name: "^Breast Hill$" },
    fr: "La crête au-dessus du lac Hāwea : l'une des plus belles vues de tout le sentier.",
    en: "The ridge above Lake Hāwea: one of the best views on the whole trail.",
  },
  {
    slug: "wanaka-tree", t: "icon", n: "That Wānaka Tree", find: { names: ["That Wanaka Tree", "That Wānaka Tree", "#ThatWanakaTree", "Wanaka Tree", "Wānaka Tree"] }, max: 3000,
    fr: "Le saule qui pousse seul dans le lac Wānaka, sans doute l'arbre le plus photographié du pays.",
    en: "The willow growing alone in Lake Wānaka, probably the most photographed tree in the country.",
  },
  {
    slug: "chinese-settlement", t: "icon", n: "Arrowtown Chinese Settlement", find: { names: ["Arrowtown Chinese Settlement", "Chinese Settlement", "Chinese Village"] }, max: 3000,
    fr: "Les cabanes restaurées des mineurs chinois de la ruée vers l'or, au bord de la rivière Arrow.",
    en: "The restored huts of the Chinese gold miners, beside the Arrow River.",
  },
  {
    slug: "te-waewae-bay", t: "icon", n: "Te Waewae Bay", find: { names: ["Te Waewae Bay"] }, max: 6000,
    fr: "Une longue plage sauvage face au Sud, où l'on croise parfois les dauphins d'Hector, les plus petits du monde.",
    en: "A long wild beach facing south, where Hector's dolphins, the smallest in the world, sometimes swim by.",
  },

  // ---------------------------------------------------------------- Middle-earth
  {
    slug: "pelorus", t: "film", n: "Pelorus River", find: { names: ["Pelorus Bridge"] }, max: 3000, src: HOBBIT,
    film: ["Le Hobbit", "The Hobbit"],
    fr: "Les nains s'y échappent dans des tonneaux (La Désolation de Smaug). C'est aussi la plus belle baignade du début du sentier.",
    en: "The dwarves' barrel escape (The Desolation of Smaug). Also the best swimming hole early on the trail.",
  },
  {
    slug: "edoras", t: "film", n: "Edoras · Mount Sunday", find: { names: ["Mount Sunday", "Mt Sunday"], tag: ["natural", "peak"] }, max: 25000, src: LOTR,
    film: ["Le Seigneur des anneaux", "The Lord of the Rings"],
    fr: "Edoras, la capitale du Rohan, était construite sur cette butte. Le décor a disparu, mais on monte au sommet à pied depuis la Hakatere Potts Road.",
    en: "Edoras, capital of Rohan, stood on this knoll. The set is gone, but you can walk up from Hakatere Potts Road.",
  },
  {
    slug: "esgaroth", t: "film", n: "Lake-town · Lake Pukaki", nfr: "Esgaroth · lac Pukaki", find: { names: ["Lake Pukaki"], tag: ["natural", "water"] }, max: 25000, src: HOBBIT,
    film: ["Le Hobbit", "The Hobbit"],
    fr: "Le lac a servi de décor à Esgaroth, la ville sur le lac (La Désolation de Smaug), et sa rive est à la poursuite des Wargs.",
    en: "The lake stood in for Lake-town (The Desolation of Smaug), and its eastern shore for the Warg chase.",
  },
  {
    slug: "pelennor", t: "film", n: "Pelennor Fields · Twizel", nfr: "Champs du Pelennor · Twizel", find: { names: ["Twizel"], tag: ["place", "town"] }, offset: [-0.012, 0.004], max: 6000, src: LOTR,
    film: ["Le Seigneur des anneaux", "The Lord of the Rings"],
    fr: "La bataille des champs du Pelennor a été tournée dans les plaines autour de Twizel. Terrain privé : des visites partent de Twizel.",
    en: "The Battle of the Pelennor Fields was filmed on the plains around Twizel. Private land: tours leave from Twizel.",
  },
  {
    slug: "bruinen", t: "film", n: "Ford of Bruinen · Arrow River", nfr: "Gué de la Bruinen · Arrow River", find: { names: ["Ford of Bruinen", "Ford of Bruinen filming location", "Arrowtown"] }, prefer: "Bruinen", offset: [0.004, 0.003], max: 6000, src: LOTR,
    film: ["Le Seigneur des anneaux", "The Lord of the Rings"],
    fr: "Arwen y lève la rivière contre les Nazgûl. Le gué est sur l'Arrow River Trail, à la sortie d'Arrowtown, avec des panneaux.",
    en: "Where Arwen raises the river against the Ringwraiths. The ford is on the Arrow River Trail just out of Arrowtown, signposted.",
  },
  {
    slug: "gladden", t: "film", n: "Gladden Fields · Wilcox Green", nfr: "Champs aux Iris · Wilcox Green", find: { names: ["Wilcox Green"] }, max: 8000, src: LOTR,
    film: ["Le Seigneur des anneaux", "The Lord of the Rings"],
    fr: "Les champs aux Iris, où Isildur perd l'Anneau au début du premier film.",
    en: "The Gladden Fields, where Isildur loses the Ring at the start of the first film.",
  },
  {
    slug: "skippers", t: "film", n: "Skippers Canyon", find: { names: ["Skippers Canyon"] }, max: 20000, src: LOTR,
    film: ["Le Seigneur des anneaux", "The Lord of the Rings"],
    fr: "Les parois du canyon ont servi pour la crue du gué de la Bruinen.",
    en: "Its walls were used for the flood at the Ford of Bruinen.",
  },
  {
    slug: "argonath", t: "film", n: "Argonath · Kawarau Gorge", find: { names: ["Chard Farm", "Chard Farm Winery", "Chard Farm Vineyard"] }, max: 20000, src: LOTR,
    film: ["Le Seigneur des anneaux", "The Lord of the Rings"],
    fr: "La Communauté descend l'Anduin dans cette gorge. Les deux statues géantes, les Argonath, ont été ajoutées en studio.",
    en: "The Fellowship paddles down the Anduin through this gorge. The giant Argonath statues were added in the studio.",
  },
  {
    slug: "rohan", t: "film", n: "Rohan · Deer Park Heights", find: { names: ["Deer Park Heights"] }, max: 15000, src: LOTR,
    film: ["Le Seigneur des anneaux", "The Lord of the Rings"],
    fr: "Les réfugiés du Rohan sur la route d'Edoras au Gouffre de Helm.",
    en: "The people of Rohan on the road from Edoras to Helm's Deep.",
  },
  {
    slug: "ithilien", t: "film", n: "Ithilien · Twelve Mile Delta", find: { names: ["Twelve Mile Delta", "Twelve Mile Delta Campsite", "12 Mile Delta", "12 Mile Delta Campsite"] }, max: 20000, src: LOTR,
    film: ["Le Seigneur des anneaux", "The Lord of the Rings"],
    fr: "Le camp d'Ithilien, les Oliphants, et Gollum avec son lapin (« Des patates ? »).",
    en: "The Ithilien camp, the Oliphaunts, and Gollum with his rabbit (\"What's taters, precious?\").",
  },
  {
    slug: "mavora", t: "film", n: "Mavora Lakes", find: { names: ["North Mavora Lake", "Mavora Lakes"], tag: ["natural", "water"] }, max: 6000,
    src: "https://www.discovernewzealand.com/blog/20-best-lord-of-the-rings-filming-locations",
    film: ["Le Seigneur des anneaux", "The Lord of the Rings"],
    fr: "La fin du voyage sur l'Anduin : Frodon s'y cache des Uruk-hai, Merry et Pippin des orques.",
    en: "The end of the journey down the Anduin: Frodo hides from the Uruk-hai, Merry and Pippin from the orcs.",
  },
  {
    slug: "passburn", t: "film", n: "Passburn", find: { names: ["Passburn", "Pass Burn", "Passburn Hut", "Pass Burn Hut"] }, max: 8000, src: HOBBIT,
    film: ["Le Hobbit", "The Hobbit"],
    fr: "L'approche des Monts Brumeux dans Un voyage inattendu, près du Mavora Walkway.",
    en: "The approach to the Misty Mountains in An Unexpected Journey, near the Mavora Walkway.",
  },
];
