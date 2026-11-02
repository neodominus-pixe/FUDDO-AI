import { shapeFor, type ShapeFamily } from '../shapes'

// Surface textures painted in code, with no image service. Each kind of food is painted the way it actually looks
// from above: a seared piece of meat has a browned crust, pale fat and fibres; a leaf has veins; a sauce is glossy
// and smooth; a crumb is granular. The result is a convincing surface for the shape it is wrapped onto, not a
// photograph, and it is the same picture every time for the same name.

export type Rgb = [number, number, number]

export type Kind = 'meat' | 'fish' | 'fried' | 'smooth' | 'leaf' | 'grain' | 'bread' | 'strands' | 'veg' | 'root' | 'fruit' | 'liquid' | 'plain'

const KIND: Record<ShapeFamily, Kind> = {
  cut: 'meat', patty: 'meat', whole: 'meat', skewer: 'meat', wedge: 'bread',
  coin: 'smooth', pizza: 'bread',
  quenelle: 'smooth', ball: 'smooth', slice: 'smooth', pillow: 'smooth', folded: 'smooth', shell: 'smooth', disc: 'bread',
  leaf: 'leaf', sprig: 'leaf', ruffle: 'leaf',
  crumb: 'grain', grains: 'grain', seed: 'grain', dust: 'grain',
  dome: 'bread', bunBase: 'bread', shard: 'bread', fries: 'fried', ring: 'bread', stack: 'bread',
  nest: 'strands', tubes: 'strands', pile: 'strands',
  baton: 'veg', pod: 'veg', cap: 'veg', blob: 'plain', heap: 'smooth', steak: 'meat', breast: 'meat', fillet: 'fish', bird: 'meat', chunk: 'root', prawn: 'meat', lobster: 'meat', crab: 'meat', wholefish: 'fish',
  liquid: 'liquid', glass: 'liquid',
}

const DRINKS = /\b(noisette|diane|champagne|prosecco|vermouth|wine|port|sherry|madeira|marsala|brandy|cognac|whisky|whiskey|rum|sake|mirin|beer|ale|stout|cider|vinegar|juice|nectar|cordial|consomme|consommé|bouillon|dashi)\b/
const SAUCEY = /\b(jus|sauce|gravy|reduction|coulis|syrup|glaze|dressing|vinaigrette|oil|soup|broth|stock|ragu|ketchup|mayo|aioli|chimichurri|tapenade|rouille|dip|emulsion|veloute|bechamel|hollandaise|pesto|salsa|chutney|honey|caramel)\b/
// What the shape table does not say: a root vegetable, a fruit, and the vegetables and grains it files as a blob.
const ROOT = /\b(roasties|potato|potatoes|celeriac|parsnip|turnip|swede|rutabaga|jerusalem artichoke|sunchoke|yam|taro|cassava|kohlrabi|daikon|radish|beetroot|beet|carrot|salsify|fennel)\b/
const FRUIT = /\b(?:citrus|\w*berr(?:y|ies)|mango(?:es|s)?|peach(?:es)?|apricots?|nectarines?|plums?|melons?|watermelons?|pineapples?|papayas?|apples?|pears?|quinces?|figs?|persimmons?|oranges?|grapefruits?|lemons?|limes?|mandarins?|clementines?|kiwis?|bananas?|passion ?fruits?|guavas?|lychees?|pomegranates?|rhubarb|cherry|cherries|grapes?|tomato(?:es)?)\b/
// Words that mean the fruit is not the thing being plated: its zest, a leaf, a baked thing made with it.
const NOT_FRUIT = /\b(lettuce|salad|slaw|greens|rocket|arugula|spinach|zest|peel|rind|powder|dust|leaf|leaves|shoots?|blossom|flower|tart|pie|cake|crumble|tarte|sponge|cookie|biscuit|bread|loaf|muffin|scone|pudding)\b/
const GREEN_VEG = /\b(zucchini|courgette|cucumber|marrow|squash|pumpkin|aubergine|eggplant|pepper|capsicum|okra|green beans?|runner beans?|leek|asparagus|celery|spring onion|scallion)\b/
const KERNEL = /\b(corn|sweetcorn|polenta|couscous|quinoa|bulgur|barley|millet|lentils?|chickpeas?|peas?|edamame|beans?)\b/

// What a food is made of, where the shape table can only say how it is cut: a sausage is a baton and a meatball a ball,
// but neither has the surface of a vegetable or a puree. Bread is the same: a slice is a slice of cheese or of toast.
const MEATY = /\b(beef|pork|lamb|mutton|veal|venison|duck|chicken|turkey|goose|quail|rabbit|bacon|ham|gammon|prosciutto|pancetta|salami|pepperoni|chorizo|sausages?|meatballs?|steaks?|brisket|ribs?|sirloin|ribeye|loin|rump|lardons|kebabs?|mortadella|bresaola|pastrami|coppa|speck|lardo|guanciale|saucisson|nduja|biltong|haggis|tongue|faggots?|rillettes?|brandade|char siu|jerky|kofta|kibbeh|kottbullar|chipolatas?|bratwurst|frankfurters?|hot dogs?|merguez|boudin|andouille|salsiccia|cevapi|boerewors|bangers?|sashimi|gravlax|gravadlax|lox|smoked salmon|carpaccio|crudo|tataki|crab|lobster|prawns?|shrimps?|langoustines?|crayfish|squid|octopus|eel|sardines?|anchov(?:y|ies)|sprat|whitebait|tartare|medallion|shawarma|gyro|rendang|bulgogi|kung pao|barbacoa|al pastor|ropa vieja|scampi|ceviche|poke|gizzards?|whelks?|winkles?|sole|drumsticks?|kielbasa|weisswurst|seekh|marrow bone|bone marrow|gambas|pigs in blankets|doner|döner|albondigas|tsukune|keftedes|bifteki|soutzoukakia|mince|leberkase|burnt ends)\b/
const NOT_MEATY = /\b(noodles?|pasta|rice|soup|broth|stock|sauce|buns?|bread|toast|sandwich|salad|pie|pizza|rolls?|wraps?|tacos?|dumplings?|ravioli|stew|curry|fat|crackling|skin|crisps?|fish fingers?|goujons?|nuggets?|croquettes?|burger)\b/
// Anything baked, fried in batter or wrapped in pastry has the golden, blistered surface of bread, whatever is inside.
const BREADY = /\b(bread|toast|sourdough|brioche|baguette|ciabatta|focaccia|croissants?|loaf|croutons?|naan|pitta|pita|flatbread|buns?|rye|crostini|bagels?|muffins?|pastry|pastries|tarts?|pies?|pasty|pasties|samosas?|empanadas?|empanadillas?|turnovers?|strudel|puffs?|calzone|quesadillas?|tacos?|wraps?|tortillas?|filo|phyllo|brik|wafers?|biscuit|biscotti|cookies?|crackers?|crispbread|beignets?|doughnuts?|donuts?|churros?|madeleines?|pancakes?|waffles?|crumpets?|scones?|toasties|toastie|rarebit|bruschetta|piadina|pumpernickel|bara brith|fritters?|falafel|hush puppy|hush puppies|takoyaki|scotch eggs?|croquettes?|goujons?|nuggets?|tempura|battered|breaded|fish fingers?|rolls?|burritos?|enchiladas?|taquitos?|cannelloni|cannoli|eclairs?|dosa|blintz|crepes?|breadsticks?|grissini|sfogliatella|sambusak|croque|onion rings?|crispy onions?|crispy shallots?|fried shallots?|fried onions?|tater tots?|popcorn|patatas bravas|hash|pakora|bhaji|nachos?|tostones?|roulade|chimichanga|flauta|popiah|lumpia|croquetas|borek|tamale|youtiao|jalapeno popper|lemon drizzle|corn dog|souffle|soufflé|quiche|frittata|omelette|omelet|stuffing|pintxos|malva pudding|tiropita|bougatsa|galaktoboureko|sigara boregi|cornbread|nut roast|wellington|pain perdu|syrniki|draniki|kaiserschmarrn|berliner|mozzarella sticks|cheese sticks|fried pickles|jalapeno poppers|cobbler|smores|s'mores)\b/
const FRIED_ROOT = /\b(chips|fries|frites|crisps|tuile|croquettes?|dauphine|rosti|rösti|hash)\b/
// Things the shape table files as crumbs or dust that are not crumbs: a clove of garlic is not a grain of rice.
const ROOTY = /\b(garlic|ginger|galangal|horseradish|turmeric root|maduros|plantains?)\b/
const THREADY = /\b(saffron|bonito|katsuobushi)\b/
const SEAWEED = /\b(nori|kombu|seaweed|wakame|laver|dulse|dolma|mahshi|warak enab|badrijani|goi cuon|lemon balm|lemon thyme|lemongrass|lemon grass)\b/
const CHEESEY = /\b(brie|camembert|manchego|gorgonzola|stilton|roquefort|parmesan|pecorino|gruyere|gruyère|comte|comté|emmental|gouda|taleggio|wensleydale|red leicester|fontina|cheddar|halloumi|feta|provolone|mozzarella|cheese)\b/
const VEGGY = /\b(ratatouille|caponata|succotash|stir fry|caramelised onions?|aloo gobi|imam bayildi|karniyarik|briam|roasted vegetables|cabbage rolls?|golabki|sarma)\b/
const EGGY = /\b(eggs?|yolks?)\b/
const NOT_EGGY = /\b(noodles?|pasta|roll|tart|custard|mayo|salad|rice|nest|benedict|pie|cake)\b/
const WATERY = /\b(cucumbers?|gherkins?|pickles?|cornichons?|olives?)\b/

const SMOOTHY = /\b(puree|purée|mash|mashed|mousse|cream|custard|foam|hummus|yoghurt|yogurt|labneh|cheese|butter|ricotta|burrata|pate|pâté|gel|curd|jelly|aspic|flan|blancmange|junket|panna cotta|potato salad|coleslaw|remoulade|ensaladilla rusa|chole|crema catalana)\b/

/** What kind of surface a food has, from its name. */
export function kindFor(name: string): Kind {
  const n = name.toLowerCase()
  // A drink is a liquid whatever is in it: a banana milkshake is not a banana.
  if (shapeFor(name, 'support') === 'glass') return 'liquid'
  // A cabbage roll is a leaf, not a bread roll.
  if (/\b(cabbage rolls?|golabki|sarma)\b/.test(n)) return 'veg'
  if (SAUCEY.test(n)) return 'liquid'
  if (BREADY.test(n)) return 'bread'
  if (SMOOTHY.test(n)) return 'smooth'
  if (ROOTY.test(n)) return 'root'
  if (THREADY.test(n)) return 'strands'
  if (SEAWEED.test(n)) return 'leaf'
  if (WATERY.test(n)) return 'fruit'
  if (/\bzest\b/.test(n)) return 'fruit'
  // A floret is a head of tiny buds: granular, dark in the gaps between them.
  if (/\b(broccoli|cauliflower|romanesco|florets?)\b/.test(n) && !SMOOTHY.test(n) && !/tenderstem/.test(n)) return 'grain'
  if (CHEESEY.test(n)) return 'smooth'
  if (VEGGY.test(n)) return 'veg'
  if (EGGY.test(n) && !NOT_EGGY.test(n)) return 'smooth'
  if (/\b(yuzu|tangerine|cantaloupe|honeydew|dragon ?fruit|durian)\b/.test(n)) return 'fruit'
  if (/\b(pumpkin|squash|chayote|artichoke|lotus root|kumara|onions?|shallots?)\b/.test(n)) return 'root'
  // A root is a root however it is cut: a roast potato, a new potato and a crushed one share a surface.
  if (FRIED_ROOT.test(n) && !SAUCEY.test(n)) return 'fried'
  if (ROOT.test(n) && !NOT_FRUIT.test(n)) return 'root'
  // Fruit is named before the shape table is asked: it files berries as a pile and a lemon as a wedge.
  if (FRUIT.test(n) && !NOT_FRUIT.test(n) && !/\bsole\b/.test(n)) return 'fruit'
  // A fillet is fish whatever its name says: the surface is the muscle blocks.
  if (shapeFor(name, 'support') === 'fillet') return 'fish'
  const byShape = KIND[shapeFor(name, 'support')] ?? 'plain'
  if (MEATY.test(n) && !NOT_MEATY.test(n) && byShape !== 'leaf' && byShape !== 'liquid') return 'meat'
  if (byShape !== 'plain') return byShape
  // The shape table had no answer. These words say what it could not: roots, fruit, greens, kernels, drinks.
  if (ROOT.test(n)) return 'root'
  if (GREEN_VEG.test(n)) return 'veg'
  if (KERNEL.test(n)) return 'grain'
  if (DRINKS.test(n)) return 'liquid'
  return 'plain'
}

// --- Noise -------------------------------------------------------------------------------------------------------

function hash(x: number, y: number, seed: number) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 2246822519)) >>> 0
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295
}

function value(x: number, y: number, seed: number) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const fx = x - xi
  const fy = y - yi
  const u = fx * fx * (3 - 2 * fx)
  const v = fy * fy * (3 - 2 * fy)
  const a = hash(xi, yi, seed)
  const b = hash(xi + 1, yi, seed)
  const c = hash(xi, yi + 1, seed)
  const d = hash(xi + 1, yi + 1, seed)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}

function fbm(x: number, y: number, seed: number, octaves = 4) {
  let sum = 0
  let amp = 0.5
  let norm = 0
  for (let i = 0; i < octaves; i++) {
    sum += value(x, y, seed + i * 17) * amp
    norm += amp
    x *= 2.03
    y *= 2.03
    amp *= 0.5
  }
  return sum / norm
}

/** Distance to the nearest of a scatter of points: small near a point. The basis of pores, crumb and fat specks. */
function cell(x: number, y: number, seed: number) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  let best = 9
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const px = xi + i + hash(xi + i, yi + j, seed)
      const py = yi + j + hash(xi + i, yi + j, seed + 91)
      best = Math.min(best, Math.hypot(x - px, y - py))
    }
  }
  return best
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const mix = (a: number, b: number, t: number) => a + (b - a) * t
const smooth = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a))
  return t * t * (3 - 2 * t)
}
const lerpRgb = (a: Rgb, b: Rgb, t: number): Rgb => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)]
const scale = (c: Rgb, k: number): Rgb => [c[0] * k, c[1] * k, c[2] * k]
// Warm a colour towards what an oven or a pan does to it: red held, blue pulled down hardest.
const brown = (c: Rgb, k: number): Rgb => [c[0] * Math.pow(k, 0.8), c[1] * k, c[2] * Math.pow(k, 1.25)]

type Painter = (u: number, v: number, base: Rgb, seed: number) => Rgb

// Every painter works in a unit square (u, v each 0..1) and returns a colour.
const PAINTERS: Record<Kind, Painter> = {
  meat(u, v, base, seed) {
    // Fibres run one way. A seared crust browns the high spots in fine, broken patches (a pan does not brown evenly),
    // and fat shows as pale streaks along the grain rather than as dots.
    const warp = fbm(u * 3, v * 3, seed + 1, 2) * 0.35
    const broad = fbm(u * 4 + warp, v * 4 + warp, seed, 4)
    const fine = fbm(u * 19, v * 19, seed + 5, 3)
    const patch = broad * 0.62 + fine * 0.38
    const sear = smooth(0.4, 0.66, patch)
    const fibre = fbm(u * 5, v * 120, seed + 2, 2)
    let c = lerpRgb(base, brown(base, 0.4), sear * 0.8)
    c = lerpRgb(c, brown(base, 0.62), (fibre - 0.5) * 0.7 + 0.15 * sear)
    const marble = cell(u * 9 + warp * 4, v * 46, seed + 3)
    const fat = 1 - smooth(0.03, 0.16, marble)
    c = lerpRgb(c, lerpRgb(base, [238, 222, 192], 0.75), fat * 0.4 * (1 - sear * 0.75))
    const glint = smooth(0.66, 0.82, fbm(u * 13, v * 13, seed + 8, 3)) * sear
    return lerpRgb(c, [255, 232, 200], glint * 0.3)
  },

  fish(u, v, base, seed) {
    // A fillet is made of muscle blocks, stacked in chevrons either side of the spine and held apart by pale seams of
    // connective tissue. They are what make cooked fish flake, and what tell it from a cut of meat. A light sear browns
    // the high spots, and the thin belly edge is a little darker.
    const across = Math.abs(v - 0.5) * 2
    const warp = fbm(u * 3, v * 3, seed + 1, 2) * 0.5
    const phase = u * 7 + across * 5.2 + warp
    const f = phase - Math.floor(phase)
    const seam = 1 - smooth(0, 0.14, Math.min(f, 1 - f))
    const block = 0.5 + 0.5 * Math.sin(phase * Math.PI * 2)
    let c = scale(base, 0.9 + block * 0.16 + (fbm(u * 24, v * 24, seed + 3, 2) - 0.5) * 0.12)
    c = lerpRgb(c, lerpRgb(base, [250, 240, 224], 0.62), seam * 0.6)
    const sear = smooth(0.52, 0.7, fbm(u * 4 + warp, v * 4, seed + 5, 3))
    c = lerpRgb(c, brown(base, 0.66), sear * 0.45)
    return lerpRgb(c, scale(base, 0.7), smooth(0.78, 1, across) * 0.35)
  },

  fried(u, v, base, seed) {
    // Chips, crisps, anything fried in oil: golden all over, a deeper gold where it sat on the hot spots, with the pale,
    // slightly matt flecks of blistered starch. Never the brown of a baked crust.
    const heat = smooth(0.35, 0.8, fbm(u * 4, v * 4, seed, 3))
    let c = lerpRgb(scale(base, 1.04), lerpRgb(base, [150, 92, 30], 0.42), heat * 0.55)
    const blister = 1 - smooth(0.04, 0.2, cell(u * 22, v * 22, seed + 3))
    c = lerpRgb(c, scale(base, 1.18), blister * 0.35)
    return lerpRgb(c, scale(base, 0.82), smooth(0.7, 0.9, fbm(u * 12, v * 12, seed + 6, 2)) * 0.25)
  },

  smooth(u, v, base, seed) {
    // A puree, a quenelle, a spoon of cream: soft, with faint ridges from the spoon and a few air bubbles.
    const ridge = Math.sin((u * 4 + fbm(u * 3, v * 3, seed, 3) * 1.8) * Math.PI * 2) * 0.5 + 0.5
    let c = scale(base, 0.94 + fbm(u * 4, v * 4, seed + 2, 3) * 0.1 + ridge * 0.035)
    const bubble = cell(u * 30, v * 30, seed + 4)
    c = lerpRgb(c, scale(base, 0.8), (1 - smooth(0.02, 0.1, bubble)) * 0.35)
    return lerpRgb(c, [255, 252, 245], smooth(0.7, 0.9, fbm(u * 9, v * 9, seed + 6, 2)) * 0.18)
  },

  leaf(u, v, base, seed) {
    // A midrib, side veins running out and up from it, and a darker, paler, mottled blade between them.
    const side = Math.abs(u - 0.5)
    const midrib = 1 - smooth(0.006, 0.028, side)
    const veinPhase = (v * 7 + side * 5.5) % 1
    const vein = (1 - smooth(0.02, 0.07, Math.abs(veinPhase - 0.5))) * smooth(0.02, 0.1, side) * (1 - smooth(0.4, 0.5, side))
    let c = scale(base, 0.82 + fbm(u * 8, v * 8, seed, 4) * 0.4)
    c = lerpRgb(c, scale(base, 1.3), (midrib * 0.8 + vein * 0.5))
    return lerpRgb(c, scale(base, 0.55), smooth(0.36, 0.5, side) * 0.5)
  },

  grain(u, v, base, seed) {
    // Granular: many small pieces of different tone, with dark gaps between them.
    const g = cell(u * 46, v * 46, seed)
    const g2 = cell(u * 23 + 4, v * 23 + 4, seed + 9)
    const tone = 0.7 + hash(Math.floor(u * 46), Math.floor(v * 46), seed) * 0.5
    let c = scale(base, tone * (0.85 + g2 * 0.2))
    c = lerpRgb(c, scale(base, 0.3), smooth(0.45, 0.8, g) * 0.8)
    return lerpRgb(c, brown(base, 0.6), fbm(u * 5, v * 5, seed + 2, 3) * 0.35)
  },

  bread(u, v, base, seed) {
    // A baked surface: golden where the heat reached, pale and open-pored where it did not.
    const heat = smooth(0.3, 0.75, fbm(u * 3.2, v * 3.2, seed, 4))
    let c = lerpRgb(brown(base, 0.95), brown(base, 0.5), heat)
    const pore = cell(u * 26, v * 26, seed + 3)
    c = lerpRgb(c, scale(c, 0.55), (1 - smooth(0.05, 0.22, pore)) * 0.5)
    const flour = smooth(0.72, 0.9, fbm(u * 14, v * 14, seed + 7, 3))
    return lerpRgb(c, [250, 236, 210], flour * 0.3)
  },

  strands(u, v, base, seed) {
    // Fine lines in one direction, wavering, with shadow between them: pasta, noodles, shredded things.
    const wave = fbm(u * 4, v * 4, seed, 3) * 2.2
    const lines = Math.sin((u * 46 + wave) * Math.PI) * 0.5 + 0.5
    let c = scale(base, 0.68 + lines * 0.42)
    c = lerpRgb(c, scale(base, 1.15), smooth(0.6, 0.9, fbm(u * 18, v * 3, seed + 5, 3)) * 0.3)
    return lerpRgb(c, brown(base, 0.7), fbm(u * 5, v * 5, seed + 2, 3) * 0.3)
  },

  veg(u, v, base, seed) {
    // Cooked vegetable: long fibres, a lighter core, and char where it met the grill.
    // The phase and the spacing come from the food, so a leek and an asparagus spear are not the same picture.
    const phase = hash(seed, 3, 5)
    const stripe = Math.sin((u * (14 + hash(seed, 4, 5) * 10) + phase + fbm(u * 2, v * 6, seed, 3) * 1.5) * Math.PI) * 0.5 + 0.5
    let c = scale(base, 0.82 + stripe * 0.28 + fbm(u * 6, v * 20, seed + 2, 3) * 0.16)
    const bar = Math.abs(((v * (2.4 + hash(seed, 5, 5) * 2) + phase + fbm(u * 2, v * 2, seed + 4, 2) * 0.3) % 1) - 0.5)
    const char = (1 - smooth(0.06, 0.16, bar)) * smooth(0.35, 0.6, fbm(u * 4, v * 4, seed + 6, 3))
    c = lerpRgb(c, [34, 26, 18], char * 0.7)
    return lerpRgb(c, scale(base, 1.25), smooth(0.4, 0.5, 0.5 - Math.abs(u - 0.5)) * 0.18)
  },

  root(u, v, base, seed) {
    // The cut or roasted face of a root: dense, pale and starchy, with a faint ring structure, fine grain, and the odd
    // fleck of skin or caramelised edge.
    const d = Math.hypot(u - 0.5, v - 0.5)
    const rings = Math.sin((d * 9 + fbm(u * 3, v * 3, seed, 3) * 1.4) * Math.PI * 2) * 0.5 + 0.5
    let c = scale(base, 0.92 + rings * 0.035 + fbm(u * 9, v * 9, seed + 2, 3) * 0.1)
    const starch = cell(u * 40, v * 40, seed + 4)
    c = lerpRgb(c, scale(base, 1.1), (1 - smooth(0.04, 0.2, starch)) * 0.16)
    const toast = smooth(0.55, 0.78, fbm(u * 5, v * 5, seed + 6, 4)) * smooth(0.25, 0.55, d)
    c = lerpRgb(c, brown(base, 0.62), toast * 0.6)
    // A few flecks of skin, pale-brown: dark ones read as dirt on a pale potato.
    const skin = (1 - smooth(0.01, 0.04, cell(u * 11, v * 11, seed + 9))) * 0.3
    return lerpRgb(c, brown(base, 0.62), skin)
  },

  fruit(u, v, base, seed) {
    // Juicy flesh: soft colour shifts, fine vesicles that catch the light, long fibres and a wet shine.
    const flow = fbm(u * 3, v * 3, seed, 4)
    let c = lerpRgb(scale(base, 0.88), scale(base, 1.18), flow)
    const fibre = fbm(u * 6, v * 70, seed + 3, 2)
    c = lerpRgb(c, scale(base, 0.8), fibre * 0.3)
    const sac = 1 - smooth(0.04, 0.22, cell(u * 34, v * 34, seed + 5))
    c = lerpRgb(c, scale(base, 1.3), sac * 0.45)
    return lerpRgb(c, [255, 250, 235], smooth(0.74, 0.92, fbm(u * 7, v * 7, seed + 8, 3)) * 0.3)
  },

  liquid(u, v, base, seed) {
    // A sauce: dark and even, with a soft sheen, a few slow swirls and tiny bright highlights where it pools.
    const swirl = fbm(u * 2.4 + fbm(u * 2, v * 2, seed, 2) * 1.2, v * 2.4, seed + 3, 3)
    let c = scale(base, 0.8 + swirl * 0.35)
    const edge = Math.hypot(u - 0.5, v - 0.5) * 2
    c = lerpRgb(c, scale(base, 0.6), smooth(0.7, 1.1, edge) * 0.5)
    const spec = smooth(0.78, 0.95, fbm(u * 5, v * 5, seed + 8, 3))
    const fleck = (1 - smooth(0.02, 0.07, cell(u * 34, v * 34, seed + 5))) * 0.35
    return lerpRgb(c, [255, 244, 230], clamp01(spec * 0.35 + fleck))
  },

  plain(u, v, base, seed) {
    const broad = fbm(u * 4, v * 4, seed, 4)
    const fine = fbm(u * 24, v * 24, seed + 3, 2)
    return scale(base, 0.72 + broad * 0.5 + (fine - 0.5) * 0.18)
  },
}

/** Paints a square texture of `size` pixels in the colour and style of a food. Deterministic for a given input. */
export function paintTexture(kind: Kind, base: Rgb, seed: number, size = 256): { rgb: Uint8Array; average: Rgb } {
  const paint = PAINTERS[kind]
  const rgb = new Uint8Array(size * size * 3)
  let r = 0
  let g = 0
  let b = 0
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const c = paint((x + 0.5) / size, (y + 0.5) / size, base, seed)
      const px = (y * size + x) * 3
      rgb[px] = Math.round(clamp01(c[0] / 255) * 255)
      rgb[px + 1] = Math.round(clamp01(c[1] / 255) * 255)
      rgb[px + 2] = Math.round(clamp01(c[2] / 255) * 255)
      r += rgb[px]
      g += rgb[px + 1]
      b += rgb[px + 2]
    }
  }
  const n = size * size
  return { rgb, average: [r / n, g / n, b / n] }
}
