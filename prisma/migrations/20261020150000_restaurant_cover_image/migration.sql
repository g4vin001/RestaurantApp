-- One public photo per restaurant. Bytes are served only through the
-- Next.js /restaurants/[slug]/cover route, never the Supabase Data API.
CREATE TABLE "RestaurantCoverImage" (
    "restaurantId" UUID NOT NULL,
    "contentType" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestaurantCoverImage_pkey" PRIMARY KEY ("restaurantId")
);

ALTER TABLE "RestaurantCoverImage" ADD CONSTRAINT "RestaurantCoverImage_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RestaurantCoverImage" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "RestaurantCoverImage" FROM anon, authenticated;
