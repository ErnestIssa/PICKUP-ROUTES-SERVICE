import { describe, expect, it, vi } from "vitest";
import { createOsrmClient, UpstreamError } from "../src/osrmClient";
import { parseCoordinate } from "../src/validation";

const options = {
  baseUrl: "http://osrm.test",
  timeoutMs: 1000,
  maxRetries: 1,
  retryDelayMs: 0,
  maxSnapDistanceM: 1000,
};

const source = parseCoordinate("13.388860,52.517037", "src");
const destination = parseCoordinate("13.397634,52.529407", "dst");

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function okBody(snapDistances: [number, number] = [2.7, 2.9]) {
  return {
    code: "Ok",
    routes: [{ duration: 465.2, distance: 1879.4 }],
    waypoints: [{ distance: snapDistances[0] }, { distance: snapDistances[1] }],
  };
}

function setup() {
  const fetchMock = vi.fn<typeof fetch>();
  const client = createOsrmClient(options, fetchMock);
  return { fetchMock, client };
}

describe("osrmClient.getRoute", () => {
  it("returns duration and distance for a normal route", async () => {
    const { fetchMock, client } = setup();
    fetchMock.mockResolvedValueOnce(jsonResponse(okBody()));

    const result = await client.getRoute(source, destination);

    expect(result).toEqual({ status: "ok", duration: 465.2, distance: 1879.4 });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "http://osrm.test/route/v1/driving/13.388860,52.517037;13.397634,52.529407?overview=false",
    );
  });

  it("reports NoRoute as unroutable, even with a 400 status", async () => {
    const { fetchMock, client } = setup();
    fetchMock.mockResolvedValueOnce(jsonResponse({ code: "NoRoute" }, 400));

    const result = await client.getRoute(source, destination);

    expect(result.status).toBe("unroutable");
  });

  it("treats a point snapped far from any road as unroutable", async () => {
    const { fetchMock, client } = setup();
    fetchMock.mockResolvedValueOnce(jsonResponse(okBody([2.7, 1771804])));

    const result = await client.getRoute(source, destination);

    expect(result.status).toBe("unroutable");
  });

  it("retries once after a server error and then succeeds", async () => {
    const { fetchMock, client } = setup();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}, 503))
      .mockResolvedValueOnce(jsonResponse(okBody()));

    const result = await client.getRoute(source, destination);

    expect(result.status).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up after the retries are used and throws an UpstreamError", async () => {
    const { fetchMock, client } = setup();
    fetchMock.mockResolvedValue(jsonResponse({}, 503));

    await expect(client.getRoute(source, destination)).rejects.toMatchObject({
      name: "UpstreamError",
      kind: "unavailable",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reports a network failure as unavailable", async () => {
    const { fetchMock, client } = setup();
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));

    await expect(client.getRoute(source, destination)).rejects.toMatchObject({
      kind: "unavailable",
    });
  });

  it("reports a timeout as a timeout", async () => {
    const { fetchMock, client } = setup();
    fetchMock.mockRejectedValue(new DOMException("timed out", "TimeoutError"));

    await expect(client.getRoute(source, destination)).rejects.toMatchObject({
      kind: "timeout",
    });
  });

  it("does not retry a response that is not JSON", async () => {
    const { fetchMock, client } = setup();
    fetchMock.mockResolvedValue(new Response("<html>oops</html>", { status: 200 }));

    await expect(client.getRoute(source, destination)).rejects.toBeInstanceOf(UpstreamError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry an unexpected OSRM code", async () => {
    const { fetchMock, client } = setup();
    fetchMock.mockResolvedValue(jsonResponse({ code: "InvalidQuery" }, 400));

    await expect(client.getRoute(source, destination)).rejects.toMatchObject({
      kind: "bad_response",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});


  it("still works when OSRM does not report snap distances", async () => {
    const { fetchMock, client } = setup();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ code: "Ok", routes: [{ duration: 465.2, distance: 1879.4 }] }),
    );

    const result = await client.getRoute(source, destination);

    expect(result).toEqual({ status: "ok", duration: 465.2, distance: 1879.4 });
  });