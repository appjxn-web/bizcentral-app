
'use server';
/**
 * @fileOverview A Genkit flow for generating social media post ideas.
 *
 * - generatePostIdea - A function that handles post idea generation.
 * - GeneratePostIdeaInput - The input type for the generatePostIdea function.
 * - GeneratePostIdeaOutput - The return type for the generatePostIdea function.
 */

import { ai } from '@/ai/genkit';
import { googleAI } from '@genkit-ai/google-genai';
import { z } from 'genkit';

const GeneratePostIdeaInputSchema = z.object({
  topic: z.string().describe('The topic or subject for the social media post.'),
});
export type GeneratePostIdeaInput = z.infer<typeof GeneratePostIdeaInputSchema>;

const GeneratePostIdeaOutputSchema = z.object({
  postContent: z
    .string()
    .describe('The generated content for the social media post.'),
});
export type GeneratePostIdeaOutput = z.infer<
  typeof GeneratePostIdeaOutputSchema
>;

export async function generatePostIdea(
  input: GeneratePostIdeaInput
): Promise<GeneratePostIdeaOutput> {
  return generatePostIdeaFlow(input);
}

const generatePostIdeaFlow = ai.defineFlow(
  {
    name: 'generatePostIdeaFlow',
    inputSchema: GeneratePostIdeaInputSchema,
    outputSchema: GeneratePostIdeaOutputSchema,
  },
  async (input) => {
    const { text } = await ai.generate({
      model: googleAI.model('gemini-1.5-flash-latest'),
      prompt: `You are a creative marketing assistant. A user wants to create a promotional post for their business community.
      
      The topic is: "${input.topic}".
      
      Based on this topic, generate a short, engaging, and friendly post content (around 2-4 sentences). The tone should be positive and encouraging.`,
    });

    return { postContent: text };
  }
);
