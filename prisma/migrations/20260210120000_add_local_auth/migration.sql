-- Add local auth fields and make keycloak sub optional
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "password_hash" TEXT;

ALTER TABLE "users"
  ALTER COLUMN "keycloak_sub" DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'users_email_key'
  ) THEN
    CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
  END IF;
END $$;
