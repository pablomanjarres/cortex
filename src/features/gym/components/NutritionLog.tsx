import { DateStepper } from '@/components/shared/DateStepper'
import { Select } from '@/components/ui/select'
import { useState, useMemo, useCallback } from 'react'
import { NutritionSummary } from './NutritionSummary'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { EmptyState } from '@/components/shared/EmptyState'
import { SectionDisclosure } from '@/components/shared/SectionDisclosure'
import type { DailyNutrition, FoodItem, BodyStats, NutritionTargets, PantryItem } from '@/types/gym'
import { COMMON_FOODS, EMPTY_DAILY_NUTRITION } from '@/types/gym'
import { localDate } from '@/lib/date-utils'
import { useStore } from '@/lib/store'
import {
  Plus,
  Scale,
  Bookmark,
  Pencil,
  Check,
  Trash2,
} from 'lucide-react'
import { emptyFoodDraft, foodFromDraft, foodTotals, macroLabel, mealsTotals, type FoodDraft } from '../domain/nutrition'
import { FoodDraftFields, FoodRow } from './FoodControls'
import { QuickAddPanel } from './QuickAddPanel'
import { SelectionCard } from './SelectionCard'

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

export function NutritionLog({ nutrition: todayNutrition, onUpdate: onUpdateToday, bodyStats, onUpdateBodyStats, targets, onUpdateTargets }: NutritionLogProps) {
  const [dayOffset, setDayOffset] = useState(0)
  const viewDate = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() + dayOffset)
    return localDate(d)
  }, [dayOffset])
  const isToday = dayOffset === 0

  const emptyDay = { ...EMPTY_DAILY_NUTRITION, date: viewDate }
  const [storedDay, setStoredDay] = useStore<DailyNutrition>(`cortex-nutrition-${viewDate}`, emptyDay)

  // A date switch can render before the store subscription changes. Never
  // display or copy the previously selected day's food into the new date.
  const nutrition = isToday ? todayNutrition : (storedDay.date === viewDate ? storedDay : emptyDay)
  const onUpdate = useCallback((n: DailyNutrition) => {
    if (isToday) { onUpdateToday(n); return }
    setStoredDay(() => n)
  }, [isToday, onUpdateToday, setStoredDay])

  const [activeMeal, setActiveMeal] = useState(getDefaultMealIndex)
  const [quickFoods, setQuickFoods] = useStore<FoodItem[]>('cortex-quick-foods', COMMON_FOODS)
  const [pantry, setPantry] = useStore<PantryItem[]>('cortex-nutrition-pantry', [])
  const [foodDraft, setFoodDraft] = useState<FoodDraft>(emptyFoodDraft)
  const [newPantryName, setNewPantryName] = useState('')
  const [newPantryProtein, setNewPantryProtein] = useState('')
  const [newPantryCalories, setNewPantryCalories] = useState('')
  const [newPantryServing, setNewPantryServing] = useState('')
  const [newPantryCategory, setNewPantryCategory] = useState('Protein')
  const [weightInput, setWeightInput] = useState('')
  const [editingTargets, setEditingTargets] = useState(false)
  const [targetInputs, setTargetInputs] = useState({ protein: '', calories: '', water: '' })

  const totals = useMemo(() => mealsTotals(nutrition.meals), [nutrition.meals])

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
    const food = foodFromDraft(foodDraft)
    if (!food) return
    addFood(activeMeal, food)
    setFoodDraft(emptyFoodDraft)
  }

  const removeQuickFood = (index: number) => {
    setQuickFoods(prev => prev.filter((_, i) => i !== index))
  }

  const saveToQuickAdd = () => {
    const food = foodFromDraft(foodDraft)
    if (!food) return
    setQuickFoods(prev => [...prev, food])
    setFoodDraft(emptyFoodDraft)
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
  const activeMealTotals = foodTotals(nutrition.meals[activeMeal].foods)

  return (
    <div className="mt-4 space-y-4">
      {/* Day navigation */}
      <DateStepper label={formatDateLabel(viewDate)} previousLabel="Previous day" nextLabel="Next day"
        onPrevious={() => setDayOffset(d => d - 1)} onNext={() => setDayOffset(d => Math.min(d + 1, 0))}
        nextDisabled={dayOffset >= 0} onReset={() => setDayOffset(0)} resetActive={isToday}
        size="touch" className="justify-between" />

      {/* Targets editing */}
      {editingTargets ? (
        <div className="surface flex flex-wrap items-center gap-2 rounded-xl p-3">
          <div className="flex items-center gap-1">
            <label className="text-2xs text-muted-foreground">Protein</label>
            <Input aria-label="Protein target (g)" type="number" value={targetInputs.protein}
              onChange={(e) => setTargetInputs(p => ({ ...p, protein: e.target.value }))}
              className="h-7 w-16 text-xs tabular-nums" />
            <span className="text-2xs text-muted-foreground">g</span>
          </div>
          <div className="flex items-center gap-1">
            <label className="text-2xs text-muted-foreground">Calories</label>
            <Input aria-label="Calories target" type="number" value={targetInputs.calories}
              onChange={(e) => setTargetInputs(p => ({ ...p, calories: e.target.value }))}
              className="h-7 w-20 text-xs tabular-nums" />
          </div>
          <div className="flex items-center gap-1">
            <label className="text-2xs text-muted-foreground">Water</label>
            <Input aria-label="Water target" type="number" step="0.1" value={targetInputs.water}
              onChange={(e) => setTargetInputs(p => ({ ...p, water: e.target.value }))}
              className="h-7 w-16 text-xs tabular-nums" />
            <span className="text-2xs text-muted-foreground">L</span>
          </div>
          <Button
            variant="secondary"
            size="icon-lg"
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

      <NutritionSummary protein={totals.protein} calories={totals.calories} water={nutrition.waterLiters} targets={targets} onAdjustWater={adjustWater} />

      {/* Meal selector tabs — mobile: 2x2 grid, desktop: row */}
      <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-1.5">
        {nutrition.meals.map((meal, mi) => (
          <SelectionCard
            key={meal.id}
            title={meal.name}
            selected={activeMeal === mi}
            onSelect={() => setActiveMeal(mi)}
            className="sm:flex-1"
          >
            {macroLabel(foodTotals(meal.foods))}
          </SelectionCard>
        ))}
      </div>

      {/* Active meal food list */}
      <div className="surface space-y-2 rounded-xl p-4">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-base font-semibold text-foreground">{nutrition.meals[activeMeal].name}</h4>
          <span className="font-mono text-2xs tabular-nums text-muted-foreground">
            {activeMealTotals.protein}g protein · {activeMealTotals.calories} kcal
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
          <FoodRow key={fi} food={food} onRemove={() => removeFood(activeMeal, fi)} />
        ))}
      </div>

      <QuickAddPanel
        title={`Add food to ${nutrition.meals[activeMeal].name}`}
        editLabel="Edit quick-add items"
        doneLabel="Done editing"
        items={quickFoods.map((food, i) => ({
          key: `${food.name}-${i}`,
          label: food.name,
          detail: `${food.protein}g · ${food.calories}`,
          onAdd: () => addFood(activeMeal, food),
          onRemove: () => removeQuickFood(i),
          removeLabel: `Remove ${food.name} from quick-add`,
        }))}
      >
        <FoodDraftFields
          draft={foodDraft}
          onChange={setFoodDraft}
          onSubmit={addCustomFood}
          actions={<>
            <Button variant="secondary" size="icon" className="h-11 w-11 shrink-0" onClick={addCustomFood} aria-label="Add to meal">
              <Plus />
            </Button>
            <Button variant="secondary" size="icon" className="h-11 w-11 shrink-0" onClick={saveToQuickAdd} aria-label="Save to quick-add">
              <Bookmark />
            </Button>
          </>}
        />
      </QuickAddPanel>

      <SectionDisclosure title="Pantry">
      <WidgetCard title="Foods on hand" description="Add a serving to your snack." compact className="border-0 bg-transparent shadow-none">
        <div className="space-y-2">
          {pantry.length === 0 ? (
            <EmptyState
              message="Pantry's empty."
              hint="Add an item below or save a grocery receipt in Market."
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
                    size="icon-lg"
                    onClick={() => addPantryToToday(item)}
                    aria-label={`Add ${item.name} to today's snack`}
                  >
                    <Plus />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-lg"
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
                <Input aria-label="Pantry item name"
                  placeholder="Item name"
                  value={newPantryName}
                  onChange={(e) => setNewPantryName(e.target.value)}
                  className="h-11 min-w-0 text-base"
                  onKeyDown={(e) => e.key === 'Enter' && addPantryItem()}
                />
              </div>
              <div className="w-20 sm:w-16">
                <Input aria-label="Serving"
                  placeholder="Serving"
                  value={newPantryServing}
                  onChange={(e) => setNewPantryServing(e.target.value)}
                  className="h-11 min-w-0 text-base"
                />
              </div>
            </div>
            <div className="flex gap-2 sm:contents">
              <div className="min-w-0 flex-1 sm:w-20 sm:flex-none">
                <Input aria-label="Pantry protein (g)"
                  type="number"
                  placeholder="Protein (g)"
                  value={newPantryProtein}
                  onChange={(e) => setNewPantryProtein(e.target.value)}
                  className="h-11 min-w-0 text-base"
                />
              </div>
              <div className="min-w-0 flex-1 sm:w-20 sm:flex-none">
                <Input aria-label="Pantry calories"
                  type="number"
                  placeholder="Calories"
                  value={newPantryCalories}
                  onChange={(e) => setNewPantryCalories(e.target.value)}
                  className="h-11 min-w-0 text-base"
                  onKeyDown={(e) => e.key === 'Enter' && addPantryItem()}
                />
              </div>
              <Select aria-label="Pantry category"
                value={newPantryCategory}
                onChange={(e) => setNewPantryCategory(e.target.value)}
                className="w-auto h-9 px-2 text-sm sm:h-7 sm:text-xs"
              >
                {PANTRY_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </Select>
              <Button
                variant="secondary"
                size="icon"
                className="h-11 w-11 shrink-0"
                onClick={addPantryItem}
                aria-label="Add to pantry"
              >
                <Plus />
              </Button>
            </div>
          </div>
        </div>
      </WidgetCard>
      </SectionDisclosure>

      {/* Weight logging */}
      <div className="surface rounded-xl p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
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
              className="h-11 w-24 text-base" aria-label="Body weight (kg)"
              step="0.1"
              onKeyDown={(e) => e.key === 'Enter' && logWeight()}
            />
            <Button variant="secondary" size="lg" onClick={logWeight}>
              Log weight
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
