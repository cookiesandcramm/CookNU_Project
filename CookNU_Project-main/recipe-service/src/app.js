'use strict';
const { createRouter, createHandler, HttpError, json } = require('./lib/http');
const { authenticate, requireUser } = require('./lib/auth');
const { isUuid, validateRecipe, parseCategories, parsePaging } = require('./validate');

const SERVICE = 'recipe-service';

function createApp({ repo, jwtSecret, version = 'dev', log }) {
  const router = createRouter();

  const health = async () => {
    try {
      await repo.ping();
      return json(200, { status: 'ok', service: SERVICE, version, database: 'up' });
    } catch {
      return json(503, { status: 'unavailable', service: SERVICE, version, database: 'down' });
    }
  };
  // Fixed paths first: otherwise "/api/recipes/health" would match "/api/recipes/:id".
  router.get('/health', health);
  router.get('/api/recipes/health', health);

  // Loads a recipe by :id, answering 404 for malformed ids as well as missing ones.
  async function loadRecipe(id, viewerId) {
    const recipe = isUuid(id) ? await repo.get(id, viewerId) : null;
    if (!recipe) throw new HttpError(404, 'Recipe not found');
    return recipe;
  }

  function assertOwner(recipe, user) {
    if (recipe.author.id !== user.id) throw new HttpError(403, 'You can only change your own recipes');
  }

  // GET /api/recipes?search=adobo&category=Dinner,Chicken&mine=true&favorites=true&limit=20&offset=0
  router.get('/api/recipes', async ({ req, query }) => {
    const viewer = authenticate(req, jwtSecret);
    const errors = {};
    const categories = parseCategories(query.get('category') || undefined, errors);
    if (errors.category) throw new HttpError(400, 'Validation failed', errors);
    const wantsMine = query.get('mine') === 'true';
    const wantsFavorites = query.get('favorites') === 'true';
    if ((wantsMine || wantsFavorites) && !viewer) throw new HttpError(401, 'Authentication required');

    const { limit, offset } = parsePaging(query);
    const search = (query.get('search') || '').trim().slice(0, 100);
    const recipes = await repo.list({
      viewerId: viewer ? viewer.id : null,
      search,
      categories,
      authorId: wantsMine ? viewer.id : undefined,
      favoritesOnly: wantsFavorites,
      limit,
      offset,
    });
    return json(200, { recipes, limit, offset });
  });

  router.get('/api/recipes/:id', async ({ req, params }) => {
    const viewer = authenticate(req, jwtSecret);
    return json(200, { recipe: await loadRecipe(params.id, viewer ? viewer.id : null) });
  });

  router.post('/api/recipes', async ({ req, readBody }) => {
    const user = requireUser(req, jwtSecret);
    const input = validateRecipe(await readBody());
    if (!(await repo.findUser(user.id))) throw new HttpError(401, 'Account no longer exists');
    const id = await repo.create(user.id, { ...input, image: input.image || '' });
    return json(201, { recipe: await repo.get(id, user.id) });
  });

  router.put('/api/recipes/:id', async ({ req, params, readBody }) => {
    const user = requireUser(req, jwtSecret);
    const existing = await loadRecipe(params.id, user.id);
    assertOwner(existing, user);
    const input = validateRecipe(await readBody());
    await repo.update(existing.id, { ...input, image: input.image === undefined ? existing.image : input.image });
    return json(200, { recipe: await repo.get(existing.id, user.id) });
  });

  router.delete('/api/recipes/:id', async ({ req, params }) => {
    const user = requireUser(req, jwtSecret);
    const existing = await loadRecipe(params.id, user.id);
    assertOwner(existing, user);
    await repo.remove(existing.id);
    return json(204);
  });

  // Toggles the viewer's heart. Hearting someone else's recipe notifies its author.
  router.post('/api/recipes/:id/heart', async ({ req, params }) => {
    const user = requireUser(req, jwtSecret);
    const actor = await repo.findUser(user.id);
    if (!actor) throw new HttpError(401, 'Account no longer exists');
    const recipe = await loadRecipe(params.id, user.id);

    let hearted;
    if (await repo.addHeart(recipe.id, user.id)) {
      hearted = true;
      if (recipe.author.id !== user.id) {
        await repo.addNotification({
          userId: recipe.author.id,
          actorId: user.id,
          recipeId: recipe.id,
          actorName: actor.name,
          recipeTitle: recipe.title,
          text: `${actor.name} liked your recipe "${recipe.title}"`,
        });
      }
    } else {
      await repo.removeHeart(recipe.id, user.id);
      hearted = false;
    }
    const updated = await repo.get(recipe.id, user.id);
    return json(200, { hearted, hearts: updated.hearts, recipe: updated });
  });

  return { handler: createHandler(router, { log }) };
}

module.exports = { createApp };
