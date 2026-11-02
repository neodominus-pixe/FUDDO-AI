// Shared colour source for both renderers. The 2D preview and the 3D model must
// agree on what the duck looks like, or switching views feels like a different dish.

import { table, variants } from './match'

export type Hsl = [number, number, number]

export const ROLE_FILL: Record<string, Hsl> = {
  hero: [24, 46, 38],
  support: [86, 32, 62],
  garnish: [104, 40, 44],
  sauce: [8, 55, 28],
}

export const SAUCE_HSL: Hsl = [8, 58, 30]

// Colour by what the thing actually is. Hashing the name gave a duck breast and
// a lemon arbitrary unrelated hues; a plate only reads as food if the food is
// the right colour. Longer keys are matched first so "red wine jus" wins over
// "wine", and "sweet potato" over "potato".
const INGREDIENTS: Array<[string, Hsl]> = [
  // Red meat and game
  ['duck', [20, 44, 33]], ['beef', [16, 45, 30]], ['steak', [16, 45, 30]],
  ['ribeye', [16, 45, 30]], ['sirloin', [16, 45, 30]], ['patty', [18, 42, 28]],
  ['lamb', [12, 42, 34]], ['venison', [8, 40, 28]], ['veal', [24, 35, 45]],
  // Pork
  ['bacon', [10, 55, 45]], ['guanciale', [10, 50, 52]], ['pork', [14, 40, 48]],
  ['chorizo', [8, 62, 40]],
  // Poultry
  ['chicken', [36, 44, 56]], ['poussin', [36, 44, 56]], ['turkey', [34, 38, 60]],
  // Fish and shellfish
  // "Fish fillet" and "white fish" name no species: pale, flaky white fish, not whatever hue the name happened to hash to.
  ['ham', [350, 40, 70]], ['parma ham', [352, 42, 66]], ['gammon', [8, 40, 66]], ['roast potato', [38, 52, 56]], ['roasties', [38, 52, 56]],
  ['crushed potato', [44, 34, 72]], ['smashed potato', [40, 46, 62]], ['red cabbage', [320, 36, 36]], ['red onion', [330, 32, 52]],
  ['pickled red onion', [330, 44, 50]], ['goat cheese', [44, 10, 92]], ['chevre', [44, 10, 92]], ['crispy shallot', [34, 58, 52]],
  ['crispy onion', [34, 58, 52]], ['fried shallot', [34, 58, 52]], ['tenderstem', [100, 44, 38]],
  // Foods the colour table had no name for, which were getting a colour made up from their spelling.
  ['bao', [40, 24, 88]], ['pate', [28, 28, 58]], ['pâté', [28, 28, 58]], ['tart', [38, 44, 66]],
  ['galette', [38, 44, 64]], ['omelet', [48, 60, 68]], ['tartare', [4, 50, 42]], ['borlotti', [14, 34, 46]],
  ['cannellini', [44, 18, 86]], ['churro', [34, 56, 58]], ['cilantro', [104, 40, 40]], ['marjoram', [92, 30, 40]],
  ['poppy', [250, 14, 20]], ['ziti', [42, 40, 76]], ['tubetti', [42, 40, 76]], ['risoni', [44, 38, 80]],
  ['tagliarini', [44, 40, 78]], ['angel hair', [44, 40, 78]], ['trenette', [44, 40, 78]], ['maccheroni', [42, 40, 76]],
  ['calamarata', [42, 40, 76]], ['gnocchetti', [44, 30, 80]], ['biang biang', [44, 34, 76]], ['gnudi', [46, 24, 86]],
  ['polpette', [8, 40, 40]], ['ladoo', [38, 64, 56]], ['petit pois', [102, 42, 46]], ['jersey royal', [44, 36, 74]],
  ['millefeuille', [40, 40, 76]], ['pithivier', [36, 48, 62]], ['biscuit', [36, 48, 66]], ['cracker', [38, 40, 70]],
  ['pikelet', [38, 44, 70]], ['pizzette', [36, 50, 60]], ['baba', [32, 60, 52]], ['savarin', [32, 60, 52]],
  ['pandoro', [44, 50, 78]], ['choux', [38, 52, 66]], ['popover', [36, 50, 62]], ['knish', [36, 40, 62]],
  ['sfogliatella', [36, 48, 64]], ['sambusak', [36, 52, 60]], ['empanadilla', [34, 52, 58]], ['wafer', [38, 40, 70]],
  ['brik', [34, 46, 62]], ['feuille de brick', [34, 40, 70]], ['rucola', [100, 44, 34]], ['mache', [100, 44, 34]],
  ['chile relleno', [92, 34, 36]], ['nameko', [28, 54, 46]], ['wood ear', [24, 16, 18]], ['duxelle', [30, 22, 34]],
  ['urchin', [30, 60, 52]], ['puffed skin', [34, 50, 66]], ['boulangere', [44, 40, 62]], ['sarladaise', [42, 50, 60]],
  ['nacho', [38, 54, 60]], ['cheese', [46, 46, 74]], ['rye', [34, 28, 48]], ['panforte', [28, 40, 36]],
  ['bbq sauce', [14, 60, 26]], ['mojito', [88, 38, 76]], ['margarita', [68, 52, 70]], ['old fashioned', [28, 70, 40]], ['espresso martini', [24, 50, 18]],
  ['aperol spritz', [18, 90, 56]], ['negroni', [4, 72, 36]], ['cosmopolitan', [350, 70, 62]], ['pina colada', [50, 40, 90]],
  ['gin and tonic', [180, 10, 90]], ['bloody mary', [6, 70, 34]], ['whisky sour', [38, 60, 62]], ['whiskey sour', [38, 60, 62]],
  ['espresso', [24, 60, 14]], ['latte', [30, 40, 70]], ['cappuccino', [28, 44, 56]], ['flat white', [30, 38, 66]],
  ['americano', [26, 50, 22]], ['mocha', [22, 54, 32]], ['hot chocolate', [20, 50, 26]], ['matcha latte', [92, 40, 62]],
  ['chai latte', [30, 40, 60]], ['iced tea', [26, 70, 44]], ['iced coffee', [26, 50, 40]], ['bubble tea', [30, 30, 64]],
  ['lemonade', [54, 70, 86]], ['strawberry lemonade', [354, 54, 84]], ['orange juice', [32, 90, 58]], ['apple juice', [44, 70, 64]],
  ['kombucha', [38, 56, 62]], ['vanilla milkshake', [46, 50, 90]], ['chocolate milkshake', [20, 40, 28]], ['strawberry milkshake', [348, 50, 80]],
  ['banana milkshake', [48, 50, 86]], ['salted caramel milkshake', [30, 50, 70]], ['cookies and cream milkshake', [30, 10, 72]], ['peanut butter milkshake', [32, 40, 68]],
  ['milkshake', [346, 40, 86]], ['green smoothie', [100, 50, 50]], ['mango smoothie', [38, 90, 60]], ['banana smoothie', [48, 50, 84]],
  ['peanut butter smoothie', [30, 40, 62]], ['tropical smoothie', [40, 80, 66]], ['protein smoothie', [30, 30, 70]], ['strawberry banana smoothie', [350, 50, 78]],
  ['berry smoothie', [330, 50, 40]], ['smoothie', [340, 40, 60]], ['cinnamon', [22, 60, 36]], ['oats', [40, 28, 76]],
  ['matcha powder', [92, 60, 44]],
  ['rouille', [12, 62, 46]], ['tofu scramble', [48, 56, 70]], ['fried shrimp', [34, 56, 58]], ['coconut shrimp', [38, 44, 76]], ['chia pudding', [36, 12, 62]],
  // German and Eastern European, American diner, brunch.
  ['lingonberry sauce', [350, 64, 40]], ['bigos', [24, 48, 32]], ['nut roast', [30, 40, 40]], ['hoagie roll', [34, 56, 66]], ['dutch baby', [38, 62, 68]], ['pain perdu', [34, 56, 56]], ['kassler', [14, 40, 62]], ['maultaschen', [38, 40, 66]], ['frikadellen', [26, 44, 38]], ['vareniki', [38, 36, 78]], ['pirozhki', [30, 58, 58]], ['zurek', [52, 40, 70]], ['sarma', [96, 26, 42]], ['langos', [36, 56, 62]], ['shashlik', [22, 50, 40]], ['lagman', [28, 48, 52]], ['kaiserschmarrn', [40, 60, 68]], ['berliner', [32, 58, 60]], ['sachertorte', [20, 40, 18]], ['lebkuchen', [24, 50, 28]], ['burnt ends', [14, 46, 22]], ['fried catfish', [38, 58, 58]], ['smores', [28, 36, 38]], ['clapshot', [36, 40, 70]], ['haggis bon bons', [24, 40, 28]], ['gemista', [10, 60, 44]], ['keftedes', [20, 46, 36]], ['imam bayildi', [330, 30, 30]], ['escargots', [30, 26, 30]], ['bacalao', [40, 18, 86]], ['neeps', [40, 60, 70]], ['tatties', [44, 26, 80]], ['whisky sauce', [30, 60, 44]], ['fasolada', [20, 56, 50]], ['fabada', [24, 56, 34]], ['sangria', [352, 64, 30]], ['tiropita', [38, 48, 62]], ['bougatsa', [40, 50, 70]], ['gigantes', [30, 20, 80]], ['briam', [14, 60, 40]], ['bifteki', [18, 46, 34]], ['soutzoukakia', [14, 52, 36]], ['galaktoboureko', [44, 44, 70]], ['sigara boregi', [34, 56, 56]], ['karniyarik', [330, 30, 34]], ['roasted vegetables', [20, 60, 44]], ['crema catalana', [46, 70, 66]], ['ssamjang', [8, 56, 34]], ['shish tawook', [30, 44, 52]], ['maqluba', [38, 30, 56]], ['amba', [44, 80, 50]], ['scotch bonnet sauce', [30, 90, 52]], ['awaze sauce', [8, 70, 38]], ['peri peri sauce', [10, 80, 44]], ['chole', [28, 60, 40]], ['kabab koobideh', [22, 50, 40]], ['pide', [36, 44, 66]], ['raisins', [320, 20, 22]], ['rose syrup', [350, 40, 76]], ['kelewele', [34, 60, 56]], ['malva pudding', [30, 60, 44]], ['bara', [40, 60, 62]], ['maduros', [30, 70, 36]], ['tso sauce', [12, 60, 30]], ['tempura vegetables', [38, 56, 64]], ['tentsuyu', [24, 50, 22]], ['tare sauce', [20, 56, 22]], ['shichimi', [10, 50, 40]], ['okonomi sauce', [18, 50, 18]], ['summer rolls', [60, 14, 88]], ['tsukune', [26, 40, 46]], ['dipping sauce', [24, 50, 22]], ['bravas sauce', [10, 68, 44]], ['albondigas', [10, 44, 36]], ['ensaladilla rusa', [46, 30, 84]], ['pintxos', [34, 36, 60]], ['vegetable fajita', [88, 40, 44]], ['sprinkles', [330, 60, 62]], ['milk', [44, 8, 94]], ['cocktail sauce', [8, 58, 50]], ['crushed ice', [200, 20, 92]], ['worcestershire sauce', [20, 60, 16]], ['citrus', [50, 70, 60]], ['brown sauce', [24, 56, 24]], ['russian dressing', [12, 52, 62]], ['caesar dressing', [44, 20, 84]], ['hot sauce', [6, 70, 42]], ['stuffing', [34, 40, 50]],
  ['pigs in blankets', [14, 50, 40]], ['pitta', [38, 40, 76]], ['doner meat', [26, 40, 36]],
  ['micro herbs', [100, 40, 38]], ['micro herb', [100, 40, 38]],
  ['fish', [40, 16, 84]], ['white fish', [40, 16, 85]], ['salmon', [16, 66, 58]], ['tuna', [354, 52, 38]], ['cod', [40, 18, 86]],
  ['halibut', [40, 16, 88]], ['sea bass', [42, 16, 87]], ['seabass', [42, 16, 87]],
  ['scallop', [38, 22, 84]], ['prawn', [12, 68, 60]], ['shrimp', [12, 68, 60]],
  ['lobster', [8, 68, 52]], ['crab', [18, 55, 66]], ['octopus', [340, 25, 45]],
  // Shellfish are the colour of the shell they arrive in, not of the meat.
  ['mussel', [230, 16, 26]], ['clam', [36, 14, 66]], ['cockle', [38, 18, 70]],
  ['oyster', [32, 10, 58]], ['razor', [38, 20, 74]],
  ['pizza', [34, 44, 62]], ['pizza base', [36, 40, 70]], ['pizza dough', [38, 34, 78]],
  ['chips', [42, 58, 62]], ['fries', [44, 62, 64]], ['frites', [44, 62, 64]],
  ['taco', [34, 46, 60]], ['tortilla', [38, 38, 72]], ['wrap', [40, 26, 80]],
  // Purees, roots and starch
  ['celeriac', [44, 22, 84]], ['cauliflower', [45, 16, 88]], ['parsnip', [42, 25, 82]],
  ['potato', [45, 28, 80]], ['puree', [45, 24, 82]], ['purée', [45, 24, 82]],
  ['mash', [45, 26, 80]], ['polenta', [48, 55, 66]], ['risotto', [46, 34, 74]],
  ['rice', [45, 18, 86]], ['pasta', [44, 42, 72]], ['gnocchi', [44, 30, 78]],
  // Pasta. Egg pasta is yellower than semolina, and filled pasta is paler
  // again because the dough is rolled thin over the filling.
  ['spaghetti', [43, 46, 70]], ['linguine', [43, 46, 70]], ['bucatini', [43, 46, 70]],
  ['vermicelli', [43, 46, 70]], ['capellini', [43, 46, 70]], ['penne', [43, 44, 71]],
  ['rigatoni', [43, 44, 71]], ['macaroni', [44, 46, 74]], ['fusilli', [43, 44, 71]],
  ['farfalle', [43, 44, 71]], ['orecchiette', [42, 34, 76]], ['conchiglie', [43, 44, 71]],
  ['tagliatelle', [42, 54, 68]], ['tagliolini', [42, 54, 68]], ['fettuccine', [42, 54, 68]],
  ['pappardelle', [42, 54, 68]], ['ravioli', [43, 48, 76]], ['raviolo', [43, 48, 76]],
  ['tortellini', [43, 48, 76]], ['agnolotti', [43, 48, 76]], ['cappelletti', [43, 48, 76]],
  ['dumpling', [42, 20, 88]], ['gyoza', [42, 20, 88]], ['wonton', [42, 22, 86]],
  ['ramen', [44, 48, 72]], ['udon', [40, 14, 90]], ['soba', [26, 20, 52]],
  ['noodle', [44, 42, 72]], ['trofie', [43, 44, 71]], ['casarecce', [43, 44, 71]],
  ['bun', [32, 45, 62]], ['bread', [34, 42, 64]], ['brioche', [38, 52, 68]],
  ['crouton', [34, 45, 58]],
  // Green vegetables and herbs
  ['asparagus', [95, 34, 44]], ['broccoli', [110, 38, 34]], ['spinach', [120, 40, 28]],
  ['kale', [120, 38, 26]], ['leek', [92, 30, 48]], ['pea', [102, 42, 46]],
  ['bean', [98, 34, 40]], ['courgette', [96, 32, 42]], ['zucchini', [96, 32, 42]],
  ['lettuce', [92, 38, 52]], ['leaves', [100, 36, 42]], ['cress', [118, 44, 42]],
  ['chervil', [118, 42, 44]], ['dill', [110, 40, 44]], ['chive', [116, 38, 40]],
  ['parsley', [112, 44, 36]], ['basil', [108, 42, 32]], ['coriander', [110, 42, 40]],
  ['shiso', [130, 30, 36]], ['thyme', [96, 28, 36]], ['mint', [140, 38, 40]],
  ['avocado', [78, 34, 44]], ['watercress', [116, 42, 38]],
  // Other vegetables
  ['tomato', [6, 66, 46]], ['pepper', [10, 62, 44]], ['chilli', [6, 70, 44]],
  ['beetroot', [332, 44, 30]], ['carrot', [26, 70, 50]], ['squash', [30, 68, 54]],
  ['pumpkin', [28, 68, 52]], ['sweetcorn', [48, 72, 58]], ['corn', [48, 72, 58]],
  ['mushroom', [28, 20, 34]], ['truffle', [26, 16, 24]], ['onion', [40, 20, 76]],
  ['cucumber', [96, 30, 56]], ['aubergine', [285, 28, 26]], ['eggplant', [285, 28, 26]],
  // Dairy, egg, cheese
  ['cheddar', [38, 62, 56]], ['parmesan', [46, 46, 72]], ['pecorino', [46, 40, 74]],
  ['mozzarella', [46, 16, 90]], ['halloumi', [44, 20, 86]], ['curd', [44, 18, 88]],
  ['cream', [44, 22, 89]], ['yoghurt', [44, 14, 91]], ['yogurt', [44, 14, 91]],
  ['yolk', [44, 82, 58]], ['egg', [44, 40, 80]], ['butter', [46, 62, 72]],
  // Sauces
  ['red wine jus', [352, 52, 24]], ['jus', [10, 52, 24]], ['gravy', [26, 42, 26]],
  ['ketchup', [4, 68, 40]], ['hollandaise', [44, 66, 62]], ['beurre blanc', [46, 40, 80]],
  // Soups and stews, which are the colour of whatever they were made from.
  ['chicken curry', [36, 60, 48]], ['butter bean', [44, 32, 78]], ['tomato soup', [8, 58, 42]], ['pea soup', [96, 42, 40]], ['pumpkin soup', [28, 62, 50]],
  ['mushroom soup', [30, 20, 42]], ['fish soup', [22, 48, 48]], ['soup', [34, 38, 46]],
  ['bisque', [14, 52, 46]], ['chowder', [42, 26, 78]], ['broth', [36, 44, 34]],
  ['consomme', [30, 46, 30]], ['consommé', [30, 46, 30]], ['curry', [36, 62, 46]],
  ['green curry', [88, 40, 42]], ['dal', [44, 58, 52]], ['daal', [44, 58, 52]],
  ['stew', [24, 44, 30]], ['ragout', [20, 44, 32]],
  ['pesto', [92, 48, 32]], ['chimichurri', [98, 46, 34]], ['salsa', [8, 60, 44]],
  // Pasta sauces, which are most of what gives a bowl of pasta its colour.
  ['tomato sauce', [6, 58, 38]], ['bolognese', [12, 52, 33]], ['ragu', [12, 52, 33]], ['ragù', [12, 52, 33]],
  ['arrabbiata', [6, 64, 42]], ['marinara', [8, 62, 44]], ['pomodoro', [6, 64, 44]],
  ['amatriciana', [8, 58, 40]], ['puttanesca', [10, 46, 32]], ['nduja', [6, 66, 38]],
  ['carbonara', [44, 50, 74]], ['alfredo', [45, 26, 86]], ['cacio e pepe', [46, 30, 82]],
  ['brown butter', [34, 54, 48]], ['burnt butter', [32, 54, 44]], ['vongole', [46, 26, 78]],
  ['coulis', [340, 58, 42]], ['ponzu', [30, 40, 26]], ['teriyaki', [24, 46, 22]],
  ['harissa', [8, 66, 38]], ['tahini', [40, 34, 70]], ['vinaigrette', [46, 46, 46]],
  // Sauces named after what is IN them, where the ingredient's own colour is
  // nothing like the sauce's: a peppercorn sauce is not the colour of a pepper.
  // Wine in a sauce is the colour of the wine, and "white wine sauce" was
  // landing on the generic sauce red for want of an entry.
  ['white wine', [46, 26, 80]], ['beurre noisette', [36, 52, 52]], ['cider', [42, 40, 72]],
  ['champagne', [46, 30, 82]], ['vermouth', [44, 26, 78]],
  ['peppercorn', [28, 20, 48]], ['bearnaise', [45, 48, 76]], ['béarnaise', [45, 48, 76]],
  ['blue cheese', [46, 18, 82]], ['garlic butter', [46, 56, 74]], ['diane', [26, 32, 30]],
  ['tartare sauce', [46, 30, 84]], ['remoulade', [46, 26, 84]], ['raita', [60, 14, 88]], ['aioli', [46, 34, 84]], ['mayo', [46, 26, 88]],
  ['herb oil', [86, 56, 34]], ['romesco', [12, 56, 40]],
  // Fruit and sweet
  ['raspberry', [344, 62, 46]], ['strawberry', [352, 64, 48]], ['berry', [340, 56, 40]],
  ['cherry', [348, 58, 36]], ['lemon', [50, 72, 62]], ['lime', [70, 56, 52]],
  ['orange', [30, 76, 56]], ['mango', [38, 74, 58]], ['apple', [80, 40, 56]],
  ['chocolate', [20, 42, 22]], ['caramel', [30, 60, 40]], ['coffee', [22, 40, 20]],
  ['vanilla', [44, 32, 84]], ['sorbet', [340, 30, 78]],
  // Misc
  ['sesame', [40, 36, 72]], ['walnut', [28, 30, 40]], ['almond', [36, 32, 72]],
  ['seed', [40, 34, 62]], ['crumb', [34, 38, 60]], ['tuile', [38, 44, 72]],
]

// The same widening, for colour. A form with no colour is only half learned:
// "pad thai" plated as a nest of noodles in a hue hashed off its own letters is
// a bowl of purple string. Colours are the colour of the FINISHED thing on the
// plate, not of its main ingredient -- a tikka masala is orange, whatever went
// into it.
const WORLD_COLOURS: Array<[string, Hsl]> = [
  // Beef and game, which vary by how they were cooked more than by the cut.
  ['wagyu', [14, 44, 32]], ['striploin', [16, 45, 30]], ['strip loin', [16, 45, 30]],
  ['porterhouse', [16, 45, 30]], ['t bone', [16, 45, 30]], ['tomahawk', [16, 45, 30]],
  ['picanha', [12, 46, 30]], ['onglet', [10, 44, 28]], ['bavette', [10, 44, 28]],
  ['flank', [10, 44, 28]], ['skirt', [10, 44, 28]], ['entrecote', [16, 45, 30]],
  ['chateaubriand', [16, 45, 30]], ['oxtail', [14, 40, 26]], ['osso buco', [18, 40, 36]],
  ['shank', [16, 42, 34]], ['brisket', [14, 42, 30]], ['cheek', [16, 40, 32]],
  ['mutton', [10, 40, 32]], ['goat', [12, 40, 38]], ['rabbit', [32, 26, 62]],
  ['goose', [22, 42, 38]], ['quail', [30, 42, 50]], ['pheasant', [28, 40, 48]],
  ['partridge', [28, 40, 48]], ['guinea fowl', [30, 38, 52]], ['drumstick', [30, 44, 50]],
  ['wing', [28, 46, 52]], ['chop', [18, 42, 40]], ['cutlet', [22, 40, 46]],
  ['escalope', [34, 40, 60]], ['schnitzel', [36, 52, 58]], ['katsu', [34, 54, 56]],
  ['tonkatsu', [34, 54, 56]], ['gammon', [10, 44, 52]], ['ham hock', [12, 44, 50]],
  // Charcuterie, which is mostly cured pink against white fat.
  ['salami', [356, 46, 42]], ['pepperoni', [6, 58, 40]], ['mortadella', [350, 36, 68]],
  ['bresaola', [6, 48, 30]], ['pastrami', [6, 46, 36]], ['speck', [8, 48, 42]],
  ['coppa', [354, 44, 44]], ['lardo', [40, 16, 90]], ['black pudding', [18, 18, 20]],
  ['bratwurst', [32, 34, 64]], ['frankfurter', [14, 40, 58]], ['hot dog', [12, 44, 52]],
  ['chipolata', [24, 40, 58]], ['salsiccia', [20, 40, 52]], ['merguez', [8, 56, 38]],
  ['andouille', [18, 30, 34]], ['boudin', [18, 26, 32]], ['meatball', [14, 44, 34]],
  ['kofta', [12, 44, 36]], ['cevapi', [14, 40, 38]], ['scotch egg', [34, 48, 54]],
  ['haggis', [24, 30, 28]],
  // Fish, which is paler than anyone draws it, and shellfish.
  ['monkfish', [30, 18, 84]], ['turbot', [38, 14, 88]], ['brill', [38, 14, 88]],
  ['plaice', [38, 14, 88]], ['sole', [38, 14, 88]], ['hake', [38, 16, 86]],
  ['pollock', [38, 16, 86]], ['haddock', [38, 16, 86]], ['skate', [34, 16, 82]],
  ['mackerel', [210, 22, 44]], ['sardine', [200, 20, 52]], ['herring', [210, 18, 58]],
  ['trout', [14, 52, 62]], ['snapper', [6, 40, 58]], ['grouper', [30, 20, 78]],
  ['swordfish', [26, 16, 76]], ['eel', [28, 26, 32]], ['squid', [40, 12, 86]],
  ['calamari', [40, 26, 76]], ['crayfish', [10, 60, 54]], ['sashimi', [8, 60, 52]],
  ['smoked salmon', [14, 64, 62]], ['gravlax', [12, 62, 58]], ['lox', [14, 64, 62]],
  ['tobiko', [20, 72, 54]], ['ikura', [16, 76, 54]], ['nigiri', [30, 30, 74]],
  ['maki', [120, 20, 30]], ['gimbap', [120, 20, 32]], ['onigiri', [45, 16, 88]],
  // Fruit.
  ['pear', [70, 34, 66]], ['fig', [320, 30, 40]], ['peach', [26, 64, 66]],
  ['apricot', [30, 70, 62]], ['plum', [330, 40, 36]], ['grape', [280, 26, 40]],
  ['blueberry', [250, 32, 38]], ['blackberry', [300, 30, 26]], ['cranberry', [350, 60, 40]],
  ['redcurrant', [352, 62, 46]], ['melon', [28, 60, 70]], ['cantaloupe', [28, 60, 70]],
  ['watermelon', [350, 56, 52]], ['honeydew', [72, 40, 74]], ['papaya', [24, 64, 62]],
  ['banana', [48, 72, 68]], ['plantain', [44, 62, 60]], ['pineapple', [46, 68, 62]],
  ['lychee', [30, 20, 88]], ['kiwi', [78, 40, 52]], ['passion fruit', [42, 66, 56]],
  ['persimmon', [24, 72, 56]], ['date', [24, 36, 28]], ['pomegranate', [348, 58, 42]],
  ['rhubarb', [346, 58, 50]], ['gooseberry', [70, 40, 58]], ['blackcurrant', [300, 36, 24]],
  // Vegetables and pulses.
  ['olive', [72, 26, 32]], ['chickpea', [42, 34, 70]], ['edamame', [92, 40, 46]],
  ['broad bean', [96, 36, 48]], ['fava', [96, 36, 48]], ['kidney bean', [356, 36, 30]],
  ['brussels sprout', [96, 34, 36]], ['romanesco', [80, 36, 52]], ['radish', [346, 54, 52]],
  ['turnip', [300, 10, 82]], ['swede', [40, 36, 68]], ['okra', [96, 32, 42]],
  ['salsify', [44, 18, 80]], ['chicory', [58, 26, 74]], ['endive', [64, 30, 72]],
  ['samphire', [110, 36, 44]], ['seaweed', [140, 30, 26]], ['wakame', [140, 32, 28]],
  ['nori', [140, 26, 22]], ['chard', [110, 38, 32]], ['cavolo nero', [140, 26, 22]],
  ['mizuna', [110, 40, 42]], ['frisee', [70, 38, 62]], ['lollo rosso', [340, 30, 36]],
  ['pak choi', [92, 34, 48]], ['bok choy', [92, 34, 48]], ['bean sprout', [48, 20, 86]],
  ['pea shoot', [104, 42, 44]], ['alfalfa', [90, 36, 60]], ['lovage', [110, 38, 38]],
  ['borage', [220, 40, 52]], ['marigold', [34, 76, 56]], ['viola', [280, 36, 48]],
  ['pansy', [286, 38, 42]], ['caramelised onion', [30, 44, 38]], ['shallot', [320, 18, 66]],
  ['garlic', [44, 14, 88]], ['ginger', [38, 44, 68]], ['fennel', [58, 24, 82]],
  ['artichoke', [76, 26, 52]], ['asparagus spear', [95, 34, 44]], ['plum tomato', [6, 66, 46]],
  // Cheese and dairy, which is almost all the same near-white and told apart by
  // how yellow it is.
  ['burrata', [46, 16, 92]], ['bocconcini', [46, 14, 92]], ['brie', [46, 22, 86]],
  ['camembert', [46, 20, 86]], ['ricotta', [44, 14, 92]], ['mascarpone', [44, 16, 92]],
  ['cottage cheese', [46, 12, 92]], ['cream cheese', [46, 14, 92]], ['creme fraiche', [46, 12, 92]],
  ['clotted cream', [44, 20, 90]], ['skyr', [44, 10, 92]], ['quark', [44, 10, 92]],
  ['paneer', [44, 14, 90]], ['feta', [46, 10, 92]], ['manchego', [46, 34, 78]],
  ['gruyere', [42, 44, 72]], ['comte', [44, 46, 72]], ['emmental', [46, 42, 80]],
  ['gouda', [38, 52, 64]], ['stilton', [48, 20, 80]], ['gorgonzola', [48, 18, 84]],
  ['roquefort', [50, 16, 86]], ['taleggio', [44, 30, 82]], ['goats cheese', [46, 10, 93]],
  // Grains, rice dishes and pasta bowls named after what is on them.
  ['paella', [40, 62, 56]], ['biryani', [40, 52, 62]], ['pilaf', [42, 40, 72]],
  ['pilau', [42, 44, 70]], ['jollof', [12, 58, 44]], ['jambalaya', [20, 50, 42]],
  ['sticky rice', [45, 14, 90]], ['tabbouleh', [96, 40, 40]], ['millet', [44, 34, 70]],
  ['buckwheat', [28, 26, 46]], ['baked bean', [22, 58, 46]], ['carbonara bowl', [44, 50, 74]],
  ['aglio e olio', [46, 40, 76]], ['primavera', [92, 34, 52]], ['pad thai', [30, 52, 56]],
  ['pad see ew', [28, 40, 42]], ['chow mein', [38, 40, 54]], ['lo mein', [38, 42, 56]],
  ['chow fun', [32, 36, 48]], ['yakisoba', [26, 44, 42]], ['japchae', [30, 36, 40]],
  ['mee goreng', [22, 52, 44]], ['char kway teow', [26, 42, 38]], ['dan dan', [14, 56, 42]],
  ['glass noodle', [44, 12, 86]], ['rice noodle', [42, 12, 88]], ['egg noodle', [44, 48, 70]],
  ['shirataki', [44, 8, 90]], ['somen', [44, 10, 90]], ['pancit', [36, 40, 58]],
  ['spaetzle', [44, 34, 76]], ['cavatelli', [43, 44, 71]], ['strozzapreti', [43, 44, 71]],
  ['garganelli', [43, 44, 71]], ['ditalini', [43, 44, 71]], ['momo', [42, 20, 88]],
  ['har gow', [44, 10, 90]], ['siu mai', [44, 36, 72]], ['shumai', [44, 36, 72]],
  ['mandu', [42, 20, 88]], ['manti', [42, 24, 84]], ['khinkali', [42, 20, 88]],
  // Soups, stews and curries: the colour of the pot they came out of.
  ['pho', [30, 44, 32]], ['laksa', [32, 64, 52]], ['tom yum', [10, 60, 48]],
  ['tom kha', [42, 26, 84]], ['miso soup', [34, 44, 38]], ['gazpacho', [8, 56, 46]],
  ['vichyssoise', [46, 18, 86]], ['minestrone', [16, 50, 40]], ['borscht', [338, 52, 30]],
  ['goulash', [18, 58, 38]], ['cassoulet', [36, 38, 50]], ['chilli con carne', [12, 52, 34]],
  ['chili', [10, 56, 36]], ['gumbo', [26, 44, 32]], ['tagine', [26, 56, 44]],
  ['korma', [42, 42, 72]], ['tikka masala', [16, 64, 48]], ['masala', [20, 58, 44]],
  ['vindaloo', [8, 64, 36]], ['rogan josh', [10, 58, 36]], ['madras', [16, 62, 42]],
  ['jalfrezi', [24, 56, 42]], ['sambar', [36, 54, 48]], ['rasam', [14, 54, 38]],
  ['butter chicken', [18, 62, 52]], ['mole', [18, 36, 20]], ['pozole', [12, 52, 42]],
  ['bouillabaisse', [20, 58, 46]], ['cioppino', [10, 56, 42]], ['shakshuka', [10, 58, 44]],
  ['stroganoff', [28, 34, 56]], ['fricassee', [42, 30, 76]], ['blanquette', [44, 22, 84]],
  ['navarin', [24, 40, 38]], ['pot au feu', [34, 36, 44]], ['feijoada', [22, 28, 22]],
  ['harira', [20, 46, 40]], ['avgolemono', [48, 54, 72]], ['congee', [45, 12, 88]],
  ['porridge', [40, 20, 82]], ['oatmeal', [40, 20, 80]], ['creme anglaise', [45, 48, 80]],
  ['sukiyaki', [24, 48, 30]], ['hotpot', [16, 48, 34]], ['ramen broth', [30, 44, 34]],
  // Bakes, pies and everything served as a cut square of it.
  ['moussaka', [16, 44, 40]], ['pastitsio', [30, 40, 56]], ['parmigiana', [8, 52, 42]],
  ['gratin', [42, 40, 70]], ['dauphinoise', [44, 34, 78]], ['mac and cheese', [40, 60, 60]],
  ['mac cheese', [40, 60, 60]], ['macaroni cheese', [40, 60, 60]], ['cauliflower cheese', [44, 40, 76]],
  ['wellington', [22, 36, 32]], ['shepherds pie', [40, 36, 66]], ['cottage pie', [40, 36, 66]],
  ['fish pie', [44, 26, 82]], ['pork pie', [36, 40, 60]], ['pasty', [38, 48, 66]],
  ['sausage roll', [38, 46, 66]], ['yorkshire pudding', [36, 48, 66]], ['quiche', [42, 50, 68]],
  ['frittata', [46, 56, 66]], ['tortilla espanola', [44, 52, 68]], ['khachapuri', [40, 46, 70]],
  // Flatbreads, fried things and everything else that browns.
  ['roti', [38, 38, 72]], ['chapati', [38, 36, 74]], ['paratha', [38, 44, 68]],
  ['lavash', [40, 30, 80]], ['manakish', [36, 40, 62]], ['lahmacun', [20, 46, 48]],
  ['socca', [42, 48, 64]], ['farinata', [44, 46, 66]], ['injera', [34, 26, 64]],
  ['arepa', [46, 42, 76]], ['pupusa', [44, 44, 74]], ['tostada', [36, 46, 66]],
  ['tostone', [46, 54, 64]], ['gordita', [40, 44, 70]], ['poppadom', [42, 46, 70]],
  ['papadum', [42, 46, 70]], ['dosa', [40, 46, 72]], ['idli', [45, 14, 92]],
  ['uttapam', [42, 44, 70]], ['okonomiyaki', [28, 40, 44]], ['takoyaki', [32, 40, 50]],
  ['latke', [40, 52, 58]], ['crab cake', [30, 46, 62]], ['nugget', [38, 54, 60]],
  ['goujon', [38, 52, 60]], ['scampi', [38, 52, 62]], ['tater tot', [40, 56, 60]],
  ['popcorn', [46, 40, 84]], ['crackling', [30, 44, 50]], ['pork scratching', [28, 42, 46]],
  ['poutine', [36, 44, 44]], ['patatas bravas', [16, 56, 48]], ['samosa', [38, 52, 58]],
  ['pakora', [36, 58, 52]], ['spring roll', [40, 42, 74]], ['lumpia', [40, 42, 74]],
  ['egg roll', [38, 44, 70]], ['enchilada', [10, 54, 42]], ['quesadilla', [38, 46, 68]],
  ['nachos', [42, 60, 60]], ['burrito', [40, 30, 78]], ['shawarma', [22, 46, 42]],
  ['gyro', [24, 44, 44]], ['souvlaki', [34, 44, 50]], ['satay', [32, 58, 48]],
  ['yakitori', [26, 50, 40]], ['kebab', [18, 46, 40]], ['falafel', [78, 36, 44]],
  // Dips, spreads and anything that arrives in a spoon.
  ['guacamole', [86, 40, 44]], ['baba ganoush', [40, 20, 52]], ['tzatziki', [70, 14, 88]],
  ['taramasalata', [8, 48, 72]], ['tapenade', [40, 20, 20]], ['chutney', [24, 52, 36]],
  ['marmalade', [32, 72, 52]], ['jam', [346, 56, 42]], ['compote', [340, 50, 40]],
  ['relish', [30, 48, 40]], ['grits', [48, 38, 74]], ['refried bean', [24, 30, 30]],
  ['kimchi', [10, 62, 42]], ['sauerkraut', [48, 26, 76]], ['stir fry', [80, 30, 40]],
  ['ratatouille', [10, 48, 36]], ['caponata', [286, 24, 30]], ['succotash', [50, 44, 56]],
  // Sweet. Pastry and sugar are pale; chocolate and caramel carry the rest.
  ['cake', [38, 44, 74]], ['cheesecake', [44, 24, 86]], ['sponge', [40, 44, 76]],
  ['gateau', [28, 36, 54]], ['torte', [24, 38, 40]], ['brownie', [22, 40, 24]],
  ['pie', [36, 46, 66]], ['pastry', [38, 44, 72]], ['filo', [40, 42, 74]],
  ['meringue', [44, 10, 94]], ['pavlova', [44, 10, 94]], ['macaron', [330, 40, 78]],
  ['doughnut', [34, 48, 68]], ['donut', [34, 48, 68]], ['eclair', [26, 40, 34]],
  ['cannoli', [40, 34, 78]], ['baklava', [38, 56, 58]], ['tiramisu', [30, 30, 56]],
  ['panettone', [38, 50, 70]], ['croissant', [36, 52, 64]], ['scone', [36, 42, 72]],
  ['cupcake', [36, 40, 72]], ['flan', [40, 60, 64]], ['creme caramel', [34, 58, 52]],
  ['creme brulee', [44, 50, 74]], ['custard tart', [44, 56, 70]], ['pastel de nata', [40, 54, 66]],
  ['gelato', [40, 26, 84]], ['semifreddo', [42, 24, 86]], ['kulfi', [42, 30, 84]],
  ['marshmallow', [340, 14, 92]], ['nougat', [44, 26, 84]], ['halva', [40, 30, 72]],
  ['turkish delight', [340, 44, 66]], ['fudge', [28, 44, 42]], ['praline', [30, 50, 48]],
  ['brittle', [34, 62, 52]], ['streusel', [38, 44, 64]], ['crumble', [36, 44, 66]],
  ['mochi', [330, 18, 88]], ['gulab jamun', [26, 52, 38]], ['rasgulla', [45, 12, 92]],
  ['laddu', [42, 68, 58]], ['cake pop', [330, 36, 64]], ['toffee', [30, 54, 40]],
  ['cocoa nib', [22, 36, 22]], ['chocolate chip', [22, 40, 24]], ['honey', [38, 70, 54]],
  ['maple', [26, 62, 38]], ['trifle', [340, 36, 66]], ['christmas pudding', [22, 36, 24]],
  ['sticky toffee pudding', [26, 46, 32]], ['lamington', [22, 38, 28]], ['flapjack', [36, 52, 58]],
  // Nuts, seeds and everything scattered over the top at the last second.
  ['hazelnut', [28, 40, 44]], ['pecan', [24, 42, 40]], ['cashew', [40, 34, 74]],
  ['macadamia', [42, 24, 84]], ['peanut', [34, 40, 58]], ['chestnut', [24, 34, 38]],
  ['pumpkin seed', [86, 34, 44]], ['sunflower seed', [40, 30, 54]], ['chia', [280, 8, 24]],
  ['flax', [32, 36, 46]], ['nigella', [0, 0, 12]], ['cumin', [30, 36, 38]],
  ['panko', [40, 30, 80]], ['furikake', [120, 24, 32]], ['dukkah', [30, 40, 46]],
  ['zaatar', [80, 32, 32]], ['gremolata', [96, 44, 40]], ['sea salt', [0, 0, 96]],
  ['bacon bit', [10, 50, 44]], ['paprika', [14, 66, 46]], ['saffron', [38, 74, 54]],
  ['turmeric', [42, 76, 52]], ['sumac', [4, 52, 38]], ['chilli flake', [8, 66, 42]],
  ['black pepper', [28, 14, 28]],
  // Bread and pastry, which is all one family of browns and told apart by crust.
  ['ciabatta', [38, 40, 72]], ['sourdough', [34, 38, 66]], ['baguette', [36, 46, 66]],
  ['focaccia', [40, 48, 70]], ['naan', [40, 42, 74]], ['pita', [38, 36, 76]],
  ['bagel', [34, 44, 64]], ['english muffin', [36, 38, 72]], ['crumpet', [40, 30, 80]],
  ['calzone', [36, 46, 66]], ['empanada', [38, 48, 68]], ['pain au chocolat', [28, 44, 40]],
  ['tarte tatin', [30, 62, 48]], ['profiterole', [34, 42, 66]], ['panna cotta', [44, 20, 90]],
  ['blondie', [36, 48, 60]], ['granola', [34, 46, 54]], ['pistachio', [86, 40, 46]],
  ['pine nut', [42, 34, 76]], ['waffle', [38, 46, 66]], ['french toast', [36, 52, 62]],
  ['blini', [40, 38, 74]], ['crepe', [40, 40, 74]], ['omelette', [46, 60, 68]],
  ['toad in the hole', [34, 46, 62]], ['bubble and squeak', [76, 26, 52]], ['banger', [24, 38, 58]],
  ['hash brown', [40, 54, 58]], ['rosti', [42, 54, 60]], ['hash', [38, 44, 56]],
  // Grains and pulses, which are paler than the dish they end up in.
  ['couscous', [44, 34, 76]], ['quinoa', [40, 26, 74]], ['bulgur', [36, 30, 62]],
  ['freekeh', [70, 22, 44]], ['farro', [34, 26, 56]], ['lentil', [26, 34, 38]],
  ['orzo', [43, 40, 74]], ['pici', [43, 46, 70]], ['mafaldine', [43, 46, 70]],
  ['lasagne', [12, 48, 40]], ['poke', [10, 46, 44]], ['california roll', [40, 22, 80]],
  // The rest of what the coverage check turned up.
  ['gherkin', [70, 40, 42]], ['short rib', [14, 42, 30]], ['langoustine', [10, 62, 58]],
  ['caviar', [220, 10, 16]], ['brochette', [22, 46, 42]], ['prosciutto', [352, 44, 56]],
  ['hummus', [42, 36, 74]], ['pickle', [66, 38, 46]], ['cabbage', [92, 26, 60]],
  ['hispi', [92, 30, 52]], ['greens', [110, 36, 36]], ['rocket', [104, 40, 38]],
  ['radicchio', [330, 40, 32]], ['tarragon', [96, 34, 40]], ['flower', [330, 46, 62]],
  ['nasturtium', [30, 74, 54]], ['soy', [26, 44, 20]], ['affogato', [26, 38, 24]],
  ['rhubarb compote', [346, 54, 46]], ['temaki', [120, 20, 32]], ['flatbread', [38, 38, 72]],
  ['pancake', [36, 46, 66]], ['pickled onion', [330, 26, 74]], ['pickled shallot', [332, 30, 70]],
  ['gochujang', [8, 64, 38]], ['bechamel', [44, 22, 88]], ['tamarind', [24, 48, 30]],
  ['icing sugar', [0, 0, 97]], ['bonito', [22, 40, 52]], ['leche de tigre', [46, 28, 86]],
  ['sweet potato', [26, 64, 54]], ['sriracha', [4, 70, 44]], ['hoisin', [18, 44, 22]],
  ['sambal', [6, 66, 42]], ['chashu', [14, 44, 40]], ['mushy pea', [88, 38, 40]],
  // National dishes, coloured by what comes out of the pan rather than by what
  // went into it.
  ['bibimbap', [24, 50, 44]], ['nasi goreng', [28, 46, 44]], ['kedgeree', [44, 54, 62]],
  ['plov', [34, 46, 56]], ['mujadara', [30, 32, 44]], ['koshari', [20, 44, 42]],
  ['dolma', [86, 28, 38]], ['borek', [40, 44, 70]], ['tamale', [46, 46, 66]],
  ['elote', [48, 68, 58]], ['coq au vin', [12, 40, 24]], ['cullen skink', [44, 30, 76]],
  ['khao soi', [36, 62, 50]], ['sopa', [20, 50, 44]], ['birria', [10, 56, 38]],
  ['doro wat', [12, 56, 34]], ['egusi', [70, 34, 34]], ['mapo tofu', [8, 58, 40]],
  ['fondue', [44, 40, 78]], ['ceviche', [40, 26, 82]], ['aloo gobi', [44, 54, 62]],
  ['rendang', [22, 40, 24]], ['bulgogi', [18, 46, 32]], ['kung pao', [16, 50, 36]],
  ['sweet and sour', [14, 66, 48]], ['gado gado', [34, 48, 50]], ['barbacoa', [14, 40, 28]],
  ['al pastor', [14, 56, 42]], ['ropa vieja', [12, 46, 34]], ['chilaquiles', [12, 52, 44]],
  ['gyro', [24, 44, 44]], ['bobotie', [26, 46, 42]], ['carne asada', [14, 44, 30]],
  ['asado', [14, 44, 30]], ['galbi', [16, 44, 30]], ['croque monsieur', [38, 50, 62]],
  ['tartiflette', [42, 40, 72]], ['spanakopita', [96, 30, 40]], ['saganaki', [40, 42, 70]],
  ['banh mi', [38, 38, 72]], ['katsu sando', [38, 44, 74]], ['tteokbokki', [8, 62, 44]],
  ['tteok', [44, 12, 90]], ['banh xeo', [46, 58, 62]], ['pastilla', [38, 46, 66]],
  ['huevos rancheros', [14, 56, 46]], ['pan con tomate', [10, 52, 46]], ['peking duck', [20, 52, 36]],
  ['char siu', [6, 56, 38]], ['biltong', [12, 38, 26]], ['smorrebrod', [34, 34, 66]],
  ['kibbeh', [26, 42, 42]], ['kottbullar', [16, 42, 36]], ['pao de queijo', [44, 34, 80]],
  ['fufu', [44, 12, 88]], ['coxinha', [36, 52, 58]], ['mofongo', [44, 40, 66]],
  ['pelmeni', [42, 20, 88]], ['raclette', [44, 40, 78]], ['saag', [110, 38, 30]],
  ['ful medames', [70, 26, 34]], ['menemen', [14, 56, 48]], ['nicoise', [86, 32, 44]],
  ['panzanella', [8, 50, 46]], ['fattoush', [96, 34, 44]], ['horiatiki', [92, 30, 48]],
  ['waldorf', [60, 24, 74]], ['moules', [230, 16, 26]], ['ratatouille', [10, 48, 36]],
]

// --- What the last audit found -------------------------------------------
// The same 433 unrecognised foods that had no form also had no colour: half of
// them came out in a hue hashed off their own letters, which is a lottery with
// 24 tickets in it. A mushroom is not a randomly assigned pink, and a plate only
// reads as food if the food is the right colour -- so this is the other half of
// the same repair, and the two lists are kept in step deliberately.
const KITCHEN_COLOURS: Array<[string, Hsl]> = [
  // Mushrooms. Almost all brown, and told apart by how pale and how grey.
  ['enoki', [44, 14, 84]], ['shiitake', [26, 26, 32]], ['portobello', [24, 22, 28]],
  ['chestnut mushroom', [26, 22, 40]], ['button mushroom', [36, 14, 78]],
  ['oyster mushroom', [38, 14, 72]], ['king oyster', [40, 16, 76]], ['shimeji', [38, 14, 78]],
  ['maitake', [28, 24, 38]], ['hen of the wood', [28, 24, 38]], ['chanterelle', [36, 52, 52]],
  ['girolle', [36, 54, 54]], ['morel', [26, 28, 26]], ['porcini', [30, 32, 44]],
  ['cep', [30, 32, 44]], ['trompette', [24, 10, 18]], ['wild mushroom', [28, 24, 38]],
  ['field mushroom', [30, 18, 44]], ['eryngii', [40, 16, 76]], ['duxelles', [26, 26, 26]],
  // Whole roasts: the colour of skin that has been in an oven, not of the meat.
  ['roast chicken', [34, 54, 54]], ['whole chicken', [34, 50, 56]], ['roast duck', [20, 50, 38]],
  ['whole duck', [20, 50, 38]], ['roast turkey', [32, 46, 54]], ['turkey crown', [32, 44, 56]],
  ['sunday roast', [26, 44, 42]], ['pot roast', [20, 40, 32]], ['porchetta', [30, 44, 52]],
  ['spatchcock', [34, 50, 54]], ['suckling pig', [28, 46, 52]], ['lechon', [28, 50, 50]],
  ['mechoui', [24, 48, 44]], ['carvery', [28, 44, 44]], ['whole fish', [38, 16, 80]],
  ['sea bream', [40, 16, 80]], ['bream', [40, 16, 80]], ['leg of lamb', [14, 42, 36]],
  // Shellfish, small fish and everything smoked.
  ['sea urchin', [26, 72, 56]], ['uni', [26, 74, 58]], ['abalone', [34, 16, 58]],
  ['paua', [176, 22, 30]], ['whelk', [36, 20, 62]], ['winkle', [30, 18, 44]],
  ['whitebait', [40, 24, 74]], ['anchovy', [14, 34, 38]], ['cuttlefish', [40, 10, 88]],
  ['kipper', [26, 48, 42]], ['bloater', [30, 34, 46]], ['arbroath smokie', [30, 44, 44]],
  ['lutefisk', [42, 12, 88]], ['rakfisk', [10, 40, 58]], ['fiskeboller', [42, 14, 88]],
  ['soft shell crab', [26, 44, 54]], ['crab claw', [14, 58, 62]], ['dressed crab', [26, 46, 66]],
  ['potted shrimp', [16, 58, 66]], ['fish finger', [38, 52, 60]],
  ['angels on horseback', [12, 46, 42]], ['scotch woodcock', [40, 44, 64]],
  // Offal, which is the darkest thing that ever reaches a plate, and charcuterie.
  ['sweetbread', [32, 30, 66]], ['foie gras', [36, 42, 72]], ['chicken liver', [8, 30, 30]],
  ['liver', [6, 34, 24]], ['kidney', [8, 32, 30]], ['lambs heart', [4, 38, 26]],
  ['ox heart', [4, 38, 26]], ['tongue', [6, 36, 46]], ['marrow bone', [40, 18, 84]],
  ['bone marrow', [40, 18, 84]], ['brain', [30, 16, 76]], ['gizzard', [12, 32, 34]],
  ['tripe', [44, 14, 84]], ['faggot', [20, 32, 28]], ['white pudding', [40, 28, 70]],
  ['pancetta', [8, 50, 50]], ['saucisson', [356, 40, 44]], ['lardon', [10, 52, 48]],
  ['rillette', [32, 34, 56]], ['charcuterie', [354, 42, 50]],
  // Bread and pastry: one family of browns, told apart by how far the crust got.
  ['pretzel', [28, 44, 38]], ['challah', [40, 52, 66]], ['pumpernickel', [24, 22, 24]],
  ['melba toast', [36, 36, 70]], ['oatcake', [38, 30, 66]], ['water biscuit', [42, 22, 82]],
  ['rye crispbread', [32, 28, 58]], ['grissini', [38, 40, 74]], ['simit', [30, 44, 52]],
  ['ruisleipa', [24, 24, 32]], ['bara brith', [28, 34, 44]], ['soda bread', [34, 36, 64]],
  ['cornbread', [46, 58, 64]], ['cheese toastie', [38, 50, 60]], ['rarebit', [38, 56, 58]],
  ['beaver tail', [34, 46, 60]], ['croquembouche', [34, 50, 58]], ['madeleine', [42, 52, 70]],
  ['financier', [40, 48, 66]], ['canele', [24, 44, 30]], ['kouign amann', [32, 56, 52]],
  ['palmier', [36, 52, 62]], ['danish pastry', [40, 50, 70]], ['babka', [26, 40, 38]],
  ['cinnamon roll', [30, 46, 52]], ['strudel', [36, 46, 66]], ['karjalanpiirakka', [42, 34, 70]],
  ['kalakukko', [30, 32, 44]], ['nanaimo bar', [28, 36, 34]], ['galette des rois', [38, 48, 68]],
  ['bakewell', [40, 44, 72]], ['treacle tart', [32, 54, 50]], ['anzac biscuit', [36, 52, 56]],
  ['mooncake', [32, 44, 50]], ['tourtiere', [34, 46, 62]], ['po boy', [36, 42, 66]],
  ['sloppy joe', [14, 48, 40]], ['philly cheesesteak', [26, 42, 44]], ['meatloaf', [18, 40, 32]],
  // Sweet, where nearly everything is either cream, caramel or cocoa.
  ['eton mess', [345, 28, 80]], ['blancmange', [44, 12, 92]], ['junket', [44, 10, 92]],
  ['semolina', [44, 26, 84]], ['tapioca', [44, 8, 92]], ['panna', [44, 20, 90]],
  ['dulce de leche', [30, 56, 46]], ['salted caramel', [30, 58, 42]], ['butterscotch', [34, 62, 46]],
  ['brigadeiro', [22, 40, 24]], ['medovik', [34, 44, 56]], ['ptichye moloko', [44, 16, 90]],
  ['red velvet', [352, 52, 36]], ['key lime', [72, 50, 60]], ['leipajuusto', [44, 30, 80]],
  ['syrniki', [40, 44, 70]], ['halo halo', [300, 30, 66]], ['bibingka', [44, 44, 72]],
  ['puto', [45, 12, 92]], ['fruit leather', [14, 58, 46]], ['gold leaf', [46, 80, 62]],
  ['lemon curd', [48, 72, 62]], ['honeycomb', [38, 70, 56]],
  // Vegetables, pickles and the potato repertoire.
  ['wasabi', [90, 44, 54]], ['gari', [340, 28, 80]], ['pickled ginger', [340, 28, 80]],
  ['umeboshi', [352, 44, 48]], ['takuan', [48, 66, 66]], ['daikon', [46, 8, 92]],
  ['lotus root', [42, 12, 88]], ['bamboo shoot', [46, 24, 80]], ['cardoon', [70, 20, 66]],
  ['kohlrabi', [80, 22, 74]], ['yuba', [46, 32, 80]], ['natto', [32, 32, 40]],
  ['jackfruit', [40, 52, 60]], ['silken tofu', [46, 10, 92]], ['tofu puff', [38, 44, 64]],
  ['tofu', [44, 18, 88]], ['tempeh', [38, 32, 62]], ['seitan', [28, 30, 44]],
  ['coleslaw', [50, 26, 78]], ['russian salad', [44, 20, 84]], ['olivier salad', [44, 20, 84]],
  ['potato salad', [46, 26, 82]], ['vegetable crisp', [30, 46, 52]],
  ['beet crisp', [340, 42, 36]], ['gaufrette', [42, 52, 62]], ['pont neuf', [44, 58, 62]],
  ['pommes souffle', [42, 54, 64]], ['pomme anna', [42, 50, 64]], ['pommes anna', [42, 50, 64]],
  ['pommes dauphine', [40, 44, 70]], ['duchesse potato', [42, 48, 68]], ['kumara', [24, 58, 54]],
  ['corn rib', [48, 70, 58]], ['creamed corn', [48, 58, 68]], ['polenta chip', [48, 58, 64]],
  ['jerusalem artichoke', [42, 24, 78]], ['lyonnaise potato', [42, 50, 60]],
  // Crisps, shards and dustings: the two new forms, which have to be coloured or
  // a tuile comes out the same lilac as everything else the tables never met.
  ['chicharron', [30, 40, 56]], ['frico', [42, 52, 64]], ['lace crisp', [40, 44, 70]],
  ['parmesan crisp', [44, 48, 70]], ['isomalt', [44, 20, 90]], ['sugar glass', [44, 10, 94]],
  ['chicken skin', [32, 52, 50]], ['crispy skin', [30, 48, 48]], ['prawn cracker', [16, 40, 84]],
  ['shard', [36, 40, 62]], ['ash', [0, 0, 18]], ['charcoal', [0, 0, 12]],
  ['vegetable ash', [0, 0, 20]], ['matcha', [80, 44, 40]], ['bee pollen', [44, 78, 58]],
  ['cocoa powder', [22, 38, 26]], ['cocoa', [22, 38, 26]], ['confectioners sugar', [0, 0, 97]],
  ['burnt onion', [26, 20, 18]], ['dusting', [0, 0, 94]],
  // Boards and spreads, which take the colour of the charcuterie on them.
  ['cheese board', [44, 34, 74]], ['antipasti', [12, 44, 50]], ['crudites', [90, 34, 52]],
  ['dips', [42, 30, 72]], ['grazing board', [40, 36, 66]], ['smorgasbord', [38, 32, 64]],
  ['full english', [20, 46, 44]], ['casado', [38, 40, 56]], ['hangi', [26, 42, 40]],
  ['espresso', [22, 34, 16]], ['breakfast tea', [26, 50, 36]], ['green tea', [86, 32, 46]],
  // The rest of the world's menu, coloured by what comes out of the pan.
  ['mapo doufu', [8, 58, 40]], ['cheung fun', [44, 10, 90]], ['lo bak go', [44, 20, 82]],
  ['turnip cake', [44, 20, 82]], ['jian bing', [40, 44, 62]], ['bibim guksu', [10, 52, 42]],
  ['naengmyeon', [30, 20, 52]], ['samgyetang', [45, 14, 88]], ['sundubu', [8, 58, 42]],
  ['pajeon', [44, 48, 62]], ['kimbap', [120, 20, 32]], ['jjigae', [10, 54, 38]],
  ['doenjang', [28, 42, 34]], ['bossam', [12, 40, 50]], ['jokbal', [20, 38, 40]],
  ['nasi lemak', [44, 16, 86]], ['murtabak', [36, 44, 62]], ['bak kut teh', [28, 40, 28]],
  ['chai tow kway', [36, 34, 50]], ['popiah', [42, 30, 80]], ['rojak', [22, 44, 38]],
  ['otak otak', [16, 52, 48]], ['adobo', [26, 40, 26]], ['sinigang', [40, 36, 46]],
  ['kare kare', [32, 54, 48]], ['sisig', [22, 42, 44]], ['arroz con pollo', [42, 52, 58]],
  ['cachapa', [48, 62, 62]], ['patacon', [46, 54, 62]], ['yuca frita', [44, 40, 74]],
  ['chimichanga', [38, 46, 66]], ['taquito', [38, 44, 64]], ['sope', [42, 44, 70]],
  ['huarache', [40, 42, 66]], ['tlayuda', [38, 42, 64]], ['baleada', [40, 36, 74]],
  ['gallo pinto', [24, 30, 34]], ['moqueca', [24, 60, 48]], ['acaraje', [30, 50, 54]],
  ['milanesa', [36, 52, 58]], ['provoleta', [42, 44, 74]], ['choripan', [20, 44, 48]],
  ['kitfo', [6, 48, 30]], ['tibs', [18, 42, 34]], ['shiro', [36, 46, 46]],
  ['misir wot', [10, 52, 38]], ['doro wot', [12, 56, 34]], ['briouat', [38, 48, 66]],
  ['zaalouk', [16, 44, 34]], ['kushari', [22, 44, 44]], ['ful', [66, 28, 36]],
  ['taameya', [80, 38, 44]], ['molokhia', [120, 36, 26]], ['mahshi', [90, 30, 40]],
  ['fattah', [30, 40, 50]], ['iskender', [14, 50, 42]], ['chakhokhbili', [16, 50, 40]],
  ['satsivi', [42, 36, 58]], ['badrijani', [285, 24, 30]], ['solyanka', [14, 48, 38]],
  ['shchi', [60, 30, 44]], ['okroshka', [56, 16, 84]], ['gravadlax', [12, 62, 58]],
  ['janssons', [42, 38, 72]], ['raggmunk', [42, 50, 62]], ['rullepolse', [352, 40, 48]],
  ['frikadeller', [24, 40, 50]], ['stegt flaesk', [14, 44, 52]], ['lapskaus', [26, 40, 38]],
  ['farikal', [92, 28, 46]], ['miso', [32, 40, 34]], ['dashi', [36, 40, 36]],
  // Meat substitutes, which are a real section of a real menu and were coming
  // out in the lottery hue. Close to the thing they stand in for, a shade duller.
  ['sausage', [24, 40, 52]], ['vegan sausage', [24, 34, 46]], ['vegan burger', [16, 36, 36]],
  ['beyond burger', [14, 38, 34]], ['plant burger', [14, 38, 34]], ['cashew cheese', [42, 28, 76]],
  // Bare ingredients, from the same third sweep as the shape table. Several of
  // these are CARRIERS below -- a foam or a gel takes its colour from whatever
  // went into it -- but a chef who writes nothing but "foam" still has to get a
  // colour, and what they were getting was a hue hashed off the letters.
  ['stracciatella', [44, 14, 92]], ['provolone', [44, 40, 78]], ['bass', [42, 16, 87]],
  ['celery', [72, 28, 66]], ['sugar', [0, 0, 96]], ['flour', [42, 10, 92]],
  ['salt', [0, 0, 96]], ['oil', [48, 60, 50]], ['stock', [34, 40, 40]],
  ['wine', [350, 44, 26]], ['beer', [38, 60, 50]], ['vinegar', [30, 36, 34]],
  ['mustard', [46, 70, 54]], ['dough', [42, 26, 84]], ['batter', [44, 40, 78]],
  ['glaze', [30, 50, 36]], ['foam', [44, 14, 93]], ['gel', [40, 30, 70]],
  ['powder', [0, 0, 92]], ['crisp', [40, 52, 58]], ['salad', [96, 36, 44]],
  ['slaw', [50, 26, 78]], ['mousse', [28, 34, 44]], ['custard', [45, 58, 72]],
]

// --- What the fourth audit found ------------------------------------------
// The other half of the same repair: of the 705 foods in the fourth list, 48%
// were being coloured by a hash of their own letters. Kept in the same order as
// the shape table's fourth section so the two can be read side by side.
const MENU_COLOURS: Array<[string, Hsl]> = [
  // The cold larder. Cured meat is the one pink on a plate that is never the
  // pink of raw meat -- it is browner, and the fat in it is what you see.
  ['carpaccio', [356, 46, 40]], ['crudo', [10, 40, 68]], ['tataki', [6, 44, 36]],
  ['escabeche', [40, 40, 60]], ['aspic', [42, 30, 70]], ['terrine', [12, 34, 44]],
  ['galantine', [30, 30, 64]], ['ballotine', [32, 36, 62]], ['roulade', [26, 34, 58]],
  ['pate en croute', [30, 36, 52]], ['farce', [14, 32, 52]], ['confit', [26, 44, 44]],
  ['brandade', [44, 16, 86]], ['brawn', [16, 28, 58]], ['headcheese', [16, 26, 62]],
  ['jerky', [14, 44, 26]], ['lonza', [352, 36, 52]],
  ['capocollo', [352, 40, 46]], ['soppressata', [354, 42, 40]], ['kielbasa', [16, 42, 38]],
  ['boerewors', [14, 40, 36]], ['quenelle', [40, 26, 76]],
  // Sandwiches and burgers, which are the colour of toasted bread: what you see
  // of a sandwich is mostly its outside.
  ['burger', [30, 46, 46]], ['cheeseburger', [30, 48, 46]], ['slider', [32, 44, 52]],
  ['sandwich', [40, 40, 72]], ['club sandwich', [40, 42, 68]],
  ['blt', [36, 44, 62]], ['reuben', [26, 40, 50]], ['croque madame', [38, 50, 60]],
  ['torta', [34, 44, 62]], ['panini', [34, 44, 62]], ['muffuletta', [34, 42, 60]],
  ['chip butty', [42, 44, 72]], ['cubano', [34, 44, 60]], ['som tam', [78, 40, 60]],
  ['caprese', [8, 50, 50]], ['mulligatawny', [36, 54, 48]],
  // Cuts and game. Game is darker than anything from a farm, and the birds are
  // darker again than the four-legged ones.
  ['tri tip', [6, 44, 32]], ['chuck', [6, 42, 30]], ['neck fillet', [8, 42, 34]],
  ['spare rib', [18, 48, 32]], ['baby back rib', [18, 48, 32]], ['pigs knuckle', [26, 42, 46]],
  ['pork knuckle', [26, 42, 46]], ['grouse', [18, 36, 30]], ['pigeon', [10, 36, 28]],
  ['woodcock', [14, 36, 30]], ['snipe', [14, 36, 30]], ['mallard', [16, 40, 32]],
  ['hare', [10, 38, 28]], ['wild boar', [14, 36, 32]], ['kangaroo', [4, 44, 26]],
  ['ostrich', [4, 42, 28]], ['heart', [4, 38, 26]], ['roe deer', [8, 40, 26]],
  ['lemon drizzle', [50, 62, 72]], ['snow pea', [102, 42, 46]], ['mange tout', [102, 42, 46]],
  // Japan.
  ['tamagoyaki', [45, 70, 64]], ['chawanmushi', [45, 40, 78]], ['karaage', [34, 56, 52]],
  ['unagi', [22, 44, 30]], ['shabu shabu', [40, 30, 64]], ['donburi', [40, 30, 68]],
  ['oyakodon', [42, 52, 60]], ['gyudon', [24, 40, 42]], ['chirashi', [10, 50, 60]],
  ['tsukemen', [36, 40, 44]], ['mentaiko', [4, 56, 54]], ['dorayaki', [32, 44, 52]],
  ['taiyaki', [34, 46, 54]], ['daifuku', [340, 14, 90]], ['anko', [16, 32, 26]],
  ['yakiniku', [20, 44, 36]],
  // China and south-east Asia. Steamed dough is the palest thing on any menu.
  ['xiao long bao', [42, 18, 88]], ['sheng jian bao', [40, 26, 76]], ['mantou', [42, 14, 90]],
  ['youtiao', [38, 46, 60]], ['hot pot', [6, 52, 38]], ['dry pot', [14, 48, 36]],
  ['dim sum', [40, 24, 76]], ['larb', [22, 40, 44]], ['goi cuon', [96, 26, 72]],
  ['cha ca', [46, 62, 54]], ['com tam', [40, 24, 76]], ['banh cuon', [42, 16, 88]],
  // India.
  ['thali', [36, 44, 52]], ['baingan bharta', [22, 26, 30]], ['rajma', [10, 44, 32]],
  ['kulcha', [40, 34, 74]], ['bhatura', [38, 42, 68]], ['pav bhaji', [18, 56, 40]],
  ['vada pav', [34, 48, 56]], ['dhokla', [50, 60, 66]], ['khandvi', [48, 56, 68]],
  ['papdi chaat', [36, 42, 58]], ['bhel puri', [34, 46, 58]], ['pani puri', [36, 44, 62]],
  ['achar', [30, 62, 42]], ['barfi', [44, 22, 84]], ['halwa', [28, 50, 44]],
  ['kheer', [42, 20, 86]], ['ras malai', [44, 18, 88]], ['jalebi', [38, 74, 54]],
  ['falooda', [330, 30, 70]],
  // The Levant.
  ['mezze', [38, 36, 64]], ['muhammara', [8, 52, 38]], ['labneh', [44, 12, 92]],
  ['fatteh', [38, 30, 72]], ['sambousek', [36, 44, 62]], ['warak enab', [88, 28, 34]],
  ['makloubeh', [30, 44, 48]], ['mansaf', [40, 26, 74]], ['musakhan', [28, 48, 48]],
  ['knafeh', [30, 62, 52]], ['maamoul', [38, 36, 70]], ['basbousa', [36, 52, 62]],
  ['qatayef', [36, 42, 66]], ['batata harra', [26, 56, 50]], ['mutabal', [44, 14, 84]],
  // Africa.
  ['chakalaka', [14, 56, 44]], ['pap', [46, 16, 88]], ['suya', [16, 48, 40]],
  ['banku', [46, 20, 84]], ['waakye', [16, 30, 40]], ['moin moin', [28, 54, 52]],
  ['chin chin', [36, 46, 64]],
  // Germany and France.
  ['sauerbraten', [18, 40, 30]], ['rouladen', [16, 38, 34]], ['flammkuchen', [38, 36, 68]],
  ['kartoffelsalat', [46, 32, 76]], ['knodel', [40, 22, 80]], ['leberkase', [12, 36, 54]],
  ['weisswurst', [40, 22, 82]], ['choucroute', [46, 26, 78]], ['aligot', [46, 26, 82]],
  ['vol au vent', [40, 40, 76]], ['boeuf bourguignon', [10, 42, 26]], ['gougere', [38, 44, 66]],
  // Iberia and Italy.
  ['tapas', [30, 40, 54]], ['gambas al ajillo', [14, 58, 58]], ['pulpo a la gallega', [8, 40, 54]],
  ['croquetas', [34, 46, 62]], ['escalivada', [18, 36, 36]], ['fideua', [34, 46, 52]],
  ['pisto', [12, 44, 42]], ['churros', [34, 50, 60]], ['bacalhau', [42, 18, 84]],
  ['francesinha', [10, 50, 40]], ['caldo verde', [96, 34, 34]], ['arancini', [34, 48, 58]],
  ['supli', [34, 48, 58]], ['vitello tonnato', [36, 22, 72]], ['bistecca', [8, 44, 30]],
  ['piadina', [40, 32, 74]], ['cacciucco', [10, 48, 38]], ['quattro formaggi', [44, 40, 76]],
  ['sicilian slice', [14, 46, 46]],
  // Dried pasta is one colour whatever it has been cut into.
  ['cannelloni', [44, 50, 72]], ['manicotti', [44, 50, 72]], ['paccheri', [44, 50, 72]],
  ['radiatori', [44, 50, 72]], ['culurgiones', [44, 50, 72]], ['malloreddus', [44, 50, 72]],
  ['bigoli', [44, 50, 72]], ['fregola', [42, 44, 70]], ['lumache', [44, 50, 72]],
  ['campanelle', [44, 50, 72]],
  // Grains and sea vegetables.
  ['barley', [44, 30, 70]], ['amaranth', [36, 26, 60]], ['kombu', [80, 20, 26]],
  ['dulse', [356, 32, 32]], ['hijiki', [30, 14, 18]], ['agar', [42, 10, 92]],
  ['kelp', [96, 26, 28]],
  // Fruit, which is the one section where the colour is the whole point.
  ['guava', [8, 50, 66]], ['dragonfruit', [330, 52, 60]], ['dragon fruit', [330, 52, 60]],
  ['starfruit', [52, 66, 62]], ['durian', [46, 50, 60]], ['rambutan', [356, 60, 50]],
  ['longan', [34, 26, 66]], ['quince', [46, 48, 66]], ['elderberry', [290, 32, 24]],
  ['mulberry', [330, 40, 28]], ['physalis', [34, 72, 58]], ['nectarine', [20, 72, 58]],
  ['clementine', [28, 80, 56]], ['tangerine', [26, 82, 56]], ['kumquat', [34, 80, 56]],
  ['yuzu', [52, 74, 62]], ['calamansi', [72, 60, 54]], ['coconut', [40, 10, 92]],
  ['damson', [292, 34, 30]], ['greengage', [80, 40, 56]], ['loquat', [34, 66, 62]],
  // Vegetables. The chillies are ordered by how hot they look, which is roughly
  // how hot they are: green through to the orange of a habanero.
  ['choy sum', [96, 36, 38]], ['gai lan', [104, 32, 30]], ['tatsoi', [110, 34, 28]],
  ['escarole', [78, 32, 60]], ['sorrel', [88, 36, 44]], ['purslane', [104, 30, 42]],
  ['yam', [36, 30, 70]], ['cassava', [42, 14, 88]], ['taro', [292, 10, 78]],
  ['chayote', [76, 24, 74]], ['tomatillo', [76, 42, 52]], ['poblano', [110, 40, 26]],
  ['jalapeno', [104, 48, 34]], ['serrano', [110, 46, 34]], ['shishito', [100, 42, 40]],
  ['habanero', [24, 80, 50]], ['jalapeno popper', [42, 48, 56]], ['marrow', [86, 30, 58]],
  ['brazil nut', [34, 30, 58]],
  // Bread and the baker's counter: a crust, not a crumb.
  ['boule', [34, 40, 60]], ['batard', [34, 40, 62]], ['dinner roll', [34, 44, 66]],
  ['toast', [34, 48, 60]], ['bruschetta', [30, 44, 62]], ['crostini', [34, 46, 64]],
  ['canape', [38, 38, 68]], ['tartlet', [36, 44, 66]], ['turnover', [36, 46, 66]],
  ['pandesal', [34, 44, 66]], ['stollen', [40, 30, 72]], ['fougasse', [36, 40, 64]],
  // Puddings.
  ['muffin', [32, 40, 52]], ['shortbread', [40, 42, 76]], ['biscotti', [34, 42, 66]],
  ['cookie', [30, 44, 50]], ['swiss roll', [32, 40, 58]], ['baked alaska', [44, 20, 90]],
  ['souffle', [42, 40, 72]], ['clafoutis', [40, 40, 62]], ['spotted dick', [40, 28, 74]],
  ['syllabub', [44, 14, 92]], ['posset', [48, 40, 84]], ['zabaglione', [46, 60, 74]],
  ['sabayon', [46, 58, 74]], ['ganache', [20, 30, 20]], ['bonbon', [24, 34, 28]],
  ['candy floss', [330, 52, 84]], ['lollipop', [348, 66, 60]], ['jelly', [348, 60, 50]],
  ['gummy', [10, 70, 55]], ['sundae', [36, 34, 72]], ['milkshake', [36, 34, 80]],
  ['beignet', [40, 36, 74]], ['zeppole', [38, 40, 70]], ['loukoumades', [32, 56, 50]],
  ['granita', [44, 30, 70]], ['shaved ice', [200, 30, 88]], ['bingsu', [40, 16, 90]],
  ['kakigori', [200, 36, 86]], ['ice lolly', [340, 60, 58]], ['soft serve', [44, 22, 88]],
  ['frangipane', [38, 40, 68]], ['battenberg', [340, 40, 76]], ['yule log', [22, 32, 24]],
  ['buche de noel', [22, 32, 24]], ['choc ice', [24, 30, 22]],
  // Breakfast.
  ['cereal', [34, 44, 56]], ['muesli', [36, 34, 62]], ['bircher', [40, 22, 80]],
  ['smoothie bowl', [326, 40, 62]], ['acai', [288, 30, 34]], ['overnight oats', [40, 20, 82]],
  ['buddha bowl', [70, 36, 46]], ['grain bowl', [40, 34, 60]], ['fish burger', [38, 46, 60]],
  ['veggie burger', [26, 34, 38]], ['hush puppy', [36, 50, 58]], ['croquette', [34, 48, 60]],
  ['caper', [86, 24, 34]], ['caperberry', [86, 26, 38]], ['piccalilli', [48, 70, 56]],
  ['horseradish', [44, 10, 92]],
  // The classical sauces, which are a ladder of browns from a veloute down to a
  // demi glace, and the sharp cold ones, which are not brown at all.
  ['veloute', [44, 30, 78]], ['espagnole', [22, 44, 22]], ['demi glace', [20, 44, 18]],
  ['bordelaise', [352, 40, 22]], ['chasseur', [18, 42, 32]], ['au poivre', [28, 30, 28]],
  ['cheese sauce', [44, 56, 64]], ['ranch', [44, 16, 92]], ['thousand island', [10, 52, 64]],
  ['nuoc cham', [34, 44, 44]], ['doubanjiang', [8, 58, 32]], ['xo sauce', [14, 50, 32]],
  ['fish sauce', [32, 50, 34]], ['yuzu kosho', [70, 44, 44]],
  // Herbs by leaf, and whole spices by the colour of the spice itself rather
  // than of the powder it grinds down to.
  ['oregano', [92, 30, 38]], ['rosemary', [130, 22, 34]], ['sage', [96, 16, 52]],
  ['bay leaf', [116, 26, 28]], ['perilla', [300, 26, 30]], ['galangal', [40, 22, 72]],
  ['cinnamon stick', [22, 44, 34]], ['star anise', [22, 40, 26]], ['cardamom', [66, 24, 58]],
  ['clove', [18, 40, 22]], ['nutmeg', [26, 40, 38]],
  // The plating vocabulary. Most of these are CARRIERS below -- a smear is the
  // colour of what was smeared -- but a chef who writes nothing else still has
  // to get something that is not a lottery hue.
  ['espuma', [44, 14, 93]], ['savoury air', [44, 12, 94]], ['snow', [0, 0, 96]],
  ['dust', [30, 30, 50]],
  ['edible soil', [22, 26, 20]], ['smear', [30, 40, 40]], ['swoosh', [30, 40, 40]],
  ['drizzle', [34, 44, 42]], ['tower', [34, 36, 52]], ['medallion', [8, 40, 36]],
  ['paupiette', [32, 34, 58]], ['mille feuille', [40, 36, 72]], ['brunoise', [40, 34, 56]],
  ['chiffonade', [96, 36, 40]],
  // Dairy and fats.
  ['queso fresco', [44, 10, 92]], ['cotija', [44, 12, 90]], ['cheese wheel', [46, 40, 76]],
  ['cheese cube', [46, 44, 72]], ['wensleydale', [46, 20, 88]], ['red leicester', [24, 64, 54]],
  ['fontina', [44, 36, 78]], ['ghee', [44, 68, 60]], ['lard', [42, 12, 92]],
  // The rest of the fish counter, and the roes, which are the brightest thing
  // that ever comes off it.
  ['red mullet', [8, 54, 52]], ['john dory', [40, 16, 82]], ['megrim', [40, 14, 84]],
  ['coley', [36, 14, 70]], ['gurnard', [10, 44, 50]], ['sprat', [40, 18, 78]],
  ['arctic char', [14, 60, 62]], ['barramundi', [40, 14, 86]], ['marlin', [340, 26, 50]],
  ['elver', [40, 12, 86]], ['roe', [18, 64, 56]], ['bottarga', [30, 64, 48]],
  ['lumpfish roe', [0, 0, 12]], ['periwinkle', [30, 18, 44]], ['crawfish', [10, 58, 48]],
]

// Longest key first, so a specific match beats a generic substring, and keys
// normalised the same way a typed name will be.
const SORTED = table([...INGREDIENTS, ...WORLD_COLOURS, ...KITCHEN_COLOURS, ...MENU_COLOURS])

// A key found at the start of a word rather than buried inside one, so that a
// flambee is not made of lamb. Kept in step with the same rule in match.ts.
function word(name: string, key: string) {
  let i = name.indexOf(key)
  while (i >= 0) {
    if (i === 0 || name[i - 1] === ' ') return true
    i = name.indexOf(key, i + 1)
  }
  return false
}

/** Every ingredient the colour table names, in the order it lists them. The texture library is seeded from this. */
export const KNOWN_INGREDIENTS: string[] = INGREDIENTS.map(([key]) => key)

export function hashHue(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return h % 24
}

// Deliberately NOT the head-noun rule the shape table uses. What a component IS
// is grammatical -- "tomato soup" is a soup -- but what colour it is comes from
// whatever it is mostly made of, and in a dish name that is usually the
// qualifier: a cauliflower soup is white, not soup-coloured. So colour stays on
// longest-match-anywhere, and compound dishes whose sauce dominates the bowl get
// their own key above.
// Words that name a preparation rather than an ingredient. They carry no colour
// of their own: a puree is the colour of what went into it. They need calling
// out because longest-match-anywhere otherwise lets them win on length alone --
// "puree" is longer than "pea", which is how a pea puree came out bone white.
const CARRIERS = new Set([
  'puree', 'purée', 'mash', 'cream', 'foam', 'gel', 'espuma', 'emulsion',
  'veloute', 'velouté', 'powder', 'oil', 'custard', 'mousse',
  // A glaze is the colour of what it is a glaze of, and it is a longer word than
  // most of what it is made from: giving it a colour of its own turned a soy
  // glaze the colour of a honey one.
  'glaze',
  // The plating words from the fourth audit are carriers for the same reason and
  // are longer than almost anything they are made of: a swoosh of romesco is
  // romesco-coloured, a beef medallion is beef, and "quenelle" is a longer word
  // than every vegetable that ever gets quenelled.
  'quenelle', 'smear', 'swoosh', 'drizzle', 'tower', 'medallion', 'snow', 'dust',
  'confit',
])

/** Whether the colour table recognises this name, or the colour is a fallback made up from its role and spelling. */
export function hasColour(name: string): boolean {
  for (const t of variants(name)) if (SORTED.find(([k]) => word(t, k))) return true
  return false
}

export function ingredientHsl(name: string, role: string, lighten = 0): Hsl {
  // Plurals are read the same way the shape table reads them -- a plate of
  // blueberries is the colour of a blueberry -- but the rule for WHICH key wins
  // is deliberately different, and stays here.
  let hit: [string, Hsl] | undefined
  for (const t of variants(name)) {
    hit = SORTED.find(([k]) => word(t, k))
    if (hit && CARRIERS.has(hit[0])) {
      // Take the colour off whatever is left once the preparation is removed --
      // but only if what is left names something. Plain "cream" is still cream.
      const rest = t.replace(hit[0], ' ')
      hit = SORTED.find(([k]) => !CARRIERS.has(k) && word(rest, k)) ?? hit
    }
    if (hit) break
  }
  if (hit) {
    const [h, s, l] = hit[1]
    return [h, s, Math.min(92, l + lighten)]
  }
  // Nothing recognised: fall back to the role's hue with a little variation so
  // two unknown supports still read as different things.
  const [h, s, l] = ROLE_FILL[role] ?? ROLE_FILL.support
  return [(h + hashHue(name)) % 360, s, Math.min(88, l + lighten)]
}

export function roleHsl(role: string, name: string, lighten = 0): Hsl {
  return ingredientHsl(name, role, lighten)
}

export function hslToHex(hsl: Hsl) {
  const [r, g, b] = hslToRgb(hsl)
  const to = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')
  return `#${to(r)}${to(g)}${to(b)}`
}

// The colour an element actually renders in: a manual override if the chef set
// one, otherwise the ingredient's own colour.
export function resolveHex(name: string, role: string, override?: string) {
  if (override && /^#[0-9a-f]{6}$/i.test(override)) return override
  return hslToHex(ingredientHsl(name, role))
}

// A darker, warmer version of a colour: what a pan does to the surface of food.
// Multiplying the channels evenly would give grey meat, so red is held back and
// blue is pushed down harder, which is the direction browning actually goes.
export function shadeHex(hex: string, mul: number) {
  const v = hex.replace('#', '')
  const n = parseInt(v.length === 3 ? v.split('').map((c) => c + c).join('') : v, 16)
  const channels = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  const bias = [Math.pow(mul, 0.82), mul, Math.pow(mul, 1.22)]
  return `#${channels
    .map((c, i) => Math.round(Math.min(255, Math.max(0, c * bias[i]))).toString(16).padStart(2, '0'))
    .join('')}`
}

export function hslCss([h, s, l]: Hsl) {
  return `hsl(${h} ${s}% ${l}%)`
}

function hslToRgb([h, s, l]: Hsl): [number, number, number] {
  const S = s / 100
  const L = l / 100
  const c = (1 - Math.abs(2 * L - 1)) * S
  const hp = h / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  const [r, g, b] =
    hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x]
  const m = L - c / 2
  return [r + m, g + m, b + m]
}

// glTF baseColorFactor is linear, not sRGB.
const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))

export function hslToLinear(hsl: Hsl): [number, number, number, number] {
  const [r, g, b] = hslToRgb(hsl)
  return [toLinear(r), toLinear(g), toLinear(b), 1]
}

export function hexToLinear(hex: string): [number, number, number, number] {
  const v = hex.replace('#', '')
  const n = parseInt(v.length === 3 ? v.split('').map((c) => c + c).join('') : v, 16)
  return [toLinear(((n >> 16) & 255) / 255), toLinear(((n >> 8) & 255) / 255), toLinear((n & 255) / 255), 1]
}
