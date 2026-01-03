
import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/google-genai';
import {config} from 'dotenv';

config();

// Prefer the server-side key, but fall back to the public key.
// This is necessary because server components might not have access to NEXT_PUBLIC_ variables
// during the build process, while client components do.
const apiKey = process.env.GOOGLE_GENAI_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_GENAI_API_KEY;

if (!apiKey) {
  // This warning will show on the server during development if no key is found.
  // It provides a clear action for the developer to take.
  throw new Error("GOOGLE_GENAI_API_KEY or NEXT_PUBLIC_GOOGLE_GENAI_API_KEY is not configured. Please add it to your .env file.");
}

export const ai = genkit({
  plugins: [googleAI({apiKey})],
});
