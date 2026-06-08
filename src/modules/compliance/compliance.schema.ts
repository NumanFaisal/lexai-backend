import { z } from 'zod';

export const generateComplianceSchema = z.object({
    body: z.object({
        businessType: z.enum([
          'SaaS', 'E-commerce', 'Food & Beverage', 
      		'Manufacturing', 'Services', 'Other'
        ], { message: "Business type is required" }),
				state: z.string({ message: "Location (state) is required" }),
				headcount: z.number().int().min(0, "Headcount must be 0 or more"),
				revenueBracket: z.enum([
					'<20L', '20L-1Cr', '1Cr-10Cr', '>10Cr'
				], { message: "Revenue bracket is required" }),
				hasUserData: z.boolean().optional(),
				isFood: z.boolean().optional(),
    		isFintech: z.boolean().optional()
    })
});

export const updateItemSchema = z.object({
  body: z.object({
    isCompleted: z.boolean({ message: "isCompleted status is required" }),
    notes: z.string().optional()
  })
});

export type GenerateComplianceInput = z.infer<typeof generateComplianceSchema>['body'];
export type UpdateItemInput = z.infer<typeof updateItemSchema>['body'];