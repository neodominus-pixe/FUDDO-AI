import { VARIANTS } from './suggest-variants'
import type { Component, ComponentRole } from './types'

// Turning a dish name into a component list, offline and free.
//
// The big insight is that chefs already write dishes as component lists --
// "Duck breast, celeriac, red wine" is the ingredients. So parsing the name
// beats any recipe database for the way this field actually gets filled in.
// Named dishes ("burger", "carbonara") fall back to a small template table.

export type Suggestion = {
  components: Array<{ name: string; role: ComponentRole }>
  source: 'name' | 'template' | 'generic'
  note: string
  /** The kind of dish, when it has styles to choose from ("Pizza"), the styles, and the one in use. */
  family?: string
  variants?: string[]
  variant?: string
}

const SAUCE_WORDS = [
  'jus', 'sauce', 'ketchup', 'mayo', 'aioli', 'reduction', 'coulis', 'gel', 'dressing',
  'vinaigrette', 'salsa', 'glaze', 'gravy', 'hollandaise', 'beurre blanc', 'chimichurri',
  'romesco', 'veloute', 'velouté', 'emulsion', 'puree sauce', 'oil', 'vinegar', 'ponzu',
  'teriyaki', 'harissa', 'tahini', 'yoghurt', 'yogurt', 'creme fraiche', 'crème fraîche',
  // The rest of the world's sauces, which a chef is as likely to write as a jus.
  'pesto', 'gochujang', 'sriracha', 'raita', 'tzatziki', 'mole', 'hoisin', 'soy',
  'chutney', 'syrup', 'labneh', 'tamarind', 'nduja', 'sambal', 'ssamjang', 'ranch',
  'leche de tigre', 'dipping sauce', 'bechamel', 'béchamel', 'ragu', 'ragù',
]

const GARNISH_WORDS = [
  'micro', 'cress', 'chervil', 'dill', 'chives', 'herb', 'herbs', 'seed', 'seeds', 'sesame',
  'sprout', 'sprouts', 'petal', 'petals', 'zest', 'crumb', 'crumbs', 'dust', 'powder',
  'tuile', 'crisp', 'crisps', 'shoot', 'shoots', 'flower', 'flowers', 'parsley', 'coriander',
  'cilantro', 'basil', 'garnish', 'pepper', 'salt', 'flake', 'flakes',
  // Finishing touches from everywhere else, which were landing as supports and
  // getting plated at the size of a portion.
  'dukkah', 'zaatar', "za'atar", 'furikake', 'gremolata', 'sumac', 'nori', 'bonito',
  'shiso', 'mint', 'thyme', 'chive', 'dill', 'tarragon', 'icing sugar', 'sesame seeds',
  'pomegranate', 'nib', 'nibs', 'zest', 'crackling', 'croutons', 'spring onion', 'scallion',
]

const HERO_WORDS = [
  'beef', 'steak', 'duck', 'chicken', 'lamb', 'pork', 'veal', 'venison', 'salmon', 'cod',
  'tuna', 'seabass', 'sea bass', 'halibut', 'turbot', 'scallop', 'prawn', 'shrimp', 'lobster',
  'crab', 'octopus', 'patty', 'fillet', 'filet', 'breast', 'rib', 'ribs', 'belly', 'loin',
  'shank', 'tofu', 'halloumi', 'aubergine', 'eggplant', 'cauliflower', 'mushroom', 'risotto',
  'pasta', 'gnocchi', 'burger', 'egg',
  // Dishes that are their own hero: a bowl of ramen is not a support for
  // anything, and neither is a taco.
  'ramen', 'pho', 'curry', 'tagine', 'paella', 'biryani', 'rice', 'noodles', 'taco',
  'kebab', 'kofta', 'falafel', 'dumpling', 'gyoza', 'sushi', 'ceviche', 'lasagne',
  'moussaka', 'schnitzel', 'katsu', 'wings', 'ribs', 'lobster', 'monkfish', 'trout',
]

// Enough named dishes to cover what a chef is likely to type as a single word.
// Order is stack order, bottom first -- it drives how a stacked build is layered.
const TEMPLATES: Array<{ match: string[]; components: Array<[string, ComponentRole]> }> = [
  {
    match: ['schnitzel', 'jagerschnitzel', 'jägerschnitzel', 'rahmschnitzel', 'cordon bleu', 'schnitzel holstein'],
    components: [['Wiener schnitzel', 'hero'], ['Potato salad', 'support'], ['Lemon wedge', 'support'], ['Lingonberry sauce', 'sauce'], ['Parsley', 'garnish']],
  },
  {
    match: ['sauerbraten', 'rouladen', 'rinderroulade', 'schweinshaxe', 'eisbein', 'schweinebraten', 'kassler', 'pork knuckle'],
    components: [['Sauerbraten', 'hero'], ['Red cabbage', 'support'], ['Potato dumplings', 'support'], ['Gravy', 'sauce'], ['Parsley', 'garnish']],
  },
  {
    match: ['spaetzle', 'spatzle', 'spätzle', 'kasespatzle', 'käsespätzle', 'knodel', 'knödel', 'maultaschen', 'flammkuchen', 'kartoffelsalat', 'soft pretzel'],
    components: [['Spaetzle', 'hero'], ['Emmental', 'support'], ['Crispy onions', 'support'], ['Chives', 'garnish']],
  },
  {
    match: ['currywurst', 'bratkartoffeln', 'frikadellen', 'frikadelle', 'leberkase', 'leberkäse', 'weisswurst', 'weißwurst'],
    components: [['Bratwurst', 'hero'], ['Chips', 'support'], ['Curry ketchup', 'sauce'], ['Curry powder', 'garnish']],
  },
  {
    match: ['pierogi', 'pierogies', 'vareniki', 'varenyky', 'pelmeni', 'uszka', 'pirozhki', 'piroshki'],
    components: [['Pierogi', 'hero'], ['Fried onions', 'support'], ['Sour cream', 'sauce'], ['Chives', 'garnish']],
  },
  {
    match: ['borscht', 'borsch', 'barszcz', 'solyanka', 'shchi', 'zurek', 'żurek', 'okroshka', 'cabbage soup'],
    components: [['Borscht', 'hero'], ['Rye bread', 'support'], ['Sour cream', 'sauce'], ['Dill', 'garnish']],
  },
  {
    match: ['stroganoff', 'strogonoff'],
    components: [['Beef stroganoff', 'hero'], ['Egg noodles', 'support'], ['Sour cream', 'sauce'], ['Paprika', 'garnish'], ['Parsley', 'garnish']],
  },
  {
    match: ['cabbage roll', 'golabki', 'gołąbki', 'holubtsi', 'sarma', 'halupki', 'stuffed cabbage'],
    components: [['Cabbage rolls', 'hero'], ['Mashed potato', 'support'], ['Tomato sauce', 'sauce'], ['Dill', 'garnish']],
  },
  {
    match: ['bigos', 'hunters stew', 'kielbasa', 'kotlet schabowy', 'schabowy', 'langos', 'lángos', 'placki', 'potato pancake', 'paprikash'],
    components: [['Bigos', 'hero'], ['Rye bread', 'support'], ['Mustard', 'sauce'], ['Parsley', 'garnish']],
  },
  {
    match: ['blini', 'blinis', 'syrniki', 'draniki', 'oladyi'],
    components: [['Blini', 'hero'], ['Smoked salmon', 'support'], ['Sour cream', 'sauce'], ['Dill', 'garnish'], ['Caviar', 'garnish']],
  },
  {
    match: ['khachapuri', 'plov', 'shashlik', 'shashlyk', 'khinkali', 'lagman'],
    components: [['Khachapuri', 'hero'], ['Egg yolk', 'support'], ['Butter', 'sauce'], ['Parsley', 'garnish']],
  },
  {
    match: ['strudel', 'apfelstrudel', 'kaiserschmarrn', 'berliner', 'sachertorte', 'bienenstich', 'lebkuchen'],
    components: [['Apple strudel', 'hero'], ['Whipped cream', 'support'], ['Vanilla custard', 'sauce'], ['Icing sugar', 'garnish']],
  },
  {
    match: ['bbq ribs', 'barbecue ribs', 'baby back ribs', 'spare ribs', 'pork ribs', 'rack of ribs', 'st louis ribs', 'bbq platter', 'bbq plate', 'brisket', 'pulled pork', 'burnt ends', 'smokehouse', 'texas bbq', 'beef rib'],
    components: [['Pork ribs', 'hero'], ['Coleslaw', 'support'], ['Corn on the cob', 'support'], ['Cornbread', 'support'], ['BBQ sauce', 'sauce'], ['Parsley', 'garnish']],
  },
  {
    match: ['meatloaf', 'meat loaf', 'chicken fried steak', 'country fried steak', 'salisbury steak'],
    components: [['Meatloaf', 'hero'], ['Mashed potato', 'support'], ['Green beans', 'support'], ['Brown gravy', 'sauce'], ['Parsley', 'garnish']],
  },
  {
    match: ['chicken and waffles', 'chicken & waffles'],
    components: [['Waffles', 'support'], ['Fried chicken', 'hero'], ['Butter', 'support'], ['Maple syrup', 'sauce'], ['Chives', 'garnish']],
  },
  {
    match: ['onion rings', 'loaded fries', 'cheese fries', 'mozzarella sticks', 'cheese sticks', 'cornbread', 'fried pickles', 'poutine', 'tater tots', 'jalapeno poppers', 'jalapeño poppers'],
    components: [['Onion rings', 'hero'], ['Ranch dressing', 'sauce'], ['Ketchup', 'sauce'], ['Parsley', 'garnish']],
  },
  {
    match: ['clam chowder', 'chowder', 'chili con carne', 'beef chili', 'texas chili', 'turkey chili'],
    components: [['Clam chowder', 'hero'], ['Oyster crackers', 'support'], ['Bacon', 'garnish'], ['Chives', 'garnish']],
  },
  {
    match: ['crab cakes', 'crab cake', 'shrimp cocktail', 'fried shrimp', 'coconut shrimp', 'popcorn shrimp'],
    components: [['Crab cakes', 'hero'], ['Coleslaw', 'support'], ['Remoulade', 'sauce'], ['Lemon wedge', 'garnish']],
  },
  {
    match: ['pecan pie', 'key lime pie', 'peach cobbler', 'cobbler', "s'mores", 'smores', 'whoopie pie', 'banana pudding', 'funnel cake'],
    components: [['Pecan pie', 'hero'], ['Whipped cream', 'support'], ['Maple syrup', 'sauce'], ['Pecans', 'garnish']],
  },
  {
    match: ['fish cake', 'tod mun'],
    components: [['Thai fish cakes', 'hero'], ['Cucumber', 'support'], ['Sweet chilli sauce', 'sauce'], ['Coriander', 'garnish']],
  },
  {
    match: ['ice cream', 'icecream', 'gelato', 'sorbet', 'sundae', 'banana split', 'knickerbocker', 'peach melba', 'baked alaska'],
    components: [['Vanilla ice cream', 'hero'], ['Wafer', 'support'], ['Chocolate sauce', 'sauce'], ['Cherry', 'garnish']],
  },
  {
    match: ['breakfast', 'full english'],
    components: [
      ['Fried egg', 'hero'], ['Sausages', 'support'], ['Bacon', 'support'], ['Baked beans', 'support'],
      ['Toast', 'support'], ['Mushrooms', 'support'], ['Tomato', 'support'],
    ],
  },
  {
    match: ['pot pie', 'steak and ale'],
    components: [
      ['Steak and ale pie', 'hero'], ['Mashed potato', 'support'], ['Peas', 'support'],
      ['Gravy', 'sauce'], ['Thyme', 'garnish'],
    ],
  },
  {
    match: ['stew', 'casserole', 'hotpot'],
    components: [
      ['Beef stew', 'hero'], ['Mashed potato', 'support'], ['Glazed carrots', 'support'],
      ['Stew gravy', 'sauce'], ['Parsley', 'garnish'],
    ],
  },
  {
    match: ['fried rice', 'egg fried rice'],
    components: [
      ['Egg fried rice', 'hero'], ['Peas', 'support'], ['Carrot', 'support'],
      ['Soy sauce', 'sauce'], ['Spring onion', 'garnish'],
    ],
  },
  {
    match: ['wings', 'buffalo wing', 'chicken wing'],
    components: [
      ['Buffalo wings', 'hero'], ['Celery sticks', 'support'], ['Carrot sticks', 'support'],
      ['Blue cheese dip', 'sauce'], ['Chives', 'garnish'],
    ],
  },
  {
    match: ['sandwich', 'sarnie', 'toastie', 'panini', 'reuben', 'blt', 'banh mi', 'croque', 'hoagie'],
    components: [
      ['Toasted bread', 'support'], ['Chicken breast', 'hero'], ['Bacon', 'support'], ['Lettuce', 'support'],
      ['Tomato', 'support'], ['Toasted bread', 'support'], ['Mayo', 'sauce'],
    ],
  },
  {
    match: ['burger', 'cheeseburger', 'hamburger'],
    components: [
      ['Bottom bun', 'support'], ['Beef patty', 'hero'], ['Cheddar', 'support'],
      ['Tomato', 'support'], ['Lettuce', 'support'], ['Top bun', 'support'],
      ['Ketchup', 'sauce'], ['Sesame seed', 'garnish'],
    ],
  },
  {
    match: ['pizza', 'margherita'],
    components: [
      ['Pizza base', 'hero'], ['Mozzarella', 'support'],
      ['Tomato sauce', 'sauce'], ['Basil leaf', 'garnish'],
    ],
  },
  {
    match: ['carbonara', 'pasta', 'spaghetti', 'tagliatelle'],
    components: [
      ['Pasta', 'hero'], ['Guanciale', 'support'], ['Pecorino', 'support'],
      ['Egg yolk sauce', 'sauce'], ['Cracked pepper', 'garnish'],
    ],
  },
  {
    match: ['risotto'],
    components: [
      ['Risotto', 'hero'], ['Parmesan', 'support'],
      ['Herb oil', 'sauce'], ['Micro herbs', 'garnish'],
    ],
  },
  {
    match: ['steak', 'ribeye', 'sirloin', 'fillet steak'],
    components: [
      ['Steak', 'hero'], ['Pomme puree', 'support'], ['Charred greens', 'support'],
      ['Red wine jus', 'sauce'], ['Thyme', 'garnish'],
    ],
  },
  {
    match: ['salmon', 'seabass', 'sea bass', 'cod', 'halibut'],
    components: [
      ['Fish fillet', 'hero'], ['Crushed potato', 'support'], ['Seasonal greens', 'support'],
      ['Beurre blanc', 'sauce'], ['Dill', 'garnish'],
    ],
  },
  {
    match: ['salad', 'caesar'],
    components: [
      ['Leaves', 'hero'], ['Tomato', 'support'], ['Cucumber', 'support'],
      ['Vinaigrette', 'sauce'], ['Toasted seeds', 'garnish'],
    ],
  },
  {
    match: ['soup', 'bisque', 'veloute', 'velouté'],
    components: [
      ['Soup', 'hero'], ['Croutons', 'support'],
      ['Cream swirl', 'sauce'], ['Chives', 'garnish'],
    ],
  },
  {
    match: ['curry', 'tikka'],
    components: [
      ['Curry', 'hero'], ['Rice', 'support'], ['Naan', 'support'],
      ['Raita', 'sauce'], ['Coriander', 'garnish'],
    ],
  },
  {
    match: ['duck'],
    components: [
      ['Seared duck breast', 'hero'], ['Celeriac puree', 'support'], ['Charred baby leek', 'support'],
      ['Red wine jus', 'sauce'], ['Micro chervil', 'garnish'],
    ],
  },
  {
    match: ['chicken', 'poussin'],
    components: [
      ['Roast chicken', 'hero'], ['Potato', 'support'], ['Greens', 'support'],
      ['Pan gravy', 'sauce'], ['Thyme', 'garnish'],
    ],
  },
  {
    match: ['taco', 'al pastor', 'barbacoa', 'carne asada'],
    components: [
      ['Corn tortilla', 'support'], ['Barbacoa beef', 'hero'], ['Pickled red onion', 'support'],
      ['Salsa verde', 'sauce'], ['Coriander', 'garnish'],
    ],
  },
  {
    match: ['ramen', 'tonkotsu'],
    components: [
      ['Ramen broth', 'hero'], ['Ramen noodles', 'support'], ['Chashu pork', 'support'],
      ['Soft boiled egg', 'support'], ['Chilli oil', 'sauce'], ['Spring onion', 'garnish'],
    ],
  },
  {
    match: ['pho', 'bun bo'],
    components: [
      ['Beef broth', 'hero'], ['Rice noodles', 'support'], ['Sliced beef', 'support'],
      ['Bean sprouts', 'support'], ['Hoisin', 'sauce'], ['Thai basil', 'garnish'],
    ],
  },
  {
    match: ['pad thai', 'pad see ew', 'chow mein', 'lo mein', 'yakisoba', 'noodles'],
    components: [
      ['Rice noodles', 'hero'], ['King prawns', 'support'], ['Bean sprouts', 'support'],
      ['Tamarind sauce', 'sauce'], ['Crushed peanuts', 'garnish'],
    ],
  },
  {
    match: ['sushi', 'maki', 'sashimi'],
    components: [
      ['Nigiri rice', 'hero'], ['Salmon sashimi', 'support'], ['Pickled ginger', 'support'],
      ['Soy glaze', 'sauce'], ['Sesame seeds', 'garnish'],
    ],
  },
  {
    match: ['poke', 'poke bowl'],
    components: [
      ['Sushi rice', 'hero'], ['Tuna', 'support'], ['Avocado', 'support'],
      ['Edamame', 'support'], ['Ponzu', 'sauce'], ['Sesame seeds', 'garnish'],
    ],
  },
  {
    match: ['bibimbap', 'bulgogi'],
    components: [
      ['Steamed rice', 'hero'], ['Bulgogi beef', 'support'], ['Kimchi', 'support'],
      ['Fried egg', 'support'], ['Gochujang', 'sauce'], ['Sesame seeds', 'garnish'],
    ],
  },
  {
    match: ['biryani', 'pilaf', 'pilau'],
    components: [
      ['Biryani rice', 'hero'], ['Chicken thigh', 'support'], ['Crispy shallots', 'support'],
      ['Raita', 'sauce'], ['Coriander', 'garnish'],
    ],
  },
  {
    match: ['dumpling', 'gyoza', 'dim sum', 'momo', 'wonton'],
    components: [
      ['Gyoza', 'hero'], ['Pickled cabbage', 'support'],
      ['Soy dipping sauce', 'sauce'], ['Spring onion', 'garnish'],
    ],
  },
  {
    match: ['paella'],
    components: [
      ['Paella rice', 'hero'], ['King prawns', 'support'], ['Mussels', 'support'],
      ['Chorizo', 'support'], ['Aioli', 'sauce'], ['Lemon wedge', 'garnish'],
    ],
  },
  {
    match: ['fish and chips', 'fish supper'],
    components: [
      ['Battered cod', 'hero'], ['Chips', 'support'], ['Mushy peas', 'support'],
      ['Tartare sauce', 'sauce'], ['Lemon wedge', 'garnish'],
    ],
  },
  {
    match: ['roast', 'sunday roast', 'roast dinner'],
    components: [
      ['Roast beef', 'hero'], ['Roast potatoes', 'support'], ['Yorkshire pudding', 'support'],
      ['Seasonal greens', 'support'], ['Gravy', 'sauce'], ['Thyme', 'garnish'],
    ],
  },
  {
    match: ['kebab', 'shawarma', 'souvlaki', 'kofta', 'gyro'],
    components: [
      ['Lamb kofta', 'hero'], ['Flatbread', 'support'], ['Pickled red onion', 'support'],
      ['Tzatziki', 'sauce'], ['Parsley', 'garnish'],
    ],
  },
  {
    match: ['mezze', 'meze', 'falafel'],
    components: [
      ['Falafel', 'hero'], ['Hummus', 'support'], ['Flatbread', 'support'],
      ['Tahini', 'sauce'], ['Sumac', 'garnish'],
    ],
  },
  {
    match: ['shakshuka', 'huevos rancheros'],
    components: [
      ['Tomato sauce', 'hero'], ['Poached egg', 'support'], ['Feta', 'support'],
      ['Chilli oil', 'sauce'], ['Coriander', 'garnish'],
    ],
  },
  {
    match: ['pancakes', 'waffles', 'french toast', 'brunch'],
    components: [
      ['Pancakes', 'hero'], ['Berries', 'support'], ['Whipped butter', 'support'],
      ['Maple syrup', 'sauce'], ['Icing sugar', 'garnish'],
    ],
  },
  {
    match: ['ceviche', 'tiradito'],
    components: [
      ['Sea bass', 'hero'], ['Sweet potato', 'support'], ['Red onion', 'support'],
      ['Leche de tigre', 'sauce'], ['Coriander', 'garnish'],
    ],
  },
  {
    match: ['lasagne', 'moussaka', 'parmigiana'],
    components: [
      ['Lasagne', 'hero'], ['Bechamel', 'support'], ['Ragu', 'sauce'], ['Basil', 'garnish'],
    ],
  },
  {
    match: ['gnocchi'],
    components: [['Gnocchi', 'hero'], ['Cherry tomatoes', 'support'], ['Tomato sauce', 'sauce'], ['Basil leaf', 'garnish']],
  },
  {
    match: ['ravioli', 'tortellini', 'agnolotti'],
    components: [['Ravioli', 'hero'], ['Spinach', 'support'], ['Brown butter', 'sauce'], ['Sage', 'garnish']],
  },
  {
    match: ['bruschetta', 'crostini'],
    components: [['Toasted sourdough', 'support'], ['Tomato', 'hero'], ['Olive oil', 'sauce'], ['Basil leaf', 'garnish']],
  },
  {
    match: ['arancini'],
    components: [['Arancini', 'hero'], ['Mozzarella', 'support'], ['Tomato sauce', 'sauce'], ['Basil leaf', 'garnish']],
  },
  {
    match: ['osso buco', 'ossobuco'],
    components: [['Osso buco', 'hero'], ['Risotto', 'support'], ['Stew gravy', 'sauce'], ['Gremolata', 'garnish']],
  },
  {
    match: ['saltimbocca'],
    components: [['Veal escalope', 'hero'], ['Prosciutto', 'support'], ['Spinach', 'support'], ['White wine sauce', 'sauce'], ['Sage', 'garnish']],
  },
  {
    match: ['calzone'],
    components: [['Calzone', 'hero'], ['Ham', 'support'], ['Tomato sauce', 'sauce'], ['Basil leaf', 'garnish']],
  },
  {
    match: ['bowl'],
    components: [['Quinoa', 'hero'], ['Sweet potato', 'support'], ['Chickpeas', 'support'], ['Avocado', 'support'], ['Kale', 'support'], ['Tahini', 'sauce'], ['Sesame seeds', 'garnish']],
  },
  {
    match: ['seafood platter', 'fruits de mer', 'seafood'],
    components: [['Oysters', 'hero'], ['King prawns', 'support'], ['Crab', 'support'], ['Mussels', 'support'], ['Cocktail sauce', 'sauce'], ['Lemon wedge', 'garnish']],
  },
  {
    match: ['oyster'],
    components: [['Oysters', 'hero'], ['Crushed ice', 'support'], ['Shallot vinegar', 'sauce'], ['Lemon wedge', 'garnish']],
  },
  {
    match: ['mussel', 'moules'],
    components: [['Mussels', 'hero'], ['Chips', 'support'], ['White wine sauce', 'sauce'], ['Parsley', 'garnish']],
  },
  {
    match: ['lobster'],
    components: [['Lobster tail', 'hero'], ['Asparagus', 'support'], ['Garlic butter', 'sauce'], ['Lemon wedge', 'garnish']],
  },
  {
    match: ['crab'],
    components: [['Crab cakes', 'hero'], ['Slaw', 'support'], ['Lemon mayo', 'sauce'], ['Chives', 'garnish']],
  },
  {
    match: ['prawn', 'shrimp', 'gambas'],
    components: [['King prawns', 'hero'], ['Toasted bread', 'support'], ['Garlic butter', 'sauce'], ['Red chilli', 'garnish'], ['Parsley', 'garnish']],
  },
  {
    match: ['scallop'],
    components: [['Seared scallops', 'hero'], ['Pea puree', 'support'], ['Crispy bacon', 'support'], ['Brown butter', 'sauce'], ['Micro herbs', 'garnish']],
  },
  {
    match: ['calamari', 'squid'],
    components: [['Fried calamari', 'hero'], ['Lemon wedge', 'support'], ['Aioli', 'sauce'], ['Parsley', 'garnish']],
  },
  {
    match: ['octopus', 'pulpo'],
    components: [['Octopus', 'hero'], ['Boiled potatoes', 'support'], ['Paprika oil', 'sauce'], ['Sea salt', 'garnish']],
  },
  {
    match: ['charcuterie'],
    components: [['Prosciutto', 'hero'], ['Salami', 'support'], ['Chorizo', 'support'], ['Cornichons', 'support'], ['Olives', 'support'], ['Baguette', 'support'], ['Dijon mustard', 'sauce'], ['Grapes', 'garnish']],
  },
  {
    match: ['cheese board', 'cheeseboard'],
    components: [['Cheddar', 'hero'], ['Brie', 'support'], ['Stilton', 'support'], ['Crackers', 'support'], ['Grapes', 'support'], ['Chutney', 'sauce'], ['Walnuts', 'garnish']],
  },
  {
    match: ['gateau'],
    components: [['Victoria sponge', 'hero'], ['Strawberries', 'support'], ['Whipped cream', 'support'], ['Strawberry jam', 'sauce'], ['Icing sugar', 'garnish']],
  },
  {
    match: ['baking', 'pastries'],
    components: [['Croissant', 'hero'], ['Pain au chocolat', 'support'], ['Butter', 'support'], ['Jam', 'sauce'], ['Icing sugar', 'garnish']],
  },
  {
    match: ['hot dog', 'hotdog', 'corn dog', 'frankfurter', 'bratwurst'],
    components: [['Hot dog bun', 'support'], ['Frankfurter', 'hero'], ['Fried onions', 'support'], ['Relish', 'support'], ['Mustard', 'sauce']],
  },
  {
    match: ['nacho'],
    components: [['Tortilla chips', 'hero'], ['Cheddar', 'support'], ['Black beans', 'support'], ['Jalapenos', 'support'], ['Guacamole', 'support'], ['Salsa', 'sauce'], ['Coriander', 'garnish']],
  },
  {
    match: ['guacamole', 'tzatziki', 'baba ganoush', 'hummus', 'dips', 'crudites', 'crudités'],
    components: [['Guacamole', 'hero'], ['Tortilla chips', 'support'], ['Lime wedge', 'support'], ['Coriander', 'garnish']],
  },
  {
    match: ['smoothie'],
    components: [['Berry smoothie', 'hero'], ['Blueberries', 'support'], ['Mint', 'garnish']],
  },
  {
    match: ['milkshake', 'shake'],
    components: [['Vanilla milkshake', 'hero'], ['Whipped cream', 'support'], ['Cherry', 'garnish']],
  },
  {
    match: ['mojito', 'margarita', 'old fashioned', 'martini', 'spritz', 'negroni', 'cosmopolitan', 'pina colada', 'gin and tonic', 'bloody mary', 'whisky sour', 'whiskey sour'],
    components: [['Mojito', 'hero'], ['Lime wedge', 'support'], ['Crushed ice', 'support'], ['Mint', 'garnish']],
  },
  {
    match: ['espresso', 'coffee', 'latte', 'cappuccino', 'flat white', 'americano', 'mocha', 'affogato', 'hot chocolate', 'matcha', 'chai'],
    components: [['Cappuccino', 'hero'], ['Biscotti', 'support'], ['Cocoa powder', 'garnish']],
  },
  {
    match: ['lemonade', 'iced tea', 'orange juice', 'juice', 'bubble tea', 'kombucha'],
    components: [['Lemonade', 'hero'], ['Lemon wedge', 'support'], ['Crushed ice', 'support'], ['Mint', 'garnish']],
  },
  {
    match: ['curry sides', 'naan', 'samosa', 'bhaji', 'poppadom'],
    components: [['Basmati rice', 'hero'], ['Garlic naan', 'support'], ['Raita', 'sauce'], ['Coriander', 'garnish']],
  },
  {
    match: ['tapas', 'pintxos', 'patatas bravas', 'croquetas', 'padron'],
    components: [['Patatas bravas', 'hero'], ['Jamon croquetas', 'support'], ['Padron peppers', 'support'], ['Jamon iberico', 'support'], ['Manchego', 'support'], ['Olives', 'support'], ['Bravas sauce', 'sauce'], ['Sea salt', 'garnish']],
  },
  {
    match: ['enchilada'],
    components: [['Enchiladas', 'hero'], ['Chicken', 'support'], ['Cheddar', 'support'], ['Red enchilada sauce', 'sauce'], ['Sour cream', 'support'], ['Coriander', 'garnish']],
  },
  {
    match: ['burrito'],
    components: [['Burrito', 'hero'], ['Beef', 'support'], ['Rice', 'support'], ['Black beans', 'support'], ['Guacamole', 'support'], ['Salsa', 'sauce'], ['Coriander', 'garnish']],
  },
  {
    match: ['fajita'],
    components: [['Chicken fajita', 'hero'], ['Peppers', 'support'], ['Onions', 'support'], ['Flour tortillas', 'support'], ['Guacamole', 'support'], ['Sour cream', 'sauce'], ['Lime wedge', 'garnish']],
  },
  {
    match: ['quesadilla'],
    components: [['Cheese quesadilla', 'hero'], ['Guacamole', 'support'], ['Salsa', 'sauce'], ['Sour cream', 'support'], ['Coriander', 'garnish']],
  },
  {
    match: ['chilaquiles'],
    components: [['Chilaquiles', 'hero'], ['Fried egg', 'support'], ['Queso fresco', 'support'], ['Red salsa', 'sauce'], ['Coriander', 'garnish']],
  },
  {
    match: ['mole poblano'],
    components: [['Chicken', 'hero'], ['Rice', 'support'], ['Corn tortillas', 'support'], ['Mole sauce', 'sauce'], ['Sesame seeds', 'garnish']],
  },
  {
    match: ['tamale'],
    components: [['Tamales', 'hero'], ['Salsa roja', 'sauce'], ['Sour cream', 'support'], ['Coriander', 'garnish']],
  },
  {
    match: ['elote', 'street corn', 'esquites'],
    components: [['Corn on the cob', 'hero'], ['Cotija', 'support'], ['Mayo', 'sauce'], ['Paprika', 'garnish'], ['Lime wedge', 'garnish']],
  },
  {
    match: ['pozole'],
    components: [['Pozole', 'hero'], ['Pork', 'support'], ['Radish', 'support'], ['Shredded cabbage', 'support'], ['Lime wedge', 'garnish'], ['Oregano', 'garnish']],
  },
  {
    match: ['satay'],
    components: [['Chicken satay', 'hero'], ['Cucumber', 'support'], ['Jasmine rice', 'support'], ['Peanut sauce', 'sauce'], ['Coriander', 'garnish']],
  },
  {
    match: ['som tam', 'larb', 'laab', 'thai salad'],
    components: [['Green papaya salad', 'hero'], ['Cherry tomatoes', 'support'], ['Green beans', 'support'], ['Lime dressing', 'sauce'], ['Peanuts', 'garnish']],
  },
  {
    match: ['khao soi'],
    components: [['Khao soi broth', 'hero'], ['Egg noodles', 'support'], ['Chicken', 'support'], ['Pickled mustard greens', 'support'], ['Crispy noodles', 'garnish'], ['Lime wedge', 'garnish']],
  },
  {
    match: ['mango sticky rice'],
    components: [['Sticky rice', 'hero'], ['Mango', 'support'], ['Coconut cream', 'sauce'], ['Sesame seeds', 'garnish']],
  },
  {
    match: ['spring roll', 'egg roll', 'summer roll', 'lumpia'],
    components: [['Spring rolls', 'hero'], ['Lettuce', 'support'], ['Sweet chilli sauce', 'sauce'], ['Coriander', 'garnish']],
  },
  {
    match: ['sweet and sour'],
    components: [['Sweet and sour chicken', 'hero'], ['Peppers', 'support'], ['Pineapple', 'support'], ['Steamed rice', 'support'], ['Sweet and sour sauce', 'sauce'], ['Spring onion', 'garnish']],
  },
  {
    match: ['kung pao'],
    components: [['Kung pao chicken', 'hero'], ['Peppers', 'support'], ['Steamed rice', 'support'], ['Peanuts', 'garnish'], ['Red chilli', 'garnish']],
  },
  {
    match: ['mapo tofu', 'mapo'],
    components: [['Mapo tofu', 'hero'], ['Minced pork', 'support'], ['Steamed rice', 'support'], ['Chilli oil', 'sauce'], ['Spring onion', 'garnish']],
  },
  {
    match: ['char siu'],
    components: [['Char siu', 'hero'], ['Steamed rice', 'support'], ['Pak choi', 'support'], ['Hoisin', 'sauce'], ['Spring onion', 'garnish']],
  },
  {
    match: ['peking duck', 'crispy duck', 'aromatic duck'],
    components: [['Crispy duck', 'hero'], ['Pancakes', 'support'], ['Cucumber', 'support'], ['Spring onion', 'support'], ['Hoisin', 'sauce']],
  },
  {
    match: ["general tso", 'beef and broccoli', 'black bean', 'orange chicken', 'lemon chicken', 'cashew chicken', 'szechuan'],
    components: [["General Tso's chicken", 'hero'], ['Broccoli', 'support'], ['Steamed rice', 'support'], ['Tso sauce', 'sauce'], ['Sesame seeds', 'garnish']],
  },
  {
    match: ['bao'],
    components: [['Bao buns', 'support'], ['Pork belly', 'hero'], ['Pickled cucumber', 'support'], ['Hoisin', 'sauce'], ['Spring onion', 'garnish']],
  },
  {
    match: ['congee', 'jook'],
    components: [['Congee', 'hero'], ['Chicken', 'support'], ['Spring onion', 'garnish'], ['Ginger', 'garnish'], ['Soy sauce', 'sauce']],
  },
  {
    match: ['hot pot', 'shabu shabu', 'sukiyaki', 'steamboat'],
    components: [['Hot pot broth', 'hero'], ['Sliced beef', 'support'], ['Tofu', 'support'], ['Mushrooms', 'support'], ['Napa cabbage', 'support'], ['Chilli oil', 'sauce'], ['Spring onion', 'garnish']],
  },
  {
    match: ['tempura'],
    components: [['Tempura prawns', 'hero'], ['Tempura vegetables', 'support'], ['Tentsuyu', 'sauce'], ['Daikon', 'garnish']],
  },
  {
    match: ['tonkatsu', 'chicken katsu', 'pork katsu', 'ebi fry', 'katsudon'],
    components: [['Pork katsu', 'hero'], ['Shredded cabbage', 'support'], ['Steamed rice', 'support'], ['Tonkatsu sauce', 'sauce'], ['Lemon wedge', 'garnish']],
  },
  {
    match: ['yakitori'],
    components: [['Chicken skewer', 'hero'], ['Spring onion', 'support'], ['Tare sauce', 'sauce'], ['Shichimi', 'garnish']],
  },
  {
    match: ['okonomiyaki', 'takoyaki'],
    components: [['Okonomiyaki', 'hero'], ['Okonomi sauce', 'sauce'], ['Kewpie mayo', 'support'], ['Bonito flakes', 'garnish'], ['Spring onion', 'garnish']],
  },
  {
    match: ['donburi', 'gyudon', 'oyakodon', 'unadon', 'tendon', 'rice bowl'],
    components: [['Steamed rice', 'hero'], ['Sliced beef', 'support'], ['Onion', 'support'], ['Dashi broth', 'sauce'], ['Spring onion', 'garnish'], ['Pickled ginger', 'garnish']],
  },
  {
    match: ['udon', 'soba'],
    components: [['Udon noodles', 'hero'], ['Fried tofu', 'support'], ['Dashi broth', 'sauce'], ['Spring onion', 'garnish']],
  },
  {
    match: ['karaage', 'onigiri', 'tamagoyaki', 'chawanmushi', 'izakaya'],
    components: [['Karaage', 'hero'], ['Shredded cabbage', 'support'], ['Lemon wedge', 'support'], ['Kewpie mayo', 'sauce'], ['Spring onion', 'garnish']],
  },
  {
    match: ['bento box', 'bento'],
    components: [['Chicken', 'hero'], ['Steamed rice', 'support'], ['Tamagoyaki', 'support'], ['Edamame', 'support'], ['Pickled ginger', 'support'], ['Teriyaki sauce', 'sauce']],
  },
  {
    match: ['teriyaki'],
    components: [['Chicken', 'hero'], ['Steamed rice', 'support'], ['Broccoli', 'support'], ['Teriyaki sauce', 'sauce'], ['Sesame seeds', 'garnish']],
  },
  {
    match: ['korean fried chicken', 'yangnyeom', 'dakgangjeong'],
    components: [['Korean fried chicken', 'hero'], ['Pickled radish', 'support'], ['Gochujang', 'sauce'], ['Sesame seeds', 'garnish'], ['Spring onion', 'garnish']],
  },
  {
    match: ['jjigae', 'kimchi stew', 'sundubu', 'budae'],
    components: [['Kimchi jjigae', 'hero'], ['Steamed rice', 'support'], ['Tofu', 'support'], ['Pork belly', 'support'], ['Spring onion', 'garnish']],
  },
  {
    match: ['japchae'],
    components: [['Japchae', 'hero'], ['Beef', 'support'], ['Spinach', 'support'], ['Carrot', 'support'], ['Sesame seeds', 'garnish']],
  },
  {
    match: ['tteokbokki', 'topokki'],
    components: [['Tteokbokki', 'hero'], ['Fish cakes', 'support'], ['Boiled egg', 'support'], ['Gochujang', 'sauce'], ['Spring onion', 'garnish']],
  },
  {
    match: ['kimbap', 'gimbap'],
    components: [['Kimbap', 'hero'], ['Pickled radish', 'support'], ['Carrot', 'support'], ['Spinach', 'support'], ['Sesame seeds', 'garnish']],
  },
  {
    match: ['korean bbq', 'galbi', 'samgyeopsal'],
    components: [['Galbi', 'hero'], ['Lettuce', 'support'], ['Kimchi', 'support'], ['Steamed rice', 'support'], ['Ssamjang', 'sauce'], ['Garlic', 'garnish']],
  },
  {
    match: ['pajeon', 'jeon', 'korean pancake'],
    components: [['Seafood pancake', 'hero'], ['Soy dipping sauce', 'sauce'], ['Spring onion', 'garnish'], ['Sesame seeds', 'garnish']],
  },
  {
    match: ['bun cha', 'bun thit nuong', 'bun nem', 'vermicelli bowl'],
    components: [['Vermicelli', 'hero'], ['Grilled pork', 'support'], ['Lettuce', 'support'], ['Pickled carrot', 'support'], ['Nuoc cham', 'sauce'], ['Mint', 'garnish']],
  },
  {
    match: ['com tam', 'broken rice'],
    components: [['Broken rice', 'hero'], ['Pork chop', 'support'], ['Fried egg', 'support'], ['Pickled carrot', 'support'], ['Nuoc cham', 'sauce'], ['Spring onion', 'garnish']],
  },
  {
    match: ['banh xeo', 'banh khot'],
    components: [['Banh xeo', 'hero'], ['King prawns', 'support'], ['Bean sprouts', 'support'], ['Lettuce', 'support'], ['Nuoc cham', 'sauce'], ['Mint', 'garnish']],
  },
  {
    match: ['dosa', 'uttapam', 'idli'],
    components: [['Dosa', 'hero'], ['Potato masala', 'support'], ['Sambar', 'support'], ['Coconut chutney', 'sauce'], ['Curry leaves', 'garnish']],
  },
  {
    match: ['tandoori'],
    components: [['Tandoori chicken', 'hero'], ['Naan', 'support'], ['Red onion', 'support'], ['Mint raita', 'sauce'], ['Lemon wedge', 'garnish']],
  },
  {
    match: ['thali'],
    components: [['Dal', 'hero'], ['Paneer curry', 'support'], ['Basmati rice', 'support'], ['Chapati', 'support'], ['Raita', 'sauce'], ['Pickles', 'garnish']],
  },
  {
    match: ['chaat', 'pani puri', 'bhel puri'],
    components: [['Samosa chaat', 'hero'], ['Chickpeas', 'support'], ['Yoghurt', 'sauce'], ['Tamarind chutney', 'sauce'], ['Coriander', 'garnish']],
  },
  {
    match: ['mixed grill', 'shish tawook', 'koobideh', 'arayes'],
    components: [['Lamb kofta', 'hero'], ['Shish tawook', 'support'], ['Rice', 'support'], ['Grilled tomato', 'support'], ['Garlic sauce', 'sauce'], ['Parsley', 'garnish']],
  },
  {
    match: ['kibbeh'],
    components: [['Kibbeh', 'hero'], ['Hummus', 'support'], ['Pickles', 'support'], ['Yoghurt', 'sauce'], ['Mint', 'garnish']],
  },
  {
    match: ['manakish', 'lahmacun', 'manakeesh'],
    components: [["Za'atar manakish", 'hero'], ['Tomato', 'support'], ['Cucumber', 'support'], ['Olives', 'support'], ['Mint', 'garnish']],
  },
  {
    match: ['koshari'],
    components: [['Koshari', 'hero'], ['Lentils', 'support'], ['Chickpeas', 'support'], ['Tomato sauce', 'sauce'], ['Crispy onions', 'garnish']],
  },
  {
    match: ['maqluba', 'mansaf', 'kabsa', 'machboos'],
    components: [['Maqluba', 'hero'], ['Chicken', 'support'], ['Aubergine', 'support'], ['Yoghurt', 'sauce'], ['Almonds', 'garnish'], ['Parsley', 'garnish']],
  },
  {
    match: ['baklava', 'knafeh', 'kunafa', 'kunefe', 'halva', 'basbousa', 'turkish delight'],
    components: [['Baklava', 'hero'], ['Pistachios', 'garnish'], ['Honey', 'sauce'], ['Vanilla ice cream', 'support']],
  },
  {
    match: ['sabich'],
    components: [['Pitta', 'support'], ['Fried aubergine', 'hero'], ['Boiled egg', 'support'], ['Hummus', 'support'], ['Tahini', 'sauce'], ['Amba', 'sauce'], ['Parsley', 'garnish']],
  },
  {
    match: ['jollof rice', 'suya', 'egusi', 'fufu', 'jollof'],
    components: [['Jollof rice', 'hero'], ['Fried chicken', 'support'], ['Fried plantain', 'support'], ['Coleslaw', 'support'], ['Scotch bonnet sauce', 'sauce']],
  },
  {
    match: ['injera', 'doro wat', 'doro wot', 'ethiopian'],
    components: [['Injera', 'support'], ['Doro wat', 'hero'], ['Misir wot', 'support'], ['Collard greens', 'support'], ['Awaze sauce', 'sauce']],
  },
  {
    match: ['peri peri', 'piri piri', 'periperi'],
    components: [['Peri peri chicken', 'hero'], ['Chips', 'support'], ['Coleslaw', 'support'], ['Peri peri sauce', 'sauce'], ['Lemon wedge', 'garnish']],
  },
  {
    match: ['bunny chow', 'bobotie', 'braai', 'malva pudding', 'boerewors'],
    components: [['Bunny chow', 'hero'], ['Chicken curry', 'support'], ['Red onion', 'support'], ['Carrot', 'support'], ['Coriander', 'garnish']],
  },
  {
    match: ['couscous', 'pastilla', 'harira'],
    components: [['Couscous', 'hero'], ['Roasted carrots', 'support'], ['Chickpeas', 'support'], ['Courgette', 'support'], ['Harissa', 'sauce'], ['Coriander', 'garnish']],
  },
  {
    match: ['jerk'],
    components: [['Jerk chicken', 'hero'], ['Rice and peas', 'support'], ['Fried plantain', 'support'], ['Scotch bonnet sauce', 'sauce'], ['Thyme', 'garnish']],
  },
  {
    match: ['ackee and saltfish', 'ackee'],
    components: [['Ackee and saltfish', 'hero'], ['Fried dumplings', 'support'], ['Fried plantain', 'support'], ['Tomato', 'support'], ['Thyme', 'garnish']],
  },
  {
    match: ['caribbean roti', 'doubles', 'dhalpuri'],
    components: [['Roti', 'support'], ['Chicken curry', 'hero'], ['Potatoes', 'support'], ['Pepper sauce', 'sauce']],
  },
  {
    match: ['plantain', 'maduros', 'tostones'],
    components: [['Fried plantain', 'hero'], ['Sour cream', 'sauce'], ['Sea salt', 'garnish']],
  },
  {
    match: ['spanakopita', 'tiropita', 'bougatsa', 'greek pie'],
    components: [['Spanakopita', 'hero'], ['Greek salad', 'support'], ['Greek yoghurt', 'sauce'], ['Dill', 'garnish']],
  },
  {
    match: ['gemista', 'dolmades', 'gigantes', 'fasolakia', 'briam'],
    components: [['Gemista', 'hero'], ['Feta', 'support'], ['Olive oil', 'sauce'], ['Oregano', 'garnish']],
  },
  {
    match: ['keftedes', 'bifteki', 'soutzoukakia'],
    components: [['Keftedes', 'hero'], ['Chips', 'support'], ['Tomato', 'support'], ['Tzatziki', 'sauce'], ['Oregano', 'garnish']],
  },
  {
    match: ['saganaki'],
    components: [['Fried cheese', 'hero'], ['Lemon wedge', 'support'], ['Honey', 'sauce'], ['Oregano', 'garnish']],
  },
  {
    match: ['loukoumades', 'galaktoboureko'],
    components: [['Loukoumades', 'hero'], ['Honey', 'sauce'], ['Cinnamon', 'garnish'], ['Walnuts', 'garnish']],
  },
  {
    match: ['iskender', 'beyti', 'testi kebab', 'adana kebab'],
    components: [['Iskender kebab', 'hero'], ['Flatbread', 'support'], ['Tomato sauce', 'sauce'], ['Yoghurt', 'sauce'], ['Parsley', 'garnish']],
  },
  {
    match: ['turkish manti'],
    components: [['Manti', 'hero'], ['Yoghurt', 'sauce'], ['Chilli oil', 'sauce'], ['Mint', 'garnish']],
  },
  {
    match: ['borek', 'sigara boregi'],
    components: [['Borek', 'hero'], ['Feta', 'support'], ['Yoghurt', 'sauce'], ['Parsley', 'garnish']],
  },
  {
    match: ['imam bayildi', 'karniyarik'],
    components: [['Imam bayildi', 'hero'], ['Rice', 'support'], ['Yoghurt', 'sauce'], ['Parsley', 'garnish']],
  },
  {
    match: ['quiche'],
    components: [['Quiche', 'hero'], ['Bacon', 'support'], ['Salad leaves', 'support'], ['Vinaigrette', 'sauce'], ['Chives', 'garnish']],
  },
  {
    match: ['escargots'],
    components: [['Escargots', 'hero'], ['Toasted bread', 'support'], ['Garlic butter', 'sauce'], ['Parsley', 'garnish']],
  },
  {
    match: ['steak tartare', 'beef tartare', 'tuna tartare', 'salmon tartare'],
    components: [['Beef tartare', 'hero'], ['Egg yolk', 'support'], ['Toasted bread', 'support'], ['Capers', 'support'], ['Dijon mustard', 'sauce'], ['Chives', 'garnish']],
  },
  {
    match: ['ratatouille', 'gratin dauphinois', 'dauphinoise', 'onion tart'],
    components: [['Ratatouille', 'hero'], ['Goat cheese', 'support'], ['Basil oil', 'sauce'], ['Thyme', 'garnish']],
  },
  {
    match: ['sole meuniere', 'sole meunière', 'dover sole'],
    components: [['Dover sole', 'hero'], ['New potatoes', 'support'], ['Green beans', 'support'], ['Brown butter', 'sauce'], ['Lemon wedge', 'garnish'], ['Parsley', 'garnish']],
  },
  {
    match: ['tartiflette', 'raclette', 'savoyarde'],
    components: [['Tartiflette', 'hero'], ['Salad leaves', 'support'], ['Cornichons', 'support'], ['Vinaigrette', 'sauce']],
  },
  {
    match: ['creme brulee', 'crème brûlée', 'tarte tatin', 'profiteroles', 'mille feuille', 'millefeuille', 'clafoutis', 'chocolate mousse', 'souffle', 'soufflé', 'mousse au chocolat', 'financier'],
    components: [['Creme brulee', 'hero'], ['Raspberries', 'support'], ['Shortbread', 'support'], ['Mint', 'garnish']],
  },
  {
    match: ['churros', 'churro'],
    components: [['Churros', 'hero'], ['Chocolate sauce', 'sauce'], ['Sugar', 'garnish']],
  },
  {
    match: ['bacalao', 'bacalhau'],
    components: [['Bacalao', 'hero'], ['Potatoes', 'support'], ['Roasted peppers', 'support'], ['Olive oil', 'sauce'], ['Parsley', 'garnish']],
  },
  {
    match: ['crema catalana', 'tarta de santiago', 'arroz con leche', 'natillas'],
    components: [['Flan', 'hero'], ['Caramel sauce', 'sauce'], ['Whipped cream', 'support'], ['Mint', 'garnish']],
  },
  {
    match: ['bangers and mash', 'toad in the hole', 'sausage and mash', 'sausage casserole', 'sausage and chips'],
    components: [['Sausages', 'hero'], ['Mashed potato', 'support'], ['Peas', 'support'], ['Onion gravy', 'sauce'], ['Parsley', 'garnish']],
  },
  {
    match: ['ploughmans', "ploughman's", 'scotch egg', 'cold meat platter'],
    components: [['Cheddar', 'hero'], ['Ham', 'support'], ['Pork pie', 'support'], ['Pickled onions', 'support'], ['Crusty bread', 'support'], ['Piccalilli', 'sauce'], ['Apple', 'garnish']],
  },
  {
    match: ['gammon', 'ham egg and chips', 'ham egg chips'],
    components: [['Gammon steak', 'hero'], ['Fried egg', 'support'], ['Chips', 'support'], ['Peas', 'support'], ['Mustard', 'sauce']],
  },
  {
    match: ['jacket potato', 'baked potato', 'jacket potatoes'],
    components: [['Jacket potato', 'hero'], ['Baked beans', 'support'], ['Cheddar', 'support'], ['Salad leaves', 'support'], ['Butter', 'sauce']],
  },
  {
    match: ['bubble and squeak'],
    components: [['Bubble and squeak', 'hero'], ['Fried egg', 'support'], ['Bacon', 'support'], ['Brown sauce', 'sauce']],
  },
  {
    match: ['haggis', 'neeps and tatties'],
    components: [['Haggis', 'hero'], ['Neeps', 'support'], ['Tatties', 'support'], ['Whisky sauce', 'sauce']],
  },
  {
    match: ['mac and cheese', 'macaroni cheese', 'mac cheese', 'cauliflower cheese'],
    components: [['Macaroni cheese', 'hero'], ['Breadcrumbs', 'garnish'], ['Chives', 'garnish']],
  },
  {
    match: ['crumble', 'bread and butter pudding', 'spotted dick', 'trifle', 'eton mess', 'banoffee', 'rice pudding', 'treacle tart', 'bakewell', 'jam roly poly'],
    components: [['Apple crumble', 'hero'], ['Custard', 'sauce'], ['Vanilla ice cream', 'support']],
  },
  {
    match: ['dessert', 'chocolate', 'tart', 'cheesecake', 'sorbet'],
    components: [
      ['Tart', 'hero'], ['Cream quenelle', 'support'],
      ['Fruit coulis', 'sauce'], ['Mint', 'garnish'],
    ],
  },
  {
    match: ['tofu scramble', 'scrambled tofu', 'jackfruit', 'stuffed mushroom'],
    components: [['Toast', 'support'], ['Tofu scramble', 'hero'], ['Avocado', 'support'], ['Cherry tomatoes', 'support'], ['Chilli flakes', 'garnish'], ['Chives', 'garnish']],
  },
  {
    match: ['spaetzle', 'pretzel', 'brezel'],
    components: [['Spaetzle', 'hero'], ['Emmental', 'support'], ['Crispy onions', 'support'], ['Chives', 'garnish']],
  },
]

// Whole words only. Substring matching classified "cauliflower puree" as a
// garnish, because it contains "flower" -- and would do the same to
// "peppercorn" and "saltimbocca". Multi-word entries still match as phrases.
function has(text: string, words: string[]) {
  const padded = ` ${text.toLowerCase().replace(/[^a-zà-ÿ\s]/g, ' ').replace(/\s+/g, ' ').trim()} `
  return words.some((w) => padded.includes(` ${w} `))
}

// The style the name asks for: the one named last, because English puts the thing itself at the end and the describing
// words before it. "Chocolate brownies" is a brownie, not a chocolate cake; "lemon drizzle cake" is a cake.
function mostSpecific<T extends { match: string[] }>(variants: T[], lower: string): T | undefined {
  const text = ` ${lower.replace(/[^a-zà-ÿ\s]/g, ' ').replace(/\s+/g, ' ').trim()} `
  const pick = (weak: boolean) => {
    let best: T | undefined
    let bestEnd = -1
    let bestLen = 0
    for (const v of variants) {
      for (const raw of v.match) {
        if (raw.startsWith('~') !== weak) continue
        const w = raw.replace(/^~/, '')
        const at = text.lastIndexOf(` ${w} `)
        if (at < 0) continue
        // Where the match ends, then how long it is: "strawberry sundae" and "sundae" end together, and the longer one
        // is the better evidence.
        const end = at + w.length
        if (end > bestEnd || (end === bestEnd && w.length > bestLen)) {
          best = v
          bestEnd = end
          bestLen = w.length
        }
      }
    }
    return best
  }
  return pick(false) ?? pick(true)
}

function roleFor(part: string, index: number, total: number): ComponentRole {
  const t = part.toLowerCase()
  if (has(t, SAUCE_WORDS)) return 'sauce'
  if (has(t, GARNISH_WORDS)) return 'garnish'
  if (index === 0 && (has(t, HERO_WORDS) || total > 1)) return 'hero'
  return 'support'
}

const tidy = (s: string) =>
  s.replace(/\s+/g, ' ').trim().replace(/^[-–—,&]+|[-–—,&]+$/g, '').trim()

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s)

// Words that join parts of a dish name without naming an ingredient.
const SPLIT = /,|\band\b|&|\bwith\b|\bon\b|\bover\b|\bserved\b|\bplus\b|\/|\+/gi
const NOISE = /^(a|an|the|of|our|house|classic|fresh|new)$/i

// A dish named for its main ingredient (steak, salmon, duck, chicken) is only that when nothing more specific is in the
// name: "chicken pho" is a pho, "salmon poke" a poke bowl and "steak sandwich" a sandwich.
const BY_INGREDIENT = new Set(['steak', 'salmon', 'duck', 'chicken', 'oyster', 'mussel', 'lobster', 'crab', 'prawn', 'scallop', 'calamari', 'octopus'])
const ORDERED = [...TEMPLATES.filter((t) => !BY_INGREDIENT.has(t.match[0])), ...TEMPLATES.filter((t) => BY_INGREDIENT.has(t.match[0]))]

/** Every component name the starter templates offer. These are the foods chefs actually end up plating, so they are made first. */
export const TEMPLATE_COMPONENT_NAMES: string[] = [
  ...new Set([
    ...TEMPLATES.flatMap((t) => t.components.map(([name]) => name)),
    ...Object.values(VARIANTS).flatMap((f) => f.variants.flatMap((v) => v.components.map(([name]) => name))),
  ]),
]

export function suggestComponents(dishName: string, variant?: string): Suggestion {
  const raw = tidy(dishName)
  if (!raw) {
    return { components: [], source: 'generic', note: 'Type a dish name first.' }
  }

  // 1. The name is already a component list -- unless it is a dish whose own name has an "and" in it (fish and chips,
  // steak and ale pie), which the splitting below would take for two ingredients.
  const lowerRaw = raw.toLowerCase()
  const namedWithAnd = ORDERED.some(
    (t) => t.match.some((m) => m.includes(' and ') && lowerRaw.includes(m)) || (VARIANTS[t.match[0]]?.also ?? []).some((w) => w.includes(' and ') && lowerRaw.includes(w)),
  )
  const parts = (namedWithAnd ? raw.split(',') : raw.split(SPLIT))
    .map(tidy)
    .filter((p) => p.length > 1 && !NOISE.test(p))

  if (parts.length >= 2) {
    const components = parts.slice(0, 8).map((p, i) => ({
      name: cap(p),
      role: roleFor(p, i, parts.length),
    }))
    // A plate with no sauce and no garnish reads flat; the chef can delete them.
    return {
      components,
      source: 'name',
      note: `Read ${components.length} components straight from the dish name.`,
    }
  }

  // 2. A named dish we have a template for.
  const lower = raw.toLowerCase()
  const hit = ORDERED.find((t) => t.match.some((m) => lower.includes(m)) || (VARIANTS[t.match[0]]?.also ?? []).some((w) => has(lower, [w])))
  if (hit) {
    const set = VARIANTS[hit.match[0]]
    if (set) {
      // The style in the name ("pepperoni pizza"), or the one the chef picked, or the template's own.
      const named = variant ? set.variants.find((v) => v.label === variant) : mostSpecific(set.variants, lower)
      const chosen = variant === set.base ? undefined : named
      const components = (chosen?.components ?? hit.components).map(([name, role]) => ({ name, role }))
      const style = chosen?.label ?? set.base
      return {
        components,
        source: 'template',
        note: `${style} ${set.family.toLowerCase()} — the standard build. Pick another style below, or edit anything that is not how you make it.`,
        family: set.family,
        variants: [set.base, ...set.variants.map((v) => v.label)],
        variant: style,
      }
    }
    return {
      components: hit.components.map(([name, role]) => ({ name, role })),
      source: 'template',
      note: `Standard build for "${raw}" — edit anything that is not how you make it.`,
    }
  }

  // 3. Nothing recognised: a skeleton worth editing rather than an empty list.
  return {
    components: [
      { name: cap(raw), role: 'hero' },
      { name: 'Garnish', role: 'garnish' },
      { name: 'Sauce', role: 'sauce' },
    ],
    source: 'generic',
    note: `No standard build for "${raw}" — here is a skeleton to edit.`,
  }
}

// Gives each suggested component the shape the rest of the app expects.
export function toComponents(s: Suggestion): Component[] {
  return s.components.map((c, i) => ({
    id: `s${Date.now().toString(36)}${i}`,
    name: c.name,
    role: c.role,
    imagePath: null,
  }))
}
