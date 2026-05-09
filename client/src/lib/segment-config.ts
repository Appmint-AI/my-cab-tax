import { normalizeDetectedCountry } from "@shared/regional-profile";

export type UserSegment = "taxi" | "delivery" | "hybrid";

export interface SegmentConfig {
  label: string;
  shortLabel: string;
  icon: string;
  customerTerm: string;
  tripTerm: string;
  tripTermPlural: string;
  earningsLabel: string;
  surgeLabel: string;
  tipContext: string;
  dashboardHeading: string;
  dashboardSubheading: string;
  incomeSources: string[];
  expenseSuggestions: string[];
  receiptOptimization: string;
  proTips: string[];
  vaultTips: string[];
}

const TAXI_CONFIG: SegmentConfig = {
  label: "Taxi / Rideshare Driver",
  shortLabel: "Rideshare",
  icon: "car",
  customerTerm: "Rider",
  tripTerm: "Passenger Trip",
  tripTermPlural: "Passenger Trips",
  earningsLabel: "Ride Earnings",
  surgeLabel: "Surge Earnings",
  tipContext: "passenger gratuities",
  dashboardHeading: "Driver Dashboard",
  dashboardSubheading: "Track your passenger trips, surge earnings, and deductions.",
  incomeSources: ["Uber", "Lyft", "Taxi Medallion", "Via", "Curb", "Arro"],
  expenseSuggestions: [
    "Car Detailing",
    "Passenger Snacks & Water",
    "TLC License Fees",
    "Phone Mount & Charger",
    "Dash Cam",
    "Airport Queue Fees",
  ],
  receiptOptimization: "Optimized for gas station, car wash, and vehicle maintenance receipts.",
  proTips: [
    "Track every trip — even short ones add up for your mileage deduction.",
    "Surge pricing counts as regular income on your 1099-K.",
    "Keep your TLC license renewal receipt — it's fully deductible.",
    "Water and snacks for riders? Deductible as a business supply.",
  ],
  vaultTips: [
    "Don't forget to snap a photo of your annual vehicle inspection receipt!",
    "Save your TLC/chauffeur license renewal — auditors look for this first.",
    "Keep airport queue fee receipts; they're easy to forget but fully deductible.",
    "Photograph your car wash & detailing receipts monthly for the 7-Year Vault.",
  ],
};

const DELIVERY_CONFIG: SegmentConfig = {
  label: "Delivery Courier",
  shortLabel: "Delivery",
  icon: "package",
  customerTerm: "Customer",
  tripTerm: "Order Delivery",
  tripTermPlural: "Order Deliveries",
  earningsLabel: "Delivery Earnings",
  surgeLabel: "Tip Breakdown",
  tipContext: "customer delivery tips",
  dashboardHeading: "Courier Dashboard",
  dashboardSubheading: "Track your order deliveries, tips, and deductions.",
  incomeSources: ["DoorDash", "Instacart", "Grubhub", "Uber Eats", "Amazon Flex", "Shipt"],
  expenseSuggestions: [
    "Insulated Delivery Bags",
    "Courier Insurance",
    "Bike Repair & Maintenance",
    "Phone Data Plan",
    "Parking Fees",
    "Hand Warmers & Gear",
  ],
  receiptOptimization: "Optimized for equipment, delivery gear, and staging area receipts.",
  proTips: [
    "Your insulated bags are a deductible business expense.",
    "Track mileage between deliveries — waiting time at restaurants counts.",
    "Bike repairs and e-bike charging costs are fully deductible.",
    "Multi-app stacking? Split mileage proportionally across platforms.",
  ],
  vaultTips: [
    "Did you buy a new thermal bag this year? That's a 100% deduction.",
    "Save your e-bike or scooter charging receipts — they add up fast.",
    "Keep receipts for phone accessories (mounts, cases) used for delivery apps.",
    "Photograph delivery gear purchases the day you buy them for the 7-Year Vault.",
  ],
};

const HYBRID_CONFIG: SegmentConfig = {
  label: "Hybrid Driver (Both)",
  shortLabel: "Hybrid",
  icon: "layers",
  customerTerm: "Customer",
  tripTerm: "Trip / Delivery",
  tripTermPlural: "Trips & Deliveries",
  earningsLabel: "Total Earnings",
  surgeLabel: "Surge & Tips",
  tipContext: "passenger and delivery tips",
  dashboardHeading: "Multi-App Dashboard",
  dashboardSubheading: "Track rides, deliveries, tips, and deductions across all your apps.",
  incomeSources: [
    ...TAXI_CONFIG.incomeSources,
    ...DELIVERY_CONFIG.incomeSources.filter(s => !TAXI_CONFIG.incomeSources.includes(s)),
  ],
  expenseSuggestions: [
    ...TAXI_CONFIG.expenseSuggestions,
    ...DELIVERY_CONFIG.expenseSuggestions.filter(s => !TAXI_CONFIG.expenseSuggestions.includes(s)),
  ],
  receiptOptimization: "Optimized for gas, car wash, delivery gear, and equipment receipts.",
  proTips: [
    ...TAXI_CONFIG.proTips,
    ...DELIVERY_CONFIG.proTips.filter(t => !TAXI_CONFIG.proTips.includes(t)),
  ],
  vaultTips: [
    ...TAXI_CONFIG.vaultTips.slice(0, 2),
    ...DELIVERY_CONFIG.vaultTips.slice(0, 2),
  ],
};

const SEGMENT_CONFIGS: Record<UserSegment, SegmentConfig> = {
  taxi: TAXI_CONFIG,
  delivery: DELIVERY_CONFIG,
  hybrid: HYBRID_CONFIG,
};

const UK_SEGMENT_PATCH: Partial<Record<UserSegment, Partial<SegmentConfig>>> = {
  taxi: {
    proTips: [
      "Track every trip — Approved Mileage Payments add up fast (45p/mile for the first 10,000 miles).",
      "Surge and fares remain ordinary trading income for Self Assessment.",
      "Licence and medical renewal receipts support allowable expenses.",
      "Small passenger comforts may qualify — keep clear receipts.",
    ],
    vaultTips: [
      "HMRC may ask for proof — snap licences and inspections when renewed.",
      "Keep MOT/service receipts that relate to business mileage.",
      "Photograph dashcam or safety gear purchases used wholly for work.",
      "Monthly car wash/detailing receipts help justify upkeep claimed.",
    ],
  },
  delivery: {
    proTips: [
      "Track mileage between pickups — Approved Mileage Payments apply when using your own vehicle.",
      "Thermal bags, waterproof gear, and mounts often qualify as plant/tools.",
      "Battery charging receipts matter when using EV bikes or scooters.",
      "Split mileage logically when stacking apps.",
    ],
    vaultTips: [
      "Save insulated bag purchases the same day you buy them.",
      "Photograph charging or servicing receipts for work bikes/scooters.",
      "Keep parking tickets tied clearly to delivery shifts.",
      "Accessory mounts used exclusively for deliveries belong in the vault.",
    ],
  },
  hybrid: {
    proTips: [
      "Across rides and deliveries, Approved Mileage Payments apply when you use your own car.",
      "Keep fares plus gig payouts reconciled against statements — Self Assessment expects coherent totals.",
      "Licences for taxi work and courier bags remain distinct deductions — tag receipts accordingly.",
      "Split mileage fairly between rides vs courier repositioning when using multi-app stacks.",
    ],
    vaultTips: [
      "Store TLC/medical renewal receipts beside courier thermal gear receipts.",
      "Photograph weekly mileage habits rather than guessing later.",
      "Separate vault folders per gig keeps HMRC enquiries faster to answer.",
      "Insurance schedules naming gig usage deserve screenshots annually.",
    ],
  },
};

export function getSegmentConfig(
  segment: UserSegment | string | null | undefined,
  detectedCountry?: string | null,
): SegmentConfig {
  const key: UserSegment =
    segment === "delivery"
      ? "delivery"
      : segment === "hybrid"
        ? "hybrid"
        : "taxi";
  const base = SEGMENT_CONFIGS[key];
  const iso = normalizeDetectedCountry(detectedCountry);
  if (iso !== "GB") return base;
  const patch = UK_SEGMENT_PATCH[key];
  if (!patch) return base;
  return {
    ...base,
    ...patch,
    proTips: patch.proTips ?? base.proTips,
    vaultTips: patch.vaultTips ?? base.vaultTips,
  };
}

export function isValidSegment(value: unknown): value is UserSegment {
  return value === "taxi" || value === "delivery" || value === "hybrid";
}
