import { z } from 'zod';

/** Response of POST /api/stt (audio body → recognised text). */
export const SttResponse = z.object({
  text: z.string().max(2000).catch(''),
});
export type SttResponse = z.infer<typeof SttResponse>;
