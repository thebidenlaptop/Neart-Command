import { z } from 'zod';

const optionalText = z.string().trim().min(1).optional();

/** A new lead from any source. Sources send different subsets, so most fields are optional. */
export const leadIntakeSchema = z
  .object({
    source: z.string().min(1), // lead_sources.slug
    tradeType: z.string().min(1).optional(), // trade_types.slug
    fullName: optionalText,
    phone: optionalText,
    email: z.string().email().optional(),
    scope: optionalText,
    message: optionalText,
    externalId: optionalText, // the ad platform's lead id, used to ignore duplicate deliveries
    rawPayload: z.record(z.unknown()).optional(),
  })
  .refine((l) => l.fullName || l.phone || l.email, {
    message: 'A lead needs at least a name, phone or email',
  });
export type LeadIntake = z.infer<typeof leadIntakeSchema>;

export const changeStatusSchema = z.object({
  status: z.string().min(1), // statuses.slug
});
export type ChangeStatus = z.infer<typeof changeStatusSchema>;

export interface Lead {
  id: string;
  source: string;
  tradeType: string | null;
  status: string;
  statusChangedAt: Date;
  fullName: string | null;
  phone: string | null;
  email: string | null;
  scope: string | null;
  message: string | null;
  contactAt: Date | null;
  customerId: string | null;
  createdAt: Date;
}
