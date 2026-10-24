import type { DailyNutrition, FoodItem, MealEntry } from '@/types/gym'

export interface MacroTotals {
  protein: number
  calories: number
}

/** "Pg · C kcal" for a meal or template. */
export const macroLabel = ({ protein, calories }: MacroTotals) => `${protein}g · ${calories} kcal`

export function foodTotals(foods: FoodItem[] | undefined): MacroTotals {
  let protein = 0
  let calories = 0
  for (const food of foods ?? []) {
    protein += food.protein
    calories += food.calories
  }
  return { protein, calories }
}

export function mealsTotals(meals: Pick<MealEntry, 'foods'>[] | undefined): MacroTotals {
  return foodTotals((meals ?? []).flatMap((meal) => meal.foods ?? []))
}

export const dayNutritionTotals = (day: DailyNutrition) => ({ ...mealsTotals(day.meals), water: day.waterLiters })

/** Whether any meal of the day has food logged. */
export const hasLoggedFood = (day: DailyNutrition | null | undefined): day is DailyNutrition =>
  !!day && (day.meals ?? []).some((meal) => (meal.foods?.length ?? 0) > 0)

export interface FoodDraft {
  name: string
  quantity: string
  protein: string
  calories: string
}

export const emptyFoodDraft: FoodDraft = { name: '', quantity: '', protein: '', calories: '' }

/** A food from form text, or null without a name. Blank or invalid macros count as 0. */
export function foodFromDraft(draft: FoodDraft): FoodItem | null {
  const name = draft.name.trim()
  if (!name) return null
  const quantity = draft.quantity.trim()
  return {
    name,
    protein: Number(draft.protein) || 0,
    calories: Number(draft.calories) || 0,
    ...(quantity ? { quantity } : {}),
  }
}
