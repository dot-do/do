/**
 * @dotdo/do - Unused Declarations Analyzer
 *
 * TypeScript analyzer that detects unused declarations in strict mode.
 * Detects:
 * - Unused local variables (noUnusedLocals)
 * - Unused function parameters (noUnusedParameters)
 * - Unused imports
 * - Unused type declarations
 * - Unused interface properties
 * - Unused function declarations
 * - Unused class members
 * - Unused enum members
 * - Unused type parameters (generics)
 *
 * Issue: workers-h39 "[RED] No unused declarations in strict mode"
 */

/**
 * Severity levels for unused declaration reports
 */
export enum Severity {
  Error = 'error',
  Warning = 'warning',
  Info = 'info',
}

/**
 * Types of unused declarations that can be detected
 */
export enum UnusedDeclarationType {
  Variable = 'Variable',
  Parameter = 'Parameter',
  Import = 'Import',
  Type = 'Type',
  Interface = 'Interface',
  Function = 'Function',
  Class = 'Class',
  ClassMember = 'ClassMember',
  Enum = 'Enum',
  TypeParameter = 'TypeParameter',
}

/**
 * Location information for an unused declaration
 */
export interface Location {
  line: number
  column: number
  endLine?: number
  endColumn?: number
}

/**
 * Fix suggestion for an unused declaration
 */
export interface Fix {
  type: 'remove' | 'rename'
  newName?: string
}

/**
 * Represents an unused declaration found during analysis
 */
export interface UnusedDeclaration {
  name: string
  type: UnusedDeclarationType
  location: Location
  filePath?: string
  fix?: Fix
  severity?: Severity
}

/**
 * Error encountered during analysis
 */
export interface AnalysisError {
  type: 'SyntaxError' | 'TypeError' | 'Unknown'
  message: string
  location?: Location
}

/**
 * Side-effect import information
 */
export interface SideEffectImport {
  path: string
  location: Location
}

/**
 * Unused export information
 */
export interface UnusedExport {
  name: string
  filePath: string
  location: Location
}

/**
 * Result of unused declarations analysis
 */
export interface AnalysisResult {
  unused: UnusedDeclaration[]
  errors: AnalysisError[]
  sideEffectImports?: SideEffectImport[]
  unusedExports?: UnusedExport[]
  applyFixes: () => string
}

/**
 * Severity configuration options
 */
export interface SeverityConfig {
  unusedVariables?: Severity
  unusedParameters?: Severity
  unusedTypes?: Severity
  unusedImports?: Severity
  unusedFunctions?: Severity
  unusedClasses?: Severity
}

/**
 * Options for analyzing unused declarations
 */
export interface AnalyzerOptions {
  /** Ignore declarations prefixed with underscore */
  ignoreUnderscorePrefix?: boolean
  /** Custom pattern to ignore declarations */
  ignorePattern?: RegExp
  /** Whether to check type declarations */
  checkTypes?: boolean
  /** Whether to check function parameters */
  checkParameters?: boolean
  /** Whether to check local variables */
  checkLocals?: boolean
  /** Whether to flag side-effect imports */
  flagSideEffectImports?: boolean
  /** Whether to check unused exports across files */
  checkUnusedExports?: boolean
  /** Enable JSX/TSX support */
  jsx?: boolean
  /** Continue analysis after encountering errors */
  continueOnError?: boolean
  /** Severity configuration */
  severity?: SeverityConfig
  /** Minimum severity to report */
  minSeverity?: Severity
  /** Enable incremental analysis */
  incremental?: boolean
  /** Path to tsconfig.json */
  tsconfigPath?: string
  /** Enable strict mode */
  strict?: boolean
}

/**
 * Effective configuration after merging options
 */
export interface EffectiveConfig {
  noUnusedLocals: boolean
  noUnusedParameters: boolean
}

/**
 * Analyzer class for multi-file analysis
 */
export class UnusedDeclarationAnalyzer {
  private files: Map<string, string> = new Map()
  private options: AnalyzerOptions

  constructor(options: AnalyzerOptions = {}) {
    this.options = options
  }

  /**
   * Add a file to the analyzer
   */
  addFile(filePath: string, content: string): void {
    this.files.set(filePath, content)
  }

  /**
   * Update a file in the analyzer (for incremental analysis)
   */
  updateFile(filePath: string, content: string): void {
    this.files.set(filePath, content)
  }

  /**
   * Analyze all added files for unused declarations
   */
  analyze(options?: Partial<AnalyzerOptions>): AnalysisResult {
    const mergedOptions = { ...this.options, ...options }

    // TODO: Implement actual analysis using TypeScript compiler API
    // This is a stub implementation
    const unused: UnusedDeclaration[] = []
    const errors: AnalysisError[] = []

    return {
      unused,
      errors,
      sideEffectImports: mergedOptions.flagSideEffectImports ? [] : undefined,
      unusedExports: mergedOptions.checkUnusedExports ? [] : undefined,
      applyFixes: () => '',
    }
  }

  /**
   * Get the severity for a declaration type
   */
  getSeverity(type: UnusedDeclarationType): Severity {
    const config = this.options.severity || {}

    switch (type) {
      case UnusedDeclarationType.Variable:
        return config.unusedVariables || Severity.Error
      case UnusedDeclarationType.Parameter:
        return config.unusedParameters || Severity.Warning
      case UnusedDeclarationType.Type:
      case UnusedDeclarationType.Interface:
        return config.unusedTypes || Severity.Warning
      case UnusedDeclarationType.Import:
        return config.unusedImports || Severity.Error
      case UnusedDeclarationType.Function:
        return config.unusedFunctions || Severity.Error
      case UnusedDeclarationType.Class:
        return config.unusedClasses || Severity.Error
      default:
        return Severity.Warning
    }
  }

  /**
   * Get the effective configuration after merging options and tsconfig
   */
  getEffectiveConfig(): EffectiveConfig {
    // TODO: Actually read from tsconfig if path is provided
    const strict = this.options.strict || false

    return {
      noUnusedLocals: strict || (this.options.checkLocals !== false),
      noUnusedParameters: strict || (this.options.checkParameters !== false),
    }
  }
}

/**
 * Analyze a single code string for unused declarations
 */
export function analyzeUnusedDeclarations(
  code: string,
  options: AnalyzerOptions = {}
): AnalysisResult {
  // TODO: Implement actual analysis using TypeScript compiler API
  // This is a stub implementation

  const unused: UnusedDeclaration[] = []
  const errors: AnalysisError[] = []

  // Check for syntax errors
  // TODO: Parse the code and detect syntax errors

  return {
    unused,
    errors,
    sideEffectImports: options.flagSideEffectImports ? [] : undefined,
    unusedExports: options.checkUnusedExports ? [] : undefined,
    applyFixes: () => code,
  }
}
