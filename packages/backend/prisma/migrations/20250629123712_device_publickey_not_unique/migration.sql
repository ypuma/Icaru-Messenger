-- DropIndex
DROP INDEX "devices_publicKey_key";

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "handle" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "privateKey" TEXT,
    "hashedPassword" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_users" ("createdAt", "handle", "hashedPassword", "id", "privateKey", "publicKey", "updatedAt") SELECT "createdAt", "handle", "hashedPassword", "id", "privateKey", "publicKey", "updatedAt" FROM "users";
DROP TABLE "users";
ALTER TABLE "new_users" RENAME TO "users";
CREATE UNIQUE INDEX "users_handle_key" ON "users"("handle");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
