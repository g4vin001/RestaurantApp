import Link from "next/link";

export function Navbar() {
  return <header className="border-b border-stone-200 bg-white"><nav className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4"><Link href="/" className="text-xl font-bold text-emerald-800">Halina</Link><div className="flex gap-4 text-sm text-stone-600"><Link href="/manager">Manager</Link><Link href="/employee">Employee</Link></div></nav></header>;
}
