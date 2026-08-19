import type { HonoWsInvocableEventContext } from '@moeru/eventa/adapters/websocket/hono'
import type { WSContext, WSEvents } from 'hono/ws'
import type Redis from 'ioredis'

import type { EngagementMetrics } from '../../../otel'
import type { ChatService } from '../../../services/domain/chats'
import type { ChatWsRuntime } from '../runtime'
import type { ChatWsAuthResolver } from './auth'

import { useLogger } from '@guiiai/logg'
import { defineInvokeHandler } from '@moeru/eventa'
import { createPeerHooks, wsDisconnectedEvent } from '@moeru/eventa/adapters/websocket/hono'
import { authenticate, newMessages } from '@proj-airi/server-sdk-shared/v2'

import { WS_CLOSE_TRY_AGAIN_LATER } from '../../../libs/ws-auth'
import { nanoid } from '../../../utils/id'
import { createChatWsRuntime } from '../runtime'
import { createChatWsV2Authentication } from './auth'
import { registerChatRpcHandlers } from './rpc'
import { createChatWsUnauthenticatedPeerLimit } from './unauthenticated-peers'

const log = useLogger('chat-ws').useGlobalConfig()
const MAX_UNAUTHENTICATED_CHAT_WS_CONNECTIONS = 100

interface ChatWsHandlerDependencies {
  chatService: ChatService
  runtime: ChatWsRuntime
  metrics?: EngagementMetrics | null
}

function registerAuthenticatedPeer(
  ctx: HonoWsInvocableEventContext,
  userId: string,
  deps: ChatWsHandlerDependencies,
): void {
  const connectionId = nanoid()
  deps.runtime.registry.add(userId, connectionId, (payload) => {
    void ctx.emit(newMessages, payload)
  })
  deps.runtime.broadcast.ensureSubscribed(userId)
  log.withFields({ userId }).log('WS connected')

  ctx.on(wsDisconnectedEvent, () => {
    deps.runtime.registry.remove(userId, connectionId)
    deps.runtime.broadcast.maybeUnsubscribe(userId)
    log.withFields({ userId }).log('WS disconnected')
  })

  registerChatRpcHandlers({
    ctx,
    connectionId,
    userId,
    chatService: deps.chatService,
    registry: deps.runtime.registry,
    broadcast: deps.runtime.broadcast,
    metrics: deps.metrics,
  })
}

/**
 * Creates version-two websocket handlers for chat sync RPC and message fanout.
 *
 * Use when:
 * - Mounting `/ws/v2/chat`, where the peer authenticates after the upgrade.
 *
 * Expects:
 * - `instanceId` is stable for this process so Redis echo suppression works.
 * - `resolveUserId` verifies the token sent through `chat:authenticate`.
 * - Redis Pub/Sub is used only for best-effort cross-instance notification.
 *
 * Returns:
 * - A per-user Hono websocket setup function.
 */
export function createChatWsV2Handlers(
  chatService: ChatService,
  redis: Redis,
  instanceId: string,
  resolveUserId: ChatWsAuthResolver,
  metrics?: EngagementMetrics | null,
  runtime?: ChatWsRuntime,
) {
  const chatRuntime = runtime ?? createChatWsRuntime(redis, instanceId, metrics)
  // The v2 upgrade is anonymous by design. Keep a bounded number of peers in
  // the authentication window so a burst cannot retain unbounded timers and
  // Eventa contexts in this process.
  const unauthenticatedPeers = createChatWsUnauthenticatedPeerLimit(MAX_UNAUTHENTICATED_CHAT_WS_CONNECTIONS)

  return function setupPeer() {
    let socket: WSContext | undefined
    let ownsUnauthenticatedSlot = false

    function releaseUnauthenticatedSlot(): void {
      if (!ownsUnauthenticatedSlot)
        return

      ownsUnauthenticatedSlot = false
      unauthenticatedPeers.release()
    }

    const { hooks } = createPeerHooks({
      onContext: (ctx) => {
        const authentication = createChatWsV2Authentication({
          socket,
          resolveUserId,
          onAuthenticated(userId) {
            releaseUnauthenticatedSlot()
            registerAuthenticatedPeer(ctx, userId, { chatService, runtime: chatRuntime, metrics })
          },
        })
        const unregisterAuthenticate = defineInvokeHandler(ctx, authenticate, authentication.authenticate)

        ctx.on(wsDisconnectedEvent, () => {
          authentication.disconnect()
          unregisterAuthenticate()
        })
      },
    })

    const originalOnOpen = hooks.onOpen
    const originalOnClose = hooks.onClose
    const originalOnError = hooks.onError
    const v2Hooks: WSEvents = {
      ...hooks,
      onOpen(event, ws) {
        if (!unauthenticatedPeers.tryAcquire()) {
          ws.close(WS_CLOSE_TRY_AGAIN_LATER, 'too many unauthenticated connections')
          return
        }

        ownsUnauthenticatedSlot = true
        socket = ws
        originalOnOpen?.(event, ws)
      },
      onClose(event, ws) {
        releaseUnauthenticatedSlot()
        originalOnClose?.(event, ws)
      },
      onError(event, ws) {
        releaseUnauthenticatedSlot()
        originalOnError?.(event, ws)
      },
    }
    return v2Hooks
  }
}
