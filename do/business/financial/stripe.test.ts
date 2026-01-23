/**
 * Stripe Connect Integration Tests
 *
 * @module financial/__tests__/stripe
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  StripeConnect,
  StripeConnectError,
  StripeConnectErrorCodes,
} from './stripe'

describe('StripeConnect', () => {
  let stripeConnect: StripeConnect

  beforeEach(() => {
    stripeConnect = new StripeConnect({
      secretKey: 'sk_test_xxx',
    })
  })

  describe('createAccount', () => {
    it.todo('should create an express account')
    it.todo('should create a standard account')
    it.todo('should create a custom account')
    it.todo('should include business profile')
    it.todo('should request specified capabilities')
    it.todo('should handle API errors')
  })

  describe('getAccount', () => {
    it.todo('should retrieve an existing account')
    it.todo('should return null for non-existent account')
  })

  describe('updateAccount', () => {
    it.todo('should update business profile')
    it.todo('should update metadata')
    it.todo('should handle validation errors')
  })

  describe('deleteAccount', () => {
    it.todo('should delete an account')
    it.todo('should handle deletion errors')
  })

  describe('createAccountLink', () => {
    it.todo('should create an onboarding link')
    it.todo('should create an update link')
    it.todo('should include return and refresh URLs')
    it.todo('should handle invalid account ID')
  })

  describe('createLoginLink', () => {
    it.todo('should create a login link for express account')
    it.todo('should reject for standard accounts')
  })

  describe('getCapabilities', () => {
    it.todo('should return current capabilities')
    it.todo('should include capability status')
  })

  describe('requestCapabilities', () => {
    it.todo('should request new capabilities')
    it.todo('should handle already-requested capabilities')
  })

  describe('addBankAccount', () => {
    it.todo('should add a bank account')
    it.todo('should validate bank account token')
    it.todo('should handle invalid token')
  })

  describe('listBankAccounts', () => {
    it.todo('should list all bank accounts')
    it.todo('should return empty array for no accounts')
  })

  describe('setDefaultBankAccount', () => {
    it.todo('should set default bank account')
    it.todo('should handle invalid bank account ID')
  })

  describe('deleteBankAccount', () => {
    it.todo('should delete a bank account')
    it.todo('should prevent deleting default if only one')
  })

  describe('handleWebhook', () => {
    it.todo('should validate webhook signature')
    it.todo('should process account.updated event')
    it.todo('should process account.application.authorized event')
    it.todo('should process account.application.deauthorized event')
    it.todo('should reject invalid signatures')
  })

  describe('isReadyForCharges', () => {
    it.todo('should return true when charges enabled')
    it.todo('should return false when charges not enabled')
    it.todo('should check card_payments capability')
  })

  describe('isReadyForPayouts', () => {
    it.todo('should return true when payouts enabled')
    it.todo('should return false when payouts not enabled')
    it.todo('should check transfers capability')
  })
})

describe('StripeConnectError', () => {
  it('should create error with code and message', () => {
    const error = new StripeConnectError(
      StripeConnectErrorCodes.ACCOUNT_NOT_FOUND,
      'Account not found'
    )
    expect(error.code).toBe('ACCOUNT_NOT_FOUND')
    expect(error.message).toBe('Account not found')
    expect(error.name).toBe('StripeConnectError')
  })

  it('should include details when provided', () => {
    const error = new StripeConnectError(
      StripeConnectErrorCodes.WEBHOOK_SIGNATURE_INVALID,
      'Invalid signature',
      { header: 'xxx' }
    )
    expect(error.details).toEqual({ header: 'xxx' })
  })
})
