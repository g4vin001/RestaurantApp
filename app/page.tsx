import { CustomerHome } from "@/components/customer/CustomerHome";

// Without this, Next.js prerenders this page once at build time (nothing
// here reads cookies/params to force dynamic rendering the way other pages
// do) and would keep serving that same static snapshot — new restaurants
// wouldn't show up until the next deploy.
export const dynamic = "force-dynamic";

export default function HomePage() {
  return <CustomerHome />;
}
