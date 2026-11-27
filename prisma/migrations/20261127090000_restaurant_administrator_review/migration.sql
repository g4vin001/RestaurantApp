-- CreateEnum
CREATE TYPE "RestaurantLifecycle" AS ENUM ('SETUP', 'PUBLISHED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "ApplicantRelationship" AS ENUM ('OWNER', 'MANAGER', 'AUTHORIZED_REPRESENTATIVE');

-- CreateEnum
CREATE TYPE "RestaurantReviewAction" AS ENUM ('SUBMITTED', 'RESUBMITTED', 'INFORMATION_REQUESTED', 'NOTE_ADDED', 'APPROVED', 'DECLINED', 'PUBLICATION_REQUESTED', 'PUBLICATION_RETURNED', 'PUBLISHED', 'SUSPENDED', 'RESTORED');

-- AlterTable
ALTER TABLE "Restaurant" ADD COLUMN     "lifecycle" "RestaurantLifecycle" NOT NULL DEFAULT 'PUBLISHED',
ADD COLUMN     "publicationRequestedAt" TIMESTAMP(3),
ADD COLUMN     "publicationRequestedBy" UUID;

-- Existing rows retain their previous visibility, including archived and
-- TEST rows. Every new restaurant enters setup.
ALTER TABLE "Restaurant" ALTER COLUMN "lifecycle" SET DEFAULT 'SETUP';

-- Extend the original applications in place, preserving location, decisions,
-- reviewers and linked restaurant IDs. New evidence and email verification
-- timestamps are collected when an applicant submits the revised form.
ALTER TABLE "RestaurantApplication"
    ADD COLUMN "id" UUID,
    ADD COLUMN "applicantEmail" TEXT,
    ADD COLUMN "applicantName" TEXT,
    ADD COLUMN "businessEmail" TEXT,
    ADD COLUMN "businessKey" TEXT,
    ADD COLUMN "emailVerifiedAt" TIMESTAMP(3),
    ADD COLUMN "phone" TEXT,
    ADD COLUMN "relationship" "ApplicantRelationship",
    ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "updatedAt" TIMESTAMP(3),
    ADD COLUMN "website" TEXT;

UPDATE "RestaurantApplication" a
SET "id" = gen_random_uuid(), "applicantEmail" = p."email", "applicantName" = p."displayName",
    "businessEmail" = '', "phone" = '', "updatedAt" = COALESCE(a."reviewedAt", a."submittedAt")
FROM "Profile" p WHERE a."applicantId" = p."id";

ALTER TABLE "RestaurantApplication"
    DROP CONSTRAINT "RestaurantApplication_applicantId_fkey",
    DROP CONSTRAINT "RestaurantApplication_pkey",
    ALTER COLUMN "applicantId" DROP NOT NULL,
    ALTER COLUMN "id" SET NOT NULL,
    ALTER COLUMN "applicantEmail" SET NOT NULL,
    ALTER COLUMN "applicantName" SET NOT NULL,
    ALTER COLUMN "businessEmail" SET NOT NULL,
    ALTER COLUMN "phone" SET NOT NULL,
    ALTER COLUMN "updatedAt" SET NOT NULL,
    ADD CONSTRAINT "RestaurantApplication_pkey" PRIMARY KEY ("id");

-- CreateTable
CREATE TABLE "RestaurantApplicationEvidence" (
    "id" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "filename" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "content" BYTEA NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RestaurantApplicationEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantReviewEvent" (
    "id" UUID NOT NULL,
    "applicationId" UUID,
    "restaurantId" UUID,
    "actorId" UUID,
    "actorEmail" TEXT,
    "action" "RestaurantReviewAction" NOT NULL,
    "fromStatus" "RestaurantApplicationStatus",
    "toStatus" "RestaurantApplicationStatus",
    "fromLifecycle" "RestaurantLifecycle",
    "toLifecycle" "RestaurantLifecycle",
    "message" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RestaurantReviewEvent_pkey" PRIMARY KEY ("id")
);

INSERT INTO "RestaurantReviewEvent" ("id", "applicationId", "actorId", "actorEmail", "action", "toStatus", "details", "createdAt")
SELECT gen_random_uuid(), a."id", a."applicantId", a."applicantEmail", 'SUBMITTED', 'PENDING',
    jsonb_build_object('name', a."name", 'address', a."location", 'mapsUrl', a."mapsUrl", 'legacySubmission', true),
    a."submittedAt"
FROM "RestaurantApplication" a;

INSERT INTO "RestaurantReviewEvent" ("id", "applicationId", "restaurantId", "actorId", "actorEmail", "action", "fromStatus", "toStatus", "details", "createdAt")
SELECT gen_random_uuid(), a."id", a."restaurantId", a."reviewedById", p."email",
    a."status"::text::"RestaurantReviewAction", 'PENDING', a."status",
    jsonb_build_object('legacyDecision', true), COALESCE(a."reviewedAt", a."submittedAt")
FROM "RestaurantApplication" a
LEFT JOIN "Profile" p ON p."id" = a."reviewedById"
WHERE a."status" IN ('APPROVED', 'DECLINED');

-- CreateIndex
CREATE INDEX "RestaurantApplication_applicantId_submittedAt_idx" ON "RestaurantApplication"("applicantId", "submittedAt");

-- CreateIndex
CREATE INDEX "RestaurantApplication_businessKey_idx" ON "RestaurantApplication"("businessKey");

-- CreateIndex
CREATE INDEX "RestaurantApplicationEvidence_applicationId_submittedAt_idx" ON "RestaurantApplicationEvidence"("applicationId", "submittedAt");

-- CreateIndex
CREATE INDEX "RestaurantReviewEvent_applicationId_createdAt_idx" ON "RestaurantReviewEvent"("applicationId", "createdAt");

-- CreateIndex
CREATE INDEX "RestaurantReviewEvent_restaurantId_createdAt_idx" ON "RestaurantReviewEvent"("restaurantId", "createdAt");

-- CreateIndex
CREATE INDEX "Restaurant_environment_lifecycle_archivedAt_idx" ON "Restaurant"("environment", "lifecycle", "archivedAt");

-- AddForeignKey
ALTER TABLE "RestaurantApplication" ADD CONSTRAINT "RestaurantApplication_applicantId_fkey" FOREIGN KEY ("applicantId") REFERENCES "Profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantApplicationEvidence" ADD CONSTRAINT "RestaurantApplicationEvidence_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "RestaurantApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantReviewEvent" ADD CONSTRAINT "RestaurantReviewEvent_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "RestaurantApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "RestaurantApplication_one_open_per_applicant"
  ON "RestaurantApplication" ("applicantId")
  WHERE "status" IN ('PENDING', 'NEEDS_INFORMATION');
CREATE UNIQUE INDEX "RestaurantApplication_one_open_per_business"
  ON "RestaurantApplication" ("businessKey")
  WHERE "status" IN ('PENDING', 'NEEDS_INFORMATION');

CREATE FUNCTION private.halina_business_identity(name text, address text)
RETURNS text
LANGUAGE sql IMMUTABLE STRICT
SET search_path = ''
AS $$
  SELECT trim(regexp_replace(lower(name), '[^[:alnum:]]+', ' ', 'g'))
    || '|' || trim(regexp_replace(lower(address), '[^[:alnum:]]+', ' ', 'g'));
$$;
REVOKE ALL ON FUNCTION private.halina_business_identity(text, text) FROM PUBLIC, anon, authenticated;

CREATE INDEX "Restaurant_live_business_identity_idx"
  ON "Restaurant" (private.halina_business_identity("name", "location"))
  WHERE "environment" = 'LIVE' AND "archivedAt" IS NULL;

ALTER TABLE "RestaurantApplicationEvidence" ADD CONSTRAINT "RestaurantApplicationEvidence_supported_file"
  CHECK ("contentType" IN ('application/pdf', 'image/png', 'image/jpeg') AND octet_length("content") BETWEEN 1 AND 2097152);

CREATE FUNCTION private.halina_reject_review_history_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'Restaurant review history is append-only';
END;
$$;
REVOKE ALL ON FUNCTION private.halina_reject_review_history_change() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER "RestaurantReviewEvent_append_only"
  BEFORE UPDATE OR DELETE OR TRUNCATE ON "RestaurantReviewEvent"
  FOR EACH STATEMENT EXECUTE FUNCTION private.halina_reject_review_history_change();

ALTER TABLE "RestaurantApplication" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RestaurantApplicationEvidence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RestaurantReviewEvent" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "RestaurantApplication", "RestaurantApplicationEvidence", "RestaurantReviewEvent" FROM PUBLIC, anon, authenticated;
