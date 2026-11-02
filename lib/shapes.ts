// What shape a component actually is. Colour alone is not enough: a bun, a
// patty and a slice of cheese are completely different forms, and rendering all
// three as the same lumpy sphere is what makes a burger look like a pile.

import { matchKey, table } from './match'

export type ShapeFamily =
  | 'blob'
  | 'dome'
  | 'bunBase'
  | 'patty'
  | 'slice'
  | 'coin'
  | 'pizza'
  | 'leaf'
  | 'sprig'
  | 'crumb'
  | 'seed'
  | 'cut'
  | 'quenelle'
  | 'baton'
  | 'ruffle'
  | 'disc'
  | 'shell'
  | 'folded'
  | 'grains'
  | 'fries'
  | 'liquid'
  | 'nest'
  | 'pillow'
  | 'tubes'
  | 'pile'
  | 'wedge'
  | 'ring'
  | 'ball'
  | 'skewer'
  | 'cap'
  | 'shard'
  | 'dust'
  | 'whole'
  | 'stack'
  | 'pod'
  | 'heap'
  | 'steak'
  | 'breast'
  | 'fillet'
  | 'bird'
  | 'chunk'
  | 'prawn'
  | 'lobster'
  | 'crab'
  | 'wholefish'
  | 'glass'

// Proportions that belong to the shape rather than to the plating. `heightMul`
// scales how tall the form stands, `aspect` how deep it is relative to its
// width -- a slice of cheese is wide and paper-thin however it is plated --
// and `widthMul` how far it spreads: a leaf of lettuce in a burger hangs out
// past the bun, which is the only reason you can see it is in there.
export const SHAPE_METRICS: Record<ShapeFamily, { heightMul: number; aspect: number; widthMul?: number }> = {
  blob: { heightMul: 1, aspect: 0.88 },
  dome: { heightMul: 0.85, aspect: 0.97 },
  bunBase: { heightMul: 0.62, aspect: 0.97 },
  patty: { heightMul: 0.5, aspect: 0.97 },
  slice: { heightMul: 0.2, aspect: 0.95 },
  // A round slice: tomato, cucumber, pepperoni, a pickle, a round of mozzarella. Round, and thicker than a sheet of
  // cheese, with a little less spread than a patty.
  coin: { heightMul: 0.34, aspect: 1, widthMul: 0.82 },
  // A whole pizza: it covers most of the plate, and is shallow, with a raised crust round a lower deck.
  pizza: { heightMul: 0.22, aspect: 1, widthMul: 1.85 },
  // The leaf mesh now fills its own box, so thinness lives here rather than
  // being an accident of geometry that left a gap above it in a stack.
  leaf: { heightMul: 0.16, aspect: 0.55, widthMul: 1.3 },
  // A sprig stands off the plate more than a leaf lying flat on it, and reaches
  // further for its width, because a good part of that width is stem.
  sprig: { heightMul: 0.34, aspect: 0.62, widthMul: 1.4 },
  // A crumb lies down. Standing taller than it is wide turned the sesame on a
  // burger bun into a row of little horns.
  crumb: { heightMul: 0.42, aspect: 0.9 },
  // A seed is smaller again, and longer than it is wide.
  seed: { heightMul: 0.3, aspect: 0.6, widthMul: 0.8 },
  // A cut of protein: long, not very tall, deeper than a slice.
  cut: { heightMul: 0.62, aspect: 0.64, widthMul: 1.06 },
  quenelle: { heightMul: 0.72, aspect: 0.52 },
  baton: { heightMul: 0.7, aspect: 0.28, widthMul: 1.2 },
  ruffle: { heightMul: 0.3, aspect: 1, widthMul: 1.16 },
  // A portion of pasta is a generous thing: a nest covers most of the well of a
  // bowl, which is why it gets the widest footprint of anything on the plate.
  nest: { heightMul: 0.72, aspect: 1, widthMul: 1.32 },
  // Filled pasta is puffed, not pressed flat: the filling is most of its
  // thickness, so it stands much taller for its width than a slice does.
  pillow: { heightMul: 1.0, aspect: 0.92, widthMul: 0.86 },
  tubes: { heightMul: 0.88, aspect: 0.95, widthMul: 1.12 },
  pile: { heightMul: 0.92, aspect: 0.95, widthMul: 1.06 },
  // Anything cooked flat and round: a pancake, a pizza, a tart, a fried egg.
  disc: { heightMul: 0.22, aspect: 1, widthMul: 1.25 },
  // A half shell is dished, not flat -- at a slice's height it reads as a crisp.
  // A folded shell stands up: its cross-section is nearly as tall as it is wide.
  // A half shell is about three times as wide as it is deep. Below that it
  // flattens into a folded grey cloth, whatever the mesh underneath is doing.
  shell: { heightMul: 1.15, aspect: 0.92, widthMul: 0.9 },
  folded: { heightMul: 1.15, aspect: 0.7, widthMul: 1.05 },
  // Heaped, not spread: a portion of rice is a scoop with a domed top, and at a
  // flat width it reads as grains spilled on the plate rather than served on it.
  grains: { heightMul: 1.15, aspect: 0.95, widthMul: 0.95 },
  // A portion, not a single chip. Heaped loosely, so it takes a little more
  // room and a little more height than one baton lying down.
  fries: { heightMul: 0.95, aspect: 0.95, widthMul: 1.12 },
  // Not really a solid at all. A proper liquid would be filled to the walls of
  // whatever it is in, which needs the plate's own profile; a wide, shallow,
  // glossy pool is the closest this library gets without that.
  liquid: { heightMul: 0.12, aspect: 1, widthMul: 1.9 },
  // A wedge cut from something round: a slice of cake, a slice of pizza, a
  // cheek of lemon. Half as tall as it is wide, and it reaches like a slice.
  wedge: { heightMul: 0.5, aspect: 0.86, widthMul: 1.12 },
  // A hoop lying flat. Thicker than a slice because the tube of it is round.
  ring: { heightMul: 0.3, aspect: 1, widthMul: 1.05 },
  // One round thing, and the only form in the library that is actually round:
  // everything else on a plate is wider than it is high, so the height a form
  // asks for is measured against that. 1 is a flat mound; a meatball needs 2.2
  // to come out a ball rather than a meat disc.
  ball: { heightMul: 2.2, aspect: 0.98, widthMul: 0.86 },
  // A skewer is nearly all length, and lies across whatever it is served on.
  skewer: { heightMul: 0.55, aspect: 0.3, widthMul: 1.45 },
  // A mushroom stands about as tall as its cap is wide, because most of that
  // height is stalk. Flatter than this and the undercut stops reading, which is
  // the only thing that tells it from a bread roll.
  cap: { heightMul: 1.45, aspect: 0.98, widthMul: 0.8 },
  // A crisp leans, so it is the tallest thing in the library for its footprint
  // and by far the thinnest through: nearly all of a tuile is edge.
  shard: { heightMul: 2.4, aspect: 0.3, widthMul: 0.6 },
  // A dusting is a film. It reaches much further than any portion of anything,
  // and it has no height worth the name -- but it cannot have none, or it
  // renders as a plane with no thickness and disappears edge-on.
  dust: { heightMul: 0.07, aspect: 1, widthMul: 1.7 },
  // Whole, so it takes the plate: a bird or a joint is the largest footprint
  // here, long in one direction and domed over the back.
  whole: { heightMul: 1.3, aspect: 0.66, widthMul: 1.2 },
  // A pod lies down: wide in the plane of the plate, thin through, and longer
  // than anything except a skewer. Nothing else in the library is flat in one
  // direction and round in the other.
  pod: { heightMul: 0.3, aspect: 0.44, widthMul: 1.28 },
  // A sandwich stands on its cut. It is the tallest everyday thing on a plate
  // for its footprint -- five layers deep -- and a triangle is deep as well as
  // wide, which is what stops it reading as a wedge of cake laid down.
  stack: { heightMul: 1.25, aspect: 0.84, widthMul: 1.0 },
  // A heap of small round things: peas, blueberries, olives, grapes. A mound of separate spheres, not of pasta.
  heap: { heightMul: 0.8, aspect: 0.95, widthMul: 1.0 },
  // Cooked flesh, each with its own proportions: a steak is a thick block, a breast a teardrop, a fillet a long thin wedge.
  steak: { heightMul: 0.68, aspect: 0.7, widthMul: 1.04 },
  breast: { heightMul: 0.62, aspect: 0.58, widthMul: 1.14 },
  fillet: { heightMul: 0.44, aspect: 0.4, widthMul: 1.22 },
  // A whole roast bird: tall for its footprint, long in one direction, with the legs standing out at the sides.
  bird: { heightMul: 1.2, aspect: 0.7, widthMul: 1.26 },
  // A roast chunk of potato or squash: lumpy, and smaller than a portion of anything.
  chunk: { heightMul: 0.95, aspect: 0.85, widthMul: 0.6 },
  // From the sea, each on its own proportions: a prawn is small and curled, a lobster heavy and long, a crab broad and
  // flat with its legs out, a whole fish long and thin.
  prawn: { heightMul: 0.7, aspect: 0.7, widthMul: 0.7 },
  lobster: { heightMul: 0.75, aspect: 0.8, widthMul: 1.45 },
  crab: { heightMul: 0.6, aspect: 1.0, widthMul: 1.2 },
  wholefish: { heightMul: 0.6, aspect: 0.5, widthMul: 1.5 },
  // A drink is the glass it comes in: the form is the vessel, and the liquid is poured into it. A glass is taller than
  // it is wide, which nothing else on a plate is, and it keeps its height whatever the plating height says.
  glass: { heightMul: 2.6, aspect: 1, widthMul: 1 },
}

// Where the flat top of a piece sits, as a fraction of its half-height above its middle, for the few forms whose top
// is not a dome. A pizza's deck is below its crust, so what is served on it has to be seated there.
// Cheeses that melt into a pool in an oven, rather than keeping the shape they were cut to.
export const MELTS = /\b(mozzarella|cheese|cheddar|gorgonzola|fontina|provolone|taleggio|gruyere|gruyère|emmental|scamorza|burrata|raclette|camembert|brie)\b/i

// The pizza's is the hand-built model's (public/models/pizza.glb): a 0.5 cm deck under a 2.55 cm crust.
export const DECK_LEVEL: Partial<Record<ShapeFamily, number>> = { pizza: -0.6, glass: 0.9 }

export function shapeMetrics(family: ShapeFamily) {
  const m = SHAPE_METRICS[family]
  return { heightMul: m.heightMul, aspect: m.aspect, widthMul: m.widthMul ?? 1 }
}

// Longest key first, so "bottom bun" is a bun and "burger patty" is a patty.
const SHAPES: Array<[string, ShapeFamily]> = [
  // Bread
  ['bottom bun', 'bunBase'], ['base bun', 'bunBase'], ['bun base', 'bunBase'], ['top bun', 'dome'], ['brioche', 'dome'], ['bun', 'dome'],
  ['roll', 'dome'], ['bao', 'dome'], ['muffin', 'dome'], ['bread', 'slice'], ['toast', 'slice'],
  ['crouton', 'crumb'],
  // Discs
  ['beef patty', 'patty'], ['patty', 'patty'], ['burger', 'patty'], ['fishcake', 'patty'],
  ['scallop', 'coin'], ['black pudding', 'patty'],
  // Cuts of protein: seared on top, cut square at the sides, flat underneath.
  ['duck breast', 'breast'], ['chicken breast', 'breast'], ['pork belly', 'cut'], ['belly', 'cut'],
  ['breast', 'breast'], ['fillet', 'fillet'], ['beef fillet', 'steak'], ['pork fillet', 'steak'], ['lamb fillet', 'steak'], ['fillet steak', 'steak'], ['fillet of beef', 'steak'], ['chicken fillet', 'breast'],
  ['turkey breast', 'breast'], ['magret', 'breast'], ['pheasant breast', 'breast'], ['pigeon breast', 'breast'], ['fish fillet', 'fillet'], ['white fish', 'fillet'], ['filet', 'fillet'], ['steak', 'steak'], ['ribeye', 'steak'],
  ['sirloin', 'steak'], ['loin', 'steak'], ['rump', 'steak'], ['venison', 'steak'], ['lamb', 'steak'],
  ['salmon', 'fillet'], ['cod', 'fillet'], ['halibut', 'fillet'], ['sea bass', 'fillet'], ['seabass', 'fillet'],
  ['tuna', 'steak'], ['duck', 'breast'], ['beef', 'steak'], ['pork', 'steak'], ['chicken', 'breast'],
  ['tofu', 'cut'], ['terrine', 'cut'], ['confit', 'cut'],
  // Spooned into a quenelle: anything smooth and soft enough to hold the shape.
  ['ice cream', 'quenelle'], ['puree', 'quenelle'], ['purée', 'quenelle'], ['mash', 'quenelle'],
  ['mousse', 'quenelle'], ['sorbet', 'quenelle'], ['parfait', 'quenelle'], ['whipped', 'quenelle'],
  ['ganache', 'quenelle'], ['pate', 'quenelle'], ['pâté', 'quenelle'], ['hummus', 'quenelle'],
  ['labneh', 'quenelle'], ['curd', 'quenelle'],
  // Batons: long things that lie down.
  ['baby leek', 'baton'], ['spring onion', 'baton'], ['asparagus', 'baton'], ['leek', 'baton'],
  ['carrot', 'baton'], ['celery', 'baton'],
  // Chips arrive by the handful. One baton on the plate is not a portion of
  // chips, it is a chip -- the same mistake a single penne would be.
  ['chips', 'fries'], ['chip', 'fries'], ['fries', 'fries'], ['fry', 'fries'],
  ['frites', 'fries'], ['wedges', 'fries'], ['shoestring', 'fries'], ['hash brown', 'disc'],
  ['crisps', 'fries'], ['tempura', 'fries'], ['matchstick', 'fries'],
  ['baton', 'baton'], ['batonnet', 'baton'], ['green bean', 'baton'], ['courgette', 'baton'],
  ['sausage', 'baton'], ['prawn', 'prawn'], ['shrimp', 'prawn'], ['langoustine', 'prawn'],
  // Long pasta, served twirled into a nest rather than laid out flat.
  ['spaghetti', 'nest'], ['tagliatelle', 'nest'], ['tagliolini', 'nest'], ['linguine', 'nest'],
  ['fettuccine', 'nest'], ['pappardelle', 'nest'], ['bucatini', 'nest'], ['vermicelli', 'nest'],
  ['capellini', 'nest'], ['angel hair', 'nest'], ['noodle', 'nest'], ['ramen', 'nest'],
  ['udon', 'nest'], ['soba', 'nest'], ['tagliarini', 'nest'], ['pasta', 'nest'],
  // Filled pasta and dumplings: puffed in the middle, pressed at the edge.
  ['ravioli', 'pillow'], ['raviolo', 'pillow'], ['tortellini', 'pillow'], ['tortelli', 'pillow'],
  ['agnolotti', 'pillow'], ['cappelletti', 'pillow'], ['dumpling', 'pillow'], ['gyoza', 'pillow'],
  ['wonton', 'pillow'], ['pierogi', 'pillow'],
  // Short pasta, which is a portion of many pieces rather than one lump.
  ['penne', 'tubes'], ['rigatoni', 'tubes'], ['macaroni', 'tubes'], ['ziti', 'tubes'],
  ['paccheri', 'tubes'], ['tubetti', 'tubes'],
  ['gnocchi', 'pillow'], ['orecchiette', 'pile'], ['conchiglie', 'pile'], ['farfalle', 'pile'],
  ['fusilli', 'pile'], ['casarecce', 'pile'], ['trofie', 'pile'], ['risoni', 'pile'],
  // Cooked flat and round.
  ['pizza', 'pizza'], ['flatbread', 'disc'], ['tortilla', 'disc'], ['pancake', 'disc'],
  ['crepe', 'disc'], ['crêpe', 'disc'], ['blini', 'disc'], ['galette', 'disc'],
  ['waffle', 'disc'], ['rosti', 'disc'], ['rösti', 'disc'], ['frittata', 'disc'],
  ['omelette', 'disc'], ['omelet', 'disc'], ['fried egg', 'disc'],
  ['tart', 'disc'], ['tartare', 'disc'], ['focaccia', 'disc'], ['naan', 'disc'],
  ['pita', 'disc'], ['crumpet', 'disc'],
  // Grains and pulses: a portion is a heap of small pieces, and at this size the
  // pieces are what tell you it is rice rather than a scoop of mash.
  ['rice', 'grains'], ['risotto', 'grains'], ['couscous', 'grains'], ['quinoa', 'grains'],
  ['bulgur', 'grains'], ['farro', 'grains'], ['barley', 'grains'], ['freekeh', 'grains'],
  ['orzo', 'grains'], ['lentil', 'grains'], ['black bean', 'grains'], ['borlotti', 'grains'],
  ['cannellini', 'grains'], ['butter bean', 'grains'], ['caviar', 'grains'], ['roe', 'grains'],
  // Liquids, served in whatever they are poured into.
  ['soup', 'liquid'], ['broth', 'liquid'], ['bisque', 'liquid'], ['consomme', 'liquid'],
  ['consommé', 'liquid'], ['chowder', 'liquid'], ['curry', 'liquid'], ['stew', 'liquid'],
  ['ragout', 'liquid'], ['dal', 'liquid'], ['daal', 'liquid'], ['velouté', 'liquid'],
  // Rolled and filled, which is a tube however it is filled.
  ['cannelloni', 'baton'], ['spring roll', 'baton'], ['burrito', 'baton'], ['churro', 'baton'],
  ['breadstick', 'baton'], ['grissini', 'baton'], ['taquito', 'baton'],
  // Domed set things.
  ['panna cotta', 'dome'], ['souffle', 'dome'], ['soufflé', 'dome'], ['poached egg', 'dome'],
  ['croquette', 'dome'], ['arancini', 'dome'], ['mochi', 'dome'], ['profiterole', 'dome'],
  // Loose piles of leaves.
  ['salad', 'ruffle'], ['kimchi', 'ruffle'], ['sauerkraut', 'ruffle'], ['pickled cabbage', 'ruffle'],
  ['flower', 'leaf'], ['petal', 'leaf'], ['nasturtium', 'leaf'],
  // Cut from something larger.
  ['short rib', 'cut'], ['beef rib', 'cut'], ['brisket', 'cut'], ['meatloaf', 'cut'],
  ['brownie', 'cut'], ['blondie', 'cut'],
  // Arrives in its own shell.
  ['mussel', 'shell'], ['clam', 'shell'], ['vongole', 'shell'], ['oyster', 'shell'],
  ['cockle', 'shell'], ['razor', 'shell'], ['shell', 'shell'],
  // Folded over on itself.
  ['taco', 'folded'], ['wrap', 'folded'], ['quesadilla', 'folded'], ['calzone', 'folded'],
  ['empanada', 'folded'], ['folded', 'folded'],
  // Slices and sheets
  ['cheddar', 'slice'], ['cheese', 'slice'], ['gherkin', 'coin'], ['pickle', 'coin'],
  ['bacon', 'slice'], ['prosciutto', 'slice'], ['ham', 'slice'], ['tomato', 'coin'], ['cherry tomato', 'ball'],
  ['cucumber', 'coin'], ['carpaccio', 'slice'],
  ['nori', 'slice'],
  // Ruffled sheets: salad layered into something rather than scattered over it.
  ['lettuce', 'ruffle'], ['iceberg', 'ruffle'], ['romaine', 'ruffle'], ['cabbage', 'ruffle'],
  ['slaw', 'ruffle'], ['radicchio', 'ruffle'],
  // Broad leaves, which are one leaf each.
  ['leaves', 'leaf'], ['leaf', 'leaf'], ['rocket', 'leaf'],
  ['spinach', 'leaf'], ['basil', 'leaf'], ['shiso', 'leaf'], ['sage', 'leaf'],
  ['mint', 'leaf'], ['sorrel', 'leaf'],
  // Feathery herbs, which come as a sprig: a stem with leaflets off it. At
  // garnish size a single lens reads as a speck of green confetti, and that is
  // what most of the fine-dining plates here were being finished with.
  ['chervil', 'sprig'], ['dill', 'sprig'], ['parsley', 'sprig'], ['coriander', 'sprig'],
  ['cilantro', 'sprig'], ['fennel frond', 'sprig'], ['tarragon', 'sprig'], ['thyme', 'sprig'],
  ['rosemary', 'sprig'], ['oregano', 'sprig'], ['marjoram', 'sprig'], ['cress', 'sprig'],
  ['micro', 'sprig'], ['sprig', 'sprig'], ['herb', 'sprig'], ['watercress', 'sprig'],
  ['chive', 'sprig'], ['frond', 'sprig'],
  // Small scattered things. Seeds are smooth and a crumb is not: one lumpy mesh
  // for both made the sesame on a bun look like popcorn.
  ['sesame', 'seed'], ['seed', 'seed'], ['poppy', 'seed'], ['sprinkle', 'seed'],
  ['caper', 'seed'], ['pine nut', 'seed'],
  ['breadcrumb', 'crumb'], ['crumb', 'crumb'], ['nut', 'crumb'], ['walnut', 'crumb'], ['almond', 'crumb'],
  ['granola', 'crumb'], ['pistachio', 'crumb'],
]

// --- The rest of the world -------------------------------------------------
// The table above is the one this studio was built against: burgers, fine
// dining, a bowl of pasta. Everything it has never heard of comes out `blob` --
// one soft mound in the colour of its role -- so a taco, a kebab and a slice of
// cake all plated as the same lumpy sphere, which is what makes a render look
// like it was not looking.
//
// So: the food of everywhere else, mapped onto the forms the library already
// builds. A name resolves to how the thing SITS on a plate, which is all either
// renderer needs to know -- pad thai is a nest of noodles whatever is in it, and
// a cottage pie is a cut square of bake however it is seasoned. Where a dish is
// named after its sauce, the dish wins: a chef writing "carbonara" as a
// component means the bowl of pasta, and the sauce is a component of its own.
const WORLD: Array<[string, ShapeFamily]> = [
  // Noodles, wherever they are from: long strands are served twirled or heaped,
  // never laid out flat.
  ['pad thai', 'nest'], ['pad see ew', 'nest'], ['drunken noodle', 'nest'], ['chow mein', 'nest'],
  ['lo mein', 'nest'], ['chow fun', 'nest'], ['yakisoba', 'nest'], ['yaki udon', 'nest'],
  ['japchae', 'nest'], ['mee goreng', 'nest'], ['char kway teow', 'nest'], ['dan dan', 'nest'],
  ['biang biang', 'nest'], ['glass noodle', 'nest'], ['rice noodle', 'nest'], ['egg noodle', 'nest'],
  ['shirataki', 'nest'], ['somen', 'nest'], ['pancit', 'nest'], ['bun cha', 'nest'],
  ['pici', 'nest'], ['bigoli', 'nest'], ['mafaldine', 'nest'], ['trenette', 'nest'],
  // Short pasta: tubes if it is cut from a tube, a heap of pieces otherwise.
  ['ditalini', 'tubes'], ['mezze maniche', 'tubes'], ['garganelli', 'tubes'], ['calamarata', 'tubes'],
  ['maccheroni', 'tubes'], ['cavatelli', 'pile'], ['strozzapreti', 'pile'], ['malloreddus', 'pile'],
  ['radiatori', 'pile'], ['campanelle', 'pile'], ['lumache', 'pile'], ['spaetzle', 'pile'],
  ['gnocchetti', 'pile'],
  // Filled pasta and dumplings the world over: puffed in the middle, sealed at
  // the edge, and served several to a plate.
  ['momo', 'pillow'], ['xiao long bao', 'pillow'], ['har gow', 'pillow'], ['siu mai', 'pillow'],
  ['shumai', 'pillow'], ['mandu', 'pillow'], ['manti', 'pillow'], ['khinkali', 'pillow'],
  ['culurgiones', 'pillow'],
  // Rice and grains: a portion is a heaped scoop of loose pieces.
  ['pilaf', 'grains'], ['pilau', 'grains'], ['biryani', 'grains'], ['jollof', 'grains'],
  ['paella', 'grains'], ['jambalaya', 'grains'], ['sticky rice', 'grains'], ['sushi rice', 'grains'],
  ['tabbouleh', 'grains'], ['millet', 'grains'], ['buckwheat', 'grains'], ['baked bean', 'grains'],
  ['sweetcorn', 'grains'], ['kernel', 'grains'], ['tobiko', 'grains'], ['ikura', 'grains'],
  ['pomegranate', 'seed'], ['chia', 'seed'], ['flax', 'seed'], ['nigella', 'seed'],
  ['cumin', 'seed'], ['coriander seed', 'seed'], ['fennel seed', 'seed'], ['pumpkin seed', 'seed'],
  ['sunflower seed', 'seed'],
  // Anything served in the bowl it was ladled into.
  ['pho', 'liquid'], ['laksa', 'liquid'], ['tom yum', 'liquid'], ['tom kha', 'liquid'],
  ['miso soup', 'liquid'], ['gazpacho', 'liquid'], ['vichyssoise', 'liquid'], ['minestrone', 'liquid'],
  ['borscht', 'liquid'], ['goulash', 'liquid'], ['cassoulet', 'liquid'], ['chilli con carne', 'liquid'],
  ['chili', 'liquid'], ['gumbo', 'liquid'], ['tagine', 'liquid'], ['korma', 'liquid'],
  ['tikka masala', 'liquid'], ['masala', 'liquid'], ['vindaloo', 'liquid'], ['rogan josh', 'liquid'],
  ['madras', 'liquid'], ['jalfrezi', 'liquid'], ['sambar', 'liquid'], ['rasam', 'liquid'],
  ['butter chicken', 'liquid'], ['mole', 'liquid'], ['pozole', 'liquid'], ['bouillabaisse', 'liquid'],
  ['cioppino', 'liquid'], ['shakshuka', 'liquid'], ['stroganoff', 'liquid'], ['fricassee', 'liquid'],
  ['blanquette', 'liquid'], ['navarin', 'liquid'], ['pot au feu', 'liquid'], ['feijoada', 'liquid'],
  ['harira', 'liquid'], ['avgolemono', 'liquid'], ['congee', 'liquid'], ['porridge', 'liquid'],
  ['oatmeal', 'liquid'], ['custard', 'liquid'], ['creme anglaise', 'liquid'], ['sukiyaki', 'liquid'],
  ['hotpot', 'liquid'], ['nabe', 'liquid'],
  // A wedge: anything cut from something round, from a slice of cake to a cheek
  // of lemon. The one form on the plate with a straight edge and a point.
  ['cake', 'wedge'], ['cheesecake', 'wedge'], ['sponge', 'wedge'], ['gateau', 'wedge'],
  ['torte', 'wedge'], ['pie', 'wedge'], ['tarte tatin', 'wedge'], ['pizza slice', 'wedge'],
  ['slice of pizza', 'wedge'], ['lemon wedge', 'wedge'], ['lime wedge', 'wedge'],
  ['orange segment', 'wedge'], ['melon', 'wedge'], ['watermelon', 'wedge'], ['cantaloupe', 'wedge'],
  ['honeydew', 'wedge'], ['papaya', 'wedge'], ['mango cheek', 'wedge'], ['pineapple wedge', 'wedge'],
  ['brie', 'wedge'], ['quiche', 'wedge'], ['panforte', 'wedge'], ['tortilla espanola', 'wedge'], ['hispi', 'wedge'],
  ['charred cabbage', 'wedge'], ['roasted squash', 'wedge'], ['wedge', 'wedge'],
  // Pies that are not a slice of pie: a bake served by the spoonful is a cut
  // square of it, and a raised pie is a small round one.
  ['shepherds pie', 'cut'], ['cottage pie', 'cut'], ['fish pie', 'cut'], ['pork pie', 'patty'],
  // A hoop with a hole in it. Nothing else on a plate has a hole in it.
  ['onion ring', 'ring'], ['calamari', 'ring'], ['squid ring', 'ring'], ['bagel', 'ring'],
  ['doughnut', 'ring'], ['donut', 'ring'], ['bundt', 'ring'], ['pineapple ring', 'ring'],
  ['ring', 'ring'],
  // On a stick, which is a way of serving rather than a food: it is what the
  // eye reads first, whatever is threaded on it.
  ['kebab', 'skewer'], ['kabob', 'skewer'], ['kabab', 'skewer'], ['shish', 'skewer'],
  ['souvlaki', 'skewer'], ['satay', 'skewer'], ['sate', 'skewer'], ['yakitori', 'skewer'],
  ['brochette', 'skewer'], ['anticucho', 'skewer'], ['kushiyaki', 'skewer'], ['shashlik', 'skewer'],
  ['espetada', 'skewer'], ['tikka', 'skewer'], ['lollipop', 'skewer'], ['skewer', 'skewer'],
  // One round thing. A portion of many round things is a heap of them, further
  // down: a meatball is a ball, and peas are a pile.
  ['meatball', 'ball'], ['polpette', 'ball'], ['gnudi', 'ball'], ['takoyaki', 'ball'],
  ['hush puppy', 'ball'], ['rasgulla', 'ball'], ['gulab jamun', 'ball'], ['laddu', 'ball'],
  ['ladoo', 'ball'], ['cake pop', 'ball'], ['chocolate truffle', 'ball'], ['bocconcini', 'ball'],
  ['burrata', 'ball'], ['mozzarella ball', 'ball'], ['boiled egg', 'ball'], ['scotch egg', 'ball'],
  ['quail egg', 'ball'], ['century egg', 'ball'], ['egg', 'ball'], ['apple', 'ball'],
  ['pear', 'ball'], ['fig', 'ball'], ['peach', 'ball'], ['apricot', 'ball'], ['plum', 'ball'],
  ['cherry', 'ball'], ['lychee', 'ball'], ['kiwi', 'ball'], ['passion fruit', 'ball'],
  ['persimmon', 'ball'], ['date', 'ball'], ['radish', 'ball'], ['beetroot', 'ball'],
  ['turnip', 'ball'], ['garlic clove', 'ball'], ['new potato', 'ball'], ['roast potato', 'chunk'], ['roast potatoes', 'chunk'], ['roasted potato', 'chunk'], ['roasted potatoes', 'chunk'], ['roasties', 'chunk'],
  ['sauteed potato', 'chunk'], ['sauteed potatoes', 'chunk'], ['parmentier', 'chunk'], ['roast squash', 'chunk'], ['roasted squash', 'chunk'], ['roast pumpkin', 'chunk'], ['roast butternut', 'chunk'],
  ['baby potato', 'ball'], ['jersey royal', 'ball'], ['fondant potato', 'ball'],
  // Small round things by the handful, which is a heap and not one of anything.
  ['pea', 'heap'], ['petit pois', 'heap'], ['garden pea', 'heap'], ['olive', 'heap'], ['grape', 'heap'], ['blueberry', 'heap'], ['raspberry', 'heap'],
  ['blackberry', 'heap'], ['redcurrant', 'heap'], ['cranberry', 'heap'], ['chickpea', 'heap'], ['blackcurrant', 'heap'],
  ['edamame', 'pod'], ['broad bean', 'pod'], ['fava', 'pod'], ['kidney bean', 'heap'],
  ['brussels sprout', 'heap'], ['floret', 'blob'], ['broccoli', 'blob'], ['cauliflower', 'blob'], ['tenderstem', 'baton'], ['tenderstem broccoli', 'baton'],
  ['romanesco', 'blob'], ['stir fry', 'pile'], ['ratatouille', 'pile'], ['caponata', 'pile'],
  ['succotash', 'pile'], ['caramelised onion', 'pile'], ['nugget', 'pile'], ['goujon', 'pile'],
  ['scampi', 'prawn'], ['tater tot', 'pile'], ['popcorn', 'pile'], ['patatas bravas', 'pile'],
  ['poutine', 'fries'], ['falafel', 'ball'],
  // A cut of something, or a portion cut out of a bake. Both are a squared-off
  // slab with a browned top, which is the one thing they have in common and the
  // only thing a renderer needs.
  ['wagyu', 'steak'], ['striploin', 'steak'], ['strip loin', 'steak'], ['t bone', 'steak'],
  ['tomahawk', 'steak'], ['porterhouse', 'steak'], ['flank', 'steak'], ['skirt', 'steak'],
  ['bavette', 'steak'], ['onglet', 'steak'], ['picanha', 'steak'], ['entrecote', 'steak'],
  ['chateaubriand', 'steak'], ['chop', 'steak'], ['cutlet', 'steak'], ['escalope', 'steak'],
  ['katsu', 'steak'], ['shank', 'cut'], ['osso buco', 'cut'], ['oxtail', 'cut'],
  ['cheek', 'cut'], ['gammon', 'steak'], ['ham hock', 'cut'], ['wing', 'cut'],
  ['quail', 'breast'], ['pheasant', 'breast'], ['partridge', 'breast'], ['guinea fowl', 'breast'],
  ['rabbit', 'steak'], ['goat', 'steak'], ['mutton', 'steak'], ['goose', 'breast'],
  ['monkfish', 'fillet'], ['turbot', 'fillet'], ['brill', 'fillet'], ['plaice', 'fillet'],
  ['sole', 'fillet'], ['mackerel', 'fillet'], ['herring', 'fillet'], ['trout', 'fillet'],
  ['snapper', 'fillet'], ['grouper', 'fillet'], ['swordfish', 'steak'], ['hake', 'fillet'],
  ['pollock', 'fillet'], ['haddock', 'fillet'], ['skate', 'fillet'], ['seitan', 'cut'],
  ['paneer', 'cut'], ['halloumi', 'cut'], ['tempeh', 'cut'], ['nigiri', 'cut'],
  ['moussaka', 'cut'], ['pastitsio', 'cut'], ['parmigiana', 'cut'], ['gratin', 'cut'],
  ['dauphinoise', 'cut'], ['mac and cheese', 'cut'], ['mac cheese', 'cut'],
  ['macaroni cheese', 'cut'], ['cauliflower cheese', 'cut'], ['wellington', 'cut'],
  ['en croute', 'cut'], ['millefeuille', 'cut'], ['mille feuille', 'cut'], ['tiramisu', 'cut'],
  ['baklava', 'cut'], ['flapjack', 'cut'], ['lamington', 'cut'], ['fudge', 'cut'],
  ['nougat', 'cut'], ['marshmallow', 'cut'], ['halva', 'cut'], ['turkish delight', 'cut'],
  ['kulfi', 'cut'], ['sticky toffee pudding', 'cut'], ['polpettone', 'cut'], ['lasagne', 'cut'],
  // Long things that lie down: sausages, rolls, whole vegetables, a rack.
  ['chipolata', 'baton'], ['bratwurst', 'baton'], ['frankfurter', 'baton'], ['hot dog', 'baton'],
  ['merguez', 'baton'], ['boudin', 'baton'], ['andouille', 'baton'], ['salsiccia', 'baton'],
  ['cevapi', 'baton'], ['kofta', 'baton'], ['seekh', 'baton'], ['drumstick', 'baton'],
  ['rib', 'baton'], ['egg roll', 'baton'], ['lumpia', 'baton'], ['blintz', 'baton'],
  ['enchilada', 'baton'], ['dosa', 'baton'], ['roulade', 'baton'], ['cannoli', 'baton'],
  ['eclair', 'baton'], ['banana', 'baton'], ['plantain', 'baton'], ['corn on the cob', 'baton'],
  ['corn cob', 'baton'], ['baby corn', 'baton'], ['okra', 'pod'], ['runner bean', 'pod'],
  ['salsify', 'baton'], ['chicory', 'baton'], ['aubergine', 'baton'], ['eggplant', 'baton'],
  ['squid', 'baton'], ['sardine', 'wholefish'], ['eel', 'baton'], ['crayfish', 'prawn'],
  ['lobster', 'lobster'], ['baguette', 'baton'], ['pide', 'baton'], ['flauta', 'baton'],
  ['corn dog', 'baton'],
  // Cooked flat and round, or fried flat and breaded.
  ['schnitzel', 'disc'], ['tonkatsu', 'disc'], ['cookie', 'disc'], ['biscuit', 'disc'],
  ['shortbread', 'disc'], ['macaron', 'disc'], ['cracker', 'disc'], ['poppadom', 'disc'],
  ['papadum', 'disc'], ['tostada', 'disc'], ['arepa', 'disc'], ['pupusa', 'disc'],
  ['gordita', 'disc'], ['injera', 'disc'], ['uttapam', 'disc'], ['okonomiyaki', 'disc'],
  ['latke', 'disc'], ['crab cake', 'patty'], ['roti', 'disc'], ['chapati', 'disc'],
  ['paratha', 'disc'], ['lavash', 'disc'], ['manakish', 'disc'], ['lahmacun', 'disc'],
  ['socca', 'disc'], ['farinata', 'disc'], ['tostone', 'disc'], ['camembert', 'disc'],
  ['english muffin', 'disc'], ['pikelet', 'disc'], ['clafoutis', 'disc'], ['creme brulee', 'disc'],
  ['custard tart', 'disc'], ['pastel de nata', 'disc'], ['egg tart', 'disc'], ['pithivier', 'disc'],
  ['khachapuri', 'disc'], ['pizzette', 'disc'],
  // Rice pressed into a shape, which is a small flat round or a small flat brick.
  ['maki', 'patty'], ['uramaki', 'patty'], ['futomaki', 'patty'], ['hosomaki', 'patty'],
  ['california roll', 'patty'], ['gimbap', 'patty'], ['onigiri', 'patty'],
  // Spooned into a smooth shape, or soft enough that a spoon is how it arrives.
  ['guacamole', 'quenelle'], ['baba ganoush', 'quenelle'], ['tzatziki', 'quenelle'],
  ['taramasalata', 'quenelle'], ['tapenade', 'quenelle'], ['ricotta', 'quenelle'],
  ['mascarpone', 'quenelle'], ['cottage cheese', 'quenelle'], ['cream cheese', 'quenelle'],
  ['creme fraiche', 'quenelle'], ['clotted cream', 'quenelle'], ['scrambled egg', 'quenelle'],
  ['butter', 'quenelle'], ['chutney', 'quenelle'], ['jam', 'quenelle'], ['marmalade', 'quenelle'],
  ['compote', 'quenelle'], ['relish', 'quenelle'], ['polenta', 'quenelle'], ['grits', 'quenelle'],
  ['skyr', 'quenelle'], ['quark', 'quenelle'], ['rillettes', 'quenelle'], ['brandade', 'quenelle'],
  ['trifle', 'quenelle'], ['gelato', 'quenelle'], ['semifreddo', 'quenelle'], ['haggis', 'quenelle'],
  ['refried bean', 'quenelle'], ['yoghurt', 'quenelle'], ['yogurt', 'quenelle'],
  // Domed and set, or baked with a risen top.
  ['scone', 'dome'], ['cupcake', 'dome'], ['flan', 'dome'], ['creme caramel', 'dome'],
  ['pavlova', 'dome'], ['meringue', 'dome'], ['baba', 'dome'], ['savarin', 'dome'],
  ['panettone', 'dome'], ['pandoro', 'dome'], ['timbale', 'dome'], ['yorkshire pudding', 'dome'],
  ['popover', 'dome'], ['vol au vent', 'dome'], ['choux', 'dome'], ['bombe', 'dome'],
  ['knish', 'dome'], ['idli', 'dome'], ['christmas pudding', 'dome'], ['aspic', 'dome'],
  // Folded over on itself: a parcel, a half moon, a crescent.
  ['samosa', 'folded'], ['curry puff', 'folded'], ['pasty', 'folded'], ['turnover', 'folded'],
  ['sfogliatella', 'folded'], ['croissant', 'folded'], ['sambusak', 'folded'],
  ['empanadilla', 'folded'], ['temaki', 'folded'],
  // Carved thin: charcuterie, cured fish, anything shaved over the top.
  ['salami', 'coin'], ['pepperoni', 'coin'], ['mortadella', 'slice'], ['bresaola', 'slice'],
  ['pastrami', 'slice'], ['coppa', 'slice'], ['speck', 'slice'], ['lardo', 'slice'],
  ['chorizo', 'coin'], ['sashimi', 'slice'], ['smoked salmon', 'slice'], ['gravlax', 'slice'],
  ['lox', 'slice'], ['shaving', 'slice'], ['ribbon', 'slice'], ['wafer', 'slice'],
  ['filo', 'slice'], ['brik', 'slice'], ['crispbread', 'slice'], ['kombu', 'slice'],
  ['onion', 'ring'], ['shallot', 'ring'], ['avocado', 'slice'],
  // Leaves and shoots, whole or in a loose pile.
  ['lollo rosso', 'ruffle'], ['frisee', 'ruffle'], ['pak choi', 'ruffle'], ['bok choy', 'ruffle'],
  ['seaweed', 'ruffle'], ['wakame', 'ruffle'], ['endive', 'leaf'], ['mizuna', 'leaf'],
  ['chard', 'leaf'], ['cavolo nero', 'leaf'], ['kale', 'leaf'], ['rucola', 'leaf'],
  ['mache', 'leaf'], ['purslane', 'leaf'], ['borage', 'leaf'], ['marigold', 'leaf'],
  ['viola', 'leaf'], ['pansy', 'leaf'], ['pea shoot', 'sprig'], ['bean sprout', 'sprig'],
  ['alfalfa', 'sprig'], ['samphire', 'sprig'], ['lovage', 'sprig'], ['lemon balm', 'sprig'],
  // Scattered over the top at the last second.
  ['panko', 'crumb'], ['furikake', 'crumb'], ['dukkah', 'crumb'], ['zaatar', 'crumb'],
  ['gremolata', 'crumb'], ['praline', 'crumb'], ['brittle', 'crumb'], ['streusel', 'crumb'],
  ['crumble', 'crumb'], ['hazelnut', 'crumb'], ['pecan', 'crumb'], ['cashew', 'crumb'],
  ['macadamia', 'crumb'], ['peanut', 'crumb'], ['chestnut', 'crumb'], ['cocoa nib', 'crumb'],
  ['chocolate chip', 'crumb'], ['sea salt', 'crumb'], ['bacon bit', 'crumb'],
  ['crackling', 'crumb'], ['pork scratching', 'crumb'], ['garlic', 'crumb'],
  // A pinch of spice is a dust over the top, whatever it is a dust of -- which
  // the library can finally say, rather than approximating it with the crumb
  // that also has to serve for chopped hazelnuts.
  ['spice', 'dust'], ['powder', 'dust'], ['dust', 'dust'], ['paprika', 'dust'],
  ['turmeric', 'dust'], ['sumac', 'dust'], ['black pepper', 'dust'],
  // Threads and flakes, which are not powders: you can see the pieces.
  ['saffron', 'crumb'], ['pepper flake', 'crumb'],
  ['chilli flake', 'crumb'], ['chili flake', 'crumb'],
  // A spoonful of something poured or piped. Most of these arrive as the sauce
  // component, which is plated on its own -- but a chef who lists the pesto as a
  // garnish should get a quenelle of it, not an unrecognised green lump.
  ['jus', 'quenelle'], ['gravy', 'quenelle'], ['hollandaise', 'quenelle'],
  ['bearnaise', 'quenelle'], ['beurre blanc', 'quenelle'], ['peppercorn sauce', 'quenelle'],
  ['pesto', 'quenelle'], ['chimichurri', 'quenelle'], ['romesco', 'quenelle'],
  ['salsa', 'quenelle'], ['harissa', 'quenelle'], ['tahini', 'quenelle'], ['aioli', 'quenelle'],
  ['mayonnaise', 'quenelle'], ['mayo', 'quenelle'], ['ketchup', 'quenelle'], ['ragu', 'quenelle'],
  ['teriyaki', 'quenelle'], ['ponzu', 'quenelle'], ['glaze', 'quenelle'], ['oil', 'quenelle'],
  ['vinaigrette', 'quenelle'], ['coulis', 'quenelle'], ['honey', 'quenelle'], ['syrup', 'quenelle'],
  ['sauce', 'quenelle'], ['gel', 'quenelle'], ['foam', 'quenelle'], ['emulsion', 'quenelle'],
  // The rest of what a week of typing turned up.
  ['crab', 'crab'], ['octopus', 'baton'], ['poke', 'pile'], ['shawarma', 'pile'],
  ['pakora', 'pile'], ['hash', 'pile'], ['feta', 'cut'], ['crumbled feta', 'crumb'], ['greens', 'ruffle'],
  ['ciabatta', 'slice'], ['sourdough', 'slice'], ['rye', 'slice'], ['crostini', 'slice'],
  ['bruschetta', 'slice'], ['manchego', 'wedge'], ['gorgonzola', 'wedge'], ['stilton', 'wedge'],
  ['roquefort', 'wedge'], ['parmesan', 'wedge'], ['pecorino', 'wedge'], ['gruyere', 'wedge'],
  ['toad in the hole', 'cut'], ['bubble and squeak', 'patty'], ['banger', 'baton'],
  ['rhubarb', 'baton'], ['pain au chocolat', 'cut'], ['affogato', 'liquid'],
  ['sausage roll', 'baton'], ['steak pie', 'dome'], ['poached pear', 'ball'],
  ['gooseberry', 'pile'], ['blondie', 'cut'], ['profiterole', 'dome'], ['granola', 'crumb'],
  ['fish', 'fillet'], ['sweet potato', 'wedge'], ['quenelle', 'quenelle'], ['cream', 'quenelle'],
  ['raita', 'quenelle'], ['gochujang', 'quenelle'], ['bechamel', 'quenelle'],
  ['sriracha', 'quenelle'], ['hoisin', 'quenelle'], ['sambal', 'quenelle'],
  ['tamarind', 'quenelle'], ['leche de tigre', 'quenelle'], ['dipping sauce', 'quenelle'],
  ['bonito', 'crumb'],
  // National dishes, which are how most people name what they are cooking. A
  // dish name says how it is served more reliably than an ingredient does:
  // nobody plates a coq au vin dry, and nobody ladles a carne asada.
  ['bibimbap', 'grains'], ['nasi goreng', 'grains'], ['kedgeree', 'grains'], ['plov', 'grains'],
  ['mujadara', 'grains'], ['koshari', 'grains'], ['dolma', 'baton'], ['borek', 'baton'],
  ['tamale', 'baton'], ['elote', 'baton'], ['goi cuon', 'baton'], ['boerewors', 'baton'],
  ['coq au vin', 'liquid'], ['cullen skink', 'liquid'], ['khao soi', 'liquid'], ['sopa', 'liquid'],
  ['birria', 'liquid'], ['doro wat', 'liquid'], ['egusi', 'liquid'], ['mapo tofu', 'liquid'],
  ['fondue', 'liquid'], ['ceviche', 'pile'], ['aloo gobi', 'pile'], ['rendang', 'pile'],
  ['bulgogi', 'pile'], ['kung pao', 'pile'], ['sweet and sour', 'pile'], ['gado gado', 'pile'],
  ['barbacoa', 'pile'], ['al pastor', 'pile'], ['ropa vieja', 'pile'], ['chakalaka', 'pile'],
  ['chilaquiles', 'pile'], ['fatteh', 'pile'], ['mezze', 'pile'], ['gyro', 'pile'],
  ['olivier', 'pile'], ['bobotie', 'cut'], ['carne asada', 'steak'], ['asado', 'steak'],
  ['galbi', 'cut'], ['bunny chow', 'cut'], ['croque monsieur', 'stack'], ['tartiflette', 'cut'],
  ['spanakopita', 'cut'], ['saganaki', 'cut'], ['janssons', 'cut'], ['chile relleno', 'cut'],
  ['banh mi', 'stack'], ['katsu sando', 'stack'], ['tteokbokki', 'tubes'], ['tteok', 'tubes'],
  ['lagman', 'nest'], ['banh xeo', 'folded'], ['pastilla', 'disc'], ['huevos rancheros', 'disc'],
  ['roti canai', 'disc'], ['pan con tomate', 'slice'], ['peking duck', 'slice'],
  ['char siu', 'slice'], ['biltong', 'slice'], ['smorrebrod', 'slice'], ['kibbeh', 'ball'],
  ['kottbullar', 'ball'], ['pao de queijo', 'ball'], ['fufu', 'ball'], ['coxinha', 'dome'],
  ['mofongo', 'dome'], ['meat pie', 'dome'], ['tourtiere', 'wedge'], ['pelmeni', 'pillow'],
  ['dim sum', 'pillow'], ['moules', 'shell'], ['raclette', 'quenelle'], ['saag', 'quenelle'],
  ['ful medames', 'quenelle'], ['menemen', 'quenelle'], ['nicoise', 'ruffle'],
  ['panzanella', 'ruffle'], ['fattoush', 'ruffle'], ['horiatiki', 'ruffle'], ['waldorf', 'ruffle'],
]

// --- What the last audit found -------------------------------------------
// The two tables above were written against a corpus, and against that corpus
// they score full marks -- which measures the corpus, not the studio. Asked
// about 433 foods they were NOT written against, they put 47% of them on the
// plate as a lumpy sphere: every mushroom, every whole roast, every crisp, most
// of the offal, and most of the menu of about fifteen countries.
//
// So: that list, worked through. Nothing here is exotic -- it is mushrooms,
// Sunday lunch, a cheese board, and the food of anywhere the first pass did not
// happen to be typing about that day.
const KITCHEN: Array<[string, ShapeFamily]> = [
  // Mushrooms, which were the single largest hole in the library: there was no
  // form with an undercut, so every one of them came out as a lumpy sphere and
  // the few that got a form at all came out as bread rolls.
  ['mushroom', 'cap'], ['shiitake', 'cap'], ['portobello', 'cap'], ['chestnut mushroom', 'cap'],
  ['button mushroom', 'cap'], ['oyster mushroom', 'cap'], ['king oyster', 'cap'], ['enoki', 'cap'],
  ['shimeji', 'cap'], ['maitake', 'cap'], ['hen of the wood', 'cap'], ['chanterelle', 'cap'],
  ['girolle', 'cap'], ['morel', 'cap'], ['porcini', 'cap'], ['cep', 'cap'],
  ['trompette', 'cap'], ['pied de mouton', 'cap'], ['st georges mushroom', 'cap'],
  ['field mushroom', 'cap'], ['wild mushroom', 'cap'], ['eryngii', 'cap'], ['nameko', 'cap'],
  ['wood ear', 'cap'], ['truffle', 'ball'], ['duxelles', 'quenelle'], ['duxelle', 'quenelle'],
  // Served whole and carved at the table, which is most of a Sunday menu, most
  // of a sharing menu, and the whole of a carvery.
  ['whole roast', 'whole'], ['roast chicken', 'bird'], ['whole chicken', 'bird'], ['rotisserie chicken', 'bird'], ['roasted chicken', 'bird'],
  ['roast duck', 'bird'], ['whole duck', 'bird'], ['roast turkey', 'bird'],
  ['whole turkey', 'bird'], ['roast goose', 'bird'], ['turkey crown', 'whole'], ['crown roast', 'whole'],
  ['sunday roast', 'whole'], ['pot roast', 'whole'], ['porchetta', 'whole'],
  ['poussin', 'bird'], ['spatchcock', 'bird'], ['suckling pig', 'whole'],
  ['whole fish', 'wholefish'], ['whole sea bream', 'wholefish'], ['whole seabass', 'wholefish'],
  ['whole sea bass', 'wholefish'], ['whole plaice', 'wholefish'], ['whole lemon sole', 'whole'],
  ['whole lobster', 'whole'], ['whole crab', 'whole'], ['lechon', 'whole'],
  ['mechoui', 'whole'], ['roast joint', 'whole'], ['leg of lamb', 'whole'],
  ['shoulder of lamb', 'whole'], ['rib of beef', 'whole'], ['carvery', 'whole'],
  ['whole baked', 'whole'], ['whole grilled', 'whole'], ['on the bone', 'whole'],
  // Thin and brittle, and standing up. Almost the signature of the kind of
  // plate this studio is for, and there was no form for any of it.
  ['tuile', 'shard'], ['frico', 'shard'], ['parmesan crisp', 'shard'],
  ['cheese crisp', 'shard'], ['lace crisp', 'shard'], ['honeycomb', 'shard'],
  ['brittle shard', 'shard'], ['chocolate shard', 'shard'], ['sugar glass', 'shard'],
  ['isomalt', 'shard'], ['shard', 'shard'], ['chicken skin', 'shard'],
  ['crispy skin', 'shard'], ['puffed skin', 'shard'], ['chicharron', 'shard'],
  ['feuille de brick', 'shard'], ['meringue shard', 'shard'], ['filo shard', 'shard'],
  ['seaweed crisp', 'shard'], ['kale crisp', 'shard'], ['potato tuile', 'shard'],
  ['squid ink tuile', 'shard'], ['sesame tuile', 'shard'], ['buckwheat tuile', 'shard'],
  ['puffed rice cracker', 'shard'], ['prawn cracker', 'shard'], ['shrimp cracker', 'shard'],
  // Anything else that says "crisps" is a bag of them, which is a loose heap.
  ['crisp', 'fries'], ['gaufrette', 'fries'], ['pont neuf', 'fries'],
  // A veil rather than a heap.
  // Safe as a key only because every food that ENDS in those three letters --
  // squash, goulash, succotash, hash, mash -- has a longer key of its own, and
  // the longer key is always read first.
  ['ash', 'dust'], ['vegetable ash', 'dust'], ['charcoal', 'dust'], ['cocoa powder', 'dust'],
  ['matcha', 'dust'], ['bee pollen', 'dust'], ['icing sugar', 'dust'], ['confectioners sugar', 'dust'],
  ['burnt onion', 'dust'], ['onion ash', 'dust'], ['dusting', 'dust'],
  // Offal and the rest of the animal, which is all a cut of something.
  ['sweetbread', 'cut'], ['foie gras', 'cut'], ['liver', 'cut'], ['kidney', 'cut'],
  ['heart', 'cut'], ['tongue', 'slice'], ['gizzard', 'pile'], ['brain', 'quenelle'],
  ['marrow bone', 'baton'], ['bone marrow', 'baton'], ['tripe', 'ruffle'],
  ['faggot', 'ball'], ['white pudding', 'patty'], ['pancetta', 'slice'],
  ['guanciale', 'slice'], ['saucisson', 'slice'], ['nduja', 'quenelle'],
  ['lardon', 'baton'], ['rillette', 'quenelle'],
  // Shellfish and small fish that arrive by the handful or in their own shell.
  ['sea urchin', 'shell'], ['urchin', 'shell'], ['paua', 'shell'], ['abalone', 'patty'],
  ['whelk', 'pile'], ['winkle', 'pile'], ['whitebait', 'wholefish'], ['anchovy', 'wholefish'],
  ['sea urchin', 'shell'], ['uni', 'quenelle'],
  ['kipper', 'fillet'], ['bloater', 'fillet'], ['arbroath smokie', 'cut'], ['lutefisk', 'cut'],
  ['rakfisk', 'slice'], ['fiskeboller', 'ball'], ['fish finger', 'baton'],
  ['fish goujon', 'baton'], ['angels on horseback', 'pile'], ['devilled kidney', 'cut'],
  ['potted shrimp', 'quenelle'], ['dressed crab', 'crab'], ['crab claw', 'crab'],
  ['soft shell crab', 'crab'], ['cuttlefish', 'cut'],
  // Vegetables the first pass did not reach.
  ['jerusalem artichoke', 'ball'], ['globe artichoke', 'dome'], ['artichoke heart', 'ball'],
  ['artichoke', 'dome'], ['cardoon', 'baton'], ['kohlrabi', 'ball'], ['squash', 'wedge'],
  ['swede', 'ball'], ['parsnip', 'baton'], ['daikon', 'baton'], ['bamboo shoot', 'baton'],
  ['water chestnut', 'slice'], ['lotus root', 'ring'], ['takuan', 'slice'],
  ['pickled ginger', 'ruffle'], ['gari', 'ruffle'], ['umeboshi', 'ball'],
  ['wasabi', 'quenelle'], ['yuba', 'ruffle'], ['natto', 'grains'], ['jackfruit', 'pile'],
  ['silken tofu', 'cut'], ['tofu puff', 'cut'], ['remoulade', 'pile'], ['coleslaw', 'ruffle'],
  ['roast celeriac', 'wedge'], ['celeriac steak', 'cut'], ['miso', 'quenelle'], ['ful', 'quenelle'],
  ['dressing', 'liquid'], ['mojito', 'glass'], ['margarita', 'glass'], ['old fashioned', 'glass'], ['espresso martini', 'glass'], ['aperol spritz', 'glass'],
  ['negroni', 'glass'], ['cosmopolitan', 'glass'], ['pina colada', 'glass'], ['gin and tonic', 'glass'], ['bloody mary', 'glass'],
  ['whisky sour', 'glass'], ['whiskey sour', 'glass'], ['espresso', 'glass'], ['latte', 'glass'], ['cappuccino', 'glass'],
  ['flat white', 'glass'], ['americano', 'glass'], ['mocha', 'glass'], ['hot chocolate', 'glass'], ['matcha latte', 'glass'],
  ['chai latte', 'glass'], ['iced tea', 'glass'], ['iced coffee', 'glass'], ['bubble tea', 'glass'], ['lemonade', 'glass'],
  ['strawberry lemonade', 'glass'], ['orange juice', 'glass'], ['apple juice', 'glass'], ['kombucha', 'glass'], ['vanilla milkshake', 'glass'],
  ['chocolate milkshake', 'glass'], ['strawberry milkshake', 'glass'], ['banana milkshake', 'glass'], ['salted caramel milkshake', 'glass'], ['cookies and cream milkshake', 'glass'],
  ['peanut butter milkshake', 'glass'], ['milkshake', 'glass'], ['green smoothie', 'glass'], ['mango smoothie', 'glass'], ['banana smoothie', 'glass'],
  ['peanut butter smoothie', 'glass'], ['tropical smoothie', 'glass'], ['protein smoothie', 'glass'], ['strawberry banana smoothie', 'glass'], ['berry smoothie', 'glass'],
  ['smoothie', 'glass'],
  ['cinnamon', 'dust'], ['oats', 'grains'], ['matcha powder', 'dust'],
  ['rouille', 'liquid'], ['ribs', 'cut'], ['pork ribs', 'cut'], ['spare ribs', 'cut'], ['baby back ribs', 'cut'], ['rack of ribs', 'cut'], ['short ribs', 'cut'], ['short rib', 'cut'], ['tofu scramble', 'heap'], ['nut roast', 'cut'], ['sloppy joe mince', 'heap'], ['chicken paprikash', 'liquid'], ['paprikash', 'liquid'], ['banana pudding', 'heap'], ['peach cobbler', 'dome'], ['mozzarella sticks', 'baton'], ['cheese sticks', 'baton'], ['chia pudding', 'quenelle'], ['bigos', 'heap'], ['dutch baby', 'disc'], ['pain perdu', 'slice'], ['kassler', 'cut'], ['maultaschen', 'pillow'], ['fried potatoes', 'chunk'], ['frikadellen', 'patty'], ['vareniki', 'pillow'], ['pirozhki', 'dome'], ['zurek', 'liquid'], ['sarma', 'baton'], ['langos', 'disc'], ['kaiserschmarrn', 'heap'], ['berliner', 'ball'], ['lebkuchen', 'disc'], ['burnt ends', 'chunk'], ['smores', 'cut'], ['whole red mullet', 'wholefish'], ['sardines', 'wholefish'], ['whole sole', 'wholefish'], ['whole salmon', 'wholefish'], ['whole mackerel', 'wholefish'], ['whole snapper', 'wholefish'], ['whole bream', 'wholefish'], ['whole trout', 'wholefish'], ['brown crab', 'crab'], ['langouste', 'lobster'], ['lobster tail', 'lobster'], ['tiger prawn', 'prawn'], ['king prawn', 'prawn'], ['clapshot', 'quenelle'], ['haggis bon bons', 'ball'], ['gemista', 'ball'], ['keftedes', 'ball'], ['bifteki', 'patty'], ['soutzoukakia', 'baton'], ['imam bayildi', 'cut'], ['karniyarik', 'cut'], ['escargots', 'shell'], ['bacalao', 'fillet'], ['neeps', 'quenelle'], ['tatties', 'quenelle'], ['fasolada', 'liquid'], ['fabada', 'liquid'], ['sangria', 'glass'], ['tiropita', 'cut'], ['bougatsa', 'cut'], ['gigantes', 'heap'], ['briam', 'pile'], ['galaktoboureko', 'cut'], ['sigara boregi', 'baton'], ['roasted vegetables', 'pile'], ['crema catalana', 'disc'], ['jacket potato', 'ball'], ['ssamjang', 'liquid'], ['amba', 'liquid'], ['maqluba', 'pile'], ['chole', 'pile'], ['roasted cauliflower', 'chunk'], ['raisins', 'heap'], ['kelewele', 'chunk'], ['malva pudding', 'cut'], ['bara', 'disc'], ['maduros', 'slice'], ['tentsuyu', 'liquid'], ['shichimi', 'dust'], ['tsukune', 'ball'], ['bravas sauce', 'liquid'], ['bombay potatoes', 'chunk'], ['albondigas', 'ball'], ['ensaladilla rusa', 'pile'], ['pintxos', 'skewer'], ['vegetable fajita', 'folded'], ['milk', 'liquid'], ['sprinkles', 'dust'], ['citrus', 'wedge'], ['boiled potato', 'ball'], ['boiled potatoes', 'ball'], ['stuffing', 'pile'], ['pigs in blankets', 'baton'], ['pitta', 'disc'], ['doner', 'pile'],
  ['zucchini', 'baton'], ['corn', 'grains'], ['mango', 'wedge'], ['sliced mango', 'slice'], ['mango slice', 'slice'],
  ['champagne', 'liquid'], ['vermouth', 'liquid'], ['prosecco', 'liquid'], ['diane', 'liquid'], ['beurre noisette', 'liquid'], ['noisette', 'liquid'],
  ['crushed potato', 'patty'], ['crushed potatoes', 'patty'], ['smashed potato', 'patty'], ['smashed potatoes', 'patty'], ['crushed new potatoes', 'patty'], ['smashed new potatoes', 'patty'], ['crushed new potato', 'patty'], ['smashed new potato', 'patty'],
  ['shaved parmesan', 'slice'], ['parmesan shaving', 'slice'], ['parmesan shavings', 'slice'], ['goat cheese', 'coin'], ['goats cheese', 'coin'],
  ['chevre', 'coin'], ['crispy shallot', 'crumb'], ['crispy onion', 'crumb'], ['fried shallot', 'crumb'], ['pulled pork', 'pile'],
  ['lemon zest', 'crumb'], ['orange zest', 'crumb'], ['lime zest', 'crumb'], ['zest', 'crumb'],
  ['potato salad', 'pile'], ['kumara', 'wedge'], ['corn rib', 'baton'],
  ['sweetcorn rib', 'baton'], ['creamed corn', 'quenelle'], ['polenta chip', 'fries'],
  // The classical potato repertoire, which is six different shapes and was six
  // identical lumpy spheres.
  ['pomme anna', 'disc'], ['pommes anna', 'disc'], ['pommes dauphine', 'ball'],
  ['duchesse potato', 'dome'], ['pomme dauphinoise', 'cut'], ['potato terrine', 'cut'],
  ['boulangere', 'cut'], ['lyonnaise potato', 'pile'], ['sarladaise', 'pile'],
  // Bread, pastry and everything a bakery sends out.
  ['challah', 'dome'], ['pumpernickel', 'slice'], ['soda bread', 'wedge'],
  ['cornbread', 'cut'], ['bara brith', 'slice'], ['ruisleipa', 'slice'], ['simit', 'ring'],
  ['pretzel', 'ring'], ['melba toast', 'slice'], ['oatcake', 'disc'], ['rarebit', 'slice'],
  ['croquembouche', 'dome'], ['madeleine', 'shell'], ['financier', 'cut'], ['canele', 'dome'],
  ['kouign amann', 'disc'], ['palmier', 'disc'], ['danish pastry', 'disc'], ['babka', 'cut'],
  ['cinnamon roll', 'disc'], ['strudel', 'baton'], ['beaver tail', 'disc'],
  ['nanaimo bar', 'cut'], ['karjalanpiirakka', 'disc'], ['kalakukko', 'dome'],
  ['mooncake', 'disc'], ['wife cake', 'disc'], ['pineapple bun', 'dome'],
  // Sweet things, which are mostly a spoonful, a wedge or a set dome.
  ['eton mess', 'quenelle'], ['blancmange', 'dome'], ['junket', 'dome'],
  ['semolina', 'grains'], ['tapioca', 'grains'], ['dulce de leche', 'quenelle'],
  ['salted caramel', 'quenelle'], ['caramel', 'quenelle'], ['butterscotch', 'quenelle'],
  ['lemon curd', 'quenelle'], ['fruit leather', 'slice'], ['freeze dried', 'crumb'],
  ['brigadeiro', 'ball'], ['medovik', 'wedge'], ['ptichye moloko', 'cut'],
  ['red velvet', 'wedge'], ['key lime', 'wedge'], ['leipajuusto', 'wedge'],
  ['syrniki', 'patty'], ['halo halo', 'quenelle'], ['bibingka', 'disc'], ['puto', 'dome'],
  // A board, a spread, a plate of many things: a heap of separate pieces is the
  // nearest the library gets, and it is much nearer than one lump.
  ['cheese board', 'pile'], ['charcuterie', 'pile'], ['antipasti', 'pile'],
  ['crudites', 'pile'], ['grazing board', 'pile'], ['smorgasbord', 'pile'],
  ['full english', 'pile'], ['dips', 'pile'], ['nacho', 'pile'], ['casado', 'pile'],
  ['cornbread dressing', 'pile'], ['hangi', 'pile'], ['kitfo', 'pile'], ['tibs', 'pile'],
  ['sisig', 'pile'], ['rojak', 'pile'], ['chai tow kway', 'pile'], ['iskender', 'pile'],
  ['fattah', 'pile'], ['pommes souffle', 'pile'],
  // The rest of the world's menu, form by form.
  ['espresso', 'glass'], ['matcha latte', 'glass'], ['broth bowl', 'liquid'],
  ['breakfast tea', 'glass'], ['green tea', 'glass'], ['panna', 'quenelle'],
  ['tteokguk', 'liquid'], ['samgyetang', 'liquid'], ['sundubu', 'liquid'],
  ['jjigae', 'liquid'], ['sinigang', 'liquid'], ['kare kare', 'liquid'], ['adobo', 'liquid'],
  ['bak kut teh', 'liquid'], ['molokhia', 'liquid'], ['moqueca', 'liquid'],
  ['doro wot', 'liquid'], ['shiro', 'liquid'], ['misir wot', 'liquid'],
  ['chakhokhbili', 'liquid'], ['satsivi', 'liquid'], ['solyanka', 'liquid'],
  ['shchi', 'liquid'], ['okroshka', 'liquid'], ['lapskaus', 'liquid'], ['farikal', 'liquid'],
  ['mapo doufu', 'liquid'], ['bibim guksu', 'nest'], ['naengmyeon', 'nest'],
  ['nasi lemak', 'grains'], ['arroz con pollo', 'grains'], ['gallo pinto', 'grains'],
  ['kushari', 'grains'], ['kimbap', 'patty'], ['frikadeller', 'patty'], ['raggmunk', 'disc'],
  ['pajeon', 'disc'], ['cachapa', 'disc'], ['patacon', 'disc'], ['sope', 'disc'],
  ['huarache', 'disc'], ['tlayuda', 'disc'], ['milanesa', 'disc'], ['provoleta', 'disc'],
  ['murtabak', 'folded'], ['baleada', 'folded'], ['jian bing', 'folded'],
  ['briouat', 'folded'], ['chimichanga', 'baton'], ['popiah', 'baton'],
  ['otak otak', 'baton'], ['cheung fun', 'baton'], ['mahshi', 'baton'],
  ['badrijani', 'baton'], ['yuca frita', 'fries'], ['acaraje', 'ball'],
  ['taameya', 'ball'], ['bossam', 'slice'], ['jokbal', 'slice'], ['rullepolse', 'slice'],
  ['stegt flaesk', 'slice'], ['gravadlax', 'slice'], ['scotch woodcock', 'slice'],
  ['zaalouk', 'quenelle'], ['ful mudammas', 'quenelle'], ['choripan', 'cut'],
  ['po boy', 'stack'], ['sloppy joe', 'dome'], ['lo bak go', 'cut'], ['turnip cake', 'cut'],
  ['radish cake', 'cut'], ['ball', 'ball'],
  // --- Bare ingredients ---------------------------------------------------
  // A third sweep, of single words rather than dishes, because that is the
  // other way a chef types a component: not "whole roast poussin" but "lemon".
  // Both earlier lists were written in phrases and neither of them caught it, so
  // "mozzarella", "lemon" and "chocolate" were all still lumpy spheres.
  //
  // Deliberately absent: 'potato', and 'celeriac' above it. A bare ingredient
  // key beats a leading preparation, so adding one of those turns "mashed
  // potato" into a whole potato and "julienne celeriac" into a whole celeriac.
  // Their real platings -- mash, puree, fondant, dauphinoise, roast, batons --
  // all resolve through a key of their own already.
  ['mozzarella', 'coin'], ['stracciatella', 'quenelle'], ['provolone', 'slice'],
  ['comte', 'wedge'], ['emmental', 'wedge'], ['gouda', 'wedge'], ['taleggio', 'wedge'],
  ['veal', 'steak'], ['turkey', 'breast'], ['bass', 'fillet'], ['bream', 'fillet'],
  ['fennel', 'wedge'], ['pepper', 'slice'], ['bean', 'heap'], ['berry', 'heap'],
  // 'chilli' is the pepper; 'chili' is already claimed above by the bowl of
  // chili con carne, and the two spellings genuinely mean different dishes.
  ['yolk', 'dome'], ['ginger', 'crumb'], ['chilli', 'baton'],
  ['lemon', 'wedge'], ['lime', 'wedge'], ['orange', 'wedge'],
  ['chocolate', 'cut'], ['vanilla', 'baton'], ['coffee', 'liquid'],
  ['sugar', 'dust'], ['flour', 'dust'], ['salt', 'crumb'],
  ['stock', 'liquid'], ['wine', 'liquid'], ['cider', 'liquid'], ['beer', 'liquid'],
  ['vinegar', 'liquid'], ['mustard', 'quenelle'], ['soy', 'quenelle'],
  ['pastry', 'disc'], ['dough', 'dome'], ['batter', 'disc'],
]

// Words that name a preparation rather than an ingredient. They decide the form
// on their own: diced is a heap of cubes whatever was diced. English puts the
// modifier first, so these are only read at the front of a name -- and they
// still lose to the head noun at the end, because a shaved fennel salad is a
// salad and a diced tomato soup is a soup.
// Dishes named after their sauce. On its own, "carbonara" is a bowl of pasta
// and plating it as one is right; but "rigatoni carbonara" is rigatoni, and
// Italian puts the sauce last where the head-noun rule would hand it the win.
// So these are read only when nothing else in the name is recognised.
const DISH_SAUCE: Array<[string, ShapeFamily]> = [
  ['carbonara', 'nest'], ['cacio e pepe', 'nest'], ['aglio e olio', 'nest'], ['bolognese', 'nest'],
  ['amatriciana', 'nest'], ['puttanesca', 'nest'], ['arrabbiata', 'nest'], ['alfredo', 'nest'],
  ['primavera', 'nest'], ['vongole', 'nest'], ['marinara', 'nest'], ['pomodoro', 'nest'],
]

const PREP: Array<[string, ShapeFamily]> = [
  ['diced', 'pile'], ['cubed', 'pile'], ['brunoise', 'pile'], ['chopped', 'crumb'],
  ['sliced', 'slice'], ['shaved', 'slice'], ['carpaccio of', 'slice'],
  ['julienne', 'baton'], ['julienned', 'baton'],
  ['mashed', 'quenelle'], ['whipped', 'quenelle'], ['creamed', 'quenelle'], ['pureed', 'quenelle'],
  ['crumbled', 'crumb'], ['grated', 'crumb'], ['crushed', 'crumb'],
  ['skewered', 'skewer'],
  ['dusted', 'dust'], ['dusting of', 'dust'], ['powdered', 'dust'],
  ['pulled', 'pile'], ['shredded', 'pile'], ['torn', 'pile'], ['minced', 'pile'],
]

// --- What the fourth audit found ------------------------------------------
// A fourth list, 705 foods written before this file was opened and aimed at the
// categories the first three never asked about. 36% of it came out a lumpy
// sphere: every raw and cured preparation, every named sandwich, the butchery
// cuts a chef actually orders by, the game birds, the whole modernist plating
// vocabulary, whole spices, and large parts of the Japanese, Chinese, Indian,
// Levantine, west African, German, Iberian and Italian menus.
const MENU: Array<[string, ShapeFamily]> = [
  // Raw, cured and set: the cold larder. All of it is sliced or spooned, and
  // none of it had a form -- a terrine was coming out a ball.
  ['crudo', 'slice'], ['tataki', 'slice'], ['escabeche', 'cut'], ['galantine', 'slice'],
  ['farce', 'quenelle'], ['brawn', 'slice'], ['jerky', 'baton'],
  ['lonza', 'slice'], ['capocollo', 'slice'], ['soppressata', 'slice'], ['kielbasa', 'baton'],
  // Sandwiches. Cut on the diagonal and stood up, which is a wedge -- the one
  // named form a burger is not, because a burger is a stack the layout builds.
  ['sandwich', 'stack'], ['club sandwich', 'stack'], ['blt', 'stack'], ['reuben', 'stack'],
  ['panini', 'stack'], ['muffuletta', 'stack'], ['cubano', 'stack'], ['torta', 'stack'],
  ['toastie', 'stack'], ['cheese toastie', 'stack'], ['sub', 'stack'], ['butty', 'stack'],
  // A burger written as one component is a stack too. Built from its parts --
  // bun, patty, cheese -- the layout stacks it for real; written as one word it
  // was coming out as a single brown pad.
  ['cheeseburger', 'stack'], ['hamburger', 'stack'], ['smash burger', 'stack'],
  ['patty melt', 'stack'], ['tuna melt', 'stack'], ['club', 'stack'],
  ['croque madame', 'slice'], ['slider', 'stack'], ['som tam', 'ruffle'], ['caprese', 'slice'],
  ['mulligatawny', 'liquid'],
  // Cuts and game. A butcher's names for the same animal, and the birds that
  // come to the table whole.
  ['tri tip', 'steak'], ['chuck', 'steak'], ['pigs knuckle', 'whole'], ['pork knuckle', 'whole'],
  ['grouse', 'whole'], ['woodcock', 'whole'], ['pastilla', 'disc'],
  // A pigeon reaches a plate as a breast far more often than as a bird, and as
  // a bird it stole every dish cooked with one -- a pastilla is a pie.
  ['pigeon', 'breast'], ['wood pigeon', 'breast'], ['whole pigeon', 'whole'],
  ['roast pigeon', 'whole'], ['roe deer', 'steak'],
  ['snipe', 'whole'], ['mallard', 'whole'], ['hare', 'steak'], ['wild boar', 'steak'],
  ['kangaroo', 'steak'], ['ostrich', 'steak'],
  // Japan beyond the sushi counter.
  ['tamagoyaki', 'slice'], ['chawanmushi', 'liquid'], ['karaage', 'pile'], ['unagi', 'cut'],
  ['shabu shabu', 'liquid'], ['donburi', 'grains'], ['oyakodon', 'grains'], ['chirashi', 'grains'],
  ['tsukemen', 'nest'], ['mentaiko', 'cut'], ['dorayaki', 'disc'], ['taiyaki', 'cut'],
  ['daifuku', 'ball'], ['anko', 'quenelle'], ['yakiniku', 'cut'],
  // China and south-east Asia.
  ['mantou', 'dome'], ['youtiao', 'baton'], ['hot pot', 'liquid'], ['dry pot', 'pile'],
  ['larb', 'pile'], ['cha ca', 'cut'], ['com tam', 'grains'], ['banh cuon', 'folded'],
  // India: a thali is a tray of small things, and most of the rest is either a
  // bread, a spooned thing or something fried into a shape of its own.
  ['thali', 'pile'], ['baingan bharta', 'quenelle'], ['rajma', 'liquid'], ['kulcha', 'disc'],
  ['bhatura', 'dome'], ['pav bhaji', 'quenelle'], ['vada pav', 'dome'], ['dhokla', 'cut'],
  ['khandvi', 'cut'], ['papdi chaat', 'pile'], ['bhel puri', 'pile'], ['pani puri', 'ball'],
  ['achar', 'quenelle'], ['barfi', 'cut'], ['halwa', 'quenelle'], ['kheer', 'liquid'],
  ['ras malai', 'disc'], ['jalebi', 'nest'], ['falooda', 'liquid'],
  // The Levant.
  ['muhammara', 'quenelle'], ['mutabal', 'quenelle'], ['sambousek', 'folded'],
  ['warak enab', 'baton'], ['makloubeh', 'grains'], ['mansaf', 'grains'], ['musakhan', 'cut'],
  ['knafeh', 'wedge'], ['maamoul', 'dome'], ['basbousa', 'cut'], ['qatayef', 'folded'],
  ['batata harra', 'pile'],
  // West and southern Africa.
  ['pap', 'quenelle'], ['suya', 'skewer'], ['banku', 'ball'], ['waakye', 'grains'],
  ['moin moin', 'cut'], ['chin chin', 'pile'],
  // Germany and France.
  ['sauerbraten', 'cut'], ['flammkuchen', 'disc'], ['kartoffelsalat', 'pile'], ['knodel', 'ball'],
  ['leberkase', 'slice'], ['weisswurst', 'baton'], ['choucroute', 'ruffle'], ['aligot', 'quenelle'],
  ['boeuf bourguignon', 'liquid'], ['gougere', 'dome'],
  // Iberia and Italy.
  ['tapas', 'pile'], ['gambas al ajillo', 'baton'], ['pulpo a la gallega', 'slice'],
  ['croquetas', 'baton'], ['escalivada', 'pile'], ['fideua', 'nest'], ['pisto', 'quenelle'],
  ['bacalhau', 'cut'], ['francesinha', 'cut'], ['caldo verde', 'liquid'], ['supli', 'ball'],
  ['vitello tonnato', 'slice'], ['bistecca', 'steak'], ['piadina', 'folded'], ['cacciucco', 'liquid'],
  ['quattro formaggi', 'disc'], ['sicilian slice', 'wedge'], ['manicotti', 'tubes'],
  ['fregola', 'grains'],
  // Grains and sea vegetables.
  ['amaranth', 'grains'], ['cornmeal', 'grains'], ['dulse', 'leaf'], ['hijiki', 'nest'],
  ['agar', 'cut'], ['kelp', 'leaf'],
  // Fruit. Small and round is a ball, big and cut is a wedge, and the two
  // citrus that are eaten whole are neither of the wedges the first list had.
  ['guava', 'wedge'], ['dragonfruit', 'wedge'], ['dragon fruit', 'wedge'], ['starfruit', 'slice'],
  ['durian', 'wedge'], ['mangosteen', 'ball'], ['rambutan', 'ball'], ['longan', 'ball'],
  ['quince', 'wedge'], ['blackcurrant', 'pile'], ['physalis', 'ball'], ['nectarine', 'wedge'],
  ['clementine', 'wedge'], ['tangerine', 'wedge'], ['kumquat', 'ball'], ['yuzu', 'wedge'],
  ['calamansi', 'ball'], ['damson', 'ball'], ['greengage', 'ball'], ['loquat', 'ball'],
  // Vegetables, mostly the ones a European first pass does not reach for.
  ['choy sum', 'leaf'], ['gai lan', 'baton'], ['tatsoi', 'leaf'], ['escarole', 'ruffle'],
  ['yam', 'wedge'], ['cassava', 'baton'], ['taro', 'cut'], ['chayote', 'wedge'],
  ['tomatillo', 'ball'], ['poblano', 'cut'], ['jalapeno', 'baton'], ['habanero', 'ball'],
  ['serrano', 'baton'], ['shishito', 'baton'], ['pumpkin', 'wedge'], ['marrow', 'baton'],
  // Bread and the baker's counter.
  ['boule', 'dome'], ['batard', 'dome'], ['canape', 'slice'], ['pandesal', 'dome'],
  ['stollen', 'cut'], ['fougasse', 'disc'], ['biscotti', 'baton'],
  // Puddings. Anything set in a glass is spooned, anything frozen is scooped,
  // and the fried doughs are all balls.
  ['baked alaska', 'dome'], ['spotted dick', 'cut'], ['syllabub', 'quenelle'],
  ['posset', 'quenelle'], ['zabaglione', 'quenelle'], ['sabayon', 'quenelle'],
  ['bonbon', 'ball'], ['candy floss', 'pile'], ['jelly', 'dome'], ['gummy', 'pile'],
  ['sundae', 'quenelle'], ['beignet', 'ball'], ['zeppole', 'ball'], ['loukoumades', 'ball'],
  ['granita', 'crumb'], ['bingsu', 'pile'], ['kakigori', 'dome'], ['ice lolly', 'baton'],
  ['soft serve', 'quenelle'], ['battenberg', 'cut'], ['yule log', 'cut'],
  ['buche de noel', 'cut'], ['choc ice', 'cut'],
  // Breakfast, which is nearly all grains and spooned things.
  ['cereal', 'grains'], ['muesli', 'grains'], ['cornflakes', 'pile'], ['bircher', 'quenelle'],
  ['smoothie bowl', 'liquid'], ['acai bowl', 'liquid'], ['overnight oats', 'quenelle'],
  ['buddha bowl', 'grains'], ['grain bowl', 'grains'], ['jalapeno popper', 'baton'],
  ['corn fritter', 'patty'], ['cornichon', 'slice'], ['piccalilli', 'quenelle'],
  // The classical sauces, which are all poured.
  ['espagnole', 'liquid'], ['demi glace', 'liquid'], ['bordelaise', 'liquid'],
  ['chasseur', 'liquid'], ['au poivre', 'liquid'], ['ranch', 'liquid'],
  ['thousand island', 'liquid'], ['doubanjiang', 'quenelle'], ['yuzu kosho', 'quenelle'],
  // Whole spices, which are neither a dust nor a portion of anything.
  ['perilla', 'leaf'], ['galangal', 'crumb'], ['cinnamon stick', 'baton'],
  ['star anise', 'seed'], ['cardamom pod', 'seed'], ['clove', 'seed'],
  // The plating vocabulary itself: a chef writes "swoosh of romesco" and means
  // the swoosh. These name a form and nothing else, which is exactly what the
  // library is for, and not one of them was in it.
  ['espuma', 'quenelle'], ['savoury air', 'quenelle'], ['snow', 'dust'],
  ['snow pea', 'pod'], ['mange tout', 'pod'], ['sugar snap', 'pod'], ['pea pod', 'pod'], ['lemon drizzle', 'wedge'],
  ['smear', 'liquid'], ['swoosh', 'liquid'], ['drizzle', 'liquid'], ['tower', 'pile'],
  ['medallion', 'disc'], ['paupiette', 'cut'], ['brunoise', 'pile'], ['chiffonade', 'leaf'],
  // Dairy the cheese board missed, and the cooking fats.
  ['queso fresco', 'cut'], ['cotija', 'crumb'], ['wensleydale', 'wedge'],
  ['red leicester', 'wedge'], ['fontina', 'wedge'], ['ghee', 'liquid'], ['lard', 'quenelle'],
  // The rest of the fish counter. All of it is a fillet unless it is tiny.
  ['red mullet', 'fillet'], ['john dory', 'fillet'], ['megrim', 'fillet'], ['coley', 'fillet'],
  ['gurnard', 'fillet'], ['sprat', 'baton'], ['arctic char', 'fillet'], ['barramundi', 'fillet'],
  ['marlin', 'steak'], ['elver', 'nest'], ['bottarga', 'slice'],
  // Drinks, which come in a glass.
  ['martini', 'glass'], ['spritz', 'glass'], ['tinto de verano', 'glass'], ['iced latte', 'glass'],
  // Names that start with a drink and are not one.
  ['hot chocolate fondant', 'cut'], ['hot chocolate pudding', 'cut'], ['hot chocolate sauce', 'liquid'], ['juice reduction', 'liquid'], ['iced matcha', 'glass'],
]

// Both tables, keys normalised the way a typed component name will be.
const SORTED = table([...SHAPES, ...WORLD, ...KITCHEN, ...MENU])
const SORTED_PREP = table(PREP)
const SORTED_LAST = table(DISH_SAUCE)

// What a component becomes when it is scattered over the top rather than
// plated: a pinch of something is not a portion of it. "Micro cress" is not a
// salad leaf the size of the plate, and crisped noodles over a dish are not a
// nest of spaghetti.
const GARNISH_FORM: Partial<Record<ShapeFamily, ShapeFamily>> = {
  ruffle: 'leaf',
  baton: 'leaf',
  cut: 'leaf',
  disc: 'slice',
  shell: 'crumb',
  folded: 'crumb',
  grains: 'crumb',
  fries: 'crumb',
  liquid: 'crumb',
  nest: 'crumb',
  tubes: 'crumb',
  pile: 'crumb',
  pillow: 'crumb',
  // A skewer of something, scattered as a garnish, is whatever was on it.
  skewer: 'baton',
  ring: 'slice',
  // Garnish heights are measured against a different multiplier again, and a
  // ball's 2.2 through it is a spike. Anything round at garnish size -- a
  // blueberry, a caper berry, a pearl of mozzarella -- is a seed.
  ball: 'seed',
  heap: 'crumb',
  steak: 'leaf',
  breast: 'leaf',
  fillet: 'leaf',
  // Nobody garnishes with a whole bird: a pinch of it is shreds.
  bird: 'crumb',
  chunk: 'crumb',
  prawn: 'crumb',
  lobster: 'crumb',
  crab: 'crumb',
  wholefish: 'crumb',
  glass: 'crumb',
  // Nobody garnishes a plate with a whole bird. A name that resolves this way
  // in the garnish slot means pieces of it pulled over the top.
  whole: 'crumb',
  // A crisp and a dusting are garnishes already -- most tuiles and most cocoa
  // on this kind of plate are listed in exactly that slot -- so they keep their
  // own form and simply arrive small.
}

export function shapeFor(name: string, role: string): ShapeFamily {
  const hit = matchKey(name, SORTED, SORTED_PREP, SORTED_LAST)
  if (hit) {
    if (role === 'garnish') return GARNISH_FORM[hit] ?? hit
    return hit
  }
  // Garnish with no better match is a leaf; everything else is a soft mound.
  return role === 'garnish' ? 'leaf' : 'blob'
}

// Families whose top face is browned by cooking, and how far down the shape that
// colour reaches. The model lays a darker shell over the upper part of the form:
// without it a seared duck breast is a beige lozenge, and the crust is most of
// what tells you how the thing was cooked.
export const CRUST: Partial<Record<ShapeFamily, { fromY: number; shade: number }>> = {
  cut: { fromY: 0.38, shade: 0.52 },
  steak: { fromY: 0.34, shade: 0.5 },
  breast: { fromY: 0.3, shade: 0.52 },
  // Fish is seared lightly: a pale gold, not a brown crust.
  fillet: { fromY: 0.4, shade: 0.78 },
  chunk: { fromY: 0.2, shade: 0.7 },
  patty: { fromY: 0.5, shade: 0.62 },
  // Deliberately no entry for a bun. Bread browns evenly over the whole crown,
  // so a shell has no edge to hide behind and reads as a seam around the top.
}

// The form a component actually takes: read from its name, unless the chef
// overrode it from the inspector. Both renderers call this, so the picture and
// the model can never disagree about what a component is.
export function familyFor(name: string, role: string, variant?: number): ShapeFamily {
  if (variant === undefined) return shapeFor(name, role)
  return SHAPE_ORDER[((variant % SHAPE_ORDER.length) + SHAPE_ORDER.length) % SHAPE_ORDER.length]
}

// Forms that are served with the sauce over them rather than under them. A pool
// under a nest of pasta is a pool nobody can see, and it is the one component a
// bowl of pasta is judged on.
export const SAUCED_ON_TOP = new Set<ShapeFamily>(['nest', 'tubes', 'pile', 'grains'])

// How each form is actually served, in the words a chef would use at the pass.
// The table already knows that spaghetti is twirled and that penne arrives as a
// heap of separate tubes; a paid image model never sees the 3D model, so unless
// this reaches the prompt it is the one thing we know about a component and
// never say. `blob` is deliberately absent: it means the name was not
// recognised, and inventing a serving style for it would be a guess printed as
// an instruction.
export const SERVING: Partial<Record<ShapeFamily, string>> = {
  nest: 'twirled into a neat nest',
  pillow: 'as plump filled parcels',
  tubes: 'as a heap of separate tubes',
  pile: 'as a heap of separate pieces',
  grains: 'as a heaped scoop of loose grains',
  fries: 'as a loose heap of separate pieces',
  liquid: 'ladled in level, filling the vessel',
  disc: 'flat and round',
  shell: 'served in the half shell',
  folded: 'folded over on itself',
  cut: 'as one thick cut piece',
  quenelle: 'shaped into a smooth quenelle',
  baton: 'laid down as a long baton',
  leaf: 'as loose leaves',
  sprig: 'as small sprigs',
  crumb: 'scattered in small pieces',
  seed: 'as small seeds',
  slice: 'in thin flat slices',
  coin: 'in thin round slices',
  pizza: 'as a whole pizza with a raised crust',
  patty: 'as a thick round patty',
  dome: 'domed on top',
  bunBase: 'as a flat-topped base',
  ruffle: 'as a loose ruffled pile',
  wedge: 'cut into a wedge, point inwards',
  ring: 'in rings',
  ball: 'rolled into a round ball',
  skewer: 'threaded onto a skewer laid across the plate',
  cap: 'left whole, cap and stalk',
  shard: 'as a thin brittle shard stood up in the dish, not laid flat',
  dust: 'dusted in a fine even veil over the top',
  whole: 'served whole and uncarved',
  stack: 'built in layers and cut on the diagonal, stood up so the layers show',
  pod: 'as whole pods, left in the shell',
  heap: 'as a small heap',
  steak: 'as a thick cut, seared, with the fat left on one side',
  breast: 'as a whole breast, sliced across if it is large',
  fillet: 'as a skinless fillet, flaking along the grain',
  bird: 'whole and roasted, breast up, legs on',
  chunk: 'in rough roasted chunks, crisp and golden',
  prawn: 'curled, with the tail on',
  lobster: 'split and served in the shell',
  crab: 'whole, with the claws out',
  wholefish: 'whole, on the bone, with head and tail on',
  glass: 'in its own glass, filled to just below the rim',
}

// The serving phrase, unless the component's own name already says it. "Beef
// patty, as a thick round patty" is noise; "spaghetti, twirled into a neat
// nest" is the whole point.
export function servingFor(name: string, role: string, variant?: number): string {
  const phrase = SERVING[familyFor(name, role, variant)]
  if (!phrase) return ''
  const t = name.toLowerCase()
  const said = phrase.split(' ').some((w) => w.length > 3 && t.includes(w.replace(/s$/, '')))
  return said ? '' : phrase
}

// The order the inspector cycles through when the chef overrides the shape.
export const SHAPE_ORDER: ShapeFamily[] = [
  'blob', 'dome', 'bunBase', 'patty', 'slice', 'leaf', 'sprig', 'crumb', 'seed', 'cut', 'quenelle', 'baton', 'ruffle',
  'nest', 'pillow', 'tubes', 'pile', 'disc', 'grains', 'liquid', 'shell', 'folded', 'fries',
  'wedge', 'ring', 'ball', 'skewer', 'cap', 'shard', 'dust', 'whole', 'stack', 'pod', 'coin', 'pizza', 'heap', 'steak', 'breast', 'fillet', 'bird', 'chunk', 'prawn', 'lobster', 'crab', 'wholefish', 'glass',
]
