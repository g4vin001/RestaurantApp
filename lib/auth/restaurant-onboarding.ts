import type { ApplicantRelationship } from "@/lib/generated/prisma/enums";
import { RestaurantReviewError } from "@/lib/restaurants/review";

export const applicantRelationships = {
  OWNER: "Owner",
  MANAGER: "Manager",
  AUTHORIZED_REPRESENTATIVE: "Authorized representative",
} satisfies Record<ApplicantRelationship, string>;

export const MAX_EVIDENCE_BYTES = 2 * 1024 * 1024;

function formText(form: FormData, field: string) {
  const value = form.get(field);
  return typeof value === "string" ? value.replaceAll("\0", "").trim().replace(/\s+/g, " ") : "";
}

function webUrl(raw: string) {
  try {
    const url = new URL(raw);
    if (raw.length <= 2048 && url.protocol === "https:" && !url.username && !url.password && !url.port) return url;
  } catch {
    // Handled with field-specific feedback by the caller.
  }
  return null;
}

function isMapsUrl(url: URL) {
  const { hostname, pathname } = url;
  const googleHosts = ["google.com", "www.google.com", "maps.google.com", "google.com.ph", "www.google.com.ph", "maps.google.com.ph"];
  const coordinatesOrPlace = ["q", "ll", "query", "cid", "ftid"].some((key) => Boolean(url.searchParams.get(key)?.trim()));
  return (
    (googleHosts.includes(hostname) &&
      ((["/maps", "/maps/"].includes(pathname) && coordinatesOrPlace) ||
        /^\/maps\/(?:place\/[^/]+|search\/[^/]+|@[-\d.]+,[-\d.]+|data=.+)/.test(pathname))) ||
    (hostname === "maps.app.goo.gl" && /^\/[\w-]+\/?$/.test(pathname)) ||
    (hostname === "goo.gl" && /^\/maps\/[\w-]+\/?$/.test(pathname)) ||
    (["maps.google.com", "maps.google.com.ph"].includes(hostname) && pathname === "/" && coordinatesOrPlace)
  );
}

export function validateRestaurantApplication(form: FormData) {
  const name = formText(form, "name");
  const address = formText(form, "address");
  const maps = webUrl(formText(form, "mapsUrl"));
  const phone = formText(form, "phone");
  const businessEmail = formText(form, "businessEmail").toLowerCase();
  const applicantName = formText(form, "applicantName");
  const relationship = formText(form, "relationship");
  const websiteText = formText(form, "website");
  const website = websiteText ? webUrl(websiteText) : null;

  if (name.length < 2 || name.length > 80) throw new RestaurantReviewError("Enter a restaurant name between 2 and 80 characters.");
  if (address.length < 10 || address.length > 300) throw new RestaurantReviewError("Enter the complete business address (10–300 characters).");
  if (!maps || !isMapsUrl(maps)) throw new RestaurantReviewError("Enter a Google Maps location or share link.");
  if (!/^\+?[\d(). -]+$/.test(phone) || !/^\d{7,15}$/.test(phone.replace(/\D/g, "")) || phone.length > 35) {
    throw new RestaurantReviewError("Enter a valid restaurant contact number.");
  }
  if (businessEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(businessEmail)) {
    throw new RestaurantReviewError("Enter a valid business email address.");
  }
  if (applicantName.length < 2 || applicantName.length > 100) throw new RestaurantReviewError("Enter your full name (2–100 characters).");
  if (!Object.hasOwn(applicantRelationships, relationship)) throw new RestaurantReviewError("Select your relationship to the restaurant.");
  if (websiteText && !website) throw new RestaurantReviewError("Enter a valid HTTPS website or social media link.");

  maps.hash = "";
  for (const tracking of ["entry", "g_ep", "g_st", "utm_source", "utm_medium", "utm_campaign"]) maps.searchParams.delete(tracking);
  return {
    name, address, mapsUrl: maps.href, phone, businessEmail, applicantName,
    relationship: relationship as ApplicantRelationship,
    website: website?.href ?? null,
  };
}

const fileSignatures = [
  ["application/pdf", [37, 80, 68, 70, 45], "pdf"],
  ["image/png", [137, 80, 78, 71, 13, 10, 26, 10], "png"],
  ["image/jpeg", [255, 216, 255], "jpg"],
] as const;

export async function readApplicationEvidence(value: FormDataEntryValue | null, required: boolean) {
  if (value === null || (value instanceof File && value.size === 0 && (!value.name || value.name === "blob"))) {
    if (required) throw new RestaurantReviewError("Attach proof of business ownership or authorization.");
    return null;
  }
  if (!(value instanceof File) || !value.size || value.size > MAX_EVIDENCE_BYTES) {
    throw new RestaurantReviewError("Upload a PDF, PNG, or JPEG no larger than 2 MB.");
  }
  const content = new Uint8Array(await value.arrayBuffer());
  const match = fileSignatures.find(([mime, signature]) =>
    value.type === mime && content.length > signature.length && signature.every((byte, index) => content[index] === byte),
  );
  if (!match) throw new RestaurantReviewError("The file contents must match a PDF, PNG, or JPEG.");
  const stem = value.name.replace(/\.[^.]*$/, "").normalize("NFKC").replace(/[^a-z0-9._ -]/gi, "_").trim().slice(0, 100);
  return { filename: `${stem || "evidence"}.${match[2]}`, contentType: match[0], content };
}

export function createRestaurantSlug(name: string, suffix: string) {
  const base = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 54);

  return `${base || "restaurant"}-${suffix.toLowerCase()}`;
}
