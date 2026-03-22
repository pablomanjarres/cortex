import { useState, useMemo, useRef } from 'react'
import { PageShell } from '@/components/shared/PageShell'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { useStore } from '@/lib/store'
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  PiggyBank,
  Plus,
  Trash2,
  CreditCard,
  Columns2,
} from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts'

// ── Types ────────────────────────────────────────────────────────────────────

type ItemType = 'Income' | 'Expense' | 'Subscription'

interface FinanceItem {
  id: string
  name: string
  type: ItemType
  months: number[]
}

interface FinanceData {
  year: number
  items: FinanceItem[]
}

// ── Default Data (from Finances.xlsx) ────────────────────────────────────────

const DEFAULT_DATA: FinanceData = {
  year: 2026,
  items: [
    // Income
    { id: 'i1', name: 'Salary', type: 'Income', months: [0, 1895000, 1895000, 1895000, 1895000, 1895000, 0, 1895000, 1895000, 1895000, 1895000, 1895000] },
    { id: 'i2', name: 'Mom', type: 'Income', months: [400000, 300000, 0, 0, 0, 0, 300000, 300000, 300000, 300000, 300000, 300000] },
    { id: 'i3', name: 'Others', type: 'Income', months: [800000, 450000, 0, 0, 0, 0, 2000000, 0, 0, 0, 0, 0] },
    // Subscriptions
    { id: 's1', name: 'Claude', type: 'Subscription', months: [80000, 80000, 380000, 80000, 80000, 80000, 80000, 80000, 80000, 80000, 80000, 80000] },
    { id: 's2', name: 'GitHub Copilot', type: 'Subscription', months: [135000, 135000, 0, 135000, 135000, 135000, 135000, 135000, 135000, 135000, 135000, 135000] },
    { id: 's3', name: 'Todoist', type: 'Subscription', months: [20000, 20000, 20000, 20000, 20000, 20000, 20000, 20000, 20000, 20000, 20000, 20000] },
    { id: 's4', name: 'ChatGPT', type: 'Subscription', months: [0, 80000, 80000, 80000, 80000, 80000, 80000, 80000, 80000, 80000, 80000, 80000] },
    { id: 's5', name: 'Vercel', type: 'Subscription', months: [0, 80000, 80000, 80000, 80000, 80000, 80000, 80000, 80000, 80000, 80000, 80000] },
    { id: 's6', name: 'GitHub Team', type: 'Subscription', months: [16000, 16000, 16000, 16000, 16000, 16000, 16000, 16000, 16000, 16000, 16000, 16000] },
    { id: 's7', name: 'Adobe CC', type: 'Subscription', months: [0, 64000, 64000, 64000, 64000, 64000, 64000, 64000, 64000, 64000, 0, 0] },
    { id: 's8', name: 'Grammarly', type: 'Subscription', months: [0, 0, 0, 0, 0, 0, 0, 300000, 0, 0, 0, 0] },
    // Expenses
    { id: 'e1', name: 'Food', type: 'Expense', months: [300000, 500000, 500000, 500000, 500000, 500000, 500000, 500000, 500000, 500000, 500000, 500000] },
    { id: 'e2', name: 'Hair cut', type: 'Expense', months: [75000, 120000, 80000, 100000, 100000, 100000, 100000, 100000, 100000, 100000, 100000, 100000] },
    { id: 'e3', name: 'Washing', type: 'Expense', months: [80000, 40000, 40000, 80000, 80000, 80000, 80000, 80000, 80000, 80000, 80000, 80000] },
    { id: 'e4', name: 'Mac Mini Debt', type: 'Expense', months: [0, 0, 0, 0, 0, 600000, 600000, 600000, 600000, 600000, 600000, 600000] },
    { id: 'e5', name: 'Debt', type: 'Expense', months: [0, 600000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
    { id: 'e6', name: 'Gym', type: 'Expense', months: [0, 120000, 0, 0, 0, 0, 0, 0, 0, 0, 120000, 120000] },
    { id: 'e7', name: 'Goodnotes', type: 'Expense', months: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 65000] },
    { id: 'e8', name: 'Alarmy', type: 'Expense', months: [0, 0, 0, 40000, 0, 0, 0, 0, 0, 0, 0, 0] },
    { id: 'e9', name: 'Hair products', type: 'Expense', months: [205000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
    { id: 'e10', name: 'Eggs', type: 'Expense', months: [0, 0, 100000, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
    { id: 'e11', name: 'Google Cloud', type: 'Expense', months: [0, 0, 0, 90000, 0, 0, 0, 0, 0, 0, 0, 0] },
    { id: 'e12', name: 'Supabase', type: 'Expense', months: [0, 0, 0, 100000, 0, 0, 0, 0, 0, 0, 0, 0] },
  ],
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const fmtCOP = (n: number) => {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  return `$${n}`
}
const fmtFull = (n: number) => `$${n.toLocaleString('es-CO')}`
const typeColor: Record<ItemType, string> = { Income: 'bg-green-500/15 text-green-400', Expense: 'bg-red-500/15 text-red-400', Subscription: 'bg-blue-500/15 text-blue-400' }
const CHART_COLORS = ['#f87171', '#60a5fa', '#34d399', '#fbbf24', '#a78bfa', '#f472b6', '#fb923c', '#2dd4bf', '#818cf8', '#e879f9']
const currentMonth = new Date().getMonth()

const fmtCell = (n: number) => `$${n.toLocaleString('en-US')}`

const rowBorderColor: Record<ItemType, string> = {
  Income: 'border-l-2 border-green-500/40',
  Expense: 'border-l-2 border-red-500/40',
  Subscription: 'border-l-2 border-blue-500/40',
}

// ── Currency Cell ────────────────────────────────────────────────────────────

function CurrencyCell({ value, onChange, className }: { value: number; onChange: (v: number) => void; className?: string }) {
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <input
      ref={inputRef}
      type="text"
      value={focused ? (value || '') : (value ? fmtCell(value) : '')}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onChange={(e) => onChange(parseInt(e.target.value.replace(/\D/g, '')) || 0)}
      className={`bg-transparent outline-none text-right tabular-nums w-[70px] ${className ?? ''}`}
      placeholder="$0"
    />
  )
}

// ── Component ────────────────────────────────────────────────────────────────

export function FinancePage() {
  const [data, updateData] = useStore<FinanceData>('cortex-finances', DEFAULT_DATA)
  const [selectedMonth, setSelectedMonth] = useState(currentMonth)
  const [filterType, setFilterType] = useState<ItemType | null>(null)
  const [compact, setCompact] = useState(false)

  const setField = (id: string, field: Partial<FinanceItem>) =>
    updateData((prev) => ({ ...prev, items: prev.items.map((i) => i.id === id ? { ...i, ...field } : i) }))

  const setAmount = (id: string, monthIdx: number, value: number) =>
    updateData((prev) => ({ ...prev, items: prev.items.map((i) => {
      if (i.id !== id) return i
      const months = [...i.months]; months[monthIdx] = value; return { ...i, months }
    }) }))

  const addItem = (type: ItemType) =>
    updateData((prev) => ({ ...prev, items: [...prev.items, { id: `fin-${Date.now()}`, name: 'New item', type, months: Array(12).fill(0) }] }))

  const deleteItem = (id: string) =>
    updateData((prev) => ({ ...prev, items: prev.items.filter((i) => i.id !== id) }))

  const monthlyTotals = useMemo(() =>
    MONTHS.map((_, i) => {
      const income = data.items.filter((it) => it.type === 'Income').reduce((s, it) => s + it.months[i], 0)
      const expenses = data.items.filter((it) => it.type !== 'Income').reduce((s, it) => s + it.months[i], 0)
      return { month: MONTHS[i], income, expenses, savings: income - expenses }
    }), [data.items])

  const cur = monthlyTotals[selectedMonth]
  const savingsRate = cur.income > 0 ? (cur.savings / cur.income) * 100 : 0
  const yearTotal = useMemo(() => ({ income: monthlyTotals.reduce((s, m) => s + m.income, 0), expenses: monthlyTotals.reduce((s, m) => s + m.expenses, 0) }), [monthlyTotals])

  const expenseBreakdown = useMemo(() =>
    data.items.filter((it) => it.type !== 'Income' && it.months[selectedMonth] > 0)
      .map((it) => ({ name: it.name, value: it.months[selectedMonth] })).sort((a, b) => b.value - a.value),
    [data.items, selectedMonth])

  const subscriptions = useMemo(() => data.items.filter((it) => it.type === 'Subscription'), [data.items])
  const subMonthly = subscriptions.reduce((s, it) => s + it.months[selectedMonth], 0)
  const subAnnual = subscriptions.reduce((s, it) => s + it.months.reduce((a, b) => a + b, 0), 0)

  const filtered = useMemo(() => data.items.filter((it) => !filterType || it.type === filterType), [data.items, filterType])

  const groupedRows = useMemo(() => {
    const typeOrder: ItemType[] = ['Income', 'Expense', 'Subscription']
    const groups = typeOrder
      .filter((t) => !filterType || filterType === t)
      .map((t) => ({ type: t, items: filtered.filter((it) => it.type === t) }))
      .filter((g) => g.items.length > 0)
    return groups
  }, [filtered, filterType])

  return (
    <PageShell>
      {/* Month selector */}
      <div className="flex gap-1">
        {MONTHS.map((m, i) => (
          <button key={m} onClick={() => setSelectedMonth(i)}
            className={`cursor-pointer flex-1 text-[10px] py-1.5 rounded-lg transition-all ${i === selectedMonth ? 'bg-foreground/10 text-foreground font-medium' : 'text-muted-foreground/40 hover:text-muted-foreground'} ${i === currentMonth ? 'border-b-2 border-green-400/50' : ''}`}>
            {m}
          </button>
        ))}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Income', value: fmtCOP(cur.income), icon: TrendingUp, color: 'text-green-400' },
          { label: 'Expenses', value: fmtCOP(cur.expenses), icon: TrendingDown, color: 'text-red-400' },
          { label: 'Net Savings', value: fmtCOP(cur.savings), icon: PiggyBank, color: cur.savings >= 0 ? 'text-green-400' : 'text-red-400' },
          { label: 'Savings Rate', value: `${savingsRate.toFixed(0)}%`, icon: DollarSign, color: savingsRate >= 20 ? 'text-green-400' : 'text-yellow-400' },
        ].map((kpi) => (
          <div key={kpi.label} className="flex items-center gap-3 rounded-xl border border-border px-4 py-3">
            <kpi.icon className={`h-5 w-5 ${kpi.color}`} />
            <div>
              <p className={`text-lg font-bold tabular-nums ${kpi.color}`}>{kpi.value}</p>
              <p className="text-[10px] text-muted-foreground">{kpi.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Bar chart */}
        <WidgetCard title="Income vs Expenses" description={`${data.year} · Net: ${fmtCOP(yearTotal.income - yearTotal.expenses)}`} delay={0.1} className="lg:col-span-2">
          <div className="h-[220px] -mx-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyTotals} barGap={2}>
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#666' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 9, fill: '#666' }} axisLine={false} tickLine={false} tickFormatter={fmtCOP} width={50} />
                <Tooltip contentStyle={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 8, fontSize: 11 }} formatter={(v) => fmtFull(Number(v))} />
                <Bar dataKey="income" fill="#34d399" radius={[4, 4, 0, 0]} maxBarSize={24} />
                <Bar dataKey="expenses" fill="#f87171" radius={[4, 4, 0, 0]} maxBarSize={24} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </WidgetCard>

        {/* Pie chart */}
        <WidgetCard title={`${MONTHS[selectedMonth]} Breakdown`} description={`${expenseBreakdown.length} items`} delay={0.15}>
          {expenseBreakdown.length === 0 ? (
            <p className="text-xs text-muted-foreground py-6 text-center">No expenses</p>
          ) : (
            <div className="h-[220px] -mx-2">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={expenseBreakdown} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={2}>
                    {expenseBreakdown.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 8, fontSize: 11 }} formatter={(v) => fmtFull(Number(v))} />
                  <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </WidgetCard>
      </div>

      {/* Subscriptions */}
      <WidgetCard title="Subscriptions" description={`${fmtCOP(subMonthly)}/mo · ${fmtCOP(subAnnual)}/yr`} delay={0.2}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {subscriptions.map((sub) => {
            const amt = sub.months[selectedMonth]
            return (
              <div key={sub.id} className={`flex items-center justify-between rounded-lg px-3 py-2 ${amt > 0 ? 'bg-blue-500/[0.04]' : 'bg-secondary/30 opacity-40'}`}>
                <div>
                  <p className="text-xs font-medium">{sub.name}</p>
                  <p className="text-[10px] text-muted-foreground tabular-nums">{amt > 0 ? fmtFull(amt) : 'Inactive'}</p>
                </div>
                <CreditCard className="h-3.5 w-3.5 text-blue-400/40" />
              </div>
            )
          })}
        </div>
      </WidgetCard>

      {/* Budget Table */}
      <WidgetCard title="Budget" description={`${filtered.length} items`} delay={0.25}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="flex gap-1.5">
              {(['Income', 'Expense', 'Subscription'] as ItemType[]).map((t) => (
                <button key={t} onClick={() => setFilterType(filterType === t ? null : t)}
                  className={`cursor-pointer text-[10px] px-2.5 py-1 rounded-full border transition-all ${filterType === t ? `${typeColor[t]} border-current/20` : 'border-border text-muted-foreground/40 hover:text-muted-foreground'}`}>
                  {t}
                </button>
              ))}
            </div>
            <button onClick={() => setCompact(!compact)}
              className={`cursor-pointer flex items-center gap-1 text-[10px] px-2 py-1 rounded-full border transition-all ${compact ? 'bg-foreground/10 text-foreground border-foreground/20' : 'border-border text-muted-foreground/40 hover:text-muted-foreground'}`}>
              <Columns2 className="h-3 w-3" /> Compact
            </button>
          </div>
          <div className="flex gap-1">
            {(['Income', 'Expense', 'Subscription'] as ItemType[]).map((t) => (
              <button key={t} onClick={() => addItem(t)}
                className="cursor-pointer flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground px-2 py-1 rounded-lg border border-border hover:bg-secondary transition-all">
                <Plus className="h-3 w-3" /> {t}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto -mx-5">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/50 text-muted-foreground">
                <th className="px-5 py-2 text-left font-medium sticky left-0 bg-card z-10 min-w-[140px]">Item</th>
                <th className="py-2 text-left font-medium w-16">Type</th>
                {!compact && MONTHS.map((m, i) => (
                  <th key={m} className={`py-2 text-right font-medium min-w-[80px] ${i === selectedMonth ? 'text-foreground' : ''}`}>{m}</th>
                ))}
                {compact && <th className="py-2 text-right font-medium min-w-[80px]">{MONTHS[selectedMonth]}</th>}
                <th className="py-2 text-right font-medium min-w-[90px]">Total</th>
                <th className="py-2 w-6"></th>
              </tr>
            </thead>
            <tbody>
              {groupedRows.map((group) => {
                const groupSubtotals = MONTHS.map((_, mi) => group.items.reduce((s, it) => s + it.months[mi], 0))
                const groupTotal = groupSubtotals.reduce((a, b) => a + b, 0)

                return [
                  ...group.items.map((item, idx) => {
                    const total = item.months.reduce((a, b) => a + b, 0)
                    return (
                      <tr key={item.id} className={`border-b border-border/20 hover:bg-secondary/30 group ${rowBorderColor[item.type]} ${idx % 2 === 1 ? 'bg-secondary/10' : ''}`}>
                        <td className="px-5 py-2 sticky left-0 bg-inherit z-10">
                          <input value={item.name} onChange={(e) => setField(item.id, { name: e.target.value })} className="bg-transparent outline-none font-medium w-full" />
                        </td>
                        <td className="py-2">
                          <select value={item.type} onChange={(e) => setField(item.id, { type: e.target.value as ItemType })}
                            className={`cursor-pointer bg-transparent outline-none text-[9px] rounded-full px-1.5 py-0.5 ${typeColor[item.type]}`}>
                            <option value="Income">Income</option><option value="Expense">Expense</option><option value="Subscription">Sub</option>
                          </select>
                        </td>
                        {!compact && item.months.map((val, mi) => (
                          <td key={mi} className={`py-2 text-right ${mi === selectedMonth ? 'bg-foreground/[0.03]' : ''}`}>
                            <CurrencyCell value={val} onChange={(v) => setAmount(item.id, mi, v)}
                              className={item.type === 'Income' ? 'text-green-400/80' : 'text-muted-foreground'} />
                          </td>
                        ))}
                        {compact && (
                          <td className="py-2 text-right bg-foreground/[0.03]">
                            <CurrencyCell value={item.months[selectedMonth]} onChange={(v) => setAmount(item.id, selectedMonth, v)}
                              className={item.type === 'Income' ? 'text-green-400/80' : 'text-muted-foreground'} />
                          </td>
                        )}
                        <td className="py-2 text-right tabular-nums font-medium">{fmtCell(total)}</td>
                        <td className="py-2 pr-4">
                          <button onClick={() => deleteItem(item.id)} className="cursor-pointer opacity-0 group-hover:opacity-100 text-muted-foreground/40 hover:text-red-400 transition-all">
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </td>
                      </tr>
                    )
                  }),
                  <tr key={`subtotal-${group.type}`} className="border-t border-border/40">
                    <td className="px-5 py-1.5 sticky left-0 bg-card z-10 text-muted-foreground font-semibold text-[10px]">{group.type} Subtotal</td>
                    <td></td>
                    {!compact && groupSubtotals.map((val, mi) => (
                      <td key={mi} className={`py-1.5 text-right tabular-nums font-semibold text-muted-foreground text-[10px] ${mi === selectedMonth ? 'bg-foreground/[0.03]' : ''}`}>{fmtCell(val)}</td>
                    ))}
                    {compact && <td className="py-1.5 text-right tabular-nums font-semibold text-muted-foreground text-[10px] bg-foreground/[0.03]">{fmtCell(groupSubtotals[selectedMonth])}</td>}
                    <td className="py-1.5 text-right tabular-nums font-semibold text-muted-foreground text-[10px]">{fmtCell(groupTotal)}</td>
                    <td></td>
                  </tr>,
                ]
              })}
              <tr className="border-t border-border/50 font-medium">
                <td className="px-5 py-2.5 sticky left-0 bg-card z-10">Net</td>
                <td></td>
                {!compact && MONTHS.map((_, mi) => {
                  const net = monthlyTotals[mi].savings
                  return <td key={mi} className={`py-2.5 text-right tabular-nums ${mi === selectedMonth ? 'bg-foreground/[0.03]' : ''} ${net >= 0 ? 'text-green-400' : 'text-red-400'}`}>{fmtCOP(net)}</td>
                })}
                {compact && (() => { const net = monthlyTotals[selectedMonth].savings; return <td className={`py-2.5 text-right tabular-nums bg-foreground/[0.03] ${net >= 0 ? 'text-green-400' : 'text-red-400'}`}>{fmtCOP(net)}</td> })()}
                <td className={`py-2.5 text-right tabular-nums ${yearTotal.income - yearTotal.expenses >= 0 ? 'text-green-400' : 'text-red-400'}`}>{fmtCOP(yearTotal.income - yearTotal.expenses)}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      </WidgetCard>
    </PageShell>
  )
}
