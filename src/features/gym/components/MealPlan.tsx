import { useState, useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import type { DailyNutrition, MealTemplate } from '@/types/gym'
import { DEFAULT_MEAL_TEMPLATES } from '@/types/gym'
import { useStore } from '@/lib/store'
import { Pencil, Check, Plus, Download } from 'lucide-react'
import { emptyFoodDraft, foodFromDraft, foodTotals, macroLabel, mealsTotals, type FoodDraft } from '../domain/nutrition'
import { FoodDraftFields, FoodRow } from './FoodControls'
import { SelectionCard } from './SelectionCard'

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
  const [foodDraft, setFoodDraft] = useState<FoodDraft>(emptyFoodDraft)

  const selected = templates.find(t => t.id === selectedId) ?? templates[0]

  const templateTotals = useMemo(
    () => Object.fromEntries(templates.map(t => [t.id, mealsTotals(t.meals)])),
    [templates],
  )

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
    const food = foodFromDraft(foodDraft)
    if (!food) return
    setTemplates(prev => prev.map(t => {
      if (t.id !== selected.id) return t
      return { ...t, meals: t.meals.map(m => {
        if (m.id !== mealId) return m
        return { ...m, foods: [...m.foods, food] }
      })}
    }))
    setFoodDraft(emptyFoodDraft)
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
            {templates.map(t => (
              <SelectionCard
                key={t.id}
                title={t.name}
                selected={selectedId === t.id}
                onSelect={() => setSelectedId(t.id)}
                className="flex-1"
              >
                {macroLabel(templateTotals[t.id] ?? { protein: 0, calories: 0 })}
              </SelectionCard>
            ))}
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
            <Input aria-label="Template name"
              value={selected.name}
              onChange={e => updateTemplateName(e.target.value)}
              className="h-7 flex-1 text-xs"
              placeholder="Template name"
            />
            <Input aria-label="Template description"
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
              const mealTotals = foodTotals(meal.foods)
              return (
                <div key={meal.id} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-foreground">{meal.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-2xs tabular-nums text-foreground-faint">
                        {macroLabel(mealTotals)}
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
                    <FoodRow key={fi} food={food} dense onRemove={editing ? () => removeFood(meal.id, fi) : undefined} />
                  ))}

                  {/* Inline add food */}
                  {editing && addingMealId === meal.id && (
                    <FoodDraftFields
                      draft={foodDraft}
                      onChange={setFoodDraft}
                      onSubmit={() => addFood(meal.id)}
                      dense
                      actions={(
                        <Button variant="secondary" size="icon-sm" className="shrink-0" onClick={() => addFood(meal.id)} aria-label="Add food">
                          <Plus />
                        </Button>
                      )}
                    />
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
