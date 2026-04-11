// ── Gym & Nutrition Types ────────────────────────────────────────────────────
// Store keys:
//   cortex-gym-plans              → WorkoutDay[]
//   cortex-gym-active             → ActiveWorkoutState | null
//   cortex-gym-session-{YYYY-MM-DD} → WorkoutSession | null
//   cortex-nutrition-{YYYY-MM-DD} → DailyNutrition
//   cortex-nutrition-targets      → NutritionTargets
//   cortex-body-stats             → BodyStats[]
//   cortex-hard-bans              → HardBan[]
//   cortex-ban-violations         → BanViolation[]
//   cortex-meal-templates         → MealTemplate[]
//   cortex-market-presets         → MarketPreset[]

// ── Workout Plan ─────────────────────────────────────────────────────────────

export interface Exercise {
  id: string
  name: string
  sets: number
  repsRange: string        // "8-10", "15", "10/leg"
  startWeight: string      // "12-14 kg each"
  notes: string
}

export interface WorkoutDay {
  id: string
  name: string             // "PUSH", "PULL", "LEGS", "SWIM"
  dayOfWeek: string        // "Tuesday"
  time: string             // "4:30–5:00 PM"
  exercises: Exercise[]
}

// ── Workout Session (logged) ─────────────────────────────────────────────────

export interface SetLog {
  weight: number
  reps: number
  completed: boolean
}

export interface ExerciseLog {
  exerciseId: string
  exerciseName: string
  sets: SetLog[]
}

export interface WorkoutSession {
  date: string
  workoutDayId: string
  workoutName: string
  exercises: ExerciseLog[]
  startedAt: string
  finishedAt?: string
  completedFully: boolean
}

// ── Active Workout (in-progress, persists across navigation) ─────────────────

export interface ActiveWorkoutState {
  workoutDayId: string
  startedAt: string
  currentExerciseIndex: number
  currentSetIndex: number
  exerciseLogs: ExerciseLog[]
  restTimerEnd: number | null   // absolute timestamp (ms)
  restDuration: number          // current preset in seconds
  isResting: boolean
}

// ── Nutrition ────────────────────────────────────────────────────────────────

export interface FoodItem {
  name: string
  protein: number          // grams
  calories: number
  quantity?: string        // "8 whole", "500ml"
}

export interface MealEntry {
  id: string
  name: string             // "Breakfast", "Lunch", "Dinner", "Snack"
  foods: FoodItem[]
}

export interface DailyNutrition {
  date: string
  meals: MealEntry[]
  waterLiters: number
  weight?: number
  notes?: string
}

// ── Body Stats ───────────────────────────────────────────────────────────────

export interface BodyStats {
  date: string
  weight: number           // kg
  notes?: string
}

// ── Nutrition Targets ────────────────────────────────────────────────────────

export interface NutritionTargets {
  protein: number
  calories: number
  water: number
}

export const DEFAULT_NUTRITION_TARGETS: NutritionTargets = {
  protein: 156,
  calories: 3150,
  water: 2.5,
}

// Legacy exports for compatibility
export const PROTEIN_TARGET = DEFAULT_NUTRITION_TARGETS.protein
export const CALORIE_TARGET = DEFAULT_NUTRITION_TARGETS.calories
export const WATER_TARGET = DEFAULT_NUTRITION_TARGETS.water
export const REST_PRESETS = [60, 90, 120, 180]

export const COMMON_FOODS: FoodItem[] = [
  { name: '6 Eggs', protein: 36, calories: 420, quantity: '6 whole' },
  { name: '12 Eggs (Sunday)', protein: 72, calories: 840, quantity: '12 whole' },
  { name: 'Whey Shake (in milk)', protein: 36, calories: 280, quantity: '1 scoop + 250ml milk' },
  { name: 'Milk 250ml', protein: 8, calories: 150, quantity: '1 glass' },
  { name: 'Chicken 450g', protein: 100, calories: 450, quantity: '450g pollo asado' },
  { name: 'Chicken 100g', protein: 31, calories: 165, quantity: '100g' },
  { name: 'Banana', protein: 1, calories: 100, quantity: '1 medium' },
  { name: 'Rice (1 cup)', protein: 4, calories: 206, quantity: '1 cup cooked' },
  { name: 'Platano maduro', protein: 2, calories: 150, quantity: '1 unit' },
  { name: 'Yuca frita', protein: 4, calories: 300, quantity: '1 portion' },
  { name: 'Papas criollas', protein: 4, calories: 300, quantity: '1 portion' },
  { name: 'Peanut butter', protein: 4, calories: 100, quantity: '1 tbsp' },
  { name: 'Aguacate', protein: 2, calories: 160, quantity: '1/2' },
  { name: 'Granola bar', protein: 3, calories: 150, quantity: '1 bar' },
]

export const DEFAULT_WORKOUT_PLANS: WorkoutDay[] = [
  {
    id: 'push',
    name: 'PUSH',
    dayOfWeek: 'Tuesday',
    time: '4:30–6:00 PM',
    exercises: [
      { id: 'p1', name: 'Barbell Bench Press', sets: 4, repsRange: '6-8', startWeight: '40-50 kg', notes: 'Primary compound. Feet flat, back arched, shoulder blades squeezed.' },
      { id: 'p2', name: 'Incline Barbell Press', sets: 4, repsRange: '8-10', startWeight: '30-40 kg', notes: 'Bench at ~30°. Upper chest focus.' },
      { id: 'p3', name: 'Overhead Press (standing)', sets: 4, repsRange: '8-10', startWeight: '25-30 kg', notes: 'Barbell from front rack. Core tight, no leaning back.' },
      { id: 'p4', name: 'Cable Crossover Flyes', sets: 3, repsRange: '12-15', startWeight: 'Light-moderate', notes: 'High-to-low for lower chest, low-to-high for upper. Squeeze at peak.' },
      { id: 'p5', name: 'Tricep Rope Pushdowns', sets: 3, repsRange: '12-15', startWeight: 'Moderate', notes: 'Elbows pinned, spread rope at bottom.' },
      { id: 'p6', name: 'Overhead Tricep Extension (cable)', sets: 3, repsRange: '10-12', startWeight: 'Moderate', notes: 'Face away from cable. Long head focus.' },
      { id: 'p7', name: 'DB Lateral Raises', sets: 4, repsRange: '12-15', startWeight: '5-8 kg each', notes: 'Controlled, slight lean forward. Key for shoulder width.' },
      { id: 'p8', name: 'Machine Lateral Raise', sets: 2, repsRange: '15-20', startWeight: 'Light', notes: 'Burnout finisher for side delts. Only if machine available.' },
      { id: 'p9', name: 'Cable Crunches', sets: 3, repsRange: '15-20', startWeight: 'Moderate', notes: 'AB FINISHER. Kneel at cable, crunch down, squeeze abs hard.' },
      { id: 'p10', name: 'Hanging Leg Raises', sets: 3, repsRange: '12-15', startWeight: 'Bodyweight', notes: 'Straight legs if possible, bent knees if not. Control the movement.' },
    ],
  },
  {
    id: 'pull',
    name: 'PULL',
    dayOfWeek: 'Wednesday',
    time: '5:00–6:00 PM',
    exercises: [
      { id: 'l1', name: 'Barbell Row (Pendlay)', sets: 4, repsRange: '6-8', startWeight: '40-50 kg', notes: 'Primary compound. Pull to lower chest, squeeze back, keep back flat.' },
      { id: 'l2', name: 'Lat Pulldown', sets: 4, repsRange: '8-10', startWeight: 'Moderate-heavy', notes: 'Wide grip, pull to upper chest, lean back slightly.' },
      { id: 'l3', name: 'Seated Cable Row', sets: 3, repsRange: '10-12', startWeight: 'Moderate', notes: 'V-grip or wide grip. Squeeze shoulder blades. Back thickness.' },
      { id: 'l4', name: 'Cable Face Pulls', sets: 3, repsRange: '15', startWeight: 'Light', notes: 'External rotation at top. Rear delts + posture correction.' },
      { id: 'l5', name: 'Barbell Curls', sets: 3, repsRange: '8-10', startWeight: '20-25 kg', notes: 'Strict form, no swinging. Full extension at bottom.' },
      { id: 'l6', name: 'Preacher Curls', sets: 3, repsRange: '10-12', startWeight: 'Moderate', notes: 'Machine or DB. Eliminates cheating. Peak contraction focus.' },
      { id: 'l7', name: 'DB Shrugs', sets: 3, repsRange: '12-15', startWeight: '16-20 kg each', notes: '2 sec hold at top. Traps.' },
      { id: 'l8', name: 'Plank Hold', sets: 3, repsRange: '45-60 sec', startWeight: 'Bodyweight', notes: 'AB FINISHER. Squeeze glutes, don\'t let hips sag.' },
    ],
  },
  {
    id: 'legs',
    name: 'LEGS',
    dayOfWeek: 'Friday',
    time: '4:30–5:30 PM',
    exercises: [
      { id: 'g1', name: 'Barbell Back Squat', sets: 4, repsRange: '8-10', startWeight: '50-60 kg', notes: 'Primary compound. Bar on upper traps, squat to parallel or below.' },
      { id: 'g2', name: 'Barbell Romanian Deadlift', sets: 4, repsRange: '8-10', startWeight: '40-50 kg', notes: 'From rack height, hinge at hips, slight knee bend. Hamstring focus.' },
      { id: 'g3', name: 'Leg Press', sets: 3, repsRange: '10-12', startWeight: 'Moderate-heavy', notes: 'Feet high and wide for glutes/hams, low and narrow for quads.' },
      { id: 'g4', name: 'Leg Curl Machine', sets: 3, repsRange: '10-12', startWeight: 'Moderate', notes: 'Hamstring isolation. Slow negative.' },
      { id: 'g5', name: 'Calf Raise Machine', sets: 4, repsRange: '15-20', startWeight: 'Moderate', notes: 'Full stretch at bottom, 2 sec hold at top.' },
      { id: 'g6', name: 'Cable Woodchops', sets: 3, repsRange: '12 each side', startWeight: 'Light-moderate', notes: 'AB FINISHER. Obliques + rotation. Twist from hips, not arms.' },
      { id: 'g7', name: 'Reverse Crunches (bench)', sets: 3, repsRange: '15-20', startWeight: 'Bodyweight', notes: 'Knees to chest, lower slowly. Lower abs.' },
    ],
  },
  {
    id: 'swim',
    name: 'SWIM',
    dayOfWeek: 'Saturday',
    time: '30 min',
    exercises: [],
  },
]

export const EMPTY_DAILY_NUTRITION: DailyNutrition = {
  date: '',
  meals: [
    { id: 'breakfast', name: 'Breakfast', foods: [] },
    { id: 'lunch', name: 'Lunch', foods: [] },
    { id: 'dinner', name: 'Dinner', foods: [] },
    { id: 'snack', name: 'Snack', foods: [] },
  ],
  waterLiters: 0,
}

// ── Hard Bans ───────────────────────────────────────────────────────────────

export interface HardBan {
  id: string
  name: string
  category: 'food' | 'digital' | 'lifestyle'
}

export interface BanViolation {
  id: string
  banId: string
  date: string
  timestamp: string
  notes?: string
}

export const DEFAULT_HARD_BANS: HardBan[] = [
  { id: 'candy', name: 'Candy/Sweets', category: 'food' },
  { id: 'soda', name: 'Soda/Sugary drinks', category: 'food' },
  { id: 'fastfood', name: 'Fast food', category: 'food' },
  { id: 'junk', name: 'Processed junk', category: 'food' },
  { id: 'chips', name: 'Chips/Snacks', category: 'food' },
  { id: 'alcohol', name: 'Alcohol', category: 'food' },
  { id: 'porn', name: 'Porn', category: 'digital' },
  { id: 'scrolling', name: 'TikTok/Reels/Shorts', category: 'digital' },
  { id: 'youtube', name: 'YouTube rabbit holes', category: 'digital' },
  { id: 'series', name: 'Series/Anime', category: 'digital' },
  { id: 'gaming', name: 'Gaming', category: 'lifestyle' },
  { id: 'twitter', name: 'Twitter outside work', category: 'digital' },
]

// ── Meal Plan Templates ─────────────────────────────────────────────────────

export interface MealTemplate {
  id: string
  name: string
  description: string
  meals: { id: string; name: string; foods: FoodItem[] }[]
}

export const DEFAULT_MEAL_TEMPLATES: MealTemplate[] = [
  {
    id: 'weekday',
    name: 'Weekday',
    description: 'Mon-Fri standard',
    meals: [
      { id: 'breakfast', name: 'Breakfast', foods: [
        { name: '6 Eggs', protein: 36, calories: 420, quantity: '6 whole' },
      ]},
      { id: 'lunch', name: 'Lunch', foods: [
        { name: 'Cooked meal', protein: 30, calories: 800, quantity: 'protein + rice/yuca' },
      ]},
      { id: 'dinner', name: 'Dinner', foods: [
        { name: 'Cooked meal', protein: 25, calories: 700, quantity: 'protein + carbs' },
      ]},
      { id: 'snack', name: 'Snack', foods: [
        { name: 'Whey Shake (in milk)', protein: 36, calories: 280, quantity: '1 scoop + 250ml milk' },
        { name: 'Milk 250ml', protein: 8, calories: 150, quantity: '1 glass' },
        { name: 'Banana', protein: 1, calories: 100, quantity: '1 medium' },
      ]},
    ],
  },
  {
    id: 'saturday',
    name: 'Saturday',
    description: 'Pollo asado dinner',
    meals: [
      { id: 'breakfast', name: 'Breakfast', foods: [
        { name: '6 Eggs', protein: 36, calories: 420, quantity: '6 whole' },
      ]},
      { id: 'lunch', name: 'Lunch', foods: [
        { name: 'Cooked meal', protein: 30, calories: 800, quantity: 'protein + sides' },
      ]},
      { id: 'dinner', name: 'Dinner', foods: [
        { name: 'Chicken 450g', protein: 100, calories: 450, quantity: '450g pollo asado' },
        { name: 'Platano maduro', protein: 2, calories: 150, quantity: '2 units' },
        { name: 'Yuca frita', protein: 4, calories: 300, quantity: '1 portion' },
      ]},
      { id: 'snack', name: 'Snack', foods: [
        { name: 'Whey Shake (in milk)', protein: 36, calories: 280, quantity: '1 scoop + 250ml milk' },
        { name: 'Milk 250ml', protein: 8, calories: 150, quantity: '1 glass' },
      ]},
    ],
  },
  {
    id: 'sunday',
    name: 'Sunday',
    description: 'HIGH CALORIE DAY ~3,500+ kcal',
    meals: [
      { id: 'breakfast', name: 'Breakfast', foods: [
        { name: '12 Eggs (Sunday)', protein: 72, calories: 840, quantity: '12 whole' },
        { name: 'Platano maduro', protein: 2, calories: 150, quantity: '4 units' },
        { name: 'Papas criollas', protein: 4, calories: 300, quantity: '1 portion' },
      ]},
      { id: 'lunch', name: 'Lunch', foods: [
        { name: 'Chicken 450g', protein: 100, calories: 450, quantity: '450g pollo asado' },
        { name: 'Yuca frita', protein: 4, calories: 300, quantity: '1 portion' },
        { name: 'Aguacate', protein: 2, calories: 160, quantity: '1/2' },
      ]},
      { id: 'dinner', name: 'Dinner', foods: [
        { name: 'Chicken 450g', protein: 100, calories: 450, quantity: '450g pollo asado' },
        { name: 'Papas criollas', protein: 4, calories: 300, quantity: '1 portion' },
        { name: 'Platano maduro', protein: 2, calories: 150, quantity: '1 unit' },
      ]},
      { id: 'snack', name: 'Snack', foods: [
        { name: 'Whey Shake (in milk)', protein: 36, calories: 280, quantity: '1 scoop + milk + banana' },
        { name: 'Milk 250ml', protein: 8, calories: 150, quantity: '1 glass' },
        { name: 'Peanut butter', protein: 4, calories: 100, quantity: '1 tbsp' },
      ]},
    ],
  },
]

// ── Market Presets ───────────────────────────────────────────────────────────

export interface MarketPreset {
  name: string
  price: number
  quantity: number
  store: string
  category: string
}

export const DEFAULT_MARKET_PRESETS: MarketPreset[] = [
  { name: 'Pollo (pechuga o entero)', price: 18000, quantity: 1, store: 'D1', category: 'Protein' },
  { name: 'Huevos rojo AA x12', price: 7500, quantity: 1, store: 'D1', category: 'Protein' },
  { name: 'Platanos maduros', price: 8000, quantity: 1, store: 'D1', category: 'Produce' },
  { name: 'Yuca 1kg', price: 3000, quantity: 1, store: 'D1', category: 'Carbs' },
  { name: 'Papa criolla 1kg', price: 5000, quantity: 1, store: 'D1', category: 'Carbs' },
  { name: 'Aguacate Hass', price: 4000, quantity: 1, store: 'D1', category: 'Produce' },
  { name: 'Leche entera 3.5L', price: 12000, quantity: 1, store: 'D1', category: 'Dairy' },
  { name: 'Bananos', price: 3000, quantity: 1, store: 'D1', category: 'Produce' },
  { name: 'Whey protein bag', price: 400000, quantity: 1, store: 'D1', category: 'Supplements' },
  { name: 'Mantequilla de mani', price: 12000, quantity: 1, store: 'D1', category: 'Protein' },
]
