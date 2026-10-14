'use strict';
const { HttpError } = require('./lib/http');

// Must match the category pills in frontend/index.html.
const CATEGORIES = ['Breakfast', 'Lunch', 'Dinner', 'Snacks', 'Dessert', 'Drinks', 'Chicken', 'Beef', 'Seafood', 'Vegetarian'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_IMAGE_LENGTH = 400000;

const isString = (v) => typeof v === 'string';
const isUuid = (v) => isString(v) && UUID_RE.test(v);

function throwIfAny(errors) {
  if (Object.keys(errors).length) throw new HttpError(400, 'Validation failed', errors);
}

// Accepts "Dinner,Chicken" (what the frontend stores) or ["Dinner","Chicken"].
function parseCategories(value, errors) {
  if (value === undefined || value === null || value === '') return [];
  const list = Array.isArray(value) ? value : isString(value) ? value.split(',') : null;
  if (!list || list.some((c) => !isString(c))) {
    errors.category = 'Category must be a comma-separated string or an array of strings.';
    return [];
  }
  const cleaned = [...new Set(list.map((c) => c.trim()).filter(Boolean))];
  const unknown = cleaned.filter((c) => !CATEGORIES.includes(c));
  if (unknown.length) errors.category = `Unknown category: ${unknown.join(', ')}. Allowed: ${CATEGORIES.join(', ')}.`;
  return cleaned;
}

// "30", 30 and "30 mins" are all accepted (the frontend shows "30 mins").
function parsePositiveInt(value, field, max, errors) {
  if (value === undefined || value === null || value === '') return null;
  let n = value;
  if (isString(value)) {
    const m = /^\s*(\d{1,6})(\s*mins?)?\s*$/i.exec(value);
    n = m ? Number(m[1]) : NaN;
  }
  if (!Number.isInteger(n) || n < 1 || n > max) {
    errors[field] = `${field} must be a whole number between 1 and ${max}.`;
    return null;
  }
  return n;
}

function parseText(value, field, maxLength, errors) {
  if (value === undefined || value === null) return '';
  if (!isString(value) || value.length > maxLength) {
    errors[field] = `${field} must be text of at most ${maxLength} characters.`;
    return '';
  }
  return value.trim();
}

// undefined => "not provided" (callers keep the existing image); '' / null => no image.
function parseImage(value, errors) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return '';
  if (!isString(value) || value.length > MAX_IMAGE_LENGTH || !/^(data:image\/|https?:\/\/)/i.test(value)) {
    errors.image = 'Image must be an image data URL or an http(s) URL (max 400 KB).';
    return '';
  }
  return value;
}

function validateRecipe(body) {
  const errors = {};
  let title = '';
  if (!isString(body.title) || !body.title.trim()) errors.title = 'Title is required.';
  else if (body.title.trim().length > 150) errors.title = 'Title must be 150 characters or fewer.';
  else title = body.title.trim();

  const recipe = {
    title,
    categories: parseCategories(body.category !== undefined ? body.category : body.categories, errors),
    ingredients: parseText(body.ingredients, 'ingredients', 10000, errors),
    instructions: parseText(body.instructions, 'instructions', 20000, errors),
    prepTime: parsePositiveInt(body.prepTime, 'prepTime', 10080, errors),
    servings: parsePositiveInt(body.servings, 'servings', 1000, errors),
    image: parseImage(body.image, errors),
  };
  throwIfAny(errors);
  return recipe;
}

function parsePaging(query) {
  const errors = {};
  const read = (name, fallback, min, max) => {
    const raw = query.get(name);
    if (raw === null || raw === '') return fallback;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < min || n > max) {
      errors[name] = `${name} must be an integer between ${min} and ${max}.`;
      return fallback;
    }
    return n;
  };
  const paging = { limit: read('limit', 50, 1, 100), offset: read('offset', 0, 0, 1000000) };
  throwIfAny(errors);
  return paging;
}

module.exports = { CATEGORIES, isUuid, validateRecipe, parseCategories, parsePaging };
