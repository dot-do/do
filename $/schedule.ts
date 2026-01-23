/**
 * Schedule Context Implementation
 *
 * Provides scheduled task registration with natural time expressions.
 * Supports intervals, specific days, and time slots.
 *
 * @example
 * ```typescript
 * // Simple intervals
 * $.every.hour(async ($) => {
 *   await $.db.Cache.refresh()
 * })
 *
 * // Specific days and times
 * $.every.Monday.at9am(async ($) => {
 *   await $.slack`#team Weekly standup!`
 * })
 *
 * // Custom intervals
 * $.every.minutes(15)(async ($) => {
 *   await checkServices()
 * })
 * ```
 *
 * @module context/schedule
 */

import type {
  EveryContext,
  ScheduleHandler,
  TimeSlot,
  DOContext,
} from '../types/context'

/**
 * Schedule handler function type
 */
type ScheduleHandlerFn = ($: DOContext) => Promise<void>

/**
 * Registered schedule
 */
interface RegisteredSchedule {
  /** Cron expression */
  cron: string
  /** Human-readable name */
  name: string
  /** Handler function */
  handler: ScheduleHandlerFn
  /** Registration timestamp */
  registeredAt: number
}

/**
 * Schedule Registry
 *
 * Manages scheduled task registration.
 * Handlers are keyed by cron expression.
 */
export class ScheduleRegistry {
  /** Registered schedules by cron expression */
  private schedules: Map<string, RegisteredSchedule[]> = new Map()

  /**
   * Register a scheduled handler
   *
   * @param cron - Cron expression
   * @param name - Human-readable name
   * @param handler - Handler function
   */
  register(cron: string, name: string, handler: ScheduleHandlerFn): void {
    const schedules = this.schedules.get(cron) || []
    schedules.push({
      cron,
      name,
      handler,
      registeredAt: Date.now(),
    })
    this.schedules.set(cron, schedules)
    console.log(`[Schedule] Registered handler for ${name} (${cron})`)
  }

  /**
   * Execute handlers for a cron expression
   *
   * @param cron - Cron expression
   * @param context - DO context for handlers
   */
  async execute(cron: string, context: DOContext): Promise<void> {
    const schedules = this.schedules.get(cron) || []

    if (schedules.length === 0) {
      return
    }

    console.log(`[Schedule] Executing ${schedules.length} handlers for ${cron}`)

    const results = await Promise.allSettled(
      schedules.map(({ handler }) => handler(context))
    )

    for (const result of results) {
      if (result.status === 'rejected') {
        console.error(`[Schedule] Handler error for ${cron}:`, result.reason)
      }
    }
  }

  /**
   * Get all schedules for a cron expression
   *
   * @param cron - Cron expression
   * @returns Array of schedules
   */
  getSchedules(cron: string): RegisteredSchedule[] {
    return this.schedules.get(cron) || []
  }

  /**
   * Get all registered cron expressions
   *
   * @returns Array of cron expressions
   */
  getCronExpressions(): string[] {
    return Array.from(this.schedules.keys())
  }

  /**
   * Clear all schedules
   */
  clear(): void {
    this.schedules.clear()
    console.log(`[Schedule] Cleared all schedules`)
  }
}

/**
 * Cron expression constants for common schedules
 */
const CRON = {
  // Simple intervals
  second: '* * * * * *',
  minute: '* * * * *',
  hour: '0 * * * *',
  day: '0 0 * * *',
  week: '0 0 * * 0',
  month: '0 0 1 * *',

  // Days of week (0 = Sunday)
  Sunday: '0 0 * * 0',
  Monday: '0 0 * * 1',
  Tuesday: '0 0 * * 2',
  Wednesday: '0 0 * * 3',
  Thursday: '0 0 * * 4',
  Friday: '0 0 * * 5',
  Saturday: '0 0 * * 6',

  // Weekday/Weekend
  weekday: '0 0 * * 1-5',
  weekend: '0 0 * * 0,6',
} as const

/**
 * Time slots with hour values
 */
const TIME_SLOTS = {
  at6am: 6,
  at7am: 7,
  at8am: 8,
  at9am: 9,
  at10am: 10,
  at11am: 11,
  at12pm: 12,
  atnoon: 12,
  at1pm: 13,
  at2pm: 14,
  at3pm: 15,
  at4pm: 16,
  at5pm: 17,
  at6pm: 18,
  at7pm: 19,
  at8pm: 20,
  at9pm: 21,
  atmidnight: 0,
} as const

/**
 * Create a schedule handler function
 *
 * @param registry - Schedule registry
 * @param cron - Cron expression
 * @param name - Human-readable name
 * @returns ScheduleHandler
 */
function createScheduleHandler(
  registry: ScheduleRegistry,
  cron: string,
  name: string
): ScheduleHandler {
  return (handler: ScheduleHandlerFn): void => {
    registry.register(cron, name, handler)
  }
}

/**
 * Create a time slot object with all time options
 *
 * @param registry - Schedule registry
 * @param dayOfWeek - Day of week (0-6, or 1-5 for weekday, 0,6 for weekend)
 * @param dayName - Human-readable day name
 * @returns TimeSlot object
 */
function createTimeSlot(
  registry: ScheduleRegistry,
  dayOfWeek: string,
  dayName: string
): TimeSlot {
  const timeSlot = {} as TimeSlot

  for (const [slot, hour] of Object.entries(TIME_SLOTS)) {
    const cron = `0 ${hour} * * ${dayOfWeek}`
    const name = `${dayName}.${slot}`
    timeSlot[slot as keyof TimeSlot] = createScheduleHandler(registry, cron, name)
  }

  return timeSlot
}

/**
 * Create a day-based schedule handler with time slots
 *
 * @param registry - Schedule registry
 * @param dayOfWeek - Day of week value
 * @param dayName - Human-readable day name
 * @returns Combined ScheduleHandler and TimeSlot
 */
function createDaySchedule(
  registry: ScheduleRegistry,
  dayOfWeek: string,
  dayName: string
): TimeSlot & ScheduleHandler {
  // Create the base handler (runs at midnight on that day)
  const cron = `0 0 * * ${dayOfWeek}`
  const baseHandler = createScheduleHandler(registry, cron, dayName)

  // Create time slots
  const timeSlot = createTimeSlot(registry, dayOfWeek, dayName)

  // Combine them
  return Object.assign(baseHandler, timeSlot)
}

/**
 * Create the Every Context
 *
 * Provides all schedule registration methods with natural naming.
 *
 * @param registry - Schedule registry for storing handlers
 * @returns EveryContext implementation
 *
 * @example
 * ```typescript
 * const registry = new ScheduleRegistry()
 * const every = createEveryContext(registry)
 *
 * // Register handlers
 * every.hour(async ($) => {
 *   console.log('Every hour')
 * })
 *
 * every.Monday.at9am(async ($) => {
 *   console.log('Monday at 9am')
 * })
 *
 * every.minutes(15)(async ($) => {
 *   console.log('Every 15 minutes')
 * })
 * ```
 */
export function createEveryContext(registry: ScheduleRegistry): EveryContext {
  return {
    // Simple intervals
    second: createScheduleHandler(registry, CRON.second, 'second'),
    minute: createScheduleHandler(registry, CRON.minute, 'minute'),
    hour: createScheduleHandler(registry, CRON.hour, 'hour'),
    day: createScheduleHandler(registry, CRON.day, 'day'),
    week: createScheduleHandler(registry, CRON.week, 'week'),
    month: createScheduleHandler(registry, CRON.month, 'month'),

    // Custom intervals
    minutes: (n: number): ScheduleHandler => {
      const cron = `*/${n} * * * *`
      return createScheduleHandler(registry, cron, `every ${n} minutes`)
    },
    hours: (n: number): ScheduleHandler => {
      const cron = `0 */${n} * * *`
      return createScheduleHandler(registry, cron, `every ${n} hours`)
    },

    // Days of week with time slots
    Monday: createDaySchedule(registry, '1', 'Monday'),
    Tuesday: createDaySchedule(registry, '2', 'Tuesday'),
    Wednesday: createDaySchedule(registry, '3', 'Wednesday'),
    Thursday: createDaySchedule(registry, '4', 'Thursday'),
    Friday: createDaySchedule(registry, '5', 'Friday'),
    Saturday: createDaySchedule(registry, '6', 'Saturday'),
    Sunday: createDaySchedule(registry, '0', 'Sunday'),

    // Weekday/Weekend with time slots
    weekday: createDaySchedule(registry, '1-5', 'weekday'),
    weekend: createDaySchedule(registry, '0,6', 'weekend'),
  }
}

/**
 * Parse a cron expression to human-readable format
 *
 * @param cron - Cron expression
 * @returns Human-readable description
 */
export function describeCron(cron: string): string {
  // Simple pattern matching for common cases
  const patterns: Record<string, string> = {
    '* * * * *': 'every minute',
    '0 * * * *': 'every hour',
    '0 0 * * *': 'every day at midnight',
    '0 0 * * 0': 'every Sunday at midnight',
    '0 0 * * 1': 'every Monday at midnight',
    '0 0 * * 2': 'every Tuesday at midnight',
    '0 0 * * 3': 'every Wednesday at midnight',
    '0 0 * * 4': 'every Thursday at midnight',
    '0 0 * * 5': 'every Friday at midnight',
    '0 0 * * 6': 'every Saturday at midnight',
    '0 0 1 * *': 'first day of every month',
  }

  if (cron in patterns) {
    return patterns[cron]
  }

  // Parse for time-of-day patterns
  const parts = cron.split(' ')
  if (parts.length === 5) {
    const [minute, hour, dayOfMonth, month, dayOfWeek] = parts

    if (minute === '0' && hour !== '*' && dayOfWeek !== '*') {
      const hourNum = parseInt(hour, 10)
      const ampm = hourNum >= 12 ? 'pm' : 'am'
      const hour12 = hourNum > 12 ? hourNum - 12 : hourNum === 0 ? 12 : hourNum

      const days: Record<string, string> = {
        '0': 'Sunday',
        '1': 'Monday',
        '2': 'Tuesday',
        '3': 'Wednesday',
        '4': 'Thursday',
        '5': 'Friday',
        '6': 'Saturday',
        '0,6': 'weekend',
        '1-5': 'weekday',
      }

      const dayName = days[dayOfWeek] || dayOfWeek
      return `${dayName} at ${hour12}${ampm}`
    }
  }

  return cron
}
