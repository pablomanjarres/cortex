import { useState, useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import type { DailyNutrition, MealTemplate, FoodItem } from '@/types/gym'
import { DEFAULT_MEAL_TEMPLATES } from '@/types/gym'
import { useStore } from '@/lib/store'
import { Pencil, Check, Plus, X, Download } from 'lucide-react'

interface MealPlanProps {
  nutrition: DailyNutrition
  onUpdate: (n: DailyNutrition) => void
}

export function MealPlan({ nutrition, onUpdate }: MealPlanProps) {
  const [templates, setTemplates] = useStore<MealTemplate[]>('cortex-meal-templates', DEFAULT_MEAL_TEMPLATES)
  const [selectedId, setSelectedId] = useState(templates[0]?.id ?? '')
  const [editing, setEditing] = useState(false)

  // Inline add-food state per meal id
  const [addingMealId, setAddingMealId] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [newProtein, setNewProtein] = useState('')
  const [newCalories, setNewCalories] = useState('')
  const [newQuantity, setNewQuantity] = useState('')

  const selected = templates.find(t => t.id === selectedId) ?? templates[0]

  const templateTotals = useMemo(() => {
    const map: Record<string, { protein: number; calories: number }> = {}
    for (const t of templates) {
      let protein = 0, calories = 0
      for (const m of t.meals) for (const f of m.foods) { protein += f.protein; calories += f.calories }
      map[t.id] = { protein, calories }
    }
    return map
  }, [templates])

  const loadIntoToday = () => {
    if (!selected) return
    const meals = nutrition.meals.map(meal => {
      const templateMeal = selected.meals.find(tm => tm.name.toLowerCase() === meal.name.toLowerCase())
      if (!templateMeal || templateMeal.foods.length === 0) return meal
      return { ...meal, foods: [...meal.foods, ...templateMeal.foods] }
    })
    onUpdate({ ...nutrition, meals })
  }

  const removeFood = (mealId: string, foodIndex: number) => {
    setTemplates(prev => prev.map(t => {
      if (t.id !== selected.id) return t
      return { ...t, meals: t.meals.map(m => {
        if (m.id !== mealId) return m
        return { ...m, foods: m.foods.filter((_, i) => i !== foodIndex) }
      })}
    }))
  }

  const addFood = (mealId: string) => {
    if (!newName.trim()) return
    const food: FoodItem = {
      name: newName.trim(),
      protein: Number(newProtein) || 0,
      calories: Number(newCalories) || 0,
      ...(newQuantity.trim() ? { quantity: newQuantity.trim() } : {}),
    }
    setTemplates(prev => prev.map(t => {
      if (t.id !== selected.id) return t
      return { ...t, meals: t.meals.map(m => {
        if (m.id !== mealId) return m
        return { ...m, foods: [...m.foods, food] }
      })}
    }))
    setNewName('')
    setNewProtein('')
    setNewCalories('')
    setNewQuantity('')
    setAddingMealId(null)
  }

  const updateTemplateName = (value: string) => {
    setTemplates(prev => prev.map(t => t.id === selected.id ? { ...t, name: value } : t))
  }

  const updateTemplateDescription = (value: string) => {
    setTemplates(prev => prev.map(t => t.id === selected.id ? { ...t, description: value } : t))
  }

  return (
    <WidgetCard title="Meal Templates" className="mt-4" delay={0.1}>
      <div className="space-y-4">
        {/* Template selector tabs + edit toggle */}
        <div className="flex items-start gap-1.5">
          <div className="flex flex-1 gap-1.5">
            {templates.map(t => {
              const totals = templateTotals[t.id] ?? { protein: 0, calories: 0 }
              return (
                <button
                  key={t.id}
                  onClick={() => setSelectedId(t.id)}
                  aria-pressed={selectedId === t.id}
                  className={`flex-1 rounded-md border px-3 py-2.5 text-left transition-colors ${
                    selectedId === t.id
                      ? 'border-accent/40 bg-accent/10'
                      : 'border-border bg-card hover:bg-muted/40'
                  }`}
                >
                  <p className={`text-xs font-medium ${selectedId === t.id ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {t.name}
                  </p>
                  <p className="font-mono text-2xs tabular-nums text-foreground-faint">
                    {totals.protein}g · {totals.calories} kcal
                  </p>
                </button>
              )
            })}
          </div>
          <Button
            variant={editing ? 'secondary' : 'ghost'}
            size="icon-sm"
            onClick={() => { setEditing(!editing); setAddingMealId(null) }}
            aria-label={editing ? 'Done editing templates' : 'Edit templates'}
          >
            {editing ? <Check /> : <Pencil />}
          </Button>
        </div>

        {/* Editable name/description */}
        {editing && selected && (
          <div className="flex gap-2">
            <Input
              value={selected.name}
              onChange={e => updateTemplateName(e.target.value)}
              className="h-7 flex-1 text-xs"
              placeholder="Template name"
            />
            <Input
              value={selected.description}
              onChange={e => updateTemplateDescription(e.target.value)}
              className="h-7 flex-[2] text-xs"
              placeholder="Description"
            />
          </div>
        )}

        {/* Selected template detail */}
        {selected && (
          <div className="space-y-3">
            {!editing && (
              <p className="text-xs text-foreground-faint">{selected.description}</p>
            )}

            {selected.meals.map(meal => {
              const mealProtein = meal.foods.reduce((s, f) => s + f.protein, 0)
              const mealCals = meal.foods.reduce((s, f) => s + f.calories, 0)
              return (
                <div key={meal.id} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-foreground">{meal.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-2xs tabular-nums text-foreground-faint">
                        {mealProtein}g · {mealCals} kcal
                      </span>
                      {editing && (
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => setAddingMealId(addingMealId === meal.id ? null : meal.id)}
                          aria-label={`Add food to ${meal.name}`}
                        >
                          <Plus />
                        </Button>
                      )}
                    </div>
                  </div>

                  {meal.foods.map((food, fi) => (
                    <div key={fi} className="flex items-center justify-between border-t border-border/60 pb-0.5 pt-1.5 text-xs">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-foreground">{food.name}</span>
                        {food.quantity && (
                          <span className="shrink-0 text-foreground-faint">{food.quantity}</span>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="font-mono tabular-nums text-muted-foreground">{food.protein}g · {food.calories}</span>
                        {editing && (
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => removeFood(meal.id, fi)}
                            aria-label={`Remove ${food.name}`}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <X />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}

                  {/* Inline add food */}
                  {editing && addingMealId === meal.id && (
                    <div className="flex items-center gap-1.5 pt-1">
                      <Input
                        placeholder="Name"
                        value={newName}
                        onChange={e => setNewName(e.target.value)}
                        className="h-7 flex-1 text-xs"
                        onKeyDown={e => e.key === 'Enter' && addFood(meal.id)}
                      />
                      <Input
                        type="number"
                        placeholder="Prot"
                        value={newProtein}
                        onChange={e => setNewProtein(e.target.value)}
                        className="h-7 w-14 text-xs"
                      />
                      <Input
                        type="number"
                        placeholder="Cal"
                        value={newCalories}
                        onChange={e => setNewCalories(e.target.value)}
                        className="h-7 w-14 text-xs"
                      />
                      <Input
                        placeholder="Qty"
                        value={newQuantity}
                        onChange={e => setNewQuantity(e.target.value)}
                        className="h-7 w-16 text-xs"
                        onKeyDown={e => e.key === 'Enter' && addFood(meal.id)}
                      />
                      <Button
                        variant="secondary"
                        size="icon-sm"
                        className="shrink-0"
                        onClick={() => addFood(meal.id)}
                        aria-label="Add food"
                      >
                        <Plus />
                      </Button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Load into today */}
        <Button variant="secondary" size="sm" className="w-full" onClick={loadIntoToday}>
          <Download />
          Load into today
        </Button>
      </div>
    </WidgetCard>
  )
}
