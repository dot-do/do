/**
 * DO Modules Index
 *
 * Exports all DO operation modules for modular use:
 * - CRUD operations (get, list, create, update, delete)
 * - Thing operations (createThing, getThing, etc.)
 * - Event operations (track, getEvent, queryEvents)
 * - Action operations (send, doAction, tryAction, etc.)
 * - Relationship operations (relate, unrelate, related, etc.)
 * - Artifact operations (storeArtifact, getArtifact, etc.)
 * - Workflow operations (getWorkflowState, saveWorkflowState, etc.)
 * - Auth operations (getAuthContext, setAuthContext, etc.)
 * - WebSocket operations (webSocketMessage, webSocketClose, etc.)
 * - Router operations (createRouter, handleRequest)
 * - MCP Tools (search, fetch, do)
 */

// Types
export * from './types'

// CRUD Operations
export * as crud from './crud'
export { get, list, create, update, del } from './crud'

// Thing Operations
export * as things from './things'
export {
  generateThingUrl,
  parseThingUrl,
  createThing,
  getThing,
  getThingById,
  setThing,
  deleteThing,
  listThings,
  findThings,
  updateThing,
  upsertThing,
  createThingNamespace,
} from './things'

// Event Operations
export * as events from './events'
export { track, getEvent, queryEvents } from './events'

// Action Operations
export * as actions from './actions'
export {
  send,
  doAction,
  tryAction,
  getAction,
  queryActions,
  startAction,
  completeAction,
  failAction,
  cancelAction,
  retryAction,
  getNextRetryDelay,
  resetAction,
} from './actions'

// Relationship Operations
export * as relationships from './relationships'
export {
  relate,
  unrelate,
  related,
  relationships as getRelationships,
  references,
} from './relationships'

// Artifact Operations
export * as artifacts from './artifacts'
export {
  storeArtifact,
  getArtifact,
  getArtifactBySource,
  deleteArtifact,
  cleanExpiredArtifacts,
} from './artifacts'

// Workflow Operations
export * as workflow from './workflow'
export {
  getWorkflowState,
  saveWorkflowState,
  registerWorkflowHandler,
  getWorkflowHandlers,
  registerSchedule,
  getSchedules,
  createWorkflowContext,
} from './workflow'

// Auth Operations
export * as auth from './auth'
export {
  getAuthContext,
  setAuthContext,
  checkPermission,
  requirePermission,
  getAuthMetadata,
  getWebSocketAuth,
  setWebSocketAuth,
  extractAuthFromRequest,
  extractAuthFromUrl,
} from './auth'

// WebSocket Operations
export * as websocket from './websocket'
export {
  webSocketMessage,
  webSocketClose,
  webSocketError,
  registerConnection,
  getConnectionMetadata,
  updateConnectionMetadata,
  getActiveConnections,
  getConnectionCount,
  findConnectionsByMetadata,
  broadcast,
  destroyAllConnections,
  on,
  off,
  emit,
} from './websocket'

// Router Operations
export * as router from './router'
export { createRouter, handleRequest } from './router'

// MCP Tools
export * as mcpTools from './mcp-tools'
// Re-export with friendlier names
export { search } from './mcp-tools'
export { fetchUrl } from './mcp-tools'
export { doCode } from './mcp-tools'
