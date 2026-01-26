/**
 * esbuild.do - ESBuild as an RPC service
 *
 * Usage via do.do:
 *   await env.DO.esbuild.transform(code, { loader: 'ts' })
 *   await env.DO.esbuild.build({ entryPoints: ['index.ts'] })
 */

import * as esbuild from 'esbuild'
import { RPC } from '../../src/rpc-wrapper'

export default RPC(esbuild)
