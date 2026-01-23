/**
 * Double-Entry Accounting Journal
 *
 * Provides full double-entry bookkeeping:
 * - Chart of accounts management
 * - Journal entry creation and posting
 * - Account balance calculations
 * - Trial balance verification
 *
 * @module financial/accounting
 */

import type {
  ChartOfAccount,
  AccountCategory,
  JournalEntry,
  JournalLine,
  AccountBalance,
} from '../../../types/financial'

/**
 * Configuration for accounting journal
 */
export interface AccountingJournalConfig {
  /** Default currency */
  defaultCurrency?: string
  /** Fiscal year start month (1-12) */
  fiscalYearStartMonth?: number
  /** Require approval for journal entries */
  requireApproval?: boolean
}

/**
 * Options for creating a chart of accounts entry
 */
export interface CreateAccountOptions {
  /** Account code (e.g., 1000, 1100) */
  code: string
  /** Account name */
  name: string
  /** Account category */
  category: AccountCategory
  /** Parent account ID for hierarchy */
  parentId?: string
  /** Description */
  description?: string
  /** Normal balance side */
  normalBalance?: 'debit' | 'credit'
}

/**
 * Options for creating a journal entry
 */
export interface CreateJournalEntryOptions {
  /** Entry date (timestamp) */
  date: number
  /** Description/memo */
  description: string
  /** Reference type */
  referenceType?: JournalEntry['referenceType']
  /** Reference ID */
  referenceId?: string
  /** Journal lines (must balance) */
  lines: JournalLine[]
  /** Entry status */
  status?: 'draft' | 'posted'
  /** Created by user ID */
  createdBy?: string
}

/**
 * Options for listing journal entries
 */
export interface ListJournalEntriesOptions {
  /** Account ID filter */
  accountId?: string
  /** Reference type filter */
  referenceType?: JournalEntry['referenceType']
  /** Status filter */
  status?: JournalEntry['status']
  /** Date range start */
  dateFrom?: number
  /** Date range end */
  dateTo?: number
  /** Limit */
  limit?: number
  /** Offset for pagination */
  offset?: number
}

/**
 * Trial balance entry
 */
export interface TrialBalanceEntry {
  accountId: string
  accountCode: string
  accountName: string
  category: AccountCategory
  debit: number
  credit: number
}

/**
 * Double-entry accounting journal for Digital Objects
 *
 * Manages chart of accounts, journal entries, and account balances
 * following generally accepted accounting principles (GAAP).
 *
 * @example
 * ```typescript
 * const journal = new AccountingJournal()
 *
 * // Setup chart of accounts
 * await journal.createAccount({
 *   code: '1000',
 *   name: 'Cash',
 *   category: 'asset'
 * })
 *
 * // Create and post a journal entry
 * const entry = await journal.createEntry({
 *   date: Date.now(),
 *   description: 'Customer payment received',
 *   lines: [
 *     { accountId: '1000', debit: 1000 },
 *     { accountId: '4000', credit: 1000 }
 *   ]
 * })
 * await journal.postEntry(entry.id)
 * ```
 */
export class AccountingJournal {
  private readonly config: AccountingJournalConfig

  /**
   * Create a new AccountingJournal instance
   *
   * @param config - Accounting journal configuration
   */
  constructor(config: AccountingJournalConfig = {}) {
    this.config = config
  }

  // =========================================================================
  // Chart of Accounts
  // =========================================================================

  /**
   * Create a new account in the chart of accounts
   *
   * @param options - Account options
   * @returns The created account
   *
   * @example
   * ```typescript
   * // Create asset account
   * await journal.createAccount({
   *   code: '1200',
   *   name: 'Accounts Receivable',
   *   category: 'asset',
   *   description: 'Money owed by customers'
   * })
   *
   * // Create sub-account
   * await journal.createAccount({
   *   code: '1210',
   *   name: 'AR - Trade',
   *   category: 'asset',
   *   parentId: '1200'
   * })
   * ```
   */
  async createAccount(options: CreateAccountOptions): Promise<ChartOfAccount> {
    // TODO: Implement account creation
    throw new Error('Not implemented')
  }

  /**
   * Retrieve an account by ID
   *
   * @param accountId - The account ID
   * @returns The account or null if not found
   */
  async getAccount(accountId: string): Promise<ChartOfAccount | null> {
    // TODO: Implement account retrieval
    throw new Error('Not implemented')
  }

  /**
   * Retrieve an account by code
   *
   * @param code - The account code
   * @returns The account or null if not found
   */
  async getAccountByCode(code: string): Promise<ChartOfAccount | null> {
    // TODO: Implement account retrieval by code
    throw new Error('Not implemented')
  }

  /**
   * Update an account
   *
   * @param accountId - The account ID
   * @param updates - Fields to update
   * @returns The updated account
   */
  async updateAccount(
    accountId: string,
    updates: Partial<Omit<CreateAccountOptions, 'code'>>
  ): Promise<ChartOfAccount> {
    // TODO: Implement account update
    throw new Error('Not implemented')
  }

  /**
   * Deactivate an account
   *
   * Accounts cannot be deleted if they have journal entries.
   * This soft-deletes by setting isActive to false.
   *
   * @param accountId - The account ID
   */
  async deactivateAccount(accountId: string): Promise<void> {
    // TODO: Implement account deactivation
    throw new Error('Not implemented')
  }

  /**
   * List all accounts
   *
   * @param options - Filter options
   * @returns List of accounts
   */
  async listAccounts(options?: {
    category?: AccountCategory
    parentId?: string
    activeOnly?: boolean
  }): Promise<ChartOfAccount[]> {
    // TODO: Implement account listing
    throw new Error('Not implemented')
  }

  /**
   * Get account hierarchy
   *
   * Returns accounts organized in a tree structure based on parentId.
   *
   * @returns Account hierarchy
   */
  async getAccountHierarchy(): Promise<Array<ChartOfAccount & { children: ChartOfAccount[] }>> {
    // TODO: Implement hierarchy retrieval
    throw new Error('Not implemented')
  }

  /**
   * Initialize standard chart of accounts
   *
   * Creates a default chart of accounts following GAAP structure.
   */
  async initializeStandardAccounts(): Promise<void> {
    // TODO: Implement standard account initialization
    throw new Error('Not implemented')
  }

  // =========================================================================
  // Journal Entries
  // =========================================================================

  /**
   * Create a new journal entry
   *
   * The entry must balance (total debits = total credits).
   *
   * @param options - Journal entry options
   * @returns The created journal entry
   *
   * @example
   * ```typescript
   * // Payment received with processing fee
   * await journal.createEntry({
   *   date: Date.now(),
   *   description: 'Customer payment - Invoice #1234',
   *   referenceType: 'payment',
   *   referenceId: 'pi_xxx',
   *   lines: [
   *     { accountId: '1200', debit: 970 },   // Stripe Balance
   *     { accountId: '5000', debit: 30 },    // Processing Fees
   *     { accountId: '4000', credit: 1000 }  // Revenue
   *   ]
   * })
   * ```
   */
  async createEntry(options: CreateJournalEntryOptions): Promise<JournalEntry> {
    // TODO: Implement entry creation with balance validation
    throw new Error('Not implemented')
  }

  /**
   * Retrieve a journal entry by ID
   *
   * @param entryId - The journal entry ID
   * @returns The entry or null if not found
   */
  async getEntry(entryId: string): Promise<JournalEntry | null> {
    // TODO: Implement entry retrieval
    throw new Error('Not implemented')
  }

  /**
   * Update a draft journal entry
   *
   * Posted entries cannot be updated; they must be voided and re-created.
   *
   * @param entryId - The journal entry ID
   * @param updates - Fields to update
   * @returns The updated entry
   */
  async updateEntry(
    entryId: string,
    updates: Partial<Omit<CreateJournalEntryOptions, 'status'>>
  ): Promise<JournalEntry> {
    // TODO: Implement entry update
    throw new Error('Not implemented')
  }

  /**
   * Post a journal entry
   *
   * Posted entries affect account balances and cannot be modified.
   *
   * @param entryId - The journal entry ID
   * @returns The posted entry
   */
  async postEntry(entryId: string): Promise<JournalEntry> {
    // TODO: Implement entry posting
    throw new Error('Not implemented')
  }

  /**
   * Void a posted journal entry
   *
   * Creates a reversing entry to offset the original.
   *
   * @param entryId - The journal entry ID
   * @param reason - Reason for voiding
   * @returns The voided entry
   */
  async voidEntry(entryId: string, reason?: string): Promise<JournalEntry> {
    // TODO: Implement entry voiding
    throw new Error('Not implemented')
  }

  /**
   * Delete a draft journal entry
   *
   * @param entryId - The journal entry ID
   */
  async deleteEntry(entryId: string): Promise<void> {
    // TODO: Implement entry deletion
    throw new Error('Not implemented')
  }

  /**
   * List journal entries
   *
   * @param options - Filter and pagination options
   * @returns List of journal entries
   */
  async listEntries(options?: ListJournalEntriesOptions): Promise<JournalEntry[]> {
    // TODO: Implement entry listing
    throw new Error('Not implemented')
  }

  /**
   * Get entries for a specific account
   *
   * @param accountId - The account ID
   * @param options - Filter options
   * @returns List of journal entries affecting this account
   */
  async getEntriesForAccount(
    accountId: string,
    options?: {
      dateFrom?: number
      dateTo?: number
      limit?: number
    }
  ): Promise<JournalEntry[]> {
    // TODO: Implement account-specific entry listing
    throw new Error('Not implemented')
  }

  // =========================================================================
  // Account Balances
  // =========================================================================

  /**
   * Get the balance for an account
   *
   * @param accountId - The account ID
   * @param asOf - Point-in-time balance (defaults to now)
   * @returns The account balance
   *
   * @example
   * ```typescript
   * // Current balance
   * const balance = await journal.getBalance('1000')
   *
   * // Balance at end of last month
   * const endOfMonth = new Date(2024, 0, 31).getTime()
   * const balance = await journal.getBalance('1000', endOfMonth)
   * ```
   */
  async getBalance(accountId: string, asOf?: number): Promise<AccountBalance> {
    // TODO: Implement balance calculation
    throw new Error('Not implemented')
  }

  /**
   * Get balances for multiple accounts
   *
   * @param accountIds - List of account IDs
   * @param asOf - Point-in-time balance (defaults to now)
   * @returns Map of account ID to balance
   */
  async getBalances(
    accountIds: string[],
    asOf?: number
  ): Promise<Map<string, AccountBalance>> {
    // TODO: Implement bulk balance calculation
    throw new Error('Not implemented')
  }

  /**
   * Get all account balances by category
   *
   * @param category - Account category
   * @param asOf - Point-in-time balance (defaults to now)
   * @returns List of account balances
   */
  async getBalancesByCategory(
    category: AccountCategory,
    asOf?: number
  ): Promise<AccountBalance[]> {
    // TODO: Implement category balance calculation
    throw new Error('Not implemented')
  }

  /**
   * Generate a trial balance
   *
   * Lists all accounts with their debit and credit balances.
   * Total debits should equal total credits.
   *
   * @param asOf - Point-in-time balance (defaults to now)
   * @returns Trial balance entries
   */
  async getTrialBalance(asOf?: number): Promise<TrialBalanceEntry[]> {
    // TODO: Implement trial balance generation
    throw new Error('Not implemented')
  }

  /**
   * Verify that the books balance
   *
   * @param asOf - Point-in-time (defaults to now)
   * @returns True if debits equal credits
   */
  async verifyBalance(asOf?: number): Promise<boolean> {
    // TODO: Implement balance verification
    throw new Error('Not implemented')
  }

  // =========================================================================
  // Utility Methods
  // =========================================================================

  /**
   * Validate that a journal entry balances
   *
   * @param lines - Journal entry lines
   * @returns True if debits equal credits
   */
  validateEntryBalance(lines: JournalLine[]): boolean {
    const totalDebits = lines.reduce((sum, line) => sum + (line.debit || 0), 0)
    const totalCredits = lines.reduce((sum, line) => sum + (line.credit || 0), 0)
    return totalDebits === totalCredits
  }

  /**
   * Get the normal balance side for an account category
   *
   * @param category - Account category
   * @returns The normal balance side
   */
  getNormalBalance(category: AccountCategory): 'debit' | 'credit' {
    switch (category) {
      case 'Asset':
      case 'Expense':
        return 'debit'
      case 'Liability':
      case 'Equity':
      case 'Revenue':
        return 'credit'
      default:
        return 'debit'
    }
  }

  /**
   * Create a journal entry from a payment
   *
   * Automatically generates the appropriate accounting entries
   * for a payment received.
   *
   * @param payment - Payment details
   * @returns The created journal entry
   */
  async createEntryFromPayment(payment: {
    id: string
    amount: number
    processingFee?: number
    description?: string
  }): Promise<JournalEntry> {
    const lines: JournalLine[] = []
    const netAmount = payment.amount - (payment.processingFee || 0)

    // Debit: Stripe Balance (asset)
    lines.push({ accountId: '1200', debit: netAmount })

    // Debit: Processing Fees (expense) if applicable
    if (payment.processingFee) {
      lines.push({ accountId: '5000', debit: payment.processingFee })
    }

    // Credit: Revenue
    lines.push({ accountId: '4000', credit: payment.amount })

    return this.createEntry({
      date: Date.now(),
      description: payment.description || `Payment received: ${payment.id}`,
      referenceType: 'Payment',
      referenceId: payment.id,
      lines,
    })
  }

  /**
   * Create a journal entry from a refund
   *
   * @param refund - Refund details
   * @returns The created journal entry
   */
  async createEntryFromRefund(refund: {
    id: string
    amount: number
    originalPaymentId: string
    description?: string
  }): Promise<JournalEntry> {
    return this.createEntry({
      date: Date.now(),
      description: refund.description || `Refund: ${refund.id}`,
      referenceType: 'Payment',
      referenceId: refund.id,
      lines: [
        { accountId: '4000', debit: refund.amount },   // Debit: Revenue (reduction)
        { accountId: '1200', credit: refund.amount },  // Credit: Stripe Balance
      ],
    })
  }

  /**
   * Create a journal entry from a transfer
   *
   * @param transfer - Transfer details
   * @returns The created journal entry
   */
  async createEntryFromTransfer(transfer: {
    id: string
    amount: number
    destinationAccountId: string
    description?: string
  }): Promise<JournalEntry> {
    return this.createEntry({
      date: Date.now(),
      description: transfer.description || `Transfer: ${transfer.id}`,
      referenceType: 'Transfer',
      referenceId: transfer.id,
      lines: [
        { accountId: '2100', debit: transfer.amount },  // Debit: Payable to connected account
        { accountId: '1200', credit: transfer.amount }, // Credit: Stripe Balance
      ],
    })
  }

  /**
   * Create a journal entry from a payout
   *
   * @param payout - Payout details
   * @returns The created journal entry
   */
  async createEntryFromPayout(payout: {
    id: string
    amount: number
    bankAccountId: string
    description?: string
  }): Promise<JournalEntry> {
    return this.createEntry({
      date: Date.now(),
      description: payout.description || `Payout: ${payout.id}`,
      referenceType: 'Payout',
      referenceId: payout.id,
      lines: [
        { accountId: '1000', debit: payout.amount },   // Debit: Bank Account
        { accountId: '1200', credit: payout.amount },  // Credit: Stripe Balance
      ],
    })
  }
}

/**
 * Accounting error codes
 */
export const AccountingErrorCodes = {
  ACCOUNT_NOT_FOUND: 'ACCOUNT_NOT_FOUND',
  ACCOUNT_CODE_EXISTS: 'ACCOUNT_CODE_EXISTS',
  ENTRY_NOT_FOUND: 'ENTRY_NOT_FOUND',
  ENTRY_UNBALANCED: 'ENTRY_UNBALANCED',
  ENTRY_ALREADY_POSTED: 'ENTRY_ALREADY_POSTED',
  ENTRY_CANNOT_VOID: 'ENTRY_CANNOT_VOID',
  ACCOUNT_HAS_ENTRIES: 'ACCOUNT_HAS_ENTRIES',
  INVALID_ACCOUNT_CODE: 'INVALID_ACCOUNT_CODE',
} as const

export type AccountingErrorCode = typeof AccountingErrorCodes[keyof typeof AccountingErrorCodes]

/**
 * Accounting error
 */
export class AccountingError extends Error {
  constructor(
    public readonly code: AccountingErrorCode,
    message: string,
    public readonly details?: unknown
  ) {
    super(message)
    this.name = 'AccountingError'
  }
}
