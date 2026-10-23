import { PLANS, type Plan } from '@repo/shared/schemas';

// Every user is on the free plan until plans are stored; the one place a lookup goes.
export function planFor(_userId: string): Plan {
  return PLANS.free;
}
