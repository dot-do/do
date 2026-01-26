/**
 * stripe.do - Stripe as an RPC service
 *
 * Usage via do.do:
 *   await env.DO.stripe.customers.create({ email })
 *   await env.DO.stripe.subscriptions.list({ customer })
 *   await env.DO.stripe.paymentIntents.create({ amount, currency })
 */

import Stripe from 'stripe'
import { RPC } from '../../src/rpc-wrapper'

interface Env {
  STRIPE_SECRET_KEY: string
}

// RPC() can take a factory function that receives env
export default RPC((env: Env) => {
  return new Stripe(env.STRIPE_SECRET_KEY, {
    apiVersion: '2024-12-18.acacia'
  })
})
