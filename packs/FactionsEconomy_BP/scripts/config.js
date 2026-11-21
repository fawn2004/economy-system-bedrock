// ============================================================================
//  FACTIONS ECONOMY - CONFIG
//  Everything you'll want to tweak (prices, items, categories) is in here.
// ============================================================================

export const CONFIG = {
  // Scoreboard objective that stores everyone's money.
  // Admins can also use:  /scoreboard players add <player> money 1000
  objective: "money",
  objectiveDisplay: "§aMoney",
  currency: "$",

  startingBalance: 500,
  maxBalance: 2000000000, // scoreboard limit is ~2.1 billion

  adminTag: "admin", // /tag <player> add admin  -> shows the Admin tile

  compass: {
    giveOnJoin: true, // make sure every player has the compass when they spawn
    slot: 8, // hotbar slot (0-8) it goes into if that slot is free
  },

  spawners: {
    // Breaking a shop-bought spawner gives it back only with a Silk Touch pickaxe.
    // Set to false to always give it back when mined.
    requireSilkTouch: true,
  },

  // Amount buttons shown on an item's buy screen
  buyAmounts: [1, 8, 16, 32, 64],
};

// Menu colour themes (must match the header textures in the resource pack)
export const THEME = { red: 1, gold: 2, green: 3, blue: 4, purple: 5, orange: 6 };

const B = "textures/blocks/";
const I = "textures/items/";
const U = "textures/ui/eco/";

// ============================================================================
//  SHOP CATEGORIES
//  type "item"    : { id, name, icon, price, amounts? }        price = per item
//  type "kit"     : { id, name, icon, price, cooldown (secs), items: [...] }
//  type "spawner" : { mob, name, icon, price }
//  badge: "NEW" or "HOT" puts a badge on the tile.
//  Icons can be any texture path (vanilla or your own resource pack).
// ============================================================================
export const SHOP = [
  {
    id: "blocks",
    name: "Blocks",
    desc: "Building & base blocks",
    icon: U + "icon_blocks",
    theme: "blue",
    items: [
      { id: "minecraft:cobblestone", name: "Cobblestone", icon: B + "cobblestone", price: 2 },
      { id: "minecraft:stone", name: "Stone", icon: B + "stone", price: 3 },
      { id: "minecraft:dirt", name: "Dirt", icon: B + "dirt", price: 1 },
      { id: "minecraft:sand", name: "Sand", icon: B + "sand", price: 3 },
      { id: "minecraft:oak_log", name: "Oak Log", icon: B + "log_oak", price: 6 },
      { id: "minecraft:oak_planks", name: "Oak Planks", icon: B + "planks_oak", price: 2 },
      { id: "minecraft:glass", name: "Glass", icon: B + "glass", price: 4 },
      { id: "minecraft:obsidian", name: "Obsidian", icon: B + "obsidian", price: 60, badge: "HOT" },
      { id: "minecraft:cobbled_deepslate", name: "Deepslate", icon: B + "deepslate/cobbled_deepslate", price: 3 },
      { id: "minecraft:netherrack", name: "Netherrack", icon: B + "netherrack", price: 1 },
      { id: "minecraft:end_stone", name: "End Stone", icon: B + "end_stone", price: 8 },
      { id: "minecraft:glowstone", name: "Glowstone", icon: B + "glowstone", price: 12 },
      { id: "minecraft:quartz_block", name: "Quartz Block", icon: B + "quartz_block_side", price: 15 },
      { id: "minecraft:tnt", name: "TNT", icon: B + "tnt_side", price: 250, badge: "HOT" },
    ],
  },
  {
    id: "food",
    name: "Food",
    desc: "Keep your faction fed",
    icon: U + "icon_food",
    theme: "orange",
    items: [
      { id: "minecraft:bread", name: "Bread", icon: I + "bread", price: 4 },
      { id: "minecraft:cooked_beef", name: "Steak", icon: I + "beef_cooked", price: 8 },
      { id: "minecraft:cooked_porkchop", name: "Porkchop", icon: I + "porkchop_cooked", price: 8 },
      { id: "minecraft:cooked_chicken", name: "Chicken", icon: I + "chicken_cooked", price: 6 },
      { id: "minecraft:baked_potato", name: "Baked Potato", icon: I + "potato_baked", price: 4 },
      { id: "minecraft:golden_carrot", name: "Golden Carrot", icon: I + "carrot_golden", price: 20 },
      { id: "minecraft:pumpkin_pie", name: "Pumpkin Pie", icon: I + "pumpkin_pie", price: 10 },
      { id: "minecraft:cookie", name: "Cookie", icon: I + "cookie", price: 2 },
      { id: "minecraft:golden_apple", name: "Golden Apple", icon: I + "apple_golden", price: 150, badge: "HOT" },
      {
        id: "minecraft:enchanted_golden_apple",
        name: "God Apple",
        icon: I + "apple_golden",
        price: 5000,
        amounts: [1, 2, 4],
      },
    ],
  },
  {
    id: "kits",
    name: "Kits",
    desc: "Gear bundles with cooldowns",
    icon: U + "icon_kits",
    theme: "purple",
    badge: "NEW",
    kits: [
      {
        id: "starter",
        name: "Starter Kit",
        icon: I + "stone_sword",
        price: 250,
        cooldown: 600,
        items: [
          { id: "minecraft:stone_sword" },
          { id: "minecraft:stone_pickaxe" },
          { id: "minecraft:stone_axe" },
          { id: "minecraft:leather_chestplate" },
          { id: "minecraft:bread", amount: 16 },
          { id: "minecraft:torch", amount: 32 },
        ],
      },
      {
        id: "iron",
        name: "Iron Kit",
        icon: I + "iron_chestplate",
        price: 1500,
        cooldown: 1800,
        items: [
          { id: "minecraft:iron_helmet" },
          { id: "minecraft:iron_chestplate" },
          { id: "minecraft:iron_leggings" },
          { id: "minecraft:iron_boots" },
          { id: "minecraft:iron_sword", enchants: { sharpness: 1 } },
          { id: "minecraft:iron_pickaxe", enchants: { efficiency: 2 } },
          { id: "minecraft:cooked_beef", amount: 16 },
        ],
      },
      {
        id: "miner",
        name: "Miner Kit",
        icon: I + "diamond_pickaxe",
        price: 3500,
        cooldown: 3600,
        items: [
          { id: "minecraft:diamond_pickaxe", enchants: { efficiency: 4, unbreaking: 3, fortune: 2 } },
          { id: "minecraft:diamond_shovel", enchants: { efficiency: 3 } },
          { id: "minecraft:torch", amount: 64 },
          { id: "minecraft:cooked_beef", amount: 32 },
        ],
      },
      {
        id: "diamond",
        name: "Diamond Kit",
        icon: I + "diamond_chestplate",
        price: 8000,
        cooldown: 7200,
        badge: "HOT",
        items: [
          { id: "minecraft:diamond_helmet", enchants: { protection: 2 } },
          { id: "minecraft:diamond_chestplate", enchants: { protection: 2 } },
          { id: "minecraft:diamond_leggings", enchants: { protection: 2 } },
          { id: "minecraft:diamond_boots", enchants: { protection: 2 } },
          { id: "minecraft:diamond_sword", enchants: { sharpness: 3 } },
          { id: "minecraft:bow", enchants: { power: 2 } },
          { id: "minecraft:arrow", amount: 64 },
          { id: "minecraft:golden_apple", amount: 4 },
        ],
      },
      {
        id: "netherite",
        name: "Netherite Kit",
        icon: I + "netherite_chestplate",
        price: 40000,
        cooldown: 86400,
        badge: "NEW",
        items: [
          { id: "minecraft:netherite_helmet", enchants: { protection: 4, unbreaking: 3 } },
          { id: "minecraft:netherite_chestplate", enchants: { protection: 4, unbreaking: 3 } },
          { id: "minecraft:netherite_leggings", enchants: { protection: 4, unbreaking: 3 } },
          { id: "minecraft:netherite_boots", enchants: { protection: 4, unbreaking: 3 } },
          { id: "minecraft:netherite_sword", enchants: { sharpness: 5, unbreaking: 3 } },
          { id: "minecraft:enchanted_golden_apple", amount: 2 },
          { id: "minecraft:totem_of_undying" },
        ],
      },
    ],
  },
  {
    id: "spawners",
    name: "Spawners",
    desc: "Pre-set mob spawners",
    icon: U + "icon_spawners",
    theme: "red",
    badge: "HOT",
    // Each mob needs a structure file: structures/eco/spawner_<mob>.mcstructure
    // (tools/generate_assets.py makes them - add the mob to SPAWNER_MOBS there too)
    spawners: [
      { mob: "pig", name: "Pig", icon: I + "porkchop_raw", price: 15000 },
      { mob: "cow", name: "Cow", icon: I + "beef_raw", price: 20000 },
      { mob: "chicken", name: "Chicken", icon: I + "feather", price: 15000 },
      { mob: "sheep", name: "Sheep", icon: B + "wool_colored_white", price: 15000 },
      { mob: "zombie", name: "Zombie", icon: I + "rotten_flesh", price: 25000 },
      { mob: "skeleton", name: "Skeleton", icon: I + "bone", price: 30000 },
      { mob: "spider", name: "Spider", icon: I + "spider_eye", price: 30000 },
      { mob: "creeper", name: "Creeper", icon: I + "gunpowder", price: 45000 },
      { mob: "witch", name: "Witch", icon: I + "redstone_dust", price: 60000 },
      { mob: "enderman", name: "Enderman", icon: I + "ender_pearl", price: 75000 },
      { mob: "blaze", name: "Blaze", icon: I + "blaze_rod", price: 100000, badge: "HOT" },
      { mob: "iron_golem", name: "Iron Golem", icon: I + "iron_ingot", price: 250000, badge: "NEW" },
    ],
  },
  {
    id: "farming",
    name: "Farming",
    desc: "Seeds, crops & farm gear",
    icon: U + "icon_farming",
    theme: "green",
    items: [
      { id: "minecraft:wheat_seeds", name: "Wheat Seeds", icon: I + "seeds_wheat", price: 2 },
      { id: "minecraft:carrot", name: "Carrot", icon: I + "carrot", price: 3 },
      { id: "minecraft:potato", name: "Potato", icon: I + "potato", price: 3 },
      { id: "minecraft:melon_seeds", name: "Melon Seeds", icon: I + "seeds_melon", price: 10 },
      { id: "minecraft:pumpkin_seeds", name: "Pumpkin Seeds", icon: I + "seeds_pumpkin", price: 10 },
      { id: "minecraft:sugar_cane", name: "Sugar Cane", icon: I + "reeds", price: 8 },
      { id: "minecraft:cactus", name: "Cactus", icon: B + "cactus_side", price: 8 },
      { id: "minecraft:nether_wart", name: "Nether Wart", icon: I + "nether_wart", price: 15 },
      { id: "minecraft:bone_meal", name: "Bone Meal", icon: I + "dye_powder_white_new", price: 3 },
      { id: "minecraft:water_bucket", name: "Water Bucket", icon: I + "bucket_water", price: 25, amounts: [1] },
      { id: "minecraft:hopper", name: "Hopper", icon: I + "hopper", price: 120 },
      { id: "minecraft:diamond_hoe", name: "Diamond Hoe", icon: I + "diamond_hoe", price: 300, amounts: [1] },
    ],
  },
];

// ============================================================================
//  SELL PRICES (per item).  Only plain items (no custom name/lore) can be sold.
// ============================================================================
export const SELL_PRICES = {
  // ores & minerals
  "minecraft:coal": 3,
  "minecraft:raw_iron": 5,
  "minecraft:iron_ingot": 8,
  "minecraft:raw_gold": 7,
  "minecraft:gold_ingot": 10,
  "minecraft:redstone": 2,
  "minecraft:lapis_lazuli": 3,
  "minecraft:quartz": 3,
  "minecraft:emerald": 40,
  "minecraft:diamond": 60,
  "minecraft:netherite_ingot": 800,
  // mob drops
  "minecraft:rotten_flesh": 1,
  "minecraft:bone": 2,
  "minecraft:string": 2,
  "minecraft:spider_eye": 2,
  "minecraft:gunpowder": 4,
  "minecraft:ender_pearl": 8,
  "minecraft:blaze_rod": 10,
  "minecraft:leather": 3,
  "minecraft:feather": 1,
  "minecraft:white_wool": 2,
  "minecraft:beef": 2,
  "minecraft:porkchop": 2,
  "minecraft:chicken": 2,
  "minecraft:glass_bottle": 1,
  // farming
  "minecraft:wheat": 2,
  "minecraft:carrot": 1,
  "minecraft:potato": 1,
  "minecraft:melon_slice": 1,
  "minecraft:pumpkin": 4,
  "minecraft:sugar_cane": 2,
  "minecraft:cactus": 2,
  "minecraft:nether_wart": 2,
  "minecraft:cocoa_beans": 2,
  // blocks
  "minecraft:cobblestone": 1,
  "minecraft:oak_log": 2,
};

// Icons used in the sell menu (falls back to the coin icon)
export const SELL_ICONS = {
  "minecraft:coal": I + "coal",
  "minecraft:raw_iron": I + "raw_iron",
  "minecraft:iron_ingot": I + "iron_ingot",
  "minecraft:raw_gold": I + "raw_gold",
  "minecraft:gold_ingot": I + "gold_ingot",
  "minecraft:redstone": I + "redstone_dust",
  "minecraft:lapis_lazuli": I + "dye_powder_blue",
  "minecraft:quartz": I + "quartz",
  "minecraft:emerald": I + "emerald",
  "minecraft:diamond": I + "diamond",
  "minecraft:netherite_ingot": I + "netherite_ingot",
  "minecraft:rotten_flesh": I + "rotten_flesh",
  "minecraft:bone": I + "bone",
  "minecraft:string": I + "string",
  "minecraft:spider_eye": I + "spider_eye",
  "minecraft:gunpowder": I + "gunpowder",
  "minecraft:ender_pearl": I + "ender_pearl",
  "minecraft:blaze_rod": I + "blaze_rod",
  "minecraft:leather": I + "leather",
  "minecraft:feather": I + "feather",
  "minecraft:white_wool": B + "wool_colored_white",
  "minecraft:beef": I + "beef_raw",
  "minecraft:porkchop": I + "porkchop_raw",
  "minecraft:chicken": I + "chicken_raw",
  "minecraft:glass_bottle": I + "potion_bottle_empty",
  "minecraft:wheat": I + "wheat",
  "minecraft:carrot": I + "carrot",
  "minecraft:potato": I + "potato",
  "minecraft:melon_slice": I + "melon",
  "minecraft:pumpkin": B + "pumpkin_face_off",
  "minecraft:sugar_cane": I + "reeds",
  "minecraft:cactus": B + "cactus_side",
  "minecraft:nether_wart": I + "nether_wart",
  "minecraft:cocoa_beans": I + "dye_powder_brown",
  "minecraft:cobblestone": B + "cobblestone",
  "minecraft:oak_log": B + "log_oak",
};
