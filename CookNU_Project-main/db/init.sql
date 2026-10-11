-- Cook'N U database schema + demo seed data.
--
-- Runs automatically ONCE, the first time the database volume is created
-- (PostgreSQL executes everything in /docker-entrypoint-initdb.d on an empty
-- data directory). Every statement is idempotent, so re-running is harmless.
--
-- Ownership of the tables (which service reads/writes what):
--   users           auth-service (writes), recipe-service (reads author names)
--   recipes         recipe-service
--   recipe_hearts   recipe-service
--   notifications   recipe-service (writes) / notification-service (reads)

-- ------------------------------------------------------------------ users
CREATE TABLE IF NOT EXISTS users (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    name          VARCHAR(100) NOT NULL,
    email         VARCHAR(254) NOT NULL,
    password_hash TEXT         NOT NULL,          -- scrypt$N$salt$hash, never the plain password
    avatar        TEXT,                           -- image data-URL or URL, optional
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);
-- Emails are unique regardless of capitalisation.
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx ON users (lower(email));

-- ---------------------------------------------------------------- recipes
CREATE TABLE IF NOT EXISTS recipes (
    id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id      UUID         NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    title          VARCHAR(150) NOT NULL,
    categories     TEXT[]       NOT NULL DEFAULT '{}',   -- e.g. {Dinner,Chicken}
    ingredients    TEXT         NOT NULL DEFAULT '',     -- one ingredient per line
    instructions   TEXT         NOT NULL DEFAULT '',
    prep_time_mins INTEGER      CHECK (prep_time_mins IS NULL OR prep_time_mins > 0),
    servings       INTEGER      CHECK (servings IS NULL OR servings > 0),
    image          TEXT,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS recipes_created_at_idx ON recipes (created_at DESC);
CREATE INDEX IF NOT EXISTS recipes_author_idx     ON recipes (author_id);

-- ---------------------------------------------------------- recipe_hearts
-- Replaces Firestore's hearts_by array: one row per (recipe, user) heart.
CREATE TABLE IF NOT EXISTS recipe_hearts (
    recipe_id  UUID        NOT NULL REFERENCES recipes (id) ON DELETE CASCADE,
    user_id    UUID        NOT NULL REFERENCES users (id)   ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (recipe_id, user_id)              -- a user can heart a recipe only once
);
CREATE INDEX IF NOT EXISTS recipe_hearts_user_idx ON recipe_hearts (user_id);

-- ---------------------------------------------------------- notifications
CREATE TABLE IF NOT EXISTS notifications (
    id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID         NOT NULL REFERENCES users (id)   ON DELETE CASCADE,  -- who is notified
    actor_id     UUID                  REFERENCES users (id)   ON DELETE SET NULL, -- who did it
    recipe_id    UUID                  REFERENCES recipes (id) ON DELETE CASCADE,
    actor_name   VARCHAR(100),
    recipe_title VARCHAR(150),
    text         TEXT         NOT NULL,
    is_read      BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications (user_id, created_at DESC);

-- ------------------------------------------------------------- seed data
-- Demo account for presentations:  chef@cooknu.example  /  Chef@12345
INSERT INTO users (id, name, email, password_hash)
VALUES (
    '00000000-0000-4000-8000-000000000001',
    'Chef Demo',
    'chef@cooknu.example',
    'scrypt$16384$4e3243b6fbee73d5abdbd446df852b4b$984d14fa4b41d6a277f80f41be870212e10847f35703ccdf1493d305d65c2364fcbf787999ba09e56fd3bd07c501c428c0b36414904986149e924230d94757c8'
)
ON CONFLICT DO NOTHING;

INSERT INTO recipes (id, author_id, title, categories, ingredients, instructions, prep_time_mins, servings)
VALUES
(
    '00000000-0000-4000-8000-0000000000a1',
    '00000000-0000-4000-8000-000000000001',
    'Chicken Adobo',
    ARRAY['Lunch','Dinner','Chicken'],
    $$1 kg chicken thighs
1/2 cup soy sauce
1/3 cup vinegar
1 head garlic, crushed
3 bay leaves
1 tsp whole peppercorns$$,
    $$Combine everything in a pot and marinate for 30 minutes.
Bring to a boil, then simmer covered for 30 minutes.
Uncover and reduce the sauce until glossy. Serve with rice.$$,
    60, 4
),
(
    '00000000-0000-4000-8000-0000000000a2',
    '00000000-0000-4000-8000-000000000001',
    'Champorado',
    ARRAY['Breakfast'],
    $$1 cup glutinous rice
4 cups water
1/2 cup cocoa powder or tablea
1/2 cup sugar
Evaporated milk, to serve$$,
    $$Boil the rice in water until soft, stirring often.
Stir in cocoa and sugar until thick and smooth.
Serve hot with a swirl of evaporated milk.$$,
    35, 4
),
(
    '00000000-0000-4000-8000-0000000000a3',
    '00000000-0000-4000-8000-000000000001',
    'Banana Cue',
    ARRAY['Snacks','Dessert','Vegetarian'],
    $$6 saba bananas
1 cup brown sugar
Oil, for frying
Bamboo skewers$$,
    $$Heat oil in a pan. Fry the bananas until golden.
Sprinkle in brown sugar and let it caramelise, turning to coat.
Skewer and serve warm.$$,
    20, 6
)
ON CONFLICT DO NOTHING;
