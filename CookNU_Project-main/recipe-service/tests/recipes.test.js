'use strict';
const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');
const { createMemoryRepo } = require('./memory-repo');
const { startServer } = require('./helpers');
const { sign } = require('../src/lib/jwt');

const SECRET = 'test-secret-with-enough-length';
const adobo = {
  title: 'Chicken Adobo',
  category: 'Dinner,Chicken',
  ingredients: '1 kg chicken\n1/2 cup soy sauce\n1/4 cup vinegar',
  instructions: 'Simmer everything until tender.',
  prepTime: '45 mins',
  servings: '4',
};

describe('recipe-service API', () => {
  let repo, api, ana, ben, anaToken, benToken;

  before(async () => {
    repo = createMemoryRepo();
    api = await startServer(createApp({ repo, jwtSecret: SECRET, version: 'test-1' }));
    ana = repo.addUser('Ana');
    ben = repo.addUser('Ben');
    anaToken = sign({ sub: ana.id }, SECRET);
    benToken = sign({ sub: ben.id }, SECRET);
  });
  after(() => api.close());
  beforeEach(() => repo.setHealthy(true));

  const create = async (body = adobo, token = anaToken) => (await api.request('POST', '/api/recipes', { token, body })).body.recipe;

  describe('health', () => {
    test('GET /health reports ok and version', async () => {
      const res = await api.request('GET', '/health');
      assert.equal(res.status, 200);
      assert.deepEqual(res.body, { status: 'ok', service: 'recipe-service', version: 'test-1', database: 'up' });
    });
    test('GET /api/recipes/health is not mistaken for a recipe id', async () => {
      assert.equal((await api.request('GET', '/api/recipes/health')).status, 200);
    });
    test('returns 503 when the database is down', async () => {
      repo.setHealthy(false);
      assert.equal((await api.request('GET', '/health')).status, 503);
    });
  });

  describe('create / read', () => {
    test('POST requires authentication', async () => {
      assert.equal((await api.request('POST', '/api/recipes', { body: adobo })).status, 401);
    });

    test('POST creates a recipe with normalised fields and the right author', async () => {
      const res = await api.request('POST', '/api/recipes', { token: anaToken, body: adobo });
      assert.equal(res.status, 201);
      const r = res.body.recipe;
      assert.equal(r.title, 'Chicken Adobo');
      assert.deepEqual(r.categories, ['Dinner', 'Chicken']);
      assert.equal(r.category, 'Dinner,Chicken');
      assert.equal(r.prepTime, 45);
      assert.equal(r.servings, 4);
      assert.equal(r.author.name, 'Ana');
      assert.equal(r.hearts, 0);
      assert.equal(r.heartedByMe, false);
    });

    test('POST only needs a title (like the frontend form)', async () => {
      const res = await api.request('POST', '/api/recipes', { token: anaToken, body: { title: 'Toast' } });
      assert.equal(res.status, 201);
      assert.deepEqual(res.body.recipe.categories, []);
      assert.equal(res.body.recipe.prepTime, null);
    });

    test('POST validates title, category, numbers and image', async () => {
      const res = await api.request('POST', '/api/recipes', {
        token: anaToken,
        body: { title: '  ', category: 'Pizza', prepTime: 'soon', servings: -2, image: 'javascript:alert(1)' },
      });
      assert.equal(res.status, 400);
      assert.deepEqual(Object.keys(res.body.details).sort(), ['category', 'image', 'prepTime', 'servings', 'title']);
    });

    test('POST rejects a token for a user that no longer exists', async () => {
      const ghost = repo.addUser('Ghost');
      const token = sign({ sub: ghost.id }, SECRET);
      repo.deleteUser(ghost.id);
      assert.equal((await api.request('POST', '/api/recipes', { token, body: adobo })).status, 401);
    });

    test('GET /:id is public and returns the recipe', async () => {
      const { id } = await create();
      const res = await api.request('GET', `/api/recipes/${id}`);
      assert.equal(res.status, 200);
      assert.equal(res.body.recipe.id, id);
    });

    test('GET /:id returns 404 for unknown and malformed ids', async () => {
      assert.equal((await api.request('GET', '/api/recipes/3f2b8c2e-0000-4000-8000-000000000000')).status, 404);
      assert.equal((await api.request('GET', '/api/recipes/not-a-uuid')).status, 404);
    });
  });

  describe('listing and filtering', () => {
    before(async () => {
      await create({ title: 'Banana Cue', category: 'Snacks,Dessert', ingredients: 'saba banana, brown sugar' }, benToken);
      await create({ title: 'Champorado', category: 'Breakfast', ingredients: 'rice, cocoa' }, benToken);
    });

    test('lists newest first', async () => {
      const { recipes } = (await api.request('GET', '/api/recipes')).body;
      assert.equal(recipes[0].title, 'Champorado');
      assert.ok(recipes.length >= 3);
    });

    test('search matches title and ingredients, case-insensitively', async () => {
      const byTitle = (await api.request('GET', '/api/recipes?search=BANANA')).body.recipes;
      assert.deepEqual(byTitle.map((r) => r.title), ['Banana Cue']);
      const byIngredient = (await api.request('GET', '/api/recipes?search=cocoa')).body.recipes;
      assert.deepEqual(byIngredient.map((r) => r.title), ['Champorado']);
    });

    test('category filter matches any of the requested categories', async () => {
      const { recipes } = (await api.request('GET', '/api/recipes?category=Dessert,Breakfast')).body;
      assert.deepEqual(recipes.map((r) => r.title).sort(), ['Banana Cue', 'Champorado']);
    });

    test('unknown category filter is a 400', async () => {
      assert.equal((await api.request('GET', '/api/recipes?category=Pizza')).status, 400);
    });

    test('mine=true shows only the caller\'s recipes and needs a token', async () => {
      assert.equal((await api.request('GET', '/api/recipes?mine=true')).status, 401);
      const { recipes } = (await api.request('GET', '/api/recipes?mine=true', { token: benToken })).body;
      assert.ok(recipes.length >= 2);
      assert.ok(recipes.every((r) => r.author.id === ben.id));
    });

    test('limit and offset page through results; bad values are rejected', async () => {
      const first = (await api.request('GET', '/api/recipes?limit=1&offset=0')).body.recipes;
      const second = (await api.request('GET', '/api/recipes?limit=1&offset=1')).body.recipes;
      assert.equal(first.length, 1);
      assert.notEqual(first[0].id, second[0].id);
      assert.equal((await api.request('GET', '/api/recipes?limit=0')).status, 400);
      assert.equal((await api.request('GET', '/api/recipes?limit=999')).status, 400);
    });
  });

  describe('update / delete (ownership)', () => {
    test('owner can update; omitted image is kept', async () => {
      const img = 'data:image/jpeg;base64,AAAA';
      const { id } = await create({ ...adobo, image: img });
      const res = await api.request('PUT', `/api/recipes/${id}`, { token: anaToken, body: { ...adobo, title: 'Adobo v2' } });
      assert.equal(res.status, 200);
      assert.equal(res.body.recipe.title, 'Adobo v2');
      assert.equal(res.body.recipe.image, img);
    });

    test('image can be cleared with an empty string', async () => {
      const { id } = await create({ ...adobo, image: 'data:image/jpeg;base64,AAAA' });
      const res = await api.request('PUT', `/api/recipes/${id}`, { token: anaToken, body: { ...adobo, image: '' } });
      assert.equal(res.body.recipe.image, '');
    });

    test('another user cannot update or delete (403) and anonymous gets 401', async () => {
      const { id } = await create();
      assert.equal((await api.request('PUT', `/api/recipes/${id}`, { token: benToken, body: adobo })).status, 403);
      assert.equal((await api.request('DELETE', `/api/recipes/${id}`, { token: benToken })).status, 403);
      assert.equal((await api.request('DELETE', `/api/recipes/${id}`)).status, 401);
      assert.equal((await api.request('GET', `/api/recipes/${id}`)).status, 200); // still there
    });

    test('update validates input', async () => {
      const { id } = await create();
      assert.equal((await api.request('PUT', `/api/recipes/${id}`, { token: anaToken, body: { title: '' } })).status, 400);
    });

    test('owner can delete; afterwards it is gone (404)', async () => {
      const { id } = await create();
      assert.equal((await api.request('DELETE', `/api/recipes/${id}`, { token: anaToken })).status, 204);
      assert.equal((await api.request('GET', `/api/recipes/${id}`)).status, 404);
      assert.equal((await api.request('DELETE', `/api/recipes/${id}`, { token: anaToken })).status, 404);
    });
  });

  describe('hearts and favorites', () => {
    test('heart toggles on and off and keeps the count right', async () => {
      const { id } = await create();
      let res = await api.request('POST', `/api/recipes/${id}/heart`, { token: benToken });
      assert.equal(res.status, 200);
      assert.equal(res.body.hearted, true);
      assert.equal(res.body.hearts, 1);
      assert.equal(res.body.recipe.heartedByMe, true);

      res = await api.request('POST', `/api/recipes/${id}/heart`, { token: benToken });
      assert.equal(res.body.hearted, false);
      assert.equal(res.body.hearts, 0);
    });

    test('hearting requires login and an existing recipe', async () => {
      const { id } = await create();
      assert.equal((await api.request('POST', `/api/recipes/${id}/heart`)).status, 401);
      assert.equal((await api.request('POST', '/api/recipes/3f2b8c2e-0000-4000-8000-000000000000/heart', { token: benToken })).status, 404);
    });

    test('hearting someone else\'s recipe notifies the author exactly once', async () => {
      const before = repo.notifications.length;
      const { id } = await create();
      await api.request('POST', `/api/recipes/${id}/heart`, { token: benToken });
      assert.equal(repo.notifications.length, before + 1);
      const n = repo.notifications.at(-1);
      assert.equal(n.userId, ana.id);
      assert.equal(n.text, 'Ben liked your recipe "Chicken Adobo"');
      await api.request('POST', `/api/recipes/${id}/heart`, { token: benToken }); // un-heart: no new notification
      assert.equal(repo.notifications.length, before + 1);
    });

    test('hearting your own recipe does not notify you', async () => {
      const before = repo.notifications.length;
      const { id } = await create();
      await api.request('POST', `/api/recipes/${id}/heart`, { token: anaToken });
      assert.equal(repo.notifications.length, before);
    });

    test('favorites=true lists only recipes the caller hearted', async () => {
      const { id } = await create({ title: 'Favorite Soup' });
      await create({ title: 'Not Favorite' });
      await api.request('POST', `/api/recipes/${id}/heart`, { token: benToken });
      const { recipes } = (await api.request('GET', '/api/recipes?favorites=true', { token: benToken })).body;
      assert.ok(recipes.some((r) => r.title === 'Favorite Soup'));
      assert.ok(recipes.every((r) => r.heartedByMe));
      assert.equal((await api.request('GET', '/api/recipes?favorites=true')).status, 401);
    });

    test('heartedByMe is false for anonymous viewers', async () => {
      const { id } = await create();
      await api.request('POST', `/api/recipes/${id}/heart`, { token: benToken });
      const res = await api.request('GET', `/api/recipes/${id}`);
      assert.equal(res.body.recipe.hearts, 1);
      assert.equal(res.body.recipe.heartedByMe, false);
    });
  });
});
