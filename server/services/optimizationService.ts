export interface OptimizationInputs {
  currentStock: number;
  avgDailyDemand: number;
  demandStdDev: number;
  leadTimeDays: number;
  leadTimeStdDevDays?: number;
  serviceLevelPct: number; // e.g., 95
  unitCost: number;
  orderingCost: number; // S per order in INR
  holdingCostRate: number; // annual fraction e.g., 0.20 (20%)
  minOrderQuantity: number;
  maxStock?: number;
  pendingIncomingQty?: number;
}

export interface OptimizationOutput {
  zScore: number;
  serviceLevelPct: number;
  annualDemand: number;
  annualHoldingCostPerUnit: number;
  safetyStock: number;
  reorderPoint: number;
  eoq: number;
  recommendedOrderQty: number;
  averageInventory: number;
  estimatedAnnualHoldingCost: number;
  estimatedAnnualOrderingCost: number;
  totalAnnualInventoryCost: number;
  estimatedOrderCost: number;
  stockoutRiskPct: number;
  daysOfCover: number | null;
  needsReorder: boolean;
  urgency: 'Critical' | 'High' | 'Medium' | 'Low';
  formulaBreakdown: {
    safetyStockFormula: string;
    reorderPointFormula: string;
    eoqFormula: string;
    inputs: OptimizationInputs;
  };
}

/**
 * Acklam's inverse normal CDF approximation for Z-score from service level p in (0, 1).
 */
export function getZScoreForServiceLevel(serviceLevelPct: number): number {
  const clamped = Math.min(99.9, Math.max(50.1, serviceLevelPct));
  const p = clamped / 100;

  if (Math.abs(clamped - 90) < 0.01) return 1.2816;
  if (Math.abs(clamped - 95) < 0.01) return 1.6449;
  if (Math.abs(clamped - 98) < 0.01) return 2.0537;
  if (Math.abs(clamped - 99) < 0.01) return 2.3263;

  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
    1.38357751867269e2, -3.066479806614716e1, 2.506628277459239,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
    6.680131188771972e1, -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
    -2.549732539343734, 4.374664141464968, 2.938163982698783,
  ];
  const d = [
    7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416,
  ];

  const pLow = 0.02425;
  const pHigh = 1 - pLow;

  let z = 0;
  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p));
    z =
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= pHigh) {
    const q = p - 0.5;
    const r = q * q;
    z =
      ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    z =
      -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  return Number(z.toFixed(4));
}

function normalCDF(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp((-x * x) / 2);
  const p =
    d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

export function calculateInventoryOptimization(inputs: OptimizationInputs): OptimizationOutput {
  const currentStock = Math.max(0, Number(inputs.currentStock) || 0);
  const avgDailyDemand = Math.max(0, Number(inputs.avgDailyDemand) || 0);
  const demandStdDev = Math.max(0, Number(inputs.demandStdDev) || 0);
  const leadTimeDays = Math.max(1, Number(inputs.leadTimeDays) || 1);
  const leadTimeStdDevDays = Math.max(0, Number(inputs.leadTimeStdDevDays) || 0);
  const serviceLevelPct = Math.min(99.9, Math.max(80, Number(inputs.serviceLevelPct) || 95));
  const unitCost = Math.max(0.01, Number(inputs.unitCost) || 1);
  const orderingCost = Math.max(1, Number(inputs.orderingCost) || 500);
  const holdingCostRate = Math.max(0.01, Math.min(1, Number(inputs.holdingCostRate) || 0.2));
  const minOrderQuantity = Math.max(1, Math.round(Number(inputs.minOrderQuantity) || 1));
  const pendingIncomingQty = Math.max(0, Number(inputs.pendingIncomingQty) || 0);

  const zScore = getZScoreForServiceLevel(serviceLevelPct);
  const leadTimeDemand = avgDailyDemand * leadTimeDays;
  const leadTimeDemandStdDev = Math.sqrt(
    leadTimeDays * demandStdDev ** 2 + avgDailyDemand ** 2 * leadTimeStdDevDays ** 2
  );

  const safetyStockRaw = zScore * leadTimeDemandStdDev;
  const safetyStock = Math.max(0, Math.ceil(safetyStockRaw));
  const reorderPoint = Math.max(0, Math.ceil(leadTimeDemand + safetyStock));

  const annualDemand = Math.max(0, avgDailyDemand * 365);
  const annualHoldingCostPerUnit = Math.max(0.01, unitCost * holdingCostRate);

  const eoqRaw =
    annualDemand > 0
      ? Math.sqrt((2 * annualDemand * orderingCost) / annualHoldingCostPerUnit)
      : 0;
  const eoq = Math.max(0, Math.round(eoqRaw));

  const effectivePosition = currentStock + pendingIncomingQty;
  const needsReorder = effectivePosition <= reorderPoint && (avgDailyDemand > 0 || currentStock === 0);

  let recommendedOrderQty = 0;
  if (needsReorder) {
    const deficit = Math.max(0, reorderPoint - effectivePosition);
    const targetBatch = Math.max(eoq, deficit + safetyStock, minOrderQuantity);
    recommendedOrderQty = Math.max(minOrderQuantity, Math.round(targetBatch));
    if (inputs.maxStock && inputs.maxStock > effectivePosition) {
      const cap = Math.max(minOrderQuantity, Math.round(inputs.maxStock - effectivePosition));
      recommendedOrderQty = Math.min(recommendedOrderQty, Math.max(cap, eoq));
    }
  }
  recommendedOrderQty = Math.max(0, recommendedOrderQty);

  const orderCycleQty = eoq > 0 ? eoq : minOrderQuantity;
  const averageInventory = Number((orderCycleQty / 2 + safetyStock).toFixed(2));
  const estimatedAnnualHoldingCost = Number((averageInventory * annualHoldingCostPerUnit).toFixed(2));
  const estimatedAnnualOrderingCost =
    annualDemand > 0 && orderCycleQty > 0
      ? Number(((annualDemand / orderCycleQty) * orderingCost).toFixed(2))
      : 0;
  const totalAnnualInventoryCost = Number(
    (estimatedAnnualHoldingCost + estimatedAnnualOrderingCost).toFixed(2)
  );
  const estimatedOrderCost = Number((recommendedOrderQty * unitCost).toFixed(2));

  let stockoutRiskPct = 0;
  if (avgDailyDemand > 0) {
    if (leadTimeDemandStdDev > 0) {
      const zActual = (effectivePosition - leadTimeDemand) / leadTimeDemandStdDev;
      stockoutRiskPct = Number(((1 - normalCDF(zActual)) * 100).toFixed(2));
    } else {
      stockoutRiskPct = effectivePosition < leadTimeDemand ? 100 : 0;
    }
  }

  const daysOfCover =
    avgDailyDemand > 0 ? Number((currentStock / avgDailyDemand).toFixed(1)) : null;

  let urgency: 'Critical' | 'High' | 'Medium' | 'Low' = 'Low';
  if (currentStock === 0 || (daysOfCover !== null && daysOfCover < leadTimeDays)) {
    urgency = 'Critical';
  } else if (effectivePosition <= safetyStock || stockoutRiskPct >= 35) {
    urgency = 'High';
  } else if (effectivePosition <= reorderPoint) {
    urgency = 'Medium';
  }

  return {
    zScore,
    serviceLevelPct,
    annualDemand: Number(annualDemand.toFixed(1)),
    annualHoldingCostPerUnit: Number(annualHoldingCostPerUnit.toFixed(2)),
    safetyStock,
    reorderPoint,
    eoq,
    recommendedOrderQty,
    averageInventory,
    estimatedAnnualHoldingCost,
    estimatedAnnualOrderingCost,
    totalAnnualInventoryCost,
    estimatedOrderCost,
    stockoutRiskPct: Math.min(100, Math.max(0, stockoutRiskPct)),
    daysOfCover,
    needsReorder,
    urgency,
    formulaBreakdown: {
      safetyStockFormula: `SS = Z(${zScore}) × √(${leadTimeDays} × ${demandStdDev.toFixed(2)}² + ${avgDailyDemand.toFixed(2)}² × ${leadTimeStdDevDays.toFixed(2)}²) = ${safetyStock}`,
      reorderPointFormula: `ROP = (${avgDailyDemand.toFixed(2)} × ${leadTimeDays}) + ${safetyStock} = ${reorderPoint}`,
      eoqFormula: `EOQ = √((2 × ${annualDemand.toFixed(0)} × ₹${orderingCost}) / ₹${annualHoldingCostPerUnit.toFixed(2)}) = ${eoq}`,
      inputs: {
        ...inputs,
        currentStock,
        avgDailyDemand,
        demandStdDev,
        leadTimeDays,
        leadTimeStdDevDays,
        serviceLevelPct,
        unitCost,
        orderingCost,
        holdingCostRate,
        minOrderQuantity,
        pendingIncomingQty,
      },
    },
  };
}
