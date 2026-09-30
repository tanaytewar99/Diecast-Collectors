import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type {
  BetaContentBlock,
  BetaMessage,
  BetaMessageParam,
  MessageCreateParamsNonStreaming,
} from '@anthropic-ai/sdk/resources/beta/messages/messages';
import {
  Identification,
  Valuation,
  valuationToolSchema,
  type CarDetails,
  type SUPPORTED_MEDIA_TYPES,
} from './schemas.js';

export const MODEL = process.env.CLAUDE_MODEL ?? 'claude-opus-5-5';
// Re-run a safety-declined request on Anthropic's recommended fallback model.
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

export class AiError extends Error {
  constructor(
    message: string,
    readonly status: number = 502,
  ) {
    super(message);
  }
}

const IDENTIFY_SYSTEM = `You are the identification engine of "Diecast Collectors", an app for scale-model and diecast car collectors.
Identify the exact diecast release in the photo as precisely as a veteran collector would.
Use every clue: blister-card art and text, series name and number on the card, toy/collector numbers, the base (casting name, year stamp, country),
wheel type, tampo/livery, colour, and packaging. Distinguish the diecast release year from the real car's year.
Fill fields you can reasonably infer; use null only when there is genuinely no basis. Set condition to "unknown" unless visible damage or
pristine packaging makes it clear. Flag Treasure Hunts (flame logo), Super Treasure Hunts (Spectraflame paint + Real Riders + "TH" tampo),
chases, and limited editions only when the evidence supports it. If the photo does not show a model vehicle, set isDiecast to false.
Be honest in confidence: 0.9+ only when card text or base markings confirm the release.`;

const VALUATE_SYSTEM = `You are the pricing analyst of "Diecast Collectors".
Given a diecast release, research its current market value using web search: prefer recent SOLD prices (eBay sold listings, auction results,
collector price guides) over asking prices, and match the variant, packaging and condition as closely as possible.
Also confirm the series, release year and toy/casting number if the search shows them.
When finished, call the submit_valuation tool exactly once with your result. Keep low <= estimate <= high.
If evidence is thin, still give your best estimate with confidence "low".`;

let client: Anthropic | null = null;
function getClient(): Anthropic {
  client ??= new Anthropic();
  return client;
}

/** Throw a user-facing error if the model declined or truncated. */
function assertUsable(message: BetaMessage): void {
  if (message.stop_reason === 'refusal') {
    throw new AiError('The AI declined to process this image. Please try a different photo.', 422);
  }
  if (message.stop_reason === 'max_tokens') {
    throw new AiError('The AI response was cut off. Please try again.');
  }
}

export async function identifyCar(input: {
  image: string;
  mediaType: (typeof SUPPORTED_MEDIA_TYPES)[number];
  hint?: string;
}): Promise<Identification> {
  const params = {
    model: MODEL,
    max_tokens: 16000,
    betas: [FALLBACK_BETA],
    fallbacks: 'default',
    thinking: { type: 'adaptive' },
    output_config: { effort: 'high', format: betaZodOutputFormat(Identification) },
    system: IDENTIFY_SYSTEM,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: input.mediaType, data: input.image } },
          {
            type: 'text',
            text: input.hint
              ? `Identify this diecast car. Collector's hint: ${input.hint}`
              : 'Identify this diecast car.',
          },
        ],
      },
    ],
  } satisfies MessageCreateParamsNonStreaming;

  const response = await getClient().beta.messages.parse(params);
  assertUsable(response);
  if (!response.parsed_output) throw new AiError('Could not read the identification result.');
  const out = response.parsed_output;
  return {
    ...out,
    confidence: Math.min(1, Math.max(0, out.confidence)),
    alternatives: out.alternatives.slice(0, 3),
  };
}

function describeCar(car: CarDetails): string {
  const parts: [string, unknown][] = [
    ['Name', car.name],
    ['Real car', [car.make, car.model].filter(Boolean).join(' ') || null],
    ['Brand', car.brand],
    ['Series', car.series],
    ['Release year', car.year],
    ['Scale', car.scale],
    ['Colour', car.color],
    ['Toy/casting number', car.castingNumber],
    ['Packaging', car.packaging],
    ['Condition', car.condition],
    ['Special', car.flags.length ? car.flags.join(', ') : null],
  ];
  return parts
    .filter(([, v]) => v !== null && v !== '' && v !== 'unknown')
    .map(([k, v]) => `- ${k}: ${v}`)
    .join('\n');
}

/** Find the submit_valuation call in a response, validated against the schema. */
export function extractValuation(content: BetaContentBlock[]): Valuation | null {
  for (const block of content) {
    if (block.type === 'tool_use' && block.name === 'submit_valuation') {
      const parsed = Valuation.safeParse(block.input);
      if (!parsed.success) return null;
      return normalizeValuation(parsed.data);
    }
  }
  return null;
}

export function normalizeValuation(v: Valuation): Valuation {
  const round = (n: number) => Math.round(Math.max(0, n) * 100) / 100;
  const estimate = round(v.estimate);
  const low = round(Math.min(v.low, estimate));
  const high = round(Math.max(v.high, estimate));
  const sources = v.sources.filter((s) => /^https?:\/\//.test(s.url)).slice(0, 5);
  return { ...v, estimate, low, high, sources };
}

export async function valuateCar(car: CarDetails, currency: string): Promise<Valuation> {
  const messages: BetaMessageParam[] = [
    {
      role: 'user',
      content: `Estimate the current market value in ${currency} of this diecast:\n${describeCar(car)}`,
    },
  ];
  const tools = [
    { type: 'web_search_20260209', name: 'web_search', max_uses: 5 },
    {
      name: 'submit_valuation',
      description: 'Submit the final market valuation. Call exactly once, after researching prices.',
      strict: true,
      input_schema: valuationToolSchema,
    },
  ] as const;

  // pause_turn: the server paused a long web-search turn; resend to let it continue.
  // end_turn without a tool call: nudge once to submit.
  let nudged = false;
  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await getClient().beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: [FALLBACK_BETA],
      fallbacks: 'default',
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium' },
      system: VALUATE_SYSTEM,
      tools: tools as unknown as MessageCreateParamsNonStreaming['tools'],
      tool_choice: { type: 'auto' },
      messages,
    });
    assertUsable(response);

    const valuation = extractValuation(response.content);
    if (valuation) return valuation;

    messages.push({ role: 'assistant', content: response.content });
    const badCall = response.content.find((b) => b.type === 'tool_use' && b.name === 'submit_valuation');
    if (badCall && badCall.type === 'tool_use') {
      messages.push({
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: badCall.id,
            is_error: true,
            content: 'Invalid valuation input; please call submit_valuation again with all required fields.',
          },
        ],
      });
      continue;
    }
    if (response.stop_reason === 'pause_turn') continue;
    if (nudged) break;
    nudged = true;
    messages.push({ role: 'user', content: 'Please call submit_valuation now with your best estimate.' });
  }
  throw new AiError('Could not determine a market value right now.');
}
