import { Banknote, HeartPulse, Palmtree, ShieldCheck } from 'lucide-react'

const GROUPS = [
  { icon: Palmtree, title: 'Time off', qs: ['How many vacation days do I get each year?', 'Can I take a day off for Diwali?', "I'm having a baby, how long can I be away from work?"] },
  { icon: Banknote, title: 'Pay and expenses', qs: ['How is overtime calculated?', 'How soon do I get my money back after buying something for work?'] },
  { icon: HeartPulse, title: 'Benefits', qs: ['What is the 401(k) employer match?', 'Is therapy covered for me and my family?'] },
  { icon: ShieldCheck, title: 'Work and security', qs: ['Am I allowed to paste customer data into ChatGPT?', 'Can I work from Portugal for a month?', 'How much equity do new engineers receive?'] },
]

export function EmptyState({ onPick }: { onPick: (q: string) => void }) {
  return (
    <div className="enter mx-auto flex min-h-full max-w-3xl flex-col px-2 py-10"><div className="my-auto">
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-accent">PolicyPilot</p>
      <h1 className="font-serif text-4xl font-medium leading-[1.1] tracking-tight sm:text-5xl">What would you like to know about working at Northwind Labs?</h1>
      <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-sub">
        Ask in your own words. Answers come only from the handbook and cite the passages they use, and when the handbook does not say, you are told so instead of getting a guess.
      </p>
      <div className="mt-9 grid gap-4 sm:grid-cols-2">
        {GROUPS.map((g) => (
          <div key={g.title} className="rounded-2xl border border-line bg-surface p-4">
            <p className="mb-2.5 flex items-center gap-2 text-[13px] font-semibold"><g.icon size={15} className="text-accent" /> {g.title}</p>
            <ul className="space-y-1">
              {g.qs.map((q) => (
                <li key={q}>
                  <button onClick={() => onPick(q)} className="w-full rounded-lg px-2.5 py-1.5 text-left text-[13.5px] text-sub transition-colors hover:bg-surface-2 hover:text-ink">{q}</button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="mt-6 text-xs text-muted">The handbook is a fictional example. The last question in the last box is one it cannot answer, to show how that looks.</p>
    </div></div>
  )
}
