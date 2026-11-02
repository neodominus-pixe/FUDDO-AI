// What the shape and colour tables actually know.
//
// Both tables fall back rather than fail: a name they have never seen gets a
// soft mound in a hue hashed off its own letters, which renders happily and
// looks like nothing. So the only way to know what the studio has learned is to
// ask it about food it was not written against, and count.
//
// THE TRAP, and it caught this project twice: a corpus scores full marks against
// the tables that were written while looking at it. The first list below read
// 100% on shape and 100% on colour -- and a second list of 433 foods nobody had
// been looking at came out 47% lumpy sphere and 50% randomly coloured. Both of
// those lists are written in phrases, so a third list of single words then found
// 39 more, "mozzarella" and "lemon" among them.
//
// The only number that means anything is the one from food the tables have not
// met. A fourth list of 705 names, written on 2026-09-17 before this session
// opened lib/shapes.ts, scored 64% shape and 52% colour: the cold larder, the
// named sandwiches, the butchery cuts, the game birds, the whole modernist
// plating vocabulary and most of six more national menus.
//
// All four lists are answered now, and all four are therefore spent. The next
// audit needs a FIFTH, written without reading lib/shapes.ts first, and ideally
// from a real menu rather than from memory. The score printed below for
// anything already answered is not evidence of anything.
//
//   node scripts/food-coverage.mjs            what it knows, and what it does not
//   node scripts/food-coverage.mjs --verbose  every name and the form it resolved to
import { readFile } from 'node:fs/promises'
import { register } from 'node:module'
register('./ts-ext.mjs', import.meta.url)
const { shapeFor } = await import('../lib/shapes.ts')
const { ingredientHsl, hashHue, ROLE_FILL } = await import('../lib/palette.ts')
const { normalise } = await import('../lib/match.ts')

// A kitchen's worth of food, written the way a chef writes a component: some of
// it a dish, some of it an ingredient, some of it a preparation.
// Written in the first pass, while the tables themselves were being written.
const FIRST = `
beef patty, bottom bun, brioche bun, cheddar slice, gherkins, iceberg lettuce, beef tomato,
duck breast, pork belly, lamb rump, venison loin, ribeye, wagyu striploin, ox cheek, osso buco,
short rib, brisket, oxtail, pork chop, veal cutlet, chicken schnitzel, tonkatsu, katsu curry,
confit duck leg, chicken drumsticks, buffalo wings, scotch egg, haggis, black pudding,
cod fillet, halibut, sea bass, monkfish tail, turbot, lemon sole, mackerel fillet, sardines,
smoked salmon, gravlax, tuna sashimi, scallops, king prawns, langoustine, crab, lobster tail,
mussels, clams, oysters, razor clams, squid, calamari, octopus, crayfish, caviar, ikura,
nigiri, salmon maki, california roll, onigiri, gimbap, temaki, poke,
spaghetti, tagliatelle, pappardelle, linguine, bucatini, pici, mafaldine, orzo, ditalini,
penne, rigatoni, macaroni, fusilli, farfalle, orecchiette, gnocchi, cavatelli, spaetzle,
ravioli, tortellini, agnolotti, gyoza, wontons, har gow, siu mai, momo, khinkali, pierogi,
carbonara, cacio e pepe, aglio e olio, bolognese, amatriciana, puttanesca, lasagne,
pad thai, pad see ew, chow mein, lo mein, yakisoba, japchae, mee goreng, dan dan noodles,
ramen, udon, soba, glass noodles, rice noodles, pho, laksa, tom yum, tom kha, miso soup,
risotto, paella, biryani, pilaf, jollof rice, jambalaya, fried rice, sticky rice, congee,
couscous, quinoa, bulgur, freekeh, farro, tabbouleh, lentils, chickpeas, black beans, baked beans,
gazpacho, vichyssoise, minestrone, borscht, goulash, cassoulet, chilli con carne, gumbo,
bouillabaisse, cioppino, shakshuka, stroganoff, blanquette, pot au feu, feijoada, harira,
tagine, korma, tikka masala, butter chicken, vindaloo, rogan josh, madras, jalfrezi, dal,
chicken tikka, seekh kebab, shish kebab, souvlaki, satay skewers, yakitori, brochette, shawarma,
taco, quesadilla, burrito, enchiladas, tostada, arepa, pupusa, empanada, samosa, pakora,
spring rolls, lumpia, egg rolls, dosa, idli, uttapam, poppadoms, naan, roti, chapati, paratha,
pita, lavash, focaccia, ciabatta, sourdough, baguette, bagel, english muffin, crumpet,
pizza, pizza slice, calzone, lahmacun, manakish, khachapuri, flatbread, socca,
moussaka, pastitsio, parmigiana, gratin dauphinoise, mac and cheese, cauliflower cheese,
shepherds pie, cottage pie, fish pie, pork pie, steak pie, pasty, sausage roll, wellington,
yorkshire pudding, toad in the hole, bubble and squeak, bangers, chipolatas, bratwurst,
hot dog, frankfurter, merguez, chorizo, salami, pepperoni, mortadella, bresaola, prosciutto,
burrata, bocconcini, feta, halloumi, paneer, brie, camembert, manchego, gorgonzola, goats cheese,
parmesan shavings, grated pecorino, whipped ricotta, mascarpone, creme fraiche, tzatziki,
hummus, baba ganoush, guacamole, tapenade, taramasalata, kimchi, sauerkraut, pickles,
mashed potato, pommes puree, roast potatoes, new potatoes, fondant potato, dauphinoise,
chips, skinny fries, potato wedges, hash brown, rosti, latke, tater tots, poutine,
onion rings, calamari rings, tempura prawns, chicken nuggets, goujons, scampi, falafel,
asparagus spears, baby leeks, spring onions, tenderstem broccoli, cauliflower florets,
brussels sprouts, edamame, broad beans, green beans, okra, courgette, aubergine, romanesco,
carrot batons, julienne celeriac, diced onion, caramelised onions, shallots, garlic cloves,
roasted squash, charred hispi cabbage, ratatouille, caponata, stir fried greens,
rocket, watercress, baby spinach, lollo rosso, frisee, endive, radicchio, pak choi, cavolo nero,
samphire, seaweed, nori, pea shoots, bean sprouts, micro cress, chervil, dill, chives, tarragon,
edible flowers, nasturtium, viola, marigold,
lemon wedge, lime wedges, orange segments, watermelon, cantaloupe, papaya, mango cheeks,
apple, pear, figs, peaches, apricots, plums, cherries, grapes, blueberries, raspberries,
blackberries, pomegranate seeds, passion fruit, lychee, kiwi, dates, banana, plantain,
pineapple rings, poached pear, rhubarb, gooseberry,
cake, chocolate cake, cheesecake, victoria sponge, gateau, brownie, blondie, flapjack,
apple pie, tarte tatin, key lime pie, lemon tart, custard tart, pastel de nata, quiche,
croissant, pain au chocolat, doughnut, eclair, profiteroles, cannoli, baklava, tiramisu,
panna cotta, creme brulee, creme caramel, flan, pavlova, meringue, macarons, mochi,
ice cream, gelato, sorbet, semifreddo, kulfi, affogato, trifle, sticky toffee pudding,
christmas pudding, lamington, turkish delight, halva, nougat, marshmallow, fudge, praline,
granola, crumble, streusel, panko, furikake, dukkah, zaatar, gremolata, sea salt flakes,
hazelnuts, pecans, cashews, macadamias, peanuts, pistachios, chestnuts, pine nuts, sesame seeds,
pumpkin seeds, sunflower seeds, chia, cocoa nibs, chocolate chips, bacon bits, croutons,
red wine jus, gravy, hollandaise, bearnaise, beurre blanc, white wine sauce, peppercorn sauce,
pesto, chimichurri, romesco, salsa verde, harissa, tahini, aioli, mayonnaise, ketchup,
tomato sauce, ragu, arrabbiata, alfredo, teriyaki, ponzu, soy glaze, chilli oil, herb oil,
scrambled eggs, poached egg, fried egg, boiled egg, omelette, frittata, shakshuka eggs,
porridge, oatmeal, pancakes, waffles, french toast, blini, crepes, hash,
butter, honey, maple syrup, jam, marmalade, compote, chutney, pickled shallots,
truffle shavings, saffron, paprika, turmeric, sumac, black pepper, chilli flakes
`
  .split(/[,\n]/)
  .map((s) => s.trim())
  .filter(Boolean)

// The audit of 2026-09-17: food the tables had never been shown. Whole roasts,
// mushrooms, offal, crisps, the classical potato repertoire, and the menu of
// about fifteen countries. Nearly half of it was plating as a lumpy sphere.
const AUDIT = `
whole roast chicken, roast turkey crown, whole sea bream, whole lemon sole, crispy whole seabass,
rack of lamb, lamb rack, crown of lamb, tomahawk steak, beef wellington slice, chateaubriand,
porchetta, roast beef, sunday roast, pot roast, pulled pork, brisket burnt ends, beef short ribs,
corn fed chicken supreme, poussin, spatchcock chicken, chicken thigh, turkey escalope,
soft shell crab, king crab leg, whole lobster, lobster thermidor, dressed crab, crab claw,
razor clam, sea urchin, uni, abalone, whelks, cuttlefish, baby squid, whitebait, anchovy,
soft boiled egg, egg yolk, cured egg yolk, egg white, meringue kisses, omelette roll,
tortilla chips, nachos, pretzel, breadsticks, melba toast, oatcake, water biscuit,
brioche, challah, cornbread, soda bread, pumpernickel, pretzel bun, milk bun,
cheese toastie, welsh rarebit, eggs benedict, eggs royale, avocado toast, beans on toast,
full english, black forest gateau, banoffee pie, eton mess, bakewell tart, treacle tart,
sticky rice cake, rice pudding, semolina, tapioca, panna, blancmange, junket,
choux bun, croquembouche, opera cake, madeleine, financier, canele, kouign amann, palmier,
danish pastry, cinnamon roll, babka, strudel, galette des rois, mille crepe,
hot cross bun, scotch pancake, drop scone, welsh cake, bara brith, tea cake,
kale chips, crispy seaweed, vegetable crisps, parsnip crisps, beetroot crisps,
celeriac remoulade, coleslaw, potato salad, russian salad, macaroni salad, three bean salad,
pickled ginger, wasabi, gari, umeboshi, takuan, daikon, lotus root, bamboo shoot, water chestnut,
enoki, shiitake, oyster mushroom, chestnut mushroom, girolle, chanterelle, morel, truffle,
king oyster mushroom, portobello, button mushroom, mushroom duxelles,
jerusalem artichoke, globe artichoke, artichoke heart, cardoon, salsify, kohlrabi, celeriac,
sweetcorn ribs, corn ribs, creamed corn, cornbread muffin, polenta chips, polenta cake,
tofu puff, silken tofu, yuba, natto, miso, tempeh steak, jackfruit, seitan steak,
cashew cheese, vegan sausage, beyond burger, black bean burger, mushroom burger,
pork scratchings, chicharron, crackling, lardon, pancetta, guanciale, nduja, saucisson,
boudin noir, boudin blanc, white pudding, faggots, tripe, sweetbread, foie gras, liver,
kidney, heart, tongue, marrow bone, bone marrow, brain, gizzard, chicken liver parfait,
sourdough crumpet, english breakfast tea, espresso, matcha, affogato al caffe,
cheese board, charcuterie board, antipasti, crudites, dips, olives and nuts,
lemon curd, passion fruit curd, salted caramel, butterscotch, chocolate sauce, raspberry coulis,
candied pecans, honeycomb, brittle shards, tuile shard, chocolate shard, gold leaf,
dehydrated raspberry, freeze dried strawberry, fruit leather, meringue shard,
apple crisp, pear crisp, beet crisp, parsnip crisp, kale crisp,
sourdough discard cracker, seeded cracker, rye crispbread, grissini stick,
pomme anna, pommes dauphine, gaufrette, pont neuf, pommes souffle, duchesse potato,
confit garlic, black garlic, roasted garlic, garlic puree, onion petals, charred leek,
burnt onion powder, ash, squid ink, charcoal, activated charcoal,
sesame tuile, parmesan crisp, frico, tuile, lace crisp, cracker bread,
pea puree, carrot puree, cauliflower puree, celeriac puree, jerusalem artichoke puree,
apple puree, beetroot puree, sweetcorn puree, parsnip puree, swede puree,
smoked eel, smoked mackerel pate, kipper, bloater, arbroath smokie, cullen skink,
potted shrimp, devilled kidneys, scotch woodcock, angels on horseback,
fish finger, fish goujon, fish and chips, battered cod, scampi fries,
prawn cracker, shrimp toast, sesame prawn toast, crispy duck pancake, duck pancake,
salt and pepper squid, kung pao chicken, mapo doufu, twice cooked pork, char siu bao,
turnip cake, radish cake, cheung fun, lo bak go, egg tart, pineapple bun,
jian bing, scallion pancake, sesame ball, wife cake, mooncake,
bibim guksu, naengmyeon, tteokguk, samgyetang, sundubu, haemul pajeon, pajeon,
kimbap, tteok galbi, jjigae, doenjang jjigae, bossam, jokbal,
nasi lemak, rendang daging, roti jala, murtabak, laksa lemak, char siew rice,
hainanese chicken rice, bak kut teh, chai tow kway, popiah, rojak, otak otak,
adobo, sinigang, kare kare, lechon, sisig, halo halo, bibingka, puto,
arroz con pollo, arepa de queso, cachapa, patacon, tostones, yuca frita,
chimichanga, taquito, sope, huarache, tlayuda, elote loco,
pupusa revuelta, baleada, gallo pinto, casado, ropa vieja cubana,
moqueca, acaraje, pao de queijo, brigadeiro, coxinha de frango,
milanesa, provoleta, choripan, empanada mendocina, dulce de leche,
injera platter, doro wot, kitfo, tibs, shiro, misir wot,
couscous royale, mechoui, pastilla au pigeon, briouat, zaalouk,
kushari, ful, taameya, molokhia, mahshi, fattah,
manti turkish, iskender, adana kebab, lahmacun durum, pide bread, simit,
khachapuri adjaruli, chakhokhbili, satsivi, badrijani,
pelmeni siberian, blini with caviar, olivier salad, herring under a fur coat,
solyanka, shchi, okroshka, syrniki, medovik, ptichye moloko,
smorgasbord, gravadlax, janssons frestelse, kottbullar med gradsas, raggmunk,
rullepolse, frikadeller, stegt flaesk, smorrebrod med rejer,
rakfisk, lutefisk, fiskeboller, lapskaus, farikal,
karjalanpiirakka, kalakukko, leipajuusto, ruisleipa,
poutine quebecoise, tourtiere, beaver tail, nanaimo bar, butter tart,
clam chowder, lobster roll, po boy, jambalaya creole, shrimp and grits,
biscuits and gravy, chicken fried steak, meatloaf, cornbread dressing,
buffalo wing, philly cheesesteak, sloppy joe, corn dog, funnel cake,
key lime, pecan pie, red velvet, whoopie pie, monkey bread,
pavlova with berries, lamington sponge, anzac biscuit, fairy bread, meat pie aussie,
hangi, hokey pokey, kumara, paua, rewena bread
`
  .split(/[,\n]/)
  .map((s) => s.trim())
  .filter(Boolean)

// And a third list, of single words rather than dishes -- because that is the
// other way a chef writes a component, and both lists above are written in
// phrases. Neither of them caught that "mozzarella", "lemon" and "chocolate"
// were still plating as lumpy spheres.
const BARE = `
mozzarella, burrata, ricotta, stracciatella, provolone, gruyere, comte, emmental, gouda, taleggio,
cheddar, parmesan, pecorino, gorgonzola, mascarpone, halloumi, feta, paneer, curd, yoghurt,
beef, pork, lamb, chicken, duck, veal, venison, rabbit, turkey, goose,
cod, salmon, tuna, bass, bream, plaice, sole, trout, hake, monkfish,
prawns, scallops, mussels, oysters, squid, octopus, crab, lobster, clams,
potato, carrot, onion, leek, celery, fennel, spinach, kale, cabbage, broccoli,
cauliflower, pepper, aubergine, courgette, tomato, cucumber, radish, beetroot, turnip, swede,
peas, beans, lentils, chickpeas, rice, pasta, noodles, bread, butter, cream,
egg, eggs, yolk, mushroom, mushrooms, truffle, garlic, shallot, ginger, chilli,
lemon, lime, orange, apple, pear, peach, berry, grape, fig, date,
chocolate, caramel, vanilla, coffee, honey, sugar, flour, salt, pepper, oil,
jus, stock, wine, cider, beer, vinegar, mustard, mayonnaise, ketchup, soy,
pastry, dough, batter, crumb, glaze, foam, gel, powder, crisp, shard,
salad, slaw, pickle, chutney, relish, jam, mousse, sorbet, custard
`
  .split(/[,\n]/)
  .map((s) => s.trim())
  .filter(Boolean)

// The fourth list, written 2026-09-17 against the brief "all food, all types"
// and -- the only thing that makes it worth anything -- written before opening
// lib/shapes.ts in this session. It goes at the categories the first three
// never asked about: raw and cured preparations, sandwiches, named salads and
// soups, butchery cuts, game birds, the modernist plating vocabulary, whole
// spices, dairy beyond cheese, and the parts of the Chinese, Indian, Levantine,
// west African, French and Italian menus the audit list only brushed.
const WIDE = `
carpaccio, beef tartare, steak tartare, tuna tartare, ceviche, crudo, tataki, escabeche, aspic,
terrine, terrine slice, galantine, ballotine, roulade, quenelle, rillettes, pate en croute,
mousseline, farce, confit, brandade, brawn, headcheese, pastrami, corned beef, biltong, jerky,
coppa, speck, jamon iberico, lonza, capocollo, soppressata, kielbasa, andouille, boerewors,
smash burger, slider, cheeseburger, double cheeseburger, patty melt, club sandwich, blt,
reuben, croque monsieur, croque madame, banh mi, torta, gyro, panini, muffuletta, tuna melt,
egg salad sandwich, cucumber sandwich, chip butty, bacon sandwich, cubano,
caesar salad, greek salad, waldorf salad, nicoise salad, cobb salad, panzanella, fattoush,
som tam, caprese, chopped salad, beetroot salad, quinoa salad, seaweed salad, wedge salad,
consomme, bisque, chowder, broth, avgolemono, mulligatawny, french onion soup, egg drop soup,
wonton soup, chicken noodle soup, pea and ham soup, lentil soup, tomato soup, mushroom soup,
sirloin, fillet steak, rump steak, flank steak, skirt steak, bavette, hanger steak, picanha,
tri tip, chuck, shank, neck fillet, saddle of lamb, loin chop, spare ribs, baby back ribs,
pork trotter, pig cheek, lamb shank, beef cheek, pigs knuckle, meatball, meatballs, kofta,
pheasant, partridge, grouse, quail, pigeon, woodcock, hare, wild boar, kangaroo, ostrich,
guinea fowl, mallard, snipe, wood pigeon breast, rabbit loin,
quail egg, duck egg, century egg, tea egg, pickled egg, sous vide egg, egg custard, tamagoyaki,
chawanmushi, agedashi tofu, karaage, takoyaki, okonomiyaki, unagi, sukiyaki, shabu shabu,
donburi, katsudon, oyakodon, gyudon, chirashi, tsukemen, tonkotsu ramen, mentaiko, dorayaki,
taiyaki, daifuku, anko, yakiniku, natto rice, soba salad,
peking duck, xiao long bao, sheng jian bao, mantou, youtiao, hot pot, chow fun, dry pot,
salt baked chicken, drunken chicken, tofu skin, dim sum basket, dan dan, ma po tofu,
green curry, red curry, massaman curry, panang curry, khao soi, larb, banh xeo, bun cha,
goi cuon, cha ca, com tam, banh cuon, pandan chicken, mango sticky rice,
thali, chana masala, aloo gobi, saag paneer, baingan bharta, rajma, sambar, rasam, kulcha,
bhatura, pav bhaji, vada pav, dhokla, khandvi, papdi chaat, bhel puri, pani puri, raita, achar,
gulab jamun, rasgulla, barfi, laddu, halwa, kheer, ras malai, jalebi, falooda,
mezze, muhammara, labneh, fatteh, kibbeh, sambousek, warak enab, makloubeh, mansaf, musakhan,
knafeh, maamoul, basbousa, qatayef, batata harra, mutabal, shanklish,
bobotie, chakalaka, pap, suya, egusi soup, fufu, banku, waakye, moin moin, chin chin,
bunny chow, piri piri chicken, peri peri wings,
schnitzel, sauerbraten, rouladen, currywurst, doner kebab, flammkuchen, kartoffelsalat,
knodel, leberkase, weisswurst, tartiflette, choucroute, aligot, vol au vent, coq au vin,
boeuf bourguignon, sole meuniere, steak frites, fondue, raclette, gougere,
tapas, patatas bravas, tortilla espanola, gambas al ajillo, pulpo a la gallega, croquetas,
pan con tomate, escalivada, fideua, pisto, churros, bacalhau, francesinha, caldo verde,
arancini, supli, vitello tonnato, saltimbocca, bistecca, piadina, cacciucco, polenta e funghi,
margherita pizza, pepperoni pizza, quattro formaggi, deep dish pizza, sicilian slice,
cannelloni, manicotti, paccheri, casarecce, trofie, strozzapreti, garganelli, tagliolini,
capellini, vermicelli, conchiglie, radiatori, rotini, cappelletti, culurgiones, malloreddus,
bigoli, fregola, lumache, campanelle, pasta alla norma, vongole,
barley, millet, amaranth, buckwheat, wild rice, basmati rice, jasmine rice, arborio rice,
sushi rice, grits, cornmeal, wheat berries, split peas, butter beans, cannellini beans,
borlotti beans, kidney beans, fava beans, mung beans, soybeans, adzuki beans, black eyed peas,
wakame, kombu, dulse, hijiki, agar, sea lettuce, kelp,
persimmon, guava, dragonfruit, starfruit, durian, mangosteen, rambutan, longan, tamarind,
quince, cranberries, redcurrants, blackcurrants, elderberries, mulberries, physalis, nectarine,
clementine, tangerine, grapefruit, blood orange, kumquat, yuzu, calamansi, coconut, avocado,
green olives, black olives, prickly pear, damson, greengage, loquat, strawberry, melon,
chard, collard greens, mustard greens, choy sum, gai lan, mizuna, tatsoi, escarole, sorrel,
purslane, dandelion greens, parsnip, sweet potato, yam, cassava, taro, chayote, bitter melon,
tomatillo, poblano, jalapeno, habanero, serrano, padron peppers, shishito, banana pepper,
sun dried tomatoes, cherry tomatoes, heirloom tomato, vine tomatoes, pumpkin, butternut squash,
acorn squash, delicata squash, spaghetti squash, marrow, cucumber ribbons, pickled cucumber,
almonds, walnuts, brazil nuts, nut butter, peanut butter, flaked almonds, candied walnuts,
sourdough loaf, boule, batard, dinner roll, breadcrumbs, toast, garlic bread, bruschetta,
crostini, canape, tartlet, pie crust, lattice pie, turnover, hand pie, bao bun, steamed bun,
pandesal, panettone, stollen, fougasse, tortilla wrap, corn tortilla, injera,
cupcake, muffin, scone, shortbread, biscotti, cookie, chocolate chip cookie, gingerbread,
cake pop, swiss roll, baked alaska, souffle, clafoutis, bread and butter pudding, spotted dick,
syllabub, posset, zabaglione, sabayon, ganache, chocolate truffle, bonbon, toffee apple,
candy floss, lollipop, jelly, gummy bears, sundae, banana split, milkshake, beignet, zeppole,
loukoumades, granita, shaved ice, bingsu, kakigori, ice lolly, frozen yoghurt, soft serve,
cereal, muesli, cornflakes, bircher muesli, smoothie bowl, acai bowl, overnight oats,
yoghurt parfait, breakfast burrito, fruit salad, compote of berries,
fried chicken, popcorn chicken, chicken wrap, kebab wrap, gyros wrap, falafel wrap,
shawarma plate, loaded fries, cheese fries, curly fries, waffle fries, mozzarella sticks,
jalapeno poppers, chicken burger, fish burger, veggie burger,
bechamel, veloute, espagnole, demi glace, bordelaise, chasseur, sauce diane, au poivre,
mushroom sauce, cheese sauce, tartare sauce, remoulade, ranch dressing, blue cheese dressing,
thousand island, vinaigrette, nuoc cham, sriracha, gochujang, doubanjiang, xo sauce,
oyster sauce, hoisin, fish sauce, miso glaze, yuzu kosho, compound butter,
shiso, perilla, curry leaf, kaffir lime leaf, lemongrass, galangal, thai basil, mint,
coriander leaf, parsley, basil, oregano, rosemary sprig, thyme sprig, sage leaf, bay leaf,
cinnamon stick, star anise, cardamom pods, cloves, nutmeg, vanilla pod, juniper berries,
fennel seeds, coriander seeds, cumin seeds, saffron threads, peppercorns, mustard seeds,
spherification pearls, caviar pearls, espuma, fluid gel, gel cube, savoury air, dehydrated dust,
snow, crumb soil, edible soil, smear, swoosh, dot of puree, drizzle, herb dust, nest of noodles,
tower, medallion, escalope, paupiette, mille feuille, brunoise, chiffonade,
clotted cream, buttermilk, skyr, quark, queso fresco, cotija, labneh cheese, cheese wheel,
cheese cubes, blue cheese, stilton, roquefort, wensleydale, red leicester,
fontina, raclette cheese, cream cheese, cottage cheese, sour cream, double cream, whipped cream,
bone broth, smoked butter, whipped butter, cultured cream, ghee, lard, duck fat, beef dripping,
chicken caesar wrap, pasta salad, rice salad, noodle salad, buddha bowl, grain bowl, poke bowl,
burrito bowl, salad bowl,
tofu, firm tofu, tofu steak, soy mince, pea protein patty, halloumi fries,
courgette fritters, corn fritters, hush puppies, croquette, potato croquette, bubble waffle,
lardo, pancetta cubes, crispy shallots, crispy onions, fried capers, capers, caperberries,
cornichons, pickled walnuts, piccalilli, horseradish, wasabi peas,
sea bream fillet, red mullet, john dory, brill, megrim, pollock, coley, gurnard, sprats,
herring, trout fillet, arctic char, barramundi, snapper, grouper, swordfish,
marlin, skate wing, eel, elver, roe, bottarga, salmon roe, cod roe, lumpfish roe,
periwinkles, cockles, scallop roe, langoustine tail, brown shrimp, tiger prawn, crawfish,
apple tart, plum tart, fig tart, pear tart, frangipane tart, treacle sponge,
chocolate fondant, lava cake, cheesecake slice, carrot cake, coffee cake, lemon drizzle,
battenberg, fruit cake, simnel cake, yule log, buche de noel,
gelato scoop, sorbet scoop, ice cream scoop, ice cream cone, choc ice
`
  .split(/[,\n]/)
  .map((s) => s.trim())
  .filter(Boolean)

const OLD = new Set([...FIRST, ...AUDIT, ...BARE].map(normalise))
const CORPUS = [...new Set([...FIRST, ...AUDIT, ...BARE, ...WIDE])]

const verbose = process.argv.includes('--verbose')
const shapeMiss = []
const colourMiss = []
const forms = new Map()
// The honest number: the fourth list minus anything the earlier three already
// taught the tables. Everything else here has been answered at least once.
const fresh = WIDE.filter((n) => !OLD.has(normalise(n)))
const freshSet = new Set(fresh)
const freshShapeMiss = []
const freshColourMiss = []

for (const name of CORPUS) {
  const family = shapeFor(name, 'hero')
  forms.set(family, (forms.get(family) ?? 0) + 1)
  if (family === 'blob') shapeMiss.push(name)
  if (freshSet.has(name) && family === 'blob') freshShapeMiss.push(name)
  // The colour table falls back to the role's own hue, shifted by a hash of the
  // name. Landing exactly on that is how we know nothing matched.
  const [h, s, l] = ingredientHsl(name, 'hero')
  const [rh, rs, rl] = ROLE_FILL.hero
  if (h === (rh + hashHue(name)) % 360 && s === rs && l === rl) {
    colourMiss.push(name)
    if (freshSet.has(name)) freshColourMiss.push(name)
  }
  if (verbose) console.log(`${name.padEnd(26)} ${family.padEnd(9)} hsl(${h} ${s}% ${l}%)`)
}

const pc = (n, of = CORPUS.length) => `${((100 * n) / of).toFixed(1)}%`
console.log(`\n${CORPUS.length} names tested`)
console.log(`  shape recognised  ${pc(CORPUS.length - shapeMiss.length)}  (${shapeMiss.length} fall back to a lumpy sphere)`)
console.log(`  colour recognised ${pc(CORPUS.length - colourMiss.length)}  (${colourMiss.length} fall back to a hashed hue)`)
console.log(`\n${fresh.length} of those are the fourth list, food never asked about before -- the only honest score`)
console.log(`  shape recognised  ${pc(fresh.length - freshShapeMiss.length, fresh.length)}  (${freshShapeMiss.length} lumpy spheres)`)
console.log(`  colour recognised ${pc(fresh.length - freshColourMiss.length, fresh.length)}  (${freshColourMiss.length} hashed hues)`)
console.log(`\nforms used: ${[...forms].sort((a, b) => b[1] - a[1]).map(([f, n]) => `${f} ${n}`).join(', ')}`)
if (freshShapeMiss.length) console.log(`\nno shape (fourth list): ${freshShapeMiss.join(', ')}`)
if (freshColourMiss.length) console.log(`\nno colour (fourth list): ${freshColourMiss.join(', ')}`)
if (shapeMiss.length) console.log(`\nno shape (all): ${shapeMiss.join(', ')}`)
if (colourMiss.length) console.log(`\nno colour (all): ${colourMiss.join(', ')}`)

// --- Keys that shadow each other -----------------------------------------
// Both tables are "first match in a list sorted by key length", so declaring the
// same key twice with two different answers is not an error -- it is a silent
// loss, and the entry further down the file simply never runs. Two of these had
// been sitting in the shape table long enough to be invisible. Cheap to check.
// Compared within a table rather than across the file: the same key in two
// different tables is not a clash. "Vongole" is a shell in the shape table and
// a bowl of pasta in the dish-named-after-its-sauce table, and both are right.
const TABLES = {
  'lib/shapes.ts': [['SHAPES', 'WORLD', 'KITCHEN', 'MENU'], ['PREP'], ['DISH_SAUCE']],
  'lib/palette.ts': [['INGREDIENTS', 'WORLD_COLOURS', 'KITCHEN_COLOURS', 'MENU_COLOURS']],
}

for (const [file, groups] of Object.entries(TABLES)) {
  const text = await readFile(file, 'utf8')
  // Every entry, tagged with whichever `const NAME` was most recently opened.
  const found = []
  let current = null
  for (const m of text.matchAll(/^const (\w+)|\['([^']+)',\s*(?:'([a-zA-Z]+)'|(\[[^\]]*\]))\]/gm)) {
    if (m[1]) current = m[1]
    else found.push([current, normalise(m[2]), m[3] ?? m[4]])
  }

  let entries = 0
  let clashes = 0
  for (const group of groups) {
    const seen = new Map()
    for (const [table, key, value] of found) {
      if (!group.includes(table)) continue
      entries++
      if (!seen.has(key)) seen.set(key, value)
      else if (seen.get(key) !== value) {
        clashes++
        console.log(`  ${file} [${group.join('+')}]: "${key}" is ${seen.get(key)} and again ${value} -- the first wins`)
      }
    }
  }
  console.log(`${file}: ${entries} entries across ${groups.length} tables, ${clashes} shadowed`)
}
