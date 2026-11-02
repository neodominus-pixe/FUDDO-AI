import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { layout } from '@/lib/layout'
import { buildPlatingModel } from '@/lib/model3d'
import { computePoses } from '@/lib/scene/poses'
import { DECK_LEVEL, shapeFor } from '@/lib/shapes'
import { suggestComponents } from '@/lib/suggest'
import type { Dish, PlatingSpec } from '@/lib/types'

const dish = (name: string, components: Array<[string, 'hero' | 'support' | 'sauce' | 'garnish']>): Dish => ({
  id: 'd',
  name,
  createdAt: '2026-01-01T00:00:00.000Z',
  components: components.map(([n, role], i) => ({ id: `c${i + 1}`, name: n, role, imagePath: null })),
})

const spec = (over: Partial<PlatingSpec> = {}): PlatingSpec => ({
  id: 's', composition: 'centered', plate: 'round-white', sauce: 'pooled', height: 'medium', garnish: 'moderate', notes: '', overrides: {}, seed: 5, ...over,
})

describe('round things are round', () => {
  it('files round vegetables, charcuterie and cheese as round slices, not as square slabs', () => {
    for (const name of ['Tomato', 'Cucumber', 'Pepperoni', 'Salami', 'Pickles', 'Gherkin', 'Mozzarella', 'Chorizo']) {
      assert.equal(shapeFor(name, 'support'), 'coin', name)
    }
  })

  it('still slices what is sliced flat and square: cheese, bacon, ham, bread', () => {
    for (const name of ['Cheddar', 'Bacon', 'Ham', 'Toast', 'Avocado']) assert.equal(shapeFor(name, 'support'), 'slice', name)
  })

  it('keeps the whole small ones whole', () => {
    assert.equal(shapeFor('Cherry tomatoes', 'support'), 'ball')
    assert.equal(shapeFor('Onion', 'support'), 'ring')
  })

  it('reads the head noun through a preparation word, so toasted seeds are seeds and not toast', () => {
    for (const name of ['Toasted seeds', 'Toasted sesame seeds', 'Roasted pumpkin seeds', 'Toasted pine nuts']) assert.equal(shapeFor(name, 'garnish'), 'seed', name)
    assert.equal(shapeFor('Toasted sourdough', 'support'), 'slice', 'but toast is still toast')
  })

  it('makes a tomato round in the model: the same piece twice is not a square', () => {
    const d = dish('Salad', [['Tomato', 'hero']])
    const poses = computePoses(d, spec({ garnish: 'minimal' }))
    const p = [...poses.poses.values()][0]
    assert.ok(Math.abs(p.sx - p.sz) < 1e-9, 'as wide as it is deep')
    assert.ok(p.sy < p.sx * 0.5, 'and thin')
  })
})

describe('the starter dishes', () => {
  it('give lettuce and tomato as two components, on the burger', () => {
    const names = suggestComponents('burger').components.map((c) => c.name)
    assert.ok(names.includes('Lettuce') && names.includes('Tomato'))
    assert.ok(!names.some((n) => /&| and /.test(n)), 'nothing is two things in one')
  })
})

describe('pizza', () => {
  const pizza = dish('Pizza', [['Pizza base', 'hero'], ['Mozzarella', 'support'], ['Pepperoni', 'support'], ['Tomato sauce', 'sauce'], ['Basil leaf', 'garnish']])

  it('has a raised crust round a lower deck, and a pizza is wider than any topping on it', () => {
    assert.equal(shapeFor('Pizza base', 'hero'), 'pizza')
    assert.ok((DECK_LEVEL.pizza ?? 1) < 0, 'the deck is below the middle of the crust')
    const poses = computePoses(pizza, spec())
    const base = poses.poses.get('c1:0')!
    for (const [key, p] of poses.poses) if (key !== 'c1:0') assert.ok(p.sx < base.sx, key)
  })

  it('seats toppings and sauce on the deck, not on the rim of the crust', () => {
    const poses = computePoses(pizza, spec({ garnish: 'minimal' }))
    const base = poses.poses.get('c1:0')!
    const rimTop = base.y + base.sy
    for (const key of ['c2:0', 'c3:0']) {
      const topping = poses.poses.get(key)!
      assert.ok(topping.y - topping.sy < rimTop - base.sy * 0.5, `${key} rests below the top of the crust`)
      assert.ok(topping.y - topping.sy >= base.y - base.sy, `${key} is not buried in the base`)
    }
    const sauce = poses.sauceMarks[0]
    assert.ok(sauce.y < rimTop, 'the sauce is inside the crust')
    assert.ok(sauce.y > base.y - base.sy, 'and on top of the base')
  })

  it('builds, deterministically, and puts every piece in the model', () => {
    const a = buildPlatingModel(pizza, spec())
    assert.equal(JSON.stringify(a.gltf), JSON.stringify(buildPlatingModel(pizza, spec()).gltf))
    const keys = (a.gltf as { nodes: Array<{ extras?: { key?: string } }> }).nodes.map((n) => n.extras?.key).filter(Boolean)
    for (const e of layout(pizza, spec()).elements) assert.ok(keys.includes(e.key), e.key)
  })
})

describe('a build bigger than its room', () => {
  const pizza = dish('Pizza', [['Pizza base', 'hero'], ['Mozzarella', 'support'], ['Tomato sauce', 'sauce'], ['Basil leaf', 'garnish']])

  it('keeps the way it is arranged: every topping on a pizza has its own place', () => {
    for (const composition of ['centered', 'linear', 'off-center', 'scattered', 'negative-space'] as const) {
      const poses = computePoses(pizza, spec({ composition }))
      const cheese = [...poses.poses].filter(([k]) => k.startsWith('c2:')).map(([, p]) => `${p.x.toFixed(3)},${p.z.toFixed(3)}`)
      assert.ok(cheese.length >= 4, `${composition}: the pizza is topped with several pieces of mozzarella`)
      assert.equal(new Set(cheese).size, cheese.length, `${composition}: no two pieces share a spot`)
    }
  })

  it('puts the toppings on the pizza, inside its crust', () => {
    const poses = computePoses(pizza, spec())
    const base = poses.poses.get('c1:0')!
    for (const [key, p] of poses.poses) {
      if (!key.startsWith('c2:')) continue
      assert.ok(Math.hypot(p.x - base.x, p.z - base.z) + p.sx < base.sx * 0.95, `${key} is within the pizza`)
    }
  })
})

describe('a named dish comes in styles', () => {
  const names = (dishName: string, variant?: string) => suggestComponents(dishName, variant).components.map((c) => c.name)

  it('reads the style from the name: a pepperoni pizza has pepperoni, a margherita does not', () => {
    assert.ok(names('pepperoni pizza').includes('Pepperoni'))
    assert.ok(names('pepperoni').includes('Pepperoni'), 'the style alone names the dish')
    assert.ok(!names('margherita').includes('Pepperoni'))
    assert.ok(names('hawaiian pizza').includes('Pineapple') && names('hawaiian pizza').includes('Ham'))
    assert.ok(names('bacon cheeseburger').includes('Bacon'))
    assert.ok(names('spaghetti bolognese').includes('Beef ragu'))
    assert.ok(names('BBQ chicken wings').includes('BBQ wings') && !names('BBQ chicken wings').includes('Buffalo wings'))
    assert.ok(names('chicken wings').includes('Buffalo wings'), 'wings are wings, not roast chicken')
    assert.ok(names('BLT').includes('Bacon') && names('reuben sandwich').includes('Pastrami'))
    assert.ok(names('chicken pho').includes('Chicken broth') && names('beef pho').includes('Beef broth'))
    assert.ok(names('salmon poke bowl').includes('Salmon') && names('chicken pad thai').includes('Chicken'))
    assert.ok(names('chicken fried rice').includes('Fried rice') && names('chicken fried rice').includes('Chicken'), 'not a roast chicken')
    assert.ok(names('beef bourguignon').includes('Beef bourguignon') && names('lamb tagine').includes('Couscous'))
    assert.ok(names('apple pie').includes('Apple pie') && names('cottage pie').includes('Cottage pie') && names('fish pie').includes('Fish pie'))
    assert.ok(names('haddock and chips').includes('Battered haddock') || names('fish and chips haddock').includes('Battered haddock'))
    assert.ok(names('fish tacos').includes('Battered cod') && names('birria tacos').includes('Birria beef'))
    assert.ok(names('eggs benedict').includes('Hollandaise') && names('full english').includes('Baked beans') && names('porridge').includes('Porridge'))
    assert.ok(names('buddha bowl').includes('Brown rice') && names('chicken burrito bowl').includes('Black beans'), 'a bowl, not a roast chicken')
    assert.ok(names('waldorf salad').includes('Walnuts') && names('thai beef salad').includes('Sliced beef'))
    assert.ok(names('pesto gnocchi').includes('Basil pesto') && names('mushroom ravioli').includes('Wild mushrooms'))
    assert.ok(names('prawn cocktail').includes('Cocktail sauce') && names('crab linguine').includes('Linguine') && names('lobster thermidor').includes('Cheese sauce'))
    assert.ok(names('moules').includes('White wine sauce') && names('oysters rockefeller').includes('Spinach') && names('thai mussels').includes('Coconut broth'))
    assert.ok(names('prawn pad thai').includes('Rice noodles') && names('seafood paella').includes('Paella rice'), 'a dish beats its main ingredient')
    assert.ok(names('salmon ceviche').includes('Salmon fillet') && names('osso buco').includes('Gremolata') && names('seared scallops').includes('Seared scallops'))
    assert.ok(names('french cheese board').includes('Brie') && names('baked camembert').includes('Fig jam') && names('cheese fondue').includes('Cheese fondue'))
    assert.ok(names('charcuterie board').includes('Salami') && names('spanish charcuterie').includes('Jamon iberico') && names('antipasti').includes('Artichoke hearts'))
    assert.ok(names('carrot cake').includes('Carrot cake') && names('chocolate cake').includes('Chocolate cake') && names('chocolate brownies').includes('Chocolate brownie'), 'a cake, not a chocolate dessert')
    assert.ok(names('croissants').includes('Croissant') && names('scones').includes('Clotted cream') && names('sourdough').includes('Sourdough loaf'))
    assert.ok(names('cheesecake').includes('Cheesecake') && names('lemon drizzle cake').includes('Lemon drizzle cake'))
    assert.ok(names('chicago hot dog').includes('Frankfurter') && names('corn dog').includes('Corn dog') && names('bratwurst').includes('Bratwurst'))
    assert.ok(names('loaded nachos').includes('Tortilla chips') && names('chicken nachos').includes('Chicken'))
    assert.ok(names('hummus').includes('Hummus') && names('tzatziki').includes('Tzatziki') && names('lebanese mezze').includes('Tabbouleh') && names('falafel').includes('Falafel'))
    assert.ok(names('mango smoothie').includes('Mango smoothie') && names('chocolate milkshake').includes('Chocolate milkshake') && names('smoothie bowl').includes('Berry smoothie'))
    assert.ok(names('margarita').includes('Margarita') && names('espresso martini').includes('Espresso martini') && names('latte').includes('Latte') && names('affogato').includes('Espresso'))
    assert.ok(names('hot chocolate').includes('Hot chocolate') && names('iced tea').includes('Iced tea') && names('lemonade').includes('Lemonade'))
    assert.ok(names('prawn cocktail').includes('Cocktail sauce'), 'a prawn cocktail is not a drink')
    assert.ok(names('pistachio ice cream').includes('Pistachio ice cream') && names('chocolate ice cream').includes('Chocolate ice cream'), 'a flavour, not a chocolate dessert')
    assert.ok(names('lemon sorbet').includes('Lemon sorbet') && names('mango sorbet').includes('Mango sorbet') && names('gelato').includes('Hazelnut gelato'))
    assert.ok(names('banana split').includes('Banana') && names('knickerbocker glory').includes('Wafer') && names('peach melba').includes('Peaches'))
    assert.ok(names('strawberry sundae').includes('Strawberry coulis') && names('hot fudge sundae').includes('Hot fudge sauce') && names('brownie sundae').includes('Chocolate brownie'))
    assert.ok(names('ice cream sandwich').includes('Cookies'), 'an ice cream sandwich is not a sandwich')
    assert.ok(names('ice cream cone').includes('Waffle cone') && names('baked alaska').includes('Baked Alaska'))
    assert.ok(names('garlic naan').includes('Garlic naan') && names('samosas').includes('Samosas') && names('poppadoms').includes('Poppadoms') && names('onion bhaji').includes('Onion bhaji'))
    assert.ok(names('paneer tikka').includes('Paneer tikka') && names('chicken tikka masala').includes('Chicken tikka masala'), 'a curry, not a side')
    assert.ok(names('tapas').includes('Patatas bravas') && names('patatas bravas').includes('Bravas sauce') && names('chorizo tapas').includes('Chorizo') && names('padron peppers').includes('Padron peppers'))
    assert.ok(names('chicken enchiladas').includes('Enchiladas') && names('verde enchiladas').includes('Salsa verde'))
    assert.ok(names('beef burrito').includes('Burrito') && names('breakfast burrito').includes('Scrambled eggs') && names('burrito bowl').includes('Black beans'), 'a burrito, a breakfast one, and a bowl')
    assert.ok(names('steak fajitas').includes('Steak fajita') && names('mushroom quesadilla').includes('Mushroom quesadilla') && names('chilaquiles verdes').includes('Salsa verde'))
    assert.ok(names('mole poblano').includes('Mole sauce') && names('guacamole').includes('Guacamole') && names('pork tamales').includes('Tamales') && names('street corn').includes('Cotija') && names('pozole').includes('Pozole'))
    assert.ok(names('massaman curry').includes('Massaman curry') && names('thai red curry').includes('Red curry') && names('katsu curry').includes('Katsu chicken'), 'Thai curries are curries')
    assert.ok(names('tom yum').includes('Tom yum soup') && names('miso soup').includes('Miso soup') && names('wonton soup').includes('Wontons') && names('laksa').includes('Laksa broth'), 'soups, with or without the word soup')
    assert.ok(names('chicken satay').includes('Chicken satay') && names('beef satay').includes('Beef satay') && names('som tam').includes('Green papaya salad') && names('larb').includes('Chicken larb'))
    assert.ok(names('sweet and sour pork').includes('Sweet and sour pork') && names('kung pao chicken').includes('Kung pao chicken') && names('mapo tofu').includes('Mapo tofu'), 'a dish with and in its name stays whole')
    assert.ok(names('beef and broccoli').includes('Broccoli') && names('orange chicken').includes('Orange chicken') && names('peking duck').includes('Pancakes') && names('crispy aromatic duck').includes('Crispy duck'))
    assert.ok(names('pork belly bao').includes('Pork belly') && names('char siu bao').includes('Char siu bao') && names('congee').includes('Congee') && names('shabu shabu').includes('Sliced beef'))
    assert.ok(names('prawn tempura').includes('Tempura prawns') && names('tonkatsu').includes('Pork katsu') && names('chicken katsu').includes('Chicken katsu') && names('katsu sando').includes('Pork katsu'), 'a katsu sando is a sandwich')
    assert.ok(names('yakitori').includes('Chicken skewer') && names('takoyaki').includes('Takoyaki') && names('gyudon').includes('Sliced beef') && names('unadon').includes('Grilled eel'))
    assert.ok(names('kitsune udon').includes('Udon noodles') && names('zaru soba').includes('Soba noodles') && names('onigiri').includes('Onigiri') && names('salmon teriyaki').includes('Salmon fillet') && names('bento').includes('Tamagoyaki'))
    assert.ok(names('vegetable spring rolls').includes('Spring rolls') && names('summer rolls').includes('Summer rolls') && names('salmon fish cakes').includes('Salmon fish cakes'))
    assert.ok(names('dolsot bibimbap').includes('Bulgogi beef') && names('korean fried chicken').includes('Korean fried chicken') && names('kimchi jjigae').includes('Kimchi jjigae') && names('tteokbokki').includes('Tteokbokki') && names('galbi').includes('Galbi') && names('pajeon').includes('Seafood pancake'))
    assert.ok(names('bun cha').includes('Vermicelli') && names('com tam').includes('Broken rice') && names('banh xeo').includes('Banh xeo') && names('vietnamese iced coffee').includes('Condensed milk'))
    assert.ok(names('masala dosa').includes('Dosa') && names('chana masala').includes('Chana masala') && names('chicken korma').includes('Chicken korma') && names('lamb vindaloo').includes('Lamb vindaloo') && names('curry goat').includes('Curry goat'), 'Indian curries are curries, a dosa is a dosa')
    assert.ok(names('lamb biryani').includes('Lamb') && names('tandoori lamb').includes('Tandoori lamb chops') && names('thali').includes('Dal') && names('pani puri').includes('Pani puri'))
    assert.ok(names('shish tawook').includes('Shish tawook') && names('kibbeh').includes('Kibbeh') && names('lahmacun').includes('Lahmacun') && names('mansaf').includes('Jameed sauce') && names('knafeh').includes('Knafeh') && names('tabbouleh').includes('Tabbouleh'))
    assert.ok(names('jollof rice').includes('Jollof rice') && names('suya').includes('Beef suya') && names('doro wat').includes('Injera') && names('peri peri chicken').includes('Peri peri sauce') && names('bobotie').includes('Bobotie') && names('couscous royale').includes('Merguez'))
    assert.ok(names('jerk pork').includes('Jerk pork') && names('ackee and saltfish').includes('Ackee and saltfish') && names('oxtail stew').includes('Oxtail stew') && names('goat roti').includes('Curry goat') && names('tostones').includes('Tostones'))
    assert.ok(names('spanakopita').includes('Spanakopita') && names('dolmades').includes('Dolmades') && names('keftedes').includes('Keftedes') && names('stifado').includes('Beef stifado') && names('pork gyros').includes('Pork gyros') && names('pastitsio').includes('Pastitsio') && names('lamb moussaka').includes('Moussaka'))
    assert.ok(names('iskender').includes('Iskender kebab') && names('adana kebab').includes('Adana kebab') && names('menemen').includes('Menemen') && names('turkish breakfast').includes('Simit') && names('mercimek soup').includes('Lentil soup') && names('imam bayildi').includes('Imam bayildi'))
    assert.ok(names('coq au vin').includes('Coq au vin') && names('quiche lorraine').includes('Bacon') && names('steak tartare').includes('Beef tartare') && names('ratatouille').includes('Ratatouille') && names('tarte tatin').includes('Tarte tatin') && names('crepes suzette').includes('Orange sauce') && names('raclette').includes('Raclette cheese'), 'French dishes keep their own names')
    assert.ok(names('paella valenciana').includes('Rabbit') && names('gazpacho').includes('Gazpacho') && names('churros').includes('Churros') && names('crema catalana').includes('Crema catalana') && names('sangria').includes('Sangria') && names('fabada').includes('Fabada'))
    assert.ok(names('bangers and mash').includes('Sausages') && names('toad in the hole').includes('Yorkshire pudding') && names('gammon egg and chips').includes('Gammon steak') && names('tuna jacket potato').includes('Tuna') && names('haggis neeps and tatties').includes('Tatties') && names('cullen skink').includes('Smoked haddock'), 'pub dishes with and in the name stay whole')
    assert.ok(names('apple crumble').includes('Custard') && names('eton mess').includes('Meringue') && names('macaroni cheese').includes('Macaroni cheese') && names('bacon butty').includes('Soft white bread') && names('scotch egg').includes('Scotch egg'))
    assert.ok(names('flank steak').includes('Steak') && names('romantic dinner').includes('Romantic dinner'), 'a word inside another word is not a dish')
    assert.ok(names('tuna nigiri').includes('Tuna sashimi') && names('green shakshuka').includes('Spinach'))
    // German and Eastern European
    assert.ok(names('wiener schnitzel').includes('Wiener schnitzel') && names('chicken schnitzel').includes('Chicken schnitzel') && names('jagerschnitzel').includes('Mushroom sauce'))
    assert.ok(names('sauerbraten').includes('Potato dumplings') && names('schweinshaxe').includes('Roast pork knuckle') && names('kasespatzle').includes('Emmental') && names('currywurst').includes('Curry ketchup'))
    assert.ok(names('pierogi').includes('Sour cream') && names('pelmeni').includes('Pelmeni') && names('borscht').includes('Rye bread') && names('beef stroganoff').includes('Egg noodles') && names('mushroom stroganoff').includes('Mushroom stroganoff'))
    assert.ok(names('golabki').includes('Cabbage rolls') && names('bigos').includes('Bigos') && names('chicken paprikash').includes('Chicken paprikash') && names('syrniki').includes('Strawberry jam') && names('plov').includes('Carrot'))
    assert.ok(names('apple strudel').includes('Vanilla custard') && names('kaiserschmarrn').includes('Plum compote') && names('pretzel').includes('Soft pretzel'))
    assert.ok(names('goulash').includes('Beef goulash') && names('chicken kiev').includes('Chicken Kyiv') && names('bratwurst').includes('Bratwurst'), 'what was already there is still there')
    assert.ok(names('pretzel burger').includes('Beef patty'), 'a burger with a pretzel bun is a burger')
    // American BBQ and diner
    assert.ok(names('bbq ribs').includes('Pork ribs') && names('ribs').includes('Pork ribs') && names('brisket').includes('Sliced brisket') && names('pulled pork').includes('Pulled pork') && names('burnt ends').includes('Burnt ends'))
    assert.ok(names('meatloaf').includes('Brown gravy') && names('chicken fried steak').includes('Country gravy') && names('salisbury steak').includes('Mushroom gravy'), 'a diner plate, not a steak')
    assert.ok(names('chicken and waffles').includes('Waffles') && names('shrimp and grits').includes('Grits') && names('biscuits and gravy').includes('Sausage gravy') && names('gumbo').includes('Okra') && names('jambalaya').includes('Andouille sausage'))
    assert.ok(names('onion rings').includes('Onion rings') && names('loaded fries').includes('Cheese sauce') && names('poutine').includes('Cheese curds') && names('cornbread').includes('Honey butter'))
    assert.ok(names('clam chowder').includes('Oyster crackers') && names('chili con carne').includes('Beef chili') && names('crab cakes').includes('Remoulade'), 'a crab cake is not a sponge cake')
    assert.ok(names('pecan pie').includes('Pecans') && names('peach cobbler').includes('Peach cobbler') && names('red velvet cake').includes('Red velvet cake') && names('apple pie').includes('Apple pie'))
    assert.ok(names('philly cheesesteak').includes('Hoagie roll') && names('po boy').includes('Fried shrimp') && names('sloppy joe').includes('Sloppy joe mince') && names('patty melt').includes('Beef patty') && names('monte cristo').includes('Turkey'), 'diner sandwiches are sandwiches, not steaks')
    assert.ok(names('grilled cheese').includes('Tomato soup') && names('tuna melt').includes('Tuna'))
    // Brunch
    assert.ok(names('eggs florentine').includes('Spinach') && names('eggs royale').includes('Smoked salmon') && names('corned beef hash').includes('Corned beef hash') && names('kedgeree').includes('Smoked haddock'))
    assert.ok(names('full irish').includes('Black pudding') && names('overnight oats').includes('Overnight oats') && names('dutch baby').includes('Dutch baby') && names('pain perdu').includes('Pain perdu') && names('breakfast tacos').includes('Scrambled eggs'))
    // Vegan and gluten-free
    assert.ok(names('vegan pizza').includes('Vegan cheese') && names('gluten free pizza').includes('Gluten-free pizza base') && names('gluten free pasta').includes('Gluten-free pasta') && names('vegan lasagne').includes('Cashew bechamel'))
    assert.ok(names('vegan curry').includes('Vegetable curry') && names('cauliflower steak').includes('Cauliflower steak') && names('nut roast').includes('Nut roast') && names('mushroom wellington').includes('Mushroom Wellington'))
    assert.ok(names('jackfruit tacos').includes('Corn tortilla') && names('jackfruit').includes('Pulled jackfruit') && names('tofu scramble').includes('Tofu scramble') && names('vegan breakfast').includes('Tofu scramble'))
    assert.ok(names('lentil bolognese').includes('Lentil ragu') && names('spaghetti bolognese').includes('Beef ragu') && names('lentil shepherds pie').includes('Onion gravy') && names('shepherds pie').includes('Shepherds pie'))
    assert.ok(names('gluten free chocolate cake').includes('Flourless chocolate cake') && names('chocolate cake').includes('Chocolate cake') && names('vegan chocolate mousse').includes('Coconut cream') && names('vegan sausage roll').includes('Vegan sausage roll'))
    assert.ok(names('cauliflower wings').includes('Cauliflower wings') && names('vegan pancakes').includes('Coconut yoghurt') && names('vegan ice cream').includes('Coconut ice cream') && names('vegan burger').includes('Veggie patty'))
  })

  it('keeps the standard build when the name gives no style, and offers the styles', () => {
    const plain = suggestComponents('pizza')
    assert.deepEqual(plain.components.map((c) => c.name), ['Pizza base', 'Mozzarella', 'Tomato sauce', 'Basil leaf'])
    assert.equal(plain.family, 'Pizza')
    assert.ok(plain.variants && plain.variants.length >= 6 && plain.variants[0] === 'Margherita')
  })

  it('changes to the style the chef picks, whatever the name says', () => {
    assert.ok(names('pizza', 'Four cheese').includes('Gorgonzola'))
    assert.deepEqual(names('pepperoni pizza', 'Margherita'), ['Pizza base', 'Mozzarella', 'Tomato sauce', 'Basil leaf'])
    assert.equal(suggestComponents('pizza', 'Diavola').variant, 'Diavola')
  })

  it('has a hero in every style of every dish, and never lists a dish typed as a plain list as having styles', () => {
    for (const dish of ['pizza', 'burger', 'carbonara', 'risotto', 'steak', 'salmon', 'salad', 'soup', 'curry', 'duck', 'chicken', 'taco', 'ramen', 'dumpling', 'paella', 'roast', 'kebab', 'pancakes', 'lasagne', 'dessert', 'wings', 'sandwich', 'pad thai', 'pho', 'sushi', 'poke', 'shakshuka', 'fried rice', 'stew', 'pie', 'fish and chips', 'breakfast', 'bowl', 'gnocchi', 'ravioli', 'bruschetta', 'arancini', 'osso buco', 'saltimbocca', 'calzone', 'seafood platter', 'oyster', 'mussel', 'lobster', 'crab', 'prawn', 'scallop', 'calamari', 'octopus', 'ceviche', 'cheese board', 'charcuterie', 'gateau', 'baking', 'hot dog', 'nacho', 'guacamole', 'mezze', 'smoothie', 'milkshake', 'mojito', 'espresso', 'lemonade', 'ice cream', 'curry sides', 'tapas', 'enchilada', 'burrito', 'fajita', 'quesadilla', 'chilaquiles', 'mole poblano', 'tamale', 'elote', 'pozole', 'satay', 'som tam', 'khao soi', 'fish cake', 'spring roll', 'sweet and sour', 'kung pao', 'mapo tofu', 'char siu', 'peking duck', 'general tso', 'bao', 'congee', 'hot pot', 'tempura', 'tonkatsu', 'yakitori', 'okonomiyaki', 'donburi', 'udon', 'karaage', 'bento box', 'teriyaki', 'bibimbap', 'korean fried chicken', 'jjigae', 'tteokbokki', 'kimbap', 'korean bbq', 'bun cha', 'com tam', 'dosa', 'tandoori', 'thali', 'chaat', 'biryani', 'mixed grill', 'kibbeh', 'manakish', 'maqluba', 'baklava', 'jollof rice', 'injera', 'peri peri', 'bunny chow', 'couscous', 'jerk', 'caribbean roti', 'plantain', 'spanakopita', 'gemista', 'keftedes', 'saganaki', 'loukoumades', 'iskender', 'turkish manti', 'borek', 'imam bayildi', 'quiche', 'escargots', 'steak tartare', 'ratatouille', 'sole meuniere', 'tartiflette', 'creme brulee', 'churros', 'bacalao', 'crema catalana', 'bangers and mash', 'ploughmans', 'gammon', 'jacket potato', 'bubble and squeak', 'haggis', 'mac and cheese', 'crumble', 'schnitzel', 'sauerbraten', 'spaetzle', 'currywurst', 'pierogi', 'borscht', 'stroganoff', 'cabbage roll', 'bigos', 'blini', 'khachapuri', 'strudel', 'bbq ribs', 'meatloaf', 'chicken and waffles', 'onion rings', 'clam chowder', 'crab cakes', 'pecan pie', 'tofu scramble']) {
      const base = suggestComponents(dish)
      assert.ok(base.variants && base.variants.length > 1, `${dish} has styles`)
      for (const style of base.variants!) {
        const s = suggestComponents(dish, style)
        assert.ok(s.components.some((c) => c.role === 'hero'), `${dish} / ${style} has a hero`)
        assert.equal(s.variant, style, `${dish} / ${style} is the style that was picked`)
      }
    }
    assert.equal(suggestComponents('Duck breast, celeriac, red wine').variants, undefined)
  })
})
