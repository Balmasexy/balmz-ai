export default function AdminLoading() {
  return (
    <main className="min-h-screen bg-[#080d15] px-5 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-[1500px] animate-pulse">
        <div className="flex items-center gap-3 border-b border-white/10 pb-6">
          <div className="h-10 w-10 rounded-xl bg-white/10" />
          <div><div className="h-3 w-28 rounded bg-white/10" /><div className="mt-2 h-2 w-24 rounded bg-white/5" /></div>
        </div>
        <div className="mt-10 h-3 w-32 rounded bg-orange-400/15" />
        <div className="mt-3 h-9 w-72 rounded-xl bg-white/10" />
        <div className="mt-3 h-4 w-[min(520px,90%)] rounded bg-white/5" />
        <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-36 rounded-2xl border border-white/5 bg-white/[0.025]" />)}
        </div>
        <div className="mt-6 grid gap-5 xl:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-64 rounded-2xl border border-white/5 bg-white/[0.025]" />)}
        </div>
      </div>
    </main>
  );
}
