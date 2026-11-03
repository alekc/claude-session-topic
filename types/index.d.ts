export type Topic = {
  title: string
  detail: string
  isPinned: boolean
  updatedAt: number
}

declare module 'claude-code' {
  interface PluginState {
    'session-topic': {
      topic: Shaped<Topic | null>
      recent: string[]
      // Opening of Claude's last main-loop reply, so Haiku sees what happened.
      reply: string | null
      // null follows the `enabled` option; /topic on|off sets it per session.
      enabled: boolean | null
      // null follows the `view` option; /topic pane|band sets it per session.
      mode: 'band' | 'pane' | null
    }
  }
}
