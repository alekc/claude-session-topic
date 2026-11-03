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
      // null follows the `enabled` option; /topic on|off sets it per session.
      enabled: boolean | null
      mode: 'band' | 'pane'
    }
  }
}
