import { z } from 'zod';

export const LeadQualificationOutputSchema = z.object({
  decision: z.enum(['qualified', 'needs_info', 'rejected']),
  reasons: z.array(z.string()).min(1),
  extracted: z.object({
    event_type: z.string().nullable(),
    date_signal: z.string().nullable(),
    budget_signal: z.string().nullable(),
    location_preference: z.string().nullable(),
    party_size: z.number().int().positive().nullable(),
  }),
  missing_fields: z.array(z.string()).optional(),
  confidence: z.number().min(0).max(1),
});

export type LeadQualificationOutput = z.infer<typeof LeadQualificationOutputSchema>;
