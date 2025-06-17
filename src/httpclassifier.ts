


export class HttpClassifier {
	private readonly env: any;

	constructor(env: any) {
		this.env = env;
	}

	acceptHttpMethod(method: string): boolean {
		return !this.env.EXCLUDED_HTTP_METHODS.includes(method);
	}

	acceptHeaders(headers: Headers): boolean {
		for (const header of headers) {
			for (const excluded of this.env.EXCLUDED_TRAFFIC_WITH_HEADERS.split(',')) {
				if (header[0].toLowerCase() === excluded.toLowerCase()) return false;
			}

		}
		return true;
	}

	getHeader(headers: Headers, key: string): string {
		for (const header of headers) {
			if (header[0].toLowerCase() === key.toLowerCase()) {
				return header[1];
			}
		}
		return "";
	}

	extractMimeType(contentType: string): string {
		const idx = contentType.indexOf(';');
		return idx !== -1 ? contentType.slice(0, idx).trim() : contentType.trim();
	}

	acceptRequestContentType(contentType: string): boolean {
		const mimeType = this.extractMimeType(contentType);
		const isJson = mimeType.startsWith("application/") && mimeType.endsWith("json");
		const isApplicationForm = mimeType.startsWith("application/x-www-form-urlencoded");
		const isMultiPart = mimeType.startsWith("multipart/form-data");
		return isJson || isApplicationForm || isMultiPart;
	}

	acceptResponseContentType(contentType: string): boolean {
		const mimeType = this.extractMimeType(contentType);
		return mimeType.startsWith("application/") && mimeType.endsWith("json");
	}


	public isAPIRequest(request: Request): boolean {
		if (!this.acceptHttpMethod(request.method)) {
			return false;
		}

		if (!this.acceptHeaders(request.headers)) return false;

		const { protocol, host, pathname, search } = new URL(request.url);
		const path = pathname + search;

		const apiSpecific = ["api", "rest"];
		const lowerPath = path.toLowerCase();
		const lowerHost = host.toLowerCase();

		const apiInPath = apiSpecific.some(word => lowerPath.includes(word));
		const apiInHost = apiSpecific.some(word => lowerHost.includes(word));

		const apiVersion = ["v1", "v2", "v3", "v4", "v5", "1.0", "2.0", "3.0", "4.0", "5.0"];
		const versionedPath = apiVersion.some(version => lowerPath.includes(version));

		const extractLastSegment = (url: string) => {
			let noQuery = url.split("?")[0];
			let pathOnly = noQuery.split("#")[0];
			let lastSlash = pathOnly.lastIndexOf("/");
			return lastSlash !== -1 ? pathOnly.substring(lastSlash + 1) : pathOnly;
		};

		const lastSegment = extractLastSegment(lowerPath);
		const hasExt = lastSegment.includes(".");

		let apiLikeUrl = apiInPath || versionedPath || apiInHost;

		let apiLikeContent = true;
		const requestContentType = this.getHeader(request.headers, "Content-Type");
		if (requestContentType && !this.acceptRequestContentType(requestContentType)) {
			apiLikeContent = false;
		}

		const isApi = (apiLikeUrl || apiLikeContent) && !hasExt;
		if (!isApi) return false;

		const userAgent = this.getHeader(request.headers, "User-Agent");
		const ignoredUAs = ["ELB-HealthChecker", "Prometheus", "k8s"];
		for (const ignoredUA of ignoredUAs) {
			if (userAgent.toLowerCase().includes(ignoredUA.toLowerCase())) {
				return false;
			}
		}


		return true;
	}

	parseStatusCodePattern(pattern: string): [number, number] {
		const low = pattern.replace(/[xX]/g, '0');
		const high = pattern.replace(/[xX]/g, '9');
		const lowVal = parseInt(low, 10);
		const highVal = parseInt(high, 10);
		if (isNaN(lowVal) || isNaN(highVal)) return [0, 0];
		return [lowVal, highVal];
	}

	acceptHttpStatusCode(statusCode: string): boolean {
		const code = parseInt(statusCode, 10);
		if (isNaN(code)) return false;
		for (const pattern of this.env.EXCLUDED_HTTP_STATUS_CODES.split(',')) {
			const [low, high] = this.parseStatusCodePattern(pattern);
			if (code >= low && code <= high) return false;
		}
		return true;
	}

	public isAPIResponse(response: Response): boolean {
		if (!this.acceptHttpStatusCode(response.status.toString())) {
			return false;
		}

		if (!this.acceptHeaders(response.headers)) return false;

		const responseContentType = this.getHeader(response.headers, "Content-Type");
		if (responseContentType && !this.acceptResponseContentType(responseContentType)) {
			return false;
		}

		return true;
	}
}