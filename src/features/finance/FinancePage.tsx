import { useState, useMemo, useRef } from 'react'
import { PageShell } from '@/components/shared/PageShell'
import { EmptyState } from '@/components/shared/EmptyState'
import { StatTile } from '@/components/shared/StatTile'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CHART_FONT_MONO, ThemedTooltip, axisProps, chartColor, chartColors, cssVar } from '@/lib/chart-theme'
import { useStore } from '@/lib/store'
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  PiggyBank,
  Plus,
  Trash2,
  Check,
  Circle,
  Wallet,
  CreditCard,
  Columns2,
  Search,
  ChevronUp,
  ChevronDown,
  Eye,
  EyeOff,
} from 'lucide-react'
import {
  BarChart,
  Bar,
  LineChart,
  Line,
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
  category?: string
  months: number[]
  paid?: boolean[]
  paidAmounts?: number[] // actual amount paid per month (for partial payments)
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
    { id: 's1', name: 'Claude', type: 'Subscription', category: 'AI', months: [80000, 80000, 380000, 80000, 80000, 80000, 80000, 80000, 80000, 80000, 80000, 80000] },
    { id: 's2', name: 'GitHub Copilot', type: 'Subscription', category: 'AI', months: [135000, 135000, 0, 135000, 135000, 135000, 135000, 135000, 135000, 135000, 135000, 135000] },
    { id: 's3', name: 'Todoist', type: 'Subscription', category: 'Productivity', months: [20000, 20000, 20000, 20000, 20000, 20000, 20000, 20000, 20000, 20000, 20000, 20000] },
    { id: 's4', name: 'ChatGPT', type: 'Subscription', category: 'AI', months: [0, 80000, 80000, 80000, 80000, 80000, 80000, 80000, 80000, 80000, 80000, 80000] },
    { id: 's5', name: 'Vercel', type: 'Subscription', category: 'Infrastructure', months: [0, 80000, 80000, 80000, 80000, 80000, 80000, 80000, 80000, 80000, 80000, 80000] },
    { id: 's6', name: 'GitHub Team', type: 'Subscription', category: 'Infrastructure', months: [16000, 16000, 16000, 16000, 16000, 16000, 16000, 16000, 16000, 16000, 16000, 16000] },
    { id: 's7', name: 'Adobe CC', type: 'Subscription', category: 'Creative', months: [0, 64000, 64000, 64000, 64000, 64000, 64000, 64000, 64000, 64000, 0, 0] },
    { id: 's8', name: 'Grammarly', type: 'Subscription', category: 'Productivity', months: [0, 0, 0, 0, 0, 0, 0, 300000, 0, 0, 0, 0] },
    // Expenses
    { id: 'e1', name: 'Food', type: 'Expense', category: 'Food', months: [300000, 500000, 500000, 500000, 500000, 500000, 500000, 500000, 500000, 500000, 500000, 500000] },
    { id: 'e2', name: 'Hair cut', type: 'Expense', category: 'Personal Care', months: [75000, 120000, 80000, 100000, 100000, 100000, 100000, 100000, 100000, 100000, 100000, 100000] },
    { id: 'e3', name: 'Washing', type: 'Expense', category: 'Home', months: [80000, 40000, 40000, 80000, 80000, 80000, 80000, 80000, 80000, 80000, 80000, 80000] },
    { id: 'e4', name: 'Mac Mini Debt', type: 'Expense', category: 'Debt', months: [0, 0, 0, 0, 0, 600000, 600000, 600000, 600000, 600000, 600000, 600000] },
    { id: 'e5', name: 'Debt', type: 'Expense', category: 'Debt', months: [0, 600000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
    { id: 'e6', name: 'Gym', type: 'Expense', category: 'Health', months: [0, 120000, 0, 0, 0, 0, 0, 0, 0, 0, 120000, 120000] },
    { id: 'e7', name: 'Goodnotes', type: 'Expense', category: 'Apps', months: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 65000] },
    { id: 'e8', name: 'Alarmy', type: 'Expense', category: 'Apps', months: [0, 0, 0, 40000, 0, 0, 0, 0, 0, 0, 0, 0] },
    { id: 'e9', name: 'Hair products', type: 'Expense', category: 'Personal Care', months: [205000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
    { id: 'e10', name: 'Eggs', type: 'Expense', category: 'Food', months: [0, 0, 100000, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
    { id: 'e11', name: 'Google Cloud', type: 'Expense', category: 'Infrastructure', months: [0, 0, 0, 90000, 0, 0, 0, 0, 0, 0, 0, 0] },
    { id: 'e12', name: 'Supabase', type: 'Expense', category: 'Infrastructure', months: [0, 0, 0, 100000, 0, 0, 0, 0, 0, 0, 0, 0] },
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

const CATEGORIES = ['AI', 'Infrastructure', 'Creative', 'Productivity', 'Apps', 'Food', 'Personal Care', 'Home', 'Debt', 'Health', 'Transport', 'Education', 'Entertainment', 'Other'] as const

const fmtCell = (n: number) => `$${n.toLocaleString('es-CO')}`

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
      className={`w-[70px] bg-transparent text-right font-mono tabular-nums outline-none ${className ?? ''}`}
      placeholder="$0"
    />
  )
}

// ── Component ────────────────────────────────────────────────────────────────

export function FinancePage() {
  const currentMonth = new Date().getMonth()
  const [data, updateData] = useStore<FinanceData>('cortex-finances', DEFAULT_DATA)
  const [selectedMonth, setSelectedMonth] = useState(() => currentMonth)
  const [filterType, setFilterType] = useState<ItemType | null>(null)
  const [compact, setCompact] = useState(window.innerWidth < 768)
  const [searchTerm, setSearchTerm] = useState('')
  const [sortField, setSortField] = useState<'name' | 'total' | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [hideIncome, updateHideIncome] = useStore<boolean>('cortex-finance-hide-income', false)
  const toggleHideIncome = () => updateHideIncome((prev) => !prev)
  const [categoryFilter, setCategoryFilter] = useState<string>('')

  const [c1] = chartColors()
  const incomeColor = chartColor(1)
  const expenseColor = chartColor(4)

  const toggleSort = (field: 'name' | 'total') => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  const setField = (id: string, field: Partial<FinanceItem>) =>
    updateData((prev) => ({ ...prev, items: prev.items.map((i) => i.id === id ? { ...i, ...field } : i) }))

  const setAmount = (id: string, monthIdx: number, value: number) =>
    updateData((prev) => ({ ...prev, items: prev.items.map((i) => {
      if (i.id !== id) return i
      const months = [...i.months]; months[monthIdx] = value; return { ...i, months }
    }) }))

  const addItem = (type: ItemType) =>
    updateData((prev) => ({ ...prev, items: [...prev.items, { id: `fin-${Date.now()}`, name: 'New item', type, category: type !== 'Income' ? 'Other' : undefined, months: Array(12).fill(0), paid: Array(12).fill(false) }] }))

  const deleteItem = (id: string) =>
    updateData((prev) => ({ ...prev, items: prev.items.filter((i) => i.id !== id) }))

  const [editingPaidId, setEditingPaidId] = useState<string | null>(null)
  const [paidAmountInput, setPaidAmountInput] = useState('')

  const setPaidAmount = (id: string, monthIdx: number, amount: number) =>
    updateData((prev) => ({ ...prev, items: prev.items.map((i) => {
      if (i.id !== id) return i
      const paidAmounts = [...(i.paidAmounts || Array(12).fill(0))]
      paidAmounts[monthIdx] = amount
      const paid = [...(i.paid || Array(12).fill(false))]
      paid[monthIdx] = amount >= i.months[monthIdx] && i.months[monthIdx] > 0
      return { ...i, paidAmounts, paid }
    }) }))

  const startEditPaid = (id: string, currentAmount: number, totalAmount: number) => {
    setEditingPaidId(id)
    setPaidAmountInput(String(currentAmount || totalAmount))
  }

  const commitPaidAmount = (id: string, monthIdx: number) => {
    const amount = parseInt(paidAmountInput.replace(/\D/g, '')) || 0
    setPaidAmount(id, monthIdx, amount)
    setEditingPaidId(null)
    setPaidAmountInput('')
  }

  const monthlyTotals = useMemo(() =>
    MONTHS.map((_, i) => {
      const income = data.items.filter((it) => it.type === 'Income').reduce((s, it) => s + it.months[i], 0)
      const expenses = data.items.filter((it) => it.type !== 'Income').reduce((s, it) => s + it.months[i], 0)
      return { month: MONTHS[i], income, expenses, savings: income - expenses }
    }), [data.items])

  const cur = monthlyTotals[selectedMonth]
  const savingsRate = cur.income > 0 ? (cur.savings / cur.income) * 100 : 0
  const yearTotal = useMemo(() => ({ income: monthlyTotals.reduce((s, m) => s + m.income, 0), expenses: monthlyTotals.reduce((s, m) => s + m.expenses, 0) }), [monthlyTotals])

  const balance = useMemo(() => {
    const mi = selectedMonth
    const income = data.items.filter(it => it.type === 'Income').reduce((s, it) => s + it.months[mi], 0)
    const payable = data.items.filter(it => it.type !== 'Income' && it.months[mi] > 0)
    const paidTotal = payable.reduce((s, it) => {
      const pa = it.paidAmounts?.[mi] ?? (it.paid?.[mi] ? it.months[mi] : 0)
      return s + pa
    }, 0)
    const unpaidTotal = payable.reduce((s, it) => s + it.months[mi], 0) - paidTotal
    const paidCount = payable.filter(it => it.paid?.[mi] ?? false).length
    return { current: income - paidTotal, pending: unpaidTotal, paidCount, totalPayable: payable.length }
  }, [data.items, selectedMonth])

  const mask = (v: string) => hideIncome ? '•••' : v

  const expenseBreakdown = useMemo(() => {
    const items = data.items.filter((it) => it.type !== 'Income' && it.months[selectedMonth] > 0)
    const grouped = new Map<string, number>()
    items.forEach((it) => {
      const cat = it.category || 'Other'
      grouped.set(cat, (grouped.get(cat) || 0) + it.months[selectedMonth])
    })
    return Array.from(grouped.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
  }, [data.items, selectedMonth])

  const subscriptions = useMemo(() => data.items.filter((it) => it.type === 'Subscription'), [data.items])
  const subMonthly = subscriptions.reduce((s, it) => s + it.months[selectedMonth], 0)
  const subAnnual = subscriptions.reduce((s, it) => s + it.months.reduce((a, b) => a + b, 0), 0)

  const filtered = useMemo(() => {
    const lowerSearch = searchTerm.toLowerCase()
    return data.items.filter((it) =>
      (!filterType || it.type === filterType) &&
      (!categoryFilter || it.category === categoryFilter) &&
      (!searchTerm || it.name.toLowerCase().includes(lowerSearch))
    )
  }, [data.items, filterType, categoryFilter, searchTerm])

  const sortItems = (items: FinanceItem[]) => {
    if (!sortField) return items
    return [...items].sort((a, b) => {
      let cmp = 0
      if (sortField === 'name') cmp = a.name.localeCompare(b.name)
      else cmp = a.months.reduce((s, v) => s + v, 0) - b.months.reduce((s, v) => s + v, 0)
      return sortDir === 'asc' ? cmp : -cmp
    })
  }

  const groupedRows = useMemo(() => {
    const typeOrder: ItemType[] = ['Income', 'Expense', 'Subscription']
    const groups = typeOrder
      .filter((t) => !filterType || filterType === t)
      .map((t) => ({ type: t, items: sortItems(filtered.filter((it) => it.type === t)) }))
      .filter((g) => g.items.length > 0)
    return groups
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, filterType, sortField, sortDir])

  return (
    <PageShell>
      {/* Month selector + hide toggle */}
      <div className="flex items-center gap-3">
        <Button
          variant={hideIncome ? 'secondary' : 'ghost'}
          size="sm"
          onClick={toggleHideIncome}
          aria-pressed={hideIncome}
          className="shrink-0"
        >
          {hideIncome ? <EyeOff /> : <Eye />}
          {hideIncome ? 'Hidden' : 'Income'}
        </Button>
        <div className="min-w-0 flex-1 overflow-x-auto">
          <Tabs value={selectedMonth} onValueChange={(v) => setSelectedMonth(v as number)}>
            <TabsList className="min-w-max">
              {MONTHS.map((m, i) => (
                <TabsTrigger key={m} value={i}>
                  {m}
                  {i === currentMonth && (
                    <>
                      <span aria-hidden className="size-1 shrink-0 rounded-full bg-accent" />
                      <span className="sr-only">current month</span>
                    </>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile variant="glass" label="Income" value={mask(fmtCOP(cur.income))} icon={<TrendingUp />} />
        <StatTile variant="glass" label="Expenses" value={fmtCOP(cur.expenses)} icon={<TrendingDown />} />
        <StatTile
          variant="glass"
          label="Net Savings"
          icon={<PiggyBank />}
          value={
            <span className={!hideIncome && cur.savings < 0 ? 'text-destructive' : undefined}>
              {mask(fmtCOP(cur.savings))}
            </span>
          }
          delta={
            !hideIncome ? (
              <div aria-hidden className="hidden h-6 w-16 shrink-0 min-[480px]:block">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={monthlyTotals}>
                    <Line type="monotone" dataKey="savings" stroke={c1} strokeWidth={1.5} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : undefined
          }
        />
        <StatTile
          variant="glass"
          label="Savings Rate"
          icon={<DollarSign />}
          value={
            <span className={!hideIncome && savingsRate < 20 ? 'text-warning' : undefined}>
              {mask(`${savingsRate.toFixed(0)}%`)}
            </span>
          }
        />
      </div>

      {/* Balance */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile
          label={`Account Balance · ${MONTHS[selectedMonth]}`}
          value={mask(fmtFull(balance.current))}
          icon={<Wallet />}
          className="col-span-2 sm:col-span-1"
        />
        <StatTile
          label="Pending"
          value={
            <span className={balance.pending > 0 ? 'text-warning' : undefined}>{fmtFull(balance.pending)}</span>
          }
        />
        <StatTile label="Paid" value={`${balance.paidCount}/${balance.totalPayable}`} sub="bills settled this month" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-5">
        {/* Bar chart */}
        <WidgetCard title={hideIncome ? 'Expenses' : 'Income vs Expenses'} description={hideIncome ? `${data.year}` : `${data.year} · Net: ${fmtCOP(yearTotal.income - yearTotal.expenses)}`} delay={0.1} className="lg:col-span-3">
          <div className="h-[200px] -mx-2 sm:h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hideIncome ? monthlyTotals.map(m => ({ ...m, income: 0 })) : monthlyTotals} barGap={2}>
                <XAxis dataKey="month" {...axisProps()} interval={0} />
                <YAxis {...axisProps()} tickFormatter={fmtCOP} width={40} />
                <Tooltip
                  content={<ThemedTooltip formatter={(v) => fmtFull(Number(v))} />}
                  cursor={{ fill: cssVar('--muted'), fillOpacity: 0.4 }}
                />
                {!hideIncome && <Bar dataKey="income" fill={incomeColor} radius={[4, 4, 0, 0]} maxBarSize={20} />}
                <Bar dataKey="expenses" fill={expenseColor} radius={[4, 4, 0, 0]} maxBarSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </WidgetCard>

        {/* Pie chart */}
        <WidgetCard title={`${MONTHS[selectedMonth]} by Category`} description={`${expenseBreakdown.length} categories`} delay={0.15} className="lg:col-span-2">
          {expenseBreakdown.length === 0 ? (
            <EmptyState message="No expenses this month." className="py-6" />
          ) : (
            <div className="h-[200px] -mx-2 sm:h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={expenseBreakdown} dataKey="value" nameKey="name" cx="50%" cy="45%" innerRadius="30%" outerRadius="55%" paddingAngle={2}>
                    {expenseBreakdown.map((entry, i) => <Cell key={entry.name} fill={chartColor(i)} />)}
                  </Pie>
                  <Tooltip content={<ThemedTooltip formatter={(v) => fmtFull(Number(v))} />} />
                  <Legend iconSize={8} wrapperStyle={{ fontSize: 10, fontFamily: CHART_FONT_MONO }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </WidgetCard>
      </div>

      {/* Subscriptions */}
      <WidgetCard title="Subscriptions" description={`${fmtCOP(subMonthly)}/mo · ${fmtCOP(subAnnual)}/yr`} delay={0.2}>
        <div className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
          {subscriptions.map((sub) => {
            const amt = sub.months[selectedMonth]
            const activeMonths = sub.months.filter((m) => m > 0).length
            const annualCost = sub.months.reduce((a, b) => a + b, 0)
            const isActive = amt > 0
            return (
              <div key={sub.id} className={`flex items-center justify-between rounded-md px-3 py-2 ${isActive ? 'bg-secondary/30' : 'bg-secondary/20 opacity-40'}`}>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${isActive ? 'bg-success' : 'bg-border'}`} />
                    <p className="truncate text-xs font-medium">{sub.name}</p>
                  </div>
                  <p className="font-mono text-2xs tabular-nums text-muted-foreground">
                    {isActive ? fmtFull(amt) : 'Inactive'}{' '}
                    <span className="text-foreground-faint">· {activeMonths}mo · {fmtCOP(annualCost)}/yr</span>
                  </p>
                </div>
                <CreditCard className="ml-2 h-3.5 w-3.5 shrink-0 text-foreground-faint" />
              </div>
            )
          })}
        </div>
      </WidgetCard>

      {/* Budget Table */}
      <WidgetCard title="Budget" description={`${filtered.length} items`} delay={0.25}>
        <div className="mb-3 flex flex-col gap-2 sm:gap-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 overflow-x-auto sm:gap-2">
              <div className="flex shrink-0 gap-1 sm:gap-1.5">
                {(['Income', 'Expense', 'Subscription'] as ItemType[]).map((t) => (
                  <Chip key={t} selectable selected={filterType === t} onClick={() => setFilterType(filterType === t ? null : t)}>
                    {t === 'Subscription' ? 'Sub' : t}
                  </Chip>
                ))}
              </div>
              <Chip selectable selected={compact} onClick={() => setCompact(!compact)} aria-label="Toggle compact columns" className="shrink-0">
                <Columns2 /> <span className="hidden sm:inline">Compact</span>
              </Chip>
            </div>
            <div className="flex shrink-0 gap-1">
              {(['Income', 'Expense', 'Subscription'] as ItemType[]).map((t) => (
                <Button key={t} variant="outline" size="xs" onClick={() => addItem(t)} className="whitespace-nowrap">
                  <Plus /> <span className="hidden sm:inline">{t}</span><span className="sm:hidden">{t === 'Subscription' ? 'S' : t[0]}</span>
                </Button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative max-w-xs flex-1">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-foreground-faint" />
              <Input
                placeholder="Search items..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-7 pl-8 text-xs"
              />
            </div>
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}
              className="h-7 cursor-pointer rounded-md border border-input bg-transparent px-2 text-xs text-muted-foreground">
              <option value="">All Categories</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div className="-mx-4 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/50 font-mono text-2xs uppercase tracking-wider text-muted-foreground">
                <th className="sticky left-0 z-10 min-w-[140px] bg-card px-4 py-2 text-left font-medium">
                  <Button variant="ghost" size="xs" onClick={() => toggleSort('name')} className="-ml-2 gap-1 font-mono text-2xs uppercase tracking-wider">
                    Item
                    {sortField === 'name' ? (sortDir === 'asc' ? <ChevronUp /> : <ChevronDown />) : <ChevronUp className="opacity-0 transition-opacity group-hover/button:opacity-40" />}
                  </Button>
                </th>
                <th className="w-16 py-2 text-left font-medium">Type</th>
                <th className="w-24 py-2 text-left font-medium">Category</th>
                {!compact && MONTHS.map((m, i) => (
                  <th key={m} className={`min-w-[80px] py-2 text-right font-medium ${i === selectedMonth ? 'text-foreground' : ''}`}>{m}</th>
                ))}
                {compact && <th className="min-w-[80px] py-2 text-right font-medium">{MONTHS[selectedMonth]}</th>}
                <th className="min-w-[90px] py-2 text-right font-medium">
                  <Button variant="ghost" size="xs" onClick={() => toggleSort('total')} className="-mr-2 gap-1 font-mono text-2xs uppercase tracking-wider">
                    Total
                    {sortField === 'total' ? (sortDir === 'asc' ? <ChevronUp /> : <ChevronDown />) : <ChevronUp className="opacity-0 transition-opacity group-hover/button:opacity-40" />}
                  </Button>
                </th>
                <th className="w-6 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {groupedRows.map((group) => {
                const groupSubtotals = MONTHS.map((_, mi) => group.items.reduce((s, it) => s + it.months[mi], 0))
                const groupTotal = groupSubtotals.reduce((a, b) => a + b, 0)

                return [
                  ...group.items.map((item, idx) => {
                    const total = item.months.reduce((a, b) => a + b, 0)
                    const isPaidSelected = item.type !== 'Income' && item.months[selectedMonth] > 0 && (item.paid?.[selectedMonth] ?? false)
                    return (
                      <tr key={item.id} className={`group border-b border-border/20 hover:bg-secondary/30 ${idx % 2 === 1 ? 'bg-secondary/10' : ''} ${isPaidSelected ? 'opacity-60' : ''}`}>
                        <td className="sticky left-0 z-10 bg-inherit px-4 py-2">
                          <div className="flex items-center gap-1.5">
                            {item.type !== 'Income' ? (
                              item.months[selectedMonth] > 0 ? (
                                <div className="flex shrink-0 items-center gap-1">
                                  {editingPaidId === item.id ? (
                                    <div className="flex items-center gap-1">
                                      <input
                                        value={paidAmountInput}
                                        onChange={(e) => setPaidAmountInput(e.target.value.replace(/\D/g, ''))}
                                        onKeyDown={(e) => e.key === 'Enter' && commitPaidAmount(item.id, selectedMonth)}
                                        onBlur={() => commitPaidAmount(item.id, selectedMonth)}
                                        className="h-5 w-16 rounded-md bg-input px-1 font-mono text-2xs tabular-nums outline-none"
                                        autoFocus
                                      />
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-1.5">
                                      <button
                                        onClick={() => {
                                          const pa = item.paidAmounts?.[selectedMonth] ?? 0
                                          startEditPaid(item.id, pa, item.months[selectedMonth])
                                        }}
                                        className="shrink-0 cursor-pointer"
                                        title="Click to set paid amount"
                                        aria-label={`Set paid amount for ${item.name}`}
                                      >
                                        {(item.paid?.[selectedMonth]) ? (
                                          <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full border border-success/25 bg-success/10">
                                            <Check className="h-2 w-2 text-success" strokeWidth={3} />
                                          </span>
                                        ) : (item.paidAmounts?.[selectedMonth] ?? 0) > 0 ? (
                                          <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full border border-warning/25 bg-warning/10">
                                            <DollarSign className="h-2 w-2 text-warning" strokeWidth={3} />
                                          </span>
                                        ) : (
                                          <Circle className="h-3.5 w-3.5 text-foreground-faint transition-colors hover:text-muted-foreground" />
                                        )}
                                      </button>
                                      {(item.paidAmounts?.[selectedMonth] ?? 0) > 0 && (item.paidAmounts?.[selectedMonth] ?? 0) < item.months[selectedMonth] && (
                                        <span className="whitespace-nowrap font-mono text-3xs tabular-nums text-warning">
                                          {fmtCOP(item.paidAmounts![selectedMonth])}/{fmtCOP(item.months[selectedMonth])}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span className="w-3.5 shrink-0" />
                              )
                            ) : null}
                            <input value={item.name} onChange={(e) => setField(item.id, { name: e.target.value })} className="w-full bg-transparent font-medium outline-none" />
                          </div>
                        </td>
                        <td className="py-2">
                          <select value={item.type} onChange={(e) => setField(item.id, { type: e.target.value as ItemType })}
                            className="cursor-pointer rounded-full border border-border bg-transparent px-1.5 py-0.5 font-mono text-3xs text-muted-foreground outline-none hover:text-foreground">
                            <option value="Income">Income</option><option value="Expense">Expense</option><option value="Subscription">Sub</option>
                          </select>
                        </td>
                        <td className="py-2">
                          {item.type !== 'Income' ? (
                            <select value={item.category || 'Other'} onChange={(e) => setField(item.id, { category: e.target.value })}
                              className="cursor-pointer rounded-full bg-transparent px-1.5 py-0.5 font-mono text-3xs text-muted-foreground outline-none hover:text-foreground">
                              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                            </select>
                          ) : null}
                        </td>
                        {!compact && item.months.map((val, mi) => {
                          const cellPaid = item.type !== 'Income' && val > 0 && (item.paid?.[mi] ?? false)
                          return (
                            <td key={mi} className={`py-2 text-right ${mi === selectedMonth ? 'bg-foreground/[0.03]' : ''} ${cellPaid ? 'bg-success/10' : ''}`}>
                              {hideIncome && item.type === 'Income' ? (
                                <span className="inline-block w-[70px] font-mono tabular-nums text-foreground-faint">•••</span>
                              ) : (
                                <CurrencyCell value={val} onChange={(v) => setAmount(item.id, mi, v)}
                                  className={item.type === 'Income' || cellPaid ? 'text-success' : 'text-muted-foreground'} />
                              )}
                            </td>
                          )
                        })}
                        {compact && (
                          <td className={`py-2 text-right ${isPaidSelected ? 'bg-success/10' : 'bg-foreground/[0.03]'}`}>
                            {hideIncome && item.type === 'Income' ? (
                              <span className="inline-block w-[70px] font-mono tabular-nums text-foreground-faint">•••</span>
                            ) : (
                              <CurrencyCell value={item.months[selectedMonth]} onChange={(v) => setAmount(item.id, selectedMonth, v)}
                                className={item.type === 'Income' || isPaidSelected ? 'text-success' : 'text-muted-foreground'} />
                            )}
                          </td>
                        )}
                        <td className="py-2 text-right font-mono font-medium tabular-nums">{hideIncome && item.type === 'Income' ? '•••' : fmtCell(total)}</td>
                        <td className="py-2 pr-4">
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => deleteItem(item.id)}
                            aria-label={`Delete ${item.name}`}
                            className="opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 hover:text-destructive"
                          >
                            <Trash2 />
                          </Button>
                        </td>
                      </tr>
                    )
                  }),
                  <tr key={`subtotal-${group.type}`} className="border-t border-border/40">
                    <td className="sticky left-0 z-10 bg-card px-4 py-1.5 font-mono text-2xs font-semibold uppercase tracking-wider text-muted-foreground">{group.type} Subtotal</td>
                    <td></td>
                    <td></td>
                    {!compact && groupSubtotals.map((val, mi) => (
                      <td key={mi} className={`py-1.5 text-right font-mono text-2xs font-semibold tabular-nums text-muted-foreground ${mi === selectedMonth ? 'bg-foreground/[0.03]' : ''}`}>{hideIncome && group.type === 'Income' ? '•••' : fmtCell(val)}</td>
                    ))}
                    {compact && <td className="bg-foreground/[0.03] py-1.5 text-right font-mono text-2xs font-semibold tabular-nums text-muted-foreground">{hideIncome && group.type === 'Income' ? '•••' : fmtCell(groupSubtotals[selectedMonth])}</td>}
                    <td className="py-1.5 text-right font-mono text-2xs font-semibold tabular-nums text-muted-foreground">{hideIncome && group.type === 'Income' ? '•••' : fmtCell(groupTotal)}</td>
                    <td></td>
                  </tr>,
                ]
              })}
              <tr className="border-t border-border/50 font-medium">
                <td className="sticky left-0 z-10 bg-card px-4 py-2.5 font-mono text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Net</td>
                <td></td>
                <td></td>
                {!compact && MONTHS.map((_, mi) => {
                  const net = monthlyTotals[mi].savings
                  return <td key={mi} className={`py-2.5 text-right font-mono tabular-nums ${mi === selectedMonth ? 'bg-foreground/[0.03]' : ''} ${hideIncome ? 'text-foreground-faint' : net >= 0 ? 'text-success' : 'text-destructive'}`}>{hideIncome ? '•••' : fmtCOP(net)}</td>
                })}
                {compact && (() => { const net = monthlyTotals[selectedMonth].savings; return <td className={`bg-foreground/[0.03] py-2.5 text-right font-mono tabular-nums ${hideIncome ? 'text-foreground-faint' : net >= 0 ? 'text-success' : 'text-destructive'}`}>{hideIncome ? '•••' : fmtCOP(net)}</td> })()}
                <td className={`py-2.5 text-right font-mono tabular-nums ${hideIncome ? 'text-foreground-faint' : yearTotal.income - yearTotal.expenses >= 0 ? 'text-success' : 'text-destructive'}`}>{hideIncome ? '•••' : fmtCOP(yearTotal.income - yearTotal.expenses)}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      </WidgetCard>
    </PageShell>
  )
}
