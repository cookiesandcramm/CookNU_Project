'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { validateRecipe, parseCategories, isUuid } = require('../src/validate');
const { escapeLike } = require('../src/repo');

describe('validation helpers', () => {
  test('parseCategories handles strings, arrays, duplicates and blanks', () => {
    const errors = {};
    assert.deepEqual(parseCategories('Dinner, Chicken ,Dinner', errors), ['Dinner', 'Chicken']);
    assert.deepEqual(parseCategories(['Lunch'], errors), ['Lunch']);
    assert.deepEqual(parseCategories('', errors), []);
    assert.deepEqual(parseCategories(undefined, errors), []);
    assert.deepEqual(errors, {});
  });

  test('parseCategories flags unknown categories', () => {
    const errors = {};
    parseCategories('Dinner,Pizza', errors);
    assert.match(errors.category, /Pizza/);
  });

  test('validateRecipe accepts "30 mins" and plain numbers', () => {
    assert.equal(validateRecipe({ title: 'x', prepTime: '30 mins' }).prepTime, 30);
    assert.equal(validateRecipe({ title: 'x', prepTime: 30 }).prepTime, 30);
    assert.equal(validateRecipe({ title: 'x', servings: '4' }).servings, 4);
  });

  test('validateRecipe trims text and leaves image undefined when absent', () => {
    const r = validateRecipe({ title: '  Soup  ', ingredients: ' water ' });
    assert.equal(r.title, 'Soup');
    assert.equal(r.ingredients, 'water');
    assert.equal(r.image, undefined);
  });

  test('isUuid', () => {
    assert.ok(isUuid('3f2b8c2e-0000-4000-8000-000000000000'));
    assert.ok(!isUuid("1'; DROP TABLE recipes;--"));
    assert.ok(!isUuid(undefined));
  });

  test('escapeLike neutralises LIKE wildcards', () => {
    assert.equal(escapeLike('100%_sure\\'), '100\\%\\_sure\\\\');
  });
});
