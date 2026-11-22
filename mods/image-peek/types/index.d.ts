declare module 'claude-code' {
  interface PluginState {
    'image-peek': {
      /** The [Image #N] numbers the prompt box holds right now. */
      draft: number[]
      isHidden: boolean
      /** The image number the side pane shows. */
      viewing: number | null
    }
  }
}

export type ImagePeekVersion = 2
