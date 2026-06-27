/*
  Warnings:

  - The values [buyer,deliveryGuy,system,admin] on the enum `DeliveryActorType` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "DeliveryActorType_new" AS ENUM ('BUYER', 'DELIVERY_GUY', 'SYSTEM', 'ADMIN');
ALTER TABLE "DeliveryPhoto" ALTER COLUMN "uploadedBy" TYPE "DeliveryActorType_new" USING ("uploadedBy"::text::"DeliveryActorType_new");
ALTER TABLE "DeliveryOTP" ALTER COLUMN "enteredBy" TYPE "DeliveryActorType_new" USING ("enteredBy"::text::"DeliveryActorType_new");
ALTER TABLE "DeliveryTimeline" ALTER COLUMN "actor" TYPE "DeliveryActorType_new" USING ("actor"::text::"DeliveryActorType_new");
ALTER TABLE "DeliveryDispute" ALTER COLUMN "claimerType" TYPE "DeliveryActorType_new" USING ("claimerType"::text::"DeliveryActorType_new");
ALTER TYPE "DeliveryActorType" RENAME TO "DeliveryActorType_old";
ALTER TYPE "DeliveryActorType_new" RENAME TO "DeliveryActorType";
DROP TYPE "public"."DeliveryActorType_old";
COMMIT;
