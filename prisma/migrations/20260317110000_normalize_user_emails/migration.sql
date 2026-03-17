DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT LOWER(TRIM("email")) AS normalized_email
      FROM "users"
      GROUP BY LOWER(TRIM("email"))
      HAVING COUNT(*) > 1
    ) duplicates
  ) THEN
    RAISE EXCEPTION
      'Cannot normalize user emails: duplicate values would conflict after lowercasing/trimming';
  END IF;
END $$;

UPDATE "users"
SET "email" = LOWER(TRIM("email"))
WHERE "email" <> LOWER(TRIM("email"));
