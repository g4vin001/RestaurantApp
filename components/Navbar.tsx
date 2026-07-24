import Link from "next/link";
import { logout } from "@/app/login/actions";
import { createClient } from "@/lib/supabase/server";

export async function Navbar() {
  const supabase = await createClient();
  const response = await supabase.auth.getUser();
  const user = response.data.user;

  return <header className="border-b border-stone-200 bg-white"><nav className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4"><Link href="/" className="text-xl font-bold text-emerald-800">Halina</Link><div className="flex items-center gap-4 text-sm text-stone-600"><Link href="/manager">Manager</Link><Link href="/employee">Employee</Link>{user ? <form action={logout}><button type="submit" className="font-medium text-stone-700">Log out</button></form> : <Link href="/login" className="font-medium text-emerald-700">Log in</Link>}</div></nav></header>;
}
