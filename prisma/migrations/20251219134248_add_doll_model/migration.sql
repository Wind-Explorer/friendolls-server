-- CreateTable
CREATE TABLE "dolls" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "configuration" JSONB NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "dolls_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "dolls" ADD CONSTRAINT "dolls_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
