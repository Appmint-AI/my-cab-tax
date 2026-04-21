import { z } from 'zod';
import { insertExpenseSchema, insertIncomeSchema, insertMileageLogSchema, insertVehicleSchema, expenses, incomes, mileageLogs, vehicles } from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

export const api = {
  vehicles: {
    list: {
      method: 'GET' as const,
      path: '/api/vehicles' as const,
      responses: {
        200: z.array(z.custom<typeof vehicles.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/vehicles' as const,
      input: insertVehicleSchema,
      responses: {
        201: z.custom<typeof vehicles.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/vehicles/:id' as const,
      responses: {
        200: z.custom<typeof vehicles.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/vehicles/:id' as const,
      input: insertVehicleSchema.partial(),
      responses: {
        200: z.custom<typeof vehicles.$inferSelect>(),
        404: errorSchemas.notFound,
        400: errorSchemas.validation,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/vehicles/:id' as const,
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },
  expenses: {
    list: {
      method: 'GET' as const,
      path: '/api/expenses' as const,
      responses: {
        200: z.array(z.custom<typeof expenses.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/expenses' as const,
      input: insertExpenseSchema,
      responses: {
        201: z.custom<typeof expenses.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/expenses/:id' as const,
      responses: {
        200: z.custom<typeof expenses.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/expenses/:id' as const,
      input: insertExpenseSchema.partial(),
      responses: {
        200: z.custom<typeof expenses.$inferSelect>(),
        404: errorSchemas.notFound,
        400: errorSchemas.validation,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/expenses/:id' as const,
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },
  incomes: {
    list: {
      method: 'GET' as const,
      path: '/api/incomes' as const,
      responses: {
        200: z.array(z.custom<typeof incomes.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/incomes' as const,
      input: insertIncomeSchema,
      responses: {
        201: z.custom<typeof incomes.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/incomes/:id' as const,
      responses: {
        200: z.custom<typeof incomes.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/incomes/:id' as const,
      input: insertIncomeSchema.partial(),
      responses: {
        200: z.custom<typeof incomes.$inferSelect>(),
        404: errorSchemas.notFound,
        400: errorSchemas.validation,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/incomes/:id' as const,
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },
  mileageLogs: {
    list: {
      method: 'GET' as const,
      path: '/api/mileage-logs' as const,
      responses: {
        200: z.array(z.custom<typeof mileageLogs.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/mileage-logs' as const,
      input: insertMileageLogSchema,
      responses: {
        201: z.custom<typeof mileageLogs.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/mileage-logs/:id' as const,
      responses: {
        200: z.custom<typeof mileageLogs.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/mileage-logs/:id' as const,
      input: insertMileageLogSchema.partial(),
      responses: {
        200: z.custom<typeof mileageLogs.$inferSelect>(),
        404: errorSchemas.notFound,
        400: errorSchemas.validation,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/mileage-logs/:id' as const,
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },
  tax: {
    summary: {
      method: 'GET' as const,
      path: '/api/tax/summary' as const,
      responses: {
        200: z.object({
          grossIncome: z.number(),
          totalPlatformFees: z.number(),
          totalMiles: z.number(),
          mileageDeduction: z.number(),
          totalOtherExpenses: z.number(),
          totalDeductions: z.number(),
          netProfit: z.number(),
          seTaxableBase: z.number(),
          selfEmploymentTax: z.number(),
          seDeduction: z.number(),
          estimatedQuarterlyPayment: z.number(),
          expensesByCategory: z.record(z.number()),
          incomeBySource: z.record(z.number()),
          quarterlyDeadlines: z.array(z.string()),
          mileageRate: z.number(),
        }),
      },
    },
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
