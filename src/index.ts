import {
  createTelemetryFromRequest,
  addResponseToTelemetry,
} from './telemetry';

import {
  HttpClassifier
} from './httpclassifier';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (!env.NTA_TELEMETRY_ENDPOINT) {
      console.warn('NTA_TELEMETRY_ENDPOINT is not set');
      return fetch(request);
    }

    const httpClassifier = new HttpClassifier(env);

    if (!httpClassifier.isAPIRequest(request)) {
      console.debug(`Request is not classified as API: ${request.url}`);
      return fetch(request);
    }

    const telemetry = await createTelemetryFromRequest(request,env);
    if (!telemetry) {
      console.debug('Telemetry creation failed for request');
      return fetch(request);
    }

    const response = await fetch(request);

    if (!httpClassifier.isAPIResponse(response)) {
      console.debug(`Response is not classified as API: ${request.url}`);
      return response;
    }

    // Send telemetry in the background
    ctx.waitUntil((async () => {
      try {
        await addResponseToTelemetry(telemetry, response, env);

        const result = await fetch(env.NTA_TELEMETRY_ENDPOINT, {
          method: 'POST',
          body: JSON.stringify(telemetry),
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (!result.ok) {
          console.error('Telemetry POST failed with status:', result.status);
          const body = await result.text();
          console.error('Response body:', body);
        }
      } catch (error) {
        console.error('Exception while sending telemetry:', error);
      }
    })());

    return response;
  },
} satisfies ExportedHandler<Env>;
