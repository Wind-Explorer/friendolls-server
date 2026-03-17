UPDATE "users"
SET "email" = LOWER(TRIM("email"))
WHERE "email" <> LOWER(TRIM("email"));

ALTER TABLE "users"
  DROP CONSTRAINT IF EXISTS "users_email_key";

CREATE UNIQUE INDEX "users_email_key" ON "users"(LOWER("email"));
