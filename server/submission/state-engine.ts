import statesConfig from "./states.json";

export type TaxType = "None" | "Flat" | "Graduated" | "Decoupled";

export interface TaxBracket {
  min: number;
  max: number | null;
  rate: number;
}

export interface StateConfig {
  name: string;
  tax_type: TaxType;
  rate_2026: number;
  brackets?: TaxBracket[];
  decoupled_rules?: string[];
  has_local_tax?: boolean;
}

export interface StateTaxResult {
  stateCode: string;
  stateName: string;
  taxType: TaxType;
  bucketLabel: string;
  topRate: number;
  effectiveRate: number;
  taxOwed: number;
  brackets?: { rate: number; taxableInBracket: number; taxInBracket: number }[];
  isDecoupled: boolean;
  decoupledRules: string[];
  requiresStateAdjustment: boolean;
}

const stateMap = statesConfig.states as Record<string, StateConfig>;

const BUCKET_LABELS: Record<TaxType, string> = {
  None: "No State Income Tax",
  Flat: "Flat Tax State",
  Graduated: "Graduated Tax State",
  Decoupled: "Decoupled State",
};

export function getStateConfig(stateCode: string): StateConfig | null {
  return stateMap[stateCode] || null;
}

export function getAllStates(): Record<string, StateConfig> {
  return stateMap;
}

export function getStateTaxType(stateCode: string): TaxType | null {
  const config = stateMap[stateCode];
  return config?.tax_type || null;
}

export function calculateStateTax(stateCode: string, netProfit: number): StateTaxResult {
  const config = stateMap[stateCode];

  if (!config) {
    return {
      stateCode,
      stateName: "Unknown",
      taxType: "None",
      bucketLabel: "Unknown State",
      topRate: 0,
      effectiveRate: 0,
      taxOwed: 0,
      isDecoupled: false,
      decoupledRules: [],
      requiresStateAdjustment: false,
    };
  }

  const taxType = config.tax_type;
  const isDecoupled = taxType === "Decoupled";
  const decoupledRules = config.decoupled_rules || [];
  const requiresStateAdjustment = isDecoupled && decoupledRules.some(
    r => r === "bonus_depreciation_limited" || r === "section_179_limited"
  );

  if (taxType === "None") {
    return {
      stateCode,
      stateName: config.name,
      taxType,
      bucketLabel: BUCKET_LABELS[taxType],
      topRate: 0,
      effectiveRate: 0,
      taxOwed: 0,
      isDecoupled: false,
      decoupledRules: [],
      requiresStateAdjustment: false,
    };
  }

  if (taxType === "Flat") {
    const rate = config.rate_2026;
    const taxOwed = round2(Math.max(0, netProfit) * (rate / 100));
    const effectiveRate = netProfit > 0 ? round2((taxOwed / netProfit) * 100) : 0;
    return {
      stateCode,
      stateName: config.name,
      taxType,
      bucketLabel: BUCKET_LABELS[taxType],
      topRate: rate,
      effectiveRate,
      taxOwed,
      isDecoupled: false,
      decoupledRules: [],
      requiresStateAdjustment: false,
    };
  }

  const brackets = config.brackets || [];
  const income = Math.max(0, netProfit);
  let totalTax = 0;
  const bracketDetails: { rate: number; taxableInBracket: number; taxInBracket: number }[] = [];

  for (const bracket of brackets) {
    const upper = bracket.max !== null ? bracket.max : Infinity;
    if (income <= bracket.min) break;
    const taxableInBracket = Math.min(income, upper) - bracket.min;
    const taxInBracket = round2(taxableInBracket * (bracket.rate / 100));
    totalTax += taxInBracket;
    bracketDetails.push({ rate: bracket.rate, taxableInBracket: round2(taxableInBracket), taxInBracket });
  }

  totalTax = round2(totalTax);
  const effectiveRate = income > 0 ? round2((totalTax / income) * 100) : 0;

  return {
    stateCode,
    stateName: config.name,
    taxType,
    bucketLabel: BUCKET_LABELS[taxType],
    topRate: config.rate_2026,
    effectiveRate,
    taxOwed: totalTax,
    brackets: bracketDetails,
    isDecoupled,
    decoupledRules,
    requiresStateAdjustment,
  };
}

export function hasLocalTax(stateCode: string): boolean {
  const config = stateMap[stateCode];
  return config?.has_local_tax === true;
}

export function getLocalTaxStates(): string[] {
  return Object.entries(stateMap)
    .filter(([, config]) => config.has_local_tax === true)
    .map(([code]) => code);
}

export function getBucketStates(bucket: TaxType): string[] {
  return Object.entries(stateMap)
    .filter(([, config]) => config.tax_type === bucket)
    .map(([code]) => code);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
