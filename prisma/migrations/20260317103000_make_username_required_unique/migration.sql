UPDATE users
SET username = lower(split_part(email, '@', 1))
WHERE username IS NULL OR btrim(username) = '';

WITH ranked_users AS (
  SELECT id,
         username,
         row_number() OVER (PARTITION BY username ORDER BY created_at, id) AS rn
  FROM users
),
deduplicated AS (
  SELECT id,
         CASE
           WHEN rn = 1 THEN username
           ELSE left(username, greatest(1, 24 - char_length(rn::text))) || rn::text
         END AS next_username
  FROM ranked_users
)
UPDATE users u
SET username = d.next_username
FROM deduplicated d
WHERE u.id = d.id;

ALTER TABLE users
ALTER COLUMN username SET NOT NULL;

CREATE UNIQUE INDEX users_username_key ON users (username);
