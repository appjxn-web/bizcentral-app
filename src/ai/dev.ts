
import { config } from 'dotenv';
config();

import '@/ai/flows/transcribe-audio-flow.ts';
import '@/ai/flows/recognize-face-flow.ts';
import '@/ai/flows/generate-post-idea-flow.ts';
import '@/ai/flows/estimate-dispatch-date-flow.ts';

