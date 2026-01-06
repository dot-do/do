/**
 * Relationship Operator Parsing
 *
 * Five operators for defining relationships between entities:
 * - `->` Forward Exact: "Create new, belongs to parent"
 * - `~>` Forward Fuzzy: "Find existing or create shared"
 * - `<-` Backward Exact: "Find entities referencing me"
 * - `<~` Backward Fuzzy: "Find semantically related"
 * - `<->` Bidirectional: "Follow edges in both directions"
 */

export type RelationshipDirection = 'forward' | 'backward' | 'bidirectional'
export type RelationshipMode = 'exact' | 'fuzzy'

export interface OperatorResult {
  direction: RelationshipDirection
  mode: RelationshipMode
  type: string
  isArray: boolean
}

/**
 * Error thrown when operator parsing fails
 */
export class OperatorParseError extends Error {
  constructor(
    message: string,
    public operator: string
  ) {
    super(message)
    this.name = 'OperatorParseError'
  }
}

/**
 * Regex pattern for parsing a single relationship operator
 * Matches: operator (<-> | -> | ~> | <- | <~) + type name (PascalCase or camelCase) + optional array marker
 *
 * Supports:
 * - PascalCase entity types: ->User, ~>Tag, <-Post
 * - camelCase relationship types: ->authored, ~>topics, <-comments
 * - Lowercase relationship types: ->author, ~>similar
 * - Bidirectional: <->friend
 */
const OPERATOR_REGEX = /^(<->|->|~>|<-|<~)([a-zA-Z_][a-zA-Z0-9_]*)(\[\])?$/

/**
 * Regex pattern for splitting chained operators
 * Matches operators like: ->knows->works_at or <-follows->authored
 */
const CHAINED_OPERATOR_REGEX = /(<->|->|~>|<-|<~)([a-zA-Z_][a-zA-Z0-9_]*)(\[\])?/g

/**
 * Direction mapping for each operator
 */
const DIRECTION_MAP: Record<string, RelationshipDirection> = {
  '->': 'forward',
  '~>': 'forward',
  '<-': 'backward',
  '<~': 'backward',
  '<->': 'bidirectional',
}

/**
 * Mode mapping for each operator
 */
const MODE_MAP: Record<string, RelationshipMode> = {
  '->': 'exact',
  '~>': 'fuzzy',
  '<-': 'exact',
  '<~': 'fuzzy',
  '<->': 'exact',
}

/**
 * Parse a relationship operator string into its components
 *
 * @param operator - The operator string to parse (e.g., '->User', '~>Tag[]', '<-Post')
 * @returns Parsed operator result with direction, mode, type, and array flag
 * @throws OperatorParseError if the operator format is invalid
 *
 * @example
 * parseOperator('->User')
 * // { direction: 'forward', mode: 'exact', type: 'User', isArray: false }
 *
 * @example
 * parseOperator('~>Tag[]')
 * // { direction: 'forward', mode: 'fuzzy', type: 'Tag', isArray: true }
 *
 * @example
 * parseOperator('<-Post')
 * // { direction: 'backward', mode: 'exact', type: 'Post', isArray: false }
 *
 * @example
 * parseOperator('<~Article[]')
 * // { direction: 'backward', mode: 'fuzzy', type: 'Article', isArray: true }
 */
export function parseOperator(operator: string): OperatorResult {
  if (!operator) {
    throw new OperatorParseError('Operator string cannot be empty', operator)
  }

  const match = operator.match(OPERATOR_REGEX)
  if (!match) {
    throw new OperatorParseError(`Invalid operator format: ${operator}`, operator)
  }

  const [, op, type, arrayMarker] = match

  return {
    direction: DIRECTION_MAP[op],
    mode: MODE_MAP[op],
    type,
    isArray: !!arrayMarker,
  }
}

/**
 * Split a potentially chained operator string into individual operators
 *
 * Handles both single operators and chained operators:
 * - Single: '->knows' returns ['->knows']
 * - Chained: '->knows->works_at' returns ['->knows', '->works_at']
 * - Mixed: '<-follows->authored' returns ['<-follows', '->authored']
 *
 * @param operatorString - The operator string, potentially containing multiple chained operators
 * @returns Array of individual operator strings
 * @throws OperatorParseError if no valid operators are found
 *
 * @example
 * splitChainedOperators('->knows')
 * // ['->knows']
 *
 * @example
 * splitChainedOperators('->knows->works_at')
 * // ['->knows', '->works_at']
 *
 * @example
 * splitChainedOperators('<->friend')
 * // ['<->friend']
 */
export function splitChainedOperators(operatorString: string): string[] {
  if (!operatorString) {
    throw new OperatorParseError('Operator string cannot be empty', operatorString)
  }

  // First try to match as a single operator (most common case)
  if (OPERATOR_REGEX.test(operatorString)) {
    return [operatorString]
  }

  // Otherwise, split chained operators
  const matches: string[] = []
  let match: RegExpExecArray | null

  // Reset the regex lastIndex
  CHAINED_OPERATOR_REGEX.lastIndex = 0

  while ((match = CHAINED_OPERATOR_REGEX.exec(operatorString)) !== null) {
    const [fullMatch] = match
    matches.push(fullMatch)
  }

  if (matches.length === 0) {
    throw new OperatorParseError(`Invalid operator format: ${operatorString}`, operatorString)
  }

  return matches
}
