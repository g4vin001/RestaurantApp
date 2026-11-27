import "server-only";
import { cookies } from "next/headers";

const key = "restaurant_review_notice";

export async function setReviewNotice(path: string, message: string) {
  const store = await cookies();
  store.set(key, message, { path, httpOnly: true, sameSite: "lax", maxAge: 20, secure: process.env.NODE_ENV === "production" });
}

export async function readReviewNotice() {
  return (await cookies()).get(key)?.value;
}
