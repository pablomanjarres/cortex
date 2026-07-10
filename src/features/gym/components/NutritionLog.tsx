import { useState, useMemo, useEffect, useCallback } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { EmptyState } from '@/components/shared/EmptyState'
import type { DailyNutrition, FoodItem, BodyStats, NutritionTargets, PantryItem } from '@/types/gym'
import { COMMON_FOODS, EMPTY_DAILY_NUTRITION } from '@/types/gym'
import { localDate } from '@/lib/date-utils'
import { useStore, readStore, writeStore } from '@/lib/store'
import {
  Plus,
  X,
  Scale,
  Minus,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Bookmark,
  Pencil,
  Check,
  Trash2,
} from 'lucide-react'

const PANTRY_CATEGORIES = ['Protein', 'Carbs', 'Dairy', 'Produce', 'Snacks', 'Other']

interface NutritionLogProps {
  nutrition: DailyNutrition
  onUpdate: (nutrition: DailyNutrition) => void
  bodyStats: BodyStats[]
  onUpdateBodyStats: (stats: BodyStats[]) => void
  targets: NutritionTargets
  onUpdateTargets: (t: NutritionTargets) => void
}

function getDefaultMealIndex(): number {
  const hour = new Date().getHours()
  if (hour < 11) return 0
  if (hour < 15) return 1
  if (hour < 19) return 3
  return 2
}

function formatDateLabel(dateStr: string): string {
  const today = localDate()
  if (dateStr === today) return 'Today'
  const d = new Date(dateStr + 'T00:00:00')
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1)
  if (dateStr === localDate(yesterday)) return 'Yesterday'
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

/** Tokenized macro meter — success once the target is reached. */
function MacroBar({ value, target, className = '' }: { value: number; target: number; className?: string }) {
  return (
    <div className={`h-1.5 rounded-full bg-muted/60 ${className}`}>
      <div
        className={`h-full rounded-full transition-all duration-500 ${value >= target ? 'bg-success' : 'bg-foreground/40'}`}
        style={{ width: `${Math.min(100, (value / target) * 100)}%` }}
      />
    </div>
  )
}

export function NutritionLog({ nutrition: todayNutrition, onUpdate: onUpdateToday, bodyStats, onUpdateBodyStats, targets, onUpdateTargets }: NutritionLogProps) {
  const reduceMotion = useReducedMotion()
  const [dayOffset, setDayOffset] = useState(0)
  const viewDate = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() + dayOffset)
    return localDate(d)
  }, [dayOffset])
  const isToday = dayOffset === 0

  // For non-today dates, load/save via readStore/writeStore
  const [otherDayData, setOtherDayData] = useState<DailyNutrition | null>(null)
  useEffect(() => {
    if (isToday) { setOtherDayData(null); return }
    readStore<DailyNutrition>(`cortex-nutrition-${viewDate}`, { ...EMPTY_DAILY_NUTRITION, date: viewDate }).then(setOtherDayData)
  }, [viewDate, isToday])

  const nutrition = isToday ? todayNutrition : (otherDayData || { ...EMPTY_DAILY_NUTRITION, date: viewDate })
  const onUpdate = useCallback((n: DailyNutrition) => {
    if (isToday) { onUpdateToday(n); return }
    setOtherDayData(n)
    writeStore(`cortex-nutrition-${viewDate}`, n)
  }, [isToday, viewDate, onUpdateToday])

  const [activeMeal, setActiveMeal] = useState(getDefaultMealIndex)
  const [quickFoods, setQuickFoods] = useStore<FoodItem[]>('cortex-quick-foods', COMMON_FOODS)
  const [pantry, setPantry] = useStore<PantryItem[]>('cortex-nutrition-pantry', [])
  const [editingQuickAdd, setEditingQuickAdd] = useState(false)
  const [newFoodName, setNewFoodName] = useState('')
  const [newFoodProtein, setNewFoodProtein] = useState('')
  const [newFoodCalories, setNewFoodCalories] = useState('')
  const [newFoodQuantity, setNewFoodQuantity] = useState('')
  const [newPantryName, setNewPantryName] = useState('')
  const [newPantryProtein, setNewPantryProtein] = useState('')
  const [newPantryCalories, setNewPantryCalories] = useState('')
  const [newPantryServing, setNewPantryServing] = useState('')
  const [newPantryCategory, setNewPantryCategory] = useState('Protein')
  const [weightInput, setWeightInput] = useState('')
  const [showQuickAdd, setShowQuickAdd] = useState(true)
  const [editingTargets, setEditingTargets] = useState(false)
  const [targetInputs, setTargetInputs] = useState({ protein: '', calories: '', water: '' })

  const totals = useMemo(() => {
    let protein = 0
    let calories = 0
    for (const meal of nutrition.meals) {
      for (const food of meal.foods) {
        protein += food.protein
        calories += food.calories
      }
    }
    return { protein, calories }
  }, [nutrition.meals])

  const addFood = (mealIndex: number, food: FoodItem) => {
    const meals = nutrition.meals.map((m, i) => {
      if (i !== mealIndex) return m
      return { ...m, foods: [...m.foods, food] }
    })
    onUpdate({ ...nutrition, meals })
  }

  const removeFood = (mealIndex: number, foodIndex: number) => {
    const meals = nutrition.meals.map((m, i) => {
      if (i !== mealIndex) return m
      return { ...m, foods: m.foods.filter((_, fi) => fi !== foodIndex) }
    })
    onUpdate({ ...nutrition, meals })
  }

  const addCustomFood = () => {
    if (!newFoodName.trim()) return
    addFood(activeMeal, {
      name: newFoodName.trim(),
      protein: Number(newFoodProtein) || 0,
      calories: Number(newFoodCalories) || 0,
      ...(newFoodQuantity.trim() ? { quantity: newFoodQuantity.trim() } : {}),
    })
    setNewFoodName('')
    setNewFoodProtein('')
    setNewFoodCalories('')
    setNewFoodQuantity('')
  }

  const removeQuickFood = (index: number) => {
    setQuickFoods(prev => prev.filter((_, i) => i !== index))
  }

  const saveToQuickAdd = () => {
    if (!newFoodName.trim()) return
    const food: FoodItem = {
      name: newFoodName.trim(),
      protein: Number(newFoodProtein) || 0,
      calories: Number(newFoodCalories) || 0,
      ...(newFoodQuantity.trim() ? { quantity: newFoodQuantity.trim() } : {}),
    }
    setQuickFoods(prev => [...prev, food])
    setNewFoodName('')
    setNewFoodProtein('')
    setNewFoodCalories('')
    setNewFoodQuantity('')
  }

  // ── Pantry ──────────────────────────────────────────────────────────────────
  const addPantryToToday = (item: PantryItem) => {
    const snackIndex = nutrition.meals.findIndex(m => m.id === 'snack')
    addFood(snackIndex >= 0 ? snackIndex : activeMeal, {
      name: item.name,
      protein: item.protein,
      calories: item.calories,
      ...(item.serving ? { quantity: item.serving } : {}),
    })
    if (typeof item.quantity === 'number') {
      setPantry(prev => prev.flatMap(p => {
        if (p.id !== item.id) return [p]
        const nextQty = (p.quantity ?? 0) - 1
        return nextQty <= 0 ? [] : [{ ...p, quantity: nextQty }]
      }))
    }
  }

  const removePantryItem = (id: string) => {
    setPantry(prev => prev.filter(p => p.id !== id))
  }

  const addPantryItem = () => {
    if (!newPantryName.trim()) return
    const item: PantryItem = {
      id: 'pan-' + Date.now(),
      name: newPantryName.trim(),
      protein: Number(newPantryProtein) || 0,
      calories: Number(newPantryCalories) || 0,
      ...(newPantryServing.trim() ? { serving: newPantryServing.trim() } : {}),
      category: newPantryCategory,
      source: 'manual',
      addedAt: new Date().toISOString(),
    }
    setPantry(prev => [...prev, item])
    setNewPantryName('')
    setNewPantryProtein('')
    setNewPantryCalories('')
    setNewPantryServing('')
  }

  const adjustWater = (delta: number) => {
    const newWater = Math.max(0, Math.round((nutrition.waterLiters + delta) * 100) / 100)
    onUpdate({ ...nutrition, waterLiters: newWater })
  }

  const logWeight = () => {
    const w = Number(weightInput)
    if (!w) return
    const today = localDate()
    const existing = bodyStats.findIndex(s => s.date === today)
    if (existing >= 0) {
      onUpdateBodyStats(bodyStats.map((s, i) => i === existing ? { ...s, weight: w } : s))
    } else {
      onUpdateBodyStats([...bodyStats, { date: today, weight: w }])
    }
    setWeightInput('')
  }

  const todayWeight = bodyStats.find(s => s.date === localDate())?.weight

  return (
    <div className="mt-4 space-y-4">
      {/* Day navigation */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon-sm" onClick={() => setDayOffset(d => d - 1)} aria-label="Previous day">
          <ChevronLeft />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setDayOffset(0)}
          className={`font-mono ${isToday ? 'text-foreground' : ''}`}
        >
          {formatDateLabel(viewDate)}
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setDayOffset(d => Math.min(d + 1, 0))}
          disabled={dayOffset >= 0}
          aria-label="Next day"
        >
          <ChevronRight />
        </Button>
      </div>

      {/* Targets editing */}
      {editingTargets ? (
        <div className="surface flex flex-wrap items-center gap-2 rounded-xl p-3">
          <div className="flex items-center gap-1">
            <label className="text-2xs text-muted-foreground">Protein</label>
            <Input type="number" value={targetInputs.protein}
              onChange={(e) => setTargetInputs(p => ({ ...p, protein: e.target.value }))}
              className="h-7 w-16 text-xs tabular-nums" />
            <span className="text-2xs text-muted-foreground">g</span>
          </div>
          <div className="flex items-center gap-1">
            <label className="text-2xs text-muted-foreground">Calories</label>
            <Input type="number" value={targetInputs.calories}
              onChange={(e) => setTargetInputs(p => ({ ...p, calories: e.target.value }))}
              className="h-7 w-20 text-xs tabular-nums" />
          </div>
          <div className="flex items-center gap-1">
            <label className="text-2xs text-muted-foreground">Water</label>
            <Input type="number" step="0.1" value={targetInputs.water}
              onChange={(e) => setTargetInputs(p => ({ ...p, water: e.target.value }))}
              className="h-7 w-16 text-xs tabular-nums" />
            <span className="text-2xs text-muted-foreground">L</span>
          </div>
          <Button
            variant="secondary"
            size="icon-sm"
            aria-label="Save targets"
            onClick={() => {
              onUpdateTargets({
                protein: Number(targetInputs.protein) || targets.protein,
                calories: Number(targetInputs.calories) || targets.calories,
                water: Number(targetInputs.water) || targets.water,
              })
              setEditingTargets(false)
            }}
          >
            <Check />
          </Button>
        </div>
      ) : (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="xs"
            className="text-foreground-faint hover:text-muted-foreground"
            onClick={() => {
              setTargetInputs({
                protein: String(targets.protein),
                calories: String(targets.calories),
                water: String(targets.water),
              })
              setEditingTargets(true)
            }}
          >
            <Pencil />
            Edit targets
          </Button>
        </div>
      )}

      {/* Summary bar — mobile: stacked, desktop: 3-col */}
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-2 sm:grid sm:grid-cols-3 sm:gap-3 sm:space-y-0"
      >
        {/* Protein & Calories — side by side on mobile */}
        <div className="grid grid-cols-2 gap-2 sm:contents">
          <div className="surface rounded-xl p-3">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="font-mono text-2xs uppercase tracking-wider text-muted-foreground">Protein</span>
              <span className="font-mono text-xs tabular-nums text-foreground">
                {totals.protein}g / {targets.protein}g
              </span>
            </div>
            <MacroBar value={totals.protein} target={targets.protein} className="h-2 sm:h-1.5" />
          </div>

          <div className="surface rounded-xl p-3">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="font-mono text-2xs uppercase tracking-wider text-muted-foreground">Calories</span>
              <span className="font-mono text-xs tabular-nums text-foreground">
                {totals.calories} / {targets.calories}
              </span>
            </div>
            <MacroBar value={totals.calories} target={targets.calories} className="h-2 sm:h-1.5" />
          </div>
        </div>

        {/* Water — full width on mobile */}
        <div className="surface rounded-xl p-3">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="font-mono text-2xs uppercase tracking-wider text-muted-foreground">Water</span>
            <span className="font-mono text-xs tabular-nums text-foreground">
              {nutrition.waterLiters}L / {targets.water}L
            </span>
          </div>
          <div className="flex items-center gap-3 sm:gap-2">
            <Button variant="secondary" size="icon-xs" onClick={() => adjustWater(-0.25)} aria-label="Remove 0.25 liters">
              <Minus />
            </Button>
            <MacroBar value={nutrition.waterLiters} target={targets.water} className="h-2 flex-1 sm:h-1.5" />
            <Button variant="secondary" size="icon-xs" onClick={() => adjustWater(0.25)} aria-label="Add 0.25 liters">
              <Plus />
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Meal selector tabs — mobile: 2x2 grid, desktop: row */}
      <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-1.5">
        {nutrition.meals.map((meal, mi) => {
          const mealProtein = meal.foods.reduce((s, f) => s + f.protein, 0)
          const mealCals = meal.foods.reduce((s, f) => s + f.calories, 0)
          return (
            <button
              key={meal.id}
              onClick={() => setActiveMeal(mi)}
              aria-pressed={activeMeal === mi}
              className={`cursor-pointer rounded-md border px-3 py-3 text-left transition-colors sm:flex-1 sm:py-2 ${
                activeMeal === mi
                  ? 'border-accent/40 bg-accent/10'
                  : 'border-border bg-card hover:bg-muted/40'
              }`}
            >
              <p className={`text-sm font-medium sm:text-xs ${activeMeal === mi ? 'text-foreground' : 'text-muted-foreground'}`}>{meal.name}</p>
              <p className="font-mono text-2xs tabular-nums text-foreground-faint">{mealProtein}g · {mealCals} kcal</p>
            </button>
          )
        })}
      </div>

      {/* Active meal food list */}
      <div className="surface space-y-2 rounded-xl p-4">
        <div className="mb-1 flex items-center justify-between">
          <h4 className="font-mono text-2xs uppercase tracking-wider text-muted-foreground">{nutrition.meals[activeMeal].name}</h4>
          <span className="font-mono text-2xs tabular-nums text-muted-foreground">
            {nutrition.meals[activeMeal].foods.reduce((s, f) => s + f.protein, 0)}g protein · {nutrition.meals[activeMeal].foods.reduce((s, f) => s + f.calories, 0)} kcal
          </span>
        </div>
        {nutrition.meals[activeMeal].foods.length === 0 && (
          <EmptyState
            message="Nothing logged for this meal."
            hint="Quick-add below or add a custom food."
            className="py-5"
          />
        )}
        {nutrition.meals[activeMeal].foods.map((food, fi) => (
          <div key={fi} className="flex items-center justify-between border-t border-border/60 pb-0.5 pt-2.5 text-sm sm:pb-0 sm:pt-1.5 sm:text-xs">
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate text-foreground">{food.name}</span>
              {food.quantity && (
                <span className="shrink-0 text-foreground-faint">{food.quantity}</span>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-3 sm:gap-2">
              <span className="font-mono tabular-nums text-muted-foreground">{food.protein}g · {food.calories}</span>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => removeFood(activeMeal, fi)}
                aria-label={`Remove ${food.name}`}
                className="text-muted-foreground hover:text-destructive"
              >
                <X />
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* Quick-add panel */}
      <div className="surface space-y-3 rounded-xl p-4">
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="xs"
            onClick={() => setShowQuickAdd(!showQuickAdd)}
            className="-ml-2 font-mono text-2xs uppercase tracking-wider text-muted-foreground"
            aria-expanded={showQuickAdd}
          >
            Quick Add → {nutrition.meals[activeMeal].name}
            <ChevronDown className={`transition-transform ${showQuickAdd ? 'rotate-180' : ''}`} />
          </Button>
          {showQuickAdd && (
            <Button
              variant={editingQuickAdd ? 'secondary' : 'ghost'}
              size="icon-xs"
              onClick={() => setEditingQuickAdd(!editingQuickAdd)}
              aria-label={editingQuickAdd ? 'Done editing' : 'Edit quick-add items'}
            >
              <Pencil />
            </Button>
          )}
        </div>

        {showQuickAdd && (
          <>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-1.5">
              {quickFoods.map((food, i) => (
                <div key={`${food.name}-${i}`} className="group relative">
                  <button
                    onClick={() => !editingQuickAdd && addFood(activeMeal, food)}
                    className={`w-full rounded-md border border-border bg-muted/40 px-3 py-2.5 text-left text-xs transition-colors sm:px-2.5 sm:py-1.5 ${
                      editingQuickAdd ? 'cursor-default pr-7' : 'hover:bg-muted/70 active:bg-muted'
                    }`}
                  >
                    <span className="text-foreground">{food.name}</span>
                    <span className="ml-1 font-mono text-2xs tabular-nums text-foreground-faint">{food.protein}g · {food.calories}</span>
                  </button>
                  {editingQuickAdd && (
                    <Button
                      variant="destructive"
                      size="icon-xs"
                      className="absolute -right-1.5 -top-1.5 h-5 w-5 rounded-full"
                      onClick={() => removeQuickFood(i)}
                      aria-label={`Remove ${food.name} from quick-add`}
                    >
                      <X />
                    </Button>
                  )}
                </div>
              ))}
            </div>

            {/* Custom food input — mobile: stacked rows, desktop: single row */}
            <div className="space-y-2 sm:flex sm:items-end sm:gap-2 sm:space-y-0">
              <div className="flex gap-2 sm:contents">
                <div className="flex-1 sm:flex-1">
                  <Input
                    placeholder="Food name"
                    value={newFoodName}
                    onChange={(e) => setNewFoodName(e.target.value)}
                    className="h-9 text-sm sm:h-7 sm:text-xs"
                    onKeyDown={(e) => e.key === 'Enter' && addCustomFood()}
                  />
                </div>
                <div className="w-20 sm:w-16">
                  <Input
                    placeholder="Qty"
                    value={newFoodQuantity}
                    onChange={(e) => setNewFoodQuantity(e.target.value)}
                    className="h-9 text-sm sm:h-7 sm:text-xs"
                  />
                </div>
              </div>
              <div className="flex gap-2 sm:contents">
                <div className="flex-1 sm:w-16 sm:flex-none">
                  <Input
                    type="number"
                    placeholder="Protein (g)"
                    value={newFoodProtein}
                    onChange={(e) => setNewFoodProtein(e.target.value)}
                    className="h-9 text-sm sm:h-7 sm:text-xs"
                  />
                </div>
                <div className="flex-1 sm:w-16 sm:flex-none">
                  <Input
                    type="number"
                    placeholder="Calories"
                    value={newFoodCalories}
                    onChange={(e) => setNewFoodCalories(e.target.value)}
                    className="h-9 text-sm sm:h-7 sm:text-xs"
                    onKeyDown={(e) => e.key === 'Enter' && addCustomFood()}
                  />
                </div>
                <Button
                  variant="secondary"
                  size="icon"
                  className="h-9 w-9 shrink-0 sm:h-7 sm:w-7"
                  onClick={addCustomFood}
                  aria-label="Add to meal"
                >
                  <Plus />
                </Button>
                <Button
                  variant="secondary"
                  size="icon"
                  className="h-9 w-9 shrink-0 sm:h-7 sm:w-7"
                  onClick={saveToQuickAdd}
                  aria-label="Save to quick-add"
                >
                  <Bookmark />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Pantry — foods on hand (populated from grocery bills via Claude) */}
      <WidgetCard title="Pantry" description="Foods on hand — add straight to today's snack." delay={0.05}>
        <div className="space-y-2">
          {pantry.length === 0 ? (
            <EmptyState
              message="Pantry's empty."
              hint="Add a grocery bill via Claude and items land here."
              className="py-4"
            />
          ) : (
            pantry.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-2 border-t border-border/60 pt-2.5 text-sm first:border-t-0 first:pt-0 sm:pt-1.5 sm:text-xs"
              >
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="truncate text-foreground">{item.name}</span>
                  {item.serving && (
                    <span className="shrink-0 text-foreground-faint">{item.serving}</span>
                  )}
                  {item.category && <Chip size="sm" className="shrink-0">{item.category}</Chip>}
                  {typeof item.quantity === 'number' && (
                    <span className="shrink-0 font-mono text-2xs tabular-nums text-foreground-faint">{item.quantity} on hand</span>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="font-mono tabular-nums text-muted-foreground">{item.protein}g P · {item.calories} kcal</span>
                  <Button
                    variant="secondary"
                    size="icon-sm"
                    onClick={() => addPantryToToday(item)}
                    aria-label={`Add ${item.name} to today's snack`}
                  >
                    <Plus />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => removePantryItem(item.id)}
                    aria-label={`Remove ${item.name} from pantry`}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
            ))
          )}

          {/* Add pantry item */}
          <div className="mt-1 space-y-2 border-t border-border/60 pt-3 sm:flex sm:items-end sm:gap-2 sm:space-y-0">
            <div className="flex gap-2 sm:contents">
              <div className="flex-1">
                <Input
                  placeholder="Item name"
                  value={newPantryName}
                  onChange={(e) => setNewPantryName(e.target.value)}
                  className="h-9 text-sm sm:h-7 sm:text-xs"
                  onKeyDown={(e) => e.key === 'Enter' && addPantryItem()}
                />
              </div>
              <div className="w-20 sm:w-16">
                <Input
                  placeholder="Serving"
                  value={newPantryServing}
                  onChange={(e) => setNewPantryServing(e.target.value)}
                  className="h-9 text-sm sm:h-7 sm:text-xs"
                />
              </div>
            </div>
            <div className="flex gap-2 sm:contents">
              <div className="flex-1 sm:w-16 sm:flex-none">
                <Input
                  type="number"
                  placeholder="Protein (g)"
                  value={newPantryProtein}
                  onChange={(e) => setNewPantryProtein(e.target.value)}
                  className="h-9 text-sm sm:h-7 sm:text-xs"
                />
              </div>
              <div className="flex-1 sm:w-16 sm:flex-none">
                <Input
                  type="number"
                  placeholder="Calories"
                  value={newPantryCalories}
                  onChange={(e) => setNewPantryCalories(e.target.value)}
                  className="h-9 text-sm sm:h-7 sm:text-xs"
                  onKeyDown={(e) => e.key === 'Enter' && addPantryItem()}
                />
              </div>
              <select
                value={newPantryCategory}
                onChange={(e) => setNewPantryCategory(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground sm:h-7 sm:text-xs"
              >
                {PANTRY_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <Button
                variant="secondary"
                size="icon"
                className="h-9 w-9 shrink-0 sm:h-7 sm:w-7"
                onClick={addPantryItem}
                aria-label="Add to pantry"
              >
                <Plus />
              </Button>
            </div>
          </div>
        </div>
      </WidgetCard>

      {/* Weight logging */}
      <div className="surface rounded-xl p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Scale className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">Weight</span>
            {todayWeight && (
              <span className="ml-1 font-mono text-xs tabular-nums text-muted-foreground">Today: {todayWeight} kg</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              placeholder="kg"
              value={weightInput}
              onChange={(e) => setWeightInput(e.target.value)}
              className="h-9 w-24 text-sm sm:h-7 sm:w-20 sm:text-xs"
              step="0.1"
              onKeyDown={(e) => e.key === 'Enter' && logWeight()}
            />
            <Button variant="secondary" size="sm" onClick={logWeight}>
              Log
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
