import { z } from 'zod';

export const BookingSelectionOutputSchema = z.object({
  selected_package_id: z.string(),
  session_type_match: z.string(),
  reasons: z.array(z.string()).min(1),
  suggested_duration_minutes: z.number().int().positive().nullable(),
  suggested_session_date: z.string().nullable(),
  notes: z.string().nullable(),
  confidence: z.number().min(0).max(1),
});

export type BookingSelectionOutput = z.infer<typeof BookingSelectionOutputSchema>;

export const NoMatchOutputSchema = z.object({
  selected_package_id: z.null(),
  session_type_match: z.literal('none'),
  reasons: z.array(z.string()).min(1),
  suggested_duration_minutes: z.null(),
  suggested_session_date: z.null(),
  notes: z.string().nullable(),
  confidence: z.number().min(0).max(1),
});

export type NoMatchOutput = z.infer<typeof NoMatchOutputSchema>;

export const BookingAgentOutputSchema = z.union([
  BookingSelectionOutputSchema,
  NoMatchOutputSchema,
]);

export type BookingAgentOutput = z.infer<typeof BookingAgentOutputSchema>;
