-- AlterTable
ALTER TABLE "users" ADD COLUMN     "active_doll_id" TEXT;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_active_doll_id_fkey" FOREIGN KEY ("active_doll_id") REFERENCES "dolls"("id") ON DELETE SET NULL ON UPDATE CASCADE;
