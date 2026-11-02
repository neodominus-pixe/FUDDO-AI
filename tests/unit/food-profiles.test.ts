import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { KNOWN_INGREDIENTS, hasColour, ingredientHsl } from '@/lib/palette'
import { shapeFor } from '@/lib/shapes'
import { TEMPLATE_COMPONENT_NAMES } from '@/lib/suggest'
import { kindFor } from '@/lib/textures/procedural'

// What each food should look like: the form it is cut or cooked into, the surface it has, and the colour family it
// belongs to. This is a judgment about food, written down once, so that a food added to the tables later cannot quietly
// turn into a grey rubble, a green fish or a sphere. A row is: name, the shapes that are right, the texture, the colour.

type Colour = 'white' | 'cream' | 'tan' | 'gold' | 'brown' | 'dark' | 'red' | 'pink' | 'orange' | 'yellow' | 'green' | 'purple' | 'grey'

function colourOf([h, s, l]: [number, number, number]): Colour[] {
  const out: Colour[] = []
  if (l >= 82 && s <= 34) out.push('white')
  if (h >= 32 && h <= 58 && l >= 66 && s <= 62) out.push('cream')
  if (h >= 22 && h <= 48 && l >= 42 && l <= 76 && s >= 14) out.push('tan')
  if (h >= 28 && h <= 52 && s >= 36 && l >= 44 && l <= 80) out.push('gold')
  if (h >= 4 && h <= 40 && l <= 52) out.push('brown')
  if (l <= 24) out.push('dark')
  if ((h <= 14 || h >= 336) && s >= 36 && l <= 66) out.push('red')
  if ((h <= 20 || h >= 336) && l >= 58 && s >= 30) out.push('pink')
  if (h >= 12 && h <= 36 && s >= 48 && l >= 38) out.push('orange')
  if (h >= 44 && h <= 66 && s >= 36 && l >= 50) out.push('yellow')
  if (h >= 66 && h <= 170 && s >= 14) out.push('green')
  if (h >= 250 && h <= 335) out.push('purple')
  if (s <= 14 && l >= 30 && l <= 80) out.push('grey')
  return out
}

type Row = [name: string, shapes: string, kind: string, colours: string]

const ROWS: Row[] = [
  // --- Meat and poultry
  ['Seared duck breast', 'breast', 'meat', 'brown tan'],
  ['Chicken breast', 'breast', 'meat', 'tan cream'],
  ['Roast chicken', 'bird', 'meat', 'tan brown gold'],
  ['Beef fillet', 'steak', 'meat', 'brown dark red'],
  ['Ribeye steak', 'steak', 'meat', 'brown dark red'],
  ['Lamb rump', 'steak', 'meat', 'brown dark red'],
  ['Pork belly', 'cut', 'meat', 'tan brown gold'],
  ['Pork chop', 'steak', 'meat', 'tan brown gold'],
  ['Beef burger patty', 'patty', 'meat', 'brown dark'],
  ['Meatballs', 'ball', 'meat', 'brown dark'],
  ['Pork sausage', 'baton', 'meat', 'brown tan gold'],
  ['Crispy bacon', 'slice', 'meat', 'red brown'],
  ['Parma ham', 'slice', 'meat', 'pink red'],
  ['Pepperoni', 'coin', 'meat', 'red brown'],
  ['Fried chicken', 'breast cut whole', 'meat', 'gold brown tan'],
  ['Short rib', 'cut', 'meat', 'brown dark'],
  ['Venison loin', 'steak', 'meat', 'brown dark red'],
  ['Pulled pork', 'pile', 'meat', 'brown tan'],
  // --- Fish and shellfish
  ['Fish fillet', 'fillet', 'fish', 'cream white tan'],
  ['White fish', 'fillet', 'fish', 'cream white tan'],
  ['Cod fillet', 'fillet', 'fish', 'cream white'],
  ['Pan-fried sea bass', 'fillet', 'fish', 'cream white tan'],
  ['Salmon fillet', 'fillet', 'fish', 'orange pink red'],
  ['Seared tuna', 'steak', 'meat', 'red dark brown'],
  ['Halibut', 'fillet', 'fish', 'cream white'],
  ['Scallops', 'coin ball cut dome', '*', 'cream white tan'],
  ['King prawns', 'prawn', '*', 'orange red pink'],
  ['Smoked salmon', 'slice', '*', 'orange pink red'],
  ['Crab', '*', '*', 'orange red pink tan'],
  ['Lobster tail', '*', '*', 'orange red pink'],
  ['Fish and chips', '*', '*', '*'],
  // --- Potatoes and starches
  ['Mashed potato', 'quenelle', 'smooth', 'cream white'],
  ['Potato puree', 'quenelle', 'smooth', 'cream white'],
  ['Crushed potatoes', 'patty disc', 'root', 'cream tan gold'],
  ['Crushed potato', 'patty disc', 'root', 'cream tan gold'],
  ['Smashed potatoes', 'patty disc', 'root', 'cream tan gold'],
  ['Roast potatoes', 'chunk', 'root', 'gold tan brown'],
  ['New potatoes', 'ball', 'root', 'cream tan'],
  ['Baby potatoes', 'ball', 'root', 'cream tan'],
  ['Fondant potato', 'cut disc ball', 'root', 'gold tan cream'],
  ['Potato gratin', 'cut', '*', 'cream gold tan'],
  ['Hash brown', 'disc patty', '*', 'gold tan brown'],
  ['Chips', 'fries', '*', 'gold tan'],
  ['Fries', 'fries', '*', 'gold tan'],
  ['Sweet potato wedges', 'wedge fries', 'root', 'orange gold tan'],
  ['Gnocchi', 'pillow ball', '*', 'cream white'],
  ['Steamed rice', 'grains', 'grain', 'white cream'],
  ['Mushroom risotto', 'grains', 'grain', 'cream tan brown'],
  ['Spaghetti', 'nest', 'strands', 'cream gold tan'],
  ['Penne', 'tubes', 'strands', 'cream gold tan'],
  ['Ravioli', 'pillow', '*', 'cream gold tan'],
  ['Couscous', 'grains', 'grain', 'cream gold tan'],
  ['Polenta', 'cut quenelle', '*', 'yellow gold cream'],
  ['Sourdough', 'slice', 'bread', 'tan gold brown'],
  ['Brioche bun', 'dome bunBase', 'bread', 'gold tan brown'],
  ['Egg noodles', 'nest', 'strands', 'cream gold tan'],
  // --- Vegetables
  ['Asparagus', 'baton', 'veg', 'green'],
  ['Grilled asparagus', 'baton', 'veg', 'green'],
  ['Tenderstem broccoli', 'baton', 'veg', 'green'],
  ['Glazed carrots', 'baton', 'root veg', 'orange'],
  ['Roasted beetroot', 'ball slice cut wedge', 'root', 'red purple dark pink'],
  ['Roast cauliflower', '*', '*', 'cream white tan gold'],
  ['Wild mushrooms', 'cap', '*', 'brown tan'],
  ['Cherry tomatoes', 'ball', 'fruit', 'red'],
  ['Tomato', 'coin', 'fruit', 'red'],
  ['Cucumber', 'coin', '*', 'green'],
  ['Green beans', 'pod baton', 'veg', 'green'],
  ['Peas', 'heap', '*', 'green'],
  ['Spinach', 'ruffle leaf', 'leaf', 'green'],
  ['Seasonal greens', 'ruffle leaf', 'leaf', 'green'],
  ['Kale', 'ruffle leaf', 'leaf', 'green'],
  ['Lettuce', 'ruffle leaf', 'leaf', 'green'],
  ['Rocket', 'ruffle leaf', 'leaf', 'green'],
  ['Avocado', 'slice', '*', 'green'],
  ['Sweetcorn', 'grains seed crumb', '*', 'yellow gold'],
  ['Sweet potato', 'wedge cut', 'root', 'orange gold tan'],
  ['Carrot puree', 'quenelle', 'smooth', 'orange'],
  ['Pumpkin puree', 'quenelle', 'smooth', 'orange'],
  ['Celeriac puree', 'quenelle', 'smooth', 'cream white'],
  ['Pea puree', 'quenelle', 'smooth', 'green'],
  ['Cauliflower puree', 'quenelle', 'smooth', 'white cream'],
  ['Onion rings', 'ring', '*', 'gold tan brown'],
  ['Braised red cabbage', '*', '*', 'purple red'],
  ['Roasted peppers', '*', '*', 'red orange'],
  ['Courgette', '*', '*', 'green'],
  ['Garlic', '*', '*', 'cream white tan'],
  ['Pickled red onion', '*', '*', 'purple pink red'],
  // --- Fruit
  ['Strawberries', 'ball coin heap', 'fruit', 'red'],
  ['Raspberries', 'heap', 'fruit', 'red pink'],
  ['Blueberries', 'heap', 'fruit', 'purple dark grey'],
  ['Lemon wedge', 'wedge', 'fruit', 'yellow'],
  ['Orange segments', '*', 'fruit', 'orange'],
  ['Poached pear', '*', 'fruit', 'cream tan gold yellow green'],
  ['Fresh figs', '*', 'fruit', 'purple dark red pink'],
  ['Sliced mango', 'slice', 'fruit', 'orange yellow gold'],
  ['Banana', 'slice coin baton', '*', 'yellow cream'],
  ['Caramelised apple', '*', 'fruit', 'gold tan brown orange'],
  // --- Dairy, eggs, desserts
  ['Vanilla ice cream', 'ball quenelle', 'smooth', 'cream white'],
  ['Chocolate fondant', 'dome cut', '*', 'brown dark'],
  ['Chocolate brownie', 'cut', '*', 'brown dark'],
  ['Cheesecake', 'wedge', '*', 'cream white tan'],
  ['Tiramisu', 'cut', '*', 'tan cream brown'],
  ['Panna cotta', 'dome', '*', 'cream white'],
  ['Whipped cream', 'quenelle', 'smooth', 'white cream'],
  ['Cheddar', 'slice', '*', 'gold orange yellow tan'],
  ['Shaved parmesan', 'slice crumb shard', '*', 'cream yellow gold'],
  ['Feta', 'cut', '*', 'white cream'],
  ['Goat cheese', 'coin ball cut quenelle', '*', 'white cream'],
  ['Poached egg', 'dome ball', '*', 'white cream yellow'],
  ['Egg yolk', 'dome', '*', 'yellow orange gold'],
  ['Tofu', 'cut', '*', 'white cream tan'],
  ['Halloumi', 'cut slice', '*', 'cream tan gold'],
  // --- Sauces and liquids
  ['Red wine jus', 'liquid', 'liquid', 'dark brown red'],
  ['Beurre blanc', 'liquid quenelle', '*', 'cream yellow'],
  ['Tomato sauce', 'liquid', 'liquid', 'red'],
  ['Basil pesto', 'liquid', 'liquid', 'green'],
  ['Hollandaise', 'liquid', 'liquid', 'yellow cream gold'],
  ['Beef gravy', 'liquid', 'liquid', 'brown dark'],
  ['Balsamic glaze', 'liquid', 'liquid', 'dark brown'],
  ['Aioli', 'liquid quenelle', '*', 'cream white yellow'],
  ['Lemon butter sauce', 'liquid', 'liquid', 'yellow cream gold'],
  ['Chimichurri', 'liquid', 'liquid', 'green'],
  ['Chocolate sauce', 'liquid', 'liquid', 'brown dark'],
  ['Raspberry coulis', 'liquid', 'liquid', 'red pink'],
  ['Tomato soup', 'liquid', 'liquid', 'red orange'],
  // --- Garnish and finishing
  ['Dill', 'sprig leaf', 'leaf', 'green'],
  ['Parsley', 'sprig leaf', 'leaf', 'green'],
  ['Chives', 'sprig leaf baton', '*', 'green'],
  ['Basil leaf', 'leaf', 'leaf', 'green'],
  ['Microgreens', 'leaf sprig', 'leaf', 'green'],
  ['Sesame seeds', 'seed', '*', 'cream tan white'],
  ['Toasted almonds', 'crumb seed', '*', 'tan brown gold'],
  ['Crispy shallots', 'crumb shard', '*', 'gold brown tan'],
  ['Lemon zest', 'crumb dust leaf', '*', 'yellow'],
  ['Sea salt', 'crumb dust', '*', 'white grey'],
  ['Edible flowers', 'leaf sprig', '*', '*'],
  ['Breadcrumbs', 'crumb', '*', 'gold tan'],
  // --- German and Eastern European, American diner, brunch, vegan
  ['Wiener schnitzel', 'disc', 'bread', 'gold tan'],
  ['Sauerbraten', 'cut', 'meat', 'brown dark'],
  ['Spaetzle', 'pile', 'strands', 'cream tan'],
  ['Pierogi', 'pillow', 'smooth', 'tan cream gold'],
  ['Borscht', 'liquid', 'liquid', 'red dark'],
  ['Cabbage rolls', 'dome', 'veg', 'green'],
  ['Kielbasa', 'baton', 'meat', 'brown'],
  ['Pecan pie', 'wedge', 'bread', 'brown'],
  ['Meatloaf', 'cut', 'meat', 'brown'],
  ['Cornbread', 'cut', 'bread', 'gold tan'],
  ['Tofu scramble', 'heap', 'smooth', 'yellow gold cream'],
  ['Nut roast', 'cut', 'bread', 'brown'],
  ['Hash browns', 'disc', 'bread', 'gold tan'],
  ['Kedgeree', 'grains', 'grain', 'gold tan cream'],
  ['Fried catfish', 'fillet', 'fish', 'gold tan'],
  ['Coconut shrimp', 'prawn', 'meat', 'gold tan cream'],
  ['Mozzarella sticks', 'baton', 'bread', 'cream white tan'],
  ['Kaiserschmarrn', 'heap', 'bread', 'gold tan'],
]

describe('what each food looks like', () => {
  it('has the form, the surface and the colour the food has', () => {
    const wrong: string[] = []
    for (const [name, shapes, kind, colours] of ROWS) {
      const garnish = /^(dill|parsley|chives|basil leaf|microgreens|sesame seeds|toasted almonds|crispy shallots|lemon zest|sea salt|edible flowers|breadcrumbs)$/i.test(name)
      const role = garnish ? 'garnish' : /sauce|jus|gravy|glaze|coulis|aioli|hollandaise|pesto|chimichurri|beurre|soup/i.test(name) ? 'sauce' : 'support'
      const shape = shapeFor(name, role)
      const k = kindFor(name)
      const hsl = ingredientHsl(name, role)
      const have = colourOf(hsl)
      const problems: string[] = []
      if (role !== 'sauce' && shapes !== '*' && !shapes.split(' ').includes(shape)) problems.push(`shape ${shape} (want ${shapes})`)
      if (kind !== '*' && !kind.split(' ').includes(k)) problems.push(`texture ${k} (want ${kind})`)
      if (colours !== '*' && !colours.split(' ').some((c) => have.includes(c as Colour))) problems.push(`colour [${hsl.join(',')}] reads ${have.join('/') || 'none'} (want ${colours})`)
      if (problems.length) wrong.push(`${name}: ${problems.join('; ')}`)
    }
    assert.equal(wrong.length, 0, `\n${wrong.join('\n')}`)
  })
})

describe('the food library covers every food the studio offers', () => {
  const offered = [...new Set([...TEMPLATE_COMPONENT_NAMES, ...KNOWN_INGREDIENTS])]

  it('gives each one a colour of its own, not one made up from its spelling', () => {
    const without = offered.filter((n) => !hasColour(n))
    assert.deepEqual(without, [])
  })

  it('gives each one a form, not the lumpy sphere that means the name was not recognised', () => {
    // A whole potato, celeriac or head of cauliflower really is a lumpy mound; everything else has a form of its own.
    const LUMPY = new Set(['potato', 'potatoes', 'celeriac', 'cauliflower', 'broccoli'])
    const unknown = offered.filter((n) => shapeFor(n, 'support') === 'blob' && !LUMPY.has(n.toLowerCase()))
    assert.deepEqual(unknown, [])
  })

  it('gives each one a surface painted for what it is', () => {
    const plain = offered.filter((n) => kindFor(n) === 'plain')
    assert.deepEqual(plain, [])
  })
})
