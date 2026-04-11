import { useState, useMemo, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Input } from '@/components/ui/input'
import type { DailyNutrition, FoodItem, BodyStats, NutritionTargets } from '@/types/gym'
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
} from 'lucide-react'

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

export function NutritionLog({ nutrition: todayNutrition, onUpdate: onUpdateToday, bodyStats, onUpdateBodyStats, targets, onUpdateTargets }: NutritionLogProps) {
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
  const [editingQuickAdd, setEditingQuickAdd] = useState(false)
  const [newFoodName, setNewFoodName] = useState('')
  const [newFoodProtein, setNewFoodProtein] = useState('')
  const [newFoodCalories, setNewFoodCalories] = useState('')
  const [newFoodQuantity, setNewFoodQuantity] = useState('')
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
        <button onClick={() => setDayOffset(d => d - 1)} className="p-1.5 rounded-lg hover:bg-foreground/10 transition-colors">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          onClick={() => setDayOffset(0)}
          className={`text-sm font-medium px-3 py-1 rounded-md transition-colors ${isToday ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
        >
          {formatDateLabel(viewDate)}
        </button>
        <button onClick={() => setDayOffset(d => Math.min(d + 1, 0))} className="p-1.5 rounded-lg hover:bg-foreground/10 transition-colors" disabled={dayOffset >= 0}>
          <ChevronRight className={`h-4 w-4 ${dayOffset >= 0 ? 'opacity-30' : ''}`} />
        </button>
      </div>

      {/* Targets editing */}
      {editingTargets ? (
        <div className="flex items-center gap-2 flex-wrap rounded-xl border border-border bg-card p-3">
          <div className="flex items-center gap-1">
            <label className="text-[10px] text-muted-foreground">Protein</label>
            <input type="number" value={targetInputs.protein}
              onChange={(e) => setTargetInputs(p => ({ ...p, protein: e.target.value }))}
              className="h-7 w-16 rounded border border-border bg-background px-2 text-xs text-foreground outline-none tabular-nums" />
            <span className="text-[10px] text-muted-foreground">g</span>
          </div>
          <div className="flex items-center gap-1">
            <label className="text-[10px] text-muted-foreground">Calories</label>
            <input type="number" value={targetInputs.calories}
              onChange={(e) => setTargetInputs(p => ({ ...p, calories: e.target.value }))}
              className="h-7 w-20 rounded border border-border bg-background px-2 text-xs text-foreground outline-none tabular-nums" />
          </div>
          <div className="flex items-center gap-1">
            <label className="text-[10px] text-muted-foreground">Water</label>
            <input type="number" step="0.1" value={targetInputs.water}
              onChange={(e) => setTargetInputs(p => ({ ...p, water: e.target.value }))}
              className="h-7 w-16 rounded border border-border bg-background px-2 text-xs text-foreground outline-none tabular-nums" />
            <span className="text-[10px] text-muted-foreground">L</span>
          </div>
          <button
            onClick={() => {
              onUpdateTargets({
                protein: Number(targetInputs.protein) || targets.protein,
                calories: Number(targetInputs.calories) || targets.calories,
                water: Number(targetInputs.water) || targets.water,
              })
              setEditingTargets(false)
            }}
            className="rounded-lg bg-foreground/10 p-1.5 hover:bg-foreground/20 transition-colors"
          >
            <Check className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <div className="flex justify-end">
          <button
            onClick={() => {
              setTargetInputs({
                protein: String(targets.protein),
                calories: String(targets.calories),
                water: String(targets.water),
              })
              setEditingTargets(true)
            }}
            className="flex items-center gap-1 text-[10px] text-muted-foreground/40 hover:text-muted-foreground transition-colors"
          >
            <Pencil className="h-2.5 w-2.5" />
            Edit targets
          </button>
        </div>
      )}

      {/* Summary bar — mobile: stacked, desktop: 3-col */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-2 sm:space-y-0 sm:grid sm:grid-cols-3 sm:gap-3"
      >
        {/* Protein & Calories — side by side on mobile */}
        <div className="grid grid-cols-2 gap-2 sm:contents">
          <div className="rounded-xl border border-border bg-card p-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-muted-foreground">Protein</span>
              <span className="text-xs font-medium tabular-nums">
                {totals.protein}g / {targets.protein}g
              </span>
            </div>
            <div className="h-2 sm:h-1.5 rounded-full bg-foreground/10">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  totals.protein >= targets.protein ? 'bg-green-400' : 'bg-foreground/40'
                }`}
                style={{ width: `${Math.min(100, (totals.protein / targets.protein) * 100)}%` }}
              />
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-muted-foreground">Calories</span>
              <span className="text-xs font-medium tabular-nums">
                {totals.calories} / {targets.calories}
              </span>
            </div>
            <div className="h-2 sm:h-1.5 rounded-full bg-foreground/10">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  totals.calories >= targets.calories ? 'bg-green-400' : 'bg-foreground/40'
                }`}
                style={{ width: `${Math.min(100, (totals.calories / targets.calories) * 100)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Water — full width on mobile */}
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-muted-foreground">Water</span>
            <span className="text-xs font-medium tabular-nums">
              {nutrition.waterLiters}L / {targets.water}L
            </span>
          </div>
          <div className="flex items-center gap-3 sm:gap-2">
            <button
              onClick={() => adjustWater(-0.25)}
              className="rounded-lg bg-foreground/10 p-1.5 sm:p-0.5 hover:bg-foreground/20 transition-colors"
            >
              <Minus className="h-4 w-4 sm:h-3 sm:w-3" />
            </button>
            <div className="flex-1 h-2 sm:h-1.5 rounded-full bg-foreground/10">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  nutrition.waterLiters >= targets.water ? 'bg-blue-400' : 'bg-blue-400/50'
                }`}
                style={{ width: `${Math.min(100, (nutrition.waterLiters / targets.water) * 100)}%` }}
              />
            </div>
            <button
              onClick={() => adjustWater(0.25)}
              className="rounded-lg bg-foreground/10 p-1.5 sm:p-0.5 hover:bg-foreground/20 transition-colors"
            >
              <Plus className="h-4 w-4 sm:h-3 sm:w-3" />
            </button>
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
              className={`sm:flex-1 rounded-lg px-3 py-3 sm:py-2 text-left transition-colors cursor-pointer ${
                activeMeal === mi
                  ? 'bg-foreground/10 border border-foreground/20'
                  : 'bg-card border border-border hover:bg-foreground/5'
              }`}
            >
              <p className={`text-sm sm:text-xs font-medium ${activeMeal === mi ? 'text-foreground' : 'text-muted-foreground'}`}>{meal.name}</p>
              <p className="text-xs sm:text-[10px] text-muted-foreground/50 tabular-nums">{mealProtein}g · {mealCals} kcal</p>
            </button>
          )
        })}
      </div>

      {/* Active meal food list */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-2">
        <div className="flex items-center justify-between mb-1">
          <h4 className="text-base sm:text-sm font-medium">{nutrition.meals[activeMeal].name}</h4>
          <span className="text-xs text-muted-foreground tabular-nums">
            {nutrition.meals[activeMeal].foods.reduce((s, f) => s + f.protein, 0)}g protein · {nutrition.meals[activeMeal].foods.reduce((s, f) => s + f.calories, 0)} kcal
          </span>
        </div>
        {nutrition.meals[activeMeal].foods.length === 0 && (
          <p className="text-sm sm:text-xs text-muted-foreground/40 py-3 sm:py-2">No foods logged yet. Use quick-add below or add custom food.</p>
        )}
        {nutrition.meals[activeMeal].foods.map((food, fi) => (
          <div key={fi} className="flex items-center justify-between text-sm sm:text-xs border-t border-border/30 pt-2.5 sm:pt-1.5 pb-0.5 sm:pb-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className="truncate text-foreground">{food.name}</span>
              {food.quantity && (
                <span className="text-muted-foreground/40 shrink-0">{food.quantity}</span>
              )}
            </div>
            <div className="flex items-center gap-3 sm:gap-2 shrink-0">
              <span className="text-muted-foreground tabular-nums">{food.protein}g · {food.calories}</span>
              <button
                onClick={() => removeFood(activeMeal, fi)}
                className="sm:opacity-0 sm:group-hover:opacity-100 text-red-400/60 hover:text-red-400 active:text-red-400 transition-all p-1 -m-1"
              >
                <X className="h-4 w-4 sm:h-3 sm:w-3" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Quick-add panel */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setShowQuickAdd(!showQuickAdd)}
            className="flex items-center gap-2"
          >
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/50">
              Quick Add → {nutrition.meals[activeMeal].name}
            </h4>
            <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground/40 transition-transform ${showQuickAdd ? 'rotate-180' : ''}`} />
          </button>
          {showQuickAdd && (
            <button
              onClick={() => setEditingQuickAdd(!editingQuickAdd)}
              className={`p-1 rounded transition-colors ${editingQuickAdd ? 'bg-foreground/10 text-foreground' : 'text-muted-foreground/40 hover:text-muted-foreground'}`}
              title={editingQuickAdd ? 'Done editing' : 'Edit quick-add items'}
            >
              <Pencil className="h-3 w-3" />
            </button>
          )}
        </div>

        {showQuickAdd && (
          <>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-1.5">
              {quickFoods.map((food, i) => (
                <div key={`${food.name}-${i}`} className="relative group">
                  <button
                    onClick={() => !editingQuickAdd && addFood(activeMeal, food)}
                    className={`w-full rounded-lg border border-border bg-foreground/5 px-3 py-2.5 sm:px-2.5 sm:py-1.5 text-xs text-left transition-colors ${
                      editingQuickAdd ? 'pr-7 cursor-default' : 'hover:bg-foreground/10 active:bg-foreground/15'
                    }`}
                  >
                    <span className="text-foreground">{food.name}</span>
                    <span className="text-muted-foreground/40 ml-1">{food.protein}g · {food.calories}</span>
                  </button>
                  {editingQuickAdd && (
                    <button
                      onClick={() => removeQuickFood(i)}
                      className="absolute -top-1.5 -right-1.5 rounded-full bg-red-500/80 hover:bg-red-500 p-1 sm:p-0.5 transition-colors"
                    >
                      <X className="h-3 w-3 sm:h-2.5 sm:w-2.5 text-white" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Custom food input — mobile: stacked rows, desktop: single row */}
            <div className="space-y-2 sm:space-y-0 sm:flex sm:gap-2 sm:items-end">
              <div className="flex gap-2 sm:contents">
                <div className="flex-1 sm:flex-1">
                  <Input
                    placeholder="Food name"
                    value={newFoodName}
                    onChange={(e) => setNewFoodName(e.target.value)}
                    className="h-9 sm:h-7 text-sm sm:text-xs"
                    onKeyDown={(e) => e.key === 'Enter' && addCustomFood()}
                  />
                </div>
                <div className="w-20 sm:w-16">
                  <Input
                    placeholder="Qty"
                    value={newFoodQuantity}
                    onChange={(e) => setNewFoodQuantity(e.target.value)}
                    className="h-9 sm:h-7 text-sm sm:text-xs"
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
                    className="h-9 sm:h-7 text-sm sm:text-xs"
                  />
                </div>
                <div className="flex-1 sm:w-16 sm:flex-none">
                  <Input
                    type="number"
                    placeholder="Calories"
                    value={newFoodCalories}
                    onChange={(e) => setNewFoodCalories(e.target.value)}
                    className="h-9 sm:h-7 text-sm sm:text-xs"
                    onKeyDown={(e) => e.key === 'Enter' && addCustomFood()}
                  />
                </div>
                <button
                  onClick={addCustomFood}
                  className="rounded-lg bg-foreground/10 p-2 sm:p-1.5 hover:bg-foreground/20 active:bg-foreground/25 transition-colors shrink-0"
                  title="Add to meal"
                >
                  <Plus className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                </button>
                <button
                  onClick={saveToQuickAdd}
                  className="rounded-lg bg-foreground/10 p-2 sm:p-1.5 hover:bg-foreground/20 active:bg-foreground/25 transition-colors shrink-0"
                  title="Save to quick-add"
                >
                  <Bookmark className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Weight logging */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Scale className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Weight</span>
            {todayWeight && (
              <span className="text-xs text-muted-foreground ml-1">Today: {todayWeight} kg</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              placeholder="kg"
              value={weightInput}
              onChange={(e) => setWeightInput(e.target.value)}
              className="h-9 sm:h-7 w-24 sm:w-20 text-sm sm:text-xs"
              step="0.1"
              onKeyDown={(e) => e.key === 'Enter' && logWeight()}
            />
            <button
              onClick={logWeight}
              className="rounded-lg bg-foreground/10 px-4 py-2 sm:px-3 sm:py-1.5 text-sm sm:text-xs font-medium hover:bg-foreground/20 active:bg-foreground/25 transition-colors"
            >
              Log
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
