import type { HonoWsInvocableEventContext } from '@moeru/eventa/adapters/websocket/hono'
import type { WSContext, WSEvents } from 'hono/ws'
import type Redis from 'ioredis'

import type { EngagementMetrics } from '../../../otel'
import type { ChatService } from '../../../services/domain/chats'
import type { ChatWsRuntime } from '../runtime'

import { useLogger } from '@guiiai/logg'
import { defineInvokeHandler } from '@moeru/eventa'
import { createPeerHooks, wsDisconnectedEvent } from '@moeru/eventa/adapters/websocket/hono'
import { authenticate, newMessages } from '@proj-airi/server-sdk-shared/v2'

import * as v from 'valibot'

import { WS_CLOSE_UNAUTHORIZED } from '../../../libs/ws-auth'
import { nanoid } from '../../../utils/id'
import { createChatWsRuntime } from '../runtime'
import { registerChatRpcHandlers } from './rpc'

const log = useLogger('chat-ws').useGlobalConfig()
const chatAuthenticateRequestSchema = v.object({
  token: v.pipe(v.string(), v.minLength(1)),
})
const CHAT_AUTH_TIMEOUT_MS = 15_000

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

export interface ChatWsAuthResolver {
  (token: string): Promise<string | null>
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

  return function setupPeer() {
    let socket: WSContext | undefined
    let authTimer: ReturnType<typeof setTimeout> | undefined

    const { hooks } = createPeerHooks({
      onContext: (ctx) => {
        let userId: string | undefined
        const unregisterAuthenticate = defineInvokeHandler(ctx, authenticate, async (request) => {
          const parsed = v.safeParse(chatAuthenticateRequestSchema, request)
          if (!parsed.success) {
            socket?.close(WS_CLOSE_UNAUTHORIZED, 'unauthorized')
            throw new Error('WebSocket authentication failed')
          }

          const resolvedUserId = await resolveUserId(parsed.output.token)
          if (!resolvedUserId) {
            socket?.close(WS_CLOSE_UNAUTHORIZED, 'unauthorized')
            throw new Error('WebSocket authentication failed')
          }

          if (userId)
            return { userId }

          userId = resolvedUserId
          if (authTimer)
            clearTimeout(authTimer)
          registerAuthenticatedPeer(ctx, userId, { chatService, runtime: chatRuntime, metrics })
          return { userId }
        })

        authTimer = setTimeout(() => {
          if (!userId)
            socket?.close(WS_CLOSE_UNAUTHORIZED, 'unauthorized')
        }, CHAT_AUTH_TIMEOUT_MS)

        ctx.on(wsDisconnectedEvent, () => {
          if (authTimer)
            clearTimeout(authTimer)
          unregisterAuthenticate()
        })
      },
    })

    const originalOnOpen = hooks.onOpen
    const v2Hooks: WSEvents = {
      ...hooks,
      onOpen(event, ws) {
        socket = ws
        originalOnOpen?.(event, ws)
      },
    }
    return v2Hooks
  }
}
