import { useState, useMemo } from 'react'
import { Input } from '@/components/ui/input'
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
    <div className="rounded-xl border border-border bg-card p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Meal Templates</h3>
        <button
          onClick={() => { setEditing(!editing); setAddingMealId(null) }}
          className={`p-1.5 rounded-lg transition-colors ${editing ? 'bg-foreground/10 text-foreground' : 'text-muted-foreground/50 hover:text-muted-foreground'}`}
        >
          {editing ? <Check className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* Template selector tabs */}
      <div className="flex gap-1.5">
        {templates.map(t => {
          const totals = templateTotals[t.id] ?? { protein: 0, calories: 0 }
          return (
            <button
              key={t.id}
              onClick={() => setSelectedId(t.id)}
              className={`flex-1 rounded-lg px-3 py-2.5 text-left transition-colors ${
                selectedId === t.id
                  ? 'bg-foreground/10 border border-foreground/20'
                  : 'bg-card border border-border hover:bg-foreground/5'
              }`}
            >
              <p className={`text-xs font-medium ${selectedId === t.id ? 'text-foreground' : 'text-muted-foreground'}`}>
                {t.name}
              </p>
              <p className="text-[10px] text-muted-foreground/50 tabular-nums">
                {totals.protein}g · {totals.calories} kcal
              </p>
            </button>
          )
        })}
      </div>

      {/* Editable name/description */}
      {editing && selected && (
        <div className="flex gap-2">
          <Input
            value={selected.name}
            onChange={e => updateTemplateName(e.target.value)}
            className="h-7 text-xs flex-1"
            placeholder="Template name"
          />
          <Input
            value={selected.description}
            onChange={e => updateTemplateDescription(e.target.value)}
            className="h-7 text-xs flex-[2]"
            placeholder="Description"
          />
        </div>
      )}

      {/* Selected template detail */}
      {selected && (
        <div className="space-y-3">
          {!editing && (
            <p className="text-xs text-muted-foreground/50">{selected.description}</p>
          )}

          {selected.meals.map(meal => {
            const mealProtein = meal.foods.reduce((s, f) => s + f.protein, 0)
            const mealCals = meal.foods.reduce((s, f) => s + f.calories, 0)
            return (
              <div key={meal.id} className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-foreground">{meal.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground/50 tabular-nums">
                      {mealProtein}g · {mealCals} kcal
                    </span>
                    {editing && (
                      <button
                        onClick={() => setAddingMealId(addingMealId === meal.id ? null : meal.id)}
                        className="text-muted-foreground/50 hover:text-foreground transition-colors"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>

                {meal.foods.map((food, fi) => (
                  <div key={fi} className="flex items-center justify-between text-xs border-t border-border/30 pt-1.5 pb-0.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="truncate text-foreground">{food.name}</span>
                      {food.quantity && (
                        <span className="text-muted-foreground/50 shrink-0">{food.quantity}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-muted-foreground tabular-nums">{food.protein}g · {food.calories}</span>
                      {editing && (
                        <button
                          onClick={() => removeFood(meal.id, fi)}
                          className="text-red-400/60 hover:text-red-400 transition-colors p-0.5 -m-0.5"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                {/* Inline add food */}
                {editing && addingMealId === meal.id && (
                  <div className="flex gap-1.5 items-center pt-1">
                    <Input
                      placeholder="Name"
                      value={newName}
                      onChange={e => setNewName(e.target.value)}
                      className="h-7 text-xs flex-1"
                      onKeyDown={e => e.key === 'Enter' && addFood(meal.id)}
                    />
                    <Input
                      type="number"
                      placeholder="Prot"
                      value={newProtein}
                      onChange={e => setNewProtein(e.target.value)}
                      className="h-7 text-xs w-14"
                    />
                    <Input
                      type="number"
                      placeholder="Cal"
                      value={newCalories}
                      onChange={e => setNewCalories(e.target.value)}
                      className="h-7 text-xs w-14"
                    />
                    <Input
                      placeholder="Qty"
                      value={newQuantity}
                      onChange={e => setNewQuantity(e.target.value)}
                      className="h-7 text-xs w-16"
                      onKeyDown={e => e.key === 'Enter' && addFood(meal.id)}
                    />
                    <button
                      onClick={() => addFood(meal.id)}
                      className="rounded-lg bg-foreground/10 p-1.5 hover:bg-foreground/20 transition-colors shrink-0"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Load into today */}
      <button
        onClick={loadIntoToday}
        className="w-full flex items-center justify-center gap-2 rounded-lg bg-foreground/10 px-4 py-2.5 text-xs font-medium text-foreground hover:bg-foreground/15 active:bg-foreground/20 transition-colors"
      >
        <Download className="h-3.5 w-3.5" />
        Load into today
      </button>
    </div>
  )
}
