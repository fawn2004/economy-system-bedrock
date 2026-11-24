import { world } from "@minecraft/server";

// JSON values saved as world dynamic properties. A single string property is
// limited in size, so long values are split over several numbered parts.
const PART = 30000;

export function loadJson(key, fallback) {
  try {
    const head = world.getDynamicProperty(key);
    if (head === undefined) return fallback;
    if (typeof head === "number") {
      // split value: the head holds the number of parts
      let text = "";
      for (let i = 0; i < head; i++) text += world.getDynamicProperty(`${key}#${i}`) ?? "";
      return JSON.parse(text);
    }
    return JSON.parse(head);
  } catch (e) {
    console.warn(`[cloudbreak] could not read ${key}: ${e}`);
    return fallback;
  }
}

export function saveJson(key, value) {
  const text = JSON.stringify(value);
  const oldHead = world.getDynamicProperty(key);
  const oldParts = typeof oldHead === "number" ? oldHead : 0;
  if (text.length <= PART) {
    world.setDynamicProperty(key, text);
  } else {
    const parts = Math.ceil(text.length / PART);
    for (let i = 0; i < parts; i++) world.setDynamicProperty(`${key}#${i}`, text.slice(i * PART, (i + 1) * PART));
    world.setDynamicProperty(key, parts);
    for (let i = parts; i < oldParts; i++) world.setDynamicProperty(`${key}#${i}`, undefined);
    return;
  }
  for (let i = 0; i < oldParts; i++) world.setDynamicProperty(`${key}#${i}`, undefined);
}

export function deleteJson(key) {
  const head = world.getDynamicProperty(key);
  if (typeof head === "number") for (let i = 0; i < head; i++) world.setDynamicProperty(`${key}#${i}`, undefined);
  world.setDynamicProperty(key, undefined);
}
