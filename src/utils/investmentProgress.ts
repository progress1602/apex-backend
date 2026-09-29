import { InvestmentModel } from '../models';

export interface CalculatedProgressResult {
  progress: number;
  status: 'active' | 'completed' | 'settled';
  isMatured: boolean;
}

/**
 * Dynamically calculates investment progress according to elapsed time between startDate and maturityDate.
 *
 * Curve behavior:
 * - Settled: 100%
 * - Reached/exceeded maturityDate: 100% and status becomes 'completed'
 * - Active: Smoothly scales with time elapsed, providing visible progression right after creation
 *   and advancing up to 100% at maturity.
 * - Monotonic: Never decreases below previously recorded progress.
 */
export function calculateInvestmentProgress(inv: {
  status: string;
  startDate: Date | string;
  maturityDate: Date | string;
  progress?: number;
}): CalculatedProgressResult {
  if (inv.status === 'settled') {
    return { progress: 100, status: 'settled', isMatured: true };
  }

  const startMs = new Date(inv.startDate).getTime();
  const maturityMs = new Date(inv.maturityDate).getTime();
  const nowMs = Date.now();

  if (isNaN(startMs) || isNaN(maturityMs)) {
    return {
      progress: Number(inv.progress || 0),
      status: (inv.status as any) || 'active',
      isMatured: false,
    };
  }

  const totalDurationMs = maturityMs - startMs;

  // If already at or past maturity date
  if (totalDurationMs <= 0 || nowMs >= maturityMs) {
    return {
      progress: 100,
      status: inv.status === 'settled' ? 'settled' : 'completed',
      isMatured: true,
    };
  }

  const elapsedMs = Math.max(0, nowMs - startMs);
  if (elapsedMs <= 0) {
    return {
      progress: Math.max(0, Number(inv.progress || 0)),
      status: 'active',
      isMatured: false,
    };
  }

  // Ratio between 0 and 1
  const ratio = Math.min(1, Math.max(0, elapsedMs / totalDurationMs));

  // Time-scaled smooth power curve combined with linear ratio
  // Ensures visible progression in the Liquidity Growth Matrix UI while tracking true elapsed time
  const powerProgress = Math.pow(ratio, 0.35) * 100;
  const linearProgress = ratio * 100;
  const rawProgress = Math.max(linearProgress, powerProgress);

  // Clamped up to 99.9% while active (100% only upon maturity/settlement)
  const dynamicProgress = Math.min(99.9, Number(rawProgress.toFixed(2)));

  // Monotonic: preserve any higher progress already saved
  const finalProgress = Math.max(Number(inv.progress || 0), dynamicProgress);

  return {
    progress: Number(finalProgress.toFixed(2)),
    status: 'active',
    isMatured: false,
  };
}

/**
 * Synchronizes investment progress in-memory and asynchronously updates MongoDB if progress has advanced.
 */
export function syncInvestmentProgress(inv: any): CalculatedProgressResult {
  const computed = calculateInvestmentProgress(inv);
  const currentProg = Number(inv.progress || 0);

  const needsUpdate =
    Math.abs(currentProg - computed.progress) >= 0.01 ||
    (computed.status === 'completed' && inv.status === 'active');

  if (needsUpdate) {
    inv.progress = computed.progress;
    if (computed.status === 'completed' && inv.status === 'active') {
      inv.status = 'completed';
    }
    const invId = inv.investmentId || inv.id;
    if (invId) {
      InvestmentModel.updateOne(
        { investmentId: invId },
        { $set: { progress: computed.progress, status: inv.status } }
      ).catch(() => {});
    }
  }

  return computed;
}

/**
 * Standard investment response formatter with dynamic time-based progress calculation.
 */
export function formatInvestmentResponse(inv: any) {
  const computed = syncInvestmentProgress(inv);
  const startDateObj = inv.startDate instanceof Date ? inv.startDate : new Date(inv.startDate);
  const maturityDateObj = inv.maturityDate instanceof Date ? inv.maturityDate : new Date(inv.maturityDate);

  return {
    id: inv.investmentId || inv.id,
    planId: inv.planId || 'starter',
    planName: inv.planName,
    amount: inv.amount,
    roi: inv.roi,
    progress: computed.progress,
    projectedReturn: inv.projectedReturn,
    status: inv.status,
    startDate: isNaN(startDateObj.getTime()) ? new Date().toISOString() : startDateObj.toISOString(),
    maturityDate: isNaN(maturityDateObj.getTime()) ? new Date().toISOString() : maturityDateObj.toISOString(),
  };
}
