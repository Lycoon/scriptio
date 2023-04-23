export default async function fetchJson<JSON = unknown>(
    input: RequestInfo,
    init?: RequestInit
): Promise<JSON> {
    let response: Response;
    let data: any;
    try {
        response = await fetch(input, init);
        data = await response.json();
    } catch (e) {
        throw e;
    }

    if (response.ok) {
        return data.data;
    }

    throw data;
}
