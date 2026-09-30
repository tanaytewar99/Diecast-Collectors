import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { HttpError } from './http.ts';
import { Identification, type MEDIA_TYPES } from './schemas.ts';

// Haiku is Anthropic's cheapest vision model: roughly half a US cent per scan at this image size.
export const ID_MODEL = Deno.env.get('CLAUDE_MODEL') ?? 'claude-haiku-4-5';

const SYSTEM = `You are the identification engine of "Diecast Collectors", an app for scale-model and diecast car collectors.
Identify the exact diecast release in the photo as precisely as a veteran collector would.
Use every clue: blister-card art and text, series name and number on the card, toy/collector numbers, the base (casting name, year stamp, country),
wheel type, tampo/livery, colour, and packaging. Distinguish the diecast release year from the real car's year.
Fill fields you can reasonably infer; use null only when there is genuinely no basis. Set condition to "unknown" unless visible damage or
pristine packaging makes it clear. Flag Treasure Hunts (flame logo), Super Treasure Hunts (Spectraflame paint + Real Riders + "TH" tampo),
chases, and limited editions only when the evidence supports it. If the photo does not show a model vehicle, set isDiecast to false.
Be honest in confidence: 0.9+ only when card text or base markings confirm the release.`;

let client: Anthropic | null = null;

export async function identifyCar(input: {
  image: string;
  mediaType: (typeof MEDIA_TYPES)[number];
  hint?: string;
}): Promise<Identification> {
  client ??= new Anthropic();
  const response = await client.messages.parse({
    model: ID_MODEL,
    max_tokens: 4096,
    system: SYSTEM,
    output_config: { format: zodOutputFormat(Identification) },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: input.mediaType, data: input.image } },
          {
            type: 'text',
            text: input.hint ? `Identify this diecast car. Collector's hint: ${input.hint}` : 'Identify this diecast car.',
          },
        ],
      },
    ],
  });

  if (response.stop_reason === 'refusal') {
    throw new HttpError('The AI declined to process this image. Please try a different photo.', 422);
  }
  if (response.stop_reason === 'max_tokens' || !response.parsed_output) {
    throw new HttpError('Could not read the identification result. Please try again.', 502);
  }
  const out = response.parsed_output;
  return {
    ...out,
    confidence: Math.min(1, Math.max(0, out.confidence)),
    alternatives: out.alternatives.slice(0, 3),
  };
}

/** Map SDK errors to messages the app can show. */
export function aiErrorToHttp(err: unknown): unknown {
  if (err instanceof Anthropic.RateLimitError) return new HttpError('The AI service is busy. Please try again shortly.', 503);
  if (err instanceof Anthropic.BadRequestError) return new HttpError('The image could not be processed.', 400);
  if (err instanceof Anthropic.AuthenticationError) return new HttpError('The AI service is not configured.', 500);
  if (err instanceof Anthropic.APIError) return new HttpError('The AI service had a problem. Please try again.', 502);
  return err;
}
