/**
 * Adapter interface — shared by all source adapters.
 * Separated to avoid circular dependencies.
 */
import type { RawMention, SourceKey } from '@/lib/types'

export interface Adapter {
  source: SourceKey
  fetch(): Promise<RawMention[]>
}
