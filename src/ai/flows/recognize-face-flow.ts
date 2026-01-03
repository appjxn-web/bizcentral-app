'use server';
/**
 * @fileOverview A Genkit flow for recognizing and comparing faces.
 *
 * - recognizeFace - A function that compares a new selfie against a reference image.
 * - RecognizeFaceInput - The input type for the recognizeFace function.
 * - RecognizeFaceOutput - The return type for the recognizeFace function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const RecognizeFaceInputSchema = z.object({
  referenceImage: z
    .string()
    .describe(
      "The stored reference face image, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:image/jpeg;base64,<encoded_data>'."
    ),
  selfieImage: z
    .string()
    .describe(
      "The new selfie image to compare, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:image/jpeg;base64,<encoded_data>'."
    ),
});
export type RecognizeFaceInput = z.infer<typeof RecognizeFaceInputSchema>;

const RecognizeFaceOutputSchema = z.object({
  isMatch: z
    .boolean()
    .describe('Whether the face in the selfie is a match to the reference image.'),
});
export type RecognizeFaceOutput = z.infer<typeof RecognizeFaceOutputSchema>;

export async function recognizeFace(input: RecognizeFaceInput): Promise<RecognizeFaceOutput> {
  return recognizeFaceFlow(input);
}

const recognizeFacePrompt = ai.definePrompt({
  name: 'recognizeFacePrompt',
  input: { schema: RecognizeFaceInputSchema },
  output: { schema: RecognizeFaceOutputSchema },
  prompt: `You are a highly accurate AI face recognition system. Your task is to determine if the two images provided show the same person.

Analyze the key facial features in both the reference image and the new selfie. Compare them carefully.

Reference Image:
{{media url=referenceImage}}

New Selfie:
{{media url=selfieImage}}

Respond with a JSON object indicating if it's a match. If you are highly confident they are the same person, set "isMatch" to true. Otherwise, set it to false.`,
});


const recognizeFaceFlow = ai.defineFlow(
  {
    name: 'recognizeFaceFlow',
    inputSchema: RecognizeFaceInputSchema,
    outputSchema: RecognizeFaceOutputSchema,
  },
  async (input) => {
    const { output } = await recognizeFacePrompt(input);
    return output!;
  }
);
