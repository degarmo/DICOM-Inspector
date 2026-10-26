import type { InspectorApi } from '../../shared/api'

declare global {
  interface Window {
    inspector: InspectorApi
  }
}
