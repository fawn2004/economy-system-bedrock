import { ItemStack, ItemTypes } from "@minecraft/server";

// ============================================================================
//  ITEMS: RARITY, STATS, CUSTOM ITEMS, REFORGES, ENCHANTMENTS, STARS
//  Custom items are vanilla items with a name and lore. Their data is in
//  hidden lore lines, so they stack, trade and survive like normal items:
//    §8eco:it:<item id or ->:<rarity>:<reforge>:<stars>
//    §8eco:en:<code><level>,<code><level>...
//  Everything else in the lore is rebuilt from that data by renderItem().
// ============================================================================

export const IT_TAG = "§8eco:it:";
export const EN_TAG = "§8eco:en:";

export const RARITIES = [
  { name: "COMMON", color: "§f" },
  { name: "UNCOMMON", color: "§a" },
  { name: "RARE", color: "§9" },
  { name: "EPIC", color: "§5" },
  { name: "LEGENDARY", color: "§6" },
  { name: "MYTHIC", color: "§d" },
];

// Stats. Health is in half-hearts (vanilla health points), the rest are numbers/percent.
export const STATS = {
  dmg: { name: "Damage", sym: "⚔", color: "§c" },
  str: { name: "Strength", sym: "❁", color: "§c" },
  cc: { name: "Crit Chance", sym: "☣", color: "§9", pct: true },
  cd: { name: "Crit Damage", sym: "☠", color: "§9", pct: true },
  hp: { name: "Health", sym: "❤", color: "§c" },
  def: { name: "Defense", sym: "❈", color: "§a" },
  spd: { name: "Speed", sym: "✦", color: "§f" },
  int: { name: "Intelligence", sym: "✎", color: "§b" },
  mf: { name: "Magic Find", sym: "✯", color: "§b" },
  ms: { name: "Mining Speed", sym: "⸕", color: "§6" },
  mfo: { name: "Mining Fortune", sym: "☘", color: "§6" },
  ffo: { name: "Farming Fortune", sym: "☘", color: "§6" },
  wfo: { name: "Foraging Fortune", sym: "☘", color: "§6" },
  scc: { name: "Sea Creature Chance", sym: "α", color: "§3", pct: true },
};
export const STAT_ORDER = Object.keys(STATS);

const pretty = (id) => id.replace(/^[a-z_]+:/, "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const roman = (n) => ["0", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV"][n] ?? String(n);
export const exists = (id) => {
  try {
    return !!ItemTypes.get(id);
  } catch {
    return false;
  }
};

// ---- item kinds -------------------------------------------------------------------
/** "sword" | "bow" | "helmet" | "chestplate" | "leggings" | "boots" | "pickaxe" | "axe" | "hoe" | "rod" | "wand" | "accessory" | "material" | undefined */
export function kindOf(typeId, def) {
  if (def?.kind) return def.kind;
  const id = typeId.replace(/^minecraft:/, "");
  if (/_sword$|^mace$|^trident$/.test(id)) return "sword";
  if (/^bow$|^crossbow$/.test(id)) return "bow";
  if (/_helmet$|^turtle_helmet$/.test(id)) return "helmet";
  if (/_chestplate$|^elytra$/.test(id)) return "chestplate";
  if (/_leggings$/.test(id)) return "leggings";
  if (/_boots$/.test(id)) return "boots";
  if (/_pickaxe$/.test(id)) return "pickaxe";
  if (/_axe$/.test(id)) return "axe";
  if (/_hoe$/.test(id)) return "hoe";
  if (id === "fishing_rod") return "rod";
  return undefined;
}
export const isWeaponKind = (k) => k === "sword" || k === "bow" || k === "wand";
export const isArmorKind = (k) => k === "helmet" || k === "chestplate" || k === "leggings" || k === "boots";
export const isToolKind = (k) => k === "pickaxe" || k === "axe" || k === "hoe" || k === "rod";
const KIND_LABEL = { sword: "WEAPON", bow: "BOW", wand: "WAND", helmet: "HELMET", chestplate: "CHESTPLATE", leggings: "LEGGINGS", boots: "BOOTS", pickaxe: "PICKAXE", axe: "AXE", hoe: "HOE", rod: "FISHING ROD", accessory: "ACCESSORY", material: "MATERIAL" };

/** Default rarity of a plain vanilla item. */
export function vanillaRarity(typeId) {
  const id = typeId.replace(/^minecraft:/, "");
  if (/^netherite_|^mace$|^elytra$/.test(id)) return 3;
  if (/^diamond_|^trident$/.test(id)) return 2;
  if (/^iron_|^chainmail_|^bow$|^crossbow$|^turtle_helmet$/.test(id)) return 1;
  return 0;
}

// ---- custom items ------------------------------------------------------------------
// id: { name, item (vanilla base), rarity, kind?, stats, ability?, passive?, desc?, price?, shop?, source?, dungeon? }
//  ability: { id, name, mana, cooldown (s), desc }
//  passive: { lifesteal: % of damage healed, ... } handled in stats.js
//  shop: "equipment" | "accessories" - sold in the Shop for `price`
//  family/tier: accessories of one family don't stack, only the best counts
export const ITEMS = {
  // ---- shop equipment ----
  adventurer_sword: { name: "Adventurer's Sword", item: "minecraft:iron_sword", rarity: 1, stats: { dmg: 3, str: 10 }, shop: "equipment", price: 10000 },
  hunter_bow: { name: "Hunter's Bow", item: "minecraft:bow", rarity: 1, stats: { dmg: 3, cc: 5, cd: 10 }, shop: "equipment", price: 15000 },
  knight_helmet: { name: "Knight Helmet", item: "minecraft:iron_helmet", rarity: 1, stats: { def: 10, hp: 2 }, shop: "equipment", price: 6000, set: "knight" },
  knight_chestplate: { name: "Knight Chestplate", item: "minecraft:iron_chestplate", rarity: 1, stats: { def: 25, hp: 4 }, shop: "equipment", price: 12000, set: "knight" },
  knight_leggings: { name: "Knight Leggings", item: "minecraft:iron_leggings", rarity: 1, stats: { def: 20, hp: 3 }, shop: "equipment", price: 10000, set: "knight" },
  knight_boots: { name: "Knight Boots", item: "minecraft:iron_boots", rarity: 1, stats: { def: 10, hp: 2 }, shop: "equipment", price: 6000, set: "knight" },
  farmer_helmet: { name: "Harvester Hat", item: "minecraft:leather_helmet", rarity: 1, stats: { ffo: 10, spd: 2 }, shop: "equipment", price: 40000 },
  farmer_chestplate: { name: "Harvester Tunic", item: "minecraft:leather_chestplate", rarity: 1, stats: { ffo: 15, hp: 2 }, shop: "equipment", price: 60000 },
  farmer_leggings: { name: "Harvester Trousers", item: "minecraft:leather_leggings", rarity: 1, stats: { ffo: 12, spd: 2 }, shop: "equipment", price: 50000 },
  farmer_boots: { name: "Harvester Boots", item: "minecraft:leather_boots", rarity: 1, stats: { ffo: 8, spd: 4 }, shop: "equipment", price: 40000 },
  miner_helmet: { name: "Prospector Helmet", item: "minecraft:golden_helmet", rarity: 1, stats: { mfo: 10, def: 5 }, shop: "equipment", price: 40000 },
  miner_chestplate: { name: "Prospector Chestplate", item: "minecraft:golden_chestplate", rarity: 1, stats: { mfo: 15, def: 10 }, shop: "equipment", price: 60000 },
  miner_leggings: { name: "Prospector Leggings", item: "minecraft:golden_leggings", rarity: 1, stats: { mfo: 12, def: 8 }, shop: "equipment", price: 50000 },
  miner_boots: { name: "Prospector Boots", item: "minecraft:golden_boots", rarity: 1, stats: { mfo: 8, ms: 10 }, shop: "equipment", price: 40000 },
  lumber_axe: { name: "Lumberjack Axe", item: "minecraft:diamond_axe", rarity: 2, stats: { wfo: 30, ms: 20 }, shop: "equipment", price: 100000 },
  miner_pick: { name: "Prospector Pickaxe", item: "minecraft:diamond_pickaxe", rarity: 2, stats: { mfo: 30, ms: 30 }, shop: "equipment", price: 150000 },
  angler_rod: { name: "Angler's Rod", item: "minecraft:fishing_rod", rarity: 2, stats: { scc: 5, str: 10 }, shop: "equipment", price: 75000 },
  blink_blade: {
    name: "Blink Blade", item: "minecraft:iron_sword", rarity: 2, stats: { dmg: 5, str: 20, int: 50 }, shop: "equipment", price: 250000,
    ability: { id: "blink", name: "Blink", mana: 40, cooldown: 0, desc: "Teleport 8 blocks ahead" },
  },
  ember_staff: {
    name: "Ember Staff", item: "minecraft:blaze_rod", rarity: 2, kind: "wand", stats: { int: 100, dmg: 2 }, shop: "equipment", price: 400000,
    ability: { id: "ember", name: "Ember Bolt", mana: 60, cooldown: 0.5, desc: "Shoots a bolt of fire that hits the first mob (scales with Intelligence)" },
  },
  healing_wand: {
    name: "Mending Wand", item: "minecraft:stick", rarity: 2, kind: "wand", stats: { int: 80, hp: 4 }, shop: "equipment", price: 300000,
    ability: { id: "heal", name: "Mend", mana: 80, cooldown: 3, desc: "Heals you and nearby players" },
  },
  quake_hammer: {
    name: "Quake Hammer", item: "minecraft:mace", rarity: 3, kind: "sword", stats: { dmg: 10, str: 40, def: 20 }, shop: "equipment", price: 2000000,
    ability: { id: "quake", name: "Shockwave", mana: 120, cooldown: 2, desc: "Damages and throws up every mob within 6 blocks" },
  },

  // ---- accessories (shop) ----
  speed_charm_1: { name: "Swift Charm", item: "minecraft:sugar", rarity: 0, kind: "accessory", family: "speed", tier: 1, stats: { spd: 2 }, shop: "accessories", price: 10000 },
  speed_charm_2: { name: "Swift Ring", item: "minecraft:sugar", rarity: 1, kind: "accessory", family: "speed", tier: 2, stats: { spd: 5 }, shop: "accessories", price: 100000 },
  speed_charm_3: { name: "Swift Artifact", item: "minecraft:sugar", rarity: 2, kind: "accessory", family: "speed", tier: 3, stats: { spd: 8 }, shop: "accessories", price: 1000000 },
  vital_1: { name: "Vitality Charm", item: "minecraft:glistering_melon_slice", rarity: 0, kind: "accessory", family: "vital", tier: 1, stats: { hp: 2 }, shop: "accessories", price: 10000 },
  vital_2: { name: "Vitality Ring", item: "minecraft:glistering_melon_slice", rarity: 1, kind: "accessory", family: "vital", tier: 2, stats: { hp: 4 }, shop: "accessories", price: 100000 },
  vital_3: { name: "Vitality Artifact", item: "minecraft:glistering_melon_slice", rarity: 2, kind: "accessory", family: "vital", tier: 3, stats: { hp: 8 }, shop: "accessories", price: 1000000 },
  iron_1: { name: "Ironskin Charm", item: "minecraft:iron_nugget", rarity: 0, kind: "accessory", family: "iron", tier: 1, stats: { def: 5 }, shop: "accessories", price: 10000 },
  iron_2: { name: "Ironskin Ring", item: "minecraft:iron_nugget", rarity: 1, kind: "accessory", family: "iron", tier: 2, stats: { def: 12 }, shop: "accessories", price: 100000 },
  iron_3: { name: "Ironskin Artifact", item: "minecraft:iron_nugget", rarity: 2, kind: "accessory", family: "iron", tier: 3, stats: { def: 25 }, shop: "accessories", price: 1000000 },
  power_1: { name: "Power Charm", item: "minecraft:blaze_powder", rarity: 0, kind: "accessory", family: "power", tier: 1, stats: { str: 3 }, shop: "accessories", price: 10000 },
  power_2: { name: "Power Ring", item: "minecraft:blaze_powder", rarity: 1, kind: "accessory", family: "power", tier: 2, stats: { str: 7 }, shop: "accessories", price: 100000 },
  power_3: { name: "Power Artifact", item: "minecraft:blaze_powder", rarity: 2, kind: "accessory", family: "power", tier: 3, stats: { str: 12 }, shop: "accessories", price: 1000000 },
  keen_1: { name: "Keen Eye Charm", item: "minecraft:spider_eye", rarity: 0, kind: "accessory", family: "keen", tier: 1, stats: { cc: 1 }, shop: "accessories", price: 15000 },
  keen_2: { name: "Keen Eye Ring", item: "minecraft:spider_eye", rarity: 1, kind: "accessory", family: "keen", tier: 2, stats: { cc: 2, cd: 3 }, shop: "accessories", price: 150000 },
  keen_3: { name: "Keen Eye Artifact", item: "minecraft:spider_eye", rarity: 2, kind: "accessory", family: "keen", tier: 3, stats: { cc: 3, cd: 6 }, shop: "accessories", price: 1500000 },
  wise_1: { name: "Wisdom Orb", item: "minecraft:ender_eye", rarity: 0, kind: "accessory", family: "wise", tier: 1, stats: { int: 10 }, shop: "accessories", price: 10000 },
  wise_2: { name: "Wisdom Ring", item: "minecraft:ender_eye", rarity: 1, kind: "accessory", family: "wise", tier: 2, stats: { int: 25 }, shop: "accessories", price: 100000 },
  wise_3: { name: "Wisdom Artifact", item: "minecraft:ender_eye", rarity: 2, kind: "accessory", family: "wise", tier: 3, stats: { int: 50 }, shop: "accessories", price: 1000000 },
  clover_1: { name: "Lucky Clover", item: "minecraft:rabbit_foot", rarity: 1, kind: "accessory", family: "luck", tier: 1, stats: { mf: 2 }, shop: "accessories", price: 50000 },
  clover_2: { name: "Lucky Horseshoe", item: "minecraft:rabbit_foot", rarity: 2, kind: "accessory", family: "luck", tier: 2, stats: { mf: 5 }, shop: "accessories", price: 500000 },
  green_thumb: { name: "Green Thumb Charm", item: "minecraft:wheat_seeds", rarity: 1, kind: "accessory", family: "farm", tier: 1, stats: { ffo: 10 }, shop: "accessories", price: 50000 },
  green_thumb_2: { name: "Green Thumb Artifact", item: "minecraft:wheat_seeds", rarity: 2, kind: "accessory", family: "farm", tier: 2, stats: { ffo: 25 }, shop: "accessories", price: 500000 },
  rockhound: { name: "Rockhound Charm", item: "minecraft:flint", rarity: 1, kind: "accessory", family: "mine", tier: 1, stats: { mfo: 10 }, shop: "accessories", price: 50000 },
  rockhound_2: { name: "Rockhound Artifact", item: "minecraft:flint", rarity: 2, kind: "accessory", family: "mine", tier: 2, stats: { mfo: 25 }, shop: "accessories", price: 500000 },
  woodsman: { name: "Woodsman Charm", item: "minecraft:stick", rarity: 1, kind: "accessory", family: "wood", tier: 1, stats: { wfo: 15 }, shop: "accessories", price: 50000 },
  tide_charm: { name: "Tide Charm", item: "minecraft:prismarine_crystals", rarity: 1, kind: "accessory", family: "sea", tier: 1, stats: { scc: 2 }, shop: "accessories", price: 75000 },
  coin_charm: { name: "Merchant's Coin", item: "minecraft:gold_nugget", rarity: 2, kind: "accessory", family: "coin", tier: 1, stats: {}, passive: { coins: 2 }, desc: "+2% coins from Sell", shop: "accessories", price: 750000 },

  // ---- slayer items (made in the Slayer shop from boss drops) ----
  tyrant_blade: { name: "Tyrant's Cleaver", item: "minecraft:diamond_sword", rarity: 3, stats: { dmg: 12, str: 50, hp: 4 }, passive: { lifesteal: 4 }, desc: "Heals 4% of the damage you deal", source: "slayer" },
  tyrant_chestplate: { name: "Tyrant's Plate", item: "minecraft:diamond_chestplate", rarity: 3, stats: { def: 60, hp: 10 }, source: "slayer" },
  tyrant_charm: { name: "Rotten Heart", item: "minecraft:rotten_flesh", rarity: 2, kind: "accessory", family: "tyrant", tier: 1, stats: { hp: 6, def: 5 }, source: "slayer" },
  venom_fang: { name: "Venom Fang", item: "minecraft:diamond_sword", rarity: 3, stats: { dmg: 10, cc: 15, cd: 50 }, passive: { venom: 1 }, desc: "Poisons what you hit", source: "slayer" },
  web_boots: { name: "Webstrider Boots", item: "minecraft:diamond_boots", rarity: 3, stats: { def: 30, spd: 10, cd: 10 }, source: "slayer" },
  spider_charm: { name: "Broodling Charm", item: "minecraft:string", rarity: 2, kind: "accessory", family: "brood", tier: 1, stats: { cd: 10 }, source: "slayer" },
  bone_bow: { name: "Marrow Longbow", item: "minecraft:bow", rarity: 3, stats: { dmg: 12, str: 20, cd: 60 }, source: "slayer" },
  bone_helmet: { name: "Marrow Helm", item: "minecraft:diamond_helmet", rarity: 3, stats: { def: 30, str: 20, cc: 5 }, source: "slayer" },
  bone_charm: { name: "Marrow Ring", item: "minecraft:bone", rarity: 2, kind: "accessory", family: "marrow", tier: 1, stats: { cc: 3, str: 3 }, source: "slayer" },
  void_edge: {
    name: "Voidedge", item: "minecraft:netherite_sword", rarity: 4, stats: { dmg: 18, str: 80, cd: 80, int: 100 }, source: "slayer",
    ability: { id: "blink12", name: "Void Step", mana: 50, cooldown: 0, desc: "Teleport 12 blocks ahead and gain +50 Strength for 3s" },
  },
  void_leggings: { name: "Voidwalker Leggings", item: "minecraft:netherite_leggings", rarity: 4, stats: { def: 80, hp: 16, int: 50 }, source: "slayer" },
  void_charm: { name: "Void Pearl", item: "minecraft:ender_pearl", rarity: 3, kind: "accessory", family: "void", tier: 1, stats: { int: 40, str: 8 }, source: "slayer" },

  // ---- dungeon items (from dungeon reward chests; can be starred with essence) ----
  crypt_blade: { name: "Crypt Blade", item: "minecraft:iron_sword", rarity: 2, stats: { dmg: 7, str: 30 }, dungeon: true },
  crypt_helmet: { name: "Crypt Helmet", item: "minecraft:iron_helmet", rarity: 2, stats: { def: 20, str: 5, hp: 2 }, dungeon: true, set: "crypt" },
  crypt_chestplate: { name: "Crypt Chestplate", item: "minecraft:iron_chestplate", rarity: 2, stats: { def: 40, str: 5, hp: 4 }, dungeon: true, set: "crypt" },
  crypt_leggings: { name: "Crypt Leggings", item: "minecraft:iron_leggings", rarity: 2, stats: { def: 30, str: 5, hp: 3 }, dungeon: true, set: "crypt" },
  crypt_boots: { name: "Crypt Boots", item: "minecraft:iron_boots", rarity: 2, stats: { def: 20, str: 5, hp: 2 }, dungeon: true, set: "crypt" },
  bonebreaker: { name: "Bonebreaker", item: "minecraft:diamond_axe", rarity: 3, kind: "sword", stats: { dmg: 14, str: 60, cc: 10 }, dungeon: true },
  phantom_helmet: { name: "Phantom Hood", item: "minecraft:diamond_helmet", rarity: 3, stats: { def: 40, hp: 6, cd: 10 }, dungeon: true, set: "phantom" },
  phantom_chestplate: { name: "Phantom Robe", item: "minecraft:diamond_chestplate", rarity: 3, stats: { def: 70, hp: 10, cd: 10 }, dungeon: true, set: "phantom" },
  phantom_leggings: { name: "Phantom Leggings", item: "minecraft:diamond_leggings", rarity: 3, stats: { def: 55, hp: 8, cd: 10 }, dungeon: true, set: "phantom" },
  phantom_boots: { name: "Phantom Boots", item: "minecraft:diamond_boots", rarity: 3, stats: { def: 35, hp: 5, cd: 10, spd: 5 }, dungeon: true, set: "phantom" },
  spirit_staff: {
    name: "Spirit Staff", item: "minecraft:blaze_rod", rarity: 3, kind: "wand", stats: { int: 250, dmg: 4 }, dungeon: true,
    ability: { id: "ember", name: "Spirit Bolt", mana: 50, cooldown: 0.3, desc: "A bolt that hits the first mob (scales with Intelligence)" },
  },
  kingsbane: {
    name: "Kingsbane", item: "minecraft:netherite_sword", rarity: 4, stats: { dmg: 22, str: 120, cd: 100 }, dungeon: true,
    ability: { id: "wrath", name: "Royal Wrath", mana: 150, cooldown: 20, desc: "+100 Strength for 6 seconds" },
  },
  sovereign_helmet: { name: "Sovereign Crown", item: "minecraft:netherite_helmet", rarity: 4, stats: { def: 60, hp: 10, str: 15 }, dungeon: true, set: "sovereign" },
  sovereign_chestplate: { name: "Sovereign Plate", item: "minecraft:netherite_chestplate", rarity: 4, stats: { def: 100, hp: 16, str: 15 }, dungeon: true, set: "sovereign" },
  sovereign_leggings: { name: "Sovereign Greaves", item: "minecraft:netherite_leggings", rarity: 4, stats: { def: 80, hp: 14, str: 15 }, dungeon: true, set: "sovereign" },
  sovereign_boots: { name: "Sovereign Sabatons", item: "minecraft:netherite_boots", rarity: 4, stats: { def: 50, hp: 8, str: 15 }, dungeon: true, set: "sovereign" },
  ash_crown: { name: "Crown of Ash", item: "minecraft:blaze_rod", rarity: 4, kind: "accessory", family: "ash", tier: 1, stats: { str: 20, cd: 20 }, dungeon: true },
  crypt_ring: { name: "Crypt Ring", item: "minecraft:bone_meal", rarity: 2, kind: "accessory", family: "crypt", tier: 1, stats: { def: 8, str: 4 }, dungeon: true },

  // ---- dungeon island tools (only from dungeon reward chests; star them with Essence) ----
  gravebloom_hoe: { name: "Gravebloom Hoe", item: "minecraft:iron_hoe", rarity: 2, stats: { ffo: 35, ms: 15 }, dungeon: true, desc: "Grows crops from the crypt's soil" },
  phantom_scythe: { name: "Phantom Scythe", item: "minecraft:diamond_hoe", rarity: 3, stats: { ffo: 60, ms: 25, spd: 5 }, dungeon: true },
  sovereign_sickle: { name: "Sovereign Sickle", item: "minecraft:netherite_hoe", rarity: 4, stats: { ffo: 100, ms: 40, spd: 10 }, dungeon: true },
  crypt_pick: { name: "Crypt Pick", item: "minecraft:iron_pickaxe", rarity: 2, stats: { mfo: 35, ms: 40 }, dungeon: true },
  phantom_drill: { name: "Phantom Drill", item: "minecraft:diamond_pickaxe", rarity: 3, stats: { mfo: 60, ms: 70 }, dungeon: true },
  sovereign_excavator: { name: "Sovereign Excavator", item: "minecraft:netherite_pickaxe", rarity: 4, stats: { mfo: 100, ms: 100 }, dungeon: true },
  rotwood_axe: { name: "Rotwood Axe", item: "minecraft:iron_axe", rarity: 2, kind: "axe", stats: { wfo: 35, ms: 20 }, dungeon: true },
  spectral_hatchet: { name: "Spectral Hatchet", item: "minecraft:diamond_axe", rarity: 3, kind: "axe", stats: { wfo: 60, ms: 35, str: 10 }, dungeon: true },
  sovereign_timberaxe: { name: "Sovereign Timberaxe", item: "minecraft:netherite_axe", rarity: 4, kind: "axe", stats: { wfo: 100, ms: 50, str: 20 }, dungeon: true },
  drowned_rod: { name: "Drowned Rod", item: "minecraft:fishing_rod", rarity: 2, stats: { scc: 4, int: 30 }, dungeon: true },
  phantom_rod: { name: "Phantom Rod", item: "minecraft:fishing_rod", rarity: 3, stats: { scc: 7, int: 60, mf: 2 }, dungeon: true },
  sovereign_rod: { name: "Sovereign Rod", item: "minecraft:fishing_rod", rarity: 4, stats: { scc: 10, int: 100, mf: 4 }, dungeon: true },
  crypt_lantern: { name: "Crypt Lantern", item: "minecraft:soul_lantern", rarity: 2, kind: "accessory", family: "lantern", tier: 1, stats: { mf: 3, int: 15 }, dungeon: true, desc: "Accessory: helps you find treasure" },
  sovereign_lantern: { name: "Sovereign Lantern", item: "minecraft:soul_lantern", rarity: 4, kind: "accessory", family: "lantern", tier: 2, stats: { mf: 8, int: 40 }, dungeon: true, desc: "Accessory: helps you find treasure" },

  // ---- dungeon treasures (sell them in the Sell menu, or trade them on the Auction House) ----
  ancient_coin: { name: "Ancient Coin", item: "minecraft:gold_nugget", rarity: 1, kind: "material", value: 4000, desc: "An old coin from the crypts" },
  crypt_relic: { name: "Crypt Relic", item: "minecraft:clay_ball", rarity: 2, kind: "material", value: 12000, desc: "Collectors pay well for these" },
  bone_idol: { name: "Bone Idol", item: "minecraft:bone_block", rarity: 2, kind: "material", value: 30000, desc: "A carved idol from Floor II and up" },
  hollow_crown_shard: { name: "Hollow Crown Shard", item: "minecraft:amethyst_shard", rarity: 3, kind: "material", value: 70000, desc: "A piece of the Hollow King's crown" },
  ashen_ember: { name: "Ashen Ember", item: "minecraft:fire_charge", rarity: 3, kind: "material", value: 140000, desc: "Still warm, years later" },
  sovereign_jewel: { name: "Sovereign Jewel", item: "minecraft:emerald", rarity: 4, kind: "material", value: 350000, desc: "The rarest treasure of the crypts" },

  // ---- materials (boss / dungeon drops, used in shops) ----
  rotten_core: { name: "Rotten Core", item: "minecraft:rotten_flesh", rarity: 1, kind: "material", desc: "Dropped by Rotting Tyrants" },
  tyrant_fang: { name: "Tyrant Fang", item: "minecraft:bone", rarity: 3, kind: "material", desc: "Rare Rotting Tyrant drop" },
  venom_sac: { name: "Venom Sac", item: "minecraft:spider_eye", rarity: 1, kind: "material", desc: "Dropped by Brood Mothers" },
  silk_crown: { name: "Silk Crown", item: "minecraft:cobweb", rarity: 3, kind: "material", desc: "Rare Brood Mother drop" },
  marrow_shard: { name: "Marrow Shard", item: "minecraft:bone_meal", rarity: 1, kind: "material", desc: "Dropped by Bone Colossi" },
  colossus_skull: { name: "Colossus Skull", item: "minecraft:skeleton_skull", rarity: 3, kind: "material", desc: "Rare Bone Colossus drop" },
  void_dust: { name: "Void Dust", item: "minecraft:ender_pearl", rarity: 2, kind: "material", desc: "Dropped by Void Stalkers" },
  void_heart: { name: "Void Heart", item: "minecraft:ender_eye", rarity: 4, kind: "material", desc: "Rare Void Stalker drop" },
};
for (const [id, d] of Object.entries(ITEMS)) d.id = id;
export const itemDef = (id) => ITEMS[id];
// Accessories were removed from the add-on: they're never sold, dropped or given any more.
export const availableItems = () => Object.values(ITEMS).filter((d) => exists(d.item) && d.kind !== "accessory");

// ---- reforges ----------------------------------------------------------------------
// Six numbers per stat = value at Common, Uncommon, Rare, Epic, Legendary, Mythic.
export const REFORGES = {
  keen: { name: "Keen", for: "weapon", stats: { cc: [1, 2, 3, 5, 7, 10], cd: [5, 8, 12, 18, 25, 35] } },
  brutal: { name: "Brutal", for: "weapon", stats: { str: [3, 6, 10, 15, 22, 30], cd: [3, 5, 8, 12, 16, 22] } },
  swift: { name: "Swift", for: "weapon", stats: { spd: [1, 2, 3, 4, 5, 6], str: [2, 4, 6, 9, 12, 16], cc: [1, 1, 2, 2, 3, 4] } },
  savage: { name: "Savage", for: "weapon", stats: { str: [5, 8, 12, 18, 26, 36], dmg: [1, 2, 3, 4, 6, 8] } },
  arcane: { name: "Arcane", for: "weapon", stats: { int: [10, 15, 25, 40, 60, 85], str: [1, 2, 4, 6, 8, 11] } },
  fortunate: { name: "Fortunate", for: "weapon", stats: { mf: [1, 1, 2, 3, 4, 5], cc: [1, 2, 2, 3, 4, 5] } },
  sturdy: { name: "Sturdy", for: "armor", stats: { def: [4, 6, 9, 13, 18, 25] } },
  vital: { name: "Hearty", for: "armor", stats: { hp: [1, 2, 3, 4, 6, 8], def: [1, 2, 3, 4, 6, 8] } },
  nimble: { name: "Nimble", for: "armor", stats: { spd: [1, 1, 2, 2, 3, 4], cc: [1, 1, 2, 3, 3, 4] } },
  fierce: { name: "Fierce", for: "armor", stats: { str: [2, 4, 6, 8, 12, 16], cd: [2, 4, 6, 8, 10, 14] } },
  wise: { name: "Sage", for: "armor", stats: { int: [8, 12, 18, 25, 35, 50], hp: [1, 1, 1, 2, 2, 3] } },
  titanic: { name: "Colossal", for: "armor", stats: { def: [6, 9, 13, 18, 24, 32], hp: [1, 1, 2, 2, 3, 4] } },
  blessed: { name: "Blessed", for: "tool", stats: { fortune: [3, 5, 8, 12, 16, 20] } },
  hasty: { name: "Hasty", for: "tool", stats: { ms: [5, 10, 15, 20, 25, 30], fortune: [1, 2, 3, 4, 5, 6] } },
};
export const REFORGE_COST = [250, 1000, 5000, 25000, 100000, 500000];

// ---- custom enchantments -------------------------------------------------------------
// code: short id stored in lore. for: which items. Each level costs `cost * level^2` coins and `xp * level` XP levels.
export const ENCHANTS = {
  sh: { name: "Keen Edge", for: "weapon", max: 15, cost: 2000, xp: 3, desc: "+5% damage per level" },
  ls: { name: "Life Drain", for: "weapon", max: 15, cost: 4000, xp: 4, desc: "Heal 1% of damage dealt per level" },
  ex: { name: "Finisher", for: "weapon", max: 15, cost: 3000, xp: 3, desc: "+4% damage per level on mobs under half health" },
  cr: { name: "Precision", for: "weapon", max: 15, cost: 5000, xp: 4, desc: "+8% Crit Damage per level" },
  vn: { name: "Venom", for: "weapon", max: 15, cost: 6000, xp: 5, desc: "Poisons mobs you hit" },
  st: { name: "Storm Call", for: "weapon", max: 15, cost: 15000, xp: 6, desc: "Every 4th hit calls lightning (+20% damage per level)" },
  sv: { name: "Scavenger", for: "weapon", max: 15, cost: 2500, xp: 2, desc: "+3 coins per level per kill" },
  gr: { name: "Vitality", for: "armor", max: 15, cost: 4000, xp: 4, desc: "+2 Health per level" },
  bw: { name: "Bulwark", for: "armor", max: 15, cost: 3000, xp: 3, desc: "+4 Defense per level" },
  sw: { name: "Fleetfoot", for: "armor", max: 15, cost: 3000, xp: 3, desc: "+2 Speed per level" },
  in: { name: "Insight", for: "armor", max: 15, cost: 3000, xp: 3, desc: "+5 Intelligence per level" },
  rg: { name: "Regrowth", for: "armor", max: 15, cost: 8000, xp: 5, desc: "Heals 0.25 health per level every 5 seconds (adds up across pieces, max 5)" },
  rf: { name: "Retaliate", for: "armor", max: 15, cost: 6000, xp: 4, desc: "Hits back 4% of the damage you take per level (all pieces, max 60%)" },
  lt: { name: "Last Stand", for: "armor", max: 15, cost: 10000, xp: 6, desc: "+15% Defense per level while under 30% health (all pieces, max +150%)" },
  nv: { name: "Nightsight", for: "armor", kinds: ["helmet"], max: 1, cost: 15000, xp: 5, desc: "Night vision while worn (helmet only)" },
  hv: { name: "Harvesting", for: "tool", max: 15, cost: 2500, xp: 2, desc: "+5 Fortune per level" },
  ef: { name: "Swiftswing", for: "tool", max: 15, cost: 2500, xp: 2, desc: "+10 Mining Speed per level" },
  an: { name: "Lure Master", for: "rod", max: 15, cost: 5000, xp: 4, desc: "+1% Sea Creature Chance per level" },
};

export function slotGroup(kind) {
  if (isWeaponKind(kind)) return "weapon";
  if (isArmorKind(kind)) return "armor";
  if (kind === "rod") return "rod";
  if (isToolKind(kind)) return "tool";
  return kind;
}
const fits = (forWhat, kind) => forWhat === slotGroup(kind) || (forWhat === "tool" && kind === "rod");

export const reforgesFor = (kind) => Object.entries(REFORGES).filter(([, r]) => fits(r.for, kind)).map(([id]) => id);
export const enchantsFor = (kind) => Object.entries(ENCHANTS).filter(([, e]) => fits(e.for, kind) && (!e.kinds || e.kinds.includes(kind))).map(([id]) => id);

/** Chance (0-1) that enchanting to `level` works. */
export const enchantChance = (level) =>
  [0.9, 0.75, 0.6, 0.45, 0.3, 0.28, 0.26, 0.24, 0.22, 0.2, 0.18, 0.16, 0.14, 0.12, 0.1][Math.max(0, Math.min(14, level - 1))];

/** How strong an enchant level is: levels I-V count fully, each level above V counts half (XV = 10). */
export const enchEff = (level) => Math.min(level, 5) + Math.max(0, level - 5) / 2;

/** Fortune stat of a tool kind. */
const fortuneStat = (kind) => ({ pickaxe: "mfo", axe: "wfo", hoe: "ffo", rod: "scc" })[kind] ?? "mfo";

// ---- reading & writing ------------------------------------------------------------------
/**
 * Reads an item: -> { id, def, kind, rarity, reforge, stars, ench: {code: lvl} } or undefined
 * for items this system doesn't handle (blocks, food, other add-on items...).
 * Plain vanilla weapons/armor/tools read as "-" items with their default rarity.
 */
export function readItem(stack) {
  if (!stack) return undefined;
  const lore = stack.getLore();
  const tag = lore.find((l) => l.startsWith(IT_TAG));
  if (tag) {
    const [id, rar, ref, stars, flags] = tag.slice(IT_TAG.length).split(":");
    const def = ITEMS[id];
    const ench = {};
    const en = lore.find((l) => l.startsWith(EN_TAG));
    if (en) for (const part of en.slice(EN_TAG.length).split(",")) {
      const m = part.match(/^([a-z]+)(\d+)$/);
      if (m && ENCHANTS[m[1]]) ench[m[1]] = Number(m[2]);
    }
    return { id, def, kind: kindOf(stack.typeId, def), rarity: Math.max(0, Math.min(5, Number(rar) || 0)), reforge: REFORGES[ref] ? ref : "", stars: Number(stars) || 0, ench, kit: (flags ?? "").includes("k") };
  }
  if (lore.some((l) => l.startsWith("§8eco:"))) return undefined; // another add-on item (skill tool, minion...)
  const kind = kindOf(stack.typeId);
  if (!kind) return undefined;
  return { id: "-", def: undefined, kind, rarity: vanillaRarity(stack.typeId), reforge: "", stars: 0, ench: {} };
}

/** Total stats of one item: base (with stars) + reforge + enchantments. */
export function itemStats(info) {
  const out = {};
  const add = (k, v) => {
    if (v) out[k] = (out[k] ?? 0) + v;
  };
  const starMult = 1 + (info.stars ?? 0) * 0.1;
  for (const [k, v] of Object.entries(info.def?.stats ?? {})) add(k, Math.round(v * starMult));
  const r = REFORGES[info.reforge];
  if (r) for (const [k, vals] of Object.entries(r.stats)) add(k === "fortune" ? fortuneStat(info.kind) : k, vals[info.rarity] ?? vals[vals.length - 1]);
  const e = Object.fromEntries(Object.entries(info.ench ?? {}).map(([c, l]) => [c, enchEff(l)]));
  if (e.gr) add("hp", 2 * e.gr);
  if (e.bw) add("def", 4 * e.bw);
  if (e.sw) add("spd", 2 * e.sw);
  if (e.in) add("int", 5 * e.in);
  if (e.cr) add("cd", 8 * e.cr);
  if (e.hv) add(fortuneStat(info.kind), 5 * e.hv);
  if (e.ef) add("ms", 10 * e.ef);
  if (e.an) add("scc", e.an);
  return out;
}

function wrap(text, color = "§7", width = 36) {
  const out = [];
  let line = "";
  for (const w of text.split(" ")) {
    if ((line + " " + w).trim().length > width) {
      out.push(color + line.trim());
      line = w;
    } else line += " " + w;
  }
  if (line.trim()) out.push(color + line.trim());
  return out;
}

const statLine = (k, v) => {
  const s = STATS[k];
  if (!s) return undefined;
  return `§7${s.name}: ${v < 0 ? "§c" : s.color}${v > 0 ? "+" : ""}${v}${s.pct ? "%" : ""}`;
};

/** Rebuilds an item's name and lore from its data. */
export function renderItem(stack, info) {
  const def = info.def;
  const rar = RARITIES[info.rarity];
  const base = def?.name ?? pretty(stack.typeId);
  const reforge = REFORGES[info.reforge]?.name;
  const stars = info.stars ? " §6" + "✪".repeat(info.stars) : "";
  stack.nameTag = `§r${rar.color}${reforge ? reforge + " " : ""}${base}${stars}`;
  const lines = [];
  const stats = itemStats(info);
  for (const k of STAT_ORDER) if (stats[k]) lines.push(statLine(k, stats[k]));
  const en = Object.entries(info.ench ?? {}).filter(([, l]) => l > 0);
  if (en.length) {
    lines.push("");
    let cur = "";
    for (const [c, l] of en) {
      const part = `${ENCHANTS[c].name} ${roman(l)}`;
      if ((cur + ", " + part).length > 34) {
        lines.push("§9" + cur);
        cur = part;
      } else cur = cur ? cur + ", " + part : part;
    }
    if (cur) lines.push("§9" + cur);
  }
  if (def?.ability) {
    lines.push("");
    lines.push(`§6Ability: ${def.ability.name} §e§lRIGHT CLICK`);
    lines.push(...wrap(def.ability.desc));
    lines.push(`§8Mana Cost: §3${def.ability.mana}${def.ability.cooldown ? ` §8Cooldown: §a${def.ability.cooldown}s` : ""}`);
  }
  if (def?.desc) {
    lines.push("");
    lines.push(...wrap(def.desc));
  }
  if (def?.set) lines.push(`§8Part of the ${def.set[0].toUpperCase() + def.set.slice(1)} set`);
  if (def?.value) lines.push(`§7Sell price: §6$${String(def.value).replace(/\B(?=(\d{3})+(?!\d))/g, ",")} §8(Sell menu)`);
  if (def?.dungeon) lines.push(`§8Dungeon item${info.stars ? ` §6(${info.stars}/5 stars)` : " - star it with essence"}`);
  if (info.kit) lines.push("§8Kit item - can't be sold or traded");
  lines.push("");
  lines.push(`${rar.color}§l${rar.name} ${KIND_LABEL[info.kind] ?? ""}`.trim());
  const keep = lines.slice(0, 18).map((l) => (l.length > 48 ? l.slice(0, 48) : l));
  keep.push(`${IT_TAG}${info.id}:${info.rarity}:${info.reforge || ""}:${info.stars || 0}${info.kit ? ":k" : ""}`);
  const enStr = en.map(([c, l]) => c + l).join(",");
  if (enStr) keep.push(EN_TAG + enStr);
  stack.setLore(keep);
  return stack;
}

/** A brand-new custom item. */
export function makeItem(id, amount = 1) {
  const def = ITEMS[id];
  if (!def || !exists(def.item)) return undefined;
  const stack = new ItemStack(def.item, 1);
  stack.amount = Math.min(stack.maxAmount, amount);
  renderItem(stack, { id, def, kind: kindOf(def.item, def), rarity: def.rarity, reforge: "", stars: 0, ench: {} });
  return stack;
}

/** True if this stack is the custom item `id`. */
export const isItem = (stack, id) => !!stack && stack.getLore().some((l) => l.startsWith(`${IT_TAG}${id}:`));

export { roman, pretty };
