export namespace invicti {
	export type Telemetry = {
		requestID: string;
		scheme?: string;
		destinationAddress: string;
		destinationNamespace?: string;
		sourceAddress: string;
		request: Request;
		response?: Response;
	};

	export type Request = {
		method: string;
		path: string;
		host?: string;
		common: Common;
	};

	export type Response = {
		statusCode: string;
		common: Common;
	};

	export type Common = {
		version?: string;
		headers: Header[];
		body?: string;
		truncatedBody: boolean;
		time?: number;
	};

	export type Header = {
		key: string;
		value: string;
	};
}

export async function createTelemetryFromRequest(request: Request, env: Env): Promise<invicti.Telemetry> {
	try {
		const { protocol, host, pathname, search } = new URL(request.url);
		const scheme = protocol.replace(':', '');
		const port = scheme === 'https' ? '443' : '80';
		const destinationAddress = `${host}:${port}`;
		const sourceAddress = request.headers.get('cf-connecting-ip') || '';
		const requestID = request.headers.get('x-request-id') || '';

		const clonedRequest = request.clone();
		const arrayBuffer = await clonedRequest.arrayBuffer();
		const maxBodySize = env.MAX_API_REQUEST_BODY_SIZE || 262144;

		let truncatedBody = false;
		let limitedBuffer = arrayBuffer;
		if (arrayBuffer.byteLength > maxBodySize) {
			limitedBuffer = arrayBuffer.slice(0, maxBodySize);
			truncatedBody = true;
		}

		const base64Body = btoa(String.fromCharCode(...new Uint8Array(limitedBuffer)));

		return {
			requestID,
			scheme,
			destinationAddress,
			destinationNamespace: env.NTA_NAMESPACE || '',
			sourceAddress,
			request: {
				method: request.method,
				path: pathname + search,
				host,
				common: {
					version: '1.1',
					headers: Array.from(request.headers.entries()).map(([key, value]) => ({ key, value })),
					truncatedBody,
					body: base64Body,
					time: Date.now(),
				},
			},
		};
	} catch (err) {
		console.error('Error creating telemetry from request:', err);
		return {} as invicti.Telemetry;
	}
}

export async function addResponseToTelemetry(
  telemetry: invicti.Telemetry,
  response: Response,
  env: Env
): Promise<void> {
  try {
    const clonedResponse = response.clone();
    const arrayBuffer = await clonedResponse.arrayBuffer();
    const maxBodySize = env.MAX_API_RESPONSE_BODY_SIZE || 1048576;

    let truncatedBody = false;
    let limitedBuffer = arrayBuffer;
    if (arrayBuffer.byteLength > maxBodySize) {
      limitedBuffer = arrayBuffer.slice(0, maxBodySize);
      truncatedBody = true;
    }

    const base64Body = btoa(String.fromCharCode(...new Uint8Array(limitedBuffer)));

    telemetry.response = {
      statusCode: clonedResponse.status.toString(),
      common: {
        version: '1.1',
        headers: Array.from(clonedResponse.headers.entries()).map(([key, value]) => ({
          key,
          value,
        })),
        truncatedBody,
        body: base64Body,
        time: Date.now(),
      },
    };
  } catch (err) {
    console.error('Error while adding response to telemetry:', err);
  }
}
